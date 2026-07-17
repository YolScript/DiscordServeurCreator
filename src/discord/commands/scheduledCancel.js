const { MessageFlags } = require('discord.js');
const scheduledTaskStore = require('../../kv/scheduledTaskStore');

async function handleScheduledCancelCommand(interaction) {
  const id = interaction.options.getString('id', true);
  const removed = await scheduledTaskStore.remove(interaction.guild.id, id);
  await interaction.reply({
    content: removed ? `Annulee : \`${id}\`.` : `Aucune entree avec l'ID \`${id}\`.`,
    flags: MessageFlags.Ephemeral,
  });
}

// Autocomplete (roadmap n°209) : propose directement les annonces/evenements
// programmes existants au lieu de faire coller un ID a la main.
async function autocompleteScheduledCancel(interaction) {
  const focused = interaction.options.getFocused().toLowerCase();
  const items = await scheduledTaskStore.list(interaction.guild.id).catch(() => []);
  const choices = items
    .filter((i) => i.id.toLowerCase().includes(focused) || (i.message || '').toLowerCase().includes(focused))
    .slice(0, 25)
    .map((i) => ({
      name: `${i.id} — ${(i.message || i.name || 'sans titre').slice(0, 70)}`.slice(0, 100),
      value: i.id,
    }));
  await interaction.respond(choices).catch(() => {});
}

module.exports = handleScheduledCancelCommand;
module.exports.autocompleteScheduledCancel = autocompleteScheduledCancel;
