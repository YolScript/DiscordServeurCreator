const client = require('../client');
const pendingPanelActionStore = require('../../kv/pendingPanelActionStore');
const { postReglementPanel } = require('../roles/reglementPanel');
const rolesMessageManager = require('../roles/rolesMessageManager');
const { postPollPanel } = require('../engagement/pollManager');
const { postTicketPanel } = require('../support/ticketManager');
const logger = require('../../shared/logger');

const TICK_MS = 8_000;

// Le dashboard (Worker, process separe du bot) ne peut pas appeler
// directement le code du bot pour reposter un embed. Il depose une action
// dans KV, et le bot la sonde ici pour l'executer (meme principe que
// gameRolesSync, mais pour des actions ponctuelles plutot qu'un etat a
// comparer).
async function executeAction(guild, action) {
  if (action.type === 'reglement') {
    await postReglementPanel(guild);
    return;
  }
  if (action.type === 'roles') {
    await rolesMessageManager.refresh(guild);
    return;
  }
  if (action.type === 'poll' || action.type === 'ticket') {
    if (!action.channelId) return;
    const channel = await guild.channels.fetch(action.channelId).catch(() => null);
    if (!channel) return;
    if (action.type === 'poll') await postPollPanel(channel);
    else await postTicketPanel(channel);
  }
}

async function tick() {
  for (const guild of client.guilds.cache.values()) {
    let actions;
    try {
      actions = await pendingPanelActionStore.list(guild.id);
    } catch (err) {
      logger.error('panelActionsSync.list', err);
      continue;
    }
    if (!actions.length) continue;

    for (const action of actions) {
      try {
        await executeAction(guild, action);
      } catch (err) {
        logger.error('panelActionsSync.execute', err);
      }
    }

    await pendingPanelActionStore.clear(guild.id).catch((err) => logger.error('panelActionsSync.clear', err));
  }
}

function start() {
  setInterval(() => { tick().catch((err) => logger.error('panelActionsSync.tick', err)); }, TICK_MS);
  logger.info('Synchronisation des actions de panneaux demarree');
}

module.exports = { start, tick };
