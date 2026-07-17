const guildConfigStore = require('../kv/guildConfigStore');

// Nom/emoji de monnaie personnalisables (roadmap n°425).
async function getCurrencyLabel(guildId) {
  const config = await guildConfigStore.find(guildId).catch(() => null);
  return { name: config?.currencyName || 'pieces', emoji: config?.currencyEmoji || '🪙' };
}

module.exports = { getCurrencyLabel };
