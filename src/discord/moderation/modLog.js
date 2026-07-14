const { ChannelType, PermissionFlagsBits: P, EmbedBuilder } = require('discord.js');
const guildConfigStore = require('../../kv/guildConfigStore');
const logger = require('../../shared/logger');

// Cree le salon #mod-logs a la demande (premiere action de moderation sur ce
// serveur) plutot qu'a chaque /setup, pour rester compatible avec les
// serveurs deja configures avant l'ajout de cette fonctionnalite.
async function ensureModLogChannel(guild) {
  const config = await guildConfigStore.find(guild.id);
  if (config?.modLogChannelId) {
    const existing = await guild.channels.fetch(config.modLogChannelId).catch(() => null);
    if (existing) return existing;
  }

  const overwrites = [{ id: guild.roles.everyone.id, deny: [P.ViewChannel] }];
  if (config?.moderateurRoleId) overwrites.push({ id: config.moderateurRoleId, allow: [P.ViewChannel, P.ReadMessageHistory] });
  if (config?.adminRoleId) overwrites.push({ id: config.adminRoleId, allow: [P.ViewChannel, P.ReadMessageHistory] });

  const channel = await guild.channels.create({
    name: 'mod-logs',
    type: ChannelType.GuildText,
    permissionOverwrites: overwrites,
  });

  await guildConfigStore.upsert(guild.id, { modLogChannelId: channel.id });
  logger.info(`Salon mod-logs cree sur ${guild.id}`);
  return channel;
}

async function postModLog(guild, { title, description, color = 0xd3a13a, fields = [] }) {
  try {
    const channel = await ensureModLogChannel(guild);
    const embed = new EmbedBuilder().setTitle(title).setDescription(description).setColor(color).setTimestamp();
    if (fields.length) embed.addFields(fields);
    await channel.send({ embeds: [embed] });
  } catch (err) {
    logger.error('postModLog', err);
  }
}

module.exports = { ensureModLogChannel, postModLog };
