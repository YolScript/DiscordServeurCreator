const { MessageFlags } = require('discord.js');
const badgeStore = require('../../kv/badgeStore');
const { BADGE_DEFINITIONS } = require('../engagement/badgeManager');

async function handleBadgesCommand(interaction) {
  const target = interaction.options.getUser('membre') || interaction.user;
  const unlocked = await badgeStore.list(interaction.guild.id, target.id);

  if (unlocked.length === 0) {
    await interaction.reply({ content: `<@${target.id}> n'a pas encore de badge.`, flags: MessageFlags.Ephemeral });
    return;
  }

  const lines = BADGE_DEFINITIONS
    .filter((def) => unlocked.includes(def.key))
    .map((def) => `${def.emoji} **${def.label}** — ${def.description}`);

  await interaction.reply({ content: lines.join('\n'), flags: MessageFlags.Ephemeral });
}

module.exports = handleBadgesCommand;
