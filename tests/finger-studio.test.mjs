// Controller integration checks with a mocked DOM, not rendered browser QA.
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import { STARTERS, shareURL, decodeDesign } from '../assets/finger-design.mjs';
const code = await readFile(new URL('../assets/finger-studio.mjs', import.meta.url), 'utf8');
const schema = await readFile(new URL('../assets/finger-design.mjs', import.meta.url), 'utf8');
const html = await readFile(new URL('../motion-lab.html', import.meta.url), 'utf8');
class Element {
  constructor() { this.value = ''; this.dataset = {}; this.attributes = {}; this.listeners = {}; }
  addEventListener(name, fn) { (this.listeners[name] ||= []).push(fn); }
  setAttribute(key, value) { this.attributes[key] = value; }
  focus() { this.focused = true; }
  select() { this.selected = true; }
  scrollIntoView() { this.scrolled = true; }
  async fire(name, event = {}) { for (const fn of this.listeners[name] || []) await fn({ target: this, preventDefault() {}, ...event }); }
}
async function setup(url = 'https://zekegamby.com/motion-lab.html', failClipboard = false) {
  const elements = new Map([...html.matchAll(/\bid="([^"]+)"/g)].map(m => [m[1], new Element()]));
  const groups = {};
  for (const [attribute, values] of Object.entries({ style: ['smooth', 'ribbed', 'exposed'], palette: ['cobalt', 'ember', 'jade', 'chalk', 'orchid'], starter: ['atlas', 'reed', 'pebble'], 'studio-tab': ['shape', 'move', 'share'], 'open-panel': ['move', 'share'] })) {
    groups[`[data-${attribute}]`] = values.map(value => {
      const el = new Element(); el.dataset[attribute.replace(/-([a-z])/g, (_, a) => a.toUpperCase())] = value; return el;
    });
  }
  const get = id => { assert.ok(elements.has(id), `Real HTML includes #${id}`); return elements.get(id); };
  const document = { getElementById: get, querySelectorAll: query => groups[query] || [] };
  const window = new Element(); window.location = new URL(url);
  const designs = [], panels = [], copied = [];
  const context = vm.createContext({ document, window, URL, Blob, setTimeout, navigator: { clipboard: { async writeText(text) { if (failClipboard) throw new Error(); copied.push(text); } } } });
  const module = new vm.SourceTextModule(code, { context });
  await module.link(() => new vm.SourceTextModule(schema, { context })); await module.evaluate();
  module.namespace.initFingerStudio(d => designs.push(JSON.parse(JSON.stringify(d))), panel => panels.push(panel));
  return { get, groups, window, designs, panels, copied, current: () => designs.at(-1) };
}
test('An incoming shared design immediately configures the model and submission link', async () => {
  const app = await setup(shareURL(STARTERS.reed, 'https://zekegamby.com/motion-lab.html'));
  assert.deepEqual(app.current(), STARTERS.reed);
  assert.equal(app.get('stage-design-name').textContent, 'Reed');
  const draft = new URL(app.get('submission-email').href);
  assert.ok(draft.searchParams.get('body').includes(app.get('design-link').value));
});
test('A full slider drag is one undo step, redo restores it, and reset is reversible', async () => {
  const app = await setup(), slider = app.get('design-width');
  slider.value = '110'; await slider.fire('input'); slider.value = '128'; await slider.fire('input'); await slider.fire('change');
  assert.equal(app.current().width, 128);
  await app.get('undo-design').fire('click'); assert.equal(app.current().width, 100); assert.equal(app.get('undo-design').disabled, true);
  await app.get('redo-design').fire('click'); assert.equal(app.current().width, 128);
  await app.get('reset-design').fire('click'); assert.equal(app.current().width, 100);
  await app.get('undo-design').fire('click'); assert.equal(app.current().width, 128);
});
test('Shape changes survive panel switches and keyboard tab navigation notifies camera lifecycle', async () => {
  const app = await setup();
  await app.groups['[data-style]'][2].fire('click'); await app.groups['[data-palette]'][4].fire('click');
  await app.groups['[data-studio-tab]'][1].fire('click');
  assert.equal(app.get('panel-move').hidden, false); assert.equal(app.get('panel-shape').hidden, true);
  await app.groups['[data-studio-tab]'][1].fire('keydown', { key: 'ArrowRight' });
  assert.deepEqual(app.panels, ['move', 'share']); assert.equal(app.get('panel-share').hidden, false);
  assert.equal(app.current().style, 'exposed'); assert.equal(app.current().palette, 'orchid');
});
test('Prompt generation is explicit about supported terms and does not invent unsupported geometry', async () => {
  const app = await setup();
  app.get('design-prompt').value = 'a compact orange finger with wings'; await app.get('prompt-form').fire('submit');
  assert.equal(app.current().reach, 84); assert.equal(app.current().palette, 'ember');
  assert.match(app.get('design-status').textContent, /Other words are not modelled/);
  const before = app.current(); app.get('design-prompt').value = 'wings'; await app.get('prompt-form').fire('submit');
  assert.deepEqual(app.current(), before); assert.match(app.get('design-status').textContent, /Extra features/);
});
test('Copy uses the latest design; personal notes appear only in the email draft', async () => {
  const app = await setup();
  app.get('design-name').value = 'A visitor’s finger'; await app.get('design-name').fire('change');
  app.get('creator-name').value = 'Private credit'; await app.get('creator-name').fire('input');
  app.get('design-idea').value = 'Private note'; await app.get('design-idea').fire('input');
  await app.get('copy-design').fire('click');
  assert.equal(decodeDesign(new URL(app.copied[0]).hash).design.name, 'A visitor’s finger');
  assert.ok(!decodeURIComponent(app.copied[0]).includes('Private'));
  assert.match(new URL(app.get('submission-email').href).searchParams.get('body'), /Private credit/);
  await app.get('submission-email').fire('click'); assert.match(app.get('share-status').textContent, /Send it there/);
});
test('A blocked clipboard offers a selectable link; a malformed hash does not break the designer', async () => {
  const app = await setup('https://zekegamby.com/motion-lab.html#design=broken', true);
  assert.match(app.get('design-status').textContent, /could not be read/);
  await app.get('copy-design').fire('click'); assert.equal(app.get('design-link').selected, true);
  app.window.location.hash = new URL(shareURL(STARTERS.atlas, 'https://zekegamby.com/motion-lab.html')).hash;
  await app.window.fire('hashchange'); assert.deepEqual(app.current(), STARTERS.atlas);
});
