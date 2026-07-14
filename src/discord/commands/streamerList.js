const { MessageFlags } = require('discord.js');
const streamerLinkStore = require('../../kv/streamerLinkStore');

async function handleStreamerListCommand(interaction) {
  const streamers = await streamerLinkStore.list(interaction.guild.id);
  if (streamers.length === 0) {
    await interaction.reply({ content: 'Aucun streamer lie.', flags: MessageFlags.Ephemeral });
    return;
  }
  const lines = streamers.map((s) => `<@${s.discordUserId}> — ${s.platform} ("${s.identifier}") ${s.isLive ? '🔴 en live' : ''}`);
  await interaction.reply({ content: lines.join('\n'), flags: MessageFlags.Ephemeral });
}

module.exports = handleStreamerListCommand;
