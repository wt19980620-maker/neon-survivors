import type Phaser from 'phaser';
import type { MapDef } from './data';
import { texScale } from './textures';

export interface Obstacle {
  x: number;
  y: number;
  r: number;
}

interface Chunk {
  obstacles: Obstacle[];
  sprites: Phaser.GameObjects.Image[];
}

const CHUNK = 480;
/** keep the spawn area open so a run never starts boxed in */
const SAFE_RADIUS = 280;
/** minimum gap between obstacles so crowds (and the player) can always squeeze through */
const MIN_GAP = 70;

/** Small deterministic PRNG so a chunk looks the same every time it's regenerated. */
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Circular terrain generated chunk by chunk around the player. Enemies and the
 * player are pushed out of obstacles; enemy bullets stop on them.
 */
export class ObstacleField {
  private chunks = new Map<number, Chunk>();
  private readonly seed = Math.floor(Math.random() * 1e9);

  constructor(private readonly scene: Phaser.Scene, private readonly map: MapDef) {}

  private key(cx: number, cy: number) {
    return (cx + 5000) * 10000 + (cy + 5000);
  }

  /** Make sure chunks around (x, y) exist and drop the ones far away. */
  update(x: number, y: number, viewRadius: number) {
    const reach = Math.ceil((viewRadius + 200) / CHUNK);
    const ccx = Math.floor(x / CHUNK);
    const ccy = Math.floor(y / CHUNK);
    for (let cx = ccx - reach; cx <= ccx + reach; cx++) {
      for (let cy = ccy - reach; cy <= ccy + reach; cy++) {
        const k = this.key(cx, cy);
        if (!this.chunks.has(k)) this.chunks.set(k, this.generate(cx, cy));
      }
    }
    for (const [k, c] of this.chunks) {
      const cx = Math.floor(k / 10000) - 5000;
      const cy = (k % 10000) - 5000;
      if (Math.abs(cx - ccx) > reach + 1 || Math.abs(cy - ccy) > reach + 1) {
        for (const s of c.sprites) s.destroy();
        this.chunks.delete(k);
      }
    }
  }

  private generate(cx: number, cy: number): Chunk {
    const rand = rng(this.seed ^ Math.imul(cx, 73856093) ^ Math.imul(cy, 19349663));
    const m = this.map;
    const count = Math.floor(m.density + rand());
    const obstacles: Obstacle[] = [];
    for (let i = 0; i < count * 3 && obstacles.length < count; i++) {
      const r = m.radius[0] + rand() * (m.radius[1] - m.radius[0]);
      const x = cx * CHUNK + r + rand() * (CHUNK - 2 * r);
      const y = cy * CHUNK + r + rand() * (CHUNK - 2 * r);
      if (Math.hypot(x, y) < SAFE_RADIUS + r) continue;
      if (obstacles.some((o) => Math.hypot(o.x - x, o.y - y) < o.r + r + MIN_GAP)) continue;
      obstacles.push({ x, y, r });
    }
    const k = texScale();
    const sprites = obstacles.map((o) =>
      this.scene.add.image(o.x, o.y, `ob_${m.id}`).setDepth(4).setRotation(rand() * Math.PI * 2).setScale((o.r / 48) * k),
    );
    return { obstacles, sprites };
  }

  /** Obstacles whose circle overlaps (x, y, r). */
  query(x: number, y: number, r: number, out: Obstacle[]): Obstacle[] {
    const x0 = Math.floor((x - r - 100) / CHUNK);
    const x1 = Math.floor((x + r + 100) / CHUNK);
    const y0 = Math.floor((y - r - 100) / CHUNK);
    const y1 = Math.floor((y + r + 100) / CHUNK);
    for (let cx = x0; cx <= x1; cx++) {
      for (let cy = y0; cy <= y1; cy++) {
        const c = this.chunks.get(this.key(cx, cy));
        if (!c) continue;
        for (const o of c.obstacles) {
          const rr = o.r + r;
          if ((o.x - x) ** 2 + (o.y - y) ** 2 < rr * rr) out.push(o);
        }
      }
    }
    return out;
  }

  private tmp: Obstacle[] = [];

  /**
   * Push a body out of any obstacle it overlaps. `mx, my` is its intended movement
   * direction: bodies heading into an obstacle get nudged sideways so they slide
   * around it instead of stalling dead-centre.
   */
  resolve(body: { x: number; y: number }, radius: number, mx = 0, my = 0, slide = 0) {
    this.tmp.length = 0;
    let hit = false;
    for (const o of this.query(body.x, body.y, radius, this.tmp)) {
      let dx = body.x - o.x;
      let dy = body.y - o.y;
      let d = Math.hypot(dx, dy);
      if (d < 0.001) {
        dx = 1;
        dy = 0;
        d = 1;
      }
      const nx = dx / d;
      const ny = dy / d;
      const push = o.r + radius - d;
      body.x += nx * push;
      body.y += ny * push;
      if (slide > 0) {
        // tangent that best matches the intended direction
        let tx = -ny;
        let ty = nx;
        if (tx * mx + ty * my < 0) {
          tx = -tx;
          ty = -ty;
        }
        body.x += tx * slide;
        body.y += ty * slide;
      }
      hit = true;
    }
    return hit;
  }

  blocks(x: number, y: number) {
    this.tmp.length = 0;
    return this.query(x, y, 0, this.tmp).length > 0;
  }

  destroy() {
    for (const c of this.chunks.values()) for (const s of c.sprites) s.destroy();
    this.chunks.clear();
  }
}
