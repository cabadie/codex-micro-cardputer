const { sendWavToDevice } = require('./speech');

class SpeakerFeedback {
  constructor(device, synthesizer, getSettings, log = () => {}) {
    this.device = device;
    this.synthesizer = synthesizer;
    this.getSettings = getSettings;
    this.log = log;
    this.speechQueue = Promise.resolve();
    this.generation = 0;
    this.suspended = false;
  }

  cancel() {
    // Voice recording has priority over optional spoken feedback. Invalidating
    // both queued and currently synthesizing jobs prevents their WAV chunks
    // from competing with microphone audio on the serial connection.
    this.generation += 1;
  }

  syncSettings() {
    const settings = this.getSettings();
    this.synthesizer.updateSettings(settings);
    this.device.send({ t: 'sound.settings', mode: settings.mode, volume: settings.volume });
  }

  tone(cue = 'confirm', toast = '') {
    if (this.suspended) return;
    if (toast) this.device.send({ t: 'toast', msg: toast.slice(0, 40) });
    if (this.getSettings().mode !== 'mute') this.device.send({ t: 'cue', id: cue });
  }

  async speak(text, { toast = text, cue = 'confirm', cache = true } = {}) {
    if (this.suspended) return false;
    const settings = this.getSettings();
    const generation = this.generation;
    if (toast) this.device.send({ t: 'toast', msg: String(toast).slice(0, 40) });
    if (settings.mode === 'mute') return false;
    this.device.send({ t: 'cue', id: cue });
    if (settings.mode !== 'hybrid') return false;
    const job = async () => {
      try {
        if (generation !== this.generation) return false;
        const output = settings.speechOutput || 'cardputer';
        const jobs = [];
        if (output === 'mac' || output === 'both') {
          jobs.push(this.synthesizer.speak(text));
        }
        if (output === 'cardputer' || output === 'both') {
          jobs.push(this.synthesizer.synthesize(text, { cache }).then((wav) => sendWavToDevice(this.device, wav, {
            cancelled: () => generation !== this.generation,
          })));
        }
        await Promise.all(jobs);
        return true;
      } catch (error) {
        this.log(`speech feedback failed: ${error.message}`);
        return false;
      }
    };
    this.speechQueue = this.speechQueue.then(job, job);
    return this.speechQueue;
  }

  async failure(message) {
    return this.speak('Failed', { toast: message || 'action failed', cue: 'error' });
  }
}

module.exports = { SpeakerFeedback };
