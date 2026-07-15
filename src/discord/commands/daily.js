const { MessageFlags } = require('discord.js');
const economyStore = require('../../kv/economyStore');

const COOLDOWN_MS = 24 * 60 * 60_000;
const MIN_REWARD = 100;
const MAX_REWARD = 250;

async function handleDailyCommand(interaction) {
  const account = await economyStore.getAccount(interaction.guild.id, interaction.user.id);
  const remaining = COOLDOWN_MS - (Date.now() - account.lastDaily);

  if (remaining > 0) {
    const hours = Math.floor(remaining / 3_600_000);
    const minutes = Math.floor((remaining % 3_600_000) / 60_000);
    await interaction.reply({ content: `Deja recupere. Reviens dans ${hours}h ${minutes}min.`, flags: MessageFlags.Ephemeral });
    return;
  }

  const reward = MIN_REWARD + Math.floor(Math.random() * (MAX_REWARD - MIN_REWARD + 1));
  const updated = await economyStore.claimDaily(interaction.guild.id, interaction.user.id, reward);
  await interaction.reply(`🪙 Tu recuperes **${reward}** pieces ! Solde : **${updated.balance}**.`);
}

module.exports = handleDailyCommand;
