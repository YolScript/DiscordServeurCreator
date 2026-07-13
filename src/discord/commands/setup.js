const { PermissionFlagsBits, MessageFlags } = require('discord.js');
const { setupGuild, AlreadySetupError, InsufficientRoleHeadroomError } = require('../guildSetup/setupGuild');
const { TEMPLATES } = require('../guildSetup/templates');
const logger = require('../../shared/logger');

async function handleSetupCommand(interaction) {
  if (!interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
    await interaction.reply({ content: 'Reserve aux administrateurs du serveur.', flags: MessageFlags.Ephemeral });
    return;
  }

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const templateKey = interaction.options.getString('template', true);
  const reglementText = interaction.options.getString('reglement') || '';

  try {
    await setupGuild({
      guild: interaction.guild,
      templateKey,
      requestedByUserId: interaction.user.id,
      reglementText,
    });
    await interaction.editReply(`Serveur configure avec le template "${TEMPLATES[templateKey].label}" !`);
  } catch (err) {
    if (err instanceof AlreadySetupError || err instanceof InsufficientRoleHeadroomError) {
      await interaction.editReply(err.message);
      return;
    }
    logger.error('Echec /setup', err);
    await interaction.editReply('Une erreur est survenue pendant la configuration du serveur.');
  }
}

module.exports = handleSetupCommand;
