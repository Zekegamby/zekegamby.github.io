# Zeke Gamby portfolio

Static HTML portfolio served by GitHub Pages at `zekegamby.com`.

## Editing

- `index.html`: homepage and selected work.
- The five other HTML pages: individual project case studies. Existing URLs are retained.
- `assets/site.css`: shared responsive design, typography and layout.
- `assets/site.js`: optional keyboard-accessible image viewer. Content and navigation work without JavaScript.
- `assets/*.webp`: optimised project photographs and images extracted from the existing project document.

No framework, dependency installation, or build step is required. Open `index.html` locally to review the website. Preserve `CNAME`, `.nojekyll`, the original images, videos and PDF when updating.

Concept renders and physical prototypes are labelled separately on the Limb It Less page. The original PDF remains available as a direct link.

## Interactive research study

The homepage and `printed-robotics.html` use `assets/motion-study.js` to scrub 32 frames from actual prototype footage. The WebP atlas contains four columns and eight rows of 800 × 450 frames from `SideViewWire.MP4`, starting at 12.08 seconds. A still image remains available without JavaScript. Automatic playback is a single recorded bend and respects reduced-motion and data-saving preferences.

The research page's bench-test clip is a silent nine-second extract from `WithPrototypes.MP4` (4–13 seconds). The interaction is recorded playback, not live hardware control or a simulated mechanism.

## Camera motion lab

`motion-lab.html` is an opt-in, client-side index-finger tracking experiment. The homepage links to it without loading its dependencies. `assets/motion-lab.js` manages camera permission, tracking state, the mirrored preview, manual controls and camera teardown. Camera frames are never recorded, persisted or uploaded; audio is never requested. Switching tabs, leaving the page, choosing manual mode or pressing Stop ends all camera tracks and terminates the tracking worker.

`assets/hand-tracker-worker.js` runs MediaPipe Tasks Vision **0.10.21** in a classic worker (the WASM loader needs `importScripts`). The ES module is dynamically imported from jsDelivr; its pinned WASM files and Google's Hand Landmarker **float16/1** model are downloaded after camera activation. Only one frame is in flight, at a maximum of 20 detections per second. Initialization and inference have cancellation and timeout handling. A recent browser with secure camera access, Workers, OffscreenCanvas, ImageBitmap and WebGL support is required for tracking.

Mobile startup keeps the permission request separate from active tracking. A temporary hidden-page event during the permission prompt no longer cancels the request. If permission resolves while the page is still hidden, the acquired video tracks are disabled until the page returns, with a five-second limit before releasing the camera. Explicit Stop and navigation still cancel immediately. The worker supplies an `OffscreenCanvas` explicitly because this MediaPipe version misidentifies Chrome on iOS and otherwise attempts to use `document` inside the worker.

`assets/finger-kinematics.mjs` estimates index-finger bend angles from world landmarks in a palm-relative coordinate frame. Translation, scale and wrist rotation do not drive the rig. It clamps angles and smooths movement; occluded joints remain estimates. No force, collision or material simulation is performed. `assets/finger-renderer.mjs` draws an original articulated visual model with Three.js **0.180.0**, loaded only on this page. A locally rendered SVG side view remains interactive if the 3D library or WebGL cannot load. There is no automatic animation or camera start.

Run `node --experimental-vm-modules --test tests/*.test.mjs` for pose geometry and camera lifecycle tests. Lifecycle tests use a mocked DOM, worker and camera; they do not replace browser and real-camera checks.
