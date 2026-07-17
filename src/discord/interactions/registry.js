const {
  MessageFlags, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder,
} = require('discord.js');
const {
  REGLEMENT_ACCEPT, REGLEMENT_TRANSLATE,
  GAME_SELECT_PREFIX, GAME_PSEUDO_MODAL_PREFIX, GAME_PSEUDO_BUTTON_PREFIX, POLL_VOTE_PREFIX, GIVEAWAY_ENTER_PREFIX,
  CAPTCHA_OK, CAPTCHA_NO, TICKET_OPEN, TICKET_FORM_MODAL, POLL_CREATE_OPEN, POLL_CREATE_MODAL, TICKET_RATE_PREFIX,
  SUGGESTION_VOTE_PREFIX, SUGGESTION_APPROVE_PREFIX, SUGGESTION_DENY_PREFIX, SHOP_BUY_PREFIX,
  CAPTCHA_IMAGE_VERIFY, CAPTCHA_IMAGE_MODAL, AGE_VERIFY_BUTTON, AGE_VERIFY_MODAL,
  VOICE_CTRL_RENAME_BUTTON, VOICE_CTRL_RENAME_MODAL, VOICE_CTRL_LOCK_BUTTON, VOICE_CTRL_LIMIT_BUTTON,
} = require('./customIds');
const pollManager = require('../engagement/pollManager');
const giveawayManager = require('../engagement/giveawayManager');
const suggestionManager = require('../engagement/suggestionManager');
const {
  createTicket, closeTicket, claimTicket, rateTicket, TICKET_CLOSE_ID, TICKET_CLAIM_ID,
} = require('../support/ticketManager');
const { handleReportCommand } = require('../moderation/reportMessage');
const {
  handleVoiceCtrlRename, handleVoiceCtrlRenameModal, handleVoiceCtrlLock, handleVoiceCtrlLimit,
} = require('./buttons/voiceControlPanel');
const { handleCannedResponseCommand, autocompleteCannedResponse } = require('../commands/cannedResponse');
const handleConfigSummaryCommand = require('../commands/configSummary');
const { handleHelpCommand, handleHelpCategorySelect } = require('../commands/help');
const handlePollCreateButton = require('./buttons/pollCreateButton');
const handlePollCreateModal = require('./modals/pollCreateModal');
const {
  handleReglementAccept, handleCaptchaResult, handleCaptchaImageVerifyButton, handleCaptchaImageModal,
  handleAgeVerifyButton, handleAgeVerifyModal,
} = require('./buttons/reglementAccept');
const { handleReglementTranslate, handleReglementTranslateSelect } = require('./buttons/reglementTranslate');
const handleGamePseudoButton = require('./buttons/gamePseudoButton');
const handleGameRoleSelect = require('./selectMenus/gameRoleSelect');
const handleReactionRoleSelect = require('./selectMenus/reactionRoleSelect');
const { SELECT_PREFIX: REACTION_ROLE_SELECT_PREFIX } = require('../roles/reactionRoleManager');
const handleGamePseudoModal = require('./modals/gamePseudoModal');
const handleSetupCommand = require('../commands/setup');
const { listTemplateChoices } = require('../guildSetup/templates');
const handleCustomCommand = require('../commands/customCommand');
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
const handleBirthdayCommand = require('../commands/birthday');
const handleSuggestCommand = require('../commands/suggest');
const handleLinkGameCommand = require('../commands/linkGame');
const handleGameProfileCommand = require('../commands/gameProfile');
const handleBalanceCommand = require('../commands/balance');
const handleDailyCommand = require('../commands/daily');
const handlePayCommand = require('../commands/pay');
const handleShopCommand = require('../commands/shop');
const handleEconomyLeaderboardCommand = require('../commands/economyLeaderboard');
const handleShopBuyButton = require('./buttons/shopBuyButton');
const handleTicketCommand = require('../commands/ticket');
const handleTicketPanelCommand = require('../commands/ticketPanel');
const handleGiveawayRerollCommand = require('../commands/giveawayReroll');
const handlePollPanelCommand = require('../commands/pollPanel');
const handleReglementPanelCommand = require('../commands/reglementPanel');
const handleRolesPanelCommand = require('../commands/rolesPanel');
const handleRemindCommand = require('../commands/remind');
const logger = require('../../shared/logger');

const commandHandlers = {
  setup: handleSetupCommand,
  reponse: handleCannedResponseCommand,
  config: handleConfigSummaryCommand,
  help: handleHelpCommand,
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
  birthday: handleBirthdayCommand,
  suggest: handleSuggestCommand,
  'link-jeu': handleLinkGameCommand,
  'profil-jeu': handleGameProfileCommand,
  balance: handleBalanceCommand,
  daily: handleDailyCommand,
  pay: handlePayCommand,
  shop: handleShopCommand,
  'economy-leaderboard': handleEconomyLeaderboardCommand,
  ticket: handleTicketCommand,
  'ticket-panel': handleTicketPanelCommand,
  'poll-panel': handlePollPanelCommand,
  'reglement-panel': handleReglementPanelCommand,
  'roles-panel': handleRolesPanelCommand,
  remind: handleRemindCommand,
};

async function routeInteraction(interaction) {
  try {
    if (interaction.isAutocomplete()) {
      if (interaction.commandName === 'reponse') {
        await autocompleteCannedResponse(interaction);
        return;
      }
      if (interaction.commandName === 'setup') {
        const focused = interaction.options.getFocused().toLowerCase();
        const choices = await listTemplateChoices();
        const filtered = choices
          .filter((c) => c.label.toLowerCase().includes(focused))
          .slice(0, 25)
          .map((c) => ({ name: c.label.slice(0, 100), value: c.key }));
        await interaction.respond(filtered).catch(() => {});
      }
      return;
    }
    // Signalement contextuel (roadmap n°147).
    if (interaction.isMessageContextMenuCommand() && interaction.commandName === 'Signaler au staff') {
      await handleReportCommand(interaction);
      return;
    }
    if (interaction.isChatInputCommand()) {
      const handler = commandHandlers[interaction.commandName];
      if (handler) {
        await handler(interaction);
      } else if (interaction.guild) {
        await handleCustomCommand(interaction);
      }
      return;
    }
    if (interaction.isButton()) {
      if (interaction.customId === REGLEMENT_ACCEPT) {
        await handleReglementAccept(interaction);
      } else if (interaction.customId === REGLEMENT_TRANSLATE) {
        await handleReglementTranslate(interaction);
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
      } else if (interaction.customId === VOICE_CTRL_RENAME_BUTTON) {
        await handleVoiceCtrlRename(interaction);
      } else if (interaction.customId === VOICE_CTRL_LOCK_BUTTON) {
        await handleVoiceCtrlLock(interaction);
      } else if (interaction.customId === VOICE_CTRL_LIMIT_BUTTON) {
        await handleVoiceCtrlLimit(interaction);
      } else if (interaction.customId === TICKET_CLOSE_ID) {
        await closeTicket(interaction);
      } else if (interaction.customId === TICKET_CLAIM_ID) {
        await claimTicket(interaction);
      } else if (interaction.customId === TICKET_OPEN) {
        // Formulaire d'ouverture (roadmap n°160) : motif + details + urgence
        // avant la creation du salon, pour donner le contexte au staff.
        const modal = new ModalBuilder()
          .setCustomId(TICKET_FORM_MODAL)
          .setTitle('Ouvrir un ticket')
          .addComponents(
            new ActionRowBuilder().addComponents(
              new TextInputBuilder().setCustomId('ticket_motif').setLabel('Motif de ta demande')
                .setStyle(TextInputStyle.Short).setMaxLength(100).setRequired(true)
                .setPlaceholder('Ex : probleme de role, question, signalement...'),
            ),
            new ActionRowBuilder().addComponents(
              new TextInputBuilder().setCustomId('ticket_details').setLabel('Details (optionnel)')
                .setStyle(TextInputStyle.Paragraph).setMaxLength(1000).setRequired(false),
            ),
            new ActionRowBuilder().addComponents(
              new TextInputBuilder().setCustomId('ticket_urgence').setLabel('Urgence : basse / normale / haute')
                .setStyle(TextInputStyle.Short).setMaxLength(20).setRequired(false).setPlaceholder('normale'),
            ),
          );
        await interaction.showModal(modal);
      } else if (interaction.customId === POLL_CREATE_OPEN) {
        await handlePollCreateButton(interaction);
      } else if (interaction.customId === CAPTCHA_OK) {
        await handleCaptchaResult(interaction, true);
      } else if (interaction.customId === CAPTCHA_NO) {
        await handleCaptchaResult(interaction, false);
      } else if (interaction.customId.startsWith(TICKET_RATE_PREFIX)) {
        const [guildId, ticketId, stars] = interaction.customId.slice(TICKET_RATE_PREFIX.length).split(':');
        await rateTicket(interaction, guildId, ticketId, Number(stars));
      } else if (interaction.customId.startsWith(SUGGESTION_VOTE_PREFIX)) {
        const [suggestionId, direction] = interaction.customId.slice(SUGGESTION_VOTE_PREFIX.length).split(':');
        await suggestionManager.handleVote(interaction, suggestionId, direction);
      } else if (interaction.customId.startsWith(SUGGESTION_APPROVE_PREFIX)) {
        const suggestionId = interaction.customId.slice(SUGGESTION_APPROVE_PREFIX.length);
        await suggestionManager.handleModeration(interaction, suggestionId, 'approved');
      } else if (interaction.customId.startsWith(SUGGESTION_DENY_PREFIX)) {
        const suggestionId = interaction.customId.slice(SUGGESTION_DENY_PREFIX.length);
        await suggestionManager.handleModeration(interaction, suggestionId, 'denied');
      } else if (interaction.customId.startsWith(SHOP_BUY_PREFIX)) {
        const itemId = interaction.customId.slice(SHOP_BUY_PREFIX.length);
        await handleShopBuyButton(interaction, itemId);
      } else if (interaction.customId === CAPTCHA_IMAGE_VERIFY) {
        await handleCaptchaImageVerifyButton(interaction);
      } else if (interaction.customId === AGE_VERIFY_BUTTON) {
        await handleAgeVerifyButton(interaction);
      } else if (interaction.customId.startsWith('selfrole:')) {
        // Bouton de role auto-attribue (generateur d'embed du dashboard,
        // roadmap n°003) : donne le role au clic, le retire au clic suivant.
        const roleId = interaction.customId.slice('selfrole:'.length);
        const role = await interaction.guild.roles.fetch(roleId).catch(() => null);
        if (!role) {
          await interaction.reply({ content: 'Ce role n\'existe plus.', flags: MessageFlags.Ephemeral });
        } else if (interaction.member.roles.cache.has(roleId)) {
          await interaction.member.roles.remove(roleId);
          await interaction.reply({ content: `Role ${role.name} retire.`, flags: MessageFlags.Ephemeral });
        } else {
          await interaction.member.roles.add(roleId);
          await interaction.reply({ content: `Role ${role.name} ajoute !`, flags: MessageFlags.Ephemeral });
        }
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
    if (interaction.isStringSelectMenu() && interaction.customId === 'help_category_select') {
      await handleHelpCategorySelect(interaction);
      return;
    }
    if (interaction.isModalSubmit() && interaction.customId.startsWith(GAME_PSEUDO_MODAL_PREFIX)) {
      await handleGamePseudoModal(interaction);
      return;
    }
    if (interaction.isModalSubmit() && interaction.customId === POLL_CREATE_MODAL) {
      await handlePollCreateModal(interaction);
    }
    if (interaction.isModalSubmit() && interaction.customId === CAPTCHA_IMAGE_MODAL) {
      await handleCaptchaImageModal(interaction);
    }
    if (interaction.isModalSubmit() && interaction.customId === AGE_VERIFY_MODAL) {
      await handleAgeVerifyModal(interaction);
    }
    if (interaction.isModalSubmit() && interaction.customId === VOICE_CTRL_RENAME_MODAL) {
      await handleVoiceCtrlRenameModal(interaction);
    }
    if (interaction.isModalSubmit() && interaction.customId === TICKET_FORM_MODAL) {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      const form = {
        motif: interaction.fields.getTextInputValue('ticket_motif').trim() || 'Non precise',
        details: interaction.fields.getTextInputValue('ticket_details').trim(),
        urgence: interaction.fields.getTextInputValue('ticket_urgence').trim(),
      };
      const { channel, alreadyOpen } = await createTicket(interaction.guild, interaction.member, form);
      await interaction.editReply(alreadyOpen
        ? `Tu as deja un ticket ouvert : <#${channel.id}>`
        : `Ticket cree : <#${channel.id}>`);
    }
  } catch (err) {
    logger.error('Erreur lors du traitement d\'une interaction', err);
    if (interaction.isRepliable() && !interaction.replied && !interaction.deferred) {
      await interaction.reply({ content: 'Une erreur est survenue.', flags: MessageFlags.Ephemeral }).catch(() => {});
    }
  }
}

module.exports = { routeInteraction };
