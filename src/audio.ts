/**
 * Original synthesized sound (Web Audio API) – no audio files.
 * Starts only after a user gesture, defaults to a low volume, can be muted,
 * pauses its loops while the game is paused, and silently does nothing if
 * the browser has no audio.
 */

export type Sfx =
  | 'click'
  | 'step'
  | 'error'
  | 'ignite'
  | 'boil'
  | 'sizzle'
  | 'pour'
  | 'clink'
  | 'coin'
  | 'success'
  | 'bad'
  | 'bell'
  | 'upgrade'
  | 'rush'
  | 'horn'
  | 'brake';

const MASTER = 0.32;

export class AudioEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private rainGain: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private birdTimer = 0;
  private _muted = false;
  private _paused = false;
  private heavy = false;

  get muted() {
    return this._muted;
  }

  /** Shared AudioContext (created on the first user gesture). */
  get context(): AudioContext | null {
    return this.ctx;
  }

  /** Call from a click handler (browsers block audio before a gesture). */
  start() {
    if (this.ctx) {
      void this.ctx.resume();
      return;
    }
    try {
      const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctx) return;
      this.ctx = new Ctx();
      this.master = this.ctx.createGain();
      this.master.gain.value = this._muted ? 0 : MASTER;
      this.master.connect(this.ctx.destination);
      this.noise = this.makeNoise(2);
      this.startRain();
      this.scheduleBirds();
    } catch {
      this.ctx = null;
    }
  }

  setMuted(m: boolean) {
    this._muted = m;
    this.applyGain();
  }

  /** Quiet the ambience while the game is paused. */
  setPaused(p: boolean) {
    this._paused = p;
    this.applyGain();
  }

  setHeavyRain(h: boolean) {
    this.heavy = h;
    if (this.ctx && this.rainGain) this.rainGain.gain.setTargetAtTime(h ? 0.55 : 0.22, this.ctx.currentTime, 0.8);
  }

  private applyGain() {
    if (!this.ctx || !this.master) return;
    const target = this._muted ? 0 : this._paused ? MASTER * 0.25 : MASTER;
    this.master.gain.setTargetAtTime(target, this.ctx.currentTime, 0.08);
  }

  // ------------------------------------------------------------- building blocks

  private makeNoise(seconds: number): AudioBuffer {
    const ctx = this.ctx!;
    const buf = ctx.createBuffer(1, ctx.sampleRate * seconds, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  }

  private env(gain: GainNode, t: number, attack: number, peak: number, decay: number) {
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(peak, t + attack);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
  }

  private tone(freq: number, at: number, dur: number, type: OscillatorType = 'sine', peak = 0.3, slideTo?: number) {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, at);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, at + dur);
    this.env(g, at, 0.008, peak, dur);
    o.connect(g).connect(this.master!);
    o.start(at);
    o.stop(at + dur + 0.05);
  }

  private burst(at: number, dur: number, filter: BiquadFilterType, freq: number, peak = 0.3, freqTo?: number, q = 1) {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = filter;
    f.frequency.setValueAtTime(freq, at);
    if (freqTo) f.frequency.exponentialRampToValueAtTime(freqTo, at + dur);
    f.Q.value = q;
    const g = ctx.createGain();
    this.env(g, at, 0.02, peak, dur);
    src.connect(f).connect(g).connect(this.master!);
    src.start(at, Math.random());
    src.stop(at + dur + 0.1);
  }

  private startRain() {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 1800;
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 350;
    this.rainGain = ctx.createGain();
    this.rainGain.gain.value = 0;
    this.rainGain.gain.setTargetAtTime(this.heavy ? 0.55 : 0.22, ctx.currentTime, 1.5);
    src.connect(lp).connect(hp).connect(this.rainGain).connect(this.master!);
    src.start();
  }

  private scheduleBirds() {
    window.clearTimeout(this.birdTimer);
    this.birdTimer = window.setTimeout(() => {
      if (this.ctx && !this._paused && !this.heavy) {
        const t = this.ctx.currentTime;
        const base = 2400 + Math.random() * 900;
        const n = 2 + Math.floor(Math.random() * 3);
        for (let i = 0; i < n; i++) this.tone(base, t + i * 0.13, 0.09, 'sine', 0.05, base * 1.45);
      }
      this.scheduleBirds();
    }, 6000 + Math.random() * 9000);
  }

  // ------------------------------------------------------------------- effects

  play(name: Sfx) {
    if (!this.ctx || !this.master || this._muted) return;
    const t = this.ctx.currentTime + 0.005;
    switch (name) {
      case 'click':
        this.tone(900, t, 0.04, 'triangle', 0.08);
        break;
      case 'step':
        this.tone(660, t, 0.08, 'triangle', 0.12, 880);
        break;
      case 'error':
        this.tone(220, t, 0.16, 'square', 0.06, 160);
        break;
      case 'ignite':
        this.burst(t, 0.35, 'bandpass', 500, 0.35, 1600, 0.8);
        this.tone(140, t, 0.3, 'sine', 0.1, 90);
        break;
      case 'boil':
        for (let i = 0; i < 14; i++) this.tone(180 + Math.random() * 260, t + i * 0.11 + Math.random() * 0.05, 0.06, 'sine', 0.06, 420);
        this.burst(t, 1.4, 'lowpass', 600, 0.12);
        break;
      case 'sizzle':
        this.burst(t, 1.6, 'highpass', 3200, 0.22);
        this.burst(t + 0.1, 1.4, 'bandpass', 5200, 0.12, 4200, 2);
        break;
      case 'pour':
        this.burst(t, 0.7, 'bandpass', 500, 0.25, 1500, 3);
        break;
      case 'clink':
        this.tone(2350, t, 0.25, 'sine', 0.12);
        this.tone(3120, t + 0.02, 0.2, 'sine', 0.08);
        break;
      case 'coin':
        this.tone(988, t, 0.09, 'square', 0.07);
        this.tone(1319, t + 0.08, 0.22, 'square', 0.07);
        break;
      case 'success':
        [523, 659, 784].forEach((f, i) => this.tone(f, t + 0.12 + i * 0.08, 0.25, 'triangle', 0.12));
        break;
      case 'bad':
        this.tone(330, t, 0.22, 'sawtooth', 0.07, 220);
        this.tone(247, t + 0.2, 0.32, 'sawtooth', 0.07, 150);
        break;
      case 'bell':
        this.tone(1760, t, 0.18, 'sine', 0.08);
        this.tone(1760, t + 0.16, 0.3, 'sine', 0.08);
        break;
      case 'upgrade':
        [523, 659, 784, 1047].forEach((f, i) => this.tone(f, t + i * 0.09, 0.35, 'triangle', 0.13));
        break;
      case 'horn':
        // the classic two-tone bus horn, kept soft
        for (const [f, d] of [
          [392, 0],
          [494, 0],
          [392, 0.32],
          [494, 0.32],
        ])
          this.tone(f, t + d, 0.24, 'sawtooth', 0.035);
        break;
      case 'brake':
        this.burst(t, 0.6, 'highpass', 2500, 0.08, 6000);
        break;
      case 'rush':
        [392, 523, 392, 523, 659].forEach((f, i) => this.tone(f, t + i * 0.1, 0.14, 'square', 0.06));
        break;
    }
  }
}
