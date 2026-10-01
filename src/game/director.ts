import type { AffixId, BossId, EnemyKind } from './data';
import {
  ARENA, AFFIX_IDS, AFFIXES, BOSSES, BOSS_IDS, CHAMPION, ENDLESS_BOSS_EVERY, ENDLESS_BOSS_SCALE, ENDLESS_EVENT_EVERY, MID_BOSSES, RUN_LENGTH,
} from './data';
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
  private lastBoss: BossId = 'void';
  // Boss 竞技场: next queued boss (-1 = none queued), next forced extra, bosses so far
  private arenaNext: number = ARENA.firstBoss;
  private arenaExtra: number = ARENA.firstBoss + ARENA.extraEvery;
  arenaCount = 0;

  constructor(private readonly g: GameScene) {
    this.events = [
      { t: 150, done: false, run: () => this.ring('chaser', 32, '被包围了！') },
      { t: 300, done: false, run: () => this.boss(pick(MID_BOSSES)) },
      { t: 390, done: false, run: () => this.rush('bat', 70, '蜂群来袭！') },
      { t: 340, done: false, run: () => this.ring('spitter', 14, '远程火力网！') },
      { t: 450, done: false, run: () => this.ring('brute', 22, '重甲方阵！') },
      { t: 565, done: false, run: () => this.rush('bomber', 26, '自爆虫潮！') },
      { t: 520, done: false, run: () => this.rush('chaser', 80, '潮水涌来！') },
      { t: RUN_LENGTH, done: false, run: () => this.boss('void') },
    ];
  }

  /** Enemy stat multipliers grow with time so the pressure keeps pace with the build. */
  hpMult(t = this.g.elapsed) {
    const m = t / 60;
    const curve = (x: number) => 1 + x * 0.3 + x * x * 0.035;
    // past the regular run length (endless only) the full quadratic would outrun any build;
    // a gentler curve lets limit breaks keep up for a while, then pulls ahead again
    const k = m <= 10 ? curve(m) : curve(10) + (m - 10) * 0.9 + (m - 10) ** 2 * 0.03;
    return k * this.g.mapDef.hpMult;
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

    const arena = !!g.mapDef.bossRush;
    for (const ev of this.events) {
      if (!ev.done && t >= ev.t) {
        ev.done = true;
        // the arena keeps its own boss stream; only the final boss (the standard-mode goal) stays scripted
        if (!arena || ev.t === RUN_LENGTH) ev.run();
      }
    }
    if (arena) this.arena(t);

    if (g.mode === 'endless' && t >= RUN_LENGTH && !arena) {
      if (t >= this.nextBoss) {
        this.nextBoss += ENDLESS_BOSS_EVERY;
        this.bossWave++;
        // any boss but the previous one, each wave tougher than the last
        this.boss(pick(BOSS_IDS.filter((b) => b !== this.lastBoss)), 1 + ENDLESS_BOSS_SCALE * this.bossWave);
      }
      if (t >= this.nextEvent) {
        this.nextEvent += ENDLESS_EVENT_EVERY;
        this.randomEvent(t);
      }
    }

    if (t >= this.nextElite) {
      this.nextElite += 75;
      const p = g.spawnPoint();
      // later elites come in more shapes and wear more affixes
      const kind: EnemyKind = t < 240 ? 'brute' : pick(['brute', 'brute', 'splitter', 'spitter']);
      const n = t < 300 ? 1 : t < RUN_LENGTH ? 2 : 3;
      g.spawnEnemy(kind, p.x, p.y, { elite: true, affixes: rollAffixes(n, false) });
    }

    const m = t / 60;
    const rate = (2 + m * 2.5 + m * m * 0.15) * (g.bossAlive() ? 0.6 : 1) * (arena ? ARENA.spawnMult : 1);
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
      g.spawnEnemy(kind, p.x, p.y, this.championRoll(t, kind) ? { affixes: rollAffixes(1, true) } : {});
    }
  }

  /** From 3:00 on, a growing share of ordinary enemies spawn as single-affix champions. */
  private championRoll(t: number, kind: EnemyKind) {
    if (t < 180 || kind === 'splitling' || kind === 'bomber' || kind === 'bat') return false;
    const chance = Math.min(0.035, 0.008 + ((t - 180) / 60) * 0.004);
    if (Math.random() >= chance) return false;
    let alive = 0;
    for (const e of this.g.affixed) if (e.alive && e.champion) alive++;
    return alive < CHAMPION.maxAlive;
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

  /** Boss 竞技场: the next boss arrives shortly after the last one falls, plus a regular extra. */
  private arena(t: number) {
    const alive = this.g.bosses.filter((b) => b.alive).length;
    if (alive === 0 && this.arenaNext < 0) this.arenaNext = t + ARENA.gap;
    if (this.arenaNext >= 0 && t >= this.arenaNext && alive < ARENA.maxAlive) {
      this.arenaNext = -1;
      this.arenaBoss(t);
    }
    if (t >= this.arenaExtra) {
      this.arenaExtra += ARENA.extraEvery;
      if (alive > 0 && alive < ARENA.maxAlive) this.arenaBoss(t);
    }
  }

  private arenaBoss(t: number) {
    // before the final boss only the mid bosses come (beating the void lord ends a standard run)
    const pool = t < RUN_LENGTH ? MID_BOSSES : BOSS_IDS;
    const id = pick(pool.length > 1 ? pool.filter((b) => b !== this.lastBoss) : pool);
    const m = t / 60;
    // start weak enough for a fresh build, reach full strength around the final boss and keep growing
    const hp = 0.06 + 0.09 * m + 0.01 * m * m;
    this.arenaCount++;
    this.boss(id, hp, Math.min(1.2, 0.45 + 0.045 * m), Math.min(1, hp), `第 ${this.arenaCount} 位挑战者`);
  }

  private boss(id: BossId, hpScale = 1, dmgScale = 1, reward = 1, title?: string) {
    const g = this.g;
    const p = g.spawnPoint();
    g.spawnEnemy('boss', p.x, p.y, { boss: id, hpScale, dmgScale, reward });
    this.lastBoss = id;
    const def = BOSSES[id];
    title ??= this.bossWave > 0 ? `第 ${this.bossWave} 波首领` : id === 'void' ? '最终首领' : '首领来袭';
    g.ui()?.banner(`${title} · ${def.name}`, true, def.color);
    sfx.play('boss');
    g.shake(400, 0.006);
  }
}

function pick<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

/** `n` distinct affixes; champions only draw from the champion-safe ones. */
function rollAffixes(n: number, champion: boolean): AffixId[] {
  const pool = AFFIX_IDS.filter((a) => !champion || AFFIXES[a].champion);
  const out: AffixId[] = [];
  while (out.length < n && pool.length) out.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);
  return out;
}
