const { EmbedBuilder } = require('discord.js');
const xpStore = require('../../kv/xpStore');

// /compare @a @b (roadmap n°495).
async function handleCompareCommand(interaction) {
  const a = interaction.options.getUser('membre1', true);
  const b = interaction.options.getUser('membre2', true);
  const [dataA, dataB] = await Promise.all([
    xpStore.getMember(interaction.guild.id, a.id),
    xpStore.getMember(interaction.guild.id, b.id),
  ]);

  const embed = new EmbedBuilder()
    .setTitle(`${a.username} vs ${b.username}`)
    .setColor(0x5b8def)
    .addFields(
      { name: 'Niveau', value: `${dataA.level} vs ${dataB.level}`, inline: true },
      { name: 'XP', value: `${dataA.xp.toLocaleString('fr-FR')} vs ${dataB.xp.toLocaleString('fr-FR')}`, inline: true },
      { name: 'Messages', value: `${dataA.messageCount} vs ${dataB.messageCount}`, inline: true },
      { name: 'Vocal (min)', value: `${dataA.voiceMinutes} vs ${dataB.voiceMinutes}`, inline: true },
    );
  await interaction.reply({ embeds: [embed] });
}

module.exports = handleCompareCommand;
