const { kvGet, kvPut } = require('./cloudflareKv');

const key = (guildId) => `guild:${guildId}:lottery`;

// { tickets: [userId, userId, ...], pot: number, lastDrawAt: number }
async function get(guildId) {
  return (await kvGet(key(guildId))) ?? { tickets: [], pot: 0, lastDrawAt: 0 };
}

async function addTicket(guildId, userId, ticketPrice) {
  const state = await get(guildId);
  state.tickets.push(userId);
  state.pot += ticketPrice;
  await kvPut(key(guildId), state);
}

async function drawAndReset(guildId) {
  const state = await get(guildId);
  const winner = state.tickets.length ? state.tickets[Math.floor(Math.random() * state.tickets.length)] : null;
  const pot = state.pot;
  await kvPut(key(guildId), { tickets: [], pot: 0, lastDrawAt: Date.now() });
  return { winner, pot };
}

module.exports = {
  get, addTicket, drawAndReset,
};
