'use strict';
// Deterministic generative artwork for slides that have no photo. Colours are CSS variables, so the same
// art re-tints itself on every tone. Output is a self-contained inline SVG (rasterised once on PPTX export).

function rng(seed) {
  let a = (seed ^ 0x9e3779b9) >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const pick = (rand, list) => list[Math.floor(rand() * list.length)];
const weighted = (rand, entries) => { const total = entries.reduce((s, [, w]) => s + w, 0); let r = rand() * total; for (const [v, w] of entries) { if ((r -= w) <= 0) return v; } return entries[0][0]; };
const fill = name => `style="fill:var(--${name})"`;
const f = n => Math.round(n * 10) / 10;

// Bauhaus-style grid of geometric tiles. Reads as a deliberate graphic, not decoration noise.
function bauhaus(w, h, rand) {
  const cols = w / h > 1.4 ? 4 : w / h < 0.7 ? 2 : 3, s = w / cols, rows = Math.max(2, Math.round(h / s));
  const cell = h / rows;
  const bgs = [['accent', 3], ['accent2', 2], ['ink', 2], ['bg2', 3], ['bg', 1]];
  const shapes = [['circle', 3], ['half', 3], ['quarter', 4], ['rings', 2], ['bars', 2], ['diamond', 1], ['empty', 1]];
  const onTop = { accent: ['ink', 'bg', 'accent2'], accent2: ['bg', 'accent', 'ink'], ink: ['accent', 'accent2', 'bg'], bg2: ['accent', 'accent2', 'ink'], bg: ['accent', 'accent2'] };
  let out = '', previous = [];
  for (let r = 0; r < rows; r++) {
    const row = [];
    for (let c = 0; c < cols; c++) {
      let bg, tries = 0;
      do { bg = weighted(rand, bgs); tries++; } while ((bg === row[c - 1] || bg === previous[c]) && tries < 12);
      row.push(bg);
      const x = c * s, y = r * cell, shape = weighted(rand, shapes), fg = pick(rand, onTop[bg]);
      out += `<rect x="${f(x)}" y="${f(y)}" width="${f(s + .5)}" height="${f(cell + .5)}" ${fill(bg)}/>`;
      const cx = x + s / 2, cy = y + cell / 2, R = Math.min(s, cell) / 2, rot = Math.floor(rand() * 4);
      if (shape === 'circle') out += `<circle cx="${f(cx)}" cy="${f(cy)}" r="${f(R * .8)}" ${fill(fg)}/>`;
      else if (shape === 'rings') out += [1, .7, .4].map((k, i) => `<circle cx="${f(cx)}" cy="${f(cy)}" r="${f(R * .86 * k)}" ${fill(i % 2 ? bg : fg)}/>`).join('');
      else if (shape === 'diamond') out += `<path d="M${f(cx)} ${f(cy - R * .85)}L${f(cx + R * .85)} ${f(cy)}L${f(cx)} ${f(cy + R * .85)}L${f(cx - R * .85)} ${f(cy)}Z" ${fill(fg)}/>`;
      else if (shape === 'bars') { const n = 4, g = Math.min(s, cell) / (n * 2); for (let i = 0; i < n; i++) out += rot % 2 ? `<rect x="${f(x + g * (2 * i + .5))}" y="${f(y)}" width="${f(g)}" height="${f(cell)}" ${fill(fg)}/>` : `<rect x="${f(x)}" y="${f(y + g * (2 * i + .5))}" width="${f(s)}" height="${f(g)}" ${fill(fg)}/>`; }
      else if (shape === 'half' || shape === 'quarter') {
        const q = shape === 'quarter', rr = q ? Math.min(s, cell) : Math.min(s, cell) / 2, ox = [x, x + s, x + s, x][rot], oy = [y, y, y + cell, y + cell][rot];
        if (q) { const sx = [1, -1, -1, 1][rot], sy = [1, 1, -1, -1][rot]; out += `<path d="M${f(ox)} ${f(oy)}L${f(ox + sx * rr)} ${f(oy)}A${f(rr)} ${f(rr)} 0 0 ${sx * sy > 0 ? 1 : 0} ${f(ox)} ${f(oy + sy * rr)}Z" ${fill(fg)}/>`; }
        else { const horizontal = rot % 2 === 0, side = rot < 2 ? 1 : -1; out += horizontal ? `<path d="M${f(x)} ${f(cy)}A${f(s / 2)} ${f(s / 2)} 0 0 ${side > 0 ? 1 : 0} ${f(x + s)} ${f(cy)}Z" ${fill(fg)}/>` : `<path d="M${f(cx)} ${f(y)}A${f(cell / 2)} ${f(cell / 2)} 0 0 ${side > 0 ? 0 : 1} ${f(cx)} ${f(y + cell)}Z" ${fill(fg)}/>`; }
      }
    }
    previous = row;
  }
  return out;
}

// Concentric arcs bleeding off the canvas, one filled accent disc. Calm and architectural.
function rings(w, h, rand) {
  const cx = w * (.2 + rand() * .6), cy = h * (.35 + rand() * .45), max = Math.hypot(w, h) * .75;
  let out = `<rect width="${w}" height="${h}" ${fill('bg2')}/>`;
  for (let i = 9; i >= 1; i--) out += `<circle cx="${f(cx)}" cy="${f(cy)}" r="${f(max * i / 9)}" style="fill:none;stroke:var(--line);stroke-width:${i % 3 ? 3 : 5}"/>`;
  out += `<circle cx="${f(cx)}" cy="${f(cy)}" r="${f(Math.min(w, h) * .2)}" ${fill('accent')}/>`;
  out += `<circle cx="${f(w * (.15 + rand() * .7))}" cy="${f(h * (.1 + rand() * .3))}" r="${f(Math.min(w, h) * .06)}" ${fill('accent2')}/>`;
  return out;
}

// Layered flowing bands. Works behind or beside text on any tone.
function waves(w, h, rand) {
  let out = `<rect width="${w}" height="${h}" ${fill('bg2')}/>`;
  const layers = [['line', .34], ['accent2', .5], ['accent', .68], ['ink', .86]];
  layers.forEach(([color, base], li) => {
    const a1 = h * (.05 + rand() * .05), a2 = h * (.02 + rand() * .03), p1 = rand() * 6.28, p2 = rand() * 6.28, k1 = 1.2 + rand() * 1.3, k2 = 3 + rand() * 2;
    let d = `M0 ${h}`;
    for (let x = 0; x <= w; x += 12) d += `L${x} ${f(h * base + Math.sin(x / w * Math.PI * k1 + p1 + li) * a1 + Math.sin(x / w * Math.PI * k2 + p2) * a2)}`;
    out += `<path d="${d}L${w} ${h}Z" ${fill(color)}/>`;
  });
  return out;
}

const GENERATORS = { bauhaus, rings, waves };
const ART_NAMES = Object.keys(GENERATORS);

// seed: any number (usually the slide index); w/h are the SVG viewBox and should match the target box ratio.
function art(type, { w = 720, h = 1080, seed = 1 } = {}) {
  const generate = GENERATORS[type];
  if (!generate) throw new Error(`Unknown art "${type}". Available: ${ART_NAMES.join(', ')}`);
  const body = generate(w, h, rng(seed * 7919 + 13));
  return `<div class="art" data-pptx-raster aria-hidden="true"><svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="xMidYMid slice" width="100%" height="100%">${body}</svg></div>`;
}

module.exports = { art, ART_NAMES };
