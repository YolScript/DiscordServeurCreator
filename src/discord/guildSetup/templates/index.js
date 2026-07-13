const streamCommunautaire = require('./streamCommunautaire');
const multigaming = require('./multigaming');

const TEMPLATES = {
  [streamCommunautaire.key]: streamCommunautaire,
  [multigaming.key]: multigaming,
};

function getTemplate(key) {
  const template = TEMPLATES[key];
  if (!template) throw new Error(`Template inconnu: ${key}`);
  return template;
}

module.exports = { TEMPLATES, getTemplate };
