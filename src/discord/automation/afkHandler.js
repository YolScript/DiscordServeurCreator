const afkStore = require('../../kv/afkStore');
const logger = require('../../shared/logger');

// Gestion AFK (roadmap n°373) : leve automatiquement le statut au premier
// message de la personne revenue, et repond aux mentions pendant l'absence.
async function handleMessage(message) {
  if (!message.guild || message.author.bot) return;
  try {
    const cleared = await afkStore.clear(message.guild.id, message.author.id);
    if (cleared) {
      await message.channel.send(`👋 <@${message.author.id}> n'est plus AFK (etait absent depuis <t:${Math.floor(cleared.since / 1000)}:R>).`).catch(() => {});
    }

    if (message.mentions.users.size) {
      const entries = await afkStore.all(message.guild.id);
      const afkMentions = [...message.mentions.users.values()].filter((u) => entries[u.id]);
      for (const u of afkMentions) {
        // eslint-disable-next-line no-await-in-loop
        await message.reply(`😴 <@${u.id}> est AFK : ${entries[u.id].reason}`).catch(() => {});
      }
    }
  } catch (err) {
    logger.error('afkHandler.handleMessage', err);
  }
}

module.exports = { handleMessage };
