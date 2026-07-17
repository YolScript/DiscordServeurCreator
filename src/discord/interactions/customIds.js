const REGLEMENT_ACCEPT = 'reglement_accept';
const REGLEMENT_TRANSLATE = 'reglement_translate';

const GAME_SELECT_PREFIX = 'gamerole_select:';
const GAME_PSEUDO_MODAL_PREFIX = 'game_pseudo_modal:';
const GAME_PSEUDO_BUTTON_PREFIX = 'game_pseudo_button:';
const POLL_VOTE_PREFIX = 'poll_vote:';
const GIVEAWAY_ENTER_PREFIX = 'giveaway_enter:';
const CAPTCHA_OK = 'captcha_ok';
const CAPTCHA_NO = 'captcha_no';
const TICKET_OPEN = 'ticket_open';
const TICKET_FORM_MODAL = 'ticket_form_modal';
const POLL_CREATE_OPEN = 'poll_create_open';
const POLL_CREATE_MODAL = 'poll_create_modal';
const TICKET_RATE_PREFIX = 'ticket_rate:';
const SUGGESTION_VOTE_PREFIX = 'suggestion_vote:';
const SUGGESTION_APPROVE_PREFIX = 'suggestion_approve:';
const SUGGESTION_DENY_PREFIX = 'suggestion_deny:';
const SHOP_BUY_PREFIX = 'shop_buy:';
const CAPTCHA_IMAGE_VERIFY = 'captcha_image_verify';
const CAPTCHA_IMAGE_MODAL = 'captcha_image_modal';
const AGE_VERIFY_BUTTON = 'age_verify_button';
const AGE_VERIFY_MODAL = 'age_verify_modal';

// Contestation de sanction par formulaire (roadmap n°279).
const SANCTION_CONTEST_PREFIX = 'sanction_contest:';
const SANCTION_CONTEST_MODAL_PREFIX = 'sanction_contest_modal:';

// Panneau de controle des vocaux temporaires (roadmap n°187).
const VOICE_CTRL_RENAME_BUTTON = 'voicectrl_rename';
const VOICE_CTRL_RENAME_MODAL = 'voicectrl_rename_modal';
const VOICE_CTRL_LOCK_BUTTON = 'voicectrl_lock';
const VOICE_CTRL_LIMIT_BUTTON = 'voicectrl_limit';

const buildGameSelectId = (pageIndex) => `${GAME_SELECT_PREFIX}${pageIndex}`;
const buildGamePseudoModalId = (gameRoleId) => `${GAME_PSEUDO_MODAL_PREFIX}${gameRoleId}`;
const buildGamePseudoButtonId = (gameRoleId) => `${GAME_PSEUDO_BUTTON_PREFIX}${gameRoleId}`;
const buildPollVoteId = (pollId, optionIndex) => `${POLL_VOTE_PREFIX}${pollId}:${optionIndex}`;
const buildGiveawayEnterId = (giveawayId) => `${GIVEAWAY_ENTER_PREFIX}${giveawayId}`;
const buildTicketRateId = (guildId, ticketId, stars) => `${TICKET_RATE_PREFIX}${guildId}:${ticketId}:${stars}`;
const buildSuggestionVoteId = (suggestionId, direction) => `${SUGGESTION_VOTE_PREFIX}${suggestionId}:${direction}`;
const buildSuggestionApproveId = (suggestionId) => `${SUGGESTION_APPROVE_PREFIX}${suggestionId}`;
const buildSuggestionDenyId = (suggestionId) => `${SUGGESTION_DENY_PREFIX}${suggestionId}`;
const buildShopBuyId = (itemId) => `${SHOP_BUY_PREFIX}${itemId}`;
const buildSanctionContestId = (guildId, sanctionType, targetId, createdAt) => `${SANCTION_CONTEST_PREFIX}${guildId}:${sanctionType}:${targetId}:${createdAt}`;
const buildSanctionContestModalId = (guildId, sanctionType, targetId, createdAt) => `${SANCTION_CONTEST_MODAL_PREFIX}${guildId}:${sanctionType}:${targetId}:${createdAt}`;

module.exports = {
  REGLEMENT_ACCEPT,
  REGLEMENT_TRANSLATE,
  GAME_SELECT_PREFIX,
  GAME_PSEUDO_MODAL_PREFIX,
  GAME_PSEUDO_BUTTON_PREFIX,
  POLL_VOTE_PREFIX,
  GIVEAWAY_ENTER_PREFIX,
  CAPTCHA_OK,
  CAPTCHA_NO,
  TICKET_OPEN,
  TICKET_FORM_MODAL,
  POLL_CREATE_OPEN,
  POLL_CREATE_MODAL,
  TICKET_RATE_PREFIX,
  SUGGESTION_VOTE_PREFIX,
  SUGGESTION_APPROVE_PREFIX,
  SUGGESTION_DENY_PREFIX,
  SHOP_BUY_PREFIX,
  CAPTCHA_IMAGE_VERIFY,
  CAPTCHA_IMAGE_MODAL,
  AGE_VERIFY_BUTTON,
  AGE_VERIFY_MODAL,
  VOICE_CTRL_RENAME_BUTTON,
  VOICE_CTRL_RENAME_MODAL,
  VOICE_CTRL_LOCK_BUTTON,
  VOICE_CTRL_LIMIT_BUTTON,
  SANCTION_CONTEST_PREFIX,
  SANCTION_CONTEST_MODAL_PREFIX,
  buildSanctionContestId,
  buildSanctionContestModalId,
  buildGameSelectId,
  buildGamePseudoModalId,
  buildGamePseudoButtonId,
  buildPollVoteId,
  buildGiveawayEnterId,
  buildTicketRateId,
  buildSuggestionVoteId,
  buildSuggestionApproveId,
  buildSuggestionDenyId,
  buildShopBuyId,
};
