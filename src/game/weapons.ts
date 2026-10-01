import Phaser from 'phaser';
import { EVOLUTIONS, WEAPON_LEVELS, type WeaponId, type WeaponStats } from './data';
import { COLORS } from './palette';
import { sfx } from './audio';
import { Pool, type Enemy, type Pooled } from './entities';
import { texScale } from './textures';
import type { GameScene } from '../scenes/GameScene';

const DEPTH_PROJ = 20;
const TAU = Math.PI * 2;

export abstract class Weapon {
  level = 1;
  evolved = false;
  protected timer = 0.3;

  constructor(readonly id: WeaponId, protected readonly g: GameScene) {}

  get s(): WeaponStats {
    return this.evolved ? EVOLUTIONS[this.id].stats : WEAPON_LEVELS[this.id][this.level - 1];
  }

  evolve() {
    this.evolved = true;
    this.timer = 0;
    this.onEvolve();
  }

  protected onEvolve() {}

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

  /** Called when the player takes damage (君临剑 strikes back). */
  onHurt() {}

  destroy() {}
}

// ------------------------------------------------------------------ 能量飞弹 / 风暴弹幕

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
  homing: boolean;
  target: Enemy | null;
  retarget: number;
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
      hit: new Set<Enemy>(), homing: false, target: null, retarget: 0,
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
        const gap = this.evolved ? 0.04 : 0.07;
        for (let i = 0; i < n; i++) this.queue.push({ delay: i * gap, target: targets[i % targets.length] });
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
    const turn = 9 * dt;
    for (const b of this.pool.active) {
      if (b.homing) this.steer(b, turn, dt);
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
          g.burst(b.x, b.y, this.evolved ? EVOLUTIONS.bolt.color : COLORS.bolt, 4);
          break;
        }
      }
    }
    this.pool.compact();
  }

  /** Homing: re-pick the closest unhit enemy now and then and turn towards it. */
  private steer(b: Bolt, turn: number, dt: number) {
    b.retarget -= dt;
    if (!b.target || !b.target.alive || b.hit.has(b.target) || b.retarget <= 0) {
      b.retarget = 0.15;
      b.target = null;
      let best = 320 * 320;
      this.tmp.length = 0;
      for (const e of this.g.queryEnemies(b.x, b.y, 320, this.tmp)) {
        if (b.hit.has(e)) continue;
        const d = (e.x - b.x) ** 2 + (e.y - b.y) ** 2;
        if (d < best) {
          best = d;
          b.target = e;
        }
      }
    }
    if (!b.target) return;
    const cur = Math.atan2(b.vy, b.vx);
    const want = Math.atan2(b.target.y - b.y, b.target.x - b.x);
    const a = cur + Phaser.Math.Clamp(Phaser.Math.Angle.Wrap(want - cur), -turn, turn);
    const sp = Math.hypot(b.vx, b.vy);
    b.vx = Math.cos(a) * sp;
    b.vy = Math.sin(a) * sp;
    b.sprite.setRotation(a);
  }

  private fire(t: Enemy) {
    const g = this.g;
    const s = this.s;
    const spread = this.evolved ? 0.5 : 0.12;
    const ang = Math.atan2(t.y - g.py, t.x - g.px) + (Math.random() - 0.5) * spread;
    const b = this.pool.get();
    b.x = g.px;
    b.y = g.py;
    b.vx = Math.cos(ang) * s.speed;
    b.vy = Math.sin(ang) * s.speed;
    b.life = this.evolved ? 1.8 : 1.4;
    b.damage = this.damage();
    b.pierce = s.pierce;
    b.knock = s.knockback;
    b.hit.clear();
    b.homing = this.evolved;
    b.target = t;
    b.retarget = 0.15;
    b.sprite.setTexture(this.evolved ? 'bolt_evo' : 'bolt').setPosition(b.x, b.y).setRotation(ang).setScale(this.area() * texScale());
    sfx.play('shoot');
  }

  destroy() {
    this.pool.releaseAll();
  }
}

// ------------------------------------------------------------------ 环绕刃 / 星环绞杀

class OrbitWeapon extends Weapon {
  private blades: Phaser.GameObjects.Image[] = [];
  private angle = 0;
  private readonly src: number;
  private tmp: Enemy[] = [];

  constructor(g: GameScene) {
    super('orbit', g);
    this.src = g.newSourceId();
  }

  protected onEvolve() {
    // rebuilt next frame with the evolved texture
    for (const b of this.blades) b.destroy();
    this.blades = [];
  }

  update(dt: number) {
    const g = this.g;
    const s = this.s;
    const n = s.count + g.stats.amount;
    const tex = this.evolved ? 'blade_evo' : 'blade';
    while (this.blades.length < n) {
      this.blades.push(g.add.image(g.px, g.py, tex).setDepth(DEPTH_PROJ).setBlendMode(Phaser.BlendModes.ADD));
    }
    while (this.blades.length > n) this.blades.pop()!.destroy();

    const area = this.area();
    this.angle = (this.angle + s.speed * dt) % TAU;
    // evolved ring "breathes" in and out, sweeping a wide band
    const breathe = this.evolved ? 1 + 0.5 * Math.sin(g.elapsed * 2.4) : 1;
    const radius = s.extra * area * breathe;
    const hitR = 14 * area;
    const dmg = this.damage();
    for (let i = 0; i < n; i++) {
      const a = this.angle + (i / n) * TAU;
      const x = g.px + Math.cos(a) * radius;
      const y = g.py + Math.sin(a) * radius;
      this.blades[i].setPosition(x, y).setRotation(a + Math.PI / 2).setScale(area * texScale());
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

// ------------------------------------------------------------------ 脉冲新星 / 生命脉冲

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
    const hits = g.queryEnemies(g.px, g.py, radius, this.tmp);
    for (const e of hits) {
      const dx = e.x - g.px;
      const dy = e.y - g.py;
      const len = Math.hypot(dx, dy) || 1;
      g.damageEnemy(e, dmg, 'nova', dx / len, dy / len, this.s.knockback);
    }
    if (this.evolved && hits.length > 0) g.heal(Math.min(8, 1 + hits.length * 0.25));
    g.addRing(g.px, g.py, radius, this.evolved ? EVOLUTIONS.nova.color : COLORS.nova, 0.35);
    sfx.play('nova');
  }
}

// ------------------------------------------------------------------ 连锁闪电 / 雷霆审判

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
    let last: Enemy = first;
    for (let j = 0; j <= s.pierce && cur; j++) {
      this.hitSet.add(cur);
      pts.push(cur.x, cur.y);
      last = cur;
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
    const color = this.evolved ? EVOLUTIONS.chain.color : COLORS.chain;
    g.addLightning(pts, color);
    if (this.evolved) this.thunderclap(last.x, last.y, dmg * 0.6, color);
  }

  /** Evolved chains end in an explosion at the last target. */
  private thunderclap(x: number, y: number, dmg: number, color: number) {
    const g = this.g;
    const r = 85 * this.area();
    this.tmp.length = 0;
    for (const e of g.queryEnemies(x, y, r, this.tmp)) {
      const dx = e.x - x;
      const dy = e.y - y;
      const len = Math.hypot(dx, dy) || 1;
      g.damageEnemy(e, dmg, 'chain', dx / len, dy / len, 160);
    }
    g.addRing(x, y, r, color, 0.3);
    g.burst(x, y, color, 10);
  }
}

// ------------------------------------------------------------------ 回旋飞盘 / 裂变星盘

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
  /** split fragment from an evolved disc: flies outward once, never returns */
  mini: boolean;
}

class DiscWeapon extends Weapon {
  private pool: Pool<Disc>;
  private tmp: Enemy[] = [];

  constructor(g: GameScene) {
    super('disc', g);
    this.pool = new Pool<Disc>(() => ({
      alive: false,
      sprite: g.add.image(0, 0, 'disc').setDepth(DEPTH_PROJ).setBlendMode(Phaser.BlendModes.ADD),
      x: 0, y: 0, dx: 0, dy: 0, traveled: 0, range: 0, returning: false, src: 0, life: 0, mini: false,
    }));
  }

  private spawn(x: number, y: number, a: number, range: number, mini: boolean) {
    const d = this.pool.get();
    d.x = x;
    d.y = y;
    d.dx = Math.cos(a);
    d.dy = Math.sin(a);
    d.traveled = 0;
    d.range = range;
    d.returning = false;
    d.src = this.g.newSourceId();
    d.life = 6;
    d.mini = mini;
    d.sprite.setTexture(this.evolved ? 'disc_evo' : 'disc').setPosition(x, y);
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
      for (let i = 0; i < n; i++) this.spawn(g.px, g.py, base + (i / n) * TAU, s.extra * this.area(), false);
      sfx.play('disc');
    }

    const area = this.area();
    const dmg = this.damage();
    for (const d of this.pool.active) {
      d.life -= dt;
      if (!d.returning) {
        // ease out towards the far end of the throw
        const k = 1 - d.traveled / d.range;
        const v = s.speed * (d.mini ? 0.9 : 0.35 + 0.65 * k);
        d.x += d.dx * v * dt;
        d.y += d.dy * v * dt;
        d.traveled += v * dt;
        if (d.traveled >= d.range * 0.98) {
          if (d.mini) {
            d.alive = false;
            g.burst(d.x, d.y, EVOLUTIONS.disc.color, 3);
            continue;
          }
          d.returning = true;
          if (this.evolved) {
            const a = Math.atan2(d.dy, d.dx);
            for (const off of [-0.8, 0, 0.8]) this.spawn(d.x, d.y, a + off, 200 * area, true);
          }
        }
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
      const scale = d.mini ? area * 0.6 : area;
      d.sprite.setPosition(d.x, d.y).setScale(scale * texScale()).setRotation(d.sprite.rotation + 14 * dt);
      this.tmp.length = 0;
      for (const e of g.queryEnemies(d.x, d.y, 15 * scale, this.tmp)) {
        if ((e.hitUntil.get(d.src) ?? 0) > g.elapsed) continue;
        e.hitUntil.set(d.src, g.elapsed + 0.35);
        g.damageEnemy(e, d.mini ? dmg * 0.6 : dmg, 'disc', d.dx, d.dy, s.knockback);
      }
    }
    this.pool.compact();
  }

  destroy() {
    this.pool.releaseAll();
  }
}

// ------------------------------------------------------------------ 光束 / 湮灭光束

interface Beam {
  ang: number;
  t: number;
  src: number;
}

class LaserWeapon extends Weapon {
  private beams: Beam[] = [];
  private angle = 0;
  private readonly spinSrc: number;

  constructor(g: GameScene) {
    super('laser', g);
    this.spinSrc = g.newSourceId();
  }

  update(dt: number) {
    const g = this.g;
    const s = this.s;
    const len = s.extra * this.area();
    const color = this.evolved ? EVOLUTIONS.laser.color : COLORS.laser;

    if (this.evolved) {
      // permanent rotating beams; each enemy can be cut once per `cooldown`
      this.angle = (this.angle + s.speed * dt) % TAU;
      const n = s.count + g.stats.amount;
      const width = 12 * this.area();
      for (let i = 0; i < n; i++) {
        const a = this.angle + (i / n) * TAU;
        this.sweep(a, len, width, this.spinSrc, s.cooldown);
        g.addBeam(g.px, g.py, a, len, width, color, 1);
      }
      return;
    }

    this.timer -= dt;
    if (this.timer <= 0) {
      const n = s.count + g.stats.amount;
      const targets = g.nearestEnemies(g.px, g.py, len, n);
      if (targets.length === 0) {
        this.timer = 0.15;
      } else {
        this.timer = this.cooldown();
        for (let i = 0; i < n; i++) {
          const t = targets[i % targets.length];
          // extra beams beyond the number of targets fan out a little
          const spread = i >= targets.length ? (i - targets.length + 1) * 0.35 : 0;
          this.beams.push({ ang: Math.atan2(t.y - g.py, t.x - g.px) + spread, t: s.speed, src: g.newSourceId() });
        }
        sfx.play('laser');
      }
    }

    const width = 10 * this.area();
    for (let i = this.beams.length - 1; i >= 0; i--) {
      const b = this.beams[i];
      b.t -= dt;
      if (b.t <= 0) {
        this.beams.splice(i, 1);
        continue;
      }
      this.sweep(b.ang, len, width, b.src, 999);
      g.addBeam(g.px, g.py, b.ang, len, width, color, b.t / s.speed);
    }
  }

  /** Damage every enemy touching the beam; `interval` is the per-enemy re-hit delay for this source. */
  private sweep(ang: number, len: number, width: number, src: number, interval: number) {
    const g = this.g;
    const cos = Math.cos(ang);
    const sin = Math.sin(ang);
    const dmg = this.damage();
    for (const e of g.enemies) {
      if (!e.alive) continue;
      const dx = e.x - g.px;
      const dy = e.y - g.py;
      const u = dx * cos + dy * sin;
      if (u < 0 || u > len + e.radius) continue;
      if (Math.abs(-dx * sin + dy * cos) > width + e.radius) continue;
      if ((e.hitUntil.get(src) ?? 0) > g.elapsed) continue;
      e.hitUntil.set(src, g.elapsed + interval);
      g.damageEnemy(e, dmg, 'laser', cos, sin, this.s.knockback);
    }
  }
}

// ------------------------------------------------------------------ 冰霜领域 / 绝对零度

class FrostWeapon extends Weapon {
  private aura: Phaser.GameObjects.Image;
  private ring: Phaser.GameObjects.Image;
  private freezeT = 4;
  private tmp: Enemy[] = [];

  constructor(g: GameScene) {
    super('frost', g);
    this.aura = g.add.image(g.px, g.py, 'glow').setDepth(3).setBlendMode(Phaser.BlendModes.ADD).setTint(COLORS.frost).setAlpha(0.22);
    this.ring = g.add.image(g.px, g.py, 'ring').setDepth(3).setBlendMode(Phaser.BlendModes.ADD).setTint(COLORS.frost).setAlpha(0.3);
  }

  protected onEvolve() {
    this.aura.setTint(EVOLUTIONS.frost.color);
    this.ring.setTint(EVOLUTIONS.frost.color);
  }

  update(dt: number) {
    const g = this.g;
    const s = this.s;
    const r = s.extra * this.area();
    const pulse = 1 + Math.sin(g.elapsed * 3) * 0.03;
    const k = texScale();
    this.aura.setPosition(g.px, g.py).setScale((r / 32) * pulse * k);
    this.ring.setPosition(g.px, g.py).setScale((r / 110) * pulse * k).setRotation(g.elapsed * 0.3);

    this.timer -= dt;
    if (this.timer <= 0) {
      this.timer = this.cooldown();
      const dmg = this.damage();
      this.tmp.length = 0;
      for (const e of g.queryEnemies(g.px, g.py, r, this.tmp)) {
        g.damageEnemy(e, dmg, 'frost', 0, 0, 0);
        g.slowEnemy(e, s.speed, this.timer + 0.25);
      }
    }

    if (this.evolved) {
      this.freezeT -= dt;
      if (this.freezeT <= 0) {
        this.freezeT = 4;
        const fr = r * 1.3;
        const dmg = 40 * g.stats.might;
        this.tmp.length = 0;
        for (const e of g.queryEnemies(g.px, g.py, fr, this.tmp)) {
          g.freezeEnemy(e, 1.2);
          g.damageEnemy(e, dmg, 'frost', 0, 0, 0);
        }
        g.addRing(g.px, g.py, fr, EVOLUTIONS.frost.color, 0.5);
        sfx.play('freeze');
      }
    }
  }

  destroy() {
    this.aura.destroy();
    this.ring.destroy();
  }
}

// ------------------------------------------------------------------ 地雷 / 磁暴雷阵

interface Mine extends Pooled {
  x: number;
  y: number;
  arm: number;
  life: number;
  /** >0 while waiting to be set off by a neighbouring blast */
  chainT: number;
}

const MAX_MINES = 16;

class MineWeapon extends Weapon {
  private pool: Pool<Mine>;
  private tmp: Enemy[] = [];

  constructor(g: GameScene) {
    super('mine', g);
    this.pool = new Pool<Mine>(() => ({
      alive: false,
      sprite: g.add.image(0, 0, 'mine').setDepth(6).setBlendMode(Phaser.BlendModes.ADD),
      x: 0, y: 0, arm: 0, life: 0, chainT: -1,
    }));
  }

  update(dt: number) {
    const g = this.g;
    const s = this.s;
    this.timer -= dt;
    if (this.timer <= 0) {
      this.timer = this.cooldown();
      const n = s.count + g.stats.amount;
      for (let i = 0; i < n; i++) {
        if (this.pool.active.length >= MAX_MINES) {
          // recycle the oldest mine instead of piling up forever
          this.pool.active[0].alive = false;
          this.pool.compact();
        }
        const a = Math.random() * TAU;
        const d = i === 0 ? 0 : 40 + Math.random() * 60;
        const m = this.pool.get();
        m.x = g.px + Math.cos(a) * d;
        m.y = g.py + Math.sin(a) * d;
        m.arm = 0.35;
        m.life = 14;
        m.chainT = -1;
        m.sprite.setTexture(this.evolved ? 'mine_evo' : 'mine').setPosition(m.x, m.y).setAlpha(0.5).setScale(this.area() * texScale());
      }
    }

    const pullR = 150 * this.area();
    for (const m of this.pool.active) {
      if (!m.alive) continue;
      m.life -= dt;
      m.arm -= dt;
      if (m.life <= 0) {
        m.alive = false;
        continue;
      }
      if (m.chainT > 0) {
        m.chainT -= dt;
        if (m.chainT <= 0) this.explode(m);
        continue;
      }
      const armed = m.arm <= 0;
      m.sprite.setAlpha(armed ? 0.75 + Math.sin(g.elapsed * 8 + m.x) * 0.25 : 0.4);
      this.tmp.length = 0;
      if (this.evolved && armed) {
        // magnetic mines drag nearby enemies onto themselves
        for (const e of g.queryEnemies(m.x, m.y, pullR, this.tmp)) {
          if (e.boss) continue;
          const dx = m.x - e.x;
          const dy = m.y - e.y;
          const len = Math.hypot(dx, dy) || 1;
          e.x += (dx / len) * 120 * dt;
          e.y += (dy / len) * 120 * dt;
        }
        this.tmp.length = 0;
      }
      if (armed && g.queryEnemies(m.x, m.y, 16, this.tmp).length > 0) this.explode(m);
    }
    this.pool.compact();
  }

  private explode(m: Mine) {
    if (!m.alive) return;
    m.alive = false;
    const g = this.g;
    const r = this.s.extra * this.area();
    const dmg = this.damage();
    this.tmp.length = 0;
    for (const e of g.queryEnemies(m.x, m.y, r, this.tmp)) {
      const dx = e.x - m.x;
      const dy = e.y - m.y;
      const len = Math.hypot(dx, dy) || 1;
      g.damageEnemy(e, dmg, 'mine', dx / len, dy / len, this.s.knockback);
    }
    const color = this.evolved ? EVOLUTIONS.mine.color : COLORS.mine;
    g.addRing(m.x, m.y, r, color, 0.35);
    g.burst(m.x, m.y, color, 14);
    sfx.play('boom');
    if (this.evolved) {
      for (const o of this.pool.active) {
        if (o.alive && o.chainT < 0 && (o.x - m.x) ** 2 + (o.y - m.y) ** 2 < (r * 1.3) ** 2) o.chainT = 0.09;
      }
    }
  }

  destroy() {
    this.pool.releaseAll();
  }
}

// ------------------------------------------------------------------ 火球术 / 炼狱火球

interface Fireball extends Pooled {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
}

/** evolved: burning ground left behind by each blast */
interface Flame extends Pooled {
  x: number;
  y: number;
  r: number;
  life: number;
  tick: number;
  damage: number;
}

class FireballWeapon extends Weapon {
  private pool: Pool<Fireball>;
  private flames: Pool<Flame>;
  private tmp: Enemy[] = [];

  constructor(g: GameScene) {
    super('fireball', g);
    this.pool = new Pool<Fireball>(() => ({
      alive: false,
      sprite: g.add.image(0, 0, 'fireball').setDepth(DEPTH_PROJ).setBlendMode(Phaser.BlendModes.ADD),
      x: 0, y: 0, vx: 0, vy: 0, life: 0,
    }));
    this.flames = new Pool<Flame>(() => ({
      alive: false,
      sprite: g.add.image(0, 0, 'glow').setDepth(3).setBlendMode(Phaser.BlendModes.ADD).setTint(EVOLUTIONS.fireball.color),
      x: 0, y: 0, r: 0, life: 0, tick: 0, damage: 0,
    }));
  }

  update(dt: number) {
    const g = this.g;
    const s = this.s;
    this.timer -= dt;
    if (this.timer <= 0) {
      const n = s.count + g.stats.amount;
      const targets = g.nearestEnemies(g.px, g.py, 600, n);
      if (targets.length === 0) {
        this.timer = 0.1;
      } else {
        this.timer = this.cooldown();
        for (let i = 0; i < n; i++) {
          const t = targets[i % targets.length];
          // doubled-up throws fan out so they don't all land on one enemy
          const spread = i >= targets.length ? (Math.random() - 0.5) * 0.9 : 0;
          this.throw(Math.atan2(t.y - g.py, t.x - g.px) + spread);
        }
        sfx.play('shoot');
      }
    }

    const hitR = 11 * this.area() * (this.evolved ? 1.3 : 1);
    for (const f of this.pool.active) {
      f.x += f.vx * dt;
      f.y += f.vy * dt;
      f.life -= dt;
      f.sprite.setPosition(f.x, f.y);
      this.tmp.length = 0;
      if (f.life <= 0 || g.queryEnemies(f.x, f.y, hitR, this.tmp).length > 0) {
        f.alive = false;
        this.explode(f.x, f.y);
      }
    }
    this.pool.compact();

    for (const fl of this.flames.active) {
      fl.life -= dt;
      if (fl.life <= 0) {
        fl.alive = false;
        continue;
      }
      fl.sprite.setAlpha(Math.min(1, fl.life / 0.5) * (0.4 + Math.random() * 0.12));
      fl.tick -= dt;
      if (fl.tick <= 0) {
        fl.tick = 0.4;
        this.tmp.length = 0;
        for (const e of g.queryEnemies(fl.x, fl.y, fl.r, this.tmp)) g.damageEnemy(e, fl.damage, 'fireball', 0, 0, 0);
      }
    }
    this.flames.compact();
  }

  private throw(ang: number) {
    const g = this.g;
    const f = this.pool.get();
    f.x = g.px;
    f.y = g.py;
    f.vx = Math.cos(ang) * this.s.speed;
    f.vy = Math.sin(ang) * this.s.speed;
    f.life = 1.9;
    f.sprite.setTexture(this.evolved ? 'fireball_evo' : 'fireball').setPosition(f.x, f.y).setRotation(ang)
      .setScale(this.area() * texScale());
  }

  private explode(x: number, y: number) {
    const g = this.g;
    const r = this.s.extra * this.area();
    const dmg = this.damage();
    this.tmp.length = 0;
    for (const e of g.queryEnemies(x, y, r, this.tmp)) {
      const dx = e.x - x;
      const dy = e.y - y;
      const len = Math.hypot(dx, dy) || 1;
      g.damageEnemy(e, dmg, 'fireball', dx / len, dy / len, this.s.knockback);
    }
    const color = this.evolved ? EVOLUTIONS.fireball.color : COLORS.fireball;
    g.addRing(x, y, r, color, 0.3);
    g.burst(x, y, color, 10);
    sfx.play('boom');
    if (this.evolved) {
      const fl = this.flames.get();
      fl.x = x;
      fl.y = y;
      fl.r = r * 0.8;
      fl.life = 2.5;
      fl.tick = 0.2;
      fl.damage = dmg * 0.2;
      fl.sprite.setPosition(x, y).setScale((fl.r / 26) * texScale());
    }
  }

  destroy() {
    this.pool.releaseAll();
    this.flames.releaseAll();
  }
}

// ------------------------------------------------------------------ 陨石 / 天降灾星

interface Strike extends Pooled {
  x: number;
  y: number;
  t: number;
  maxT: number;
  r: number;
  damage: number;
  /** evolved aftershock: no rock, no marker, just a small blast */
  after: boolean;
  marker: Phaser.GameObjects.Image;
}

class MeteorWeapon extends Weapon {
  private pool: Pool<Strike>;
  private tmp: Enemy[] = [];

  constructor(g: GameScene) {
    super('meteor', g);
    this.pool = new Pool<Strike>(() => ({
      alive: false,
      sprite: g.add.image(0, 0, 'meteor_rock').setDepth(DEPTH_PROJ + 1).setBlendMode(Phaser.BlendModes.ADD),
      marker: g.add.image(0, 0, 'ring').setDepth(4).setBlendMode(Phaser.BlendModes.ADD),
      x: 0, y: 0, t: 0, maxT: 1, r: 0, damage: 0, after: false,
    }));
  }

  update(dt: number) {
    const g = this.g;
    const s = this.s;
    this.timer -= dt;
    if (this.timer <= 0) {
      const n = s.count + g.stats.amount;
      // random picks among the closest few: spread out, but still where the threat (and the gems) are
      const pool = g.nearestEnemies(g.px, g.py, 450, Math.max(4, n * 3));
      if (pool.length === 0) {
        this.timer = 0.2;
      } else {
        this.timer = this.cooldown();
        for (let i = 0; i < n; i++) {
          // random targets spread the shower over the crowd; staggered so they rain rather than land at once
          const e = pool.length ? pool.splice(Math.floor(Math.random() * pool.length), 1)[0] : null;
          const a = Math.random() * TAU;
          const x = e ? e.x : g.px + Math.cos(a) * 200;
          const y = e ? e.y : g.py + Math.sin(a) * 200;
          this.drop(x, y, s.speed + i * 0.12, s.extra * this.area(), this.damage(), false);
        }
      }
    }

    const color = this.evolved ? EVOLUTIONS.meteor.color : COLORS.meteor;
    const k0 = texScale();
    for (const m of this.pool.active) {
      if (!m.alive) continue;
      m.t -= dt;
      if (m.t <= 0) {
        m.alive = false;
        m.marker.setVisible(false);
        this.impact(m, color);
        continue;
      }
      if (m.after) continue;
      const k = 1 - m.t / m.maxT;
      // falls in from the upper left, growing as it "approaches"
      m.sprite.setPosition(m.x - 180 * (1 - k), m.y - 320 * (1 - k)).setScale((0.8 + 0.6 * k) * this.area() * k0).setRotation(g.elapsed * 6);
      m.marker.setPosition(m.x, m.y).setScale((m.r / 110) * k0).setAlpha(0.15 + 0.45 * k);
    }
    this.pool.compact();
  }

  private drop(x: number, y: number, fall: number, r: number, damage: number, after: boolean) {
    const m = this.pool.get();
    m.x = x;
    m.y = y;
    m.t = m.maxT = fall;
    m.r = r;
    m.damage = damage;
    m.after = after;
    m.sprite.setVisible(!after).setTexture(this.evolved ? 'meteor_rock_evo' : 'meteor_rock').setPosition(x - 180, y - 320);
    m.marker.setVisible(!after).setTint(this.evolved ? EVOLUTIONS.meteor.color : COLORS.meteor).setPosition(x, y)
      .setScale((r / 110) * texScale()).setAlpha(0.15);
  }

  private impact(m: Strike, color: number) {
    const g = this.g;
    this.tmp.length = 0;
    for (const e of g.queryEnemies(m.x, m.y, m.r, this.tmp)) {
      const dx = e.x - m.x;
      const dy = e.y - m.y;
      const len = Math.hypot(dx, dy) || 1;
      g.damageEnemy(e, m.damage, 'meteor', dx / len, dy / len, m.after ? 120 : this.s.knockback);
    }
    g.addRing(m.x, m.y, m.r, color, m.after ? 0.25 : 0.45);
    g.burst(m.x, m.y, color, m.after ? 6 : 18);
    sfx.play('boom');
    if (m.after) return;
    g.shake(90, 0.003);
    if (this.evolved) {
      const off = Math.random() * TAU;
      for (let i = 0; i < 5; i++) {
        const a = off + (i / 5) * TAU;
        this.drop(m.x + Math.cos(a) * m.r, m.y + Math.sin(a) * m.r, 0.18, m.r * 0.5, m.damage * 0.35, true);
      }
    }
  }

  destroy() {
    for (const m of this.pool.active) m.marker.setVisible(false);
    this.pool.releaseAll();
  }
}

// ------------------------------------------------------------------ 旋风 / 风暴之眼

interface Vortex extends Pooled {
  x: number;
  y: number;
  heading: number;
  life: number;
  src: number;
}

class CycloneWeapon extends Weapon {
  private pool: Pool<Vortex>;
  private angle = 0;
  private tmp: Enemy[] = [];

  constructor(g: GameScene) {
    super('cyclone', g);
    this.pool = new Pool<Vortex>(() => ({
      alive: false,
      sprite: g.add.image(0, 0, 'cyclone').setDepth(DEPTH_PROJ).setBlendMode(Phaser.BlendModes.ADD),
      x: 0, y: 0, heading: 0, life: 0, src: 0,
    }));
  }

  protected onEvolve() {
    // wandering vortices give way to the permanent pair
    this.pool.releaseAll();
  }

  update(dt: number) {
    const g = this.g;
    const s = this.s;
    const r = s.extra * this.area();

    if (this.evolved) {
      const n = s.count + g.stats.amount;
      while (this.pool.active.length < n) this.spawn(0, Infinity);
      while (this.pool.active.length > n) {
        this.pool.active[this.pool.active.length - 1].alive = false;
        this.pool.compact();
      }
      this.angle = (this.angle + s.speed * dt) % TAU;
      const orbit = 170 * this.area();
      this.pool.active.forEach((v, i) => {
        const a = this.angle + (i / n) * TAU;
        v.x = g.px + Math.cos(a) * orbit;
        v.y = g.py + Math.sin(a) * orbit;
      });
    } else {
      this.timer -= dt;
      if (this.timer <= 0) {
        this.timer = this.cooldown();
        const n = s.count + g.stats.amount;
        const t = g.nearestEnemies(g.px, g.py, 500, 1)[0];
        const base = t ? Math.atan2(t.y - g.py, t.x - g.px) : Math.random() * TAU;
        for (let i = 0; i < n; i++) this.spawn(base + (i / n) * TAU, s.speed);
      }
      for (const v of this.pool.active) {
        // meander: the heading drifts a little each frame
        v.heading += (Math.random() - 0.5) * 3 * dt;
        v.x += Math.cos(v.heading) * 95 * dt;
        v.y += Math.sin(v.heading) * 95 * dt;
        v.life -= dt;
        if (v.life <= 0) v.alive = false;
      }
    }

    const dmg = this.damage();
    const interval = this.evolved ? s.cooldown : 0.3;
    const k = texScale();
    for (const v of this.pool.active) {
      if (!v.alive) continue;
      const fade = this.evolved ? 1 : Math.min(1, v.life / 0.4);
      v.sprite.setPosition(v.x, v.y).setRotation(v.sprite.rotation - 12 * dt).setScale((r / 21) * k).setAlpha(0.85 * fade);
      this.tmp.length = 0;
      for (const e of g.queryEnemies(v.x, v.y, r, this.tmp)) {
        // drag towards the eye (bosses and anchored enemies resist)
        const dx = v.x - e.x;
        const dy = v.y - e.y;
        const len = Math.hypot(dx, dy) || 1;
        const pull = (1 - e.def.knockResist) * (e.elite || e.boss ? 0.3 : 1) * 140 * dt;
        if (len > 4) {
          e.x += (dx / len) * Math.min(pull, len);
          e.y += (dy / len) * Math.min(pull, len);
        }
        if ((e.hitUntil.get(v.src) ?? 0) > g.elapsed) continue;
        e.hitUntil.set(v.src, g.elapsed + interval);
        g.damageEnemy(e, dmg, 'cyclone', 0, 0, 0);
      }
    }
    this.pool.compact();
  }

  private spawn(heading: number, life: number) {
    const g = this.g;
    const v = this.pool.get();
    v.x = g.px;
    v.y = g.py;
    v.heading = heading;
    v.life = life;
    v.src = g.newSourceId();
    v.sprite.setTexture(this.evolved ? 'cyclone_evo' : 'cyclone').setPosition(v.x, v.y).setAlpha(0.85);
  }

  destroy() {
    this.pool.releaseAll();
  }
}

// ------------------------------------------------------------------ 灵体 / 灵魂军团

interface Wisp {
  sprite: Phaser.GameObjects.Image;
  x: number;
  y: number;
  /** 0 hovering beside the player, 1 dashing at a target, 2 flying back */
  state: number;
  target: Enemy | null;
  cd: number;
  dashT: number;
}

class SpiritWeapon extends Weapon {
  private wisps: Wisp[] = [];
  private angle = 0;
  private tmp: Enemy[] = [];

  constructor(g: GameScene) {
    super('spirit', g);
  }

  protected onEvolve() {
    for (const w of this.wisps) w.sprite.setTexture('wisp_evo');
  }

  update(dt: number) {
    const g = this.g;
    const s = this.s;
    const n = s.count + g.stats.amount;
    while (this.wisps.length < n) {
      this.wisps.push({
        sprite: g.add.image(g.px, g.py, this.evolved ? 'wisp_evo' : 'wisp').setDepth(DEPTH_PROJ).setBlendMode(Phaser.BlendModes.ADD),
        x: g.px, y: g.py, state: 0, target: null, cd: 0.3 + this.wisps.length * 0.15, dashT: 0,
      });
    }
    while (this.wisps.length > n) this.wisps.pop()!.sprite.destroy();

    this.angle = (this.angle + 1.6 * dt) % TAU;
    const scale = this.area() * texScale();
    const range = s.extra * this.area();
    this.wisps.forEach((w, i) => {
      const slotA = this.angle + (i / n) * TAU;
      const sx = g.px + Math.cos(slotA) * 46;
      const sy = g.py + Math.sin(slotA) * 46;
      let dirX = 0;
      let dirY = 0;
      if (w.state === 0) {
        // hover: ease into the orbit slot, facing along the orbit
        const k = Math.min(1, dt * 8);
        w.x += (sx - w.x) * k;
        w.y += (sy - w.y) * k;
        dirX = -Math.sin(slotA);
        dirY = Math.cos(slotA);
        w.cd -= dt;
        if (w.cd <= 0) {
          // pick among the few closest so the wisps spread out instead of all hitting one enemy
          const near = g.nearestEnemies(g.px, g.py, range, 3);
          if (near.length) {
            w.target = near[i % near.length];
            w.state = 1;
            w.dashT = 1.2;
          } else {
            w.cd = 0.2;
          }
        }
      } else if (w.state === 1) {
        const t = w.target;
        w.dashT -= dt;
        if (!t || !t.alive || w.dashT <= 0) {
          w.state = 2;
        } else {
          dirX = t.x - w.x;
          dirY = t.y - w.y;
          const d = Math.hypot(dirX, dirY) || 1;
          const step = s.speed * dt;
          if (d <= t.radius + 8 + step) {
            this.hit(w, t);
            w.state = 2;
          } else {
            w.x += (dirX / d) * step;
            w.y += (dirY / d) * step;
          }
        }
      } else {
        dirX = sx - w.x;
        dirY = sy - w.y;
        const d = Math.hypot(dirX, dirY) || 1;
        const step = s.speed * 0.8 * dt;
        if (d <= step + 6) {
          w.state = 0;
          w.cd = this.cooldown();
        } else {
          w.x += (dirX / d) * step;
          w.y += (dirY / d) * step;
        }
      }
      w.sprite.setPosition(w.x, w.y).setScale(scale).setRotation(Math.atan2(dirY, dirX));
    });
  }

  private hit(w: Wisp, t: Enemy) {
    const g = this.g;
    const dmg = this.damage();
    const len = Math.hypot(t.x - w.x, t.y - w.y) || 1;
    g.damageEnemy(t, dmg, 'spirit', (t.x - w.x) / len, (t.y - w.y) / len, this.s.knockback);
    const color = this.evolved ? EVOLUTIONS.spirit.color : COLORS.spirit;
    g.burst(t.x, t.y, color, 4);
    if (!this.evolved) return;
    // evolved: every hit bursts
    const r = 55 * this.area();
    this.tmp.length = 0;
    for (const e of g.queryEnemies(t.x, t.y, r, this.tmp)) {
      if (e === t) continue;
      const dx = e.x - t.x;
      const dy = e.y - t.y;
      const l = Math.hypot(dx, dy) || 1;
      g.damageEnemy(e, dmg * 0.6, 'spirit', dx / l, dy / l, 80);
    }
    g.addRing(t.x, t.y, r, color, 0.25);
    sfx.play('zap');
  }

  destroy() {
    for (const w of this.wisps) w.sprite.destroy();
    this.wisps = [];
  }
}

// ------------------------------------------------------------------ 君临剑 / 唯一解

interface SlashFx {
  img: Phaser.GameObjects.Image;
  life: number;
  max: number;
  scale: number;
}

const SLASH_ARC = (65 * Math.PI) / 180;
/** radius the slash textures are drawn at; sprites scale from it to the real reach */
const SLASH_TEX_R = 50;

class SwordWeapon extends Weapon {
  private fx: SlashFx[] = [];
  private counterCd = 0;
  private pendingCounter = -1;
  private tmp: Enemy[] = [];

  constructor(g: GameScene) {
    super('sword', g);
  }

  private reach() {
    return this.s.extra * this.area();
  }

  update(dt: number) {
    const g = this.g;
    this.counterCd -= dt;
    if (this.pendingCounter >= 0) {
      this.pendingCounter -= dt;
      if (this.pendingCounter < 0) this.swing(true, 1.5);
    }
    this.timer -= dt;
    if (this.timer <= 0) {
      // only swing when something is in reach, like the nova
      this.tmp.length = 0;
      if (g.queryEnemies(g.px, g.py, this.reach() + 10, this.tmp).length === 0) {
        this.timer = 0.12;
      } else {
        this.swing(this.evolved, 1);
        this.timer = this.cooldown();
      }
    }
    for (const f of this.fx) {
      if (f.life <= 0) continue;
      f.life -= dt;
      const k = Math.max(0, f.life / f.max);
      f.img.setPosition(g.px, g.py).setAlpha(k).setScale(f.scale * (1.08 - 0.08 * k));
      if (f.life <= 0) f.img.setVisible(false);
    }
  }

  /** Arcs towards the facing direction (more with 多重), or a full circle when `full`. */
  private swing(full: boolean, mult: number) {
    const g = this.g;
    const s = this.s;
    const reach = this.reach();
    const face = Math.atan2(g.faceY, g.faceX);
    const n = full ? 3 : s.count + g.stats.amount;
    const dmg = this.damage() * mult;
    this.tmp.length = 0;
    for (const e of g.queryEnemies(g.px, g.py, reach, this.tmp)) {
      const dx = e.x - g.px;
      const dy = e.y - g.py;
      const a = Math.atan2(dy, dx);
      let inArc = full;
      for (let i = 0; i < n && !inArc; i++) {
        inArc = Math.abs(Phaser.Math.Angle.Wrap(a - (face + (i / n) * TAU))) <= SLASH_ARC;
      }
      if (!inArc) continue;
      const len = Math.hypot(dx, dy) || 1;
      g.damageEnemy(e, dmg, 'sword', dx / len, dy / len, s.knockback);
      // the evolved blade pins what it cuts for a moment
      if (this.evolved && e.alive) g.freezeEnemy(e, 0.3);
    }
    const tex = this.evolved ? 'slash_evo' : 'slash';
    for (let i = 0; i < n; i++) this.spawnFx(tex, face + (i / n) * TAU, reach);
    if (full) g.addRing(g.px, g.py, reach, this.evolved ? EVOLUTIONS.sword.color : COLORS.sword, 0.3);
    sfx.play('disc');
  }

  private spawnFx(tex: string, ang: number, reach: number) {
    let f = this.fx.find((x) => x.life <= 0);
    if (!f) {
      f = { img: this.g.add.image(0, 0, tex).setDepth(DEPTH_PROJ + 2).setBlendMode(Phaser.BlendModes.ADD), life: 0, max: 0.18, scale: 1 };
      this.fx.push(f);
    }
    f.life = f.max;
    f.scale = (reach / SLASH_TEX_R) * texScale();
    f.img.setTexture(tex).setVisible(true).setRotation(ang).setPosition(this.g.px, this.g.py).setScale(f.scale).setAlpha(1);
  }

  /** Lv5 and evolved: getting hit answers with a full-circle slash (the evolved blade twice). */
  onHurt() {
    if (this.s.speed <= 0 || this.counterCd > 0) return;
    this.counterCd = 0.8;
    this.swing(true, 1.5);
    if (this.evolved) this.pendingCounter = 0.25;
  }

  destroy() {
    for (const f of this.fx) f.img.destroy();
    this.fx = [];
  }
}

export function createWeapon(id: WeaponId, g: GameScene): Weapon {
  switch (id) {
    case 'bolt': return new BoltWeapon(g);
    case 'orbit': return new OrbitWeapon(g);
    case 'nova': return new NovaWeapon(g);
    case 'chain': return new ChainWeapon(g);
    case 'disc': return new DiscWeapon(g);
    case 'laser': return new LaserWeapon(g);
    case 'frost': return new FrostWeapon(g);
    case 'mine': return new MineWeapon(g);
    case 'fireball': return new FireballWeapon(g);
    case 'meteor': return new MeteorWeapon(g);
    case 'cyclone': return new CycloneWeapon(g);
    case 'spirit': return new SpiritWeapon(g);
    case 'sword': return new SwordWeapon(g);
  }
}
