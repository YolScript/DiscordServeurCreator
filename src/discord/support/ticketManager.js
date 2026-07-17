const {
  ChannelType, PermissionFlagsBits: P, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags,
} = require('discord.js');
const guildConfigStore = require('../../kv/guildConfigStore');
const ticketStore = require('../../kv/ticketStore');
const { toSmallCaps } = require('../../shared/smallCaps');
const { TICKET_OPEN, buildTicketRateId } = require('../interactions/customIds');
const { ensureStaffCategory, toggleOnlyOverwrites } = require('../roles/staffCategory');
const { ensureModLogChannel } = require('../moderation/modLog');
const { kvPut } = require('../../kv/cloudflareKv');
const { sendPushToGuild } = require('../../shared/webPush');
const logger = require('../../shared/logger');

const TICKET_CLOSE_ID = 'ticket_close';
const TICKET_CLAIM_ID = 'ticket_claim';

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
    const roleIds = config?.ticketAllowedRoleIds?.length
      ? config.ticketAllowedRoleIds
      : [config?.moderateurRoleId, config?.adminRoleId].filter(Boolean);
    return roleIds.map((roleId) => ({ id: roleId, allow: [P.ViewChannel, P.ReadMessageHistory, P.SendMessages] }));
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

// form (roadmap n°160) : { motif, details, urgence } saisis dans le modal
// d'ouverture — affiches en embed pour que le staff ait le contexte direct.
async function createTicket(guild, member, form = null) {
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
  sendPushToGuild(guild.id, {
    title: '🎫 Nouveau ticket',
    body: `${member.user.username} a ouvert un ticket.`,
    url: `app.html?guild=${guild.id}&shortcut=tickets`,
    tag: 'ticket',
  }).catch((err) => logger.error('ticketManager.pushNewTicket', err));

  const embed = new EmbedBuilder()
    .setTitle('🎫 Ticket support')
    .setDescription(`Bonjour <@${member.id}>, un membre du staff va te repondre bientot.${form ? '' : ' Decris ta demande ici.'}`)
    .setColor(0x5b8def);
  if (form) {
    embed.addFields(
      { name: 'Motif', value: form.motif.slice(0, 1024), inline: false },
      ...(form.details ? [{ name: 'Details', value: form.details.slice(0, 1024), inline: false }] : []),
      ...(form.urgence ? [{ name: 'Urgence', value: form.urgence.slice(0, 100), inline: true }] : []),
    );
  }
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(TICKET_CLAIM_ID).setLabel('Prendre en charge').setEmoji('🙋').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(TICKET_CLOSE_ID).setLabel('Fermer le ticket').setStyle(ButtonStyle.Danger),
  );
  await channel.send({ content: `<@${member.id}>`, embeds: [embed], components: [row] });

  return { channel, alreadyOpen: false };
}

// Supprime la categorie Tickets si plus aucun ticket n'est ouvert (evite une
// categorie vide qui traine). Elle sera recreee automatiquement au prochain
// ticket via ensureTicketCategory.
async function removeCategoryIfEmpty(guild) {
  try {
    const tickets = await ticketStore.list(guild.id);
    if (tickets.some((t) => t.status === 'open')) return;

    const config = await guildConfigStore.find(guild.id);
    if (!config?.ticketCategoryId) return;

    const category = await guild.channels.fetch(config.ticketCategoryId).catch(() => null);
    if (category) await category.delete().catch(() => {});
    await guildConfigStore.upsert(guild.id, { ticketCategoryId: null });
  } catch (err) {
    logger.error('ticketManager.removeCategoryIfEmpty', err);
  }
}

async function claimTicket(interaction) {
  const ticket = await ticketStore.findByChannel(interaction.guild.id, interaction.channel.id);
  if (!ticket) {
    await interaction.reply({ content: 'Ce salon n\'est pas un ticket suivi.', flags: MessageFlags.Ephemeral });
    return;
  }
  await ticketStore.assign(interaction.guild.id, interaction.channel.id, interaction.member.id, interaction.member.user.tag);
  await interaction.reply(`🙋 <@${interaction.member.id}> a pris en charge ce ticket.`);
}

// Recupere les 100 derniers messages (limite d'un seul appel API, suffisant
// pour l'immense majorite des tickets) et les met en forme en texte brut
// avant que le salon ne soit supprime.
async function buildTranscript(channel) {
  const messages = await channel.messages.fetch({ limit: 100 });
  const sorted = [...messages.values()].reverse();
  return sorted.map((m) => `[${m.createdAt.toISOString()}] ${m.author.tag}: ${m.content || '(sans texte)'}`).join('\n');
}

async function closeTicket(interaction) {
  const ticket = await ticketStore.findByChannel(interaction.guild.id, interaction.channel.id);
  if (!ticket) {
    await interaction.reply({ content: 'Ce salon n\'est pas un ticket suivi.', flags: MessageFlags.Ephemeral });
    return;
  }
  await ticketStore.close(interaction.guild.id, interaction.channel.id);
  await interaction.reply('Ticket ferme, ce salon sera supprime dans 5 secondes.');
  const { guild, channel } = interaction;

  const transcript = await buildTranscript(channel).catch(() => '');
  if (transcript) {
    // Transcription telechargeable depuis le dashboard (roadmap n°158),
    // conservee 30 jours en KV.
    await kvPut(`guild:${guild.id}:transcript:${ticket.id}`, {
      text: transcript, channelName: channel.name, closedAt: Date.now(),
    }, { ttlSeconds: 30 * 24 * 3600 }).catch((err) => logger.error('ticketManager.transcriptKv', err));
    const modLogChannel = await ensureModLogChannel(guild).catch(() => null);
    if (modLogChannel) {
      await modLogChannel.send({
        content: `📄 Transcript du ticket #${channel.name}`,
        files: [{ attachment: Buffer.from(transcript, 'utf8'), name: `transcript-${channel.name}.txt` }],
      }).catch((err) => logger.error('ticketManager.transcript', err));
    }
  }

  const opener = await guild.members.fetch(ticket.userId).catch(() => null);
  if (opener) {
    const rateRow = new ActionRowBuilder().addComponents(
      [1, 2, 3, 4, 5].map((n) => new ButtonBuilder()
        .setCustomId(buildTicketRateId(guild.id, ticket.id, n))
        .setLabel('⭐'.repeat(n))
        .setStyle(ButtonStyle.Secondary)),
    );
    await opener.send({ content: 'Ton ticket a ete ferme. Comment evaluerais-tu le support recu ?', components: [rateRow] }).catch(() => {});
  }

  setTimeout(() => {
    channel.delete()
      .then(() => removeCategoryIfEmpty(guild))
      .catch((err) => logger.error('ticketManager.delete', err));
  }, 5000);
}

// Appele depuis une interaction en MP (pas de contexte guilde) : guildId est
// encode dans le customId (cf buildTicketRateId).
async function rateTicket(interaction, guildId, ticketId, stars) {
  await ticketStore.rate(guildId, ticketId, stars).catch(() => {});
  await interaction.update({ content: `Merci pour ta note : ${'⭐'.repeat(stars)}`, components: [] }).catch(() => {});

  // Publication automatique de l'avis dans le salon configure (carte "Avis"
  // du createur), avec le staff qui avait pris le ticket en charge.
  try {
    const config = await guildConfigStore.find(guildId);
    if (!config?.reviewChannelId) return;
    const guild = await interaction.client.guilds.fetch(guildId).catch(() => null);
    if (!guild) return;
    const channel = await guild.channels.fetch(config.reviewChannelId).catch(() => null);
    if (!channel) return;
    const ticket = (await ticketStore.list(guildId)).find((t) => t.id === ticketId);
    const staffLine = ticket?.assignedTo
      ? `Pris en charge par <@${ticket.assignedTo}>`
      : 'Ticket sans prise en charge attribuee';
    const embed = new EmbedBuilder()
      .setTitle(`${'⭐'.repeat(stars)}${'☆'.repeat(5 - stars)}`)
      .setDescription(`Avis de <@${interaction.user.id}> apres son ticket.\n${staffLine}.`)
      .setColor(stars >= 4 ? 0x30a46c : stars === 3 ? 0xd3a13a : 0xe5484d)
      .setTimestamp();
    await channel.send({ embeds: [embed] });
  } catch (err) {
    logger.error('ticketManager.publishReview', err);
  }
}

module.exports = {
  createTicket, closeTicket, claimTicket, rateTicket, postTicketPanel, TICKET_CLOSE_ID, TICKET_CLAIM_ID,
};
