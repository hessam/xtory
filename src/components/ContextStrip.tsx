import React, { useMemo } from 'react';
import { getHistorianCard } from '../utils/getHistorianCard';
import { formatYear } from '../utils/format';
import { motion, AnimatePresence } from 'motion/react';

interface Props {
  year: number;
  lang: 'en' | 'fa';
  isPersianDominant?: boolean; // Sprint 2 will pass this; ignored for now
}

export const ContextStrip: React.FC<Props> = ({ year, lang }) => {
  const { card } = useMemo(() => getHistorianCard(year), [year]);

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={lang}
        initial={{ opacity: 0.7 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0.7 }}
        transition={{ duration: 0.15 }}
        className="flex items-center gap-3 px-4 liquid-glass bg-slate-950/80 sm:bg-transparent backdrop-blur-sm sm:backdrop-blur-none border-b border-white/5 sm:border-white/10 overflow-hidden"
        style={{ height: 36, flexShrink: 0 }}
        dir={lang === 'fa' ? 'rtl' : 'ltr'}
      >
        {/* Era Name - Whisper Volume on mobile */}
        <span className="font-serif font-bold text-white/30 text-[9px] sm:text-xs uppercase tracking-[0.2em] sm:normal-case sm:tracking-normal whitespace-nowrap">
          {card.eraName[lang]}
        </span>

        {/* Separator */}
        <span className="text-white/20 text-xs">·</span>

        {/* Situation One-Liner (truncated) */}
        <span className="text-slate-400 text-xs truncate flex-1">
          {card.situationOneLiner[lang]}
        </span>

        {/* Year badge */}
        <span className="font-mono text-xs text-slate-500 whitespace-nowrap shrink-0">
          {formatYear(year, lang)}
        </span>
      </motion.div>
    </AnimatePresence>
  );
};
