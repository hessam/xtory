import { describe, it, expect } from 'vitest';
import { getAnchorsForYear, getAllHistoricalRegionIds, getAnchorsForRegion } from './historicalDataIndex';
import { getEraForYear } from '../services/geminiService';

describe('historicalDataIndex', () => {
  it('finds the Achaemenids in Fars in 500 BC', () => {
    const anchors = getAnchorsForYear(-500, 'fars');
    expect(anchors.some(a => /achaemenid/i.test(a.dynastyName))).toBe(true);
  });
  it('returns many concurrent polities in the Seljuk age', () => {
    expect(new Set(getAnchorsForYear(1100).map(a => a.dynastyName)).size).toBeGreaterThan(8);
  });
  it('keeps non-core region ids confined to the two files that use them', () => {
    // Known gap (tracked for Slice 1): the Achaemenid and Sasanian files list satrapies/provinces
    // (lydia, bactria, kirman, armenia, ...) that are not among the 12 board regions.
    const known = ['fars','jibal','khuzestan','mesopotamia','azerbaijan','caucasus','caspian_coast','khorasan','sistan','makran','transoxiana','chorasmia'];
    const allowedFiles = ['550\u2013330-BC', '224\u2013651-AD'];
    for (const id of getAllHistoricalRegionIds()) {
      if (known.includes(id)) continue;
      for (const a of getAnchorsForRegion(id)) {
        expect(allowedFiles.some(f => a.sourceFile.includes(f))).toBe(true);
      }
    }
  });
});

describe('getEraForYear', () => {
  it('maps boundary years', () => {
    expect(getEraForYear(-500).id).toBe('achaemenid');
    expect(getEraForYear(300).id).toBe('sasanian');
    expect(getEraForYear(1600).id).toBe('safavid');
  });
});
