import { landmarksToPose, fingerPoints, smoothPose } from './finger-kinematics.mjs?v=20261013-studio';
import { createFingerRenderer } from './finger-renderer.mjs?v=20261013-studio';
import { DEFAULT_DESIGN, PALETTES, designGeometry } from './finger-design.mjs?v=20261013-studio';
import { initFingerStudio } from './finger-studio.mjs?v=20261013-studio';

import { startMotionLab } from './motion-runtime.mjs?v=20261013-ai-pilot';

await startMotionLab({ createFingerRenderer, initFingerStudio, DEFAULT_DESIGN, PALETTES, designGeometry });
