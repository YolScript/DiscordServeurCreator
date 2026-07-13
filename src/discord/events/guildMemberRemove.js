const { Events, EmbedBuilder } = require('discord.js');
const client = require('../client');
const guildConfigStore = require('../../kv/guildConfigStore');
const logger = require('../../shared/logger');

function applyPlaceholders(template, member) {
  return template
    .replaceAll('{user}', `<@${member.id}>`)
    .replaceAll('{username}', member.user.username)
    .replaceAll('{server}', member.guild.name)
    .replaceAll('{membercount}', String(member.guild.memberCount));
}

client.on(Events.GuildMemberRemove, async (member) => {
  try {
    const config = await guildConfigStore.find(member.guild.id);
    if (!config?.arrivalDepartureChannelId) return;

    const channel = await member.guild.channels.fetch(config.arrivalDepartureChannelId).catch(() => null);
    if (!channel) return;

    const text = applyPlaceholders(config.leaveMessageTemplate || '{username} a quitte le serveur.', member);
    const embed = new EmbedBuilder().setDescription(text).setColor(0xe63946).setThumbnail(member.user.displayAvatarURL());
    await channel.send({ embeds: [embed] });
  } catch (err) {
    logger.error('guildMemberRemove', err);
  }
});
