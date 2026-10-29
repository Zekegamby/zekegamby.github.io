(() => {
  const video = document.getElementById('prototype-video');
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  if (video && !reducedMotion.matches && !navigator.connection?.saveData) {
    video.muted = true;
    video.play().catch(() => {});
  }
  reducedMotion.addEventListener('change', event => {
    if (event.matches && video) video.pause();
  });

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
