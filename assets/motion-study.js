// Frame-accurate interaction with recorded prototype footage. No 3D simulation.
(() => {
  window.portfolioMotionCleanup?.();
  const disposers = [];
  window.portfolioMotionCleanup = () => disposers.splice(0).forEach(dispose => dispose());

  document.querySelectorAll('[data-motion-study]').forEach(root => {
    const canvas = root.querySelector('canvas');
    const context = canvas?.getContext('2d');
    if (!context) return;
    const surface = root.querySelector('.motion-surface');
    const poster = root.querySelector('.motion-poster');
    const slider = root.querySelector('input[type="range"]');
    const playButton = root.querySelector('.motion-play');
    const controls = root.querySelector('.motion-controls');
    const counter = root.querySelector('.motion-counter');
    const status = root.querySelector('.motion-status');
    const atlas = new Image();
    const count = 32;
    const columns = 4;
    const frameWidth = 800;
    const frameHeight = 450;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
    let loaded = false;
    let disposed = false;
    let playing = false;
    let visible = true;
    let raf = 0;
    let start = 0;
    let frame = 0;
    let touched = false;
    let pointer = null;
    let observer;

    function draw(next) {
      if (!loaded || disposed) return;
      frame = Math.max(0, Math.min(count - 1, Math.round(next)));
      context.drawImage(atlas, (frame % columns) * frameWidth,
        Math.floor(frame / columns) * frameHeight, frameWidth, frameHeight,
        0, 0, canvas.width, canvas.height);
      slider.value = String(frame);
      slider.style.setProperty('--position', `${frame / (count - 1) * 100}%`);
      slider.setAttribute('aria-valuetext', `Recorded frame ${frame + 1} of ${count}`);
      counter.textContent = `${String(frame + 1).padStart(2, '0')} / ${count}`;
      root.style.setProperty('--flex', frame / (count - 1));
    }
    function pause() {
      playing = false;
      cancelAnimationFrame(raf);
      playButton.textContent = 'Play motion';
      playButton.setAttribute('aria-pressed', 'false');
    }
    function tick(time) {
      if (!playing || !visible || document.hidden || disposed) { pause(); return; }
      if (!start) start = time;
      // Playing a single recorded bend; hold the final frame rather than invent a return.
      const progress = Math.min(1, (time - start) / 1700);
      draw(progress * (count - 1));
      if (progress === 1) { pause(); return; }
      raf = requestAnimationFrame(tick);
    }
    function play() {
      if (!loaded) return;
      playing = true;
      start = 0;
      draw(0);
      playButton.textContent = 'Pause';
      playButton.setAttribute('aria-pressed', 'true');
      raf = requestAnimationFrame(tick);
    }
    function userInput(next) {
      touched = true;
      root.classList.add('motion-touched');
      pause();
      draw(next);
    }
    function pointerFrame(clientX) {
      const rect = surface.getBoundingClientRect();
      return (clientX - rect.left) / rect.width * (count - 1);
    }
    function pointerDown(event) {
      if (!loaded || (event.pointerType === 'mouse' && event.button !== 0)) return;
      pointer = { id: event.pointerId, x: event.clientX, y: event.clientY };
      surface.setPointerCapture(event.pointerId);
      userInput(pointerFrame(event.clientX));
    }
    function pointerMove(event) {
      if (!pointer || event.pointerId !== pointer.id) return;
      userInput(pointerFrame(event.clientX));
    }
    function pointerUp(event) {
      if (pointer && surface.hasPointerCapture(pointer.id)) surface.releasePointerCapture(pointer.id);
      pointer = null;
    }
    function visibilityChange() { if (document.hidden) pause(); }
    function preferenceChange() { if (reduced.matches) pause(); }
    function sliderInput() { userInput(Number(slider.value)); }
    function playClick() {
      touched = true;
      root.classList.add('motion-touched');
      playing ? pause() : play();
    }
    function load() { if (!atlas.src) atlas.src = root.dataset.motionAtlas; }

    canvas.width = frameWidth;
    canvas.height = frameHeight;
    atlas.onload = () => {
      if (disposed) return;
      loaded = true;
      root.classList.add('motion-ready');
      canvas.hidden = false;
      poster.hidden = true;
      controls.hidden = false;
      status.textContent = 'Drag to flex';
      draw(0);
      // One quiet introduction, only when visible. Reduced-motion visitors choose playback.
      if (visible && !reduced.matches && !touched && !navigator.connection?.saveData) play();
    };
    atlas.onerror = () => { status.textContent = 'A printed finger, on the test bench'; };
    if ('IntersectionObserver' in window) {
      observer = new IntersectionObserver(entries => {
        visible = entries[0].isIntersecting;
        if (visible) load(); else pause();
      }, { threshold: 0.2 });
      observer.observe(root);
    } else load();
    surface.addEventListener('pointerdown', pointerDown);
    surface.addEventListener('pointermove', pointerMove);
    surface.addEventListener('pointerup', pointerUp);
    surface.addEventListener('pointercancel', pointerUp);
    slider.addEventListener('input', sliderInput);
    playButton.addEventListener('click', playClick);
    document.addEventListener('visibilitychange', visibilityChange);
    reduced.addEventListener('change', preferenceChange);
    disposers.push(() => {
      disposed = true;
      pause();
      observer?.disconnect();
      document.removeEventListener('visibilitychange', visibilityChange);
      reduced.removeEventListener('change', preferenceChange);
      atlas.onload = atlas.onerror = null;
    });
  });
})();
