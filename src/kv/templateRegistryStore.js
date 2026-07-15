const { kvGet } = require('./cloudflareKv');

// Registre GLOBAL (pas par guilde) des templates sauvegardes : n'importe
// quel serveur configure par le bot peut etre enregistre comme source de
// template reutilisable pour /setup sur un autre serveur. Cree/supprime
// uniquement depuis le dashboard (worker/src/index.js) ; le bot ne fait que
// le lire pour resoudre un templateKey en source lors de /setup.
const KEY = 'templates:registry';

async function list() {
  return (await kvGet(KEY)) ?? [];
}

module.exports = { list };
