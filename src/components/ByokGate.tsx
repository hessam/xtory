// src/components/ByokGate.tsx
import React from 'react';
import { getByokTeaser, getTeaserText } from '../data/byokTeasers';
import { Sparkles } from 'lucide-react';

interface Props {
  year: number;
  lang: 'en' | 'fa';
  onUnlock: () => void; // calls setShowSettings(true) from App.tsx
}

export const ByokGate: React.FC<Props> = ({ year, lang, onUnlock }) => {
  const teaser = getByokTeaser(year);
  const { text, cta } = getTeaserText(teaser, lang);

  return (
    <button 
      onClick={onUnlock}
      className={`w-full text-left rtl:text-right py-5 pl-4 pr-2 group active:opacity-70 transition-all border-l-2 border-amber-500/30 bg-[rgba(201,169,110,0.04)] rounded-r-xl my-2`}
    >
      <div className="flex flex-col items-start min-w-0">
        {/* Label: Diamond + Cinzel */}
        <div className="flex items-center gap-1.5 mb-2.5 opacity-60 group-hover:opacity-100 transition-opacity">
          <span className="text-amber-500/80 text-[8px] leading-none mb-0.5">◆</span>
          <span className="font-cinzel text-[9px] font-bold uppercase tracking-[0.2em] text-amber-500/80">
            {lang === 'en' ? 'Historian Insight' : 'بینش مورخ'}
          </span>
        </div>

        {/* Teaser Text: No truncation, full wrapping */}
        <p className="text-slate-300 text-[11px] font-medium leading-[1.6] mb-3 whitespace-normal">
          {text}
        </p>

        {/* CTA: Separate line, Cinzel + Arrow */}
        <div className="flex items-center gap-1.5 font-cinzel text-[10px] font-bold text-amber-500/60 group-hover:text-amber-500 transition-colors uppercase tracking-wider">
          <span>{lang === 'en' ? 'Unlock this story' : 'باز کردن این داستان'}</span>
          <span className="text-[12px] leading-none">→</span>
        </div>
      </div>
    </button>
  );
};
