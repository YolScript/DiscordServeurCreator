const { MessageFlags } = require('discord.js');
const guildConfigStore = require('../../kv/guildConfigStore');

// Reponses pre-ecrites (roadmap n°159) : /reponse <nom> poste le texte
// configure dans le dashboard (section Tickets). Autocomplete sur le nom.
async function handleCannedResponseCommand(interaction) {
  const name = interaction.options.getString('nom');
  const config = await guildConfigStore.find(interaction.guild.id);
  const responses = config?.cannedResponses || [];
  const found = responses.find((r) => r.name === name || r.id === name);
  if (!found) {
    await interaction.reply({ content: 'Reponse introuvable. Configure-les dans le dashboard (section Tickets).', flags: MessageFlags.Ephemeral });
    return;
  }
  await interaction.reply({ content: found.text.slice(0, 2000) });
}

async function autocompleteCannedResponse(interaction) {
  const focused = interaction.options.getFocused().toLowerCase();
  const config = await guildConfigStore.find(interaction.guild.id).catch(() => null);
  const responses = (config?.cannedResponses || [])
    .filter((r) => r.name.toLowerCase().includes(focused))
    .slice(0, 25)
    .map((r) => ({ name: r.name.slice(0, 100), value: r.name.slice(0, 100) }));
  await interaction.respond(responses).catch(() => {});
}

module.exports = { handleCannedResponseCommand, autocompleteCannedResponse };
