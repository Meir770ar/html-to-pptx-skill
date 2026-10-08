#!/usr/bin/env node
'use strict';
require('./converter.cjs').main().catch(error => {
  console.error(`Conversion failed: ${error.message}`);
  process.exitCode = 1;
});
