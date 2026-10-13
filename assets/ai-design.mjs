// Declarative geometry only. Model output is never executable code.
export const MAX_DESIGN_BYTES = 90000;
export const SHAPES = ['box', 'sphere', 'cylinder', 'cone', 'torus', 'tube', 'mesh'];
const num = (min, max) => ({ type: 'number', minimum: min, maximum: max });
const list = (items, minItems, maxItems = minItems) => ({ type: 'array', items, minItems, maxItems });
const vec = list(num(-6, 6), 3);
const object = (properties, required = Object.keys(properties)) => ({ type: 'object', properties, required, additionalProperties: false });
const part = object({
  shape: { type: 'string', enum: SHAPES },
  position: vec, rotation: list(num(-360, 360), 3), scale: list(num(.02, 6), 3),
  color: { type: 'string', pattern: '^#[0-9a-fA-F]{6}$' }, roughness: num(.05, 1), metalness: num(0, 1),
  points: list(vec, 2, 24), radii: list(num(.02, 1.5), 2, 24),
  vertices: list(vec, 3, 128), triangles: list(list({ type: 'integer', minimum: 0, maximum: 127 }, 3), 1, 256)
}, ['shape', 'position', 'rotation', 'scale', 'color', 'roughness', 'metalness']);
export const DESIGN_SCHEMA = object({
  v: { type: 'integer', const: 2 },
  name: { type: 'string', minLength: 1, maxLength: 60 },
  description: { type: 'string', minLength: 1, maxLength: 360 },
  segments: list(object({ length: num(.5, 4), parts: list(part, 1, 24) }), 3)
});
function check(value, schema, path = 'design') {
  const fail = reason => { throw new Error(`${path}: ${reason}`); };
  if (schema.type === 'object') {
    if (!value || typeof value !== 'object' || Array.isArray(value)) fail('expected an object');
    for (const key of Object.keys(value)) if (!Object.hasOwn(schema.properties, key)) fail(`unknown field ${key}`);
    for (const key of schema.required) if (!Object.hasOwn(value, key)) fail(`missing ${key}`);
    for (const key of Object.keys(value)) check(value[key], schema.properties[key], `${path}.${key}`);
  } else if (schema.type === 'array') {
    if (!Array.isArray(value) || value.length < schema.minItems || value.length > schema.maxItems) fail(`expected ${schema.minItems}–${schema.maxItems} items`);
    value.forEach((v, i) => check(v, schema.items, `${path}[${i}]`));
  } else if (schema.type === 'string') {
    if (typeof value !== 'string' || /[\u0000-\u001f\u007f]/.test(value)) fail('expected plain text');
    if (value.length < (schema.minLength || 0) || value.length > (schema.maxLength || 500)) fail('text length out of range');
    if (schema.pattern && !new RegExp(schema.pattern).test(value)) fail('invalid colour');
    if (schema.enum && !schema.enum.includes(value)) fail('unknown shape');
  } else {
    if (typeof value !== 'number' || !Number.isFinite(value) || (schema.type === 'integer' && !Number.isInteger(value))) fail('expected a finite number');
    if (value < schema.minimum || value > schema.maximum || (schema.const !== undefined && value !== schema.const)) fail('number out of range');
  }
}
export function validateDesign(input) {
  check(input, DESIGN_SCHEMA);
  if (input.segments.reduce((n, s) => n + s.length, 0) > 10) throw new Error('Finger is too long');
  if (input.segments.reduce((n, s) => n + s.parts.length, 0) > 60) throw new Error('Use at most 60 parts');
  for (const s of input.segments) for (const p of s.parts) {
    if (p.shape === 'tube') {
      if (!p.points || !p.radii || p.points.length !== p.radii.length) throw new Error('Tube needs one radius for every point');
      if (p.points.some((v, i) => i && Math.hypot(...v.map((n, a) => n - p.points[i - 1][a])) < .001)) throw new Error('Tube points must be distinct');
    } else if (p.points || p.radii) throw new Error('Only tubes have points and radii');
    if (p.shape === 'mesh') {
      if (!p.vertices || !p.triangles || p.triangles.some(t => new Set(t).size !== 3 || t.some(i => i >= p.vertices.length))) throw new Error('Mesh needs valid vertices and triangle indices');
      for (const [a, b, c] of p.triangles) {
        const u = p.vertices[b].map((v, i) => v - p.vertices[a][i]);
        const v = p.vertices[c].map((v, i) => v - p.vertices[a][i]);
        if (Math.hypot(u[1]*v[2]-u[2]*v[1], u[2]*v[0]-u[0]*v[2], u[0]*v[1]-u[1]*v[0]) < .00001) throw new Error('Mesh contains a collapsed triangle');
      }
    } else if (p.vertices || p.triangles) throw new Error('Only meshes have vertices and triangles');
  }
  const json = JSON.stringify(input);
  if (new TextEncoder().encode(json).length > MAX_DESIGN_BYTES) throw new Error('Design is too large');
  return JSON.parse(json);
}
export function parseDesign(text) {
  if (typeof text !== 'string' || new TextEncoder().encode(text).length > MAX_DESIGN_BYTES) throw new Error('Design is too large');
  return validateDesign(JSON.parse(text));
}
const basic = (shape, position, scale, color) => ({ shape, position, scale, rotation: [0, 0, 0], color, roughness: .35, metalness: .2 });
// An authored starting model, explicitly labelled in the interface; not AI output.
export const STARTING_DESIGN = validateDesign({
  v: 2, name: 'Blank canvas', description: 'A simple starting model. Describe what you want to create.',
  segments: [2.5, 1.7, 1.3].map((length, i) => ({ length, parts: [
    basic('sphere', [0, length / 2, 0], [.78 - i * .1, length * .88, .68 - i * .1], '#244978'),
    basic('sphere', [0, 0, 0], [.64 - i * .08, .5, .64 - i * .08], '#c5d9d6')
  ] }))
});
export function designGeometry(design) { return { lengths: design.segments.map(s => s.length) }; }
