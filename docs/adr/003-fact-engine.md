# ADR 003 — Fact engine (computed facts, AI facts, checking, review)

- **Status:** Implemented (Slice 6). Server parts are off until the AI server is configured (docs/AI_SERVER.md); static facts work with no backend.
- **Date:** 2026-10-28

## Principles
1. **Arithmetic beats opinion.** Numbers in a claim are checked against structured data before any model is asked.
2. **A model never grades itself.** The judge must be a different vendor than the writer; if it isn't (or isn't configured), nothing AI-written is shown.
3. **Fail closed.** Anything not positively checked stays hidden; a failing judge never promotes a fact.
4. **A human decides what is "verified".** Verified facts live in git (`data/facts/verified/ai.json`), so `git log` is the audit trail.

## Fact lifecycle
`unverified → ai_checked → verified`, or `disputed` / `rejected` at any point (`src/facts/model.ts`, legal moves enforced).
Visible to users: **verified** (no badge) and **ai_checked** *unless sensitive* ("AI · checked, not yet reviewed" badge).
Never visible: unverified, disputed, rejected, and anything without a source. **Sensitive = year ≥ 1900**: needs a human even if the judge approves.

## Three sources
| Source | How | Status on arrival |
|---|---|---|
| **Computed** (no AI) | `npm run facts:build` → `src/data/generated/facts.computed.json`: reign lengths and extremes (`rulers.ts`), concurrency counts / peaks / jumps, per-region fragmentation peaks, dynasty reach, dynasty overlaps (registry), ages and contemporaries (`data/facts/lives.json`) | `verified` for owner-curated inputs; lives-based facts `unverified` until the life is **confirmed** (owner, or Wikidata within ±1 year) |
| **AI** ("dig deeper") | writer (`dig_deeper` task, bilingual, sources required) → deterministic checks → judge → dedupe → store | `rejected` (arithmetic wrong / judge unsupported), `ai_checked` (judge supported + Persian matches), else `unverified` |
| **Curated** | the owner approves/edits in the review queue, then exports | `verified` |

Computed facts are phrased "In Xtory's records …" and carry `derivedFrom` (the exact records) so every number is auditable;
`data/facts/SPOT_CHECK.md` lists 20 sampled facts with their raw inputs, and a unit test re-derives the same families with independent code.
20th-century people and events are deliberately not generated (sensitive-era rule).

## Automatic checks (before anyone sees an AI fact)
1. **Deterministic** (`src/facts/check.ts`): ages ("aged 27", "27 years old", "۲۷ ساله"), reign lengths, birth/death years are compared with `lives.json` / `rulers.ts`
   (±1 year; ±3 for approximate births); English and Persian numbers must agree. A planted wrong age is rejected in a unit test and in the HTTP check.
2. **Second-model judge** (`AI_CHECKER_MODEL`, internal `fact_check` task, never callable from the browser): `supported | unsupported | uncertain` + "Persian says the same".
   Same-vendor checker is refused (`same_family`).
3. **Dedupe**: identical normalized text hash, or near-identical wording **with exactly the same numbers** (so "aged 27" and "aged 28" never merge). A duplicate counts as a rediscovery.

## Review & reports
- Owner page `#/admin/review` (lazy, noindex, Bearer `AI_ADMIN_TOKEN` in sessionStorage): queue per status ordered by **times found**, deterministic checks and judge verdict visible,
  Approve / Edit & approve / Reject / Dispute / Reopen, user-reported list, **Export** → `ai.json` (validated: source, bilingual, hash matches the English claim). `npm run facts:export` does the same from a terminal.
- Users report with `POST /api/facts/report` (one report per device per fact, 30/day/device). `AI_FACT_REPORT_THRESHOLD` (default 2) distinct reports pull a visible AI fact to `disputed`.
  Reports on static (computed) facts are recorded for the owner too.
- Rejecting a verified fact writes a `points_revoked` history event for the leaderboard (Slice 8) to consume.

## Cost control
Stored facts are served first (no model call). The writer is asked at most once per entity per day while it has fewer than 3 visible facts. Writer and judge tokens are counted in the usage report (`dig_deeper`, `fact_check`).

## Deviations from the plan (and why)
- **Redis instead of Postgres.** Facts are small JSON records with simple queries (by status ordered by count, by entity, by hash). Upstash Redis is already required by Slice 5; git export is the durable record.
  If queries outgrow this, `FactStore` is the only thing to port.
- **Lives are AI-seeded, not Wikidata-sourced.** `www.wikidata.org` is blocked in the build sandbox, so `data/facts/lives.json` (16 people) was seeded from the assistant's knowledge with citations, and facts built from it stay **unverified** until confirmed — including the Yazdgerd III example (computed, but held back).
  `npm run registry:wikidata` + `data/registry/ruler_qids.json` (keys = life ids) upgrades them automatically.
- **Facts are not yet shown in the app** (Slice 7). `staticFacts()` and `digDeeper()` / `reportFact()` are ready for it.

## Open items for the owner
1. Check the dates in `data/facts/lives.json` against the cited sources and set `"confirmedBy": "owner"` (or allow Wikidata and add QIDs). Yazdgerd III first.
2. Choose and set `AI_CHECKER_MODEL` (a non-DeepSeek model). Without it, AI facts are written and stored but none are shown.
3. Native-speaker review of the Persian wording of computed-fact templates and the 238 dynasty names.
