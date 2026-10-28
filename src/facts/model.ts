/**
 * Fact model shared by the build (computed facts), the server (AI facts + review) and the browser (display).
 * Rules (docs/plans/GAME_ATLAS_PLAN.md, Slice 6):
 *  - unsupported / rejected facts are never shown;
 *  - "ai_checked" facts show an "AI · checked, not yet reviewed" badge; only "verified" facts carry no badge;
 *  - a fact without at least one source can never be verified;
 *  - sensitive eras (20th century onward) need a human before display.
 */
export type FactKind = 'computed' | 'ai' | 'curated';
export type FactStatus = 'unverified' | 'ai_checked' | 'verified' | 'disputed' | 'rejected';
export type Confidence = 'high' | 'medium' | 'low';
export interface Bi { en: string; fa: string }

export interface DeterministicCheck { rule: string; ok: boolean; detail?: string }
export interface ModelVerdict { verdict: 'supported' | 'unsupported' | 'uncertain'; persianMatches: boolean; reason: string; model: string }
export interface FactEvent { at: number; event: string; by?: string; note?: string }

export interface Fact {
  id: string;
  kind: FactKind;
  entityType: string;
  entityKey: string;
  entityName: Bi;
  year: number | null;
  hook: Bi;
  claim: Bi;
  context?: Partial<Bi>;
  sources: string[];
  confidence: Confidence;
  status: FactStatus;
  hash: string;
  /** 20th century onward: a human must approve before it is shown */
  sensitive: boolean;
  /** computed facts: the datasets/records the numbers come from (auditable) */
  derivedFrom?: string[];
  firstDiscoverer?: string;
  /** how many times users found it (drives the review order) */
  found: number;
  reports: number;
  checks?: { deterministic: DeterministicCheck[]; model?: ModelVerdict | null };
  history: FactEvent[];
  createdAt: number;
  updatedAt: number;
}

export const SENSITIVE_FROM_YEAR = 1900;
export const isSensitiveYear = (year: number | null | undefined) => year != null && year >= SENSITIVE_FROM_YEAR;

export type Badge = 'none' | 'ai_checked';

/** Whether a fact may be shown to users at all. */
export function isVisible(f: Pick<Fact, 'status' | 'sensitive' | 'sources'>): boolean {
  if (f.status === 'verified') return f.sources.length > 0;
  if (f.status === 'ai_checked') return !f.sensitive && f.sources.length > 0;
  return false;
}
export const badgeOf = (f: Pick<Fact, 'status'>): Badge => (f.status === 'verified' ? 'none' : 'ai_checked');

/** Legal status moves. A move to `verified` additionally requires a source (enforced in `canTransition`). */
const MOVES: Record<FactStatus, FactStatus[]> = {
  unverified: ['ai_checked', 'verified', 'rejected', 'disputed'],
  ai_checked: ['verified', 'rejected', 'disputed', 'unverified'],
  verified: ['disputed', 'rejected'],
  disputed: ['verified', 'rejected', 'ai_checked'],
  rejected: ['unverified'],
};
export function canTransition(f: Pick<Fact, 'status' | 'sources'>, to: FactStatus): { ok: boolean; reason?: string } {
  if (!MOVES[f.status].includes(to)) return { ok: false, reason: `cannot move ${f.status} → ${to}` };
  if (to === 'verified' && f.sources.length === 0) return { ok: false, reason: 'a fact without a source cannot be verified' };
  return { ok: true };
}

// ── text identity & dedupe ───────────────────────────────────────────────────
const PERSIAN_DIGITS = '۰۱۲۳۴۵۶۷۸۹';
const ARABIC_DIGITS = '٠١٢٣٤٥٦٧٨٩';
export const latinDigits = (s: string) => s.replace(/[۰-۹]/g, d => String(PERSIAN_DIGITS.indexOf(d))).replace(/[٠-٩]/g, d => String(ARABIC_DIGITS.indexOf(d)));

export const normalizeText = (s: string) =>
  latinDigits(s).toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim();

/** 53-bit FNV-style hash → 14 hex chars. Not cryptographic: only an identity for dedupe. */
export function textHash(s: string): string {
  let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
  for (let i = 0; i < s.length; i++) { const c = s.charCodeAt(i); h1 = Math.imul(h1 ^ c, 2654435761); h2 = Math.imul(h2 ^ c, 1597334677); }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16).padStart(14, '0');
}
export const slug = (s: string) => normalizeText(s).replace(/\s+/g, '_').slice(0, 60);
export const entityKeyOf = (type: string, name: string) => `${type}:${slug(name)}`;
export const factHash = (entityKey: string, claimEn: string) => textHash(`${entityKey}|${normalizeText(claimEn)}`);

const trigrams = (s: string) => { const t = ` ${normalizeText(s)} `; const set = new Set<string>(); for (let i = 0; i < t.length - 2; i++) set.add(t.slice(i, i + 3)); return set; };
/** Jaccard similarity of character trigrams, 0..1. */
export function trigramSimilarity(a: string, b: string): number {
  const A = trigrams(a), B = trigrams(b);
  if (!A.size || !B.size) return 0;
  let inter = 0; for (const x of A) if (B.has(x)) inter++;
  return inter / (A.size + B.size - inter);
}
export const DUPLICATE_SIMILARITY = 0.7;

/** all numbers in a text, sorted ("aged 27" ≠ "aged 28" even if the wording is otherwise identical) */
export const numbersIn = (s: string) => (latinDigits(s).match(/\d+/g) ?? []).sort().join(',');

/** Same fact worded differently: very similar text AND exactly the same numbers. */
export function isNearDuplicate(a: string, b: string): boolean {
  return numbersIn(a) === numbersIn(b) && trigramSimilarity(a, b) >= DUPLICATE_SIMILARITY;
}
