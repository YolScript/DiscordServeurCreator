// Tests des routes critiques du worker via miniflare (roadmap n°193).
// Objectif : attraper en CI les regressions qui cassent au moins un de ces
// trois contrats de base, plutot que de ne les decouvrir qu'en prod :
//   - les routes publiques repondent (pas de crash au boot/import) ;
//   - les routes qui touchent une guilde EXIGENT une session (401 sans
//     cookie) — c'est le point d'entree unique de toute la securite du
//     dashboard (requireGuildAccess dans index.js) ;
//   - le CORS preflight (OPTIONS) repond correctement.
// Volontairement pas de test avec une VRAIE session Discord (OAuth complet
// hors de portee d'un test unitaire) : ce fichier verifie le perimetre
// "public vs protege", pas la logique metier de chaque route.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { Miniflare } from 'miniflare';
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

let mf;

before(async () => {
  // Miniflare seul ne resout pas les dependances npm (ex: discord-api-types)
  // quand on lui donne le code source tel quel : on bundle d'abord avec
  // esbuild (meme outil que wrangler en interne) pour obtenir un seul
  // fichier ESM autonome, comme ce qui part reellement en prod.
  const result = await build({
    entryPoints: [path.join(__dirname, '..', 'src', 'index.js')],
    bundle: true,
    format: 'esm',
    platform: 'neutral',
    write: false,
  });
  const bundledScript = result.outputFiles[0].text;

  mf = new Miniflare({
    script: bundledScript,
    modules: true,
    kvNamespaces: ['GUILD_KV'],
    bindings: {
      DISCORD_CLIENT_ID: 'test-client-id',
      DISCORD_CLIENT_SECRET: 'test-secret',
      DISCORD_BOT_TOKEN: 'test-bot-token',
      SESSION_SECRET: 'test-session-secret',
      OAUTH_REDIRECT_URI: 'http://localhost:8787/auth/callback',
      FRONTEND_ORIGIN: 'http://localhost:3000',
      FRONTEND_REDIRECT_URL: 'http://localhost:3000/app.html',
      BOT_KEEPALIVE_URL: '',
    },
  });
});

after(async () => {
  await mf?.dispose();
});

test('GET /health repond 200 sans authentification', async () => {
  const res = await mf.dispatchFetch('http://localhost/health');
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(typeof body, 'object');
});

test('GET /api/game-role-catalog est public et repond 200', async () => {
  const res = await mf.dispatchFetch('http://localhost/api/game-role-catalog');
  assert.equal(res.status, 200);
});

test('GET /api/botstatus sans session repond 401 (exige une session, pas un role admin)', async () => {
  const res = await mf.dispatchFetch('http://localhost/api/botstatus');
  assert.equal(res.status, 401);
});

test('GET /api/guilds/:id/config sans session repond 401', async () => {
  const res = await mf.dispatchFetch('http://localhost/api/guilds/123456789/config');
  assert.equal(res.status, 401);
});

test('GET /api/guilds/:id/modconfig sans session repond 401 (pas 500 ni 200)', async () => {
  const res = await mf.dispatchFetch('http://localhost/api/guilds/123456789/modconfig');
  assert.equal(res.status, 401);
});

test('GET /api/push-vapid-key est public et repond 200 (roadmap n°178)', async () => {
  const res = await mf.dispatchFetch('http://localhost/api/push-vapid-key');
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.ok('publicKey' in body);
});

test('POST /api/guilds/:id/push-subscribe sans session repond 401', async () => {
  const res = await mf.dispatchFetch('http://localhost/api/guilds/123456789/push-subscribe', {
    method: 'POST',
    body: JSON.stringify({ endpoint: 'https://example.com', keys: { p256dh: 'x', auth: 'y' } }),
    headers: { 'Content-Type': 'application/json' },
  });
  assert.equal(res.status, 401);
});

test('POST /api/guilds/:id/config sans session repond 401 (mutation protegee)', async () => {
  const res = await mf.dispatchFetch('http://localhost/api/guilds/123456789/config', {
    method: 'PATCH',
    body: JSON.stringify({ xpRate: 2 }),
    headers: { 'Content-Type': 'application/json' },
  });
  assert.equal(res.status, 401);
});

test('OPTIONS repond au preflight CORS', async () => {
  const res = await mf.dispatchFetch('http://localhost/api/guilds/123456789/config', { method: 'OPTIONS' });
  assert.ok(res.status < 400);
});

test('Route inconnue repond 404', async () => {
  const res = await mf.dispatchFetch('http://localhost/api/route-qui-n-existe-pas');
  assert.equal(res.status, 404);
});
