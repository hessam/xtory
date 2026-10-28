import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { dynasties, realms, getDynasty, getRealmsAt, countDynastiesAt, getActiveDynastyIds, getReach, changePoints } from './registry';
import audit from './generated/dynasties.audit.json';
import { parseYearRanges } from '../lib/yearRange';
import { contrastAgainstBoard } from '../../scripts/registry/colors';

const DATA_DIR = path.resolve(__dirname, '../../docs/historical_data');
const overrides = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../../data/registry/overrides.json'), 'utf8'));

const rawEntries = fs.readdirSync(DATA_DIR).filter(f => f.endsWith('.json')).flatMap(f =>
  (JSON.parse(fs.readFileSync(path.join(DATA_DIR, f), 'utf8')) as any[]).map(e => ({ file: f, ...e }))
);

describe('registry coverage', () => {
  it('maps every curated entry to exactly one dynasty (except documented skips)', () => {
    const skipped = new Set(Object.keys(overrides.skip));
    const expectedRows = rawEntries
      .filter(e => !skipped.has(`${e.file}|${String(e.dynasty_name).trim()}`))
      .reduce((n, e) => n + parseYearRanges(e.approximate_years_active ?? e.approximate_years).length, 0);
    expect(realms.length).toBe(expectedRows);
    expect(skipped.size).toBe(rawEntries.filter(e => skipped.has(`${e.file}|${String(e.dynasty_name).trim()}`)).length);
  });

  it('every raw dynasty name is an alias of exactly one registry dynasty', () => {
    const owner = new Map<string, string>();
    for (const [id, a] of Object.entries(audit as Record<string, { aliases: string[] }>)) {
      for (const alias of a.aliases) {
        expect(owner.has(alias), `alias "${alias}" claimed by ${owner.get(alias)} and ${id}`).toBe(false);
        owner.set(alias, id);
      }
    }
    const skipped = new Set(Object.keys(overrides.skip));
    for (const e of rawEntries) {
      if (skipped.has(`${e.file}|${String(e.dynasty_name).trim()}`)) continue;
      expect(owner.has(String(e.dynasty_name).trim()), `unmapped: ${e.dynasty_name}`).toBe(true);
    }
  });

  it('every realm points at a real dynasty and a sane span', () => {
    for (const r of realms) {
      expect(getDynasty(r.dynastyId)).toBeTruthy();
      expect(r.start).toBeLessThanOrEqual(r.end);
    }
  });
});

describe('dynasty identity', () => {
  it('has unique ids, and en + fa names for all', () => {
    expect(new Set(dynasties.map(d => d.id)).size).toBe(dynasties.length);
    for (const d of dynasties) {
      expect(d.name.en.trim(), d.id).not.toBe('');
      expect(d.name.fa.trim(), d.id).not.toBe('');
    }
  });

  it('merges known spelling variants into one dynasty', () => {
    const aliases = audit as Record<string, { aliases: string[] }>;
    expect(aliases['sasanian'].aliases).toEqual(expect.arrayContaining(['Sasanian Empire', 'House of Sasan (Direct Rule)']));
    expect(aliases['justanid'].aliases).toEqual(expect.arrayContaining(['Justanids', 'Justanid Dynasty']));
    expect(aliases['great_seljuq'].aliases).toEqual(expect.arrayContaining(['Great Seljuq Empire']));
    expect(dynasties.filter(d => /banu ka/i.test(d.name.en))).toHaveLength(1);
    expect(dynasties.filter(d => /^justanid/i.test(d.name.en))).toHaveLength(1);
  });

  it('gives every dynasty a distinct, legible colour', () => {
    const hexes = dynasties.map(d => d.color);
    expect(new Set(hexes).size).toBe(hexes.length);
    for (const d of dynasties) {
      expect(d.color).toMatch(/^#[0-9a-f]{6}$/);
      expect(contrastAgainstBoard(d.color), d.id).toBeGreaterThanOrEqual(3);
    }
  });

  it('keeps colours stable (snapshot of five dynasties)', () => {
    const pick = ['achaemenid', 'sasanian', 'abbasid', 'safavid', 'great_seljuq'].map(id => [id, getDynasty(id)!.color]);
    expect(Object.fromEntries(pick)).toMatchSnapshot();
  });
});

describe('selectors', () => {
  it('is deterministic', () => {
    expect(getActiveDynastyIds(1000)).toEqual(getActiveDynastyIds(1000));
  });

  it('counts many concurrent dynasties in fragmented ages', () => {
    expect(countDynastiesAt(1000)).toBeGreaterThanOrEqual(10);
    expect(countDynastiesAt(1100)).toBeGreaterThanOrEqual(10);
    expect(countDynastiesAt(1750)).toBeGreaterThanOrEqual(30);
    expect(countDynastiesAt(-500)).toBeGreaterThanOrEqual(5);
  });

  it('finds the Achaemenids in Fars in 500 BC', () => {
    expect(getRealmsAt(-500, 'fars').some(r => r.dynastyId === 'achaemenid')).toBe(true);
  });

  it('reach: Mahmud-era Ghaznavids did not hold every region; others ruled alongside', () => {
    const reach = getReach('ghaznavid', 1020);
    expect(reach.regions.length).toBeGreaterThan(0);
    expect(reach.coreRegionCount).toBeLessThan(12);
    expect(reach.concurrentDynastyIds.length).toBeGreaterThan(0);
  });

  it('coreOnly excludes satrapies outside the 12 regions', () => {
    expect(countDynastiesAt(-500, { coreOnly: true })).toBeLessThanOrEqual(countDynastiesAt(-500));
  });

  it('change points are ascending and unique', () => {
    const pts = changePoints();
    expect([...pts]).toEqual([...new Set(pts)].sort((a, b) => a - b));
  });
});
