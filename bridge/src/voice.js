const { execFile, execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

function wavFromPcm(pcm, rate) {
  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(rate, 24);
  header.writeUInt32LE(rate * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write('data', 36);
  header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header, pcm]);
}

function normalizePcm(pcm) {
  let peak = 0;
  for (let offset = 0; offset + 1 < pcm.length; offset += 2) {
    peak = Math.max(peak, Math.abs(pcm.readInt16LE(offset)));
  }
  if (peak <= 50 || peak >= 26000) return { pcm, peak, gain: 1 };
  const gain = 26000 / peak;
  for (let offset = 0; offset + 1 < pcm.length; offset += 2) {
    const scaled = Math.max(-32768, Math.min(32767, Math.round(pcm.readInt16LE(offset) * gain)));
    pcm.writeInt16LE(scaled, offset);
  }
  return { pcm, peak, gain };
}

function resolveWhisper() {
  for (const command of ['whisper-cli', 'whisper-cpp']) {
    try {
      const result = execFileSync('/usr/bin/which', [command], { encoding: 'utf8' }).trim();
      if (result) return result;
    } catch {
      // Try the next supported binary name.
    }
  }
  return null;
}

function runTranscription(file, config) {
  return new Promise((resolve, reject) => {
    let command;
    let args;
    if (Array.isArray(config.whisperCommand) && config.whisperCommand.length) {
      [command, ...args] = config.whisperCommand.map((part) => String(part).replaceAll('{file}', file));
    } else {
      command = resolveWhisper();
      if (!command) return reject(new Error('whisper-cli not found; install whisper-cpp or configure voice.whisperCommand'));
      if (!config.whisperModel || !fs.existsSync(config.whisperModel)) {
        return reject(new Error(`Whisper model missing: ${config.whisperModel || '(not configured)'}`));
      }
      args = ['-np', '-nt', '-m', config.whisperModel, '-f', file];
    }
    execFile(command, args, { timeout: 90000 }, (error, stdout) => {
      if (error) return reject(error);
      resolve(String(stdout).replace(/\s+/g, ' ').trim());
    });
  });
}

class VoiceSession {
  constructor(config) {
    this.config = config;
    this.rate = 16000;
    this.chunks = null;
    this.transcript = '';
  }

  start(rate = 16000) {
    this.rate = rate;
    this.chunks = [];
    this.transcript = '';
  }

  append(base64) {
    if (!this.chunks) return;
    this.chunks.push(Buffer.from(base64 || '', 'base64'));
  }

  async finish() {
    if (!this.chunks || !this.chunks.length) throw new Error('No audio was captured');
    const pcm = Buffer.concat(this.chunks);
    this.chunks = null;
    const seconds = pcm.length / 2 / this.rate;
    if (seconds < 0.35) throw new Error('Recording was too short');
    normalizePcm(pcm);
    const file = path.join(os.tmpdir(), `codex-cardputer-${process.pid}.wav`);
    fs.writeFileSync(file, wavFromPcm(pcm, this.rate), { mode: 0o600 });
    try {
      this.transcript = await runTranscription(file, this.config);
      return this.transcript;
    } finally {
      try { fs.unlinkSync(file); } catch { /* temporary cleanup is best effort */ }
    }
  }

  takeTranscript() {
    const value = this.transcript;
    this.transcript = '';
    return value;
  }

  peekTranscript() {
    return this.transcript;
  }

  discard() {
    this.transcript = '';
    this.chunks = null;
  }
}

module.exports = { VoiceSession, normalizePcm, runTranscription, wavFromPcm };
