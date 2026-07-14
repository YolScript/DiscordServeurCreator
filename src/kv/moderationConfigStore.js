const { kvGet, kvPut } = require('./cloudflareKv');

const key = (guildId) => `guild:${guildId}:modconfig`;

const DEFAULTS = {
  autoModEnabled: true,
  blockInvites: true,
  blockLinks: false,
  bannedWords: [],
  spamMessageThreshold: 5,
  spamIntervalMs: 6000,
  alertKeywords: [],
  antiRaidEnabled: true,
  antiRaidJoinThreshold: 8,
  antiRaidIntervalMs: 10000,
};

async function find(guildId) {
  const raw = await kvGet(key(guildId));
  return { ...DEFAULTS, ...(raw ?? {}) };
}

async function upsert(guildId, patch) {
  const existing = await find(guildId);
  const merged = { ...existing, ...patch };
  await kvPut(key(guildId), merged);
  return merged;
}

module.exports = { find, upsert, DEFAULTS };
