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
      const roleId = config?.birthdayRoleId;

      // Role anniversaire (roadmap n°314) : retire le role de la veille avant
      // de traiter le nouveau jour, meme si aucun salon n'est configure.
      if (roleId && config?.birthdayRoleActiveUserIds?.length) {
        for (const uid of config.birthdayRoleActiveUserIds) {
          // eslint-disable-next-line no-await-in-loop
          const member = await guild.members.fetch(uid).catch(() => null);
          // eslint-disable-next-line no-await-in-loop
          await member?.roles.remove(roleId).catch(() => {});
        }
        await guildConfigStore.upsert(guild.id, { birthdayRoleActiveUserIds: [] }).catch(() => {});
      }

      if (!channelId && !roleId) continue;

      const [month, day] = today.split('-').map(Number);
      const birthdays = await birthdayStore.list(guild.id);
      const todayBirthdays = birthdays.filter((b) => b.month === month && b.day === day);
      lastAnnouncedDate.set(guild.id, today);
      if (!todayBirthdays.length) continue;

      if (roleId) {
        const activeIds = [];
        for (const b of todayBirthdays) {
          // eslint-disable-next-line no-await-in-loop
          const member = await guild.members.fetch(b.userId).catch(() => null);
          if (member) {
            // eslint-disable-next-line no-await-in-loop
            await member.roles.add(roleId).catch(() => {});
            activeIds.push(b.userId);
          }
        }
        await guildConfigStore.upsert(guild.id, { birthdayRoleActiveUserIds: activeIds }).catch(() => {});
      }

      if (channelId) {
        const channel = await guild.channels.fetch(channelId).catch(() => null);
        await channel?.send(`🎂 Joyeux anniversaire ${todayBirthdays.map((b) => `<@${b.userId}>`).join(', ')} !`).catch(() => {});
      }
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
