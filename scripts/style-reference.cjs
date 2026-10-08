#!/usr/bin/env node
'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { promisify } = require('node:util');
const execFile = promisify(require('node:child_process').execFile);
const { createCanvas, loadImage } = require('@napi-rs/canvas');
const puppeteer = require('puppeteer');
const { browserPath } = require('./converter.cjs');
const P = require('./pptx-source.cjs');
const { contrast } = require('./design-tokens.cjs');
function color(value) {
  if (/^#?[a-f0-9]{6}$/i.test(value || '')) return value.replace('#', '').toUpperCase();
  const match = String(value).match(/^rgba?\((\d+)[, ]+(\d+)[, ]+(\d+)/);
  return match ? match.slice(1).map(v => Number(v).toString(16).padStart(2, '0')).join('').toUpperCase() : null;
}
async function pixelColors(filename) {
  const image = await loadImage(filename), ratio = Math.min(1, 400 / image.width, 400 / image.height);
  const canvas = createCanvas(Math.max(1, Math.round(image.width * ratio)), Math.max(1, Math.round(image.height * ratio))), ctx = canvas.getContext('2d');
  ctx.fillStyle = '#FFFFFF'; ctx.fillRect(0, 0, canvas.width, canvas.height); ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
  const bytes = ctx.getImageData(0, 0, canvas.width, canvas.height).data, buckets = new Map();
  for (let i = 0; i < bytes.length; i += 16) {
    const rgb = [...bytes.slice(i, i + 3)], key = rgb.map(v => Math.floor(v / 16)).join(',');
    const bucket = buckets.get(key) || { count: 0, rgb }; bucket.count++; buckets.set(key, bucket);
  }
  return [...buckets.values()].sort((a, b) => b.count - a.count).slice(0, 12).map(item => ({ color: item.rgb.map(v => v.toString(16).padStart(2, '0')).join('').toUpperCase(), samples: item.count }));
}
function draft(observed) {
  const colors = observed.colors?.map(item => typeof item === 'string' ? item : item.color).map(color).filter(Boolean) || [];
  const background = color(observed.background) || colors[0] || 'FFFFFF';
  const foreground = color(observed.foreground) || (contrast(background, '172C35') >= 4.5 ? '172C35' : 'F7F7F7');
  const accent = colors.find(rgb => {
    const channels = rgb.match(/../g).map(c => parseInt(c, 16));
    return Math.max(...channels) - Math.min(...channels) > 45 && contrast(background, rgb) >= 3;
  }) || foreground;
  const titleFont = observed.titleFont || observed.fonts?.[0] || 'Arial', bodyFont = observed.bodyFont || observed.fonts?.[0] || 'Arial';
  return { schema: 1, name: 'Reference design profile', reviewed: false,
    palette: { background, foreground, accent, muted: foreground },
    typography: { titleFont, bodyFont, headingBodyRatio: 1.8 },
    composition: { marginRatio: 0.075, principles: [] },
    imageTreatment: 'Preserve the target deck images; analyze the reference treatment visually.',
    motion: [],
    evidence: { type: observed.type, screenshots: observed.evidence || [], extraction: 'Observed colors/fonts are candidates. The authoring agent must inspect the evidence and complete the visual language before marking reviewed:true.' } };
}
async function captureWebsite(source, target) {
  const browser = await puppeteer.launch({ headless: true, executablePath: await browserPath(), args: process.platform !== 'win32' && process.getuid?.() === 0 ? ['--no-sandbox'] : [] });
  try {
    const page = await browser.newPage(); await page.setViewport({ width: 1440, height: 1000, deviceScaleFactor: 1 });
    const url = /^https?:\/\//i.test(source) ? new URL(source) : pathToFileURL(path.resolve(source));
    if (url.username || url.password) throw new Error('Credential-bearing reference URLs are not accepted');
    const response = await page.goto(url.href, { waitUntil: 'networkidle0', timeout: 45000 });
    if (response && !response.ok()) throw new Error(`Reference site returned HTTP ${response.status()}`);
    await page.evaluate(() => document.fonts.ready);
    const observed = await page.evaluate(() => {
      const fonts = new Map(), colors = new Map(), typography = [];
      for (const el of document.querySelectorAll('body,main,header,section,h1,h2,h3,p,a,button,article')) {
        const rect = el.getBoundingClientRect(), s = getComputedStyle(el);
        if (rect.width < 1 || rect.height < 1 || s.display === 'none' || s.visibility === 'hidden') continue;
        const family = s.fontFamily.split(',')[0].replace(/["']/g, '').trim();
        fonts.set(family, (fonts.get(family) || 0) + Math.min(500, el.textContent.trim().length));
        for (const rgb of [s.color, s.backgroundColor, s.borderColor]) if (rgb !== 'rgba(0, 0, 0, 0)') colors.set(rgb, (colors.get(rgb) || 0) + 1);
        if (/^H[123]$/.test(el.tagName)) typography.push({ tag: el.tagName, font: family, size: parseFloat(s.fontSize), weight: s.fontWeight, letterSpacing: s.letterSpacing, lineHeight: s.lineHeight, alignment: s.textAlign });
      }
      const body = getComputedStyle(document.body), heading = document.querySelector('h1,h2');
      return { type: 'website', colors: [...colors].sort((a, b) => b[1] - a[1]).map(([color, samples]) => ({ color, samples })), fonts: [...fonts].sort((a, b) => b[1] - a[1]).map(([font]) => font), typography,
        background: body.backgroundColor, foreground: body.color, titleFont: heading ? getComputedStyle(heading).fontFamily.split(',')[0].replace(/["']/g, '').trim() : null,
        bodyFont: body.fontFamily.split(',')[0].replace(/["']/g, '').trim(), pageHeight: document.documentElement.scrollHeight };
    });
    const evidence = [];
    for (let i = 0; i < Math.min(3, Math.ceil(observed.pageHeight / 1000)); i++) {
      await page.evaluate(top => window.scrollTo(0, top), i * 1000); await new Promise(resolve => setTimeout(resolve, 200));
      const filename = `reference-${i + 1}.png`; await page.screenshot({ path: path.join(target, filename), captureBeyondViewport: false }); evidence.push(filename);
    }
    observed.colors = observed.colors.map(item => ({ ...item, color: color(item.color) })).filter(item => item.color);
    observed.background = color(observed.background); observed.foreground = color(observed.foreground);
    if (!observed.background) observed.background = (await pixelColors(path.join(target, evidence[0])))[0].color;
    return { ...observed, evidence };
  } finally { await browser.close(); }
}
async function capturePdf(source, target, requested) {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const root = path.dirname(require.resolve('pdfjs-dist/package.json'));
  const factoryDir = name => path.join(root, name).replaceAll('\\', '/') + '/';
  const task = pdfjs.getDocument({ data: new Uint8Array(await fs.readFile(source)), isEvalSupported: false, fontExtraProperties: true,
    useSystemFonts: false, standardFontDataUrl: factoryDir('standard_fonts'),
    cMapUrl: factoryDir('cmaps'), cMapPacked: true, wasmUrl: factoryDir('wasm') });
  const doc = await task.promise;
  try {
    const pages = requested || Array.from({ length: Math.min(3, doc.numPages) }, (_, i) => i + 1);
    if (pages.length > 8 || pages.some(n => !Number.isInteger(n) || n < 1 || n > doc.numPages)) throw new Error('Choose 1–8 valid PDF page numbers');
    const fonts = new Map(), sizes = [], evidence = [];
    for (const number of pages) {
      const page = await doc.getPage(number), raw = page.getViewport({ scale: 1 }), viewport = page.getViewport({ scale: Math.min(1.75, 1600 / raw.width, 2400 / raw.height) });
      const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
      await page.render({ canvas, canvasContext: canvas.getContext('2d'), viewport }).promise;
      const filename = `reference-page-${number}.png`; await fs.writeFile(path.join(target, filename), canvas.toBuffer('image/png')); evidence.push(filename);
      const text = await page.getTextContent();
      for (const item of text.items) if (item.fontName) {
        let family = text.styles[item.fontName]?.fontFamily;
        if (page.commonObjs.has(item.fontName)) family = page.commonObjs.get(item.fontName)?.name || family;
        if (family) fonts.set(family.replace(/^[A-Z]{6}\+/, ''), (fonts.get(family.replace(/^[A-Z]{6}\+/, '')) || 0) + item.str.length);
        if (item.transform) sizes.push(Math.hypot(item.transform[0], item.transform[1]));
      }
      page.cleanup();
    }
    const colors = await pixelColors(path.join(target, evidence[0]));
    return { type: 'pdf/book', pages, totalPages: doc.numPages, evidence, colors, fonts: [...fonts].sort((a, b) => b[1] - a[1]).map(([font]) => font), fontSizes: [...new Set(sizes.map(n => Math.round(n * 10) / 10))].sort((a, b) => b - a), background: colors[0]?.color,
      note: 'Scanned pages need visual analysis. Extracted PDF font names may require a licensed, Hebrew-compatible equivalent.' };
  } finally { await task.destroy(); }
}
async function capturePptx(source, target, render) {
  const pkg = await P.load(source), info = P.inventory(pkg), fonts = new Set(), colors = new Set();
  for (const slide of info.slides) for (const object of slide.objects) object.fonts.forEach(font => fonts.add(font));
  const themes = [];
  for (const [name, bytes] of pkg.parts) if (/^ppt\/theme\/theme\d+\.xml$/.test(name)) {
    const doc = P.parse(bytes), scheme = P.descendants(doc, 'a', 'clrScheme')[0], palette = {};
    for (const item of P.children(scheme)) { const rgb = P.descendants(item, 'a', 'srgbClr')[0]?.getAttribute('val') || P.descendants(item, 'a', 'sysClr')[0]?.getAttribute('lastClr'); if (rgb) { palette[item.localName] = rgb; colors.add(rgb); } }
    themes.push({ name, colors: palette });
  }
  for (const slide of pkg.slides) for (const rgb of P.descendants(slide.doc, 'a', 'srgbClr')) colors.add(rgb.getAttribute('val'));
  const evidence = [];
  if (render) {
    if (process.platform !== 'win32') throw new Error('--render-powerpoint needs Windows and Microsoft PowerPoint; provide screenshots on other systems');
    const rendered = path.join(target, 'source-office');
    await execFile('powershell.exe', ['-NoProfile', '-File', path.join(__dirname, 'verify-powerpoint.ps1'), '-Pptx', path.resolve(source), '-OutputDir', rendered], { timeout: 120000 });
    const filenames = await fs.readdir(rendered); evidence.push(...filenames.filter(name => name.endsWith('.png')).map(name => `source-office/${name}`));
  }
  await fs.writeFile(path.join(target, 'reference.inventory.json'), JSON.stringify(info, null, 2));
  const title = info.slides[0]?.objects.find(o => o.texts.length && o.fonts.length);
  return { type: 'pptx', themes, colors: [...colors], fonts: [...fonts], titleFont: title?.fonts[0], slideSize: info.slideSize,
    layout: info.slides.map(slide => ({ index: slide.index, objects: slide.objects.map(o => ({ kind: o.kind, box: o.position, fontSizes: o.fontSizes })) })), evidence,
    note: 'Inspect rendered slides/screenshots before inferring spatial rhythm, graphic treatment or motion. Theme tokens alone are insufficient.' };
}
async function capture(source, target, opts = {}) {
  const destination = path.resolve(target); await fs.mkdir(destination, { recursive: false });
  let observed;
  const extension = path.extname(source).toLowerCase();
  if (/^https?:\/\//i.test(source) || ['.html', '.htm'].includes(extension)) observed = await captureWebsite(source, destination);
  else if (extension === '.pdf') observed = await capturePdf(source, destination, opts.pages);
  else if (extension === '.pptx') observed = await capturePptx(source, destination, opts.renderPowerpoint);
  else if (['.png', '.jpg', '.jpeg', '.webp'].includes(extension)) {
    const filename = `reference-image${extension}`; await fs.copyFile(source, path.join(destination, filename));
    observed = { type: 'image/book-page', evidence: [filename], colors: await pixelColors(source), fonts: [], note: 'Font identity and composition must be inferred visually; Arial in the draft is a fallback proposal.' };
  } else throw new Error('Reference must be a public URL, HTML, PDF, PPTX, PNG, JPEG or WebP');
  await fs.writeFile(path.join(destination, 'observations.json'), JSON.stringify(observed, null, 2));
  await fs.writeFile(path.join(destination, 'design-profile.style.json'), JSON.stringify(draft(observed), null, 2));
  return { reference: destination, type: observed.type, evidenceCount: observed.evidence.length, profile: path.join(destination, 'design-profile.style.json'), reviewed: false };
}
async function main() {
  const [command, source, output, ...flags] = process.argv.slice(2);
  if (!command || command === '--help') { console.log('capture SOURCE NEW.style-work [--pages=1,2,3 --render-powerpoint]\nSources: public website/HTML, PDF/book, PPTX, image. Review evidence and complete the profile before applying it.'); return; }
  if (command !== 'capture' || !source || !output) throw new Error('Use capture SOURCE NEW.style-work');
  const opts = {};
  for (const arg of flags) { if (arg === '--render-powerpoint') opts.renderPowerpoint = true; else if (arg.startsWith('--pages=')) opts.pages = arg.slice(8).split(',').map(Number); else throw new Error('Unknown reference option'); }
  console.log(JSON.stringify(await capture(source, output, opts), null, 2));
}
if (require.main === module) main().catch(error => { console.error(`Reference capture failed: ${error.message}`); process.exitCode = 1; });
module.exports = { capture, draft, color, contrast, pixelColors };
