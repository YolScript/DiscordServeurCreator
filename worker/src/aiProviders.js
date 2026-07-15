// Adaptateurs Claude / GPT / Gemini normalises vers une seule interface :
// callProvider({ provider, apiKey, systemPrompt, messages, tools })
//   -> { content: string, toolCalls: [{ id, name, args }] }
//
// Format canonique des messages (independant du fournisseur) :
//   { role: 'user', content }
//   { role: 'assistant', content, toolCalls?: [{ id, name, args }] }
//   { role: 'tool', toolCallId, name, result }

async function callAnthropic({
  apiKey, systemPrompt, messages, tools,
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
    }),
  });
  if (!res.ok) throw new Error(`Anthropic ${res.status}: ${(await res.text()).slice(0, 300)}`);
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
  if (!res.ok) throw new Error(`OpenAI ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const data = await res.json();
  const message = data.choices?.[0]?.message || {};
  const toolCalls = (message.tool_calls || []).map((tc) => ({
    id: tc.id, name: tc.function.name, args: JSON.parse(tc.function.arguments || '{}'),
  }));
  return { content: (message.content || '').trim(), toolCalls };
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
      tools: [{ function_declarations: tools.map((t) => ({ name: t.name, description: t.description, parameters: t.parameters })) }],
    }),
  });
  if (!res.ok) throw new Error(`Gemini ${res.status}: ${(await res.text()).slice(0, 300)}`);
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
  provider, apiKey, systemPrompt, messages, tools,
}) {
  const adapter = ADAPTERS[provider];
  if (!adapter) throw new Error(`Fournisseur IA inconnu : ${provider}`);
  return adapter({
    apiKey, systemPrompt, messages, tools,
  });
}
