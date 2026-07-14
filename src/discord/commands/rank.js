const { MessageFlags, EmbedBuilder } = require('discord.js');
const xpStore = require('../../kv/xpStore');
const { xpForLevel } = require('../engagement/xpManager');

async function handleRankCommand(interaction) {
  const target = interaction.options.getUser('membre') || interaction.user;
  const data = await xpStore.getMember(interaction.guild.id, target.id);
  const nextLevelXp = xpForLevel(data.level + 1);
  const currentLevelXp = xpForLevel(data.level);
  const progress = Math.round(((data.xp - currentLevelXp) / (nextLevelXp - currentLevelXp)) * 100);

  const embed = new EmbedBuilder()
    .setAuthor({ name: target.username, iconURL: target.displayAvatarURL() })
    .setColor(0x5b8def)
    .addFields(
      { name: 'Niveau', value: String(data.level), inline: true },
      { name: 'XP', value: `${data.xp} (${progress}% vers niveau ${data.level + 1})`, inline: true },
      { name: 'Messages', value: String(data.messageCount), inline: true },
      { name: 'Minutes vocal', value: String(data.voiceMinutes), inline: true },
    );

  await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
}

module.exports = handleRankCommand;
