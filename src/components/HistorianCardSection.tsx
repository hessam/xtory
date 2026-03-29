import React from 'react';
import { HistorianCardResult } from '../utils/getHistorianCard';
import { historianCards } from '../data/historianCards';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import { getHistorianCard } from '../utils/getHistorianCard';
import { Vazir, vazirs } from '../data/vazirs';
import { useMemo } from 'react';

interface Props {
  result: HistorianCardResult;
  lang: 'en' | 'fa';
  onNavigate: (year: number) => void;   // calls setYear in App.tsx
  isEnriching?: boolean;                // true while AI is fetching (shows the pulse)
  aiNarrative?: string | null;          // AI text to show beneath the card (null = not yet loaded)
  selectedVazir?: Vazir | null;
  onVazirClose?: () => void;
}

export const HistorianCardSection: React.FC<Props> = ({
  result,
  lang,
  onNavigate,
  isEnriching = false,
  aiNarrative = null,
  selectedVazir = null,
  onVazirClose = () => {},
}) => {
  const { card, isBetweenEras } = result;

  const prevCard = card.prevEraId
    ? getHistorianCard(
        historianCards.find(c => c.eraId === card.prevEraId)?.yearRange.start ?? 0
      )
    : null;

  const nextCard = card.nextEraId
    ? getHistorianCard(
        historianCards.find(c => c.eraId === card.nextEraId)?.yearRange.start ?? 0
      )
    : null;

  // Find a vazir that was active during the current card's range (or specific year)
  // We use the start year of the current era as the primary anchor
  const eraYear = card.yearRange.start;
  const eraVazir = useMemo(() => {
    return vazirs.find(v => eraYear >= v.activeYearStart && eraYear <= v.activeYearEnd) 
        || vazirs.find(v => v.activeYearStart >= card.yearRange.start && v.activeYearEnd <= card.yearRange.end);
  }, [eraYear, card.yearRange.start, card.yearRange.end]);

  return (
    <div className="p-4 flex flex-col gap-3">

      {/* Between-Eras Note */}
      {isBetweenEras && (
        <div className="text-[10px] text-slate-500 italic px-1">
          {lang === 'en'
            ? `Between major eras — closest context:`
            : `بین دوره‌های اصلی — نزدیک‌ترین زمینه:`}
        </div>
      )}

      {/* Era Title & Year Range */}
      <div>
        <h2 className="font-serif font-bold text-white text-lg leading-tight">
          {card.eraName[lang]}
        </h2>
        <p className="text-slate-400 text-xs mt-0.5 font-mono">
          {Math.abs(card.yearRange.start)}{card.yearRange.start < 0 ? ' BC' : ' AD'}
          {' – '}
          {Math.abs(card.yearRange.end)}{card.yearRange.end < 0 ? ' BC' : ' AD'}
        </p>
      </div>

      {/* Full Summary */}
      <p className="text-slate-300 text-sm leading-relaxed">
        {lang === 'fa' && card.fullSummary.fa
          ? card.fullSummary.fa
          : card.fullSummary.en}
      </p>

      {/* AI Enrichment State */}
      {isEnriching && !aiNarrative && (
        <div className="flex items-center gap-2 text-indigo-400 text-[10px] font-bold uppercase tracking-widest animate-pulse">
          <div className="w-1 h-1 rounded-full bg-indigo-500" />
          {lang === 'en' ? 'Expanding context...' : 'در حال گسترش زمینه...'}
        </div>
      )}

      {/* AI Narrative (appended below, never replaces the card) */}
      {aiNarrative && (
        <div className="pt-3 border-t border-amber-500/20">
          <p className="text-slate-400 text-sm italic leading-relaxed">
            {aiNarrative}
          </p>
        </div>
      )}

      {/* Connection Chips */}
      <div className="flex gap-2 flex-wrap mt-1" dir={lang === 'fa' ? 'rtl' : 'ltr'}>
        {prevCard && (
          <button
            onClick={() => onNavigate(prevCard.card.yearRange.start)}
            className="flex items-center gap-1 px-3 py-1.5 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-xs text-slate-300 calm-transition"
          >
            <ChevronLeft className="w-3 h-3" />
            {prevCard.card.eraName[lang]}
          </button>
        )}
        {nextCard && (
          <button
            onClick={() => onNavigate(nextCard.card.yearRange.start)}
            className="flex items-center gap-1 px-3 py-1.5 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-xs text-slate-300 calm-transition"
          >
            {nextCard.card.eraName[lang]}
            <ChevronRight className="w-3 h-3" />
          </button>
        )}
      </div>

      {/* Vazir Profile (Full mode when selected) */}
      {selectedVazir && (
        <div className="mt-3 p-4 rounded-3xl border border-amber-500/30 bg-amber-500/5 relative overflow-hidden group hover:bg-amber-500/10 transition-colors shadow-lg">
          {/* Subtle Glow */}
          <div className="absolute top-0 right-0 w-24 h-24 bg-amber-500/10 blur-3xl pointer-events-none" />

          <div className="flex items-center justify-between mb-3">
            <span className="text-[10px] font-bold text-amber-500 uppercase tracking-widest bg-amber-500/10 px-2 py-0.5 rounded-full border border-amber-500/20">
              {lang === 'en' ? 'Vazir Signature' : 'دست‌خط وزیر'}
            </span>
            <button
              onClick={onVazirClose}
              className="p-1 text-slate-500 hover:text-white hover:bg-white/10 rounded-full transition-all active:scale-90"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <h3 className="font-serif font-bold text-white text-base leading-snug">
            {selectedVazir.name[lang]}
          </h3>

          <p className="text-slate-400 text-xs mt-1 font-medium">
            {selectedVazir.title[lang]} <span className="text-slate-600 mx-1">·</span> <span className="text-amber-200/60 ">{selectedVazir.rulerName[lang]}</span>
          </p>

          <p className="text-slate-200 text-sm mt-3 leading-relaxed italic border-l-2 border-amber-500/30 pl-3">
            "{selectedVazir.contribution[lang]}"
          </p>

          <p className="text-slate-500 text-[11px] mt-3 leading-relaxed font-medium">
            {selectedVazir.paradox[lang]}
          </p>
        </div>
      )}

      {/* Vazir Highlight (Mini mode when NOT selected, but exists in era) */}
      {!selectedVazir && eraVazir && (
        <div className="mt-3 p-3 rounded-2xl border border-amber-500/20 bg-amber-500/5 hover:bg-amber-500/10 transition-colors calm-transition">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-1.5 h-1.5 rounded-full bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.6)]" />
            <span className="text-[10px] font-bold text-amber-500/80 uppercase tracking-widest">
              {lang === 'en' ? 'Vazir Highlight' : 'چهره برجسته دیوان'}
            </span>
          </div>
          <p className="text-slate-300 text-xs font-medium leading-snug">
            <span className="text-white font-bold">{eraVazir.name[lang]}:</span> {eraVazir.paradox[lang]}
          </p>
          <div className="mt-2 text-[10px] text-amber-200/40 italic">
            {lang === 'en' ? 'Find his marker on the map to read his full story →' : 'برای خواندن داستان او، نشانگرش را روی نقشه بیابید ←'}
          </div>
        </div>
      )}
    </div>
  );
};
