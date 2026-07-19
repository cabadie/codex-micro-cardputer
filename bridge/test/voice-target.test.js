const assert = require('node:assert/strict');
const test = require('node:test');

const { pinVoiceTarget } = require('../src/voice-target');

test('pins the task title recognized in the visible Codex header', () => {
  const threads = [
    { id: 'task-b', title: 'Different task' },
    { id: 'task-a', title: 'Plan cardputer micro keyboard' },
  ];
  const store = { listRecent: () => threads };

  const target = pinVoiceTarget(store, ['< →', '• Plan cardputer micro keyboard ...', 'Codex']);
  threads.unshift({ id: 'task-c', title: 'Another newer task' });

  assert.deepEqual(target, { id: 'task-a', title: 'Plan cardputer micro keyboard' });
  assert.equal(Object.isFrozen(target), true);
});

test('fails closed when duplicate visible titles cannot identify one task', () => {
  const store = { listRecent: () => [
    { id: 'task-a', title: 'Duplicate title' },
    { id: 'task-b', title: 'Duplicate title' },
  ] };
  assert.equal(pinVoiceTarget(store, ['Duplicate title']), null);
});
