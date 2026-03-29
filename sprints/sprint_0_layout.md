# Sprint 0: Layout Re-architecture

> **Goal**: Restructure `App.tsx` to a docked, collapsible Flex layout on desktop and a
> resizing 3-row Flex layout on mobile. **Zero logic changes.** All data, AI calls, event
> handlers, and modals stay exactly as they are. We are only moving JSX boxes and adding
> two boolean state variables.

---

## ⛔ GUARDRAILS — Read Before Writing a Single Line of Code

1. **DO NOT change any props** passed to `<Map>`, `<Timeline>`, `<BottomSheet>`, `<EventsPanel>`.
2. **DO NOT change any handler functions** (`handleRegionClick`, `handleEventClick`, etc.).
3. **DO NOT change any `useState` or `useEffect` logic** that manages data, AI, or modals.
4. **DO NOT rename or move any component files.** Only `App.tsx` layout JSX changes.
5. **DO NOT touch the mobile layout's CSS custom properties** (`--sheet-height`, `--sheet-transition`, `--safe-top`, `--safe-bottom`). These power the BottomSheet physics.
6. **All changes are in `App.tsx` only.** If you find yourself editing any other file in this sprint, stop and re-read this document.
7. **Keep all existing `id="tour-*"` attributes intact.** They power the tour guide system.
8. Run `npm run dev` and visually verify after each sub-task. Do not stack multiple changes before checking.

---

## Context: Current Desktop Layout (Lines 411–520 in `App.tsx`)

The current desktop block is `<div className="hidden sm:block relative w-full h-full">`.
All its children (`Map`, `Header`, `BYOK Banner`, `EventsPanel`, `Timeline`) are `absolute`
positioned and overlap each other.

**Target**: Replace this with a Flex column that contains a single Flex row in the middle.

---

## Task 0-A: Add Two New State Variables (Desktop Only)

**File**: `src/App.tsx`
**Location**: Inside the `App()` function body, near line 50 alongside the other `useState` calls.

Add exactly these two lines:
```tsx
const [isLeftPanelOpen, setIsLeftPanelOpen] = useState(true);
const [isRightPanelOpen, setIsRightPanelOpen] = useState(true);
```

**Verification**: The app should still compile and look identical. These states are not wired to anything yet.

---

## Task 0-B: Restructure the Desktop Container

**File**: `src/App.tsx`
**Location**: The desktop block starting at line 411: `<div className="hidden sm:block relative w-full h-full">`.

Replace the entire desktop block structure (the open `<div>` tag only, not its children yet) with this:

```tsx
<div className="hidden sm:flex flex-col w-full h-full overflow-hidden">
```

This switches the container from `block` (which relies on absolute children) to `flex flex-col`
(which stacks children in a column). **Only change the opening div tag.**

**Verification**: The app will look broken (everything stacked vertically). That is expected.

---

## Task 0-C: Move the Header Into the Flow

The `<header>` (desktop floating header, lines 435–477) is currently `absolute top-0`.

1. Remove `absolute top-0 left-0 right-0` from its className.
2. Remove `z-10` from its className (`pointer-events-none` can stay).
3. Add `flexShrink: 0` as an inline style.

The header is now the **first row** of the desktop flex column.

```tsx
<header className="p-4 md:p-6 flex items-center justify-between pointer-events-none gap-4"
        style={{ flexShrink: 0 }}>
  {/* All existing header children stay exactly as they are */}
</header>
```

**Verification**: The header should be pinned to the top. The map will now start below it.

---

## Task 0-D: Build the 3-Column Middle Row

After the `</header>` closing tag, add a new wrapper `<div>` that will hold the 3 columns.
This is the `flex: 1` row that fills the remaining screen height:

```tsx
{/* ─── 3-Column Middle Row ─────────────────────────────────────── */}
<div className="flex flex-1 min-h-0 overflow-hidden">

  {/* LEFT PANEL (Legend — collapsible) */}
  {isLeftPanelOpen && (
    <div
      className="flex flex-col liquid-glass-heavy border-r border-white/10 overflow-y-auto"
      style={{ width: 240, flexShrink: 0 }}
    >
      {/* COLLAPSE BUTTON */}
      <button
        onClick={() => setIsLeftPanelOpen(false)}
        className="self-end m-3 p-1.5 rounded-lg hover:bg-white/10 calm-transition text-slate-400 hover:text-white"
        title="Collapse legend"
      >
        {/* PanelLeftClose icon from lucide */}
        ←
      </button>
      {/* LEGEND PLACEHOLDER — will be filled in Sprint 1 */}
      <div className="px-4 pb-4 text-xs text-slate-500 italic">Legend panel (Sprint 1)</div>
    </div>
  )}

  {/* LEFT PANEL EXPAND BUTTON (shown when collapsed) */}
  {!isLeftPanelOpen && (
    <button
      onClick={() => setIsLeftPanelOpen(true)}
      className="flex flex-col items-center justify-center px-2 liquid-glass border-r border-white/10 hover:bg-white/10 calm-transition text-slate-400 hover:text-white"
      style={{ width: 32, flexShrink: 0 }}
      title="Expand legend"
    >
      →
    </button>
  )}

  {/* CENTER: Map (existing, now in flow) */}
  <div
    id="tour-map-desktop"
    className="relative flex-1 min-w-0 overflow-hidden"
    style={{ pointerEvents: runTour ? 'none' : 'auto' }}
  >
    <Map {/* Keep ALL existing Map props exactly as they are */} />
    
    {/* BYOK Banner moved inside the map container, now bottom-center */}
    {isReady && !apiKey && (
      <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-50 pointer-events-auto">
        {/* Keep exact same inner content/classes as the current BYOK banner */}
      </div>
    )}
  </div>

  {/* RIGHT PANEL (EventsPanel — collapsible) */}
  {isRightPanelOpen && (
    <div
      className="flex flex-col liquid-glass-heavy border-l border-white/10 overflow-hidden"
      style={{ width: 360, flexShrink: 0 }}
    >
      {/* COLLAPSE BUTTON */}
      <button
        onClick={() => setIsRightPanelOpen(false)}
        className="self-start m-3 p-1.5 rounded-lg hover:bg-white/10 calm-transition text-slate-400 hover:text-white"
        title="Collapse historian"
      >
        →
      </button>
      {/* EventsPanel — pass ALL existing props exactly as they are */}
      <EventsPanel {...panelProps} />
    </div>
  )}

  {/* RIGHT PANEL EXPAND BUTTON (shown when collapsed) */}
  {!isRightPanelOpen && (
    <button
      onClick={() => setIsRightPanelOpen(true)}
      className="flex flex-col items-center justify-center px-2 liquid-glass border-l border-white/10 hover:bg-white/10 calm-transition text-slate-400 hover:text-white"
      style={{ width: 32, flexShrink: 0 }}
      title="Expand historian"
    >
      ←
    </button>
  )}

</div>
{/* ─── End 3-Column Middle Row ──────────────────────────────────── */}
```

> ⚠️ The `<Map>` component here must receive **exactly the same props** it has today (lines 419–431).
> Copy them verbatim. Do not remove or simplify any prop.

**Verification**: You should see: [Legend sidebar] [Map center] [EventsPanel sidebar]. The sidebars should collapse/expand via the arrow buttons.

---

## Task 0-E: Dock the Timeline to the Bottom

The `<Timeline>` (currently inside an `absolute bottom-0` div) must become the **last row** of the
desktop flex column — after the 3-column middle row closing `</div>`.

```tsx
{/* ─── Bottom Timeline Row ──────────────────────────────────────── */}
<div
  id="tour-timeline-desktop"
  className="liquid-glass-heavy border-t border-white/10 overflow-hidden"
  style={{ flexShrink: 0 }}
>
  <Timeline {/* Keep ALL existing Timeline props exactly as they are */} />
</div>
```

> ⚠️ The `<Timeline>` component must receive **exactly the same props** it has today (lines 503–517).

**Verification**: Timeline should be pinned to the bottom. The 3 columns should fill all space between header and timeline.

---

## Task 0-F: Verify Mobile Layout Is Unchanged

The mobile layout block (`<div className="sm:hidden ...">`, lines 287–405) **must not be touched
at all** during this sprint. Inspect it visually at `<640px` viewport width to confirm it still
works identically.

---

## Task 0-G: Icon Import Cleanup

If you used plain `←` / `→` arrows as temporary toggle icons, replace them with proper Lucide
icons at the end of this sprint:
- Import `PanelLeftClose`, `PanelLeftOpen`, `PanelRightClose`, `PanelRightOpen` from `lucide-react`.
- Apply them to the 4 collapse/expand buttons.

---

## Definition of Done (DoD)

- [x] Desktop shows: Header → [Left Panel | Map | Right Panel] → Timeline
- [x] Left panel collapses to a 32px sliver; map expands to fill space
- [x] Right panel collapses to a 32px sliver; map expands to fill space
- [x] Both panels can be collapsed simultaneously (full-screen map mode)
- [x] All existing event handlers work (click map region → modal opens)
- [x] BYOK banner appears at bottom center of the map area when no API key
- [x] Mobile layout at `<640px` viewport is visually unchanged
- [x] `npm run build` produces zero TypeScript errors
- [x] All `id="tour-*"` attributes are present and correct
