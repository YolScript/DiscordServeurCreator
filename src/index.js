const env = require('./config/env');
const client = require('./discord/client');
require('./discord/events');
const logger = require('./shared/logger');

client.login(env.discordToken).catch((err) => {
  logger.error('Echec de connexion Discord', err);
  // Sur Windows, un process.exit() synchrone juste apres un login qui rejette
  // crashe le process (course avec libuv/undici) : on differe la sortie.
  setTimeout(() => process.exit(1), 1000);
});
