export function corsHeaders(env) {
  return {
    'Access-Control-Allow-Origin': env.RESOLVED_CORS_ORIGIN || env.FRONTEND_ORIGIN,
    'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Allow-Methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    Vary: 'Origin',
  };
}

// Autorise le domaine de prod (env.FRONTEND_ORIGIN) et, en plus, tout
// localhost/127.0.0.1 quel que soit le port : pratique pour tester le
// dashboard en local (docs/ servi statiquement) sans jamais elargir le CORS
// a un domaine tiers arbitraire (Access-Control-Allow-Credentials est actif).
export function resolveCorsOrigin(request, env) {
  const origin = request.headers.get('Origin');
  if (!origin) return env.FRONTEND_ORIGIN;
  if (origin === env.FRONTEND_ORIGIN) return origin;
  if (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) return origin;
  return env.FRONTEND_ORIGIN;
}

export function withCors(response, env) {
  const headers = new Headers(response.headers);
  for (const [key, value] of Object.entries(corsHeaders(env))) headers.set(key, value);
  return new Response(response.body, { status: response.status, headers });
}

export function json(data, env, init = {}) {
  return withCors(new Response(JSON.stringify(data), {
    status: init.status || 200,
    headers: { 'Content-Type': 'application/json', ...(init.headers || {}) },
  }), env);
}

export function preflightResponse(env) {
  return new Response(null, { status: 204, headers: corsHeaders(env) });
}
