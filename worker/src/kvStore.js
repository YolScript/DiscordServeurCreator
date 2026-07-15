const configKey = (guildId) => `guild:${guildId}:config`;
const gameRolesKey = (guildId) => `guild:${guildId}:gameroles`;
const modConfigKey = (guildId) => `guild:${guildId}:modconfig`;
const levelRolesKey = (guildId) => `guild:${guildId}:levelroles`;
const referralRolesKey = (guildId) => `guild:${guildId}:referralroles`;
const referralsKey = (guildId) => `guild:${guildId}:referrals`;
const streamersKey = (guildId) => `guild:${guildId}:streamers`;
const scheduledKey = (guildId) => `guild:${guildId}:scheduled`;
const ticketsKey = (guildId) => `guild:${guildId}:tickets`;
const pendingPanelActionsKey = (guildId) => `guild:${guildId}:pendingpanelactions`;
const statsKey = (guildId) => `guild:${guildId}:stats`;
const embedTemplatesKey = (guildId) => `guild:${guildId}:embedtemplates`;
const reactionRolesKey = (guildId) => `guild:${guildId}:reactionroles`;
const shopKey = (guildId) => `guild:${guildId}:shop`;
const economyKey = (guildId) => `guild:${guildId}:economy`;
const customCommandsKey = (guildId) => `guild:${guildId}:customcommands`;

const MOD_CONFIG_DEFAULTS = {
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
};

async function getList(env, key) {
  const raw = await env.GUILD_KV.get(key);
  return raw ? JSON.parse(raw) : [];
}
async function putList(env, key, items) {
  await env.GUILD_KV.put(key, JSON.stringify(items));
}

export async function getGuildConfig(env, guildId) {
  const raw = await env.GUILD_KV.get(configKey(guildId));
  return raw ? JSON.parse(raw) : null;
}

export async function putGuildConfig(env, guildId, config) {
  await env.GUILD_KV.put(configKey(guildId), JSON.stringify({ ...config, updatedAt: Date.now() }));
}

export async function getGameRoles(env, guildId) {
  const raw = await env.GUILD_KV.get(gameRolesKey(guildId));
  return raw ? JSON.parse(raw) : [];
}

export async function putGameRoles(env, guildId, roles) {
  await env.GUILD_KV.put(gameRolesKey(guildId), JSON.stringify(roles));
}

export async function getModConfig(env, guildId) {
  const raw = await env.GUILD_KV.get(modConfigKey(guildId));
  return { ...MOD_CONFIG_DEFAULTS, ...(raw ? JSON.parse(raw) : {}) };
}
export async function putModConfig(env, guildId, config) {
  await env.GUILD_KV.put(modConfigKey(guildId), JSON.stringify(config));
}

export const getLevelRoles = (env, guildId) => getList(env, levelRolesKey(guildId));
export const putLevelRoles = (env, guildId, items) => putList(env, levelRolesKey(guildId), items);

export const getReferralRoles = (env, guildId) => getList(env, referralRolesKey(guildId));
export const putReferralRoles = (env, guildId, items) => putList(env, referralRolesKey(guildId), items);
export async function getReferralCounts(env, guildId) {
  const raw = await env.GUILD_KV.get(referralsKey(guildId));
  return raw ? JSON.parse(raw) : {};
}

export const getStreamerLinks = (env, guildId) => getList(env, streamersKey(guildId));
export const putStreamerLinks = (env, guildId, items) => putList(env, streamersKey(guildId), items);

export const getScheduledTasks = (env, guildId) => getList(env, scheduledKey(guildId));
export const putScheduledTasks = (env, guildId, items) => putList(env, scheduledKey(guildId), items);

export const getTickets = (env, guildId) => getList(env, ticketsKey(guildId));
export const putTickets = (env, guildId, items) => putList(env, ticketsKey(guildId), items);

export async function pushPendingPanelAction(env, guildId, action) {
  const items = await getList(env, pendingPanelActionsKey(guildId));
  items.push({ ...action, requestedAt: Date.now() });
  await putList(env, pendingPanelActionsKey(guildId), items);
}

export const getStats = (env, guildId) => getList(env, statsKey(guildId));

export const getEmbedTemplates = (env, guildId) => getList(env, embedTemplatesKey(guildId));

export const getShopItems = (env, guildId) => getList(env, shopKey(guildId));
export const putShopItems = (env, guildId, items) => putList(env, shopKey(guildId), items);

export const getCustomCommands = (env, guildId) => getList(env, customCommandsKey(guildId));
export const putCustomCommands = (env, guildId, items) => putList(env, customCommandsKey(guildId), items);

export async function getEconomyAccounts(env, guildId) {
  const raw = await env.GUILD_KV.get(economyKey(guildId));
  return raw ? JSON.parse(raw) : {};
}

const TEMPLATE_REGISTRY_KEY = 'templates:registry';

export async function getTemplateRegistry(env) {
  const raw = await env.GUILD_KV.get(TEMPLATE_REGISTRY_KEY);
  return raw ? JSON.parse(raw) : [];
}
export async function putTemplateRegistry(env, items) {
  await env.GUILD_KV.put(TEMPLATE_REGISTRY_KEY, JSON.stringify(items));
}

export async function getBotStatus(env) {
  const raw = await env.GUILD_KV.get('bot:status');
  return raw ? JSON.parse(raw) : null;
}
export const putEmbedTemplates = (env, guildId, items) => putList(env, embedTemplatesKey(guildId), items);

export const getReactionRoleGroups = (env, guildId) => getList(env, reactionRolesKey(guildId));
export const putReactionRoleGroups = (env, guildId, items) => putList(env, reactionRolesKey(guildId), items);
