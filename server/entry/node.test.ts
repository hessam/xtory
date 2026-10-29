import { describe, it, expect } from 'vitest';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { nodeAdapter } from './node';

const echo = nodeAdapter(async req => new Response(JSON.stringify({ method: req.method, body: req.method === 'POST' ? await req.text() : null, host: new URL(req.url).host }), { status: 201, headers: { 'x-test': 'yes' } }));

async function call(wrap: (req: http.IncomingMessage) => Promise<void>, body: string) {
  const server = http.createServer(async (req, res) => { await wrap(req); await echo(req, res); });
  await new Promise<void>(r => server.listen(0, r));
  const port = (server.address() as AddressInfo).port;
  const res = await fetch(`http://127.0.0.1:${port}/api/x`, { method: 'POST', headers: { 'content-type': 'application/json' }, body });
  const out = { status: res.status, header: res.headers.get('x-test'), json: await res.json() };
  server.close();
  return out;
}

describe('node adapter', () => {
  it('reads the raw stream when nothing consumed it', async () => {
    const r = await call(async () => {}, '{"task":"events"}');
    expect(r.status).toBe(201); expect(r.header).toBe('yes'); expect(r.json.body).toBe('{"task":"events"}');
  });

  it('VERCEL BEHAVIOUR: body already consumed and exposed as a parsed req.body → still delivered', async () => {
    // Vercel's Node runtime reads the stream itself and sets req.body (parsed JSON for application/json).
    const r = await call(async req => { let s = ''; for await (const c of req) s += c; (req as any).body = JSON.parse(s); }, '{"task":"events","params":{"year":1000}}');
    expect(JSON.parse(r.json.body)).toEqual({ task: 'events', params: { year: 1000 } });
  });

  it('accepts a string or Buffer req.body too', async () => {
    const asString = await call(async req => { for await (const _ of req) { /* drain */ } (req as any).body = '{"a":1}'; }, '{"a":1}');
    expect(asString.json.body).toBe('{"a":1}');
    const asBuffer = await call(async req => { for await (const _ of req) { /* drain */ } (req as any).body = Buffer.from('{"b":2}'); }, '{"b":2}');
    expect(asBuffer.json.body).toBe('{"b":2}');
  });
});
