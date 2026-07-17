const { MessageFlags } = require('discord.js');
const guildConfigStore = require('../../kv/guildConfigStore');

// Cooldowns par commande (roadmap n°184) : configurables dans le dashboard
// (config.commandCooldowns = { commandName: secondes }). Suivi en memoire
// (pas de persistance KV) — un redemarrage du bot reinitialise les
// cooldowns en cours, ce qui est le comportement attendu pour ce genre de
// garde-fou court terme.
const lastUsed = new Map(); // `${guildId}:${userId}:${command}` -> timestamp ms

// Les commandes de moderation (warn/timeout/tempban/unlock/automod) et de
// configuration (setup/config) ne sont jamais soumises a cooldown : elles
// sont deja reservees au staff via setDefaultMemberPermissions, un cooldown
// dessus ne ferait que gener le travail de moderation en urgence.
const EXEMPT_COMMANDS = new Set([
  'warn', 'warnings', 'clearwarns', 'timeout', 'tempban', 'unlock', 'automod',
  'setup', 'config', 'help', 'levelrole', 'referralrole', 'reglement-translation',
  'ticket-panel', 'poll-panel', 'reglement-panel', 'roles-panel', 'streamer-link', 'streamer-unlink',
  'scheduled-cancel', 'schedule-announcement', 'schedule-event', 'scheduled-list',
]);

// Renvoie null si la commande peut s'executer, ou le nombre de secondes
// restantes si elle est bloquee par un cooldown.
async function checkCommandCooldown(interaction) {
  if (!interaction.guild || EXEMPT_COMMANDS.has(interaction.commandName)) return null;
  const config = await guildConfigStore.find(interaction.guild.id).catch(() => null);
  const seconds = Number(config?.commandCooldowns?.[interaction.commandName]) || 0;
  if (seconds <= 0) return null;

  const key = `${interaction.guild.id}:${interaction.user.id}:${interaction.commandName}`;
  const last = lastUsed.get(key) || 0;
  const remainingMs = last + seconds * 1000 - Date.now();
  if (remainingMs > 0) return Math.ceil(remainingMs / 1000);

  lastUsed.set(key, Date.now());
  return null;
}

async function replyOnCooldown(interaction, remainingSeconds) {
  await interaction.reply({
    content: `⏳ Attends encore ${remainingSeconds}s avant de reutiliser \`/${interaction.commandName}\`.`,
    flags: MessageFlags.Ephemeral,
  }).catch(() => {});
}

module.exports = { checkCommandCooldown, replyOnCooldown, EXEMPT_COMMANDS };
