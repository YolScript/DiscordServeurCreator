const client = require('../client');
const birthdayStore = require('../../kv/birthdayStore');
const guildConfigStore = require('../../kv/guildConfigStore');
const logger = require('../../shared/logger');

const TICK_MS = 60 * 60 * 1000; // verifie le changement de jour toutes les heures
const lastAnnouncedDate = new Map(); // guildId -> 'MM-DD' deja annonce

function todayKey() {
  const now = new Date();
  return `${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

async function tick() {
  const today = todayKey();
  for (const guild of client.guilds.cache.values()) {
    if (lastAnnouncedDate.get(guild.id) === today) continue;
    try {
      const config = await guildConfigStore.find(guild.id);
      const channelId = config?.birthdayChannelId || config?.arrivalDepartureChannelId;
      if (!channelId) continue;

      const [month, day] = today.split('-').map(Number);
      const birthdays = await birthdayStore.list(guild.id);
      const todayBirthdays = birthdays.filter((b) => b.month === month && b.day === day);
      lastAnnouncedDate.set(guild.id, today);
      if (!todayBirthdays.length) continue;

      const channel = await guild.channels.fetch(channelId).catch(() => null);
      if (!channel) continue;
      await channel.send(`🎂 Joyeux anniversaire ${todayBirthdays.map((b) => `<@${b.userId}>`).join(', ')} !`).catch(() => {});
    } catch (err) {
      logger.error('birthdayAnnouncer.tick', err);
    }
  }
}

function start() {
  tick().catch((err) => logger.error('birthdayAnnouncer.tick initial', err));
  setInterval(() => { tick().catch((err) => logger.error('birthdayAnnouncer.tick', err)); }, TICK_MS);
  logger.info('Annonces d\'anniversaire demarrees');
}

module.exports = { start };
