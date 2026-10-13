import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { request } from 'node:http';
import { STARTING_DESIGN, validateDesign, parseDesign, DESIGN_SCHEMA } from '../assets/ai-design.mjs';
import { generateDesign, MODEL } from '../local-ai/generator.mjs';
import { createStudioServer, ASSETS } from '../local-ai/server.mjs';

const copy = () => structuredClone(STARTING_DESIGN);
const custom = () => {
  const d = copy(); d.name = 'Asymmetric branches';
  const base = { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1], color: '#A6C7D9', roughness: .4, metalness: .1 };
  d.segments[2].parts.push({ ...base, shape: 'tube', points: [[0, .5, 0], [.5, 1, .2], [.8, 1.5, .5], [.6, 1.8, .8]], radii: [.2, .16, .09, .02] });
  d.segments[0].parts.push({ ...base, shape: 'mesh', vertices: [[0, 0, 0], [1, 0, 0], [0, 1, 0], [0, 0, 1]], triangles: [[0, 1, 2], [0, 3, 1], [0, 2, 3], [1, 3, 2]] });
  return d;
};
test('Freeform tubes and meshes survive validation and saved-file round trips', () => {
  const d = custom(); assert.deepEqual(parseDesign(JSON.stringify(d)), d);
  const result = validateDesign(d); result.name = 'Another'; assert.notEqual(d.name, result.name);
});
test('Untrusted geometry cannot inject code, nonfinite values, invalid topology or oversized scenes', () => {
  for (const mutate of [
    d => { d.code = 'alert(1)'; }, d => { d.segments[0].parts[0].scale[0] = Infinity; },
    d => { d.segments[0].parts[0].color = 'url(https://evil.test/)'; },
    d => { d.segments[2].parts.at(-1).radii.pop(); },
    d => { d.segments[0].parts.at(-1).triangles[0] = [0, 1, 100]; },
    d => { d.segments[0].parts.at(-1).triangles[0] = [0, 0, 1]; },
    d => { d.segments[0].parts = Array(25).fill(d.segments[0].parts[0]); },
    d => { d.segments[0].length = 400; }
  ]) { const d = custom(); mutate(d); assert.throws(() => validateDesign(d)); }
  assert.throws(() => parseDesign('{"__proto__":{}}'));
});
test('Ollama gets the full request, current geometry and JSON schema; invalid output is repaired once', async () => {
  const sent = [], d = custom(), controller = new AbortController();
  const result = await generateDesign({ prompt: 'Keep the branches but turn the tip into a folded ribbon', current: d }, { signal: controller.signal, fetcher: async (url, options) => {
    assert.equal(url, 'http://127.0.0.1:11434/api/chat'); assert.equal(options.signal, controller.signal);
    sent.push(JSON.parse(options.body)); return { ok: true, json: async () => ({ message: { content: sent.length === 1 ? '{}' : JSON.stringify(d) } }) };
  } });
  assert.deepEqual(result, d); assert.equal(sent.length, 2); assert.equal(sent[0].model, MODEL);
  assert.deepEqual(sent[0].format, DESIGN_SCHEMA); assert.equal(sent[0].stream, false);
  assert.match(sent[0].messages[1].content, /Asymmetric branches/); assert.match(sent[0].messages[2].content, /folded ribbon/);
  assert.match(sent[1].messages.at(-1).content, /Repair/);
  await assert.rejects(generateDesign({ prompt: 'any idea' }, { fetcher: async () => ({ ok: true, json: async () => ({ message: { content: '{}' } }) }) }), /could not produce valid geometry/);
});
async function setup(t, options = {}) {
  const server = createStudioServer({ ready: async () => true, ...options }); server.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(() => { server.close(); server.closeAllConnections(); });
  const url = `http://127.0.0.1:${server.address().port}`;
  return async (path, init = {}) => {
    return new Promise((resolve, reject) => {
      const req = request(url + path, { method: init.method || 'GET', headers: { Host: '127.0.0.1:8787', Origin: 'http://127.0.0.1:8787', ...init.headers } }, response => {
        const chunks = []; response.on('data', chunk => chunks.push(chunk)); response.on('end', () => { const body = Buffer.concat(chunks).toString(); resolve({ status: response.statusCode, data: (response.headers['content-type'] || '').includes('json') ? JSON.parse(body) : body }); });
      }); req.on('error', reject); req.end(init.body);
    });
  };
}
const post = (prompt = 'branching shapes', current) => ({ method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ prompt, current }) });
async function finished(api, id) {
  for (let i = 0; i < 100; i++) { const r = await api(`/api/designs/${id}`); if (!['queued', 'running'].includes(r.data.state)) return r; await new Promise(resolve => setTimeout(resolve, 2)); }
  throw new Error('Job did not finish');
}
test('The async service returns AI geometry and serves only the pilot allowlist', async t => {
  let input; const api = await setup(t, { generate: async data => { input = data; return custom(); } });
  const job = await api('/api/designs', post('more branches', copy())); assert.equal(job.status, 202);
  const result = await finished(api, job.data.id); assert.equal(result.data.state, 'done'); assert.deepEqual(result.data.design, custom()); assert.equal(input.prompt, 'more branches');
  assert.equal((await api('/api/health')).data.ready, true);
  for (const path of ASSETS) assert.equal((await api('/' + path)).status, 200, path);
  for (const path of ['/local-ai/server.mjs', '/.git/config', '/README.md', '/api/chat', '/assets/../local-ai/generator.mjs']) assert.equal((await api(path)).status, 404, path);
  assert.equal((await api('/api/designs', post('x'))).status, 400);
  assert.equal((await api('/api/designs', { ...post(), headers: { 'Content-Type': 'application/json', Origin: 'https://evil.test' } })).status, 403);
  assert.equal((await api('/api/health', { headers: { Host: 'evil.test' } })).status, 403);
});
test('GPU jobs are serialized; excess requests and cancellation are handled', async t => {
  let calls = 0, concurrent = 0, peak = 0;
  const api = await setup(t, { generate: (_input, { signal }) => new Promise((resolve, reject) => {
    calls++; concurrent++; peak = Math.max(peak, concurrent);
    signal.addEventListener('abort', () => { concurrent--; reject(new Error('cancelled')); }, { once: true });
  }) });
  const a = await api('/api/designs', post()), b = await api('/api/designs', post()), c = await api('/api/designs', post());
  assert.equal(b.data.state, 'queued'); assert.equal(c.data.state, 'queued'); assert.equal((await api('/api/designs', post())).status, 429);
  await api(`/api/designs/${b.data.id}`, { method: 'DELETE' }); assert.equal((await api(`/api/designs/${b.data.id}`)).data.state, 'cancelled');
  await api(`/api/designs/${a.data.id}`, { method: 'DELETE' }); await new Promise(setImmediate);
  assert.equal((await api(`/api/designs/${c.data.id}`)).data.state, 'running'); assert.equal(calls, 2); assert.equal(peak, 1);
  await api(`/api/designs/${c.data.id}`, { method: 'DELETE' });
});
test('Generation errors and timeouts never replace a design with a preset', async t => {
  const api = await setup(t, { timeout: 10, generate: (_input, { signal }) => new Promise((resolve, reject) => signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true })) });
  const job = await api('/api/designs', post()); const result = await finished(api, job.data.id);
  assert.equal(result.data.state, 'error'); assert.match(result.data.error, /too long/); assert.equal(result.data.design, undefined);
});
test('Global rate limits and in-memory job expiry remain bounded', async t => {
  let now = 100000; const api = await setup(t, { now: () => now, generate: async () => custom() }); let id;
  for (let i = 0; i < 4; i++) { const job = await api('/api/designs', post()); id = job.data.id; await finished(api, id); }
  assert.equal((await api('/api/designs', post())).status, 429);
  now += 16 * 60000; assert.equal((await api(`/api/designs/${id}`)).status, 404); assert.equal((await api('/api/designs', post())).status, 202);
});
