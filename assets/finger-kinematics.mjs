// Pose estimation only: no forces, material behaviour or hardware control.
export const LIMITS = [100, 115, 85];
export const LENGTHS = [2.65, 1.75, 1.3];
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const sub = (a, b) => [a.x - b.x, a.y - b.y, a.z - b.z];
const dot = (a, b) => a.reduce((s, v, i) => s + v * b[i], 0);
const cross = (a, b) => [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]];
const unit = a => { const n = Math.hypot(...a); return n > 1e-7 ? a.map(v => v / n) : null; };
const degrees = r => r * 180 / Math.PI;

export function landmarksToPose(points) {
  if (!points || points.length < 21 || !points.every(p => p && [p.x, p.y, p.z].every(Number.isFinite))) return null;
  const up = unit(sub(points[9], points[0]));
  const across = unit(sub(points[5], points[17]));
  if (!up || !across) return null;
  const normal = unit(cross(across, up));
  if (!normal) return null;
  const side = unit(cross(up, normal));
  const directions = [5, 6, 7].map(i => unit(sub(points[i + 1], points[i])));
  if (directions.some(d => !d)) return null;
  const [a, b, c] = directions;
  // Palm-relative axes remove wrist translation, scale and rotation. Absolute
  // depth makes flexion consistent for either hand. Hyperextension is not modelled.
  const bend = degrees(Math.atan2(Math.abs(dot(a, normal)), dot(a, up)));
  const middle = degrees(Math.acos(clamp(dot(a, b), -1, 1)));
  const tip = degrees(Math.acos(clamp(dot(b, c), -1, 1)));
  const sway = degrees(Math.atan2(dot(a, side), Math.hypot(dot(a, up), dot(a, normal))));
  return { angles: [bend, middle, tip].map((n, i) => clamp(n, 0, LIMITS[i])), sway: clamp(sway, -30, 30) };
}

export function fingerPoints(angles, sway = 0) {
  let curl = 0;
  const side = sway * Math.PI / 180;
  const points = [[0, 0, 0]];
  LENGTHS.forEach((length, i) => {
    curl += clamp(angles[i], 0, LIMITS[i]) * Math.PI / 180;
    const previous = points[i];
    points.push([
      previous[0] + Math.sin(side) * Math.cos(curl) * length,
      previous[1] + Math.cos(side) * Math.cos(curl) * length,
      previous[2] + Math.sin(curl) * length
    ]);
  });
  return points;
}

export function smoothPose(current, target, seconds) {
  const alpha = 1 - Math.exp(-clamp(seconds, 0, .1) / .055);
  return {
    angles: current.angles.map((v, i) => v + (target.angles[i] - v) * alpha),
    sway: current.sway + (target.sway - current.sway) * alpha
  };
}
