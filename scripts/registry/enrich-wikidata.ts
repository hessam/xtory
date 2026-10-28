/**
 * Fetches ruler birth/death years and en/fa labels from Wikidata (CC0) into a committed cache,
 * so normal builds never need the network and results are reviewable in git.
 *
 *   npx tsx scripts/registry/enrich-wikidata.ts            # fetch missing entries
 *   npx tsx scripts/registry/enrich-wikidata.ts --refresh  # refetch everything
 *
 * Input : data/registry/ruler_qids.json   { "<rulerId>": "Q123", ... }  (curated by hand — a wrong QID is a wrong fact)
 * Output: data/registry/wikidata-cache.json
 *
 * Only year-precision-or-better dates (Wikidata precision >= 9) are kept. Anything else is stored as null
 * and listed at the end: missing dates are reported, never guessed.
 * NOTE: needs network access to www.wikidata.org (blocked in the default cloud sandbox).
 */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '../..');
const QIDS = path.join(ROOT, 'data/registry/ruler_qids.json');
const CACHE = path.join(ROOT, 'data/registry/wikidata-cache.json');

interface CacheEntry { qid: string; label: { en: string | null; fa: string | null }; born: number | null; died: number | null; retrieved: string }

const readJson = <T>(p: string, d: T): T => (fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf8')) : d);

/** "+0612-01-01T00:00:00Z" → 612 ; "-0550-..." → -550. Wikidata has no year 0: -0001 is 1 BC. */
function yearOf(claim: any): number | null {
  const v = claim?.mainsnak?.datavalue?.value;
  if (!v || typeof v.time !== 'string' || (v.precision ?? 0) < 9) return null;
  const m = v.time.match(/^([+-])(\d+)-/);
  return m ? (m[1] === '-' ? -parseInt(m[2], 10) : parseInt(m[2], 10)) : null;
}

async function fetchEntity(qid: string): Promise<CacheEntry> {
  const res = await fetch(`https://www.wikidata.org/wiki/Special:EntityData/${qid}.json`, { headers: { 'User-Agent': 'xtory-registry/1.0 (https://github.com/hessam/xtory)' } });
  if (!res.ok) throw new Error(`${qid}: HTTP ${res.status}`);
  const e = (await res.json()).entities[qid];
  return {
    qid,
    label: { en: e.labels?.en?.value ?? null, fa: e.labels?.fa?.value ?? null },
    born: yearOf(e.claims?.P569?.[0]),
    died: yearOf(e.claims?.P570?.[0]),
    retrieved: new Date().toISOString().slice(0, 10),
  };
}

const refresh = process.argv.includes('--refresh');
const qids = readJson<Record<string, string>>(QIDS, {});
const cache = readJson<Record<string, CacheEntry>>(CACHE, {});

for (const [rulerId, qid] of Object.entries(qids)) {
  if (!refresh && cache[rulerId]?.qid === qid) continue;
  try { cache[rulerId] = await fetchEntity(qid); console.log(`ok   ${rulerId} ${qid}`); }
  catch (err) { console.error(`FAIL ${rulerId} ${qid}: ${(err as Error).message}`); }
  await new Promise(r => setTimeout(r, 300)); // be polite
}

fs.writeFileSync(CACHE, JSON.stringify(Object.fromEntries(Object.entries(cache).sort()), null, 1) + '\n');
const gaps = Object.entries(cache).filter(([, c]) => c.born === null || c.died === null);
console.log(`\n${Object.keys(cache).length} cached, ${gaps.length} with a missing birth or death year:`);
gaps.forEach(([id, c]) => console.log(`  ${id}: born=${c.born} died=${c.died}`));
