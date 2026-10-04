const STEPS = [7,8,9,10,11,12,13,14,16,17,19,21,23,25,28,31,34,37,41,45,50,55,60,66,73,80,88,97,107,118,130,143,157,173,190,209,230,253,279,307,337,371,408,449,494,544,598,658,724,796,876,963,1060,1166,1282,1411,1552,1707,1878,2066,2272,2499,2749,3024,3327,3660,4026,4428,4871,5358,5894,6484,7132,7845,8630,9493,10442,11487,12635,13899,15289,16818,18500,20350,22385,24623,27086,29794,32767];
const INDEX = [-1,-1,-1,-1,2,4,6,8];
function decodeIma(data) {
  const pcm = Buffer.alloc(data.length * 4);
  let predictor = 0, index = 0, offset = 0;
  for (const byte of data) {
    for (const nibble of [byte & 15, byte >> 4]) {
      const step = STEPS[index];
      let change = step >> 3;
      if (nibble & 4) change += step;
      if (nibble & 2) change += step >> 1;
      if (nibble & 1) change += step >> 2;
      predictor = Math.max(-32768, Math.min(32767, predictor + ((nibble & 8) ? -change : change)));
      index = Math.max(0, Math.min(88, index + INDEX[nibble & 7]));
      pcm.writeInt16LE(predictor, offset); offset += 2;
    }
  }
  return pcm;
}
function checksum(data) {
  let hash = 2166136261;
  for (const byte of data) hash = Math.imul(hash ^ byte, 16777619) >>> 0;
  return hash;
}

class BleAudioReceiver {
  constructor(send, now = Date.now) {
    this.send = send; this.now = now; this.session = null;
    this.last = null;
  }
  get busy() { return Boolean(this.session && !this.session.complete); }
  ack(id, seq) { this.send({ t: 'ble.audio.ack', id, seq }); }
  expire() {
    if (this.busy && this.now() - this.session.updated > 20000) {
      this.last = { id: this.session.id, status: 'error', error: 'Bluetooth audio timed out' };
      this.session = null;
      return this.last;
    }
    return null;
  }
  accept(message) {
    const { id, t } = message;
    if (!Number.isInteger(id) || id <= 0 || id > 0xffffffff) throw new Error('Invalid audio session');
    if (t === 'ble.audio.begin') {
      if (this.session?.id === id) { this.ack(id, -1); return null; }
      if (this.busy) throw new Error('Another Bluetooth recording is active');
      if (message.codec !== 'ima4' || message.rate !== 16000) throw new Error('Unsupported Bluetooth audio format');
      const delivery = message.delivery === 'steer' ? 'steer' : 'queue';
      this.session = { id, delivery, test: message.test === true, chunks: [], bytes: 0, seq: 0, duplicates: 0, started: this.now(), updated: this.now(), complete: false };
      this.last = { id, status: 'receiving', test: this.session.test };
      this.ack(id, -1);
      return { type: 'start', delivery, test: this.session.test };
    }
    const session = this.session;
    if (!session || session.id !== id) throw new Error('Unknown Bluetooth audio session');
    session.updated = this.now();
    if (t === 'ble.audio.abort') {
      this.session = null;
      this.last = { id, status: 'error', error: 'Device cancelled Bluetooth audio' };
      return { type: 'abort', test: session.test };
    }
    if (t === 'ble.audio.data') {
      if (session.complete) return null;
      if (!Number.isInteger(message.seq) || message.seq < 0) throw new Error('Invalid audio sequence');
      if (message.seq < session.seq) { session.duplicates++; this.ack(id, message.seq); return null; }
      if (message.seq !== session.seq) throw new Error('Bluetooth audio packet out of order');
      if (typeof message.data !== 'string' || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(message.data)) throw new Error('Invalid audio encoding');
      const bytes = Buffer.from(message.data, 'base64');
      if (!bytes.length || bytes.length > 384 || session.bytes + bytes.length > 80000) throw new Error('Bluetooth audio exceeds recording limit');
      session.chunks.push(bytes); session.bytes += bytes.length; session.seq++;
      this.ack(id, message.seq);
      return null;
    }
    if (t === 'ble.audio.end') {
      if (session.complete) { this.ack(id, -2); return null; }
      const bytes = Buffer.concat(session.chunks);
      if (!bytes.length || message.bytes !== bytes.length || message.checksum !== checksum(bytes)) throw new Error('Bluetooth audio integrity check failed');
      if (session.test && (bytes.length !== 4096 || bytes.some((byte, i) => byte !== ((i * 31 + 7) & 255)))) throw new Error('Bluetooth test payload mismatch');
      session.complete = true; session.chunks = [];
      this.last = { id, status: 'complete', test: session.test, bytes: bytes.length, packets: session.seq, duplicates: session.duplicates, elapsedMs: this.now() - session.started };
      this.ack(id, -2);
      return { type: session.test ? 'test' : 'complete', pcm: session.test ? null : decodeIma(bytes), delivery: session.delivery };
    }
    throw new Error('Unknown Bluetooth audio message');
  }
}
module.exports = { BleAudioReceiver, checksum, decodeIma };
