import Phaser from 'phaser';
import { META_DEFS, metaCost } from '../game/data';
import { COLORS } from '../game/palette';
import { sfx } from '../game/audio';
import { loadSave, writeSave } from '../game/save';
import { formatTime, glowText, makeButton, panel, style } from '../ui/widgets';

interface Drifter {
  img: Phaser.GameObjects.Image;
  vx: number;
  vy: number;
  spin: number;
}

export class MenuScene extends Phaser.Scene {
  private bg!: Phaser.GameObjects.TileSprite;
  private drifters: Drifter[] = [];
  private main!: Phaser.GameObjects.Container;
  private shop: Phaser.GameObjects.Container | null = null;

  constructor() {
    super('Menu');
  }

  create() {
    this.drifters = [];
    this.shop = null;
    this.bg = this.add.tileSprite(0, 0, this.scale.width, this.scale.height, 'grid').setOrigin(0);
    const kinds = ['e_chaser', 'e_bat', 'e_brute', 'gem1', 'gem2', 'blade', 'disc'];
    for (let i = 0; i < 36; i++) {
      const img = this.add.image(
        Math.random() * this.scale.width,
        Math.random() * this.scale.height,
        kinds[i % kinds.length],
      ).setAlpha(0.18 + Math.random() * 0.2).setBlendMode(Phaser.BlendModes.ADD).setScale(0.8 + Math.random() * 0.8);
      this.drifters.push({ img, vx: (Math.random() - 0.5) * 30, vy: (Math.random() - 0.5) * 30, spin: (Math.random() - 0.5) * 1.5 });
    }

    this.buildMain();
    this.scale.on('resize', this.onResize, this);
    this.events.once('shutdown', () => this.scale.off('resize', this.onResize, this));
    this.input.keyboard!.on('keydown', (ev: KeyboardEvent) => {
      const k = ev.key.toLowerCase();
      if ((k === 'enter' || k === ' ') && !this.shop) this.startGame();
      if (k === 'escape' && this.shop) this.closeShop();
      if (k === 'm') this.toggleMute();
    });
  }

  private onResize() {
    this.bg.setSize(this.scale.width, this.scale.height);
    this.buildMain();
    if (this.shop) this.openShop();
  }

  private buildMain() {
    this.main?.destroy();
    const w = this.scale.width;
    const h = this.scale.height;
    const save = loadSave();
    const c = this.add.container(0, 0);
    this.main = c;

    const titleSize = Math.min(76, w / 7);
    const cy = h * 0.3;
    const title = glowText(this.add.text(w / 2, cy, '霓虹幸存者', style(titleSize, COLORS.player, true)).setOrigin(0.5), COLORS.player, 26);
    c.add(title);
    this.tweens.add({ targets: title, scale: 1.03, duration: 1400, yoyo: true, repeat: -1, ease: 'Sine.InOut' });
    c.add(glowText(this.add.text(w / 2, cy + titleSize * 0.8, 'N E O N   S U R V I V O R S', style(Math.min(20, w / 26), COLORS.orbit, true)).setOrigin(0.5), COLORS.orbit, 10));

    const by = h * 0.56;
    c.add(makeButton(this, w / 2, by, 240, 54, '开始游戏', () => this.startGame(), COLORS.player, 24));
    c.add(makeButton(this, w / 2, by + 70, 240, 46, '局外强化', () => this.openShop(), COLORS.coin, 20));
    c.add(makeButton(this, w / 2, by + 128, 240, 38, save.muted ? '声音：关' : '声音：开', () => this.toggleMute(), COLORS.dim, 16));

    c.add(glowText(this.add.text(w - 20, 18, `金币 ${save.gold}`, style(20, COLORS.coin, true)).setOrigin(1, 0), COLORS.coin, 8));
    const b = save.best;
    if (b.time > 0) {
      c.add(this.add.text(w / 2, h - 56, `最长存活 ${formatTime(b.time)}  ·  最多击杀 ${b.kills}  ·  最高等级 ${b.level}  ·  通关 ${b.wins} 次`, {
        ...style(13, COLORS.dim), align: 'center', wordWrap: { width: w - 32, useAdvancedWrap: true },
      }).setOrigin(0.5, 1));
    }
    c.add(this.add.text(w / 2, h - 30,
      w < 600 ? '触屏拖动移动 · 武器自动攻击' : 'WASD / 方向键 移动  ·  武器自动攻击  ·  Esc 暂停  ·  M 静音  ·  存活 10 分钟并击败最终首领',
      style(14, COLORS.dim)).setOrigin(0.5));
  }

  private toggleMute() {
    const save = loadSave();
    save.muted = !save.muted;
    sfx.setMuted(save.muted);
    writeSave();
    this.buildMain();
  }

  private startGame() {
    sfx.unlock();
    this.scene.start('Game');
  }

  private closeShop() {
    this.shop?.destroy();
    this.shop = null;
  }

  private openShop() {
    this.shop?.destroy();
    const w = this.scale.width;
    const h = this.scale.height;
    const save = loadSave();
    const c = this.add.container(0, 0).setDepth(50);
    this.shop = c;
    c.add(this.add.rectangle(0, 0, w, h, 0x000000, 0.7).setOrigin(0).setInteractive());

    const rowH = 58;
    const pw = Math.min(620, w - 24);
    const ph = Math.min(h - 24, 130 + META_DEFS.length * rowH + 60);
    const top = h / 2 - ph / 2;
    c.add(panel(this, w / 2, h / 2, pw, ph, COLORS.coin));
    c.add(glowText(this.add.text(w / 2, top + 36, '局外强化', style(30, COLORS.coin, true)).setOrigin(0.5), COLORS.coin, 12));
    c.add(this.add.text(w / 2, top + 70, `持有金币 ${save.gold}  ·  每局结束时根据表现获得金币`, style(14, COLORS.dim)).setOrigin(0.5));

    const scale = Math.min(1, (ph - 160) / (META_DEFS.length * rowH));
    const rh = rowH * scale;
    META_DEFS.forEach((def, i) => {
      const y = top + 108 + i * rh + rh / 2;
      const left = w / 2 - pw / 2 + 24;
      const rank = save.meta[def.id] ?? 0;
      const maxed = rank >= def.maxRank;
      const cost = metaCost(def, rank);
      c.add(this.add.image(left + 18, y, def.icon).setDisplaySize(38 * scale, 38 * scale));
      c.add(this.add.text(left + 46, y - 10 * scale, def.name, style(17 * scale + 2, COLORS.text, true)).setOrigin(0, 0.5));
      c.add(this.add.text(left + 46, y + 11 * scale, def.desc, style(13 * scale + 1, COLORS.dim)).setOrigin(0, 0.5));
      // rank pips
      const pipX = left + Math.min(230, pw * 0.42);
      for (let r = 0; r < def.maxRank; r++) {
        c.add(this.add.rectangle(pipX + r * 16, y, 11, 11, r < rank ? COLORS.coin : 0x000000, r < rank ? 1 : 0.5)
          .setStrokeStyle(1, COLORS.coin, 0.7));
      }
      const btn = makeButton(this, w / 2 + pw / 2 - 74, y, 108, Math.min(38, rh - 10), maxed ? '已满' : `${cost} 金`, () => {
        const s = loadSave();
        const cur = s.meta[def.id] ?? 0;
        const price = metaCost(def, cur);
        if (cur >= def.maxRank || s.gold < price) return;
        s.gold -= price;
        s.meta[def.id] = cur + 1;
        writeSave();
        sfx.play('levelup');
        this.buildMain();
        this.openShop();
      }, maxed ? COLORS.dim : COLORS.coin, 15);
      btn.setEnabled(!maxed && save.gold >= cost);
      c.add(btn);
    });

    c.add(makeButton(this, w / 2, top + ph - 36, 160, 40, '返回', () => this.closeShop(), COLORS.player, 18));
  }

  update(_t: number, deltaMs: number) {
    const dt = deltaMs / 1000;
    this.bg.tilePositionX += 12 * dt;
    this.bg.tilePositionY += 8 * dt;
    const w = this.scale.width;
    const h = this.scale.height;
    for (const d of this.drifters) {
      d.img.x += d.vx * dt;
      d.img.y += d.vy * dt;
      d.img.rotation += d.spin * dt;
      if (d.img.x < -40) d.img.x = w + 40;
      if (d.img.x > w + 40) d.img.x = -40;
      if (d.img.y < -40) d.img.y = h + 40;
      if (d.img.y > h + 40) d.img.y = -40;
    }
  }
}
