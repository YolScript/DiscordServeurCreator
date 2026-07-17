const client = require('../client');
const guildConfigStore = require('../../kv/guildConfigStore');
const logger = require('../../shared/logger');

// Kick automatique des membres seuls en vocal apres N minutes (roadmap
// n°388) : suivi en memoire de "depuis quand ce membre est seul dans son
// salon", verifie a chaque tick. Reinitialise des qu'il n'est plus seul.
const TICK_MS = 60_000;
const aloneSince = new Map(); // `${guildId}:${channelId}:${userId}` -> timestamp

async function tick() {
  for (const guild of client.guilds.cache.values()) {
    // eslint-disable-next-line no-await-in-loop
    const config = await guildConfigStore.find(guild.id).catch(() => null);
    const minutes = config?.voiceAfkKickMinutes;
    if (!minutes || minutes <= 0) continue;
    const thresholdMs = minutes * 60_000;
    const now = Date.now();

    for (const channel of guild.channels.cache.values()) {
      if (channel.type !== 2 || !channel.members) continue; // 2 = GuildVoice
      const humans = [...channel.members.values()].filter((m) => !m.user.bot);
      for (const member of humans) {
        const trackKey = `${guild.id}:${channel.id}:${member.id}`;
        const isAlone = humans.length === 1;
        if (!isAlone) { aloneSince.delete(trackKey); continue; }
        if (!aloneSince.has(trackKey)) { aloneSince.set(trackKey, now); continue; }
        if (now - aloneSince.get(trackKey) >= thresholdMs) {
          aloneSince.delete(trackKey);
          // eslint-disable-next-line no-await-in-loop
          member.voice.disconnect(`Seul en vocal depuis plus de ${minutes} min (automatique)`).catch((err) => logger.error('voiceAfkKick.disconnect', err));
        }
      }
    }
  }
}

function start() {
  setInterval(() => { tick().catch((err) => logger.error('voiceAfkKick.tick', err)); }, TICK_MS);
  logger.info('Kick automatique vocal (membres seuls) demarre');
}

module.exports = { start };
