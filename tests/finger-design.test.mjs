import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_DESIGN, RANGES, PALETTES, STYLES, STARTERS, normaliseDesign, designGeometry, encodeDesign, decodeDesign, shareURL, randomDesign, designFromPrompt, submissionMail } from '../assets/finger-design.mjs';
import { fingerPoints } from '../assets/finger-kinematics.mjs';

test('Shared links reproduce every visual setting, including Unicode names', () => {
  for (const source of Object.values(STARTERS)) {
    const d = { ...source, name: 'Kōwhai / 手 & #1' }, url = new URL(shareURL(d, 'https://zekegamby.com/motion-lab.html?v=old#weekly-print'));
    assert.equal(url.search, ''); assert.deepEqual(decodeDesign(url.hash).design, d);
  }
});
test('Malformed, oversized and unknown-version links fail safely; ordinary anchors are ignored', () => {
  for (const hash of ['#design=%notjson', '#design=null', '#design=%5B%5D', '#design=' + encodeURIComponent('{"v":2}'), '#design=' + 'a'.repeat(3001)]) {
    assert.equal(decodeDesign(hash).design, null); assert.ok(decodeDesign(hash).error);
  }
  assert.deepEqual(decodeDesign('#weekly-print'), { design: null, error: null });
});
test('Untrusted settings cannot add arbitrary fields or escape supported materials and dimensions', () => {
  const d = normaliseDesign({ name: '  X\nY  ', v: 100, reach: 1e20, width: -1, taper: NaN, style: '__proto__', palette: 'constructor', script: '<script>', creator: 'private' });
  assert.equal(d.name, 'XY'); assert.equal(d.reach, 125); assert.equal(d.width, 75); assert.equal(d.taper, 35);
  assert.equal(d.palette, 'cobalt'); assert.equal(d.style, 'smooth'); assert.equal(d.v, 1); assert.equal(d.creator, undefined); assert.equal(d.script, undefined);
  assert.deepEqual(normaliseDesign(null), DEFAULT_DESIGN);
  assert.doesNotThrow(() => submissionMail(normaliseDesign({ name: '\ud800', palette: { toString: null } }), '', '', 'https://zekegamby.com/motion-lab.html'));
});
test('The articulated path keeps customised segment lengths at every bend', () => {
  for (const reach of RANGES.reach) for (const width of RANGES.width) for (const taper of RANGES.taper) {
    const { lengths, radii } = designGeometry({ reach, width, taper });
    for (const angles of [[0, 0, 0], [75, 100, 65], [100, 115, 85]]) {
      const points = fingerPoints(angles, 24, lengths);
      lengths.forEach((length, i) => assert.ok(Math.abs(Math.hypot(...points[i + 1].map((n, axis) => n - points[i][axis])) - length) < 1e-9));
    }
    assert.ok(radii.every(n => n > 0 && Number.isFinite(n)));
  }
});
test('Keyword directions change recognised properties and leave unrelated properties alone', () => {
  const d = designFromPrompt('A long slim ribbed orange finger with wings', DEFAULT_DESIGN);
  assert.deepEqual(d.matches, ['long', 'slender', 'ribbed', 'ember']);
  assert.equal(d.design.reach, 121); assert.equal(d.design.width, 78); assert.equal(d.design.style, 'ribbed'); assert.equal(d.design.palette, 'ember');
  assert.equal(d.design.taper, DEFAULT_DESIGN.taper);
  assert.deepEqual(designFromPrompt('wings and six joints').matches, []);
});
test('Random variants stay within the supported design vocabulary and ranges', () => {
  for (let i = 0; i < 200; i++) {
    const d = randomDesign(); assert.ok(STYLES.includes(d.style)); assert.ok(Object.hasOwn(PALETTES, d.palette));
    for (const [key, [min, max]] of Object.entries(RANGES)) assert.ok(d[key] >= min && d[key] <= max);
    assert.deepEqual(decodeDesign(encodeDesign(d)).design, d);
  }
});
test('Submissions create an encoded email draft containing the exact design link', () => {
  const d = { ...STARTERS.reed, name: 'One & two? #3' }, link = shareURL(d, 'https://zekegamby.com/motion-lab.html');
  const url = new URL(submissionMail(d, 'A & B', 'Try blue?\nA new idea', link));
  assert.equal(url.pathname, 'zekegamby@gmail.com'); assert.equal(url.searchParams.get('subject'), 'Weekly print — One & two? #3');
  assert.ok(url.searchParams.get('body').includes(link)); assert.ok(url.searchParams.get('body').includes('Credit name: A & B'));
  assert.equal(url.searchParams.size, 2); assert.ok(!link.includes('A%20%26%20B'));
});
