// Versioned, bounded visual concepts. These are not manufacturing files.
export const DEFAULT_DESIGN = Object.freeze({ v: 1, name: 'First Edition', style: 'smooth', palette: 'cobalt', reach: 100, width: 100, taper: 35 });
export const STYLES = ['smooth', 'ribbed', 'exposed'];
export const PALETTES = Object.freeze({
  cobalt: { name: 'Cobalt', shell: '#244978', joint: '#c5d9d6', accent: '#e6eeec' },
  ember: { name: 'Ember', shell: '#c45231', joint: '#e5bd9b', accent: '#fff0d6' },
  jade: { name: 'Jade', shell: '#337766', joint: '#c5d8b5', accent: '#eef0d7' },
  chalk: { name: 'Chalk', shell: '#d8d5c9', joint: '#879794', accent: '#faf8ee' },
  orchid: { name: 'Orchid', shell: '#785388', joint: '#d4b4cb', accent: '#f0e3e9' }
});
export const RANGES = Object.freeze({ reach: [80, 125], width: [75, 130], taper: [10, 55] });
export const STARTERS = Object.freeze({
  atlas: { ...DEFAULT_DESIGN, name: 'Atlas', style: 'ribbed', width: 124, reach: 91, taper: 20, palette: 'ember' },
  reed: { ...DEFAULT_DESIGN, name: 'Reed', style: 'exposed', width: 78, reach: 121, taper: 46, palette: 'jade' },
  pebble: { ...DEFAULT_DESIGN, name: 'Pebble', style: 'smooth', width: 112, reach: 84, taper: 25, palette: 'chalk' }
});
export function normaliseDesign(input = {}) {
  if (!input || typeof input !== 'object') input = {};
  const d = { ...DEFAULT_DESIGN };
  if (typeof input.name === 'string') {
    d.name = Array.from(input.name.replace(/[\u0000-\u001f\u007f]/g, '').trim()).slice(0, 48).join('')
      .replace(/[\uD800-\uDBFF][\uDC00-\uDFFF]|[\uD800-\uDFFF]/g, c => c.length === 2 ? c : '\uFFFD') || DEFAULT_DESIGN.name;
  }
  if (STYLES.includes(input.style)) d.style = input.style;
  if (typeof input.palette === 'string' && Object.hasOwn(PALETTES, input.palette)) d.palette = input.palette;
  for (const [key, [min, max]] of Object.entries(RANGES)) {
    if (typeof input[key] === 'number' && Number.isFinite(input[key])) d[key] = Math.round(Math.max(min, Math.min(max, input[key])));
  }
  return d;
}
export function designGeometry(input) {
  const d = normaliseDesign(input), taper = d.taper / 100;
  return {
    lengths: [2.65, 1.75, 1.3].map(n => n * d.reach / 100),
    radii: [1, 1 - taper * .55, 1 - taper].map(n => .39 * n * d.width / 100)
  };
}
export function encodeDesign(input) { return '#design=' + encodeURIComponent(JSON.stringify(normaliseDesign(input))); }
export function decodeDesign(hash) {
  if (!hash?.startsWith('#design=')) return { design: null, error: null };
  try {
    if (hash.length > 3000) throw new Error();
    const value = JSON.parse(decodeURIComponent(hash.slice(8)));
    if (!value || Array.isArray(value) || value.v !== 1) throw new Error();
    return { design: normaliseDesign(value), error: null };
  } catch { return { design: null, error: 'That design link could not be read. You can make a new one below.' }; }
}
export function shareURL(design, base) {
  const url = new URL(base); url.search = ''; url.hash = encodeDesign(design); return url.href;
}
export function randomDesign(random = Math.random) {
  const pick = values => values[Math.min(values.length - 1, Math.floor(random() * values.length))];
  return normaliseDesign({ ...DEFAULT_DESIGN, name: pick(['Drift', 'Kelp', 'Orbit', 'Ripple', 'Contour', 'Tidal']), style: pick(STYLES), palette: pick(Object.keys(PALETTES)),
    ...Object.fromEntries(Object.entries(RANGES).map(([key, [min, max]]) => [key, Math.round(min + random() * (max - min))])) });
}
// Intentionally small, transparent keyword vocabulary; no AI service is called.
export function designFromPrompt(text, current = DEFAULT_DESIGN) {
  const words = String(text).toLowerCase(), changes = {}, matches = [];
  const rules = [
    [/\b(long|tall)\b/, { reach: 121 }, 'long'], [/\b(short|compact)\b/, { reach: 84 }, 'compact'],
    [/\b(slim|slender|thin)\b/, { width: 78 }, 'slender'], [/\b(chunky|wide|thick|bold)\b/, { width: 124 }, 'chunky'],
    [/\b(tapered|pointed)\b/, { taper: 53 }, 'tapered'], [/\b(blunt|rounded)\b/, { taper: 15 }, 'rounded'],
    [/\b(smooth|sleek)\b/, { style: 'smooth' }, 'smooth'], [/\b(ribbed|armou?red)\b/, { style: 'ribbed' }, 'ribbed'],
    [/\b(exposed|skeletal|open)\b/, { style: 'exposed' }, 'exposed'],
    [/\b(blue|cobalt)\b/, { palette: 'cobalt' }, 'cobalt'], [/\b(orange|coral|ember)\b/, { palette: 'ember' }, 'ember'],
    [/\b(green|jade)\b/, { palette: 'jade' }, 'jade'], [/\b(white|cream|chalk)\b/, { palette: 'chalk' }, 'chalk'],
    [/\b(purple|pink|orchid)\b/, { palette: 'orchid' }, 'orchid']
  ];
  for (const [pattern, values, label] of rules) if (pattern.test(words)) { Object.assign(changes, values); matches.push(label); }
  return { design: normaliseDesign({ ...current, ...changes }), matches };
}
export function submissionMail(design, creator, idea, url) {
  const d = normaliseDesign(design);
  const body = `Hi Zeke,\n\nHere is my finger concept for the weekly print.\n\nDesign: ${d.name}\nCredit name: ${String(creator).slice(0, 60) || 'Anonymous'}\nIdea: ${String(idea).slice(0, 500)}\n\nOpen the interactive design:\n${url}\n\n${d.style} shell / ${PALETTES[d.palette].name} / reach ${d.reach}% / width ${d.width}% / taper ${d.taper}%\n\nIf selected, please contact me about developing the print and featuring it with the credit name above.`;
  return 'mailto:zekegamby@gmail.com?subject=' + encodeURIComponent(`Weekly print — ${d.name}`) + '&body=' + encodeURIComponent(body);
}
