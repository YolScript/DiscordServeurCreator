const client = require('../client');
const guildConfigStore = require('../../kv/guildConfigStore');
const logger = require('../../shared/logger');

const TICK_MS = 10 * 60_000;

// Flux RSS/Atom vers un salon (roadmap n°099) : config.rssFeeds =
// [{ url, channelId, lastLink }]. Parse minimaliste sans dependance,
// premiere verification silencieuse (memorise sans annoncer).
function decodeEntities(str) {
  return str.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'");
}

function parseLatest(xml) {
  const item = xml.match(/<item[\s>]([\s\S]*?)<\/item>/) || xml.match(/<entry[\s>]([\s\S]*?)<\/entry>/);
  if (!item) return null;
  const block = item[1];
  const title = block.match(/<title[^>]*>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/)?.[1]?.trim() || 'Nouvel article';
  const link = block.match(/<link[^>]*href="([^"]+)"/)?.[1] || block.match(/<link[^>]*>([^<]+)<\/link>/)?.[1]?.trim();
  if (!link || !/^https?:\/\//.test(link)) return null;
  return { title: decodeEntities(title).slice(0, 200), link };
}

async function tick() {
  for (const guild of client.guilds.cache.values()) {
    const config = await guildConfigStore.find(guild.id).catch(() => null);
    const feeds = config?.rssFeeds;
    if (!Array.isArray(feeds) || !feeds.length) continue;

    let changed = false;
    for (const feed of feeds) {
      try {
        // eslint-disable-next-line no-await-in-loop
        const res = await fetch(feed.url, { headers: { 'User-Agent': 'DiscordServeurCreator/1.0' } });
        if (!res.ok) continue;
        // eslint-disable-next-line no-await-in-loop
        const latest = parseLatest(await res.text());
        if (!latest || latest.link === feed.lastLink) continue;
        const isFirstCheck = !feed.lastLink;
        feed.lastLink = latest.link;
        changed = true;
        if (isFirstCheck) continue;
        // eslint-disable-next-line no-await-in-loop
        const channel = await guild.channels.fetch(feed.channelId).catch(() => null);
        // eslint-disable-next-line no-await-in-loop
        if (channel) await channel.send(`📰 **${latest.title}**\n${latest.link}`).catch(() => {});
      } catch (err) {
        logger.error('rssWatcher.feed', err);
      }
    }
    if (changed) await guildConfigStore.upsert(guild.id, { rssFeeds: feeds }).catch((err) => logger.error('rssWatcher.save', err));
  }
}

function start() {
  setInterval(() => { tick().catch((err) => logger.error('rssWatcher.tick', err)); }, TICK_MS);
  logger.info('Suivi des flux RSS demarre');
}

module.exports = { start, tick };
