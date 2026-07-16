const guildConfigStore = require('../../kv/guildConfigStore');
const logger = require('../../shared/logger');

// Regles « si X alors Y » (roadmap n°151) : declencheurs member_join et
// keyword, actions add_role / send_message / react. La config est lue avec
// un cache memoire 60 s (messageCreate est bien trop frequent pour un kvGet
// a chaque message), et les regles mot-cle ont un anti-spam de 30 s.
const rulesCache = new Map(); // guildId -> { at, rules }
const lastFired = new Map(); // cle regle -> timestamp

async function getRules(guildId) {
  const cached = rulesCache.get(guildId);
  if (cached && Date.now() - cached.at < 60_000) return cached.rules;
  const config = await guildConfigStore.find(guildId).catch(() => null);
  const rules = (config?.autoRules || []).filter((r) => r.enabled !== false).slice(0, 10);
  rulesCache.set(guildId, { at: Date.now(), rules });
  return rules;
}

function cooledDown(key) {
  const last = lastFired.get(key) || 0;
  if (Date.now() - last < 30_000) return false;
  lastFired.set(key, Date.now());
  return true;
}

function renderText(text, member) {
  return (text || '')
    .replaceAll('{user}', `<@${member.id}>`)
    .replaceAll('{server}', member.guild.name)
    .slice(0, 1500);
}

async function applyAction(rule, { guild, member, message }) {
  const action = rule.action || {};
  if (action.type === 'add_role' && action.roleId && member) {
    await member.roles.add(action.roleId).catch((err) => logger.error('autoRules.addRole', err));
  } else if (action.type === 'send_message' && action.channelId && action.message && member) {
    const channel = await guild.channels.fetch(action.channelId).catch(() => null);
    if (channel) await channel.send(renderText(action.message, member)).catch(() => {});
  } else if (action.type === 'react' && action.emoji && message) {
    await message.react(action.emoji).catch(() => {});
  }
}

async function handleMemberAdd(member) {
  try {
    const rules = await getRules(member.guild.id);
    for (const rule of rules) {
      if (rule.trigger?.type !== 'member_join') continue;
      // eslint-disable-next-line no-await-in-loop
      await applyAction(rule, { guild: member.guild, member });
    }
  } catch (err) {
    logger.error('autoRules.memberAdd', err);
  }
}

async function handleMessage(message) {
  if (!message.guild || message.author.bot) return;
  try {
    const rules = await getRules(message.guild.id);
    if (!rules.length) return;
    const content = (message.content || '').toLowerCase();
    if (!content) return;
    for (const rule of rules) {
      const trigger = rule.trigger || {};
      if (trigger.type !== 'keyword' || !trigger.keyword) continue;
      if (trigger.channelId && trigger.channelId !== message.channel.id) continue;
      if (!content.includes(trigger.keyword.toLowerCase())) continue;
      if (!cooledDown(`${message.guild.id}:${rule.id}`)) continue;
      // eslint-disable-next-line no-await-in-loop
      await applyAction(rule, { guild: message.guild, member: message.member, message });
    }
  } catch (err) {
    logger.error('autoRules.message', err);
  }
}

module.exports = { handleMemberAdd, handleMessage };
