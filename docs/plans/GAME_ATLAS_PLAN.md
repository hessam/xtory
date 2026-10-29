# Xtory — Game Atlas Plan

> **Status:** APPROVED 2026-10-28 (decisions D1–D7 confirmed, see section 6). Slice 0 in progress.
> **Goal:** Turn the Living Atlas into something people who *don't* like history open for fun:
> a strategy-game-grade map, free exploration that rewards discovery, and facts worth sharing —
> while keeping the honesty of the data ("claims need a source").
> **Rule:** One slice at a time per track. A slice is done only when every DoD box is ticked.

---

## 0. Where we are (baseline, measured 2026-10-28)

| Area | Today |
|---|---|
| Initial JS (entry + preloads) | ~188 KB gzip — under the 500 KB launch target |
| Type check / build | `tsc --noEmit` clean, `vite build` OK |
| Automated tests | **None.** `GUARDRAILS.md` is a manual checklist |
| Map | Leaflet + Thunderforest tiles. **One dynasty per region** (`MapLeaflet.tsx` `styleRegion` picks a single `primaryEvent`), coloured **by family** (`getDynastyColor`), so ≤ 12 rulers ever visible and same-family dynasties look identical |
| Curated data | 1,043 entries in `docs/historical_data/`, ~458 *raw* dynasty names (with duplicates like "Justanids" / "Justanid Dynasty"). Used **only** as AI prompt anchors, never drawn |
| AI | Browser → Google Gemini with the user's key (BYOK). Gemini API is not offered in Iran, so most Iranian users can't use it without a VPN |
| Static "fun" content | 5 quiz questions, 26 events, 15 figures, 6 vazirs, 16 era cards |
| Backend | None |

---

## 1. Target experience (one paragraph)

You open Xtory on your phone and see a living strategy-game map of the Iranian plateau. As you
drag through time, realms split, merge, and burn across the board; a counter says **"In 1000 AD:
14 dynasties ruled here."** Tap a famous king and everything he *didn't* rule goes dark. Sparkles
hide on the map — tap one and you uncover a fact few people know ("Yazdgerd III was 27 when he
died"). Each fact goes into your inventory, gets fact-checked, and earns points on a leaderboard
under an optional nickname. Edge arrows tell you what Rome and China were doing at the same
moment. Any fact or your whole collection can be shared to Telegram as a beautiful card. Experts
can still switch to the full Atlas.

---

## 2. Target architecture

```
                 ┌──────────────────────── Browser (SPA, Persian-first) ───────────────────────┐
                 │  Board renderer (WebGL 2D + SVG labels)   Journey / Explore / Atlas modes   │
                 │  Static data bundle (registry, realms, verified facts, meanwhile)           │
                 │  Local inventory (works offline, syncs when online)                         │
                 └───────────────────────────────┬─────────────────────────────────────────────┘
                                                 │  ONLY talks to its own origin (/api/*)
                 ┌───────────────────────────────▼─────────────────────────────────────────────┐
                 │  Vercel Functions (region close to Iran, e.g. fra1)                          │
                 │  /api/ai/*   /api/facts/*   /api/me   /api/leaderboard   /f/:id (OG pages)   │
                 └──────┬───────────────────────────┬───────────────────────────┬──────────────┘
                        │                           │                           │
                 OpenRouter (2 model        Postgres (facts, profiles,     Redis (rate limits,
                 families: writer + checker)  inventory, reviews)          hot answer cache)
```

Build-time pipeline (`scripts/`, deterministic, committed outputs):
`docs/historical_data` → **dynasty registry** → **realm snapshots** → **board geometry**;
Wikidata (cached) → ruler birth/death → **computed facts**.

**Principle:** the static core (map, timeline, registry, verified facts) must work with **no
backend and no key**. The backend only adds live AI, sync, and leaderboard.

---

## 3. Global guardrails (apply to every slice)

1. **Existing `docs/guardrails/GUARDRAILS.md` must keep passing.** Any item we intentionally retire
   (e.g. "Who ruled here?" becoming optional) is changed in that file **only with explicit owner
   approval**, in the same PR.
2. **Persian-first.** Every new string ships with `en` + `fa`. Numbers/dates go through
   `formatYear` / `formatDuration`. RTL is checked on every new screen. Never an empty `fa: ""`.
3. **Iran network reality.** The browser talks only to our origin — no Google Fonts, no third-party
   CDNs, no direct calls to AI providers from the client (BYOK excepted, as an opt-in).
4. **Performance budgets (CI-enforced):** initial JS ≤ 250 KB gzip; the board renderer is
   lazy-loaded; LCP < 2.5 s on simulated Slow 4G; INP < 200 ms at 4× CPU throttle; no layout
   thrash during scrubbing.
5. **Honesty of data.** Nothing AI-generated is shown as fact without an "AI · unverified" badge
   until verified. Every verified fact has at least one source. Low-confidence data is *visibly*
   uncertain (fog/hatching), never rendered as certain.
6. **Privacy & safety of users (many are inside Iran).** No email, no phone, no location, no
   country flag on leaderboards. IPs never stored raw (salted hash, rotated daily, used only for
   rate limiting). Nickname is optional; default is "Explorer #NNNN". Users can delete their data.
7. **Secrets never reach the bundle.** CI greps `dist/` for key patterns. `.env.example` contains
   placeholders only.
8. **Cost control.** Hard daily AI spend cap + a kill-switch env var that turns live AI off
   without a deploy. Graceful UI when AI is off.
9. **Feature flags.** Every slice ships dark (`?ff=<flag>` / env) and is flipped on only after its
   DoD passes on a real phone.
10. **Small PRs.** One slice = one or more PRs, each with green `tsc`, unit tests, build, smoke
    tests, and a Vercel preview link tested on mobile.
11. **Accessibility.** Tap targets ≥ 44 px; `prefers-reduced-motion` respected; colour is never the
    only signal (labels, patterns, emblems carry identity too — there will be dozens of dynasty
    colours).
12. **Deterministic visuals.** Same year → same realms, same colours, same labels (existing
    `dynastyColor` guardrail, extended to per-dynasty colours).

---

## 4. Tracks and slice order

Two tracks can run in parallel once Slice 0 is done:

```
Track A (data + visuals):  S1 Registry → S2 Fragmentation quick win → S3 Board spike → S4 Board v1 → S10 Meanwhile → S11 Journey → S12 Games
Track B (backend + facts): S5 API proxy → S6 Fact engine → S7 Discovery UX → S8 Profiles & leaderboard → S9 Share cards
                                                   (S7 needs S4 for map sparkles; can start on the Leaflet map)
```

Sizes: **S** ≈ 1–2 days · **M** ≈ 3–5 days · **L** ≈ 1–2 weeks (one developer + agent).

---

## Slice 0 — Foundations & safety net

**Goal:** Make change safe: automated guardrails, CI, budgets, flags, and clean-up.
**Size:** M · **Depends on:** — · **Flag:** n/a

**Scope**
- Add **Vitest** for pure functions (year parsing, cache keys, formatters).
- Add **Playwright smoke tests** automating the automatable items of `GUARDRAILS.md`: region click
  opens detail, scrubbing changes region colours, language toggle flips RTL and labels, mobile
  sheet opens, timeline always visible on mobile.
- GitHub Actions CI: `tsc`, Vitest, `vite build`, Playwright smoke, **bundle-size budget check**,
  **secret grep on `dist/`**.
- Feature-flag helper (`src/lib/flags.ts`): URL `?ff=` + env defaults.
- Clean-up: delete unused `src/components/Map.tsx` and `src/diagnostics/`; move one-off root
  scripts (`add_rulers.ts`, `fix_*.ts/py`, `update_*.py`, `check*.ts`, `verify_map.html`) to
  `scripts/legacy/`; remove `.git-old/` from the working copy.
- Replace the real Thunderforest key in `.env.example` with a placeholder; rotate the key.

**Out of scope:** any UI change.

**Guardrails:** zero behaviour change; the deleted files must have no importers (verified by build).

**DoD**
- [ ] CI runs on every PR and is green on `main`.
- [ ] ≥ 8 guardrail items covered by Playwright on a mobile and a desktop viewport.
- [ ] Budget check fails the build if initial JS > 250 KB gzip.
- [ ] Secret grep fails the build if a key pattern appears in `dist/`.
- [ ] `.env.example` has no real keys; old Thunderforest key rotated.
- [ ] App behaves identically on a Vercel preview (manual pass of `GUARDRAILS.md`).

**S0 status (2026-10-28): implemented, pending owner items**
- [x] CI workflow added (`.github/workflows/ci.yml`: lint, unit, build, budget, secrets, e2e). *Not yet run on GitHub — it triggers on PRs and pushes to `main`; confirm green on the first PR.*
- [x] 11 distinct guardrail items automated in Playwright on desktop + mobile (19 runs pass): map render, region click, zoom, timeline visible, context strip, AI button disabled-not-hidden, era navigation changes colours, historian panel open by default, mobile drawer + timeline, EN/FA toggle + RTL + Persian digits, Cmd/Ctrl+K.
- [x] Budget check (250 KB; currently 188.7 KB) and secret grep, both negative-tested.
- [x] `.env.example` is placeholder-only. **Owner action: rotate the Thunderforest key** (the old one is in git history).
- [x] Cleanup: `Map.tsx`, `src/diagnostics/` removed; root scripts moved to `scripts/legacy/`; `.git-old/` git-ignored (not deleted — it holds `soft-launch-prep`/`v1-pre-launch` history).
- [ ] **Owner action:** manual pass of `GUARDRAILS.md` on a Vercel preview.
- Not automatable yet (manual): hover highlight, scrub-drag recolouring, touch swipe of the sheet, "Who ruled here?" caching (needs a key / server AI → S5).

**Findings from S0 for later slices**
- Both the mobile and desktop layouts are mounted at once (CSS-hidden): two Leaflet maps and two timelines run on every year change, and DOM ids (`tour-timeline-ai-*`) are duplicated. → fix in S4 (mount only the active layout).
- The curated data uses 35 region ids outside the 12 (satrapies/provinces such as `lydia`, `bactria`, `kirman`, `armenia`), all in `550–330-BC.json` and `224–651-AD.json`. → S1 must map or model them; S4 needs geometry for them. Locked by a unit test.

---

## Slice 1 — Canonical dynasty registry & realm snapshots (data)

**Goal:** One trustworthy source of "who ruled what, when" that the map, counter, facts and games
all read.
**Size:** L · **Depends on:** S0 · **Flag:** n/a (data only)

**Scope**
- `scripts/build-registry.ts` reads `docs/historical_data/*.json` and produces
  `src/data/generated/dynasties.json`:
  `{ id, name{en,fa}, aliases[], family, color, emblemSeed, overlordId?, start, end, wikidataId? }`.
- `data/registry/overrides.json` (hand-edited): merges ("Justanids" = "Justanid Dynasty"),
  Persian names, colours, overlord links. The script prints **every unresolved name**.
- Per-dynasty colour generator: hue band per family (Persian = violets, Turkic = ambers…), distinct
  lightness/saturation per dynasty, deterministic from id, contrast-checked against the board.
- `src/data/generated/realms.json`: **change-point snapshots** — only years where the set of
  polities changes. Each entry: `{ dynastyId, regionId, status, overlordId?, capital{lat,lng}?,
  confidence, sourceFile }`. Capitals resolved via `regions.ts` anchor cities.
- `scripts/enrich-wikidata.ts`: ruler birth/death years and Persian labels from Wikidata (CC0),
  **responses cached in the repo** so builds are offline and reproducible.
- Selector API: `getRealmsAt(year)`, `countDynastiesAt(year)`, `getReach(dynastyId|rulerId, year)`.

**Out of scope:** UI.

**Guardrails**
- Curated JSON files are **never edited by scripts** — only read. Corrections go into `overrides.json`.
- Every override has a comment/source.
- No name is silently dropped: unresolved names fail the script.

**DoD**
- [ ] 100% of curated entries map to exactly one registry dynasty (unit test).
- [ ] Every dynasty has `en` + `fa` name and a colour; no two share an id; colours are stable
      across runs (snapshot test).
- [ ] `countDynastiesAt(1000)` and `countDynastiesAt(1750)` hand-checked against a reference
      list, and the reasoning is written in `data/registry/VALIDATION.md`.
- [ ] Wikidata cache covers all rulers in `rulers.ts`; missing dates are listed, not guessed.
- [ ] Bundle impact of generated data measured and within budget (lazy-load per era if needed).

**S1 status (2026-10-28): implemented, 2 items blocked/open**
- [x] `scripts/registry/build-registry.ts` → `src/data/generated/{dynasties,realms,dynasties.audit}.json`; `npm run registry:build` (strict) and `registry:check` (CI fails if generated files drift).
- [x] 459 raw names → 238 dynasties, merges each with a written reason; one undated entry skipped with a reason.
- [x] Per-dynasty colours: disjoint hue bands per family, pairwise distinct, contrast ≥ 3:1 on the board background; snapshot-tested.
- [x] Selector API `src/data/registry.ts`: `getRealmsAt`, `countDynastiesAt`, `getActiveDynastyIds`, `getReach`, `changePoints`.
- [x] Shared robust year parser (`src/lib/yearRange.ts`) — fixed 23 mixed BC/AD entries read backwards by the old parser.
- [x] `data/registry/VALIDATION.md`: counts + hand check of 1000 AD + known gaps.
- [ ] **Wikidata ruler dates not fetched** — `www.wikidata.org` is blocked in this sandbox. Script is written but untested; needs (a) host allowed in the environment's Network settings, (b) curated QIDs in `data/registry/ruler_qids.json`. Needed for the computed facts in S6 (e.g. Yazdgerd III's age).
- [ ] **Owner/native review of the 238 Persian names** (AI-drafted).
- Deviations: realms are stored as per-entry spans (compact) instead of change-point snapshots — `changePoints()` derives them; capitals/overlord links are deferred (no source data; capitals arrive with the board in S3/S4).

---

## Slice 2 — Fragmentation, quick win on the current map

**Goal:** Ship goal #1 early, before the new renderer: people *see* that many dynasties ruled at once.
**Size:** M · **Depends on:** S1 · **Flag:** `ff_fragmentation`

**Scope**
- Map colours **per dynasty** from the registry (replaces family colouring).
- Regions with several concurrent realms show them all: split hatching or a stacked banner chip per
  region listing each dynasty (tap → detail).
- HUD counter: **"In 1000 AD · 14 dynasties"** (fa: Persian numerals), animated on change.
- **Reach lens:** tapping a ruler/dynasty dims everything outside its control, with a caption
  ("Mahmud held 5 of 12 regions — the Buyids held Rey, the Ziyarids Tabaristan…").
- Legend becomes contextual (only dynasties visible now), not a fixed key.

**Guardrails**
- `MapLeaflet` `Props` interface unchanged (1:1 swap guardrail).
- Same year → same colours (snapshot test on 5 sample years).
- Scrubbing INP budget holds with the counter and chips.

**DoD**
- [ ] At 1000 AD the map shows ≥ 10 distinct, labelled dynasties.
- [ ] Counter correct for 10 sampled years (unit test against `countDynastiesAt`).
- [ ] Reach lens works on mobile and desktop; works for the 26 static rulers.
- [ ] `fa` mode: labels, counter, captions fully Persian; RTL correct.
- [ ] Playwright guardrail suite green; manual phone test on a mid-range Android.

**S2 status (2026-10-28): implemented behind `?ff=fragmentation`, pending owner items**
- [x] Per-dynasty colours on the Leaflet map (registry-driven; falls back to the old logic for regions with no registry data). `MapLeaflet` `Props` unchanged.
- [x] Concurrent realms: second realm tinted under the first; one chip per dynasty in every region ruled by ≥2 (names on desktop / zoom ≥ 6, dots-only on small zoom); tap a chip → reach lens.
- [x] HUD counter ("18 dynasties ruling · 1040 AD", Persian digits in `fa`) with a tap-through list; counter is tested equal to the realms drawn for 6 sampled years.
- [x] Reach lens: dims everything the dynasty didn't hold; caption "X held N of 12 regions in Y — alongside A, B +k" (en/fa). Triggered from chips, the counter list, or the desktop legend.
- [x] Legend is contextual (only dynasties ruling now) in fragmentation mode; the old family legend is hidden on mobile in this mode.
- [x] 8 new unit tests + 5 e2e tests (desktop + mobile); full suite 51 unit / 28 e2e green on a fresh build.
- Still to do before turning the flag on by default (owner): manual phone check on a mid-range Android; native review of Persian strings; decide whether chips at ~1750 (41 dynasties) need a cap/clustering — chips already cap at 3–4 per region with "+N".
- Known limits: lens is triggered from dynasties only (not yet from ruler cards); the lens is not cleared automatically when the year changes (caption then says "not active in <year>"); hover recolour on desktop is the pre-existing 1.5× opacity rule.

---

## Slice 3 — Board renderer spike & art direction (decision slice)

**Goal:** Choose the rendering tech and the visual identity with evidence, not taste alone.
**Size:** M · **Depends on:** S1 · **Flag:** `ff_board_spike` (preview only)

**Scope**
- **Art direction: modern Western grand-strategy** (Paradox / Total War campaign feel; decided by the owner). Dark relief-style land, glowing realm borders, large letter-spaced realm names, fog where data is thin, map modes. No Persian-miniature or manuscript styling.
- **Build-time projection:** `scripts/board/project.ts` projects region and neighbour GeoJSON into
  board coordinates (conic equal-area centred on Iran) — no tiles, no runtime projection.
- **Realm geometry:** capital-based cells clipped to region polygons (d3-delaunay + turf), merged
  per dynasty → one shape per realm per snapshot. Output per era, lazy-loadable.
- **Terrain base:** stylised from public-domain Natural Earth shaded relief → WebP at 2 levels.
- **Prototype both renderers on the same 3 eras** (Achaemenid, 1000 AD, 1750):
  - SVG + motion (lightest).
  - PixiJS WebGL 2D layers (glow, fog shader, particles) + SVG overlay for labels (browser shapes
    Persian correctly; `textPath` for curved names).
- Measure on throttled mobile: FPS while panning, INP while scrubbing, memory, chunk size.

**Out of scope:** replacing the production map.

**Guardrails:** three.js is **not** used for the core map (bundle, battery, Persian text). A
three.js "hero" moment can be proposed later as a lazy, capable-device-only extra.

**DoD**
- [x] Art direction decided by the owner: modern Western grand-strategy.
- [ ] Decision record `docs/adr/001-board-renderer.md` with measured numbers for both renderers.
- [ ] Chosen renderer meets: ≥ 50 fps pan on 4× CPU throttle, scrub INP < 200 ms, renderer chunk
      ≤ 150 KB gzip (lazy), terrain first view ≤ 250 KB.
- [ ] Persian curved labels render correctly (screenshot in the ADR).

**S3 status (2026-10-28): spike done, ADR proposed, one owner check open**
- [x] `scripts/board/build-board.ts`: Natural Earth 50m land/lakes/rivers + the 12 regions + neighbours, conic equal-area projection, simplified → `src/data/generated/board/` (geometry 54 KB / 20 KB gz, cells 16 KB / 2.4 KB gz). No tiles.
- [x] Three renderers on one scene model (`src/board/`): SVG, **SVG with composited layers**, PixiJS. Spike page: `?ff=board_spike&renderer=svg|svgl|pixi&year=…&lang=fa` (lazy, not in first load; first-load JS still 189 KB).
- [x] Measured (sandbox, no GPU): composited SVG 60 fps pan at 4× CPU throttle, scrub p95 68 ms, renderer 1.5 KB gz. Pixi 90.7 KB gz and unmeasurable without a GPU. Details and caveats: `docs/adr/001-board-renderer.md`.
- [x] Persian labels shape correctly on the board (en/fa screenshot-verified); label collision + one label per dynasty (unit-tested).
- [ ] **Owner check:** run the spike on a real mid-range Android + iPhone (see ADR) → then ADR 001 moves to Accepted.
- [ ] Not done in S3 (moved to S4): curved `textPath` labels, relief/terrain, schematic-cell visual treatment, fog art.
- Honest caveat: realm cells are Voronoi splits of region polygons seeded at anchor cities — *schematic*, because the data has no internal borders.

---

## Slice 4 — Board v1 (replaces Leaflet)

**Goal:** The strategy-game map in production.
**Size:** L · **Depends on:** S2, S3 · **Flag:** `ff_board`

**Scope**
- Layers: terrain → realm territories → borders (thick between realms, faint within) → fog
  (no data / low confidence) → capitals & emblems → event/figure/vazir tokens → labels.
- **Map modes** (game-style toggle): Political · Fragmentation (count heat) · Family · Terrain.
- **Zoom tiers:** strategic (realms + big names) → regional (sub-territories, cities, tokens).
- **Camera:** pinch/pan/zoom, `flyTo(regionId|bbox)`, eased; respects reduced motion.
- **Transitions:** realm morph on change (flubber), border "burn" on conquest, capital pulse.
- **Procedural emblems** per dynasty (banner shape + colour + symbol from `emblemSeed`).
- Neighbours drawn and named for the current year.
- No-WebGL fallback: static SVG of the same data.
- Remove Thunderforest tiles and the tile service worker once the flag defaults on.

**Guardrails**
- Same `Props` as `MapLeaflet` (drop-in swap); all MAP items of `GUARDRAILS.md` pass.
- Budgets from S3 hold in CI (Playwright perf run).
- Labels never overlap illegibly: collision handling or hide-by-priority.

**DoD**
- [ ] Every MAP and TIMELINE guardrail passes on the board (automated where possible).
- [ ] All three device classes tested: low Android, iPhone, desktop.
- [ ] Fog appears exactly where confidence is low/no data (unit test on snapshot → fog mask).
- [ ] `fa` labels correct, including curved names; `en`/`fa` toggle swaps labels instantly.
- [ ] Leaflet, react-leaflet, Thunderforest, tile SW removed from the bundle; budget improves.

**S4 status (2026-10-28): Board v1 built behind `?ff=board`; Leaflet still the default**
- [x] `MapBoard` (`src/board/`) is a drop-in for `MapLeaflet` (same props, `mapProps.ts`); `App.tsx` swaps it lazily by flag. Layers: base (sea/land/coast glow/rivers/neighbours/ghost extents) → realms → overlay (curved labels, emblems, cities by zoom tier, event/artifact/vazir tokens). Pan/zoom only changes a CSS transform.
- [x] Realm cells for **any year** computed at runtime (Voronoi seeded at anchor cities, ~1 ms; unit-tested to tile each region), so the whole timeline works, not just sample years.
- [x] Map modes: Realms · Cultures (family) · Fragmentation (heat + realm count per region) · Terrain. Fog hatch for regions with no data; hatch overlay on low-confidence cells.
- [x] Camera: drag / wheel (zoom at cursor) / pinch / +,− / reset, eased `flyTo`, clamped to the board, reduced-motion aware; zooms out far enough to frame the plateau on a portrait phone. Reach lens flies to the regions the dynasty held.
- [x] Procedural emblems per dynasty (tap = reach lens); curved (`textPath`) realm labels, collision-free, en + fa; one counter/HUD shared with Slice 2.
- [x] **Fixed: App no longer mounts both mobile and desktop layouts** (two maps/timelines + duplicate DOM ids). Verified by a unique-id test.
- [x] Vazir dots now actually render (the old map was never given the vazir list).
- [x] Tests: 17 new unit (cells tiling, clipping, camera clamp/frame, projection, emblems), 7 new e2e on desktop + mobile (realms, no duplicate ids, tap → region detail, zoom/reset, drag pan without opening a region, modes, lens, Persian, Leaflet still default). Totals: 77 unit, 46 e2e. First-load JS 189.6 KB; board chunks load only with the flag (MapBoard 8.4 KB + vendor-board 26.7 KB gz).
- [ ] **Not done, by decision:** realm *morph* between years (flubber) → replaced by fade-in + "border burn" on newly appearing realms; terrain relief; removal of Leaflet / react-leaflet / Thunderforest / tile service worker (only once the flag defaults on and the owner has checked real phones).
- [ ] **Owner checks before flipping the flag:** (1) phone test on Android + iPhone (drag, pinch, tap, lens, fa); (2) tap targets for events/figures/heritage tokens (e2e does not cover them yet); (3) decide whether schematic cells need an on-map "approximate borders" note.
- Known limits: cells are schematic (Voronoi, see S3 caveat); regions with more realms than seeds (8) hide the weakest realm's cell (still counted); label collision is computed once at overview zoom.

---

## Slice 5 — Backend foundation: AI proxy (no forced BYOK)

**Goal:** Live AI for everyone, safely and cheaply, reachable from Iran.
**Size:** M · **Depends on:** S0 · **Flag:** `ff_server_ai`

**Scope**
- Vercel Functions (region `fra1` or nearest to Iran): `/api/ai/ask` with typed tasks
  (`ruler_detail`, `dig_deeper`, `meanwhile`, `quiz`) — **no free-form prompt passthrough**.
- OpenRouter client server-side; model per task from config; max tokens per task.
- Redis: per-IP-hash and per-device rate limits; global **daily spend cap**; kill switch
  `AI_ENABLED=false`.
- **Shared answer cache:** key = task + entity + year bucket + lang. First user pays, everyone else
  gets it instantly.
- Client: `geminiService` gets a transport layer → server by default, BYOK direct as opt-in.
- CSP `connect-src` reduced to `'self'` (+ Google only if BYOK enabled).

**Guardrails**
- Keys live only in Vercel env. CI secret grep stays green.
- Logs contain no raw IPs and no user keys.
- Provider terms reviewed for serving users in Iran; documented in `docs/adr/002-ai-provider.md`.

**DoD**
- [ ] From an Iranian network (or VPN-off test via a tester), "Who ruled here?" works with no key.
- [ ] Rate limit and spend cap verified by an automated test; kill switch tested.
- [ ] Cache hit rate visible in logs; repeated request returns < 300 ms.
- [ ] BYOK path still works for users who prefer it.

**S5 status (2026-10-28): implemented and tested offline; OFF in production until you set env vars**
- [x] `POST /api/ai/ask` with **typed tasks only** (`year_dynasties`, `ruler_detail`, `events`, `figures`, `artifacts`, `quiz`, `dig_deeper`): strict param validation, server-built prompts, schema validation + one repair retry, mechanical guards, no free-form prompt possible. `GET /api/ai/status`, owner-only `GET /api/ai/usage`.
- [x] OpenRouter client (`deepseek/deepseek-v4.1-flash-1017`, per-task override via env), JSON mode, timeout, token ceilings per task.
- [x] Upstash Redis (REST, no dependency) for limits, cache and usage; memory store for dev/tests; production **refuses** to serve without a durable store.
- [x] Shared answer cache (first user pays) with in-flight de-duplication; cache hits ≈ 5 ms in the HTTP check.
- [x] Limits: per-device/min and /day, per-IP/min (paid calls only), loose per-IP ceiling for hits, global daily token breaker, kill switch (`AI_ENABLED`, default off). All env-tunable.
- [x] **Measure first:** per-task requests/hits/errors/tokens, hourly curve, and a per-device daily-token histogram (1k…250k) so you can pick per-user / per-minute limits from real data. Privacy: IP and device are salted-hashed with the UTC day; never stored or logged raw (tested).
- [x] Client: `aiTransport` + routing inside `geminiService` (personal key always wins); AI buttons enable via `canUseAi` when the server is ready; friendly en/fa errors that point to the BYOK option.
- [x] Bug fixed: AI events/artifacts used an invented 0–1000 coordinate grid but the map plots `[lat, lng]`; prompts fixed, out-of-atlas values dropped (BYOK path too).
- [x] Tests: 40 server/unit (kill switch, origin, validation, cache, concurrency, every limit and window reset, budget, repair/422, provider errors, guards, privacy, usage report, Upstash protocol, OpenRouter client) + 10 e2e (desktop + mobile).
- [x] Deployable bundles `api/ai/{ask,status,usage}.js` (esbuild, committed; CI `api:check`). Checked end-to-end over real HTTP against a fake provider.
- [ ] **Owner to do:** create the Upstash database and set the env vars (docs/AI_SERVER.md); then try `?ff=server_ai` on a preview. **Not verified against real OpenRouter / Upstash / Vercel** (no network or keys in the sandbox).
- [ ] **Open:** provider terms for serving users in Iran (docs/adr/002-ai-provider.md) — not resolved by research; needs the owner's reading of the current terms.
- Not in this slice: biography / alternate-history / what-if / lineage / chat / search still BYOK-only; BYOK prompts still duplicate the server prompts (consolidation planned with S6); per-user token *caps* are measured but not enforced.

---

## Slice 6 — Fact engine: computed facts, AI facts, fact-checking

**Goal:** A pipeline that produces *surprising and correct* facts, and stores every fact users find.
**Size:** L · **Depends on:** S1, S5 · **Flag:** `ff_facts`

**Fact model (Postgres)**
```
facts(id, entity_type, entity_id, year, kind[computed|ai|curated], hook{en,fa}, claim{en,fa},
      context{en,fa}, sources[], confidence, status, hash, first_discoverer_id, created_at)
status: unverified → ai_checked → verified | disputed | rejected
fact_reviews(fact_id, reviewer, verdict, notes, at)   fact_reports(fact_id, profile_id, reason, at)
```

**Scope**
1. **Computed facts (zero AI):** generated at build time from registry + Wikidata — ages at
   accession/death, reign lengths, youngest/oldest/shortest, "N dynasties ruled at once",
   "X ruled while Y ruled in Z". Shipped as static `verified` facts.
2. **AI facts (live, "dig deeper"):** writer model returns 1–3 candidates in a strict JSON schema
   with sources and confidence.
3. **Automatic checks before anyone sees a fact:**
   - deterministic: any number/date in the claim is checked against the registry/Wikidata
     (e.g. an age must match computed age ±1);
   - **second model from a different family** judges each claim → supported / unsupported /
     uncertain;
   - dedupe: same entity + normalized text hash + trigram similarity.
4. **Human review queue:** protected `/admin/review` page, sorted by how many users found the fact.
   Approve / edit / reject. Approved facts are exported to `data/facts/verified/*.json` (git-auditable,
   matching "claims need a source").
5. **User reports** ("this is wrong") send a fact back to review; a rejection after verification
   revokes its points.

**Guardrails**
- `unsupported` or `rejected` facts are **never shown**. `ai_checked` facts show an
  "AI · checked, not yet reviewed" badge. Only `verified` facts carry no badge.
- A fact without at least one source cannot reach `verified`.
- Politically sensitive eras (20th century onward) require human review before display.

**DoD**
- [ ] ≥ 200 computed facts generated, spot-checked (20 random, documented).
- [ ] The Yazdgerd III example is produced as a *computed* fact from dates, not from AI.
- [ ] Deterministic checker rejects a planted wrong age in a test.
- [ ] Review queue works end-to-end; export produces valid JSON; verified facts load with no backend.

**S6 status (2026-10-28): engine built and tested offline; 3 owner actions open**
- [x] **249 computed facts** (no AI; 210 verified, 39 held `unverified` until their source dates are confirmed): reign lengths/extremes, concurrency counts/peak/trough/jumps, per-region fragmentation peaks, dynasty reach, dynasty overlaps, ages and contemporaries. Bilingual, each with `derivedFrom` + sources; 20th century excluded (sensitive-era rule). `data/facts/SPOT_CHECK.md` = 20 sampled facts with raw inputs; a unit test re-derives the same families with independent code.
- [x] **Yazdgerd III is a computed fact** ("lived about 27 years", "took power at about 8") from dates, not AI — held back as `unverified` until the dates in `data/facts/lives.json` are confirmed (owner or Wikidata).
- [x] **Deterministic checker** rejects a planted wrong age (also wrong reign length / birth / death year / English-vs-Persian number mismatch); proven in unit tests and over real HTTP.
- [x] **AI facts pipeline** `POST /api/facts/dig`: writer (bilingual, sources required) → arithmetic → judge from a *different vendor* → number-aware dedupe → store; stored facts served first, writer at most once per entity per day. Fails closed (no checker ⇒ nothing AI-written is shown).
- [x] **Guardrails enforced in code:** rejected/unsupported never shown; ai_checked shown with badge; no source ⇒ cannot be verified; sensitive era ⇒ human first.
- [x] **Review queue** `#/admin/review` (ordered by times found, checks and verdict visible, approve / edit / reject / dispute / reopen, reported list, validated Export → `data/facts/verified/ai.json`); `npm run facts:export`. **User reports** pull a fact back to review at a threshold; rejecting a verified fact writes `points_revoked` for Slice 8.
- [x] Static facts load with **no backend** (`staticFacts()`); tests: 56 new unit (facts model/check/computed/loader + 18 server flow tests) + 5 e2e for the review page. CI: `facts:check`, `api:check`.
- [ ] **Owner:** confirm the dates in `data/facts/lives.json` (Yazdgerd III first) or unblock Wikidata + add QIDs; **set `AI_CHECKER_MODEL`** (non-DeepSeek) or no AI fact will ever show; native review of Persian wording.
- [ ] Not verified against real OpenRouter/Upstash. Facts are not yet displayed in the app (Slice 7). Deviations: Redis not Postgres (git export is the durable record). See `docs/adr/003-fact-engine.md`.

---

## Slice 7 — Discovery UX: hidden facts on the map

**Goal:** Free exploration that rewards curiosity.
**Size:** M · **Depends on:** S6 (S4 for board polish; can start on Leaflet) · **Flag:** `ff_discovery`

**Scope**
- Sparkles hidden on the map/timeline at entities that have undiscovered facts; revealed by
  exploring (tapping a realm at a year, zooming into a city, dwelling on an era).
- **Fact card:** hook in big type ("He was 27."), two sentences of context, source line,
  verification badge, *Dig deeper*, *Share*, *Report*.
- *Dig deeper* calls S6 live (with cost-aware limits per device per day).
- **Local inventory** first (works offline / without backend): found facts stored on device.
- Progress: "34 / 500 facts found", per-era completion rings.

**Guardrails**
- No sparkle spam: max N visible at once, prioritized by rarity and relevance.
- Discovery never blocks map interaction (no modal storms on mobile).

**DoD**
- [ ] A new user finds their first fact within 60 seconds without instructions (5-person hallway test).
- [ ] Inventory survives reload and offline mode.
- [ ] Full flow works in `fa` and `en` on phone.

**Status (done, behind `?ff=discovery`):**
- [x] `✦ Discover` pill (progress "N / total found" + completion ring) always hands out the nearest unfound fact; tapping a hidden sparkle on the board (max 3, one per region, nearest in time first, stable while scrubbing) opens the same card.
- [x] Fact card: hook in big type, claim, context, sources, "AI · checked" badge for non-verified facts, *Dig deeper* (only when the shared AI is on; calls `/api/facts/dig`), *Share* (native share sheet or copy), *Report* (`/api/facts/report`). Not modal; on phones it hangs from the top because the bottom sheet covers the lower map.
- [x] Local inventory in `localStorage` (`xtory_found`), survives reload and works offline (static facts need no backend).
- [ ] Sparkles exist on the board only (Leaflet map has the Discover button but no sparkles); per-era completion rings and the 5-person hallway test are still open.
- Try it: `/?ff=board,discovery` (add `,server_ai` for Dig deeper).

---

## Slice 8 — Profiles (optional nickname), synced inventory, leaderboard

**Goal:** Collections and competition without accounts or personal data.
**Size:** L · **Depends on:** S6, S7 · **Flag:** `ff_leaderboard`

**Scope**
- `POST /api/me` creates an anonymous profile → `{ profileId, secret }` stored on device.
- Optional nickname: length/charset rules, fa+en profanity list, reserved names, uniqueness.
- **Recovery code** (shows the secret as words) to move to another device — no email.
- Inventory sync: local → server merge, idempotent.
- **Anti-cheat:** a fact can only be claimed if the server served it to that device; daily caps;
  anomaly flags.
- **Points:** +1 per fact found; +5 first discoverer of a new AI fact *when it becomes verified*;
  rarity bonus. Points from rejected facts are revoked.
- Leaderboards: all-time, weekly, per era. Public profile page `/u/:nickname` (inventory showcase).
- `DELETE /api/me` removes everything.

**Guardrails** — Global guardrail 6 in full. Leaderboard shows nickname + points only.

**Status (done, behind `?ff=leaderboard`, needs `?ff=board,discovery,leaderboard`):**
- [x] `POST /api/me` (`create` / `recover` / `sync` / `nickname` / `delete`, plus `DELETE /api/me`), `GET /api/leaderboard?board=all|week|<eraId>` and `?nick=` (public showcase, named players only). Code: `server/profile/`.
- [x] Anonymous profile: random id + **8-word recovery code** (256-word list, 64 bits) which is the only credential; stored server-side only as a salted hash. Creation, recovery attempts and sync are rate limited per hashed IP.
- [x] Nickname: 3–20 chars, letters/digits/`_`/`-`, reserved names, small fa+en profanity list with leet/ZWNJ normalisation (**starter list, extend `BANNED` in `server/profile/nickname.ts`**), unique case/separator-insensitive. Default public name "Explorer #NNNN".
- [x] Sync is idempotent; points are **recomputed from the inventory on every sync**: +1 per fact, +1 rarity (first 3 claimants), +5 first claimant of an AI fact once it is verified; facts the owner later rejects/disputes stop counting at the next sync (revocation).
- [x] Anti-cheat: unknown ids rejected; AI facts need the server to have served them to that device (`/api/facts/dig` records `sv:<deviceHash>:<id>`, 2 days); 80 new claims per profile per UTC day; rejects raise an anomaly counter.
- [x] UI: trophy button beside Discover → profile sheet (join, nickname, show/copy code, restore, tabs All time / This week / per era, sign out, delete) and `#/u/<nickname>` showcase. fa + en, RTL.
- [ ] Not yet: per-profile anomaly review screen (flags are counted, not shown); leaderboard caching; weekly board history; revocation is lazy (next sync), not pushed.
- Audit: `server/profile/profile.test.ts › privacy audit` dumps every key/value and log line after a full session and asserts no raw IP, device id or recovery code is present.

**DoD**
- [x] Profile, nickname, recovery and deletion tested end-to-end (unit + Playwright).
- [x] Claiming an unserved fact is rejected (automated test).
- [x] Weekly board resets correctly (time-travel test).
- [x] No raw IP or user key in any table or log (audit test above).

---

## Slice 9 — Share cards

**Goal:** Every fact and every collection is a beautiful, shareable card, Telegram-first.
**Size:** M · **Depends on:** S7 (S8 for collection cards) · **Flag:** `ff_share`

**Scope**
- **Image card rendered in the browser** (canvas): correct Persian shaping guaranteed. Shared via the
  Web Share API with the image file (mobile), download fallback (desktop).
- **Link unfurls:** `/f/:factId` and `/u/:nickname` return small HTML with OG/Twitter tags, then
  open the app at that fact/profile.
- OG image generation server-side: **spike first** — check Persian shaping in Satori (`@vercel/og`).
  If it fails: generate the OG image once at verification time, or use the era banner + English
  title for OG while the in-app image card stays fully Persian.
- Card designs: Fact card, "My collection" card (count, rank, rarest fact), weekly rank card.

**Guardrails** — No personal data on cards beyond the chosen nickname. Card text stays inside the
safe area for Telegram/X/WhatsApp crops.

**DoD**
- [ ] Sharing a fact to Telegram from Android and iPhone shows image + correct Persian text.
- [ ] Pasting `/f/:id` into Telegram unfurls with title, description and image.
- [ ] Cards checked in both languages and in dark/light Telegram themes.

---

## Slice 10 — Meanwhile: neighbours at the same time

**Goal:** Show how other nations were doing in the same era.
**Size:** M · **Depends on:** S4 (S5 optional) · **Flag:** `ff_meanwhile`

**Scope**
- Static dataset `data/meanwhile/*.json`: one snapshot per 25-year bucket for Rome/Byzantium,
  China, India, Egypt/Arabia, Europe — one line each + one metric. AI-drafted, human-reviewed,
  sourced.
- Board: neighbours named for the year; **edge arrows** ("→ Tang China") for off-map civilizations.
- **Versus bars** (game stat-card style): empire size, largest city, notable firsts. Datasets:
  Taagepera empire sizes, Seshat, Chandler / Reba et al. city populations — **licenses checked and
  recorded** in `data/meanwhile/SOURCES.md`.

**DoD**
- [ ] Coverage for every 25-year bucket from 700 BC to 1979.
- [ ] Every metric has a source; licence notes complete.
- [ ] Works with no backend.

---

## Slice 11 — Journey mode (story chapters)

**Goal:** The guided, game-like path for casual users (from our earlier discussion).
**Size:** L · **Depends on:** S4, S6 · **Flag:** `ff_journey`

**Scope**
- Chapters = the 16 `historianCards` eras on a level path. Each chapter = 5–7 story beats tapped
  through like Stories; each beat scripts the board camera (fly, highlight, morph, pulse).
- Beat schema `data/journey/<eraId>.json`: `{ text{en,fa}, camera, highlights[], realmsAt, image? }`.
  AI-drafted, human-edited, sourced.
- End-of-chapter quiz (myth vs reality, 3 questions) → stars, unlock next chapter, reward card into
  the inventory.
- Deep links `/journey/:eraId/:beat`. Journey becomes the default mode; Atlas stays one tap away.
- The Joyride tour is retired (chapter 1 teaches the app).

**DoD**
- [ ] All 16 chapters authored in en + fa; each ≤ 90 s.
- [ ] Hallway test: 4 of 5 non-history people finish chapter 1 and start chapter 2 unprompted.
- [ ] Deep links open the exact beat; shared from Telegram.

---

## Slice 12 — Games & progression

**Goal:** Replayable mechanics that teach the "many dynasties" truth.
**Size:** M · **Depends on:** S4, S8 · **Flag:** `ff_games`

**Scope**
- **Paint the empire:** paint what you think a famous ruler controlled → reveal → score.
- Achievements (e.g. "Found 10 facts from the Seljuk era", "Painted 5 empires perfectly").
- Light XP / streaks feeding the leaderboard.
- Sound and haptics (Android vibration; iOS gets visual feedback only).

**DoD**
- [ ] Paint mode works by touch on a phone; scores match `getReach()` (unit tests).
- [ ] Achievements sync to profile; appear on share cards.

---

## 5. Explicitly NOT doing (for now)

- three.js / 3D for the core map.
- Accounts with email/phone, social login.
- User-written facts (users *discover* facts; they don't author them) — avoids moderation of free text.
- Free-form chat through the server proxy (only typed tasks).

---

## 6. Decisions needed before Slice 0 starts

| # | Decision | Recommended default |
|---|---|---|
| D1 | Add a backend (changes the README's "no server, no database" stance) | **Yes** — Vercel Functions + Postgres (e.g. Neon) + Redis (e.g. Upstash); static core still works without it |
| D2 | AI provider and monthly budget | OpenRouter, a cheap writer model + a different-family checker model; set a monthly cap (you choose the amount) |
| D3 | Who reviews facts | You (owner) via `/admin/review`, with export to git; add trusted reviewers later |
| D4 | Art direction | **DECIDED: modern Western grand-strategy** (owner, 2026-10-28). No Persian-miniature / manuscript direction. |
| D5 | Leaderboard visibility | Public, nickname-only, opt-in to appear (default hidden until a nickname is set) |
| D6 | Thunderforest key | Rotate now (S0); tiles removed entirely in S4 |
| D7 | Journey vs Explore as default landing | Journey default once S11 ships; until then, Explore with the counter + discovery |

### Confirmed (2026-10-28)

All recommended defaults above are accepted. Additions:

- **D2 model:** `deepseek/deepseek-v4.1-flash-1017` via OpenRouter as the writer model. Model id lives in
  server config (env), never hardcoded in the client.
- **Usage limits are deferred until we have real data.** S5 must therefore ship with
  *measurement first*: log tokens in/out per request (task, cache hit/miss, anonymous profile/device
  hash — never raw IP). All limits are env-configurable, with generous placeholder defaults and a
  report script, so we can later pick between **tokens per user per day**, **tokens per minute**,
  or **requests per minute** from observed numbers. The global kill-switch and a coarse global
  daily cap stay on from day one.
- **Fact-checker model (S6):** the checker must be a different model family from the writer, so it
  is not DeepSeek. To be chosen when S6 starts.
