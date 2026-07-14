require('dotenv').config({ quiet: true });

function required(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Variable d'environnement manquante: ${name}`);
  return value;
}

module.exports = {
  discordToken: required('DISCORD_TOKEN'),
  clientId: required('DISCORD_CLIENT_ID'),
  cloudflare: {
    accountId: required('CF_ACCOUNT_ID'),
    namespaceId: required('CF_KV_NAMESPACE_ID'),
    apiToken: required('CF_API_TOKEN'),
  },
  // Optionnels : sans ces cles, les fonctionnalites correspondantes restent
  // simplement inactives (pas de crash au demarrage).
  twitch: {
    clientId: process.env.TWITCH_CLIENT_ID || null,
    clientSecret: process.env.TWITCH_CLIENT_SECRET || null,
  },
  youtube: {
    apiKey: process.env.YOUTUBE_API_KEY || null,
  },
};
