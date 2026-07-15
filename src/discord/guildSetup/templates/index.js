const { buildLiveTemplate } = require('./liveTemplate');

// Un seul template desormais : une copie vivante du serveur de reference
// "ServeurCreator", relue en direct a chaque /setup (cf liveTemplate.js).
const TEMPLATE_CHOICES = [
  { key: 'live', label: 'Copie de ServeurCreator (a jour)' },
];

async function getTemplate(key, client) {
  if (key !== 'live') throw new Error(`Template inconnu: ${key}`);
  return buildLiveTemplate(client);
}

module.exports = { TEMPLATE_CHOICES, getTemplate };
