function tilesPage() {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Cardputer Console</title>
  <style>
    :root { color-scheme: dark; font-family: ui-sans-serif, system-ui, -apple-system, sans-serif; }
    * { box-sizing: border-box; }
    body { margin: 0; background: #090b10; color: #f4f6fb; }
    main { width: min(860px, calc(100% - 32px)); margin: 40px auto 72px; }
    h1 { margin: 0 0 8px; font-size: 28px; }
    h2 { margin: 34px 0 8px; font-size: 21px; }
    .intro, .help { margin: 0 0 20px; color: #aeb6c8; line-height: 1.5; }
    .notice { padding: 12px 14px; margin-bottom: 18px; border: 1px solid #31394b; border-radius: 10px; background: #11151e; color: #cbd3e4; }
    .grid, .shortcut-list, .alias-list { display: grid; gap: 12px; }
    .tile, .panel, .shortcut, .alias-card { border: 1px solid #293043; border-radius: 14px; background: #121722; padding: 16px; }
    .tile.active { border-color: #745cff; background: #17142a; }
    .head { display: flex; gap: 12px; align-items: baseline; margin-bottom: 12px; }
    .number, .key-name { color: #8f7dff; font-weight: 800; font-size: 18px; }
    .name { font-weight: 650; overflow-wrap: anywhere; }
    .meta { color: #8f99ae; font-size: 13px; margin-top: 5px; }
    .deck-actions, .alias-controls { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 12px; }
    .alias-controls input { flex: 1 1 220px; }
    .alias-card.on-deck { border-color: #745cff; }
    .naming-section { margin-top: 34px; border: 1px solid #293043; border-radius: 14px; background: #10151f; }
    .naming-section summary { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 14px 16px; border: 0; background: transparent; cursor: pointer; list-style: none; }
    .naming-section summary::-webkit-details-marker { display: none; }
    .summary-title { font-size: 21px; font-weight: 700; }
    .summary-meta { color: #aeb6c8; font-size: 13px; font-weight: 500; text-align: right; }
    .summary-action::after { content: 'Expand'; color: #a99cff; font-weight: 700; margin-left: 8px; }
    .naming-section[open] .summary-action::after { content: 'Collapse'; }
    .naming-body { padding: 0 14px 14px; }
    .naming-body .help { margin-bottom: 12px; }
    .naming-body .panel { padding: 12px; }
    .naming-body .alias-list { max-height: 430px; overflow-y: auto; padding-right: 4px; }
    .naming-body .alias-card { padding: 10px 12px; border-radius: 10px; }
    .naming-body .alias-card .head { margin-bottom: 4px; }
    .naming-body .alias-controls { margin-top: 7px; }
    .alias-title { overflow-wrap: anywhere; }
    .library-tools { display: flex; gap: 8px; margin: 12px 0; }
    .library-tools input { width: 100%; }
    input, select, textarea, button, summary { border-radius: 9px; border: 1px solid #343d52; background: #181e2a; color: #f4f6fb; padding: 10px 11px; font: inherit; }
    input, select, button, summary { min-height: 40px; }
    textarea { min-height: 130px; resize: vertical; line-height: 1.45; }
    button { cursor: pointer; font-weight: 650; }
    button:hover { background: #222a39; }
    button.primary { border-color: #6652df; background: #4f3fc1; }
    button.primary:hover { background: #5b49db; }
    button:disabled { opacity: .45; cursor: default; }
    .keyboard { display: grid; gap: 7px; margin: 14px 0 20px; overflow-x: auto; }
    .key-row { display: flex; gap: 6px; min-width: max-content; }
    .keycap { width: 43px; min-height: 37px; padding: 5px; border-color: #30394d; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
    .keycap.assigned { border-color: #745cff; background: #251f49; color: #c9c0ff; }
    .form-grid { display: grid; grid-template-columns: 110px 1fr minmax(230px, auto); gap: 12px; }
    label { display: grid; gap: 6px; color: #bac2d3; font-size: 13px; }
    .field-label { display: grid; gap: 6px; color: #bac2d3; font-size: 13px; }
    .delivery-options { display: flex; gap: 6px; }
    .delivery-option { display: flex; align-items: center; gap: 6px; min-height: 40px; padding: 7px 9px; border: 1px solid #343d52; border-radius: 9px; background: #181e2a; color: #f4f6fb; cursor: pointer; }
    .delivery-option input { min-height: 0; margin: 0; accent-color: #745cff; }
    label.prompt { grid-column: 1 / -1; }
    .form-actions, .shortcut-actions { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 12px; }
    .shortcut-head { display: flex; align-items: baseline; gap: 10px; }
    .shortcut-prompt { margin: 10px 0 0; color: #cbd3e4; white-space: pre-wrap; overflow-wrap: anywhere; line-height: 1.4; }
    #message { position: sticky; bottom: 12px; min-height: 42px; margin: 18px 0 0; padding: 10px 13px; border-radius: 9px; background: #151b26e8; color: #9ee6b5; backdrop-filter: blur(8px); }
    @media (max-width: 650px) {
      .form-grid { grid-template-columns: 1fr; }
      label.prompt { grid-column: auto; }
    }
  </style>
</head>
<body>
<main>
  <h1>Cardputer Console</h1>
  <p class="intro">See your live Codex Micro deck, remember short task names, and turn Cardputer keys into reusable prompts.</p>

  <h2>Task tiles</h2>
  <p class="help">Tiles 2–6 always show the five most recently modified visible Codex tasks. New and newly active tasks move to the front automatically; older ones remain in the library below.</p>
  <div class="notice">Tile 1 is permanently <strong>ACTIVE WINDOW</strong>. Internal review agents and subagents are hidden, and pressing a numbered task keeps that task selected.</div>
  <section id="tiles" class="grid" aria-live="polite"></section>
  <div class="deck-actions"><button id="new-task" class="primary" type="button">New Codex task</button></div>

  <details id="task-names" class="naming-section">
    <summary><span class="summary-title">Task short names</span><span class="summary-meta"><span id="alias-summary">Loading…</span><span class="summary-action" aria-hidden="true"></span></span></summary>
    <div class="naming-body">
      <p class="help">Give any task a short Cardputer-only name. The alias follows that task by its ID and is remembered even after the task moves beyond the five visible tiles. The real Codex title is never changed.</p>
      <section class="panel">
        <div class="library-tools"><input id="task-search" type="search" placeholder="Search recent tasks or short names…" aria-label="Search task short names"></div>
        <div id="alias-list" class="alias-list" aria-live="polite"></div>
      </section>
    </div>
  </details>

  <h2>Speaker feedback</h2>
  <p class="help">Hybrid mode speaks direct confirmations and the summarized last answer. Background task updates are silent. Choose Mac for clearer speech, Cardputer for portable speech, or Both. The volume slider controls only the Cardputer; Mac speech follows the Mac system volume. In the Codex Micro layer, press <strong>S</strong> to hear the latest completed answer for the selected tile.</p>
  <section class="panel">
    <form id="sound-form">
      <div class="form-grid">
        <label>Mode<select id="sound-mode"><option value="hybrid">Hybrid speech + tones</option><option value="tones">Tones only</option><option value="mute">Muted</option></select></label>
        <label>Speech output<select id="speech-output"><option value="mac">Mac — best sound</option><option value="cardputer">Cardputer — portable</option><option value="both">Both speakers</option></select></label>
        <label>Cardputer volume<input id="sound-volume" type="range" min="0" max="100" step="1"></label>
        <label>Mac voice<input id="sound-voice" maxlength="48" placeholder="Samantha"></label>
        <label>Speech speed<input id="sound-rate" type="number" min="150" max="360" step="10"></label>
        <label>Answer words<input id="answer-words" type="number" min="8" max="40" step="1"></label>
      </div>
      <div class="form-actions">
        <button class="primary" type="submit">Save speaker settings</button>
        <button id="test-speaker" type="button">Test speaker</button>
        <button id="test-answer" type="button">Read latest answer</button>
      </div>
    </form>
  </section>

  <h2>Prompt shortcuts</h2>
  <p class="help">Tap <strong>Tab once</strong> from Codex Micro to open <strong>Custom</strong>, then press an assigned key. Custom has its own mnemonic keyboard, so <strong>D</strong> can mean Deploy there while remaining Decline in Codex Micro. A shortcut can queue its prompt, steer an active run, or leave the text as an editable draft. Prompts can invoke a skill by including its normal <code>$skill-name</code> invocation.</p>
  <section class="panel">
    <strong>Custom shortcut keys</strong>
    <div class="meta">All 47 unmodified printable keys are available in Custom. Purple keys are assigned; click any key to select or edit it. Space, Tab, Enter, and Backspace retain their device controls.</div>
    <div id="keyboard" class="keyboard"></div>
    <form id="shortcut-form">
      <div class="form-grid">
        <label>Key<input id="shortcut-key" readonly required aria-label="Selected shortcut key"></label>
        <label>Short name<input id="shortcut-label" maxlength="12" placeholder="DEPLOY" required></label>
        <div class="field-label">On press<div class="delivery-options" role="radiogroup" aria-label="Shortcut delivery"><label class="delivery-option"><input type="radio" name="shortcut-delivery" value="queue" checked>Queue</label><label class="delivery-option"><input type="radio" name="shortcut-delivery" value="steer">Steer</label><label class="delivery-option"><input type="radio" name="shortcut-delivery" value="draft">Draft</label></div></div>
        <label class="prompt">Full prompt<textarea id="shortcut-prompt" maxlength="4000" placeholder="$deploy:ship — Build, test, and deploy the current project. Report the live URL and verification results." required></textarea></label>
      </div>
      <div class="form-actions">
        <button class="primary" type="submit">Save shortcut</button>
        <button id="reset-shortcut" type="button">Clear form</button>
      </div>
    </form>
  </section>
  <section id="shortcut-list" class="shortcut-list" aria-live="polite"></section>
  <div id="message" role="status">Ready.</div>
</main>
<script>
const headers = { 'Content-Type': 'application/json', 'X-Cardputer-UI': '1' };
let shortcutCatalog = { keyRows: [], shortcuts: [] };
async function request(path, options = {}) {
  const response = await fetch(path, { cache: 'no-store', ...options });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || 'Request failed');
  return body;
}
function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}
function setMessage(text, error = false) {
  const message = document.querySelector('#message');
  message.textContent = text;
  message.style.color = error ? '#ffaaa2' : '#9ee6b5';
}
function renderSound(sound = {}) {
  document.querySelector('#sound-mode').value = sound.mode || 'hybrid';
  document.querySelector('#speech-output').value = sound.speechOutput || 'mac';
  document.querySelector('#sound-volume').value = sound.volume ?? 45;
  document.querySelector('#sound-voice').value = sound.voice || 'Samantha';
  document.querySelector('#sound-rate').value = sound.speechRate || 280;
  document.querySelector('#answer-words').value = sound.answerMaxWords || 14;
}
async function saveSoundSettings() {
  setMessage('Saving speaker settings…');
  try {
    await request('/api/sound', {
      method: 'POST', headers, body: JSON.stringify({
        mode: document.querySelector('#sound-mode').value,
        speechOutput: document.querySelector('#speech-output').value,
        volume: Number(document.querySelector('#sound-volume').value),
        voice: document.querySelector('#sound-voice').value,
        speechRate: Number(document.querySelector('#sound-rate').value),
        answerMaxWords: Number(document.querySelector('#answer-words').value),
      }),
    });
    setMessage('Speaker settings saved.');
    await render();
  } catch (error) { setMessage(error.message, true); }
}
async function createTask() {
  setMessage('Opening a new Codex task…');
  try {
    await request('/api/tasks/new', { method: 'POST', headers, body: '{}' });
    setMessage('New Codex task opened. It will appear on tile 2 after its first update.');
    await render();
  } catch (error) { setMessage(error.message, true); }
}
async function saveAlias(threadId, label) {
  setMessage('Saving task short name…');
  try {
    await request('/api/aliases/' + encodeURIComponent(threadId), {
      method: 'POST', headers, body: JSON.stringify({ label }),
    });
    setMessage(label.trim() ? 'Short name saved to this task.' : 'Restored the real Codex task name.');
    await render();
  } catch (error) { setMessage(error.message, true); }
}
function editShortcut(key) {
  const shortcut = shortcutCatalog.shortcuts.find(item => item.key === key);
  document.querySelector('#shortcut-key').value = key;
  document.querySelector('#shortcut-label').value = shortcut ? shortcut.label : '';
  const delivery = shortcut ? shortcut.delivery : 'queue';
  document.querySelector('input[name="shortcut-delivery"][value="' + delivery + '"]').checked = true;
  document.querySelector('#shortcut-prompt').value = shortcut ? shortcut.prompt : '';
  document.querySelector('#shortcut-label').focus();
}
function clearShortcutForm() {
  document.querySelector('#shortcut-form').reset();
  document.querySelector('#shortcut-key').value = shortcutCatalog.keyRows.flat()[0] || '';
}
async function shortcutAction(action, payload) {
  setMessage(action === 'run' ? 'Sending prompt to Codex…' : 'Updating shortcut…');
  try {
    await request('/api/shortcuts/' + action, { method: 'POST', headers, body: JSON.stringify(payload) });
    setMessage(action === 'run' ? 'Prompt sent to Codex.' : action === 'remove' ? 'Shortcut removed.' : 'Shortcut saved.');
    if (action !== 'run') clearShortcutForm();
    await render();
  } catch (error) { setMessage(error.message, true); }
}
function renderTiles(status, catalog) {
  const root = document.querySelector('#tiles');
  root.replaceChildren();
  const activeSlot = status.slots.find(item => item.slot === 1) || {};
  const active = element('article', 'tile' + (activeSlot.selected ? ' active' : ''));
  const activeHead = element('div', 'head');
  activeHead.append(element('span', 'number', '1'), element('span', 'name', 'ACTIVE WINDOW'));
  active.append(activeHead, element('div', 'meta', 'Voice, queue, steer, and prompt shortcuts target the visible Codex composer.'));
  root.append(active);

  for (let slotNumber = 2; slotNumber <= 6; slotNumber++) {
    const slot = status.slots.find(item => item.slot === slotNumber) || {};
    const full = catalog.threads.find(item => item.id === slot.threadId);
    const card = element('article', 'tile' + (slot.selected ? ' active' : ''));
    const head = element('div', 'head');
    head.append(element('span', 'number', String(slotNumber)), element('span', 'name', full ? (slot.title || full.displayTitle || full.title) : 'Waiting for a recent task'));
    card.append(head);
    if (full && slot.tileLabel) card.append(element('div', 'meta', 'Codex task: ' + full.title));
    if (full) card.append(element('div', 'meta', [full.model, full.reasoning, slot.state].filter(Boolean).join(' · ')));
    root.append(card);
  }
}
function renderAliases(status, catalog) {
  const root = document.querySelector('#alias-list');
  const search = document.querySelector('#task-search');
  const namedCount = catalog.threads.filter(thread => Boolean(thread.alias)).length;
  document.querySelector('#alias-summary').textContent = catalog.threads.length + ' tasks · ' + namedCount + ' named';
  const query = search.value.trim().toLowerCase();
  const slotByThread = new Map(status.slots.filter(slot => slot.threadId).map(slot => [slot.threadId, slot.slot]));
  root.replaceChildren();
  const matches = catalog.threads.filter(thread => {
    const searchable = [thread.title, thread.alias, thread.cwd].filter(Boolean).join(' ').toLowerCase();
    return !query || searchable.includes(query);
  });
  if (!matches.length) {
    root.append(element('p', 'help', 'No recent tasks match this search.'));
    return;
  }
  for (const thread of matches) {
    const slotNumber = slotByThread.get(thread.id);
    const card = element('article', 'alias-card' + (slotNumber ? ' on-deck' : ''));
    const head = element('div', 'head');
    if (slotNumber) head.append(element('span', 'number', String(slotNumber)));
    head.append(element('span', 'name alias-title', thread.title));
    card.append(head);
    const metadata = [thread.model, thread.reasoning, slotNumber ? 'on deck' : 'remembered off deck'].filter(Boolean).join(' · ');
    card.append(element('div', 'meta', metadata));
    const controls = element('div', 'alias-controls');
    const input = document.createElement('input');
    input.maxLength = 24;
    input.placeholder = 'Short Cardputer name (optional)';
    input.value = thread.alias || '';
    input.setAttribute('aria-label', 'Short name for ' + thread.title);
    const save = element('button', 'primary', 'Save name');
    save.type = 'button';
    save.onclick = () => saveAlias(thread.id, input.value);
    input.onkeydown = event => {
      if (event.key === 'Enter') { event.preventDefault(); save.click(); }
    };
    const reset = element('button', '', 'Use Codex name');
    reset.type = 'button';
    reset.disabled = !thread.alias;
    reset.onclick = () => saveAlias(thread.id, '');
    controls.append(input, save, reset);
    card.append(controls);
    root.append(card);
  }
}
function renderShortcuts() {
  const keyInput = document.querySelector('#shortcut-key');
  const selectedKey = keyInput.value;
  const assigned = new Map(shortcutCatalog.shortcuts.map(item => [item.key, item]));
  if (!shortcutCatalog.keyRows.flat().includes(selectedKey)) keyInput.value = shortcutCatalog.keyRows.flat()[0] || '';

  const keyboard = document.querySelector('#keyboard');
  keyboard.replaceChildren();
  for (const row of shortcutCatalog.keyRows) {
    const rowNode = element('div', 'key-row');
    for (const key of row) {
      const shortcut = assigned.get(key);
      const keycap = element('button', 'keycap' + (shortcut ? ' assigned' : ''), key.toUpperCase());
      keycap.type = 'button';
      keycap.title = shortcut ? key + ': ' + shortcut.label : key + ': available';
      keycap.onclick = () => editShortcut(key);
      rowNode.append(keycap);
    }
    keyboard.append(rowNode);
  }

  const list = document.querySelector('#shortcut-list');
  list.replaceChildren();
  if (!shortcutCatalog.shortcuts.length) {
    list.append(element('p', 'help', 'No prompt shortcuts yet. A good first one is D for DEPLOY.'));
    return;
  }
  for (const shortcut of shortcutCatalog.shortcuts) {
    const card = element('article', 'shortcut');
    const head = element('div', 'shortcut-head');
    head.append(element('span', 'key-name', shortcut.key.toUpperCase()), element('span', 'name', shortcut.label));
    card.append(head, element('div', 'meta', shortcut.delivery === 'draft' ? 'Leaves an editable draft' : shortcut.delivery + ' immediately'));
    card.append(element('p', 'shortcut-prompt', shortcut.prompt));
    const actions = element('div', 'shortcut-actions');
    const edit = element('button', '', 'Edit');
    edit.onclick = () => editShortcut(shortcut.key);
    const run = element('button', 'primary', 'Run now');
    run.onclick = () => shortcutAction('run', { key: shortcut.key });
    const remove = element('button', '', 'Remove');
    remove.onclick = () => shortcutAction('remove', { key: shortcut.key });
    actions.append(edit, run, remove);
    card.append(actions);
    list.append(card);
  }
}
async function render() {
  const [status, threads, shortcuts] = await Promise.all([
    request('/status'), request('/api/threads'), request('/api/shortcuts'),
  ]);
  shortcutCatalog = shortcuts;
  renderTiles(status, threads);
  renderAliases(status, threads);
  renderSound(status.sound);
  renderShortcuts();
}
document.querySelector('#sound-form').onsubmit = event => {
  event.preventDefault();
  saveSoundSettings();
};
document.querySelector('#test-speaker').onclick = async () => {
  setMessage('Testing Cardputer speaker…');
  try {
    await request('/api/sound/test', { method: 'POST', headers, body: '{}' });
    setMessage('Speaker test sent.');
  } catch (error) { setMessage(error.message, true); }
};
document.querySelector('#test-answer').onclick = async () => {
  setMessage('Preparing the latest answer summary…');
  try {
    await request('/api/sound/answer', { method: 'POST', headers, body: '{}' });
    setMessage('Latest answer summary sent to the Cardputer.');
  } catch (error) { setMessage(error.message, true); }
};
document.querySelector('#new-task').onclick = createTask;
document.querySelector('#task-search').oninput = () => render().catch(error => setMessage(error.message, true));
document.querySelector('#shortcut-form').onsubmit = event => {
  event.preventDefault();
  shortcutAction('save', {
    key: document.querySelector('#shortcut-key').value,
    label: document.querySelector('#shortcut-label').value,
    delivery: document.querySelector('input[name="shortcut-delivery"]:checked').value,
    prompt: document.querySelector('#shortcut-prompt').value,
  });
};
document.querySelector('#reset-shortcut').onclick = clearShortcutForm;
render().catch(error => setMessage(error.message, true));
</script>
</body>
</html>`;
}

module.exports = { tilesPage };
