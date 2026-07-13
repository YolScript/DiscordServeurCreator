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
