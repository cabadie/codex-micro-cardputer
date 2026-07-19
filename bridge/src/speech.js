const { execFile } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const MAX_SPEECH_BYTES = 96 * 1024;
const SPEECH_CHUNK_BYTES = 2048;

function execFilePromise(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    execFile(command, args, options, (error, stdout, stderr) => {
      if (error) {
        error.message = `${path.basename(command)} failed: ${String(stderr || error.message).trim()}`;
        reject(error);
      } else {
        resolve(stdout);
      }
    });
  });
}

function validWav(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 45 ||
      buffer.toString('ascii', 0, 4) !== 'RIFF' || buffer.toString('ascii', 8, 12) !== 'WAVE') return false;
  let offset = 12;
  while (offset + 8 <= buffer.length) {
    const id = buffer.toString('ascii', offset, offset + 4);
    const length = buffer.readUInt32LE(offset + 4);
    if (id === 'data') return length > 0 && offset + 8 + length <= buffer.length;
    offset += 8 + length + (length & 1);
  }
  return false;
}

class MacSpeechSynthesizer {
  constructor(settings, log = () => {}) {
    this.settings = { ...settings };
    this.log = log;
    this.cache = new Map();
  }

  updateSettings(settings) {
    const changed = settings.voice !== this.settings.voice || settings.speechRate !== this.settings.speechRate;
    this.settings = { ...settings };
    if (changed) this.cache.clear();
  }

  async speak(text) {
    const phrase = String(text || '').replace(/\s+/g, ' ').trim();
    if (!phrase) throw new Error('Nothing to speak');
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-cardputer-mac-speech-'));
    fs.chmodSync(directory, 0o700);
    const input = path.join(directory, 'speech.txt');
    fs.writeFileSync(input, phrase, { mode: 0o600 });
    try {
      await execFilePromise('/usr/bin/say', [
        '-v', this.settings.voice,
        '-r', String(this.settings.speechRate),
        '-f', input,
      ], { timeout: 30000 });
      return true;
    } finally {
      try { fs.rmSync(directory, { recursive: true, force: true }); } catch (error) {
        this.log(`Mac speech cleanup failed: ${error.message}`);
      }
    }
  }

  async synthesize(text, { cache = true } = {}) {
    const phrase = String(text || '').replace(/\s+/g, ' ').trim();
    if (!phrase) throw new Error('Nothing to speak');
    const key = `${this.settings.voice}\n${this.settings.speechRate}\n${phrase}`;
    if (cache && this.cache.has(key)) return this.cache.get(key);

    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-cardputer-speech-'));
    fs.chmodSync(directory, 0o700);
    const input = path.join(directory, 'speech.txt');
    const aiff = path.join(directory, 'speech.aiff');
    const wav = path.join(directory, 'speech.wav');
    fs.writeFileSync(input, phrase, { mode: 0o600 });
    try {
      await execFilePromise('/usr/bin/say', [
        '-v', this.settings.voice,
        '-r', String(this.settings.speechRate),
        '-o', aiff,
        '-f', input,
      ], { timeout: 20000 });
      await execFilePromise('/usr/bin/afconvert', [
        aiff, '-o', wav, '-f', 'WAVE', '-d', 'UI8@8000', '-c', '1', '--no-filler',
      ], { timeout: 20000 });
      const audio = fs.readFileSync(wav);
      if (!validWav(audio)) throw new Error('Speech synthesis returned invalid WAV audio');
      if (audio.length > MAX_SPEECH_BYTES) throw new Error('Spoken summary is too long for the Cardputer');
      if (cache) this.cache.set(key, audio);
      return audio;
    } finally {
      try { fs.rmSync(directory, { recursive: true, force: true }); } catch (error) {
        this.log(`speech cleanup failed: ${error.message}`);
      }
    }
  }
}

function sendWavToDevice(device, wav) {
  if (!validWav(wav)) throw new Error('Cannot send invalid speech audio');
  if (wav.length > MAX_SPEECH_BYTES) throw new Error('Speech audio exceeds the Cardputer buffer');
  if (!device.send({ t: 'speech.begin', bytes: wav.length, format: 'wav' })) {
    throw new Error('Cardputer disconnected before speech playback');
  }
  for (let offset = 0; offset < wav.length; offset += SPEECH_CHUNK_BYTES) {
    const data = wav.subarray(offset, Math.min(offset + SPEECH_CHUNK_BYTES, wav.length));
    if (!device.send({ t: 'speech.chunk', data: data.toString('base64') })) {
      throw new Error('Cardputer disconnected during speech playback');
    }
  }
  if (!device.send({ t: 'speech.end' })) throw new Error('Cardputer disconnected before speech playback');
}

module.exports = {
  MAX_SPEECH_BYTES,
  MacSpeechSynthesizer,
  SPEECH_CHUNK_BYTES,
  sendWavToDevice,
  validWav,
};
