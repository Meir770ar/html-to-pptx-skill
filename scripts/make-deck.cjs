#!/usr/bin/env node
'use strict';
// One command: spec -> HTML deck -> design lint -> PowerPoint files (+ optional real PowerPoint render).
const fs = require('node:fs');
const path = require('node:path');
const execFile = require('node:util').promisify(require('node:child_process').execFile);
const { build } = require('./build-deck.cjs');
const { lintDeck, format } = require('./lint-deck.cjs');
const { contactSheet } = require('./deck/sheet.cjs');

const ROOT = path.resolve(__dirname, '..');

// Async so the editable and the image export (each with its own browser and output files) run side by side.
async function exportPptx(index, output, mode, rtl) {
  const args = [path.join(__dirname, 'html-to-pptx.js'), index, output, `--mode=${mode}`, '--overwrite', ...(rtl ? ['--rtl'] : [])];
  const { stdout } = await execFile(process.execPath, args, { maxBuffer: 64 * 1024 * 1024 });
  return JSON.parse(stdout);
}

function rasterSummary(reportPath) {
  const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
  const reasons = {};
  let slides = 0;
  for (const slide of report.slides) {
    if (slide.rasterFallbacks.length) slides++;
    for (const item of slide.rasterFallbacks) reasons[item.reason] = (reasons[item.reason] || 0) + 1;
  }
  return { slidesWithRaster: slides, reasons, fonts: [...new Set(report.slides.flatMap(s => s.fonts))] };
}

// verify-powerpoint.ps1 already retries each slide export; a failure here is real and is reported with PowerPoint's own message.
async function powerpointProof(pptx, outDir) {
  if (process.platform !== 'win32') return { skipped: 'PowerPoint rendering is available on Windows only' };
  fs.rmSync(outDir, { recursive: true, force: true });
  try {
    await execFile('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', path.join(__dirname, 'verify-powerpoint.ps1'), '-Pptx', pptx, '-OutputDir', outDir], { timeout: 240000 });
  } catch (error) {
    process.exitCode = 1;
    const detail = String(error.stderr || error.message).split(/\r?\n/).map(l => l.trim()).filter(Boolean).slice(0, 2).join(' ');
    return { skipped: `PowerPoint verification failed: ${detail}. If the fonts are not installed, run scripts/install-fonts.cjs and retry.` };
  }
  const images = fs.readdirSync(outDir).filter(f => /^slide-\d+\.png$/.test(f)).sort().map(f => path.join(outDir, f));
  return { dir: outDir, slides: images.length, contactSheet: images.length ? await contactSheet(images, path.join(outDir, 'contact-sheet.png')) : null };
}

async function main() {
  const args = process.argv.slice(2), flags = new Set(args.filter(a => a.startsWith('--'))), pos = args.filter(a => !a.startsWith('--'));
  if (pos.length !== 2) throw new Error('Usage: node scripts/make-deck.cjs spec.json OUTPUT-DIR [--overwrite] [--force] [--no-export] [--powerpoint]');
  const built = build(pos[0], pos[1], { overwrite: flags.has('--overwrite') });
  const rtl = built.dir === 'rtl';
  console.log(`Built ${built.slides} slides (theme: ${built.theme}) -> ${built.index}`);

  const lint = await lintDeck(built.index);
  console.log(format(lint));
  const result = { index: built.index, lint: { errors: lint.summary.errors, warnings: lint.summary.warnings, contactSheet: lint.contactSheet, proofDir: lint.proofDir } };
  if (lint.summary.errors && !flags.has('--force')) { console.log('\nFix the errors above (edit the spec) and run again. PowerPoint export was skipped.'); process.exitCode = 1; console.log(JSON.stringify(result, null, 2)); return; }

  if (!flags.has('--no-export')) {
    const exportDir = path.join(built.out, 'export');
    fs.mkdirSync(exportDir, { recursive: true });
    const editable = path.join(exportDir, 'deck.pptx'), faithful = path.join(exportDir, 'deck-faithful.pptx');
    const [e] = await Promise.all([exportPptx(built.index, editable, 'editable', rtl), exportPptx(built.index, faithful, 'image', rtl)]);
    result.editable = { file: editable, ...rasterSummary(e.report) };
    result.faithful = { file: faithful };
    const fontDir = path.join(exportDir, 'fonts-to-install');
    fs.mkdirSync(fontDir, { recursive: true });
    for (const font of built.fontsNeeded) fs.copyFileSync(path.join(ROOT, 'assets/fonts/ttf', font.ttf), path.join(fontDir, font.ttf));
    result.fontsToInstall = { dir: fontDir, files: built.fontsNeeded.map(x => x.ttf), why: 'Install these on any computer that opens deck.pptx, otherwise PowerPoint substitutes another font. deck-faithful.pptx is images and needs no fonts.' };
    if (flags.has('--powerpoint')) {
      result.powerpointEditable = await powerpointProof(editable, path.join(exportDir, 'powerpoint-editable'));
      result.powerpointFaithful = await powerpointProof(faithful, path.join(exportDir, 'powerpoint-faithful'));
    }
  }
  console.log(JSON.stringify(result, null, 2));
}

main().catch(error => { console.error(error.message); process.exitCode = 1; });
