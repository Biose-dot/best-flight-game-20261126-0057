// All sound is synthesised with the Web Audio API — no audio files, no network.
// The engine is a detuned sawtooth pair through a low-pass filter, wind is looped
// filtered noise, and the chimes are short sine arpeggios.
export class SoundBank {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.engineOsc1 = null;
    this.engineOsc2 = null;
    this.engineGain = null;
    this.engineFilter = null;
    this.windSource = null;
    this.windGain = null;
    this.windFilter = null;
  }

  // Browsers only let audio start after a user gesture; call from the first click.
  ensure() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;
    this.ctx = new AudioContext();
    const ctx = this.ctx;

    this.engineGain = ctx.createGain();
    this.engineGain.gain.value = 0;
    this.engineFilter = ctx.createBiquadFilter();
    this.engineFilter.type = 'lowpass';
    this.engineFilter.frequency.value = 420;
    this.engineOsc1 = ctx.createOscillator();
    this.engineOsc1.type = 'sawtooth';
    this.engineOsc1.frequency.value = 62;
    this.engineOsc2 = ctx.createOscillator();
    this.engineOsc2.type = 'sawtooth';
    this.engineOsc2.frequency.value = 93;
    const osc2Gain = ctx.createGain();
    osc2Gain.gain.value = 0.5;
    this.engineOsc1.connect(this.engineFilter);
    this.engineOsc2.connect(osc2Gain);
    osc2Gain.connect(this.engineFilter);
    this.engineFilter.connect(this.engineGain);
    this.engineGain.connect(ctx.destination);
    this.engineOsc1.start();
    this.engineOsc2.start();

    // Looping wind: white noise through a band-pass filter.
    const length = ctx.sampleRate * 2;
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i += 1) data[i] = Math.random() * 2 - 1;
    this.windSource = ctx.createBufferSource();
    this.windSource.buffer = buffer;
    this.windSource.loop = true;
    this.windFilter = ctx.createBiquadFilter();
    this.windFilter.type = 'bandpass';
    this.windFilter.frequency.value = 480;
    this.windFilter.Q.value = 0.6;
    this.windGain = ctx.createGain();
    this.windGain.gain.value = 0;
    this.windSource.connect(this.windFilter);
    this.windFilter.connect(this.windGain);
    this.windGain.connect(ctx.destination);
    this.windSource.start();
  }

  setMuted(muted) {
    this.muted = muted;
    if (this.ctx) this.ctx.destination.gain = muted ? 0 : 1;
  }

  // Called every frame while flying: throttle 0..1, speed in m/s, airborne bool.
  updateEngine(throttle, speed, airborne) {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime;
    const rpm = 52 + throttle * 68 + speed * 0.35;
    this.engineOsc1.frequency.setTargetAtTime(rpm, t, 0.08);
    this.engineOsc2.frequency.setTargetAtTime(rpm * 1.494, t, 0.08);
    this.engineFilter.frequency.setTargetAtTime(320 + throttle * 900, t, 0.1);
    this.engineGain.gain.setTargetAtTime(airborne ? 0.05 + throttle * 0.075 : 0.02 + throttle * 0.05, t, 0.1);
    this.windGain.gain.setTargetAtTime(Math.min(0.09, speed * 0.0011), t, 0.15);
    this.windFilter.frequency.setTargetAtTime(320 + speed * 9, t, 0.2);
  }

  stopEngine() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.engineGain.gain.setTargetAtTime(0, t, 0.2);
    this.windGain.gain.setTargetAtTime(0, t, 0.2);
  }

  blip(freq, when, dur, type, vol) {
    if (!this.ctx || this.muted) return;
    const ctx = this.ctx;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type || 'sine';
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0, ctx.currentTime + when);
    gain.gain.linearRampToValueAtTime(vol || 0.16, ctx.currentTime + when + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + when + dur);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(ctx.currentTime + when);
    osc.stop(ctx.currentTime + when + dur + 0.05);
  }

  ringChime() {
    this.blip(659, 0, 0.28, 'sine', 0.2);
    this.blip(988, 0.09, 0.34, 'sine', 0.18);
    this.blip(1319, 0.18, 0.4, 'sine', 0.14);
  }

  deliveryJingle() {
    const notes = [523, 659, 784, 1047];
    notes.forEach((freq, i) => this.blip(freq, i * 0.11, 0.32, 'triangle', 0.2));
  }

  thud() {
    if (!this.ctx || this.muted) return;
    const ctx = this.ctx;
    const dur = 0.22;
    const buffer = ctx.createBuffer(1, ctx.sampleRate * dur, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 240;
    const gain = ctx.createGain();
    gain.gain.value = 0.5;
    src.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);
    src.start();
  }

  click() {
    this.blip(880, 0, 0.07, 'square', 0.06);
  }
}
