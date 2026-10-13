import { DEFAULT_DESIGN, PALETTES, RANGES, STARTERS, normaliseDesign, decodeDesign, shareURL, randomDesign, designFromPrompt, submissionMail } from './finger-design.mjs?v=20261013-studio';

export function initFingerStudio(onDesign, onPanel) {
  const $ = id => document.getElementById(id);
  const tabs = [...document.querySelectorAll('[data-studio-tab]')];
  const say = message => { $('design-status').textContent = message; };
  const loaded = decodeDesign(window.location.hash);
  let design = loaded.design || { ...DEFAULT_DESIGN };
  let history = [], future = [];
  const link = () => shareURL(design, window.location.href);
  function refreshSubmission() {
    $('design-link').value = link();
    $('submission-email').href = submissionMail(design, $('creator-name').value, $('design-idea').value, link());
  }
  function render() {
    $('design-name').value = design.name;
    $('stage-design-name').textContent = design.name;
    $('stage-design-spec').textContent = `${design.style} / ${PALETTES[design.palette].name}`;
    for (const key of Object.keys(RANGES)) {
      $(`design-${key}`).value = design[key]; $(`value-${key}`).textContent = `${design[key]}%`;
    }
    document.querySelectorAll('[data-style]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.style === design.style)));
    document.querySelectorAll('[data-palette]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.palette === design.palette)));
    $('palette-name').textContent = PALETTES[design.palette].name;
    $('undo-design').disabled = !history.length; $('redo-design').disabled = !future.length;
    refreshSubmission(); onDesign(design);
  }
  function apply(next, record = true) {
    const clean = normaliseDesign(next);
    if (JSON.stringify(clean) === JSON.stringify(design)) return;
    if (record) { history.push(design); history = history.slice(-40); future = []; }
    design = clean; render();
  }
  function panel(name, focus = false) {
    tabs.forEach(tab => {
      const active = tab.dataset.studioTab === name;
      tab.setAttribute('aria-selected', String(active)); tab.tabIndex = active ? 0 : -1;
      $(`panel-${tab.dataset.studioTab}`).hidden = !active;
      if (active && focus) tab.focus();
    });
    onPanel(name);
  }
  tabs.forEach((tab, i) => {
    tab.addEventListener('click', () => panel(tab.dataset.studioTab));
    tab.addEventListener('keydown', event => {
      let next;
      if (event.key === 'ArrowRight') next = (i + 1) % tabs.length;
      if (event.key === 'ArrowLeft') next = (i + tabs.length - 1) % tabs.length;
      if (event.key === 'Home') next = 0;
      if (event.key === 'End') next = tabs.length - 1;
      if (next !== undefined) { event.preventDefault(); panel(tabs[next].dataset.studioTab, true); }
    });
  });
  document.querySelectorAll('[data-open-panel]').forEach(button => button.addEventListener('click', () => {
    panel(button.dataset.openPanel, true);
    if (button.dataset.scroll === 'true') $('studio-controls').scrollIntoView({ block: 'start', behavior: 'instant' });
  }));
  for (const key of Object.keys(RANGES)) {
    // One undo step for a complete slider gesture, including keyboard changes.
    let before;
    $(`design-${key}`).addEventListener('input', event => {
      before ||= design; apply({ ...design, [key]: Number(event.target.value) }, false);
    });
    $(`design-${key}`).addEventListener('change', () => {
      if (before && JSON.stringify(before) !== JSON.stringify(design)) { history.push(before); history = history.slice(-40); future = []; }
      before = null; render();
    });
  }
  $('design-name').addEventListener('change', event => apply({ ...design, name: event.target.value }));
  document.querySelectorAll('[data-style]').forEach(b => b.addEventListener('click', () => apply({ ...design, style: b.dataset.style })));
  document.querySelectorAll('[data-palette]').forEach(b => b.addEventListener('click', () => apply({ ...design, palette: b.dataset.palette })));
  document.querySelectorAll('[data-starter]').forEach(b => b.addEventListener('click', () => {
    apply(STARTERS[b.dataset.starter]); say(`${design.name} loaded. Make it your own.`);
  }));
  $('surprise-design').addEventListener('click', () => { apply(randomDesign()); say('A new variation. Everything here can be adjusted.'); });
  $('reset-design').addEventListener('click', () => { apply(DEFAULT_DESIGN); say('Back to the original. Undo brings your last design back.'); });
  $('undo-design').addEventListener('click', () => {
    if (!history.length) return; future.push(design); design = history.pop(); render(); say('Previous design restored.');
  });
  $('redo-design').addEventListener('click', () => {
    if (!future.length) return; history.push(design); design = future.pop(); render(); say('Design change restored.');
  });
  $('prompt-form').addEventListener('submit', event => {
    event.preventDefault();
    const result = designFromPrompt($('design-prompt').value, design);
    if (!result.matches.length) { say('Try shape and colour words such as “long, slim, ribbed, orange”. Extra features need to go in your submission note.'); return; }
    apply(result.design); say(`Applied: ${result.matches.join(', ')}. Other words are not modelled.`);
  });
  ['creator-name', 'design-idea'].forEach(id => $(id).addEventListener('input', refreshSubmission));
  $('copy-design').addEventListener('click', async () => {
    refreshSubmission();
    try {
      if (!navigator.clipboard?.writeText) throw new Error();
      await navigator.clipboard.writeText(link()); $('share-status').textContent = 'Design link copied. It opens this finger, ready to move.';
    } catch {
      $('design-link').focus(); $('design-link').select();
      $('share-status').textContent = 'Copy the selected link below. It opens this exact design.';
    }
  });
  $('download-design').addEventListener('click', () => {
    const blob = new Blob([JSON.stringify({ ...design, kind: 'visual-finger-concept', link: link() }, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob), a = document.createElement('a');
    a.href = url; a.download = `${design.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'finger'}-concept.json`;
    document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 10000);
    $('share-status').textContent = 'Concept settings saved. This is not a printer-ready model.';
  });
  $('submission-email').addEventListener('click', () => {
    refreshSubmission(); $('share-status').textContent = 'Your email app will open a draft. Send it there to enter the weekly selection.';
  });
  window.addEventListener('hashchange', () => {
    const next = decodeDesign(window.location.hash);
    if (next.design) { apply(next.design); say('Shared design loaded. Change it, move it, or make your own version.'); }
    else if (next.error) say(next.error);
  });
  render();
  if (loaded.error) say(loaded.error);
  else if (loaded.design) say('Shared design loaded. Change it, move it, or make your own version.');
  return { panel };
}
