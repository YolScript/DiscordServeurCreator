const { kvGet } = require('../../kv/cloudflareKv');

// /ping avec latence bot + API Discord + KV (roadmap n°483).
async function handlePingCommand(interaction) {
  const start = Date.now();
  await interaction.deferReply();
  const apiLatency = Date.now() - start;

  const kvStart = Date.now();
  await kvGet('bot:status').catch(() => null);
  const kvLatency = Date.now() - kvStart;

  await interaction.editReply(
    `🏓 Pong !\n`
    + `WebSocket : **${interaction.client.ws.ping}ms**\n`
    + `API Discord : **${apiLatency}ms**\n`
    + `KV : **${kvLatency}ms**`,
  );
}

module.exports = handlePingCommand;
