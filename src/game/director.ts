import type { EnemyKind } from './data';
import { ENDLESS_BOSS_EVERY, ENDLESS_BOSS_SCALE, ENDLESS_EVENT_EVERY, RUN_LENGTH } from './data';
import { sfx } from './audio';
import type { GameScene } from '../scenes/GameScene';

interface ScriptedEvent {
  t: number;
  done: boolean;
  run: () => void;
}

/** Decides what spawns, where and when. All pacing lives here. */
export class Director {
  private acc = 0;
  private nextElite = 70;
  private events: ScriptedEvent[];
  // endless mode, after the final boss
  private nextBoss = RUN_LENGTH + ENDLESS_BOSS_EVERY;
  private nextEvent = RUN_LENGTH + 40;
  /** endless bosses spawned so far (the regular two don't count) */
  bossWave = 0;

  constructor(private readonly g: GameScene) {
    this.events = [
      { t: 150, done: false, run: () => this.ring('chaser', 32, '被包围了！') },
      { t: 300, done: false, run: () => this.boss(false) },
      { t: 390, done: false, run: () => this.rush('bat', 70, '蜂群来袭！') },
      { t: 340, done: false, run: () => this.ring('spitter', 14, '远程火力网！') },
      { t: 450, done: false, run: () => this.ring('brute', 22, '重甲方阵！') },
      { t: 565, done: false, run: () => this.rush('bomber', 26, '自爆虫潮！') },
      { t: 520, done: false, run: () => this.rush('chaser', 80, '潮水涌来！') },
      { t: RUN_LENGTH, done: false, run: () => this.boss(true) },
    ];
  }

  /** Enemy stat multipliers grow with time so the pressure keeps pace with the build. */
  hpMult(t = this.g.elapsed) {
    const m = t / 60;
    return (1 + m * 0.3 + m * m * 0.035) * this.g.mapDef.hpMult;
  }

  dmgMult(t = this.g.elapsed) {
    return 1 + (t / RUN_LENGTH) * 0.8;
  }

  speedMult(t = this.g.elapsed) {
    return (1 + (t / RUN_LENGTH) * 0.1) * this.g.mapDef.speedMult;
  }

  update(dt: number) {
    const g = this.g;
    const t = g.elapsed;

    for (const ev of this.events) {
      if (!ev.done && t >= ev.t) {
        ev.done = true;
        ev.run();
      }
    }

    if (g.mode === 'endless' && t >= RUN_LENGTH) {
      if (t >= this.nextBoss) {
        this.nextBoss += ENDLESS_BOSS_EVERY;
        this.bossWave++;
        // alternate the two bosses, each wave tougher than the last
        this.boss(this.bossWave % 2 === 0, ENDLESS_BOSS_SCALE ** this.bossWave);
      }
      if (t >= this.nextEvent) {
        this.nextEvent += ENDLESS_EVENT_EVERY;
        this.randomEvent(t);
      }
    }

    if (t >= this.nextElite) {
      this.nextElite += 75;
      const p = g.spawnPoint();
      g.spawnEnemy('brute', p.x, p.y, { elite: true });
    }

    const m = t / 60;
    const rate = (2 + m * 2.5 + m * m * 0.15) * (g.bossAlive() ? 0.6 : 1);
    const cap = Math.min(450, 50 + t * 1.0);
    this.acc += rate * dt;
    while (this.acc >= 1) {
      this.acc -= 1;
      if (g.enemies.length >= cap) {
        this.acc = 0;
        break;
      }
      this.spawnOne(t);
    }
  }

  private spawnOne(t: number) {
    const g = this.g;
    const weights: [EnemyKind | 'bats' | 'bombers', number][] = [
      ['chaser', 10],
      ['bats', t > 45 ? 5 + t / 60 : 0],
      ['brute', t > 110 ? 1 + t / 150 : 0],
      ['spitter', t > 150 ? 0.8 + t / 300 : 0],
      ['splitter', t > 200 ? 0.8 + t / 300 : 0],
      ['bombers', t > 240 ? 0.6 + t / 400 : 0],
    ];
    let r = Math.random() * weights.reduce((s, [, w]) => s + w, 0);
    let kind = weights[0][0];
    for (const [k, w] of weights) {
      r -= w;
      if (r <= 0) {
        kind = k;
        break;
      }
    }
    const p = g.spawnPoint();
    if (kind === 'bats') {
      // bats arrive in small flocks
      const n = 4 + Math.floor(Math.random() * 4);
      for (let i = 0; i < n; i++) g.spawnEnemy('bat', p.x + (Math.random() - 0.5) * 70, p.y + (Math.random() - 0.5) * 70);
      this.acc -= n * 0.5;
    } else if (kind === 'bombers') {
      // bombers come in pairs so one sneaks through while you dodge the other
      g.spawnEnemy('bomber', p.x, p.y);
      g.spawnEnemy('bomber', p.x + 30, p.y + 30);
      this.acc -= 1;
    } else {
      g.spawnEnemy(kind, p.x, p.y);
    }
  }

  private ring(kind: EnemyKind, n: number, text: string) {
    const g = this.g;
    const r = g.viewRadius() + 30;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      g.spawnEnemy(kind, g.px + Math.cos(a) * r, g.py + Math.sin(a) * r);
    }
    g.ui()?.banner(text);
    sfx.play('warn');
  }

  private rush(kind: EnemyKind, n: number, text: string) {
    const g = this.g;
    const base = Math.random() * Math.PI * 2;
    const r = g.viewRadius() + 60;
    for (let i = 0; i < n; i++) {
      const a = base + (Math.random() - 0.5) * 0.9;
      const rr = r + Math.random() * 180;
      g.spawnEnemy(kind, g.px + Math.cos(a) * rr, g.py + Math.sin(a) * rr);
    }
    g.ui()?.banner(text);
    sfx.play('warn');
  }

  /** Endless: one of the scripted swarms, bigger the longer the run goes. */
  private randomEvent(t: number) {
    const k = 1 + (t - RUN_LENGTH) / 300;
    const n = (base: number) => Math.round(base * k);
    const pool: (() => void)[] = [
      () => this.ring('chaser', n(40), '被包围了！'),
      () => this.ring('brute', n(22), '重甲方阵！'),
      () => this.ring('spitter', n(14), '远程火力网！'),
      () => this.rush('bat', n(80), '蜂群来袭！'),
      () => this.rush('bomber', n(28), '自爆虫潮！'),
      () => this.rush('chaser', n(90), '潮水涌来！'),
    ];
    pool[Math.floor(Math.random() * pool.length)]();
  }

  private boss(final: boolean, hpScale = 1) {
    const g = this.g;
    const p = g.spawnPoint();
    g.spawnEnemy('boss', p.x, p.y, { boss: true, final, hpScale });
    const name = final ? '虚空之主' : '猩红守望者';
    const title = this.bossWave > 0 ? `第 ${this.bossWave} 波首领` : final ? '最终首领' : '首领来袭';
    g.ui()?.banner(`${title} · ${name}`, true);
    sfx.play('boss');
    g.shake(400, 0.006);
  }
}
