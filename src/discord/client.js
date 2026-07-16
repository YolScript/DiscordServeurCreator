const { Client, GatewayIntentBits, Partials } = require('discord.js');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildPresences,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    // Starboard (roadmap n°090) : reactions sur des messages potentiellement
    // anciens (non caches), d'ou les partials Message/Reaction/Channel.
    GatewayIntentBits.GuildMessageReactions,
  ],
  partials: [Partials.GuildMember, Partials.User, Partials.Message, Partials.Reaction, Partials.Channel],
});

module.exports = client;
