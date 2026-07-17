const webpush = require('web-push');
const env = require('../config/env');
const pushSubscriptionStore = require('../kv/pushSubscriptionStore');
const logger = require('./logger');

let configured = false;
function ensureConfigured() {
  if (configured) return true;
  if (!env.vapid.publicKey || !env.vapid.privateKey) return false;
  webpush.setVapidDetails(env.vapid.subject, env.vapid.publicKey, env.vapid.privateKey);
  configured = true;
  return true;
}

// Envoie une notification Web Push a tous les abonnes d'un serveur (roadmap
// n°178). Silencieux si les cles VAPID ne sont pas configurees (fonction
// simplement inactive tant que l'admin ne les a pas renseignees, cf.
// .env.example). Retire automatiquement les souscriptions mortes (410 Gone /
// 404) — un navigateur peut invalider son abonnement sans jamais prevenir
// le serveur, sinon on retenterait indefiniment un endpoint mort.
async function sendPushToGuild(guildId, payload) {
  if (!ensureConfigured()) return;
  const subs = await pushSubscriptionStore.list(guildId);
  if (!subs.length) return;
  const body = JSON.stringify(payload);
  const stillValid = [];
  let changed = false;
  for (const sub of subs) {
    try {
      // eslint-disable-next-line no-await-in-loop
      await webpush.sendNotification({ endpoint: sub.endpoint, keys: sub.keys }, body);
      stillValid.push(sub);
    } catch (err) {
      if (err.statusCode === 404 || err.statusCode === 410) {
        changed = true;
      } else {
        stillValid.push(sub);
        logger.error('webPush.sendPushToGuild', err);
      }
    }
  }
  if (changed) await pushSubscriptionStore.replaceAll(guildId, stillValid);
}

module.exports = { sendPushToGuild };
