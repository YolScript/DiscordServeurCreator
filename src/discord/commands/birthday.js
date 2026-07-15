const { MessageFlags } = require('discord.js');
const birthdayStore = require('../../kv/birthdayStore');

const MONTHS = [
  'janvier', 'fevrier', 'mars', 'avril', 'mai', 'juin',
  'juillet', 'aout', 'septembre', 'octobre', 'novembre', 'decembre',
];

async function handleBirthdayCommand(interaction) {
  const month = interaction.options.getInteger('mois', true);
  const day = interaction.options.getInteger('jour', true);

  if (month < 1 || month > 12 || day < 1 || day > 31) {
    await interaction.reply({ content: 'Date invalide.', flags: MessageFlags.Ephemeral });
    return;
  }

  await birthdayStore.set(interaction.guild.id, interaction.user.id, month, day);
  await interaction.reply({
    content: `Anniversaire enregistre : ${day} ${MONTHS[month - 1]}.`,
    flags: MessageFlags.Ephemeral,
  });
}

module.exports = handleBirthdayCommand;
