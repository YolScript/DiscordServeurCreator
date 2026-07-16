const {
  MessageFlags, ActionRowBuilder, ButtonBuilder, ButtonStyle, AttachmentBuilder,
  ModalBuilder, TextInputBuilder, TextInputStyle,
} = require('discord.js');
const guildConfigStore = require('../../../kv/guildConfigStore');
const captchaStore = require('../../../kv/captchaStore');
const captchaAttemptStore = require('../../../kv/captchaAttemptStore');
const memberAgeStore = require('../../../kv/memberAgeStore');
const { randomCode, generateCaptchaImage } = require('../../moderation/captchaImage');
const { parseBirthdate, computeAge } = require('../../moderation/ageVerification');
const {
  CAPTCHA_OK, CAPTCHA_NO, CAPTCHA_IMAGE_VERIFY, CAPTCHA_IMAGE_MODAL, AGE_VERIFY_BUTTON, AGE_VERIFY_MODAL,
} = require('../customIds');

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

  const lock = await captchaAttemptStore.getLockStatus(interaction.guild.id, interaction.user.id);
  if (lock.locked) {
    await interaction.reply({
      content: `Trop d'echecs a la verification anti-bot. Reessaie dans ${Math.ceil(lock.retryAfterSeconds / 60)} min.`,
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  if (config.captchaType === 'image') {
    const code = randomCode();
    await captchaStore.set(interaction.guild.id, interaction.user.id, code);
    const png = await generateCaptchaImage(code);
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(CAPTCHA_IMAGE_VERIFY).setLabel('Entrer le code').setStyle(ButtonStyle.Primary),
    );
    await interaction.reply({
      content: 'Verification anti-bot : recopie le code affiche sur l\'image ci-dessous.',
      files: [new AttachmentBuilder(png, { name: 'captcha.png' })],
      components: [row],
      flags: MessageFlags.Ephemeral,
    });
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
    const failCount = await captchaAttemptStore.recordFailure(interaction.guild.id, interaction.user.id);
    const remaining = captchaAttemptStore.MAX_FAILS - failCount;
    await interaction.reply({
      content: remaining > 0
        ? `Rate ! Reclique sur "J'accepte le reglement" pour reessayer (${remaining} essai(s) restant(s)).`
        : "Trop d'echecs. Reessaie dans quelques minutes.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }
  await captchaAttemptStore.reset(interaction.guild.id, interaction.user.id);

  const config = await guildConfigStore.find(interaction.guild.id);
  if (!config?.reglementValidatedRoleId) {
    await interaction.reply({ content: 'Configuration introuvable pour ce serveur.', flags: MessageFlags.Ephemeral });
    return;
  }
  await interaction.reply({
    content: 'Verification anti-bot reussie ! Derniere etape : confirme ton age pour finaliser.',
    components: [ageVerifyButtonRow()],
    flags: MessageFlags.Ephemeral,
  });
}

async function handleCaptchaImageVerifyButton(interaction) {
  const modal = new ModalBuilder().setCustomId(CAPTCHA_IMAGE_MODAL).setTitle('Verification anti-bot');
  const input = new TextInputBuilder()
    .setCustomId('code')
    .setLabel('Code affiche sur l\'image')
    .setStyle(TextInputStyle.Short)
    .setMinLength(4)
    .setMaxLength(6)
    .setRequired(true);
  modal.addComponents(new ActionRowBuilder().addComponents(input));
  await interaction.showModal(modal);
}

async function handleCaptchaImageModal(interaction) {
  const code = interaction.fields.getTextInputValue('code');
  const ok = await captchaStore.verify(interaction.guild.id, interaction.user.id, code);

  if (!ok) {
    const failCount = await captchaAttemptStore.recordFailure(interaction.guild.id, interaction.user.id);
    const remaining = captchaAttemptStore.MAX_FAILS - failCount;
    await interaction.reply({
      content: remaining > 0
        ? `Code incorrect ou expire. Reclique sur "J'accepte le reglement" pour reessayer (${remaining} essai(s) restant(s)).`
        : "Trop d'echecs. Reessaie dans quelques minutes.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }
  await captchaAttemptStore.reset(interaction.guild.id, interaction.user.id);

  const config = await guildConfigStore.find(interaction.guild.id);
  if (!config?.reglementValidatedRoleId) {
    await interaction.reply({ content: 'Configuration introuvable pour ce serveur.', flags: MessageFlags.Ephemeral });
    return;
  }
  await interaction.reply({
    content: 'Verification anti-bot reussie ! Derniere etape : confirme ton age pour finaliser.',
    components: [ageVerifyButtonRow()],
    flags: MessageFlags.Ephemeral,
  });
}

function ageVerifyButtonRow() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(AGE_VERIFY_BUTTON).setLabel('🎂 Confirmer mon age').setStyle(ButtonStyle.Primary),
  );
}

async function handleAgeVerifyButton(interaction) {
  const modal = new ModalBuilder().setCustomId(AGE_VERIFY_MODAL).setTitle("Verification d'age");
  const input = new TextInputBuilder()
    .setCustomId('birthdate')
    .setLabel('Date de naissance (JJ/MM/AAAA)')
    .setPlaceholder('Ex: 14/07/2004')
    .setStyle(TextInputStyle.Short)
    .setMinLength(8)
    .setMaxLength(10)
    .setRequired(true);
  modal.addComponents(new ActionRowBuilder().addComponents(input));
  await interaction.showModal(modal);
}

// La date de naissance n'est utilisee que le temps de ce calcul, jamais
// sauvegardee : seul le resultat (majeur/mineur en prive, +16/-16 en role)
// survit a cette fonction.
async function handleAgeVerifyModal(interaction) {
  const birthDate = parseBirthdate(interaction.fields.getTextInputValue('birthdate'));
  if (!birthDate) {
    await interaction.reply({
      content: 'Date invalide. Reclique sur "🎂 Confirmer mon age" pour reessayer (format JJ/MM/AAAA).',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }
  const age = computeAge(birthDate);

  const config = await guildConfigStore.find(interaction.guild.id);
  if (!config?.reglementValidatedRoleId) {
    await interaction.reply({ content: 'Configuration introuvable pour ce serveur.', flags: MessageFlags.Ephemeral });
    return;
  }
  await interaction.member.roles.add(config.reglementValidatedRoleId).catch(() => {});

  if (config.plus16RoleId && config.minus16RoleId) {
    const addRoleId = age >= 16 ? config.plus16RoleId : config.minus16RoleId;
    const removeRoleId = age >= 16 ? config.minus16RoleId : config.plus16RoleId;
    if (interaction.member.roles.cache.has(removeRoleId)) {
      await interaction.member.roles.remove(removeRoleId).catch(() => {});
    }
    await interaction.member.roles.add(addRoleId).catch(() => {});
  }

  await memberAgeStore.setAdultStatus(interaction.guild.id, interaction.user.id, age >= 18);

  await interaction.reply({ content: 'Verification reussie, reglement accepte, bienvenue !', flags: MessageFlags.Ephemeral });
}

module.exports = {
  handleReglementAccept,
  handleCaptchaResult,
  handleCaptchaImageVerifyButton,
  handleCaptchaImageModal,
  handleAgeVerifyButton,
  handleAgeVerifyModal,
};
