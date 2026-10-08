#!/usr/bin/env node
'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
(async () => {
  const target = process.argv[2];
  const option = process.argv[3];
  if (!target || process.argv.length > 4 || option && !option.startsWith('--style=')) throw new Error('Usage: node scripts/init-deck.cjs NEW-DECK-DIRECTORY [--style=PROFILE.style.json]');
  const tokens = option ? await require('./redesign-pptx.cjs').profile({ style: option.slice(8) }) : null;
  const destination = path.resolve(target);
  await fs.mkdir(destination, { recursive: false });
  for (const [source, filename] of [['interactive-deck.html', 'index.html'], ['deck.css', 'deck.css'], ['deck-runtime.js', 'deck-runtime.js']]) {
    await fs.copyFile(path.join(__dirname, '..', 'assets', source), path.join(destination, filename));
  }
  if (tokens) {
    const overrides = `\n:root{--paper:#${tokens.background};--ink:#${tokens.foreground};--teal:#${tokens.accent};--accent:#${tokens.accent}}body{font-family:${JSON.stringify(tokens.bodyFont)},Arial,sans-serif}h1,h2,h3{font-family:${JSON.stringify(tokens.titleFont)},Arial,sans-serif}.lead,.label,.footer{color:#${tokens.muted}}\n`;
    await fs.appendFile(path.join(destination, 'deck.css'), overrides);
  }
  console.log(destination);
})().catch(error => { console.error(error.message); process.exitCode = 1; });
