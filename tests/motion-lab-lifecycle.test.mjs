// Logic checks with a mocked DOM and camera. These are not browser/camera QA.
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
const runtime = await readFile(new URL('../assets/motion-runtime.mjs', import.meta.url), 'utf8');
const code = runtime + `\nimport { DEFAULT_DESIGN, PALETTES, designGeometry } from './finger-design.mjs';\nawait startMotionLab({ DEFAULT_DESIGN, PALETTES, designGeometry, initFingerStudio() {}, async createFingerRenderer() { throw new Error('No WebGL in logic tests'); } });`;
const math = await readFile(new URL('../assets/finger-kinematics.mjs', import.meta.url), 'utf8');
const designs = await readFile(new URL('../assets/finger-design.mjs', import.meta.url), 'utf8');

class Element {
  constructor(id) { this.id = id; this.listeners = {}; this.dataset = {}; this.attributes = {}; this.children = []; this.value = '0'; this.textContent = ''; this.hidden = false; this.width = 310; this.height = 232; this.videoWidth = 640; this.videoHeight = 480; this.readyState = 2; this.currentTime = 0; }
  addEventListener(type, fn) { (this.listeners[type] ||= []).push(fn); }
  removeEventListener(type, fn) { this.listeners[type] = (this.listeners[type] || []).filter(listener => listener !== fn); }
  fire(type, event = {}) { return Promise.all((this.listeners[type] || []).map(fn => fn(event))); }
  setAttribute(key, value) { this.attributes[key] = value; }
  getBoundingClientRect() { return { width: 310, height: 232 }; }
  getContext() { return new Proxy({}, { get: () => () => {} }); }
  play() { return Promise.resolve(); }
  pause() {}
  focus() {}
  setPointerCapture() {}
}
async function setup(getUserMedia) {
  const els = new Map(), get = id => { if (!els.has(id)) els.set(id, new Element(id)); return els.get(id); };
  get('fallback-joints').children = [new Element(), new Element(), new Element()];
  const views = ['perspective', 'side', 'front'].map(v => { const e = new Element(); e.dataset.view = v; return e; });
  const presets = ['open', 'relaxed', 'curl'].map(v => { const e = new Element(); e.dataset.preset = v; return e; });
  const document = new Element('document'); document.hidden = false; document.getElementById = get;
  document.querySelectorAll = selector => selector === '[data-view]' ? views : selector === '[data-preset]' ? presets : [];
  const timers = new Map(), frames = new Map(), workers = [], bitmaps = [], requested = [];
  let next = 0, now = 0;
  class Worker {
    constructor(url) { this.url = url; this.messages = []; workers.push(this); }
    postMessage(message) { this.messages.push(message); }
    terminate() { this.terminated = true; }
    send(data) { this.onmessage({ data }); }
  }
  const window = new Element('window'); Object.assign(window, { isSecureContext: true, Worker, OffscreenCanvas: class {}, createImageBitmap: true });
  const globals = { URL, document, window, Worker, console, navigator: { mediaDevices: { async getUserMedia(options) { requested.push(options); return getUserMedia(); } } },
    matchMedia: () => ({ matches: false }), performance: { now: () => now },
    setTimeout: (fn, delay) => { const id = ++next; timers.set(id, { fn, delay }); return id; }, clearTimeout: id => timers.delete(id),
    requestAnimationFrame: fn => { const id = ++next; frames.set(id, fn); return id; }, cancelAnimationFrame: id => frames.delete(id),
    createImageBitmap: async () => { const frame = { closed: false, close() { this.closed = true; } }; bitmaps.push(frame); return frame; }
  };
  const context = vm.createContext(globals);
  const main = new vm.SourceTextModule(code, { context, initializeImportMeta(meta) { meta.url = 'https://zekegamby.com/assets/motion-lab.js'; } });
  await main.link(specifier => new vm.SourceTextModule(specifier.includes('kinematics') ? math : specifier.includes('finger-design') ? designs : specifier.includes('finger-studio') ? 'export function initFingerStudio() {}' : 'export async function createFingerRenderer() { throw new Error("No WebGL in logic tests"); }', { context }));
  await main.evaluate();
  return { get, document, window, workers, requested, bitmaps, timers, async tick(t) { now = t; const callbacks = [...frames.values()]; frames.clear(); callbacks.forEach(fn => fn(t)); await new Promise(setImmediate); }, views, presets };
}
function camera() {
  const track = new Element('track'); track.enabled = true; track.stops = 0; track.stop = () => track.stops++;
  return { track, getTracks: () => [track], getVideoTracks: () => [track] };
}
test('The page never requests a camera on load; manual fallback works without WebGL', async () => {
  const app = await setup(() => { throw new Error('must not run'); });
  assert.equal(app.requested.length, 0);
  assert.equal(app.get('camera-button').disabled, false);
  await app.presets[2].fire('click');
  await app.tick(1000);
  assert.match(app.get('fallback-bones').attributes.d, /^M/);
  assert.equal(app.get('joint-1').value, 100);
});
test('The preview bend slider moves the entire finger and stops camera capture', async () => {
  const cam = camera(), app = await setup(() => cam);
  await app.get('camera-button').fire('click');
  await app.get('quick-flex').fire('input', { target: { value: '80' } });
  assert.equal(cam.track.stops, 1); assert.equal(app.workers[0].terminated, true);
  assert.equal(app.get('joint-0').value, 60); assert.equal(app.get('joint-1').value, 80); assert.equal(app.get('joint-2').value, 52);
});
test('Stopping before permission resolves closes a late camera stream', async () => {
  let resolve; const cam = camera();
  const app = await setup(() => new Promise(r => { resolve = r; }));
  const start = app.get('camera-button').fire('click');
  await app.get('camera-button').fire('click');
  resolve(cam); await start;
  assert.equal(cam.track.stops, 1); assert.equal(app.workers.length, 0); assert.equal(app.get('hand-video').srcObject, null);
});
test('Denied permission keeps the camera off and offers a useful retry', async () => {
  const app = await setup(() => { throw Object.assign(new Error(), { name: 'NotAllowedError' }); });
  await app.get('camera-button').fire('click');
  assert.match(app.get('tracking-status').textContent, /permission is blocked/);
  assert.equal(app.get('camera-button').textContent, 'Enable camera');
  assert.equal(app.get('manual-controls').hidden, false);
});
test('A permission prompt briefly hiding the page does not cancel the camera request', async () => {
  let resolve; const cam = camera();
  const app = await setup(() => new Promise(r => { resolve = r; }));
  const start = app.get('camera-button').fire('click');
  app.document.hidden = true; await app.document.fire('visibilitychange');
  app.document.hidden = false; await app.document.fire('visibilitychange');
  resolve(cam); await start;
  assert.equal(cam.track.stops, 0);
  assert.equal(app.workers.length, 1);
  assert.equal(app.get('camera-button').textContent, 'Stop camera');
  assert.equal(app.requested.length, 1);
});
test('Permission can resolve before the phone restores page visibility', async () => {
  let resolve; const cam = camera();
  const app = await setup(() => new Promise(r => { resolve = r; }));
  const start = app.get('camera-button').fire('click');
  app.document.hidden = true; await app.document.fire('visibilitychange');
  resolve(cam); await new Promise(setImmediate);
  assert.equal(cam.track.stops, 0); assert.equal(cam.track.enabled, false);
  assert.equal(app.workers.length, 0);
  app.document.hidden = false; await app.document.fire('visibilitychange'); await start;
  assert.equal(cam.track.enabled, true); assert.equal(app.workers.length, 1);
});
test('A camera granted in the background is released if the page stays hidden', async () => {
  let resolve; const cam = camera();
  const app = await setup(() => new Promise(r => { resolve = r; }));
  const start = app.get('camera-button').fire('click');
  app.document.hidden = true; await app.document.fire('visibilitychange');
  resolve(cam); await new Promise(setImmediate);
  const timer = [...app.timers.values()].find(t => t.delay === 5000);
  assert.ok(timer, 'bounded wait for the permission sheet to close'); timer.fn(); await start;
  assert.equal(cam.track.stops, 1); assert.equal(app.workers.length, 0);
  assert.equal(app.get('camera-button').textContent, 'Enable camera');
});
test('Cancel and navigation still release a granted stream while visibility is pending', async () => {
  for (const action of ['cancel', 'navigate']) {
    let resolve; const cam = camera();
    const app = await setup(() => new Promise(r => { resolve = r; }));
    const start = app.get('camera-button').fire('click');
    app.document.hidden = true; await app.document.fire('visibilitychange');
    resolve(cam); await new Promise(setImmediate);
    await (action === 'cancel' ? app.get('camera-button').fire('click') : app.window.fire('pagehide'));
    await start;
    app.document.hidden = false; await app.document.fire('visibilitychange');
    assert.equal(cam.track.stops, 1); assert.equal(app.workers.length, 0);
    assert.equal(app.get('hand-video').srcObject, null); assert.equal(app.timers.size, 0);
  }
});
test('Camera uses no audio; tracking sends only one frame while inference is busy', async () => {
  const cam = camera(), app = await setup(() => cam);
  await app.get('camera-button').fire('click');
  assert.equal(app.requested[0].audio, false);
  const worker = app.workers[0]; assert.equal(worker.messages[0].type, 'init');
  worker.send({ type: 'ready' }); await app.tick(100);
  app.get('hand-video').currentTime = .1; await app.tick(200);
  assert.equal(worker.messages.filter(m => m.type === 'frame').length, 1);
  worker.send({ type: 'pose', world: null, landmarks: null }); await app.tick(300);
  assert.equal(worker.messages.filter(m => m.type === 'frame').length, 2);
  await app.get('camera-button').fire('click');
  assert.equal(worker.terminated, true); assert.equal(cam.track.stops, 1);
  assert.equal(app.get('hand-video').srcObject, null); assert.equal(app.timers.size, 0);
});
test('Switching tabs stops tracks, terminates inference and requires a fresh opt-in', async () => {
  const cam = camera(), app = await setup(() => cam);
  await app.get('camera-button').fire('click');
  app.document.hidden = true; await app.document.fire('visibilitychange');
  assert.equal(cam.track.stops, 1); assert.equal(app.workers[0].terminated, true);
  app.document.hidden = false; await app.document.fire('visibilitychange');
  assert.equal(app.requested.length, 1); assert.equal(app.get('camera-label').textContent, 'Camera off');
});
test('Model failure and loading timeout release the camera', async () => {
  for (const failure of ['error', 'timeout']) {
    const cam = camera(), app = await setup(() => cam);
    await app.get('camera-button').fire('click');
    if (failure === 'error') app.workers[0].send({ type: 'error', phase: 'init' });
    else [...app.timers.values()].find(t => t.delay === 60000).fn();
    assert.equal(cam.track.stops, 1); assert.equal(app.workers[0].terminated, true);
    assert.equal(app.get('manual-controls').hidden, false);
  }
});
test('Messages from a stopped tracker cannot re-enable camera mode', async () => {
  const cam = camera(), app = await setup(() => cam);
  await app.get('camera-button').fire('click'); const worker = app.workers[0];
  await app.get('camera-button').fire('click'); worker.send({ type: 'ready' });
  assert.equal(app.get('lab-mode').textContent, 'Manual control');
  assert.equal(app.get('camera-label').textContent, 'Camera off');
});
test('Page navigation and camera disconnection release camera resources', async () => {
  for (const event of ['pagehide', 'ended']) {
    const cam = camera(), app = await setup(() => cam);
    await app.get('camera-button').fire('click');
    await (event === 'pagehide' ? app.window.fire(event) : cam.track.fire(event));
    assert.equal(cam.track.stops, 1); assert.equal(app.get('hand-video').srcObject, null);
    assert.equal(app.workers[0].terminated, true);
  }
});
