'use strict';

const path = require('path');
const fs = require('fs');

async function main() {
  const dir = __dirname;
  const files = fs.readdirSync(dir).filter(f => f.endsWith('.test.js'));
  let passed = 0, failed = 0;

  for (const f of files) {
    const cases = require(path.join(dir, f));
    for (const [name, fn] of cases) {
      try {
        const r = fn();
        if (r && typeof r.then === 'function') await r;
        console.log(`  ok  ${f} :: ${name}`);
        passed++;
      } catch (e) {
        console.log(`  FAIL ${f} :: ${name}\n      ${e.stack || e.message}`);
        failed++;
      }
    }
  }
  console.log(`\nPassed: ${passed}`);
  console.log(`Failed: ${failed}`);
  console.log(`\n${passed} passed, ${failed} failed (${files.length} files)`);
  if (failed) process.exit(1);
}
main().catch(e => { console.error(e); process.exit(2); });
