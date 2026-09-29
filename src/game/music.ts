import { sfx } from './audio';

/**
 * Procedural synthwave loop with a lookahead scheduler.
 * Intensity layers: 0 menu (pad + slow arp), 1 early run (+bass, hats),
 * 2 mid run (+kick, 16th arp), 3 boss (+snare, lead melody).
 */
const BPM = 108;
const STEP = 60 / BPM / 4; // one 16th note
const STEPS = 64; // 4 bars

// A minor: Am – F – C – G
const CHORDS = [
  [57, 60, 64],
  [53, 57, 60],
  [48, 52, 55],
  [55, 59, 62],
];
const BASS = [45, 41, 36, 43];
const ARP = [0, 1, 2, 1];
// [step, midi note, length in steps]
const LEAD: [number, number, number][] = [
  [0, 69, 4], [4, 72, 2], [6, 76, 2], [8, 74, 4], [12, 72, 4],
  [16, 72, 4], [20, 69, 2], [22, 72, 2], [24, 77, 6], [30, 76, 2],
  [32, 76, 4], [36, 72, 2], [38, 67, 2], [40, 72, 4], [44, 76, 4],
  [48, 74, 4], [52, 71, 2], [54, 74, 2], [56, 79, 4], [60, 76, 4],
];

const freq = (midi: number) => 440 * 2 ** ((midi - 69) / 12);

class Music {
  private out: GainNode | null = null;
  private timer: number | null = null;
  private step = 0;
  private next = 0;
  private intensity = 0;
  private duck = 1;
  enabled = true;

  start() {
    const ctx = sfx.context;
    if (!ctx || this.timer !== null) return;
    if (!this.out) {
      this.out = ctx.createGain();
      this.out.gain.value = 0;
      this.out.connect(ctx.destination);
    }
    this.next = ctx.currentTime + 0.1;
    this.timer = window.setInterval(() => this.tick(), 25);
    this.applyVolume();
  }

  /** 0..1 user volume */
  volume = 1;

  setVolume(v: number) {
    this.volume = v;
    this.applyVolume();
  }

  setEnabled(on: boolean) {
    this.enabled = on;
    this.applyVolume();
  }

  setIntensity(n: number) {
    this.intensity = n;
  }

  /** Lower the music, e.g. while paused. 1 = full volume. */
  setDuck(d: number) {
    this.duck = d;
    this.applyVolume();
  }

  applyVolume() {
    const ctx = sfx.context;
    if (!ctx || !this.out) return;
    const v = this.enabled && !sfx.muted ? 0.22 * this.duck * this.volume : 0;
    this.out.gain.setTargetAtTime(v, ctx.currentTime, 0.15);
  }

  private tick() {
    const ctx = sfx.context;
    if (!ctx || !this.out) return;
    // background tabs throttle timers; don't try to catch up on missed notes
    if (document.hidden || this.next < ctx.currentTime - 0.2) this.next = ctx.currentTime + 0.05;
    if (!this.enabled || sfx.muted) return;
    while (this.next < ctx.currentTime + 0.15) {
      this.schedule(this.step, this.next);
      this.step = (this.step + 1) % STEPS;
      this.next += STEP;
    }
  }

  private schedule(step: number, t: number) {
    const bar = Math.floor(step / 16) % 4;
    const s = step % 16;
    const chord = CHORDS[bar];
    const lvl = this.intensity;

    if (s === 0) this.pad(chord, t, STEP * 16);

    const every = lvl >= 2 ? 1 : 2;
    if (s % every === 0) {
      const k = s / every;
      const note = chord[ARP[k % 4]] + 12 + (lvl >= 2 && Math.floor(k / 4) % 2 ? 12 : 0);
      this.pluck(freq(note), t, STEP * 0.9, lvl === 0 ? 0.025 : 0.035);
    }
    if (lvl >= 1) {
      if (s % 2 === 0) this.bass(freq(BASS[bar] + (s % 4 === 2 ? 12 : 0)), t, STEP * 1.8);
      if (s % 4 === 2) this.hat(t);
    }
    if (lvl >= 2 && s % 4 === 0) this.kick(t);
    if (lvl >= 3) {
      if (s % 8 === 4) this.snare(t);
      for (const [at, n, len] of LEAD) if (at === step) this.lead(freq(n), t, STEP * len);
    }
  }

  // ------------------------------------------------------------ voices

  private env(t: number, attack: number, hold: number, release: number, vol: number) {
    const g = sfx.context!.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + attack);
    g.gain.setValueAtTime(vol, t + attack + hold);
    g.gain.exponentialRampToValueAtTime(0.0001, t + attack + hold + release);
    g.connect(this.out!);
    return g;
  }

  private osc(type: OscillatorType, f: number, t: number, dur: number, into: AudioNode, detune = 0) {
    const o = sfx.context!.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f, t);
    o.detune.value = detune;
    o.connect(into);
    o.start(t);
    o.stop(t + dur + 0.05);
    return o;
  }

  private filter(type: BiquadFilterType, f: number, into: AudioNode) {
    const flt = sfx.context!.createBiquadFilter();
    flt.type = type;
    flt.frequency.value = f;
    flt.connect(into);
    return flt;
  }

  private pad(chord: number[], t: number, dur: number) {
    const g = this.env(t, 0.5, dur - 0.9, 0.6, 0.05);
    const lp = this.filter('lowpass', 900, g);
    for (const n of chord) {
      this.osc('sawtooth', freq(n), t, dur, lp, -8);
      this.osc('sawtooth', freq(n), t, dur, lp, 8);
    }
  }

  private pluck(f: number, t: number, dur: number, vol: number) {
    const g = this.env(t, 0.005, 0, dur, vol);
    this.osc('square', f, t, dur, this.filter('lowpass', 2400, g));
  }

  private bass(f: number, t: number, dur: number) {
    const g = this.env(t, 0.01, dur * 0.4, dur * 0.6, 0.11);
    this.osc('sawtooth', f, t, dur, this.filter('lowpass', 420, g));
  }

  private lead(f: number, t: number, dur: number) {
    const g = this.env(t, 0.02, dur * 0.6, dur * 0.4, 0.05);
    this.osc('triangle', f, t, dur, g);
    this.osc('square', f * 2, t, dur, this.filter('lowpass', 1800, this.env(t, 0.02, dur * 0.5, dur * 0.4, 0.012)));
  }

  private kick(t: number) {
    const ctx = sfx.context!;
    const g = this.env(t, 0.003, 0.02, 0.18, 0.4);
    const o = ctx.createOscillator();
    o.frequency.setValueAtTime(150, t);
    o.frequency.exponentialRampToValueAtTime(42, t + 0.14);
    o.connect(g);
    o.start(t);
    o.stop(t + 0.25);
  }

  private noiseHit(t: number, dur: number, vol: number, type: BiquadFilterType, f: number) {
    const ctx = sfx.context!;
    const buf = sfx.noiseBuffer;
    if (!buf) return;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.connect(this.filter(type, f, this.env(t, 0.002, 0, dur, vol)));
    src.start(t, Math.random() * 0.3);
    src.stop(t + dur + 0.02);
  }

  private hat(t: number) {
    this.noiseHit(t, 0.04, 0.05, 'highpass', 7000);
  }

  private snare(t: number) {
    this.noiseHit(t, 0.14, 0.12, 'bandpass', 1800);
    const g = this.env(t, 0.002, 0, 0.08, 0.06);
    this.osc('triangle', 190, t, 0.1, g);
  }
}

export const music = new Music();
