const {
  ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, ModalBuilder, TextInputBuilder, TextInputStyle,
  MessageFlags, PermissionFlagsBits: P,
} = require('discord.js');
const publicVoiceStore = require('../../../kv/publicVoiceStore');
const {
  VOICE_CTRL_RENAME_BUTTON, VOICE_CTRL_RENAME_MODAL, VOICE_CTRL_LOCK_BUTTON, VOICE_CTRL_LIMIT_BUTTON,
} = require('../customIds');
const logger = require('../../../shared/logger');

// Panneau de controle des vocaux temporaires (roadmap n°187) : poste dans le
// chat integre au salon vocal lui-meme (text-in-voice), boutons reserves au
// createur du salon (ou a un administrateur).
function voiceControlPanelMessage(ownerId) {
  const embed = new EmbedBuilder()
    .setDescription(`🎙️ Vocal de <@${ownerId}> — renomme, verrouille ou limite ce salon avec les boutons ci-dessous.`)
    .setColor(0xc97a5c);
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(VOICE_CTRL_RENAME_BUTTON).setLabel('Renommer').setEmoji('✏️').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(VOICE_CTRL_LOCK_BUTTON).setLabel('Verrouiller').setEmoji('🔒').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(VOICE_CTRL_LIMIT_BUTTON).setLabel('Limite').setEmoji('👥').setStyle(ButtonStyle.Secondary),
  );
  return { embeds: [embed], components: [row] };
}

async function postVoiceControlPanel(channel, ownerId) {
  await channel.send(voiceControlPanelMessage(ownerId)).catch((err) => {
    logger.error('voiceControlPanel.post', err);
  });
}

async function isVoiceOwnerOrAdmin(interaction) {
  if (interaction.member.permissions.has(P.Administrator)) return true;
  const state = await publicVoiceStore.get(interaction.guild.id);
  return state.owners[interaction.channel.id] === interaction.user.id;
}

async function handleVoiceCtrlRename(interaction) {
  if (!(await isVoiceOwnerOrAdmin(interaction))) {
    await interaction.reply({ content: 'Seul le createur du vocal (ou un admin) peut le renommer.', flags: MessageFlags.Ephemeral });
    return;
  }
  const modal = new ModalBuilder().setCustomId(VOICE_CTRL_RENAME_MODAL).setTitle('Renommer le vocal');
  const input = new TextInputBuilder().setCustomId('newname').setLabel('Nouveau nom').setStyle(TextInputStyle.Short)
    .setMaxLength(90).setRequired(true).setValue(interaction.channel.name.slice(0, 90));
  modal.addComponents(new ActionRowBuilder().addComponents(input));
  await interaction.showModal(modal);
}

async function handleVoiceCtrlRenameModal(interaction) {
  const name = interaction.fields.getTextInputValue('newname').trim();
  if (!name) {
    await interaction.reply({ content: 'Nom invalide.', flags: MessageFlags.Ephemeral });
    return;
  }
  await interaction.channel.setName(name.slice(0, 100)).catch(() => {});
  await interaction.reply({ content: `Salon renomme en **${name}**.`, flags: MessageFlags.Ephemeral });
}

async function handleVoiceCtrlLock(interaction) {
  if (!(await isVoiceOwnerOrAdmin(interaction))) {
    await interaction.reply({ content: 'Seul le createur du vocal (ou un admin) peut le verrouiller.', flags: MessageFlags.Ephemeral });
    return;
  }
  const everyoneOverwrite = interaction.channel.permissionOverwrites.cache.get(interaction.guild.id);
  const isLocked = everyoneOverwrite?.deny.has(P.Connect) ?? false;
  if (isLocked) {
    await interaction.channel.permissionOverwrites.edit(interaction.guild.id, { Connect: null }).catch(() => {});
  } else {
    await interaction.channel.permissionOverwrites.edit(interaction.guild.id, { Connect: false }).catch(() => {});
  }
  await interaction.reply({ content: isLocked ? '🔓 Vocal deverrouille : tout le monde peut rejoindre.' : '🔒 Vocal verrouille : plus personne ne peut rejoindre (les membres deja presents restent).' });
}

async function handleVoiceCtrlLimit(interaction) {
  if (!(await isVoiceOwnerOrAdmin(interaction))) {
    await interaction.reply({ content: 'Seul le createur du vocal (ou un admin) peut changer la limite.', flags: MessageFlags.Ephemeral });
    return;
  }
  const cycle = [0, 2, 5, 10];
  const current = interaction.channel.userLimit || 0;
  const next = cycle[(cycle.indexOf(current) + 1) % cycle.length];
  await interaction.channel.setUserLimit(next).catch(() => {});
  await interaction.reply({ content: next === 0 ? '👥 Limite retiree : illimite.' : `👥 Limite fixee a ${next} membres.` });
}

module.exports = {
  postVoiceControlPanel, handleVoiceCtrlRename, handleVoiceCtrlRenameModal, handleVoiceCtrlLock, handleVoiceCtrlLimit,
};
