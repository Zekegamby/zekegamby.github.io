import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { validateDesign } from '../assets/ai-design.mjs';
import { generateDesign, modelReady, MODEL } from './generator.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
export const ASSETS = ['ai-studio.html', 'assets/site.css', 'assets/motion-lab.css', 'assets/ai-studio.css',
  'assets/ai-studio.js', 'assets/ai-config.mjs', 'assets/ai-controller.mjs', 'assets/ai-design.mjs',
  'assets/ai-renderer.mjs', 'assets/motion-runtime.mjs', 'assets/finger-kinematics.mjs', 'assets/hand-tracker-worker.js'];
const TYPES = { html: 'text/html; charset=utf-8', css: 'text/css; charset=utf-8', js: 'text/javascript; charset=utf-8', mjs: 'text/javascript; charset=utf-8' };
const error = (message, status = 400) => Object.assign(new Error(message), { status });
export function createStudioServer({ port = 8787, publicOrigin = '', generate = generateDesign, ready = modelReady, now = Date.now, timeout = 300000 } = {}) {
  const origins = new Set([`http://127.0.0.1:${port}`, `http://localhost:${port}`]);
  if (publicOrigin) {
    const url = new URL(publicOrigin);
    if (url.protocol !== 'https:' || url.origin !== publicOrigin) throw new Error('STUDIO_PUBLIC_ORIGIN must be an exact HTTPS origin');
    origins.add(publicOrigin); origins.add('https://zekegamby.com'); origins.add('https://www.zekegamby.com');
  }
  const hosts = new Set([...origins].map(o => new URL(o).host));
  const jobs = new Map(), queue = [], starts = [];
  let active = null, shuttingDown = false;
  function prune() {
    for (const [id, job] of jobs) if (now() - job.created > 15 * 60000 && !['queued', 'running'].includes(job.state)) jobs.delete(id);
    while (starts.length && now() - starts[0] >= 3600000) starts.shift();
  }
  const maintenance = setInterval(prune, 30000); maintenance.unref();
  function pump() {
    if (active || shuttingDown) return;
    const job = queue.shift();
    if (!job) return;
    if (job.state !== 'queued') return pump();
    active = job; job.state = 'running';
    const timer = setTimeout(() => { job.timedOut = true; job.controller.abort(); }, timeout);
    Promise.resolve().then(() => generate(job.input, { signal: job.controller.signal }))
      .then(design => { if (job.state === 'running') { job.design = validateDesign(design); job.state = 'done'; } })
      .catch(() => { if (job.state === 'running') { job.state = 'error'; job.error = job.timedOut ? 'Generation took too long. Try a simpler description.' : 'The local model could not finish this design. Try rephrasing, or check the Ollama window.'; } })
      .finally(() => { clearTimeout(timer); delete job.input; active = null; pump(); });
  }
  function send(res, status, payload) {
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(payload));
  }
  async function body(req) {
    if (!/^application\/json(?:;|$)/i.test(req.headers['content-type'] || '')) throw error('Use JSON', 415);
    if (Number(req.headers['content-length']) > 110000) throw error('Request is too large', 413);
    let size = 0; const chunks = [];
    for await (const chunk of req) { size += chunk.length; if (size > 110000) throw error('Request is too large', 413); chunks.push(chunk); }
    try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { throw error('Invalid JSON'); }
  }
  const server = createServer(async (req, res) => {
    res.setHeader('Cache-Control', 'no-store'); res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer'); res.setHeader('X-Frame-Options', 'DENY');
    try {
      if (!hosts.has(req.headers.host)) throw error('Unknown host', 403);
      const url = new URL(req.url, 'http://localhost');
      if (req.headers.origin) {
        if (!origins.has(req.headers.origin)) throw error('Origin not allowed', 403);
        res.setHeader('Access-Control-Allow-Origin', req.headers.origin); res.setHeader('Vary', 'Origin');
      }
      if (req.method === 'OPTIONS') {
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type'); res.writeHead(204); res.end(); return;
      }
      prune();
      if (url.pathname === '/api/health' && req.method === 'GET') {
        let available = false; try { available = await ready(); } catch {}
        return send(res, 200, { ready: available, model: MODEL, running: !!active, queued: queue.length });
      }
      if (url.pathname === '/api/designs' && req.method === 'POST') {
        if (!origins.has(req.headers.origin)) throw error('Open the studio to generate', 403);
        if (starts.filter(t => now() - t < 60000).length >= 4 || starts.length >= 30) throw error('The studio has reached its generation limit. Try again later.', 429);
        if (queue.length + (active ? 1 : 0) >= 3) throw error('The studio is busy. Try again in a moment.', 429);
        const data = await body(req);
        if (!data || typeof data !== 'object' || Array.isArray(data) || Object.keys(data).some(k => !['prompt', 'current'].includes(k))) throw error('Invalid request');
        if (typeof data.prompt !== 'string' || data.prompt.trim().length < 3 || data.prompt.length > 2000) throw error('Use a description between 3 and 2,000 characters');
        let current; try { current = data.current == null ? undefined : validateDesign(data.current); } catch { throw error('The current design is invalid'); }
        // Recheck after reading the body; simultaneous requests cannot overfill the queue.
        if (queue.length + (active ? 1 : 0) >= 3) throw error('The studio is busy. Try again in a moment.', 429);
        if (starts.filter(t => now() - t < 60000).length >= 4 || starts.length >= 30) throw error('The studio has reached its generation limit. Try again later.', 429);
        if (jobs.size >= 20) { const old = [...jobs].find(([, j]) => !['queued', 'running'].includes(j.state)); if (old) jobs.delete(old[0]); }
        const id = randomUUID(), job = { id, state: 'queued', created: now(), controller: new AbortController(), input: { prompt: data.prompt.trim(), current } };
        jobs.set(id, job); starts.push(now()); queue.push(job); pump();
        return send(res, 202, { id, state: job.state });
      }
      const match = url.pathname.match(/^\/api\/designs\/([0-9a-f-]{36})$/);
      if (match) {
        const job = jobs.get(match[1]); if (!job) throw error('This generation has expired. Please start again.', 404);
        if (req.method === 'DELETE') {
          if (!origins.has(req.headers.origin)) throw error('Origin required', 403);
          if (['queued', 'running'].includes(job.state)) {
            job.state = 'cancelled'; job.controller.abort(); delete job.input;
            const index = queue.indexOf(job); if (index >= 0) queue.splice(index, 1);
          }
          return send(res, 200, { state: job.state });
        }
        if (req.method !== 'GET') throw error('Method not allowed', 405);
        return send(res, 200, { id: job.id, state: job.state, design: job.design, error: job.error });
      }
      if (req.method !== 'GET' && req.method !== 'HEAD') throw error('Method not allowed', 405);
      const path = url.pathname === '/' ? 'ai-studio.html' : url.pathname.slice(1);
      if (!ASSETS.includes(path)) throw error('Not found', 404);
      const file = await readFile(resolve(ROOT, path));
      res.writeHead(200, { 'Content-Type': TYPES[path.split('.').at(-1)] }); res.end(req.method === 'HEAD' ? undefined : file);
    } catch (e) { if (!res.headersSent) send(res, e.status || 500, { error: e.status ? e.message : 'The studio encountered an error.' }); else res.end(); }
  });
  server.requestTimeout = 15000; server.headersTimeout = 10000;
  server.on('close', () => { shuttingDown = true; clearInterval(maintenance); for (const j of jobs.values()) { j.controller.abort(); j.state = 'cancelled'; } });
  return server;
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const port = Number(process.env.STUDIO_PORT || 8787);
  if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('Invalid STUDIO_PORT');
  const server = createStudioServer({ port, publicOrigin: process.env.STUDIO_PUBLIC_ORIGIN || '' });
  server.on('error', e => { console.error(e.code === 'EADDRINUSE' ? `Port ${port} is already in use. Close the other studio window first.` : e.message); process.exitCode = 1; });
  server.listen(port, '127.0.0.1', () => console.log(`Finger Studio: http://127.0.0.1:${port}\nKeep this window open. Press Ctrl+C to stop. Local AI: ${MODEL}`));
  process.on('SIGINT', () => { server.close(); server.closeAllConnections(); });
}
