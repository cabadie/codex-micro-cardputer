#!/usr/bin/env node
const http = require('node:http');

const { ActionDispatcher } = require('./actions');
const { latestCompletedAnswer, summarizeForSpeech } = require('./answer-summary');
const { loadSlots } = require('./chat-slots');
const { loadConfig, loadDeckState, normalizeSoundSettings, saveDeckState } = require('./config');
const { CodexEventTracker } = require('./codex-events');
const { CodexStore } = require('./codex-store');
const { CardputerDevice } = require('./device');
const { SpeakerFeedback } = require('./feedback');
const macos = require('./macos');
const {
  AVAILABLE_KEY_ROWS,
  normalizeKey,
  upsertPromptShortcut,
} = require('./prompt-shortcuts');
const { normalizeTileLabel } = require('./tile-labels');
const { MacSpeechSynthesizer } = require('./speech');
const { tilesPage } = require('./tiles-ui');
const { VoiceSession } = require('./voice');
const { pinVoiceTarget } = require('./voice-target');

const config = loadConfig(process.env.CARDPUTER_CONFIG);
const deckState = loadDeckState(config);
const store = new CodexStore(config.codexStateDb, config.codexSessionIndex);
const tracker = new CodexEventTracker();
const voice = new VoiceSession(config.voice);

function log(message, ...args) {
  console.log(`${new Date().toISOString()} ${message}`, ...args);
}

const device = new CardputerDevice(config, log);
const actions = new ActionDispatcher(config, macos, device);
const synthesizer = new MacSpeechSynthesizer(deckState.sound, log);
const feedback = new SpeakerFeedback(device, synthesizer, () => deckState.sound, log);
const ACTIVE_ROUTE = '__active_window__';
let slots = [];
let selectedThreadId = deckState.selectedThreadId || ACTIVE_ROUTE;
let lastPayload = '';
let voiceDelivery = 'queue';
let voiceTargetThreadId = null;
let voiceTargetTitle = '';
let voiceTargetPromise = null;
let activeThreadHint = null;
let pendingModelChange = null;
const observedStates = new Map();
const unread = new Set();

function initializeRollingDeck() {
  if (config.agentSource !== 'rolling' || deckState.rollingDeckInitialized) return;
  deckState.rollingDeckInitialized = true;
  persistState();
  log(`initialized rolling Cardputer deck with ${Object.keys(deckState.taskAliases).length} remembered aliases`);
}

function persistState() {
  deckState.selectedThreadId = selectedThreadId;
  saveDeckState(config, deckState);
}

function syncPromptShortcuts() {
  device.send({
    t: 'prompt.shortcuts',
    shortcuts: deckState.promptShortcuts.map(({ key, label }) => ({ key, label })),
  });
}

function updateSoundSettings(value) {
  deckState.sound = normalizeSoundSettings(value, deckState.sound || config.sound);
  persistState();
  feedback.syncSettings();
  return deckState.sound;
}

function savePromptShortcut(value) {
  deckState.promptShortcuts = upsertPromptShortcut(deckState.promptShortcuts, value);
  persistState();
  syncPromptShortcuts();
  return deckState.promptShortcuts.find((item) => item.key === String(value.key).toLowerCase());
}

function removePromptShortcut(keyValue) {
  const key = normalizeKey(keyValue);
  const previousLength = deckState.promptShortcuts.length;
  deckState.promptShortcuts = deckState.promptShortcuts.filter((item) => item.key !== key);
  if (deckState.promptShortcuts.length === previousLength) throw new Error(`No shortcut is assigned to ${key}`);
  persistState();
  syncPromptShortcuts();
  return key;
}

async function runPromptShortcut(keyValue) {
  const key = normalizeKey(keyValue);
  const shortcut = deckState.promptShortcuts.find((item) => item.key === key);
  if (!shortcut) throw new Error(`No prompt is assigned to ${key}`);

  await macos.activateCodex();
  await new Promise((resolve) => setTimeout(resolve, 180));
  await actions.pressShortcut('u', ['control']);
  await new Promise((resolve) => setTimeout(resolve, 120));
  await actions.typeText(shortcut.prompt);
  if (shortcut.delivery === 'queue') await actions.pressKey('enter');
  else if (shortcut.delivery === 'steer') await actions.pressKey('enter', ['command']);
  if (shortcut.delivery === 'steer') {
    await feedback.speak('Steered', { toast: `${shortcut.label}: steered`, cue: 'steer' });
  } else if (shortcut.delivery === 'draft') {
    await feedback.speak('Draft ready', { toast: `${shortcut.label}: draft ready` });
  } else {
    await feedback.speak('Sent', { toast: `${shortcut.label}: sent` });
  }
  return shortcut;
}

function displayState(slot, rawState) {
  if (slot.activeRoute) return 'idle';
  if (!slot.threadId) return 'unassigned';
  if (slot.unavailable) return 'error';
  if (rawState === 'complete') return unread.has(slot.threadId) ? 'complete' : 'idle';
  return rawState;
}

function updateUnread(threadId, rawState) {
  if (!threadId) return;
  if (!observedStates.has(threadId)) {
    observedStates.set(threadId, rawState);
    return;
  }
  const previous = observedStates.get(threadId);
  if (rawState === 'complete' && previous !== 'complete') unread.add(threadId);
  if (rawState === 'thinking') unread.delete(threadId);
  observedStates.set(threadId, rawState);
}

function refreshSlots(force = false) {
  try {
    initializeRollingDeck();
    const next = loadSlots(store, config, deckState).map((slot) => {
      const rawState = slot.threadId ? tracker.statusFor(slot.rolloutPath) : 'unassigned';
      updateUnread(slot.threadId, rawState);
      const sourceTitle = slot.title;
      const tileLabel = slot.threadId ? deckState.taskAliases[slot.threadId] || null : null;
      return {
        ...slot,
        sourceTitle,
        tileLabel,
        title: tileLabel || sourceTitle,
        state: displayState(slot, rawState),
        selected: Boolean(
          (slot.activeRoute && selectedThreadId === ACTIVE_ROUTE) ||
          (slot.threadId && slot.threadId === selectedThreadId)
        ),
      };
    });
    const selectedIsVisible = selectedThreadId === ACTIVE_ROUTE || next.some((slot) => slot.threadId === selectedThreadId);
    if (!selectedIsVisible) {
      selectedThreadId = ACTIVE_ROUTE;
      persistState();
      next[0].selected = true;
    }
    slots = next;
    if (pendingModelChange && Date.now() <= pendingModelChange.deadline) {
      const changed = next.find((slot) => slot.threadId === pendingModelChange.threadId);
      if (changed && changed.model && changed.model !== pendingModelChange.before) {
        const model = changed.model.replace(/[._-]+/g, ' ');
        pendingModelChange = null;
        feedback.speak(`Model ${model}`, { toast: `model: ${changed.model}` });
      }
    } else if (pendingModelChange) {
      pendingModelChange = null;
    }
    const payload = JSON.stringify(next.map(({ slot, threadId, title, model, reasoning, state, selected }) => ({
      slot, threadId, title, model, reasoning, state, selected,
    })));
    if (force || payload !== lastPayload) {
      lastPayload = payload;
      for (const slot of next) {
        device.send({
          t: 'chat',
          slot: slot.slot,
          title: slot.title,
          model: slot.model,
          reasoning: slot.reasoning,
          state: slot.state,
          selected: slot.selected,
        });
      }
    }
  } catch (error) {
    log(`slot refresh failed: ${error.message}`);
    device.send({ t: 'connection', codex: false, reason: error.message });
  }
}

async function beginNewChat(slotNumber) {
  if (slotNumber === 1) return macos.activateCodex();
  await actions.dispatch('chat.new');
  selectedThreadId = ACTIVE_ROUTE;
  activeThreadHint = null;
  persistState();
  device.send({ t: 'toast', msg: 'new task: start typing' });
  refreshSlots(true);
}

async function openSlot(message) {
  const slot = slots.find((entry) => entry.slot === Number(message.slot));
  if (Number(message.slot) === 1 || (slot && slot.activeRoute)) {
    activeThreadHint = null;
    selectedThreadId = ACTIVE_ROUTE;
    persistState();
    await macos.activateCodex();
    device.send({ t: 'toast', msg: 'active Codex window' });
    refreshSlots(true);
    return;
  }
  if (!slot || !slot.threadId) {
    await beginNewChat(Number(message.slot));
    return;
  }
  unread.delete(slot.threadId);
  selectedThreadId = slot.threadId;
  activeThreadHint = slot.threadId;
  persistState();
  await macos.openThread(slot.threadId, message.gesture === 'double');
  refreshSlots(true);
}

function actionTargetThread() {
  if (activeThreadHint) return store.listByIds([activeThreadHint])[0] || null;
  return store.listRecent(1)[0] || null;
}

async function waitForReasoningChange(threadId, before, timeoutMs = 2600) {
  if (!threadId) return '';
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 180));
    const thread = store.listByIds([threadId])[0];
    if (thread && thread.reasoning && thread.reasoning !== before) return thread.reasoning;
  }
  return '';
}

function spokenReasoning(value) {
  const normalized = String(value || '').toLowerCase();
  if (['xhigh', 'extra_high', 'extra-high'].includes(normalized)) return 'extra high';
  return normalized.replace(/[_-]+/g, ' ') || 'changed';
}

async function changeReasoning(actionId) {
  const target = actionTargetThread();
  const before = target ? target.reasoning : '';
  await actions.dispatch(actionId);
  const changed = target ? await waitForReasoningChange(target.id, before) : '';
  if (changed) {
    await feedback.speak(`Reasoning ${spokenReasoning(changed)}`, { toast: `reasoning: ${changed}` });
  } else {
    feedback.tone('confirm', 'reasoning command sent');
  }
}

async function readLatestAnswer(slotNumber) {
  let target = slots.find((slot) => slot.slot === Number(slotNumber));
  if (!target || !target.rolloutPath) {
    target = store.listRecent(1)[0] || null;
  }
  if (!target || !target.rolloutPath) throw new Error('No Codex answer is available');
  const answer = latestCompletedAnswer(target.rolloutPath);
  const summary = summarizeForSpeech(answer, deckState.sound.answerMaxWords);
  if (!summary) throw new Error('This task has no completed answer yet');
  await feedback.speak(summary, {
    toast: `answer: ${(target.title || 'latest task').slice(0, 30)}`,
    cue: 'ready',
    cache: false,
  });
}

async function announceAction(actionId) {
  if (actionId === 'composer.send') return feedback.speak('Sent', { toast: 'sent' });
  if (actionId === 'request.approve') return feedback.speak('Approved', { toast: 'approved' });
  if (actionId === 'request.decline') return feedback.speak('Declined', { toast: 'declined' });
  if (actionId === 'chat.new' || actionId === 'chat.continue') {
    return feedback.speak('New task', { toast: 'new task' });
  }
  if (actionId === 'model.open') {
    const target = actionTargetThread();
    if (target) pendingModelChange = { threadId: target.id, before: target.model, deadline: Date.now() + 15000 };
    feedback.tone('control', 'model picker');
    return false;
  }
  feedback.tone('control', actionId.replaceAll('.', ' '));
  return false;
}

function setTaskAlias(threadId, value) {
  const [thread] = store.listByIds([String(threadId || '')]);
  if (!thread) throw new Error('Choose a visible Codex task');
  const label = normalizeTileLabel(value);
  if (label) deckState.taskAliases[thread.id] = label;
  else delete deckState.taskAliases[thread.id];
  persistState();
  const visible = slots.find((slot) => slot.threadId === thread.id);
  if (visible) device.send({ t: 'toast', msg: label ? `${visible.slot}: ${label}` : `${visible.slot}: Codex name` });
  refreshSlots(true);
  return { label, thread };
}

function readJsonBody(request, limit = 8192) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let length = 0;
    request.on('data', (chunk) => {
      length += chunk.length;
      if (length > limit) {
        reject(new Error('Request body is too large'));
        request.destroy();
        return;
      }
      chunks.push(chunk);
    });
    request.on('end', () => {
      try {
        resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {});
      } catch {
        reject(new Error('Request body must be JSON'));
      }
    });
    request.on('error', reject);
  });
}

function writeJson(response, status, value) {
  response.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
  response.end(JSON.stringify(value));
}

function requireTileUiRequest(request) {
  if (request.headers['x-cardputer-ui'] !== '1') {
    const error = new Error('Changes are only accepted from the local Cardputer Console');
    error.statusCode = 403;
    throw error;
  }
}

async function sendTranscript(delivery = voiceDelivery, targetThreadId = voiceTargetThreadId) {
  const transcript = voice.peekTranscript();
  if (!transcript) throw new Error('No transcript is ready');
  if (!targetThreadId) {
    throw new Error('Voice destination was not pinned; transcript was not sent');
  }
  await macos.openThread(targetThreadId, true);
  await new Promise((resolve) => setTimeout(resolve, 350));
  if (!device.send({ t: 'shortcut', key: 'u', modifiers: ['control'] })) {
    throw new Error('Cardputer disconnected before composer focus');
  }
  await new Promise((resolve) => setTimeout(resolve, 140));
  await macos.withClipboardText(transcript, async () => {
    if (!device.send({ t: 'shortcut', key: 'v', modifiers: ['command'] })) {
      throw new Error('Cardputer disconnected before transcript paste');
    }
    // Codex applies clipboard paste asynchronously. If Enter follows in the
    // same serial burst it can reach an empty composer, leaving the pasted
    // transcript behind instead of submitting it.
    await new Promise((resolve) => setTimeout(resolve, 400));
    if (!device.send({ t: 'type', text: '', submit: delivery })) {
      throw new Error('Cardputer disconnected before transcript submit');
    }
    log(`voice submit sent: ${delivery} -> ${targetThreadId}`);
    await new Promise((resolve) => setTimeout(resolve, 220));
  });
  voice.takeTranscript();
  device.send({ t: 'voice.state', state: 'idle' });
  voiceTargetThreadId = null;
  voiceTargetTitle = '';
  voiceTargetPromise = null;
  if (delivery === 'steer') await feedback.speak('Steered', { toast: 'voice steered', cue: 'steer' });
  else await feedback.speak('Sent', { toast: 'voice sent' });
}

async function handleMessage(message) {
  if (!message || typeof message !== 'object') return;

  if (message.t === 'hello') {
    device.send({
      t: 'hello',
      protocol: 1,
      bridge: '0.6.0',
      capabilities: [
        'chats',
        'actions',
        'model-metadata',
        'rolling-recent',
        'task-aliases',
        'active-window',
        'voice.offline',
        'voice.release-submit',
        'safe-approvals',
        'prompt-shortcuts',
        'sound.settings',
        'speech.playback',
        'answer.summary',
      ],
    });
    feedback.syncSettings();
    syncPromptShortcuts();
    refreshSlots(true);
    return;
  }
  if (message.t === 'audio.start') {
    voice.start(Number(message.rate || 16000));
    voiceDelivery = message.delivery === 'steer' ? 'steer' : 'queue';
    voiceTargetThreadId = null;
    voiceTargetTitle = '';
    voiceTargetPromise = macos.visibleTaskLines(config.visibleTaskHelper).then((lines) => {
      const target = pinVoiceTarget(store, lines);
      if (!target) throw new Error('The visible Codex task title was ambiguous; transcript was not sent');
      voiceTargetThreadId = target.id;
      voiceTargetTitle = target.title;
      log(`voice destination pinned: ${voiceTargetThreadId} (${voiceTargetTitle})`);
      return target;
    });
    voiceTargetPromise.catch((error) => log(`voice destination detection failed: ${error.message}`));
    device.send({ t: 'voice.state', state: 'listening' });
    return;
  }
  if (message.t === 'audio') {
    voice.append(message.data || message.d || '');
    return;
  }
  if (message.t === 'audio.end') {
    device.send({ t: 'voice.state', state: 'processing' });
    try {
      const transcript = await voice.finish();
      if (!transcript) throw new Error('No speech was recognized');
      if (voiceTargetPromise) await voiceTargetPromise;
      await sendTranscript(voiceDelivery, voiceTargetThreadId);
    } catch (error) {
      log(`voice delivery failed for ${voiceTargetThreadId || '(unpinned)'}: ${error.message}`);
      if (!voice.peekTranscript()) voice.discard();
      device.send({ t: 'voice.state', state: 'error', msg: error.message });
      device.send({ t: 'cue', id: 'error' });
    }
    return;
  }
  if (message.t !== 'action') return;

  try {
    if (message.id === 'chat.open') await openSlot(message);
    else if (message.id === 'chat.assign-recent' || message.id === 'chat.clear') {
      device.send({ t: 'toast', msg: 'tiles follow recent tasks' });
      refreshSlots(true);
    }
    else if (message.id === 'voice.send') await sendTranscript();
    else if (message.id === 'voice.discard') {
      voice.discard();
      voiceTargetThreadId = null;
      voiceTargetTitle = '';
      voiceTargetPromise = null;
      device.send({ t: 'voice.state', state: 'idle' });
    } else if (message.id === 'prompt.run') {
      await runPromptShortcut(message.key);
    } else if (message.id === 'answer.read') {
      await readLatestAnswer(Number(message.slot || 1));
    } else if (message.id === 'reasoning.decrease' || message.id === 'reasoning.increase') {
      await changeReasoning(message.id);
    } else {
      await actions.dispatch(message.id);
      await announceAction(message.id);
    }
  } catch (error) {
    log(`action ${message.id} failed: ${error.message}`);
    await feedback.failure(error.message.slice(0, 40));
  }
}

device.on('message', (message) => handleMessage(message));
device.on('connected', () => {
  feedback.syncSettings();
  device.send({ t: 'connection', bridge: true, codex: true });
  device.send({ t: 'cue', id: 'connected' });
  refreshSlots(true);
  syncPromptShortcuts();
});
device.on('disconnected', () => log('device disconnected'));
device.on('warning', (message) => log(`device warning: ${message}`));
device.on('error', (error) => log(`device error: ${error.message}`));
device.start();

const refreshTimer = setInterval(() => refreshSlots(), 750);
const pingTimer = setInterval(() => device.send({ t: 'ping' }), 3000);
refreshSlots();

const server = http.createServer(async (request, response) => {
  const pathname = new URL(request.url, `http://127.0.0.1:${config.httpPort}`).pathname;
  try {
    if (request.method === 'GET' && ['/status', '/health'].includes(pathname)) {
      writeJson(response, 200, {
        ok: true,
        device: device.connected,
        agentSource: config.agentSource,
        selectedThreadId,
        taskAliasCount: Object.keys(deckState.taskAliases).length,
        promptShortcutCount: deckState.promptShortcuts.length,
        sound: deckState.sound,
        slots: slots.map(({ slot, threadId, title, sourceTitle, tileLabel, model, reasoning, state, selected }) => ({
          slot, threadId, title, sourceTitle, tileLabel, model, reasoning, state, selected,
        })),
      });
      return;
    }
    if (request.method === 'GET' && ['/', '/tiles'].includes(pathname)) {
      response.writeHead(200, {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-store',
        'Content-Security-Policy': "default-src 'self'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'",
        'X-Content-Type-Options': 'nosniff',
      });
      response.end(tilesPage());
      return;
    }
    if (request.method === 'GET' && pathname === '/api/threads') {
      writeJson(response, 200, {
        threads: store.listRecent(50).map(({ id, title, cwd, model, reasoning, updatedAt }) => ({
          id,
          title,
          displayTitle: deckState.taskAliases[id] || title,
          alias: deckState.taskAliases[id] || null,
          cwd,
          model,
          reasoning,
          updatedAt,
        })),
      });
      return;
    }
    if (request.method === 'GET' && pathname === '/api/shortcuts') {
      writeJson(response, 200, {
        keyRows: AVAILABLE_KEY_ROWS,
        shortcuts: deckState.promptShortcuts,
      });
      return;
    }
    if (request.method === 'GET' && pathname === '/api/sound') {
      writeJson(response, 200, { sound: deckState.sound });
      return;
    }
    if (request.method === 'POST' && pathname === '/api/sound') {
      requireTileUiRequest(request);
      const sound = updateSoundSettings(await readJsonBody(request));
      writeJson(response, 200, { ok: true, sound });
      return;
    }
    if (request.method === 'POST' && pathname === '/api/sound/test') {
      requireTileUiRequest(request);
      await feedback.speak('Speaker ready', { toast: 'speaker test' });
      writeJson(response, 200, { ok: true });
      return;
    }
    if (request.method === 'POST' && pathname === '/api/sound/answer') {
      requireTileUiRequest(request);
      await readLatestAnswer(1);
      writeJson(response, 200, { ok: true });
      return;
    }

    const shortcutMatch = pathname.match(/^\/api\/shortcuts\/(save|remove|run)$/);
    if (request.method === 'POST' && shortcutMatch) {
      requireTileUiRequest(request);
      const body = await readJsonBody(request, 16384);
      const action = shortcutMatch[1];
      if (action === 'save') {
        const shortcut = savePromptShortcut(body);
        writeJson(response, 200, { ok: true, shortcut });
      } else if (action === 'remove') {
        const key = removePromptShortcut(body.key);
        writeJson(response, 200, { ok: true, key });
      } else {
        const shortcut = await runPromptShortcut(body.key);
        writeJson(response, 200, { ok: true, key: shortcut.key, label: shortcut.label });
      }
      return;
    }

    if (request.method === 'POST' && pathname === '/api/tasks/new') {
      requireTileUiRequest(request);
      await beginNewChat(2);
      writeJson(response, 202, { ok: true });
      return;
    }

    const aliasMatch = pathname.match(/^\/api\/aliases\/([^/]+)$/);
    if (request.method === 'POST' && aliasMatch) {
      requireTileUiRequest(request);
      const body = await readJsonBody(request);
      const result = setTaskAlias(decodeURIComponent(aliasMatch[1]), body.label);
      writeJson(response, 200, {
        ok: true,
        threadId: result.thread.id,
        title: result.thread.title,
        alias: result.label,
      });
      return;
    }
    writeJson(response, 404, { error: 'Not found' });
  } catch (error) {
    log(`tile UI request failed: ${error.message}`);
    writeJson(response, error.statusCode || 400, { error: error.message });
  }
});

server.listen(config.httpPort, '127.0.0.1', () => {
  log(`bridge listening on http://127.0.0.1:${config.httpPort}`);
});

function shutdown() {
  clearInterval(refreshTimer);
  clearInterval(pingTimer);
  device.stop();
  store.close();
  server.close(() => process.exit(0));
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
