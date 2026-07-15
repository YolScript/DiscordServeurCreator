const http = require('http');
const env = require('./config/env');
const client = require('./discord/client');
require('./discord/events');
const logger = require('./shared/logger');

// Serveur HTTP minimal : sert uniquement de cible aux hebergeurs de type
// "Web Service" (ex. Render) qui exigent un port ouvert, et au ping de
// maintien en vie (le bot lui-meme communique avec Discord via WebSocket,
// pas via ce port).
http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('OK');
}).listen(process.env.PORT || 3000);

client.login(env.discordToken).catch((err) => {
  logger.error('Echec de connexion Discord', err);
  // Sur Windows, un process.exit() synchrone juste apres un login qui rejette
  // crashe le process (course avec libuv/undici) : on differe la sortie.
  setTimeout(() => process.exit(1), 1000);
});
