const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const { deepMerge, loadConfig, normalizeSoundSettings, normalizeThreadId, PROJECT_ROOT } = require('../src/config');

test('normalizes copied Codex task links', () => {
  assert.equal(normalizeThreadId('codex://threads/019abc?source=copy'), '019abc');
  assert.equal(normalizeThreadId('019def'), '019def');
  assert.equal(normalizeThreadId(null), null);
});

test('deep-merges nested bridge settings', () => {
  assert.deepEqual(
    deepMerge({ voice: { mode: 'offline', model: 'a' } }, { voice: { model: 'b' } }),
    { voice: { mode: 'offline', model: 'b' } }
  );
});

test('normalizes speaker feedback settings', () => {
  assert.deepEqual(normalizeSoundSettings({
    mode: 'tones', speechOutput: 'both', volume: 140, voice: ' Ava ', speechRate: 90, answerMaxWords: 100,
  }), {
    mode: 'tones', speechOutput: 'both', volume: 100, voice: 'Ava', speechRate: 150, answerMaxWords: 40,
  });
  assert.equal(normalizeSoundSettings({ mode: 'unknown' }).mode, 'hybrid');
  assert.equal(normalizeSoundSettings({ speechOutput: 'unknown' }).speechOutput, 'mac');
});

test('treats null account and checkout paths as detected defaults', (context) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'cardputer-config-'));
  context.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const configPath = path.join(directory, 'config.json');
  fs.writeFileSync(configPath, JSON.stringify({
    codexStateDb: null,
    codexSessionIndex: null,
    statePath: null,
    axHelper: null,
    visibleTaskHelper: null,
    voice: { whisperModel: null },
  }));

  const config = loadConfig(configPath);
  assert.equal(config.agentSource, 'rolling');
  assert.equal(config.codexStateDb, path.join(os.homedir(), '.codex', 'state_5.sqlite'));
  assert.equal(config.codexSessionIndex, path.join(os.homedir(), '.codex', 'session_index.jsonl'));
  assert.equal(config.statePath, path.join(os.homedir(), '.codex-cardputer', 'state.json'));
  assert.equal(config.axHelper, path.join(PROJECT_ROOT, 'bin', 'codex-ax'));
  assert.equal(config.visibleTaskHelper, path.join(PROJECT_ROOT, 'bin', 'codex-visible-task'));
  assert.equal(
    config.voice.whisperModel,
    path.join(PROJECT_ROOT, 'tools', 'models', 'ggml-small.bin')
  );
});

test('migrates the legacy stable source to rolling recent tasks', (context) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'cardputer-stable-config-'));
  context.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const configPath = path.join(directory, 'config.json');
  fs.writeFileSync(configPath, JSON.stringify({ agentSource: 'stable' }));
  assert.equal(loadConfig(configPath).agentSource, 'rolling');
});
