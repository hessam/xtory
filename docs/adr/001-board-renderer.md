# ADR 001 — Board renderer for the strategy-game map

- **Status:** Proposed (Slice 3 spike). Needs one real-device check by the owner before Slice 4 starts.
- **Date:** 2026-10-28
- **Art direction (decided by the owner):** modern Western grand-strategy. No Persian-miniature or manuscript styling.

## Context
The map must read like an advanced strategy game: land/sea, glowing realm borders, large realm names, fog where data is thin,
and a camera that stays smooth on low-end Android over slow networks. Persian (RTL) labels must shape correctly.
Today's Leaflet + Thunderforest map cannot show more than one dynasty per region, needs a third-party tile host
(blocked/slow in Iran) and mounts twice (mobile + desktop layouts).

## Options built and measured (same scene model, `src/board/model.ts`)
| | A. SVG (single tree) | **B. SVG, composited layers** | C. PixiJS 8 (WebGL 2D) |
|---|---|---|---|
| How the camera moves | `transform` attribute on a `<g>` | CSS `transform` on a wrapper; base + realms are two bitmap layers; re-raster after the camera settles | container position/scale |
| Renderer code (gzip) | 1.5 KB | 1.5 KB | **90.7 KB** (+ pixi.js) |
| Board data (gzip) | 22.8 KB (geometry 20.4 + cells 2.4) | same | same |
| Pan/zoom, desktop (60 fps ceiling) | 26 fps | **60 fps** | 6 fps* |
| Pan/zoom, Pixel 7 emulation, 4× CPU | 41 fps | **60 fps** | 3 fps* |
| Year scrub median / p95, 4× CPU | 34 / 51 ms | 51 / 68 ms | 1046 / 1155 ms* |
| JS heap | 7.5 MB | 6.6 MB | 29 MB |
| Persian text | native shaping, `textPath` possible | same | canvas-shaped `Text` sprites (correct, no curved text) |
| Tile server / API key | none | none | none |

\* **Not a fair number.** The sandbox has no GPU (Chrome uses SwiftShader software GL), so WebGL results are meaningless for real
phones. SVG/CSS numbers are valid as a *lower bound* (CPU rasterisation). Empty-page ceiling in the same sandbox: 60 fps.
Method: `?ff=board_spike&renderer=svg|svgl|pixi`, `window.__board.bench()` = 3 s scripted pan+zoom, then 25 year changes
(state change → two painted frames); median of 3 runs; Playwright + CDP `Emulation.setCPUThrottlingRate`.

## Decision (recommended)
**Option B — SVG with composited layers** as the Slice 4 renderer.
- Meets the Slice 3 targets in the sandbox: ≥ 50 fps pan at 4× CPU (60), scrub p95 < 200 ms (68 ms), renderer ≤ 150 KB (1.5 KB), board data ≤ 250 KB (23 KB gz).
- Zero extra dependencies; labels use the browser's own text shaping (Persian correct); easy to test (DOM) and to make accessible.
- Glow is done with stacked strokes (cheap), not blur filters.
- Pixi stays out of the product bundle. Revisit **only if** a real-device test shows B below target or Slice 4 needs shader effects (animated fog, particles). The spike code and `pixi.js` dependency are kept until that check, then removed or promoted.

## Consequences / risks
1. **Realm cells are schematic.** The curated data says *who* ruled a region, not where internal borders ran. Cells are Voronoi splits seeded at anchor cities. Slice 4 must draw them as approximate (soft edges / "approximate borders" note) and must not present them as precise.
2. Region polygons are the existing hand-drawn 12; coasts come from Natural Earth 50m (public domain) and are clipped at draw time with an SVG `clipPath` (build-time boolean clipping failed on 81 cells and is not needed).
3. Composited layers keep a stale bitmap while zooming; we re-raster 160 ms after the camera settles. Verified crisp at ~4× zoom in headless Chrome; confirm on iOS Safari.
4. Labels are rotated straight text with collision handling (one per dynasty, biggest cell first). **Curved labels (`textPath`) are not built yet** — Slice 4.
5. No terrain relief yet (flat land + coast glow + rivers). Relief raster hosts are blocked in the sandbox; vector hillshade or a small WebP can be added in Slice 4.

## Owner check (needed to move this to Accepted)
Open a Vercel preview with `?ff=board_spike&renderer=svgl&year=1750` on a mid-range Android phone and an iPhone: drag and pinch,
read the fps badge (top right) and note smoothness; try `renderer=svg` for comparison and `lang=fa` for Persian.
