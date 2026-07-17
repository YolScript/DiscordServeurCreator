const guildConfigStore = require('../../kv/guildConfigStore');

// Motifs par defaut (roadmap n°272) : utilises tant que le serveur n'a pas
// configure sa propre liste depuis le dashboard (config.sanctionReasonPresets).
const DEFAULT_SANCTION_REASONS = [
  'Spam',
  'Propos injurieux ou insultants',
  'Contenu NSFW hors salon dedie',
  'Publicite ou auto-promotion non autorisee',
  'Contournement d\'une sanction precedente',
  'Non-respect du reglement',
  'Comportement toxique repete',
  'Harcelement envers un autre membre',
];

async function autocompleteSanctionReason(interaction) {
  const typed = interaction.options.getFocused().toLowerCase();
  const config = await guildConfigStore.find(interaction.guild.id).catch(() => null);
  const presets = config?.sanctionReasonPresets?.length ? config.sanctionReasonPresets : DEFAULT_SANCTION_REASONS;
  const matches = (typed ? presets.filter((p) => p.toLowerCase().includes(typed)) : presets).slice(0, 25);
  await interaction.respond(matches.map((p) => ({ name: p.slice(0, 100), value: p.slice(0, 100) })));
}

module.exports = { autocompleteSanctionReason, DEFAULT_SANCTION_REASONS };
