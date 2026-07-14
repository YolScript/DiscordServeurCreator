const REGLEMENT_ACCEPT = 'reglement_accept';
const REGLEMENT_TRANSLATE = 'reglement_translate';
const AGE_PLUS16 = 'age_plus16';
const AGE_MINUS16 = 'age_minus16';

const GAME_SELECT_PREFIX = 'gamerole_select:';
const GAME_PSEUDO_MODAL_PREFIX = 'game_pseudo_modal:';
const GAME_PSEUDO_BUTTON_PREFIX = 'game_pseudo_button:';

const buildGameSelectId = (pageIndex) => `${GAME_SELECT_PREFIX}${pageIndex}`;
const buildGamePseudoModalId = (gameRoleId) => `${GAME_PSEUDO_MODAL_PREFIX}${gameRoleId}`;
const buildGamePseudoButtonId = (gameRoleId) => `${GAME_PSEUDO_BUTTON_PREFIX}${gameRoleId}`;

module.exports = {
  REGLEMENT_ACCEPT,
  REGLEMENT_TRANSLATE,
  AGE_PLUS16,
  AGE_MINUS16,
  GAME_SELECT_PREFIX,
  GAME_PSEUDO_MODAL_PREFIX,
  GAME_PSEUDO_BUTTON_PREFIX,
  buildGameSelectId,
  buildGamePseudoModalId,
  buildGamePseudoButtonId,
};
