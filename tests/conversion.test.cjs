'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { promisify } = require('node:util');
const execFile = promisify(require('node:child_process').execFile);
const { pathToFileURL } = require('node:url');
const JSZip = require('jszip');
const puppeteer = require('puppeteer');
const { browserPath } = require('../scripts/converter.cjs');
const skill = path.resolve(__dirname, '..'), cli = path.join(skill, 'scripts/html-to-pptx.js');
const fixture = path.join(__dirname, 'fixtures/rtl.html');
const sha = b => require('node:crypto').createHash('sha256').update(b).digest('hex');
let temp;
test.before(async () => { temp = await fs.mkdtemp(path.join(os.tmpdir(), 'html-pptx-v2-tests-')); });
test.after(async () => { if (temp) await fs.rm(temp, { recursive: true, force: true }); });
async function run(input, name, flags = [], expected = 0) {
  const output = path.join(temp, `${name}.pptx`);
  let result;
  try { result = { ...await execFile(process.execPath, [cli, input, output, '--rtl', ...flags], { timeout: 60000 }), code: 0 }; }
  catch (error) { result = { code: error.code, stdout: error.stdout || '', stderr: error.stderr || '' }; }
  assert.equal(result.code, expected, result.stderr);
  return { output, result, report: JSON.parse(await fs.readFile(`${output}.report.json`, 'utf8')) };
}

test('all raster slides are distinct and embed the actual corresponding source PNG', async () => {
  const { output, report } = await run(fixture, 'faithful', ['--mode=image']);
  assert.equal(report.outputSlideCount, 2); assert.notEqual(report.slides[0].sourceSha256, report.slides[1].sourceSha256);
  const zip = await JSZip.loadAsync(await fs.readFile(output));
  for (let i = 1; i <= 2; i++) {
    const xml = await zip.file(`ppt/slides/slide${i}.xml`).async('string');
    assert.equal((xml.match(/<p:pic>/g) || []).length, 1); assert.ok(xml.includes('<p:fade/>'));
    const media = await zip.file(`ppt/media/image-${i}-1.png`).async('nodebuffer');
    assert.equal(sha(media), report.slides[i - 1].sourceSha256);
  }
});

test('editable export keeps native RTL text, one actual table, source image and list markers', async () => {
  const { output, report } = await run(fixture, 'native', ['--mode=editable', '--require-editable']);
  assert.equal(report.complete, true); assert.equal(report.outputSlideCount, 2);
  assert.equal(report.slides[0].nativeTables, 1); assert.equal(report.slides[0].separateImages, 1);
  assert.ok(report.slides.every(s => s.editableTextBoxes > 5 && s.rasterFallbacks.length === 0));
  const zip = await JSZip.loadAsync(await fs.readFile(output));
  const first = await zip.file('ppt/slides/slide1.xml').async('string');
  const second = await zip.file('ppt/slides/slide2.xml').async('string');
  assert.ok(first.includes('<a:tbl>')); assert.ok(first.includes('rtl="1"')); assert.ok(first.includes('he-IL'));
  assert.ok(first.includes('PowerPoint 2026')); assert.ok(first.includes('1,250')); assert.ok(first.includes('תבליט ראשון בעברית'));
  assert.ok(second.includes('Microsoft 365')); assert.ok(second.includes('שלב ראשון')); assert.ok(second.includes('1.'));
});

test('hybrid export has a decoration background and editable text on every slide', async () => {
  const { output, report } = await run(fixture, 'hybrid', ['--mode=hybrid']);
  const zip = await JSZip.loadAsync(await fs.readFile(output));
  assert.ok(report.warnings.length); assert.ok(report.slides.every(s => s.editableTextBoxes > 5));
  const second = await zip.file('ppt/slides/slide2.xml').async('string');
  assert.ok(second.includes('HTML decoration background')); assert.ok(second.includes('Microsoft 365'));
  assert.ok(second.includes('1.')); assert.ok(second.includes('2.'));
});

test('strict mode fails explicitly for unsupported effects and never writes a partial PPTX', async () => {
  const input = path.join(temp, 'effects.html');
  await fs.writeFile(input, '<html lang="he" dir="rtl"><body><section class="slide" style="width:960px;height:540px;background:linear-gradient(red,blue)"><h1>טקסט עם אפקט</h1></section></body></html>');
  const { output, report } = await run(input, 'strict-rejected', ['--mode=editable', '--require-editable'], 1);
  assert.equal(report.complete, false); assert.match(report.error, /raster fallbacks/);
  await assert.rejects(fs.access(output));
});

test('broken images, mismatched dimensions, empty selectors and existing outputs are not silently accepted', async () => {
  const broken = path.join(temp, 'broken.html');
  await fs.writeFile(broken, '<section class="slide" style="width:960px;height:540px"><img src="missing-image.png"></section>');
  const result = await run(broken, 'broken', ['--mode=image'], 1); assert.match(result.report.error, /unloaded image/);
  const sizes = path.join(temp, 'sizes.html');
  await fs.writeFile(sizes, '<section class="slide" style="width:960px;height:540px">A</section><section class="slide" style="width:800px;height:540px">B</section>');
  const mismatch = await run(sizes, 'sizes', ['--mode=image'], 1); assert.match(mismatch.report.error, /different size/);
  const selector = await run(fixture, 'selector', ['--mode=image', '--slide-per=.nonexistent'], 1); assert.match(selector.report.error, /No slides/);
  const old = await fs.readFile(path.join(temp, 'faithful.pptx'));
  await assert.rejects(execFile(process.execPath, [cli, fixture, path.join(temp, 'faithful.pptx'), '--mode=image']), /Output\/report exists/);
  assert.equal(sha(await fs.readFile(path.join(temp, 'faithful.pptx'))), sha(old));
});

test('interactive final/step exports retain all scenes, reveal states and speaker notes', async () => {
  const source = path.join(skill, 'assets/interactive-deck.html');
  const final = await run(source, 'interactive', ['--mode=image']);
  assert.equal(final.report.outputSlideCount, 3); assert.equal(new Set(final.report.slides.map(s => s.sourceSha256)).size, 3);
  assert.ok(final.report.slides.every(s => s.notesPreserved));
  const native = await run(source, 'interactive-native', ['--mode=editable']);
  const nativeZip = await JSZip.loadAsync(await fs.readFile(native.output));
  const nativeXml = await nativeZip.file('ppt/slides/slide1.xml').async('string');
  assert.ok(nativeXml.includes('prst="ellipse"'));
  assert.ok([...nativeXml.matchAll(/<a:prstGeom prst="ellipse">([\s\S]*?)<\/a:prstGeom>/g)].every(match => !match[1].includes('<a:gd')));
  assert.ok(nativeXml.includes('rtl="1"'));
  const steps = await run(source, 'steps', ['--mode=image', '--fragments=steps', '--scale=1']);
  assert.equal(steps.report.sourceSlideCount, 3); assert.equal(steps.report.outputSlideCount, 10);
  assert.equal(new Set(steps.report.slides.map(s => s.sourceSha256)).size, 10);
  assert.deepEqual(steps.report.slides.map(s => s.fragmentStep), [0, 1, 0, 1, 2, 3, 0, 1, 2, 3]);
});

test('browser controls, branching, presenter sync, notes, small viewport and reduced motion work', async () => {
  const browser = await puppeteer.launch({ headless: true, executablePath: await browserPath(), args: process.platform !== 'win32' && process.getuid?.() === 0 ? ['--no-sandbox'] : [] });
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 800 }); await page.goto(pathToFileURL(path.join(skill, 'assets/interactive-deck.html')).href);
    await page.waitForFunction(() => !!window.__interactiveDeck);
    await page.keyboard.press('ArrowRight'); assert.deepEqual(await page.evaluate(() => window.__interactiveDeck.getState()), { index: 0, fragment: 1 });
    await page.keyboard.press('ArrowRight'); assert.deepEqual(await page.evaluate(() => window.__interactiveDeck.getState()), { index: 1, fragment: 0 });
    await page.evaluate(() => window.__interactiveDeck.show(0)); await page.click('[data-goto=results]');
    assert.equal(await page.evaluate(() => window.__interactiveDeck.getState().index), 1);
    await page.keyboard.press('n'); assert.equal(await page.$eval('.notes-panel', el => el.classList.contains('is-open')), true);
    await page.$eval('.notes-panel textarea', el => { el.value = 'הערת בדיקה'; el.dispatchEvent(new Event('input', { bubbles: true })); });
    await page.evaluate(() => window.__interactiveDeck.show(2)); await page.evaluate(() => window.__interactiveDeck.show(1));
    assert.equal(await page.$eval('.notes-panel textarea', el => el.value), 'הערת בדיקה');
    await page.keyboard.press('n');
    const targetReady = browser.waitForTarget(t => t.url().includes('audience=1'), { timeout: 10000 });
    await page.click('[data-present]'); const target = await targetReady, audience = await target.page();
    await audience.waitForFunction(() => window.__interactiveDeck?.getState().index === 1);
    await page.evaluate(() => window.__interactiveDeck.show(2)); await audience.waitForFunction(() => window.__interactiveDeck.getState().index === 2);
    assert.equal(await audience.$eval('.controls', el => getComputedStyle(el).display), 'none');
    await audience.close();
    await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
    await page.evaluate(() => window.__interactiveDeck.show(0));
    assert.equal(await page.evaluate(() => document.getAnimations().length), 0);
    await page.setViewport({ width: 390, height: 844 });
    await page.waitForFunction(() => Number(getComputedStyle(document.documentElement).getPropertyValue('--deck-scale')) < 0.3);
    const bounds = await page.$eval('.controls', el => ({ left: el.getBoundingClientRect().left, right: el.getBoundingClientRect().right }));
    assert.ok(bounds.left >= 0 && bounds.right <= 391);
  } finally { await browser.close(); }
});
