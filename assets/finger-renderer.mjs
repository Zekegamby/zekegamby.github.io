// Purpose-built articulated visual model, separate from the physical prototypes.
import { LENGTHS } from './finger-kinematics.mjs';

export async function createFingerRenderer(canvas) {
  const T = await import('https://cdn.jsdelivr.net/npm/three@0.180.0/build/three.module.min.js');
  const renderer = new T.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'low-power' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
  renderer.setClearColor(0xe9eae6, 1);
  renderer.toneMapping = T.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.25;
  const scene = new T.Scene();
  const camera = new T.PerspectiveCamera(33, 1, .1, 80);
  const target = new T.Vector3(0, 2.25, .65);
  let yaw = .95, pitch = .15, size = { width: 1, height: 1 };
  scene.add(new T.HemisphereLight(0xffffff, 0x65716b, 2.6));
  const key = new T.DirectionalLight(0xffffff, 4.5); key.position.set(-5, 9, 8); scene.add(key);
  const rim = new T.DirectionalLight(0xbad7ff, 3.8); rim.position.set(6, 5, -4); scene.add(rim);
  const fill = new T.DirectionalLight(0xffffff, 1.5); fill.position.set(2, 1, 7); scene.add(fill);
  const blue = new T.MeshPhysicalMaterial({ color: 0x244978, metalness: .24, roughness: .26, clearcoat: 1, clearcoatRoughness: .2 });
  const ceramic = new T.MeshStandardMaterial({ color: 0xe6eeec, metalness: .15, roughness: .4 });
  const soft = new T.MeshPhysicalMaterial({ color: 0xc5d9d6, roughness: .55, transparent: true, opacity: .85 });
  const dark = new T.MeshStandardMaterial({ color: 0x173145, metalness: .25, roughness: .35 });
  const thread = new T.MeshStandardMaterial({ color: 0x9cc7d5, metalness: .4, roughness: .3 });
  const meshes = [];
  function mesh(geometry, material, parent, x = 0, y = 0, z = 0) {
    const m = new T.Mesh(geometry, material); m.position.set(x, y, z); parent.add(m); meshes.push(m); return m;
  }
  const rig = new T.Group(); scene.add(rig);
  // A small foundation makes the anchored coordinate system legible.
  mesh(new T.CylinderGeometry(.72, .82, .3, 48), ceramic, rig, 0, -.58);
  mesh(new T.CylinderGeometry(.5, .59, .3, 48), dark, rig, 0, -.29);
  const root = new T.Group(); rig.add(root);
  let parent = root;
  const joints = [];
  LENGTHS.forEach((length, i) => {
    const pivot = new T.Group(); parent.add(pivot);
    if (i) pivot.position.y = LENGTHS[i - 1];
    joints.push(pivot);
    const radius = [.39, .33, .285][i];
    const joint = mesh(new T.SphereGeometry(radius, 28, 16), soft, pivot); joint.scale.set(1.05, .84, 1.05);
    // Capsule shells leave a visible flexible band at each moving connection.
    const shell = mesh(new T.CapsuleGeometry(radius * .86, length - radius * 2.55, 6, 24), blue, pivot, 0, length / 2);
    shell.scale.z = .86;
    const spine = mesh(new T.CapsuleGeometry(radius * .48, length - radius * 2.4, 5, 16), ceramic, pivot, 0, length / 2, -radius * .41);
    spine.scale.z = .3;
    [-1, 1].forEach(side => {
      mesh(new T.CylinderGeometry(.025, .025, length * .78, 8), thread, pivot, side * radius * .83, length / 2, radius * .35);
      const cap = mesh(new T.CylinderGeometry(radius * .22, radius * .22, .06, 18), dark, pivot, side * radius, 0, 0);
      cap.rotation.z = Math.PI / 2;
    });
    // Fine ribs offer scale cues and define the soft joint region.
    for (let k = 0; k < 3; k++) {
      const ring = mesh(new T.TorusGeometry(radius * .9, .025, 6, 32), ceramic, pivot, 0, (k - 1) * .08);
      ring.rotation.x = Math.PI / 2;
    }
    parent = pivot;
  });
  const pad = mesh(new T.SphereGeometry(.245, 24, 14), soft, parent, 0, LENGTHS[2] - .19, .12); pad.scale.set(1, 1.3, .5);
  // Soft procedural shadow, generated locally; no texture request.
  const shadowCanvas = document.createElement('canvas'); shadowCanvas.width = shadowCanvas.height = 128;
  const ctx = shadowCanvas.getContext('2d');
  const gradient = ctx.createRadialGradient(64, 64, 2, 64, 64, 64);
  gradient.addColorStop(0, 'rgba(24,40,47,.25)'); gradient.addColorStop(1, 'rgba(24,40,47,0)');
  ctx.fillStyle = gradient; ctx.fillRect(0, 0, 128, 128);
  const texture = new T.CanvasTexture(shadowCanvas);
  const shadow = mesh(new T.PlaneGeometry(6, 6), new T.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false }), scene, .25, -.745, .6);
  shadow.rotation.x = -Math.PI / 2;
  const grid = new T.GridHelper(14, 28, 0xb3c1b6, 0xcbd2c9); grid.position.y = -.77; grid.material.transparent = true; grid.material.opacity = .28; scene.add(grid);
  function updateCamera() {
    const radius = Math.max(13, 10.5 / Math.max(.55, camera.aspect));
    camera.position.set(target.x + Math.sin(yaw) * Math.cos(pitch) * radius, target.y + Math.sin(pitch) * radius, target.z + Math.cos(yaw) * Math.cos(pitch) * radius);
    camera.lookAt(target);
  }
  function resize() {
    const rect = canvas.parentElement.getBoundingClientRect();
    size = { width: rect.width, height: rect.height };
    camera.aspect = size.width / size.height; camera.updateProjectionMatrix();
    renderer.setSize(size.width, size.height, false); updateCamera();
  }
  function draw(pose) {
    root.rotation.z = -pose.sway * Math.PI / 180;
    joints.forEach((joint, i) => { joint.rotation.x = pose.angles[i] * Math.PI / 180; });
    renderer.render(scene, camera);
  }
  function view(name) {
    [yaw, pitch] = name === 'side' ? [Math.PI / 2, .04] : name === 'front' ? [0, .04] : [.95, .15]; updateCamera();
  }
  function orbit(dx, dy) {
    yaw -= dx / size.width * 3.5; pitch = Math.max(-.3, Math.min(.65, pitch + dy / size.height * 1.8)); updateCamera();
  }
  resize();
  return { draw, resize, view, orbit, dispose() {
    meshes.forEach(m => m.geometry.dispose());
    new Set(meshes.map(m => m.material)).forEach(m => m.dispose());
    grid.geometry.dispose(); grid.material.dispose(); texture.dispose(); renderer.dispose();
  } };
}
