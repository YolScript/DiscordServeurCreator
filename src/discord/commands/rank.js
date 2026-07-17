const { AttachmentBuilder } = require('discord.js');
const xpStore = require('../../kv/xpStore');
const levelRoleStore = require('../../kv/levelRoleStore');
const { xpForLevel } = require('../engagement/xpManager');
const { buildRankCard } = require('../engagement/rankCard');

async function handleRankCommand(interaction) {
  const target = interaction.options.getUser('membre') || interaction.user;
  const [data, all, levelRoles] = await Promise.all([
    xpStore.getMember(interaction.guild.id, target.id),
    xpStore.getAll(interaction.guild.id),
    levelRoleStore.list(interaction.guild.id),
  ]);
  const nextLevelXp = xpForLevel(data.level + 1);
  const currentLevelXp = xpForLevel(data.level);
  const rank = Object.entries(all).sort((a, b) => b[1].xp - a[1].xp).findIndex(([userId]) => userId === target.id) + 1;

  // Prochain palier (roadmap n°298) : pas juste le prochain NIVEAU (deja
  // affiche via la barre de progression), mais le prochain palier configure
  // par l'admin (role/bonus) — peut etre a plusieurs niveaux d'ecart.
  const nextTier = levelRoles.filter((lr) => lr.level > data.level).sort((a, b) => a.level - b.level)[0] || null;

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
    nextTier: nextTier ? { level: nextTier.level, xpNeeded: xpForLevel(nextTier.level) - data.xp } : null,
  });

  await interaction.editReply({ files: [new AttachmentBuilder(png, { name: 'rank.png' })] });
}

module.exports = handleRankCommand;
