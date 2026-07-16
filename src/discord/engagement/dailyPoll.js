const client = require('../client');
const guildConfigStore = require('../../kv/guildConfigStore');
const pollStore = require('../../kv/pollStore');
const { buildPollEmbed, buildPollComponents } = require('./pollManager');
const { kvGet, kvPut } = require('../../kv/cloudflareKv');
const logger = require('../../shared/logger');

// Sondage du jour (roadmap n°162) : chaque jour a l'heure configuree
// (config.dailyPoll = { channelId, hourUtc, questions: [texte] }), le bot
// poste une question de la liste en rotation, sous forme de vrai sondage
// (les votes passent par le pollManager existant).
const TICK_MS = 5 * 60 * 1000;

async function postDailyPoll(guild, dailyPollConfig, state) {
  const channel = await guild.channels.fetch(dailyPollConfig.channelId).catch(() => null);
  if (!channel) return false;

  const question = dailyPollConfig.questions[state.index % dailyPollConfig.questions.length];
  const poll = await pollStore.add(guild.id, {
    question: String(question).slice(0, 200),
    options: [{ label: 'Oui', votes: [] }, { label: 'Non', votes: [] }, { label: 'Sans avis', votes: [] }],
    channelId: channel.id,
    authorId: client.user.id,
    closed: false,
    createdAt: Date.now(),
  });
  const message = await channel.send({
    content: '☀️ **Question du jour**',
    embeds: [buildPollEmbed(poll)],
    components: buildPollComponents(poll),
  });
  await pollStore.update(guild.id, poll.id, (p) => { p.messageId = message.id; });
  return true;
}

async function tick() {
  const nowUtcHour = new Date().getUTCHours();
  const today = new Date().toISOString().slice(0, 10);

  for (const guild of client.guilds.cache.values()) {
    try {
      const config = await guildConfigStore.find(guild.id);
      const dailyPollConfig = config?.dailyPoll;
      if (!dailyPollConfig?.channelId || !Array.isArray(dailyPollConfig.questions) || !dailyPollConfig.questions.length) continue;
      if (nowUtcHour !== (dailyPollConfig.hourUtc ?? 17)) continue;

      const stateKey = `guild:${guild.id}:dailypoll`;
      const state = (await kvGet(stateKey)) || { lastDate: null, index: 0 };
      if (state.lastDate === today) continue;

      const posted = await postDailyPoll(guild, dailyPollConfig, state);
      if (posted) {
        await kvPut(stateKey, { lastDate: today, index: (state.index + 1) % dailyPollConfig.questions.length });
      }
    } catch (err) {
      logger.error('dailyPoll', err);
    }
  }
}

function start() {
  setInterval(() => { tick().catch((err) => logger.error('dailyPoll.tick', err)); }, TICK_MS);
  logger.info('dailyPoll demarre');
}

module.exports = { start };
