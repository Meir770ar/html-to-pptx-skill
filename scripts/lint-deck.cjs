#!/usr/bin/env node
'use strict';
// Design lint for an HTML deck. It opens every slide in a real browser in its final export state and checks the
// things that make decks look amateur: overflow, collisions, tiny type, low contrast, walls of text, empty slides.
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const puppeteer = require('puppeteer');
const { contactSheet } = require('./deck/sheet.cjs');

const LIMITS = { minFont: 24, warnFont: 28, warnWords: 70, maxWords: 110, tableWords: 150, safeX: 44, safeTop: 30, safeBottom: 40, maxTitleChars: 80 };
const SPARSE_OK = new Set(['cover', 'section', 'statement', 'quote', 'closing', 'image', 'bignumber', 'custom']);
const DENSE = new Set(['points', 'compare', 'steps', 'table', 'agenda']);

// Runs inside the page for one slide. Returns plain data only.
function inspectSlide(index, limits, layout) {
  const slide = document.querySelectorAll('[data-pptx-slide]')[index];
  const sr = slide.getBoundingClientRect(), issues = [];
  const add = (level, rule, message, text) => issues.push({ level, rule, message, text: (text || '').replace(/\s+/g, ' ').trim().slice(0, 60) });
  const rel = r => ({ left: r.left - sr.left, top: r.top - sr.top, right: r.right - sr.left, bottom: r.bottom - sr.top, width: r.width, height: r.height });
  const style = el => getComputedStyle(el);
  const hidden = el => { for (let p = el; p && p !== slide.parentElement; p = p.parentElement) { const s = style(p); if (s.display === 'none' || s.visibility === 'hidden' || Number(s.opacity) === 0) return true; } return false; };
  const ownerOf = node => { let p = node.parentElement; while (p && p !== slide && /^inline/.test(style(p).display)) p = p.parentElement; return p || slide; };
  const parse = value => { const m = value.match(/rgba?\(([^)]+)\)/); if (!m) return null; const v = m[1].split(/[ ,/]+/).map(Number); return { r: v[0], g: v[1], b: v[2], a: v[3] === undefined ? 1 : v[3] }; };
  const lum = ({ r, g, b }) => { const f = c => { c /= 255; return c <= .04045 ? c / 12.92 : ((c + .055) / 1.055) ** 2.4; }; return .2126 * f(r) + .7152 * f(g) + .0722 * f(b); };
  const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + .05) / (Math.min(x, y) + .05); };

  // 1. text owners (block-level elements that directly hold text)
  const owners = new Map();
  const walker = document.createTreeWalker(slide, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (!node.textContent.trim()) continue;
    const el = node.parentElement;
    if (hidden(el) || el.closest('[data-decor],[data-pptx-ignore],script,style')) continue;
    const owner = ownerOf(node);
    if (!owners.has(owner)) owners.set(owner, { nodes: [], rect: null });
    const entry = owners.get(owner);
    entry.nodes.push(node);
    const range = document.createRange(); range.selectNodeContents(node);
    for (const r of range.getClientRects()) {
      if (r.width < .5 || r.height < .5) continue;
      entry.rect = entry.rect ? { left: Math.min(entry.rect.left, r.left), top: Math.min(entry.rect.top, r.top), right: Math.max(entry.rect.right, r.right), bottom: Math.max(entry.rect.bottom, r.bottom) } : { left: r.left, top: r.top, right: r.right, bottom: r.bottom };
    }
  }
  // Glyph boxes of large type extend beyond the line box; clamp vertically to the owner's own box so tight, intentional stacks are not flagged.
  const clamp = (el, r) => { const o = el.getBoundingClientRect(); const top = o.height > 0 ? Math.max(r.top, o.top) : r.top, bottom = o.height > 0 ? Math.min(r.bottom, o.bottom) : r.bottom; return bottom > top ? { ...r, top, bottom } : r; };
  const list = [...owners.entries()].filter(([, v]) => v.rect).map(([el, v]) => { const r = clamp(el, v.rect); return { el, nodes: v.nodes, rect: rel({ ...r, width: r.right - r.left, height: r.bottom - r.top }), isChrome: !!el.closest('.chrome') }; });
  const textOf = item => item.nodes.map(n => n.textContent).join(' ');

  // 2. safe area + container overflow
  for (const item of list) {
    const r = item.rect, full = layout === 'image';
    if (!full && (r.left < limits.safeX - 1 || r.right > 1920 - limits.safeX + 1 || r.top < limits.safeTop || r.bottom > 1080 - limits.safeBottom + 1)) add('error', 'safe-area', `text leaves the safe area (${Math.round(r.left)}-${Math.round(r.right)}px, ${Math.round(r.top)}-${Math.round(r.bottom)}px)`, textOf(item));
    let box = item.el.parentElement;
    while (box && box !== slide) { const s = style(box); if ((parse(s.backgroundColor)?.a > 0) || ['Top', 'Right', 'Bottom', 'Left'].some(side => parseFloat(s[`border${side}Width`]) > 0 && s[`border${side}Style`] !== 'none')) break; box = box.parentElement; }
    if (box && box !== slide) {
      const b = rel(box.getBoundingClientRect());
      if (r.left < b.left - 2 || r.right > b.right + 2 || r.top < b.top - 2 || r.bottom > b.bottom + 2) add('error', 'overflow', 'text spills outside its card or panel', textOf(item));
    }
  }

  // 3. collisions between text blocks, and text on top of pictures
  for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
    const a = list[i], b = list[j];
    if (a.el.contains(b.el) || b.el.contains(a.el)) continue;
    const w = Math.min(a.rect.right, b.rect.right) - Math.max(a.rect.left, b.rect.left), h = Math.min(a.rect.bottom, b.rect.bottom) - Math.max(a.rect.top, b.rect.top);
    if (w > 2 && h > 2 && w * h > .12 * Math.min(a.rect.width * a.rect.height, b.rect.width * b.rect.height)) add('error', 'overlap', 'two text blocks overlap', `${textOf(a)} | ${textOf(b)}`);
  }
  if (layout !== 'image' && layout !== 'custom') {
    const visuals = [...slide.querySelectorAll('.art,img:not(.bleed):not(.q-photo),[data-pptx-raster]:not(.shade)')].filter(v => !hidden(v)).map(v => ({ el: v, rect: rel(v.getBoundingClientRect()) }));
    for (const item of list) for (const v of visuals) {
      if (v.el.contains(item.el) || item.el.contains(v.el)) continue;
      const w = Math.min(item.rect.right, v.rect.right) - Math.max(item.rect.left, v.rect.left), h = Math.min(item.rect.bottom, v.rect.bottom) - Math.max(item.rect.top, v.rect.top);
      if (w > 4 && h > 4 && w * h > .05 * item.rect.width * item.rect.height) add('error', 'text-on-visual', 'text sits on top of a picture or artwork', textOf(item));
    }
  }

  // 4. type size and contrast, per text run
  let words = 0;
  for (const item of list) {
    if (!item.isChrome) words += textOf(item).trim().split(/\s+/).length;
    for (const node of item.nodes) {
      const el = node.parentElement, s = style(el), size = parseFloat(s.fontSize), small = !!el.closest('.chrome,.src');
      if (size < limits.minFont) add('error', 'font-size', `${size}px text is below the ${limits.minFont}px floor`, node.textContent);
      else if (size < limits.warnFont && !small) add('warn', 'font-size', `${size}px is small for a projected slide (aim for ${limits.warnFont}px+)`, node.textContent);
      const fg = parse(s.color);
      if (!fg || layout === 'image') continue;
      const layers = []; let unknown = false;
      for (let p = el; p; p = p.parentElement) { const ps = style(p); if (ps.backgroundImage !== 'none') { unknown = true; break; } const bg = parse(ps.backgroundColor); if (bg && bg.a > 0) { layers.push(bg); if (bg.a >= .99) break; } }
      if (unknown) continue;
      let base = layers.length ? layers[layers.length - 1] : { r: 255, g: 255, b: 255, a: 1 };
      for (let k = layers.length - 2; k >= 0; k--) base = { r: layers[k].r * layers[k].a + base.r * (1 - layers[k].a), g: layers[k].g * layers[k].a + base.g * (1 - layers[k].a), b: layers[k].b * layers[k].a + base.b * (1 - layers[k].a), a: 1 };
      const large = size >= 56 || (size >= 40 && Number(s.fontWeight) >= 700), need = large ? 3 : 4.5, got = ratio(fg, base);
      if (got < need) add('error', 'contrast', `contrast ${got.toFixed(2)}:1 is below ${need}:1`, node.textContent);
    }
  }

  // 5. density and balance
  const allowed = layout === 'table' ? limits.tableWords : limits.maxWords;
  if (words > allowed) add('error', 'density', `${words} words on one slide (max ${allowed}). Split it or cut.`, '');
  else if (words > limits.warnWords && layout !== 'table') add('warn', 'density', `${words} words on one slide. Presenters lose the room above ~${limits.warnWords}.`, '');
  const titleEl = slide.querySelector('.title,.display,.stmt');
  if (titleEl && titleEl.textContent.trim().length > limits.maxTitleChars) add('warn', 'title-length', `title is ${titleEl.textContent.trim().length} characters; a title should state one claim in a line or two`, titleEl.textContent);
  if (!SPARSE_OK_CHECK(layout)) {
    const body = list.filter(i => !i.isChrome), shapes = [...slide.querySelectorAll('.card,.panel,.bar-track,.col,.stat,.step,.tbl,.ag-row')].filter(v => !hidden(v)).map(v => rel(v.getBoundingClientRect()));
    const top = Math.min(...body.map(i => i.rect.top), ...shapes.map(s => s.top)), bottom = Math.max(...body.map(i => i.rect.bottom), ...shapes.map(s => s.bottom));
    if (bottom - top < 1080 * .38) add('warn', 'sparse', `content fills only ${Math.round((bottom - top) / 10.8)}% of the slide height; enlarge it or merge with another slide`, '');
    if (bottom < 1080 * .6) add('warn', 'top-heavy', 'everything is in the top half; the bottom of the slide is empty', '');
  }
  // 6. images
  for (const img of slide.querySelectorAll('img')) {
    if (hidden(img)) continue;
    if (!img.complete || !img.naturalWidth) add('error', 'image', 'image failed to load', img.getAttribute('src'));
    else if (img.naturalWidth < img.getBoundingClientRect().width * .75) add('warn', 'image-resolution', `image is ${img.naturalWidth}px wide but shown at ${Math.round(img.getBoundingClientRect().width)}px; it will look soft`, img.getAttribute('src'));
    if (!img.getAttribute('alt')) add('error', 'alt', 'image has no alt text', img.getAttribute('src'));
  }
  if (!slide.dataset.notes || slide.dataset.notes.trim().length < 10) add('warn', 'notes', 'no speaker notes', '');
  return { issues, words };
  function SPARSE_OK_CHECK(name) { return limits.sparseOk.includes(name); }
}

async function lintDeck(indexPath, { outDir, sheet = true } = {}) {
  const index = path.resolve(indexPath), proof = path.resolve(outDir || path.join(path.dirname(index), 'proof'));
  fs.mkdirSync(proof, { recursive: true });
  const browser = await puppeteer.launch({ headless: true, executablePath: await require('./converter.cjs').browserPath() });
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1920, height: 1080, deviceScaleFactor: 1 });
    await page.emulateMediaType('screen');
    await page.goto(pathToFileURL(index).href, { waitUntil: 'networkidle0', timeout: 45000 });
    await page.evaluate(() => document.fonts.ready);
    const layouts = await page.evaluate(() => [...document.querySelectorAll('[data-pptx-slide]')].map(s => s.dataset.layout || 'custom'));
    const result = { slides: [], deck: [], summary: { errors: 0, warnings: 0 } }, pngs = [];
    for (let i = 0; i < layouts.length; i++) {
      await page.evaluate(async n => { await window.__pptxPrepareSlide(n, { fragments: 'final' }); await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))); }, i);
      const found = await page.evaluate(inspectSlide, i, { ...LIMITS, sparseOk: [...SPARSE_OK] }, layouts[i]);
      const file = path.join(proof, `slide-${String(i + 1).padStart(2, '0')}.png`);
      await page.screenshot({ path: file }); pngs.push(file);
      result.slides.push({ index: i + 1, layout: layouts[i], words: found.words, issues: found.issues });
    }
    // deck-level rhythm
    let sameRun = 1, denseRun = 0;
    layouts.forEach((name, i) => {
      sameRun = i && name === layouts[i - 1] ? sameRun + 1 : 1;
      if (sameRun === 3 && name !== 'section') result.deck.push({ level: 'warn', rule: 'monotony', message: `layout "${name}" repeats on slides ${i - 1}-${i + 1}; vary the rhythm` });
      denseRun = DENSE.has(name) ? denseRun + 1 : 0;
      if (denseRun === 3) result.deck.push({ level: 'warn', rule: 'rhythm', message: `three dense slides in a row ending at ${i + 1}; add a statement, number, image or section break` });
    });
    if (layouts.length > 9 && !layouts.includes('section')) result.deck.push({ level: 'warn', rule: 'structure', message: 'more than 9 slides without a section divider' });
    if (layouts[0] !== 'cover') result.deck.push({ level: 'warn', rule: 'structure', message: 'the deck does not open with a cover slide' });
    if (!['closing', 'image'].includes(layouts[layouts.length - 1])) result.deck.push({ level: 'warn', rule: 'structure', message: 'the deck does not end with a closing slide (one message + one action)' });
    for (const s of result.slides) for (const issue of s.issues) result.summary[issue.level === 'error' ? 'errors' : 'warnings']++;
    for (const issue of result.deck) result.summary[issue.level === 'error' ? 'errors' : 'warnings']++;
    result.proofDir = proof;
    if (sheet && pngs.length) result.contactSheet = await contactSheet(pngs, path.join(proof, 'contact-sheet.png'));
    fs.writeFileSync(path.join(proof, 'lint.json'), JSON.stringify(result, null, 2));
    return result;
  } finally { await browser.close(); }
}

function format(result) {
  const lines = [];
  for (const s of result.slides) for (const i of s.issues) lines.push(`${i.level === 'error' ? 'ERROR' : 'warn '} slide ${String(s.index).padStart(2)} [${s.layout}] ${i.rule}: ${i.message}${i.text ? `  «${i.text}»` : ''}`);
  for (const i of result.deck) lines.push(`${i.level === 'error' ? 'ERROR' : 'warn '} deck: ${i.rule}: ${i.message}`);
  lines.push(`\n${result.summary.errors} error(s), ${result.summary.warnings} warning(s). Proofs: ${result.proofDir}`);
  if (result.contactSheet) lines.push(`Contact sheet: ${result.contactSheet}`);
  return lines.join('\n');
}

module.exports = { lintDeck, format, LIMITS };

if (require.main === module) {
  const args = process.argv.slice(2), file = args.find(a => !a.startsWith('--')), json = args.includes('--json');
  (async () => {
    if (!file) throw new Error('Usage: node scripts/lint-deck.cjs DECK/index.html [--json]');
    const result = await lintDeck(file);
    console.log(json ? JSON.stringify(result, null, 2) : format(result));
    process.exitCode = result.summary.errors ? 1 : 0;
  })().catch(error => { console.error(error.message); process.exitCode = 2; });
}
