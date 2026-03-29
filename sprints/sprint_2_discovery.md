# Sprint 2: Discovery & Visual Evidence

> **Goal**: Add the "Human History" overlay to the map (Vazir dots) and the "Resilience
> Waveform" to the timeline (Persian presence bar + chapter dots). The map still uses the
> same rendering engine — we are only adding overlay layers on top.
>
> **Prerequisites**: Sprint 0 AND Sprint 1 must be fully complete and passing their DoD checklists.

---

## ⛔ GUARDRAILS — Read Before Writing a Single Line of Code

1. **DO NOT change any SVG path or region rendering logic in `Map.tsx`.** You are adding an
   overlay layer on top. The existing region fills, borders, and colors are untouched.
2. **DO NOT change any props that `Map.tsx` currently accepts.** You ADD new optional props.
   All new props must have a default value so the map works even if the parent does not
   supply them yet.
3. **DO NOT change `Timeline.tsx`'s Gantt chart rendering.** Minimap dots and the presence
   bar are added to the scrubber track only.
4. **DO NOT change the `<input type="range">` element** in `Timeline.tsx`. The dot layer goes
   UNDERNEATH it with `pointer-events-none`. The input must remain interactive.
5. **`vazirs.ts` regionId values MUST match** IDs that already exist in `src/data/regions.ts`
   (or whatever file defines region IDs for the map). Look them up before authoring data.
6. **`vazirs.ts` dynastyId values MUST match** keys that already exist in `src/data/dynasties.ts`.
7. All new components use only existing Tailwind classes and colour tokens. `amber-400`,
   `orange-500`, and `white/10` are all in the existing palette. No new classes.
8. Run `npm run dev` and visually check after EACH TaskA/B/C/D.

---

## Context: How `Map.tsx` Renders Markers Today

Before adding anything, read `src/components/Map.tsx` and find where `historicalEvents` and
`artifacts` are rendered as SVG markers. You will follow the exact same pattern for Vazir dots.

The pattern is:
1. Filter the data array for items active at the current `year`.
2. Find the region centroid using the region's `center` coordinate.
3. Render an `<svg>` element (or `<div>` overlay) at that coordinate.

---

## Task 2-A: Create `src/data/vazirs.ts` [NEW FILE]

This is a pure data file. No React imports.

### Interface

```ts
// src/data/vazirs.ts

export interface Vazir {
  id: string;
  name: { en: string; fa: string };
  title: { en: string; fa: string };
  activeYearStart: number;               // year they became active (negative = BC)
  activeYearEnd: number;                 // year they ceased (death or fall from power)
  regionId: string;                      // MUST match an existing region ID in the map data
  rulerName: { en: string; fa: string }; // the ruler they served
  dynastyId: string;                     // MUST match a key in dynasties.ts
  contribution: { en: string; fa: string }; // one sentence
  preserved: { en: string; fa: string };    // what they saved or built
  paradox: { en: string; fa: string };      // the "man vs. empire" tension line
}

// CLUSTERING THRESHOLD — do not change this value without updating Map.tsx logic
export const VAZIR_CLUSTER_PX = 18;

export const vazirs: Vazir[] = [
  // ── Priority 6 entries (from the design spec) ───────────────────────────
  {
    id: 'burzoe',
    name: { en: 'Burzoe', fa: 'بُرزویه' },
    title: { en: 'Chief Physician & Vazir', fa: 'وزیر و پزشک دربار' },
    activeYearStart: 531,
    activeYearEnd: 579,
    regionId: 'jibal',                   // ← Verify this matches regions.ts
    rulerName: { en: 'Khosrow I', fa: 'خسرو اول' },
    dynastyId: 'sasanian',
    contribution: { en: 'Translated the Panchatantra from Sanskrit to Pahlavi', fa: 'ترجمه کلیله و دمنه از سانسکریت به پهلوی' },
    preserved: { en: 'Indian wisdom encoded in Persian storytelling tradition', fa: 'دانش هندی در قالب داستان‌های فارسی' },
    paradox: { en: 'While the empire weakened, he quietly preserved foreign wisdom as Iranian culture', fa: 'در حالی که امپراتوری ضعیف می‌شد، دانش بیگانه را در فرهنگ ایرانی حفظ کرد' },
  },
  {
    id: 'yahya_barmaki',
    name: { en: 'Yahya ibn Khalid al-Barmaki', fa: 'یحیی بن خالد برمکی' },
    title: { en: 'Grand Vazir of the Abbasid Caliphate', fa: 'وزیر بزرگ خلافت عباسی' },
    activeYearStart: 786,
    activeYearEnd: 803,
    regionId: 'khorasan',               // ← Verify this matches regions.ts
    rulerName: { en: 'Harun al-Rashid', fa: 'هارون الرشید' },
    dynastyId: 'abbasid',
    contribution: { en: 'Ran the Abbasid Caliphate as de facto ruler for 17 years', fa: 'خلافت عباسی را به مدت ۱۷ سال اداره کرد' },
    preserved: { en: 'Iranian administrative traditions within the Arab Caliphate', fa: 'سنت‌های اداری ایرانی در دستگاه خلافت عرب' },
    paradox: { en: 'A Buddhist family from Balkh who administered an Islamic empire in Persian', fa: 'خانواده‌ای بودایی از بلخ که امپراتوری اسلامی را به فارسی اداره کرد' },
  },
  {
    id: 'nizam_al_mulk',
    name: { en: 'Nizam al-Mulk', fa: 'نظام‌الملک' },
    title: { en: 'Grand Vazir of the Seljuk Empire', fa: 'وزیر بزرگ امپراتوری سلجوقی' },
    activeYearStart: 1064,
    activeYearEnd: 1092,
    regionId: 'jibal',                  // Isfahan — verify
    rulerName: { en: 'Alp Arslan & Malik-Shah I', fa: 'الپ ارسلان و ملکشاه اول' },
    dynastyId: 'seljuk',
    contribution: { en: 'Built the Nizamiyya university network across the Islamic world', fa: 'شبکه دانشگاه‌های نظامیه را در سراسر جهان اسلام بنا کرد' },
    preserved: { en: 'Iranian bureaucratic system within the Turkic Seljuk conquest state', fa: 'سیستم اداری ایرانی در دولت فاتحان ترک سلجوقی' },
    paradox: { en: 'Ran a Turkic empire in Persian, using Iranian governance to outlast the conquerors', fa: 'یک امپراتوری ترک را به زبان فارسی اداره کرد' },
  },
  {
    id: 'nasir_al_din_tusi',
    name: { en: 'Khwaja Nasir al-Din Tusi', fa: 'خواجه نصیرالدین طوسی' },
    title: { en: 'Scholar-Advisor to Hulagu Khan', fa: 'مشاور علمی هولاکو خان' },
    activeYearStart: 1256,
    activeYearEnd: 1274,
    regionId: 'jibal',                  // Maragheh observatory — verify
    rulerName: { en: 'Hulagu Khan', fa: 'هولاکو خان' },
    dynastyId: 'ilkhanate',
    contribution: { en: 'Convinced the Mongols to spare the libraries of Baghdad', fa: 'مغول‌ها را متقاعد کرد که کتابخانه‌های بغداد را نسوزانند' },
    preserved: { en: 'Islamic-Iranian scientific tradition through the Mongol catastrophe', fa: 'سنت علمی ایرانی-اسلامی را از دل فاجعه مغول عبور داد' },
    paradox: { en: 'Served the destroyers of Islamic civilization to save it from within', fa: 'به ویرانگران تمدن اسلامی خدمت کرد تا آن را از درون نجات دهد' },
  },
  {
    id: 'ali_ibn_isa',
    name: { en: 'Ali ibn Isa al-Jarrah', fa: 'علی بن عیسی الجراح' },
    title: { en: 'Vazir of the Abbasid Caliphate', fa: 'وزیر خلافت عباسی' },
    activeYearStart: 908,
    activeYearEnd: 936,
    regionId: 'iraq_ajam',             // Baghdad — verify
    rulerName: { en: 'Multiple Abbasid Caliphs', fa: 'خلفای مختلف عباسی' },
    dynastyId: 'abbasid',
    contribution: { en: 'Reformed the tax system to protect the poor during economic collapse', fa: 'سیستم مالیاتی را اصلاح کرد تا در بحران اقتصادی از فقرا محافظت کند' },
    preserved: { en: 'Fiscal stability of the caliphate during its political fragmentation', fa: 'ثبات مالی خلافت در دوران تجزیه سیاسی آن' },
    paradox: { en: 'Three times fired, three times recalled — too competent to leave, too honest to keep', fa: 'سه بار اخراج شد، سه بار بازگشت — بیش از حد کاردان بود که رهایش کنند' },
  },
  {
    id: 'rashid_al_din',
    name: { en: 'Rashid al-Din Hamadani', fa: 'رشیدالدین فضل‌الله همدانی' },
    title: { en: 'Vazir of the Ilkhanate', fa: 'وزیر ایلخانان' },
    activeYearStart: 1298,
    activeYearEnd: 1318,
    regionId: 'iran_azerbaijan',        // Tabriz — verify
    rulerName: { en: 'Ghazan Khan & Öljaitü', fa: 'غازان خان و اولجایتو' },
    dynastyId: 'ilkhanate',
    contribution: { en: 'Authored the Jami al-Tawarikh — the first world history', fa: 'جامع التواریخ را نوشت — نخستین تاریخ جهانی' },
    preserved: { en: 'Global knowledge synthesis at the crossroads of the Mongol empire', fa: 'ترکیب دانش جهانی در تقاطع امپراتوری مغول' },
    paradox: { en: 'A Jewish convert who wrote the definitive history of Islam for a Mongol ruler', fa: 'یهودی مسلمان‌شده‌ای که تاریخ اسلام را برای یک حاکم مغول نوشت' },
  },
];
```

> ⚠️ **After creating this file**, open `src/data/events.ts` or `regions.ts` and verify that
> every `regionId` value above (jibal, khorasan, etc.) matches exactly. If a region ID is
> wrong, the dot will not appear on the map.

---

## Task 2-B: Create `src/components/VazirDot.tsx` [NEW FILE]

This component renders a single Vazir marker or a cluster badge. It is rendered inside
the `Map.tsx` SVG/overlay layer.

```tsx
// src/components/VazirDot.tsx
import React, { useState } from 'react';
import { Vazir } from '../data/vazirs';

interface Props {
  vazirs: Vazir[];           // 1 = single dot; 2+ = cluster
  x: number;                 // pixel x position on the map container
  y: number;                 // pixel y position on the map container
  lang: 'en' | 'fa';
  onClick: (vazir: Vazir) => void;
}

export const VazirDot: React.FC<Props> = ({ vazirs, x, y, lang, onClick }) => {
  const [showTooltip, setShowTooltip] = useState(false);
  const isCluster = vazirs.length > 1;
  const primary = vazirs[0];

  return (
    <div
      className="absolute"
      style={{ left: x, top: y, transform: 'translate(-50%, -50%)', zIndex: 10 }}
    >
      {/* The Dot */}
      <button
        className={`
          relative flex items-center justify-center
          rounded-full border-2 border-amber-400/80
          bg-amber-500/20 hover:bg-amber-500/40
          calm-transition cursor-pointer
          ${isCluster ? 'w-7 h-7' : 'w-4 h-4'}
        `}
        onClick={() => onClick(primary)}
        onMouseEnter={() => setShowTooltip(true)}
        onMouseLeave={() => setShowTooltip(false)}
        title={primary.name[lang]}
      >
        {/* Pulse ring */}
        <div className="absolute inset-0 rounded-full bg-amber-400/20 animate-ping" />

        {/* Cluster count badge */}
        {isCluster && (
          <span className="relative z-10 text-amber-300 text-[10px] font-bold">
            {vazirs.length}
          </span>
        )}
      </button>

      {/* Tooltip */}
      {showTooltip && !isCluster && (
        <div
          className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2
                     liquid-glass border border-white/10 rounded-xl px-3 py-2
                     text-xs whitespace-nowrap pointer-events-none z-50"
          dir={lang === 'fa' ? 'rtl' : 'ltr'}
        >
          <p className="font-bold text-amber-300">{primary.name[lang]}</p>
          <p className="text-slate-400">{primary.rulerName[lang]}</p>
          <p className="text-slate-500 max-w-[180px] truncate">{primary.contribution[lang]}</p>
        </div>
      )}
    </div>
  );
};
```

---

## Task 2-C: Add Vazir Dot Rendering to `Map.tsx`

**File**: `src/components/Map.tsx`

### Step 1: Add new props to `Map.tsx`

```tsx
// Add to MapProps interface:
vazirs?: Vazir[];                        // from vazirs.ts
onVazirClick?: (vazir: Vazir) => void;  // handler in App.tsx
```

Both props are **optional** with a default of `[]` / `() => {}` so existing uses don't break.

### Step 2: Import

```tsx
import { vazirs as allVazirs, Vazir, VAZIR_CLUSTER_PX } from '../data/vazirs';
import { VazirDot } from './VazirDot';
```

### Step 3: Filter active Vazirs

Inside the component (inside render, NOT at module level):

```tsx
// Filter Vazirs active at the current year
const activeVazirs = useMemo(
  () => (vazirs ?? allVazirs).filter(v => year >= v.activeYearStart && year <= v.activeYearEnd),
  [vazirs, year]
);
```

> ⚠️ Use `useMemo` here — this runs on every year change. Do not put it outside the component.

### Step 4: Build clusters

```tsx
// Cluster active Vazirs by pixel proximity
type VazirCluster = { vazirs: Vazir[]; x: number; y: number };

const vazirClusters = useMemo((): VazirCluster[] => {
  const clusters: VazirCluster[] = [];

  activeVazirs.forEach(v => {
    // Get the center coordinates for this region
    // Replace `getRegionCenter` with whatever function/lookup Map.tsx uses today
    const center = getRegionCenter(v.regionId);
    if (!center) return;

    const [x, y] = center; // pixel coordinates on the map

    const nearby = clusters.find(c => {
      const dx = c.x - x;
      const dy = c.y - y;
      return Math.sqrt(dx * dx + dy * dy) < VAZIR_CLUSTER_PX;
    });

    if (nearby) {
      nearby.vazirs.push(v);
    } else {
      clusters.push({ vazirs: [v], x, y });
    }
  });

  return clusters;
}, [activeVazirs]);
```

> ⚠️ Read `Map.tsx` carefully to find how it converts a `regionId` to pixel coordinates
> today (for existing event/artifact markers). Use the **exact same method**. Do not
> introduce a new coordinate system.

### Step 5: Render the dots

In the JSX, inside the map container `<div>` (at the same level as other overlay elements),
add:

```tsx
{/* ── Vazir Dot Overlay ─────────────────────────────────────── */}
{vazirClusters.map((cluster, i) => (
  <VazirDot
    key={i}
    vazirs={cluster.vazirs}
    x={cluster.x}
    y={cluster.y}
    lang={lang}
    onClick={onVazirClick ?? (() => {})}
  />
))}
```

### Step 6: Wire in `App.tsx`

In `App.tsx`, pass the new props to `<Map>` in BOTH the desktop and mobile map usages:

```tsx
onVazirClick={(vazir) => {
  // Reuse the existing figure click handler — treat a Vazir click like a figure click
  // by casting the Vazir as a HistoricalFigure shape. OR open the HistorianCard's
  // vazirHighlight panel. For Sprint 2, just log to console.
  console.log('[Vazir clicked]', vazir);
}}
```

> The full Vazir profile panel is wired in Sprint 3. For Sprint 2, the dot just needs to appear
> and log. Do not block this sprint on the panel implementation.

---

## Task 2-D: Add Minimap Dots to `Timeline.tsx`

**File**: `src/components/Timeline.tsx`

### Step 1: Find the scrubber track wrapper

Locate the `<div>` that wraps the `<input type="range">` element in the minimap (the
horizontal scrubber). It should look something like:

```tsx
<div className="flex-1 relative flex items-center h-10 sm:h-8">
  <input type="range" ... />
</div>
```

### Step 2: Add a dot colour helper function

In `Timeline.tsx`, add this function (near the existing `getEventColor` or similar helpers):

```ts
function getMinimapDotColor(type: string): string {
  switch (type) {
    case 'battle':    return 'bg-rose-400';
    case 'downfall':  return 'bg-purple-400';
    case 'political': return 'bg-sky-400';
    case 'cultural':  return 'bg-emerald-400';
    case 'tradition': return 'bg-amber-400';
    default:          return 'bg-slate-400';
  }
}
```

### Step 3: Render the dot layer

Inside the scrubber wrapper div, BEFORE the `<input>` element, add:

```tsx
{/* ─── Minimap Event Dots (pointer-events-none, below the input) ──── */}
<div className="absolute inset-0 pointer-events-none">
  {historicalEvents.map(event => {
    const MIN_YEAR = -3000; // match the existing MIN_YEAR constant in Timeline.tsx
    const MAX_YEAR = 2000;  // match the existing MAX_YEAR constant in Timeline.tsx
    const pct = ((event.year - MIN_YEAR) / (MAX_YEAR - MIN_YEAR)) * 100;
    return (
      <div
        key={event.id}
        className={`absolute w-1.5 h-1.5 rounded-full ${getMinimapDotColor(event.type)}`}
        style={{
          left: `${pct}%`,
          top: '50%',
          transform: 'translate(-50%, -50%)',
        }}
        title={`${event.title[lang]} · ${Math.abs(event.year)} ${event.year < 0 ? 'BC' : 'AD'}`}
      />
    );
  })}
</div>
{/* ─── End Minimap Event Dots ─────────────────────────────────── */}
```

> ⚠️ Check what `MIN_YEAR` and `MAX_YEAR` are actually called in the existing `Timeline.tsx`.
> If they have different names, use those names. Do not hardcode different values.

### Step 4: Add the Persian Presence Bar

Below the `<input>` element (still inside the scrubber wrapper div), add a presence bar.

First, compute the presence data in a `useMemo`:

```tsx
// Add near other useMemo hooks at the top of Timeline component body
const persianPresenceByEra = useMemo(() => {
  // ERAS array should already be defined in Timeline.tsx
  // For each era, count how many events have a dynasty with colorFamily === 'persian'
  return ERAS.map(era => {
    const eraEvents = events.filter(e => e.startDate >= era.start && e.startDate < era.end);
    const persianCount = eraEvents.filter(e => {
      const dynasty = dynasties[e.dynastyId];
      return dynasty?.colorFamily === 'persian';
    }).length;
    const total = eraEvents.length;
    return {
      eraId: era.id,
      start: era.start,
      end: era.end,
      ratio: total > 0 ? persianCount / total : 0,
    };
  });
}, [events, dynasties]);
```

Then in JSX, after the `<input>`, render the bar:

```tsx
{/* ─── Persian Presence Waveform ──────────────────────────────── */}
<div className="absolute bottom-0 left-0 right-0 flex pointer-events-none" style={{ height: 3 }}>
  {persianPresenceByEra.map(era => {
    const MIN_YEAR = -3000;
    const MAX_YEAR = 2000;
    const leftPct = ((era.start - MIN_YEAR) / (MAX_YEAR - MIN_YEAR)) * 100;
    const widthPct = ((era.end - era.start) / (MAX_YEAR - MIN_YEAR)) * 100;
    return (
      <div
        key={era.eraId}
        className="absolute bg-amber-400/60"
        style={{
          left: `${leftPct}%`,
          width: `${widthPct}%`,
          height: `${Math.max(1, era.ratio * 4)}px`, // 1px min, 4px max
          bottom: 0,
        }}
        title={`Persian presence: ${Math.round(era.ratio * 100)}%`}
      />
    );
  })}
</div>
{/* ─── End Persian Presence Waveform ──────────────────────────── */}
```

> ⚠️ **GUARDRAIL**: If `ERAS` is not exported from `Timeline.tsx`, extract it to a shared
> constants file (`src/data/eras.ts`) first, then import it in both `Timeline.tsx` and the
> new `ContextStrip.tsx` from Sprint 1.

---

## Definition of Done (DoD)

- [x] `src/data/vazirs.ts` exists with 6 valid entries, all `regionId` and `dynastyId` fields verified
- [x] `src/components/VazirDot.tsx` exists and renders single dots and cluster badges
- [x] Vazir amber/gold dots are visible on the map when the year is within a Vazir's active period
- [x] Clicking a Vazir dot logs `[Vazir clicked]` to the browser console (full panel wired Sprint 3)
- [x] Hovering a single Vazir dot shows the tooltip with name, ruler, and contribution
- [x] Multiple Vazirs in the same region cluster into a count-badge dot
- [x] `Timeline.tsx` has tiny coloured dots on the minimap scrubber track
- [x] `Timeline.tsx` has a Persian presence bar at the bottom of the scrubber track
- [x] The `<input type="range">` scrubber is still fully interactive (not blocked by dot layer)
- [x] Mobile layout is visually unchanged at `<640px`
- [x] `npm run build` passes with zero TypeScript errors
