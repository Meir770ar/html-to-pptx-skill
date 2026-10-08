'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const JSZip = require('jszip');
const { DOMParser, XMLSerializer } = require('@xmldom/xmldom');
const NS = { p: 'http://schemas.openxmlformats.org/presentationml/2006/main', a: 'http://schemas.openxmlformats.org/drawingml/2006/main', r: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships', rel: 'http://schemas.openxmlformats.org/package/2006/relationships' };
const sha = value => crypto.createHash('sha256').update(value).digest('hex');
const children = node => [...(node?.childNodes || [])].filter(n => n.nodeType === 1);
const direct = (node, ns, name) => children(node).find(n => n.namespaceURI === NS[ns] && n.localName === name);
const descendants = (node, ns, name) => [...node.getElementsByTagNameNS(NS[ns], name)];
const xml = node => new XMLSerializer().serializeToString(node);
function parse(value, label = 'XML') {
  const text = Buffer.isBuffer(value) ? value.toString('utf8') : value;
  if (/<!DOCTYPE|<!ENTITY/i.test(text)) throw new Error(`Unsupported DTD/entity declaration in ${label}`);
  try { return new DOMParser({ onError: level => { if (level !== 'warning') throw new Error('invalid XML'); } }).parseFromString(text, 'application/xml'); }
  catch { throw new Error(`Malformed XML in ${label}`); }
}
function create(parent, ns, name) { return parent.ownerDocument.createElementNS(NS[ns], `${ns}:${name}`); }
function ensure(parent, ns, name, before) { let node = direct(parent, ns, name); if (!node) { node = create(parent, ns, name); parent.insertBefore(node, before || null); } return node; }
function objectId(node) { return descendants(node, 'p', 'cNvPr')[0]?.getAttribute('id'); }
function sourceTexts(node) { return descendants(node, 'a', 't').map(n => n.textContent); }
function relationshipPath(filename) { return path.posix.join(path.posix.dirname(filename), '_rels', path.posix.basename(filename) + '.rels'); }
function targets(doc, base) {
  return new Map(descendants(doc, 'rel', 'Relationship').map(r => [r.getAttribute('Id'), {
    type: r.getAttribute('Type'), external: r.getAttribute('TargetMode') === 'External',
    target: r.getAttribute('TargetMode') === 'External' ? r.getAttribute('Target') : path.posix.normalize(path.posix.join(path.posix.dirname(base), r.getAttribute('Target'))).replace(/^\//, ''),
  }]));
}
async function load(input) {
  const bytes = Buffer.isBuffer(input) ? input : await fs.readFile(input);
  if (bytes.length > 200 * 1024 * 1024) throw new Error('PPTX exceeds the 200 MB input limit');
  const zip = await JSZip.loadAsync(bytes, { checkCRC32: true });
  const entries = Object.values(zip.files).filter(item => !item.dir);
  if (entries.length > 10000) throw new Error('PPTX contains too many parts');
  let total = 0;
  for (const entry of entries) {
    if (entry.unsafeOriginalName && entry.unsafeOriginalName !== entry.name || entry.name.startsWith('/') || entry.name.split('/').includes('..')) throw new Error('Unsafe package path');
    const size = entry._data?.uncompressedSize;
    if (typeof size === 'number') total += size;
  }
  if (total > 512 * 1024 * 1024) throw new Error('PPTX exceeds the 512 MB expanded package limit');
  if (entries.some(item => /(?:^_xmlsignatures\/|vbaProject\.bin$)/i.test(item.name))) throw new Error('Signed or macro-enabled presentations require a separate workflow');
  const parts = new Map();
  for (const entry of entries) parts.set(entry.name, await entry.async('nodebuffer'));
  if (!parts.has('ppt/presentation.xml') || !parts.has('ppt/_rels/presentation.xml.rels')) throw new Error('Input is not a supported PPTX package');
  const presentation = parse(parts.get('ppt/presentation.xml'), 'presentation');
  const rels = targets(parse(parts.get('ppt/_rels/presentation.xml.rels')), 'ppt/presentation.xml');
  const size = descendants(presentation, 'p', 'sldSz')[0];
  const width = Number(size?.getAttribute('cx')) / 914400, height = Number(size?.getAttribute('cy')) / 914400;
  if (!(width > 0 && height > 0)) throw new Error('Presentation has no valid slide dimensions');
  const slidePaths = descendants(presentation, 'p', 'sldId').map(n => rels.get(n.getAttributeNS(NS.r, 'id'))?.target);
  if (!slidePaths.length || slidePaths.some(name => !name || !parts.has(name))) throw new Error('Presentation slide order contains missing relationships');
  const slides = slidePaths.map((filename, index) => ({ index: index + 1, filename, doc: parse(parts.get(filename), filename) }));
  return { zip, parts, slides, width, height, sourceSha256: sha(bytes) };
}
function position(node) {
  const props = direct(node, 'p', node.localName === 'grpSp' ? 'grpSpPr' : 'spPr');
  const transform = direct(props, 'a', 'xfrm') || direct(node, 'p', 'xfrm');
  const offset = direct(transform, 'a', 'off'), extent = direct(transform, 'a', 'ext');
  if (!offset || !extent) return null;
  return { x: Number(offset.getAttribute('x')) / 914400, y: Number(offset.getAttribute('y')) / 914400, w: Number(extent.getAttribute('cx')) / 914400, h: Number(extent.getAttribute('cy')) / 914400 };
}
function slideObjects(slide) {
  const tree = descendants(slide.doc, 'p', 'spTree')[0];
  if (!tree) throw new Error(`Slide ${slide.index} has no shape tree`);
  return children(tree).filter(node => ['sp', 'pic', 'graphicFrame', 'grpSp', 'cxnSp'].includes(node.localName));
}
function inventory(pkg) {
  return { schema: 1, sourceSha256: pkg.sourceSha256, slideSize: { widthInches: pkg.width, heightInches: pkg.height }, slides: pkg.slides.map(slide => {
    const relBytes = pkg.parts.get(relationshipPath(slide.filename));
    const rels = relBytes ? targets(parse(relBytes), slide.filename) : new Map();
    const note = [...rels.values()].find(r => /\/notesSlide$/.test(r.type));
    return { index: slide.index, part: slide.filename, notes: note && pkg.parts.has(note.target) ? sourceTexts(parse(pkg.parts.get(note.target))).join('\n') : '',
      hasImageBackground: ['blip', 'bgRef'].some(name => descendants(direct(descendants(slide.doc, 'p', 'cSld')[0], 'p', 'bg') || slide.doc.createElement('empty'), name === 'blip' ? 'a' : 'p', name).length > 0),
      objects: slideObjects(slide).map(node => {
        const placeholder = descendants(node, 'p', 'ph')[0];
        const props = descendants(node, 'a', 'rPr').concat(descendants(node, 'a', 'defRPr'));
        return { id: objectId(node), kind: node.localName, name: descendants(node, 'p', 'cNvPr')[0]?.getAttribute('name') || '',
          texts: sourceTexts(node), position: position(node), placeholder: placeholder?.getAttribute('type') || null,
          fontSizes: [...new Set(props.map(p => Number(p.getAttribute('sz')) / 100).filter(n => n > 0))],
          fonts: [...new Set(descendants(node, 'a', 'latin').map(n => n.getAttribute('typeface')).filter(Boolean))],
          hasTable: descendants(node, 'a', 'tbl').length > 0, hasChart: [...node.getElementsByTagNameNS('*', 'chart')].length > 0,
          hasOwnFill: !!direct(direct(node, 'p', 'spPr'), 'a', 'solidFill'),
          grouped: node.localName === 'grpSp',
        };
      }) };
  }) };
}

// Canonicalize everything except the explicitly supported design properties.
// Text, breaks, bullets, fields, hyperlinks, shape identities and table topology remain in the lock.
function canonical(node, context = '') {
  if (node.nodeType === 3 || node.nodeType === 4) return node.parentNode?.namespaceURI === NS.a && node.parentNode.localName === 't' ? ['text', node.data] : node.data.trim() ? ['text', node.data] : null;
  if (node.nodeType !== 1) return null;
  const name = `${node.namespaceURI || ''}:${node.localName}`;
  if (node.namespaceURI === NS.a && ['xfrm', 'solidFill', 'noFill', 'gradFill', 'pattFill', 'effectLst', 'effectDag', 'latin', 'ea', 'cs'].includes(node.localName)) return null;
  if (node.namespaceURI === NS.p && node.localName === 'xfrm') return null;
  if (node.namespaceURI === NS.p && node.localName === 'bg') {
    const protectedBackground = descendants(node, 'a', 'blip').concat(descendants(node, 'p', 'bgRef')).map(n => canonical(n));
    return protectedBackground.length ? ['protected-background', protectedBackground] : null;
  }
  const styleNode = node.namespaceURI === NS.a && ['rPr', 'defRPr', 'endParaRPr', 'ln'].includes(node.localName);
  const allowedAttrs = styleNode ? new Set(['sz', 'b', 'i', 'u', 'spc', 'w']) : new Set();
  const attributes = [...node.attributes].filter(a => a.namespaceURI !== 'http://www.w3.org/2000/xmlns/' && !allowedAttrs.has(a.localName)).map(a => [`${a.namespaceURI || ''}:${a.localName}`, a.value]).sort((a, b) => a[0].localeCompare(b[0]));
  const content = [...node.childNodes].map(child => canonical(child, name)).filter(x => x !== null);
  if (styleNode && !attributes.length && !content.length) return null;
  return [name, attributes, content];
}
function lockedSlide(slide) {
  const objects = slideObjects(slide);
  const records = objects.map(node => ({ id: objectId(node), kind: node.localName, hash: sha(JSON.stringify(canonical(node))),
    decoration: node.localName === 'sp' && (descendants(node, 'p', 'cNvPr')[0]?.getAttribute('name') || '').startsWith('_design_decoration_')
      && !direct(node, 'p', 'txBody') && !descendants(node, 'a', 'blip').length && !descendants(node, 'a', 'hlinkClick').length && !descendants(node, 'p', 'ph').length
      && ['rect', 'ellipse', 'line'].includes(descendants(node, 'a', 'prstGeom')[0]?.getAttribute('prst')) }));
  if (records.some(r => !r.id) || new Set(records.map(r => r.id)).size !== records.length) throw new Error(`Slide ${slide.index} contains missing/duplicate top-level object IDs`);
  const copy = slide.doc.cloneNode(true);
  const tree = descendants(copy, 'p', 'spTree')[0];
  for (const child of children(tree)) if (['sp', 'pic', 'graphicFrame', 'grpSp', 'cxnSp'].includes(child.localName)) tree.removeChild(child);
  return { index: slide.index, part: slide.filename, objects: records, structure: sha(JSON.stringify(canonical(copy.documentElement))) };
}
function verify(source, target) {
  const errors = [], slideParts = new Set(source.slides.map(s => s.filename));
  if (source.slides.map(s => s.filename).join('|') !== target.slides.map(s => s.filename).join('|')) errors.push('Slide count/order changed');
  if (source.width !== target.width || source.height !== target.height) errors.push('Slide dimensions changed');
  const originalParts = [...source.parts.keys()].sort(), outputParts = [...target.parts.keys()].sort();
  if (JSON.stringify(originalParts) !== JSON.stringify(outputParts)) errors.push('Package parts were added or removed');
  for (const [name, bytes] of source.parts) if (!slideParts.has(name) && (!target.parts.has(name) || sha(bytes) !== sha(target.parts.get(name)))) errors.push(`Protected package part changed: ${name}`);
  for (let i = 0; i < Math.min(source.slides.length, target.slides.length); i++) {
    const before = lockedSlide(source.slides[i]), after = lockedSlide(target.slides[i]);
    if (before.structure !== after.structure) errors.push(`Slide ${i + 1}: protected slide structure changed`);
    const ids = new Set(before.objects.map(o => o.id));
    const originals = after.objects.filter(o => ids.has(o.id)), extra = after.objects.filter(o => !ids.has(o.id));
    if (JSON.stringify(before.objects) !== JSON.stringify(originals) || extra.some(o => !o.decoration)) errors.push(`Slide ${i + 1}: protected text/object/field/table/hyperlink changed`);
  }
  const protectedCount = [...source.parts.keys()].filter(name => !slideParts.has(name)).length;
  return { schema: 1, passed: !errors.length, errors, sourceSha256: source.sourceSha256, outputSha256: target.sourceSha256,
    slides: source.slides.length, protectedParts: protectedCount,
    checks: ['text and paragraph structure', 'speaker-note parts byte-identical', 'media/chart/workbook parts byte-identical', 'relationships/hyperlinks', 'shape IDs/types/order', 'tables/fields', 'slide order/dimensions'],
    limitation: 'Semantic preservation is checked separately from visual quality, legibility and overflow.' };
}
module.exports = { NS, load, parse, xml, sha, children, direct, descendants, create, ensure, objectId, position, slideObjects, inventory, canonical, verify };
