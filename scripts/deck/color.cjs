'use strict';
// Colour maths for the deck system. Every text/background pair that the themes emit is
// pushed through ensureContrast(), so a brand colour can never make a slide unreadable.
const { contrast, luminance: relativeLuminance } = require('../design-tokens.cjs');

const clamp = (v, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, v));
const hex = value => {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(value).trim());
  if (!m) throw new Error(`Invalid colour "${value}": use a six-digit hex such as #1B1A17`);
  return m[1].toUpperCase();
};
const toRgb = value => { const h = hex(value); return [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16)); };
const fromRgb = rgb => rgb.map(c => Math.round(clamp(c / 255) * 255).toString(16).padStart(2, '0')).join('').toUpperCase();
const mix = (a, b, t) => { const x = toRgb(a), y = toRgb(b); return fromRgb(x.map((c, i) => c + (y[i] - c) * t)); };

function toHsl(value) {
  const [r, g, b] = toRgb(value).map(c => c / 255), max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2, d = max - min;
  if (!d) return [0, 0, l];
  const s = d / (1 - Math.abs(2 * l - 1));
  const h = max === r ? ((g - b) / d + (g < b ? 6 : 0)) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h * 60, s, l];
}
function fromHsl([h, s, l]) {
  const c = (1 - Math.abs(2 * l - 1)) * s, x = c * (1 - Math.abs((h / 60) % 2 - 1)), m = l - c / 2;
  const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  return fromRgb([(r + m) * 255, (g + m) * 255, (b + m) * 255]);
}
const luminance = value => relativeLuminance(hex(value));
const ratio = (a, b) => contrast(hex(a), hex(b));

// Keep the hue, move lightness away from the background until the pair reaches `min`.
function ensureContrast(fg, bg, min = 4.5) {
  if (ratio(fg, bg) >= min) return hex(fg);
  const [h, s, l0] = toHsl(fg), darker = luminance(bg) > 0.4;
  for (let step = 1; step <= 100; step++) {
    const candidate = fromHsl([h, s, clamp(l0 + (darker ? -1 : 1) * step * 0.01)]);
    if (ratio(candidate, bg) >= min) return candidate;
  }
  return darker ? '000000' : 'FFFFFF';
}
// Best readable text colour on a filled shape.
const bestInk = (fill, dark = '111111', light = 'FFFFFF') => ratio(light, fill) >= ratio(dark, fill) ? hex(light) : hex(dark);

module.exports = { hex, mix, ratio, ensureContrast, bestInk };
