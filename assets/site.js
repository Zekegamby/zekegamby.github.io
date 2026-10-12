// All content and navigation work without JavaScript. This only adds image viewing.
(() => {
  const links = Array.from(document.querySelectorAll('[data-viewer]'));
  if (!links.length || typeof HTMLDialogElement === 'undefined') return;
  const dialog = document.createElement('dialog');
  dialog.className = 'image-viewer';
  dialog.setAttribute('aria-label', 'Project photograph');
  dialog.innerHTML = `<div class="viewer-top"><span class="viewer-counter" aria-live="polite"></span><button class="viewer-close" type="button" autofocus>Close ×</button></div><img class="viewer-image" alt=""><p class="viewer-caption"></p><div class="viewer-controls"><button class="viewer-prev" type="button" aria-label="Previous photograph">←</button><span>Photographs</span><button class="viewer-next" type="button" aria-label="Next photograph">→</button></div>`;
  document.body.append(dialog);
  const photo = dialog.querySelector('.viewer-image');
  const caption = dialog.querySelector('.viewer-caption');
  const counter = dialog.querySelector('.viewer-counter');
  let current = 0;
  let opener;
  function show(index) {
    current = (index + links.length) % links.length;
    const link = links[current];
    photo.src = link.href;
    photo.alt = link.querySelector('img').alt;
    caption.textContent = link.dataset.caption || photo.alt;
    counter.textContent = `${current + 1} / ${links.length}`;
  }
  links.forEach((link, index) => {
    link.addEventListener('click', event => {
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      event.preventDefault();
      opener = link;
      show(index);
      dialog.showModal();
      document.body.classList.add('viewer-open');
    });
  });
  dialog.querySelector('.viewer-close').addEventListener('click', () => dialog.close());
  dialog.querySelector('.viewer-prev').addEventListener('click', () => show(current - 1));
  dialog.querySelector('.viewer-next').addEventListener('click', () => show(current + 1));
  dialog.addEventListener('keydown', event => {
    if (event.key === 'ArrowLeft') { event.preventDefault(); show(current - 1); }
    if (event.key === 'ArrowRight') { event.preventDefault(); show(current + 1); }
  });
  dialog.addEventListener('close', () => {
    document.body.classList.remove('viewer-open');
    opener?.focus();
  });
})();
