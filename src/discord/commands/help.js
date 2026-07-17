const {
  EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, MessageFlags,
} = require('discord.js');

// /help interactif (roadmap n°182) : menu deroulant par categorie plutot
// qu'un mur de texte. Liste maintenue a la main (les noms doivent rester
// synchronises avec commandDefinitions.js si une commande est ajoutee).
const HELP_CATEGORIES = {
  moderation: {
    label: '🛡️ Moderation', description: 'Avertissements, timeout, verrouillage',
    commands: [
      ['/warn', 'Avertit un membre avec une raison'],
      ['/warnings', 'Affiche le casier de sanctions d\'un membre'],
      ['/clearwarns', 'Reinitialise les avertissements d\'un membre'],
      ['/timeout', 'Reduit un membre au silence temporairement'],
      ['/tempban', 'Bannit temporairement (deban automatique)'],
      ['/unlock', 'Leve le verrouillage de securite du serveur'],
      ['/automod', 'Configure mots interdits, mots-cles, invites, liens'],
      ['Signaler au staff', 'Clic droit sur un message pour le signaler'],
    ],
  },
  economie: {
    label: '🪙 Economie', description: 'Monnaie, boutique, paiements',
    commands: [
      ['/balance', 'Affiche ton solde ou celui d\'un membre'],
      ['/daily', 'Recupere ta recompense quotidienne'],
      ['/pay', 'Envoie des pieces a un membre'],
      ['/shop', 'Ouvre la boutique du serveur'],
      ['/economy-leaderboard', 'Classement des plus riches'],
    ],
  },
  niveaux: {
    label: '📈 Niveaux', description: 'XP, classement, paliers',
    commands: [
      ['/rank', 'Affiche ta carte de niveau (ou celle d\'un membre)'],
      ['/leaderboard', 'Classement XP du serveur'],
      ['/levelrole', 'Configure les roles debloques par niveau'],
      ['/invites', 'Compte les invitations d\'un membre'],
      ['/referralrole', 'Configure les roles de parrainage'],
    ],
  },
  fun: {
    label: '🎉 Fun & communaute', description: 'Sondages, giveaways, jeux',
    commands: [
      ['/poll', 'Cree un sondage a options multiples'],
      ['/giveaway', 'Lance un giveaway'],
      ['/giveaway-reroll', 'Retire un gagnant sur un giveaway termine'],
      ['/suggest', 'Propose une suggestion au serveur'],
      ['/birthday', 'Enregistre ta date d\'anniversaire'],
      ['/badges', 'Affiche les badges d\'un membre'],
      ['/link-jeu', 'Lie ton pseudo sur un jeu'],
      ['/profil-jeu', 'Affiche le profil de jeu d\'un membre'],
    ],
  },
  panneaux: {
    label: '🧩 Panneaux & config', description: 'Setup et panneaux a poster',
    commands: [
      ['/setup', 'Configure le serveur avec un template complet'],
      ['/config', 'Resume la configuration actuelle du serveur'],
      ['/ticket-panel', 'Poste le panneau de creation de tickets'],
      ['/poll-panel', 'Poste le panneau de creation de sondages'],
      ['/reglement-panel', 'Poste le reglement avec bouton d\'acceptation'],
      ['/roles-panel', 'Poste le panneau de roles a choisir'],
      ['/reglement-translation', 'Gere les traductions du reglement'],
      ['/streamer-link', 'Lie un membre a une chaine Twitch/YouTube'],
      ['/streamer-unlink', 'Retire un lien streamer'],
      ['/streamer-list', 'Liste les streamers lies'],
    ],
  },
  utilitaires: {
    label: '🔧 Utilitaires', description: 'Rappels, annonces, reponses',
    commands: [
      ['/remind', 'Programme un rappel en MP'],
      ['/reponse', 'Poste une reponse pre-ecrite (staff)'],
      ['/schedule-announcement', 'Programme une annonce'],
      ['/schedule-event', 'Programme un evenement'],
      ['/scheduled-list', 'Liste les annonces/evenements programmes'],
      ['/scheduled-cancel', 'Annule une programmation'],
    ],
  },
};

function buildCategorySelect(selected) {
  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId('help_category_select')
      .setPlaceholder('Choisis une categorie...')
      .addOptions(Object.entries(HELP_CATEGORIES).map(([key, cat]) => ({
        label: cat.label, description: cat.description, value: key, default: key === selected,
      }))),
  );
}

function buildCategoryEmbed(key) {
  const cat = HELP_CATEGORIES[key];
  return new EmbedBuilder()
    .setTitle(cat.label)
    .setDescription(cat.commands.map(([name, desc]) => `**${name}** — ${desc}`).join('\n'))
    .setColor(0xc97a5c)
    .setFooter({ text: 'Choisis une autre categorie dans le menu ci-dessus.' });
}

async function handleHelpCommand(interaction) {
  await interaction.reply({
    embeds: [buildCategoryEmbed('moderation')],
    components: [buildCategorySelect('moderation')],
    flags: MessageFlags.Ephemeral,
  });
}

async function handleHelpCategorySelect(interaction) {
  const key = interaction.values[0];
  if (!HELP_CATEGORIES[key]) return;
  await interaction.update({ embeds: [buildCategoryEmbed(key)], components: [buildCategorySelect(key)] });
}

module.exports = { handleHelpCommand, handleHelpCategorySelect };
