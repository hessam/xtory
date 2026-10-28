# Verified facts (git-auditable)

`ai.json` holds the AI-discovered facts you approved in the review queue (`#/admin/review` → Export, or `npm run facts:export`).
Every fact here is `verified`, has at least one source, English + Persian text, and a hash that matches its English claim
(`src/facts/validate.ts`, enforced by a unit test). Facts removed after verification disappear from this file on the next export,
so `git log -p` is the audit trail of what was approved and withdrawn.

Computed facts (no AI) are generated, not stored here: `src/data/generated/facts.computed.json` (`npm run facts:build`).
