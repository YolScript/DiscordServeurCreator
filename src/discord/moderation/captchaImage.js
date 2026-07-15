const { createCanvas } = require('@napi-rs/canvas');

const WIDTH = 300;
const HEIGHT = 110;
const CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // sans 0/O/1/I/L, ambigus

function randomCode(length = 5) {
  let code = '';
  for (let i = 0; i < length; i += 1) code += CHARS[Math.floor(Math.random() * CHARS.length)];
  return code;
}

function randomColor() {
  const h = Math.floor(Math.random() * 360);
  return `hsl(${h}, 70%, 55%)`;
}

function generateCaptchaImage(code) {
  const canvas = createCanvas(WIDTH, HEIGHT);
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = '#1a1a2e';
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  for (let i = 0; i < 6; i += 1) {
    ctx.strokeStyle = randomColor();
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(Math.random() * WIDTH, Math.random() * HEIGHT);
    ctx.lineTo(Math.random() * WIDTH, Math.random() * HEIGHT);
    ctx.stroke();
  }

  const charWidth = WIDTH / code.length;
  ctx.font = 'bold 48px sans-serif';
  ctx.textBaseline = 'middle';
  [...code].forEach((char, i) => {
    ctx.save();
    ctx.translate(charWidth * i + charWidth / 2, HEIGHT / 2 + (Math.random() * 16 - 8));
    ctx.rotate((Math.random() * 0.6 - 0.3));
    ctx.fillStyle = randomColor();
    ctx.textAlign = 'center';
    ctx.fillText(char, 0, 0);
    ctx.restore();
  });

  for (let i = 0; i < 80; i += 1) {
    ctx.fillStyle = 'rgba(255,255,255,0.15)';
    ctx.fillRect(Math.random() * WIDTH, Math.random() * HEIGHT, 2, 2);
  }

  return canvas.encode('png');
}

module.exports = { randomCode, generateCaptchaImage };
