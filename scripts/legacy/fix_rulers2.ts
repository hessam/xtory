import * as fs from 'fs';

let content = fs.readFileSync('src/data/rulers.ts', 'utf8');

const originalTop = `export type RulerType = 'Central Monarch' | 'Co-ruler' | 'Rival/Usurper' | 'Vassal/Sub-king' | 'Foreign Occupier';

export interface Ruler {
  id: string;
  name: { en: string; fa: string };
  title: { en: string; fa: string };
  dynastyId: string;
  rulerType: RulerType;
  startDate: number;
  endDate: number;
}

export const rulers: Record<string, Ruler> = {
`;

const startIdx = content.indexOf('  // Elamite');
if (startIdx !== -1) {
  content = originalTop + content.substring(startIdx);
}

fs.writeFileSync('src/data/rulers.ts', content);
