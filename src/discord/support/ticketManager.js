const {
  ChannelType, PermissionFlagsBits: P, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags,
} = require('discord.js');
const guildConfigStore = require('../../kv/guildConfigStore');
const ticketStore = require('../../kv/ticketStore');
const { toSmallCaps } = require('../../shared/smallCaps');
const { TICKET_OPEN } = require('../interactions/customIds');
const { ensureStaffCategory, toggleOnlyOverwrites } = require('../roles/staffCategory');
const logger = require('../../shared/logger');

const TICKET_CLOSE_ID = 'ticket_close';

async function postTicketPanel(channel) {
  const embed = new EmbedBuilder()
    .setTitle('🎫 Support')
    .setDescription('Besoin d\'aide ou d\'une question ? Clique sur le bouton ci-dessous pour ouvrir un ticket prive avec le staff.')
    .setColor(0x5b8def);
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(TICKET_OPEN).setLabel('Ouvrir un ticket').setEmoji('🎫').setStyle(ButtonStyle.Primary),
  );
  return channel.send({ embeds: [embed], components: [row] });
}

// Par defaut (config.ticketsStaffOnDutyOnly !== false), les tickets ne sont
// visibles que par le staff actuellement "en service" (role Staff Actif,
// bascule via le salon vocal SERVICE STAFF) plutot que par tout le staff en
// permanence. Desactivable depuis le dashboard pour revenir a l'ancien
// comportement (toujours visible par Moderateur/Administrateur).
async function staffVisibilityOverwrites(guild, config) {
  if (config?.ticketsStaffOnDutyOnly === false) {
    const overwrites = [];
    if (config?.moderateurRoleId) overwrites.push({ id: config.moderateurRoleId, allow: [P.ViewChannel, P.ReadMessageHistory, P.SendMessages] });
    if (config?.adminRoleId) overwrites.push({ id: config.adminRoleId, allow: [P.ViewChannel, P.ReadMessageHistory, P.SendMessages] });
    return overwrites;
  }
  const { staffActifRoleId } = await ensureStaffCategory(guild);
  return toggleOnlyOverwrites(guild, staffActifRoleId, [P.SendMessages]).slice(1);
}

async function ensureTicketCategory(guild, config) {
  if (config?.ticketCategoryId) {
    const existing = await guild.channels.fetch(config.ticketCategoryId).catch(() => null);
    if (existing) return existing;
  }
  const overwrites = [
    { id: guild.roles.everyone.id, deny: [P.ViewChannel] },
    ...(await staffVisibilityOverwrites(guild, config)),
  ];

  const category = await guild.channels.create({
    name: `🎫 ${toSmallCaps('Tickets')}`,
    type: ChannelType.GuildCategory,
    permissionOverwrites: overwrites,
  });
  await guildConfigStore.upsert(guild.id, { ticketCategoryId: category.id });
  return category;
}

async function createTicket(guild, member) {
  const config = await guildConfigStore.find(guild.id);
  const existing = await ticketStore.findOpenByUser(guild.id, member.id);
  if (existing) {
    const channel = await guild.channels.fetch(existing.channelId).catch(() => null);
    if (channel) return { channel, alreadyOpen: true };
  }

  const category = await ensureTicketCategory(guild, config);
  const overwrites = [
    { id: guild.roles.everyone.id, deny: [P.ViewChannel] },
    { id: member.id, allow: [P.ViewChannel, P.ReadMessageHistory, P.SendMessages] },
    ...(await staffVisibilityOverwrites(guild, config)),
  ];

  const channel = await guild.channels.create({
    name: toSmallCaps(`ticket-${member.user.username}`),
    type: ChannelType.GuildText,
    parent: category.id,
    permissionOverwrites: overwrites,
  });

  await ticketStore.add(guild.id, {
    channelId: channel.id, userId: member.id, status: 'open', createdAt: Date.now(),
  });

  const embed = new EmbedBuilder()
    .setTitle('🎫 Ticket support')
    .setDescription(`Bonjour <@${member.id}>, un membre du staff va te repondre bientot. Decris ta demande ici.`)
    .setColor(0x5b8def);
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(TICKET_CLOSE_ID).setLabel('Fermer le ticket').setStyle(ButtonStyle.Danger),
  );
  await channel.send({ content: `<@${member.id}>`, embeds: [embed], components: [row] });

  return { channel, alreadyOpen: false };
}

async function closeTicket(interaction) {
  const ticket = await ticketStore.findByChannel(interaction.guild.id, interaction.channel.id);
  if (!ticket) {
    await interaction.reply({ content: 'Ce salon n\'est pas un ticket suivi.', flags: MessageFlags.Ephemeral });
    return;
  }
  await ticketStore.close(interaction.guild.id, interaction.channel.id);
  await interaction.reply('Ticket ferme, ce salon sera supprime dans 5 secondes.');
  setTimeout(() => {
    interaction.channel.delete().catch((err) => logger.error('ticketManager.delete', err));
  }, 5000);
}

module.exports = {
  createTicket, closeTicket, postTicketPanel, TICKET_CLOSE_ID,
};
