#!/usr/bin/env node
'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const puppeteer = require('puppeteer');
const { browserPath, discoverSlides, prepareSlide } = require('./converter.cjs');
const P = require('./pptx-source.cjs');
async function htmlSnapshot(filename) {
  const browser = await puppeteer.launch({ headless: true, executablePath: await browserPath(), args: process.platform !== 'win32' && process.getuid?.() === 0 ? ['--no-sandbox'] : [] });
  try {
    const page = await browser.newPage(); await page.setViewport({ width: 1920, height: 1080 });
    await page.goto(pathToFileURL(path.resolve(filename)).href, { waitUntil: 'networkidle0', timeout: 45000 });
    const slides = await discoverSlides(page), snapshots = [];
    for (const slide of slides) {
      const root = await prepareSlide(page, slide, { captureTime: 1000, wait: 0 }, null);
      snapshots.push(await root.evaluate(el => {
        const notes = el.getAttribute('data-notes') || el.querySelector('[data-speaker-notes]')?.textContent || el.dataset.pptxExportNotes || '';
        const clone = el.cloneNode(true); clone.querySelectorAll('script,style,[data-pptx-ignore],[data-speaker-notes]').forEach(n => n.remove());
        return { text: clone.textContent.replace(/\s+/g, ' ').trim(), notes,
          links: [...clone.querySelectorAll('a[href]')].map(n => n.getAttribute('href')),
          media: [...clone.querySelectorAll('img,video,audio,source')].map(n => ({ kind: n.tagName, src: n.getAttribute('src') || '', alt: n.getAttribute('alt') || '', poster: n.getAttribute('poster') || '' })) };
      }));
    }
    return { schema: 1, kind: 'html', slides: snapshots };
  } finally { await browser.close(); }
}
async function verify(input, output) {
  const a = path.extname(input).toLowerCase(), b = path.extname(output).toLowerCase();
  if (a !== b) throw new Error('Compare files of the same format');
  if (a === '.pptx') return P.verify(await P.load(input), await P.load(output));
  if (!['.html', '.htm'].includes(a)) throw new Error('Content lock supports HTML and PPTX');
  const before = await htmlSnapshot(input), after = await htmlSnapshot(output), errors = [];
  if (before.slides.length !== after.slides.length) errors.push('Slide count changed');
  for (let i = 0; i < Math.min(before.slides.length, after.slides.length); i++) for (const field of ['text', 'notes', 'links', 'media']) if (JSON.stringify(before.slides[i][field]) !== JSON.stringify(after.slides[i][field])) errors.push(`Slide ${i + 1}: ${field} changed`);
  return { schema: 1, passed: !errors.length, errors, slides: before.slides.length, checks: ['ordered slide text with normalized whitespace', 'speaker notes', 'link targets', 'media references'],
    limitation: 'Visual legibility and external media bytes need separate inspection; identical DOM text can still be poorly styled.' };
}
async function main() {
  const [command, input, output] = process.argv.slice(2);
  if (!command || command === '--help') { console.log('verify BEFORE.html AFTER.html\nverify BEFORE.pptx AFTER.pptx'); return; }
  if (command !== 'verify' || !input || !output) throw new Error('Use verify BEFORE AFTER');
  const report = await verify(input, output); console.log(JSON.stringify(report, null, 2)); if (!report.passed) process.exitCode = 1;
}
if (require.main === module) main().catch(error => { console.error(`Content lock failed: ${error.message}`); process.exitCode = 1; });
module.exports = { verify, htmlSnapshot };
