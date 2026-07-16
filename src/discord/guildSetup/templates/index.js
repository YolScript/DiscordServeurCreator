const { buildLiveTemplate, SOURCE_GUILD_ID } = require('./liveTemplate');
const templateRegistryStore = require('../../../kv/templateRegistryStore');

const DEFAULT_TEMPLATE_CHOICE = { key: 'live', label: 'ServeurCreator (a jour)' };

// Liste dynamique : le choix par defaut (ServeurCreator) + tous les
// templates enregistres via le dashboard (n'importe quel serveur configure
// par le bot). Utilise pour l'autocompletion de /setup, pas des choix figes
// a l'enregistrement des commandes, puisque cette liste peut grandir sans
// redeployer les commandes.
async function listTemplateChoices() {
  const saved = await templateRegistryStore.list();
  return [
    DEFAULT_TEMPLATE_CHOICE,
    ...saved.map((t) => ({ key: `live:${t.id}`, label: t.name })),
  ];
}

async function getTemplate(key, client) {
  if (key === 'live') return buildLiveTemplate(client, SOURCE_GUILD_ID);
  if (key.startsWith('live:')) {
    const id = key.slice('live:'.length);
    const saved = await templateRegistryStore.list();
    const entry = saved.find((t) => t.id === id);
    if (!entry) throw new Error('Ce template a ete supprime, choisis-en un autre.');
    return buildLiveTemplate(client, entry.sourceGuildId, entry.name);
  }
  throw new Error(`Template inconnu: ${key}`);
}

module.exports = { listTemplateChoices, getTemplate, DEFAULT_TEMPLATE_CHOICE };
