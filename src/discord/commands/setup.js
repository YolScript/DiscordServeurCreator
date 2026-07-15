const { PermissionFlagsBits, MessageFlags } = require('discord.js');
const { setupGuild, AlreadySetupError } = require('../guildSetup/setupGuild');
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
    const { templateLabel } = await setupGuild({
      guild: interaction.guild,
      templateKey,
      requestedByUserId: interaction.user.id,
      reglementText,
    });
    await interaction.editReply(`Serveur configure avec le template "${templateLabel}" !`);
  } catch (err) {
    if (err instanceof AlreadySetupError) {
      await interaction.editReply(err.message);
      return;
    }
    logger.error('Echec /setup', err);
    await interaction.editReply('Une erreur est survenue pendant la configuration du serveur.');
  }
}

module.exports = handleSetupCommand;
