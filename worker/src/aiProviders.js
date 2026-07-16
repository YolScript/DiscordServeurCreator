// Adaptateurs Claude / GPT / Gemini normalises vers une seule interface :
// callProvider({ provider, apiKey, systemPrompt, messages, tools })
//   -> { content: string, toolCalls: [{ id, name, args }] }
//
// Format canonique des messages (independant du fournisseur) :
//   { role: 'user', content }
//   { role: 'assistant', content, toolCalls?: [{ id, name, args }] }
//   { role: 'tool', toolCallId, name, result }

// Traduit les erreurs HTTP des fournisseurs en messages exploitables en
// francais, sans dependre du JSON brut (souvent en anglais et peu lisible)
// que chaque API renvoie dans le corps de sa reponse.
function describeProviderError(providerLabel, status, bodyText) {
  if (status === 401 || status === 403) return `${providerLabel} : cle API invalide ou refusee.`;
  if (status === 429) return `${providerLabel} : quota depasse. Verifie ton forfait/facturation chez le fournisseur.`;
  if (status === 400) return `${providerLabel} : requete refusee (400). ${(bodyText || '').slice(0, 200)}`;
  if (status >= 500) return `${providerLabel} : service indisponible (${status}). Reessaie plus tard.`;
  return `${providerLabel} (${status}) : ${(bodyText || '').slice(0, 200)}`;
}

// Parse le flux SSE de l'API Anthropic (stream: true) : texte relaye au fil
// de l'eau via onDelta, blocs tool_use reconstruits depuis les
// input_json_delta. Retourne la meme forme que le mode non-streaming.
async function readAnthropicStream(res, onDelta) {
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let content = '';
  const toolCalls = [];
  const blocks = {}; // index -> { type, id, name, json }

  const handleEvent = (evt) => {
    if (evt.type === 'content_block_start') {
      blocks[evt.index] = { ...evt.content_block };
      if (evt.content_block.type === 'tool_use') blocks[evt.index].json = '';
    } else if (evt.type === 'content_block_delta') {
      if (evt.delta.type === 'text_delta') {
        content += evt.delta.text;
        onDelta(evt.delta.text);
      } else if (evt.delta.type === 'input_json_delta' && blocks[evt.index]) {
        blocks[evt.index].json += evt.delta.partial_json;
      }
    } else if (evt.type === 'content_block_stop') {
      const block = blocks[evt.index];
      if (block?.type === 'tool_use') {
        let args = {};
        try { args = block.json ? JSON.parse(block.json) : {}; } catch { args = {}; }
        toolCalls.push({ id: block.id, name: block.name, args });
      }
    } else if (evt.type === 'error') {
      throw new Error(`Claude : ${evt.error?.message || 'erreur de flux'}`);
    }
  };

  for (;;) {
    // eslint-disable-next-line no-await-in-loop
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let sep;
    while ((sep = buffer.indexOf('\n\n')) !== -1) {
      const raw = buffer.slice(0, sep);
      buffer = buffer.slice(sep + 2);
      for (const line of raw.split('\n')) {
        if (!line.startsWith('data:')) continue;
        const payload = line.slice(5).trim();
        if (!payload) continue;
        let evt;
        try { evt = JSON.parse(payload); } catch { continue; }
        handleEvent(evt);
      }
    }
  }
  return { content: content.trim(), toolCalls, streamed: true };
}

async function callAnthropic({
  apiKey, systemPrompt, messages, tools, onDelta,
}) {
  const anthropicMessages = [];
  for (const m of messages) {
    if (m.role === 'user') {
      anthropicMessages.push({ role: 'user', content: m.content || '' });
    } else if (m.role === 'assistant') {
      const blocks = [];
      if (m.content) blocks.push({ type: 'text', text: m.content });
      for (const tc of m.toolCalls || []) blocks.push({
        type: 'tool_use', id: tc.id, name: tc.name, input: tc.args,
      });
      anthropicMessages.push({ role: 'assistant', content: blocks });
    } else if (m.role === 'tool') {
      const last = anthropicMessages[anthropicMessages.length - 1];
      const block = { type: 'tool_result', tool_use_id: m.toolCallId, content: JSON.stringify(m.result) };
      if (last?.role === 'user' && Array.isArray(last.content) && last.content[0]?.type === 'tool_result') {
        last.content.push(block);
      } else {
        anthropicMessages.push({ role: 'user', content: [block] });
      }
    }
  }

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-5-20250929',
      max_tokens: 1024,
      system: systemPrompt,
      messages: anthropicMessages,
      tools: tools.map((t) => ({ name: t.name, description: t.description, input_schema: t.parameters })),
      ...(onDelta ? { stream: true } : {}),
    }),
  });
  if (!res.ok) throw new Error(describeProviderError('Claude', res.status, await res.text()));
  if (onDelta) return readAnthropicStream(res, onDelta);
  const data = await res.json();
  const content = (data.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('\n').trim();
  const toolCalls = (data.content || [])
    .filter((b) => b.type === 'tool_use')
    .map((b) => ({ id: b.id, name: b.name, args: b.input || {} }));
  return { content, toolCalls };
}

async function callOpenAi({
  apiKey, systemPrompt, messages, tools,
}) {
  const openAiMessages = [{ role: 'system', content: systemPrompt }];
  for (const m of messages) {
    if (m.role === 'user') {
      openAiMessages.push({ role: 'user', content: m.content || '' });
    } else if (m.role === 'assistant') {
      const msg = { role: 'assistant', content: m.content || null };
      if (m.toolCalls?.length) {
        msg.tool_calls = m.toolCalls.map((tc) => ({
          id: tc.id, type: 'function', function: { name: tc.name, arguments: JSON.stringify(tc.args) },
        }));
      }
      openAiMessages.push(msg);
    } else if (m.role === 'tool') {
      openAiMessages.push({ role: 'tool', tool_call_id: m.toolCallId, content: JSON.stringify(m.result) });
    }
  }

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      model: 'gpt-4o',
      messages: openAiMessages,
      tools: tools.map((t) => ({ type: 'function', function: { name: t.name, description: t.description, parameters: t.parameters } })),
    }),
  });
  if (!res.ok) throw new Error(describeProviderError('GPT', res.status, await res.text()));
  const data = await res.json();
  const message = data.choices?.[0]?.message || {};
  const toolCalls = (message.tool_calls || []).map((tc) => ({
    id: tc.id, name: tc.function.name, args: JSON.parse(tc.function.arguments || '{}'),
  }));
  return { content: (message.content || '').trim(), toolCalls };
}

// L'API REST Gemini attend un Schema façon protobuf (type en enum
// MAJUSCULE : "OBJECT", "STRING"...), pas le JSON Schema standard
// (minuscule) utilisé par Anthropic/OpenAI et par AI_TOOLS. Sans cette
// conversion, Gemini rejette la requete (400) des qu'un outil est fourni.
function toGeminiSchema(schema) {
  if (!schema || typeof schema !== 'object') return schema;
  const out = { ...schema };
  if (typeof out.type === 'string') out.type = out.type.toUpperCase();
  if (out.properties) {
    out.properties = Object.fromEntries(
      Object.entries(out.properties).map(([k, v]) => [k, toGeminiSchema(v)]),
    );
  }
  if (out.items) out.items = toGeminiSchema(out.items);
  return out;
}

async function callGemini({
  apiKey, systemPrompt, messages, tools,
}) {
  const contents = [];
  for (const m of messages) {
    if (m.role === 'user') {
      contents.push({ role: 'user', parts: [{ text: m.content || '' }] });
    } else if (m.role === 'assistant') {
      const parts = [];
      if (m.content) parts.push({ text: m.content });
      for (const tc of m.toolCalls || []) parts.push({ functionCall: { name: tc.name, args: tc.args } });
      contents.push({ role: 'model', parts });
    } else if (m.role === 'tool') {
      contents.push({ role: 'function', parts: [{ functionResponse: { name: m.name, response: m.result } }] });
    }
  }

  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      system_instruction: { parts: [{ text: systemPrompt }] },
      contents,
      tools: [{ function_declarations: tools.map((t) => ({ name: t.name, description: t.description, parameters: toGeminiSchema(t.parameters) })) }],
    }),
  });
  if (!res.ok) throw new Error(describeProviderError('Gemini', res.status, await res.text()));
  const data = await res.json();
  const parts = data.candidates?.[0]?.content?.parts || [];
  const content = parts.filter((p) => p.text).map((p) => p.text).join('\n').trim();
  const toolCalls = parts
    .filter((p) => p.functionCall)
    .map((p, idx) => ({ id: `gemini-${Date.now()}-${idx}`, name: p.functionCall.name, args: p.functionCall.args || {} }));
  return { content, toolCalls };
}

const ADAPTERS = { anthropic: callAnthropic, openai: callOpenAi, gemini: callGemini };

export async function callProvider({
  provider, apiKey, systemPrompt, messages, tools, onDelta,
}) {
  const adapter = ADAPTERS[provider];
  if (!adapter) throw new Error(`Fournisseur IA inconnu : ${provider}`);
  const result = await adapter({
    apiKey, systemPrompt, messages, tools, onDelta,
  });
  // GPT et Gemini n'ont pas d'adaptateur streaming : on emet leur reponse
  // complete en un seul delta pour garder la meme interface cote appelant.
  if (onDelta && !result.streamed && result.content) onDelta(result.content);
  return result;
}
