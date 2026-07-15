function applyPlaceholders(template, { user, guild }) {
  return (template || '')
    .replaceAll('{user}', `<@${user.id}>`)
    .replaceAll('{username}', user.username)
    .replaceAll('{server}', guild.name)
    .replaceAll('{membercount}', String(guild.memberCount));
}

module.exports = { applyPlaceholders };
