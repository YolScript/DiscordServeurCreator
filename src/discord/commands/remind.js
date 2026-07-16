const { MessageFlags } = require('discord.js');
const reminderStore = require('../../kv/reminderStore');

// /remind (roadmap n°096) : rappel personnel en MP apres un delai.
// Formats acceptes : 10m, 2h, 1j (ou 1d). Max 30 jours.
const DURATION_RE = /^(\d{1,5})\s*(m|min|h|j|d)$/i;
const MAX_MS = 30 * 24 * 60 * 60_000;

function parseDuration(raw) {
  const match = (raw || '').trim().match(DURATION_RE);
  if (!match) return null;
  const value = Number(match[1]);
  const unit = match[2].toLowerCase();
  const ms = unit.startsWith('m') ? value * 60_000
    : unit === 'h' ? value * 3_600_000
      : value * 86_400_000;
  if (ms < 60_000 || ms > MAX_MS) return null;
  return ms;
}

async function handleRemindCommand(interaction) {
  const ms = parseDuration(interaction.options.getString('duree'));
  if (!ms) {
    await interaction.reply({ content: 'Duree invalide. Exemples : `10m`, `2h`, `1j` (entre 1 minute et 30 jours).', flags: MessageFlags.Ephemeral });
    return;
  }
  const text = interaction.options.getString('message').trim();
  await reminderStore.add(interaction.guild.id, {
    userId: interaction.user.id,
    text,
    runAt: Date.now() + ms,
  });
  const when = new Date(Date.now() + ms).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
  await interaction.reply({ content: `⏰ Note ! Je te rappelle ca en MP le ${when}.`, flags: MessageFlags.Ephemeral });
}

module.exports = handleRemindCommand;
