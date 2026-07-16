const DISCORD_API = 'https://discord.com/api/v10';

export async function botFetch(env, path, options = {}) {
  return fetch(`${DISCORD_API}${path}`, {
    ...options,
    headers: {
      Authorization: `Bot ${env.DISCORD_BOT_TOKEN}`,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });
}

export async function botFetchJson(env, path, options = {}) {
  const res = await botFetch(env, path, options);
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Discord API ${path} -> ${res.status}: ${body}`);
  }
  if (res.status === 204) return null;
  return res.json();
}

// MP Discord au proprietaire d'un serveur (alertes de securite, roadmap
// n°063). Echoue silencieusement si le owner bloque les MP.
export async function notifyGuildOwner(env, guildId, content) {
  const guild = await botFetchJson(env, `/guilds/${guildId}`);
  if (!guild?.owner_id) return;
  const dm = await botFetchJson(env, '/users/@me/channels', {
    method: 'POST',
    body: JSON.stringify({ recipient_id: guild.owner_id }),
  });
  await botFetchJson(env, `/channels/${dm.id}/messages`, {
    method: 'POST',
    body: JSON.stringify({ content }),
  });
}
