const { ChannelType, EmbedBuilder } = require('discord.js');
const guildConfigStore = require('../../kv/guildConfigStore');
const auditLogStore = require('../../kv/auditLogStore');
const { toSmallCaps } = require('../../shared/smallCaps');
const { ensureStaffCategory, toggleOnlyOverwrites } = require('../roles/staffCategory');
const logger = require('../../shared/logger');

// Cree le salon #mod-logs a la demande (premiere action de moderation sur ce
// serveur), range dans la categorie Staff : visible uniquement via le role
// "Staff Actif" (bascule SERVICE STAFF), pas directement par le role
// Moderateur/Administrateur.
async function ensureModLogChannel(guild) {
  const config = await guildConfigStore.find(guild.id);
  if (config?.modLogChannelId) {
    const existing = await guild.channels.fetch(config.modLogChannelId).catch(() => null);
    if (existing) return existing;
  }

  const { category, staffActifRoleId } = await ensureStaffCategory(guild);

  const channel = await guild.channels.create({
    name: toSmallCaps('mod-logs'),
    type: ChannelType.GuildText,
    parent: category.id,
    permissionOverwrites: toggleOnlyOverwrites(guild, staffActifRoleId),
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

  const detailsSuffix = fields.map((f) => `${f.name}: ${f.value}`).join(' — ');
  await auditLogStore.add(guild.id, {
    title,
    description: detailsSuffix ? `${description} (${detailsSuffix})` : description,
  }).catch((err) => logger.error('auditLogStore.add', err));
}

module.exports = { ensureModLogChannel, postModLog };
