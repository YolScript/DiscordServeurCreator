const { Events, EmbedBuilder } = require('discord.js');
const client = require('../client');
const guildConfigStore = require('../../kv/guildConfigStore');
const webhookDispatcher = require('../automation/webhookDispatcher');
const memberAgeStore = require('../../kv/memberAgeStore');
const { applyPlaceholders } = require('../../shared/placeholders');
const logger = require('../../shared/logger');

client.on(Events.GuildMemberRemove, async (member) => {
  webhookDispatcher.fireEvent(member.guild.id, 'member_leave', {
    userId: member.id,
    username: member.user.username,
    tag: member.user.tag,
    memberCount: member.guild.memberCount,
  }).catch(() => {});

  // Le statut majeur/mineur ne doit pas survivre au depart du membre.
  memberAgeStore.remove(member.guild.id, member.id).catch(() => {});

  try {
    const config = await guildConfigStore.find(member.guild.id);
    if (!config?.arrivalDepartureChannelId) return;

    const channel = await member.guild.channels.fetch(config.arrivalDepartureChannelId).catch(() => null);
    if (!channel) return;

    const text = applyPlaceholders(config.leaveMessageTemplate || '{username} a quitte le serveur.', { user: member.user, guild: member.guild });
    const embed = new EmbedBuilder()
      .setAuthor({ name: member.user.username, iconURL: member.user.displayAvatarURL() })
      .setTitle('👋 Depart')
      .setDescription(text)
      .setThumbnail(member.user.displayAvatarURL({ size: 256 }))
      .addFields({ name: 'Total', value: `${member.guild.memberCount} membres`, inline: true })
      .setColor(0xe5484d)
      .setFooter({ text: member.guild.name, iconURL: member.guild.iconURL() ?? undefined })
      .setTimestamp();

    await channel.send({ embeds: [embed] });
  } catch (err) {
    logger.error('guildMemberRemove', err);
  }
});
