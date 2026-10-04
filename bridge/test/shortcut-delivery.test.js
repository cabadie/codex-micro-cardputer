const assert = require('node:assert/strict');
const test = require('node:test');

const { pastePromptShortcut } = require('../src/shortcut-delivery');

function harness() {
  const events = [];
  const actions = {
    pressShortcut: async (key, modifiers) => events.push(['shortcut', key, modifiers]),
    pressKey: async (key, modifiers = []) => events.push(['key', key, modifiers]),
  };
  const macos = {
    withClipboardText: async (value, callback) => {
      events.push(['clipboard', value]);
      await callback();
    },
  };
  const wait = async (ms) => events.push(['wait', ms]);
  return { actions, events, macos, wait };
}

test('pastes a multiline queue shortcut and submits exactly once', async () => {
  const { actions, events, macos, wait } = harness();
  await pastePromptShortcut({ prompt: 'Open PR\nRun checks\nReport', delivery: 'queue' }, actions, macos, wait);
  assert.deepEqual(events, [
    ['clipboard', 'Open PR\nRun checks\nReport'],
    ['shortcut', 'v', ['command']],
    ['wait', 400],
    ['key', 'enter', []],
  ]);
});

test('uses Command-Enter only for steer and leaves drafts unsubmitted', async () => {
  const steer = harness();
  await pastePromptShortcut({ prompt: 'Change\ndirection', delivery: 'steer' }, steer.actions, steer.macos, steer.wait);
  assert.deepEqual(steer.events.at(-1), ['key', 'enter', ['command']]);

  const draft = harness();
  await pastePromptShortcut({ prompt: 'Keep\nediting', delivery: 'draft' }, draft.actions, draft.macos, draft.wait);
  assert.equal(draft.events.filter(([type]) => type === 'key').length, 0);
});
