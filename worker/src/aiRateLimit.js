// Anti-abus simple : fenetre glissante par serveur+utilisateur. Independant
// du cout reel de l'appel IA (qui depend de la cle fournie par l'utilisateur)
// mais protege le Worker et le compte du proprietaire d'un usage en rafale
// (bug frontend, script, ou tentative d'abus).
const WINDOW_MS = 10 * 60_000;
const MAX_MESSAGES_PER_WINDOW = 20;

const key = (guildId, userId) => `guild:${guildId}:airatelimit:${userId}`;

export async function checkAiRateLimit(env, guildId, userId) {
  const now = Date.now();
  const raw = await env.GUILD_KV.get(key(guildId, userId));
  const entry = raw ? JSON.parse(raw) : { count: 0, windowStart: now };

  if (now - entry.windowStart > WINDOW_MS) {
    entry.count = 0;
    entry.windowStart = now;
  }

  if (entry.count >= MAX_MESSAGES_PER_WINDOW) {
    return { allowed: false, retryAfterSeconds: Math.ceil((WINDOW_MS - (now - entry.windowStart)) / 1000) };
  }

  entry.count += 1;
  await env.GUILD_KV.put(key(guildId, userId), JSON.stringify(entry), { expirationTtl: Math.ceil(WINDOW_MS / 1000) + 60 });
  return { allowed: true };
}
