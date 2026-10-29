import type { GoogleGenAI } from "@google/genai";
import { HistoricalEvent } from '../data/historicalEvents';
import { HistoricalFigure } from '../data/figures';
import { Artifact } from '../data/artifacts';
import { regions, EraKey, getRegionById } from '../data/regions';
import { getAnchorsForYear, formatAnchorsForPrompt } from '../data/historicalDataIndex';
import { events as staticEvents } from '../data/events';
import { rulers as staticRulers } from '../data/rulers';
import { QuizQuestion } from '../types/quiz';
import type { TaskId } from '../ai/tasks';
import { askServer, AiServerError, serverErrorMessage } from './aiTransport';

const ERA_BOUNDARIES = [
  { id: 'median',        start: -678, end: -550 },
  { id: 'achaemenid',    start: -550, end: -330 },
  { id: 'seleucid',      start: -330, end: -247 },
  { id: 'parthian',      start: -247, end:  224  },
  { id: 'sasanian',      start:  224, end:  651  },
  { id: 'umayyad',       start:  661, end:  750  },
  { id: 'abbasid',       start:  750, end:  1258 },
  { id: 'samanid',       start:  819, end:  999  },
  { id: 'buyid',         start:  934, end:  1062 },
  { id: 'ghaznavid',     start:  977, end:  1186 },
  { id: 'seljuk',        start: 1037, end:  1194 },
  { id: 'ilkhanid',      start: 1256, end:  1335 },
  { id: 'timurid',       start: 1370, end:  1507 },
  { id: 'safavid',       start: 1501, end:  1736 },
];

function getYearBucketKey(year: number, prefix: string, lang: string): string {
  const bucket = Math.floor(year / 25) * 25;
  return `${prefix}_${bucket}_${lang}`;
}

/**
 * Returns a hybrid cache key.
 * Short eras get a single static key.
 * Long eras (>150 years) use 25-year buckets to preserve map granularity.
 */
function getHybridCacheKey(year: number, prefix: string, lang: string): string {
  const era = ERA_BOUNDARIES.find(e => year >= e.start && year <= e.end);
  
  if (era) {
    const eraLength = era.end - era.start;
    if (eraLength > 150) {
      return getYearBucketKey(year, `${prefix}_${era.id}`, lang);
    }
    return `${prefix}_${era.id}_${lang}`;
  }
  
  return getYearBucketKey(year, prefix, lang);
}

// --- IN-MEMORY SESSION CACHE (LRU) ---
const CACHE_MAP = new Map<string, any>();
const MAX_CACHE_SIZE = 50;

function getCached<T>(key: string): T | null {
  // Check memory first
  if (CACHE_MAP.has(key)) {
    const value = CACHE_MAP.get(key);
    CACHE_MAP.delete(key);
    CACHE_MAP.set(key, value);
    return value as T;
  }
  
  // Back with localStorage if in browser
  if (typeof window !== 'undefined') {
    try {
      const stored = localStorage.getItem(`xtory_${key}`);
      if (stored) {
        const parsed = JSON.parse(stored);
        // Sync back to memory for faster subsequent access
        CACHE_MAP.set(key, parsed);
        return parsed as T;
      }
    } catch (e) {
      console.warn("Storage access failed", e);
    }
  }
  return null;
}

function setCache<T>(key: string, value: T): void {
  if (CACHE_MAP.size >= MAX_CACHE_SIZE) {
    const oldestKey = CACHE_MAP.keys().next().value;
    if (oldestKey !== undefined) CACHE_MAP.delete(oldestKey);
  }
  CACHE_MAP.set(key, value);
  
  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem(`xtory_${key}`, JSON.stringify(value));
    } catch (e) {
      console.warn("Storage write failed", e);
    }
  }
}

// --- NEW PROMPT HELPERS & METADATA PARSING --- 
function getSourcesForPeriod(year: number): string {
  if (year < -550) return `- Elamite/Mesopotamian texts & Archaeology (Susa)\n- Cambridge History of Iran Vol. 2`;
  if (year >= -550 && year < -247) return `- Behistun Inscription\n- Persepolis Fortification Tablets\n- Pierre Briant, From Cyrus to Alexander`;
  if (year >= -247 && year < 651) return `- Coin & rock inscriptions\n- Cambridge History of Iran Vol. 3\n- Roman/Chinese sources`;
  if (year >= 651 && year < 1501) return `- al-Tabari's Tarikh\n- al-Biruni's writings\n- Cambridge History of Iran Vol. 4/5`;
  if (year >= 1501 && year < 1925) return `- Persian court chronicles\n- European traveler accounts\n- Cambridge History of Iran Vol. 6`;
  return `- Ervand Abrahamian, Modern Iran\n- Encyclopaedia Iranica`;
}

interface AIContentResult {
  body: string;
  sources: string[];
  certainty: 'HIGH' | 'MEDIUM' | 'LOW';
  archaeologicalEvidence?: 'YES' | 'NO' | 'PARTIAL';
}

function parseAIResponse(raw: string): AIContentResult {
  const lines = raw.split('\n');
  const bodyLines: string[] = [];
  let sources: string[] = [];
  let certainty: 'HIGH' | 'MEDIUM' | 'LOW' = 'MEDIUM';
  let archaeologicalEvidence: 'YES' | 'NO' | 'PARTIAL' | undefined;
  
  let parsingMetadata = false;

  lines.forEach(line => {
    const trimmed = line.trim();
    if (trimmed.startsWith('SOURCES:')) {
      sources = line.replace('SOURCES:', '').replace('[', '').replace(']', '').trim().split(',').map(s => s.trim());
      parsingMetadata = true;
    } else if (trimmed.startsWith('CERTAINTY:')) {
      certainty = line.replace('CERTAINTY:', '').replace('[', '').replace(']', '').trim() as 'HIGH' | 'MEDIUM' | 'LOW';
      parsingMetadata = true;
    } else if (trimmed.startsWith('ARCHAEOLOGICAL_EVIDENCE:')) {
      archaeologicalEvidence = line.replace('ARCHAEOLOGICAL_EVIDENCE:', '').trim() as 'YES' | 'NO' | 'PARTIAL';
      parsingMetadata = true;
    } else {
      if (!parsingMetadata) {
        bodyLines.push(line);
      }
    }
  });

  return { body: bodyLines.join('\n').trim(), sources, certainty, archaeologicalEvidence };
}

function formatAIResponseForUI(content: AIContentResult, lang: 'en' | 'fa'): string {
    const certConfig = {
      HIGH: { label: 'مستند', labelEn: 'Documented', icon: '✓', color: '#10b981' },
      MEDIUM: { label: 'نسبتاً مستند', labelEn: 'Partially documented', icon: '◎', color: '#f59e0b' },
      LOW: { label: 'افسانه‌آمیز', labelEn: 'Sparse sources', icon: '?', color: '#ef4444' }
    };
    const cert = certConfig[content.certainty] || certConfig.MEDIUM;
    const certLabel = lang === 'en' ? cert.labelEn : cert.label;
    const aiLabel = lang === 'en' ? 'AI' : 'هوش مصنوعی';
    const sourcesLabel = content.sources.length > 0 ? `📚 ${content.sources.join(' · ')}` : '';
    
    const footer = `\n\n---\n> **✦ ${aiLabel}** • **${cert.icon} ${certLabel}**${sourcesLabel ? ' • *' + sourcesLabel + '*' : ''}`;
    
    return content.body + footer;
}

function handleAIError(error: any, lang: 'en' | 'fa'): string {
  console.error("AI Service Error:", error);
  if (error instanceof AiServerError) return serverErrorMessage(error, lang);
  const msg = error?.message || "";
  
  if (msg.includes("429") || msg.toLowerCase().includes("quota") || msg.toLowerCase().includes("limit") || msg.includes("503")) {
    return lang === 'en' 
      ? "⚠️ **API Limit Reached.**\nYou've reached the free tier quota. Please wait a minute or add a different key in settings."
      : "⚠️ **اتمام سهمیه یا ترافیک بالا.**\nسهمیه طرح رایگان شما به پایان رسیده یا ترافیک سرور بالاست. لطفاً یک دقیقه صبر کنید یا یک کلید جدید در تنظیمات اضافه کنید.";
  }
  
  if (msg.includes("403") || msg.toLowerCase().includes("invalid") || msg.toLowerCase().includes("key") || msg.includes("API Key not found")) {
    return lang === 'en'
      ? "❌ **Invalid API Key.**\nThe provided key is either expired or incorrect. Please update it in the settings."
      : "❌ **کلید API نامعتبر است.**\nکلید وارد شده منقضی شده یا اشتباه است. لطفاً آن را در بخش تنظیمات به‌روزرسانی کنید.";
  }

  if (msg.toLowerCase().includes("safety") || msg.toLowerCase().includes("blocked")) {
    return lang === 'en'
      ? "🛡️ **Content Filtered.**\nThe response was blocked by safety filters. Feel free to try a different topic."
      : "🛡️ **محتوای فیلتر شده.**\nپاسخ به دلیل فیلترهای اخلاقی مسدود شد. می‌توانید موضوع دیگری را امتحان کنید.";
  }

  return lang === 'en' 
    ? "📡 **Connection Error.**\nUnable to reach the AI historian right now. Check your internet or try again in a moment."
    : "📡 **خطای اتصال.**\nدر حال حاضر دسترسی به هوش مصنوعی امکان‌پذیر نیست. اینترنت خود را چک کنید یا دوباره تلاش کنید.";
}
// ---------------------------------------------

let aiInstance: GoogleGenAI | null = null;
let GoogleGenAIClass: any = null;

export const setApiKey = async (key: string) => {
  if (!key) {
    aiInstance = null;
    return;
  }
  if (!GoogleGenAIClass) {
    const module = await import('@google/genai');
    GoogleGenAIClass = module.GoogleGenAI;
  }
  aiInstance = new GoogleGenAIClass({ apiKey: key });
};

// --- GEO-CORRECTION HELPERS ---

/**
 * Maps a year to a representative historical EraKey.
 * Used to cross-reference AI results against hardcoded eraPresence data.
 */
export function getEraForYear(year: number): { id: EraKey } {
  if (year < -1000) return { id: 'elamite' };
  if (year >= -1000 && year < -550) return { id: 'median' };
  if (year >= -550 && year < -330) return { id: 'achaemenid' };
  if (year >= -330 && year < -247) return { id: 'seleucid' };
  if (year >= -247 && year < 224) return { id: 'parthian' };
  if (year >= 224 && year < 651) return { id: 'sasanian' };
  if (year >= 651 && year < 750) return { id: 'umayyad' };
  if (year >= 750 && year < 821) return { id: 'abbasid' };
  if (year >= 821 && year < 861) return { id: 'tahirid' }; // Anchor for Khorasan
  if (year >= 861 && year < 875) return { id: 'saffarid' }; // Anchor for Sistan
  if (year >= 875 && year < 950) return { id: 'samanid' };
  if (year >= 950 && year < 1030) return { id: 'buyid' };
  if (year >= 1030 && year < 1186) return { id: 'ghaznavid' };
  if (year >= 1186 && year < 1250) return { id: 'seljuk' };
  if (year >= 1250 && year < 1350) return { id: 'ilkhanid' };
  if (year >= 1350 && year < 1500) return { id: 'timurid' };
  if (year >= 1500 && year < 1736) return { id: 'safavid' };
  if (year >= 1736 && year < 1747) return { id: 'afsharid' };
  if (year >= 1747 && year < 1789) return { id: 'zand' };
  if (year >= 1789 && year < 1925) return { id: 'qajar' };
  return { id: 'pahlavi' };
}


/**
 * Validates AI results against known geographic constraints.
 * If AI places a ruler with "low" confidence in a region where that era's
 * presence is not pre-authored, we flag it as contested.
 */
function validateRegionResult(result: DynamicRulerData, year: number): DynamicRulerData {
  const region = getRegionById(result.regionId as any);
  if (!region) return result;

  const era = getEraForYear(year);
  const knownPresence = region.eraPresence[era.id];

  // AI occasionally assigns a ruler to the wrong region (especially contested border regions).
  // If we have zero hardcoded record of this era's presence in the region AND the AI is unsure:
  if (!knownPresence && result.confidence === "low") {
    result.status = "Contested/Warzone"; // Flag rather than render wrong data
  }
  
  return result;
}

const getAiAsync = async () => {
  if (!aiInstance) throw new Error("API key not set");
  return aiInstance;
};

// ── Server AI (no user key needed) ─────────────────────────────────────────────
// A user-supplied key always wins (direct browser → Google). Otherwise, when the server proxy is on, the same
// features run through typed tasks at /api/ai/ask (see src/ai/tasks.ts); no prompt ever comes from the client.
/** The map plots these as [lat, lng]; anything outside the atlas (or the old 0-1000 grid values) is dropped, not drawn. */
const validLatLng = (c: unknown): [number, number] | undefined =>
  Array.isArray(c) && c.length === 2 && typeof c[0] === 'number' && typeof c[1] === 'number' && c[0] >= 10 && c[0] <= 45 && c[1] >= 24 && c[1] <= 77 ? [c[0], c[1]] : undefined;

let serverAiActive = false;
export const setServerAiActive = (on: boolean) => { serverAiActive = on; };
const useServerAi = () => !aiInstance && serverAiActive;

const proseToUi = (d: any, lang: 'en' | 'fa'): string =>
  d?.text ? formatAIResponseForUI({ body: String(d.text), sources: Array.isArray(d.sources) ? d.sources : [], certainty: ['HIGH', 'MEDIUM', 'LOW'].includes(d.certainty) ? d.certainty : 'MEDIUM' }, lang) : '';

async function generateJson(task: TaskId, params: Record<string, unknown>, lang: 'en' | 'fa', viaGemini: () => Promise<string>): Promise<any> {
  if (useServerAi()) return askServer(task, params, lang);
  return JSON.parse(await viaGemini());
}

export interface DynamicRulerData {
  id: string;
  // ── Dynasty-level fields (Pass 1 — reliable) ──
  dynastyNameEn: string;
  dynastyNameFa: string;
  dynastyColorFamily: 'persian' | 'arab' | 'turkic' | 'greek' | 'nomadic' | 'foreign' | 'semitic';
  dynastyClassification: string;
  capitalCityEn: string;
  capitalCityFa: string;
  dynastyStartYear: number;   // dynasty founding — always populated
  dynastyEndYear: number;     // dynasty end — always populated
  regionId: string;
  status: 'Direct Control' | 'Vassal State' | 'Contested/Warzone' | 'Sphere of Influence';
  confidence: 'high' | 'low';
  // ── Ruler-level fields (Pass 2 — nullable, loaded on-demand) ──
  rulerNameEn: string | null;
  rulerNameFa: string | null;
  rulerTitleEn: string | null;
  rulerTitleFa: string | null;
  rulerReignStart: number | null;   // THIS ruler's personal reign start
  rulerReignEnd: number | null;     // THIS ruler's personal reign end
  rulerResolved: boolean;            // false = not yet looked up, true = Pass 2 complete
  // Legacy compat — map to dynasty dates for rendering
  startDate: number;
  endDate: number;
}

export interface RulerDetailResult {
  rulerNameEn: string | null;
  rulerNameFa: string | null;
  rulerTitleEn: string | null;
  rulerTitleFa: string | null;
  rulerReignStart: number | null;
  rulerReignEnd: number | null;
  confidence: 'high' | 'low' | 'unknown';
}

export interface SearchResult {
  year: number;
  type: 'event' | 'figure' | 'ruler' | 'dynasty' | 'region';
  nameEn: string;
  nameFa: string;
  descriptionEn: string;
  descriptionFa: string;
}

export interface Relative {
  nameEn: string;
  nameFa: string;
  relationEn: string;
  relationFa: string;
  noteEn: string;
  noteFa: string;
}

export interface LineageData {
  parents: Relative[];
  spouses: Relative[];
  children: Relative[];
  notableRelatives: Relative[];
}

export async function generateLineage(personName: string, context: string, lang: 'en' | 'fa'): Promise<LineageData | string | null> {
  const cacheKey = `lineage_${personName}_${lang}`;
  const cached = getCached<LineageData>(cacheKey);
  if (cached) return cached;

  const prompt = `You are a historian expert in Greater Iran and surrounding regions.
  Provide the known family lineage and notable relatives of the historical figure "${personName}".
  Context about this person to ensure accuracy: ${context}
  
  Include parents, spouses, children, and any other notable relatives (like grandparents or siblings if historically significant).
  
  Return a JSON object with this exact structure:
  {
    "parents": [{"nameEn": "...", "nameFa": "...", "relationEn": "Mother/Father", "relationFa": "مادر/پدر", "noteEn": "Brief note about them", "noteFa": "یادداشت کوتاه"}],
    "spouses": [{"nameEn": "...", "nameFa": "...", "relationEn": "Wife/Husband", "relationFa": "همسر", "noteEn": "...", "noteFa": "..."}],
    "children": [{"nameEn": "...", "nameFa": "...", "relationEn": "Son/Daughter", "relationFa": "پسر/دختر", "noteEn": "...", "noteFa": "..."}],
    "notableRelatives": [{"nameEn": "Uzun Hasan", "nameFa": "اوزون حسن", "relationEn": "Maternal Grandfather", "relationFa": "پدربزرگ مادری", "noteEn": "...", "noteFa": "..."}]
  }
  
  If a category is empty or unknown, return an empty array for that key.
  Return ONLY valid JSON without any markdown formatting.`;

  try {
    const data = (await generateJson('lineage', { name: personName, context: context.slice(0, 400) }, lang, async () => {
    const response = await (await getAiAsync()).models.generateContent({
      model: "gemini-3-flash-preview",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
      }
    });
    
    let text = response.text || "{}";
    return text.replace(/```json/g, '').replace(/```/g, '').trim();
    })) as LineageData;
    setCache(cacheKey, data);
    return data;
  } catch (error) {
    return handleAIError(error, lang);
  }
}

export async function searchHistoricalElement(query: string, lang: 'en' | 'fa'): Promise<SearchResult | null> {
  const prompt = `You are a historian expert in world history.
  The user is searching for an historical element (event, figure, ruler, dynasty, or region). If the element is related to Greater Iran, prioritize that context.
  Query: "${query}"
  
  If you can identify the element, return a JSON object with this exact structure:
  {
    "found": true,
    "year": number (the most representative year, negative for BC),
    "type": "event" | "figure" | "ruler" | "dynasty" | "region",
    "nameEn": "English Name",
    "nameFa": "Persian Name",
    "descriptionEn": "Short description in English",
    "descriptionFa": "Short description in Persian"
  }
  
  If the element is not found, return:
  {
    "found": false
  }
  
  Return ONLY valid JSON without any markdown formatting.`;

  try {
    if (useServerAi()) {
      const d: any = await askServer('search', { query }, lang);
      return d?.found ? { year: d.year, type: d.type, nameEn: d.nameEn, nameFa: d.nameFa ?? d.nameEn, descriptionEn: d.descriptionEn ?? '', descriptionFa: d.descriptionFa ?? d.descriptionEn ?? '' } : null;
    }
    const responsePromise = (await getAiAsync()).models.generateContent({
      model: "gemini-3-flash-preview",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
      }
    });

    // Add a 15-second timeout to prevent infinite loading
    const timeoutPromise = new Promise<never>((_, reject) => 
      setTimeout(() => reject(new Error("Search timeout")), 15000)
    );

    const response = await Promise.race([responsePromise, timeoutPromise]) as any;
    
    let text = response.text || "{}";
    text = text.replace(/```json/g, '').replace(/```/g, '').trim();
    const data = JSON.parse(text);
    
    if (data.found) {
      return {
        year: data.year,
        type: data.type,
        nameEn: data.nameEn,
        nameFa: data.nameFa,
        descriptionEn: data.descriptionEn,
        descriptionFa: data.descriptionFa
      };
    }
    return null;
  } catch (error) {
    console.error("Error searching historical element:", error);
    return null;
  }
}

export async function fetchHistoricalEventsForYear(year: number, lang: 'en' | 'fa'): Promise<HistoricalEvent[]> {
  const cacheKey = `events_${year}_${lang}`;
  const cached = getCached<HistoricalEvent[]>(cacheKey);
  if (cached) return cached;

  const prompt = `Find 3 to 5 major historical events (battles, downfalls, political shifts, cultural milestones) that happened in Greater Iran within 25 years of the year ${year}.
  Return a JSON array of objects. Each object must contain:
  - id: A unique string ID (e.g., "ai_event_1")
  - year: The exact year the event occurred (negative for BC)
  - titleEn: Event title in English
  - titleFa: Event title in Persian
  - descriptionEn: A short, 1-2 sentence description in English
  - descriptionFa: A short, 1-2 sentence description in Persian
  - type: Must be exactly one of: "battle", "downfall", "political", "cultural", "universal"
  - coordinates: [latitude, longitude] in decimal degrees of the real location (latitude 10-45, longitude 24-77). For example Persepolis is [29.93, 52.89]. If unknown, omit this field.`;

  try {
    const data = (await generateJson('events', { year }, lang, async () => {
    const response = await (await getAiAsync()).models.generateContent({
      model: "gemini-3-flash-preview",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: "ARRAY",
          items: {
            type: "OBJECT",
            properties: {
              id: { type: "STRING" },
              year: { type: "INTEGER" },
              titleEn: { type: "STRING" },
              titleFa: { type: "STRING" },
              descriptionEn: { type: "STRING" },
              descriptionFa: { type: "STRING" },
              type: { type: "STRING", enum: ["battle", "downfall", "political", "cultural", "universal"] },
              coordinates: {
                type: "ARRAY",
                items: { type: "NUMBER" }
              }
            },
            required: ["id", "year", "titleEn", "titleFa", "descriptionEn", "descriptionFa", "type"]
          }
        }
      }
    });
    
    return response.text || "[]";
  }));
    
    const result = data.map((item: any) => ({
      id: `${item.id}_${Date.now()}`,
      year: item.year,
      title: { en: item.titleEn, fa: item.titleFa },
      description: { en: item.descriptionEn, fa: item.descriptionFa },
      type: item.type,
      coordinates: validLatLng(item.coordinates)
    })) as HistoricalEvent[];

    setCache(cacheKey, result);
    return result;
  } catch (error) {
    throw new Error(handleAIError(error, lang));
  }
}

export async function fetchHistoricalFiguresForYear(year: number, lang: 'en' | 'fa'): Promise<HistoricalFigure[]> {
  const cacheKey = `figures_${year}_${lang}`;
  const cached = getCached<HistoricalFigure[]>(cacheKey);
  if (cached) return cached;

  const prompt = `You are a historian expert in world history.
  Provide a list of 3 to 5 notable historical figures (philosophers, scientists, poets, artists, or other thinkers) from any part of the world who were alive and active around the year ${Math.abs(year)} ${year < 0 ? 'BC' : 'AD'}.
  Return ONLY a valid JSON array of objects with this exact structure:
  [{
    "id": "unique_string_id",
    "nameEn": "English Name",
    "nameFa": "Persian Name",
    "birthYear": number (negative for BC),
    "deathYear": number (negative for BC),
    "descriptionEn": "Short description in English",
    "descriptionFa": "Short description in Persian",
    "type": "philosopher" | "poet" | "scientist" | "artist" | "other"
  }]`;

  try {
    const data = (await generateJson('figures', { year }, lang, async () => {
    const response = await (await getAiAsync()).models.generateContent({
      model: "gemini-3-flash-preview",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: "ARRAY",
          items: {
            type: "OBJECT",
            properties: {
              id: { type: "STRING" },
              nameEn: { type: "STRING" },
              nameFa: { type: "STRING" },
              birthYear: { type: "INTEGER" },
              deathYear: { type: "INTEGER" },
              descriptionEn: { type: "STRING" },
              descriptionFa: { type: "STRING" },
              type: { type: "STRING", enum: ["philosopher", "poet", "scientist", "artist", "other"] }
            },
            required: ["id", "nameEn", "nameFa", "birthYear", "deathYear", "descriptionEn", "descriptionFa", "type"]
          }
        }
      }
    });
    
    return response.text || "[]";
  }));
    
    const result = data.map((item: any, index: number) => ({
      id: `ai_figure_${year}_${index}_${Date.now()}`,
      name: { en: item.nameEn, fa: item.nameFa },
      birthYear: item.birthYear,
      deathYear: item.deathYear,
      description: { en: item.descriptionEn, fa: item.descriptionFa },
      type: item.type
    })) as HistoricalFigure[];

    setCache(cacheKey, result);
    return result;
  } catch (error) {
    throw new Error(handleAIError(error, lang));
  }
}

export async function fetchArtifactsForYear(year: number, lang: 'en' | 'fa'): Promise<Artifact[]> {
  const cacheKey = `artifacts_${year}_${lang}`;
  const cached = getCached<Artifact[]>(cacheKey);
  if (cached) return cached;

  const prompt = `You are a historian expert in Greater Iran.
  Provide a list of 3 to 5 notable monuments, heritages, artifacts, or manuscripts that were created or became prominent in Greater Iran around the year ${Math.abs(year)} ${year < 0 ? 'BC' : 'AD'}.
  Return ONLY a valid JSON array of objects with this exact structure:
  [{
    "id": "unique_string_id",
    "nameEn": "English Name",
    "nameFa": "Persian Name",
    "descriptionEn": "Short description in English",
    "descriptionFa": "Short description in Persian",
    "year": number (negative for BC),
    "currentLocationEn": "Current location (e.g., British Museum, Tehran, Isfahan)",
    "currentLocationFa": "Current location in Persian",
    "coordinates": [latitude, longitude] (decimal degrees of the real place: latitude 10-45, longitude 24-77; for example Chogha Zanbil is [32.01, 48.52]),
    "type": "monument" | "artifact" | "manuscript" | "architecture"
  }]`;

  try {
    const data = (await generateJson('artifacts', { year }, lang, async () => {
    const response = await (await getAiAsync()).models.generateContent({
      model: "gemini-3-flash-preview",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: "ARRAY",
          items: {
            type: "OBJECT",
            properties: {
              id: { type: "STRING" },
              nameEn: { type: "STRING" },
              nameFa: { type: "STRING" },
              descriptionEn: { type: "STRING" },
              descriptionFa: { type: "STRING" },
              year: { type: "INTEGER" },
              currentLocationEn: { type: "STRING" },
              currentLocationFa: { type: "STRING" },
              coordinates: {
                type: "ARRAY",
                items: { type: "NUMBER" }
              },
              type: { type: "STRING", enum: ["monument", "artifact", "manuscript", "architecture"] }
            },
            required: ["id", "nameEn", "nameFa", "descriptionEn", "descriptionFa", "year", "currentLocationEn", "currentLocationFa", "coordinates", "type"]
          }
        }
      }
    });
    
    return response.text || "[]";
  }));
    
    const result = data.map((item: any, index: number) => ({
      id: `ai_artifact_${year}_${index}_${Date.now()}`,
      name: { en: item.nameEn, fa: item.nameFa },
      description: { en: item.descriptionEn, fa: item.descriptionFa },
      year: item.year,
      currentLocation: { en: item.currentLocationEn, fa: item.currentLocationFa },
      coordinates: validLatLng(item.coordinates),
      type: item.type
    })) as Artifact[];

    setCache(cacheKey, result);
    return result;
  } catch (error) {
    throw new Error(handleAIError(error, lang));
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// PASS 1 — DYNASTY IDENTIFICATION (fast, reliable, no ruler hallucination)
// Asks AI only for dynasty-level data. No ruler names, no reign dates.
// ═══════════════════════════════════════════════════════════════════════════════

export async function fetchHistoricalDataForYear(year: number, lang: 'en' | 'fa'): Promise<DynamicRulerData[]> {
  const cacheKey = getHybridCacheKey(year, 'dynasties_v2', lang);
  const cached = getCached<DynamicRulerData[]>(cacheKey);
  if (cached) return cached;

  // Pull every dynasty active at this year from the curated JSON files
  const allAnchors = getAnchorsForYear(year);
  
  // Build region manifest enriched with real curated data
  const regionManifest = regions.map(r => {
    const existingEvents = staticEvents.filter(e => e.regionId === r.id && year >= e.startDate && year <= e.endDate);
    const knownRulers = existingEvents.map(e => staticRulers[e.rulerId]?.name[lang]).filter(Boolean);
    const regionAnchors = allAnchors.filter(a => a.regionId === r.id);
    
    return {
      id: r.id,
      knownAs: r.aliases.slice(0, 3),
      knownRulers,
      verifiedDynasties: regionAnchors.map(a => ({
        dynastyName: a.dynastyName,
        yearsActive: `${a.startYear < 0 ? Math.abs(a.startYear) + ' BC' : a.startYear + ' AD'}–${a.endYear < 0 ? Math.abs(a.endYear) + ' BC' : a.endYear + ' AD'}`,
        confidence: a.confidence
      })),
      anchorCity: r.anchorCities[0]?.name,
      anchorCities: r.anchorCities.map(c => ({
        name: c.name,
        historical: c.historicalNames || []
      }))
    };
  });

  const anchorsTable = formatAnchorsForPrompt(allAnchors);
  const regionCount = regionManifest.filter(r => r.verifiedDynasties.length > 0).length;

  // ── PASS 1 PROMPT: Dynasty-level required + ruler-level optional ──
  const prompt = `You are a strict data-entry historian mapping the political borders in Greater Iran for the year ${Math.abs(year)}${year<0?' BC':' AD'}.
Your primary goal is to identify which DYNASTIES controlled each region.
You may OPTIONALLY identify the specific ruler IF you are highly confident.

═══ VERIFIED HISTORICAL DATA (from curated research files) ═══
The following dynasties are CONFIRMED active at year ${Math.abs(year)}${year<0?' BC':' AD'} across ${regionCount} regions:

${anchorsTable}

═══ INSTRUCTIONS ═══

ZONE A — Regions with "verifiedDynasties" in the manifest:
- Return a separate entry for EACH verified dynasty in that region.
- Do NOT invent dynasties that are not in the verified list.
- Use the dynasty's documented years as dynastyStartYear/dynastyEndYear.

ZONE B — Regions with EMPTY "verifiedDynasties" (no curated data):
- Identify which dynasty/polity held this region based on your knowledge.
- Mark confidence as "low".

RULER FIELDS (optional):
- If you are HIGHLY CONFIDENT about the specific ruler at this exact year, populate rulerNameEn, rulerNameFa, rulerTitleEn, rulerTitleFa, rulerReignStart, and rulerReignEnd.
- rulerReignStart/rulerReignEnd must be THIS individual ruler's personal reign dates (typically 10–40 years), NOT the dynasty lifespan. If the dates would span more than 80 years, you are returning dynasty dates by mistake — return null instead.
- If you are NOT confident about the specific ruler, return null for all ruler fields. A null answer is CORRECT and PREFERRED over a fabrication.

capitalCityEn/capitalCityFa should be the dynasty's seat of power in THIS region, constrained to the anchorCities listed.

Return compact JSON ONLY. Every regionId must come from the manifest.

Regions Manifest: ${JSON.stringify(regionManifest)}`;

  const dynastySchema = {
    type: "ARRAY" as const,
    items: {
      type: "OBJECT" as const,
      properties: {
        dynastyNameEn: { type: "STRING" as const },
        dynastyNameFa: { type: "STRING" as const },
        dynastyColorFamily: { type: "STRING" as const, enum: ["persian", "arab", "turkic", "greek", "nomadic", "foreign", "semitic"] },
        dynastyClassification: { type: "STRING" as const },
        capitalCityEn: { type: "STRING" as const },
        capitalCityFa: { type: "STRING" as const },
        dynastyStartYear: { type: "INTEGER" as const },
        dynastyEndYear: { type: "INTEGER" as const },
        regionId: { type: "STRING" as const, enum: regions.map(r => r.id) },
        status: { type: "STRING" as const, enum: ["Direct Control", "Vassal State", "Contested/Warzone", "Sphere of Influence"] },
        confidence: { type: "STRING" as const, enum: ["high", "low"] },
        // Ruler fields — OPTIONAL, nullable
        rulerNameEn: { type: "STRING" as const, nullable: true },
        rulerNameFa: { type: "STRING" as const, nullable: true },
        rulerTitleEn: { type: "STRING" as const, nullable: true },
        rulerTitleFa: { type: "STRING" as const, nullable: true },
        rulerReignStart: { type: "INTEGER" as const, nullable: true },
        rulerReignEnd: { type: "INTEGER" as const, nullable: true },
      },
      required: ["dynastyNameEn", "dynastyNameFa", "dynastyColorFamily", "dynastyClassification", "capitalCityEn", "capitalCityFa", "dynastyStartYear", "dynastyEndYear", "regionId", "status", "confidence"]
    }
  };

  const callGemini = async (retryLabel = '') => {
    const data = (await generateJson('year_dynasties', { year }, lang, async () => {
    const response = await (await getAiAsync()).models.generateContent({
      model: "gemini-3-flash-preview",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: dynastySchema
      }
    });
    return response.text || "[]";
  }));
    
    // Filter out redundant dynasties that overlap with static data
    const filteredData = data.filter((item: any) => {
      const regionData = regionManifest.find(m => m.id === item.regionId);
      if (!regionData) return true;
      const isKnown = regionData.knownRulers.some((kr: string) => 
        item.dynastyNameEn.toLowerCase().includes(kr.toLowerCase())
      );
      return !isKnown;
    });
    
    return filteredData.map((item: any, index: number) => {
      // Determine if AI returned valid ruler data
      const hasRuler = item.rulerNameEn && item.rulerNameEn.trim() !== '';
      let rulerReignStart = hasRuler ? (item.rulerReignStart ?? null) : null;
      let rulerReignEnd = hasRuler ? (item.rulerReignEnd ?? null) : null;

      // Mechanical guard: null reign dates if they equal dynasty dates (AI cheating)
      if (rulerReignStart === item.dynastyStartYear && rulerReignEnd === item.dynastyEndYear) {
        rulerReignStart = null;
        rulerReignEnd = null;
      }
      // Mechanical guard: null reign dates if span > 80 years (dynasty dates leaked)
      if (rulerReignStart != null && rulerReignEnd != null && Math.abs(rulerReignEnd - rulerReignStart) > 80) {
        rulerReignStart = null;
        rulerReignEnd = null;
      }

      // Use ruler reign dates for bar width when available, else dynasty dates
      const barStart = rulerReignStart ?? item.dynastyStartYear;
      const barEnd = rulerReignEnd ?? item.dynastyEndYear;

      const entry: DynamicRulerData = {
        id: `ai_${retryLabel}${year}_${index}_${Date.now()}`,
        // Dynasty-level (reliable)
        dynastyNameEn: item.dynastyNameEn,
        dynastyNameFa: item.dynastyNameFa,
        dynastyColorFamily: item.dynastyColorFamily,
        dynastyClassification: item.dynastyClassification,
        capitalCityEn: item.capitalCityEn,
        capitalCityFa: item.capitalCityFa,
        dynastyStartYear: item.dynastyStartYear,
        dynastyEndYear: item.dynastyEndYear,
        regionId: item.regionId,
        status: item.status,
        confidence: item.confidence || 'low',
        // Ruler-level (populated if AI was confident, null otherwise)
        rulerNameEn: hasRuler ? item.rulerNameEn : null,
        rulerNameFa: hasRuler ? (item.rulerNameFa || null) : null,
        rulerTitleEn: hasRuler ? (item.rulerTitleEn || null) : null,
        rulerTitleFa: hasRuler ? (item.rulerTitleFa || null) : null,
        rulerReignStart,
        rulerReignEnd,
        rulerResolved: hasRuler, // true if AI already provided a ruler
        // Legacy compat: use ruler dates for bar rendering when available
        startDate: barStart,
        endDate: barEnd
      };
      return validateRegionResult(entry, year);
    });
  };

  try {
    const result = await callGemini();
    setCache(cacheKey, result);
    return result;
  } catch (error: any) {
    const msg = error?.message || "";
    if (msg.includes("503") || msg.toLowerCase().includes("unavailable") || msg.toLowerCase().includes("high demand")) {
      console.warn("Gemini busy, retrying in 2 seconds...");
      await new Promise(r => setTimeout(r, 2000));
      try {
        const result = await callGemini('retry_');
        setCache(cacheKey, result);
        return result;
      } catch (retryError) {
        throw new Error(handleAIError(retryError, lang));
      }
    }
    throw new Error(handleAIError(error, lang));
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// PASS 2 — RULER DETAIL (on-demand, per dynasty, allows null)
// Only called when user taps a dynasty chip or opens ruler detail.
// ═══════════════════════════════════════════════════════════════════════════════

export async function fetchRulerDetail(
  dynastyNameEn: string,
  dynastyNameFa: string,
  dynastyStart: number,
  dynastyEnd: number,
  regionId: string,
  year: number,
  lang: 'en' | 'fa'
): Promise<RulerDetailResult> {
  const cacheKey = `ruler_detail_${dynastyNameEn.replace(/\s+/g, '_')}_${regionId}_${year}`;
  const cached = getCached<RulerDetailResult>(cacheKey);
  if (cached) return cached;

  const region = getRegionById(regionId as any);
  const regionName = region?.displayName?.en?.full || regionId;
  const anchorCity = region?.anchorCities?.[0]?.name || '';

  const yearDisplay = `${Math.abs(year)} ${year < 0 ? 'BC' : 'AD'}`;
  const dynastyStartDisplay = `${Math.abs(dynastyStart)} ${dynastyStart < 0 ? 'BC' : 'AD'}`;
  const dynastyEndDisplay = `${Math.abs(dynastyEnd)} ${dynastyEnd < 0 ? 'BC' : 'AD'}`;

  const prompt = `Year: ${yearDisplay}.
Dynasty: ${dynastyNameEn} / ${dynastyNameFa} (active ${dynastyStartDisplay}–${dynastyEndDisplay}).
Region: ${regionName} (anchor city: ${anchorCity}).

What is the name of the SPECIFIC ruler of the ${dynastyNameEn} who controlled ${anchorCity || regionName} around ${yearDisplay}?

STRICT RULES:
- Return the ruler's name ONLY if you are highly confident it is historically documented.
- If uncertain or if the specific ruler for this exact year is unknown, return null for all ruler fields.
- A null answer is CORRECT and PREFERRED over a fabrication.
- Do NOT invent a plausible-sounding name to fill the field.
- Do NOT return the dynasty's dates as the ruler's reign dates.
- rulerReignStart/rulerReignEnd must be THIS individual ruler's personal reign dates, NOT the dynasty's lifespan.
- CRITICAL: reignStart and reignEnd must be THIS individual ruler's personal dates — typically 10–40 years. If you return dates spanning more than 80 years, you have returned dynasty dates by mistake. Return null instead.
- The capital or seat of power must be within or near ${anchorCity || regionName}. Do not suggest capitals from other regions.

Return JSON only.`;

  try {
    const data = (await generateJson('ruler_detail', { dynastyNameEn: dynastyNameEn, dynastyNameFa: dynastyNameFa, dynastyStart, dynastyEnd, regionId, year }, lang, async () => {
    const response = await (await getAiAsync()).models.generateContent({
      model: "gemini-3-flash-preview",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: "OBJECT" as const,
          properties: {
            rulerNameEn: { type: "STRING" as const, nullable: true },
            rulerNameFa: { type: "STRING" as const, nullable: true },
            rulerTitleEn: { type: "STRING" as const, nullable: true },
            rulerTitleFa: { type: "STRING" as const, nullable: true },
            rulerReignStart: { type: "INTEGER" as const, nullable: true },
            rulerReignEnd: { type: "INTEGER" as const, nullable: true },
            confidence: { type: "STRING" as const, enum: ["high", "low", "unknown"] }
          },
          required: ["confidence"]
        }
      }
    });

    return response.text || "{}";
  })) as RulerDetailResult;

    // Validate: if confidence is "unknown" or names are empty, force nulls
    if (data.confidence === 'unknown' || !data.rulerNameEn || data.rulerNameEn.trim() === '') {
      data.rulerNameEn = null;
      data.rulerNameFa = null;
      data.rulerTitleEn = null;
      data.rulerTitleFa = null;
      data.rulerReignStart = null;
      data.rulerReignEnd = null;
      data.confidence = 'unknown';
    }

    // Validate: if reign dates equal dynasty dates exactly, the AI is cheating — null them
    if (data.rulerReignStart === dynastyStart && data.rulerReignEnd === dynastyEnd) {
      console.warn(`[Pass 2] AI returned dynasty dates as ruler dates for ${dynastyNameEn} — nulling reign dates`);
      data.rulerReignStart = null;
      data.rulerReignEnd = null;
    }

    // Mechanical guard: no single ruler reigns more than 80 years
    if (data.rulerReignStart != null && data.rulerReignEnd != null) {
      const span = Math.abs(data.rulerReignEnd - data.rulerReignStart);
      if (span > 80) {
        console.warn(`[Pass 2] AI returned ${span}-year reign for ${data.rulerNameEn} in ${dynastyNameEn} — nulling (exceeds 80yr ceiling)`);
        data.rulerReignStart = null;
        data.rulerReignEnd = null;
      }
    }

    setCache(cacheKey, data);
    return data;
  } catch (error) {
    console.warn(`[Pass 2] Failed to fetch ruler detail for ${dynastyNameEn}:`, error);
    return {
      rulerNameEn: null,
      rulerNameFa: null,
      rulerTitleEn: null,
      rulerTitleFa: null,
      rulerReignStart: null,
      rulerReignEnd: null,
      confidence: 'unknown'
    };
  }
}

export async function generateBiography(name: string, title: string, dynasty: string, lang: 'en' | 'fa', year: number = 0): Promise<string> {
  const cacheKey = `bio_${name}_${dynasty}_${lang}`;
  const cached = getCached<string>(cacheKey);
  if (cached) return cached;

  const sources = getSourcesForPeriod(year);
  const prompt = lang === 'en'
    ? `Historian voice, general audience. Biography of ${name} (${title}, ${dynasty}). Exactly 3 paragraphs: P1-vivid opening scene/decision. P2-reign arc & central tension. P3-echo/legacy + one open historical question. Natural uncertainty lowercase phrase inline. No quotes, No headers, No MD lists. Sources: ${sources}\n\nAppend on new lines:\nSOURCES: [comma list of 2-3 sources]\nCERTAINTY: [HIGH or MEDIUM or LOW]`
    : `لحن مورخ، مخاطب عام. بیوگرافی ${name} (${title}، دودمان ${dynasty}). دقیقاً ۳ پاراگراف: پ۱-صحنه آغازین واضح. پ۲-مسیر سلطنت و تنش اصلی. پ۳-میراث و یک سوال تاریخی بی‌پاسخ. بدون نقل قول، بدون تیتر، رزومه نباشد. منابع استفاده شده: ${sources}\n\nدر خطوط جدید اضافه کنید:\nSOURCES: [2-3 منبع محدود با کاما]\nCERTAINTY: [HIGH یا MEDIUM یا LOW]`;

  try {
    if (useServerAi()) {
      const ui = proseToUi(await askServer('biography', { name, title, dynasty, year }, lang), lang);
      if (ui) setCache(cacheKey, ui);
      return ui;
    }
    const response = await (await getAiAsync()).models.generateContent({
      model: "gemini-3-flash-preview",
      contents: prompt,
    });
    
    if (!response.text) return '';
    const parsed = parseAIResponse(response.text);
    const finalUI = formatAIResponseForUI(parsed, lang);
    setCache(cacheKey, finalUI);
    return finalUI;
  } catch (error) {
    return handleAIError(error, lang);
  }
}

export async function generateAlternateHistory(eventDescription: string, rulerName: string, regionName: string, year: number, lang: 'en' | 'fa', customPrompt?: string): Promise<string> {
  const cacheKey = `whatif_${rulerName}_${regionName}_${year}_${lang}_${customPrompt || 'default'}`;
  const cached = getCached<string>(cacheKey);
  if (cached) return cached;

  const sources = getSourcesForPeriod(year);
  const realismEn = "Plausible cause-and-effect. Acknowledge uncertainty. No definitively false claims.";
  const realismFa = "علت و معلول منطقی. پذیرش عدم قطعیت. دفاع تاریخی معقول.";
  
  let prompt = '';
  if (customPrompt) {
    prompt = lang === 'en'
      ? `Historian voice. Context: ${rulerName} in ${regionName} around ${Math.abs(year)}${year<0?'BC':'AD'}. "What If": "${customPrompt}". Explain changes to region + ripple effects. ${realismEn} Exactly 2 paragraphs. Sources: ${sources}\n\nAppend:\nSOURCES: [2-3 sources]\nCERTAINTY: [HIGH أو MEDIUM أو LOW]`
      : `لحن مورخ. زمینه: ${rulerName} در ${regionName} حدود ${Math.abs(year)}${year<0?'ق.م':'م'}. چه میشد اگر: "${customPrompt}". تغییرات منطقه و اثرات موجی را توضیح دهید. ${realismFa} دقیقا ۲ پاراگراف. منابع: ${sources}\n\nاضافه کنید:\nSOURCES: [2-3 منابع]\nCERTAINTY: [HIGH یا MEDIUM یا LOW]`;
  } else {
    prompt = lang === 'en'
      ? `Historian voice. Context: ${rulerName} in ${regionName} around ${Math.abs(year)}${year<0?'BC':'AD'}. Invent 1 alternative path for a major event (e.g. diplomacy, succession, disaster). Explain "What If" scenario, changes to region + ripple effects. ${realismEn} Exactly 2 paragraphs. Sources: ${sources}\n\nAppend:\nSOURCES: [2-3 sources]\nCERTAINTY: [HIGH/MEDIUM/LOW]`
      : `لحن مورخ. زمینه: ${rulerName} در ${regionName} حدود ${Math.abs(year)}${year<0?'ق.م':'م'}. یک مسیر متفاوت برای رویدادی بزرگ پیشنهاد دهید. سناریو، تغییرات و اثرات موجی را توضیح دهید. ${realismFa} دقیقا ۲ پاراگراف. منابع: ${sources}\n\nاضافه کنید:\nSOURCES: [2-3 منابع]\nCERTAINTY: [HIGH/MEDIUM/LOW]`;
  }

  try {
    if (useServerAi()) {
      const ui = proseToUi(await askServer('what_if_ruler', { ruler: rulerName, region: regionName, year, ...(customPrompt ? { custom: customPrompt } : {}) }, lang), lang);
      if (ui) setCache(cacheKey, ui);
      return ui;
    }
    const response = await (await getAiAsync()).models.generateContent({
      model: "gemini-3-flash-preview",
      contents: prompt,
    });
    if (!response.text) return '';
    const parsed = parseAIResponse(response.text);
    const finalUI = formatAIResponseForUI(parsed, lang);
    setCache(cacheKey, finalUI);
    return finalUI;
  } catch (error) {
    return handleAIError(error, lang);
  }
}

export async function generateHistoricalEventWhatIf(eventTitle: string, eventDesc: string, year: number, lang: 'en' | 'fa', customPrompt?: string): Promise<string> {
  const cacheKey = `event_whatif_${eventTitle}_${year}_${lang}_${customPrompt || 'default'}`;
  const cached = getCached<string>(cacheKey);
  if (cached) return cached;

  const sources = getSourcesForPeriod(year);
  const realismEn = "Logical cause-and-effect. Acknowledge uncertainty. Defensible claims.";
  const realismFa = "علت و معلول منطقی. پذیرش عدم قطعیت. دفاع معقول.";

  let prompt = '';
  if (customPrompt) {
    prompt = lang === 'en'
      ? `Historian voice. Event "${eventTitle}" (${eventDesc}) in ${Math.abs(year)}${year<0?'BC':'AD'}. "What If": "${customPrompt}". Changes to region & world. ${realismEn} Exactly 2 paragraphs. Sources: ${sources}\n\nAppend:\nSOURCES: [2-3 sources]\nCERTAINTY: [HIGH/MEDIUM/LOW]`
      : `لحن مورخ. رویداد "${eventTitle}" (${eventDesc}) در سال ${Math.abs(year)}${year<0?'ق.م':'م'}. "چه میشد اگر": "${customPrompt}". اثرات بر منطقه. ${realismFa} دقیقا ۲ پاراگراف. منابع: ${sources}\n\nاضافه کنید:\nSOURCES: [2-3 منابع]\nCERTAINTY: [HIGH/MEDIUM/LOW]`;
  } else {
    prompt = lang === 'en'
      ? `Historian voice. Event "${eventTitle}" (${eventDesc}) in ${Math.abs(year)}${year<0?'BC':'AD'}. Explore 1 divergence path (e.g. diplomacy, succession, disaster). Changes to region & ripples. ${realismEn} Exactly 2 paragraphs. Sources: ${sources}\n\nAppend:\nSOURCES: [2-3 sources]\nCERTAINTY: [HIGH/MEDIUM/LOW]`
      : `لحن مورخ. رویداد "${eventTitle}" (${eventDesc}) در سال ${Math.abs(year)}${year<0?'ق.م':'م'}. یک انحراف مسیر پیشنهاد دهید. اثرات منطقه ای چیست؟ ${realismFa} دقیقا ۲ پاراگراف. منابع: ${sources}\n\nاضافه کنید:\nSOURCES: [2-3 منابع]\nCERTAINTY: [HIGH/MEDIUM/LOW]`;
  }

  try {
    if (useServerAi()) {
      const ui = proseToUi(await askServer('what_if_event', { title: eventTitle, description: eventDesc, year, ...(customPrompt ? { custom: customPrompt } : {}) }, lang), lang);
      if (ui) setCache(cacheKey, ui);
      return ui;
    }
    const response = await (await getAiAsync()).models.generateContent({
      model: "gemini-3-flash-preview",
      contents: prompt,
    });
    if (!response.text) return '';
    const parsed = parseAIResponse(response.text);
    const finalUI = formatAIResponseForUI(parsed, lang);
    setCache(cacheKey, finalUI);
    return finalUI;
  } catch (error) {
    return handleAIError(error, lang);
  }
}

export async function chatWithAssistant(history: { role: 'user' | 'model', text: string }[], message: string, lang: 'en' | 'fa'): Promise<string> {
  const systemInstruction = lang === 'en'
    ? "You are a knowledgeable Historical Assistant specializing in the history of Greater Iran, its dynasties, rulers, and regions. Provide accurate, engaging, and concise answers."
    : "شما یک دستیار تاریخی مطلع هستید که در تاریخ ایران بزرگ، دودمان‌ها، حاکمان و مناطق آن تخصص دارید. پاسخ‌های دقیق، جذاب و مختصر ارائه دهید.";

  try {
    const isContextQuery = history.length === 0;
    // Hash message to prevent huge keys
    const msgHash = message.split('').reduce((a,b)=>{a=((a<<5)-a)+b.charCodeAt(0);return a&a},0).toString();
    const cacheKey = `chat_${msgHash}_${lang}`;
    
    if (isContextQuery) {
      const cached = getCached<string>(cacheKey);
      if (cached) return cached;
    }

    if (useServerAi()) {
      const d: any = await askServer('chat', { history: history.slice(-8), message }, lang);
      const t = String(d?.text ?? '');
      if (isContextQuery && t) setCache(cacheKey, t);
      return t;
    }
    const chat = (await getAiAsync()).chats.create({
      model: "gemini-3-flash-preview",
      config: {
        systemInstruction,
      },
    });

    // We need to simulate the history if the SDK doesn't support passing history directly in create.
    // Actually, we can just send the latest message, but to keep context, we can pass the history as a single prompt if needed,
    // or use the chat session. Since we create a new chat instance here, it won't have the history.
    // Let's format the history into the message for context.
    let fullPrompt = message;
    if (history.length > 0) {
        fullPrompt = "Previous conversation:\n" + history.map(h => `${h.role}: ${h.text}`).join('\n') + `\n\nUser: ${message}`;
    }

    const response = await chat.sendMessage({ message: fullPrompt });
    const text = response.text || '';
    
    if (isContextQuery && text) {
      setCache(cacheKey, text);
    }
    return text;
  } catch (error) {
    return handleAIError(error, lang);
  }
}

const QUIZ_GENERATION_PROMPT = `
You are creating a highly specific, intriguing history trivia question 
about Iranian/Greater Iranian history.
Generate ONE trivia myth/fact for the era around year {YEAR} in THIS LANGUAGE: {LANG}.

The fact MUST be specifically about: {ANGLE}

Output JSON EXACTLY like this:
{
  "myth": "myth or false assumption",
  "answer": "TRUE" | "FALSE" | "IT'S COMPLICATED",
  "reality": "1-2 sentence shocking reality",
  "reveal_hook": "1 short punchy sentence hook",
  "era_link": year
}

Rules:
- MUST be highly specific and random.
- Keep output extremely concise to save tokens.
- Output ONLY valid JSON, no markdown.
`;

const ANGLES = [
  "Major Military or Political Events",
  "Specific Historical Figures or Rulers",
  "Cultural and Literary Figures (Poets, Thinkers, Artists)",
  "Heritage, Architecture, or Famous Artifacts",
  "Scientific Discoveries or Ancient Innovations",
  "Daily Life, Strange Customs, or Economics"
];

export async function generateQuizQuestion(year: number, lang: 'en' | 'fa', askedMyths: string[] = []): Promise<QuizQuestion | string | null> {
  try {
    const randomAngle = ANGLES[Math.floor(Math.random() * ANGLES.length)];
    
    let prompt = QUIZ_GENERATION_PROMPT
      .replace('{YEAR}', year.toString())
      .replace('{LANG}', lang === 'en' ? 'English' : 'Persian (Farsi)')
      .replace('{ANGLE}', randomAngle);

    if (askedMyths.length > 0) {
      prompt += `\n\nCRITICAL: DO NOT generate any of these myths or variations of them:\n${askedMyths.map(m => `- ${m}`).join('\n')}`;
    }

    const requestPayload = {
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: "OBJECT",
          properties: {
            myth: { type: "STRING" },
            answer: { type: "STRING", enum: ["TRUE", "FALSE", "IT'S COMPLICATED"] },
            reality: { type: "STRING" },
            reveal_hook: { type: "STRING" },
            era_link: { type: "INTEGER" }
          },
          required: ["myth", "answer", "reality", "reveal_hook", "era_link"]
        }
      }
    };

    const data = (await generateJson('quiz', { year, angle: ANGLES.indexOf(randomAngle), askedMyths: askedMyths.slice(-8) }, lang, async () => {
    let response;
    try {
      response = await (await getAiAsync()).models.generateContent({
        ...requestPayload,
        model: "gemini-3-flash-preview"
      });
    } catch (primaryError: any) {
      if (primaryError?.message?.includes("503") || primaryError?.message?.includes("high demand") || primaryError?.status === "UNAVAILABLE" || primaryError?.message?.includes("not found")) {
        console.warn("Gemini 3 Flash is experiencing issues, falling back to stable 1.5 Flash...", primaryError);
        response = await (await getAiAsync()).models.generateContent({
          ...requestPayload,
          model: "gemini-1.5-flash"
        });
      } else {
        throw primaryError;
      }
    }

    return response.text || "{}";
  }));
    return {
      id: `ai_quiz_${year}_${Date.now()}`,
      myth: data.myth,
      myth_fa: data.myth,
      answer: data.answer,
      reality: data.reality,
      reality_fa: data.reality,
      reveal_hook: data.reveal_hook,
      reveal_hook_fa: data.reveal_hook,
      era_link: data.era_link,
      difficulty: "MEDIUM",
      sources: [],
      certainty: "HIGH",
      is_ai_generated: true
    } as QuizQuestion;
  } catch (error) {
    console.error("Error generating quiz question:", error);
    return handleAIError(error, lang);
  }
}
