const { MessageFlags } = require('discord.js');
const moderationConfigStore = require('../../kv/moderationConfigStore');

async function handleAutomodCommand(interaction) {
  const sub = interaction.options.getSubcommand();
  const config = await moderationConfigStore.find(interaction.guild.id);

  if (sub === 'addword') {
    const word = interaction.options.getString('mot', true).toLowerCase();
    if (!config.bannedWords.includes(word)) config.bannedWords.push(word);
    await moderationConfigStore.upsert(interaction.guild.id, { bannedWords: config.bannedWords });
    await interaction.reply({ content: `Mot interdit ajoute : "${word}".`, flags: MessageFlags.Ephemeral });
    return;
  }
  if (sub === 'removeword') {
    const word = interaction.options.getString('mot', true).toLowerCase();
    const bannedWords = config.bannedWords.filter((w) => w !== word);
    await moderationConfigStore.upsert(interaction.guild.id, { bannedWords });
    await interaction.reply({ content: `Mot interdit retire : "${word}".`, flags: MessageFlags.Ephemeral });
    return;
  }
  if (sub === 'addkeyword') {
    const word = interaction.options.getString('mot', true).toLowerCase();
    if (!config.alertKeywords.includes(word)) config.alertKeywords.push(word);
    await moderationConfigStore.upsert(interaction.guild.id, { alertKeywords: config.alertKeywords });
    await interaction.reply({ content: `Mot-cle d'alerte ajoute : "${word}".`, flags: MessageFlags.Ephemeral });
    return;
  }
  if (sub === 'removekeyword') {
    const word = interaction.options.getString('mot', true).toLowerCase();
    const alertKeywords = config.alertKeywords.filter((w) => w !== word);
    await moderationConfigStore.upsert(interaction.guild.id, { alertKeywords });
    await interaction.reply({ content: `Mot-cle d'alerte retire : "${word}".`, flags: MessageFlags.Ephemeral });
    return;
  }
  if (sub === 'toggle-invites') {
    const enabled = interaction.options.getBoolean('actif', true);
    await moderationConfigStore.upsert(interaction.guild.id, { blockInvites: enabled });
    await interaction.reply({ content: `Blocage des invitations Discord : ${enabled ? 'active' : 'desactive'}.`, flags: MessageFlags.Ephemeral });
    return;
  }
  if (sub === 'toggle-links') {
    const enabled = interaction.options.getBoolean('actif', true);
    await moderationConfigStore.upsert(interaction.guild.id, { blockLinks: enabled });
    await interaction.reply({ content: `Blocage des liens externes : ${enabled ? 'active' : 'desactive'}.`, flags: MessageFlags.Ephemeral });
    return;
  }
  if (sub === 'status') {
    const fresh = await moderationConfigStore.find(interaction.guild.id);
    await interaction.reply({
      content: [
        `Auto-mod : ${fresh.autoModEnabled ? 'active' : 'desactive'}`,
        `Invitations bloquees : ${fresh.blockInvites}`,
        `Liens bloques : ${fresh.blockLinks}`,
        `Mots interdits (${fresh.bannedWords.length}) : ${fresh.bannedWords.join(', ') || '(aucun)'}`,
        `Mots-cles d'alerte (${fresh.alertKeywords.length}) : ${fresh.alertKeywords.join(', ') || '(aucun)'}`,
      ].join('\n'),
      flags: MessageFlags.Ephemeral,
    });
  }
}

module.exports = handleAutomodCommand;
