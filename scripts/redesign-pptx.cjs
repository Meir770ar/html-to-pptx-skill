#!/usr/bin/env node
'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
const JSZip = require('jszip');
const P = require('./pptx-source.cjs');
const { contrast } = require('./design-tokens.cjs');
const PRESETS = {
  editorial: { background: 'F7F4EC', foreground: '172C35', accent: '067A74', muted: '54666D', font: 'Arial' },
  midnight: { background: '12232E', foreground: 'F4F7F8', accent: '6DD6C0', muted: 'CAD6DE', font: 'Arial' },
  business: { background: 'FFFFFF', foreground: '183149', accent: '285E8E', muted: '526679', font: 'Arial' },
};
function keys(value, allowed, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label} must be an object`);
  for (const key of Object.keys(value)) if (!allowed.includes(key)) throw new Error(`Unsupported ${label} field: ${key}`);
}
function hex(value) { if (typeof value !== 'string' || !/^#?[a-f0-9]{6}$/i.test(value)) throw new Error('Colors must be six-digit RGB hex values'); return value.replace('#', '').toUpperCase(); }
function finite(value, min, max, label) { if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) throw new Error(`Invalid ${label}`); return value; }
function validateStyle(style) {
  keys(style, ['fontFace', 'fontSize', 'color', 'bold', 'fill', 'lineColor', 'lineWidth'], 'style');
  if (style.fontFace !== undefined && (typeof style.fontFace !== 'string' || !style.fontFace.trim() || style.fontFace.length > 100)) throw new Error('Invalid fontFace');
  if (style.fontSize !== undefined) finite(style.fontSize, 6, 120, 'fontSize');
  if (style.bold !== undefined && typeof style.bold !== 'boolean') throw new Error('bold must be boolean');
  for (const field of ['color', 'fill', 'lineColor']) if (style[field] !== undefined) hex(style[field]);
  if (style.lineWidth !== undefined) finite(style.lineWidth, 0, 12, 'lineWidth');
}
async function profile(options) {
  const selected = PRESETS[options.preset || 'editorial'];
  if (!selected) throw new Error('Unknown design preset');
  if (!options.style) return { ...selected, titleFont: options.font || selected.font, bodyFont: options.font || selected.font };
  const source = JSON.parse(await fs.readFile(options.style, 'utf8'));
  if (source.schema !== 1 || source.reviewed !== true) throw new Error('Reference design profile must be visually reviewed by the authoring agent and have reviewed:true');
  const palette = source.palette, typography = source.typography;
  for (const key of ['background', 'foreground', 'accent', 'muted']) hex(palette?.[key]);
  if (!typography?.titleFont || !typography?.bodyFont) throw new Error('Design profile needs titleFont and bodyFont');
  if (!Array.isArray(source.composition?.principles) || source.composition.principles.length < 2 || source.composition.principles.some(value => typeof value !== 'string' || !value.trim())) throw new Error('Complete at least two visual composition principles after inspecting the reference');
  const marginRatio = finite(source.composition.marginRatio, 0.03, 0.18, 'reference margin ratio');
  const headingBodyRatio = finite(typography.headingBodyRatio, 1.2, 3.5, 'heading/body ratio');
  if (contrast(hex(palette.background), hex(palette.foreground)) < 4.5) throw new Error('Reference body text/background contrast is too low; adapt the palette for readability');
  return { ...palette, titleFont: options.font || typography.titleFont, bodyFont: options.font || typography.bodyFont, marginRatio, headingBodyRatio, composition: source.composition, motion: source.motion || [] };
}
function titleId(slide, height) {
  const text = slide.objects.filter(o => o.kind === 'sp' && o.texts.some(t => t.trim()) && !['sldNum', 'dt', 'ftr', 'hdr'].includes(o.placeholder));
  const explicit = text.find(o => ['title', 'ctrTitle'].includes(o.placeholder));
  if (explicit) return explicit.id;
  const top = text.filter(o => o.position && o.position.y < height * 0.32).sort((a, b) => a.position.y - b.position.y || Math.max(0, ...b.fontSizes) - Math.max(0, ...a.fontSizes));
  return (top[0] || text.sort((a, b) => Math.max(0, ...b.fontSizes) - Math.max(0, ...a.fontSizes))[0])?.id;
}
function buildPlan(source, tokens, options = {}) {
  const manifest = P.inventory(source);
  return { schema: 1, sourceSha256: source.sourceSha256, design: { palette: tokens, layout: options.layout || 'preserve' },
    slides: manifest.slides.map(slide => {
      const title = titleId(slide, source.height), text = slide.objects.filter(o => o.kind === 'sp' && o.texts.some(t => t.trim()));
      const simple = options.layout === 'auto' && !slide.hasImageBackground && text.length === 2 && slide.objects.length === 2 && text.every(o => o.position);
      const margin = source.width * (tokens.marginRatio || 0.075);
      return { index: slide.index, ...(!slide.hasImageBackground ? { background: hex(tokens.background) } : {}),
        objects: slide.objects.filter(o => o.kind === 'sp' && o.texts.some(t => t.trim()) || o.hasTable).map(o => {
          const isTitle = o.id === title, footer = ['ftr', 'hdr', 'dt', 'sldNum'].includes(o.placeholder);
          const style = { fontFace: isTitle ? tokens.titleFont : tokens.bodyFont, ...(!slide.hasImageBackground ? { color: hex(footer ? tokens.muted : isTitle ? tokens.accent : tokens.foreground) } : {}) };
          if (o.hasOwnFill) style.fill = hex(tokens.background);
          if (isTitle) style.bold = true;
          const position = simple ? isTitle ? { x: margin, y: source.height * 0.13, w: source.width - 2 * margin, h: source.height * 0.22 } : { x: margin, y: source.height * 0.43, w: source.width - 2 * margin, h: source.height * 0.39 } : null;
          if (simple) { const bodySize = Math.min(24, source.height * 3.1); style.fontSize = isTitle ? Math.min(44, bodySize * (tokens.headingBodyRatio || 1.8)) : bodySize; }
          return { id: o.id, style, ...(position ? { position } : {}) };
        }),
        ...(simple ? { decorations: [{ geometry: 'rect', position: { x: margin, y: source.height * 0.375, w: source.width - margin * 2, h: 0.05 }, fill: hex(tokens.accent) }] } : {}),
        ...(slide.objects.some(o => o.hasTable) ? { table: { fontFace: tokens.bodyFont, color: hex(tokens.foreground), headerFill: hex(tokens.accent), headerColor: contrast(hex(tokens.accent), 'FFFFFF') >= 4.5 ? 'FFFFFF' : '12232E', bodyFill: hex(tokens.background) } } : {}) };
    }) };
}
function solid(parent, value) {
  const fills = ['noFill', 'solidFill', 'gradFill', 'blipFill', 'pattFill', 'grpFill'];
  let insertion = null;
  for (const child of P.children(parent)) if (child.namespaceURI === P.NS.a && fills.includes(child.localName)) { insertion ||= child.nextSibling; parent.removeChild(child); }
  const fill = P.create(parent, 'a', 'solidFill'), color = P.create(fill, 'a', 'srgbClr'); color.setAttribute('val', hex(value)); fill.appendChild(color);
  const textProperty = ['rPr', 'defRPr', 'endParaRPr'].includes(parent.localName);
  const textFollowers = ['effectLst', 'effectDag', 'highlight', 'uLnTx', 'uLn', 'uFillTx', 'uFill', 'latin', 'ea', 'cs', 'sym', 'hlinkClick', 'hlinkMouseOver', 'rtl', 'extLst'];
  const border = textProperty ? P.children(parent).find(n => textFollowers.includes(n.localName)) || insertion : P.direct(parent, 'a', 'ln') || P.direct(parent, 'a', 'effectLst') || P.direct(parent, 'a', 'effectDag') || P.direct(parent, 'a', 'extLst') || insertion;
  parent.insertBefore(fill, border?.parentNode === parent ? border : null);
}
function textStyle(node, style) {
  const containers = P.descendants(node, 'a', 'r').concat(P.descendants(node, 'a', 'fld'));
  const props = containers.map(run => P.ensure(run, 'a', 'rPr', P.children(run)[0]));
  props.push(...P.descendants(node, 'a', 'defRPr'), ...P.descendants(node, 'a', 'endParaRPr'));
  for (const prop of props) {
    if (style.fontSize !== undefined) prop.setAttribute('sz', String(Math.round(style.fontSize * 100)));
    if (style.bold !== undefined) prop.setAttribute('b', style.bold ? '1' : '0');
    if (style.color !== undefined) solid(prop, style.color);
    if (style.fontFace !== undefined) for (const name of ['latin', 'ea', 'cs']) {
      const order = ['latin', 'ea', 'cs', 'sym', 'hlinkClick', 'hlinkMouseOver', 'rtl', 'extLst'];
      const before = P.children(prop).find(n => order.indexOf(n.localName) > order.indexOf(name));
      P.ensure(prop, 'a', name, before).setAttribute('typeface', style.fontFace);
    }
  }
}
function setPosition(node, rect, size) {
  keys(rect, ['x', 'y', 'w', 'h'], 'position');
  const x = finite(rect.x, 0, size.width, 'x'), y = finite(rect.y, 0, size.height, 'y');
  const w = finite(rect.w, 0.05, size.width, 'w'), h = finite(rect.h, 0.05, size.height, 'h');
  if (x + w > size.width + 0.001 || y + h > size.height + 0.001) throw new Error('Requested object position extends outside the slide');
  if (node.localName === 'grpSp') throw new Error('Group transforms require a separate reviewed workflow');
  const transform = node.localName === 'graphicFrame' ? P.ensure(node, 'p', 'xfrm') : P.ensure(P.ensure(node, 'p', 'spPr'), 'a', 'xfrm', P.children(P.direct(node, 'p', 'spPr'))[0]);
  const off = P.ensure(transform, 'a', 'off'), ext = P.ensure(transform, 'a', 'ext');
  off.setAttribute('x', String(Math.round(x * 914400))); off.setAttribute('y', String(Math.round(y * 914400)));
  ext.setAttribute('cx', String(Math.round(w * 914400))); ext.setAttribute('cy', String(Math.round(h * 914400)));
}
function styleTable(node, config) {
  keys(config, ['fontFace', 'color', 'headerFill', 'headerColor', 'bodyFill'], 'table');
  validateStyle({ fontFace: config.fontFace, color: config.color });
  for (const key of ['headerFill', 'headerColor', 'bodyFill']) hex(config[key]);
  for (const table of P.descendants(node, 'a', 'tbl')) {
    P.children(table).filter(n => n.localName === 'tr').forEach((row, index) => {
      for (const cell of P.children(row).filter(n => n.localName === 'tc')) {
        solid(P.ensure(cell, 'a', 'tcPr'), index === 0 ? config.headerFill : config.bodyFill);
        textStyle(cell, { fontFace: config.fontFace, color: index === 0 ? config.headerColor : config.color });
      }
    });
  }
}
function applyPlan(pkg, plan) {
  keys(plan, ['schema', 'sourceSha256', 'design', 'slides'], 'plan');
  if (plan.schema !== 1 || plan.sourceSha256 !== pkg.sourceSha256 || !Array.isArray(plan.slides)) throw new Error('Plan does not match the source presentation');
  const seen = new Set();
  for (const edit of plan.slides) {
    keys(edit, ['index', 'background', 'objects', 'table', 'decorations'], 'slide');
    const slide = pkg.slides[edit.index - 1];
    if (!slide || !Number.isInteger(edit.index) || seen.has(edit.index)) throw new Error('Invalid/duplicate slide index in plan'); seen.add(edit.index);
    const cSld = P.descendants(slide.doc, 'p', 'cSld')[0];
    if (edit.background !== undefined) {
      const original = P.direct(cSld, 'p', 'bg');
      if (original && (P.descendants(original, 'a', 'blip').length || P.descendants(original, 'p', 'bgRef').length)) throw new Error('Image/reference background is protected; omit background from this slide plan');
      const bg = P.ensure(cSld, 'p', 'bg', P.children(cSld)[0]);
      for (const child of P.children(bg)) bg.removeChild(child);
      solid(P.ensure(bg, 'p', 'bgPr'), edit.background);
    }
    const map = new Map(P.slideObjects(slide).map(o => [P.objectId(o), o])), objectSeen = new Set();
    if (!Array.isArray(edit.objects)) throw new Error('Slide objects must be an array');
    for (const object of edit.objects) {
      keys(object, ['id', 'style', 'position'], 'object');
      const node = map.get(String(object.id));
      if (!node || objectSeen.has(String(object.id))) throw new Error('Unknown/duplicate object ID in design plan'); objectSeen.add(String(object.id));
      if (object.style) {
        validateStyle(object.style);
        if (node.localName === 'grpSp' || node.localName === 'graphicFrame' && !P.descendants(node, 'a', 'tbl').length) throw new Error('Complex grouped/chart objects remain protected');
        textStyle(node, object.style);
        if (object.style.fill !== undefined || object.style.lineColor !== undefined || object.style.lineWidth !== undefined) {
          if (!['sp', 'cxnSp'].includes(node.localName)) throw new Error('Shape fill/line styles require a native shape');
          const props = P.ensure(node, 'p', 'spPr');
          if (object.style.fill !== undefined) solid(props, object.style.fill);
          if (object.style.lineColor !== undefined) solid(P.ensure(props, 'a', 'ln'), object.style.lineColor);
          if (object.style.lineWidth !== undefined) P.ensure(props, 'a', 'ln').setAttribute('w', String(Math.round(object.style.lineWidth * 12700)));
        }
      }
      if (object.position) setPosition(node, object.position, { width: pkg.width, height: pkg.height });
    }
    if (edit.table) for (const object of P.slideObjects(slide)) if (P.descendants(object, 'a', 'tbl').length) styleTable(object, edit.table);
    if (edit.decorations) {
      if (!Array.isArray(edit.decorations) || edit.decorations.length > 20) throw new Error('Invalid decorations array');
      const tree = P.descendants(slide.doc, 'p', 'spTree')[0];
      let nextId = Math.max(...P.descendants(slide.doc, 'p', 'cNvPr').map(n => Number(n.getAttribute('id'))).filter(Number.isFinite)) + 1;
      for (const item of edit.decorations) {
        keys(item, ['geometry', 'position', 'fill', 'lineColor', 'lineWidth'], 'decoration');
        if (!['rect', 'ellipse'].includes(item.geometry)) throw new Error('Decoration geometry must be rect or ellipse');
        const node = P.create(tree, 'p', 'sp'), nv = P.ensure(node, 'p', 'nvSpPr'), name = P.ensure(nv, 'p', 'cNvPr');
        name.setAttribute('id', String(nextId)); name.setAttribute('name', `_design_decoration_${nextId++}`);
        P.ensure(nv, 'p', 'cNvSpPr'); P.ensure(nv, 'p', 'nvPr');
        const props = P.ensure(node, 'p', 'spPr');
        const geometry = P.ensure(props, 'a', 'prstGeom'); geometry.setAttribute('prst', item.geometry); P.ensure(geometry, 'a', 'avLst');
        setPosition(node, item.position, { width: pkg.width, height: pkg.height });
        if (item.fill) solid(props, item.fill); else P.ensure(props, 'a', 'noFill');
        if (item.lineColor) { const line = P.ensure(props, 'a', 'ln'); solid(line, item.lineColor); line.setAttribute('w', String(Math.round(finite(item.lineWidth ?? 1, 0, 12, 'decoration line width') * 12700))); }
        tree.appendChild(node);
      }
    }
  }
  return pkg;
}
async function apply(input, output, plan, overwrite = false) {
  const target = path.resolve(output), sourcePath = path.resolve(input);
  if (target === sourcePath) throw new Error('Never overwrite the source presentation; choose another output path');
  try {
    const [sourceStat, targetStat] = await Promise.all([fs.stat(sourcePath), fs.stat(target)]);
    if (sourceStat.dev === targetStat.dev && sourceStat.ino === targetStat.ino || await fs.realpath(sourcePath) === await fs.realpath(target)) throw new Error('Never overwrite the source presentation through an alias');
  } catch (error) { if (error.code !== 'ENOENT') throw error; }
  if (!overwrite) try { await fs.access(target); throw new Error('Output already exists'); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  const before = await P.load(input), after = await P.load(input); applyPlan(after, plan);
  for (const slide of after.slides) after.zip.file(slide.filename, P.xml(slide.doc));
  const bytes = await after.zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
  const check = P.verify(before, await P.load(bytes));
  if (!check.passed) throw new Error(`Preservation gate rejected the output: ${check.errors.join('; ')}`);
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, bytes, { flag: overwrite ? 'w' : 'wx' });
  await fs.writeFile(`${target}.preservation.json`, JSON.stringify(check, null, 2));
  return { output: target, verification: `${target}.preservation.json`, slides: check.slides, contentPreserved: check.passed };
}
const escapeHtml = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
async function inspect(input, dir, options) {
  const pkg = await P.load(input), manifest = P.inventory(pkg), plan = buildPlan(pkg, await profile(options), options);
  const target = path.resolve(dir); await fs.mkdir(target, { recursive: false });
  await fs.writeFile(path.join(target, 'source.inventory.json'), JSON.stringify(manifest, null, 2));
  await fs.writeFile(path.join(target, 'design.redesign.json'), JSON.stringify(plan, null, 2));
  const body = manifest.slides.map(slide => `<section><h2>שקופית ${slide.index}</h2>${slide.objects.map(o => `<article><h3>${escapeHtml(o.kind)} · ${escapeHtml(o.id)}</h3><pre>${escapeHtml(o.texts.join('\n'))}</pre><small>${o.hasChart || o.grouped ? 'רכיב מורכב נשמר במקור; יש לבדוק ברינדור המקורי' : ''}</small></article>`).join('')}<details><summary>הערות מרצה</summary><pre>${escapeHtml(slide.notes)}</pre></details></section>`).join('');
  await fs.writeFile(path.join(target, 'inventory.html'), `<!doctype html><html lang="he" dir="rtl"><meta charset="utf-8"><title>מלאי תוכן לשדרוג מצגת</title><style>body{font:18px Arial;background:#f7f4ec;color:#172c35;max-width:1100px;margin:40px auto;padding:20px}section{padding:24px;margin-bottom:30px;background:white}pre{white-space:pre-wrap}article{border-bottom:1px solid #ddd;padding:12px}</style><h1>מלאי התוכן וההערות</h1><p>זהו מלאי לעריכה, ולא הדמיה של עיצוב המקור. רנדרו את המקור לפני שינוי הפריסה.</p>${body}</html>`);
  return { project: target, slides: manifest.slides.length, plan: path.join(target, 'design.redesign.json') };
}
function options(args) {
  const o = {};
  for (const arg of args) {
    if (arg === '--overwrite') { o.overwrite = true; continue; }
    const m = arg.match(/^--(preset|font|layout|style)=(.+)$/); if (!m) throw new Error(`Unknown option: ${arg}`); o[m[1]] = m[2];
  }
  if (o.layout && !['preserve', 'auto'].includes(o.layout)) throw new Error('layout must be preserve or auto');
  return o;
}
async function main() {
  const [command, input, output, ...flags] = process.argv.slice(2);
  if (!command || command === '--help') { console.log('inspect SOURCE.pptx NEW.pptx-work [--preset=editorial|midnight|business --layout=preserve|auto --style=PROFILE.json]\napply SOURCE.pptx PLAN.redesign.json OUTPUT.pptx\nrestyle SOURCE.pptx OUTPUT.pptx [--preset=... --layout=... --style=...]\nverify SOURCE.pptx OUTPUT.pptx'); return; }
  let result;
  if (command === 'inspect') result = await inspect(input, output, options(flags));
  else if (command === 'apply') { const [target, ...more] = flags; if (!target) throw new Error('apply needs source, plan and output'); result = await apply(input, target, JSON.parse(await fs.readFile(output, 'utf8')), options(more).overwrite); }
  else if (command === 'restyle') { const opts = options(flags), pkg = await P.load(input); result = await apply(input, output, buildPlan(pkg, await profile(opts), opts), opts.overwrite); }
  else if (command === 'verify') { result = P.verify(await P.load(input), await P.load(output)); if (!result.passed) { console.log(JSON.stringify(result, null, 2)); process.exitCode = 1; return; } }
  else throw new Error('Unknown redesign command');
  console.log(JSON.stringify(result, null, 2));
}
if (require.main === module) main().catch(error => { console.error(`Redesign failed: ${error.message}`); process.exitCode = 1; });
module.exports = { PRESETS, profile, buildPlan, applyPlan, apply, inspect, escapeHtml };
