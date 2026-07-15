const { MessageFlags } = require('discord.js');
const guildConfigStore = require('../../kv/guildConfigStore');
const { postSuggestion } = require('../engagement/suggestionManager');

async function handleSuggestCommand(interaction) {
  const text = interaction.options.getString('texte', true);
  const config = await guildConfigStore.find(interaction.guild.id);
  const channelId = config?.suggestionsChannelId;
  if (!channelId) {
    await interaction.reply({ content: 'Aucun salon de suggestions configure (dashboard > Automatisations).', flags: MessageFlags.Ephemeral });
    return;
  }
  const channel = await interaction.guild.channels.fetch(channelId).catch(() => null);
  if (!channel) {
    await interaction.reply({ content: 'Salon de suggestions introuvable.', flags: MessageFlags.Ephemeral });
    return;
  }

  await postSuggestion(channel, interaction.user, text);
  await interaction.reply({ content: `Suggestion postee dans <#${channelId}> !`, flags: MessageFlags.Ephemeral });
}

module.exports = handleSuggestCommand;
