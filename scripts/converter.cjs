'use strict';
const fs = require('node:fs/promises');
const fsSync = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const { pathToFileURL } = require('node:url');
const puppeteer = require('puppeteer');
const PptxGenJS = require('pptxgenjs');
const JSZip = require('jszip');
const { extractLayout } = require('./browser-layout.cjs');

function parseArgs(args) {
  const o = { mode: 'hybrid', forceRtl: false, width: 1920, height: 1080, scale: 2, wait: 150, fragments: 'final', captureTime: 1000, transition: 'fade', overwrite: false, requireEditable: false };
  const pos = [], flags = new Set(['rtl', 'overwrite', 'require-editable']);
  const names = new Set(['mode', 'slide-per', 'browser', 'width', 'height', 'scale', 'wait', 'title', 'author', 'subject', 'font', 'font-size', 'background', 'layout', 'report', 'fragments', 'capture-time', 'transition']);
  for (const arg of args) {
    if (!arg.startsWith('--')) { pos.push(arg); continue; }
    const at = arg.indexOf('='), key = arg.slice(2, at === -1 ? undefined : at), val = at === -1 ? null : arg.slice(at + 1);
    if (flags.has(key)) { if (val !== null) throw new Error(`--${key} takes no value`); o[{ rtl: 'forceRtl', overwrite: 'overwrite', 'require-editable': 'requireEditable' }[key]] = true; }
    else { if (!names.has(key)) throw new Error(`Unknown option --${key}`); if (!val) throw new Error(`Use --${key}=VALUE`); o[{ 'slide-per': 'selector', 'font-size': 'fontSize', 'capture-time': 'captureTime' }[key] || key] = val; }
  }
  if (pos.length !== 2) throw new Error('Specify input HTML/file/URL/- and output.pptx');
  o.input = pos[0]; o.output = path.resolve(pos[1]); if (!o.output.toLowerCase().endsWith('.pptx')) o.output += '.pptx';
  if (o.mode === 'text') o.mode = 'editable'; if (o.mode === 'auto') o.mode = 'hybrid';
  if (!['image', 'hybrid', 'editable'].includes(o.mode)) throw new Error('mode must be image, hybrid, editable, text, or auto');
  if (!['final', 'steps'].includes(o.fragments)) throw new Error('fragments must be final or steps');
  if (!['fade', 'none'].includes(o.transition)) throw new Error('transition must be fade or none');
  for (const key of ['width', 'height', 'scale', 'wait', 'captureTime']) { o[key] = Number(o[key]); if (!Number.isFinite(o[key]) || o[key] < (['wait', 'captureTime'].includes(key) ? 0 : 1)) throw new Error(`Invalid ${key}`); }
  if (o.width > 7680 || o.height > 4320 || o.scale > 4) throw new Error('Viewport/scale exceeds the supported memory limit');
  if (o.fontSize !== undefined && (!Number.isFinite(Number(o.fontSize)) || Number(o.fontSize) <= 0)) throw new Error('Invalid font-size');
  if (o.background && !/^[0-9a-f]{6}$/i.test(o.background)) throw new Error('background must be six hex digits');
  if (o.requireEditable && o.mode !== 'editable') throw new Error('--require-editable requires --mode=editable');
  return o;
}

async function browserPath(explicit) {
  if (explicit || process.env.PUPPETEER_EXECUTABLE_PATH) { const p = explicit || process.env.PUPPETEER_EXECUTABLE_PATH; if (!fsSync.existsSync(p)) throw new Error('Configured browser executable does not exist'); return p; }
  let bundled; try { bundled = await puppeteer.executablePath(); } catch { /* System browser detection follows. */ }
  const candidates = [bundled];
  if (process.platform === 'win32') for (const base of [process.env.PROGRAMFILES, process.env['PROGRAMFILES(X86)'], process.env.LOCALAPPDATA].filter(Boolean)) { candidates.push(path.join(base, 'Google', 'Chrome', 'Application', 'chrome.exe'), path.join(base, 'Microsoft', 'Edge', 'Application', 'msedge.exe')); }
  else if (process.platform === 'darwin') candidates.push('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge');
  else candidates.push('/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser');
  const found = candidates.find(p => typeof p === 'string' && p && fsSync.existsSync(p));
  if (!found) throw new Error('No Chromium browser found. Supply --browser=PATH or run npx puppeteer browsers install chrome in the skill directory.');
  return found;
}

async function openSource(page, o) {
  if (o.input === '-') { let html = ''; for await (const chunk of process.stdin) html += chunk; if (!html.trim()) throw new Error('No HTML received on stdin'); await page.setContent(html, { waitUntil: 'networkidle0', timeout: 45000 }); }
  else if (/^https?:\/\//i.test(o.input)) { const url = new URL(o.input); if (url.username || url.password) throw new Error('Credential-bearing URLs are not accepted'); const response = await page.goto(url.href, { waitUntil: 'networkidle0', timeout: 45000 }); if (response && !response.ok()) throw new Error(`Source server returned HTTP ${response.status()}`); }
  else { const filename = path.resolve(o.input); await fs.access(filename); await page.goto(pathToFileURL(filename).href, { waitUntil: 'networkidle0', timeout: 45000 }); }
  await page.evaluate(() => document.fonts.ready);
  if (o.font || o.forceRtl || o.fontSize || o.background) await page.addStyleTag({ content: `${o.font ? `body { font-family: ${JSON.stringify(o.font)} !important }` : ''}${o.forceRtl ? 'html { direction: rtl }' : ''}${o.fontSize ? `body { font-size: ${Number(o.fontSize)}pt }` : ''}${o.background ? `body { background-color: #${o.background} }` : ''}` });
  await page.evaluate(async () => { await Promise.all([...document.images].map(img => img.decode().catch(() => undefined))); });
}

async function discoverSlides(page, selector) {
  return page.evaluate(selector => {
    let slides = [], manifest;
    const island = document.querySelector('script[type="application/hyperframes-slideshow+json"]');
    if (!selector && island) { manifest = JSON.parse(island.textContent); slides = manifest.slides.map(item => [...document.querySelectorAll('[data-composition-id]')].find(el => el.dataset.compositionId === item.sceneId)); if (slides.some(el => !el)) throw new Error('Slideshow sceneId has no matching DOM element'); }
    else if (selector) slides = [...document.querySelectorAll(selector)];
    else { for (const candidate of ['[data-pptx-slide]', '.slide', '[data-slide]', 'section', 'article']) { slides = [...document.querySelectorAll(candidate)]; if (slides.length) break; } if (!slides.length) slides = [document.body]; }
    if (!slides.length) throw new Error('No slides match the requested selector');
    if (slides.some(a => slides.some(b => a !== b && a.contains(b)))) throw new Error('Slide selector matches nested elements; choose top-level slides');
    slides.forEach((el, index) => { el.dataset.pptxExportSlide = String(index); if (manifest) el.dataset.pptxExportNotes = manifest.slides[index].notes || ''; });
    return slides.map((el, index) => ({ index, id: el.id || el.dataset.compositionId || `slide-${index + 1}`, fragments: el.querySelectorAll('[data-fragment]').length }));
  }, selector || null);
}

async function prepareSlide(page, descriptor, o, step) {
  await page.evaluate(async ({ index, time, step }) => {
    document.documentElement.dataset.pptxExporting = 'true';
    if (typeof window.__pptxPrepareSlide === 'function') await window.__pptxPrepareSlide(index, { time, fragments: step === null ? 'final' : step });
    else { const el = document.querySelector(`[data-pptx-export-slide="${index}"]`); const tl = window.__timelines?.[el.dataset.compositionId]; if (tl && typeof tl.progress === 'function') tl.progress(1, true); if (step !== null && el.querySelector('[data-fragment]')) throw new Error('Fragment-step export requires window.__pptxPrepareSlide'); }
    for (const el of document.querySelectorAll('[data-pptx-export-slide]')) { if (!el.dataset.pptxOriginalStyle) el.dataset.pptxOriginalStyle = el.getAttribute('style') || ' '; el.setAttribute('style', el.dataset.pptxOriginalStyle.trim()); if (Number(el.dataset.pptxExportSlide) !== index) el.style.setProperty('display', 'none', 'important'); }
    const selected = document.querySelector(`[data-pptx-export-slide="${index}"]`);
    if (getComputedStyle(selected).display === 'none') selected.style.setProperty('display', selected.dataset.pptxDisplay || 'block', 'important');
    selected.style.setProperty('position', 'relative', 'important');
    for (const key of ['transform', 'translate', 'scale', 'rotate']) selected.style.setProperty(key, 'none', 'important');
    selected.style.setProperty('left', '0', 'important'); selected.style.setProperty('top', '0', 'important'); selected.style.setProperty('margin', '0', 'important');
    for (let parent = selected.parentElement; parent; parent = parent.parentElement) { parent.style.setProperty('transform', 'none', 'important'); parent.style.setProperty('zoom', '1', 'important'); }
    for (const animation of document.getAnimations()) { animation.pause(); const end = animation.effect?.getComputedTiming().endTime; animation.currentTime = Number.isFinite(end) ? Math.max(0, end - 0.01) : time; }
    for (const media of selected.querySelectorAll('video,audio')) { media.pause(); if (media.readyState > 0) media.currentTime = Math.min(time / 1000, Number.isFinite(media.duration) ? Math.max(0, media.duration - 0.01) : time / 1000); }
    await document.fonts.ready; await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  }, { index: descriptor.index, time: o.captureTime, step });
  await page.addStyleTag({ content: '[data-pptx-ignore], [data-speaker-notes] { visibility:hidden !important } html,body { scroll-behavior:auto !important } body { margin:0 !important }' });
  if (o.wait) await new Promise(resolve => setTimeout(resolve, o.wait));
  const handle = await page.$(`[data-pptx-export-slide="${descriptor.index}"]`); await handle.scrollIntoView(); return handle;
}

const geom = (item, unit) => ({ x: item.x * unit, y: item.y * unit, w: item.w * unit, h: item.h * unit });
const pngData = buffer => `image/png;base64,${buffer.toString('base64')}`;
function addText(slide, line, unit, fontOverride) {
  if (!line.runs.some(r => r.text.trim())) return;
  const runs = line.runs.map(run => { const text = run.text; return { text, options: { fontFace: fontOverride || run.style.font, fontSize: run.style.size * unit * 72, color: run.style.color, bold: run.style.bold, italic: run.style.italic, underline: run.style.underline, charSpacing: run.style.letterSpacing * unit * 72, rtlMode: line.direction === 'rtl', align: line.direction === 'rtl' ? 'right' : 'left', lang: /[\u0590-\u05ff]/.test(run.text) ? 'he-IL' : 'en-US' } }; });
  const font = line.style.size, extraWidth = Math.max(4, font * 0.14), rtl = line.direction === 'rtl';
  slide.addText(runs, { x: (line.x - (rtl ? extraWidth : 0)) * unit, y: line.y * unit, w: (line.w + extraWidth) * unit, h: Math.max(line.h, font * 1.2) * unit,
    margin: 0, breakLine: false, wrap: false, fit: 'none', valign: 'top', rtlMode: rtl, align: rtl ? 'right' : 'left', paraSpaceAfter: 0, paraSpaceBefore: 0,
    fontFace: fontOverride || line.style.font, fontSize: font * unit * 72, color: line.style.color, lang: rtl ? 'he-IL' : 'en-US', objectName: `HTML text ${line.id}` });
}

async function captureElement(page, el, omitBackground = false) {
  await el.scrollIntoView();
  const rect = await el.evaluate(element => {
    const r = element.getBoundingClientRect();
    if (r.left < -0.5 || r.top < -0.5 || r.right > innerWidth + 0.5 || r.bottom > innerHeight + 0.5) throw new Error('Export element does not fit the visible browser viewport; increase --width/--height or normalize the export hook');
    return { x: r.left + window.scrollX, y: r.top + window.scrollY, width: r.width, height: r.height };
  });
  if (rect.x < -0.5 || rect.y < -0.5) throw new Error('Source extends beyond the browser coordinate origin; increase --width/--height or normalize the export layout in the hook');
  rect.x = Math.max(0, rect.x); rect.y = Math.max(0, rect.y);
  // Capture the actually painted viewport surface, in measured coordinates.
  // Beyond-viewport capture can blank composited/RTL content in newer Chrome.
  return page.screenshot({ type: 'png', clip: rect, captureBeyondViewport: false, omitBackground });
}
async function screenshotNode(page, id) { const el = await page.$(`[data-pptx-node="${id}"]`); if (!el) throw new Error(`Measured DOM element disappeared: ${id}`); return captureElement(page, el, true); }

function addTable(slide, table, unit) {
  const rows = table.rows.map(row => row.map(cell => ({ text: cell.text, options: { fontFace: cell.style.font, fontSize: cell.style.size * unit * 72, color: cell.style.color, bold: cell.style.bold,
    align: ['right', 'left', 'center'].includes(cell.style.align) ? cell.style.align : cell.style.direction === 'rtl' ? 'right' : 'left', rtlMode: cell.style.direction === 'rtl', lang: cell.style.direction === 'rtl' ? 'he-IL' : 'en-US',
    fill: { color: cell.fill.color, transparency: 100 * (1 - cell.fill.alpha) }, margin: cell.padding.map(p => p * unit * 72),
    border: cell.borders.map(b => ({ type: b.width > 0 ? 'solid' : 'none', color: b.color, pt: b.width * unit * 72 })), valign: 'middle', breakLine: false } })));
  slide.addTable(rows, { ...geom(table, unit), colW: table.widths.map(w => w * unit), rowH: table.heights.map(h => h * unit), autoPage: false, margin: 0, paraSpaceAfter: 0,
    fontFace: table.rows[0][0].style.font, fontSize: table.rows[0][0].style.size * unit * 72, objectName: `HTML table ${table.id}` });
}

async function addEditable(slide, page, layout, unit, o) {
  for (const bg of layout.backgrounds) {
    if ((bg.ellipse || bg.radius > 0) && bg.uniformBorder) {
      const b = bg.uniformBorder;
      slide.addShape(bg.ellipse ? 'ellipse' : 'roundRect', { ...geom(bg, unit), ...(bg.ellipse ? {} : { rectRadius: bg.radius * unit }),
        fill: { color: bg.fill.color, transparency: (1 - bg.fill.alpha) * 100 },
        line: { color: b.color, width: b.width * unit * 72, transparency: b.width > 0 ? (1 - b.alpha) * 100 : 100 }, objectName: `HTML rounded shape ${bg.id}` });
      continue;
    }
    if (bg.fill.alpha > 0) slide.addShape(bg.radius > 0 ? 'roundRect' : 'rect', { ...geom(bg, unit), radius: bg.radius * unit, rectRadius: bg.radius * unit, fill: { color: bg.fill.color, transparency: (1 - bg.fill.alpha) * 100 }, line: { color: bg.fill.color, transparency: 100, width: 0 }, objectName: `HTML shape ${bg.id}` });
    const sides = [{ x: bg.x, y: bg.y, w: bg.w, h: 0 }, { x: bg.x + bg.w, y: bg.y, w: 0, h: bg.h }, { x: bg.x, y: bg.y + bg.h, w: bg.w, h: 0 }, { x: bg.x, y: bg.y, w: 0, h: bg.h }];
    bg.borders.forEach((b, i) => { if (b.width > 0 && b.style !== 'none') slide.addShape('line', { ...geom(sides[i], unit), line: { color: b.color, width: b.width * unit * 72, transparency: (1 - b.alpha) * 100 }, objectName: `HTML border ${bg.id}-${i}` }); });
  }
  for (const visual of [...layout.raster, ...layout.images]) slide.addImage({ data: pngData(await screenshotNode(page, visual.id)), ...geom(visual, unit), objectName: `HTML visual ${visual.id}`, altText: visual.alt || visual.reason || '' });
  for (const table of layout.tables) addTable(slide, table, unit);
  for (const line of [...layout.lines, ...layout.markers]) addText(slide, line, unit, o.font);
}

async function addHybrid(slide, page, handle, layout, unit, o) {
  await page.addStyleTag({ content: layout.hiddenTextStyle });
  await page.evaluate(ids => { for (const id of ids) { const el = document.querySelector(`[data-pptx-node="${id}"]`); el.style.setProperty('--pptx-marker-color', getComputedStyle(el).color); el.setAttribute('data-pptx-text-hidden', ''); } }, layout.nodeIds);
  try { slide.addImage({ data: pngData(await captureElement(page, handle)), x: 0, y: 0, w: layout.width * unit, h: layout.height * unit, objectName: 'HTML decoration background (raster)' }); }
  finally { await page.evaluate(() => document.querySelectorAll('[data-pptx-text-hidden]').forEach(el => el.removeAttribute('data-pptx-text-hidden'))); }
  for (const line of [...layout.lines, ...layout.markers]) addText(slide, line, unit, o.font);
}

async function patchPptx(buffer, transition) {
  if (transition === 'none') return buffer;
  const zip = await JSZip.loadAsync(buffer);
  for (const filename of Object.keys(zip.files).filter(x => /^ppt\/slides\/slide\d+\.xml$/.test(x))) { const xml = await zip.file(filename).async('string'); zip.file(filename, xml.replace('</p:sld>', '<p:transition spd="med" advClick="1"><p:fade/></p:transition></p:sld>')); }
  return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
}

async function convert(o) {
  const output = path.resolve(o.output), reportPath = path.resolve(o.report || `${output}.report.json`);
  if (output === reportPath) throw new Error('PPTX and report paths must differ');
  if (!o.overwrite && (fsSync.existsSync(output) || fsSync.existsSync(reportPath))) throw new Error('Output/report exists; choose a new filename or pass --overwrite');
  await fs.mkdir(path.dirname(output), { recursive: true }); await fs.mkdir(path.dirname(reportPath), { recursive: true });
  const proofDir = `${output}.proof`; if (!o.overwrite && fsSync.existsSync(proofDir)) throw new Error('Proof directory exists; choose a new filename'); await fs.mkdir(proofDir, { recursive: true });
  const staging = await fs.mkdtemp(path.join(os.tmpdir(), 'html-pptx-'));
  let browser;
  const report = { schema: 2, mode: o.mode, complete: false, sourceSlideCount: 0, outputSlideCount: 0, animationPolicy: 'HTML motion/interaction stays in HTML. PPTX has frozen export states and optional native fade transitions.', visualPolicy: o.mode === 'image' ? 'Browser snapshots, no editable content.' : 'Native Office text can differ from Chromium; compare source PNGs in PowerPoint.', slides: [], warnings: [] };
  try {
    browser = await puppeteer.launch({ headless: true, executablePath: await browserPath(o.browser), args: process.platform !== 'win32' && process.getuid?.() === 0 ? ['--no-sandbox'] : [] });
    const page = await browser.newPage(); await page.setViewport({ width: o.width, height: o.height, deviceScaleFactor: o.scale }); await page.emulateMediaType('screen'); await openSource(page, o);
    const descriptors = await discoverSlides(page, o.selector); report.sourceSlideCount = descriptors.length;
    const pptx = new PptxGenJS(); pptx.author = o.author || ''; pptx.subject = o.subject || ''; pptx.title = o.title || await page.title() || 'HTML presentation'; pptx.lang = o.forceRtl ? 'he-IL' : 'en-US';
    let first;
    for (const descriptor of descriptors) {
      const steps = o.fragments === 'steps' && descriptor.fragments > 0 ? Array.from({ length: descriptor.fragments + 1 }, (_, n) => n) : [null];
      for (const step of steps) {
        const handle = await prepareSlide(page, descriptor, o, step), layout = await handle.evaluate(extractLayout, { mode: o.mode });
        if (layout.width < 1 || layout.height < 1) throw new Error(`Slide ${descriptor.index + 1} has no visible size`);
        if (!first) { first = { width: layout.width, height: layout.height }; if (o.layout) { const ratios = { LAYOUT_16x9: 16 / 9, LAYOUT_WIDE: 16 / 9, LAYOUT_4x3: 4 / 3 }; if (!ratios[o.layout]) throw new Error('Unsupported layout'); if (Math.abs(layout.width / layout.height - ratios[o.layout]) > 0.01) throw new Error('Requested layout would distort HTML; match its aspect ratio'); } pptx.defineLayout({ name: 'HTML', width: 13.333333, height: 13.333333 * layout.height / layout.width }); pptx.layout = 'HTML'; }
        else if (Math.abs(layout.width - first.width) > 1 || Math.abs(layout.height - first.height) > 1) throw new Error(`Slide ${descriptor.index + 1} has a different size; give slides equal dimensions`);
        const failedImages = await handle.evaluate(el => [...el.querySelectorAll('img')].filter(img => !img.complete || img.naturalWidth === 0).length); if (failedImages) throw new Error(`Slide ${descriptor.index + 1} has ${failedImages} unloaded image(s)`);
        if (o.requireEditable && (layout.raster.length || layout.excludedText.length)) throw new Error('Strict editable export rejected raster fallbacks. Use the supported CSS profile or omit --require-editable after reviewing the report.');
        const source = await captureElement(page, handle), ordinal = report.slides.length + 1, proof = path.join(proofDir, `source-${String(ordinal).padStart(2, '0')}.png`); await fs.writeFile(proof, source);
        const slide = pptx.addSlide(), unit = 13.333333 / layout.width;
        if (o.mode === 'image') slide.addImage({ data: pngData(source), x: 0, y: 0, w: layout.width * unit, h: layout.height * unit, objectName: 'HTML complete slide snapshot' });
        else if (o.mode === 'hybrid') await addHybrid(slide, page, handle, layout, unit, o); else await addEditable(slide, page, layout, unit, o);
        const notes = layout.notes || await handle.evaluate(el => el.dataset.pptxExportNotes || ''); if (notes) slide.addNotes(notes);
        report.slides.push({ sourceIndex: descriptor.index + 1, sourceId: descriptor.id, outputIndex: ordinal, fragmentStep: step, width: layout.width, height: layout.height, sourceSha256: crypto.createHash('sha256').update(source).digest('hex'), editableTextBoxes: o.mode === 'image' ? 0 : layout.lines.length + layout.markers.length, editableTextGranularity: 'Measured visual runs; mixed bidi text may be multiple boxes.', nativeTables: o.mode === 'editable' ? layout.tables.length : 0, separateImages: o.mode === 'editable' ? layout.images.length : 0, nativeShapes: o.mode === 'editable' ? layout.backgrounds.length : 0, rasterFallbacks: layout.raster, rasterText: layout.excludedText, fonts: layout.fonts, proof, notesPreserved: !!notes });
      }
    }
    if (report.slides.some(s => s.rasterFallbacks.length || s.rasterText.length)) report.warnings.push('Some source elements remain rasterized; inspect this report.');
    if (o.mode === 'hybrid') report.warnings.push('Decoration/table styling remains in the raster background. Ordinary text is editable; native tables/shapes are not promised.');
    if (o.mode === 'image') report.warnings.push('Each slide is one image: visually preserved, not editable text/shapes.');
    const bytes = await patchPptx(await pptx.write({ outputType: 'nodebuffer' }), o.transition), staged = path.join(staging, 'output.pptx'); await fs.writeFile(staged, bytes);
    await fs.copyFile(staged, output, o.overwrite ? 0 : fsSync.constants.COPYFILE_EXCL);
    report.complete = true; report.outputSlideCount = report.slides.length; report.outputSha256 = crypto.createHash('sha256').update(bytes).digest('hex'); await fs.writeFile(reportPath, JSON.stringify(report, null, 2));
    return { output, report: reportPath, proofDir, slides: report.outputSlideCount, warnings: report.warnings };
  } catch (error) { report.error = error.message; await fs.writeFile(reportPath, JSON.stringify(report, null, 2)); throw error; }
  finally { if (browser) await browser.close(); await fs.rm(staging, { recursive: true, force: true }); }
}

function help() { console.log(`HTML interactive presentations → PowerPoint (RTL)
Usage: node scripts/html-to-pptx.js input.html output.pptx [options]
  --mode=hybrid|editable|image   Default hybrid; legacy text→editable, auto→hybrid
  --rtl --require-editable --overwrite
  --slide-per=SELECTOR          Top-level slide roots
  --fragments=final|steps       Full slide or initial + each reveal state
  --transition=fade|none        Native PowerPoint fade, default fade
  --capture-time=1000           Frozen loop/video time in milliseconds
  --browser=PATH               Chrome/Edge (auto-detected)
  --width=1920 --height=1080 --scale=2 --wait=150
  --font=NAME --font-size=PT --background=HEX --layout=LAYOUT_16x9
  --title=TEXT --author=TEXT --subject=TEXT --report=PATH
Outputs: PPTX, .report.json, .proof/source-NN.png.
HTML motion stays in HTML; PowerPoint contains frozen export states.`); }
async function main() { const args = process.argv.slice(2); if (args.includes('--help') || args.includes('-h')) { help(); return; } const result = await convert(parseArgs(args)); console.log(JSON.stringify(result, null, 2)); }
module.exports = { main, parseArgs, browserPath, convert, discoverSlides, prepareSlide };
