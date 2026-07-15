const { ActionRowBuilder, StringSelectMenuBuilder, EmbedBuilder } = require('discord.js');
const reactionRoleStore = require('../../kv/reactionRoleStore');

const SELECT_PREFIX = 'reactionrole_select:';
const buildSelectId = (groupId) => `${SELECT_PREFIX}${groupId}`;

// (Re)poste le message a select menu d'un groupe de roles generiques (pas
// lies aux jeux, cf gameRoleManager/rolesMessageManager pour ce cas
// specifique). Edite le message existant si possible.
async function postOrRefresh(guild, group) {
  const channel = await guild.channels.fetch(group.channelId).catch(() => null);
  if (!channel || !group.roles?.length) return null;

  const embed = new EmbedBuilder()
    .setTitle(group.title || 'Roles')
    .setDescription('Selectionne un ou plusieurs roles dans le menu ci-dessous.')
    .setColor(0x5865f2);
  const select = new StringSelectMenuBuilder()
    .setCustomId(buildSelectId(group.id))
    .setPlaceholder('Choisis tes roles')
    .setMinValues(0)
    .setMaxValues(group.roles.length)
    .addOptions(group.roles.slice(0, 25).map((r) => ({
      label: r.label.slice(0, 100), value: r.roleId, emoji: r.emoji || undefined,
    })));
  const row = new ActionRowBuilder().addComponents(select);

  const existing = group.messageId ? await channel.messages.fetch(group.messageId).catch(() => null) : null;
  if (existing) {
    await existing.edit({ embeds: [embed], components: [row] });
    return existing;
  }
  const sent = await channel.send({ embeds: [embed], components: [row] });
  await reactionRoleStore.update(guild.id, group.id, (g) => { g.messageId = sent.id; });
  return sent;
}

module.exports = { postOrRefresh, SELECT_PREFIX, buildSelectId };
