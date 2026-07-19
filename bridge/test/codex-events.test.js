const assert = require('node:assert/strict');
const test = require('node:test');

const { reduceRolloutLines, requiresInput } = require('../src/codex-events');

function line(type, payload) {
  return JSON.stringify({ type, payload });
}

test('tracks thinking and completion', () => {
  assert.equal(reduceRolloutLines([
    line('event_msg', { type: 'task_started' }),
  ]), 'thinking');
  assert.equal(reduceRolloutLines([
    line('event_msg', { type: 'task_started' }),
    line('event_msg', { type: 'task_complete' }),
  ]), 'complete');
});

test('separates input requests from errors', () => {
  assert.equal(reduceRolloutLines([
    line('event_msg', { type: 'task_started' }),
    line('response_item', { type: 'function_call', name: 'request_user_input', call_id: '1' }),
  ]), 'requires_input');
  assert.equal(reduceRolloutLines([
    line('event_msg', { type: 'task_started' }),
    line('event_msg', { type: 'turn_aborted' }),
  ]), 'error');
});

test('detects escalated command approvals', () => {
  assert.equal(requiresInput({
    type: 'function_call',
    name: 'exec_command',
    arguments: JSON.stringify({ sandbox_permissions: 'require_escalated' }),
  }), true);
});
