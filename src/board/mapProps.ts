import type { ReignEvent } from '../data/events';
import type { Ruler } from '../data/rulers';
import type { Dynasty } from '../data/dynasties';
import type { HistoricalEvent } from '../data/historicalEvents';
import type { Artifact } from '../data/artifacts';
import type { Vazir } from '../data/vazirs';

/** Identical to MapLeaflet's props (drop-in swap contract from docs/guardrails). */
export interface MapProps {
  year: number;
  lang: 'en' | 'fa';
  onRegionClick: (regionId: string) => void;
  onGlobalContextClick?: (year: number) => void;
  events: ReignEvent[];
  rulers: Record<string, Ruler>;
  dynasties: Record<string, Dynasty>;
  historicalEvents?: HistoricalEvent[];
  artifacts?: Artifact[];
  vazirs?: Vazir[];
  onHistoricalEventClick?: (event: HistoricalEvent) => void;
  onArtifactClick?: (artifact: Artifact) => void;
  onVazirClick?: (vazir: Vazir) => void;
}
