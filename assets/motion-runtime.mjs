import { landmarksToPose, fingerPoints, smoothPose } from './finger-kinematics.mjs?v=20261013-studio';

export async function startMotionLab({ createFingerRenderer, initFingerStudio, DEFAULT_DESIGN, PALETTES, designGeometry, fallback, unavailableMessage }) {
const $ = id => document.getElementById(id);
const stage = $('lab-stage'), canvas = $('finger-canvas'), video = $('hand-video');
const overlay = $('hand-overlay'), overlayContext = overlay.getContext('2d');
const cameraButton = $('camera-button'), status = $('tracking-status');
const sliders = [0, 1, 2].map(i => $(`joint-${i}`));
const readouts = [0, 1, 2].map(i => $(`angle-${i}`));
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
let target = { angles: [14, 24, 16], sway: 0 };
let pose = { angles: [...target.angles], sway: 0 };
let renderer, stream, worker, initTimer, frameTimer, raf, cancelVisibilityWait;
let state = 'manual', generation = 0, busy = false, demo = false;
let lastFrameTime = -1, lastSent = 0, lastSeen = 0, previousTime = 0, lastReadout = 0;
let pointer = null, dirty = true, demoStart = 0, trackingLabel = '';
let design = DEFAULT_DESIGN, geometry = designGeometry(design), modelDirty = true;
const setStatus = message => { if (status.textContent !== message) status.textContent = message; };

function setMode(label, live = false) {
  if (trackingLabel === label) return;
  trackingLabel = label;
  $('lab-mode').textContent = label;
  $('lab-mode').dataset.live = String(live);
}
function stopDemo() {
  demo = false;
  $('demo-button').textContent = 'Play a movement';
  $('demo-button').setAttribute('aria-pressed', 'false');
}
function updateSliders() {
  $('quick-flex').value = Math.min(100, Math.round(target.angles[1]));
  sliders.forEach((slider, i) => {
    slider.value = Math.round(target.angles[i]);
    slider.setAttribute('aria-valuetext', `${Math.round(target.angles[i])} degrees`);
  });
}
function stopCamera(message = 'Camera off. Explore the finger with the controls below.') {
  generation++;
  cancelVisibilityWait?.();
  clearTimeout(initTimer); clearTimeout(frameTimer);
  worker?.terminate(); worker = null;
  stream?.getTracks().forEach(track => track.stop()); stream = null;
  video.pause(); video.srcObject = null;
  video.hidden = overlay.hidden = true;
  $('camera-placeholder').hidden = false;
  overlayContext?.clearRect(0, 0, overlay.width, overlay.height);
  $('tracking-tips').hidden = true; $('manual-controls').hidden = false;
  cameraButton.textContent = 'Enable camera'; cameraButton.disabled = false;
  $('camera-label').textContent = 'Camera off';
  state = 'manual'; busy = false; lastFrameTime = -1; lastSeen = 0;
  target = { angles: [...pose.angles], sway: 0 }; updateSliders();
  setMode('Manual control'); setStatus(message); dirty = true;
}
function cameraError(error) {
  if (error.name === 'NotAllowedError' || error.name === 'SecurityError') return 'Camera permission is blocked. Allow camera access in your browser’s site settings, then retry. Manual controls still work.';
  if (error.name === 'NotFoundError') return 'No camera was found. You can still explore with the manual controls.';
  if (error.name === 'NotReadableError') return 'The camera is busy or unavailable. Close other camera apps, then retry.';
  return 'The camera could not start. Try opening this page in Safari, Chrome, Edge or Firefox, or use the manual controls.';
}
function waitForPermissionSheetToClose() {
  if (!document.hidden) return Promise.resolve(true);
  return new Promise(resolve => {
    let finished = false;
    const finish = visible => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisibility);
      cancelVisibilityWait = null;
      resolve(visible);
    };
    const onVisibility = () => { if (!document.hidden) finish(true); };
    const timer = setTimeout(() => finish(false), 5000);
    cancelVisibilityWait = () => finish(false);
    document.addEventListener('visibilitychange', onVisibility);
  });
}
async function startCamera() {
  if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
    setStatus('Camera access needs a supported browser over HTTPS. Open zekegamby.com in your browser, or use the manual controls.'); return;
  }
  if (!window.Worker || !window.OffscreenCanvas || !window.createImageBitmap) {
    setStatus('This browser does not support the hand tracker. Try a recent browser, or use the manual controls.'); return;
  }
  stopDemo();
  const session = ++generation;
  // Permission sheets can hide the page. Keep this distinct from an active
  // camera session, which must still stop when the visitor switches tabs.
  state = 'requesting'; cameraButton.textContent = 'Cancel camera';
  setMode('Starting camera'); setStatus('Allow camera access when your browser asks.');
  try {
    const acquired = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { ideal: 24, max: 30 } }, audio: false });
    if (session !== generation) { acquired.getTracks().forEach(track => track.stop()); return; }
    stream = acquired;
    stream.getVideoTracks().forEach(track => track.addEventListener('ended', () => {
      if (session === generation) stopCamera('The camera disconnected. Reconnect it and try again, or use manual controls.');
    }, { once: true }));
    while (document.hidden) {
      // No video is processed while a system permission sheet covers the page.
      acquired.getVideoTracks().forEach(track => { track.enabled = false; });
      const visible = await waitForPermissionSheetToClose();
      if (session !== generation) return;
      if (!visible) { stopCamera('Camera stopped while this page was away. Return to the page and enable it again.'); return; }
    }
    acquired.getVideoTracks().forEach(track => { track.enabled = true; });
    state = 'starting';
    video.muted = true; video.playsInline = true;
    video.srcObject = stream; video.hidden = false; $('camera-placeholder').hidden = true;
    $('camera-label').textContent = 'Camera on';
    await video.play();
    if (session !== generation) return;
    setStatus('Loading the hand tracker. The first visit downloads about 18 MB; your video stays on this device.');
    setMode('Loading tracker');
    $('manual-controls').hidden = true; $('tracking-tips').hidden = false;
    cameraButton.textContent = 'Stop camera';
    worker = new Worker(new URL('./hand-tracker-worker.js?v=20261013-camera', import.meta.url));
    const activeWorker = worker;
    initTimer = setTimeout(() => {
      if (session === generation) stopCamera('The tracker took too long to load. Check your connection and retry, or use manual controls.');
    }, 60000);
    activeWorker.onerror = () => {
      if (session === generation) stopCamera('The hand tracker could not start. Try a recent Safari, Chrome, Edge or Firefox browser. Manual controls still work.');
    };
    activeWorker.onmessage = ({ data }) => {
      if (session !== generation) return;
      if (data.type === 'ready') {
        clearTimeout(initTimer); state = 'tracking'; busy = false; lastFrameTime = -1; lastSeen = 0;
        setMode('Looking for a hand'); setStatus('Show one whole hand, palm toward the camera. Slowly bend your index finger.');
      } else if (data.type === 'error') {
        stopCamera(data.phase === 'init' ? 'The tracking model could not load. Check your connection or content blocker and retry. Manual controls still work.' : 'Tracking stopped unexpectedly. Restart the camera to try again, or use manual controls.');
      } else if (data.type === 'pose') {
        clearTimeout(frameTimer); busy = false;
        const next = landmarksToPose(data.world);
        if (next && data.landmarks) {
          target = next; lastSeen = performance.now();
          drawLandmarks(data.landmarks);
          setMode('Following your finger', true);
          setStatus('Following your index finger. Bend slowly and keep the joints visible.');
        } else {
          overlayContext?.clearRect(0, 0, overlay.width, overlay.height);
          if (!lastSeen || performance.now() - lastSeen > 700) {
            setMode(lastSeen ? 'Hand out of view' : 'Looking for a hand');
            setStatus(lastSeen ? 'Hand out of view. Holding the last pose—bring your whole hand back into the frame.' : 'Show one whole hand, palm toward the camera. Slowly bend your index finger.');
          }
        }
      }
    };
    activeWorker.postMessage({ type: 'init' });
  } catch (error) {
    if (session === generation) stopCamera(cameraError(error));
  }
}

// Overlay and video share the same letterboxed viewport and mirrored transform.
function drawLandmarks(points) {
  if (!overlayContext || !video.videoWidth) return;
  const rect = $('camera-preview').getBoundingClientRect();
  const width = Math.round(rect.width), height = Math.round(rect.height);
  if (overlay.width !== width || overlay.height !== height) { overlay.width = width; overlay.height = height; }
  const scale = Math.min(width / video.videoWidth, height / video.videoHeight);
  const w = video.videoWidth * scale, h = video.videoHeight * scale;
  const offsetX = (width - w) / 2, offsetY = (height - h) / 2;
  const position = p => [offsetX + p.x * w, offsetY + p.y * h];
  const ctx = overlayContext;
  ctx.clearRect(0, 0, width, height); overlay.hidden = false;
  const chains = [[0, 1, 2, 3, 4], [0, 5, 6, 7, 8], [5, 9, 10, 11, 12], [9, 13, 14, 15, 16], [13, 17, 18, 19, 20], [0, 17]];
  ctx.lineWidth = 1; ctx.strokeStyle = 'rgba(255,255,255,.45)';
  chains.forEach(chain => { ctx.beginPath(); chain.forEach((id, i) => { const p = position(points[id]); i ? ctx.lineTo(...p) : ctx.moveTo(...p); }); ctx.stroke(); });
  ctx.lineWidth = 3; ctx.strokeStyle = '#b5f3df'; ctx.fillStyle = '#ddfff3';
  ctx.beginPath(); [5, 6, 7, 8].forEach((id, i) => { const p = position(points[id]); i ? ctx.lineTo(...p) : ctx.moveTo(...p); }); ctx.stroke();
  [5, 6, 7, 8].forEach(id => { const p = position(points[id]); ctx.beginPath(); ctx.arc(...p, 4, 0, Math.PI * 2); ctx.fill(); });
}

async function capture(time) {
  if (state !== 'tracking' || busy || video.readyState < 2 || time - lastSent < 50 || video.currentTime === lastFrameTime) return;
  const session = generation, activeWorker = worker;
  busy = true; lastSent = time; lastFrameTime = video.currentTime;
  frameTimer = setTimeout(() => {
    if (session === generation) stopCamera('The hand tracker stopped responding. Restart the camera, or use the manual controls.');
  }, 8000);
  try {
    const frame = await createImageBitmap(video);
    if (session !== generation || state !== 'tracking') { frame.close(); return; }
    try { activeWorker.postMessage({ type: 'frame', frame, timestamp: time }, [frame]); }
    catch (error) { frame.close(); throw error; }
  } catch (_) {
    if (session === generation) stopCamera('This browser could not read camera frames. Try another browser, or use manual controls.');
  }
}

function drawFallback() {
  if (fallback) { fallback({ pose, design }); return; }
  const points = fingerPoints(pose.angles, pose.sway, geometry.lengths).map(([x, y, z]) => [290 + z * 57 + x * 25, 465 - y * 54]);
  const path = points.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(2)} ${p[1].toFixed(2)}`).join('');
  $('fallback-bones').setAttribute('d', path); $('fallback-tendon').setAttribute('d', path);
  $('fallback-bones').setAttribute('stroke', PALETTES[design.palette].accent);
  $('fallback-joints').setAttribute('fill', PALETTES[design.palette].joint);
  document.querySelectorAll('[data-fallback-segment]').forEach((segment, i) => {
    const a = points[i], b = points[i + 1];
    const start = a.map((v, axis) => v + (b[axis] - v) * .13), end = a.map((v, axis) => v + (b[axis] - v) * .86);
    segment.setAttribute('d', `M${start.join(' ')}L${end.join(' ')}`);
    segment.setAttribute('stroke', PALETTES[design.palette].shell);
    segment.setAttribute('stroke-width', geometry.radii[i] * (design.style === 'exposed' ? 55 : 100));
    segment.setAttribute('stroke-dasharray', design.style === 'ribbed' ? '8 6' : 'none');
  });
  [...$('fallback-joints').children].forEach((circle, i) => { circle.setAttribute('cx', points[i][0]); circle.setAttribute('cy', points[i][1]); circle.setAttribute('r', geometry.radii[i] * 42); });
}
function animate(time) {
  if (document.hidden) return;
  const dt = previousTime ? Math.min((time - previousTime) / 1000, .1) : 1 / 60; previousTime = time;
  if (demo) {
    const flex = (1 - Math.cos((time - demoStart) / 1400)) / 2;
    target = { angles: [70 * flex, 90 * flex, 62 * flex], sway: 0 };
    updateSliders();
  }
  const moving = pose.angles.some((v, i) => Math.abs(v - target.angles[i]) > .015) || Math.abs(pose.sway - target.sway) > .015;
  if (moving || dirty) {
    if (modelDirty && renderer) { renderer.design(design); modelDirty = false; }
    pose = reducedMotion.matches && state === 'manual' ? { angles: [...target.angles], sway: target.sway } : smoothPose(pose, target, dt);
    if (renderer) renderer.draw(pose); else drawFallback();
    if (time - lastReadout > 100 || dirty) { readouts.forEach((output, i) => { output.value = String(Math.round(pose.angles[i])); }); lastReadout = time; }
    dirty = false;
  }
  if (state === 'tracking') capture(time);
  raf = requestAnimationFrame(animate);
}
function setManualPose(angles) {
  if (state !== 'manual') stopCamera();
  stopDemo(); target = { angles: [...angles], sway: 0 }; updateSliders();
}
sliders.forEach((slider, i) => slider.addEventListener('input', () => {
  const value = Number(slider.value);
  const angles = [...target.angles]; angles[i] = value; setManualPose(angles);
}));
$('quick-flex').addEventListener('input', event => {
  const flex = Number(event.target.value); setManualPose([flex * .75, flex, flex * .65]);
});
document.querySelectorAll('[data-preset]').forEach(button => button.addEventListener('click', () => {
  setManualPose({ open: [0, 0, 0], relaxed: [14, 24, 16], curl: [75, 100, 65] }[button.dataset.preset]);
}));
$('demo-button').addEventListener('click', () => {
  if (demo) { stopDemo(); return; }
  demo = true; demoStart = performance.now();
  $('demo-button').textContent = 'Pause movement'; $('demo-button').setAttribute('aria-pressed', 'true');
});
cameraButton.addEventListener('click', () => state === 'manual' ? startCamera() : stopCamera());
$('manual-button').addEventListener('click', () => { stopCamera(); sliders[0].focus(); });
document.querySelectorAll('[data-view]').forEach(button => button.addEventListener('click', () => {
  renderer?.view(button.dataset.view); dirty = true;
  document.querySelectorAll('[data-view]').forEach(b => b.setAttribute('aria-pressed', String(b === button)));
}));
canvas.addEventListener('pointerdown', event => {
  if (event.pointerType === 'mouse' && event.button !== 0) return;
  pointer = { id: event.pointerId, x: event.clientX, y: event.clientY };
  canvas.setPointerCapture(event.pointerId);
});
canvas.addEventListener('pointermove', event => {
  if (!pointer || event.pointerId !== pointer.id) return;
  renderer?.orbit(event.clientX - pointer.x, event.clientY - pointer.y); dirty = true;
  pointer.x = event.clientX; pointer.y = event.clientY;
  document.querySelectorAll('[data-view]').forEach(b => b.setAttribute('aria-pressed', 'false'));
});
['pointerup', 'pointercancel', 'lostpointercapture'].forEach(type => canvas.addEventListener(type, () => { pointer = null; }));
const resize = () => { renderer?.resize(); dirty = true; };
const resizeObserver = 'ResizeObserver' in window ? new ResizeObserver(resize) : null;
resizeObserver?.observe(stage);
window.addEventListener('resize', resize);
document.addEventListener('visibilitychange', () => {
  if (document.hidden) { if (state !== 'manual' && state !== 'requesting') stopCamera('Camera stopped while this tab was away. Enable it again when you’re ready.'); stopDemo(); cancelAnimationFrame(raf); }
  else { previousTime = 0; dirty = true; cancelAnimationFrame(raf); raf = requestAnimationFrame(animate); }
});
window.addEventListener('pagehide', () => { stopCamera(); stopDemo(); cancelAnimationFrame(raf); });
window.addEventListener('pageshow', event => { if (event.persisted) { previousTime = 0; dirty = true; cancelAnimationFrame(raf); raf = requestAnimationFrame(animate); } });
canvas.addEventListener('webglcontextlost', event => {
  event.preventDefault(); renderer?.dispose(); renderer = null;
  canvas.hidden = true; $('finger-fallback').hidden = false; dirty = true;
  $('render-note').hidden = false; $('render-note').textContent = unavailableMessage || '3D paused. The side-view model still follows your finger.';
  document.querySelectorAll('[data-view]').forEach(b => { b.disabled = true; });
});

cameraButton.disabled = false;
initFingerStudio(next => { design = next; geometry = designGeometry(next); modelDirty = dirty = true; }, panel => {
  if (panel !== 'move') { if (state !== 'manual') stopCamera(); stopDemo(); }
});
raf = requestAnimationFrame(animate);
try {
  renderer = await createFingerRenderer(canvas);
  canvas.hidden = false; $('finger-fallback').hidden = true; $('render-note').hidden = true;
  $('view-hint').textContent = 'Drag to rotate the view'; dirty = true;
} catch (_) {
  $('render-note').textContent = unavailableMessage || 'Showing the side-view model. Camera and manual controls still work.';
  document.querySelectorAll('[data-view]').forEach(b => { b.disabled = true; b.setAttribute('aria-pressed', String(b.dataset.view === 'side')); });
  dirty = true;
}

}
