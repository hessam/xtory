# Sprint 1: Orientation & Narrative

> **Goal**: Make the app speak the moment it loads. A user who never clicks anything should
> understand where they are in history within 2 seconds of landing.
> 
> **Prerequisites**: Sprint 0 must be fully complete and passing its DoD checklist.

---

## ⛔ GUARDRAILS — Read Before Writing a Single Line of Code

1. **DO NOT touch any AI fetching logic** (`fetchHistoricalDataForYear`, `fetchHistoricalEventsForYear`, etc.).
2. **DO NOT modify the `panelProps` object** in `App.tsx`. You will ADD to it, never remove from it.
3. **DO NOT change the `EventsPanel` tab system** (Events / Figures / Heritage tabs remain intact). The Historian Card section is ADDED above it — not a replacement.
4. **DO NOT change `BottomSheet.tsx`'s snap physics** — `collapsed / half / full` logic and all touch/drag handlers are untouched.
5. **The `historianCards.ts` year ranges MUST be contiguous** — no year should fall in two cards or between two cards.
6. **Farsi strings are REQUIRED** for `eraName` and `situationOneLiner`. For `fullSummary`, Farsi is optional — use English as fallback. Never leave a Farsi field as an empty string `""`.
7. If you are unsure which `regionId` or `dynastyId` to reference, look at `src/data/dynasties.ts` and `src/data/events.ts`. Do not invent new IDs.
8. Run `npm run dev` and check both mobile and desktop after EACH sub-task.

---

## Task 1-A: Create the Data File `src/data/historianCards.ts` [NEW FILE]

This is a **pure data file**. No imports from React or any UI library. No side effects. Just a
TypeScript interface and an array of objects.

### Interface Definition

```ts
// src/data/historianCards.ts

export interface VazirHighlight {
  id: string;                                // matches a vazir ID from vazirs.ts (Sprint 2)
  name: { en: string; fa: string };
  role: { en: string; fa: string };
  contribution: { en: string; fa: string };
  paradox: { en: string; fa: string };
}

export interface HistorianCard {
  eraId: string;                             // unique slug: e.g. "achaemenid"
  eraName: { en: string; fa: string };
  yearRange: { start: number; end: number }; // use negative numbers for BC years
  situationOneLiner: { en: string; fa: string }; // max 15 words. shown in header strip + drawer handle
  fullSummary: { en: string; fa?: string };  // 2-3 sentences. fa is optional.
  prevEraId?: string;                        // must match another eraId in this array
  nextEraId?: string;                        // must match another eraId in this array
  vazirHighlight?: VazirHighlight;           // optional. leave undefined for Sprint 1.
}
```

### Contiguity Rule

The `yearRange` of each card must be **end-to-start contiguous**. Example:
- Card A: `{ start: -550, end: -330 }`
- Card B: `{ start: -330, end: -250 }` ← B.start === A.end ✅
- Card C: `{ start: -200, end: -140 }` ← GAP! C.start ≠ B.end ❌

The full range must cover from the very first era start to the last era end. Pre-history years
(before the first card's `start`) are handled by the fallback utility (Task 1-B).

### The 15 Era Cards to Author

Author each card in order. Use the `dynasties.ts` IDs as reference for era names.

| eraId | Era Name (EN) | Year Range |
|-------|--------------|------------|
| `prehistoric` | Pre-Historic Iran | `-3000` to `-700` |
| `median` | Median Empire | `-700` to `-550` |
| `achaemenid` | Achaemenid Empire | `-550` to `-330` |
| `hellenistic` | Hellenistic Period | `-330` to `-247` |
| `parthian` | Parthian Empire | `-247` to `224` |
| `sasanian` | Sasanian Empire | `224` to `651` |
| `early_islamic` | Early Islamic Conquest | `651` to `820` |
| `iranian_renaissance` | Iranian Renaissance | `820` to `1040` |
| `seljuk` | Seljuk Dominance | `1040` to `1220` |
| `mongol_invasion` | Mongol Invasion | `1220` to `1370` |
| `timurid` | Timurid Era | `1370` to `1501` |
| `safavid` | Safavid Empire | `1501` to `1736` |
| `afsharid_zand` | Afsharid & Zand Period | `1736` to `1796` |
| `qajar` | Qajar Dynasty | `1796` to `1925` |
| `modern` | Modern Iran | `1925` to `2000` |

### `situationOneLiner` Guidelines

- Maximum 15 words in English.
- Must convey a **tension or paradox** — not just a label.
- Examples:
  - ✅ `"Iran's first empire stretches from Greece to India — built in one generation."`
  - ✅ `"The Arab armies arrive. The empire is exhausted and too tired to resist."`
  - ❌ `"The Achaemenid Empire ruled Iran."` — too flat, no tension.

---

## Task 1-B: Create the Utility `src/utils/getHistorianCard.ts` [NEW FILE]

This utility is used by every component that needs to show the Historian Card. It must never
return `null`. When no exact match is found, it returns the nearest card with a flag.

```ts
// src/utils/getHistorianCard.ts
import { historianCards, HistorianCard } from '../data/historianCards';

export interface HistorianCardResult {
  card: HistorianCard;
  isBetweenEras: boolean;
}

export function getHistorianCard(year: number): HistorianCardResult {
  // 1. Try exact match
  const exact = historianCards.find(
    c => year >= c.yearRange.start && year < c.yearRange.end
  );
  if (exact) return { card: exact, isBetweenEras: false };

  // 2. Fallback: find nearest card by midpoint distance
  const nearest = historianCards.reduce((best, current) => {
    const midBest = (best.yearRange.start + best.yearRange.end) / 2;
    const midCurrent = (current.yearRange.start + current.yearRange.end) / 2;
    return Math.abs(midCurrent - year) < Math.abs(midBest - year) ? current : best;
  });

  return { card: nearest, isBetweenEras: true };
}
```

**Test this utility manually** by calling it with the following years and confirming the results:

| Input Year | Expected `eraId` | Expected `isBetweenEras` |
|------------|-----------------|--------------------------|
| `-550` | `achaemenid` | `false` |
| `-400` | `achaemenid` | `false` |
| `-329` | `achaemenid` | `false` |
| `224` | `sasanian` | `false` |
| `600` | `sasanian` | `false` |
| `-5000` | `prehistoric` | `true` |

---

## Task 1-C: Create `src/components/HistorianCardSection.tsx` [NEW FILE]

This is a **display-only component**. It receives a `HistorianCardResult` object and renders
the card. It has no state and makes no API calls.

```tsx
// src/components/HistorianCardSection.tsx
import React from 'react';
import { HistorianCardResult } from '../utils/getHistorianCard';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { getHistorianCard } from '../utils/getHistorianCard';

interface Props {
  result: HistorianCardResult;
  lang: 'en' | 'fa';
  onNavigate: (year: number) => void;   // calls setYear in App.tsx
  isEnriching?: boolean;                // true while AI is fetching (shows the pulse)
  aiNarrative?: string | null;          // AI text to show beneath the card (null = not yet loaded)
}

export const HistorianCardSection: React.FC<Props> = ({
  result,
  lang,
  onNavigate,
  isEnriching = false,
  aiNarrative = null,
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

    </div>
  );
};
```

> ⚠️ **Import note**: You will need to also import `historianCards` from `../data/historianCards`
> to look up prev/next card year ranges. Add it to the import line.

---

## Task 1-D: Create `src/components/ContextStrip.tsx` [NEW FILE]

The Context Strip is a slim (36px) bar below the desktop header and mobile topBar.
It uses the `getHistorianCard` utility to derive the current era name and one-liner.

```tsx
// src/components/ContextStrip.tsx
import React, { useMemo } from 'react';
import { getHistorianCard } from '../utils/getHistorianCard';
import { formatYear } from '../utils/format';

interface Props {
  year: number;
  lang: 'en' | 'fa';
  isPersianDominant?: boolean; // Sprint 2 will pass this; ignored for now
}

export const ContextStrip: React.FC<Props> = ({ year, lang }) => {
  const { card } = useMemo(() => getHistorianCard(year), [year]);

  return (
    <div
      className="flex items-center gap-3 px-4 bg-slate-900/90 backdrop-blur-xl border-b border-white/10 overflow-hidden"
      style={{ height: 36, flexShrink: 0 }}
      dir={lang === 'fa' ? 'rtl' : 'ltr'}
    >
      {/* Era Name */}
      <span className="font-serif font-bold text-white text-xs whitespace-nowrap">
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
    </div>
  );
};
```

---

## Task 1-E: Mount `ContextStrip` in `App.tsx`

### Desktop
In the desktop layout's header section (Task 0-C), add `<ContextStrip>` directly **after**
the `</header>` closing tag and **before** the 3-column row `<div>`:

```tsx
<ContextStrip year={year} lang={lang} />
```

### Mobile
In the mobile layout (around line 335, after `</header>`), add `<ContextStrip>` directly
**after** `</header>` and **before** `<div id="tour-map-mobile">`:

```tsx
<ContextStrip year={year} lang={lang} />
```

> ⚠️ **GUARDRAIL**: On mobile, adding this element reduces the flex height available to the
> map by 36px. This is intentional. **Do not** adjust any of the `--sheet-height` CSS vars
> or the BottomSheet spacer calculations to compensate. The map simply shrinks by 36px.

---

## Task 1-F: Mount `HistorianCardSection` in `EventsPanel.tsx`

**File**: `src/components/EventsPanel.tsx`

### Step 1: Import

```tsx
import { HistorianCardSection } from './HistorianCardSection';
import { getHistorianCard } from '../utils/getHistorianCard';
```

### Step 2: Derive the result

Inside the `EventsPanel` component, at the top of the function body (after existing `useMemo` hooks):

```tsx
const historianResult = useMemo(() => getHistorianCard(year), [year]);
```

### Step 3: Render

In the JSX, BEFORE the `<AnimatePresence>` block that contains the tabs, add:

```tsx
{/* ── Historian Card (always visible, above tabs) ── */}
{isOpen && (
  <div className="border-b border-white/10">
    <HistorianCardSection
      result={historianResult}
      lang={lang}
      onNavigate={(y) => {/* call setYear — needs to come via props */}}
      isEnriching={isLoadingAI}
    />
  </div>
)}
```

### Step 4: Thread the `onNavigate` prop

`EventsPanel` does not currently have a `setYear` or `onJumpToYear` prop. You must add it
to the `EventsPanelProps` interface:

```tsx
// In the interface:
onJumpToYear?: (year: number) => void;
```

Then in `App.tsx`, add `onJumpToYear: (y: number) => setYear(y)` to the `panelProps` object.

> ⚠️ **GUARDRAIL**: Add as an optional prop (`?`) so existing usage without it does not
> break TypeScript compilation.

---

## Task 1-G: Mount `HistorianCardSection` in `BottomSheet.tsx` (Mobile)

**File**: `src/components/BottomSheet.tsx`

### Step 1: Import same as EventsPanel (Task 1-F Step 1)

### Step 2: Derive result
```tsx
const historianResult = useMemo(() => getHistorianCard(year), [year]);
```

### Step 3: Show era name in drawer handle

Find the text currently reading `"Explore this Era"` / `"این دوره را کاوش کنید"` in the
handle area and replace it with the era name:

```tsx
<h3 className="font-serif font-bold text-white text-sm">
  {historianResult.card.eraName[lang]}
</h3>
```

### Step 4: Show one-liner in handle when collapsed

Directly below the era name span, add (wrapped in `{snap === 'collapsed' && ...}`):

```tsx
{snap === 'collapsed' && (
  <p className="text-slate-400 text-[10px] truncate max-w-[240px]">
    {historianResult.card.situationOneLiner[lang]}
  </p>
)}
```

### Step 5: Render `HistorianCardSection` in the sheet content area

Find the scrollable content area inside `BottomSheet.tsx` (the `overflow-y-auto` div).

Add `<HistorianCardSection>` as the **first child** inside this div, before any tabs:

```tsx
<div className="border-b border-white/10">
  <HistorianCardSection
    result={historianResult}
    lang={lang}
    onNavigate={onJumpToYear ?? (() => {})}
    isEnriching={isLoadingAI}
  />
</div>
```

> ⚠️ Check that `BottomSheet` already receives `isLoadingAI` and `onJumpToYear` via `panelProps`
> from `App.tsx`. If `onJumpToYear` is not in `panelProps`, add it (same as Task 1-F Step 4).

---

## Definition of Done (DoD)

- [x] `src/data/historianCards.ts` exists with 15 valid, contiguous era cards
- [x] `src/utils/getHistorianCard.ts` exists and returns a result for every year including -5000
- [x] `src/components/HistorianCardSection.tsx` exists and renders correctly
- [x] `src/components/ContextStrip.tsx` exists and renders correctly
- [x] Desktop: Context Strip is visible below the header at all times, updates when era changes
- [x] Desktop: HistorianCard is visible at the top of the right sidebar panel, above tabs
- [x] Mobile: Drawer handle shows the current era name instead of "Explore this Era"
- [x] Mobile: Situation one-liner is visible in the collapsed handle state
- [x] Mobile: HistorianCard is the first section in the open drawer, above tabs
- [x] Connection chips (← Parthian | Sasanian →) navigate correctly when clicked
- [x] `isEnriching` pulse appears when `isLoadingAI` is true
- [x] No TypeScript errors (`npm run build` passes cleanly)
- [x] No existing tab functionality is broken (Events / Figures / Heritage still work)
