const {
  EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle,
} = require('discord.js');
const guildConfigStore = require('../../kv/guildConfigStore');
const { DEFAULT_REGLEMENT_TEXT } = require('../guildSetup/defaultReglement');
const { REGLEMENT_ACCEPT, REGLEMENT_TRANSLATE } = require('../interactions/customIds');

// (Re)poste l'embed reglement dans le salon configure : edite le message
// existant si possible (evite d'accumuler des doublons a chaque clic), sinon
// en poste un nouveau. Reutilise par /reglement-panel et par le bouton
// dashboard "Reposter le reglement" (cf panelActionsSync).
async function postReglementPanel(guild) {
  const config = await guildConfigStore.find(guild.id);
  if (!config?.rulesChannelId) return null;
  const channel = await guild.channels.fetch(config.rulesChannelId).catch(() => null);
  if (!channel) return null;

  const embed = new EmbedBuilder()
    .setTitle('Reglement du serveur')
    .setDescription(config.reglementText || DEFAULT_REGLEMENT_TEXT)
    .setColor(0xe63946);
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(REGLEMENT_ACCEPT).setLabel("J'accepte le reglement").setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(REGLEMENT_TRANSLATE).setLabel('Autres langues').setEmoji('🌐').setStyle(ButtonStyle.Secondary),
  );

  const existing = config.reglementMessageId
    ? await channel.messages.fetch(config.reglementMessageId).catch(() => null)
    : null;
  if (existing) {
    await existing.edit({ embeds: [embed], components: [row] });
    return existing;
  }

  const sent = await channel.send({ embeds: [embed], components: [row] });
  await guildConfigStore.upsert(guild.id, { reglementMessageId: sent.id });
  return sent;
}

module.exports = { postReglementPanel };
