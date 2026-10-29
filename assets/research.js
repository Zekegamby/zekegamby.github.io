// Let the real prototype introduce the work, while respecting motion and data preferences.
(() => {
  const video = document.getElementById('prototype-video');
  if (!video) return;
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  if (!reducedMotion.matches && !navigator.connection?.saveData) {
    video.muted = true;
    video.play().catch(() => {}); // Native controls remain available if autoplay is blocked.
  }
  reducedMotion.addEventListener('change', event => {
    if (event.matches) video.pause();
  });
})();
