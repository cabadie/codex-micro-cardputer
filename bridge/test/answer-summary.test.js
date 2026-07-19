const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const { cleanForSpeech, latestCompletedAnswer, summarizeForSpeech } = require('../src/answer-summary');

test('reads the latest completed assistant answer from a rollout', (context) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'cardputer-answer-'));
  context.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const rollout = path.join(directory, 'rollout.jsonl');
  fs.writeFileSync(rollout, [
    JSON.stringify({ type: 'event_msg', payload: { type: 'task_complete', last_agent_message: 'First answer.' } }),
    JSON.stringify({ type: 'response_item', payload: { type: 'message', role: 'user' } }),
    JSON.stringify({ type: 'event_msg', payload: { type: 'task_complete', last_agent_message: 'Latest answer.' } }),
  ].join('\n'));
  assert.equal(latestCompletedAnswer(rollout), 'Latest answer.');
});

test('turns an outcome-first answer into a short speakable summary', () => {
  const value = `## Result\n\nDone. All **25 tests** pass and the [speaker settings](https://example.com) are ready.\n\n\`\`\`js\nsecret();\n\`\`\``;
  assert.equal(cleanForSpeech(value), 'Result Done. All 25 tests pass and the speaker settings are ready.');
  assert.equal(summarizeForSpeech(value, 12), 'Result Done. All 25 tests pass and the speaker settings are ready.');
  assert.equal(
    summarizeForSpeech('One two three four five six seven eight nine ten eleven twelve thirteen fourteen.', 8),
    'One two three four five six seven eight.'
  );
});
