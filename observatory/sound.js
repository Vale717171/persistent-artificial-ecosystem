/**
 * Sound — a tiny generative soundscape, fully synthesized (no assets).
 *
 * A warm pad that follows day and night, wind that follows weather,
 * crickets at night, and small chimes for the events of the world.
 * Off by default: it starts only from an explicit user gesture.
 */

export class Sound {
  constructor() {
    this.enabled = false;
    this.ctx = null;
    this.master = null;
    this.nodes = {};
  }

  async toggle() {
    if (this.enabled) {
      this.setEnabled(false);
      return false;
    }
    try {
      if (!this.ctx) this._build();
      if (this.ctx.state === "suspended") await this.ctx.resume();
      this.setEnabled(true);
      return true;
    } catch (error) {
      console.warn("Sound unavailable", error);
      return false;
    }
  }

  _build() {
    const AudioContext = window.AudioContext ?? window.webkitAudioContext;
    this.ctx = new AudioContext();

    this.master = this.ctx.createGain();
    this.master.gain.value = 0;
    this.master.connect(this.ctx.destination);

    // Warm pad: two detuned oscillators through a slow lowpass.
    const padGain = this.ctx.createGain();
    padGain.gain.value = 0.05;
    const filter = this.ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 420;
    const lfo = this.ctx.createOscillator();
    const lfoGain = this.ctx.createGain();
    lfo.frequency.value = 0.07;
    lfoGain.gain.value = 160;
    lfo.connect(lfoGain).connect(filter.frequency);
    lfo.start();
    for (const freq of [110, 164.81, 220]) {
      const osc = this.ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.value = freq;
      osc.detune.value = (Math.random() - 0.5) * 8;
      osc.connect(filter);
      osc.start();
    }
    filter.connect(padGain).connect(this.master);
    this.nodes.padGain = padGain;

    // Wind and rain: filtered white noise loops.
    this.nodes.wind = this._noise({ type: "bandpass", frequency: 320, gain: 0 });
    this.nodes.rain = this._noise({ type: "highpass", frequency: 1600, gain: 0 });

    // Night crickets: a soft pulsed triangle high up.
    const cricketGain = this.ctx.createGain();
    cricketGain.gain.value = 0;
    const cricket = this.ctx.createOscillator();
    cricket.type = "triangle";
    cricket.frequency.value = 4200;
    const cricketTremolo = this.ctx.createOscillator();
    const cricketDepth = this.ctx.createGain();
    cricketTremolo.frequency.value = 9;
    cricketDepth.gain.value = 0.5;
    cricketTremolo.connect(cricketDepth).connect(cricketGain.gain);
    cricket.connect(cricketGain).connect(this.master);
    cricket.start();
    cricketTremolo.start();
    this.nodes.cricketGain = cricketGain;
  }

  _noise({ type, frequency, gain }) {
    const ctx = this.ctx;
    const length = ctx.sampleRate * 2;
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i += 1) data[i] = Math.random() * 2 - 1;
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = frequency;
    const gainNode = ctx.createGain();
    gainNode.gain.value = gain;
    source.connect(filter).connect(gainNode).connect(this.master);
    source.start();
    return { gain: gainNode, filter };
  }

  setEnabled(value) {
    this.enabled = value;
    if (this.master) {
      this.master.gain.linearRampToValueAtTime(value ? 0.9 : 0, this.ctx.currentTime + 0.6);
    }
  }

  update(dt, { dayFactor, nightFactor, weather }) {
    if (!this.enabled || !this.ctx) return;
    const now = this.ctx.currentTime;
    const windy = weather === "storm" || weather === "dust" || weather === "snow";
    this.nodes.wind.gain.gain.setTargetAtTime(windy ? 0.14 : weather === "cloudy" ? 0.05 : 0.02, now, 1.2);
    this.nodes.rain.gain.gain.setTargetAtTime(weather === "rain" ? 0.1 : weather === "storm" ? 0.16 : 0, now, 1.2);
    this.nodes.cricketGain.gain.setTargetAtTime(nightFactor > 0.7 && weather !== "storm" ? 0.012 : 0, now, 2);
    this.nodes.padGain.gain.setTargetAtTime(0.035 + dayFactor * 0.03, now, 2);
  }

  chime(frequency = 523.25, delay = 0) {
    if (!this.enabled || !this.ctx) return;
    const now = this.ctx.currentTime + delay;
    for (const [freq, level] of [[frequency, 0.09], [frequency * 1.5, 0.035]]) {
      const osc = this.ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.value = freq;
      const gain = this.ctx.createGain();
      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(level, now + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 1.6);
      osc.connect(gain).connect(this.master);
      osc.start(now);
      osc.stop(now + 1.7);
    }
  }

  thunder() {
    if (!this.enabled || !this.ctx) return;
    const now = this.ctx.currentTime;
    const length = this.ctx.sampleRate * 2.2;
    const buffer = this.ctx.createBuffer(1, length, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i += 1) {
      const decay = Math.exp(-i / (this.ctx.sampleRate * 0.6));
      data[i] = (Math.random() * 2 - 1) * decay;
    }
    const source = this.ctx.createBufferSource();
    source.buffer = buffer;
    const filter = this.ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 140;
    const gain = this.ctx.createGain();
    gain.gain.value = 0.6;
    source.connect(filter).connect(gain).connect(this.master);
    source.start(now);
  }

  storm(on) {
    if (on) this.thunder();
  }
}
