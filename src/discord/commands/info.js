// Commandes d'info manquantes (roadmap n°371) : avatar, banniere, info
// serveur, info membre. Regroupees dans un seul fichier, ce sont 4 lookups
// en lecture seule sans etat partage.
const { EmbedBuilder } = require('discord.js');

async function handleAvatarCommand(interaction) {
  const target = interaction.options.getUser('membre') || interaction.user;
  const embed = new EmbedBuilder()
    .setTitle(`Avatar de ${target.username}`)
    .setImage(target.displayAvatarURL({ extension: 'png', size: 1024 }))
    .setColor(0x5b8def);
  await interaction.reply({ embeds: [embed] });
}

async function handleBannerCommand(interaction) {
  const targetUser = interaction.options.getUser('membre') || interaction.user;
  // La banniere n'est pas incluse dans le cache par defaut : fetch force requis.
  const full = await interaction.client.users.fetch(targetUser.id, { force: true });
  if (!full.bannerURL()) {
    await interaction.reply(`${full.id === interaction.user.id ? 'Tu n\'as' : `<@${full.id}> n'a`} pas de banniere.`);
    return;
  }
  const embed = new EmbedBuilder()
    .setTitle(`Banniere de ${full.username}`)
    .setImage(full.bannerURL({ extension: 'png', size: 1024 }))
    .setColor(0x5b8def);
  await interaction.reply({ embeds: [embed] });
}

async function handleServerinfoCommand(interaction) {
  const { guild } = interaction;
  const owner = await guild.fetchOwner().catch(() => null);
  const channelCounts = guild.channels.cache.reduce((acc, c) => {
    if (c.type === 0) acc.text += 1;
    else if (c.type === 2) acc.voice += 1;
    else if (c.type === 4) acc.category += 1;
    return acc;
  }, { text: 0, voice: 0, category: 0 });

  const embed = new EmbedBuilder()
    .setTitle(guild.name)
    .setThumbnail(guild.iconURL({ size: 256 }) || null)
    .setColor(0x5b8def)
    .addFields(
      { name: 'Proprietaire', value: owner ? `<@${owner.id}>` : 'Inconnu', inline: true },
      { name: 'Membres', value: String(guild.memberCount), inline: true },
      { name: 'Roles', value: String(guild.roles.cache.size), inline: true },
      { name: 'Salons', value: `${channelCounts.text} texte, ${channelCounts.voice} vocal, ${channelCounts.category} categorie(s)`, inline: true },
      { name: 'Boosts', value: `Niveau ${guild.premiumTier} (${guild.premiumSubscriptionCount || 0})`, inline: true },
      { name: 'Cree le', value: `<t:${Math.floor(guild.createdTimestamp / 1000)}:D>`, inline: true },
    );
  await interaction.reply({ embeds: [embed] });
}

async function handleUserinfoCommand(interaction) {
  const target = interaction.options.getMember('membre') || interaction.member;
  const roles = [...target.roles.cache.values()].filter((r) => r.name !== '@everyone').sort((a, b) => b.position - a.position);
  const embed = new EmbedBuilder()
    .setTitle(target.user.tag)
    .setThumbnail(target.user.displayAvatarURL({ size: 256 }))
    .setColor(target.displayColor || 0x5b8def)
    .addFields(
      { name: 'A rejoint le serveur', value: target.joinedTimestamp ? `<t:${Math.floor(target.joinedTimestamp / 1000)}:D>` : 'Inconnu', inline: true },
      { name: 'Compte cree le', value: `<t:${Math.floor(target.user.createdTimestamp / 1000)}:D>`, inline: true },
      { name: `Roles (${roles.length})`, value: roles.length ? roles.slice(0, 20).map((r) => `<@&${r.id}>`).join(' ') : 'Aucun', inline: false },
    );
  await interaction.reply({ embeds: [embed] });
}

module.exports = {
  handleAvatarCommand, handleBannerCommand, handleServerinfoCommand, handleUserinfoCommand,
};
