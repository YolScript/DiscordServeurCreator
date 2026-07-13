import { parseCookies, randomId, createSession, updateSession, sessionCookie } from './session.js';

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
    username: discordUser.username,
    avatar: discordUser.avatar,
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token,
    expiresAt: Date.now() + tokens.expires_in * 1000,
  });

  return new Response(null, {
    status: 302,
    headers: {
      Location: env.FRONTEND_REDIRECT_URL,
      'Set-Cookie': sessionCookie(sessionId),
    },
  });
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
export async function getUserAdminGuilds(env, session) {
  const cacheKey = `admin_guilds:${session.userId}`;
  const cached = await env.GUILD_KV.get(cacheKey);
  if (cached) return JSON.parse(cached);

  const res = await fetch(`${DISCORD_API}/users/@me/guilds`, {
    headers: { Authorization: `Bearer ${session.accessToken}` },
  });
  if (!res.ok) return [];
  const guilds = await res.json();
  const adminGuilds = guilds
    .filter((g) => (BigInt(g.permissions) & 8n) === 8n) // 8 = Administrator
    .map((g) => ({ id: g.id, name: g.name, icon: g.icon }));

  await env.GUILD_KV.put(cacheKey, JSON.stringify(adminGuilds), { expirationTtl: 60 });
  return adminGuilds;
}

export async function getUserAdminGuildIds(env, session) {
  return (await getUserAdminGuilds(env, session)).map((g) => g.id);
}
