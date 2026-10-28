import React, { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { X } from 'lucide-react';
import { countDynastiesAt, getDynasty } from '../../data/registry';
import { counterLabel, describeReach } from '../../lib/reachText';
import { setLens, useLens } from '../../lib/lensStore';
import { ActiveDynastyList } from './ActiveDynastyList';

interface Props { year: number; lang: 'en' | 'fa' }

/** "14 dynasties ruling · 1000 AD" counter (tap → who they were) + the reach-lens caption. */
export const FragmentationHud: React.FC<Props> = ({ year, lang }) => {
  const [open, setOpen] = useState(false);
  const lens = useLens();
  const count = useMemo(() => countDynastiesAt(year), [year]);
  const label = counterLabel(count, year, lang);

  // Close the list when the year moves on so it never shows stale rows.
  useEffect(() => setOpen(false), [year]);

  return (
    <>
      <div
        className="absolute left-1/2 -translate-x-1/2 z-[1000] pointer-events-auto flex flex-col items-center"
        style={{ top: 'calc(var(--safe-top, 0px) * 0 + 12px)' }}
        dir={lang === 'fa' ? 'rtl' : 'ltr'}
      >
        <button
          type="button"
          data-testid="dynasty-counter"
          onClick={() => setOpen(o => !o)}
          aria-expanded={open}
          className="liquid-glass-heavy border border-white/15 rounded-2xl px-3 py-1.5 flex items-center gap-2 shadow-xl active:scale-95 calm-transition"
        >
          <AnimatePresence mode="popLayout" initial={false}>
            <motion.span
              key={label.big}
              initial={{ y: -8, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 8, opacity: 0 }}
              transition={{ duration: 0.18 }}
              data-testid="dynasty-count"
              className={`text-xl font-bold text-amber-300 leading-none tabular-nums ${lang === 'fa' ? 'font-vazirmatn' : 'font-cinzel'}`}
            >
              {label.big}
            </motion.span>
          </AnimatePresence>
          <span className={`text-[10px] text-slate-300 leading-tight whitespace-nowrap text-start ${lang === 'fa' ? 'font-vazirmatn' : ''}`}>{label.small}</span>
        </button>

        <AnimatePresence>
          {open && (
            <motion.div
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              className="mt-2 w-64 max-h-[50vh] overflow-y-auto liquid-glass-heavy border border-white/15 rounded-2xl p-2 shadow-2xl"
              data-testid="dynasty-list"
            >
              <p className={`px-2 pb-1 text-[10px] uppercase tracking-widest text-slate-500 ${lang === 'fa' ? 'font-vazirmatn' : ''}`}>
                {lang === 'fa' ? 'برای دیدن قلمرو یکی را بزنید' : 'Tap one to see its real reach'}
              </p>
              <ActiveDynastyList year={year} lang={lang} onPick={() => setOpen(false)} />
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <AnimatePresence>
        {lens && getDynasty(lens) && (
          <motion.div
            key={lens}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            data-testid="lens-caption"
            dir={lang === 'fa' ? 'rtl' : 'ltr'}
            className="absolute left-3 right-3 bottom-3 sm:left-1/2 sm:right-auto sm:-translate-x-1/2 sm:max-w-xl z-[1000] pointer-events-auto liquid-glass-heavy border rounded-2xl px-3 py-2 flex items-start gap-2 shadow-2xl"
            style={{ borderColor: getDynasty(lens)!.color }}
          >
            <span className="w-2.5 h-2.5 rounded-full mt-1 shrink-0" style={{ background: getDynasty(lens)!.color }} />
            <p className={`flex-1 text-xs leading-relaxed text-slate-100 ${lang === 'fa' ? 'font-vazirmatn' : ''}`}>{describeReach(lens, year, lang)}</p>
            <button type="button" onClick={() => setLens(null)} aria-label={lang === 'fa' ? 'بستن' : 'Clear'} className="p-1 rounded-full hover:bg-white/10">
              <X className="w-3.5 h-3.5 text-slate-400" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
};
