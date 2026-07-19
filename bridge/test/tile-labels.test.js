const assert = require('node:assert/strict');
const test = require('node:test');

const {
  migrateLegacyAliases,
  normalizeTaskAliases,
  normalizeTileLabel,
  normalizeTileLabels,
} = require('../src/tile-labels');

test('normalizes Cardputer-only tile names without allowing slot one', () => {
  assert.equal(normalizeTileLabel(' Deploy '), 'Deploy');
  assert.equal(normalizeTileLabel(''), null);
  assert.throws(() => normalizeTileLabel('x'.repeat(25)), /at most 24/);
  assert.deepEqual(normalizeTileLabels(['ACTIVE', ' One ', '', null, 'Four', 'Five']), [
    null, 'One', null, null, 'Four', 'Five',
  ]);
});

test('migrates fixed-slot labels into aliases attached to task IDs', () => {
  assert.deepEqual(
    migrateLegacyAliases(
      { a: 'Already named' },
      [null, 'a', 'b', 'c', null, null],
      [null, 'Old A', ' Short B ', null, null, null]
    ),
    { a: 'Already named', b: 'Short B' }
  );
  assert.deepEqual(normalizeTaskAliases({ a: ' A ', b: '', c: 'x'.repeat(30) }), {
    a: 'A', c: 'x'.repeat(24),
  });
});
