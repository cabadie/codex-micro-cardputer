const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const test = require('node:test');

const { CodexStore } = require('../src/codex-store');

test('uses the current Codex sidebar name from the session index', (context) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'cardputer-session-index-'));
  context.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const indexPath = path.join(directory, 'session_index.jsonl');
  fs.writeFileSync(indexPath, [
    JSON.stringify({ id: 'thread-a', thread_name: 'Old name' }),
    JSON.stringify({ id: 'thread-a', thread_name: 'Plan cardputer micro keyboard' }),
    '',
  ].join('\n'));

  const store = new CodexStore('/unused.sqlite', indexPath);
  const [thread] = store.withDisplayTitles([{ id: 'thread-a', title: 'Original prompt' }]);
  assert.equal(thread.title, 'Plan cardputer micro keyboard');
});

test('falls back to the database title when no sidebar name exists', () => {
  const store = new CodexStore('/unused.sqlite', '/missing/session_index.jsonl');
  const [thread] = store.withDisplayTitles([{ id: 'thread-b', title: 'Original prompt' }]);
  assert.equal(thread.title, 'Original prompt');
});

test('excludes internal subagent and review tasks from tile candidates', (context) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'cardputer-store-'));
  context.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const databasePath = path.join(directory, 'state.sqlite');
  const database = new DatabaseSync(databasePath);
  database.exec(`
    CREATE TABLE threads (
      id TEXT PRIMARY KEY, title TEXT, cwd TEXT, rollout_path TEXT,
      model TEXT, reasoning_effort TEXT, updated_at_ms INTEGER, updated_at INTEGER,
      archived INTEGER, preview TEXT, thread_source TEXT
    );
    INSERT INTO threads VALUES
      ('root', 'Visible task', '/root', '/root.jsonl', 'gpt', 'high', 2, 2, 0, 'hello', 'appServer'),
      ('worker', 'Hidden review', '/root', '/worker.jsonl', 'review', 'low', 3, 3, 0, 'review', 'subagent');
  `);
  database.close();

  const store = new CodexStore(databasePath);
  assert.deepEqual(store.listRecent(10).map((thread) => thread.id), ['root']);
  assert.deepEqual(store.listByIds(['root', 'worker']).map((thread) => thread.id), ['root']);
  store.close();
});
