'use strict';

const fs = require('fs');
const path = require('path');

const dir = __dirname;
const files = fs
  .readdirSync(dir)
  .filter((f) => f.endsWith('.test.js'))
  .sort();

let failed = 0;
let passed = 0;

(async () => {
  for (const file of files) {
    const full = path.join(dir, file);
    process.stdout.write(`\n--- ${file} ---\n`);
    try {
      const mod = require(full);
      if (typeof mod.run === 'function') {
        const result = await mod.run();
        passed += result.passed || 0;
        failed += result.failed || 0;
      }
    } catch (err) {
      failed++;
      console.error(`Test file crashed: ${file}`);
      console.error(err.stack || err.message);
    }
  }

  console.log(`\nResults: ${passed} passed, ${failed} failed`);
  process.exit(failed === 0 ? 0 : 1);
})();
