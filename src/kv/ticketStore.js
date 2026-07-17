const { kvGet, kvPut } = require('./cloudflareKv');

const key = (guildId) => `guild:${guildId}:tickets`;

async function list(guildId) {
  return (await kvGet(key(guildId))) ?? [];
}

async function replaceAll(guildId, items) {
  await kvPut(key(guildId), items);
}

async function add(guildId, ticket) {
  const items = await list(guildId);
  const entry = { id: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, ...ticket };
  items.push(entry);
  await replaceAll(guildId, items);
  return entry;
}

async function findByChannel(guildId, channelId) {
  const items = await list(guildId);
  return items.find((t) => t.channelId === channelId) ?? null;
}

async function findOpenByUser(guildId, userId) {
  const items = await list(guildId);
  return items.find((t) => t.userId === userId && t.status === 'open') ?? null;
}

async function close(guildId, channelId) {
  const items = await list(guildId);
  const ticket = items.find((t) => t.channelId === channelId);
  if (ticket) ticket.status = 'closed';
  await replaceAll(guildId, items);
  return ticket;
}

async function assign(guildId, channelId, staffId, staffTag) {
  const items = await list(guildId);
  const ticket = items.find((t) => t.channelId === channelId);
  if (ticket) {
    ticket.assignedTo = staffId;
    ticket.assignedToTag = staffTag;
  }
  await replaceAll(guildId, items);
  return ticket;
}

async function rate(guildId, ticketId, stars) {
  const items = await list(guildId);
  const ticket = items.find((t) => t.id === ticketId);
  if (ticket) ticket.rating = stars;
  await replaceAll(guildId, items);
  return ticket;
}

// Priorite/tags geres cote staff depuis le dashboard (roadmap n°307,n°309),
// apres creation — un modal Discord est deja limite a 3 champs texte pour
// le formulaire d'ouverture, en ajouter la n'aurait fait qu'alourdir le flux
// pour un membre qui ouvre un ticket.
async function setPriority(guildId, ticketId, priority) {
  const items = await list(guildId);
  const ticket = items.find((t) => t.id === ticketId);
  if (ticket) ticket.priority = priority;
  await replaceAll(guildId, items);
  return ticket;
}

async function setTags(guildId, ticketId, tags) {
  const items = await list(guildId);
  const ticket = items.find((t) => t.id === ticketId);
  if (ticket) ticket.tags = tags;
  await replaceAll(guildId, items);
  return ticket;
}

// Limite de tickets ouverts simultanes par membre (roadmap n°313).
async function countOpenByUser(guildId, userId) {
  const items = await list(guildId);
  return items.filter((t) => t.userId === userId && t.status === 'open').length;
}

module.exports = {
  list, replaceAll, add, findByChannel, findOpenByUser, close, assign, rate, setPriority, setTags, countOpenByUser,
};
