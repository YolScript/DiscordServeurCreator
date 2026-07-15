const {
  EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags,
} = require('discord.js');
const suggestionStore = require('../../kv/suggestionStore');
const guildConfigStore = require('../../kv/guildConfigStore');
const {
  buildSuggestionVoteId, buildSuggestionApproveId, buildSuggestionDenyId,
} = require('../interactions/customIds');

const STATUS_COLORS = { pending: 0x5865f2, approved: 0x30a46c, denied: 0xe5484d };
const STATUS_LABELS = { pending: 'En attente', approved: '✅ Approuvee', denied: '❌ Refusee' };

function buildEmbed(suggestion) {
  return new EmbedBuilder()
    .setAuthor({ name: 'Nouvelle suggestion' })
    .setDescription(suggestion.text)
    .setColor(STATUS_COLORS[suggestion.status])
    .addFields(
      { name: '👍', value: String(suggestion.upvotes.length), inline: true },
      { name: '👎', value: String(suggestion.downvotes.length), inline: true },
      { name: 'Statut', value: STATUS_LABELS[suggestion.status], inline: true },
    )
    .setFooter({ text: `Proposee par ${suggestion.authorTag}` });
}

function buildComponents(suggestion) {
  const voteRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(buildSuggestionVoteId(suggestion.id, 'up')).setLabel(`👍 ${suggestion.upvotes.length}`).setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(buildSuggestionVoteId(suggestion.id, 'down')).setLabel(`👎 ${suggestion.downvotes.length}`).setStyle(ButtonStyle.Secondary),
  );
  if (suggestion.status !== 'pending') return [voteRow];
  const staffRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(buildSuggestionApproveId(suggestion.id)).setLabel('Approuver').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(buildSuggestionDenyId(suggestion.id)).setLabel('Refuser').setStyle(ButtonStyle.Danger),
  );
  return [voteRow, staffRow];
}

async function postSuggestion(channel, author, text) {
  const suggestion = await suggestionStore.add(channel.guild.id, {
    authorId: author.id, authorTag: author.tag, text, upvotes: [], downvotes: [], status: 'pending', channelId: channel.id, messageId: null,
  });
  const message = await channel.send({ embeds: [buildEmbed(suggestion)], components: buildComponents(suggestion) });
  await suggestionStore.update(channel.guild.id, suggestion.id, (s) => { s.messageId = message.id; });
  return message;
}

async function refreshMessage(guild, suggestion) {
  const channel = await guild.channels.fetch(suggestion.channelId).catch(() => null);
  if (!channel) return;
  const message = await channel.messages.fetch(suggestion.messageId).catch(() => null);
  if (!message) return;
  await message.edit({ embeds: [buildEmbed(suggestion)], components: buildComponents(suggestion) }).catch(() => {});
}

async function handleVote(interaction, suggestionId, direction) {
  const suggestion = await suggestionStore.update(interaction.guild.id, suggestionId, (s) => {
    const userId = interaction.user.id;
    s.upvotes = s.upvotes.filter((id) => id !== userId);
    s.downvotes = s.downvotes.filter((id) => id !== userId);
    if (direction === 'up') s.upvotes.push(userId);
    else s.downvotes.push(userId);
  });
  if (!suggestion) return;
  await refreshMessage(interaction.guild, suggestion);
  await interaction.reply({ content: 'Vote enregistre.', flags: MessageFlags.Ephemeral });
}

function isStaff(member, config) {
  const staffRoleIds = config?.staffRoleIds?.length ? config.staffRoleIds : [config?.moderateurRoleId, config?.adminRoleId].filter(Boolean);
  return staffRoleIds.some((roleId) => member.roles.cache.has(roleId));
}

async function handleModeration(interaction, suggestionId, status) {
  const config = await guildConfigStore.find(interaction.guild.id);
  if (!isStaff(interaction.member, config)) {
    await interaction.reply({ content: 'Reserve au staff.', flags: MessageFlags.Ephemeral });
    return;
  }
  const suggestion = await suggestionStore.update(interaction.guild.id, suggestionId, (s) => { s.status = status; });
  if (!suggestion) return;
  await refreshMessage(interaction.guild, suggestion);
  await interaction.reply({ content: `Suggestion ${status === 'approved' ? 'approuvee' : 'refusee'}.`, flags: MessageFlags.Ephemeral });
}

module.exports = { postSuggestion, handleVote, handleModeration };
