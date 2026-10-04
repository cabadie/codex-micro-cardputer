const assert = require('node:assert/strict');
const test = require('node:test');
const { BleAudioReceiver, checksum, decodeIma } = require('../src/ble-audio');

const begin = { t: 'ble.audio.begin', id: 7, codec: 'ima4', rate: 16000, delivery: 'steer' };
const data = (bytes, seq = 0) => ({ t: 'ble.audio.data', id: 7, seq, data: bytes.toString('base64') });
const end = bytes => ({ t: 'ble.audio.end', id: 7, bytes: bytes.length, checksum: checksum(bytes) });

test('ADPCM decoder matches an independent IMA step vector', () => {
  const pcm = decodeIma(Buffer.from([0x77, 0xff, 0x00]));
  assert.deepEqual(Array.from({ length: 6 }, (_, i) => pcm.readInt16LE(i * 2)), [11, 41, -22, -158, -139, -122]);
});
test('retries acknowledge without duplicating samples or completing twice', () => {
  const acks = []; const receiver = new BleAudioReceiver(msg => acks.push(msg));
  const bytes = Buffer.from([0x77, 0xff]);
  assert.equal(receiver.accept(begin).delivery, 'steer');
  assert.equal(receiver.accept(begin), null);
  receiver.accept(data(bytes)); receiver.accept(data(bytes));
  const result = receiver.accept(end(bytes));
  assert.equal(result.pcm.length, 8);
  assert.equal(receiver.accept(end(bytes)), null);
  assert.equal(receiver.last.duplicates, 1);
  assert.equal(acks.at(-1).seq, -2);
});
test('rejects gaps, oversized packets, corrupt payloads and competing sessions', () => {
  const receiver = new BleAudioReceiver(() => {}); receiver.accept(begin);
  assert.throws(() => receiver.accept({ ...begin, id: 8 }), /active/);
  assert.throws(() => receiver.accept(data(Buffer.from([1]), 1)), /order/);
  assert.throws(() => receiver.accept(data(Buffer.alloc(385))), /limit/);
  receiver.accept(data(Buffer.from([1])));
  assert.throws(() => receiver.accept({ ...end(Buffer.from([1])), checksum: 0 }), /integrity/);
});
test('lost sessions expire and a new recording can begin', () => {
  let now = 0; const receiver = new BleAudioReceiver(() => {}, () => now);
  receiver.accept(begin); now = 20001;
  assert.match(receiver.expire().error, /timed out/);
  assert.equal(receiver.busy, false);
  assert.equal(receiver.accept({ ...begin, id: 8 }).type, 'start');
});
test('hardware probe validates all bytes without yielding speech for submission', () => {
  const receiver = new BleAudioReceiver(() => {});
  receiver.accept({ ...begin, test: true });
  const bytes = Buffer.from(Array.from({ length: 4096 }, (_, i) => (i * 31 + 7) & 255));
  for (let offset = 0, seq = 0; offset < bytes.length; offset += 384, seq++) receiver.accept(data(bytes.subarray(offset, offset + 384), seq));
  const result = receiver.accept(end(bytes));
  assert.equal(result.type, 'test'); assert.equal(result.pcm, null);
  assert.equal(receiver.last.bytes, 4096);
});
