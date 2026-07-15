const { EmbedBuilder } = require('discord.js');
const platformLinkStore = require('../../kv/platformLinkStore');

async function handleGameProfileCommand(interaction) {
  const target = interaction.options.getUser('membre') || interaction.user;
  const links = await platformLinkStore.get(interaction.guild.id, target.id);

  const embed = new EmbedBuilder()
    .setAuthor({ name: target.username, iconURL: target.displayAvatarURL() })
    .setTitle('🎮 Profil jeu')
    .setColor(0x5865f2);

  const fields = [];
  if (links.steam) fields.push({ name: 'Steam', value: `[${links.steam}](https://steamcommunity.com/id/${encodeURIComponent(links.steam)})`, inline: true });
  if (links.epic) fields.push({ name: 'Epic Games', value: links.epic, inline: true });
  if (links.riot) fields.push({ name: 'Riot Games', value: links.riot, inline: true });

  if (!fields.length) {
    embed.setDescription('Aucun pseudo lie. Utilise /link-jeu pour en ajouter.');
  } else {
    embed.addFields(fields);
  }

  await interaction.reply({ embeds: [embed] });
}

module.exports = handleGameProfileCommand;
