const { createCanvas, loadImage } = require('@napi-rs/canvas');

const WIDTH = 900;
const HEIGHT = 280;

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

async function buildRankCard({
  username, avatarUrl, level, xp, currentLevelXp, nextLevelXp, rank, messageCount, voiceMinutes,
}) {
  const canvas = createCanvas(WIDTH, HEIGHT);
  const ctx = canvas.getContext('2d');

  const bg = ctx.createLinearGradient(0, 0, WIDTH, HEIGHT);
  bg.addColorStop(0, '#1a1a2e');
  bg.addColorStop(1, '#16213e');
  ctx.fillStyle = bg;
  roundRect(ctx, 0, 0, WIDTH, HEIGHT, 24);
  ctx.fill();

  const avatarSize = 180;
  const avatarX = 50;
  const avatarY = (HEIGHT - avatarSize) / 2;
  try {
    const avatar = await loadImage(avatarUrl);
    ctx.save();
    ctx.beginPath();
    ctx.arc(avatarX + avatarSize / 2, avatarY + avatarSize / 2, avatarSize / 2, 0, Math.PI * 2);
    ctx.closePath();
    ctx.clip();
    ctx.drawImage(avatar, avatarX, avatarY, avatarSize, avatarSize);
    ctx.restore();
  } catch {
    ctx.fillStyle = '#5865f2';
    ctx.beginPath();
    ctx.arc(avatarX + avatarSize / 2, avatarY + avatarSize / 2, avatarSize / 2, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.strokeStyle = '#5b8def';
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.arc(avatarX + avatarSize / 2, avatarY + avatarSize / 2, avatarSize / 2, 0, Math.PI * 2);
  ctx.stroke();

  const textX = avatarX + avatarSize + 40;

  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 42px sans-serif';
  ctx.fillText(username, textX, 90);

  ctx.fillStyle = '#9aa4c7';
  ctx.font = '26px sans-serif';
  ctx.fillText(`Rang #${rank}`, textX, 130);

  ctx.fillStyle = '#5b8def';
  ctx.font = 'bold 30px sans-serif';
  ctx.textAlign = 'right';
  ctx.fillText(`Niveau ${level}`, WIDTH - 50, 90);
  ctx.fillStyle = '#9aa4c7';
  ctx.font = '22px sans-serif';
  ctx.fillText(`${messageCount} messages · ${voiceMinutes} min vocal`, WIDTH - 50, 130);
  ctx.textAlign = 'left';

  const barX = textX;
  const barY = 180;
  const barW = WIDTH - textX - 50;
  const barH = 28;
  const progress = Math.min(1, Math.max(0, (xp - currentLevelXp) / (nextLevelXp - currentLevelXp)));

  ctx.fillStyle = '#2a2f4a';
  roundRect(ctx, barX, barY, barW, barH, barH / 2);
  ctx.fill();

  if (progress > 0) {
    const fillGrad = ctx.createLinearGradient(barX, 0, barX + barW, 0);
    fillGrad.addColorStop(0, '#5b8def');
    fillGrad.addColorStop(1, '#8b5cf6');
    ctx.fillStyle = fillGrad;
    roundRect(ctx, barX, barY, Math.max(barH, barW * progress), barH, barH / 2);
    ctx.fill();
  }

  ctx.fillStyle = '#9aa4c7';
  ctx.font = '20px sans-serif';
  ctx.fillText(`${xp - currentLevelXp} / ${nextLevelXp - currentLevelXp} XP`, barX, barY + barH + 30);

  return canvas.encode('png');
}

module.exports = { buildRankCard };
