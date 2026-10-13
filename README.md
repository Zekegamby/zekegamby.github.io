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

## Visitor finger studio and weekly print

The existing `motion-lab.html` URL now hosts the Finger Studio. Visitors can edit reach, width, taper, one of three shell styles and five palettes. Changes rebuild the articulated Three.js model; the SVG fallback also reflects proportions, shell style and colours. The preview's bend slider, individual joints, movement playback and opt-in hand tracking all control the current design. Leaving the Move panel stops camera capture.

`assets/finger-design.mjs` defines the version-1 concept schema, bounds, starting points, keyword-based generator, share-link encoding and email draft. The generator uses a documented shape/colour vocabulary locally; it does not call an AI service. `assets/finger-studio.mjs` handles the design controls, accessible tabs, undo/redo, sharing and submissions. Motion-lab module URLs are versioned together to prevent incompatible cached modules.

Share links contain validated design settings in the URL fragment. They include the design title but never the creator name or idea note. Concept downloads are JSON settings with a reopenable link, not STL/voxel/printer-ready files. No design or camera data is posted to a server. There is no automatic save: visitors should copy their link or download the settings to keep a design.

Weekly print entries use a `mailto:zekegamby@gmail.com` draft containing the exact interactive design link, optional credit name and note. The visitor must send the email in their email app. The UI never claims to have received a submission. A backend would be needed for an on-site submissions inbox. The weekly section currently invites the first selection; no community winners, print photos or tests are fabricated. Add real featured projects with creator approval as they are made. Printed designs are developed and adapted by Zeke, not produced directly from the visual preview.

The tests cover design-link validation/roundtrips, geometry, prompt vocabulary, controller integration, history, email/clipboard behaviour and the existing mobile-camera lifecycle. They use Node and mocked browser APIs, not rendered or physical-device QA.

## Unpublished local AI pilot

`ai-studio.html` adds open-ended prompt interpretation through a local Ollama model. `assets/ai-design.mjs` validates generated primitives, variable-radius tubes and triangle meshes on a three-joint rig. `assets/ai-renderer.mjs` draws them; the existing camera and manual motion lifecycle is shared through `assets/motion-runtime.mjs`. Model output is data and is never evaluated as code. The original studio still uses its version-1 schema and renderer.

`local-ai/server.mjs` is a loopback-only Node service with an asset allowlist, asynchronous bounded jobs, cancellation, timeouts and one GPU request at a time. `Start-Finger-Studio.cmd` installs missing prerequisites through Windows Package Manager where available and runs the local pilot. See [setup and public connection notes](local-ai/README.md). `node local-ai/package.mjs` builds a small zip without the portfolio's media or Git history.

This branch is preparation for a real test on the host PC. It has not activated AI on the public site. Node tests cover request/revision flow, data validation, cancellation, import/export, HTTP boundaries and the existing mobile camera lifecycle. Neither Windows setup nor real model output nor rendered browser/phone behavior has been tested in this workspace.
