const { MessageFlags } = require('discord.js');
const economyStore = require('../../kv/economyStore');
const guildConfigStore = require('../../kv/guildConfigStore');
const lotteryStore = require('../../kv/lotteryStore');
const { getCurrencyLabel } = require('../../shared/currency');

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
  // Streak (roadmap n°304) : le montant reellement recu est deja bonifie
  // dans claimDaily, on l'affiche depuis la derniere transaction loggee.
  const gained = updated.transactions[0]?.amount ?? reward;
  const streakLine = updated.dailyStreak > 1 ? ` (streak de **${updated.dailyStreak}** jours, bonus inclus)` : '';
  const currency = await getCurrencyLabel(interaction.guild.id);

  // Loterie hebdomadaire (roadmap n°496) : un ticket automatique par /daily
  // reclame, prix deduit du solde si l'option est active.
  let lotteryLine = '';
  const lotteryConfig = await guildConfigStore.find(interaction.guild.id).catch(() => null);
  if (lotteryConfig?.lotteryEnabled) {
    const ticketPrice = lotteryConfig.lotteryTicketPrice ?? 10;
    if (updated.balance >= ticketPrice) {
      await economyStore.addBalance(interaction.guild.id, interaction.user.id, -ticketPrice, 'ticket de loterie');
      await lotteryStore.addTicket(interaction.guild.id, interaction.user.id, ticketPrice);
      lotteryLine = `\n🎟️ Ticket de loterie achete (-${ticketPrice}).`;
    }
  }

  await interaction.reply(`${currency.emoji} Tu recuperes **${gained}** ${currency.name}${streakLine} ! Solde : **${updated.balance}**.${lotteryLine}`);
}

module.exports = handleDailyCommand;
