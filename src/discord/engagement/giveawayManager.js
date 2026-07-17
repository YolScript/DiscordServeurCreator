const {
  EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle,
} = require('discord.js');
const client = require('../client');
const giveawayStore = require('../../kv/giveawayStore');
const { buildGiveawayEnterId } = require('../interactions/customIds');
const { sendPushToGuild } = require('../../shared/webPush');
const logger = require('../../shared/logger');

function buildGiveawayEmbed(giveaway) {
  const embed = new EmbedBuilder()
    .setTitle(`🎉 ${giveaway.prize}`)
    .setColor(giveaway.closed ? 0x8b8d95 : 0x30a46c)
    .addFields(
      { name: 'Participants', value: String(giveaway.entrants.length), inline: true },
      { name: 'Gagnants', value: String(giveaway.winnersCount), inline: true },
      ...(giveaway.requiredRoleId ? [{ name: 'Role requis', value: `<@&${giveaway.requiredRoleId}>`, inline: true }] : []),
    );
  if (giveaway.closed) {
    embed.setDescription(giveaway.winners.length
      ? `Gagnant(s) : ${giveaway.winners.map((id) => `<@${id}>`).join(', ')}`
      : 'Aucun participant, pas de gagnant.');
    embed.setFooter({ text: 'Giveaway termine' });
  } else {
    embed.setDescription('Clique sur le bouton pour participer !');
    embed.setFooter({ text: `Se termine <t:${Math.floor(giveaway.endsAt / 1000)}:R>` });
  }
  return embed;
}

function buildGiveawayComponents(giveaway) {
  if (giveaway.closed) return [];
  return [new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(buildGiveawayEnterId(giveaway.id)).setLabel('Participer').setEmoji('🎉').setStyle(ButtonStyle.Success),
  )];
}

async function refreshMessage(guild, giveaway) {
  const channel = await guild.channels.fetch(giveaway.channelId).catch(() => null);
  if (!channel) return;
  const message = await channel.messages.fetch(giveaway.messageId).catch(() => null);
  if (!message) return;
  await message.edit({ embeds: [buildGiveawayEmbed(giveaway)], components: buildGiveawayComponents(giveaway) }).catch(() => {});
}

async function handleEnter(interaction, giveawayId) {
  const existing = (await giveawayStore.list(interaction.guild.id)).find((g) => g.id === giveawayId);
  if (existing?.requiredRoleId && !interaction.member.roles.cache.has(existing.requiredRoleId)) {
    return { deniedRoleId: existing.requiredRoleId };
  }
  const giveaway = await giveawayStore.update(interaction.guild.id, giveawayId, (g) => {
    if (!g.entrants.includes(interaction.user.id)) g.entrants.push(interaction.user.id);
  });
  if (!giveaway) return null;
  await refreshMessage(interaction.guild, giveaway);
  return null;
}

// Retire les gagnants precedents des entrants pour ne jamais les retirer au
// hasard (permet de relancer plusieurs fois si un gagnant ne repond pas).
// Identifie par messageId (recuperable via clic droit > Copier l'ID sur le
// message du giveaway), pas par l'id interne jamais affiche a l'utilisateur.
async function reroll(guild, messageId) {
  const giveaways = await giveawayStore.list(guild.id);
  const giveaway = giveaways.find((g) => g.messageId === messageId);
  if (!giveaway || !giveaway.closed) return null;

  const pool = giveaway.entrants.filter((id) => !giveaway.winners.includes(id));
  const newWinners = pickWinners(pool, giveaway.winnersCount);
  giveaway.winners = newWinners;
  await giveawayStore.replaceAll(guild.id, giveaways);
  await refreshMessage(guild, giveaway);
  return giveaway;
}

function pickWinners(entrants, count) {
  const pool = [...entrants];
  const winners = [];
  while (pool.length && winners.length < count) {
    const idx = Math.floor(Math.random() * pool.length);
    winners.push(pool.splice(idx, 1)[0]);
  }
  return winners;
}

async function tick() {
  for (const guild of client.guilds.cache.values()) {
    const giveaways = await giveawayStore.list(guild.id);
    const active = giveaways.filter((g) => !g.closed);
    if (active.length === 0) continue;

    const now = Date.now();
    let changed = false;
    for (const giveaway of active) {
      if (giveaway.endsAt > now) continue;
      giveaway.closed = true;
      giveaway.winners = pickWinners(giveaway.entrants, giveaway.winnersCount);
      changed = true;
      await refreshMessage(guild, giveaway).catch((err) => logger.error('giveawayManager.close', err));

      if (giveaway.winners.length) {
        const channel = await guild.channels.fetch(giveaway.channelId).catch(() => null);
        if (channel) {
          await channel.send(`🎉 Felicitations ${giveaway.winners.map((id) => `<@${id}>`).join(', ')} ! Tu remportes **${giveaway.prize}**.`).catch(() => {});
        }
      }
      sendPushToGuild(guild.id, {
        title: '🎉 Giveaway termine',
        body: giveaway.winners.length ? `${giveaway.prize} — ${giveaway.winners.length} gagnant(s) tire(s) au sort.` : `${giveaway.prize} — aucun participant, pas de gagnant.`,
        url: `app.html?guild=${guild.id}`,
        tag: 'giveaway',
      }).catch((err) => logger.error('giveawayManager.pushEnded', err));
    }
    if (changed) await giveawayStore.replaceAll(guild.id, giveaways);
  }
}

function start() {
  setInterval(() => { tick().catch((err) => logger.error('giveawayManager.tick', err)); }, 30_000);
}

module.exports = {
  buildGiveawayEmbed, buildGiveawayComponents, handleEnter, reroll, start,
};
