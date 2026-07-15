const { Events, EmbedBuilder } = require('discord.js');
const client = require('../client');
const guildConfigStore = require('../../kv/guildConfigStore');
const antiRaid = require('../moderation/antiRaid');
const inviteTracker = require('../engagement/inviteTracker');
const webhookDispatcher = require('../automation/webhookDispatcher');
const logger = require('../../shared/logger');

function applyPlaceholders(template, member) {
  return template
    .replaceAll('{user}', `<@${member.id}>`)
    .replaceAll('{username}', member.user.username)
    .replaceAll('{server}', member.guild.name)
    .replaceAll('{membercount}', String(member.guild.memberCount));
}

client.on(Events.GuildMemberAdd, async (member) => {
  antiRaid.handleGuildMemberAdd(member);
  inviteTracker.resolveInviterOnJoin(member).catch((err) => logger.error('resolveInviterOnJoin', err));
  webhookDispatcher.fireEvent(member.guild.id, 'member_join', {
    userId: member.id,
    username: member.user.username,
    tag: member.user.tag,
    memberCount: member.guild.memberCount,
  }).catch(() => {});

  try {
    const config = await guildConfigStore.find(member.guild.id);
    if (!config) return;

    if (config.autoRoleId) await member.roles.add(config.autoRoleId).catch((err) => logger.error('autoRole', err));

    if (!config.arrivalDepartureChannelId) return;

    const channel = await member.guild.channels.fetch(config.arrivalDepartureChannelId).catch(() => null);
    if (!channel) return;

    const text = applyPlaceholders(config.welcomeMessageTemplate || 'Bienvenue {user} sur {server} !', member);
    const embed = new EmbedBuilder()
      .setAuthor({ name: member.user.username, iconURL: member.user.displayAvatarURL() })
      .setTitle('👋 Nouveau membre')
      .setDescription(text)
      .setThumbnail(member.user.displayAvatarURL({ size: 256 }))
      .addFields(
        { name: 'Membre', value: `<@${member.id}>`, inline: true },
        { name: 'Total', value: `${member.guild.memberCount} membres`, inline: true },
      )
      .setColor(0x30a46c)
      .setFooter({ text: member.guild.name, iconURL: member.guild.iconURL() ?? undefined })
      .setTimestamp();

    await channel.send({ embeds: [embed] });
  } catch (err) {
    logger.error('guildMemberAdd', err);
  }
});
