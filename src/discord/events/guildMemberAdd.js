const { Events, EmbedBuilder } = require('discord.js');
const client = require('../client');
const guildConfigStore = require('../../kv/guildConfigStore');
const antiRaid = require('../moderation/antiRaid');
const statsTracker = require('../automation/statsTracker');
const autoRules = require('../automation/autoRules');
const inviteTracker = require('../engagement/inviteTracker');
const webhookDispatcher = require('../automation/webhookDispatcher');
const { applyPlaceholders } = require('../../shared/placeholders');
const { generateWelcomeCard } = require('../engagement/welcomeCard');
const logger = require('../../shared/logger');

client.on(Events.GuildMemberAdd, async (member) => {
  antiRaid.handleGuildMemberAdd(member);
  statsTracker.recordJoin(member.guild.id);
  autoRules.handleMemberAdd(member).catch((err) => logger.error('autoRules.join', err));
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

    const text = applyPlaceholders(config.welcomeMessageTemplate || 'Bienvenue {user} sur {server} !', { user: member.user, guild: member.guild });
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

    // Carte de bienvenue en image (roadmap n°092) : jointe au message et
    // affichee dans l'embed. En cas d'echec (avatar inaccessible, fonte...),
    // le message part sans image, comme avant.
    let files;
    try {
      const card = await generateWelcomeCard(member);
      files = [{ attachment: card, name: 'bienvenue.png' }];
      embed.setImage('attachment://bienvenue.png');
    } catch (err) {
      logger.error('welcomeCard.generate', err);
    }

    await channel.send({ embeds: [embed], ...(files ? { files } : {}) });
  } catch (err) {
    logger.error('guildMemberAdd', err);
  }
});
