// EMBERLINE — every sound is synthesized with WebAudio. No audio files
// are shipped, no network request is made. The bank stays inert until the
// first user gesture unlocks the AudioContext, so it never throws on load.

export class SoundBank {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.noiseBuf = null;
    this.muted = false;
  }

  ensure() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    this.ctx = new Ctx();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.5;
    this.master.connect(this.ctx.destination);
    const len = this.ctx.sampleRate * 1;
    this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i += 1) data[i] = Math.random() * 2 - 1;
  }

  toggleMute() {
    this.muted = !this.muted;
    if (this.master) this.master.gain.value = this.muted ? 0 : 0.5;
    return this.muted;
  }

  // -- primitives ------------------------------------------------------------

  _noise({ duration, filterFreq, filterType = 'lowpass', gain = 0.5, decay = 0.08 }) {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loop = true;
    const filter = this.ctx.createBiquadFilter();
    filter.type = filterType;
    filter.frequency.value = filterFreq;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + duration);
    src.connect(filter).connect(g).connect(this.master);
    src.start(t);
    src.stop(t + duration + 0.02);
    return decay;
  }

  _tone({ freq, endFreq = null, duration, type = 'sine', gain = 0.3, delay = 0 }) {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime + delay;
    const osc = this.ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (endFreq !== null) osc.frequency.exponentialRampToValueAtTime(Math.max(1, endFreq), t + duration);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + duration);
    osc.connect(g).connect(this.master);
    osc.start(t);
    osc.stop(t + duration + 0.02);
  }

  // -- the game sounds --------------------------------------------------------

  shot(kind) {
    // A sharp crack: filtered noise plus a low thump. Rifles bark lower,
    // the sniper cracks harder, the shotgun booms.
    const table = {
      pistol: { f: 2600, g: 0.5, d: 0.09 },
      smg: { f: 3200, g: 0.4, d: 0.07 },
      shotgun: { f: 1400, g: 0.85, d: 0.22 },
      rifle: { f: 1900, g: 0.6, d: 0.11 },
      sniper: { f: 1100, g: 0.9, d: 0.3 },
    };
    const s = table[kind] || table.rifle;
    this._noise({ duration: s.d, filterFreq: s.f, gain: s.g });
    this._tone({ freq: 160, endFreq: 55, duration: 0.12, type: 'triangle', gain: 0.35 });
  }

  distantShot() {
    this._noise({ duration: 0.14, filterFreq: 900, gain: 0.16 });
  }

  dryFire() {
    this._tone({ freq: 1400, duration: 0.03, type: 'square', gain: 0.12 });
  }

  reload() {
    this._tone({ freq: 900, duration: 0.04, type: 'square', gain: 0.14 });
    this._tone({ freq: 600, duration: 0.05, type: 'square', gain: 0.16, delay: 0.28 });
    this._tone({ freq: 1100, duration: 0.04, type: 'square', gain: 0.18, delay: 0.6 });
  }

  hit() {
    this._tone({ freq: 2400, duration: 0.05, type: 'square', gain: 0.2 });
  }

  kill() {
    this._tone({ freq: 1800, duration: 0.06, type: 'square', gain: 0.22 });
    this._tone({ freq: 2600, duration: 0.09, type: 'square', gain: 0.2, delay: 0.07 });
  }

  hurt() {
    this._tone({ freq: 220, endFreq: 110, duration: 0.16, type: 'sawtooth', gain: 0.25 });
  }

  step() {
    this._noise({ duration: 0.06, filterFreq: 500, gain: 0.08 });
  }

  plantBeep(final = false) {
    this._tone({ freq: final ? 1800 : 1200, duration: 0.08, type: 'sine', gain: 0.25 });
  }

  defuseBeep() {
    this._tone({ freq: 1500, duration: 0.06, type: 'sine', gain: 0.22 });
    this._tone({ freq: 1500, duration: 0.06, type: 'sine', gain: 0.22, delay: 0.12 });
  }

  explosion() {
    this._noise({ duration: 1.4, filterFreq: 700, gain: 1.0 });
    this._tone({ freq: 90, endFreq: 28, duration: 1.1, type: 'sine', gain: 0.9 });
    this._noise({ duration: 0.5, filterFreq: 3000, filterType: 'highpass', gain: 0.3 });
  }

  grenadeThrow() {
    this._noise({ duration: 0.12, filterFreq: 1200, gain: 0.15 });
  }

  grenadeBounce() {
    this._tone({ freq: 320, duration: 0.05, type: 'triangle', gain: 0.2 });
  }

  buy() {
    this._tone({ freq: 880, duration: 0.06, type: 'sine', gain: 0.2 });
    this._tone({ freq: 1320, duration: 0.09, type: 'sine', gain: 0.2, delay: 0.06 });
  }

  click() {
    this._tone({ freq: 1000, duration: 0.03, type: 'square', gain: 0.1 });
  }

  roundWin() {
    [523, 659, 784].forEach((f, i) => this._tone({ freq: f, duration: 0.22, type: 'triangle', gain: 0.25, delay: i * 0.12 }));
  }

  roundLose() {
    [392, 330, 262].forEach((f, i) => this._tone({ freq: f, duration: 0.24, type: 'triangle', gain: 0.22, delay: i * 0.13 }));
  }

  matchWin() {
    [523, 659, 784, 1047].forEach((f, i) => this._tone({ freq: f, duration: 0.3, type: 'triangle', gain: 0.25, delay: i * 0.14 }));
  }
}
