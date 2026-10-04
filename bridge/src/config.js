const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { normalizePromptShortcuts } = require('./prompt-shortcuts');
const { migrateLegacyAliases, normalizeTileLabels } = require('./tile-labels');

const PROJECT_ROOT = path.resolve(__dirname, '..');

const SOUND_DEFAULTS = {
  mode: 'hybrid',
  speechOutput: 'mac',
  volume: 45,
  voice: 'Samantha',
  speechRate: 280,
  answerMaxWords: 14,
};

function deepMerge(base, extra) {
  const result = { ...base };
  for (const [key, value] of Object.entries(extra || {})) {
    if (
      value && typeof value === 'object' && !Array.isArray(value) &&
      base[key] && typeof base[key] === 'object' && !Array.isArray(base[key])
    ) {
      result[key] = deepMerge(base[key], value);
    } else {
      result[key] = value;
    }
  }
  return result;
}

function normalizeThreadId(value) {
  if (!value) return null;
  const text = String(value).trim();
  const match = text.match(/^codex:\/\/threads\/([^/?#]+)/i);
  return match ? match[1] : text;
}

function normalizeSoundSettings(value = {}, fallback = SOUND_DEFAULTS) {
  const merged = { ...SOUND_DEFAULTS, ...(fallback || {}), ...(value || {}) };
  const mode = ['hybrid', 'tones', 'mute'].includes(merged.mode) ? merged.mode : SOUND_DEFAULTS.mode;
  const speechOutput = ['mac', 'cardputer', 'both'].includes(merged.speechOutput)
    ? merged.speechOutput : SOUND_DEFAULTS.speechOutput;
  const volume = Math.max(0, Math.min(100, Math.round(Number(merged.volume) || 0)));
  const voice = String(merged.voice || SOUND_DEFAULTS.voice).trim().slice(0, 48) || SOUND_DEFAULTS.voice;
  const speechRate = Math.max(150, Math.min(360, Math.round(Number(merged.speechRate) || SOUND_DEFAULTS.speechRate)));
  const answerMaxWords = Math.max(8, Math.min(40, Math.round(Number(merged.answerMaxWords) || SOUND_DEFAULTS.answerMaxWords)));
  return { mode, speechOutput, volume, voice, speechRate, answerMaxWords };
}

function loadJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') return {};
    throw new Error(`Could not read ${file}: ${error.message}`);
  }
}

function loadConfig(configPath = path.join(PROJECT_ROOT, 'config.json')) {
  const userHome = os.homedir();
  const defaults = {
    serialPath: null,
    httpPort: 8378,
    agentSource: 'rolling',
    customThreads: [null, null, null, null, null, null],
    codexStateDb: path.join(userHome, '.codex', 'state_5.sqlite'),
    codexSessionIndex: path.join(userHome, '.codex', 'session_index.jsonl'),
    statePath: path.join(userHome, '.codex-cardputer', 'state.json'),
    voice: {
      mode: 'offline',
      whisperCommand: null,
      whisperModel: path.join(PROJECT_ROOT, 'tools', 'models', 'ggml-small.bin'),
    },
    bluetooth: {
      enabled: true,
      helper: path.join(PROJECT_ROOT, 'bin', 'codex-ble'),
    },
    sound: SOUND_DEFAULTS,
    actionShortcuts: {
      'chat.continue': null,
    },
    axHelper: path.join(PROJECT_ROOT, 'bin', 'codex-ax'),
    visibleTaskHelper: path.join(PROJECT_ROOT, 'bin', 'codex-visible-task'),
  };

  const loaded = deepMerge(defaults, loadJson(configPath));
  // Keep the example config copy-safe: null means "use the detected default"
  // for paths whose value depends on the current checkout or macOS account.
  for (const key of ['codexStateDb', 'codexSessionIndex', 'statePath', 'axHelper', 'visibleTaskHelper']) {
    if (!loaded[key]) loaded[key] = defaults[key];
  }
  if (!loaded.voice.whisperModel) loaded.voice.whisperModel = defaults.voice.whisperModel;
  if (!loaded.bluetooth || typeof loaded.bluetooth !== 'object') loaded.bluetooth = { ...defaults.bluetooth };
  if (!loaded.bluetooth.helper) loaded.bluetooth.helper = defaults.bluetooth.helper;
  loaded.sound = normalizeSoundSettings(loaded.sound, defaults.sound);
  if (loaded.agentSource === 'stable') loaded.agentSource = 'rolling';
  if (!['rolling', 'recent', 'custom'].includes(loaded.agentSource)) {
    throw new Error(`agentSource must be "rolling", "recent", or "custom", got ${loaded.agentSource}`);
  }
  loaded.customThreads = [...loaded.customThreads, null, null, null, null, null, null]
    .slice(0, 6)
    .map(normalizeThreadId);
  return loaded;
}

function loadDeckState(config) {
  const state = loadJson(config.statePath);
  const customThreads = [...(state.customThreads || config.customThreads), null, null, null, null, null, null]
    .slice(0, 6)
    .map(normalizeThreadId);
  const tileLabels = normalizeTileLabels(state.tileLabels);
  return {
    customThreads,
    selectedThreadId: state.selectedThreadId || null,
    stableSlotsInitialized: Boolean(state.stableSlotsInitialized),
    rollingDeckInitialized: Boolean(state.rollingDeckInitialized),
    promptShortcuts: normalizePromptShortcuts(state.promptShortcuts),
    tileLabels,
    taskAliases: migrateLegacyAliases(state.taskAliases, customThreads, tileLabels),
    sound: normalizeSoundSettings(state.sound, config.sound),
  };
}

function saveDeckState(config, state) {
  fs.mkdirSync(path.dirname(config.statePath), { recursive: true });
  const temporary = `${config.statePath}.tmp`;
  fs.writeFileSync(temporary, `${JSON.stringify(state, null, 2)}\n`, { mode: 0o600 });
  fs.renameSync(temporary, config.statePath);
}

module.exports = {
  PROJECT_ROOT,
  SOUND_DEFAULTS,
  deepMerge,
  loadConfig,
  loadDeckState,
  normalizeSoundSettings,
  normalizeThreadId,
  saveDeckState,
};
