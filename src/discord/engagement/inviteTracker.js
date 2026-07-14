const referralStore = require('../../kv/referralStore');
const logger = require('../../shared/logger');

// Cache en memoire : guildId -> Map<inviteCode, uses>. Sert a determiner par
// difference quelle invitation a ete utilisee lors d'une arrivee (Discord ne
// fournit pas directement "quelle invite a ete utilisee" sur guildMemberAdd).
const cache = new Map();

async function snapshotGuildInvites(guild) {
  try {
    const invites = await guild.invites.fetch();
    const map = new Map(invites.map((inv) => [inv.code, inv.uses ?? 0]));
    cache.set(guild.id, map);
  } catch (err) {
    logger.error('inviteTracker.snapshot', err);
  }
}

async function resolveInviterOnJoin(member) {
  const before = cache.get(member.guild.id) ?? new Map();
  let after;
  try {
    const invites = await member.guild.invites.fetch();
    after = new Map(invites.map((inv) => [inv.code, { uses: inv.uses ?? 0, inviterId: inv.inviter?.id }]));
  } catch (err) {
    logger.error('inviteTracker.resolve', err);
    return null;
  }

  let inviterId = null;
  for (const [code, data] of after.entries()) {
    const previousUses = before.get(code) ?? 0;
    if (data.uses > previousUses) {
      inviterId = data.inviterId;
      break;
    }
  }

  cache.set(member.guild.id, new Map([...after.entries()].map(([code, d]) => [code, d.uses])));

  if (!inviterId || inviterId === member.id) return null;

  const count = await referralStore.increment(member.guild.id, inviterId);
  const roles = await referralStore.listRoles(member.guild.id);
  const applicable = roles.filter((r) => r.count <= count);
  if (applicable.length) {
    const inviterMember = await member.guild.members.fetch(inviterId).catch(() => null);
    if (inviterMember) {
      for (const r of applicable) {
        if (!inviterMember.roles.cache.has(r.roleId)) await inviterMember.roles.add(r.roleId).catch(() => {});
      }
    }
  }
  return { inviterId, count };
}

module.exports = { snapshotGuildInvites, resolveInviterOnJoin };
