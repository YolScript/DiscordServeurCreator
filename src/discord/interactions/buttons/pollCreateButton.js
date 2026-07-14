const {
  ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder,
} = require('discord.js');
const { POLL_CREATE_MODAL } = require('../customIds');

async function handlePollCreateButton(interaction) {
  const modal = new ModalBuilder()
    .setCustomId(POLL_CREATE_MODAL)
    .setTitle('Creer un sondage');

  const questionInput = new TextInputBuilder()
    .setCustomId('question')
    .setLabel('Question')
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setMaxLength(200);

  const optionsInput = new TextInputBuilder()
    .setCustomId('options')
    .setLabel('Options (separees par des virgules, 2 a 5)')
    .setStyle(TextInputStyle.Paragraph)
    .setRequired(true)
    .setMaxLength(300);

  modal.addComponents(
    new ActionRowBuilder().addComponents(questionInput),
    new ActionRowBuilder().addComponents(optionsInput),
  );
  await interaction.showModal(modal);
}

module.exports = handlePollCreateButton;
