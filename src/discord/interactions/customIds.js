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

const buildGameSelectId = (pageIndex) => `${GAME_SELECT_PREFIX}${pageIndex}`;
const buildGamePseudoModalId = (gameRoleId) => `${GAME_PSEUDO_MODAL_PREFIX}${gameRoleId}`;
const buildGamePseudoButtonId = (gameRoleId) => `${GAME_PSEUDO_BUTTON_PREFIX}${gameRoleId}`;
const buildPollVoteId = (pollId, optionIndex) => `${POLL_VOTE_PREFIX}${pollId}:${optionIndex}`;
const buildGiveawayEnterId = (giveawayId) => `${GIVEAWAY_ENTER_PREFIX}${giveawayId}`;

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
  buildGameSelectId,
  buildGamePseudoModalId,
  buildGamePseudoButtonId,
  buildPollVoteId,
  buildGiveawayEnterId,
};
