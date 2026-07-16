const { EmbedBuilder } = require('discord.js');
const guildConfigStore = require('../../kv/guildConfigStore');
const { kvGet, kvPut } = require('../../kv/cloudflareKv');
const logger = require('../../shared/logger');

// Starboard (roadmap n°090) : les messages qui atteignent N reactions ⭐
// sont republies dans le salon configure (starboardChannelId, carte
// "Hall of fame" du createur). Chaque message n'est reposte qu'une fois.

const DEFAULT_THRESHOLD = 4;
const key = (guildId) => `guild:${guildId}:starboard`;

async function alreadyPosted(guildId, messageId) {
  const posted = (await kvGet(key(guildId))) ?? [];
  return posted.includes(messageId);
}

async function markPosted(guildId, messageId) {
  const posted = (await kvGet(key(guildId))) ?? [];
  posted.push(messageId);
  // Cap : garde les 300 derniers, largement assez pour eviter les doublons.
  await kvPut(key(guildId), posted.slice(-300));
}

async function handleReactionAdd(reaction, user) {
  try {
    if (user?.bot) return;
    if (reaction.partial) await reaction.fetch();
    if (reaction.emoji.name !== '⭐') return;
    const message = reaction.message.partial ? await reaction.message.fetch() : reaction.message;
    if (!message.guild || message.author?.bot) return;

    const config = await guildConfigStore.find(message.guild.id);
    if (!config?.starboardChannelId) return;
    if (message.channel.id === config.starboardChannelId) return;
    const threshold = config.starboardThreshold ?? DEFAULT_THRESHOLD;
    if (reaction.count < threshold) return;
    if (await alreadyPosted(message.guild.id, message.id)) return;

    const starboardChannel = await message.guild.channels.fetch(config.starboardChannelId).catch(() => null);
    if (!starboardChannel) return;

    await markPosted(message.guild.id, message.id);

    const embed = new EmbedBuilder()
      .setAuthor({ name: message.author.username, iconURL: message.author.displayAvatarURL() })
      .setDescription(`${(message.content || '').slice(0, 1500) || '*(message sans texte)*'}\n\n[Aller au message](${message.url})`)
      .setColor(0xfee75c)
      .setFooter({ text: `⭐ ${reaction.count} · #${message.channel.name}` })
      .setTimestamp(message.createdAt);
    const image = message.attachments.find((a) => a.contentType?.startsWith('image/'));
    if (image) embed.setImage(image.url);

    await starboardChannel.send({ embeds: [embed] });
  } catch (err) {
    logger.error('starboardManager.handleReactionAdd', err);
  }
}

module.exports = { handleReactionAdd };
