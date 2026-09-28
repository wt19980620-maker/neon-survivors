/**
 * Tiny procedural sound effects via WebAudio — no audio assets needed.
 * Every effect is throttled so hundreds of hits per second don't turn into noise.
 */
type SfxName =
  | 'shoot' | 'hit' | 'kill' | 'gem' | 'levelup' | 'hurt' | 'nova' | 'zap' | 'disc'
  | 'pickup' | 'boss' | 'bossShot' | 'chest' | 'select' | 'gameover' | 'victory' | 'warn';

const THROTTLE: Record<SfxName, number> = {
  shoot: 70, hit: 45, kill: 35, gem: 28, levelup: 200, hurt: 150, nova: 100, zap: 90, disc: 120,
  pickup: 80, boss: 500, bossShot: 150, chest: 300, select: 50, gameover: 1000, victory: 1000, warn: 400,
};

class Sfx {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noiseBuf: AudioBuffer | null = null;
  private last: Partial<Record<SfxName, number>> = {};
  private gemCombo = 0;
  private gemComboT = 0;
  muted = false;

  unlock() {
    try {
      if (!this.ctx) {
        const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        this.ctx = new Ctx();
        this.master = this.ctx.createGain();
        this.master.gain.value = this.muted ? 0 : 0.32;
        this.master.connect(this.ctx.destination);
        const len = this.ctx.sampleRate * 0.5;
        this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
        const data = this.noiseBuf.getChannelData(0);
        for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
      }
      if (this.ctx.state === 'suspended') void this.ctx.resume();
    } catch {
      this.ctx = null;
    }
  }

  setMuted(m: boolean) {
    this.muted = m;
    if (this.master && this.ctx) this.master.gain.setTargetAtTime(m ? 0 : 0.32, this.ctx.currentTime, 0.02);
  }

  private tone(freq: number, dur: number, type: OscillatorType, vol: number, slideTo?: number, delay = 0) {
    const ctx = this.ctx!;
    const t = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g).connect(this.master!);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  private noise(dur: number, vol: number, freq: number, type: BiquadFilterType, sweepTo?: number, delay = 0) {
    const ctx = this.ctx!;
    const t = ctx.currentTime + delay;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.setValueAtTime(freq, t);
    if (sweepTo) f.frequency.exponentialRampToValueAtTime(sweepTo, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(this.master!);
    src.start(t, Math.random() * 0.3);
    src.stop(t + dur + 0.02);
  }

  play(name: SfxName) {
    if (!this.ctx || this.muted || this.ctx.state !== 'running') return;
    const now = performance.now();
    if (now - (this.last[name] ?? 0) < THROTTLE[name]) return;
    this.last[name] = now;
    const r = 1 + (Math.random() - 0.5) * 0.12;
    switch (name) {
      case 'shoot': this.tone(880 * r, 0.07, 'square', 0.05, 1400); break;
      case 'hit': this.noise(0.05, 0.12, 2500 * r, 'bandpass'); break;
      case 'kill': this.tone(420 * r, 0.1, 'triangle', 0.1, 120); break;
      case 'gem': {
        if (now - this.gemComboT > 400) this.gemCombo = 0;
        this.gemComboT = now;
        this.gemCombo = Math.min(this.gemCombo + 1, 16);
        this.tone(900 + this.gemCombo * 45, 0.06, 'sine', 0.07);
        break;
      }
      case 'levelup':
        [523, 659, 784, 1046].forEach((f, i) => this.tone(f, 0.18, 'triangle', 0.13, undefined, i * 0.07));
        break;
      case 'hurt': this.tone(160, 0.18, 'sawtooth', 0.16, 60); this.noise(0.12, 0.15, 600, 'lowpass'); break;
      case 'nova': this.noise(0.35, 0.22, 300, 'lowpass', 3000); this.tone(140, 0.25, 'sine', 0.18, 60); break;
      case 'zap': this.noise(0.12, 0.16, 4000 * r, 'highpass'); this.tone(1800 * r, 0.08, 'sawtooth', 0.04, 300); break;
      case 'disc': this.tone(300 * r, 0.15, 'triangle', 0.06, 700); break;
      case 'pickup': this.tone(660, 0.1, 'sine', 0.12, 1320); break;
      case 'boss': this.tone(70, 1.2, 'sawtooth', 0.22, 40); this.noise(1.0, 0.2, 200, 'lowpass'); break;
      case 'bossShot': this.tone(240, 0.2, 'square', 0.07, 90); break;
      case 'chest':
        [392, 523, 659, 784, 1046, 1318].forEach((f, i) => this.tone(f, 0.22, 'triangle', 0.12, undefined, i * 0.06));
        break;
      case 'select': this.tone(740, 0.06, 'square', 0.06); break;
      case 'warn': this.tone(440, 0.25, 'square', 0.08); this.tone(440, 0.25, 'square', 0.08, undefined, 0.3); break;
      case 'gameover':
        [392, 330, 262, 196].forEach((f, i) => this.tone(f, 0.35, 'triangle', 0.14, undefined, i * 0.18));
        break;
      case 'victory':
        [523, 659, 784, 659, 784, 1046].forEach((f, i) => this.tone(f, 0.3, 'triangle', 0.14, undefined, i * 0.12));
        break;
    }
  }
}

export const sfx = new Sfx();
