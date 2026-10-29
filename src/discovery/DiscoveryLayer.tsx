import React, { useEffect, useMemo, useState } from 'react';
import { Sparkles, X, Share2, Flag, Search, Check } from 'lucide-react';
import { staticFacts, factById } from '../data/facts';
import { badgeOf, type Fact } from '../facts/model';
import { nextFact, pickSparkles } from './pick';
import { markFound, openFact, progress, setSparkles, useDiscovery } from './store';
import { getDeviceId } from '../services/aiTransport';
import { toPersianDigits } from '../utils/format';
import { isFlagOn } from '../lib/flags';
import { ProfileButton, ProfileSheet } from '../profile/ProfilePanel';

interface Props { year: number; lang: 'en' | 'fa'; /** shared server AI is on → "Dig deeper" can run */ serverAi: boolean }
const fa = (lang: string) => (lang === 'fa' ? 'font-vazirmatn' : '');
const num = (n: number, lang: 'en' | 'fa') => (lang === 'fa' ? toPersianDigits(n) : String(n));
const T = {
  discover: { en: 'Discover', fa: 'کشف کن' },
  found: { en: 'found', fa: 'یافته' },
  dig: { en: 'Dig deeper', fa: 'کندوکاو بیشتر' },
  digging: { en: 'Digging…', fa: 'در حال کندوکاو…' },
  share: { en: 'Share', fa: 'اشتراک' },
  copied: { en: 'Copied', fa: 'کپی شد' },
  report: { en: 'Report', fa: 'گزارش' },
  reported: { en: 'Thanks — reported', fa: 'سپاس، گزارش شد' },
  aiChecked: { en: 'AI · checked, not yet reviewed', fa: 'هوش مصنوعی · بررسی‌شده، هنوز بازبینی انسانی نشده' },
  nothing: { en: 'No more hidden facts nearby — try another era', fa: 'واقعیت پنهان دیگری نزدیک نیست — دوره‌ای دیگر را امتحان کنید' },
  none: { en: 'Nothing new found this time.', fa: 'این بار چیز تازه‌ای پیدا نشد.' },
  failed: { en: 'Could not dig right now. Try again later.', fa: 'اکنون امکان کندوکاو نیست. بعداً دوباره تلاش کنید.' },
  all: { en: 'You found every hidden fact. Impressive!', fa: 'همه واقعیت‌های پنهان را پیدا کردید. عالی!' },
} as const;
const t = (k: keyof typeof T, lang: 'en' | 'fa') => T[k][lang];

const KIND: Record<string, string> = { ruler: 'ruler', person: 'figure', dynasty: 'dynasty', region: 'region' };

/** Hidden-fact discovery: a progress pill + "Discover" button, and the fact card. Never modal — the map stays usable. */
export const DiscoveryLayer: React.FC<Props> = ({ year, lang, serverAi }) => {
  const { found, sparkles, openId } = useDiscovery();
  const all = useMemo(() => staticFacts(), []);
  const prog = useMemo(() => progress(all, found), [all, found]);

  // keep the map's hidden sparkles in step with the timeline and the inventory
  useEffect(() => { setSparkles(pickSparkles(all, found, year)); }, [all, found, year]);
  useEffect(() => () => setSparkles([]), []);

  const [extra, setExtra] = useState<Fact[]>([]);   // facts returned by "Dig deeper" for the open card
  const [digState, setDigState] = useState<'idle' | 'busy' | 'none' | 'failed'>('idle');
  const [note, setNote] = useState<'' | 'copied' | 'reported'>('');
  const [empty, setEmpty] = useState(false);
  const boardOn = useMemo(() => isFlagOn('leaderboard'), []);
  const [profileOpen, setProfileOpen] = useState(false);
  useEffect(() => { setExtra([]); setDigState('idle'); setNote(''); }, [openId]);
  useEffect(() => { setEmpty(false); }, [year]);

  const open = openId ? (factById(openId) ?? null) : null;
  const dir = lang === 'fa' ? 'rtl' : 'ltr';

  const discover = () => {
    const n = nextFact(all, found, year);
    if (n) openFact(n.id); else setEmpty(true);
  };

  const dig = async () => {
    if (!open) return;
    setDigState('busy');
    try {
      const res = await fetch('/api/facts/dig', {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'x-xtory-device': getDeviceId() },
        body: JSON.stringify({ kind: KIND[open.entityType] ?? 'event', name: open.entityName.en, ...(open.year != null ? { year: open.year } : {}) }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok || !body?.ok) throw new Error('dig_failed');
      const fresh = (body.facts as Fact[]).filter(f => f.id !== open.id);
      fresh.forEach(f => markFound(f.id)); // dug facts live on the server; only their ids are kept on the device
      setExtra(fresh);
      setDigState(fresh.length ? 'idle' : 'none');
    } catch { setDigState('failed'); }
  };

  const share = async (f: Fact) => {
    const text = `${f.hook[lang]} — Xtory`;
    const url = typeof location !== 'undefined' ? location.origin : '';
    try {
      if (navigator.share) { await navigator.share({ text, url }); return; }
      await navigator.clipboard.writeText(`${text} ${url}`);
      setNote('copied');
    } catch { /* user dismissed the share sheet */ }
  };

  const report = async (f: Fact) => {
    try {
      await fetch('/api/facts/report', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-xtory-device': getDeviceId() }, body: JSON.stringify({ factId: f.id, reason: 'wrong' }) });
    } catch { /* offline: nothing to do */ }
    setNote('reported');
  };

  return (
    <>
      <div className="absolute left-3 top-3 z-[1000] pointer-events-auto flex items-start gap-2" dir="ltr" data-testid="discovery-hud">
        <div dir={dir}>
        <button type="button" onClick={discover} data-testid="discover-btn"
                className="liquid-glass-heavy border border-amber-300/40 rounded-2xl ps-2.5 pe-3 py-1.5 flex items-center gap-2 shadow-xl active:scale-95 calm-transition min-h-[44px]">
          <Sparkles className="w-4 h-4 text-amber-300" aria-hidden />
          <span className={`text-xs text-slate-100 leading-tight text-start ${fa(lang)}`}>
            <span className="block font-semibold">{t('discover', lang)}</span>
            <span className="block text-[10px] text-slate-400 tabular-nums" data-testid="discover-progress">{num(prog.found, lang)} / {num(prog.total, lang)} {t('found', lang)}</span>
          </span>
          <span className="w-7 h-7 shrink-0" aria-hidden>
            <svg viewBox="0 0 36 36" className="w-full h-full -rotate-90"><circle cx="18" cy="18" r="14" fill="none" stroke="#334155" strokeWidth="4" /><circle cx="18" cy="18" r="14" fill="none" stroke="#fbbf24" strokeWidth="4" strokeLinecap="round" strokeDasharray={`${prog.ratio * 88} 88`} /></svg>
          </span>
        </button>
        {empty && <p className={`mt-1.5 max-w-[14rem] text-[11px] text-slate-300 liquid-glass rounded-xl px-2.5 py-1.5 ${fa(lang)}`} role="status">{prog.found >= prog.total ? t('all', lang) : t('nothing', lang)}</p>}
        </div>
        {boardOn && <ProfileButton lang={lang} onClick={() => setProfileOpen(o => !o)} />}
      </div>

      {boardOn && <ProfileSheet lang={lang} open={profileOpen} onClose={() => setProfileOpen(false)} />}

      {open && (
        // phones: the bottom sheet covers the lower map, so the card hangs from the top (clear of the right-hand controls)
        <div className="absolute z-[1001] pointer-events-none flex justify-center start-3 end-3 sm:bottom-3 max-sm:top-[64px] max-sm:end-14 max-sm:bottom-auto" dir={dir}>
          <article data-testid="fact-card" aria-live="polite"
                   className="pointer-events-auto w-full max-w-md max-h-[55vh] max-sm:max-h-[48vh] overflow-y-auto liquid-glass-heavy border border-amber-300/30 rounded-3xl p-4 shadow-2xl">
            <div className="flex items-start gap-2">
              <p className={`flex-1 text-xl max-sm:text-lg font-bold text-amber-200 leading-snug ${fa(lang)}`} data-testid="fact-hook">{open.hook[lang]}</p>
              <button type="button" onClick={() => openFact(null)} aria-label={lang === 'fa' ? 'بستن' : 'Close'} data-testid="fact-close"
                      className="shrink-0 w-9 h-9 -m-1 flex items-center justify-center rounded-xl text-slate-400 hover:text-white hover:bg-white/10"><X className="w-4 h-4" /></button>
            </div>
            <p className={`mt-2 text-sm text-slate-200 leading-relaxed ${fa(lang)}`}>{open.claim[lang]}</p>
            {open.context?.[lang] && <p className={`mt-1.5 text-xs text-slate-400 leading-relaxed ${fa(lang)}`}>{open.context[lang]}</p>}
            <p className={`mt-2 text-[10px] text-slate-500 ${fa(lang)}`}>📚 {open.sources.join(' · ')}</p>
            {badgeOf(open) === 'ai_checked' && <p className={`mt-1 text-[10px] text-amber-400/90 ${fa(lang)}`} data-testid="fact-badge">✦ {t('aiChecked', lang)}</p>}

            {extra.map(f => (
              <div key={f.id} className="mt-3 pt-3 border-t border-white/10" data-testid="dug-fact">
                <p className={`text-sm font-semibold text-amber-200 ${fa(lang)}`}>{f.hook[lang]}</p>
                <p className={`mt-1 text-xs text-slate-300 leading-relaxed ${fa(lang)}`}>{f.claim[lang]}</p>
                <p className={`mt-1 text-[10px] text-amber-400/90 ${fa(lang)}`}>✦ {t('aiChecked', lang)}</p>
              </div>
            ))}
            {digState === 'none' && <p className={`mt-2 text-xs text-slate-400 ${fa(lang)}`}>{t('none', lang)}</p>}
            {digState === 'failed' && <p className={`mt-2 text-xs text-rose-300 ${fa(lang)}`}>{t('failed', lang)}</p>}

            <div className="mt-3 flex flex-wrap gap-2">
              {serverAi && (
                <button type="button" onClick={dig} disabled={digState === 'busy'} data-testid="fact-dig"
                        className={`min-h-[44px] px-3 rounded-xl text-xs font-semibold bg-amber-400 text-slate-900 flex items-center gap-1.5 active:scale-95 disabled:opacity-60 ${fa(lang)}`}>
                  <Search className="w-3.5 h-3.5" />{digState === 'busy' ? t('digging', lang) : t('dig', lang)}
                </button>
              )}
              <button type="button" onClick={() => share(open)} data-testid="fact-share"
                      className={`min-h-[44px] px-3 rounded-xl text-xs liquid-glass border border-white/15 text-slate-100 flex items-center gap-1.5 active:scale-95 ${fa(lang)}`}>
                {note === 'copied' ? <Check className="w-3.5 h-3.5" /> : <Share2 className="w-3.5 h-3.5" />}{note === 'copied' ? t('copied', lang) : t('share', lang)}
              </button>
              <button type="button" onClick={() => report(open)} disabled={note === 'reported'} data-testid="fact-report"
                      className={`min-h-[44px] px-3 rounded-xl text-xs text-slate-400 hover:text-white flex items-center gap-1.5 active:scale-95 ${fa(lang)}`}>
                <Flag className="w-3.5 h-3.5" />{note === 'reported' ? t('reported', lang) : t('report', lang)}
              </button>
            </div>
          </article>
        </div>
      )}
    </>
  );
};
