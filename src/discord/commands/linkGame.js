const { MessageFlags } = require('discord.js');
const platformLinkStore = require('../../kv/platformLinkStore');

const PLATFORM_LABELS = { steam: 'Steam', epic: 'Epic Games', riot: 'Riot Games' };

async function handleLinkGameCommand(interaction) {
  const platform = interaction.options.getString('plateforme', true);
  const pseudo = interaction.options.getString('pseudo', true).trim();

  await platformLinkStore.set(interaction.guild.id, interaction.user.id, platform, pseudo);
  await interaction.reply({
    content: `Pseudo ${PLATFORM_LABELS[platform]} enregistre : ${pseudo}`,
    flags: MessageFlags.Ephemeral,
  });
}

module.exports = handleLinkGameCommand;
