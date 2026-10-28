/**
 * Builds the canonical dynasty registry from the curated research files.
 *
 *   npx tsx scripts/registry/build-registry.ts [--strict]
 *
 * Input : docs/historical_data/*.json  (READ ONLY — never edited by this script)
 *         data/registry/overrides.json (hand-maintained merges, families, overlords)
 *         data/registry/names_fa.json  (Persian names, hand-maintained)
 * Output: src/data/generated/dynasties.json, src/data/generated/realms.json
 *
 * --strict fails when anything is unresolved (missing Persian name, unparseable years).
 */
import fs from 'node:fs';
import path from 'node:path';
import { parseYearRanges } from '../../src/lib/yearRange';
import { colorForDynasty, FAMILIES, type Family } from './colors';

const ROOT = path.resolve(import.meta.dirname, '../..');
const DATA_DIR = path.join(ROOT, 'docs/historical_data');
const OUT_DIR = path.join(ROOT, 'src/data/generated');
const strict = process.argv.includes('--strict');

export const CORE_REGIONS = ['fars','jibal','khuzestan','mesopotamia','azerbaijan','caucasus','caspian_coast','khorasan','sistan','makran','transoxiana','chorasmia'];

interface RawEntry { region_id?: string; dynasty_name?: string; approximate_years_active?: string; approximate_years?: string; confidence?: string }
interface Overrides {
  /** base key (see baseKey) → canonical base key. Every merge needs a reason. */
  merge: Record<string, { into: string; reason: string }>;
  /** base keys too generic to merge on ("local"); the full raw name becomes the identity. */
  generic: string[];
  /** canonical base key → display name override (en) */
  names: Record<string, string>;
  /** canonical base key → family */
  family: Record<string, Family>;
  /** canonical base key → canonical base key of the overlord */
  overlord: Record<string, string>;
  /** "file|raw name" → reason. Entries deliberately left out (e.g. undated). */
  skip: Record<string, string>;
}

export type Relation = 'direct' | 'suzerain' | 'vassal' | 'governor' | 'influence' | 'occupation' | 'branch';

const STOP_WORDS = /\b(dynasty|dynasties|empire|sultanate|khaganate|khanate|caliphate|kingdom|house|emirate|state|states|rulers|tribes?|princes|dynasts|principality|confederacy|confederation)\b/g;

/** Stable identity key for a raw name: qualifiers and generic nouns removed. */
export function baseKey(raw: string): string {
  return raw
    .replace(/\s*\([^)]*\)/g, '')
    .toLowerCase()
    .replace(STOP_WORDS, ' ')
    .replace(/\b(the|of)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/s$/, '');
}

export function qualifierOf(raw: string): string {
  const m = raw.match(/\(([^)]*)\)/g);
  return m ? m.map(x => x.slice(1, -1)).join('; ') : '';
}

export function relationOf(qualifier: string): Relation {
  const q = qualifier.toLowerCase();
  if (/vassal|client|tributar|satrapy|satrap/.test(q)) return 'vassal';
  if (/suzerain|overlord|nominal/.test(q)) return 'suzerain';
  if (/governor|marzban|admin/.test(q)) return 'governor';
  if (/influence|incursion|raid/.test(q)) return 'influence';
  if (/occupation|conquest|temporary/.test(q)) return 'occupation';
  if (/branch|line|house|rump|restored|revival|first|second|third/.test(q)) return 'branch';
  return 'direct';
}

const FAMILY_RULES: [RegExp, Family][] = [
  [/\b(caliphate|rashidun|umayyad|abbasid|tulunid|hamdanid|banu|mazyadid|uqaylid|marwanid)\b/i, 'arab'],
  [/\b(turk\w*|seljuq|ghaznavid|khwarazmian|khorezm\w*|qara|kara|qoyunlu|mongol|ilkhan\w*|timurid|chagatai|golden horde|afsharid|qajar|qarluq|oghuz|shaybanid|janid|khanates?)\b/i, 'turkic'],
  [/\b(seleucid|argead|macedonian|greco|graeco|hellenistic|ptolem\w*|bactrian|diadoch\w*|antigonid|indo-greek)\b/i, 'greek'],
  [/\b(babylon\w*|assyria\w*|akkad\w*|chaldean|aramaean|sumer\w*)\b/i, 'semitic'],
  [/\b(roman|byzantine|ottoman|russian|british|georgia|armenia|albania|iberia|egypt|durrani|mughal|maurya|china|tang|tibetan)\b/i, 'foreign'],
  [/\b(saka|scythian|sarmatian|nomad\w*|massagetae|dahae|tribes?|horde|steppe|amardian|cadusian|koban|colchian|hephthalite|kidarite|huns?)\b/i, 'nomadic'],
];

function familyOf(key: string, display: string, ov: Overrides): Family {
  if (ov.family[key]) return ov.family[key];
  for (const [re, fam] of FAMILY_RULES) if (re.test(display)) return fam;
  return 'persian';
}

const slug = (s: string) => s.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');

const confRank = { low: 0, medium: 1, high: 2 } as const;
const normConf = (c?: string): 'high' | 'medium' | 'low' => {
  const v = (c || 'medium').toLowerCase();
  return v === 'high' || v === 'low' ? v : 'medium';
};

function readJson<T>(p: string, fallback: T): T {
  return fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf8')) : fallback;
}

// ── main ─────────────────────────────────────────────────────────────────────

const overrides = readJson<Overrides>(path.join(ROOT, 'data/registry/overrides.json'), { merge: {}, generic: [], names: {}, family: {}, overlord: {}, skip: {} });
const namesFa = readJson<Record<string, string>>(path.join(ROOT, 'data/registry/names_fa.json'), {});

interface Row { raw: string; region: string; spans: { start: number; end: number }[]; conf: 'high' | 'medium' | 'low'; file: string }
const rows: Row[] = [];
const unparsed: string[] = [];
const skipped: string[] = [];
const files = fs.readdirSync(DATA_DIR).filter(f => f.endsWith('.json')).sort();

for (const file of files) {
  const entries: RawEntry[] = JSON.parse(fs.readFileSync(path.join(DATA_DIR, file), 'utf8'));
  for (const e of entries) {
    if (!e.dynasty_name || !e.region_id) { unparsed.push(`${file}: missing name/region ${JSON.stringify(e)}`); continue; }
    const yearsRaw = e.approximate_years_active ?? e.approximate_years;
    const skipReason = overrides.skip[`${file}|${e.dynasty_name.trim()}`];
    if (skipReason) { skipped.push(`${file}: "${e.dynasty_name}" — ${skipReason}`); continue; }
    const spans = parseYearRanges(yearsRaw);
    if (spans.length === 0) { unparsed.push(`${file}: "${e.dynasty_name}" years="${yearsRaw ?? ''}"`); continue; }
    rows.push({ raw: e.dynasty_name.trim(), region: e.region_id, spans, conf: normConf(e.confidence), file });
  }
}

// identity: canonical key per raw name
const identityOf = (raw: string): string => {
  const base = slug(baseKey(raw));
  if (overrides.generic.includes(base)) return slug(raw);
  return overrides.merge[base]?.into ?? base;
};

const groups = new Map<string, Row[]>();
for (const r of rows) {
  const id = identityOf(r.raw);
  if (!groups.has(id)) groups.set(id, []);
  groups.get(id)!.push(r);
}

const displayName = (key: string, members: Row[]): string => {
  if (overrides.names[key]) return overrides.names[key];
  const plain = members.map(m => m.raw).filter(n => !n.includes('('));
  const pool = plain.length ? plain : members.map(m => m.raw.replace(/\s*\([^)]*\)/g, '').trim());
  // most frequent, then shortest
  const freq = new Map<string, number>();
  for (const n of pool) freq.set(n, (freq.get(n) ?? 0) + 1);
  return [...freq.entries()].sort((a, b) => b[1] - a[1] || a[0].length - b[0].length || a[0].localeCompare(b[0]))[0][0];
};

const usedIds = new Set<string>();
const idOfKey = new Map<string, string>();
interface DynastyOut { id: string; name: { en: string; fa: string }; family: Family; color: string; emblemSeed: number; overlordId?: string; start: number; end: number; aliases: string[]; regions: string[]; entries: number }
const dynasties: DynastyOut[] = [];
const missingFa: string[] = [];

const sortedKeys = [...groups.keys()].sort();
for (const key of sortedKeys) {
  const members = groups.get(key)!;
  const id = key;
  if (usedIds.has(id)) throw new Error(`duplicate dynasty id ${id}`);
  usedIds.add(id);
  idOfKey.set(key, id);

  const en = displayName(key, members);
  const fa = namesFa[id];
  if (!fa) missingFa.push(`${key}  (${en})`);
  const allSpans = members.flatMap(m => m.spans);
  dynasties.push({
    id,
    name: { en, fa: fa ?? '' },
    family: familyOf(key, en, overrides),
    color: '',
    emblemSeed: [...id].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7),
    start: Math.min(...allSpans.map(s => s.start)),
    end: Math.max(...allSpans.map(s => s.end)),
    aliases: [...new Set(members.map(m => m.raw))].sort(),
    regions: [...new Set(members.map(m => m.region))].sort(),
    entries: members.length,
  });
}

for (const [key, over] of Object.entries(overrides.overlord)) {
  const d = dynasties.find(x => x.id === idOfKey.get(key));
  const o = idOfKey.get(over);
  if (d && o) d.overlordId = o;
  else console.warn(`overlord override ignored (unknown key): ${key} → ${over}`);
}

// distinct colours, deterministic (sorted by id)
const taken: { id: string; hex: string; family: Family }[] = [];
for (const d of dynasties) {
  d.color = colorForDynasty(d.id, d.family, taken);
  taken.push({ id: d.id, hex: d.color, family: d.family });
}

// realms: one row per (entry × span)
type RealmRow = [dynastyIdx: number, regionId: string, start: number, end: number, relation: Relation, confidence: 0 | 1 | 2, fileIdx: number];
const dynastyIdx = new Map(dynasties.map((d, i) => [d.id, i]));
const realms: RealmRow[] = [];
for (const r of rows) {
  const id = idOfKey.get(identityOf(r.raw))!;
  const rel = relationOf(qualifierOf(r.raw));
  for (const s of r.spans) realms.push([dynastyIdx.get(id)!, r.region, s.start, s.end, rel, confRank[r.conf], files.indexOf(r.file)]);
}
realms.sort((a, b) => a[2] - b[2] || a[0] - b[0] || a[1].localeCompare(b[1]) || a[3] - b[3]);

fs.mkdirSync(OUT_DIR, { recursive: true });
// Runtime file stays slim; audit details (aliases, regions, entry counts) go to a separate file.
fs.writeFileSync(path.join(OUT_DIR, 'dynasties.json'), JSON.stringify(dynasties.map(({ aliases, regions, entries, ...rest }) => rest)) + '\n');
fs.writeFileSync(path.join(OUT_DIR, 'dynasties.audit.json'), JSON.stringify(Object.fromEntries(dynasties.map(d => [d.id, { aliases: d.aliases, regions: d.regions, entries: d.entries }])), null, 1) + '\n');
fs.writeFileSync(path.join(OUT_DIR, 'realms.json'), JSON.stringify({
  fields: ['dynasty', 'region', 'start', 'end', 'relation', 'confidence', 'file'],
  files,
  coreRegions: CORE_REGIONS,
  rows: realms,
}) + '\n');

// ── report ───────────────────────────────────────────────────────────────────
const periphery = [...new Set(realms.map(r => r[1]).filter(r => !CORE_REGIONS.includes(r)))].sort();
console.log(`entries read      : ${rows.length + unparsed.length + skipped.length}`);
console.log(`dynasties         : ${dynasties.length}  (from ${new Set(rows.map(r => r.raw)).size} raw names)`);
console.log(`realm rows        : ${realms.length}`);
console.log(`non-core regions  : ${periphery.length} (${periphery.join(', ')})`);
console.log(`skipped (listed)  : ${skipped.length}`);
skipped.forEach(u => console.log('  ~ ' + u));
console.log(`unparsed entries  : ${unparsed.length}`);
unparsed.forEach(u => console.log('  ! ' + u));
console.log(`missing fa names  : ${missingFa.length}`);
if (process.argv.includes('--list-missing')) missingFa.forEach(m => console.log('  - ' + m));
const byFam: Record<string, number> = {};
dynasties.forEach(d => { byFam[d.family] = (byFam[d.family] ?? 0) + 1; });
console.log('families          :', JSON.stringify(byFam), `(known: ${FAMILIES.join(',')})`);
if (strict && (unparsed.length || missingFa.length)) { console.error('STRICT: unresolved items'); process.exit(1); }
