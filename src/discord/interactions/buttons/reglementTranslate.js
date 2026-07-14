const { MessageFlags, ActionRowBuilder, StringSelectMenuBuilder } = require('discord.js');
const guildConfigStore = require('../../../kv/guildConfigStore');

async function handleReglementTranslate(interaction) {
  const config = await guildConfigStore.find(interaction.guild.id);
  const translations = config?.reglementTranslations ?? {};
  const langs = Object.keys(translations);

  if (langs.length === 0) {
    await interaction.reply({ content: 'Aucune traduction disponible pour le moment.', flags: MessageFlags.Ephemeral });
    return;
  }

  const select = new StringSelectMenuBuilder()
    .setCustomId('reglement_translate_select')
    .setPlaceholder('Choisis une langue')
    .addOptions(langs.map((lang) => ({ label: lang.toUpperCase(), value: lang })));

  await interaction.reply({
    content: 'Choisis une langue :',
    components: [new ActionRowBuilder().addComponents(select)],
    flags: MessageFlags.Ephemeral,
  });
}

async function handleReglementTranslateSelect(interaction) {
  const config = await guildConfigStore.find(interaction.guild.id);
  const translations = config?.reglementTranslations ?? {};
  const lang = interaction.values[0];
  const text = translations[lang] || 'Traduction introuvable.';
  await interaction.reply({ content: text.slice(0, 1900), flags: MessageFlags.Ephemeral });
}

module.exports = { handleReglementTranslate, handleReglementTranslateSelect };
