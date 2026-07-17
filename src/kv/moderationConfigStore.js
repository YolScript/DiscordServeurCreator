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
  linkWhitelist: [],
  // Escalade progressive (roadmap n°073/074) : timeout automatique apres
  // N infractions automod dans l'heure. 0 = desactive.
  autoTimeoutAfterWarns: 3,
  autoTimeoutMinutes: 10,
  // Slowmode automatique (roadmap n°080) : mode lent temporaire quand un
  // salon s'emballe. Desactive par defaut.
  autoSlowmodeEnabled: false,
  autoSlowmodeMsgPer10s: 20,
  autoSlowmodeSeconds: 5,
  autoSlowmodeDurationMin: 5,
  // Escalade configurable (roadmap n°271) : sur le total d'avertissements
  // actifs (manuel /warn ET automod confondus), 0 = palier desactive.
  escalationTimeoutWarns: 0,
  escalationTimeoutMinutes: 10,
  escalationKickWarns: 0,
  escalationBanWarns: 0,
  // Garde-fou comptes recents (roadmap n°275) : action auto sur les
  // membres dont le compte Discord a moins de N jours a l'arrivee.
  newAccountGuardEnabled: false,
  newAccountMaxAgeDays: 7,
  newAccountAction: 'alert', // 'alert' | 'kick' | 'ban' | 'role'
  newAccountRoleId: null,
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
