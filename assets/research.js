(() => {
  const film = document.getElementById('product-film-video');
  if (film) {
    const play = document.getElementById('film-play');
    const sound = document.getElementById('film-sound');
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
    let manualPause = reduced.matches;
    const sync = () => {
      play.textContent = film.paused ? 'Play' : 'Pause';
      play.setAttribute('aria-label', film.paused ? 'Play film' : 'Pause film');
      sound.textContent = film.muted ? 'Sound off' : 'Sound on';
      sound.setAttribute('aria-label', film.muted ? 'Turn sound on' : 'Turn sound off');
    };
    const start = () => film.play().catch(sync);
    film.muted = true;
    if (reduced.matches) { film.autoplay = false; film.pause(); } else start();
    play.addEventListener('click', () => { manualPause = !film.paused; film.paused ? start() : film.pause(); });
    sound.addEventListener('click', () => { film.muted = !film.muted; sync(); });
    ['play','pause','volumechange'].forEach(event => film.addEventListener(event, sync));
    new IntersectionObserver(entries => {
      if (entries[0].isIntersecting && !manualPause && !document.hidden) start();
      else film.pause();
    }, {threshold: 0.1}).observe(film);
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) film.pause();
      else if (!manualPause && film.getBoundingClientRect().bottom > 0 && film.getBoundingClientRect().top < innerHeight) start();
    });
    reduced.addEventListener('change', () => { if (reduced.matches) { manualPause = true; film.pause(); } });
    sync();
  }

  const filters = [...document.querySelectorAll('[data-filter]')];
  const items = [...document.querySelectorAll('[data-category]')];
  filters.forEach(button => button.addEventListener('click', () => {
    filters.forEach(other => other.setAttribute('aria-pressed', String(other === button)));
    items.forEach(item => { item.hidden = button.dataset.filter !== 'all' && item.dataset.category !== button.dataset.filter; });
  }));

  const viewer = document.getElementById('image-viewer');
  if (!viewer || typeof viewer.showModal !== 'function') return;
  const links = [...document.querySelectorAll('[data-gallery]')];
  const picture = document.getElementById('viewer-image');
  const title = document.getElementById('viewer-title');
  const caption = document.getElementById('viewer-caption');
  const count = document.getElementById('viewer-count');
  let active = 0;
  let visible = [];
  let opener = null;
  function show(index) {
    active = (index + visible.length) % visible.length;
    const link = visible[active];
    picture.src = link.href;
    picture.alt = link.querySelector('img').alt;
    title.textContent = link.dataset.title;
    caption.textContent = link.dataset.caption;
    count.textContent = `${active + 1} / ${visible.length}`;
  }
  links.forEach(link => link.addEventListener('click', event => {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    visible = links.filter(candidate => !candidate.closest('[hidden]'));
    opener = link;
    show(visible.indexOf(link));
    viewer.showModal();
    document.body.classList.add('viewer-open');
    document.getElementById('viewer-close').focus();
  }));
  document.getElementById('viewer-close').addEventListener('click', () => viewer.close());
  document.getElementById('viewer-prev').addEventListener('click', () => show(active - 1));
  document.getElementById('viewer-next').addEventListener('click', () => show(active + 1));
  viewer.addEventListener('keydown', event => {
    if (event.key === 'ArrowLeft') { event.preventDefault(); show(active - 1); }
    if (event.key === 'ArrowRight') { event.preventDefault(); show(active + 1); }
  });
  viewer.addEventListener('click', event => { if (event.target === viewer) { const r = viewer.getBoundingClientRect(); if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) viewer.close(); } });
  viewer.addEventListener('close', () => { document.body.classList.remove('viewer-open'); opener?.focus(); });
})();
