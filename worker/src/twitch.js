// Sync des abonnes Twitch (roadmap n°098) : le streamer connecte son compte
// via OAuth (scope channel:read:subscriptions), le worker stocke les tokens
// dans une cle KV dediee (JAMAIS dans la config du serveur, qui est renvoyee
// aux admins ET aux viewers en lecture seule du dashboard), puis synchronise
// la liste des abonnes a la demande et via le cron quotidien.

import { HttpError } from './errors.js';
import { getGuildConfig, putGuildConfig } from './kvStore.js';

const authKey = (guildId) => `guild:${guildId}:twitchauth`;
const subsKey = (guildId) => `guild:${guildId}:twitchsubs`;
const stateKey = (state) => `twitchstate:${state}`;

function redirectUri(request) {
  return `${new URL(request.url).origin}/twitch/callback`;
}

function requireTwitchApp(env) {
  if (!env.TWITCH_CLIENT_ID || !env.TWITCH_CLIENT_SECRET) {
    throw new HttpError(500, 'Application Twitch non configuree cote worker (TWITCH_CLIENT_ID / TWITCH_CLIENT_SECRET).');
  }
}

// Etape 1 : redirige vers l'ecran d'autorisation Twitch. Le state (UUID en
// KV, TTL 10 min) porte le guildId et empeche le CSRF sur le callback.
export async function twitchLoginRedirect(env, request, guildId) {
  requireTwitchApp(env);
  const state = crypto.randomUUID().replace(/-/g, '');
  await env.GUILD_KV.put(stateKey(state), JSON.stringify({ guildId }), { expirationTtl: 600 });
  const params = new URLSearchParams({
    client_id: env.TWITCH_CLIENT_ID,
    redirect_uri: redirectUri(request),
    response_type: 'code',
    scope: 'channel:read:subscriptions',
    state,
    force_verify: 'true',
  });
  return Response.redirect(`https://id.twitch.tv/oauth2/authorize?${params}`, 302);
}

async function exchangeToken(env, request, params) {
  const res = await fetch('https://id.twitch.tv/oauth2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: env.TWITCH_CLIENT_ID,
      client_secret: env.TWITCH_CLIENT_SECRET,
      ...(request ? { redirect_uri: redirectUri(request) } : {}),
      ...params,
    }),
  });
  if (!res.ok) throw new HttpError(502, `Twitch a refuse l'echange de token (${res.status}).`);
  return res.json();
}

// Etape 2 : callback Twitch — valide le state, echange le code, identifie le
// broadcaster, stocke les tokens et lance une premiere sync.
export async function handleTwitchCallback(env, request) {
  requireTwitchApp(env);
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  if (!code || !state) throw new HttpError(400, 'Parametres code/state manquants.');

  const stateData = await env.GUILD_KV.get(stateKey(state), 'json');
  if (!stateData?.guildId) throw new HttpError(403, 'State invalide ou expire. Relance la connexion Twitch depuis le dashboard.');
  await env.GUILD_KV.delete(stateKey(state));
  const { guildId } = stateData;

  const token = await exchangeToken(env, request, { grant_type: 'authorization_code', code });

  const userRes = await fetch('https://api.twitch.tv/helix/users', {
    headers: { 'Client-Id': env.TWITCH_CLIENT_ID, Authorization: `Bearer ${token.access_token}` },
  });
  if (!userRes.ok) throw new HttpError(502, 'Impossible de lire le compte Twitch connecte.');
  const broadcaster = (await userRes.json()).data?.[0];
  if (!broadcaster) throw new HttpError(502, 'Compte Twitch introuvable.');

  await env.GUILD_KV.put(authKey(guildId), JSON.stringify({
    broadcasterId: broadcaster.id,
    login: broadcaster.login,
    displayName: broadcaster.display_name,
    accessToken: token.access_token,
    refreshToken: token.refresh_token,
    expiresAt: Date.now() + (token.expires_in - 60) * 1000,
  }));

  // Seul le login (public) va dans la config lue par le dashboard.
  const config = (await getGuildConfig(env, guildId)) || {};
  await putGuildConfig(env, guildId, { ...config, twitchBroadcasterLogin: broadcaster.login });

  await syncTwitchSubs(env, guildId).catch(() => { /* premiere sync best-effort */ });

  return Response.redirect(env.FRONTEND_REDIRECT_URL, 302);
}

async function getFreshAuth(env, guildId) {
  const auth = await env.GUILD_KV.get(authKey(guildId), 'json');
  if (!auth) throw new HttpError(400, 'Aucun compte Twitch connecte pour ce serveur.');
  if (auth.expiresAt > Date.now()) return auth;

  const token = await exchangeToken(env, null, { grant_type: 'refresh_token', refresh_token: auth.refreshToken });
  const refreshed = {
    ...auth,
    accessToken: token.access_token,
    refreshToken: token.refresh_token || auth.refreshToken,
    expiresAt: Date.now() + (token.expires_in - 60) * 1000,
  };
  await env.GUILD_KV.put(authKey(guildId), JSON.stringify(refreshed));
  return refreshed;
}

// Recupere la liste complete des abonnes (paginee par 100) et l'ecrit en KV.
export async function syncTwitchSubs(env, guildId) {
  requireTwitchApp(env);
  const auth = await getFreshAuth(env, guildId);

  const subs = [];
  let total = 0;
  let cursor = null;
  for (let page = 0; page < 10; page += 1) {
    const params = new URLSearchParams({ broadcaster_id: auth.broadcasterId, first: '100' });
    if (cursor) params.set('after', cursor);
    // eslint-disable-next-line no-await-in-loop
    const res = await fetch(`https://api.twitch.tv/helix/subscriptions?${params}`, {
      headers: { 'Client-Id': env.TWITCH_CLIENT_ID, Authorization: `Bearer ${auth.accessToken}` },
    });
    if (res.status === 401) throw new HttpError(502, 'Token Twitch refuse. Reconnecte le compte depuis le dashboard.');
    // eslint-disable-next-line no-await-in-loop
    if (!res.ok) throw new HttpError(502, `Twitch a refuse la lecture des abonnes (${res.status}).`);
    // eslint-disable-next-line no-await-in-loop
    const data = await res.json();
    total = data.total ?? subs.length;
    for (const s of data.data || []) {
      subs.push({ name: s.user_name, tier: Math.floor(Number(s.tier) / 1000) || 1, isGift: Boolean(s.is_gift) });
    }
    cursor = data.pagination?.cursor;
    if (!cursor) break;
  }

  const payload = {
    syncedAt: Date.now(),
    broadcasterLogin: auth.login,
    total,
    subs: subs.slice(0, 500),
  };
  await env.GUILD_KV.put(subsKey(guildId), JSON.stringify(payload));
  return payload;
}

export async function getTwitchSubs(env, guildId) {
  return (await env.GUILD_KV.get(subsKey(guildId), 'json')) || null;
}

export async function disconnectTwitch(env, guildId) {
  await env.GUILD_KV.delete(authKey(guildId));
  await env.GUILD_KV.delete(subsKey(guildId));
  const config = (await getGuildConfig(env, guildId)) || {};
  delete config.twitchBroadcasterLogin;
  await putGuildConfig(env, guildId, config);
}

// Sync quotidienne (cron 4h) pour tous les serveurs ayant un compte lie.
export async function syncAllTwitchSubs(env) {
  if (!env.TWITCH_CLIENT_ID || !env.TWITCH_CLIENT_SECRET) return;
  let cursor;
  do {
    // eslint-disable-next-line no-await-in-loop
    const page = await env.GUILD_KV.list({ prefix: 'guild:', cursor });
    for (const key of page.keys) {
      if (!key.name.endsWith(':twitchauth')) continue;
      const guildId = key.name.split(':')[1];
      // eslint-disable-next-line no-await-in-loop
      await syncTwitchSubs(env, guildId).catch((err) => console.error(`syncTwitchSubs ${guildId}`, err));
    }
    cursor = page.list_complete ? null : page.cursor;
  } while (cursor);
}
