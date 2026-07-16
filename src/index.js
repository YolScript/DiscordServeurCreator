const http = require('http');
const env = require('./config/env');
const client = require('./discord/client');
require('./discord/events');
const logger = require('./shared/logger');

// Serveur HTTP minimal : cible des hebergeurs de type "Web Service" (Render)
// et du ping de maintien en vie. Healthcheck enrichi (roadmap n°104) :
// latence gateway, serveurs, memoire et version en JSON.
http.createServer((req, res) => {
  const payload = {
    status: client.isReady() ? 'ok' : 'starting',
    uptimeMin: Math.floor(process.uptime() / 60),
    wsPingMs: client.ws?.ping ?? null,
    guilds: client.guilds?.cache?.size ?? 0,
    memoryMb: Math.round(process.memoryUsage().rss / 1048576),
    version: (process.env.RENDER_GIT_COMMIT || '').slice(0, 7) || null,
  };
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(payload));
}).listen(process.env.PORT || 3000);

client.login(env.discordToken).catch((err) => {
  logger.error('Echec de connexion Discord', err);
  // Sur Windows, un process.exit() synchrone juste apres un login qui rejette
  // crashe le process (course avec libuv/undici) : on differe la sortie.
  setTimeout(() => process.exit(1), 1000);
});
