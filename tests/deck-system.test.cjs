'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const JSZip = require('jszip');
const { createCanvas } = require('@napi-rs/canvas');
const { THEMES, resolveTheme, paletteIssues } = require('../scripts/deck/themes.cjs');
const { rich, isolate } = require('../scripts/deck/text.cjs');
const { LAYOUTS } = require('../scripts/deck/layouts.cjs');
const { ICON_NAMES } = require('../scripts/deck/icons.cjs');
const { build } = require('../scripts/build-deck.cjs');
const { lintDeck } = require('../scripts/lint-deck.cjs');
const { ratio } = require('../scripts/deck/color.cjs');

const skill = path.resolve(__dirname, '..');
let temp;
test.before(() => { temp = fs.mkdtempSync(path.join(os.tmpdir(), 'deck-system-tests-')); });
test.after(() => { if (temp) fs.rmSync(temp, { recursive: true, force: true }); });

function writeSpec(name, spec) { const file = path.join(temp, `${name}.json`); fs.writeFileSync(file, JSON.stringify(spec)); return file; }
function photo(name, w = 1600, h = 1000) {
  const canvas = createCanvas(w, h), ctx = canvas.getContext('2d'), g = ctx.createLinearGradient(0, 0, w, h);
  g.addColorStop(0, '#264653'); g.addColorStop(1, '#e9c46a'); ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
  fs.writeFileSync(path.join(temp, name), canvas.toBuffer('image/png'));
}
const slide = (layout, extra) => ({ layout, notes: 'הערות מרצה לבדיקה.', ...extra });

test('every theme keeps all text pairs readable, including with a hostile brand colour', () => {
  for (const name of Object.keys(THEMES)) assert.deepEqual(paletteIssues(resolveTheme(name)), [], name);
  const yellow = resolveTheme('corporate', { palette: { accent: '#FFFF00', accent2: '#FFF200' } });
  assert.deepEqual(paletteIssues(yellow), []);
  assert.ok(ratio(yellow.tones.base['accent-text'], yellow.tones.base.bg) >= 4.5);
  assert.throws(() => resolveTheme('nope'), /Unknown theme/);
  assert.throws(() => resolveTheme('editorial', { palette: { accent: 'blue' } }), /Invalid colour/);
});

test('text helper isolates Latin phrases and dates but leaves numbers and percents alone', () => {
  assert.equal(isolate('שלום Claude Code, היום'), 'שלום <bdi>Claude Code</bdi>, היום');
  assert.equal(isolate('ב-08/10/2026 בשעה 10:30'), 'ב-<bdi>08/10/2026</bdi> בשעה <bdi>10:30</bdi>');
  assert.equal(isolate('72% מ-1,250 ₪'), '72% מ-1,250 ₪');
  assert.equal(rich('*חם* & <b>'), '<span class="hl">חם</span> &amp; &lt;<bdi>b</bdi>&gt;');
  assert.equal(rich('שורה\nשנייה'), 'שורה<br>שנייה');
});

test('spec validation reports every problem with the slide number', () => {
  const file = writeSpec('bad', { title: 'x', theme: 'ghost', slides: [{ layout: 'cover' }, { layout: 'points', title: 't', items: [{ title: 'a', icon: 'nope' }, { title: 'b' }], colour: 'red' }, { layout: 'zzz' }] });
  assert.throws(() => build(file, path.join(temp, 'bad-out')), error => /Unknown theme "ghost"/.test(error.message) && /Slide 1 \(cover\): missing required field "title"/.test(error.message) && /Slide 2 \(points\): unknown field "colour"/.test(error.message) && /Slide 3: unknown layout "zzz"/.test(error.message));
  const icon = writeSpec('bad-icon', { title: 'x', slides: [{ layout: 'points', title: 't', items: [{ title: 'a', icon: 'nope' }, { title: 'b' }] }] });
  assert.throws(() => build(icon, path.join(temp, 'bad-icon-out')), /Slide 1 \(points\): items\[0\]\.icon "nope" is unknown/);
  const image = writeSpec('bad-image', { title: 'x', slides: [{ layout: 'image', image: 'missing.png', alt: 'a' }] });
  assert.throws(() => build(image, path.join(temp, 'bad-image-out')), /Image not found/);
});

test('the spec reference documents every layout, icon and theme', () => {
  const doc = fs.readFileSync(path.join(skill, 'references/spec-reference.md'), 'utf8');
  for (const name of [...Object.keys(LAYOUTS), ...Object.keys(THEMES)]) assert.ok(doc.includes(`\`${name}\``), `spec-reference.md must mention ${name}`);
  for (const icon of ICON_NAMES) assert.ok(doc.includes(icon), `spec-reference.md must list icon ${icon}`);
});

test('the shipped demo deck builds and passes the design lint with zero errors', async () => {
  const built = build(path.join(skill, 'examples/demo.json'), path.join(temp, 'demo'));
  const result = await lintDeck(built.index);
  assert.equal(result.summary.errors, 0, JSON.stringify(result.slides.flatMap(s => s.issues.filter(i => i.level === 'error'))));
  assert.equal(result.slides.length, 15);
  assert.ok(fs.existsSync(result.contactSheet));
});

test('every layout renders, with pictures, and lints clean in all themes that differ structurally', async () => {
  for (const name of ['a.png', 'b.png', 'p.png']) photo(name, name === 'p.png' ? 600 : 2000, name === 'p.png' ? 600 : 1200);
  const icons = ['target', 'clock', 'shield', 'heart'];
  const slides = [
    slide('cover', { title: 'כותרת ראשית לבדיקה', subtitle: 'תת כותרת', image: 'a.png', alt: 'רקע' }),
    slide('agenda', { title: 'תוכן', items: ['אחד', 'שניים', { title: 'שלושה', text: 'פירוט' }] }),
    slide('section', { title: 'פרק ראשון' }),
    slide('statement', { text: 'משפט אחד *חזק* ופשוט.' }),
    slide('points', { title: 'שלושה', items: icons.slice(0, 3).map((icon, i) => ({ icon, title: `סעיף ${i}`, text: 'הסבר קצר' })) }),
    slide('points', { title: 'ארבעה', items: icons.map((icon, i) => ({ icon, title: `סעיף ${i}`, text: 'הסבר קצר' })) }),
    slide('bignumber', { value: 72, unit: '%', label: 'נתון' }),
    slide('stats', { title: 'מספרים', items: [{ value: 12, label: 'אחד' }, { value: 3.5, unit: 'x', label: 'שניים' }, { value: 90, unit: '%', label: 'שלושה' }] }),
    slide('chart', { title: 'פסים', items: [{ label: 'א', value: 10 }, { label: 'ב', value: 20 }, { label: 'ג', value: 15 }], takeaway: 'מסקנה אחת.' }),
    slide('chart', { type: 'columns', title: 'עמודות', items: [{ label: 'א', value: 10 }, { label: 'ב', value: 20 }, { label: 'ג', value: 15 }] }),
    slide('compare', { title: 'השוואה', sides: [{ heading: 'א', items: ['אחד', 'שניים'] }, { heading: 'ב', items: ['שלושה', 'ארבעה'] }] }),
    slide('steps', { title: 'שלבים', items: [{ title: 'א' }, { title: 'ב' }, { title: 'ג' }] }),
    slide('table', { title: 'טבלה', columns: ['שם', 'מחיר'], rows: [['א', '₪400'], ['ב', '₪1,200']] }),
    slide('quote', { text: 'ציטוט קצר ויפה.', author: 'מישהו', image: 'p.png', alt: 'דיוקן' }),
    slide('image', { image: 'b.png', alt: 'נוף', title: 'תמונה', caption: 'כיתוב' }),
    slide('gallery', { title: 'גלריה', items: [{ image: 'a.png', alt: 'א', caption: 'א' }, { image: 'b.png', alt: 'ב', caption: 'ב' }] }),
    slide('split', { title: 'פיצול', text: 'טקסט', bullets: ['א', 'ב'], image: 'a.png', alt: 'רקע', imageSide: 'start' }),
    slide('closing', { title: 'תודה', action: 'צרו קשר', contacts: [{ label: 'דוא״ל', value: 'a@b.co' }] }),
  ];
  assert.deepEqual([...new Set(slides.map(s => s.layout))].sort(), Object.keys(LAYOUTS).filter(k => k !== 'custom').sort());
  for (const theme of ['editorial', 'midnight', 'bold']) {
    const built = build(writeSpec(`all-${theme}`, { title: 'כל הפריסות', theme, brand: 'בדיקה', slides }), path.join(temp, `all-${theme}`));
    const result = await lintDeck(built.index, { sheet: false });
    const errors = result.slides.flatMap(s => s.issues.filter(i => i.level === 'error').map(i => `${s.index}:${s.layout}:${i.rule}:${i.message}`));
    assert.deepEqual(errors, [], theme);
  }
});

test('the lint catches overflow, tiny type, low contrast, collisions and missing alt text', async () => {
  const html = '<h2 class="title t-md">כותרת</h2>'
    + '<div class="card" style="position:absolute;inset-inline-start:100px;top:300px;width:300px;height:120px"><p style="font-size:40px">טקסט ארוך מאוד שלא נכנס בתוך הכרטיס הקטן הזה בשום אופן</p></div>'
    + '<p style="position:absolute;inset-inline-end:140px;top:520px;font-size:14px">טקסט זעיר</p>'
    + '<p style="position:absolute;inset-inline-end:140px;top:600px;font-size:40px;color:#cccccc">ניגודיות נמוכה</p>'
    + '<p style="position:absolute;inset-inline-end:140px;top:700px;font-size:40px">שכבה ראשונה</p><p style="position:absolute;inset-inline-end:140px;top:710px;font-size:40px">שכבה שנייה חופפת</p>'
    + '<img src="data:image/gif;base64,R0lGODlhAQABAAAAACw=" style="position:absolute;top:900px;inset-inline-start:140px;width:50px;height:50px">';
  const built = build(writeSpec('defects', { title: 'פגמים', slides: [slide('custom', { html })] }), path.join(temp, 'defects'));
  const result = await lintDeck(built.index, { sheet: false });
  const rules = new Set(result.slides[0].issues.filter(i => i.level === 'error').map(i => i.rule));
  for (const rule of ['overflow', 'font-size', 'contrast', 'overlap', 'alt']) assert.ok(rules.has(rule), `expected lint rule ${rule}, got ${[...rules]}`);
  assert.ok(result.summary.errors >= 5);
});

test('the lint warns about walls of text and deck rhythm', async () => {
  const wall = Array.from({ length: 95 }, (_, i) => `מילה${i}`).join(' ');
  const built = build(writeSpec('wall', { title: 'קיר', slides: [slide('custom', { html: `<h2 class="title t-md">כותרת</h2><p style="font-size:30px;line-height:1.3">${wall}</p>` }), ...[1, 2, 3].map(() => slide('points', { title: 'חוזר', items: [{ title: 'א' }, { title: 'ב' }] }))] }), path.join(temp, 'wall'));
  const result = await lintDeck(built.index, { sheet: false });
  assert.ok(result.slides[0].issues.some(i => i.rule === 'density'));
  assert.ok(result.deck.some(i => i.rule === 'monotony'));
});

test('editable export keeps units in order and survives several slides with rasterised icons', async () => {
  const icons = n => slide('points', { title: `כרטיסים ${n}`, items: [{ icon: 'target', title: 'א', text: 'ב' }, { icon: 'clock', title: 'ג', text: 'ד' }] });
  const built = build(writeSpec('export', { title: 'ייצוא', slides: [slide('bignumber', { value: 72, unit: '%', label: 'נתון' }), icons(1), icons(2), icons(3)] }), path.join(temp, 'export'));
  const output = path.join(temp, 'export.pptx');
  execFileSync(process.execPath, [path.join(skill, 'scripts/html-to-pptx.js'), built.index, output, '--mode=editable', '--rtl'], { timeout: 120000 });
  const zip = await JSZip.loadAsync(fs.readFileSync(output));
  const first = await zip.file('ppt/slides/slide1.xml').async('string');
  const box = text => { const m = new RegExp(`<a:off x="(\\d+)"[^>]*/><a:ext[^>]*/>(?:(?!</p:sp>).)*<a:t>${text}</a:t>`, 's').exec(first); assert.ok(m, `box for ${text}`); return Number(m[1]); };
  assert.ok(box('72') < box('%'), 'the percent sign must sit to the right of the number (72%), not before it');
  for (let i = 2; i <= 4; i++) {
    const xml = await zip.file(`ppt/slides/slide${i}.xml`).async('string');
    assert.equal((xml.match(/<p:pic>/g) || []).length, 2, `slide ${i} must carry its own two icon pictures`);
  }
});

test('an English deck builds left-to-right and lints clean', async () => {
  const built = build(writeSpec('en', { title: 'Quarterly review', lang: 'en', theme: 'corporate', slides: [slide('cover', { title: 'Quarterly review', subtitle: 'What worked and what changes' }), slide('points', { title: 'Three priorities', items: [{ title: 'Focus', text: 'One goal per quarter.' }, { title: 'Rhythm', text: 'A weekly checkpoint.' }, { title: 'Clarity', text: 'Numbers visible to all.' }] }), slide('closing', { title: 'Thank you', action: 'Book a call' })] }), path.join(temp, 'en'));
  assert.match(fs.readFileSync(built.index, 'utf8'), /<html lang="en" dir="ltr">/);
  const result = await lintDeck(built.index, { sheet: false });
  assert.equal(result.summary.errors, 0, JSON.stringify(result.slides.flatMap(s => s.issues)));
});

test('font installer lists the bundled fonts in a dry run and changes nothing', () => {
  const out = execFileSync(process.execPath, [path.join(skill, 'scripts/install-fonts.cjs'), '--dry-run'], { encoding: 'utf8' });
  for (const file of ['Heebo-Variable.ttf', 'Rubik-Variable.ttf', 'FrankRuhlLibre-Variable.ttf', 'SecularOne-Regular.ttf']) assert.ok(out.includes(file));
  assert.match(out, /nothing changed/);
});
