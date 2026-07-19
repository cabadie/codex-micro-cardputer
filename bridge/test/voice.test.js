const assert = require('node:assert/strict');
const test = require('node:test');

const { VoiceSession } = require('../src/voice');

test('keeps a transcript available until delivery succeeds', () => {
  const voice = new VoiceSession({});
  voice.transcript = 'keep me safe';

  assert.equal(voice.peekTranscript(), 'keep me safe');
  assert.equal(voice.peekTranscript(), 'keep me safe');
  assert.equal(voice.takeTranscript(), 'keep me safe');
  assert.equal(voice.peekTranscript(), '');
});
