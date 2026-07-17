const { MessageFlags } = require('discord.js');

// /roll avance pour serveurs JDR (roadmap n°375) : notation XdY+Z classique
// (ex: 2d20+5, 4d6-1, d100). Distinct de /dice (n°315) qui est un simple jet
// unique sans addition ni multiples des.
const NOTATION = /^(\d{0,2})d(\d{1,4})([+-]\d{1,4})?$/i;

async function handleRollCommand(interaction) {
  const notation = interaction.options.getString('notation', true).trim();
  const match = notation.match(NOTATION);
  if (!match) {
    await interaction.reply({ content: 'Notation invalide. Exemple : `2d20+5`, `4d6-1`, `d100`.', flags: MessageFlags.Ephemeral });
    return;
  }
  const count = Math.min(20, Math.max(1, Number(match[1]) || 1));
  const sides = Math.min(1000, Math.max(2, Number(match[2])));
  const modifier = Number(match[3]) || 0;

  const rolls = Array.from({ length: count }, () => 1 + Math.floor(Math.random() * sides));
  const total = rolls.reduce((a, b) => a + b, 0) + modifier;

  const detail = count > 1 ? `[${rolls.join(', ')}]${modifier ? ` ${modifier > 0 ? '+' : ''}${modifier}` : ''}` : '';
  await interaction.reply(`🎲 **${notation}** → ${detail ? `${detail} = ` : ''}**${total}**`);
}

module.exports = handleRollCommand;
