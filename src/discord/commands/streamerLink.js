const { MessageFlags } = require('discord.js');
const streamerLinkStore = require('../../kv/streamerLinkStore');
const env = require('../../config/env');

async function handleStreamerLinkCommand(interaction) {
  const platform = interaction.options.getString('plateforme', true);
  const target = interaction.options.getUser('membre', true);
  const identifier = interaction.options.getString('identifiant', true);

  if (platform === 'twitch' && !env.twitch.clientId) {
    await interaction.reply({ content: 'Twitch non configure sur ce bot (cles API manquantes).', flags: MessageFlags.Ephemeral });
    return;
  }
  if (platform === 'youtube' && !env.youtube.apiKey) {
    await interaction.reply({ content: 'YouTube non configure sur ce bot (cle API manquante).', flags: MessageFlags.Ephemeral });
    return;
  }

  await streamerLinkStore.add(interaction.guild.id, { discordUserId: target.id, platform, identifier });
  await interaction.reply({
    content: `<@${target.id}> lie a ${platform === 'twitch' ? 'Twitch' : 'YouTube'} ("${identifier}"). Verifie toutes les ~2 minutes.`,
    flags: MessageFlags.Ephemeral,
  });
}

module.exports = handleStreamerLinkCommand;
