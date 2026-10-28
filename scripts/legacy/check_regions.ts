import { events } from '../../src/data/events';
import { regions } from '../../src/data/regions';

const missingRegions = new Set<string>();

const regionsMap = new Map();
regions.forEach(r => regionsMap.set(r.id, r));

events.forEach(event => {
  if (!regionsMap.has(event.regionId)) {
    missingRegions.add(event.regionId);
  }
});

console.log('Missing Regions:', Array.from(missingRegions));
