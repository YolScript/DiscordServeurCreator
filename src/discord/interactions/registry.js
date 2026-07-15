const { MessageFlags } = require('discord.js');
const {
  REGLEMENT_ACCEPT, REGLEMENT_TRANSLATE, AGE_PLUS16, AGE_MINUS16,
  GAME_SELECT_PREFIX, GAME_PSEUDO_MODAL_PREFIX, GAME_PSEUDO_BUTTON_PREFIX, POLL_VOTE_PREFIX, GIVEAWAY_ENTER_PREFIX,
  CAPTCHA_OK, CAPTCHA_NO, TICKET_OPEN, POLL_CREATE_OPEN, POLL_CREATE_MODAL, TICKET_RATE_PREFIX,
} = require('./customIds');
const pollManager = require('../engagement/pollManager');
const giveawayManager = require('../engagement/giveawayManager');
const {
  createTicket, closeTicket, claimTicket, rateTicket, TICKET_CLOSE_ID, TICKET_CLAIM_ID,
} = require('../support/ticketManager');
const handlePollCreateButton = require('./buttons/pollCreateButton');
const handlePollCreateModal = require('./modals/pollCreateModal');
const { handleReglementAccept, handleCaptchaResult } = require('./buttons/reglementAccept');
const { handleReglementTranslate, handleReglementTranslateSelect } = require('./buttons/reglementTranslate');
const handleAgeButton = require('./buttons/ageButtons');
const handleGamePseudoButton = require('./buttons/gamePseudoButton');
const handleGameRoleSelect = require('./selectMenus/gameRoleSelect');
const handleReactionRoleSelect = require('./selectMenus/reactionRoleSelect');
const { SELECT_PREFIX: REACTION_ROLE_SELECT_PREFIX } = require('../roles/reactionRoleManager');
const handleGamePseudoModal = require('./modals/gamePseudoModal');
const handleSetupCommand = require('../commands/setup');
const handleReglementTranslationCommand = require('../commands/reglementTranslation');
const handleWarnCommand = require('../commands/warn');
const handleWarningsCommand = require('../commands/warnings');
const handleClearwarnsCommand = require('../commands/clearwarns');
const handleTimeoutCommand = require('../commands/timeout');
const handleTempbanCommand = require('../commands/tempban');
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
const handleGiveawayRerollCommand = require('../commands/giveawayReroll');
const handlePollPanelCommand = require('../commands/pollPanel');
const handleReglementPanelCommand = require('../commands/reglementPanel');
const handleRolesPanelCommand = require('../commands/rolesPanel');
const logger = require('../../shared/logger');

const commandHandlers = {
  setup: handleSetupCommand,
  warn: handleWarnCommand,
  warnings: handleWarningsCommand,
  clearwarns: handleClearwarnsCommand,
  timeout: handleTimeoutCommand,
  tempban: handleTempbanCommand,
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
  'giveaway-reroll': handleGiveawayRerollCommand,
  invites: handleInvitesCommand,
  referralrole: handleReferralroleCommand,
  badges: handleBadgesCommand,
  ticket: handleTicketCommand,
  'ticket-panel': handleTicketPanelCommand,
  'poll-panel': handlePollPanelCommand,
  'reglement-panel': handleReglementPanelCommand,
  'roles-panel': handleRolesPanelCommand,
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
        const result = await giveawayManager.handleEnter(interaction, giveawayId);
        await interaction.reply({
          content: result?.deniedRoleId
            ? `Reserve aux membres avec le role <@&${result.deniedRoleId}>.`
            : 'Participation enregistree, bonne chance !',
          flags: MessageFlags.Ephemeral,
        });
      } else if (interaction.customId === TICKET_CLOSE_ID) {
        await closeTicket(interaction);
      } else if (interaction.customId === TICKET_CLAIM_ID) {
        await claimTicket(interaction);
      } else if (interaction.customId === TICKET_OPEN) {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        const { channel, alreadyOpen } = await createTicket(interaction.guild, interaction.member);
        await interaction.editReply(alreadyOpen
          ? `Tu as deja un ticket ouvert : <#${channel.id}>`
          : `Ticket cree : <#${channel.id}>`);
      } else if (interaction.customId === POLL_CREATE_OPEN) {
        await handlePollCreateButton(interaction);
      } else if (interaction.customId === CAPTCHA_OK) {
        await handleCaptchaResult(interaction, true);
      } else if (interaction.customId === CAPTCHA_NO) {
        await handleCaptchaResult(interaction, false);
      } else if (interaction.customId.startsWith(TICKET_RATE_PREFIX)) {
        const [guildId, ticketId, stars] = interaction.customId.slice(TICKET_RATE_PREFIX.length).split(':');
        await rateTicket(interaction, guildId, ticketId, Number(stars));
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
    if (interaction.isStringSelectMenu() && interaction.customId.startsWith(REACTION_ROLE_SELECT_PREFIX)) {
      await handleReactionRoleSelect(interaction);
      return;
    }
    if (interaction.isModalSubmit() && interaction.customId.startsWith(GAME_PSEUDO_MODAL_PREFIX)) {
      await handleGamePseudoModal(interaction);
      return;
    }
    if (interaction.isModalSubmit() && interaction.customId === POLL_CREATE_MODAL) {
      await handlePollCreateModal(interaction);
    }
  } catch (err) {
    logger.error('Erreur lors du traitement d\'une interaction', err);
    if (interaction.isRepliable() && !interaction.replied && !interaction.deferred) {
      await interaction.reply({ content: 'Une erreur est survenue.', flags: MessageFlags.Ephemeral }).catch(() => {});
    }
  }
}

module.exports = { routeInteraction };
