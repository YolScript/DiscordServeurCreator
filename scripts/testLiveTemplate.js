require('dotenv').config({ quiet: true });
const { Client, GatewayIntentBits } = require('discord.js');
const { buildLiveTemplate } = require('../src/discord/guildSetup/templates/liveTemplate');

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

client.once('ready', async () => {
  try {
    const template = await buildLiveTemplate(client);
    console.log('label:', template.label);
    console.log('ROLE_BLUEPRINT:', template.ROLE_BLUEPRINT.map((r) => `${r.key}=${r.name}(#${r.color.toString(16)})`));
    console.log('gameRoles:', template.gameRoles.map((r) => r.displayName));
    console.log('specialKeys:', template.specialKeys);
    console.log('guildIconURL:', template.guildIconURL);
    console.log('content:', template.content);
    console.log('modConfig:', template.modConfig);

    const fakeRoleIds = { everyone: 'EVERY' };
    for (const r of template.ROLE_BLUEPRINT) fakeRoleIds[r.key] = `ID_${r.key}`;
    const channelBlueprint = template.getChannelBlueprint(fakeRoleIds);
    for (const cat of channelBlueprint) {
      console.log(`CAT ${cat.key} "${cat.name}" overwrites=${cat.permissionOverwrites.length}`);
      for (const ch of cat.channels) {
        console.log(`  CH ${ch.key} "${ch.name}" type=${ch.type} overwrites=${ch.permissionOverwrites.length}`);
      }
    }
    console.log('OK');
  } catch (err) {
    console.error('ECHEC', err);
  } finally {
    process.exit(0);
  }
});

client.login(process.env.DISCORD_TOKEN);
