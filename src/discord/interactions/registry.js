const { MessageFlags } = require('discord.js');
const {
  REGLEMENT_ACCEPT, REGLEMENT_TRANSLATE, AGE_PLUS16, AGE_MINUS16,
  GAME_SELECT_PREFIX, GAME_PSEUDO_MODAL_PREFIX, GAME_PSEUDO_BUTTON_PREFIX,
} = require('./customIds');
const handleReglementAccept = require('./buttons/reglementAccept');
const { handleReglementTranslate, handleReglementTranslateSelect } = require('./buttons/reglementTranslate');
const handleAgeButton = require('./buttons/ageButtons');
const handleGamePseudoButton = require('./buttons/gamePseudoButton');
const handleGameRoleSelect = require('./selectMenus/gameRoleSelect');
const handleGamePseudoModal = require('./modals/gamePseudoModal');
const handleSetupCommand = require('../commands/setup');
const handleReglementTranslationCommand = require('../commands/reglementTranslation');
const handleWarnCommand = require('../commands/warn');
const handleWarningsCommand = require('../commands/warnings');
const handleClearwarnsCommand = require('../commands/clearwarns');
const handleTimeoutCommand = require('../commands/timeout');
const handleUnlockCommand = require('../commands/unlock');
const handleAutomodCommand = require('../commands/automod');
const handleScheduleAnnouncementCommand = require('../commands/scheduleAnnouncement');
const handleScheduleEventCommand = require('../commands/scheduleEvent');
const handleScheduledListCommand = require('../commands/scheduledList');
const handleScheduledCancelCommand = require('../commands/scheduledCancel');
const logger = require('../../shared/logger');

const commandHandlers = {
  setup: handleSetupCommand,
  warn: handleWarnCommand,
  warnings: handleWarningsCommand,
  clearwarns: handleClearwarnsCommand,
  timeout: handleTimeoutCommand,
  unlock: handleUnlockCommand,
  automod: handleAutomodCommand,
  'schedule-announcement': handleScheduleAnnouncementCommand,
  'schedule-event': handleScheduleEventCommand,
  'scheduled-list': handleScheduledListCommand,
  'scheduled-cancel': handleScheduledCancelCommand,
  'reglement-translation': handleReglementTranslationCommand,
};

async function routeInteraction(interaction) {
  try {
    if (interaction.isChatInputCommand()) {
      const handler = commandHandlers[interaction.commandName];
      if (handler) await handler(interaction);
      return;
    }
    if (interaction.isButton()) {
      if (interaction.customId === REGLEMENT_ACCEPT) {
        await handleReglementAccept(interaction);
      } else if (interaction.customId === REGLEMENT_TRANSLATE) {
        await handleReglementTranslate(interaction);
      } else if (interaction.customId === AGE_PLUS16 || interaction.customId === AGE_MINUS16) {
        await handleAgeButton(interaction);
      } else if (interaction.customId.startsWith(GAME_PSEUDO_BUTTON_PREFIX)) {
        await handleGamePseudoButton(interaction);
      }
      return;
    }
    if (interaction.isStringSelectMenu() && interaction.customId.startsWith(GAME_SELECT_PREFIX)) {
      await handleGameRoleSelect(interaction);
      return;
    }
    if (interaction.isStringSelectMenu() && interaction.customId === 'reglement_translate_select') {
      await handleReglementTranslateSelect(interaction);
      return;
    }
    if (interaction.isModalSubmit() && interaction.customId.startsWith(GAME_PSEUDO_MODAL_PREFIX)) {
      await handleGamePseudoModal(interaction);
    }
  } catch (err) {
    logger.error('Erreur lors du traitement d\'une interaction', err);
    if (interaction.isRepliable() && !interaction.replied && !interaction.deferred) {
      await interaction.reply({ content: 'Une erreur est survenue.', flags: MessageFlags.Ephemeral }).catch(() => {});
    }
  }
}

module.exports = { routeInteraction };
