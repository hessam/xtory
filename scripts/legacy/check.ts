import { events } from '../../src/data/events';
import { rulers } from '../../src/data/rulers';
import { dynasties } from '../../src/data/dynasties';

const missingRulers = new Set<string>();
const missingDynasties = new Set<string>();

events.forEach(event => {
  if (!rulers[event.rulerId]) {
    missingRulers.add(event.rulerId);
  } else if (!dynasties[rulers[event.rulerId].dynastyId]) {
    missingDynasties.add(rulers[event.rulerId].dynastyId);
  }
});

console.log('Missing Rulers:', Array.from(missingRulers));
console.log('Missing Dynasties:', Array.from(missingDynasties));
