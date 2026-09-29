import Phaser from 'phaser';
import {
  CHAR_BY_ID, ENEMY_DEFS, MAPS, MAP_BY_ID, EVOLUTIONS, EVOLVES_WEAPON, ITEMS, MAX_PASSIVES, MAX_WEAPONS, PASSIVE_IDS, WEAPON_IDS, xpToNext,
  type CharId, type EnemyKind, type GameMode, type MapDef, type MapId, type ItemId, type PassiveId, type WeaponId,
} from '../game/data';
import {
  checkAchievements, commitRun, isCharUnlocked, isMapUnlocked, type AchievementDef, type RunSnapshot,
} from '../game/achievements';
import { COLORS, FONT } from '../game/palette';
import { sfx } from '../game/audio';
import { music } from '../game/music';
import { loadSave, metaRank, writeSave } from '../game/save';
import {
  Enemy, Pool, SpatialGrid,
  type DamageNumber, type EnemyBullet, type FxSprite, type Pickup, type PickupKind,
} from '../game/entities';
import { createWeapon, type Weapon } from '../game/weapons';
import { Director } from '../game/director';
import { ObstacleField } from '../game/obstacles';
import type { RunScore } from '../game/leaderboard';
import { inputState } from '../game/input';
import { res, vh, vibrate, vw } from '../ui/screen';
import { texScale } from '../game/textures';
import type { UIScene } from './UIScene';

const TAU = Math.PI * 2;
const PLAYER_R = 12;

export interface Stats {
  maxHp: number;
  regen: number;
  speed: number;
  magnet: number;
  might: number;
  haste: number;
  area: number;
  amount: number;
  armor: number;
  growth: number;
  greed: number;
}

export interface UpgradeOption {
  id: ItemId | 'heal' | 'gold' | 'evolve';
  name: string;
  icon: string;
  color: number;
  isNew: boolean;
  levelText: string;
  desc: string;
  /** small gold line under the description, e.g. evolution recipe */
  hint?: string;
  /** set when id === 'evolve' */
  evolve?: WeaponId;
}

export interface RunResult {
  win: boolean;
  mode: GameMode;
  /** endless bosses defeated or reached */
  bossWave: number;
  time: number;
  level: number;
  kills: number;
  gold: number;
  totalGold: number;
  newBest: boolean;
  damage: { id: WeaponId; value: number; evolved: boolean }[];
  achievements: AchievementDef[];
  /** what gets uploaded to the online leaderboard */
  board: RunScore;
}

type ModalKind = 'level' | 'chest';
type RunState = 'playing' | 'modal' | 'paused' | 'ending' | 'over';

interface Lightning {
  pts: number[];
  life: number;
  max: number;
  color: number;
}

export class GameScene extends Phaser.Scene {
  // --- public state read by weapons, director and HUD
  px = 0;
  py = 0;
  faceX = 1;
  faceY = 0;
  hp = 100;
  stats!: Stats;
  elapsed = 0;
  level = 1;
  xp = 0;
  kills = 0;
  coins = 0;
  state: RunState = 'playing';
  weapons: Weapon[] = [];
  itemLevels = new Map<ItemId, number>();
  passiveOrder: PassiveId[] = [];
  bosses: Enemy[] = [];

  // --- internals
  private director!: Director;
  mapDef: MapDef = MAPS[0];
  mode: GameMode = 'standard';
  private obstacles!: ObstacleField;
  private shakeScale = 1;
  private showDamage = true;
  private grid = new SpatialGrid(64);
  private enemyPool!: Pool<Enemy>;
  private pickupPool!: Pool<Pickup>;
  private bulletPool!: Pool<EnemyBullet>;
  private fxPool!: Pool<FxSprite>;
  private numbers: DamageNumber[] = [];
  private lightning: Lightning[] = [];
  /** laser beams to draw this frame (weapons re-add them every frame) */
  private beams: { x: number; y: number; ang: number; len: number; width: number; color: number; alpha: number }[] = [];
  private emitters = new Map<number, Phaser.GameObjects.Particles.ParticleEmitter>();
  private damageBy = new Map<WeaponId, number>();
  private pendingModals: ModalKind[] = [];
  private evoAnnounced = new Set<WeaponId>();
  charId: CharId = 'runner';
  private firstHurt = -1;
  private boss1Killed = false;
  private boss2Killed = false;
  private achTimer = 1;
  private runAchievements: AchievementDef[] = [];
  private settled = false;
  private invuln = 0;
  private reviveUsed = false;
  private endTimer = 0;
  private endWin = false;
  private sourceIds = 0;
  private hasStats = false;
  private tmp: Enemy[] = [];

  private bg!: Phaser.GameObjects.TileSprite;
  private playerSprite!: Phaser.GameObjects.Image;
  private dirSprite!: Phaser.GameObjects.Image;
  private aura!: Phaser.GameObjects.Image;
  private fx!: Phaser.GameObjects.Graphics;
  private overlay!: Phaser.GameObjects.Graphics;
  private keys!: Record<string, Phaser.Input.Keyboard.Key>;

  constructor() {
    super('Game');
  }

  /** endless-mode boss waves reached so far */
  get bossWave() {
    return this.director.bossWave;
  }

  get enemies(): Enemy[] {
    return this.enemyPool.active;
  }

  ui(): UIScene | null {
    const s = this.scene.get('UI') as UIScene | null;
    return s && s.sys.isActive() ? s : null;
  }

  // ================================================================ lifecycle

  create(data?: { char?: CharId; map?: MapId; mode?: GameMode }) {
    this.resetState();
    const save = loadSave();
    this.mode = data?.mode ?? save.selectedMode ?? 'standard';
    const wantedMap = data?.map ?? save.selectedMap;
    this.mapDef = MAP_BY_ID[isMapUnlocked(wantedMap) ? wantedMap : 'grid'];
    this.shakeScale = save.shake;
    this.showDamage = save.damageNumbers;
    const wanted = data?.char ?? loadSave().selectedChar;
    this.charId = isCharUnlocked(wanted) ? wanted : 'runner';
    const char = CHAR_BY_ID[this.charId];

    const k = texScale();
    this.bg = this.add.tileSprite(0, 0, 64, 64, `grid_${this.mapDef.id}`).setOrigin(0).setDepth(-10).setTileScale(k);
    this.aura = this.add.image(0, 0, 'glow').setDepth(29).setBlendMode(Phaser.BlendModes.ADD)
      .setTint(char.color).setAlpha(0.3).setScale(1.8 * k);
    this.playerSprite = this.add.image(0, 0, `player_${char.id}`).setDepth(30).setScale(k);
    this.dirSprite = this.add.image(0, 0, `player_dir_${char.id}`).setDepth(30).setScale(k);
    this.fx = this.add.graphics().setDepth(40).setBlendMode(Phaser.BlendModes.ADD);
    this.overlay = this.add.graphics().setDepth(45);

    this.enemyPool = new Pool<Enemy>(() => new Enemy(this.add.image(0, 0, 'e_chaser').setDepth(10)));
    this.pickupPool = new Pool<Pickup>(() => ({
      alive: false, sprite: this.add.image(0, 0, 'gem1').setDepth(5),
      kind: 'gem', x: 0, y: 0, value: 0, attracted: false, v: 0, t: 0,
    }));
    this.bulletPool = new Pool<EnemyBullet>(() => ({
      alive: false, sprite: this.add.image(0, 0, 'ebullet').setDepth(25).setBlendMode(Phaser.BlendModes.ADD).setScale(k),
      x: 0, y: 0, vx: 0, vy: 0, life: 0, damage: 0,
    }));
    this.fxPool = new Pool<FxSprite>(() => ({
      alive: false, sprite: this.add.image(0, 0, 'ring').setDepth(38).setBlendMode(Phaser.BlendModes.ADD),
      life: 0, maxLife: 1, s0: 0, s1: 1, a0: 1,
    }));

    const cam = this.cameras.main;
    cam.setBackgroundColor(this.mapDef.bg);
    this.obstacles = new ObstacleField(this, this.mapDef);
    cam.startFollow(this.playerSprite, false, 0.14, 0.14);
    this.applyZoom();
    this.scale.on('resize', this.applyZoom, this);

    this.keys = this.input.keyboard!.addKeys('W,A,S,D,UP,DOWN,LEFT,RIGHT') as Record<string, Phaser.Input.Keyboard.Key>;

    this.director = new Director(this);
    this.recomputeStats();
    this.hp = this.stats.maxHp;
    this.addItem(char.weapon);

    // phones: switching apps / locking the screen fires visibilitychange rather than blur
    const onBlur = () => this.requestPause();
    const onVisibility = () => {
      if (document.hidden) this.requestPause();
    };
    window.addEventListener('blur', onBlur);
    document.addEventListener('visibilitychange', onVisibility);
    this.events.once('shutdown', () => {
      window.removeEventListener('blur', onBlur);
      document.removeEventListener('visibilitychange', onVisibility);
      this.scale.off('resize', this.applyZoom, this);
      for (const w of this.weapons) w.destroy();
      this.emitters.clear();
      this.numbers = [];
    });

    music.setIntensity(1);
    music.setDuck(1);
    this.scene.launch('UI');
  }

  private resetState() {
    this.px = 0;
    this.py = 0;
    this.faceX = 1;
    this.faceY = 0;
    this.elapsed = 0;
    this.level = 1;
    this.xp = 0;
    this.kills = 0;
    this.coins = 0;
    this.state = 'playing';
    this.weapons = [];
    this.itemLevels = new Map();
    this.passiveOrder = [];
    this.bosses = [];
    this.numbers = [];
    this.lightning = [];
    this.emitters = new Map();
    this.damageBy = new Map();
    this.pendingModals = [];
    this.evoAnnounced = new Set();
    this.invuln = 0;
    this.reviveUsed = false;
    this.firstHurt = -1;
    this.boss1Killed = false;
    this.boss2Killed = false;
    this.achTimer = 1;
    this.runAchievements = [];
    this.settled = false;
    this.endTimer = 0;
    this.sourceIds = 0;
    this.grid = new SpatialGrid(64);
    this.hasStats = false;
  }

  private applyZoom() {
    const cam = this.cameras.main;
    // world zoom is chosen in logical pixels, then multiplied up to the canvas' physical density
    const m = Math.min(vw(this), vh(this));
    cam.setZoom(Phaser.Math.Clamp(m / 760, 0.62, 1) * res());
    this.bg?.setSize(this.scale.width / cam.zoom + 256, this.scale.height / cam.zoom + 256);
  }

  update(_time: number, deltaMs: number) {
    const dt = Math.min(deltaMs / 1000, 0.05);

    if (this.state === 'ending') {
      this.endTimer -= dt;
      this.updateFx(dt);
      if (this.endTimer <= 0) this.finishRun();
      return;
    }
    if (this.state !== 'playing') return;

    this.elapsed += dt;
    this.obstacles.update(this.px, this.py, this.viewRadius());
    this.updatePlayer(dt);

    this.achTimer -= dt;
    if (this.achTimer <= 0) {
      this.achTimer = 1;
      this.pollAchievements(false);
      music.setIntensity(this.bossAlive() ? 3 : this.elapsed > 240 ? 2 : 1);
    }

    this.grid.clear();
    for (const e of this.enemies) this.grid.insert(e);

    this.director.update(dt);
    this.updateEnemies(dt);
    for (const w of this.weapons) w.update(dt);
    this.updateBullets(dt);
    this.updatePickups(dt);
    this.updateFx(dt);

    this.enemyPool.compact();
    this.pickupPool.compact();
    this.bulletPool.compact();
    if (this.bosses.length) this.bosses = this.bosses.filter((b) => b.alive);

    if (this.state === 'playing' && this.pendingModals.length > 0) this.openModal();
  }

  // ================================================================ player

  private updatePlayer(dt: number) {
    const k = this.keys;
    let mx = (k.D.isDown || k.RIGHT.isDown ? 1 : 0) - (k.A.isDown || k.LEFT.isDown ? 1 : 0);
    let my = (k.S.isDown || k.DOWN.isDown ? 1 : 0) - (k.W.isDown || k.UP.isDown ? 1 : 0);
    if (inputState.active) {
      mx = inputState.x;
      my = inputState.y;
    }
    const len = Math.hypot(mx, my);
    if (len > 1) {
      mx /= len;
      my /= len;
    }
    if (len > 0.1) {
      this.faceX = mx / Math.max(len, 1e-6);
      this.faceY = my / Math.max(len, 1e-6);
    }
    this.px += mx * this.stats.speed * dt;
    this.py += my * this.stats.speed * dt;
    const body = { x: this.px, y: this.py };
    if (this.obstacles.resolve(body, PLAYER_R, mx, my, 0)) {
      this.px = body.x;
      this.py = body.y;
    }

    this.hp = Math.min(this.stats.maxHp, this.hp + this.stats.regen * dt);
    this.invuln = Math.max(0, this.invuln - dt);

    this.playerSprite.setPosition(this.px, this.py);
    this.playerSprite.setAlpha(this.invuln > 0 && Math.floor(this.invuln * 20) % 2 === 0 ? 0.35 : 1);
    this.dirSprite.setPosition(this.px, this.py).setRotation(Math.atan2(this.faceY, this.faceX));
    this.aura.setPosition(this.px, this.py).setScale((1.7 + Math.sin(this.elapsed * 4) * 0.12) * texScale());

    const view = this.cameras.main.worldView;
    this.bg.setPosition(Math.floor(view.x / 64) * 64 - 128, Math.floor(view.y / 64) * 64 - 128);
  }

  private hurt(amount: number) {
    if (this.invuln > 0 || this.state !== 'playing') return;
    const dmg = Math.max(1, amount - this.stats.armor);
    this.hp -= dmg;
    this.invuln = 0.45;
    if (this.firstHurt < 0) this.firstHurt = this.elapsed;
    this.shake(120, 0.006);
    this.ui()?.flashDamage();
    vibrate(dmg >= 15 ? 60 : 30);
    this.number(this.px, this.py - 20, dmg, '#ff5c7a');
    sfx.play('hurt');
    if (this.hp <= 0) this.die();
  }

  private die() {
    if (!this.reviveUsed && metaRank('revive') > 0) {
      this.reviveUsed = true;
      this.hp = this.stats.maxHp * 0.5;
      this.invuln = 2.5;
      this.shockwave(420, 9999);
      this.ui()?.banner('不屈！灵魂复苏', true);
      sfx.play('chest');
      return;
    }
    this.hp = 0;
    this.burst(this.px, this.py, COLORS.player, 40);
    this.playerSprite.setVisible(false);
    this.dirSprite.setVisible(false);
    this.aura.setVisible(false);
    sfx.play('gameover');
    this.beginEnd(false, 1.4);
  }

  /** Clears the area around the player — used by revive. Bosses only take a chunk of damage. */
  private shockwave(radius: number, damage: number) {
    this.tmp.length = 0;
    for (const e of this.grid.query(this.px, this.py, radius, this.tmp)) {
      const dx = e.x - this.px;
      const dy = e.y - this.py;
      const len = Math.hypot(dx, dy) || 1;
      this.damageEnemy(e, e.boss ? e.maxHp * 0.05 : damage, null, dx / len, dy / len, 600);
    }
    this.addRing(this.px, this.py, radius, 0xffffff, 0.6);
    this.shake(300, 0.01);
  }

  // ================================================================ enemies

  spawnPoint(): { x: number; y: number } {
    let a = Math.random() * TAU;
    const moving = inputState.active || this.keys.W.isDown || this.keys.A.isDown || this.keys.S.isDown || this.keys.D.isDown
      || this.keys.UP.isDown || this.keys.DOWN.isDown || this.keys.LEFT.isDown || this.keys.RIGHT.isDown;
    if (moving && Math.random() < 0.45) a = Math.atan2(this.faceY, this.faceX) + (Math.random() - 0.5) * 2.2;
    const r = this.viewRadius() + 40 + Math.random() * 80;
    return { x: this.px + Math.cos(a) * r, y: this.py + Math.sin(a) * r };
  }

  viewRadius() {
    const cam = this.cameras.main;
    return Math.hypot(cam.width / cam.zoom / 2, cam.height / cam.zoom / 2);
  }

  bossAlive() {
    return this.bosses.length > 0;
  }

  spawnEnemy(kind: EnemyKind, x: number, y: number, opts: { elite?: boolean; boss?: boolean; final?: boolean; hpScale?: number } = {}) {
    const def = ENEMY_DEFS[kind];
    const e = this.enemyPool.get();
    const d = this.director;
    e.kind = kind;
    e.def = def;
    e.x = x;
    e.y = y;
    e.vx = 0;
    e.vy = 0;
    e.elite = !!opts.elite;
    e.boss = !!opts.boss;
    e.finalBoss = !!opts.final;
    e.flash = 0;
    e.hitUntil.clear();
    e.heading = Math.atan2(this.py - y, this.px - x);
    e.slow = 0;
    e.slowUntil = 0;
    e.freezeUntil = 0;
    e.iced = false;
    e.fuse = -1;
    e.aiT = 1 + Math.random() * 1.5;

    let hp = def.hp * d.hpMult();
    let damage = def.damage * d.dmgMult();
    let speed = def.speed * d.speedMult() * (0.9 + Math.random() * 0.2);
    let scale = 1;
    e.xp = def.xp;

    if (e.elite) {
      hp *= 12;
      damage *= 1.5;
      speed *= 0.95;
      scale = 1.5;
    }
    if (e.boss) {
      hp = (e.finalBoss ? 14000 : 3500) * this.mapDef.hpMult * (opts.hpScale ?? 1);
      damage = e.finalBoss ? 32 : 24;
      speed = e.finalBoss ? 74 : 64;
      scale = e.finalBoss ? 1.3 : 1;
      e.shotT = 2.5;
      e.dashT = 5;
      e.telegraph = 0;
      e.dashing = 0;
      e.shotRot = 0;
      this.bosses.push(e);
    }

    e.hp = e.maxHp = hp;
    e.damage = damage;
    e.speed = speed;
    e.radius = def.radius * scale;
    e.baseScale = scale * texScale();
    e.sprite.setTexture(def.tex).setPosition(x, y).setScale(e.baseScale).setRotation(0).setAlpha(1)
      .setDepth(e.boss ? 12 : e.elite ? 11 : 10);
    this.restoreTint(e);
    return e;
  }

  private restoreTint(e: Enemy) {
    const frozen = e.freezeUntil > this.elapsed;
    const iced = frozen || (e.slowUntil > this.elapsed && e.slow >= 0.3);
    e.iced = iced;
    if (e.elite) e.sprite.setTint(COLORS.elite);
    else if (e.finalBoss) e.sprite.setTint(0xc79bff);
    else if (iced) e.sprite.setTint(frozen ? 0xe6fbff : COLORS.frost);
    else e.sprite.clearTint();
  }

  slowEnemy(e: Enemy, amount: number, dur: number) {
    if (e.boss) amount = Math.min(amount, 0.35);
    const active = e.slowUntil > this.elapsed;
    e.slow = active ? Math.max(e.slow, amount) : amount;
    e.slowUntil = Math.max(e.slowUntil, this.elapsed + dur);
  }

  freezeEnemy(e: Enemy, dur: number) {
    if (e.boss) return this.slowEnemy(e, 0.5, dur);
    e.freezeUntil = Math.max(e.freezeUntil, this.elapsed + dur);
  }

  private enemyShot(e: Enemy, nx: number, ny: number) {
    const b = this.bulletPool.get();
    b.x = e.x + nx * e.radius;
    b.y = e.y + ny * e.radius;
    b.vx = nx * 190;
    b.vy = ny * 190;
    b.life = 3.5;
    b.damage = e.damage;
    b.sprite.setPosition(b.x, b.y);
    sfx.play('enemyShot');
  }

  /** Bomber blast: hurts the player and any enemies caught in it. Not a kill — no drops. */
  private detonate(e: Enemy) {
    e.alive = false;
    const r = 80;
    this.addRing(e.x, e.y, r, COLORS.bomber, 0.4);
    this.burst(e.x, e.y, COLORS.bomber, 20);
    this.shake(120, 0.004);
    sfx.play('boom');
    if ((this.px - e.x) ** 2 + (this.py - e.y) ** 2 < (r + PLAYER_R) ** 2) this.hurt(e.damage);
    const hit: Enemy[] = [];
    for (const o of this.grid.query(e.x, e.y, r, hit)) {
      if (o === e) continue;
      const dx = o.x - e.x;
      const dy = o.y - e.y;
      const len = Math.hypot(dx, dy) || 1;
      this.damageEnemy(o, 30, null, dx / len, dy / len, 250);
    }
  }

  private updateEnemies(dt: number) {
    const px = this.px;
    const py = this.py;
    const relocate = this.viewRadius() * 1.5 + 120;
    const damp = Math.exp(-7 * dt);
    const near = this.tmp;

    for (const e of this.enemies) {
      if (!e.alive) continue;
      let dx = px - e.x;
      let dy = py - e.y;
      let d = Math.hypot(dx, dy) || 1;

      if (d > relocate) {
        const p = this.spawnPoint();
        e.x = p.x;
        e.y = p.y;
        dx = px - e.x;
        dy = py - e.y;
        d = Math.hypot(dx, dy) || 1;
        e.heading = Math.atan2(dy, dx);
      }

      const frozen = e.freezeUntil > this.elapsed;
      const slowMul = frozen ? 0 : e.slowUntil > this.elapsed ? 1 - e.slow : 1;
      const behavior = e.def.behavior;

      if (e.boss) {
        this.updateBoss(e, dt * slowMul, dx / d, dy / d, d);
      } else {
        // steer towards the player, plus soft separation so crowds spread into a wall
        let sx = 0;
        let sy = 0;
        near.length = 0;
        this.grid.query(e.x, e.y, e.radius, near, 24);
        const lim = Math.min(near.length, 12);
        for (let i = 0; i < lim; i++) {
          const o = near[i];
          if (o === e) continue;
          const ox = e.x - o.x;
          const oy = e.y - o.y;
          const od = Math.hypot(ox, oy) || 0.01;
          const overlap = e.radius + o.radius - od;
          if (overlap > 0) {
            const push = o.boss ? 1 : 0.8;
            sx += (ox / od) * overlap * push;
            sy += (oy / od) * overlap * push;
          }
        }
        let mx = dx / d;
        let my = dy / d;
        const turn = e.def.turnRate;
        if (turn) {
          // limited steering: fast flyers overshoot when the player sidesteps
          const diff = Phaser.Math.Angle.Wrap(Math.atan2(dy, dx) - e.heading);
          e.heading += Phaser.Math.Clamp(diff, -turn * dt, turn * dt);
          mx = Math.cos(e.heading);
          my = Math.sin(e.heading);
        }
        let speedMul = slowMul;

        if (behavior === 'ranged') {
          // keep a firing distance: back off when close, circle at mid range
          if (d < 230) {
            mx = -mx;
            my = -my;
            speedMul *= 0.8;
          } else if (d < 300) {
            const t = mx;
            mx = -my * 0.6;
            my = t * 0.6;
          }
          if (!frozen) {
            e.aiT -= dt;
            if (e.aiT <= 0 && d < 560) {
              e.aiT = 3 + Math.random() * 0.8;
              this.enemyShot(e, dx / d, dy / d);
            }
          }
        } else if (behavior === 'bomber') {
          if (e.fuse >= 0) {
            speedMul = 0;
            if (!frozen) e.fuse -= dt;
            e.sprite.setScale(e.baseScale * (1 + 0.3 * Math.abs(Math.sin(e.fuse * 22))));
            if (e.fuse <= 0) {
              this.detonate(e);
              continue;
            }
          } else if (d < 70 && !frozen) {
            e.fuse = 0.55;
            e.sprite.setTint(0xffffff);
            sfx.play('fuse');
          }
        }

        e.x += (mx * e.speed * speedMul + e.vx) * dt + sx * Math.min(1, dt * 12);
        e.y += (my * e.speed * speedMul + e.vy) * dt + sy * Math.min(1, dt * 12);
        if (behavior === 'ranged') e.sprite.rotation = Math.atan2(dy, dx);
        else if (e.def.faceMove) e.sprite.rotation = Math.atan2(my, mx);
        else e.sprite.rotation += dt * 0.8 * slowMul;
      }
      e.vx *= damp;
      e.vy *= damp;
      // terrain: push out, sliding around the obstacle towards the player
      this.obstacles.resolve(e, e.radius, dx / d, dy / d, e.speed * slowMul * dt * 0.8);
      e.sprite.setPosition(e.x, e.y);

      if (e.flash > 0) {
        e.flash -= dt;
        if (e.flash <= 0) this.restoreTint(e);
      } else if (e.fuse < 0) {
        const iced = frozen || (e.slowUntil > this.elapsed && e.slow >= 0.3);
        if (iced !== e.iced) this.restoreTint(e);
      }

      // bombers only hurt by exploding; frozen enemies are harmless
      const rr = e.radius + PLAYER_R - 3;
      if (d < rr && behavior !== 'bomber' && !frozen) this.hurt(e.damage);
    }
  }

  private updateBoss(e: Enemy, dt: number, nx: number, ny: number, d: number) {
    if (e.telegraph > 0) {
      e.telegraph -= dt;
      e.sprite.setScale(e.baseScale * (1 + Math.sin(e.telegraph * 40) * 0.05));
      if (e.telegraph <= 0) {
        e.dashing = 0.6;
        e.sprite.setScale(e.baseScale);
      }
    } else if (e.dashing > 0) {
      e.dashing -= dt;
      e.x += e.dvx * dt;
      e.y += e.dvy * dt;
      if (Math.random() < 0.6) this.burst(e.x, e.y, COLORS.boss, 1);
    } else {
      e.x += (nx * e.speed + e.vx) * dt;
      e.y += (ny * e.speed + e.vy) * dt;
      e.shotT -= dt;
      if (e.shotT <= 0) {
        this.bossVolley(e);
        e.shotT = e.finalBoss ? 2.2 : 3.2;
      }
      e.dashT -= dt;
      if (e.dashT <= 0 && d < 650) {
        e.telegraph = 0.75;
        e.dashT = e.finalBoss ? 4.5 : 6;
        const sp = e.finalBoss ? 640 : 560;
        e.dvx = nx * sp;
        e.dvy = ny * sp;
      }
    }
    e.sprite.rotation += dt * (e.dashing > 0 ? 9 : 1.2);
  }

  private bossVolley(e: Enemy) {
    const enraged = e.hp < e.maxHp * 0.5;
    const n = (e.finalBoss ? 22 : 16) + (enraged ? 8 : 0);
    const speed = e.finalBoss ? 215 : 180;
    for (let i = 0; i < n; i++) {
      const a = e.shotRot + (i / n) * TAU;
      const b = this.bulletPool.get();
      b.x = e.x;
      b.y = e.y;
      b.vx = Math.cos(a) * speed;
      b.vy = Math.sin(a) * speed;
      b.life = 5;
      b.damage = e.damage * 0.5;
      b.sprite.setPosition(b.x, b.y);
    }
    e.shotRot += 0.23;
    sfx.play('bossShot');
  }

  private updateBullets(dt: number) {
    const rr = PLAYER_R + 5;
    for (const b of this.bulletPool.active) {
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.life -= dt;
      b.sprite.setPosition(b.x, b.y);
      if (this.obstacles.blocks(b.x, b.y)) {
        // obstacles are cover from enemy fire
        b.alive = false;
        this.burst(b.x, b.y, COLORS.enemyBullet, 3);
        continue;
      }
      if (b.life <= 0) {
        b.alive = false;
        continue;
      }
      const dx = b.x - this.px;
      const dy = b.y - this.py;
      if (dx * dx + dy * dy < rr * rr) {
        b.alive = false;
        this.hurt(b.damage);
      }
    }
  }

  // ================================================================ weapons API

  /** Re-read live settings after they change in the pause menu. */
  applySettings() {
    const save = loadSave();
    this.shakeScale = save.shake;
    this.showDamage = save.damageNumbers;
  }

  /** Camera shake scaled by the player's setting (0 = off). */
  shake(duration: number, intensity: number) {
    if (this.shakeScale > 0) this.cameras.main.shake(duration, intensity * this.shakeScale);
  }

  newSourceId() {
    return ++this.sourceIds;
  }

  queryEnemies(x: number, y: number, r: number, out: Enemy[]): Enemy[] {
    return this.grid.query(x, y, r, out);
  }

  nearestEnemies(x: number, y: number, maxDist: number, k: number): Enemy[] {
    const md = maxDist * maxDist;
    const found: { e: Enemy; d: number }[] = [];
    for (const e of this.enemies) {
      if (!e.alive) continue;
      const d = (e.x - x) ** 2 + (e.y - y) ** 2;
      if (d < md) found.push({ e, d });
    }
    found.sort((a, b) => a.d - b.d);
    return found.slice(0, k).map((f) => f.e);
  }

  damageEnemy(e: Enemy, raw: number, src: WeaponId | null, dx: number, dy: number, knock: number) {
    if (!e.alive) return;
    const dmg = raw * (0.9 + Math.random() * 0.2);
    e.hp -= dmg;
    if (src) this.damageBy.set(src, (this.damageBy.get(src) ?? 0) + dmg);
    e.flash = 0.07;
    e.sprite.setTintFill(0xffffff);
    const kr = (1 - e.def.knockResist) * (e.elite ? 0.3 : 1);
    e.vx += dx * knock * kr;
    e.vy += dy * knock * kr;
    if (this.showDamage) this.number(e.x, e.y - e.radius, dmg);
    sfx.play('hit');
    if (e.hp <= 0) this.killEnemy(e);
  }

  private killEnemy(e: Enemy, silent = false) {
    e.alive = false;
    this.kills++;
    const size = e.boss ? 60 : e.elite ? 24 : e.kind === 'brute' ? 12 : 6;
    this.burst(e.x, e.y, e.elite ? COLORS.elite : e.def.color, size);
    if (silent) return;
    sfx.play('kill');

    if (e.boss) {
      this.shake(500, 0.012);
      this.addRing(e.x, e.y, 300, COLORS.boss, 0.8);
      this.dropPickup('chest', e.x, e.y, 1);
      for (let i = 0; i < 16; i++) {
        const a = (i / 16) * TAU;
        this.dropPickup('gem', e.x + Math.cos(a) * 60, e.y + Math.sin(a) * 60, 12);
      }
      this.coins += e.finalBoss ? 60 : 30;
      if (e.finalBoss) this.boss2Killed = true;
      else this.boss1Killed = true;
      // endless: the final boss is just another milestone
      if (e.finalBoss && this.mode === 'standard') this.victory();
      else if (e.finalBoss && this.director.bossWave === 0) this.ui()?.banner('虚空之主倒下……但深渊仍在延续', true, COLORS.elite);
      return;
    }
    if (e.elite) {
      this.dropPickup('chest', e.x, e.y, 1);
      this.dropPickup('gem', e.x + 20, e.y, 20);
      return;
    }

    this.dropPickup('gem', e.x, e.y, e.xp);
    if (e.def.behavior === 'splitter') {
      for (let i = 0; i < 3; i++) {
        const a = (i / 3) * TAU + Math.random();
        this.spawnEnemy('splitling', e.x + Math.cos(a) * 14, e.y + Math.sin(a) * 14);
      }
    }
    const r = Math.random();
    const brute = e.kind === 'brute';
    if (r < (brute ? 0.03 : 0.004)) this.dropPickup('heart', e.x + 8, e.y, 1);
    else if (r < (brute ? 0.04 : 0.0055)) this.dropPickup('magnet', e.x + 8, e.y, 1);
    else if (r < (brute ? 0.07 : 0.0155)) this.dropPickup('coin', e.x + 8, e.y, brute ? 3 : 1);
  }

  private victory() {
    for (const e of this.enemies) if (e.alive) this.killEnemy(e, true);
    for (const b of this.bulletPool.active) b.alive = false;
    this.ui()?.banner('胜利！虚空之主已被击败', true);
    sfx.play('victory');
    this.beginEnd(true, 2.2);
  }

  // ================================================================ pickups

  private dropPickup(kind: PickupKind, x: number, y: number, value: number) {
    if (kind === 'gem' && this.pickupPool.active.length > 380) {
      // too many gems on the floor: fold the xp into the closest gem so it stays where the fight is
      let best: Pickup | null = null;
      let bd = Infinity;
      for (const q of this.pickupPool.active) {
        if (!q.alive || q.kind !== 'gem' || q.attracted) continue;
        const d = (q.x - x) ** 2 + (q.y - y) ** 2;
        if (d < bd) {
          bd = d;
          best = q;
        }
      }
      if (best && bd < 250 * 250) {
        best.value += value;
        best.sprite.setTexture(this.gemTex(best.value));
        return;
      }
    }
    const p = this.pickupPool.get();
    p.kind = kind;
    p.x = x;
    p.y = y;
    p.value = value;
    p.attracted = false;
    p.v = 0;
    p.t = Math.random() * 10;
    const tex = kind === 'gem' ? this.gemTex(value) : kind;
    p.sprite.setTexture(tex).setPosition(x, y).setScale(texScale()).setDepth(kind === 'gem' ? 5 : 6);
  }

  private gemTex(v: number) {
    return v >= 20 ? 'gem3' : v >= 5 ? 'gem2' : 'gem1';
  }

  private updatePickups(dt: number) {
    const mr = this.stats.magnet;
    const mr2 = mr * mr;
    const grab = PLAYER_R + 10;
    // litter control: once the floor is crowded, gems left far behind fade away
    const far = this.pickupPool.active.length > 450 ? (this.viewRadius() * 2.5) ** 2 : Infinity;
    for (const p of this.pickupPool.active) {
      p.t += dt;
      const dx = this.px - p.x;
      const dy = this.py - p.y;
      const d2 = dx * dx + dy * dy;
      if (d2 > far && p.kind === 'gem') {
        p.alive = false;
        continue;
      }
      if (!p.attracted && d2 < mr2) {
        p.attracted = true;
        p.v = -140; // tiny hop away before being pulled in
      }
      if (p.attracted) {
        const d = Math.sqrt(d2) || 1;
        p.v = Math.min(1100, p.v + 1700 * dt);
        const step = Math.min(p.v * dt, d);
        p.x += (dx / d) * step;
        p.y += (dy / d) * step;
      }
      if (d2 < grab * grab) {
        this.collect(p);
        continue;
      }
      if (p.kind === 'chest' || p.kind === 'heart' || p.kind === 'magnet') {
        p.sprite.setPosition(p.x, p.y + Math.sin(p.t * 3) * 3).setScale((1 + Math.sin(p.t * 5) * 0.08) * texScale());
      } else {
        p.sprite.setPosition(p.x, p.y);
      }
    }
  }

  private collect(p: Pickup) {
    p.alive = false;
    switch (p.kind) {
      case 'gem':
        this.gainXp(p.value);
        sfx.play('gem');
        break;
      case 'coin':
        this.coins += p.value;
        sfx.play('pickup');
        break;
      case 'heart': {
        const heal = Math.min(30, this.stats.maxHp - this.hp);
        this.hp += heal;
        this.number(this.px, this.py - 24, 30, '#6bff8f');
        sfx.play('pickup');
        break;
      }
      case 'magnet':
        for (const q of this.pickupPool.active) {
          if (q.alive && q.kind === 'gem' && !q.attracted) {
            q.attracted = true;
            q.v = -100;
          }
        }
        sfx.play('pickup');
        break;
      case 'chest':
        this.hp = Math.min(this.stats.maxHp, this.hp + 20);
        this.pendingModals.push('chest');
        sfx.play('chest');
        break;
    }
  }

  private gainXp(v: number) {
    this.xp += v * this.stats.growth;
    let need = xpToNext(this.level);
    while (this.xp >= need) {
      this.xp -= need;
      this.level++;
      this.pendingModals.push('level');
      need = xpToNext(this.level);
    }
  }

  // ================================================================ upgrades

  private openModal() {
    const kind = this.pendingModals.shift()!;
    const ui = this.ui();
    if (!ui) return;
    this.state = 'modal';
    this.scene.pause();
    sfx.play(kind === 'chest' ? 'chest' : 'levelup');
    // a chest always evolves when something is ready — that's what chests are for
    const evo = kind === 'chest' ? this.evolvable().slice(0, 3) : [];
    const opts = evo.length > 0 ? evo.map((id) => this.evolveOption(id)) : this.rollOptions();
    ui.showLevelUp(evo.length > 0 ? 'evolve' : kind, opts, (opt) => {
      this.applyOption(opt);
      this.state = 'playing';
      this.input.keyboard?.resetKeys();
      this.scene.resume();
      this.announceEvolutions();
    });
  }

  /** Max-level weapons whose paired passive is owned. */
  evolvable(): WeaponId[] {
    return this.weapons
      .filter((w) => !w.evolved && w.level >= ITEMS[w.id].maxLevel && (this.itemLevels.get(EVOLUTIONS[w.id].passive) ?? 0) > 0)
      .map((w) => w.id);
  }

  private evolveOption(id: WeaponId): UpgradeOption {
    const evo = EVOLUTIONS[id];
    return {
      id: 'evolve', evolve: id, name: evo.name, icon: evo.icon, color: evo.color, isNew: true,
      levelText: '进化！', desc: evo.desc, hint: `${ITEMS[id].name} + ${ITEMS[evo.passive].name}`,
    };
  }

  private evolveWeapon(id: WeaponId) {
    const w = this.weapons.find((x) => x.id === id);
    if (!w || w.evolved) return;
    w.evolve();
    const evo = EVOLUTIONS[id];
    this.addRing(this.px, this.py, 380, evo.color, 0.9);
    this.burst(this.px, this.py, evo.color, 50);
    this.shake(350, 0.01);
    this.ui()?.banner(`进化！${evo.name}`, true, evo.color);
    sfx.play('victory');
  }

  /** Tell the player once when a weapon becomes ready to evolve. */
  private announceEvolutions() {
    for (const id of this.evolvable()) {
      if (this.evoAnnounced.has(id)) continue;
      this.evoAnnounced.add(id);
      this.ui()?.banner(`「${ITEMS[id].name}」可以进化了！打开宝箱即可进化`, false);
    }
  }

  heal(amount: number) {
    const before = this.hp;
    this.hp = Math.min(this.stats.maxHp, this.hp + amount);
    const gained = this.hp - before;
    if (gained >= 1) this.number(this.px, this.py - 24, gained, '#6bff8f');
  }

  rollOptions(n = 3): UpgradeOption[] {
    const weaponsOwned = this.weapons.length;
    const passivesOwned = this.passiveOrder.length;
    const pool: { id: ItemId; w: number }[] = [];
    for (const id of WEAPON_IDS) {
      const lvl = this.itemLevels.get(id) ?? 0;
      if (lvl > 0 && lvl < ITEMS[id].maxLevel) pool.push({ id, w: 3 });
      else if (lvl === 0 && weaponsOwned < MAX_WEAPONS) pool.push({ id, w: 2.2 });
    }
    for (const id of PASSIVE_IDS) {
      const lvl = this.itemLevels.get(id) ?? 0;
      // passives that unlock an evolution for a weapon we own show up a bit more often
      const pairs = EVOLVES_WEAPON[id];
      const bias = lvl === 0 && pairs && this.itemLevels.has(pairs) ? 1.6 : 1;
      if (lvl > 0 && lvl < ITEMS[id].maxLevel) pool.push({ id, w: 2 });
      else if (lvl === 0 && passivesOwned < MAX_PASSIVES) pool.push({ id, w: 1.4 * bias });
    }

    const out: UpgradeOption[] = [];
    while (out.length < n && pool.length > 0) {
      const total = pool.reduce((s, p) => s + p.w, 0);
      let r = Math.random() * total;
      let idx = 0;
      for (; idx < pool.length - 1; idx++) {
        r -= pool[idx].w;
        if (r <= 0) break;
      }
      const { id } = pool.splice(idx, 1)[0];
      const def = ITEMS[id];
      const lvl = this.itemLevels.get(id) ?? 0;
      let hint: string | undefined;
      if (def.kind === 'weapon') hint = `进化：满级 + ${ITEMS[EVOLUTIONS[id as WeaponId].passive].name}`;
      else if (EVOLVES_WEAPON[id as PassiveId]) hint = `可使「${ITEMS[EVOLVES_WEAPON[id as PassiveId]!].name}」进化`;
      out.push({
        id,
        name: def.name,
        icon: def.icon,
        color: def.color,
        isNew: lvl === 0,
        levelText: lvl === 0 ? '新！' : `Lv ${lvl} → ${lvl + 1}${lvl + 1 === def.maxLevel ? ' (满)' : ''}`,
        desc: def.desc[lvl],
        hint,
      });
    }
    if (out.length === 0) {
      out.push(
        { id: 'heal', name: '治愈', icon: 'icon_heal', color: COLORS.heart, isNew: false, levelText: '', desc: '回复 50% 最大生命' },
        { id: 'gold', name: '金币袋', icon: 'icon_coin', color: COLORS.coin, isNew: false, levelText: '', desc: '获得 25 金币' },
      );
    }
    return out;
  }

  private applyOption(opt: UpgradeOption) {
    if (opt.id === 'heal') {
      this.hp = Math.min(this.stats.maxHp, this.hp + this.stats.maxHp * 0.5);
      return;
    }
    if (opt.id === 'gold') {
      this.coins += 25;
      return;
    }
    if (opt.id === 'evolve') {
      this.evolveWeapon(opt.evolve!);
      return;
    }
    const lvl = this.itemLevels.get(opt.id) ?? 0;
    if (lvl === 0) this.addItem(opt.id);
    else {
      this.itemLevels.set(opt.id, lvl + 1);
      const w = this.weapons.find((x) => x.id === opt.id);
      if (w) w.level = lvl + 1;
      this.recomputeStats();
    }
  }

  private addItem(id: ItemId) {
    this.itemLevels.set(id, 1);
    if (ITEMS[id].kind === 'weapon') this.weapons.push(createWeapon(id as WeaponId, this));
    else this.passiveOrder.push(id as PassiveId);
    this.recomputeStats();
  }

  private recomputeStats() {
    const L = (id: ItemId) => this.itemLevels.get(id) ?? 0;
    const m = CHAR_BY_ID[this.charId].mods;
    const prevMax = this.hasStats ? this.stats.maxHp : undefined;
    this.hasStats = true;
    this.stats = {
      maxHp: Math.round((100 + metaRank('hp') * 10 + L('vitality') * 20) * (m.hp ?? 1)),
      regen: L('vitality') * 0.3 + (m.regen ?? 0),
      speed: 165 * (1 + L('speed') * 0.08 + metaRank('speed') * 0.05) * (m.speed ?? 1),
      magnet: 100 * (1 + L('magnet') * 0.3 + metaRank('magnet') * 0.15) * (m.magnet ?? 1),
      might: (1 + L('might') * 0.1 + metaRank('might') * 0.05) * (m.might ?? 1),
      haste: (1 - L('haste') * 0.08) * (m.cooldown ?? 1),
      area: (1 + L('area') * 0.1) * (m.area ?? 1),
      amount: L('amount'),
      armor: L('armor') + (m.armor ?? 0),
      growth: 1 + L('growth') * 0.1 + metaRank('growth') * 0.05,
      greed: 1 + metaRank('greed') * 0.1,
    };
    if (prevMax !== undefined && this.stats.maxHp > prevMax) this.hp += this.stats.maxHp - prevMax;
    this.hp = Math.min(this.hp, this.stats.maxHp);
  }

  // ================================================================ pause / end

  requestPause() {
    if (this.state !== 'playing') return;
    const ui = this.ui();
    if (!ui) return;
    this.state = 'paused';
    this.scene.pause();
    music.setDuck(0.4);
    ui.showPause();
  }

  resumeFromPause() {
    if (this.state !== 'paused') return;
    music.setDuck(1);
    this.state = 'playing';
    this.input.keyboard?.resetKeys();
    this.scene.resume();
  }

  private beginEnd(win: boolean, delay: number) {
    this.state = 'ending';
    this.endWin = win;
    this.endTimer = delay;
  }

  private snapshot(ended: boolean): RunSnapshot {
    return {
      char: this.charId,
      mode: this.mode,
      kills: this.kills,
      level: this.level,
      time: this.elapsed,
      boss1: this.boss1Killed,
      boss2: this.boss2Killed,
      evolved: this.weapons.filter((w) => w.evolved).map((w) => w.id),
      maxedWeapons: this.weapons.filter((w) => w.level >= ITEMS[w.id].maxLevel).length,
      firstHurt: this.firstHurt,
      ended,
    };
  }

  private pollAchievements(ended: boolean) {
    for (const a of checkAchievements(this.snapshot(ended))) {
      this.runAchievements.push(a);
      this.ui()?.toast(a);
    }
  }

  /** Pays out gold, runs the final achievement check and folds the run into lifetime stats. Once per run. */
  private settleRun() {
    if (this.settled) return null;
    this.settled = true;
    const save = loadSave();
    const newBest = this.mode === 'endless' ? this.elapsed > save.stats.endlessBest : this.elapsed > save.best.time;
    const minutes = this.elapsed / 60;
    const gold = Math.floor((this.coins + this.kills * 0.02 + minutes * 8 + (this.endWin ? 150 : 0)) * this.stats.greed * this.mapDef.goldMult);
    this.pollAchievements(true);
    commitRun(this.snapshot(true));
    save.gold += gold;
    writeSave();
    return { gold, newBest };
  }

  /** Leaving mid-run still counts: gold, stats and achievements are kept. */
  abandonRun() {
    this.settleRun();
  }

  private finishRun() {
    this.state = 'over';
    music.setIntensity(0);
    const settled = this.settleRun() ?? { gold: 0, newBest: false };
    const damage = [...this.damageBy.entries()]
      .map(([id, value]) => ({ id, value, evolved: !!this.weapons.find((w) => w.id === id)?.evolved }))
      .sort((a, b) => b.value - a.value);
    this.scene.pause();
    this.ui()?.showResult({
      win: this.endWin, mode: this.mode, bossWave: this.director.bossWave, time: this.elapsed, level: this.level, kills: this.kills,
      gold: settled.gold, totalGold: loadSave().gold, newBest: settled.newBest, damage,
      achievements: this.runAchievements,
      board: { mode: this.mode, map: this.mapDef.id, char: this.charId, time: this.elapsed, kills: this.kills, level: this.level, win: this.endWin },
    });
  }

  // ================================================================ effects

  burst(x: number, y: number, color: number, count: number) {
    let em = this.emitters.get(color);
    if (!em) {
      em = this.add.particles(0, 0, 'spark', {
        lifespan: { min: 220, max: 520 },
        speed: { min: 50, max: 260 },
        scale: { start: 1.3 * texScale(), end: 0 },
        alpha: { start: 1, end: 0 },
        blendMode: Phaser.BlendModes.ADD,
        tint: color,
        emitting: false,
      }).setDepth(35);
      this.emitters.set(color, em);
    }
    em.explode(count, x, y);
  }

  addRing(x: number, y: number, radius: number, color: number, dur: number) {
    const f = this.fxPool.get();
    const s = (radius / 110) * texScale();
    f.life = f.maxLife = dur;
    f.s0 = s * 0.25;
    f.s1 = s;
    f.a0 = 0.9;
    f.sprite.setPosition(x, y).setTint(color).setScale(f.s0).setAlpha(f.a0);
  }

  addBeam(x: number, y: number, ang: number, len: number, width: number, color: number, alpha: number) {
    this.beams.push({ x, y, ang, len, width, color, alpha });
  }

  addLightning(pts: number[], color: number) {
    const jag: number[] = [];
    for (let i = 0; i < pts.length - 2; i += 2) {
      const x0 = pts[i], y0 = pts[i + 1], x1 = pts[i + 2], y1 = pts[i + 3];
      const nx = -(y1 - y0), ny = x1 - x0;
      const len = Math.hypot(nx, ny) || 1;
      if (i === 0) jag.push(x0, y0);
      const segs = 4;
      for (let s = 1; s < segs; s++) {
        const t = s / segs;
        const off = (Math.random() - 0.5) * Math.min(26, len * 0.25);
        jag.push(x0 + (x1 - x0) * t + (nx / len) * off, y0 + (y1 - y0) * t + (ny / len) * off);
      }
      jag.push(x1, y1);
      this.burst(x1, y1, color, 3);
    }
    this.lightning.push({ pts: jag, life: 0.2, max: 0.2, color });
  }

  number(x: number, y: number, v: number, color = '#ffffff') {
    let n = this.numbers.find((q) => !q.alive);
    if (!n) {
      if (this.numbers.length >= 70) return;
      const text = this.add.text(0, 0, '', {
        fontFamily: FONT, fontSize: '15px', fontStyle: 'bold', color: '#ffffff', stroke: '#07060f', strokeThickness: 3, resolution: res(),
      }).setOrigin(0.5).setDepth(50);
      n = { text, life: 0, alive: false };
      this.numbers.push(n);
    }
    n.alive = true;
    n.life = 0.6;
    n.text.setText(String(Math.max(1, Math.round(v)))).setColor(color)
      .setPosition(x + (Math.random() - 0.5) * 14, y).setAlpha(1).setVisible(true)
      .setScale(v >= 100 ? 1.35 : v >= 40 ? 1.15 : 1);
  }

  private updateFx(dt: number) {
    for (const n of this.numbers) {
      if (!n.alive) continue;
      n.life -= dt;
      n.text.y -= 38 * dt;
      n.text.setAlpha(Math.min(1, n.life / 0.25));
      if (n.life <= 0) {
        n.alive = false;
        n.text.setVisible(false);
      }
    }

    for (const f of this.fxPool.active) {
      f.life -= dt;
      if (f.life <= 0) {
        f.alive = false;
        continue;
      }
      const k = 1 - f.life / f.maxLife;
      const ease = 1 - (1 - k) * (1 - k);
      f.sprite.setScale(f.s0 + (f.s1 - f.s0) * ease).setAlpha(f.a0 * (1 - k));
    }
    this.fxPool.compact();

    const g = this.fx;
    g.clear();
    for (let i = this.lightning.length - 1; i >= 0; i--) {
      const l = this.lightning[i];
      l.life -= dt;
      if (l.life <= 0) {
        this.lightning.splice(i, 1);
        continue;
      }
      const a = l.life / l.max;
      g.lineStyle(7, l.color, 0.25 * a);
      g.strokePoints(this.toPoints(l.pts), false);
      g.lineStyle(2, 0xffffff, a);
      g.strokePoints(this.toPoints(l.pts), false);
    }
    for (const b of this.beams) {
      const x1 = b.x + Math.cos(b.ang) * b.len;
      const y1 = b.y + Math.sin(b.ang) * b.len;
      g.lineStyle(b.width * 2.4, b.color, 0.22 * b.alpha);
      g.lineBetween(b.x, b.y, x1, y1);
      g.lineStyle(b.width * 1.1, b.color, 0.6 * b.alpha);
      g.lineBetween(b.x, b.y, x1, y1);
      g.lineStyle(Math.max(1.5, b.width * 0.35), 0xffffff, 0.95 * b.alpha);
      g.lineBetween(b.x, b.y, x1, y1);
    }
    this.beams.length = 0;
    for (const b of this.bosses) {
      if (b.telegraph > 0) {
        const pulse = 0.35 + 0.35 * Math.sin(this.elapsed * 30);
        g.lineStyle(10, COLORS.boss, 0.15 + pulse * 0.3);
        g.lineBetween(b.x, b.y, b.x + b.dvx * 0.6, b.y + b.dvy * 0.6);
      }
    }

    const o = this.overlay;
    o.clear();
    if (this.state === 'playing' || this.state === 'modal' || this.state === 'paused') {
      const w = 38;
      const ratio = Phaser.Math.Clamp(this.hp / this.stats.maxHp, 0, 1);
      o.fillStyle(0x000000, 0.6).fillRect(this.px - w / 2 - 1, this.py + 21, w + 2, 6);
      o.fillStyle(ratio > 0.3 ? COLORS.hp : 0xff2020, 1).fillRect(this.px - w / 2, this.py + 22, w * ratio, 4);
    }
  }

  private toPoints(flat: number[]): Phaser.Types.Math.Vector2Like[] {
    const out: Phaser.Types.Math.Vector2Like[] = [];
    for (let i = 0; i < flat.length; i += 2) out.push({ x: flat[i], y: flat[i + 1] });
    return out;
  }
}
