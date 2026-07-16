const { ChannelType } = require('discord.js');
const { kvPut } = require('../../kv/cloudflareKv');
const logger = require('../../shared/logger');

// Occupation des salons vocaux (roadmap n°019) : recalculee a chaque
// evenement vocal, ecrite en KV avec un debounce de 15 s par guilde pour
// que le dashboard affiche "N en vocal" sans marteler le stockage.
const pendingWrites = new Map(); // guildId -> timeout

function scheduleWrite(guild) {
  if (pendingWrites.has(guild.id)) return;
  pendingWrites.set(guild.id, setTimeout(async () => {
    pendingWrites.delete(guild.id);
    try {
      const occupancy = {};
      for (const channel of guild.channels.cache.values()) {
        if (channel.type !== ChannelType.GuildVoice || !channel.members) continue;
        const count = channel.members.filter((m) => !m.user.bot).size;
        if (count > 0) occupancy[channel.id] = count;
      }
      await kvPut(`guild:${guild.id}:voiceoccupancy`, occupancy);
    } catch (err) {
      logger.error('voiceOccupancy.write', err);
    }
  }, 15_000));
}

function handleVoiceStateUpdate(oldState, newState) {
  const guild = newState?.guild || oldState?.guild;
  if (guild) scheduleWrite(guild);
}

module.exports = { handleVoiceStateUpdate };
