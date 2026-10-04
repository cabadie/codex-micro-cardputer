const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { PassThrough } = require('node:stream');
const test = require('node:test');

const { CardputerDevice } = require('../src/device');

class FakeChild extends EventEmitter {
  constructor() {
    super();
    this.stdin = new PassThrough();
    this.stdout = new PassThrough();
    this.stderr = new PassThrough();
  }
  kill() { this.emit('close', 0, 'SIGTERM'); }
}

test('BLE becomes active when USB is absent and carries JSON lines', async () => {
  const child = new FakeChild();
  const device = new CardputerDevice(
    { bluetooth: { enabled: true, helper: '/tmp/codex-ble' } },
    () => {},
    { spawn: () => child }
  );
  const received = [];
  device.on('message', (message, transport) => received.push({ message, transport }));
  device.connectBle();
  child.stdout.write(`${JSON.stringify({ event: 'connected', name: 'Codex Cardputer' })}\n`);
  child.stdout.write(`${JSON.stringify({ event: 'message', line: '{"t":"hello"}' })}\n`);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(device.transport, 'ble');
  assert.equal(device.bleStatus, 'connected');
  assert.deepEqual(received, [{ message: { t: 'hello' }, transport: 'ble' }]);

  let written = '';
  child.stdin.on('data', (data) => { written += data.toString(); });
  assert.equal(device.send({ t: 'ping' }), true);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(JSON.parse(written).t, 'ping');
  device.stop();
});

test('USB takes priority and BLE remains the failover transport', () => {
  const device = new CardputerDevice({ bluetooth: { enabled: true } }, () => {});
  device.bleProcess = {};
  device.bleConnected = true;
  assert.equal(device.transport, 'ble');
  device.port = { isOpen: true, write() {} };
  assert.equal(device.transport, 'usb');
  device.port = null;
  assert.equal(device.transport, 'ble');
});

test('audio acknowledgments stay on BLE when USB is also connected', () => {
  const child = new FakeChild(); const writes = [];
  child.stdin.on('data', bytes => writes.push(JSON.parse(bytes.toString())));
  const device = new CardputerDevice({ bluetooth: { enabled: true } }, () => {});
  device.bleProcess = child; device.bleConnected = true;
  device.port = { isOpen: true, write() { assert.fail('BLE ACK went to USB'); } };
  assert.equal(device.send({ t: 'ble.audio.ack', id: 7, seq: 0 }, 'ble'), true);
  assert.equal(writes[0].seq, 0);
  device.bleConnected = false;
  assert.equal(device.send({ t: 'ble.audio.ack', id: 7, seq: 0 }, 'ble'), false);
});
