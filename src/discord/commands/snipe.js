const { EmbedBuilder, MessageFlags } = require('discord.js');
const snipeStore = require('../automation/snipeStore');

// Reserve au staff (roadmap n°377, "opt-in staff") : permission par defaut
// posee sur la commande elle-meme (voir commandDefinitions.js).
async function handleSnipeCommand(interaction) {
  const entry = snipeStore.get(interaction.channel.id);
  if (!entry) {
    await interaction.reply({ content: 'Rien a afficher : aucun message supprime recemment dans ce salon.', flags: MessageFlags.Ephemeral });
    return;
  }
  const embed = new EmbedBuilder()
    .setAuthor({ name: entry.authorTag, iconURL: entry.authorAvatarUrl || undefined })
    .setDescription(entry.content.slice(0, 4000))
    .setColor(0xe5484d)
    .setFooter({ text: `Supprime` })
    .setTimestamp(entry.deletedAt);
  await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
}

module.exports = handleSnipeCommand;
