require('dotenv').config({ quiet: true });
const { REST, Routes } = require('discord.js');
const commands = require('../src/discord/commandDefinitions');

const token = process.env.DISCORD_TOKEN;
const clientId = process.env.DISCORD_CLIENT_ID;
const guildId = process.argv[2];

(async () => {
  const rest = new REST().setToken(token);
  if (guildId) {
    await rest.put(Routes.applicationGuildCommands(clientId, guildId), { body: commands });
    console.log(`${commands.length} commande(s) deployee(s) sur la guilde ${guildId} (instantane).`);
  } else {
    await rest.put(Routes.applicationCommands(clientId), { body: commands });
    console.log(`${commands.length} commande(s) deployee(s) globalement (propagation ~1h).`);
  }
})().catch((err) => {
  console.error('Echec du deploiement des commandes:', err);
  process.exit(1);
});
