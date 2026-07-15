const { kvGet, kvPut } = require('./cloudflareKv');

// Registre GLOBAL (pas par guilde) des templates sauvegardes : n'importe
// quel serveur configure par le bot peut etre enregistre comme source de
// template reutilisable pour /setup sur un autre serveur.
const KEY = 'templates:registry';

async function list() {
  return (await kvGet(KEY)) ?? [];
}

async function replaceAll(items) {
  await kvPut(KEY, items);
}

async function add(entry) {
  const items = await list();
  const created = {
    id: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
    ...entry,
    createdAt: Date.now(),
  };
  items.push(created);
  await replaceAll(items);
  return created;
}

async function remove(id) {
  const items = await list();
  await replaceAll(items.filter((i) => i.id !== id));
}

module.exports = {
  list, add, remove,
};
