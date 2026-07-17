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
  // Notifications Web Push (roadmap n°178) : sans ces cles, envoyerPush()
  // (src/shared/webPush.js) ne fait rien silencieusement — generer une paire
  // avec `npx web-push generate-vapid-keys`, la cle publique doit correspondre
  // a VAPID_PUBLIC_KEY dans worker/wrangler.toml (cote navigateur).
  vapid: {
    publicKey: process.env.VAPID_PUBLIC_KEY || null,
    privateKey: process.env.VAPID_PRIVATE_KEY || null,
    subject: process.env.VAPID_SUBJECT || 'mailto:contact@example.com',
  },
};
