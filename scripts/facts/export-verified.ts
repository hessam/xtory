/**
 * Pull the owner-approved AI facts from the live review API into data/facts/verified/ai.json.
 *   FACTS_URL=https://xtory.sbs AI_ADMIN_TOKEN=… npx tsx scripts/facts/export-verified.ts
 * Validates every record first; refuses to write if any is malformed. Prints what was added/updated/removed.
 * (The same export is available from the review page → "Export".)
 */
import fs from 'node:fs';
import path from 'node:path';
import { forRepo, mergeVerified } from '../../src/facts/exportMerge';
import { validateFactRecord } from '../../src/facts/validate';
import type { Fact } from '../../src/facts/model';

const base = process.env.FACTS_URL, token = process.env.AI_ADMIN_TOKEN;
if (!base || !token) { console.error('Set FACTS_URL and AI_ADMIN_TOKEN'); process.exit(2); }
const file = path.resolve(import.meta.dirname, '../../data/facts/verified/ai.json');

const res = await fetch(`${base.replace(/\/$/, '')}/api/facts/admin?action=export`, { headers: { Authorization: `Bearer ${token}` } });
if (!res.ok) { console.error(`export failed: HTTP ${res.status}`); process.exit(1); }
const incoming = ((await res.json()).facts as Fact[]).map(forRepo);

const bad = incoming.flatMap(f => validateFactRecord(f).map(e => `${f.id}: ${e}`));
if (bad.length) { console.error('Invalid records, nothing written:\n' + bad.join('\n')); process.exit(1); }

const existing: Fact[] = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')).facts ?? [] : [];
const m = mergeVerified(existing, incoming);
fs.writeFileSync(file, JSON.stringify({ version: 1, facts: m.facts }, null, 1) + '\n');
console.log(`ai.json: ${m.facts.length} facts (+${m.added.length} added, ~${m.updated.length} updated, -${m.removed.length} removed)`);
