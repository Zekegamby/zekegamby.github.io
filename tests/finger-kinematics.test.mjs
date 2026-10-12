import test from 'node:test';
import assert from 'node:assert/strict';
import { landmarksToPose, fingerPoints, smoothPose, LENGTHS } from '../assets/finger-kinematics.mjs';

const point = (x, y, z = 0) => ({ x, y, z });
const near = (a, b, tolerance = 1e-5) => assert.ok(Math.abs(a - b) < tolerance, `${a} is not close to ${b}`);
function hand(angles = [0, 0, 0]) {
  const p = Array.from({ length: 21 }, () => point(0, 0));
  p[0] = point(0, -.07); p[5] = point(.025, 0); p[9] = point(0, .005); p[17] = point(-.03, 0);
  let theta = 0;
  [.04, .025, .02].forEach((length, i) => {
    theta += angles[i] * Math.PI / 180;
    const base = p[5 + i]; p[6 + i] = point(base.x, base.y + Math.cos(theta) * length, base.z + Math.sin(theta) * length);
  });
  return p;
}

test('An open finger has zero bend at each joint', () => {
  const result = landmarksToPose(hand());
  result.angles.forEach(a => near(a, 0)); near(result.sway, 0);
});
test('Independent known joint bends are recovered, including a deeply curled finger', () => {
  for (const angles of [[35, 0, 0], [0, 70, 0], [0, 0, 55], [75, 100, 65]]) {
    const result = landmarksToPose(hand(angles));
    result.angles.forEach((a, i) => near(a, angles[i]));
  }
});
test('Translation, scale, wrist rotation and left/right mirroring preserve bends', () => {
  const angles = [40, 75, 45], a = .84, b = -.61;
  for (const mirror of [-1, 1]) {
    const points = hand(angles).map(p => {
      const x = p.x * mirror * 3, y = p.y * 3, z = p.z * 3;
      const rx = Math.cos(a)*x - Math.sin(a)*y, ry = Math.sin(a)*x + Math.cos(a)*y;
      return point(rx + 3, Math.cos(b)*ry-Math.sin(b)*z-5, Math.sin(b)*ry+Math.cos(b)*z+2);
    });
    landmarksToPose(points).angles.forEach((v, i) => near(v, angles[i]));
  }
});
test('Sideways motion does not become flexion', () => {
  const p = hand(), theta = .3;
  for (let i = 6; i <= 8; i++) { const y = p[i].y; p[i].x += Math.sin(theta)*y; p[i].y = Math.cos(theta)*y; }
  const pose = landmarksToPose(p);
  pose.angles.forEach(v => near(v, 0, 1e-5)); near(pose.sway, theta*180/Math.PI);
});
test('Invalid or degenerate frames are rejected instead of making a NaN rig', () => {
  assert.equal(landmarksToPose(null), null);
  assert.equal(landmarksToPose([]), null);
  const nan = hand(); nan[7].z = NaN; assert.equal(landmarksToPose(nan), null);
  const collapsed = hand(); collapsed[6] = collapsed[5]; assert.equal(landmarksToPose(collapsed), null);
  const flatPalm = hand(); flatPalm[17] = flatPalm[5]; assert.equal(landmarksToPose(flatPalm), null);
});
test('A full sideways or backwards pose stays inside the model limits', () => {
  const pose = landmarksToPose(hand([160, 150, 100]));
  assert.deepEqual(pose.angles, [100, 115, 85]);
});
test('The visual model preserves segment length at all bends', () => {
  for (const angles of [[0, 0, 0], [75, 100, 65], [100, 115, 85]]) {
    for (const sway of [-30, 0, 30]) {
      const p = fingerPoints(angles, sway);
      LENGTHS.forEach((length, i) => near(Math.hypot(...p[i + 1].map((v, j) => v-p[i][j])), length));
    }
  }
});
test('Smoothing is rate independent and does not overshoot', () => {
  const target = { angles: [75, 100, 65], sway: 20 };
  function simulate(hz) {
    let p = { angles: [0, 0, 0], sway: 0 };
    for (let i = 0; i < hz; i++) p = smoothPose(p, target, 1/hz);
    return p;
  }
  const a = simulate(30), b = simulate(60);
  a.angles.forEach((v, i) => { near(v, b.angles[i]); assert.ok(v <= target.angles[i]); });
  near(a.sway, b.sway);
});
