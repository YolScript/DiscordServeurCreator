const client = require('../client');
const guildConfigStore = require('../../kv/guildConfigStore');
const logger = require('../../shared/logger');

// Citation du jour (roadmap n°317) : postee une fois par 24h dans le salon
// configure. Liste par defaut generique si l'admin n'a rien personnalise
// (config.dailyQuotes).
const DEFAULT_QUOTES = [
  'La seule facon de faire du bon travail est d\'aimer ce que vous faites. — Steve Jobs',
  'Le succes, c\'est se promener d\'echec en echec avec enthousiasme. — Winston Churchill',
  'Ce que nous savons est une goutte d\'eau, ce que nous ignorons est un ocean. — Isaac Newton',
  'La vie, c\'est ce qui se passe quand on est occupe a faire d\'autres projets. — John Lennon',
  'Il n\'y a qu\'une facon d\'eviter la critique : ne rien faire, ne rien dire, ne rien etre. — Aristote',
];

const TICK_MS = 60 * 60_000;
const DAY_MS = 24 * 3600_000;

async function tick() {
  for (const guild of client.guilds.cache.values()) {
    // eslint-disable-next-line no-await-in-loop
    const config = await guildConfigStore.find(guild.id).catch(() => null);
    if (!config?.dailyQuoteChannelId) continue;
    const lastPosted = config?.lastDailyQuoteAt || 0;
    if (Date.now() - lastPosted < DAY_MS) continue;

    // eslint-disable-next-line no-await-in-loop
    const channel = await guild.channels.fetch(config.dailyQuoteChannelId).catch(() => null);
    if (!channel) continue;
    const quotes = config.dailyQuotes?.length ? config.dailyQuotes : DEFAULT_QUOTES;
    const quote = quotes[Math.floor(Math.random() * quotes.length)];
    // eslint-disable-next-line no-await-in-loop
    await channel.send(`💬 **Citation du jour**\n> ${quote}`).catch((err) => logger.error('dailyQuote.send', err));
    // eslint-disable-next-line no-await-in-loop
    await guildConfigStore.upsert(guild.id, { lastDailyQuoteAt: Date.now() }).catch((err) => logger.error('dailyQuote.markPosted', err));
  }
}

function start() {
  setInterval(() => { tick().catch((err) => logger.error('dailyQuote.tick', err)); }, TICK_MS);
  logger.info('Citation du jour demarree');
}

module.exports = { start };
