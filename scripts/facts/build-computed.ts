/**
 * Generates the static computed facts.   npx tsx scripts/facts/build-computed.ts
 * Output: src/data/generated/facts.computed.json  (committed; CI `facts:check` fails on drift)
 * If data/registry/wikidata-cache.json exists (npm run registry:wikidata), lives that Wikidata confirms (±1 year) become `verified`.
 */
import fs from 'node:fs';
import path from 'node:path';
import { buildComputedFacts, type Wikidata } from '../../src/facts/computed';

const ROOT = path.resolve(import.meta.dirname, '../..');
const cachePath = path.join(ROOT, 'data/registry/wikidata-cache.json');
const wikidata: Wikidata = fs.existsSync(cachePath) ? JSON.parse(fs.readFileSync(cachePath, 'utf8')) : {};

const facts = buildComputedFacts({ wikidata });
fs.writeFileSync(path.join(ROOT, 'src/data/generated/facts.computed.json'), JSON.stringify(facts) + '\n');

const by = (k: (f: (typeof facts)[number]) => string) => facts.reduce<Record<string, number>>((m, f) => { m[k(f)] = (m[k(f)] ?? 0) + 1; return m; }, {});
console.log(`computed facts: ${facts.length}`);
console.log('by status:', JSON.stringify(by(f => f.status)));
console.log('by type  :', JSON.stringify(by(f => f.id.split('_')[1] + (f.id.split('_')[2] && isNaN(+f.id.split('_')[2].slice(0, 1)) && !/^[0-9a-f]{10}$/.test(f.id.split('_')[2]) ? '_' + f.id.split('_')[2] : ''))));
