// A classic worker intentionally allows MediaPipe's WASM loader to importScripts.
// Only transferable frames enter this worker; only landmarks leave it.
let detector;
self.onmessage = async ({ data }) => {
  if (data.type === 'init') {
    try {
      const { FilesetResolver, HandLandmarker } = await import('https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.21/vision_bundle.mjs');
      const files = await FilesetResolver.forVisionTasks('https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.21/wasm');
      detector = await HandLandmarker.createFromOptions(files, {
        baseOptions: {
          modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task',
          delegate: 'CPU'
        },
        runningMode: 'VIDEO', numHands: 1,
        minHandDetectionConfidence: .6, minHandPresenceConfidence: .6, minTrackingConfidence: .6
      });
      self.postMessage({ type: 'ready' });
    } catch (_) {
      self.postMessage({ type: 'error', phase: 'init' });
    }
    return;
  }
  if (data.type === 'frame') {
    try {
      if (!detector) throw new Error('Tracker is not ready');
      const result = detector.detectForVideo(data.frame, data.timestamp);
      self.postMessage({ type: 'pose', landmarks: result.landmarks[0] || null, world: result.worldLandmarks[0] || null });
    } catch (_) {
      self.postMessage({ type: 'error', phase: 'frame' });
    } finally {
      data.frame.close();
    }
  }
};
