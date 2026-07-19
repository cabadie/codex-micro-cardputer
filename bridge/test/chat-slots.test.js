const assert = require('node:assert/strict');
const test = require('node:test');

const {
  buildCustomSlots,
  buildRecentSlots,
  buildRollingSlots,
  buildStableSlots,
  seedStableThreadIds,
} = require('../src/chat-slots');

const threads = [
  {
    id: 'a',
    title: 'First task',
    rolloutPath: '/a',
    model: 'gpt-5.6-sol',
    reasoning: 'high',
    updatedAt: 3,
  },
  { id: 'b', title: 'Second task', rolloutPath: '/b', updatedAt: 2 },
];

test('maps recent chats onto six slots in order', () => {
  const slots = buildRecentSlots(threads);
  assert.equal(slots.length, 6);
  assert.equal(slots[0].threadId, 'a');
  assert.equal(slots[0].model, 'gpt-5.6-sol');
  assert.equal(slots[0].reasoning, 'high');
  assert.equal(slots[1].threadId, 'b');
  assert.equal(slots[2].threadId, null);
});

test('reserves tile one and rolls the five most recent tasks through tiles two to six', () => {
  const slots = buildRollingSlots(threads);
  assert.equal(slots.length, 6);
  assert.equal(slots[0].title, 'ACTIVE WINDOW');
  assert.equal(slots[0].activeRoute, true);
  assert.equal(slots[1].threadId, 'a');
  assert.equal(slots[2].threadId, 'b');
  assert.equal(slots[3].threadId, null);
});

test('preserves custom slot positions and marks unavailable chats', () => {
  const slots = buildCustomSlots(['b', null, 'missing'], threads);
  assert.equal(slots[0].title, 'Second task');
  assert.equal(slots[1].threadId, null);
  assert.equal(slots[2].threadId, 'missing');
  assert.equal(slots[2].unavailable, true);
});

test('reserves slot one for the active window and keeps bookmark numbers stable', () => {
  const slots = buildStableSlots([null, 'b', 'a', null, null, null], threads);
  assert.equal(slots[0].title, 'ACTIVE WINDOW');
  assert.equal(slots[0].activeRoute, true);
  assert.equal(slots[1].threadId, 'b');
  assert.equal(slots[2].threadId, 'a');
});

test('seeds only empty bookmark slots without reordering existing assignments', () => {
  const ids = seedStableThreadIds(
    [null, 'b', null, null, null, null],
    [{ id: 'a' }, { id: 'b' }, { id: 'c' }]
  );
  assert.deepEqual(ids, [null, 'b', 'a', 'c', null, null]);
});
