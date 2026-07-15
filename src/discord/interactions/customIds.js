const REGLEMENT_ACCEPT = 'reglement_accept';
const REGLEMENT_TRANSLATE = 'reglement_translate';
const AGE_PLUS16 = 'age_plus16';
const AGE_MINUS16 = 'age_minus16';

const GAME_SELECT_PREFIX = 'gamerole_select:';
const GAME_PSEUDO_MODAL_PREFIX = 'game_pseudo_modal:';
const GAME_PSEUDO_BUTTON_PREFIX = 'game_pseudo_button:';
const POLL_VOTE_PREFIX = 'poll_vote:';
const GIVEAWAY_ENTER_PREFIX = 'giveaway_enter:';
const CAPTCHA_OK = 'captcha_ok';
const CAPTCHA_NO = 'captcha_no';
const TICKET_OPEN = 'ticket_open';
const POLL_CREATE_OPEN = 'poll_create_open';
const POLL_CREATE_MODAL = 'poll_create_modal';
const TICKET_RATE_PREFIX = 'ticket_rate:';
const SUGGESTION_VOTE_PREFIX = 'suggestion_vote:';
const SUGGESTION_APPROVE_PREFIX = 'suggestion_approve:';
const SUGGESTION_DENY_PREFIX = 'suggestion_deny:';

const buildGameSelectId = (pageIndex) => `${GAME_SELECT_PREFIX}${pageIndex}`;
const buildGamePseudoModalId = (gameRoleId) => `${GAME_PSEUDO_MODAL_PREFIX}${gameRoleId}`;
const buildGamePseudoButtonId = (gameRoleId) => `${GAME_PSEUDO_BUTTON_PREFIX}${gameRoleId}`;
const buildPollVoteId = (pollId, optionIndex) => `${POLL_VOTE_PREFIX}${pollId}:${optionIndex}`;
const buildGiveawayEnterId = (giveawayId) => `${GIVEAWAY_ENTER_PREFIX}${giveawayId}`;
const buildTicketRateId = (guildId, ticketId, stars) => `${TICKET_RATE_PREFIX}${guildId}:${ticketId}:${stars}`;
const buildSuggestionVoteId = (suggestionId, direction) => `${SUGGESTION_VOTE_PREFIX}${suggestionId}:${direction}`;
const buildSuggestionApproveId = (suggestionId) => `${SUGGESTION_APPROVE_PREFIX}${suggestionId}`;
const buildSuggestionDenyId = (suggestionId) => `${SUGGESTION_DENY_PREFIX}${suggestionId}`;

module.exports = {
  REGLEMENT_ACCEPT,
  REGLEMENT_TRANSLATE,
  AGE_PLUS16,
  AGE_MINUS16,
  GAME_SELECT_PREFIX,
  GAME_PSEUDO_MODAL_PREFIX,
  GAME_PSEUDO_BUTTON_PREFIX,
  POLL_VOTE_PREFIX,
  GIVEAWAY_ENTER_PREFIX,
  CAPTCHA_OK,
  CAPTCHA_NO,
  TICKET_OPEN,
  POLL_CREATE_OPEN,
  POLL_CREATE_MODAL,
  TICKET_RATE_PREFIX,
  SUGGESTION_VOTE_PREFIX,
  SUGGESTION_APPROVE_PREFIX,
  SUGGESTION_DENY_PREFIX,
  buildGameSelectId,
  buildGamePseudoModalId,
  buildGamePseudoButtonId,
  buildPollVoteId,
  buildGiveawayEnterId,
  buildTicketRateId,
  buildSuggestionVoteId,
  buildSuggestionApproveId,
  buildSuggestionDenyId,
};
