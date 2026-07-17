const {
  MessageFlags, ActionRowBuilder, ButtonBuilder, ButtonStyle,
} = require('discord.js');
const warnStore = require('../../kv/warnStore');
const moderationConfigStore = require('../../kv/moderationConfigStore');
const { postModLog } = require('../moderation/modLog');
const { applyEscalation } = require('../moderation/escalation');
const { buildSanctionContestId } = require('../interactions/customIds');

async function handleWarnCommand(interaction) {
  const target = interaction.options.getUser('membre', true);
  const reason = interaction.options.getString('raison', true);

  const warns = await warnStore.add(interaction.guild.id, target.id, {
    reason, moderatorId: interaction.user.id, source: 'manuel',
  });

  await postModLog(interaction.guild, {
    title: 'Avertissement',
    description: `<@${target.id}> averti par <@${interaction.user.id}>.`,
    color: 0xd3a13a,
    fields: [{ name: 'Raison', value: reason }, { name: 'Total avertissements', value: String(warns.length) }],
  });

  const modConfig = await moderationConfigStore.find(interaction.guild.id);
  const member = await interaction.guild.members.fetch(target.id).catch(() => null);
  await applyEscalation(interaction.guild, member, warns, modConfig);

  // Contestation par formulaire (roadmap n°279) : bouton dans le DM,
  // ouvre un modal cote membre (voir registry.js) et notifie le staff.
  const contestButton = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(buildSanctionContestId(interaction.guild.id, 'warn', target.id, Date.now()))
      .setLabel('⚖️ Contester cette sanction')
      .setStyle(ButtonStyle.Secondary),
  );
  await target.send({
    content: `Tu as recu un avertissement sur **${interaction.guild.name}** : ${reason}`,
    components: [contestButton],
  }).catch(() => {});
  await interaction.reply({
    content: `<@${target.id}> averti (${warns.length} avertissement(s) au total).`,
    flags: MessageFlags.Ephemeral,
  });
}

module.exports = handleWarnCommand;
