import { startMotionLab } from './motion-runtime.mjs?v=20261013-ai-pilot';
import { createFingerRenderer } from './ai-renderer.mjs';
import { initFingerStudio } from './ai-controller.mjs';
import { STARTING_DESIGN, designGeometry } from './ai-design.mjs';

await startMotionLab({
  createFingerRenderer, initFingerStudio, DEFAULT_DESIGN: STARTING_DESIGN, designGeometry,
  fallback() {},
  unavailableMessage: '3D could not load. Enable WebGL or try another browser to view this geometry. Your concept can still be saved.'
});
