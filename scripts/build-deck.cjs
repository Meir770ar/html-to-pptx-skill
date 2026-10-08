#!/usr/bin/env node
'use strict';
// Spec (JSON) -> interactive HTML deck. Content goes in the spec; layout, type, colour and motion come
// from the design system, so every slide inherits the same quality bar.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { LAYOUTS, COMMON, TONES, chrome } = require('./deck/layouts.cjs');
const { THEMES, FONTS, resolveTheme, themeCss } = require('./deck/themes.cjs');
const { esc } = require('./deck/text.cjs');

const ROOT = path.resolve(__dirname, '..');
const TOP_LEVEL = ['title', 'lang', 'theme', 'brand', 'author', 'palette', 'fonts', 'fontFiles', 'chrome', 'slides'];
const RTL_LANGS = new Set(['he', 'ar', 'fa', 'yi']);
const IMAGE_TYPES = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif', '.svg', '.avif']);

function validateSpec(spec) {
  const errors = [];
  if (!spec || typeof spec !== 'object' || Array.isArray(spec)) throw new Error('The spec must be a JSON object');
  for (const key of Object.keys(spec)) if (!TOP_LEVEL.includes(key)) errors.push(`Unknown top-level field "${key}". Allowed: ${TOP_LEVEL.join(', ')}`);
  if (!spec.title) errors.push('Missing "title" (the deck name)');
  if (spec.theme && !THEMES[spec.theme]) errors.push(`Unknown theme "${spec.theme}". Available: ${Object.keys(THEMES).join(', ')}`);
  if (!Array.isArray(spec.slides) || !spec.slides.length) errors.push('"slides" must be a non-empty list');
  (spec.slides || []).forEach((slide, i) => {
    const where = `Slide ${i + 1}`;
    const layout = LAYOUTS[slide?.layout];
    if (!layout) { errors.push(`${where}: unknown layout "${slide?.layout}". Available: ${Object.keys(LAYOUTS).join(', ')}`); return; }
    const allowed = new Set([...COMMON, ...layout.required, ...layout.optional]);
    for (const key of Object.keys(slide)) if (!allowed.has(key)) errors.push(`${where} (${slide.layout}): unknown field "${key}". Allowed: ${[...allowed].join(', ')}`);
    for (const key of layout.required) if (slide[key] === undefined || slide[key] === '') errors.push(`${where} (${slide.layout}): missing required field "${key}"`);
    if (slide.tone && !TONES.includes(slide.tone)) errors.push(`${where}: tone must be one of ${TONES.join(', ')}`);
  });
  if (errors.length) throw new Error(`Spec problems:\n- ${errors.join('\n- ')}`);
}

function build(specPath, outDir, { overwrite = false } = {}) {
  const specFile = path.resolve(specPath), base = path.dirname(specFile);
  const spec = JSON.parse(fs.readFileSync(specFile, 'utf8'));
  validateSpec(spec);
  const out = path.resolve(outDir);
  if (fs.existsSync(out) && fs.readdirSync(out).length && !overwrite) throw new Error(`Output directory is not empty: ${out}. Use --overwrite to rebuild it.`);
  fs.mkdirSync(path.join(out, 'fonts'), { recursive: true });

  const lang = spec.lang || 'he', dir = RTL_LANGS.has(lang) ? 'rtl' : 'ltr';
  const theme = resolveTheme(spec.theme || 'editorial', { palette: spec.palette, titleFont: spec.fonts?.title, bodyFont: spec.fonts?.body });
  const copied = new Map();
  const asset = src => {
    if (/^(https?:|data:)/i.test(src)) return src;
    const absolute = path.resolve(base, src);
    if (!fs.existsSync(absolute)) throw new Error(`Image not found: ${src} (looked in ${base})`);
    if (!IMAGE_TYPES.has(path.extname(absolute).toLowerCase())) throw new Error(`Unsupported image type: ${src}`);
    if (!copied.has(absolute)) {
      const data = fs.readFileSync(absolute), hash = crypto.createHash('sha1').update(data).digest('hex').slice(0, 8);
      const name = `${hash}-${path.basename(absolute).replace(/[^\w.\-]+/g, '_')}`;
      fs.mkdirSync(path.join(out, 'assets'), { recursive: true });
      fs.writeFileSync(path.join(out, 'assets', name), data);
      copied.set(absolute, `assets/${name}`);
    }
    return copied.get(absolute);
  };

  let sectionNo = 0;
  const sections = spec.slides.map((slide, index) => {
    const layout = LAYOUTS[slide.layout];
    if (slide.layout === 'section') sectionNo++;
    const tone = slide.tone || layout.tone(theme);
    const ctx = { theme, deck: spec, index, frag: slide.fragments === true, asset, sectionNo };
    let html;
    try { html = layout.render(slide, ctx); } catch (error) { throw new Error(`Slide ${index + 1} (${slide.layout}): ${error.message}`); }
    if (layout.chrome !== false) html += chrome(ctx);
    const classes = ['slide', `L-${slide.layout}`, `tone-${tone}`, layout.classes?.(slide)].filter(Boolean).join(' ');
    return `<section class="${classes}${index === 0 ? ' is-active' : ''}" data-pptx-slide data-layout="${slide.layout}" id="${esc(slide.id || `s${index + 1}`)}" data-notes="${esc(slide.notes || '')}">${html}</section>`;
  });

  // Fonts: bundled OFL families are copied on demand; user-supplied licensed files are declared explicitly.
  const used = new Set([theme.titleFamily, theme.bodyFamily]);
  for (const family of used) {
    const font = FONTS[family];
    if (font) for (const file of Object.values(font.files)) fs.copyFileSync(path.join(ROOT, 'assets/fonts', file), path.join(out, 'fonts', file));
  }
  let customFaces = '';
  for (const entry of spec.fontFiles || []) {
    if (!entry.family || !entry.file) throw new Error('Each fontFiles entry needs "family" and "file"');
    const source = path.resolve(base, entry.file), name = path.basename(source);
    if (!fs.existsSync(source)) throw new Error(`Font file not found: ${entry.file}`);
    fs.copyFileSync(source, path.join(out, 'fonts', name));
    const format = { '.woff2': 'woff2', '.woff': 'woff', '.ttf': 'truetype', '.otf': 'opentype' }[path.extname(name).toLowerCase()];
    if (!format) throw new Error(`Unsupported font format: ${name}`);
    customFaces += `@font-face{font-family:'${entry.family}';font-weight:${entry.weight || '400'};font-style:normal;font-display:block;src:url(fonts/${name}) format('${format}')}\n`;
  }

  const css = `${customFaces}${themeCss(theme)}\n${fs.readFileSync(path.join(ROOT, 'assets/system/deck-system.css'), 'utf8')}`;
  const html = `<!doctype html>
<html lang="${esc(lang)}" dir="${dir}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(spec.title)}</title>${spec.author ? `<meta name="author" content="${esc(spec.author)}">` : ''}<link rel="stylesheet" href="deck.css"></head>
<body><main class="stage" aria-label="${esc(spec.title)}">
${sections.join('\n')}
</main>
<nav class="controls" data-pptx-ignore aria-label="ניווט במצגת"><button data-prev aria-label="חזרה">הקודם</button><span class="counter" aria-live="polite"></span><button data-next aria-label="התקדמות">הבא</button><button data-fullscreen>מסך מלא</button><button data-present>מצב מרצה</button></nav>
<div class="progress" data-pptx-ignore aria-hidden="true"><i></i></div><div class="status" data-pptx-ignore role="status"></div>
<aside class="notes-panel" data-pptx-ignore aria-label="הערות מרצה"><h3>הערות מרצה</h3><textarea aria-label="עריכת הערות המרצה"></textarea><p class="next-title"></p><span data-timer>0:00</span></aside>
<script src="deck-runtime.js"></script></body></html>
`;
  fs.writeFileSync(path.join(out, 'deck.css'), css);
  fs.copyFileSync(path.join(ROOT, 'assets/deck-runtime.js'), path.join(out, 'deck-runtime.js'));
  fs.writeFileSync(path.join(out, 'index.html'), html);
  fs.copyFileSync(specFile, path.join(out, 'deck.spec.json'));
  return { out, index: path.join(out, 'index.html'), slides: spec.slides.length, theme: theme.name, dir, fontsNeeded: [...used].filter(f => FONTS[f]).map(f => ({ family: f, ttf: FONTS[f].ttf })) };
}

module.exports = { build, validateSpec };

if (require.main === module) {
  const args = process.argv.slice(2), overwrite = args.includes('--overwrite'), pos = args.filter(a => !a.startsWith('--'));
  try {
    if (pos.length !== 2) throw new Error('Usage: node scripts/build-deck.cjs spec.json OUTPUT-DIR [--overwrite]');
    console.log(JSON.stringify(build(pos[0], pos[1], { overwrite }), null, 2));
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
