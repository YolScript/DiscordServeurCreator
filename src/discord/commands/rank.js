const { AttachmentBuilder } = require('discord.js');
const xpStore = require('../../kv/xpStore');
const { xpForLevel } = require('../engagement/xpManager');
const { buildRankCard } = require('../engagement/rankCard');

async function handleRankCommand(interaction) {
  const target = interaction.options.getUser('membre') || interaction.user;
  const [data, all] = await Promise.all([
    xpStore.getMember(interaction.guild.id, target.id),
    xpStore.getAll(interaction.guild.id),
  ]);
  const nextLevelXp = xpForLevel(data.level + 1);
  const currentLevelXp = xpForLevel(data.level);
  const rank = Object.entries(all).sort((a, b) => b[1].xp - a[1].xp).findIndex(([userId]) => userId === target.id) + 1;

  await interaction.deferReply();
  const png = await buildRankCard({
    username: target.username,
    avatarUrl: target.displayAvatarURL({ extension: 'png', size: 256 }),
    level: data.level,
    xp: data.xp,
    currentLevelXp,
    nextLevelXp,
    rank: rank || '?',
    messageCount: data.messageCount,
    voiceMinutes: data.voiceMinutes,
  });

  await interaction.editReply({ files: [new AttachmentBuilder(png, { name: 'rank.png' })] });
}

module.exports = handleRankCommand;
