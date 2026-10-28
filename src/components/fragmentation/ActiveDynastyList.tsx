import React, { useMemo } from 'react';
import { getActiveDynastyIds, getDynasty, getRealmsAt, RELATION_RANK } from '../../data/registry';
import { toggleLens, useLens } from '../../lib/lensStore';

interface Props {
  year: number;
  lang: 'en' | 'fa';
  /** called after a row is chosen (e.g. to close a popover) */
  onPick?: () => void;
  compact?: boolean;
}

/** Contextual legend: only the dynasties ruling at `year`, each with its own colour. Tap = reach lens. */
export const ActiveDynastyList: React.FC<Props> = ({ year, lang, onPick, compact }) => {
  const lens = useLens();
  const rows = useMemo(() => {
    const realms = getRealmsAt(year);
    return getActiveDynastyIds(year).map(id => {
      const own = realms.filter(r => r.dynastyId === id);
      const best = Math.max(...own.map(r => RELATION_RANK[r.relation]));
      return { dynasty: getDynasty(id)!, best, regions: new Set(own.map(r => r.regionId)).size };
    }).sort((a, b) => b.best - a.best || b.regions - a.regions || a.dynasty.id.localeCompare(b.dynasty.id));
  }, [year]);

  return (
    <ul className="flex flex-col gap-1" dir={lang === 'fa' ? 'rtl' : 'ltr'}>
      {rows.map(({ dynasty, regions }) => (
        <li key={dynasty.id}>
          <button
            type="button"
            onClick={() => { toggleLens(dynasty.id); onPick?.(); }}
            aria-pressed={lens === dynasty.id}
            data-dynasty={dynasty.id}
            className={`w-full flex items-center gap-2 rounded-lg px-2 ${compact ? 'py-1' : 'py-1.5'} text-start calm-transition hover:bg-white/10 ${lens === dynasty.id ? 'bg-white/15 ring-1 ring-white/30' : ''}`}
          >
            <span className="w-2.5 h-2.5 rounded-full shrink-0 border border-black/30" style={{ background: dynasty.color }} />
            <span className={`flex-1 truncate ${compact ? 'text-[11px]' : 'text-xs'} text-slate-200`}>{dynasty.name[lang]}</span>
            <span className="text-[10px] text-slate-500 font-mono">{lang === 'fa' ? regions.toLocaleString('fa-IR') : regions}</span>
          </button>
        </li>
      ))}
    </ul>
  );
};
