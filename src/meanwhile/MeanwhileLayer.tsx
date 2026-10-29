import React, { useMemo, useState } from 'react';
import { ArrowUp, Globe2, X } from 'lucide-react';
import { snapshotAt, type Compass, type Snapshot } from './data';
import { formatYear, toPersianDigits } from '../utils/format';

type Lang = 'en' | 'fa';
const fa = (l: Lang) => (l === 'fa' ? 'font-vazirmatn' : '');
const num = (n: string | number, l: Lang) => (l === 'fa' ? toPersianDigits(n) : String(n));
const T = {
  btn: { en: 'Meanwhile', fa: 'در همان زمان' },
  title: { en: 'Meanwhile, elsewhere', fa: 'در همان زمان، جاهای دیگر' },
  size: { en: 'Size of the biggest realm (million km²)', fa: 'اندازه بزرگ‌ترین قلمرو (میلیون کیلومتر مربع)' },
  noSize: { en: 'no single realm', fa: 'قلمرو یکپارچه ندارد' },
  city: { en: 'World\'s largest city', fa: 'بزرگ‌ترین شهر جهان' },
  note: { en: 'Rounded period estimates, not exact figures.', fa: 'برآوردهای گرد برای هر دوره، نه ارقام دقیق.' },
  close: { en: 'Close', fa: 'بستن' },
  people: { en: 'people', fa: 'نفر' },
} as const;
const t = (k: keyof typeof T, l: Lang) => T[k][l];
const DEG: Record<Compass, number> = { N: 0, NE: 45, E: 90, SE: 135, S: 180, SW: 225, W: 270, NW: 315 };
/** where each direction's arrow sits (kept to the upper map; the right edge below the map controls; the bottom sheet covers the lower part on phones) */
const POS: Record<Compass, string> = {
  N: 'left-1/2 -translate-x-1/2 top-[22%]', NE: 'right-2 top-[30%]', E: 'right-2 top-[42%]', SE: 'right-2 top-[54%]',
  S: 'left-1/2 -translate-x-1/2 top-[62%]', SW: 'left-2 top-[54%]', W: 'left-2 top-[42%]', NW: 'left-2 top-[30%]',
};
const sizeText = (n: number | null, l: Lang) => (n == null ? '—' : num(n < 1 ? n.toFixed(2).replace(/0$/, '') : n.toFixed(1).replace(/\.0$/, ''), l));
const popText = (k: number, l: Lang) => (k >= 1000 ? `${num((k / 1000).toFixed(k >= 10000 ? 0 : 1).replace(/\.0$/, ''), l)} ${l === 'fa' ? 'میلیون' : 'million'}` : `${num(k, l)} ${l === 'fa' ? 'هزار' : 'thousand'}`);

/** Edge arrows for the civilisations beyond the map + a versus panel (empire size, largest city). Non-modal, static data, no backend. */
const MeanwhileLayer: React.FC<{ year: number; lang: Lang }> = ({ year, lang }) => {
  const [open, setOpen] = useState(false);
  const snap: Snapshot = useMemo(() => snapshotAt(year), [year]);
  const dir = lang === 'fa' ? 'rtl' : 'ltr';

  return (
    <>
      <div className="absolute inset-0 z-[999] pointer-events-none" data-testid="meanwhile-arrows">
        {snap.neighbours.filter(n => n.civ.dir).map(({ civ, period }) => (
          <button key={civ.id} type="button" onClick={() => setOpen(true)} data-testid={`meanwhile-arrow-${civ.id}`} aria-label={`${civ.name[lang]}: ${period.title[lang]}`}
                  className={`absolute ${POS[civ.dir!]} pointer-events-auto liquid-glass border border-white/15 rounded-xl px-2 py-1 flex items-center gap-1 max-w-[7.5rem] min-h-[32px] active:scale-95 calm-transition`} dir={dir}>
            <ArrowUp className="w-3.5 h-3.5 shrink-0 text-amber-300" style={{ transform: `rotate(${DEG[civ.dir!]}deg)` }} aria-hidden />
            <span className={`text-[10px] leading-tight text-slate-200 truncate ${fa(lang)}`}>{civ.name[lang].split(' · ')[0]}</span>
          </button>
        ))}
      </div>

      <button type="button" onClick={() => setOpen(o => !o)} data-testid="meanwhile-btn"
              className={`absolute z-[1000] pointer-events-auto start-3 top-[68px] liquid-glass-heavy border border-sky-300/40 rounded-2xl px-3 min-h-[44px] flex items-center gap-1.5 text-xs text-slate-100 shadow-xl active:scale-95 calm-transition ${fa(lang)}`} dir={dir}>
        <Globe2 className="w-4 h-4 text-sky-300" aria-hidden />{t('btn', lang)}
      </button>

      {open && (
        <div className="absolute z-[1002] start-3 end-3 top-[116px] max-sm:top-[116px] max-sm:end-14 flex justify-center pointer-events-none" dir={dir}>
          <section data-testid="meanwhile-panel" className="pointer-events-auto w-full max-w-md max-h-[62vh] max-sm:max-h-[40vh] overflow-y-auto liquid-glass-heavy border border-sky-300/30 rounded-3xl p-4 shadow-2xl">
            <div className="flex items-start gap-2">
              <h2 className={`flex-1 text-base font-bold text-sky-200 ${fa(lang)}`}>{t('title', lang)} · <span data-testid="meanwhile-year">{formatYear(snap.bucket, lang)}</span></h2>
              <button type="button" onClick={() => setOpen(false)} aria-label={t('close', lang)} data-testid="meanwhile-close" className="w-9 h-9 -m-1 flex items-center justify-center rounded-xl text-slate-400 hover:text-white hover:bg-white/10"><X className="w-4 h-4" /></button>
            </div>
            <p className={`mt-1 text-[11px] text-slate-400 ${fa(lang)}`}>{t('size', lang)}</p>
            <ul className="mt-2 space-y-2.5">
              {snap.iran && <Row name={snap.iran.title[lang]} size={snap.iran.sizeMkm2} max={snap.maxSize} lang={lang} iran />}
              {snap.neighbours.map(({ civ, period }) => (
                <li key={civ.id} data-testid="meanwhile-row">
                  <Row name={`${civ.name[lang]} — ${period.title[lang]}`} size={period.sizeMkm2} max={snap.maxSize} lang={lang} />
                  {period.line && <p className={`mt-0.5 text-[11px] text-slate-400 leading-snug ${fa(lang)}`}>{period.line[lang]}</p>}
                </li>
              ))}
            </ul>
            {snap.city && <p className={`mt-3 text-xs text-slate-200 ${fa(lang)}`} data-testid="meanwhile-city">🏙 {t('city', lang)}: <b>{snap.city.name[lang]}</b> · {popText(snap.city.pop, lang)} {t('people', lang)}</p>}
            <p className={`mt-2 text-[10px] text-slate-500 ${fa(lang)}`}>{t('note', lang)}</p>
          </section>
        </div>
      )}
    </>
  );
};

const Row: React.FC<{ name: string; size: number | null; max: number; lang: Lang; iran?: boolean }> = ({ name, size, max, lang, iran }) => (
  <div>
    <div className={`flex justify-between gap-2 text-xs ${fa(lang)} ${iran ? 'text-amber-200 font-semibold' : 'text-slate-200'}`}>
      <span className="min-w-0 truncate">{iran ? '✦ ' : ''}{name}</span>
      <span className="tabular-nums shrink-0">{size == null ? <span className="text-slate-500">{t('noSize', lang)}</span> : sizeText(size, lang)}</span>
    </div>
    <div className="mt-1 h-2 rounded-full bg-white/10 overflow-hidden" aria-hidden>
      <div className={`h-full rounded-full ${iran ? 'bg-amber-400' : 'bg-sky-400/80'}`} style={{ width: `${size == null ? 0 : Math.max(2, (size / max) * 100)}%` }} />
    </div>
  </div>
);

export default MeanwhileLayer;
