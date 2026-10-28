// Fails if anything in dist/ looks like a credential. Run on a build made WITHOUT secrets in env.
import fs from 'node:fs';
import path from 'node:path';

const PATTERNS = [
  ['Google API key', /AIza[0-9A-Za-z_\-]{35}/],
  ['OpenRouter key', /sk-or-[A-Za-z0-9_\-]{20,}/],
  ['Generic secret key', /sk-[A-Za-z0-9]{32,}/],
  ['Thunderforest apikey', /apikey=[0-9a-f]{32}/],
  ['Private key block', /-----BEGIN [A-Z ]*PRIVATE KEY-----/],
];

const hits = [];
(function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { walk(p); continue; }
    if (!/\.(js|css|html|json|map)$/.test(e.name)) continue;
    const text = fs.readFileSync(p, 'utf8');
    for (const [label, re] of PATTERNS) if (re.test(text)) hits.push(`${label} in ${p}`);
  }
})('dist');
// generated serverless bundles are shipped code too
if (fs.existsSync('api')) (function walkApi(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { walkApi(p); continue; }
    if (!e.name.endsWith('.js')) continue;
    const text = fs.readFileSync(p, 'utf8');
    for (const [label, re] of PATTERNS) if (re.test(text)) hits.push(`${label} in ${p}`);
  }
})('api');

if (hits.length) { console.error('Possible secrets in build output:\n' + hits.join('\n')); process.exit(1); }
console.log('No secret patterns found in dist/.');
