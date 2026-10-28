/**
 * Parser for the human-written year strings in docs/historical_data/*.json.
 * Years are integers, negative = BC. Shared by the AI-anchor index and the registry build.
 *
 *   "550–330 BC"                  → [-550, -330]
 *   "c. 140 BC – 224 AD"          → [-140, 224]      (each side carries its own era)
 *   "6th century BC–11th century AD" → [-600, 1099]
 *   "1520s–1598 (intermittent)"   → [1520, 1598]
 *   "525–404 BC; 343–330 BC"      → [-525,-404], [-343,-330]   (parseYearRanges)
 *   "1947–present"                → [1947, DATA_HORIZON]
 *   "Intermittent"                → null
 */
export interface YearSpan { start: number; end: number }

/** Last year the atlas covers; "present" resolves to this. */
export const DATA_HORIZON = 1979;

type Era = 'BC' | 'AD' | null;
interface Side { era: Era; text: string }

function splitEra(raw: string): Side {
  const m = raw.match(/\b(BC|BCE|AD|CE)\b/i);
  const era: Era = m ? (/^b/i.test(m[1]) ? 'BC' : 'AD') : null;
  return { era, text: raw.replace(/\b(BC|BCE|AD|CE)\b/gi, '').trim() };
}

/** Resolve one side of a range to a year. `edge` says whether it opens or closes the span. */
function resolveSide(side: Side, era: 'BC' | 'AD', edge: 'start' | 'end'): number | null {
  let t = side.text.toLowerCase().replace(/\(.*?\)/g, '').replace(/^c\.\s*|^circa\s*/, '').replace(/\+$/, '').trim();
  if (t === 'present') return DATA_HORIZON;
  const late = /^late\s+/.test(t);
  const early = /^early\s+/.test(t);
  t = t.replace(/^(late|early|mid)\s+/, '');

  const century = t.match(/^(\d+)(?:st|nd|rd|th)(?:\s+century)?$/);
  if (century) {
    const n = parseInt(century[1], 10);
    // AD century n spans (n-1)*100 .. n*100-1 ; BC century n spans -n*100 .. -(n-1)*100-1
    let lo = era === 'AD' ? (n - 1) * 100 : -n * 100;
    let hi = era === 'AD' ? n * 100 - 1 : -(n - 1) * 100 - 1;
    const third = Math.round((hi - lo) / 3);
    if (late) lo = hi - third; else if (early) hi = lo + third;
    return edge === 'start' ? lo : hi;
  }

  const num = t.match(/^(\d+)(s?)$/);
  if (!num) return null;
  const v = parseInt(num[1], 10);
  if (num[2] === 's') {
    // decade: 390s AD → 390..399 ; 390s BC → -399..-390
    const lo = era === 'AD' ? v : -(v + 9);
    const hi = era === 'AD' ? v + 9 : -v;
    return edge === 'start' ? lo : hi;
  }
  return era === 'BC' ? -v : v;
}

function parseOne(raw: string): YearSpan | null {
  const cleaned = raw.trim();
  if (!cleaned) return null;
  const parts = cleaned.split(/\s*[–—]\s*/);
  if (parts.length > 2) return null;
  const sides = parts.map(splitEra);
  // A side without an era marker borrows the other side's ("550–330 BC", "262–6th Century AD").
  const fallback: 'BC' | 'AD' = sides.find(s => s.era)?.era ?? 'AD';
  const eraOf = (s: Side) => s.era ?? fallback;

  const a = resolveSide(sides[0], eraOf(sides[0]), 'start');
  if (sides.length === 1) {
    const b = resolveSide(sides[0], eraOf(sides[0]), 'end');
    return a === null || b === null ? null : { start: Math.min(a, b), end: Math.max(a, b) };
  }
  const b = resolveSide(sides[1], eraOf(sides[1]), 'end');
  if (a === null || b === null) return null;
  return { start: Math.min(a, b), end: Math.max(a, b) };
}

/** All disjoint spans in a string. Lists are separated by ";" or ",". */
export function parseYearRanges(raw: string | null | undefined): YearSpan[] {
  if (!raw || typeof raw !== 'string') return [];
  const out: YearSpan[] = [];
  // Era markers sometimes appear once at the end of a list ("114–117, 165, 198 AD").
  const pieces = raw.split(/[;,]/).map(p => p.trim()).filter(Boolean);
  const listEra = splitEra(raw).era;
  for (const piece of pieces) {
    const withEra = splitEra(piece).era || !listEra ? piece : `${piece} ${listEra}`;
    const span = parseOne(withEra);
    if (span) out.push(span);
  }
  return out;
}

/** Broadest span covering every range in the string (legacy behaviour of the anchor index). */
export function parseYearRange(raw: string | null | undefined): YearSpan | null {
  const spans = parseYearRanges(raw);
  if (spans.length === 0) return null;
  return { start: Math.min(...spans.map(s => s.start)), end: Math.max(...spans.map(s => s.end)) };
}
