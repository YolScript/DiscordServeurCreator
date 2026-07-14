const { MessageFlags, EmbedBuilder } = require('discord.js');
const warnStore = require('../../kv/warnStore');

async function handleWarningsCommand(interaction) {
  const target = interaction.options.getUser('membre', true);
  const warns = await warnStore.list(interaction.guild.id, target.id);

  if (warns.length === 0) {
    await interaction.reply({ content: `<@${target.id}> n'a aucun avertissement.`, flags: MessageFlags.Ephemeral });
    return;
  }

  const embed = new EmbedBuilder()
    .setTitle(`Avertissements de ${target.username}`)
    .setColor(0xd3a13a)
    .setDescription(
      warns.map((w, idx) => `**${idx + 1}.** ${w.reason} — <@${w.moderatorId}>, <t:${Math.floor(w.createdAt / 1000)}:R> (${w.source})`).join('\n'),
    );

  await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
}

module.exports = handleWarningsCommand;
