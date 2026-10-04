const assert = require('node:assert/strict');
const test = require('node:test');

const { decodeHidReport } = require('../src/hid-report');

test('decodes printable BLE keyboard reports and modifiers', () => {
  assert.deepEqual(decodeHidReport({ modifiers: 0x0a, keys: [0x04, 0, 0, 0, 0, 0] }), {
    key: 'a',
    modifiers: ['command', 'shift'],
    named: false,
  });
});

test('decodes named keys and ignores release reports', () => {
  assert.deepEqual(decodeHidReport({ modifiers: 0, keys: [0x28, 0, 0, 0, 0, 0] }), {
    key: 'enter',
    modifiers: [],
    named: true,
  });
  assert.equal(decodeHidReport({ modifiers: 0, keys: [0, 0, 0, 0, 0, 0] }), null);
});
