const assert = require('node:assert/strict');
const test = require('node:test');

const { SpeakerFeedback } = require('../src/feedback');

function fakeWav() {
  const value = Buffer.alloc(45, 128);
  value.write('RIFF', 0);
  value.write('WAVE', 8);
  value.write('fmt ', 12);
  value.writeUInt32LE(16, 16);
  value.write('data', 36);
  value.writeUInt32LE(1, 40);
  return value;
}

test('hybrid feedback sends an immediate cue followed by speech', async () => {
  const messages = [];
  const device = { send: (message) => { messages.push(message); return true; } };
  const synthesizer = {
    updateSettings: () => {},
    synthesize: async (text) => { assert.equal(text, 'Sent'); return fakeWav(); },
  };
  const feedback = new SpeakerFeedback(device, synthesizer, () => ({
    mode: 'hybrid', speechOutput: 'cardputer', volume: 45,
  }));
  await feedback.speak('Sent', { toast: 'sent' });
  assert.deepEqual(messages.slice(0, 2), [
    { t: 'toast', msg: 'sent' },
    { t: 'cue', id: 'confirm' },
  ]);
  assert.equal(messages.some((message) => message.t === 'speech.end'), true);
});

test('Mac speech output keeps Cardputer tones but skips low-fidelity audio transfer', async () => {
  const messages = [];
  let spoken = '';
  let synthesized = false;
  const feedback = new SpeakerFeedback(
    { send: (message) => { messages.push(message); return true; } },
    {
      updateSettings: () => {},
      speak: async (text) => { spoken = text; },
      synthesize: async () => { synthesized = true; return fakeWav(); },
    },
    () => ({ mode: 'hybrid', speechOutput: 'mac', volume: 75 })
  );

  await feedback.speak('Clear speech');
  assert.equal(spoken, 'Clear speech');
  assert.equal(synthesized, false);
  assert.equal(messages.some((message) => message.t === 'cue'), true);
  assert.equal(messages.some((message) => message.t === 'speech.begin'), false);
});

test('tones mode skips speech synthesis', async () => {
  let synthesized = false;
  const messages = [];
  const feedback = new SpeakerFeedback(
    { send: (message) => { messages.push(message); return true; } },
    { updateSettings: () => {}, synthesize: async () => { synthesized = true; } },
    () => ({ mode: 'tones', volume: 45 })
  );
  await feedback.speak('Sent');
  assert.equal(synthesized, false);
  assert.equal(messages.some((message) => message.t === 'cue'), true);
});

test('starting voice cancels Cardputer speech that is still synthesizing', async () => {
  const messages = [];
  let finishSynthesis;
  const synthesis = new Promise((resolve) => { finishSynthesis = resolve; });
  const feedback = new SpeakerFeedback(
    { send: (message) => { messages.push(message); return true; } },
    {
      updateSettings: () => {},
      synthesize: async () => synthesis,
    },
    () => ({ mode: 'hybrid', speechOutput: 'cardputer', volume: 45 })
  );

  const speaking = feedback.speak('Sent');
  await new Promise((resolve) => setImmediate(resolve));
  feedback.cancel();
  finishSynthesis(fakeWav());

  assert.equal(await speaking, true);
  assert.equal(messages.some((message) => message.t === 'speech.begin'), false);
});
