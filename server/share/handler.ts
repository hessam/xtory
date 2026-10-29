/**
 * Link unfurls for chat apps. GET /f/:factId and /u/:nickname are rewritten here (vercel.json); the page carries
 * OG/Twitter tags for Telegram/WhatsApp/X crawlers and sends people on to the app. The OG image is the static brand
 * image: Satori cannot be trusted with Persian shaping, so the fully shaped Persian image card is made in the browser
 * (src/share/card.ts) and shared as a file. Text is chosen by ?lang=, defaulting to Accept-Language.
 */
import { isVisible } from '../../src/facts/model.js';
import type { Fact } from '../../src/facts/model.js';
import type { Deps } from '../ai/handler.js';
import type { RichStore } from '../ai/store.js';
import { staticFactMap } from '../facts/static.js';
import { FactStore } from '../facts/store.js';
import { checkNickname } from '../profile/nickname.js';

const esc = (s: string) => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
const clip = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1) + '…' : s);
const ORIGIN = 'https://xtory.sbs';
const IMAGE = `${ORIGIN}/og-preview.png`;

function page(o: { lang: 'en' | 'fa'; title: string; desc: string; canonical: string; go: string }) {
  const dir = o.lang === 'fa' ? 'rtl' : 'ltr';
  return `<!doctype html><html lang="${o.lang}" dir="${dir}"><head><meta charset="utf-8"><title>${esc(o.title)}</title>
<meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex">
<link rel="canonical" href="${esc(o.canonical)}">
<meta property="og:type" content="article"><meta property="og:site_name" content="Xtory"><meta property="og:url" content="${esc(o.canonical)}">
<meta property="og:title" content="${esc(o.title)}"><meta property="og:description" content="${esc(o.desc)}"><meta property="og:image" content="${IMAGE}">
<meta name="twitter:card" content="summary_large_image"><meta name="twitter:title" content="${esc(o.title)}"><meta name="twitter:description" content="${esc(o.desc)}"><meta name="twitter:image" content="${IMAGE}">
<meta http-equiv="refresh" content="0;url=${esc(o.go)}"></head>
<body style="font-family:system-ui,sans-serif;background:#0b1220;color:#fef3c7;padding:24px"><h1>${esc(o.title)}</h1><p>${esc(o.desc)}</p><p><a style="color:#fbbf24" href="${esc(o.go)}">Xtory</a></p>
<script>location.replace(${JSON.stringify(o.go)})</script></body></html>`;
}
const html = (status: number, body: string) => new Response(body, { status, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': status === 200 ? 'public, max-age=300, s-maxage=3600' : 'no-store' } });

/** The app is dark-flagged for now, so the redirect switches the features on for the visitor. */
const FF = 'board,discovery,leaderboard,share';

export async function handleUnfurl(req: Request, deps: Deps): Promise<Response> {
  const url = new URL(req.url);
  const lang: 'en' | 'fa' = url.searchParams.get('lang') === 'en' ? 'en' : url.searchParams.get('lang') === 'fa' ? 'fa' : /^fa\b/i.test(req.headers.get('accept-language') ?? '') ? 'fa' : 'en';
  const fid = url.searchParams.get('fact'), nick = url.searchParams.get('nick');

  if (fid) {
    if (!/^[ac]_[a-z0-9_]{6,80}$/.test(fid)) return html(404, 'not found');
    let f: Fact | null | undefined = staticFactMap().get(fid);
    if (!f && deps.store && (deps.config.hashSalt || deps.config.upstash)) f = await new FactStore(deps.store as RichStore).get(fid).catch(() => null);
    if (!f || !isVisible(f)) return html(404, 'not found');
    const badge = f.kind === 'ai' && f.status !== 'verified' ? (lang === 'fa' ? ' ✦ هوش مصنوعی · بررسی‌شده' : ' ✦ AI · checked') : '';
    return html(200, page({ lang, title: clip(f.hook[lang] || f.hook.en, 90), desc: clip((f.claim[lang] || f.claim.en) + badge, 200), canonical: `${ORIGIN}/f/${fid}`, go: `/?ff=${FF}&fact=${encodeURIComponent(fid)}` }));
  }
  if (nick) {
    const c = checkNickname(nick); if (!c.ok) return html(404, 'not found');
    const store = deps.store as RichStore;
    const pid = await store.get(`nk:${c.key}`).catch(() => null), raw = pid ? await store.get(`pr:${pid}`).catch(() => null) : null;
    const p = raw ? JSON.parse(raw) as { nickname?: string; points: number; count: number } : null;
    if (!p?.nickname) return html(404, 'not found');
    const en = `${p.count} hidden facts found · ${p.points} points`, faT = `${p.count} واقعیت پنهان پیدا کرد · ${p.points} امتیاز`;
    return html(200, page({ lang, title: lang === 'fa' ? `${p.nickname} در Xtory` : `${p.nickname} on Xtory`, desc: lang === 'fa' ? faT : en, canonical: `${ORIGIN}/u/${encodeURIComponent(p.nickname)}`, go: `/?ff=${FF}#/u/${encodeURIComponent(p.nickname)}` }));
  }
  return html(404, 'not found');
}
