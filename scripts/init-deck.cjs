#!/usr/bin/env node
'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
(async () => {
  const target = process.argv[2];
  if (!target || process.argv.length !== 3) throw new Error('Usage: node scripts/init-deck.cjs NEW-DECK-DIRECTORY');
  const destination = path.resolve(target);
  await fs.mkdir(destination, { recursive: false });
  for (const [source, filename] of [['interactive-deck.html', 'index.html'], ['deck.css', 'deck.css'], ['deck-runtime.js', 'deck-runtime.js']]) {
    await fs.copyFile(path.join(__dirname, '..', 'assets', source), path.join(destination, filename));
  }
  console.log(destination);
})().catch(error => { console.error(error.message); process.exitCode = 1; });
