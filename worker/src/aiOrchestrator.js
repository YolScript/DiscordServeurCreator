import { callProvider } from './aiProviders.js';
import { AI_TOOLS, findTool, executeAiTool } from './aiTools.js';

const SYSTEM_PROMPT = `Tu es ServeurCreator Bot, l'assistant de configuration integre au dashboard d'un serveur Discord.
Tu peux creer, renommer et supprimer des salons, categories et roles via les outils fournis.
Regles :
- Reponds toujours en francais, de facon concise et amicale.
- N'invente jamais un identifiant de salon ou de role : appelle list_channels ou list_roles pour les obtenir avant d'agir dessus.
- N'appelle qu'un seul outil a la fois.
- Pour toute demande ambigue, pose une question de clarification au lieu d'agir au hasard.
- Les outils de suppression sont geres automatiquement par le systeme (confirmation utilisateur) : appelle-les normalement si l'utilisateur le demande clairement, tu n'as pas besoin de redemander confirmation toi-meme.
- Avant une serie de 3 actions ou plus (creations, renommages, suppressions), annonce d'abord en UNE phrase la liste complete de ce que tu vas faire ("Je vais creer X, Y et Z, puis supprimer W"), puis enchaine les outils sans redemander entre chaque etape.`;

const MAX_ROUNDS = 4;

async function callAndRecordRound(env, guildId, session, provider, apiKey, working, events = {}) {
  const result = await callProvider({
    provider, apiKey, systemPrompt: SYSTEM_PROMPT, messages: working, tools: AI_TOOLS, onDelta: events.onDelta,
  });
  const [firstCall, ...extraCalls] = result.toolCalls;

  if (!firstCall) {
    working.push({ role: 'assistant', content: result.content || '...' });
    return { done: true, pendingConfirmation: null };
  }

  // Le modele n'est cense appeler qu'un seul outil par tour (consigne du
  // system prompt). S'il en propose plusieurs quand meme, on ne garde que le
  // premier (les tool_use non confirmes dans le message ne cassent pas le
  // protocole des fournisseurs), mais on le journalise pour rester
  // diagnosticable au lieu de perdre l'info silencieusement.
  if (extraCalls.length) {
    console.warn(`aiOrchestrator: ${extraCalls.length} appel(s) d'outil supplementaire(s) ignore(s) dans ce tour (${extraCalls.map((c) => c.name).join(', ')})`);
  }

  working.push({ role: 'assistant', content: result.content, toolCalls: [firstCall] });
  const tool = findTool(firstCall.name);

  if (!tool) {
    working.push({
      role: 'tool', toolCallId: firstCall.id, name: firstCall.name, result: { error: 'Outil inconnu.' },
    });
    return { done: false, pendingConfirmation: null };
  }

  if (tool.destructive) {
    return {
      done: true,
      pendingConfirmation: { toolCallId: firstCall.id, name: firstCall.name, args: firstCall.args },
    };
  }

  events.onTool?.(firstCall.name);
  let toolResult;
  try {
    toolResult = await executeAiTool(env, guildId, session, firstCall.name, firstCall.args);
  } catch (err) {
    toolResult = { error: err.message };
  }
  working.push({
    role: 'tool', toolCallId: firstCall.id, name: firstCall.name, result: toolResult,
  });
  return { done: false, pendingConfirmation: null };
}

export async function runAiTurn(env, guildId, session, provider, apiKey, messages, events = {}) {
  const working = [...messages];
  for (let round = 0; round < MAX_ROUNDS; round += 1) {
    // eslint-disable-next-line no-await-in-loop
    const { done, pendingConfirmation } = await callAndRecordRound(env, guildId, session, provider, apiKey, working, events);
    if (done) return { messages: working, pendingConfirmation };
  }
  working.push({ role: 'assistant', content: "Je n'ai pas reussi a terminer cette demande en un nombre raisonnable d'etapes. Peux-tu la reformuler plus simplement ?" });
  return { messages: working, pendingConfirmation: null };
}

export async function resumeAfterConfirmation(env, guildId, session, provider, apiKey, messages, pendingConfirmation, confirmed) {
  const working = [...messages];
  if (!confirmed) {
    working.push({
      role: 'tool', toolCallId: pendingConfirmation.toolCallId, name: pendingConfirmation.name, result: { cancelled: true },
    });
    working.push({ role: 'assistant', content: "D'accord, je n'ai rien fait." });
    return { messages: working, pendingConfirmation: null };
  }

  let toolResult;
  try {
    toolResult = await executeAiTool(env, guildId, session, pendingConfirmation.name, pendingConfirmation.args);
  } catch (err) {
    toolResult = { error: err.message };
  }
  working.push({
    role: 'tool', toolCallId: pendingConfirmation.toolCallId, name: pendingConfirmation.name, result: toolResult,
  });
  return runAiTurn(env, guildId, session, provider, apiKey, working);
}
