/**
 * Deterministic claim checker: numbers in a claim (age, reign length, birth/death year) must agree with structured data.
 * This runs BEFORE any model judge: arithmetic beats opinion. Only claims about a known entity are checked; everything
 * else passes through to the model judge and the human queue.
 */
import { latinDigits, normalizeText, type DeterministicCheck } from './model';
import type { KnownEntity } from './known';

const num = (s: string) => parseInt(latinDigits(s), 10);

export function extractAges(text: string): number[] {
  const t = latinDigits(text);
  const out: number[] = [];
  const pats = [
    /\b(?:aged|age of|at the age of|at age)\s+(\d{1,3})\b/gi,
    /\b(\d{1,3})[- ]years?[- ]old\b/gi,
    /\b(\d{1,3})\s+years of age\b/gi,
    /\bwas (?:only |just |barely |about |around |nearly )?(\d{1,3}) (?:when|at the time)\b/gi,
    /(\d{1,3})\s*ساله/g,
    /در سن\s*(\d{1,3})/g,
    /(\d{1,3})\s*سالگی/g,
  ];
  for (const re of pats) for (const m of t.matchAll(re)) out.push(num(m[1]));
  return out.filter(n => n > 0 && n < 130);
}

export function extractReignLengths(text: string): number[] {
  const t = latinDigits(text);
  const out: number[] = [];
  for (const re of [/\bruled (?:for )?(?:about |around |nearly |almost )?(\d{1,3}) years\b/gi, /\breign of (?:about |around )?(\d{1,3}) years\b/gi, /\b(\d{1,3})[- ]year reign\b/gi, /(?:به مدت|برای)\s*(\d{1,3})\s*سال (?:سلطنت|حکومت|فرمانروایی)/g])
    for (const m of t.matchAll(re)) out.push(num(m[1]));
  return out.filter(n => n > 0 && n < 100);
}

function signedYear(n: number, era: string | undefined) { return era && /^b/i.test(era) ? -n : n; }
export function extractLifeYears(text: string): { born: number[]; died: number[] } {
  const t = latinDigits(text);
  const grab = (re: RegExp) => [...t.matchAll(re)].map(m => signedYear(num(m[1]), m[2]));
  return {
    born: grab(/\bborn (?:in|around|c\.)?\s*(\d{3,4})\s*(BC|BCE|AD|CE)?/gi),
    died: grab(/\b(?:died|killed|assassinated|murdered) (?:in|around|c\.)?\s*(\d{3,4})\s*(BC|BCE|AD|CE)?/gi),
  };
}

const mentions = (text: string, names: string[]) => { const n = normalizeText(text); return names.some(x => x && n.includes(normalizeText(x))); };
const within = (value: number, target: number, tol: number) => Math.abs(value - target) <= tol;

/** Returns one check per applicable rule. `ok:false` anywhere → the fact must be rejected. */
export function checkClaim(claimEn: string, claimFa: string, entityText: string, known: KnownEntity[]): DeterministicCheck[] {
  const checks: DeterministicCheck[] = [];
  const subject = known.filter(k => mentions(entityText, k.names) || mentions(claimEn, k.names));
  for (const k of subject) {
    const texts = [claimEn, claimFa];
    // Persian and English must agree with each other on the numbers too
    const ageSets = texts.map(extractAges);
    if (ageSets[0].length && ageSets[1].length && ageSets[0].join() !== ageSets[1].join()) checks.push({ rule: 'bilingual_numbers', ok: false, detail: `ages differ between English (${ageSets[0]}) and Persian (${ageSets[1]})` });
    const ages = [...new Set(ageSets.flat())];
    const knownAges = [k.ageAtDeath, k.ageAtAccession].filter((x): x is number => x != null);
    if (ages.length && knownAges.length) {
      for (const a of ages) {
        const ok = knownAges.some(ka => within(a, ka, k.tolerance));
        checks.push({ rule: 'age', ok, detail: ok ? `${a} matches known ages ${knownAges.join('/')} (±${k.tolerance})` : `claims age ${a}, known ages are ${knownAges.join('/')} (±${k.tolerance})` });
      }
    }
    const lens = [...new Set(texts.flatMap(extractReignLengths))];
    if (lens.length && k.reignLength != null) for (const l of lens) {
      const ok = within(l, k.reignLength, Math.max(1, k.tolerance));
      checks.push({ rule: 'reign_length', ok, detail: ok ? `${l} matches reign ${k.reignLength}` : `claims ${l}-year reign, data says ${k.reignLength}` });
    }
    const ly = extractLifeYears(claimEn);
    if (k.born != null) for (const y of ly.born) { const ok = within(y, k.born, k.tolerance); checks.push({ rule: 'birth_year', ok, detail: ok ? `born ${y} ok` : `claims born ${y}, data says ${k.born}` }); }
    if (k.died != null) for (const y of ly.died) { const ok = within(y, k.died, k.tolerance); checks.push({ rule: 'death_year', ok, detail: ok ? `died ${y} ok` : `claims died ${y}, data says ${k.died}` }); }
  }
  return checks;
}
export const failed = (checks: DeterministicCheck[]) => checks.filter(c => !c.ok);
