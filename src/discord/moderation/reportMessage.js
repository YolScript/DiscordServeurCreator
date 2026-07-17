const { MessageFlags } = require('discord.js');
const { kvGet, kvPut } = require('../../kv/cloudflareKv');
const { postModLog } = require('./modLog');
const logger = require('../../shared/logger');

// File de signalements (roadmap n°147) : commande contextuelle « Signaler au
// staff » sur n'importe quel message — signalement stocke en KV (traite dans
// le dashboard, section Moderation) + alerte immediate dans le modlog.
const reportsKey = (guildId) => `guild:${guildId}:reports`;

async function handleReportCommand(interaction) {
  const message = interaction.targetMessage;
  const key = reportsKey(interaction.guild.id);
  const reports = (await kvGet(key)) || [];

  if (reports.some((r) => r.messageId === message.id && r.status === 'open')) {
    await interaction.reply({ content: 'Ce message a deja ete signale, le staff est prevenu.', flags: MessageFlags.Ephemeral });
    return;
  }

  reports.push({
    id: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
    messageId: message.id,
    channelId: message.channel.id,
    authorId: message.author?.id || null,
    authorTag: message.author?.tag || 'inconnu',
    reporterId: interaction.user.id,
    reporterTag: interaction.user.tag,
    excerpt: (message.content || '(sans texte : image/embed)').slice(0, 300),
    reportedAt: Date.now(),
    status: 'open',
  });
  await kvPut(key, reports.slice(-100));

  await postModLog(interaction.guild, {
    title: '🚩 Message signale',
    description: `${interaction.user.tag} a signale un message de **${message.author?.tag || 'inconnu'}** dans <#${message.channel.id}>.\n> ${(message.content || '(sans texte)').slice(0, 200)}\n[Aller au message](${message.url})`,
    color: 0xd9a03c,
  }).catch((err) => logger.error('reportMessage.modlog', err));

  await interaction.reply({ content: 'Message signale au staff, merci. Ils le traiteront au plus vite.', flags: MessageFlags.Ephemeral });
}

module.exports = { handleReportCommand };
