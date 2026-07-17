// Mini-commandes fun configurables (roadmap n°315) : 8ball, pile-ou-face, des.
// Regroupees dans un seul fichier car ce sont trois variantes du meme besoin
// (reponse aleatoire instantanee), pas trois systemes distincts.
const EIGHTBALL_ANSWERS = [
  'Oui, certainement.', 'C\'est decide.', 'Sans aucun doute.', 'Oui.', 'Probablement.',
  'Les signes penchent pour oui.', 'Reponse floue, redemande.', 'Redemande plus tard.',
  'Impossible a predire pour le moment.', 'Ne compte pas dessus.', 'Ma reponse est non.',
  'Mes sources disent non.', 'Tres douteux.',
];

async function handleEightballCommand(interaction) {
  const question = interaction.options.getString('question', true);
  const answer = EIGHTBALL_ANSWERS[Math.floor(Math.random() * EIGHTBALL_ANSWERS.length)];
  await interaction.reply(`🎱 **${question}**\n> ${answer}`);
}

async function handleCoinflipCommand(interaction) {
  const result = Math.random() < 0.5 ? 'Pile' : 'Face';
  await interaction.reply(`🪙 **${result}** !`);
}

async function handleDiceCommand(interaction) {
  const faces = interaction.options.getInteger('faces') || 6;
  const result = 1 + Math.floor(Math.random() * faces);
  await interaction.reply(`🎲 Tu obtiens **${result}** (sur ${faces}).`);
}

module.exports = { handleEightballCommand, handleCoinflipCommand, handleDiceCommand };
