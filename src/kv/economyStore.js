const { kvGet, kvPut } = require('./cloudflareKv');
const guildConfigStore = require('./guildConfigStore');

const key = (guildId) => `guild:${guildId}:economy`;

// Historique des transactions (roadmap n°300) : les 50 dernieres par membre,
// gardees DANS le compte lui-meme (une seule cle KV par serveur, comme le
// reste de l'economie) plutot qu'une cle par membre — evite d'exploser le
// nombre de cles KV sur un gros serveur.
const MAX_TRANSACTIONS = 50;

async function all(guildId) {
  return (await kvGet(key(guildId))) ?? {};
}

async function getAccount(guildId, userId) {
  const accounts = await all(guildId);
  return accounts[userId] || {
    balance: 0, lastDaily: 0, dailyStreak: 0, transactions: [],
  };
}

async function mutate(guildId, userId, mutator) {
  const accounts = await all(guildId);
  const account = accounts[userId] || {
    balance: 0, lastDaily: 0, dailyStreak: 0, transactions: [],
  };
  if (!account.transactions) account.transactions = [];
  mutator(account);
  accounts[userId] = account;
  await kvPut(key(guildId), accounts);
  return account;
}

function logTransaction(account, amount, reason) {
  account.transactions.unshift({ amount, reason: reason || null, balance: account.balance, at: Date.now() });
  account.transactions = account.transactions.slice(0, MAX_TRANSACTIONS);
}

async function addBalance(guildId, userId, amount, reason) {
  // Plafond de richesse (roadmap n°686), optionnel : ne s'applique qu'aux
  // gains (amount > 0), un solde deja au-dessus du plafond au moment ou il
  // est active n'est jamais retire de force.
  let cap = null;
  if (amount > 0) {
    const config = await guildConfigStore.find(guildId).catch(() => null);
    cap = config?.wealthCap > 0 ? config.wealthCap : null;
  }
  return mutate(guildId, userId, (account) => {
    const target = account.balance + amount;
    account.balance = Math.max(0, cap ? Math.min(cap, target) : target);
    logTransaction(account, amount, reason);
  });
}

// Streak de jours consecutifs (roadmap n°304) : +10% de gain par jour de
// suite (plafonne a +100%), remis a zero si plus de 48h se sont ecoulees
// depuis le dernier /daily (une marge d'un jour, pas juste 24h pile, pour
// ne pas punir un decalage d'horaire).
const STREAK_GRACE_MS = 48 * 3600_000;
const STREAK_BONUS_PER_DAY = 0.1;
const STREAK_BONUS_CAP = 1;

async function claimDaily(guildId, userId, baseAmount) {
  return mutate(guildId, userId, (account) => {
    const now = Date.now();
    const withinGrace = account.lastDaily && (now - account.lastDaily) < STREAK_GRACE_MS;
    account.dailyStreak = withinGrace ? (account.dailyStreak || 0) + 1 : 1;
    const bonusMult = 1 + Math.min(STREAK_BONUS_CAP, (account.dailyStreak - 1) * STREAK_BONUS_PER_DAY);
    const amount = Math.round(baseAmount * bonusMult);
    account.balance += amount;
    account.lastDaily = now;
    logTransaction(account, amount, `daily (streak x${account.dailyStreak}, bonus x${bonusMult.toFixed(2)})`);
  });
}

module.exports = {
  all, getAccount, addBalance, claimDaily,
};
