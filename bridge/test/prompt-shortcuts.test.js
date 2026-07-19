const assert = require('node:assert/strict');
const test = require('node:test');

const {
  AVAILABLE_KEYS,
  normalizePromptShortcut,
  normalizePromptShortcuts,
  upsertPromptShortcut,
} = require('../src/prompt-shortcuts');

test('offers every unmodified printable key inside the isolated Custom layer', () => {
  assert.equal(AVAILABLE_KEYS.length, 47);
  assert.ok(AVAILABLE_KEYS.includes('d'));
  assert.ok(AVAILABLE_KEYS.includes('`'));
  assert.ok(AVAILABLE_KEYS.includes('\\'));
  assert.ok(!AVAILABLE_KEYS.includes(' '));
  assert.ok(AVAILABLE_KEYS.includes('m'));
  assert.ok(AVAILABLE_KEYS.includes('1'));
});

test('normalizes a named prompt shortcut and its delivery', () => {
  assert.deepEqual(normalizePromptShortcut({
    key: 'D', label: ' Deploy ', prompt: ' $deploy:ship this ', delivery: 'QUEUE',
  }), {
    key: 'd', label: 'Deploy', prompt: '$deploy:ship this', delivery: 'queue',
  });
});

test('upserts by physical key and rejects invalid entries', () => {
  const first = upsertPromptShortcut([], { key: 'd', label: 'Deploy', prompt: 'deploy', delivery: 'queue' });
  const second = upsertPromptShortcut(first, { key: 'd', label: 'Build', prompt: 'build', delivery: 'draft' });
  assert.deepEqual(second, [{ key: 'd', label: 'Build', prompt: 'build', delivery: 'draft' }]);
  assert.deepEqual(normalizePromptShortcuts([{ key: ' ', label: 'No', prompt: 'no' }]), []);
  assert.throws(() => normalizePromptShortcut({ key: 'd', label: '', prompt: 'x' }), /short name/);
});
