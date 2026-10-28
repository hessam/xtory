/**
 * Typed AI tasks. The server only ever runs these — never a client-supplied prompt — so the endpoint cannot be
 * used as a free LLM proxy. Each task owns: strict param validation, the prompt, the output schema, cache identity,
 * a token ceiling and mechanical post-guards (the same "null beats a fabrication" rules the client already had).
 * Isomorphic: no Node APIs, no network.
 */
import { regions } from '../data/regions';
import { events as staticEvents } from '../data/events';
import { rulers as staticRulers } from '../data/rulers';
import { getRealmsAt, getDynasty } from '../data/registry';
import { describe, type JsonSchema } from './schema';

export type Lang = 'en' | 'fa';
export const TASK_IDS = ['year_dynasties', 'ruler_detail', 'events', 'figures', 'artifacts', 'quiz', 'dig_deeper'] as const;
export type TaskId = (typeof TASK_IDS)[number];
/** Bump when a prompt or schema changes materially: old cached answers stop being served. */
export const PROMPT_VERSION = 'p1';

export const REGION_IDS = regions.map(r => r.id);
// Atlas bounding box (same as the map bounds): AI coordinates outside it are dropped, not trusted.
const BBOX = { minLat: 10, maxLat: 45, minLng: 24, maxLng: 77 };

export class ParamError extends Error {}

// ── param helpers (strict: unknown keys rejected, ranges enforced) ───────────
type Raw = Record<string, unknown>;
function obj(v: unknown, allowed: string[]): Raw {
  if (!v || typeof v !== 'object' || Array.isArray(v)) throw new ParamError('params must be an object');
  for (const k of Object.keys(v as Raw)) if (!allowed.includes(k)) throw new ParamError(`unknown param "${k}"`);
  return v as Raw;
}
const year = (v: unknown, name = 'year'): number => {
  if (typeof v !== 'number' || !Number.isInteger(v) || v < -3500 || v > 2100) throw new ParamError(`${name} must be an integer between -3500 and 2100`);
  return v;
};
const str = (v: unknown, name: string, max: number, min = 1): string => {
  if (typeof v !== 'string') throw new ParamError(`${name} must be a string`);
  const s = v.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim();
  if (s.length < min || s.length > max) throw new ParamError(`${name} must be ${min}-${max} characters`);
  return s;
};
const oneOf = <T extends string>(v: unknown, name: string, list: readonly T[]): T => {
  if (typeof v !== 'string' || !list.includes(v as T)) throw new ParamError(`${name} must be one of ${list.join(', ')}`);
  return v as T;
};
const yearLabel = (y: number) => `${Math.abs(y)} ${y < 0 ? 'BC' : 'AD'}`;
const bucket = (y: number, size: number) => Math.floor(y / size) * size;
const validCoord = (c: unknown): c is [number, number] =>
  Array.isArray(c) && c.length === 2 && typeof c[0] === 'number' && typeof c[1] === 'number' &&
  c[0] >= BBOX.minLat && c[0] <= BBOX.maxLat && c[1] >= BBOX.minLng && c[1] <= BBOX.maxLng;

export interface BuiltTask {
  system: string;
  prompt: string;
  schema: JsonSchema;
}
export interface TaskDef<P = any> {
  id: TaskId;
  parse(params: unknown): P;
  build(p: P, lang: Lang): BuiltTask;
  /** Stable identity of the answer. Returns null when the answer must not be shared/cached. */
  cacheKey(p: P, lang: Lang): string | null;
  maxTokens: number;
  post?(data: any, p: P): any;
}

const SYSTEM = (schema: JsonSchema) =>
  `You are a careful historian of Greater Iran and its neighbours. Accuracy matters more than completeness: ` +
  `if you are not confident, say so or leave the field null/empty instead of inventing. ` +
  `Respond with ONLY a JSON value (no markdown, no commentary) matching: ${describe(schema)}`;

const S = { type: 'string' } as const;
const I = { type: 'integer' } as const;
const SN: JsonSchema = { type: 'string', nullable: true };
const IN: JsonSchema = { type: 'integer', nullable: true };

// ── 1. year_dynasties ("Who ruled here?") ────────────────────────────────────
const dynastyItem: JsonSchema = {
  type: 'object',
  properties: {
    dynastyNameEn: S, dynastyNameFa: S,
    dynastyColorFamily: { type: 'string', enum: ['persian', 'arab', 'turkic', 'greek', 'nomadic', 'foreign', 'semitic'] },
    dynastyClassification: S, capitalCityEn: S, capitalCityFa: S, dynastyStartYear: I, dynastyEndYear: I,
    regionId: { type: 'string', enum: REGION_IDS },
    status: { type: 'string', enum: ['Direct Control', 'Vassal State', 'Contested/Warzone', 'Sphere of Influence'] },
    confidence: { type: 'string', enum: ['high', 'low'] },
    rulerNameEn: SN, rulerNameFa: SN, rulerTitleEn: SN, rulerTitleFa: SN, rulerReignStart: IN, rulerReignEnd: IN,
  },
  required: ['dynastyNameEn', 'dynastyNameFa', 'dynastyColorFamily', 'dynastyClassification', 'capitalCityEn', 'capitalCityFa', 'dynastyStartYear', 'dynastyEndYear', 'regionId', 'status', 'confidence'],
};
const dynastiesSchema: JsonSchema = { type: 'array', items: dynastyItem, maxItems: 40 };

const yearDynasties: TaskDef<{ year: number }> = {
  id: 'year_dynasties',
  parse: p => ({ year: Math.round(year(obj(p, ['year']).year) / 5) * 5 }), // answers are shared per 5 years
  cacheKey: p => `${PROMPT_VERSION}|year_dynasties|${p.year}`,
  maxTokens: 3500,
  build: ({ year: y }) => {
    const realms = getRealmsAt(y);
    const manifest = regions.map(r => {
      const knownRulers = staticEvents.filter(e => e.regionId === r.id && y >= e.startDate && y <= e.endDate).map(e => staticRulers[e.rulerId]?.name.en).filter(Boolean);
      const verified = realms.filter(x => x.regionId === r.id).map(x => ({
        dynastyName: getDynasty(x.dynastyId)?.name.en ?? x.dynastyId, yearsActive: `${yearLabel(x.start)}–${yearLabel(x.end)}`, confidence: x.confidence,
      }));
      return { id: r.id, knownAs: r.aliases.slice(0, 3), knownRulers, verifiedDynasties: verified, anchorCity: r.anchorCities[0]?.name, anchorCities: r.anchorCities.map(c => ({ name: c.name, historical: c.historicalNames || [] })) };
    });
    const regionCount = manifest.filter(m => m.verifiedDynasties.length > 0).length;
    const prompt = `You are a strict data-entry historian mapping the political borders in Greater Iran for the year ${yearLabel(y)}.
Your primary goal is to identify which DYNASTIES controlled each region.
You may OPTIONALLY identify the specific ruler IF you are highly confident.

═══ VERIFIED HISTORICAL DATA (from curated research files) ═══
Dynasties CONFIRMED active at ${yearLabel(y)} across ${regionCount} regions are listed as "verifiedDynasties" in the manifest below.

═══ INSTRUCTIONS ═══
ZONE A — Regions with "verifiedDynasties":
- Return a separate entry for EACH verified dynasty in that region.
- Do NOT invent dynasties that are not in the verified list.
- Use the dynasty's documented years as dynastyStartYear/dynastyEndYear.
ZONE B — Regions with EMPTY "verifiedDynasties" (no curated data):
- Identify which dynasty/polity held this region based on your knowledge. Mark confidence "low".
RULER FIELDS (optional):
- Fill rulerNameEn, rulerNameFa, rulerTitleEn, rulerTitleFa, rulerReignStart, rulerReignEnd ONLY if HIGHLY CONFIDENT about the specific ruler at this exact year.
- rulerReignStart/rulerReignEnd are THIS individual's personal reign (typically 10–40 years), NOT the dynasty lifespan. If it would span more than 80 years, return null.
- If NOT confident, return null for all ruler fields. A null answer is CORRECT and PREFERRED over a fabrication.
capitalCityEn/capitalCityFa: the dynasty's seat of power in THIS region, constrained to the anchorCities listed.
Every regionId must come from the manifest.

Regions Manifest: ${JSON.stringify(manifest)}`;
    return { system: SYSTEM(dynastiesSchema), prompt, schema: dynastiesSchema };
  },
  post: (data: any[]) => data
    .filter(d => REGION_IDS.includes(d.regionId))
    .map(d => {
      const out = { ...d };
      const span = out.rulerReignStart != null && out.rulerReignEnd != null ? Math.abs(out.rulerReignEnd - out.rulerReignStart) : 0;
      const dynastyDatesReused = out.rulerReignStart === out.dynastyStartYear && out.rulerReignEnd === out.dynastyEndYear;
      // a ruler claim with leaked dynasty dates, an absurd reign, or no name is not trustworthy: drop all ruler fields
      if (span > 80 || dynastyDatesReused || !out.rulerNameEn || !String(out.rulerNameEn).trim()) {
        Object.assign(out, { rulerNameEn: null, rulerNameFa: null, rulerTitleEn: null, rulerTitleFa: null, rulerReignStart: null, rulerReignEnd: null });
      }
      return out;
    }),
};

// ── 2. ruler_detail ──────────────────────────────────────────────────────────
const rulerSchema: JsonSchema = {
  type: 'object',
  properties: { rulerNameEn: SN, rulerNameFa: SN, rulerTitleEn: SN, rulerTitleFa: SN, rulerReignStart: IN, rulerReignEnd: IN, confidence: { type: 'string', enum: ['high', 'low', 'unknown'] } },
  required: ['confidence'],
};
interface RulerParams { dynastyNameEn: string; dynastyNameFa: string; dynastyStart: number; dynastyEnd: number; regionId: string; year: number }
const rulerDetail: TaskDef<RulerParams> = {
  id: 'ruler_detail',
  parse: raw => {
    const p = obj(raw, ['dynastyNameEn', 'dynastyNameFa', 'dynastyStart', 'dynastyEnd', 'regionId', 'year']);
    return {
      dynastyNameEn: str(p.dynastyNameEn, 'dynastyNameEn', 120), dynastyNameFa: str(p.dynastyNameFa, 'dynastyNameFa', 120),
      dynastyStart: year(p.dynastyStart, 'dynastyStart'), dynastyEnd: year(p.dynastyEnd, 'dynastyEnd'),
      regionId: oneOf(p.regionId, 'regionId', REGION_IDS), year: Math.round(year(p.year) / 5) * 5,
    };
  },
  cacheKey: p => `${PROMPT_VERSION}|ruler_detail|${p.dynastyNameEn.toLowerCase()}|${p.regionId}|${p.year}`,
  maxTokens: 400,
  build: p => {
    const region = regions.find(r => r.id === p.regionId);
    const regionName = region?.displayName.en.full ?? p.regionId, anchor = region?.anchorCities[0]?.name ?? '';
    const prompt = `Year: ${yearLabel(p.year)}.
Dynasty: ${p.dynastyNameEn} / ${p.dynastyNameFa} (active ${yearLabel(p.dynastyStart)}–${yearLabel(p.dynastyEnd)}).
Region: ${regionName} (anchor city: ${anchor}).

What is the name of the SPECIFIC ruler of the ${p.dynastyNameEn} who controlled ${anchor || regionName} around ${yearLabel(p.year)}?

STRICT RULES:
- Return the ruler's name ONLY if you are highly confident it is historically documented.
- If uncertain, return null for all ruler fields. A null answer is CORRECT and PREFERRED over a fabrication.
- Do NOT invent a plausible-sounding name. Do NOT return the dynasty's dates as the ruler's reign dates.
- rulerReignStart/rulerReignEnd are THIS ruler's personal reign (typically 10–40 years); more than 80 years means you returned dynasty dates by mistake: return null.
- The capital or seat of power must be within or near ${anchor || regionName}.`;
    return { system: SYSTEM(rulerSchema), prompt, schema: rulerSchema };
  },
  post: (d, p) => {
    const nulls = { rulerNameEn: null, rulerNameFa: null, rulerTitleEn: null, rulerTitleFa: null, rulerReignStart: null, rulerReignEnd: null };
    if (d.confidence === 'unknown' || !d.rulerNameEn || !String(d.rulerNameEn).trim()) return { ...nulls, confidence: 'unknown' };
    const out = { ...d };
    if (out.rulerReignStart === p.dynastyStart && out.rulerReignEnd === p.dynastyEnd) { out.rulerReignStart = null; out.rulerReignEnd = null; }
    if (out.rulerReignStart != null && out.rulerReignEnd != null && Math.abs(out.rulerReignEnd - out.rulerReignStart) > 80) { out.rulerReignStart = null; out.rulerReignEnd = null; }
    return out;
  },
};

// ── 3–5. events / figures / artifacts for a year ─────────────────────────────
const yearOnly = (p: unknown) => ({ year: bucket(year(obj(p, ['year']).year), 25) + 12 }); // shared per 25-year bucket
const coordsSchema: JsonSchema = { type: 'array', items: { type: 'number' }, minItems: 2, maxItems: 2 };

const eventSchema: JsonSchema = {
  type: 'array', maxItems: 8,
  items: { type: 'object', properties: { id: S, year: I, titleEn: S, titleFa: S, descriptionEn: S, descriptionFa: S, type: { type: 'string', enum: ['battle', 'downfall', 'political', 'cultural', 'universal'] }, coordinates: { ...coordsSchema, nullable: true } }, required: ['id', 'year', 'titleEn', 'titleFa', 'descriptionEn', 'descriptionFa', 'type'] },
};
const events: TaskDef<{ year: number }> = {
  id: 'events', parse: yearOnly, cacheKey: p => `${PROMPT_VERSION}|events|${p.year}`, maxTokens: 1800,
  build: p => ({
    system: SYSTEM(eventSchema), schema: eventSchema,
    prompt: `Find 3 to 5 major historical events (battles, downfalls, political shifts, cultural milestones) that happened in Greater Iran within 25 years of the year ${yearLabel(p.year)}.
Each: a unique "id" (e.g. "ai_event_1"); exact "year" (negative for BC); titles and 1–2 sentence descriptions in BOTH English and Persian; "type".
"coordinates": [latitude, longitude] in decimal degrees of the real location (latitude ${BBOX.minLat}–${BBOX.maxLat}, longitude ${BBOX.minLng}–${BBOX.maxLng}), or null if unknown. Example: Persepolis [29.93, 52.89].`,
  }),
  post: (d: any[]) => d.map(e => (validCoord(e.coordinates) ? e : { ...e, coordinates: undefined })),
};

const figureSchema: JsonSchema = {
  type: 'array', maxItems: 8,
  items: { type: 'object', properties: { id: S, nameEn: S, nameFa: S, birthYear: I, deathYear: I, descriptionEn: S, descriptionFa: S, type: { type: 'string', enum: ['philosopher', 'poet', 'scientist', 'artist', 'other'] } }, required: ['id', 'nameEn', 'nameFa', 'birthYear', 'deathYear', 'descriptionEn', 'descriptionFa', 'type'] },
};
const figures: TaskDef<{ year: number }> = {
  id: 'figures', parse: yearOnly, cacheKey: p => `${PROMPT_VERSION}|figures|${p.year}`, maxTokens: 1500,
  build: p => ({
    system: SYSTEM(figureSchema), schema: figureSchema,
    prompt: `Provide 3 to 5 notable historical figures (philosophers, scientists, poets, artists or other thinkers) from any part of the world who were alive and active around ${yearLabel(p.year)}. Names and short descriptions in BOTH English and Persian; birth/death years negative for BC. Only include people you are confident existed.`,
  }),
};

const artifactSchema: JsonSchema = {
  type: 'array', maxItems: 8,
  items: { type: 'object', properties: { id: S, nameEn: S, nameFa: S, descriptionEn: S, descriptionFa: S, year: I, currentLocationEn: S, currentLocationFa: S, coordinates: { ...coordsSchema, nullable: true }, type: { type: 'string', enum: ['monument', 'artifact', 'manuscript', 'architecture'] } }, required: ['id', 'nameEn', 'nameFa', 'descriptionEn', 'descriptionFa', 'year', 'currentLocationEn', 'currentLocationFa', 'type'] },
};
const artifacts: TaskDef<{ year: number }> = {
  id: 'artifacts', parse: yearOnly, cacheKey: p => `${PROMPT_VERSION}|artifacts|${p.year}`, maxTokens: 1800,
  build: p => ({
    system: SYSTEM(artifactSchema), schema: artifactSchema,
    prompt: `Provide 3 to 5 notable monuments, heritage sites, artifacts or manuscripts created or prominent in Greater Iran around ${yearLabel(p.year)}. Names/descriptions/current location in BOTH English and Persian.
"coordinates": [latitude, longitude] in decimal degrees of the real place (latitude ${BBOX.minLat}–${BBOX.maxLat}, longitude ${BBOX.minLng}–${BBOX.maxLng}), or null if unknown. Example: Chogha Zanbil [32.01, 48.52].`,
  }),
  post: (d: any[]) => d.map(a => (validCoord(a.coordinates) ? a : { ...a, coordinates: undefined })),
};

// ── 6. quiz (myth vs reality) ────────────────────────────────────────────────
export const QUIZ_ANGLES = [
  'Major Military or Political Events', 'Specific Historical Figures or Rulers', 'Cultural and Literary Figures (Poets, Thinkers, Artists)',
  'Heritage, Architecture, or Famous Artifacts', 'Scientific Discoveries or Ancient Innovations', 'Daily Life, Strange Customs, or Economics',
] as const;
const quizSchema: JsonSchema = {
  type: 'object',
  properties: { myth: { type: 'string', maxLength: 300 }, answer: { type: 'string', enum: ['TRUE', 'FALSE', "IT'S COMPLICATED"] }, reality: { type: 'string', maxLength: 600 }, reveal_hook: { type: 'string', maxLength: 200 }, era_link: I },
  required: ['myth', 'answer', 'reality', 'reveal_hook', 'era_link'],
};
interface QuizParams { year: number; angle: number; askedMyths: string[] }
const quiz: TaskDef<QuizParams> = {
  id: 'quiz',
  parse: raw => {
    const p = obj(raw, ['year', 'angle', 'askedMyths']);
    const asked = p.askedMyths === undefined ? [] : p.askedMyths;
    if (!Array.isArray(asked) || asked.length > 8) throw new ParamError('askedMyths must be an array of at most 8 strings');
    return { year: bucket(year(p.year), 25) + 12, angle: Math.min(QUIZ_ANGLES.length - 1, Math.max(0, Math.trunc(Number(p.angle ?? 0)) || 0)), askedMyths: asked.map((m, i) => str(m, `askedMyths[${i}]`, 200)) };
  },
  // Only the "first question" per era/angle is shared; follow-ups that exclude earlier myths are always fresh.
  cacheKey: (p, lang) => (p.askedMyths.length ? null : `${PROMPT_VERSION}|quiz|${p.year}|${p.angle}|${lang}`),
  maxTokens: 450,
  build: (p, lang) => ({
    system: SYSTEM(quizSchema), schema: quizSchema,
    prompt: `Create ONE highly specific, intriguing history trivia myth/fact about Iranian / Greater Iranian history for the era around ${yearLabel(p.year)}, written in ${lang === 'en' ? 'English' : 'Persian (Farsi)'}.
It MUST be specifically about: ${QUIZ_ANGLES[p.angle]}.
"myth": a common false assumption; "answer": whether the myth is TRUE / FALSE / IT'S COMPLICATED; "reality": 1–2 sentence reality; "reveal_hook": one short punchy sentence; "era_link": the most relevant year (negative for BC).
Be concise. Only state things you are confident are true.${p.askedMyths.length ? `\nDO NOT generate any of these or variations of them:\n${p.askedMyths.map(m => `- ${m}`).join('\n')}` : ''}`,
  }),
};

// ── 7. dig_deeper: surprising, checkable facts about one thing (candidates for the fact engine) ──
export const DIG_KINDS = ['ruler', 'dynasty', 'event', 'figure', 'region', 'artifact'] as const;
const digSchema: JsonSchema = {
  type: 'object',
  properties: {
    facts: {
      type: 'array', maxItems: 3,
      items: {
        type: 'object',
        properties: {
          hookEn: { type: 'string', maxLength: 140 }, hookFa: { type: 'string', maxLength: 200 },
          claimEn: { type: 'string', maxLength: 400 }, claimFa: { type: 'string', maxLength: 600 },
          contextEn: { type: 'string', maxLength: 500 }, contextFa: { type: 'string', maxLength: 700 },
          year: { type: 'integer', nullable: true },
          confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
          sources: { type: 'array', items: S, maxItems: 4 },
        },
        required: ['hookEn', 'hookFa', 'claimEn', 'claimFa', 'confidence', 'sources'],
      },
    },
  },
  required: ['facts'],
};
export interface DigParams { kind: (typeof DIG_KINDS)[number]; name: string; year?: number; context?: string }
const digDeeper: TaskDef<DigParams> = {
  id: 'dig_deeper',
  parse: raw => {
    const p = obj(raw, ['kind', 'name', 'year', 'context']);
    return { kind: oneOf(p.kind, 'kind', DIG_KINDS), name: str(p.name, 'name', 120), year: p.year === undefined ? undefined : year(p.year), context: p.context === undefined ? undefined : str(p.context, 'context', 300) };
  },
  cacheKey: p => `${PROMPT_VERSION}|dig_deeper|${p.kind}|${p.name.toLowerCase()}|${p.year ?? ''}`,
  maxTokens: 1500,
  build: p => ({
    system: SYSTEM(digSchema), schema: digSchema,
    prompt: `Find up to 3 SURPRISING but well-documented facts that most people do not know about this ${p.kind}: "${p.name}"${p.year !== undefined ? ` (around ${yearLabel(p.year)})` : ''}.${p.context ? `\nContext: ${p.context}` : ''}
Write every text field in BOTH English (…En) and Persian (…Fa); the two versions must say exactly the same thing. Good facts are specific and checkable (ages, dates, numbers, who-ruled-while-whom, odd consequences) — not famous textbook lines.
For each: "hook" (one short, striking sentence), "claim" (the precise fact, with its numbers), optional "context" (1–2 sentences), "year" (the year the fact is about, negative for BC, or null), "confidence", and "sources" (real works or well-known references you are sure exist).
If you are not confident of any fact, return {"facts": []}. Never invent a source.`,
  }),
  post: d => ({ facts: (d.facts ?? []).filter((f: any) => f.sources && f.sources.length > 0) }), // a fact without a source is dropped
};

/** Internal (never callable from the browser): second-model judge for a candidate fact. */
export const factCheckSchema: JsonSchema = {
  type: 'object',
  properties: {
    verdict: { type: 'string', enum: ['supported', 'unsupported', 'uncertain'] },
    persianMatches: { type: 'boolean' },
    reason: { type: 'string', maxLength: 300 },
  },
  required: ['verdict', 'persianMatches', 'reason'],
};
export function buildFactCheck(f: { entity: string; claimEn: string; claimFa: string; sources: string[] }): BuiltTask {
  return {
    system: SYSTEM(factCheckSchema), schema: factCheckSchema,
    prompt: `You are a skeptical fact-checker of history. Judge ONE claim.
Entity: ${f.entity}
Claim (English): ${f.claimEn}
Claim (Persian): ${f.claimFa}
Cited sources: ${f.sources.join(' | ') || '(none)'}

"verdict": "supported" only if you are confident the claim is accurate in every number and date; "unsupported" if it is wrong, exaggerated or you know a contradicting fact; "uncertain" if you cannot tell. When in doubt choose "uncertain". Do not give the benefit of the doubt.
"persianMatches": true only if the Persian claim says exactly the same as the English one (same numbers, same meaning).
"reason": one short sentence.`,
  };
}
export const FACT_CHECK_MAX_TOKENS = 250;

export const TASKS: Record<TaskId, TaskDef> = {
  year_dynasties: yearDynasties, ruler_detail: rulerDetail, events, figures, artifacts, quiz, dig_deeper: digDeeper,
};

export const isTaskId = (v: unknown): v is TaskId => typeof v === 'string' && (TASK_IDS as readonly string[]).includes(v);
