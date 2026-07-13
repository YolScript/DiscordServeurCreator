const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { TEMPLATES } = require('./guildSetup/templates');

const setupCommand = new SlashCommandBuilder()
  .setName('setup')
  .setDescription('Configure ce serveur avec un template (salons, roles, permissions).')
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
  .addStringOption((option) => {
    option.setName('template').setDescription('Template a appliquer').setRequired(true);
    for (const template of Object.values(TEMPLATES)) {
      option.addChoices({ name: template.label, value: template.key });
    }
    return option;
  })
  .addStringOption((option) => option
    .setName('reglement')
    .setDescription('Texte du reglement (modifiable ensuite depuis le dashboard)')
    .setRequired(false))
  .toJSON();

module.exports = [setupCommand];
