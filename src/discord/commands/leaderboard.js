const { MessageFlags, EmbedBuilder } = require('discord.js');
const xpStore = require('../../kv/xpStore');

async function handleLeaderboardCommand(interaction) {
  const all = await xpStore.getAll(interaction.guild.id);
  const sorted = Object.entries(all).sort((a, b) => b[1].xp - a[1].xp).slice(0, 10);

  if (sorted.length === 0) {
    await interaction.reply({ content: 'Aucune activite enregistree pour le moment.', flags: MessageFlags.Ephemeral });
    return;
  }

  const medals = ['🥇', '🥈', '🥉'];
  const lines = sorted.map(([userId, data], idx) => `${medals[idx] ?? `**${idx + 1}.**`} <@${userId}> — niveau ${data.level} (${data.xp} xp)`);

  const embed = new EmbedBuilder().setTitle('Classement').setColor(0x5b8def).setDescription(lines.join('\n'));
  await interaction.reply({ embeds: [embed] });
}

module.exports = handleLeaderboardCommand;
