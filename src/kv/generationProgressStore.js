const { kvGet, kvPut } = require('./cloudflareKv');

const key = (guildId) => `guild:${guildId}:generation`;

async function get(guildId) {
  return kvGet(key(guildId));
}

async function set(guildId, state) {
  await kvPut(key(guildId), state);
}

// status: 'queued' | 'running' | 'done' | 'error'
async function appendStep(guildId, step) {
  const current = (await get(guildId)) || { status: 'running', steps: [] };
  current.status = step.kind === 'done' ? 'done' : step.kind === 'error' ? 'error' : 'running';
  current.steps = [...(current.steps || []), { ...step, at: Date.now() }];
  await set(guildId, current);
}

module.exports = {
  get, set, appendStep,
};
