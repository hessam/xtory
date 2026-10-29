import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BookOpen, ChevronLeft, ChevronRight, Hand, Lock, Star, X } from 'lucide-react';
import { chapters, challengesFor, hashFor, parseHash, type Beat, type Chapter, type Step } from './data';
import { isUnlocked, recordStars, starsFor, useStars } from './progress';
import { clearStage, setScene, useStage } from './stage';
import { setLens } from '../lib/lensStore';
import { isFlagOn } from '../lib/flags';
import { formatYear, toPersianDigits } from '../utils/format';
import { geometry } from '../board/model';

type Lang = 'en' | 'fa';
const T = {
  btn: { en: 'Journey', fa: 'سفر تاریخی' },
  path: { en: 'Journey through Iran', fa: 'سفر در تاریخ ایران' },
  locked: { en: 'Finish the chapter before this one', fa: 'ابتدا فصل قبلی را تمام کنید' },
  next: { en: 'Next', fa: 'بعدی' },
  back: { en: 'Back', fa: 'قبلی' },
  atlas: { en: 'Atlas', fa: 'اطلس' },
  tapMap: { en: 'Tap the map', fa: 'روی نقشه بزنید' },
  yes: { en: 'Yes — that\'s it!', fa: 'آفرین، درست است!' },
  no: { en: 'Not quite. Try another region.', fa: 'نه دقیقاً. منطقه دیگری را امتحان کنید.' },
  showMe: { en: 'Show me', fa: 'نشانم بده' },
  challenge: { en: 'Map challenge', fa: 'چالش نقشه' },
  ruledBy: { en: 'Tap a region ruled by', fa: 'روی منطقه‌ای بزنید که زیر فرمان این قلمرو بود:' },
  inYear: { en: 'in', fa: 'در' },
  revealed: { en: 'The lit regions are where they ruled.', fa: 'مناطق روشن قلمرو آنان است.' },
  toChallenge: { en: 'Map challenge', fa: 'چالش نقشه' },
  score: { en: 'First-try answers:', fa: 'پاسخ درست در نخستین تلاش:' },
  again: { en: 'Replay', fa: 'دوباره' },
  nextChapter: { en: 'Next chapter', fa: 'فصل بعد' },
  allDone: { en: 'End of the journey for now.', fa: 'فعلاً پایان سفر.' },
  close: { en: 'Close', fa: 'بستن' },
  draft: { en: 'AI-drafted, not yet reviewed by a historian.', fa: 'تهیه‌شده با هوش مصنوعی، هنوز بازبینی‌نشده توسط مورخ.' },
} as const;
const t = (k: keyof typeof T, l: Lang) => T[k][l];
const fa = (l: Lang) => (l === 'fa' ? 'font-vazirmatn' : '');
const num = (n: number, l: Lang) => (l === 'fa' ? toPersianDigits(n) : String(n));
const regionName = (id: string, l: Lang) => (geometry.regions[id] as { name?: { en: string; fa: string } } | undefined)?.name?.[l] ?? id;
const reduced = () => typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/**
 * Journey: the board is the stage. Each beat sweeps the timeline to its year, spotlights a realm, pins places and frames
 * the camera; some beats and the chapter's challenge are answered by tapping the map. The caption is a slim subtitle bar
 * so the map stays the main thing on screen. Route lives in the hash (#/journey/<eraId>/<beat|challenge>).
 */
export const JourneyLayer: React.FC<{ lang: Lang; year: number; setYear: (y: number) => void; onActive?: (active: boolean) => void }> = ({ lang, year, setYear, onActive }) => {
  const [route, setRoute] = useState(() => parseHash(window.location.hash));
  const [pathOpen, setPathOpen] = useState(false);
  useEffect(() => {
    const read = () => setRoute(parseHash(window.location.hash));
    window.addEventListener('hashchange', read);
    return () => window.removeEventListener('hashchange', read);
  }, []);
  const stars = useStars();
  const dir = lang === 'fa' ? 'rtl' : 'ltr';

  // timeline sweep: the year runs to the beat's year so the realms visibly change on the way
  const yearRef = useRef(year); yearRef.current = year;
  const timer = useRef<ReturnType<typeof setInterval>>();
  const sweepTo = useCallback((to: number) => {
    clearInterval(timer.current);
    const from = yearRef.current;
    if (reduced() || from === to) { setYear(to); return; }
    const steps = Math.min(30, Math.max(8, Math.round(Math.abs(to - from) / 10)));
    let i = 0;
    timer.current = setInterval(() => {
      i++; const k = i / steps, e = 1 - Math.pow(1 - k, 3);
      setYear(Math.round(from + (to - from) * e));
      if (i >= steps) clearInterval(timer.current);
    }, 45);
  }, [setYear]);
  useEffect(() => () => clearInterval(timer.current), []);

  const go = (eraId: string, step: Step) => { setPathOpen(false); window.location.hash = hashFor(eraId, step); };
  const leave = () => { setPathOpen(false); window.location.hash = ''; setRoute(null); clearStage(); setLens(null); };
  useEffect(() => { if (!route) { clearStage(); setLens(null); } }, [route]);
  const playing = !!route;
  useEffect(() => { onActive?.(playing); }, [playing]); // eslint-disable-line react-hooks/exhaustive-deps

  const top = 12 + (isFlagOn('discovery') ? 56 : 0) + (isFlagOn('meanwhile') ? 48 : 0);

  return (
    <>
      {!route && (
        <button type="button" onClick={() => setPathOpen(o => !o)} data-testid="journey-btn" style={{ top }}
                className={`absolute z-[1000] pointer-events-auto start-3 liquid-glass-heavy border border-emerald-300/40 rounded-2xl px-3 min-h-[44px] flex items-center gap-1.5 text-xs text-slate-100 shadow-xl active:scale-95 calm-transition ${fa(lang)}`} dir={dir}>
          <BookOpen className="w-4 h-4 text-emerald-300" aria-hidden />{t('btn', lang)}
        </button>
      )}
      {!route && pathOpen && (
        <div className="absolute z-[1002] start-3 end-3 max-sm:end-14 flex justify-center pointer-events-none" style={{ top: top + 52 }} dir={dir}>
          <section data-testid="journey-panel" className="pointer-events-auto w-full max-w-md max-h-[60vh] max-sm:max-h-[46vh] overflow-y-auto liquid-glass-heavy border border-emerald-300/30 rounded-3xl p-4 shadow-2xl">
            <div className="flex items-start gap-2">
              <h2 className={`flex-1 text-base font-bold text-emerald-200 ${fa(lang)}`}>{t('path', lang)}</h2>
              <button type="button" onClick={() => setPathOpen(false)} aria-label={t('close', lang)} data-testid="journey-close" className="w-9 h-9 -m-1 flex items-center justify-center rounded-xl text-slate-400 hover:text-white hover:bg-white/10"><X className="w-4 h-4" /></button>
            </div>
            <Path lang={lang} stars={stars} onStart={eraId => go(eraId, { kind: 'beat', index: 0 })} />
          </section>
        </div>
      )}
      {route && (
        // the subtitle bar sits on the bottom edge of the map (the camera frames each scene above it); bottom-start on desktop
        // phones: the bottom sheet's peek (≈60px) overlaps the lower edge of the map container, so sit above it
        <div className="absolute z-[1002] bottom-3 max-sm:bottom-[68px] start-3 end-3 sm:end-auto sm:w-[26rem] pointer-events-none" dir={dir}>
          <section data-testid="journey-caption" className="pointer-events-auto w-full liquid-glass-heavy border border-emerald-300/30 rounded-2xl px-3.5 py-3 shadow-2xl">
            <div className="flex items-center gap-2">
              <span className={`text-[11px] font-semibold text-emerald-300 truncate ${fa(lang)}`} data-testid="journey-chapter-title">{num(route.chapter.index + 1, lang)} · {route.chapter.title[lang]}</span>
              <span className="flex-1" />
              <button type="button" onClick={leave} aria-label={t('close', lang)} data-testid="journey-close" className={`min-h-[32px] px-2 rounded-lg text-[11px] text-slate-400 hover:text-white flex items-center gap-1 ${fa(lang)}`}>{t('atlas', lang)}<X className="w-3.5 h-3.5" /></button>
            </div>
            {route.step.kind === 'beat'
              ? <BeatView key={`${route.chapter.eraId}-${route.step.index}`} lang={lang} chapter={route.chapter} index={route.step.index} go={go} sweepTo={sweepTo} />
              : <ChallengeView key={route.chapter.eraId} lang={lang} chapter={route.chapter} go={go} sweepTo={sweepTo} leave={leave} />}
          </section>
        </div>
      )}
    </>
  );
};

const Path: React.FC<{ lang: Lang; stars: Record<string, number>; onStart: (eraId: string) => void }> = ({ lang, stars, onStart }) => (
  <ol className="mt-2 space-y-1.5" data-testid="journey-path">
    {chapters.map((c, i) => {
      const unlocked = isUnlocked(i, stars), got = stars[c.eraId] ?? 0;
      return (
        <li key={c.eraId}>
          <button type="button" disabled={!unlocked} onClick={() => onStart(c.eraId)} data-testid={`journey-chapter-${c.eraId}`} aria-label={unlocked ? c.name[lang] : t('locked', lang)}
                  className={`w-full min-h-[48px] flex items-center gap-2 rounded-xl px-3 py-2 text-start ${unlocked ? 'liquid-glass border border-white/15 active:scale-[0.99]' : 'opacity-50 border border-white/5'}`}>
            <span className={`w-7 h-7 shrink-0 rounded-full text-xs flex items-center justify-center font-bold ${got ? 'bg-emerald-400 text-slate-900' : 'bg-white/10 text-slate-300'}`}>{num(i + 1, lang)}</span>
            <span className={`flex-1 min-w-0 ${fa(lang)}`}>
              <span className="block text-sm text-slate-100 truncate">{c.name[lang]}</span>
              <span className="block text-[10px] text-slate-400 tabular-nums">{formatYear(c.yearRange.start, lang)} – {formatYear(c.yearRange.end, lang)}</span>
            </span>
            {unlocked
              ? <span className="flex gap-0.5 shrink-0" aria-label={`${got}/3`}>{[1, 2, 3].map(s => <Star key={s} className={`w-3.5 h-3.5 ${s <= got ? 'fill-amber-300 text-amber-300' : 'text-slate-600'}`} />)}</span>
              : <Lock className="w-4 h-4 text-slate-500 shrink-0" aria-hidden />}
          </button>
        </li>
      );
    })}
  </ol>
);

/** apply a beat to the board */
function stageBeat(b: Beat, sweepTo: (y: number) => void) {
  sweepTo(b.year);
  setLens(b.lens ?? null);
  setScene({ year: b.year, lens: b.lens ?? null, pins: b.pins ?? [], focus: b.focus ?? [], expect: b.ask?.regions ?? null });
}

const BeatView: React.FC<{ lang: Lang; chapter: Chapter; index: number; go: (eraId: string, s: Step) => void; sweepTo: (y: number) => void }> = ({ lang, chapter, index, go, sweepTo }) => {
  const beat = chapter.beats[index], last = index === chapter.beats.length - 1;
  const stage = useStage();
  const [wrong, setWrong] = useState(0);
  const [solved, setSolved] = useState(!beat.ask);
  useEffect(() => { stageBeat(beat, sweepTo); }, [beat, sweepTo]);
  useEffect(() => {
    const fb = stage.feedback; if (!fb || !beat.ask) return;
    if (fb.ok) { setSolved(true); setScene({ year: beat.year, lens: beat.lens ?? null, pins: beat.pins ?? [], focus: beat.ask.regions, expect: null }, true); }
    else setWrong(w => w + 1);
  }, [stage.feedback?.at]); // eslint-disable-line react-hooks/exhaustive-deps
  const showMe = () => { setSolved(true); setScene({ year: beat.year, lens: beat.lens ?? null, pins: beat.pins ?? [], focus: beat.ask!.regions, expect: null }); };
  const Back = lang === 'fa' ? ChevronRight : ChevronLeft, Next = lang === 'fa' ? ChevronLeft : ChevronRight;

  return (
    <div data-testid="journey-beat">
      <div className="mt-1.5 flex gap-1" aria-label={`${index + 1} / ${chapter.beats.length}`}>
        {chapter.beats.map((_, i) => <span key={i} className={`h-1 flex-1 rounded-full ${i <= index ? 'bg-emerald-400' : 'bg-white/10'}`} />)}
      </div>
      <p className={`mt-2 text-sm sm:text-[15px] leading-relaxed text-slate-100 ${fa(lang)}`} data-testid="journey-text">
        <span className="text-emerald-300 font-semibold tabular-nums me-1.5">{formatYear(beat.year, lang)}</span>{beat.text[lang]}
      </p>
      {beat.ask && (
        <p className={`mt-2 text-xs rounded-lg px-2.5 py-1.5 flex items-center gap-1.5 ${solved ? 'bg-emerald-400/15 text-emerald-200' : wrong ? 'bg-rose-400/15 text-rose-200' : 'bg-amber-400/15 text-amber-100'} ${fa(lang)}`} data-testid="journey-ask" role="status">
          <Hand className="w-3.5 h-3.5 shrink-0" aria-hidden />
          {solved ? `${t('yes', lang)} ${beat.ask.regions.map(r => regionName(r, lang)).join(' · ')}` : wrong ? t('no', lang) : `${t('tapMap', lang)}: ${beat.ask.prompt[lang]}`}
          {!solved && wrong >= 2 && <button type="button" onClick={showMe} className="ms-auto underline" data-testid="journey-showme">{t('showMe', lang)}</button>}
        </p>
      )}
      <div className="mt-2.5 flex items-center gap-2">
        <button type="button" disabled={index === 0} onClick={() => go(chapter.eraId, { kind: 'beat', index: index - 1 })}
                className={`min-h-[40px] px-2.5 rounded-xl text-xs liquid-glass border border-white/15 text-slate-200 flex items-center gap-1 disabled:opacity-40 ${fa(lang)}`}>
          <Back className="w-3.5 h-3.5" />{t('back', lang)}
        </button>
        <span className="flex-1" />
        <button type="button" data-testid="journey-next" disabled={!solved} onClick={() => go(chapter.eraId, last ? { kind: 'challenge' } : { kind: 'beat', index: index + 1 })}
                className={`min-h-[40px] px-4 rounded-xl text-xs font-semibold bg-emerald-400 text-slate-900 flex items-center gap-1 disabled:opacity-40 ${fa(lang)}`}>
          {last ? t('toChallenge', lang) : t('next', lang)}<Next className="w-3.5 h-3.5" />
        </button>
      </div>
      {index === 0 && <p className={`mt-1.5 text-[10px] text-slate-500 ${fa(lang)}`}>✦ {t('draft', lang)}<span className="max-sm:hidden"> · {chapter.sources[0]}</span></p>}
    </div>
  );
};

const ChallengeView: React.FC<{ lang: Lang; chapter: Chapter; go: (eraId: string, s: Step) => void; sweepTo: (y: number) => void; leave: () => void }> = ({ lang, chapter, go, sweepTo, leave }) => {
  const qs = useMemo(() => challengesFor(chapter), [chapter]);
  const [i, setI] = useState(0);
  const [firstTry, setFirstTry] = useState<boolean[]>([]);
  const [state, setState] = useState<'ask' | 'right' | 'wrong'>('ask');
  const stage = useStage();
  const q = qs[i], done = i >= qs.length;
  const correct = firstTry.filter(Boolean).length;
  const next = chapters[chapter.index + 1];

  useEffect(() => {
    if (!q) return;
    sweepTo(q.year); setLens(null); setState('ask');
    setScene({ year: q.year, lens: null, pins: [], focus: [], expect: q.regions });
  }, [i]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const fb = stage.feedback; if (!fb || !q || state !== 'ask') return;
    setFirstTry(f => [...f, fb.ok]);
    setState(fb.ok ? 'right' : 'wrong');
    setLens(q.dynastyId);   // either way, light up where they really ruled
    setScene({ year: q.year, lens: q.dynastyId, pins: [], focus: q.regions, expect: null }, true);
  }, [stage.feedback?.at]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (done) recordStars(chapter.eraId, starsFor(correct)); }, [done]); // eslint-disable-line react-hooks/exhaustive-deps

  if (done) return (
    <div data-testid="journey-result">
      <p className={`mt-2 text-sm text-slate-200 ${fa(lang)}`}>{t('score', lang)} <b className="text-amber-200">{num(correct, lang)}</b> / {num(qs.length, lang)}</p>
      <div className="mt-1 flex gap-1">{[1, 2, 3].map(s => <Star key={s} className={`w-6 h-6 ${s <= starsFor(correct) ? 'fill-amber-300 text-amber-300' : 'text-slate-600'}`} />)}</div>
      <div className="mt-2.5 flex flex-wrap gap-2">
        <button type="button" onClick={() => go(chapter.eraId, { kind: 'beat', index: 0 })} className={`min-h-[40px] px-3 rounded-xl text-xs liquid-glass border border-white/15 text-slate-200 ${fa(lang)}`}>{t('again', lang)}</button>
        {next
          ? <button type="button" onClick={() => go(next.eraId, { kind: 'beat', index: 0 })} data-testid="journey-next-chapter" className={`min-h-[40px] px-4 rounded-xl text-xs font-semibold bg-emerald-400 text-slate-900 ${fa(lang)}`}>{t('nextChapter', lang)}: {next.title[lang]}</button>
          : <button type="button" onClick={leave} className={`min-h-[40px] px-3 rounded-xl text-xs text-slate-300 ${fa(lang)}`}>{t('allDone', lang)}</button>}
      </div>
    </div>
  );

  return (
    <div data-testid="journey-challenge">
      <p className={`mt-1.5 text-[11px] text-amber-300 ${fa(lang)}`}>{t('challenge', lang)} · {num(i + 1, lang)} / {num(qs.length, lang)}</p>
      <p className={`mt-1 text-sm sm:text-[15px] text-slate-100 leading-relaxed ${fa(lang)}`} data-testid="journey-question">
        <Hand className="inline w-4 h-4 me-1 text-amber-300" aria-hidden />{t('ruledBy', lang)} <b>{q.name[lang]}</b> {t('inYear', lang)} {formatYear(q.year, lang)}
      </p>
      {state !== 'ask' && (
        <p className={`mt-1.5 text-xs ${state === 'right' ? 'text-emerald-200' : 'text-rose-200'} ${fa(lang)}`} data-testid="journey-verdict" role="status">
          {state === 'right' ? t('yes', lang) : t('revealed', lang)}
        </p>
      )}
      <div className="mt-2 flex justify-end">
        <button type="button" data-testid="journey-next" disabled={state === 'ask'} onClick={() => setI(n => n + 1)}
                className={`min-h-[40px] px-4 rounded-xl text-xs font-semibold bg-emerald-400 text-slate-900 disabled:opacity-40 ${fa(lang)}`}>{t('next', lang)}</button>
      </div>
    </div>
  );
};
