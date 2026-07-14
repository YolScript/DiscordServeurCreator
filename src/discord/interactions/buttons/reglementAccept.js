const {
  MessageFlags, ActionRowBuilder, ButtonBuilder, ButtonStyle,
} = require('discord.js');
const guildConfigStore = require('../../../kv/guildConfigStore');
const { CAPTCHA_OK, CAPTCHA_NO } = require('../customIds');

const EMOJI_POOL = ['🔵', '🟢', '🟡', '🟣', '🔴', '⚪', '🟠', '🟤'];

// Verification anti-bot legere : avant de valider le reglement, l'utilisateur
// doit cliquer sur le bon emoji parmi 4. Empeche les comptes automatises
// naifs qui cliquent sans lire.
async function handleReglementAccept(interaction) {
  const config = await guildConfigStore.find(interaction.guild.id);
  if (!config?.reglementValidatedRoleId) {
    await interaction.reply({ content: 'Configuration introuvable pour ce serveur.', flags: MessageFlags.Ephemeral });
    return;
  }
  if (interaction.member.roles.cache.has(config.reglementValidatedRoleId)) {
    await interaction.reply({ content: 'Tu as deja valide le reglement.', flags: MessageFlags.Ephemeral });
    return;
  }

  if (config.captchaEnabled === false) {
    await interaction.member.roles.add(config.reglementValidatedRoleId).catch(() => {});
    await interaction.reply({ content: 'Reglement accepte, bienvenue !', flags: MessageFlags.Ephemeral });
    return;
  }

  const shuffled = [...EMOJI_POOL].sort(() => Math.random() - 0.5).slice(0, 4);
  const correctIndex = Math.floor(Math.random() * shuffled.length);
  const target = shuffled[correctIndex];

  const row = new ActionRowBuilder().addComponents(
    shuffled.map((emoji, idx) => new ButtonBuilder()
      .setCustomId(idx === correctIndex ? CAPTCHA_OK : CAPTCHA_NO)
      .setEmoji(emoji)
      .setStyle(ButtonStyle.Secondary)),
  );

  await interaction.reply({
    content: `Verification anti-bot : clique sur ${target} pour confirmer que tu n'es pas un robot.`,
    components: [row],
    flags: MessageFlags.Ephemeral,
  });
}

async function handleCaptchaResult(interaction, success) {
  if (!success) {
    await interaction.reply({ content: 'Rate ! Reclique sur "J\'accepte le reglement" pour reessayer.', flags: MessageFlags.Ephemeral });
    return;
  }

  const config = await guildConfigStore.find(interaction.guild.id);
  if (!config?.reglementValidatedRoleId) {
    await interaction.reply({ content: 'Configuration introuvable pour ce serveur.', flags: MessageFlags.Ephemeral });
    return;
  }
  await interaction.member.roles.add(config.reglementValidatedRoleId).catch(() => {});
  await interaction.reply({ content: 'Verification reussie, reglement accepte, bienvenue !', flags: MessageFlags.Ephemeral });
}

module.exports = { handleReglementAccept, handleCaptchaResult };
