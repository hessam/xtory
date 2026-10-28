/**
 * Computed facts: arithmetic over curated data only (registry + rulers.ts + data/facts/lives.json). No AI.
 * Deterministic: same inputs → same facts and ids. Wording always says "in Xtory's records" because the numbers
 * are only as good as the curated sources; `derivedFrom` lists exactly which records each number came from.
 *
 * Status:
 *  - from rulers.ts / registry (owner-curated)                → verified
 *  - from lives.json                                          → verified only if the life is confirmed (owner / Wikidata), else unverified
 *  - anything about the 20th century or later                 → not generated (sensitive-era rule)
 */
import { rulers } from '../data/rulers';
import { regions } from '../data/regions';
import { dynasties, realms, getActiveDynastyIds, getDynasty, type RegistryDynasty } from '../data/registry';
import { formatYear, toPersianDigits } from '../utils/format';
import { lives, yearsBetween, type Life } from './known';
import { SENSITIVE_FROM_YEAR, entityKeyOf, factHash, textHash, type Bi, type Fact, type FactStatus } from './model';

const MAX_YEAR = SENSITIVE_FROM_YEAR - 1;
const N = (n: number, fa = false) => (fa ? toPersianDigits(n) : String(n));
const Y = (y: number) => ({ en: formatYear(y, 'en'), fa: formatYear(y, 'fa') });
const REGION = Object.fromEntries(regions.map(r => [r.id, r.displayName]));
const regionName = (id: string): Bi => ({ en: REGION[id]?.en.full ?? id, fa: REGION[id]?.fa.full ?? id });
/** region display names start with "The …" for some regions; lower-case it mid-sentence */
const mid = (s: string) => s.replace(/^The /, 'the ');
/** archaeological cultures, tribal leaderships and generic "local chiefs" are not polities that "ruled": keep them out of ruling/overlap facts */
const isPolity = (d: RegistryDynasty) => !/culture|elite|leadership|tribal|tribes?\b|chiefs?|chiefdoms?|local |independent |bands?\b|bampur/i.test(d.name.en);
const dn = (d: RegistryDynasty): Bi => ({ en: d.name.en, fa: d.name.fa });

export interface Wikidata { [lifeId: string]: { born: number | null; died: number | null } }

/** A life is confirmed by the owner, or by Wikidata when both dates agree within one year. */
export function confirmLives(all: Life[], wikidata: Wikidata = {}): Life[] {
  return all.map(l => {
    if (l.confirmedBy) return l;
    const w = wikidata[l.id];
    if (w && l.born != null && l.died != null && w.born != null && w.died != null && Math.abs(w.born - l.born) <= 1 && Math.abs(w.died - l.died) <= 1) return { ...l, confirmedBy: 'wikidata' as const };
    return l;
  });
}

let all: Fact[];
const add = (f: Omit<Fact, 'kind' | 'status' | 'sensitive' | 'found' | 'reports' | 'history' | 'createdAt' | 'updatedAt' | 'hash' | 'id' | 'confidence'> & { status?: FactStatus; type: string }) => {
  const entityKey = f.entityKey;
  const hash = factHash(entityKey, f.claim.en);
  const { type, ...rest } = f;
  all.push({
    ...rest, id: `c_${type}_${hash.slice(0, 10)}`, kind: 'computed', status: f.status ?? 'verified', sensitive: false, confidence: 'high',
    hash, found: 0, reports: 0, history: [{ at: 0, event: 'computed' }], createdAt: 0, updatedAt: 0,
  });
};
const DS = { rulers: 'src/data/rulers.ts', registry: 'docs/historical_data/*.json → src/data/generated/{dynasties,realms}.json', lives: 'data/facts/lives.json' };
const XT = 'Xtory curated dataset';

export function buildComputedFacts(opts: { wikidata?: Wikidata } = {}): Fact[] {
  all = [];
  const L = confirmLives(lives, opts.wikidata).filter(l => (l.born ?? -9999) < MAX_YEAR && (l.died ?? -9999) <= MAX_YEAR);

  // ── 1. reign lengths & extremes (rulers.ts) ────────────────────────────────
  const rs = Object.values(rulers).filter(r => r.endDate <= MAX_YEAR);
  const reign = (r: (typeof rs)[number]) => yearsBetween(r.startDate, r.endDate);
  for (const r of rs) {
    const n = reign(r);
    add({
      type: 'reign', entityType: 'ruler', entityKey: entityKeyOf('ruler', r.name.en), entityName: r.name, year: r.startDate,
      hook: { en: `${n} years on the throne.`, fa: `${N(n, true)} سال بر تخت.` },
      claim: { en: `In Xtory's records, ${r.name.en} ruled for ${n} years (${Y(r.startDate).en} to ${Y(r.endDate).en}).`, fa: `بر پایه داده‌های اکس‌توری، ${r.name.fa} ${N(n, true)} سال فرمان راند (${Y(r.startDate).fa} تا ${Y(r.endDate).fa}).` },
      sources: [`${XT}: ruler "${r.id}" (reign ${r.startDate}…${r.endDate})`], derivedFrom: [`${DS.rulers}#${r.id}`],
    });
  }
  const sorted = [...rs].sort((a, b) => reign(b) - reign(a));
  const longest = sorted.filter(r => reign(r) === reign(sorted[0])), shortest = sorted.filter(r => reign(r) === reign(sorted[sorted.length - 1]));
  const names = (list: typeof rs, k: 'en' | 'fa') => list.map(r => r.name[k]).join(k === 'en' ? ' and ' : ' و ');
  add({
    type: 'reign_longest', entityType: 'ruler', entityKey: 'ruler:longest_reign', entityName: { en: 'Longest reign', fa: 'طولانی‌ترین سلطنت' }, year: null,
    hook: { en: `${reign(sorted[0])} years: the longest reign on record.`, fa: `${N(reign(sorted[0]), true)} سال: طولانی‌ترین سلطنت ثبت‌شده.` },
    claim: { en: `Among the ${rs.length} rulers in Xtory's records, the longest reign is ${reign(sorted[0])} years (${names(longest, 'en')}).`, fa: `از میان ${N(rs.length, true)} فرمانروای ثبت‌شده در اکس‌توری، طولانی‌ترین سلطنت ${N(reign(sorted[0]), true)} سال است (${names(longest, 'fa')}).` },
    sources: [`${XT}: reigns of ${rs.length} rulers`], derivedFrom: rs.map(r => `${DS.rulers}#${r.id}`),
  });
  add({
    type: 'reign_shortest', entityType: 'ruler', entityKey: 'ruler:shortest_reign', entityName: { en: 'Shortest reign', fa: 'کوتاه‌ترین سلطنت' }, year: null,
    hook: { en: `Only ${reign(shortest[0])} years.`, fa: `فقط ${N(reign(shortest[0]), true)} سال.` },
    claim: { en: `Among the ${rs.length} rulers in Xtory's records, the shortest reign is ${reign(shortest[0])} years (${names(shortest, 'en')}).`, fa: `از میان ${N(rs.length, true)} فرمانروای ثبت‌شده در اکس‌توری، کوتاه‌ترین سلطنت ${N(reign(shortest[0]), true)} سال است (${names(shortest, 'fa')}).` },
    sources: [`${XT}: reigns of ${rs.length} rulers`], derivedFrom: rs.map(r => `${DS.rulers}#${r.id}`),
  });
  const avg = Math.round(rs.reduce((a, r) => a + reign(r), 0) / rs.length);
  add({
    type: 'reign_average', entityType: 'ruler', entityKey: 'ruler:average_reign', entityName: { en: 'Average reign', fa: 'میانگین سلطنت' }, year: null,
    hook: { en: `The typical great ruler reigned about ${avg} years.`, fa: `فرمانروای بزرگ معمولاً حدود ${N(avg, true)} سال سلطنت می‌کرد.` },
    claim: { en: `The ${rs.length} rulers in Xtory's records reigned ${avg} years on average.`, fa: `${N(rs.length, true)} فرمانروای ثبت‌شده در اکس‌توری به‌طور میانگین ${N(avg, true)} سال سلطنت کرده‌اند.` },
    sources: [`${XT}: reigns of ${rs.length} rulers`], derivedFrom: rs.map(r => `${DS.rulers}#${r.id}`),
  });

  // ── 2. lives: ages (lives.json; verified only when confirmed) ──────────────
  const st = (l: Life): FactStatus => (l.confirmedBy ? 'verified' : 'unverified');
  const lifeSrc = (l: Life) => [...l.sources, `${XT}: ${DS.lives}#${l.id} (${l.confirmedBy ? 'confirmed by ' + l.confirmedBy : 'NOT YET CONFIRMED'})`];
  for (const l of L) {
    const ek = entityKeyOf('ruler', l.name.en);
    if (l.born != null && l.died != null) {
      const age = yearsBetween(l.born, l.died);
      add({
        type: 'age_death', status: st(l), entityType: 'person', entityKey: ek, entityName: l.name, year: l.died,
        hook: { en: `${l.name.en} died at about ${age}.`, fa: `${l.name.fa} حدود ${N(age, true)} سالگی درگذشت.` },
        claim: { en: `${l.name.en} (${Y(l.born).en} – ${Y(l.died).en}) lived about ${age} years${l.approximate ? ' (birth year approximate)' : ''}.`, fa: `${l.name.fa} (${Y(l.born).fa} تا ${Y(l.died).fa}) حدود ${N(age, true)} سال زندگی کرد${l.approximate ? ' (سال تولد تقریبی است)' : ''}.` },
        sources: lifeSrc(l), derivedFrom: [`${DS.lives}#${l.id}`],
      });
    }
    const rStart = l.reignStart ?? (l.rulerId ? rulers[l.rulerId]?.startDate : undefined);
    if (l.born != null && rStart != null) {
      const age = yearsBetween(l.born, rStart);
      if (age >= 0 && age < 120) add({
        type: 'age_accession', status: st(l), entityType: 'person', entityKey: ek, entityName: l.name, year: rStart,
        hook: { en: age <= 18 ? `${l.name.en} took power at about ${age}.` : `${l.name.en} took power at about ${age}.`, fa: `${l.name.fa} حدود ${N(age, true)} سالگی به قدرت رسید.` },
        claim: { en: `${l.name.en} came to power in ${Y(rStart).en}, when he was about ${age} (born ${Y(l.born).en}${l.approximate ? ', approximate' : ''}).`, fa: `${l.name.fa} در ${Y(rStart).fa} به قدرت رسید؛ در آن زمان حدود ${N(age, true)} ساله بود (زاده ${Y(l.born).fa}${l.approximate ? '، تقریبی' : ''}).` },
        sources: lifeSrc(l), derivedFrom: [`${DS.lives}#${l.id}`],
      });
    }
  }
  // superlatives over lives with exact dates
  const exact = L.filter(l => !l.approximate && l.born != null && l.died != null);
  const ageDeath = (l: Life) => yearsBetween(l.born!, l.died!);
  const young = [...exact].sort((a, b) => ageDeath(a) - ageDeath(b))[0], old = [...exact].sort((a, b) => ageDeath(b) - ageDeath(a))[0];
  const allConfirmed = (list: Life[]) => list.every(l => l.confirmedBy);
  if (young && old) {
    add({ type: 'age_youngest_death', status: allConfirmed(exact) ? 'verified' : 'unverified', entityType: 'person', entityKey: entityKeyOf('person', young.name.en), entityName: young.name, year: young.died,
      hook: { en: `${young.name.en}: dead at ${ageDeath(young)}.`, fa: `${young.name.fa}: درگذشته در ${N(ageDeath(young), true)} سالگی.` },
      claim: { en: `Among the ${exact.length} people in Xtory's life records, ${young.name.en} died youngest, aged about ${ageDeath(young)}.`, fa: `از میان ${N(exact.length, true)} نفر در داده‌های زندگی‌نامه‌ای اکس‌توری، ${young.name.fa} جوان‌ترین درگذشته بود، حدود ${N(ageDeath(young), true)} ساله.` },
      sources: exact.flatMap(lifeSrc).slice(0, 6), derivedFrom: exact.map(l => `${DS.lives}#${l.id}`) });
    add({ type: 'age_oldest_death', status: allConfirmed(exact) ? 'verified' : 'unverified', entityType: 'person', entityKey: entityKeyOf('person', old.name.en), entityName: old.name, year: old.died,
      hook: { en: `${old.name.en} lived to ${ageDeath(old)}.`, fa: `${old.name.fa} تا ${N(ageDeath(old), true)} سالگی زیست.` },
      claim: { en: `Among the ${exact.length} people in Xtory's life records, ${old.name.en} lived longest: about ${ageDeath(old)} years.`, fa: `از میان ${N(exact.length, true)} نفر در داده‌های زندگی‌نامه‌ای اکس‌توری، ${old.name.fa} بیشترین عمر را داشت: حدود ${N(ageDeath(old), true)} سال.` },
      sources: exact.flatMap(lifeSrc).slice(0, 6), derivedFrom: exact.map(l => `${DS.lives}#${l.id}`) });
  }
  // contemporaries
  for (let i = 0; i < L.length; i++) for (let j = i + 1; j < L.length; j++) {
    const a = L[i], b = L[j];
    if (a.born == null || a.died == null || b.born == null || b.died == null) continue;
    const from = Math.max(a.born, b.born), to = Math.min(a.died, b.died), n = yearsBetween(from, to);
    if (to <= from || n < 25) continue;
    add({ type: 'contemporaries', status: a.confirmedBy && b.confirmedBy ? 'verified' : 'unverified', entityType: 'person', entityKey: entityKeyOf('pair', `${a.id} ${b.id}`), entityName: { en: `${a.name.en} & ${b.name.en}`, fa: `${a.name.fa} و ${b.name.fa}` }, year: from,
      hook: { en: `${a.name.en} and ${b.name.en} shared ${n} years.`, fa: `${a.name.fa} و ${b.name.fa} ${N(n, true)} سال هم‌روزگار بودند.` },
      claim: { en: `${a.name.en} (${Y(a.born).en} – ${Y(a.died).en}) and ${b.name.en} (${Y(b.born).en} – ${Y(b.died).en}) were alive at the same time for about ${n} years.`, fa: `${a.name.fa} (${Y(a.born).fa} تا ${Y(a.died).fa}) و ${b.name.fa} (${Y(b.born).fa} تا ${Y(b.died).fa}) حدود ${N(n, true)} سال هم‌زمان زنده بودند.` },
      sources: [...lifeSrc(a), ...lifeSrc(b)], derivedFrom: [`${DS.lives}#${a.id}`, `${DS.lives}#${b.id}`] });
  }

  // ── 3. registry: concurrency ───────────────────────────────────────────────
  const count = (y: number) => getActiveDynastyIds(y).length;
  const marks: { y: number; n: number }[] = [];
  for (let y = -1000; y <= 1800; y += 100) marks.push({ y, n: count(y) });
  for (const { y, n } of marks) {
    add({ type: 'concurrent', entityType: 'era', entityKey: entityKeyOf('year', String(y)), entityName: Y(y), year: y,
      hook: { en: `${n} dynasties at once in ${Y(y).en}.`, fa: `${N(n, true)} سلسله هم‌زمان در ${Y(y).fa}.` },
      claim: { en: `In Xtory's records, ${n} different dynasties ruled somewhere in Greater Iran in ${Y(y).en}.`, fa: `بر پایه داده‌های اکس‌توری، در ${Y(y).fa} ${N(n, true)} سلسله گوناگون در گوشه‌ای از ایران بزرگ فرمان می‌راندند.` },
      sources: [`${XT}: dynasty registry (${realms.length} realm records)`], derivedFrom: [DS.registry] });
  }
  const yearly: { y: number; n: number }[] = [];
  for (let y = -1000; y <= MAX_YEAR; y += 5) yearly.push({ y, n: count(y) });
  const peak = yearly.reduce((a, b) => (b.n > a.n ? b : a)), trough = yearly.filter(x => x.y >= -700).reduce((a, b) => (b.n < a.n ? b : a));
  add({ type: 'concurrent_peak', entityType: 'era', entityKey: 'era:peak_fragmentation', entityName: { en: 'Most fragmented moment', fa: 'پراکنده‌ترین دوران' }, year: peak.y,
    hook: { en: `${peak.n} dynasties at the same time.`, fa: `${N(peak.n, true)} سلسله هم‌زمان.` },
    claim: { en: `The most fragmented moment in Xtory's records is around ${Y(peak.y).en}, with ${peak.n} dynasties ruling at once.`, fa: `پراکنده‌ترین دوران در داده‌های اکس‌توری حدود ${Y(peak.y).fa} است، با ${N(peak.n, true)} سلسله هم‌زمان.` },
    sources: [`${XT}: dynasty registry`], derivedFrom: [DS.registry] });
  add({ type: 'concurrent_trough', entityType: 'era', entityKey: 'era:least_fragmentation', entityName: { en: 'Most unified moment', fa: 'یکپارچه‌ترین دوران' }, year: trough.y,
    hook: { en: `Only ${trough.n} dynasties around ${Y(trough.y).en}.`, fa: `فقط ${N(trough.n, true)} سلسله حدود ${Y(trough.y).fa}.` },
    claim: { en: `The least fragmented moment since 700 BC in Xtory's records is around ${Y(trough.y).en}, with just ${trough.n} dynasties.`, fa: `یکپارچه‌ترین دوران پس از ۷۰۰ پیش از میلاد در داده‌های اکس‌توری حدود ${Y(trough.y).fa} است، با فقط ${N(trough.n, true)} سلسله.` },
    sources: [`${XT}: dynasty registry`], derivedFrom: [DS.registry] });
  const jumps = marks.slice(1).map((m, i) => ({ from: marks[i], to: m, d: m.n - marks[i].n })).sort((a, b) => b.d - a.d).slice(0, 3);
  for (const j of jumps) add({ type: 'concurrent_jump', entityType: 'era', entityKey: entityKeyOf('jump', `${j.from.y} ${j.to.y}`), entityName: { en: `${Y(j.from.y).en} → ${Y(j.to.y).en}`, fa: `${Y(j.from.y).fa} ← ${Y(j.to.y).fa}` }, year: j.to.y,
    hook: { en: `From ${j.from.n} to ${j.to.n} dynasties in a century.`, fa: `از ${N(j.from.n, true)} به ${N(j.to.n, true)} سلسله در یک قرن.` },
    claim: { en: `Between ${Y(j.from.y).en} and ${Y(j.to.y).en}, the number of dynasties ruling at once in Xtory's records jumped from ${j.from.n} to ${j.to.n}.`, fa: `بین ${Y(j.from.y).fa} و ${Y(j.to.y).fa}، شمار سلسله‌های هم‌زمان در داده‌های اکس‌توری از ${N(j.from.n, true)} به ${N(j.to.n, true)} رسید.` },
    sources: [`${XT}: dynasty registry`], derivedFrom: [DS.registry] });
  add({ type: 'registry_size', entityType: 'era', entityKey: 'era:registry_size', entityName: { en: 'Dynasties on record', fa: 'سلسله‌های ثبت‌شده' }, year: null,
    hook: { en: `${dynasties.length} dynasties on record.`, fa: `${N(dynasties.length, true)} سلسله ثبت شده است.` },
    claim: { en: `Xtory's curated records name ${dynasties.length} different dynasties and polities across Greater Iran.`, fa: `داده‌های گردآوری‌شده اکس‌توری ${N(dynasties.length, true)} سلسله و حکومت گوناگون را در ایران بزرگ نام می‌برد.` },
    sources: [`${XT}: dynasty registry`], derivedFrom: [DS.registry] });

  // ── 4. registry: per-region peak fragmentation ─────────────────────────────
  for (const r of regions) {
    let best = { y: 0, n: 0 };
    for (let y = -1000; y <= MAX_YEAR; y += 5) {
      const n = new Set(realms.filter(x => x.regionId === r.id && y >= x.start && y <= x.end).map(x => x.dynastyId)).size;
      if (n > best.n) best = { y, n };
    }
    if (best.n < 3) continue;
    const rn = regionName(r.id);
    add({ type: 'region_peak', entityType: 'region', entityKey: entityKeyOf('region', r.id), entityName: rn, year: best.y,
      hook: { en: `${rn.en.replace(/^The /, '')}: split ${best.n} ways.`, fa: `${rn.fa}: تقسیم میان ${N(best.n, true)} سلسله.` },
      claim: { en: `Around ${Y(best.y).en}, ${mid(rn.en)} was divided among ${best.n} different dynasties at the same time in Xtory's records.`, fa: `حدود ${Y(best.y).fa}، ${rn.fa} در داده‌های اکس‌توری میان ${N(best.n, true)} سلسله گوناگون هم‌زمان بخش شده بود.` },
      sources: [`${XT}: dynasty registry (region "${r.id}")`], derivedFrom: [DS.registry] });
  }

  // ── 5. registry: widest reach per dynasty (core regions) ───────────────────
  const reachRows = dynasties.filter(isPolity).map(d => {
    let best = { y: 0, n: 0 };
    const rows = realms.filter(x => x.dynastyId === d.id && x.core);
    if (!rows.length) return null;
    const lo = Math.min(...rows.map(x => x.start)), hi = Math.min(MAX_YEAR, Math.max(...rows.map(x => x.end)));
    for (let y = Math.max(-1000, lo); y <= hi; y += 5) {
      const n = new Set(rows.filter(x => y >= x.start && y <= x.end).map(x => x.regionId)).size;
      if (n > best.n) best = { y, n };
    }
    return best.n ? { d, ...best } : null;
  }).filter((x): x is { d: RegistryDynasty; y: number; n: number } => !!x).sort((a, b) => b.n - a.n || a.d.id.localeCompare(b.d.id));
  for (const { d, y, n } of reachRows.filter(x => x.n >= 4).slice(0, 40)) {
    add({ type: 'reach', entityType: 'dynasty', entityKey: entityKeyOf('dynasty', d.id), entityName: dn(d), year: y,
      hook: { en: `${n} of 12 regions.`, fa: `${N(n, true)} ناحیه از ۱۲.` },
      claim: { en: `At its widest (around ${Y(y).en}), the ${d.name.en} is recorded in ${n} of the 12 mapped regions of Greater Iran.`, fa: `در گسترده‌ترین حالت (حدود ${Y(y).fa})، ${d.name.fa} در ${N(n, true)} ناحیه از ۱۲ ناحیه نقشه ثبت شده است.` },
      sources: [`${XT}: dynasty registry (${d.id})`], derivedFrom: [DS.registry] });
  }

  // ── 6. registry: dynasties that ruled the same region at the same time ─────
  const cand = new Map<string, { a: string; b: string; region: string; from: number; to: number }>();
  const byRegion = new Map<string, typeof realms>();
  for (const r of realms) if (r.core && r.end <= MAX_YEAR + 1) { if (!byRegion.has(r.regionId)) byRegion.set(r.regionId, []); byRegion.get(r.regionId)!.push(r); }
  for (const [region, list] of byRegion) for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
    const a = list[i], b = list[j];
    if (a.dynastyId === b.dynastyId) continue;
    const da = getDynasty(a.dynastyId)!, db = getDynasty(b.dynastyId)!;
    if (!isPolity(da) || !isPolity(db)) continue;
    if (da.id.split('_')[0] === db.id.split('_')[0]) continue; // same name root = likely the same house (e.g. afsharid_*)
    // merged-variant spans can be centuries too long to mean anything: only believable, bounded overlaps become facts
    if (a.end - a.start > 400 || b.end - b.start > 400) continue;
    const from = Math.max(a.start, b.start), to = Math.min(a.end, b.end);
    if (to - from < 40 || to - from > 250) continue;
    const [x, y] = [a.dynastyId, b.dynastyId].sort();
    const key = `${x}|${y}`, prev = cand.get(key);
    if (!prev || to - from > prev.to - prev.from) cand.set(key, { a: x, b: y, region, from, to });
  }
  const pairs = [...cand.values()].sort((p, q) => (q.to - q.from) - (p.to - p.from) || (p.a + p.b).localeCompare(q.a + q.b)).slice(0, 110);
  for (const p of pairs) {
    const da = getDynasty(p.a)!, db = getDynasty(p.b)!, rn = regionName(p.region), n = p.to - p.from;
    add({ type: 'overlap', entityType: 'pair', entityKey: entityKeyOf('pair', `${p.a} ${p.b}`), entityName: { en: `${da.name.en} & ${db.name.en}`, fa: `${da.name.fa} و ${db.name.fa}` }, year: p.from,
      hook: { en: `${da.name.en} and ${db.name.en}: ${n} years side by side.`, fa: `${da.name.fa} و ${db.name.fa}: ${N(n, true)} سال کنار هم.` },
      claim: { en: `In Xtory's records, the ${da.name.en} and the ${db.name.en} were both ruling in ${mid(rn.en)} for about ${n} years (${Y(p.from).en} to ${Y(p.to).en}).`, fa: `در داده‌های اکس‌توری، ${da.name.fa} و ${db.name.fa} حدود ${N(n, true)} سال هم‌زمان در ${rn.fa} حکومت می‌کردند (${Y(p.from).fa} تا ${Y(p.to).fa}).` },
      sources: [`${XT}: dynasty registry (${p.a}, ${p.b} in "${p.region}")`], derivedFrom: [DS.registry] });
  }

  // de-duplicate ids (same hash) and order stably
  const seen = new Set<string>();
  return all.filter(f => (seen.has(f.id) ? false : (seen.add(f.id), true))).sort((a, b) => a.id.localeCompare(b.id));
}
export const computedChecksum = (facts: Fact[]) => textHash(facts.map(f => `${f.id}:${f.status}:${f.claim.en}`).join('\n'));
