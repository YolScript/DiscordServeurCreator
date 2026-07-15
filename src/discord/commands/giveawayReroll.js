const { MessageFlags } = require('discord.js');
const { reroll } = require('../engagement/giveawayManager');

async function handleGiveawayRerollCommand(interaction) {
  const messageId = interaction.options.getString('message_id', true);
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const giveaway = await reroll(interaction.guild, messageId);
  if (!giveaway) {
    await interaction.editReply("Giveaway introuvable ou pas encore termine (verifie l'ID du message).");
    return;
  }

  const channel = await interaction.guild.channels.fetch(giveaway.channelId).catch(() => null);
  if (channel && giveaway.winners.length) {
    await channel.send(`🎉 Nouveau tirage ! Felicitations ${giveaway.winners.map((id) => `<@${id}>`).join(', ')} ! Tu remportes **${giveaway.prize}**.`).catch(() => {});
  }
  await interaction.editReply(giveaway.winners.length
    ? `Nouveaux gagnants : ${giveaway.winners.map((id) => `<@${id}>`).join(', ')}`
    : 'Plus aucun participant disponible pour un nouveau tirage.');
}

module.exports = handleGiveawayRerollCommand;
