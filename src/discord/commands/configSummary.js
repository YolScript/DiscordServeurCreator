const { EmbedBuilder, MessageFlags } = require('discord.js');
const guildConfigStore = require('../../kv/guildConfigStore');

// /config (roadmap n°183) : resume en un embed de ce qui est configure sur
// le serveur, avec ce qui manque.
async function handleConfigSummaryCommand(interaction) {
  const config = (await guildConfigStore.find(interaction.guild.id)) || {};
  const check = (value) => (value ? '✅' : '▫️');
  const channel = (cid) => (cid ? `<#${cid}>` : 'non configure');

  const lines = [
    `${check(config.arrivalDepartureChannelId)} Bienvenue : ${channel(config.arrivalDepartureChannelId)}`,
    `${check(config.modLogChannelId)} Journal de moderation : ${channel(config.modLogChannelId)}`,
    `${check(config.announceChannelId)} Annonces : ${channel(config.announceChannelId)}`,
    `${check(config.suggestionChannelId)} Suggestions : ${channel(config.suggestionChannelId)}`,
    `${check(config.reviewChannelId)} Avis tickets : ${channel(config.reviewChannelId)}`,
    `${check(config.starboardChannelId)} Starboard : ${channel(config.starboardChannelId)}`,
    `${check(config.autoRoleId)} Role automatique : ${config.autoRoleId ? `<@&${config.autoRoleId}>` : 'aucun'}`,
    `${check((config.autoRules || []).length)} Regles si → alors : ${(config.autoRules || []).length}`,
    `${check(config.dailyPoll)} Question du jour : ${config.dailyPoll ? 'active' : 'inactive'}`,
    `${check(config.xpRate)} Vitesse XP : x${config.xpRate || 1}`,
    `${check(config.autoCrosspost)} Crosspost automatique : ${config.autoCrosspost ? 'actif' : 'inactif'}`,
    `${check(config.twitchBroadcasterLogin)} Twitch lie : ${config.twitchBroadcasterLogin || 'non'}`,
  ];

  const embed = new EmbedBuilder()
    .setTitle(`⚙️ Configuration de ${interaction.guild.name}`)
    .setDescription(lines.join('\n'))
    .setColor(0xad5940)
    .setFooter({ text: 'Tout se configure sur le dashboard.' });

  await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
}

module.exports = handleConfigSummaryCommand;
