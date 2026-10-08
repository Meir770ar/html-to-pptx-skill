'use strict';
// Contact sheet: every slide on one image, so a reviewer (human or agent) sees rhythm and consistency at a glance.
const fs = require('node:fs');
const { createCanvas, loadImage } = require('@napi-rs/canvas');

async function contactSheet(pngPaths, output, { columns } = {}) {
  const cols = columns || (pngPaths.length <= 4 ? 2 : 3), width = cols === 2 ? 960 : 640, height = width * 9 / 16, gap = 14;
  const rows = Math.ceil(pngPaths.length / cols);
  const canvas = createCanvas(cols * (width + gap) + gap, rows * (height + gap) + gap), ctx = canvas.getContext('2d');
  ctx.fillStyle = '#6b6b70'; ctx.fillRect(0, 0, canvas.width, canvas.height);
  for (let i = 0; i < pngPaths.length; i++) {
    const image = await loadImage(pngPaths[i]), x = gap + (i % cols) * (width + gap), y = gap + Math.floor(i / cols) * (height + gap);
    ctx.drawImage(image, x, y, width, height);
    ctx.fillStyle = 'rgba(0,0,0,.72)'; ctx.fillRect(x, y, 46, 30);
    ctx.fillStyle = '#fff'; ctx.font = 'bold 20px sans-serif'; ctx.fillText(String(i + 1).padStart(2, '0'), x + 9, y + 22);
  }
  fs.writeFileSync(output, canvas.toBuffer('image/png'));
  return output;
}

module.exports = { contactSheet };
