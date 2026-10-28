// Fails if the first-load JS (entry + modulepreloads in dist/index.html) exceeds the budget.
import fs from 'node:fs';
import zlib from 'node:zlib';

const BUDGET_KB = Number(process.env.JS_BUDGET_KB ?? 250);
const html = fs.readFileSync('dist/index.html', 'utf8');
const files = [...new Set([...html.matchAll(/(?:src|href)="\/(assets\/[^"]+\.js)"/g)].map(m => m[1]))];
if (files.length === 0) { console.error('No JS found in dist/index.html'); process.exit(2); }

let total = 0;
for (const f of files) {
  const kb = zlib.gzipSync(fs.readFileSync(`dist/${f}`)).length / 1024;
  total += kb;
  console.log(`${kb.toFixed(1).padStart(7)} KB  ${f}`);
}
console.log(`Initial JS (gzip): ${total.toFixed(1)} KB / budget ${BUDGET_KB} KB`);
if (total > BUDGET_KB) { console.error('Budget exceeded'); process.exit(1); }
