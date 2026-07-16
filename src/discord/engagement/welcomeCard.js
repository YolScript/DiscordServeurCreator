const { createCanvas, loadImage, GlobalFonts } = require('@napi-rs/canvas');
const logger = require('../../shared/logger');

// Carte de bienvenue en image (roadmap n°092) : fond degrade assorti au
// dashboard, avatar rond, pseudo et compteur de membres. Fontes DejaVu
// embarquees via npm (les runtimes Linux minimaux n'ont pas toujours de
// fontes systeme, le texte serait invisible sans ca).
try {
  GlobalFonts.registerFromPath(require.resolve('dejavu-fonts-ttf/ttf/DejaVuSans.ttf'), 'DejaVu');
  GlobalFonts.registerFromPath(require.resolve('dejavu-fonts-ttf/ttf/DejaVuSans-Bold.ttf'), 'DejaVu');
} catch (err) {
  logger.error('welcomeCard.fonts', err);
}

const WIDTH = 800;
const HEIGHT = 260;

async function generateWelcomeCard(member) {
  const canvas = createCanvas(WIDTH, HEIGHT);
  const ctx = canvas.getContext('2d');

  const bg = ctx.createLinearGradient(0, 0, WIDTH, HEIGHT);
  bg.addColorStop(0, '#1a1013');
  bg.addColorStop(1, '#2e1e23');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  ctx.fillStyle = '#c97a5c';
  ctx.fillRect(0, 0, WIDTH, 6);

  const avatar = await loadImage(member.user.displayAvatarURL({ extension: 'png', size: 256 }));
  const radius = 80;
  const ax = 130;
  const ay = HEIGHT / 2 + 3;
  ctx.save();
  ctx.beginPath();
  ctx.arc(ax, ay, radius, 0, Math.PI * 2);
  ctx.closePath();
  ctx.clip();
  ctx.drawImage(avatar, ax - radius, ay - radius, radius * 2, radius * 2);
  ctx.restore();
  ctx.beginPath();
  ctx.arc(ax, ay, radius + 3, 0, Math.PI * 2);
  ctx.strokeStyle = '#c97a5c';
  ctx.lineWidth = 5;
  ctx.stroke();

  ctx.fillStyle = '#f0e7e3';
  ctx.font = 'bold 44px DejaVu';
  ctx.fillText('Bienvenue !', 250, 108);
  ctx.font = 'bold 32px DejaVu';
  ctx.fillText(member.user.username.slice(0, 22), 250, 156);
  ctx.fillStyle = '#b3a49d';
  ctx.font = '24px DejaVu';
  ctx.fillText(`Membre #${member.guild.memberCount} de ${member.guild.name.slice(0, 26)}`, 250, 198);

  return canvas.toBuffer('image/png');
}

module.exports = { generateWelcomeCard };
