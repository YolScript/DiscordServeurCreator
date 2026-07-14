const { ChannelType, PermissionFlagsBits: P } = require('discord.js');
const guildConfigStore = require('../../kv/guildConfigStore');
const publicVoiceStore = require('../../kv/publicVoiceStore');
const logger = require('../../shared/logger');

// File sequentielle par guilde : evite les creations/suppressions concurrentes
// quand plusieurs membres rejoignent/quittent en meme temps.
const guildQueues = new Map();
function enqueue(guildId, task) {
  const previous = guildQueues.get(guildId) || Promise.resolve();
  const next = previous.then(task, task);
  guildQueues.set(guildId, next.catch(() => {}));
  return next;
}

function publicVoicePermissionOverwrites(guild, config) {
  return [
    { id: guild.roles.everyone.id, deny: [P.ViewChannel, P.Connect] },
    { id: config.reglementValidatedRoleId, allow: [P.ViewChannel, P.Connect, P.Speak] },
  ];
}

async function handleVoiceStateUpdate(oldState, newState) {
  const guild = newState.guild ?? oldState.guild;
  const config = await guildConfigStore.find(guild.id);
  if (!config?.publicVoiceBaseChannelIds?.length || !config.vocauxCategoryId) return;

  await enqueue(guild.id, async () => {
    const state = await publicVoiceStore.get(guild.id);
    const allPublicIds = [...config.publicVoiceBaseChannelIds, ...state.spawnedChannelIds];

    // Nettoyage : un salon public genere dynamiquement qui vient de se vider.
    if (oldState.channelId && state.spawnedChannelIds.includes(oldState.channelId)) {
      const channel = await guild.channels.fetch(oldState.channelId).catch(() => null);
      if (channel && channel.members.size === 0) {
        await channel.delete().catch(() => {});
        state.spawnedChannelIds = state.spawnedChannelIds.filter((id) => id !== oldState.channelId);
        await publicVoiceStore.set(guild.id, state);
        return;
      }
    }

    // Debordement : tous les salons publics sont occupes -> on en cree un de plus.
    if (newState.channelId && allPublicIds.includes(newState.channelId)) {
      const channels = await Promise.all(allPublicIds.map((id) => guild.channels.fetch(id).catch(() => null)));
      const allFull = channels.every((c) => c && c.members.size > 0);
      if (allFull) {
        const room = await guild.channels.create({
          name: `Vocal Public ${allPublicIds.length + 1}`,
          type: ChannelType.GuildVoice,
          parent: config.vocauxCategoryId,
          permissionOverwrites: publicVoicePermissionOverwrites(guild, config),
        });
        state.spawnedChannelIds.push(room.id);
        await publicVoiceStore.set(guild.id, state);
        logger.info(`Vocal public supplementaire cree sur ${guild.id}`);
      }
    }
  });
}

module.exports = { handleVoiceStateUpdate };
