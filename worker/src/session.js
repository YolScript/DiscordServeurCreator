const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7;

export function randomId(bytes = 32) {
  const arr = new Uint8Array(bytes);
  crypto.getRandomValues(arr);
  return [...arr].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function parseCookies(request) {
  const header = request.headers.get('Cookie') || '';
  const cookies = {};
  for (const part of header.split(';')) {
    const [key, ...rest] = part.trim().split('=');
    if (!key) continue;
    cookies[key] = decodeURIComponent(rest.join('='));
  }
  return cookies;
}

export async function createSession(env, data) {
  const sessionId = randomId();
  await env.GUILD_KV.put(`session:${sessionId}`, JSON.stringify(data), { expirationTtl: SESSION_TTL_SECONDS });
  return sessionId;
}

export async function getSession(env, request) {
  const cookies = parseCookies(request);
  const sessionId = cookies.session_id;
  if (!sessionId) return null;
  const raw = await env.GUILD_KV.get(`session:${sessionId}`);
  return raw ? { sessionId, ...JSON.parse(raw) } : null;
}

export async function updateSession(env, sessionId, data) {
  await env.GUILD_KV.put(`session:${sessionId}`, JSON.stringify(data), { expirationTtl: SESSION_TTL_SECONDS });
}

export async function destroySession(env, sessionId) {
  if (sessionId) await env.GUILD_KV.delete(`session:${sessionId}`);
}

export function sessionCookie(sessionId) {
  return `session_id=${sessionId}; Path=/; HttpOnly; Secure; SameSite=None; Max-Age=${SESSION_TTL_SECONDS}`;
}

export function clearSessionCookie() {
  return 'session_id=; Path=/; HttpOnly; Secure; SameSite=None; Max-Age=0';
}
