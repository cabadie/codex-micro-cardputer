const assert = require('node:assert/strict');
const test = require('node:test');

const { ActionDispatcher } = require('../src/actions');

function fakeMac() {
  const calls = [];
  return {
    calls,
    activateCodex: async () => calls.push(['activate']),
    pressShortcut: async (...args) => calls.push(['shortcut', ...args]),
    pressKey: async (...args) => calls.push(['key', ...args]),
    typeText: async (...args) => calls.push(['type', ...args]),
    typeCommand: async (...args) => calls.push(['command', ...args]),
    commandMenu: async (...args) => calls.push(['menu', ...args]),
    safeDecision: async (...args) => {
      calls.push(['decision', ...args]);
      return { ok: true };
    },
  };
}

const config = { actionShortcuts: { 'chat.continue': null }, axHelper: '/helper' };

test('uses documented desktop shortcuts', async () => {
  const mac = fakeMac();
  const dispatcher = new ActionDispatcher(config, mac);
  await dispatcher.dispatch('sidebar.toggle');
  assert.deepEqual(mac.calls.at(-1), ['shortcut', 'b', ['command']]);
});

test('routes approvals through the guarded helper', async () => {
  const mac = fakeMac();
  const dispatcher = new ActionDispatcher(config, mac);
  await dispatcher.dispatch('request.approve');
  assert.deepEqual(mac.calls, [['decision', '/helper', 'approve']]);
});

test('uses the Codex command for Fast mode', async () => {
  const mac = fakeMac();
  const dispatcher = new ActionDispatcher(config, mac);
  await dispatcher.dispatch('fast.toggle');
  assert.deepEqual(mac.calls, [
    ['activate'],
    ['shortcut', 'u', ['control']],
    ['type', '/fast'],
    ['key', 'enter', []],
  ]);
});

test('opens the model picker through the exact desktop command', async () => {
  const mac = fakeMac();
  const dispatcher = new ActionDispatcher(config, mac);
  await dispatcher.dispatch('model.open');
  assert.deepEqual(mac.calls, [
    ['activate'],
    ['shortcut', 'k', ['command']],
    ['type', 'Open model picker'],
    ['key', 'enter', []],
  ]);
});

test('uses distinct reasoning decrease and increase commands', async () => {
  const mac = fakeMac();
  const dispatcher = new ActionDispatcher(config, mac);
  await dispatcher.dispatch('reasoning.decrease');
  await dispatcher.dispatch('reasoning.increase');
  assert.deepEqual(
    mac.calls.filter(([kind]) => kind === 'type'),
    [['type', 'Decrease reasoning effort'], ['type', 'Increase reasoning effort']]
  );
});

test('routes shortcuts through Cardputer HID when the device is connected', async () => {
  const mac = fakeMac();
  const sent = [];
  const device = { connected: true, send: (message) => { sent.push(message); return true; } };
  const dispatcher = new ActionDispatcher(config, mac, device);
  await dispatcher.dispatch('sidebar.toggle');
  assert.deepEqual(sent, [{ t: 'shortcut', key: 'b', modifiers: ['command'] }]);
  assert.deepEqual(mac.calls, [['activate']]);
});
