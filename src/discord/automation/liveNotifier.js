const client = require('../client');
const env = require('../../config/env');
const guildConfigStore = require('../../kv/guildConfigStore');
const streamerLinkStore = require('../../kv/streamerLinkStore');
const logger = require('../../shared/logger');

const TICK_MS = 120_000; // 2 min pour Twitch
let youtubeTickCounter = 0;
let twitchTokenCache = null;

async function getTwitchToken() {
  if (!env.twitch.clientId || !env.twitch.clientSecret) return null;
  if (twitchTokenCache && twitchTokenCache.expiresAt > Date.now()) return twitchTokenCache.token;

  const res = await fetch('https://id.twitch.tv/oauth2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: env.twitch.clientId, client_secret: env.twitch.clientSecret, grant_type: 'client_credentials',
    }),
  });
  if (!res.ok) return null;
  const data = await res.json();
  twitchTokenCache = { token: data.access_token, expiresAt: Date.now() + (data.expires_in - 60) * 1000 };
  return twitchTokenCache.token;
}

async function isTwitchLive(login) {
  const token = await getTwitchToken();
  if (!token) return null;
  const res = await fetch(`https://api.twitch.tv/helix/streams?user_login=${encodeURIComponent(login)}`, {
    headers: { 'Client-Id': env.twitch.clientId, Authorization: `Bearer ${token}` },
  });
  if (!res.ok) return null;
  const data = await res.json();
  return data.data.length > 0;
}

// L'API YouTube Data (search.list) coute 100 unites de quota par appel sur un
// budget par defaut de 10 000/jour : on ne verifie YouTube qu'un tick sur 3
// pour rester raisonnable si plusieurs streamers sont lies.
async function isYoutubeLive(channelId) {
  if (!env.youtube.apiKey) return null;
  const url = `https://www.googleapis.com/youtube/v3/search?part=snippet&channelId=${encodeURIComponent(channelId)}&eventType=live&type=video&key=${env.youtube.apiKey}`;
  const res = await fetch(url);
  if (!res.ok) return null;
  const data = await res.json();
  return (data.items ?? []).length > 0;
}

// Nouvelles videos YouTube (roadmap n°097) via le flux RSS public du
// channel : AUCUNE cle API requise, contrairement a la detection de live.
async function latestYoutubeVideo(channelId) {
  const res = await fetch(`https://www.youtube.com/feeds/videos.xml?channel_id=${encodeURIComponent(channelId)}`);
  if (!res.ok) return null;
  const xml = await res.text();
  const entry = xml.match(/<entry>([\s\S]*?)<\/entry>/);
  if (!entry) return null;
  const videoId = entry[1].match(/<yt:videoId>([^<]+)<\/yt:videoId>/)?.[1];
  const title = entry[1].match(/<title>([^<]+)<\/title>/)?.[1] || 'Nouvelle video';
  if (!videoId) return null;
  return {
    videoId,
    title: title.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'"),
  };
}

async function announceNewVideo(guild, config, streamer, video) {
  const channelId = config.announceChannelId || config.arrivalDepartureChannelId;
  if (!channelId) return;
  const channel = await guild.channels.fetch(channelId).catch(() => null);
  if (!channel) return;
  await channel.send(`📺 Nouvelle video de <@${streamer.discordUserId}> : **${video.title}**\nhttps://youtu.be/${video.videoId}`).catch(() => {});
}

async function ensureLiveRole(guild, config) {
  if (config?.liveRoleId) {
    const existing = await guild.roles.fetch(config.liveRoleId).catch(() => null);
    if (existing) return existing;
  }
  const role = await guild.roles.create({
    name: '🔴 En Live', color: 0xff3355, hoist: true, mentionable: false,
  });
  await guildConfigStore.upsert(guild.id, { liveRoleId: role.id });
  return role;
}

async function announceLive(guild, config, streamer) {
  const role = await ensureLiveRole(guild, config);
  const member = await guild.members.fetch(streamer.discordUserId).catch(() => null);
  if (member) await member.roles.add(role.id).catch(() => {});

  if (!config.arrivalDepartureChannelId) return;
  const channel = await guild.channels.fetch(config.arrivalDepartureChannelId).catch(() => null);
  if (!channel) return;

  const url = streamer.platform === 'twitch'
    ? `https://twitch.tv/${streamer.identifier}`
    : `https://youtube.com/channel/${streamer.identifier}/live`;
  const label = streamer.platform === 'twitch' ? 'Twitch' : 'YouTube';
  await channel.send(`🔴 <@${streamer.discordUserId}> est en live sur ${label} ! ${url}`).catch(() => {});
}

async function clearLive(guild, config, streamer) {
  if (!config.liveRoleId) return;
  const member = await guild.members.fetch(streamer.discordUserId).catch(() => null);
  if (member) await member.roles.remove(config.liveRoleId).catch(() => {});
}

async function tick() {
  youtubeTickCounter += 1;
  const checkYoutube = youtubeTickCounter % 3 === 0;

  for (const guild of client.guilds.cache.values()) {
    const streamers = await streamerLinkStore.list(guild.id);
    if (streamers.length === 0) continue;
    const config = await guildConfigStore.find(guild.id);
    if (!config) continue;

    let changed = false;
    for (const streamer of streamers) {
      if (streamer.platform === 'youtube' && !checkYoutube) continue;

      // Nouvelles videos YouTube (RSS, sans cle). La premiere verification
      // memorise l'etat sans annoncer (evite de spammer la derniere video
      // deja publiee au moment du lien).
      if (streamer.platform === 'youtube') {
        try {
          const video = await latestYoutubeVideo(streamer.identifier);
          if (video && video.videoId !== streamer.lastVideoId) {
            const isFirstCheck = !streamer.lastVideoId;
            streamer.lastVideoId = video.videoId;
            changed = true;
            if (!isFirstCheck) await announceNewVideo(guild, config, streamer, video);
          }
        } catch (err) {
          logger.error('liveNotifier.youtubeRss', err);
        }
      }

      let live;
      try {
        live = streamer.platform === 'twitch'
          ? await isTwitchLive(streamer.identifier)
          : await isYoutubeLive(streamer.identifier);
      } catch (err) {
        logger.error('liveNotifier.check', err);
        continue;
      }
      if (live === null) continue;

      if (live && !streamer.isLive) {
        streamer.isLive = true;
        changed = true;
        await announceLive(guild, config, streamer);
      } else if (!live && streamer.isLive) {
        streamer.isLive = false;
        changed = true;
        await clearLive(guild, config, streamer);
      }
    }
    if (changed) await streamerLinkStore.replaceAll(guild.id, streamers);
  }
}

function start() {
  // Demarre toujours : les nouvelles videos YouTube passent par le RSS
  // public (aucune cle requise) ; les checks live sans cle renvoient null
  // et sont simplement ignores.
  if (!env.twitch.clientId && !env.youtube.apiKey) {
    logger.info('liveNotifier: pas de cle Twitch/YouTube — seules les nouvelles videos YouTube (RSS) seront annoncees.');
  }
  setInterval(() => { tick().catch((err) => logger.error('liveNotifier.tick', err)); }, TICK_MS);
  logger.info('liveNotifier demarre');
}

module.exports = { start };
