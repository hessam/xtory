/** Adapts Web-standard handlers to the classic Node (req, res) signature Vercel Functions always support. */
import type { IncomingMessage, ServerResponse } from 'node:http';

export function nodeAdapter(handler: (req: Request) => Promise<Response>) {
  return async (req: IncomingMessage, res: ServerResponse) => {
    const chunks: Buffer[] = [];
    let size = 0;
    for await (const c of req) { size += (c as Buffer).length; if (size > 65536) break; chunks.push(c as Buffer); }
    const proto = (req.headers['x-forwarded-proto'] as string) || 'https';
    const url = `${proto}://${req.headers.host ?? 'localhost'}${req.url ?? '/'}`;
    const headers = new Headers();
    for (const [k, v] of Object.entries(req.headers)) if (v !== undefined) headers.set(k, Array.isArray(v) ? v.join(', ') : v);
    const hasBody = req.method !== 'GET' && req.method !== 'HEAD';
    const response = await handler(new Request(url, { method: req.method, headers, body: hasBody ? Buffer.concat(chunks) : undefined }));
    res.statusCode = response.status;
    response.headers.forEach((value, key) => res.setHeader(key, value));
    res.end(Buffer.from(await response.arrayBuffer()));
  };
}
