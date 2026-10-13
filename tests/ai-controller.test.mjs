import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import { STARTING_DESIGN } from '../assets/ai-design.mjs';
const source = await readFile(new URL('../assets/ai-controller.mjs', import.meta.url), 'utf8');
const schema = await readFile(new URL('../assets/ai-design.mjs', import.meta.url), 'utf8');
const html = await readFile(new URL('../ai-studio.html', import.meta.url), 'utf8');
class Element {
  constructor() { this.listeners = {}; this.attributes = {}; this.value = ''; this.dataset = {}; this.checked = false; }
  addEventListener(type, listener) { (this.listeners[type] ||= []).push(listener); }
  setAttribute(k, v) { this.attributes[k] = v; }
  focus() { this.focused = true; }
  click() {}
  async fire(type, event = {}) { for (const fn of this.listeners[type] || []) await fn({ target: this, preventDefault() {}, ...event }); }
}
async function setup(respond) {
  const els = new Map([...html.matchAll(/id="([^"]+)"/g)].map(m => [m[1], new Element()]));
  const get = id => { assert.ok(els.has(id), `HTML contains ${id}`); return els.get(id); };
  const tabs = ['shape', 'move', 'share'].map(name => { const e = get('tab-' + name); e.dataset.studioTab = name; return e; });
  const opens = ['move', 'share'].map(name => { const e = new Element(); e.dataset.openPanel = name; return e; });
  const window = new Element(), changes = [], panels = [], sent = [], blobs = [];
  const context = vm.createContext({ console, TextEncoder, JSON, Date, AbortSignal, Blob, window, setTimeout: (fn, ms) => ms === 1500 ? setTimeout(fn, 0) : 0,
    document: { getElementById: get, createElement: () => new Element(), querySelectorAll: selector => selector === '[data-studio-tab]' ? tabs : selector === '[data-open-panel]' ? opens : [] },
    URL: { createObjectURL: blob => { blobs.push(blob); return 'blob:concept'; }, revokeObjectURL() {} },
    fetch: async (path, options = {}) => {
      sent.push({ path, options });
      if (path === '/api/health') return { ok: true, json: async () => ({ ready: true }) };
      const data = await respond(path, options); return { ok: !data.error || data.state === 'error', json: async () => data };
    }
  });
  const main = new vm.SourceTextModule(source, { context });
  await main.link(specifier => new vm.SourceTextModule(specifier.includes('config') ? "export const AI_SERVICE_URL = '';" : schema, { context })); await main.evaluate();
  main.namespace.initFingerStudio(d => changes.push(JSON.parse(JSON.stringify(d))), p => panels.push(p));
  await new Promise(setImmediate);
  return { get, changes, panels, sent, blobs, tabs, window };
}
const concept = () => ({ ...structuredClone(STARTING_DESIGN), name: 'Folded canopy', description: 'A new folded form.' });
test('Freeform requests and revisions display returned geometry with undo and redo', async () => {
  const app = await setup(async (_path, options) => options.method === 'POST' ? { id: 'job' } : { state: 'done', design: concept() });
  app.get('design-prompt').value = 'Make it resemble folded fabric'; await app.get('prompt-form').fire('submit');
  assert.equal(app.changes.at(-1).name, 'Folded canopy'); assert.equal(app.get('revise-design').checked, true);
  let body = JSON.parse(app.sent.find(r => r.options.method === 'POST').options.body); assert.equal(body.current, null); assert.match(body.prompt, /folded fabric/);
  app.get('design-prompt').value = 'Add an asymmetrical tip'; await app.get('prompt-form').fire('submit');
  body = JSON.parse(app.sent.filter(r => r.options.method === 'POST').at(-1).options.body); assert.equal(body.current.name, 'Folded canopy');
  await app.get('undo-design').fire('click'); await app.get('undo-design').fire('click'); assert.equal(app.changes.at(-1).name, 'Blank canvas');
  await app.get('redo-design').fire('click'); assert.equal(app.changes.at(-1).name, 'Folded canopy'); assert.equal(app.get('generate-design').disabled, false);
});
test('Failed or invalid model output preserves the current geometry and enables retry', async () => {
  for (const response of [{ state: 'error', error: 'Try rephrasing' }, { state: 'done', design: { v: 2 } }]) {
    const app = await setup(async (_path, options) => options.method === 'POST' ? { id: 'job' } : response);
    app.get('design-prompt').value = 'Do something unusual'; await app.get('prompt-form').fire('submit');
    assert.equal(app.changes.length, 1); assert.equal(app.get('generate-design').disabled, false); assert.ok(app.get('design-status').textContent);
  }
});
test('Cancelling before a job ID arrives deletes the late job and never changes the preview', async () => {
  let resolve; const app = await setup(async (_path, options) => options.method === 'POST' ? new Promise(r => { resolve = r; }) : { state: 'cancelled' });
  app.get('design-prompt').value = 'A branching finger'; const submission = app.get('prompt-form').fire('submit');
  await app.get('cancel-generation').fire('click'); resolve({ id: 'late-job' }); await submission;
  assert.ok(app.sent.some(r => r.path === '/api/designs/late-job' && r.options.method === 'DELETE'));
  assert.equal(app.changes.length, 1); assert.equal(app.get('generate-design').disabled, false);
});
test('Downloaded geometry reopens exactly; malicious imports do not replace it', async () => {
  const app = await setup(async () => ({})); await app.get('download-design').fire('click');
  const saved = await app.blobs[0].text(); assert.deepEqual(JSON.parse(saved), STARTING_DESIGN);
  app.get('import-design').files = [{ size: saved.length, text: async () => saved }]; await app.get('import-design').fire('change');
  assert.deepEqual(app.changes.at(-1), STARTING_DESIGN); const before = app.changes.length;
  app.get('import-design').files = [{ size: 20, text: async () => '{"script":"evil()"}' }]; await app.get('import-design').fire('change');
  assert.equal(app.changes.length, before); assert.match(app.get('design-status').textContent, /not a valid/);
});
test('Keyboard panel changes notify camera lifecycle and the email requires an attachment', async () => {
  const app = await setup(async () => ({})); await app.tabs[0].fire('keydown', { key: 'ArrowRight' });
  assert.equal(app.panels.at(-1), 'move'); assert.equal(app.get('panel-shape').hidden, true);
  await app.tabs[2].fire('click'); assert.equal(app.panels.at(-1), 'share');
  await app.get('submission-email').fire('click'); assert.match(decodeURIComponent(app.get('submission-email').href), /Attach the downloaded concept JSON/);
});
