const { ChannelType } = require('discord.js');
const guildConfigStore = require('../../kv/guildConfigStore');
const logger = require('../../shared/logger');

// Rejoindre "Creer un vocal" (categorie Jeux) genere un salon vocal personnel
// dedie et y deplace le membre ; supprime des qu'il se vide (meme logique que
// staffVoiceCreator.js et publicVoiceManager.js).
async function handleVoiceStateUpdate(oldState, newState) {
  const guild = newState.guild ?? oldState.guild;
  const config = await guildConfigStore.find(guild.id);
  if (!config?.gamesCategoryId || !config.gameVoiceCreatorChannelId) return;

  try {
    if (oldState.channelId && oldState.channelId !== config.gameVoiceCreatorChannelId) {
      const channel = await guild.channels.fetch(oldState.channelId).catch(() => null);
      if (channel && channel.parentId === config.gamesCategoryId && channel.type === ChannelType.GuildVoice && channel.members.size === 0) {
        await channel.delete().catch(() => {});
      }
    }

    if (newState.channelId === config.gameVoiceCreatorChannelId && newState.member) {
      const room = await guild.channels.create({
        name: `🎮 Vocal de ${newState.member.displayName}`.slice(0, 100),
        type: ChannelType.GuildVoice,
        parent: config.gamesCategoryId,
      });
      await newState.member.voice.setChannel(room.id).catch(() => {});
    }
  } catch (err) {
    logger.error('gameVoiceCreator.handleVoiceStateUpdate', err);
  }
}

module.exports = { handleVoiceStateUpdate };
