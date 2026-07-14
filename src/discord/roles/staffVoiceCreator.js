const { ChannelType, PermissionFlagsBits: P } = require('discord.js');
const guildConfigStore = require('../../kv/guildConfigStore');
const { toggleOnlyOverwrites } = require('./staffCategory');
const logger = require('../../shared/logger');

const guildQueues = new Map();
function enqueue(guildId, task) {
  const previous = guildQueues.get(guildId) || Promise.resolve();
  const next = previous.then(task, task);
  guildQueues.set(guildId, next.catch(() => {}));
  return next;
}

// Cree/supprime le salon declencheur "Creer un vocal" (categorie Staff) selon
// qu'au moins un membre du staff est actuellement en service. Appele par
// staffVoiceManager juste apres avoir bascule le role Staff Actif.
async function syncCreatorChannel(guild) {
  const config = await guildConfigStore.find(guild.id);
  if (!config?.staffActifRoleId || !config.staffCategoryId) return;

  const onDuty = guild.members.cache.filter((m) => m.roles.cache.has(config.staffActifRoleId)).size;
  const existing = config.staffVoiceCreatorChannelId
    ? await guild.channels.fetch(config.staffVoiceCreatorChannelId).catch(() => null)
    : null;

  try {
    if (onDuty > 0 && !existing) {
      const channel = await guild.channels.create({
        name: '➕ Creer un vocal',
        type: ChannelType.GuildVoice,
        parent: config.staffCategoryId,
        permissionOverwrites: toggleOnlyOverwrites(guild, config.staffActifRoleId, [P.Connect, P.Speak]),
      });
      await guildConfigStore.upsert(guild.id, { staffVoiceCreatorChannelId: channel.id });
    } else if (onDuty === 0 && existing) {
      await existing.delete().catch(() => {});
      await guildConfigStore.upsert(guild.id, { staffVoiceCreatorChannelId: null });
    }
  } catch (err) {
    logger.error('staffVoiceCreator.syncCreatorChannel', err);
  }
}

// Rejoindre "Creer un vocal" genere un salon vocal temporaire dedie et y
// deplace le membre ; ce salon est supprime des qu'il se vide (meme logique
// que publicVoiceManager pour les vocaux publics).
async function handleVoiceStateUpdate(oldState, newState) {
  const guild = newState.guild ?? oldState.guild;
  const config = await guildConfigStore.find(guild.id);
  if (!config?.staffCategoryId) return;

  await enqueue(guild.id, async () => {
    if (oldState.channelId && oldState.channelId !== config.staffVoiceCreatorChannelId
      && oldState.channelId !== config.serviceStaffChannelId) {
      const channel = await guild.channels.fetch(oldState.channelId).catch(() => null);
      if (channel && channel.parentId === config.staffCategoryId && channel.type === 2 && channel.members.size === 0) {
        await channel.delete().catch(() => {});
      }
    }

    if (newState.channelId && newState.channelId === config.staffVoiceCreatorChannelId && newState.member) {
      const room = await guild.channels.create({
        name: `Vocal de ${newState.member.displayName}`.slice(0, 100),
        type: ChannelType.GuildVoice,
        parent: config.staffCategoryId,
        permissionOverwrites: toggleOnlyOverwrites(guild, config.staffActifRoleId, [P.Connect, P.Speak]),
      });
      await newState.member.voice.setChannel(room.id).catch(() => {});
    }
  });
}

module.exports = { syncCreatorChannel, handleVoiceStateUpdate };
