const { kvGet, kvPut } = require('./cloudflareKv');

const key = (guildId) => `guild:${guildId}:economy`;

async function all(guildId) {
  return (await kvGet(key(guildId))) ?? {};
}

async function getAccount(guildId, userId) {
  const accounts = await all(guildId);
  return accounts[userId] || { balance: 0, lastDaily: 0 };
}

async function mutate(guildId, userId, mutator) {
  const accounts = await all(guildId);
  const account = accounts[userId] || { balance: 0, lastDaily: 0 };
  mutator(account);
  accounts[userId] = account;
  await kvPut(key(guildId), accounts);
  return account;
}

async function addBalance(guildId, userId, amount) {
  return mutate(guildId, userId, (account) => {
    account.balance = Math.max(0, account.balance + amount);
  });
}

async function claimDaily(guildId, userId, amount) {
  return mutate(guildId, userId, (account) => {
    account.balance += amount;
    account.lastDaily = Date.now();
  });
}

module.exports = {
  all, getAccount, addBalance, claimDaily,
};
