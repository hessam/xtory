/**
 * "Meanwhile…": what the neighbours were doing in the same era (ff_meanwhile). Static data from data/meanwhile/*.json,
 * so it works with no backend. Figures are rounded, period-level estimates (see data/meanwhile/SOURCES.md).
 */
import west from '../../data/meanwhile/west.json';
import china from '../../data/meanwhile/china.json';
import india from '../../data/meanwhile/india.json';
import arabia from '../../data/meanwhile/arabia.json';
import europe from '../../data/meanwhile/europe.json';
import steppe from '../../data/meanwhile/steppe.json';
import iranJson from '../../data/meanwhile/iran.json';
import citiesJson from '../../data/meanwhile/cities.json';

export interface Bi { en: string; fa: string }
export interface Period { from: number; to: number; title: Bi; line?: Bi; sizeMkm2: number | null; sources: string[] }
export interface Civ { id: string; name: Bi; dir?: Compass; periods: Period[] }
export type Compass = 'N' | 'NE' | 'E' | 'SE' | 'S' | 'SW' | 'W' | 'NW';
export interface CityEntry { from: number; name: Bi; pop: number; sources: string[] }

export const NEIGHBOURS = [west, china, india, arabia, europe, steppe] as unknown as Civ[];
export const IRAN = iranJson as unknown as Civ;
export const CITIES = (citiesJson as unknown as { entries: CityEntry[] }).entries;
export const FIRST_YEAR = -700, LAST_YEAR = 1979, BUCKET = 25;

/** 25-year bucket a year belongs to (floor, so -700 → -700 and -1 → -25). */
export const bucketOf = (year: number) => Math.floor(year / BUCKET) * BUCKET;
export const inRange = (year: number) => year >= FIRST_YEAR && year <= LAST_YEAR;

export const periodAt = (civ: Civ, year: number): Period | null => civ.periods.find(p => year >= p.from && year < p.to) ?? null;
export const cityAt = (year: number): CityEntry | null => [...CITIES].reverse().find(c => c.from <= year) ?? null;

export interface Snapshot {
  year: number;
  bucket: number;
  neighbours: { civ: Civ; period: Period }[];
  iran: Period | null;
  city: CityEntry | null;
  /** largest realm in view, used to scale the versus bars */
  maxSize: number;
}
export function snapshotAt(year: number): Snapshot {
  const y = bucketOf(Math.min(LAST_YEAR, Math.max(FIRST_YEAR, year)));
  const neighbours = NEIGHBOURS.map(civ => ({ civ, period: periodAt(civ, y) })).filter((n): n is { civ: Civ; period: Period } => !!n.period);
  const iran = periodAt(IRAN, y);
  const maxSize = Math.max(0.1, iran?.sizeMkm2 ?? 0, ...neighbours.map(n => n.period.sizeMkm2 ?? 0));
  return { year, bucket: y, neighbours, iran, city: cityAt(y), maxSize };
}
