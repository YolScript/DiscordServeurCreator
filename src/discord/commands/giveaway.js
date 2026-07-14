const giveawayStore = require('../../kv/giveawayStore');
const { buildGiveawayEmbed, buildGiveawayComponents } = require('../engagement/giveawayManager');

async function handleGiveawayCommand(interaction) {
  const prize = interaction.options.getString('prix', true);
  const durationMinutes = interaction.options.getInteger('duree_minutes', true);
  const winnersCount = interaction.options.getInteger('gagnants') || 1;

  await interaction.deferReply();

  const giveaway = await giveawayStore.add(interaction.guild.id, {
    channelId: interaction.channel.id,
    messageId: null,
    prize,
    winnersCount,
    entrants: [],
    endsAt: Date.now() + durationMinutes * 60 * 1000,
    closed: false,
    winners: [],
  });

  const message = await interaction.editReply({
    embeds: [buildGiveawayEmbed(giveaway)],
    components: buildGiveawayComponents(giveaway),
  });

  await giveawayStore.update(interaction.guild.id, giveaway.id, (g) => { g.messageId = message.id; });
}

module.exports = handleGiveawayCommand;
