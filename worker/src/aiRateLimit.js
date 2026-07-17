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

// Plafond QUOTIDIEN et par SERVEUR (roadmap n°252), distinct du garde-fou
// anti-rafale ci-dessus (par utilisateur, fenetre 10 min) : ici c'est un
// budget global configurable par l'admin (config.aiDailyMessageLimit),
// utile pour plafonner le cout d'une cle IA partagee par toute la
// communaute. 0/non configure = illimite (comportement par defaut inchange).
const dailyKey = (guildId, dateStr) => `guild:${guildId}:aidailycount:${dateStr}`;

export async function checkAiDailyGuildLimit(env, guildId, limit) {
  if (!limit || limit <= 0) return { allowed: true };
  const dateStr = new Date().toISOString().slice(0, 10);
  const k = dailyKey(guildId, dateStr);
  const count = Number((await env.GUILD_KV.get(k)) || '0');
  if (count >= limit) return { allowed: false };
  await env.GUILD_KV.put(k, String(count + 1), { expirationTtl: 2 * 86400 });
  return { allowed: true };
}
