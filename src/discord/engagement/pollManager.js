const {
  EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle,
} = require('discord.js');
const client = require('../client');
const pollStore = require('../../kv/pollStore');
const { buildPollVoteId } = require('../interactions/customIds');
const logger = require('../../shared/logger');

const OPTION_STYLES = [ButtonStyle.Primary, ButtonStyle.Secondary, ButtonStyle.Success, ButtonStyle.Danger, ButtonStyle.Secondary];

function buildPollEmbed(poll) {
  const totalVotes = poll.options.reduce((sum, o) => sum + o.votes.length, 0);
  const lines = poll.options.map((o, idx) => {
    const pct = totalVotes ? Math.round((o.votes.length / totalVotes) * 100) : 0;
    const barLength = Math.round(pct / 10);
    const bar = '█'.repeat(barLength) + '░'.repeat(10 - barLength);
    return `**${idx + 1}. ${o.label}** — ${o.votes.length} vote(s) (${pct}%)\n${bar}`;
  });
  return new EmbedBuilder()
    .setTitle(`📊 ${poll.question}`)
    .setDescription(lines.join('\n\n'))
    .setColor(poll.closed ? 0x8b8d95 : 0x5b8def)
    .setFooter({ text: poll.closed ? 'Sondage termine' : `Se termine <t:${Math.floor(poll.endsAt / 1000)}:R>` });
}

function buildPollComponents(poll) {
  if (poll.closed) return [];
  const row = new ActionRowBuilder().addComponents(
    poll.options.map((o, idx) => new ButtonBuilder()
      .setCustomId(buildPollVoteId(poll.id, idx))
      .setLabel(o.label.slice(0, 80))
      .setStyle(OPTION_STYLES[idx] ?? ButtonStyle.Secondary)),
  );
  return [row];
}

async function refreshPollMessage(guild, poll) {
  const channel = await guild.channels.fetch(poll.channelId).catch(() => null);
  if (!channel) return;
  const message = await channel.messages.fetch(poll.messageId).catch(() => null);
  if (!message) return;
  await message.edit({ embeds: [buildPollEmbed(poll)], components: buildPollComponents(poll) }).catch(() => {});
}

async function handleVote(interaction, pollId, optionIndex) {
  const poll = await pollStore.update(interaction.guild.id, pollId, (p) => {
    for (const opt of p.options) {
      opt.votes = opt.votes.filter((v) => v !== interaction.user.id);
    }
    p.options[optionIndex].votes.push(interaction.user.id);
  });
  if (!poll) return;
  await refreshPollMessage(interaction.guild, poll);
}

async function tick() {
  for (const guild of client.guilds.cache.values()) {
    const polls = await pollStore.list(guild.id);
    const active = polls.filter((p) => !p.closed);
    if (active.length === 0) continue;

    const now = Date.now();
    let changed = false;
    for (const poll of active) {
      if (poll.endsAt > now) continue;
      poll.closed = true;
      changed = true;
      await refreshPollMessage(guild, poll).catch((err) => logger.error('pollManager.close', err));
    }
    if (changed) await pollStore.replaceAll(guild.id, polls);
  }
}

function start() {
  setInterval(() => { tick().catch((err) => logger.error('pollManager.tick', err)); }, 30_000);
}

module.exports = {
  buildPollEmbed, buildPollComponents, refreshPollMessage, handleVote, start,
};
