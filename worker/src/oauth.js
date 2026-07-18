import { parseCookies, randomId, createSession, updateSession, sessionCookie } from './session.js';
import { HttpError } from './errors.js';

const DISCORD_API = 'https://discord.com/api/v10';

export async function handleLogin(request, env) {
  const state = randomId(16);
  const authorizeUrl = new URL(`${DISCORD_API}/oauth2/authorize`);
  authorizeUrl.searchParams.set('client_id', env.DISCORD_CLIENT_ID);
  authorizeUrl.searchParams.set('redirect_uri', env.OAUTH_REDIRECT_URI);
  authorizeUrl.searchParams.set('response_type', 'code');
  authorizeUrl.searchParams.set('scope', 'identify guilds');
  authorizeUrl.searchParams.set('state', state);

  return new Response(null, {
    status: 302,
    headers: {
      Location: authorizeUrl.toString(),
      'Set-Cookie': `oauth_state=${state}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=600`,
    },
  });
}

export async function handleCallback(request, env) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const cookies = parseCookies(request);

  if (url.searchParams.get('error')) {
    return new Response('Autorisation Discord refusee ou annulee. Tu peux fermer cette page et reessayer depuis le dashboard.', { status: 400 });
  }
  if (!code || !state || state !== cookies.oauth_state) {
    return new Response('Etat OAuth2 invalide ou expire, reessaie de te connecter.', { status: 400 });
  }

  const tokenRes = await fetch(`${DISCORD_API}/oauth2/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: env.DISCORD_CLIENT_ID,
      client_secret: env.DISCORD_CLIENT_SECRET,
      grant_type: 'authorization_code',
      code,
      redirect_uri: env.OAUTH_REDIRECT_URI,
    }),
  });
  if (!tokenRes.ok) return new Response('Echange de token Discord echoue.', { status: 502 });
  const tokens = await tokenRes.json();

  const userRes = await fetch(`${DISCORD_API}/users/@me`, {
    headers: { Authorization: `Bearer ${tokens.access_token}` },
  });
  if (!userRes.ok) return new Response('Recuperation du profil Discord echouee.', { status: 502 });
  const discordUser = await userRes.json();

  const sessionId = await createSession(env, {
    userId: discordUser.id,
    username: discordUser.global_name || discordUser.username,
    avatar: discordUser.avatar,
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token,
    expiresAt: Date.now() + tokens.expires_in * 1000,
  });

  // Journal des connexions (roadmap n°059) : trace la connexion dans chaque
  // serveur ou l'utilisateur est admin. Dedoublonne a 12 h pres pour ne pas
  // remplir le journal a chaque visite. Jamais bloquant pour le login.
  try {
    await recordDashboardLogins(env, tokens.access_token, discordUser);
  } catch (err) {
    console.error('journal connexions echoue', err);
  }

  return new Response(null, {
    status: 302,
    headers: {
      Location: env.FRONTEND_REDIRECT_URL,
      'Set-Cookie': sessionCookie(sessionId),
    },
  });
}

async function recordDashboardLogins(env, accessToken, discordUser) {
  const res = await fetch(`${DISCORD_API}/users/@me/guilds`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) return;
  const guilds = await res.json();
  const adminGuildIds = guilds.filter((g) => (BigInt(g.permissions) & 8n) === 8n).map((g) => g.id);
  const now = Date.now();
  const username = discordUser.global_name || discordUser.username;
  for (const gid of adminGuildIds) {
    const key = `guild:${gid}:logins`;
    // eslint-disable-next-line no-await-in-loop
    const logins = (await env.GUILD_KV.get(key, 'json')) || [];
    const last = logins.findLast?.((l) => l.userId === discordUser.id) || [...logins].reverse().find((l) => l.userId === discordUser.id);
    if (last && now - last.at < 12 * 3600000) continue;
    logins.push({ userId: discordUser.id, username, at: now });
    // eslint-disable-next-line no-await-in-loop
    await env.GUILD_KV.put(key, JSON.stringify(logins.slice(-50)));
  }
}

export async function refreshTokenIfNeeded(env, session) {
  if (Date.now() < session.expiresAt - 60_000) return session;

  const res = await fetch(`${DISCORD_API}/oauth2/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: env.DISCORD_CLIENT_ID,
      client_secret: env.DISCORD_CLIENT_SECRET,
      grant_type: 'refresh_token',
      refresh_token: session.refreshToken,
    }),
  });
  if (!res.ok) return session; // le prochain appel API echouera et forcera un nouveau login

  const tokens = await res.json();
  const updated = {
    ...session,
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token,
    expiresAt: Date.now() + tokens.expires_in * 1000,
  };
  await updateSession(env, session.sessionId, updated);
  return updated;
}

// Retourne {id, name, icon} pour les guildes ou l'utilisateur a la permission
// Administrator (cache 60s en KV pour eviter de marteler l'API Discord — 60s
// est le TTL minimum accepte par Cloudflare KV, en dessous ca renvoie 400).
// Cache en MEMOIRE d'isolate (et plus en KV) : le KV gratuit est limite a
// 1000 put()/jour et ce cache 60 s en consommait un par visite — il a
// participe a l'epuisement du quota qui rendait tout le dashboard en
// "Erreur interne.". La memoire d'isolate suffit largement pour 60 s.
const adminGuildsMemCache = new Map(); // userId -> { data, expires }

export async function getUserAdminGuilds(env, session) {
  const cached = adminGuildsMemCache.get(session.userId);
  if (cached && cached.expires > Date.now()) return cached.data;

  const res = await fetch(`${DISCORD_API}/users/@me/guilds`, {
    headers: { Authorization: `Bearer ${session.accessToken}` },
  });
  // Ne JAMAIS confondre echec et liste vide : un token expire (401) ou un
  // rate-limit Discord (429) renvoyait [] et le dashboard affichait
  // "Aucun serveur trouve" a la place d'une erreur exploitable.
  if (res.status === 401) throw new HttpError(401, 'Session Discord expiree, reconnecte-toi.');
  if (!res.ok) throw new HttpError(502, `Discord ne repond pas (code ${res.status}), reessaie dans quelques secondes.`);
  const guilds = await res.json();
  const adminGuilds = guilds
    .filter((g) => (BigInt(g.permissions) & 8n) === 8n) // 8 = Administrator
    .map((g) => ({ id: g.id, name: g.name, icon: g.icon }));

  adminGuildsMemCache.set(session.userId, { data: adminGuilds, expires: Date.now() + 60000 });
  return adminGuilds;
}

export async function getUserAdminGuildIds(env, session) {
  return (await getUserAdminGuilds(env, session)).map((g) => g.id);
}
