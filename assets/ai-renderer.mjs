import { validateDesign, STARTING_DESIGN } from './ai-design.mjs';

// Exported factory also permits geometry checks with Three.js and no GPU.
export function partGeometry(T, part) {
  const primitive = {
    box: () => new T.BoxGeometry(1, 1, 1), sphere: () => new T.SphereGeometry(.5, 28, 18),
    cylinder: () => new T.CylinderGeometry(.5, .5, 1, 28), cone: () => new T.ConeGeometry(.5, 1, 28),
    torus: () => new T.TorusGeometry(.5, .12, 10, 36)
  };
  if (primitive[part.shape]) return primitive[part.shape]();
  const geometry = new T.BufferGeometry();
  if (part.shape === 'mesh') {
    geometry.setAttribute('position', new T.Float32BufferAttribute(part.vertices.flat(), 3));
    geometry.setIndex(part.triangles.flat());
  } else {
    const sides = 12, vertices = [], indices = [];
    const points = part.points.map(p => new T.Vector3(...p));
    let normal = null;
    points.forEach((point, i) => {
      const forward = points[Math.min(i + 1, points.length - 1)].clone().sub(point);
      const backward = point.clone().sub(points[Math.max(0, i - 1)]);
      let tangent = forward.clone().add(backward);
      if (tangent.lengthSq() < 1e-8) tangent = forward.lengthSq() ? forward : backward;
      tangent.normalize();
      if (normal) normal.addScaledVector(tangent, -normal.dot(tangent));
      if (!normal || normal.lengthSq() < 1e-6) normal = new T.Vector3(Math.abs(tangent.x) < .85 ? 1 : 0, Math.abs(tangent.x) < .85 ? 0 : 1, 0).cross(tangent);
      normal.normalize(); const binormal = tangent.clone().cross(normal).normalize();
      for (let j = 0; j < sides; j++) {
        const a = j / sides * Math.PI * 2;
        const vertex = point.clone().addScaledVector(normal, Math.cos(a) * part.radii[i]).addScaledVector(binormal, Math.sin(a) * part.radii[i]);
        vertices.push(...vertex.toArray());
        if (i) { const a0 = (i - 1) * sides + j, a1 = (i - 1) * sides + (j + 1) % sides, b0 = i * sides + j, b1 = i * sides + (j + 1) % sides; indices.push(a0, a1, b0, a1, b1, b0); }
      }
    });
    const first = vertices.length / 3; vertices.push(...points[0].toArray(), ...points.at(-1).toArray());
    for (let j = 0; j < sides; j++) { indices.push(first, (j + 1) % sides, j); const base = (points.length - 1) * sides; indices.push(first + 1, base + j, base + (j + 1) % sides); }
    geometry.setAttribute('position', new T.Float32BufferAttribute(vertices, 3)); geometry.setIndex(indices);
  }
  geometry.computeVertexNormals(); geometry.computeBoundingSphere(); return geometry;
}
export async function createFingerRenderer(canvas) {
  const T = await import('https://cdn.jsdelivr.net/npm/three@0.180.0/build/three.module.min.js');
  const renderer = new T.WebGLRenderer({ canvas, antialias: true, powerPreference: 'low-power' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
  renderer.setClearColor(0xe9eae6, 1); renderer.toneMapping = T.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.15;
  const scene = new T.Scene(), root = new T.Group(); scene.add(root);
  scene.add(new T.HemisphereLight(0xffffff, 0x65716b, 2.6));
  for (const [color, power, position] of [[0xffffff, 4.5, [-5, 9, 8]], [0xbad7ff, 3.8, [6, 5, -4]], [0xffffff, 1.5, [2, 1, 7]]]) {
    const light = new T.DirectionalLight(color, power); light.position.set(...position); scene.add(light);
  }
  const camera = new T.PerspectiveCamera(33, 1, .05, 600), target = new T.Vector3();
  const grid = new T.GridHelper(16, 32, 0xb3c1b6, 0xcbd2c9); grid.position.y = -.6; grid.material.transparent = true; grid.material.opacity = .28; scene.add(grid);
  let joints = [], meshes = [], yaw = .95, pitch = .18, radius = 5, size = { width: 1, height: 1 };
  function positionCamera() {
    const angle = Math.min(camera.fov * Math.PI / 360, Math.atan(Math.tan(camera.fov * Math.PI / 360) * camera.aspect));
    const distance = radius / Math.sin(angle) * 1.12;
    camera.far = Math.max(80, distance + radius * 3); camera.updateProjectionMatrix();
    camera.position.set(target.x + Math.sin(yaw) * Math.cos(pitch) * distance, target.y + Math.sin(pitch) * distance, target.z + Math.cos(yaw) * Math.cos(pitch) * distance); camera.lookAt(target);
  }
  function poseModel(pose) { root.rotation.z = -pose.sway * Math.PI / 180; joints.forEach((j, i) => { j.rotation.x = pose.angles[i] * Math.PI / 180; }); root.updateMatrixWorld(true); }
  function design(input) {
    const d = validateDesign(input);
    const next = new T.Group(), nextMeshes = [], nextJoints = [];
    let parent = next;
    try {
      d.segments.forEach((segment, i) => {
        const joint = new T.Group(); if (i) joint.position.y = d.segments[i - 1].length; parent.add(joint); nextJoints.push(joint);
        for (const p of segment.parts) {
          const geometry = partGeometry(T, p);
          const material = new T.MeshStandardMaterial({ color: p.color, roughness: p.roughness, metalness: p.metalness, side: T.DoubleSide, flatShading: p.shape === 'mesh' });
          const mesh = new T.Mesh(geometry, material); mesh.position.set(...p.position); mesh.scale.set(...p.scale); mesh.rotation.set(...p.rotation.map(v => v * Math.PI / 180)); joint.add(mesh); nextMeshes.push(mesh);
        }
        parent = joint;
      });
    } catch (error) { nextMeshes.forEach(m => { m.geometry.dispose(); m.material.dispose(); }); throw error; }
    meshes.forEach(m => { m.geometry.dispose(); m.material.dispose(); }); root.clear(); root.add(next); meshes = nextMeshes; joints = nextJoints;
    // Frame both the straight and curled silhouette, including generated additions.
    const bounds = new T.Box3();
    for (const sway of [-30, 0, 30]) for (const angles of [[0, 0, 0], [100, 115, 85], [45, 60, 40], [100, 0, 0], [0, 115, 0]]) {
      poseModel({ angles, sway }); bounds.union(new T.Box3().setFromObject(root));
    }
    bounds.getCenter(target); radius = Math.max(2.5, bounds.getSize(new T.Vector3()).length() / 2);
    poseModel({ angles: [14, 24, 16], sway: 0 }); positionCamera();
  }
  function resize() {
    const rect = canvas.parentElement.getBoundingClientRect(); size = { width: Math.max(1, rect.width), height: Math.max(1, rect.height) };
    camera.aspect = size.width / size.height; renderer.setSize(size.width, size.height, false); positionCamera();
  }
  design(STARTING_DESIGN); resize();
  return {
    design, resize, draw(pose) { poseModel(pose); renderer.render(scene, camera); },
    view(name) { [yaw, pitch] = name === 'side' ? [Math.PI / 2, .04] : name === 'front' ? [0, .04] : [.95, .18]; positionCamera(); },
    orbit(dx, dy) { yaw -= dx / size.width * 3.5; pitch = Math.max(-.3, Math.min(.65, pitch + dy / size.height * 1.8)); positionCamera(); },
    dispose() { meshes.forEach(m => { m.geometry.dispose(); m.material.dispose(); }); grid.geometry.dispose(); grid.material.dispose(); renderer.dispose(); }
  };
}
