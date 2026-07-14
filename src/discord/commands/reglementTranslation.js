const { MessageFlags } = require('discord.js');
const guildConfigStore = require('../../kv/guildConfigStore');

async function handleReglementTranslationCommand(interaction) {
  const sub = interaction.options.getSubcommand();
  const config = await guildConfigStore.find(interaction.guild.id);
  const translations = config?.reglementTranslations ?? {};

  if (sub === 'set') {
    const lang = interaction.options.getString('langue', true).toLowerCase();
    const text = interaction.options.getString('texte', true);
    translations[lang] = text;
    await guildConfigStore.upsert(interaction.guild.id, { reglementTranslations: translations });
    await interaction.reply({ content: `Traduction "${lang}" enregistree.`, flags: MessageFlags.Ephemeral });
    return;
  }
  if (sub === 'remove') {
    const lang = interaction.options.getString('langue', true).toLowerCase();
    delete translations[lang];
    await guildConfigStore.upsert(interaction.guild.id, { reglementTranslations: translations });
    await interaction.reply({ content: `Traduction "${lang}" retiree.`, flags: MessageFlags.Ephemeral });
    return;
  }
  if (sub === 'list') {
    const langs = Object.keys(translations);
    await interaction.reply({
      content: langs.length ? `Langues disponibles : ${langs.join(', ')}` : 'Aucune traduction enregistree.',
      flags: MessageFlags.Ephemeral,
    });
  }
}

module.exports = handleReglementTranslationCommand;
