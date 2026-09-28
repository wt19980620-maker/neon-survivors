import Phaser from 'phaser';
import { WEAPON_LEVELS, type WeaponId, type WeaponStats } from './data';
import { COLORS } from './palette';
import { sfx } from './audio';
import { Pool, type Enemy, type Pooled } from './entities';
import type { GameScene } from '../scenes/GameScene';

const DEPTH_PROJ = 20;
const TAU = Math.PI * 2;

export abstract class Weapon {
  level = 1;
  protected timer = 0.3;

  constructor(readonly id: WeaponId, protected readonly g: GameScene) {}

  get s(): WeaponStats {
    return WEAPON_LEVELS[this.id][this.level - 1];
  }

  protected cooldown() {
    return this.s.cooldown * this.g.stats.haste;
  }

  protected damage() {
    return this.s.damage * this.g.stats.might;
  }

  protected area() {
    return this.s.area * this.g.stats.area;
  }

  abstract update(dt: number): void;

  destroy() {}
}

// ------------------------------------------------------------------ 能量飞弹

interface Bolt extends Pooled {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  damage: number;
  pierce: number;
  knock: number;
  hit: Set<Enemy>;
}

class BoltWeapon extends Weapon {
  private pool: Pool<Bolt>;
  private queue: { delay: number; target: Enemy }[] = [];
  private tmp: Enemy[] = [];

  constructor(g: GameScene) {
    super('bolt', g);
    this.pool = new Pool<Bolt>(() => ({
      alive: false,
      sprite: g.add.image(0, 0, 'bolt').setDepth(DEPTH_PROJ).setBlendMode(Phaser.BlendModes.ADD),
      x: 0, y: 0, vx: 0, vy: 0, life: 0, damage: 0, pierce: 0, knock: 0,
      hit: new Set<Enemy>(),
    }));
  }

  update(dt: number) {
    const g = this.g;
    this.timer -= dt;
    if (this.timer <= 0) {
      const n = this.s.count + g.stats.amount;
      const targets = g.nearestEnemies(g.px, g.py, 700, n);
      if (targets.length === 0) {
        this.timer = 0.1;
      } else {
        for (let i = 0; i < n; i++) this.queue.push({ delay: i * 0.07, target: targets[i % targets.length] });
        this.timer = this.cooldown();
      }
    }

    for (let i = this.queue.length - 1; i >= 0; i--) {
      const q = this.queue[i];
      q.delay -= dt;
      if (q.delay > 0) continue;
      this.queue.splice(i, 1);
      let t: Enemy | undefined = q.target;
      if (!t.alive) t = g.nearestEnemies(g.px, g.py, 700, 1)[0];
      if (t) this.fire(t);
    }

    const r = 7 * this.area();
    for (const b of this.pool.active) {
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.life -= dt;
      b.sprite.setPosition(b.x, b.y);
      if (b.life <= 0) {
        b.alive = false;
        continue;
      }
      this.tmp.length = 0;
      for (const e of g.queryEnemies(b.x, b.y, r, this.tmp)) {
        if (b.hit.has(e)) continue;
        b.hit.add(e);
        const len = Math.hypot(b.vx, b.vy) || 1;
        g.damageEnemy(e, b.damage, 'bolt', b.vx / len, b.vy / len, b.knock);
        if (--b.pierce <= 0) {
          b.alive = false;
          g.burst(b.x, b.y, COLORS.bolt, 4);
          break;
        }
      }
    }
    this.pool.compact();
  }

  private fire(t: Enemy) {
    const g = this.g;
    const s = this.s;
    const ang = Math.atan2(t.y - g.py, t.x - g.px) + (Math.random() - 0.5) * 0.12;
    const b = this.pool.get();
    b.x = g.px;
    b.y = g.py;
    b.vx = Math.cos(ang) * s.speed;
    b.vy = Math.sin(ang) * s.speed;
    b.life = 1.4;
    b.damage = this.damage();
    b.pierce = s.pierce;
    b.knock = s.knockback;
    b.hit.clear();
    b.sprite.setPosition(b.x, b.y).setRotation(ang).setScale(this.area());
    sfx.play('shoot');
  }

  destroy() {
    this.pool.releaseAll();
  }
}

// ------------------------------------------------------------------ 环绕刃

class OrbitWeapon extends Weapon {
  private blades: Phaser.GameObjects.Image[] = [];
  private angle = 0;
  private readonly src: number;
  private tmp: Enemy[] = [];

  constructor(g: GameScene) {
    super('orbit', g);
    this.src = g.newSourceId();
  }

  update(dt: number) {
    const g = this.g;
    const s = this.s;
    const n = s.count + g.stats.amount;
    while (this.blades.length < n) {
      this.blades.push(g.add.image(g.px, g.py, 'blade').setDepth(DEPTH_PROJ).setBlendMode(Phaser.BlendModes.ADD));
    }
    while (this.blades.length > n) this.blades.pop()!.destroy();

    const area = this.area();
    this.angle = (this.angle + s.speed * dt) % TAU;
    const radius = s.extra * area;
    const hitR = 14 * area;
    const dmg = this.damage();
    for (let i = 0; i < n; i++) {
      const a = this.angle + (i / n) * TAU;
      const x = g.px + Math.cos(a) * radius;
      const y = g.py + Math.sin(a) * radius;
      this.blades[i].setPosition(x, y).setRotation(a + Math.PI / 2).setScale(area);
      this.tmp.length = 0;
      for (const e of g.queryEnemies(x, y, hitR, this.tmp)) {
        if ((e.hitUntil.get(this.src) ?? 0) > g.elapsed) continue;
        e.hitUntil.set(this.src, g.elapsed + s.cooldown);
        const dx = e.x - g.px;
        const dy = e.y - g.py;
        const len = Math.hypot(dx, dy) || 1;
        g.damageEnemy(e, dmg, 'orbit', dx / len, dy / len, s.knockback);
      }
    }
  }

  destroy() {
    for (const b of this.blades) b.destroy();
    this.blades = [];
  }
}

// ------------------------------------------------------------------ 脉冲新星

class NovaWeapon extends Weapon {
  private pending: number[] = [];
  private tmp: Enemy[] = [];

  constructor(g: GameScene) {
    super('nova', g);
  }

  update(dt: number) {
    const g = this.g;
    const radius = this.s.extra * this.area();
    this.timer -= dt;
    if (this.timer <= 0) {
      this.tmp.length = 0;
      if (g.queryEnemies(g.px, g.py, radius * 1.1, this.tmp).length === 0) {
        this.timer = 0.15;
      } else {
        for (let i = 0; i < this.s.count; i++) this.pending.push(i * 0.3);
        this.timer = this.cooldown();
      }
    }
    for (let i = this.pending.length - 1; i >= 0; i--) {
      this.pending[i] -= dt;
      if (this.pending[i] <= 0) {
        this.pending.splice(i, 1);
        this.pulse(radius);
      }
    }
  }

  private pulse(radius: number) {
    const g = this.g;
    const dmg = this.damage();
    this.tmp.length = 0;
    for (const e of g.queryEnemies(g.px, g.py, radius, this.tmp)) {
      const dx = e.x - g.px;
      const dy = e.y - g.py;
      const len = Math.hypot(dx, dy) || 1;
      g.damageEnemy(e, dmg, 'nova', dx / len, dy / len, this.s.knockback);
    }
    g.addRing(g.px, g.py, radius, COLORS.nova, 0.35);
    sfx.play('nova');
  }
}

// ------------------------------------------------------------------ 连锁闪电

class ChainWeapon extends Weapon {
  private tmp: Enemy[] = [];
  private hitSet = new Set<Enemy>();

  constructor(g: GameScene) {
    super('chain', g);
  }

  update(dt: number) {
    const g = this.g;
    this.timer -= dt;
    if (this.timer > 0) return;
    this.tmp.length = 0;
    const candidates = g.queryEnemies(g.px, g.py, 420, this.tmp);
    if (candidates.length === 0) {
      this.timer = 0.15;
      return;
    }
    this.timer = this.cooldown();
    const strikes = this.s.count + g.stats.amount;
    const starts = candidates.slice();
    for (let i = 0; i < strikes && starts.length > 0; i++) {
      const idx = Math.floor(Math.random() * starts.length);
      const first = starts[idx];
      starts.splice(idx, 1);
      this.strike(first);
    }
    sfx.play('zap');
  }

  private strike(first: Enemy) {
    const g = this.g;
    const s = this.s;
    const dmg = this.damage();
    const range = s.extra * this.area();
    this.hitSet.clear();
    const pts: number[] = [g.px, g.py - 6];
    let cur: Enemy | undefined = first;
    for (let j = 0; j <= s.pierce && cur; j++) {
      this.hitSet.add(cur);
      pts.push(cur.x, cur.y);
      g.damageEnemy(cur, dmg, 'chain', 0, 0, s.knockback);
      const from: Enemy = cur;
      cur = undefined;
      let best = range * range;
      this.tmp.length = 0;
      for (const e of g.queryEnemies(from.x, from.y, range, this.tmp)) {
        if (this.hitSet.has(e) || !e.alive) continue;
        const d = (e.x - from.x) ** 2 + (e.y - from.y) ** 2;
        if (d < best) {
          best = d;
          cur = e;
        }
      }
    }
    g.addLightning(pts, COLORS.chain);
  }
}

// ------------------------------------------------------------------ 回旋飞盘

interface Disc extends Pooled {
  x: number;
  y: number;
  dx: number;
  dy: number;
  traveled: number;
  range: number;
  returning: boolean;
  src: number;
  life: number;
}

class DiscWeapon extends Weapon {
  private pool: Pool<Disc>;
  private tmp: Enemy[] = [];

  constructor(g: GameScene) {
    super('disc', g);
    this.pool = new Pool<Disc>(() => ({
      alive: false,
      sprite: g.add.image(0, 0, 'disc').setDepth(DEPTH_PROJ).setBlendMode(Phaser.BlendModes.ADD),
      x: 0, y: 0, dx: 0, dy: 0, traveled: 0, range: 0, returning: false, src: 0, life: 0,
    }));
  }

  update(dt: number) {
    const g = this.g;
    const s = this.s;
    this.timer -= dt;
    if (this.timer <= 0) {
      this.timer = this.cooldown();
      const t = g.nearestEnemies(g.px, g.py, 600, 1)[0];
      const base = t ? Math.atan2(t.y - g.py, t.x - g.px) : Math.atan2(g.faceY, g.faceX);
      const n = s.count + g.stats.amount;
      for (let i = 0; i < n; i++) {
        const a = base + (i / n) * TAU;
        const d = this.pool.get();
        d.x = g.px;
        d.y = g.py;
        d.dx = Math.cos(a);
        d.dy = Math.sin(a);
        d.traveled = 0;
        d.range = s.extra * this.area();
        d.returning = false;
        d.src = g.newSourceId();
        d.life = 6;
        d.sprite.setPosition(d.x, d.y);
      }
      sfx.play('disc');
    }

    const area = this.area();
    const hitR = 15 * area;
    const dmg = this.damage();
    for (const d of this.pool.active) {
      d.life -= dt;
      if (!d.returning) {
        // ease out towards the far end of the throw
        const k = 1 - d.traveled / d.range;
        const v = s.speed * (0.35 + 0.65 * k);
        d.x += d.dx * v * dt;
        d.y += d.dy * v * dt;
        d.traveled += v * dt;
        if (d.traveled >= d.range * 0.98) d.returning = true;
      } else {
        const dx = g.px - d.x;
        const dy = g.py - d.y;
        const len = Math.hypot(dx, dy) || 1;
        if (len < 22 || d.life <= 0) {
          d.alive = false;
          continue;
        }
        const v = s.speed * 1.3;
        d.x += (dx / len) * v * dt;
        d.y += (dy / len) * v * dt;
        d.dx = dx / len;
        d.dy = dy / len;
      }
      d.sprite.setPosition(d.x, d.y).setScale(area).setRotation(d.sprite.rotation + 14 * dt);
      this.tmp.length = 0;
      for (const e of g.queryEnemies(d.x, d.y, hitR, this.tmp)) {
        if ((e.hitUntil.get(d.src) ?? 0) > g.elapsed) continue;
        e.hitUntil.set(d.src, g.elapsed + 0.35);
        g.damageEnemy(e, dmg, 'disc', d.dx, d.dy, s.knockback);
      }
    }
    this.pool.compact();
  }

  destroy() {
    this.pool.releaseAll();
  }
}

export function createWeapon(id: WeaponId, g: GameScene): Weapon {
  switch (id) {
    case 'bolt': return new BoltWeapon(g);
    case 'orbit': return new OrbitWeapon(g);
    case 'nova': return new NovaWeapon(g);
    case 'chain': return new ChainWeapon(g);
    case 'disc': return new DiscWeapon(g);
  }
}
