/**
 * Historical Data Index — ZERO-HARDCODING data-driven anchor system.
 * 
 * Loads ALL curated JSON files from docs/historical_data/ at Vite build time
 * via import.meta.glob. Normalizes field name differences across files,
 * parses year ranges, and provides a single lookup function:
 * 
 *   getAnchorsForYear(year, regionId?) → HistoricalAnchor[]
 * 
 * This is the ONLY source of truth for AI prompt anchoring.
 * No dynasty names, era keys, or region-dynasty mappings are hardcoded anywhere.
 */

// ── Types ────────────────────────────────────────────────────────────────────

export interface HistoricalAnchor {
  regionId: string;
  dynastyName: string;
  startYear: number;
  endYear: number;
  confidence: 'high' | 'medium' | 'low';
  sourceFile: string;
}

interface RawEntry {
  region_id?: string;
  dynasty_name?: string;
  approximate_years_active?: string;
  approximate_years?: string;
  confidence?: string;
}

// ── Year Parsing ─────────────────────────────────────────────────────────────
// Shared with the registry build: see src/lib/yearRange.ts
import { parseYearRange } from '../lib/yearRange';

// ── Loader ───────────────────────────────────────────────────────────────────

// Vite's import.meta.glob loads every JSON file at build time — no runtime IO.
const rawModules = import.meta.glob(
  '/docs/historical_data/*.json',
  { eager: true, import: 'default' }
) as Record<string, RawEntry[]>;

// Build the unified index ONCE at module load
const INDEX: HistoricalAnchor[] = [];

for (const [filePath, entries] of Object.entries(rawModules)) {
  if (!Array.isArray(entries)) continue;
  const fileName = filePath.split('/').pop() || filePath;

  for (const entry of entries) {
    const regionId = entry.region_id;
    const dynastyName = entry.dynasty_name;
    const yearsRaw = entry.approximate_years_active || entry.approximate_years;
    const confidence = (entry.confidence || 'medium').toLowerCase() as 'high' | 'medium' | 'low';

    if (!regionId || !dynastyName || !yearsRaw) continue;

    const range = parseYearRange(yearsRaw);
    if (!range) {
      console.warn(`[HistoricalDataIndex] Could not parse year range: "${yearsRaw}" in ${fileName}`);
      continue;
    }

    INDEX.push({
      regionId,
      dynastyName,
      startYear: range.start,
      endYear: range.end,
      confidence,
      sourceFile: fileName
    });
  }
}

// Fuzzy deduplication: normalize dynasty names before comparing.
// Strips parenthetical variants like "(Baduspanid)" and collapses whitespace.
function normalizeDynastyName(name: string): string {
  return name
    .replace(/\s*\([^)]*\)\s*/g, ' ')  // strip parenthetical content
    .replace(/\s+/g, ' ')               // collapse whitespace
    .trim()
    .toLowerCase();
}

const seen = new Map<string, HistoricalAnchor>();
const DEDUPED_INDEX: HistoricalAnchor[] = [];
for (const anchor of INDEX) {
  const normName = normalizeDynastyName(anchor.dynastyName);
  const key = `${anchor.regionId}|${normName}`;
  
  const existing = seen.get(key);
  if (!existing) {
    seen.set(key, anchor);
    DEDUPED_INDEX.push(anchor);
  } else {
    // Keep the entry with the broadest year range
    if ((anchor.endYear - anchor.startYear) > (existing.endYear - existing.startYear)) {
      // Replace with broader entry
      const idx = DEDUPED_INDEX.indexOf(existing);
      if (idx !== -1) DEDUPED_INDEX[idx] = anchor;
      seen.set(key, anchor);
    }
  }
}

console.log(`[HistoricalDataIndex] Loaded ${DEDUPED_INDEX.length} unique anchors from ${Object.keys(rawModules).length} files`);

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Get all curated dynasty anchors active at a given year.
 * Optionally filter by regionId.
 */
export function getAnchorsForYear(year: number, regionId?: string): HistoricalAnchor[] {
  return DEDUPED_INDEX.filter(a => {
    const yearMatch = year >= a.startYear && year <= a.endYear;
    if (!yearMatch) return false;
    if (regionId) return a.regionId === regionId;
    return true;
  });
}

/**
 * Get all unique region IDs present in the historical data.
 */
export function getAllHistoricalRegionIds(): string[] {
  return [...new Set(DEDUPED_INDEX.map(a => a.regionId))];
}

/**
 * Get all anchors for a specific region across all time periods.
 */
export function getAnchorsForRegion(regionId: string): HistoricalAnchor[] {
  return DEDUPED_INDEX.filter(a => a.regionId === regionId);
}

/**
 * Format anchors into a compact string for AI prompt injection.
 * Groups by region, showing dynasty name + year range + confidence.
 */
export function formatAnchorsForPrompt(anchors: HistoricalAnchor[]): string {
  const byRegion: Record<string, HistoricalAnchor[]> = {};
  for (const a of anchors) {
    if (!byRegion[a.regionId]) byRegion[a.regionId] = [];
    byRegion[a.regionId].push(a);
  }

  const lines: string[] = [];
  for (const [regionId, regionAnchors] of Object.entries(byRegion)) {
    const entries = regionAnchors
      .map(a => `${a.dynastyName} (${formatYearDisplay(a.startYear)}–${formatYearDisplay(a.endYear)}, ${a.confidence})`)
      .join('; ');
    lines.push(`  ${regionId}: ${entries}`);
  }

  return lines.join('\n');
}

function formatYearDisplay(year: number): string {
  if (year < 0) return `${Math.abs(year)} BC`;
  return `${year} AD`;
}
