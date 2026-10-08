#!/usr/bin/env node
'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const JSZip = require('jszip');
(async () => {
  if (process.argv.length !== 3) throw new Error('Usage: node scripts/package-skill.cjs NEW-ARCHIVE.zip');
  const output = path.resolve(process.argv[2]), skill = path.resolve(__dirname, '..');
  if (!output.toLowerCase().endsWith('.zip')) throw new Error('Output must have .zip extension');
  const zip = new JSZip(), files = [];
  async function include(relative) {
    const stat = await fs.stat(path.join(skill, relative));
    if (stat.isDirectory()) { for (const name of (await fs.readdir(path.join(skill, relative))).sort()) await include(path.join(relative, name)); }
    else { const data = await fs.readFile(path.join(skill, relative)); zip.file(`html-to-pptx/${relative.replaceAll(path.sep, '/')}`, data); files.push({ path: relative.replaceAll(path.sep, '/'), sha256: crypto.createHash('sha256').update(data).digest('hex') }); }
  }
  for (const filename of ['SKILL.md', 'README.md', 'SETUP.md', 'CLAUDE.md', 'LICENSE', 'package.json', 'package-lock.json', 'scripts', 'references', 'assets', 'tests']) await include(filename);
  zip.file('html-to-pptx/package-manifest.json', JSON.stringify({ version: '2.0.0', files }, null, 2));
  const bytes = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
  await fs.mkdir(path.dirname(output), { recursive: true }); await fs.writeFile(output, bytes, { flag: 'wx' });
  console.log(JSON.stringify({ output, files: files.length + 1, bytes: bytes.length, sha256: crypto.createHash('sha256').update(bytes).digest('hex') }, null, 2));
})().catch(error => { console.error(error.message); process.exitCode = 1; });
