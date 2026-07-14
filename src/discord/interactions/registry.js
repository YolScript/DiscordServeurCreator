const { MessageFlags } = require('discord.js');
const {
  REGLEMENT_ACCEPT, REGLEMENT_TRANSLATE, AGE_PLUS16, AGE_MINUS16,
  GAME_SELECT_PREFIX, GAME_PSEUDO_MODAL_PREFIX, GAME_PSEUDO_BUTTON_PREFIX, POLL_VOTE_PREFIX, GIVEAWAY_ENTER_PREFIX,
  CAPTCHA_OK, CAPTCHA_NO, TICKET_OPEN,
} = require('./customIds');
const pollManager = require('../engagement/pollManager');
const giveawayManager = require('../engagement/giveawayManager');
const { createTicket, closeTicket, TICKET_CLOSE_ID } = require('../support/ticketManager');
const { handleReglementAccept, handleCaptchaResult } = require('./buttons/reglementAccept');
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
const handleStreamerLinkCommand = require('../commands/streamerLink');
const handleStreamerUnlinkCommand = require('../commands/streamerUnlink');
const handleStreamerListCommand = require('../commands/streamerList');
const handleRankCommand = require('../commands/rank');
const handleLeaderboardCommand = require('../commands/leaderboard');
const handleLevelroleCommand = require('../commands/levelrole');
const handlePollCommand = require('../commands/poll');
const handleGiveawayCommand = require('../commands/giveaway');
const handleInvitesCommand = require('../commands/invites');
const handleReferralroleCommand = require('../commands/referralrole');
const handleBadgesCommand = require('../commands/badges');
const handleTicketCommand = require('../commands/ticket');
const handleTicketPanelCommand = require('../commands/ticketPanel');
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
  'streamer-link': handleStreamerLinkCommand,
  'streamer-unlink': handleStreamerUnlinkCommand,
  'streamer-list': handleStreamerListCommand,
  rank: handleRankCommand,
  leaderboard: handleLeaderboardCommand,
  levelrole: handleLevelroleCommand,
  poll: handlePollCommand,
  giveaway: handleGiveawayCommand,
  invites: handleInvitesCommand,
  referralrole: handleReferralroleCommand,
  badges: handleBadgesCommand,
  ticket: handleTicketCommand,
  'ticket-panel': handleTicketPanelCommand,
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
      } else if (interaction.customId.startsWith(POLL_VOTE_PREFIX)) {
        const [pollId, optionIndex] = interaction.customId.slice(POLL_VOTE_PREFIX.length).split(':');
        await pollManager.handleVote(interaction, pollId, Number(optionIndex));
        await interaction.reply({ content: 'Vote enregistre !', flags: MessageFlags.Ephemeral });
      } else if (interaction.customId.startsWith(GIVEAWAY_ENTER_PREFIX)) {
        const giveawayId = interaction.customId.slice(GIVEAWAY_ENTER_PREFIX.length);
        await giveawayManager.handleEnter(interaction, giveawayId);
        await interaction.reply({ content: 'Participation enregistree, bonne chance !', flags: MessageFlags.Ephemeral });
      } else if (interaction.customId === TICKET_CLOSE_ID) {
        await closeTicket(interaction);
      } else if (interaction.customId === TICKET_OPEN) {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        const { channel, alreadyOpen } = await createTicket(interaction.guild, interaction.member);
        await interaction.editReply(alreadyOpen
          ? `Tu as deja un ticket ouvert : <#${channel.id}>`
          : `Ticket cree : <#${channel.id}>`);
      } else if (interaction.customId === CAPTCHA_OK) {
        await handleCaptchaResult(interaction, true);
      } else if (interaction.customId === CAPTCHA_NO) {
        await handleCaptchaResult(interaction, false);
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
