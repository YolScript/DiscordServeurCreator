const { MessageFlags } = require('discord.js');
const streamerLinkStore = require('../../kv/streamerLinkStore');

async function handleStreamerUnlinkCommand(interaction) {
  const platform = interaction.options.getString('plateforme', true);
  const target = interaction.options.getUser('membre', true);
  await streamerLinkStore.remove(interaction.guild.id, target.id, platform);
  await interaction.reply({ content: `Lien ${platform} retire pour <@${target.id}>.`, flags: MessageFlags.Ephemeral });
}

module.exports = handleStreamerUnlinkCommand;
