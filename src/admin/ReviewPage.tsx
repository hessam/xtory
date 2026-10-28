/**
 * Owner-only fact review queue (#/admin/review). Plain on purpose: it is a work tool, not product UI.
 * The bearer token (AI_ADMIN_TOKEN) is kept in sessionStorage only. Facts are shown in the order of how many people found them.
 */
import React, { useCallback, useEffect, useState } from 'react';
import type { Fact, FactStatus } from '../facts/model';
import { forRepo } from '../facts/exportMerge';
import { validateFactRecord } from '../facts/validate';

const TABS: FactStatus[] = ['unverified', 'ai_checked', 'disputed', 'verified', 'rejected'];
const API = '/api/facts/admin';
const TOKEN_KEY = 'xtory_admin_token';

type Counts = Record<FactStatus, number>;

export default function ReviewPage() {
  const [token, setToken] = useState(() => { try { return sessionStorage.getItem(TOKEN_KEY) ?? ''; } catch { return ''; } });
  const [draft, setDraft] = useState('');
  const [status, setStatus] = useState<FactStatus>('unverified');
  const [facts, setFacts] = useState<Fact[]>([]);
  const [counts, setCounts] = useState<Counts | null>(null);
  const [reported, setReported] = useState<{ id: string; reports: number }[]>([]);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [form, setForm] = useState<{ hookEn: string; hookFa: string; claimEn: string; claimFa: string; sources: string }>({ hookEn: '', hookFa: '', claimEn: '', claimFa: '', sources: '' });

  useEffect(() => { document.title = 'Fact review'; const m = document.createElement('meta'); m.name = 'robots'; m.content = 'noindex'; document.head.appendChild(m); return () => m.remove(); }, []);

  const call = useCallback(async (path: string, init?: RequestInit) => {
    const res = await fetch(`${API}${path}`, { ...init, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } });
    const j = await res.json().catch(() => ({}));
    if (res.status === 401) { setToken(''); try { sessionStorage.removeItem(TOKEN_KEY); } catch { /* ignore */ } throw new Error('Wrong token'); }
    if (!res.ok) throw new Error(j.reason || j.error || `HTTP ${res.status}`);
    return j;
  }, [token]);

  const load = useCallback(async () => {
    if (!token) return;
    setErr('');
    try {
      const q = await call(`?action=queue&status=${status}&limit=100`);
      setFacts(q.facts); setCounts(q.counts);
      setReported((await call('?action=reported')).reported);
    } catch (e) { setErr((e as Error).message); }
  }, [call, status, token]);
  useEffect(() => { void load(); }, [load]);

  const review = async (f: Fact, verdict: 'approve' | 'reject' | 'dispute' | 'reopen', edits?: unknown) => {
    setBusy(true); setErr('');
    try { await call('', { method: 'POST', body: JSON.stringify({ action: 'review', factId: f.id, verdict, edits }) }); setEditing(null); await load(); }
    catch (e) { setErr(`${f.id}: ${(e as Error).message}`); }
    finally { setBusy(false); }
  };

  const startEdit = (f: Fact) => { setEditing(f.id); setForm({ hookEn: f.hook.en, hookFa: f.hook.fa, claimEn: f.claim.en, claimFa: f.claim.fa, sources: f.sources.join('\n') }); };
  const saveAndApprove = (f: Fact) => review(f, 'approve', { hook: { en: form.hookEn, fa: form.hookFa }, claim: { en: form.claimEn, fa: form.claimFa }, sources: form.sources.split('\n').map(s => s.trim()).filter(Boolean) });

  const exportFile = async () => {
    setErr('');
    try {
      const j = await call('?action=export');
      const facts: Fact[] = (j.facts as Fact[]).map(forRepo);
      const bad = facts.flatMap(f => validateFactRecord(f).map(e => `${f.id}: ${e}`));
      if (bad.length) { setErr(`Not exported — invalid records:\n${bad.join('\n')}`); return; }
      const blob = new Blob([JSON.stringify({ version: 1, facts: facts.sort((a, b) => a.id.localeCompare(b.id)) }, null, 1) + '\n'], { type: 'application/json' });
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'ai.json'; a.click(); URL.revokeObjectURL(a.href);
    } catch (e) { setErr((e as Error).message); }
  };

  if (!token) {
    return (
      <div style={{ padding: 24, maxWidth: 420, margin: '10vh auto', fontFamily: 'system-ui', color: '#e2e8f0' }}>
        <h1 style={{ fontSize: 20, marginBottom: 12 }}>Fact review</h1>
        <form onSubmit={e => { e.preventDefault(); try { sessionStorage.setItem(TOKEN_KEY, draft); } catch { /* ignore */ } setToken(draft); }}>
          <input type="password" autoFocus value={draft} onChange={e => setDraft(e.target.value)} placeholder="Admin token" aria-label="Admin token" data-testid="admin-token"
                 style={{ width: '100%', padding: 10, borderRadius: 8, border: '1px solid #334155', background: '#0f172a', color: '#e2e8f0' }} />
          <button type="submit" style={{ marginTop: 10, padding: '8px 14px', borderRadius: 8, background: '#fbbf24', color: '#111', fontWeight: 600 }}>Sign in</button>
        </form>
        {err && <p style={{ color: '#f87171', marginTop: 8 }}>{err}</p>}
      </div>
    );
  }

  const card: React.CSSProperties = { border: '1px solid #334155', borderRadius: 12, padding: 14, marginBottom: 12, background: '#0b1220' };
  const btn = (bg: string): React.CSSProperties => ({ padding: '6px 12px', borderRadius: 8, background: bg, color: '#0b1220', fontWeight: 600, marginInlineEnd: 8, opacity: busy ? 0.5 : 1 });
  const ta: React.CSSProperties = { width: '100%', minHeight: 54, padding: 8, borderRadius: 8, border: '1px solid #334155', background: '#0f172a', color: '#e2e8f0', marginBottom: 6 };

  return (
    <div style={{ padding: 16, maxWidth: 980, margin: '0 auto', fontFamily: 'system-ui', color: '#e2e8f0', background: '#020617', minHeight: '100vh' }} data-testid="review-page">
      <header style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
        <h1 style={{ fontSize: 20, margin: 0 }}>Fact review</h1>
        <nav style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {TABS.map(t => (
            <button key={t} onClick={() => setStatus(t)} aria-pressed={status === t} data-testid={`tab-${t}`}
                    style={{ padding: '5px 10px', borderRadius: 999, border: '1px solid #334155', background: status === t ? '#fbbf24' : '#0f172a', color: status === t ? '#111' : '#e2e8f0' }}>
              {t} {counts ? `(${counts[t] ?? 0})` : ''}
            </button>
          ))}
        </nav>
        <span style={{ marginInlineStart: 'auto' }} />
        <button onClick={exportFile} data-testid="export" style={btn('#34d399')}>Export verified → ai.json</button>
        <button onClick={() => { try { sessionStorage.removeItem(TOKEN_KEY); } catch { /* ignore */ } setToken(''); }} style={btn('#94a3b8')}>Sign out</button>
      </header>

      {err && <pre role="alert" style={{ color: '#f87171', whiteSpace: 'pre-wrap' }}>{err}</pre>}
      {reported.length > 0 && (
        <details style={{ ...card }} data-testid="reported"><summary>Reported by users ({reported.length})</summary>
          <ul>{reported.map(r => <li key={r.id}><code>{r.id}</code> — {r.reports} report{r.reports > 1 ? 's' : ''}</li>)}</ul>
        </details>
      )}
      {facts.length === 0 && <p style={{ color: '#94a3b8' }}>Nothing in “{status}”.</p>}

      {facts.map(f => (
        <article key={f.id} style={card} data-testid="fact-card">
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', fontSize: 12, color: '#94a3b8', marginBottom: 6 }}>
            <b style={{ color: '#fbbf24' }}>found {f.found}×</b><span>{f.entityType}: {f.entityName.en}</span>{f.year != null && <span>year {f.year}</span>}
            <span>confidence {f.confidence}</span>{f.sensitive && <b style={{ color: '#f87171' }}>sensitive era</b>}{f.reports > 0 && <b style={{ color: '#f87171' }}>{f.reports} report(s)</b>}<code>{f.id}</code>
          </div>
          {editing === f.id ? (
            <div>
              <label>Hook (EN)<textarea style={ta} value={form.hookEn} onChange={e => setForm({ ...form, hookEn: e.target.value })} data-testid="edit-hook-en" /></label>
              <label>Hook (FA)<textarea style={ta} dir="rtl" value={form.hookFa} onChange={e => setForm({ ...form, hookFa: e.target.value })} /></label>
              <label>Claim (EN)<textarea style={ta} value={form.claimEn} onChange={e => setForm({ ...form, claimEn: e.target.value })} data-testid="edit-claim-en" /></label>
              <label>Claim (FA)<textarea style={ta} dir="rtl" value={form.claimFa} onChange={e => setForm({ ...form, claimFa: e.target.value })} /></label>
              <label>Sources (one per line)<textarea style={ta} value={form.sources} onChange={e => setForm({ ...form, sources: e.target.value })} data-testid="edit-sources" /></label>
              <button disabled={busy} onClick={() => saveAndApprove(f)} style={btn('#34d399')} data-testid="save-approve">Save & approve</button>
              <button onClick={() => setEditing(null)} style={btn('#94a3b8')}>Cancel</button>
            </div>
          ) : (
            <>
              <p style={{ fontSize: 17, fontWeight: 700, margin: '4px 0' }}>{f.hook.en}</p>
              <p style={{ margin: '4px 0' }}>{f.claim.en}</p>
              <p dir="rtl" style={{ margin: '4px 0', color: '#cbd5e1' }}>{f.hook.fa} — {f.claim.fa}</p>
              {f.context?.en && <p style={{ margin: '4px 0', color: '#94a3b8', fontSize: 13 }}>{f.context.en}</p>}
              <p style={{ fontSize: 13, color: '#94a3b8' }}>Sources: {f.sources.join(' · ') || <b style={{ color: '#f87171' }}>none — cannot be approved</b>}</p>
              <ul style={{ fontSize: 12, margin: '6px 0', paddingInlineStart: 18 }}>
                {(f.checks?.deterministic ?? []).map((c, i) => <li key={i} style={{ color: c.ok ? '#34d399' : '#f87171' }}>{c.ok ? '✓' : '✗'} {c.rule}: {c.detail}</li>)}
                {f.checks?.model && <li style={{ color: f.checks.model.verdict === 'supported' ? '#34d399' : f.checks.model.verdict === 'unsupported' ? '#f87171' : '#fbbf24' }}>judge ({f.checks.model.model}): {f.checks.model.verdict}{f.checks.model.persianMatches ? '' : ', Persian differs'} — {f.checks.model.reason}</li>}
                {!f.checks?.model && f.kind === 'ai' && <li style={{ color: '#fbbf24' }}>no judge verdict (checker not configured or failed)</li>}
              </ul>
              <div>
                <button disabled={busy || f.sources.length === 0} onClick={() => review(f, 'approve')} style={btn('#34d399')} data-testid="approve">Approve</button>
                <button disabled={busy} onClick={() => startEdit(f)} style={btn('#fbbf24')} data-testid="edit">Edit…</button>
                <button disabled={busy} onClick={() => review(f, 'reject')} style={btn('#f87171')} data-testid="reject">Reject</button>
                {f.status !== 'disputed' && f.status !== 'rejected' && <button disabled={busy} onClick={() => review(f, 'dispute')} style={btn('#fb923c')}>Dispute</button>}
                {(f.status === 'rejected') && <button disabled={busy} onClick={() => review(f, 'reopen')} style={btn('#94a3b8')}>Reopen</button>}
              </div>
              <details style={{ marginTop: 6, fontSize: 12, color: '#94a3b8' }}><summary>History</summary>
                <ul>{f.history.map((h, i) => <li key={i}>{new Date(h.at).toISOString()} — {h.event}{h.by ? ` (${h.by})` : ''}{h.note ? `: ${h.note}` : ''}</li>)}</ul>
              </details>
            </>
          )}
        </article>
      ))}
    </div>
  );
}
