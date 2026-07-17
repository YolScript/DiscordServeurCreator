// Dernier message supprime par salon (roadmap n°377) : volontairement en
// memoire process (pas de KV) — un message supprime doit rester ephemere,
// pas persister au-dela d'un redemarrage du bot.
const lastDeleted = new Map(); // channelId -> { content, authorTag, authorAvatarUrl, deletedAt }

function record(message) {
  if (!message.guild || message.author?.bot) return;
  lastDeleted.set(message.channel.id, {
    content: message.content || '(sans texte, ou message non mis en cache)',
    authorTag: message.author?.tag || 'Inconnu',
    authorAvatarUrl: message.author?.displayAvatarURL?.({ size: 64 }) || null,
    deletedAt: Date.now(),
  });
}

function get(channelId) {
  return lastDeleted.get(channelId) || null;
}

module.exports = { record, get };
