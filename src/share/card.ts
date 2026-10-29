/**
 * Share cards drawn on a canvas in the browser, so Persian shaping/joining is the browser's own (a server-side renderer
 * cannot be trusted with it). Lazy-loaded by the share buttons only. Portrait 1080×1350 with a 96px safe area, so
 * Telegram / WhatsApp / X crops never cut text. Only a chosen nickname may appear: never anything personal.
 */
export type Lang = 'en' | 'fa';
export interface CardSpec {
  lang: Lang;
  eyebrow: string;            // small caps line, e.g. "HIDDEN FACT · 651"
  title: string;              // the hook (big)
  body?: string;              // the claim (smaller)
  stats?: { value: string; label: string }[];  // collection / rank cards
  footer: string;             // e.g. "xtory.sbs"
}
export const CARD_W = 1080, CARD_H = 1350, SAFE = 96;

/** Greedy word wrap against any measuring function (unit-testable without a canvas). */
export function wrapLines(measure: (s: string) => number, text: string, maxWidth: number, maxLines = 99): string[] {
  const words = text.replace(/\s+/g, ' ').trim().split(' ').filter(Boolean);
  const lines: string[] = []; let cur = '';
  for (const w of words) {
    const next = cur ? `${cur} ${w}` : w;
    if (measure(next) <= maxWidth || !cur) cur = next; else { lines.push(cur); cur = w; }
  }
  if (cur) lines.push(cur);
  if (lines.length > maxLines) { const kept = lines.slice(0, maxLines); kept[maxLines - 1] = kept[maxLines - 1].replace(/[\s.,،;:!?]*$/, '') + '…'; return kept; }
  return lines;
}

const FONT = (lang: Lang) => (lang === 'fa' ? 'Vazirmatn' : 'Inter, Vazirmatn');

async function ensureFonts(spec: CardSpec) {
  try {
    const f = (document as Document & { fonts?: FontFaceSet }).fonts; if (!f) return;
    const sample = [spec.eyebrow, spec.title, spec.body ?? '', spec.footer].join(' ');
    await Promise.all([f.load('700 64px Vazirmatn', sample), f.load('400 36px Vazirmatn', sample), f.load('700 64px Inter', sample)]);
  } catch { /* system fonts will do */ }
}

export async function renderCard(spec: CardSpec): Promise<Blob> {
  await ensureFonts(spec);
  const canvas = document.createElement('canvas'); canvas.width = CARD_W; canvas.height = CARD_H;
  const ctx = canvas.getContext('2d'); if (!ctx) throw new Error('no_canvas');
  const rtl = spec.lang === 'fa', fam = FONT(spec.lang), inner = CARD_W - SAFE * 2;
  ctx.direction = rtl ? 'rtl' : 'ltr'; ctx.textAlign = rtl ? 'right' : 'left'; ctx.textBaseline = 'alphabetic';
  const x = rtl ? CARD_W - SAFE : SAFE;

  const bg = ctx.createLinearGradient(0, 0, CARD_W, CARD_H);
  bg.addColorStop(0, '#0b1220'); bg.addColorStop(1, '#1b1530');
  ctx.fillStyle = bg; ctx.fillRect(0, 0, CARD_W, CARD_H);
  const glow = ctx.createRadialGradient(CARD_W * 0.8, CARD_H * 0.15, 20, CARD_W * 0.8, CARD_H * 0.15, 700);
  glow.addColorStop(0, 'rgba(251,191,36,0.22)'); glow.addColorStop(1, 'rgba(251,191,36,0)');
  ctx.fillStyle = glow; ctx.fillRect(0, 0, CARD_W, CARD_H);
  ctx.strokeStyle = 'rgba(251,191,36,0.35)'; ctx.lineWidth = 3; ctx.strokeRect(40, 40, CARD_W - 80, CARD_H - 80);

  let y = spec.stats ? SAFE + 200 : SAFE + 260;
  ctx.fillStyle = '#fbbf24'; ctx.font = `700 34px ${fam}`;
  ctx.fillText((rtl ? spec.eyebrow : spec.eyebrow.toUpperCase()), x, y);
  y += 40;

  const draw = (text: string, size: number, weight: number, color: string, lineH: number, maxLines: number) => {
    ctx.font = `${weight} ${size}px ${fam}`; ctx.fillStyle = color;
    const lines = wrapLines(s => ctx.measureText(s).width, text, inner, maxLines);
    for (const l of lines) { y += lineH; ctx.fillText(l, x, y); }
    y += 24;
  };
  draw(spec.title, spec.stats ? 76 : 68, 700, '#fef3c7', spec.stats ? 96 : 90, 7);
  if (spec.body) { y += 16; draw(spec.body, 40, 400, '#e2e8f0', 62, 9); }
  if (spec.stats?.length) {
    y += 20; const w = inner / spec.stats.length;
    spec.stats.forEach((s, i) => {
      const cx = rtl ? CARD_W - SAFE - w * i : SAFE + w * i;
      ctx.fillStyle = '#fbbf24'; ctx.font = `700 84px ${fam}`; ctx.fillText(s.value, cx, y + 90);
      ctx.fillStyle = '#94a3b8'; ctx.font = `400 32px ${fam}`; ctx.fillText(s.label, cx, y + 140);
    });
  }
  ctx.fillStyle = '#64748b'; ctx.font = `400 32px ${fam}`;
  ctx.fillText(spec.footer, x, CARD_H - SAFE);
  ctx.fillStyle = '#fbbf24'; ctx.font = '700 40px Inter, sans-serif'; ctx.direction = 'ltr'; ctx.textAlign = rtl ? 'left' : 'right';
  ctx.fillText('✦ Xtory', rtl ? SAFE : CARD_W - SAFE, CARD_H - SAFE);

  return new Promise((res, rej) => canvas.toBlob(b => (b ? res(b) : rej(new Error('encode_failed'))), 'image/png'));
}

/** Share the image where files are supported (mobile), otherwise download it. Returns what happened. */
export async function shareCard(blob: Blob, name: string, text: string, url: string): Promise<'shared' | 'downloaded' | 'cancelled'> {
  const file = new File([blob], `${name}.png`, { type: 'image/png' });
  const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
  try {
    if (nav.canShare?.({ files: [file] }) && nav.share) { await nav.share({ files: [file], text: `${text} ${url}`.trim() }); return 'shared'; }
  } catch (e) { if ((e as Error)?.name === 'AbortError') return 'cancelled'; }
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `${name}.png`;
  document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  return 'downloaded';
}
