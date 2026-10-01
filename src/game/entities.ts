import type Phaser from 'phaser';
import type { AffixId, BossId, EnemyDef, EnemyKind } from './data';

export interface Pooled {
  alive: boolean;
  sprite: Phaser.GameObjects.Image;
}

/** Swap-free object pool: mark `alive = false` during the frame, then `compact()` once. */
export class Pool<T extends Pooled> {
  active: T[] = [];
  private free: T[] = [];

  constructor(private readonly create: () => T) {}

  get(): T {
    const o = this.free.pop() ?? this.create();
    o.alive = true;
    o.sprite.setActive(true).setVisible(true);
    this.active.push(o);
    return o;
  }

  compact() {
    const a = this.active;
    let j = 0;
    for (let i = 0; i < a.length; i++) {
      const o = a[i];
      if (o.alive) a[j++] = o;
      else {
        o.sprite.setActive(false).setVisible(false);
        this.free.push(o);
      }
    }
    a.length = j;
  }

  releaseAll() {
    for (const o of this.active) o.alive = false;
    this.compact();
  }
}

export class Enemy implements Pooled {
  alive = false;
  kind: EnemyKind = 'chaser';
  def!: EnemyDef;
  x = 0;
  y = 0;
  /** knockback velocity, decays over time */
  vx = 0;
  vy = 0;
  hp = 1;
  maxHp = 1;
  speed = 0;
  damage = 0;
  radius = 10;
  xp = 1;
  flash = 0;
  elite = false;
  boss = false;
  finalBoss = false;
  bossId: BossId | null = null;
  /** boss loot multiplier: arena bosses start weak, so they drop less */
  reward = 1;
  /** ordinary enemy promoted with a single affix */
  champion = false;
  affixes: AffixId[] = [];
  /** floating affix names, only while the enemy has affixes */
  label: Phaser.GameObjects.Text | null = null;
  shield = 0;
  maxShield = 0;
  /** game time of the last hit taken (shield refill / regen wait for a quiet moment) */
  lastHit = 0;
  /** affix timers: volley / summon share one, blink has its own plus a telegraph */
  affixT = 0;
  blinkT = 0;
  blinkTele = 0;
  blinkX = 0;
  blinkY = 0;
  baseScale = 1;
  /** current movement direction (radians), used by enemies with a limited turn rate */
  heading = 0;
  /** movement slow, 0..1 (1 = frozen), active while slowUntil > game time */
  slow = 0;
  slowUntil = 0;
  freezeUntil = 0;
  /** whether the icy tint is currently applied */
  iced = false;
  /** ranged attack cooldown */
  aiT = 0;
  /** bomber fuse: seconds until it blows, -1 when not lit */
  fuse = -1;
  /** weapon source id -> game time until this enemy can be hit by that source again */
  hitUntil = new Map<number, number>();
  // boss AI
  shotT = 0;
  dashT = 0;
  telegraph = 0;
  dashing = 0;
  dvx = 0;
  dvy = 0;
  shotRot = 0;
  /** boss-specific state machine: phase counter, timer, beam angle / spin / count */
  phase = 0;
  specState = 0;
  specT = 0;
  spiralRot = 0;
  beamAng = 0;
  beamSpin = 0;
  beamN = 0;

  constructor(public sprite: Phaser.GameObjects.Image) {}
}

export type PickupKind = 'gem' | 'heart' | 'magnet' | 'chest' | 'coin';

export interface Pickup extends Pooled {
  kind: PickupKind;
  x: number;
  y: number;
  value: number;
  attracted: boolean;
  v: number;
  t: number;
}

export interface EnemyBullet extends Pooled {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  damage: number;
}

export interface FxSprite extends Pooled {
  life: number;
  maxLife: number;
  s0: number;
  s1: number;
  a0: number;
}

export interface DamageNumber {
  text: Phaser.GameObjects.Text;
  life: number;
  alive: boolean;
}

/** Uniform hash grid for broad-phase enemy queries. Rebuilt every frame. */
export class SpatialGrid {
  private cells = new Map<number, Enemy[]>();
  private spare: Enemy[][] = [];

  constructor(readonly cell = 64) {}

  private key(cx: number, cy: number) {
    return (cx + 50000) * 100000 + (cy + 50000);
  }

  clear() {
    for (const arr of this.cells.values()) {
      arr.length = 0;
      this.spare.push(arr);
    }
    this.cells.clear();
  }

  insert(e: Enemy) {
    const k = this.key(Math.floor(e.x / this.cell), Math.floor(e.y / this.cell));
    let arr = this.cells.get(k);
    if (!arr) {
      arr = this.spare.pop() ?? [];
      this.cells.set(k, arr);
    }
    arr.push(e);
  }

  /** Enemies whose body overlaps the circle (x, y, r). Appends to `out` and returns it. */
  query(x: number, y: number, r: number, out: Enemy[], pad = 64): Enemy[] {
    const c = this.cell;
    const x0 = Math.floor((x - r - pad) / c);
    const x1 = Math.floor((x + r + pad) / c);
    const y0 = Math.floor((y - r - pad) / c);
    const y1 = Math.floor((y + r + pad) / c);
    for (let cx = x0; cx <= x1; cx++) {
      for (let cy = y0; cy <= y1; cy++) {
        const arr = this.cells.get(this.key(cx, cy));
        if (!arr) continue;
        for (let i = 0; i < arr.length; i++) {
          const e = arr[i];
          if (!e.alive) continue;
          const dx = e.x - x;
          const dy = e.y - y;
          const rr = r + e.radius;
          if (dx * dx + dy * dy <= rr * rr) out.push(e);
        }
      }
    }
    return out;
  }
}
