import { DESIGN_SCHEMA, MAX_DESIGN_BYTES, validateDesign, parseDesign } from '../assets/ai-design.mjs';

export const MODEL = 'qwen2.5-coder:7b';
export const SYSTEM_PROMPT = `You are a creative 3D designer for Zeke Gamby's finger studio. Return one JSON object matching the supplied schema. Your output is rendered directly as a movable concept, not a real printable mechanism.
Interpret the whole request imaginatively. There is no list of finger features: invent geometry for the idea. Make the requested changes clearly visible. For revisions, keep the current design except what the user wants changed. Name it and briefly describe actual visible geometry, not unimplemented features.
The rig has exactly 3 rigid segments with bend joints. A segment's local origin is its bottom joint, +Y points to its next joint, +Z is the palm side, +X is right. Segment lengths should normally be 2.5, 1.7, 1.3. Each segment's parts are attached to it. All coordinates are local to that segment. Avoid bridging moving joints with rigid parts.
Shapes: box is a unit cube; sphere is diameter 1; cylinder is diameter 1 height 1; cone is diameter 1 height 1 with tip toward +Y; torus lies in XY with major radius .5 and tube radius .12. Transform each using scale, then rotation in DEGREES (XYZ Euler), then position. Use scale to create elongated or flattened forms. Use colour #RRGGBB, roughness .05–1, metalness 0–1.
For curved/tapered forms use tube: points are a polyline of 2–24 local XYZ centres, radii has one radius per point, and the renderer connects them with a smooth shaded surface. For any other shape use mesh: vertices are local XYZ arrays, triangles are arrays of 3 zero-based vertex indices. Use only valid nondegenerate triangles. Do not put points/radii on other shapes or vertices/triangles on other shapes. NEVER return code, URLs, formulas or markdown.
Use 6–24 parts in total unless needed, at most 60 total and 24 per segment. Prefer concise primitives and tubes to long meshes. Model silhouette and requested distinctive details first. Keep a recognisable articulated finger but interpret fanciful requests visually. Do not claim physical behaviour, printable readiness, internal electronics or textures you cannot show.
JSON schema: ${JSON.stringify(DESIGN_SCHEMA)}`;

export async function modelReady(fetcher = fetch, signal) {
  const response = await fetcher('http://127.0.0.1:11434/api/tags', { signal: signal || AbortSignal.timeout(3000) });
  if (!response.ok) throw new Error('Ollama is unavailable');
  const data = await response.json();
  return data.models?.some(m => m.name === MODEL || m.model === MODEL) || false;
}
export async function generateDesign({ prompt, current }, { fetcher = fetch, signal } = {}) {
  const messages = [{ role: 'system', content: SYSTEM_PROMPT }];
  if (current) messages.push({ role: 'user', content: `Current design to revise: ${JSON.stringify(validateDesign(current))}` });
  messages.push({ role: 'user', content: prompt });
  // One repair attempt for malformed geometry. Never silently substitute a preset.
  for (let attempt = 0; attempt < 2; attempt++) {
    const response = await fetcher('http://127.0.0.1:11434/api/chat', {
      method: 'POST', signal, headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: MODEL, messages, stream: false, format: DESIGN_SCHEMA, keep_alive: '10m', options: { temperature: .35, num_ctx: 16384, num_predict: 6500 } })
    });
    if (!response.ok) throw new Error('The local model could not generate. Check the Ollama window and try again.');
    const result = await response.json();
    const content = result.message?.content;
    if (typeof content !== 'string' || content.length > MAX_DESIGN_BYTES) throw new Error('The model returned an oversized or empty design. Try a simpler description.');
    try { return parseDesign(content); }
    catch (error) {
      if (attempt) throw new Error('The model could not produce valid geometry. Your previous design is unchanged. Try rephrasing the request.');
      messages.push({ role: 'assistant', content }, { role: 'user', content: `Repair this validation error and return the complete corrected JSON design: ${error.message}` });
    }
  }
}
