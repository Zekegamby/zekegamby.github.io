import { STARTING_DESIGN, validateDesign, parseDesign, MAX_DESIGN_BYTES } from './ai-design.mjs';
import { AI_SERVICE_URL } from './ai-config.mjs';

export function initFingerStudio(onDesign, onPanel) {
  const $ = id => document.getElementById(id);
  let history = [STARTING_DESIGN], index = 0, active = null, panel = 'shape';
  const endpoint = AI_SERVICE_URL.replace(/\/$/, '');
  const current = () => history[index];
  const message = text => { $('design-status').textContent = text; };
  async function api(path, options = {}) {
    let response;
    try { response = await fetch(`${endpoint}${path}`, { ...options, signal: options.signal || AbortSignal.timeout(12000) }); }
    catch { throw new Error('Cannot reach the AI studio. Check that the launcher is running, then retry. Your design is still here.'); }
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'The studio could not complete this request. Please retry.');
    return data;
  }
  function controls() {
    $('generate-design').disabled = !!active; $('cancel-generation').hidden = !active;
    $('undo-design').disabled = !!active || index === 0; $('redo-design').disabled = !!active || index === history.length - 1;
    $('reset-design').disabled = !!active; $('import-design').disabled = !!active;
    $('prompt-form').setAttribute('aria-busy', String(!!active));
  }
  function render() {
    const d = current(); onDesign(d);
    $('stage-design-name').textContent = d.name;
    $('stage-design-spec').textContent = `${d.segments.reduce((n, s) => n + s.parts.length, 0)} forms / 3 moving joints`;
    $('design-description').textContent = d.description;
    $('share-design-name').textContent = d.name; controls();
  }
  function commit(input) {
    const d = validateDesign(input); history = history.slice(0, index + 1); history.push(d);
    if (history.length > 15) history.shift(); index = history.length - 1; render();
  }
  function selectPanel(next) {
    panel = next;
    for (const button of document.querySelectorAll('[data-studio-tab]')) {
      const selected = button.dataset.studioTab === next; button.setAttribute('aria-selected', String(selected)); button.tabIndex = selected ? 0 : -1;
      $(`panel-${button.dataset.studioTab}`).hidden = !selected;
    }
    onPanel(next);
  }
  const tabs = [...document.querySelectorAll('[data-studio-tab]')];
  tabs.forEach((button, i) => {
    button.addEventListener('click', () => selectPanel(button.dataset.studioTab));
    button.addEventListener('keydown', event => {
      const n = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : event.key === 'ArrowRight' ? (i + 1) % tabs.length : event.key === 'ArrowLeft' ? (i + tabs.length - 1) % tabs.length : -1;
      if (n >= 0) { event.preventDefault(); selectPanel(tabs[n].dataset.studioTab); tabs[n].focus(); }
    });
  });
  document.querySelectorAll('[data-open-panel]').forEach(b => b.addEventListener('click', () => { selectPanel(b.dataset.openPanel); tabs.find(t => t.dataset.studioTab === panel)?.focus(); }));
  async function cancelJob(run) { if (run.id) try { await api(`/api/designs/${run.id}`, { method: 'DELETE' }); } catch {} }
  $('cancel-generation').addEventListener('click', () => {
    const run = active; if (!run) return; run.cancelled = true; active = null;
    void cancelJob(run); controls(); message('Generation cancelled. Your previous design is unchanged.');
  });
  $('prompt-form').addEventListener('submit', async event => {
    event.preventDefault(); if (active) return;
    const prompt = $('design-prompt').value.trim();
    if (prompt.length < 3) { message('Describe the shape you want to create.'); $('design-prompt').focus(); return; }
    const run = { cancelled: false, started: Date.now() }; active = run; controls();
    message('Sending your idea to the local AI…');
    try {
      const submitted = await api('/api/designs', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ prompt, current: $('revise-design').checked ? current() : null }) });
      run.id = submitted.id;
      if (run.cancelled) { await cancelJob(run); return; }
      while (!run.cancelled) {
        const result = await api(`/api/designs/${run.id}`);
        if (run.cancelled) return;
        if (result.state === 'done') {
          commit(result.design); $('revise-design').checked = true;
          message('Your new shape is ready. Bend it, rotate it, or describe the next change.'); break;
        }
        if (result.state === 'error') throw new Error(result.error);
        if (result.state === 'cancelled') throw new Error('Generation was cancelled. Your previous design is unchanged.');
        const seconds = Math.round((Date.now() - run.started) / 1000);
        message(result.state === 'queued' ? `Waiting for the studio • ${seconds}s` : `Creating your geometry • ${seconds}s. You can still explore the current model.`);
        if (seconds > 360) { await cancelJob(run); throw new Error('Generation took too long. Your design is unchanged. Try a simpler description.'); }
        await new Promise(resolve => setTimeout(resolve, 1500));
      }
    } catch (error) { if (!run.cancelled) { message(error.message); void cancelJob(run); } }
    finally { if (active === run) { active = null; controls(); } }
  });
  $('undo-design').addEventListener('click', () => { if (!active && index) { index--; render(); message('Previous design restored.'); } });
  $('redo-design').addEventListener('click', () => { if (!active && index < history.length - 1) { index++; render(); message('Next design restored.'); } });
  $('reset-design').addEventListener('click', () => { if (!active) { commit(STARTING_DESIGN); $('revise-design').checked = false; message('A fresh start. Your earlier designs are still in Undo.'); } });
  $('download-design').addEventListener('click', () => {
    const blob = new Blob([JSON.stringify(current())], { type: 'application/json' }); const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = `${current().name.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 50) || 'finger'}-concept.json`;
    a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); $('share-status').textContent = 'Concept file downloaded. Reopen it here or attach it to your email to Zeke.';
  });
  $('import-design').addEventListener('change', async event => {
    const file = event.target.files?.[0]; if (!file || active) return;
    try { if (file.size > MAX_DESIGN_BYTES) throw new Error('That file is too large. Choose a studio concept JSON file.'); commit(parseDesign(await file.text())); $('revise-design').checked = true; message('Concept reopened. You can move it or ask for another change.'); }
    catch { message('This file is not a valid AI studio concept. Your current design is unchanged.'); }
    finally { event.target.value = ''; }
  });
  $('submission-email').addEventListener('click', () => {
    const d = current(); $('submission-email').href = `mailto:zekegamby@gmail.com?subject=${encodeURIComponent(`Weekly print idea: ${d.name}`)}&body=${encodeURIComponent(`Hi Zeke,\n\nI'd like to put this concept forward for the weekly print.\n\n${d.name}\n${d.description}\n\nMy idea:\n\nCredit me as:\n\n[Attach the downloaded concept JSON before sending.]`)}`;
    $('share-status').textContent = 'Attach your downloaded concept file to the email draft, then send it to enter.';
  });
  async function checkHealth() {
    $('service-status').textContent = 'Checking the studio…';
    try { const status = await api('/api/health'); $('service-status').textContent = status.ready ? 'Local AI is ready' : 'AI model is not ready. Finish setup in the launcher, then check again.'; }
    catch { $('service-status').textContent = 'AI is offline. Start the launcher on the host PC to generate. Saved concepts still open and move.'; }
  }
  $('check-service').addEventListener('click', checkHealth);
  window.addEventListener('pagehide', () => { if (active) { active.cancelled = true; if (active.id) void fetch(`${endpoint}/api/designs/${active.id}`, { method: 'DELETE', keepalive: true }).catch(() => {}); active = null; controls(); message('Generation cancelled when you left the page. Your design is still here.'); } });
  render(); void checkHealth(); return { get panel() { return panel; } };
}
