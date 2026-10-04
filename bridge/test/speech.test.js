const assert = require('node:assert/strict');
const test = require('node:test');

const { sendWavToDevice, validWav } = require('../src/speech');

function wav(bytes = 4096) {
  const value = Buffer.alloc(bytes, 128);
  value.write('RIFF', 0);
  value.writeUInt32LE(bytes - 8, 4);
  value.write('WAVE', 8);
  value.write('fmt ', 12);
  value.writeUInt32LE(16, 16);
  value.writeUInt16LE(1, 20);
  value.writeUInt16LE(1, 22);
  value.writeUInt32LE(8000, 24);
  value.writeUInt32LE(8000, 28);
  value.writeUInt16LE(1, 32);
  value.writeUInt16LE(8, 34);
  value.write('data', 36);
  value.writeUInt32LE(bytes - 44, 40);
  return value;
}

test('validates and chunks WAV speech for the Cardputer protocol', () => {
  const messages = [];
  const device = { send: (message) => { messages.push(message); return true; } };
  const audio = wav(5000);
  assert.equal(validWav(audio), true);
  sendWavToDevice(device, audio);
  assert.deepEqual(messages[0], { t: 'speech.begin', bytes: 5000, format: 'wav' });
  assert.equal(messages.filter((message) => message.t === 'speech.chunk').length, 3);
  assert.deepEqual(messages.at(-1), { t: 'speech.end' });
});

test('rejects invalid speech audio', () => {
  assert.equal(validWav(Buffer.from('not audio')), false);
  assert.throws(() => sendWavToDevice({ send: () => true }, Buffer.from('bad')), /invalid/);
});

test('stops a speech transfer when voice recording cancels feedback', () => {
  const messages = [];
  let chunks = 0;
  const device = {
    send: (message) => {
      messages.push(message);
      if (message.t === 'speech.chunk') chunks += 1;
      return true;
    },
  };
  const sent = sendWavToDevice(device, wav(5000), { cancelled: () => chunks >= 1 });
  assert.equal(sent, false);
  assert.equal(messages.filter((message) => message.t === 'speech.chunk').length, 1);
  assert.equal(messages.some((message) => message.t === 'speech.end'), false);
});
