import Phaser from 'phaser';
import { CHARACTERS, ITEMS, META_DEFS, charModLines, metaCost, type CharId } from '../game/data';
import { COLORS } from '../game/palette';
import { sfx } from '../game/audio';
import { music } from '../game/music';
import { loadSave, writeSave } from '../game/save';
import {
  ACHIEVEMENTS, ACHIEVEMENT_BY_ID, charUnlockedBy, checkAchievements, isCharUnlocked, isDone,
} from '../game/achievements';
import { formatTime, glowText, makeButton, panel, style } from '../ui/widgets';

interface Drifter {
  img: Phaser.GameObjects.Image;
  vx: number;
  vy: number;
  spin: number;
}

type OverlayKind = 'shop' | 'chars' | 'achievements';

export class MenuScene extends Phaser.Scene {
  private bg!: Phaser.GameObjects.TileSprite;
  private drifters: Drifter[] = [];
  private main!: Phaser.GameObjects.Container;
  private overlay: Phaser.GameObjects.Container | null = null;
  private overlayKind: OverlayKind | null = null;
  private achPage = 0;
  private notice = '';

  constructor() {
    super('Menu');
  }

  create() {
    this.drifters = [];
    this.overlay = null;
    this.overlayKind = null;
    this.achPage = 0;
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

    music.setIntensity(0);
    music.setDuck(1);

    // catch achievements earned before they existed (older saves) or while leaving a run
    const fresh = checkAchievements(null);
    this.notice = fresh.length
      ? `达成 ${fresh.length} 个成就，获得 ${fresh.reduce((s, a) => s + a.gold, 0)} 金币`
      : '';

    this.buildMain();
    this.scale.on('resize', this.onResize, this);
    this.events.once('shutdown', () => this.scale.off('resize', this.onResize, this));
    this.input.keyboard!.on('keydown', (ev: KeyboardEvent) => this.onKey(ev.key.toLowerCase()));
  }

  private onKey(k: string) {
    if (k === 'm') return this.toggleMute();
    if (k === 'escape' && this.overlay) return this.closeOverlay();
    if (this.overlayKind === 'chars') {
      if (k === 'enter' || k === ' ') this.startGame();
      else if (['arrowleft', 'arrowup', 'a', 'w'].includes(k)) this.cycleChar(-1);
      else if (['arrowright', 'arrowdown', 'd', 's'].includes(k)) this.cycleChar(1);
      return;
    }
    if (!this.overlay && (k === 'enter' || k === ' ')) this.openOverlay('chars');
  }

  private onResize() {
    this.bg.setSize(this.scale.width, this.scale.height);
    this.buildMain();
    if (this.overlayKind) this.openOverlay(this.overlayKind);
  }

  private buildMain() {
    this.main?.destroy();
    const w = this.scale.width;
    const h = this.scale.height;
    const save = loadSave();
    const c = this.add.container(0, 0);
    this.main = c;

    const titleSize = Math.min(76, w / 7);
    const cy = h * 0.26;
    const title = glowText(this.add.text(w / 2, cy, '霓虹幸存者', style(titleSize, COLORS.player, true)).setOrigin(0.5), COLORS.player, 26);
    c.add(title);
    this.tweens.add({ targets: title, scale: 1.03, duration: 1400, yoyo: true, repeat: -1, ease: 'Sine.InOut' });
    c.add(glowText(this.add.text(w / 2, cy + titleSize * 0.8, 'N E O N   S U R V I V O R S', style(Math.min(20, w / 26), COLORS.orbit, true)).setOrigin(0.5), COLORS.orbit, 10));

    const by = h * 0.5;
    const done = save.achievements.length;
    c.add(makeButton(this, w / 2, by, 240, 54, '开始游戏', () => this.openOverlay('chars'), COLORS.player, 24));
    c.add(makeButton(this, w / 2, by + 66, 240, 44, '局外强化', () => this.openOverlay('shop'), COLORS.coin, 19));
    c.add(makeButton(this, w / 2, by + 120, 240, 44, `成就  ${done}/${ACHIEVEMENTS.length}`, () => this.openOverlay('achievements'), COLORS.elite, 19));
    c.add(makeButton(this, w / 2 - 61, by + 170, 118, 36, save.muted ? '声音：关' : '声音：开', () => this.toggleMute(), COLORS.dim, 15));
    c.add(makeButton(this, w / 2 + 61, by + 170, 118, 36, save.music ? '音乐：开' : '音乐：关', () => this.toggleMusic(), COLORS.dim, 15));

    c.add(glowText(this.add.text(w - 20, 18, `金币 ${save.gold}`, style(20, COLORS.coin, true)).setOrigin(1, 0), COLORS.coin, 8));
    if (this.notice) {
      const n = glowText(this.add.text(w / 2, by - 44, `★ ${this.notice}`, style(15, COLORS.elite, true)).setOrigin(0.5), COLORS.elite, 8);
      c.add(n);
      this.tweens.add({ targets: n, alpha: 0, delay: 4000, duration: 800, onComplete: () => { this.notice = ''; } });
    }
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
    music.applyVolume();
    writeSave();
    this.buildMain();
  }

  private toggleMusic() {
    const save = loadSave();
    save.music = !save.music;
    sfx.unlock();
    music.start();
    music.setEnabled(save.music);
    writeSave();
    this.buildMain();
  }

  private startGame() {
    const char = loadSave().selectedChar;
    if (!isCharUnlocked(char)) return;
    sfx.unlock();
    this.scene.start('Game', { char });
  }

  // ================================================================ overlays

  private closeOverlay() {
    this.overlay?.destroy();
    this.overlay = null;
    this.overlayKind = null;
    this.main.setVisible(true);
  }

  private openOverlay(kind: OverlayKind) {
    this.overlay?.destroy();
    const w = this.scale.width;
    const h = this.scale.height;
    const c = this.add.container(0, 0).setDepth(50);
    c.add(this.add.rectangle(0, 0, w, h, 0x000000, 0.72).setOrigin(0).setInteractive());
    this.overlay = c;
    this.overlayKind = kind;
    this.main.setVisible(false);
    if (kind === 'shop') this.buildShop(c, w, h);
    else if (kind === 'chars') this.buildChars(c, w, h);
    else this.buildAchievements(c, w, h);
  }

  // ---------------------------------------------------------------- characters

  private selectChar(id: CharId) {
    const save = loadSave();
    if (!isCharUnlocked(id) || save.selectedChar === id) return;
    save.selectedChar = id;
    writeSave();
    sfx.play('select');
    this.openOverlay('chars');
  }

  private cycleChar(dir: number) {
    const unlocked = CHARACTERS.filter((ch) => isCharUnlocked(ch.id));
    const i = unlocked.findIndex((ch) => ch.id === loadSave().selectedChar);
    this.selectChar(unlocked[(i + dir + unlocked.length) % unlocked.length].id);
  }

  private buildChars(c: Phaser.GameObjects.Container, w: number, h: number) {
    const save = loadSave();
    if (!isCharUnlocked(save.selectedChar)) save.selectedChar = 'runner';
    const wide = w >= 900;
    const titleY = wide ? h * 0.12 : 40;
    c.add(glowText(this.add.text(w / 2, titleY, '选择角色', style(wide ? 36 : 28, COLORS.player, true)).setOrigin(0.5), COLORS.player, 14));
    c.add(this.add.text(w / 2, titleY + (wide ? 36 : 28), wide ? '点击选择 · ←/→ 切换 · Enter 出发' : '点击选择角色', style(13, COLORS.dim)).setOrigin(0.5));

    const n = CHARACTERS.length;
    CHARACTERS.forEach((ch, i) => {
      const unlocked = isCharUnlocked(ch.id);
      const selected = save.selectedChar === ch.id;
      let cw: number, chh: number, x: number, y: number;
      if (wide) {
        const gap = 14;
        cw = Math.min(200, (w - 60 - gap * (n - 1)) / n);
        chh = 320;
        x = w / 2 - ((n - 1) * (cw + gap)) / 2 + i * (cw + gap);
        y = titleY + 70 + chh / 2;
      } else {
        cw = Math.min(460, w - 24);
        chh = Math.min(96, (h - titleY - 150) / n - 8);
        x = w / 2;
        y = titleY + 58 + chh / 2 + i * (chh + 8);
      }
      const card = this.add.container(x, y);
      const edge = selected ? ch.color : unlocked ? COLORS.panelEdge : 0x2a2650;
      const bg = this.add.rectangle(0, 0, cw, chh, COLORS.panel, 0.96).setStrokeStyle(selected ? 3 : 2, edge, 1);
      card.add(bg);
      if (selected) card.add(this.add.rectangle(0, 0, cw, chh, ch.color, 0.1).setBlendMode(Phaser.BlendModes.ADD));
      bg.setInteractive({ useHandCursor: unlocked });
      bg.on('pointerdown', () => this.selectChar(ch.id));

      const weapon = ITEMS[ch.weapon];
      const lines = charModLines(ch.mods);
      const unlockAch = ch.unlock ? ACHIEVEMENT_BY_ID[ch.unlock] : null;
      if (wide) {
        card.add(this.add.image(0, -chh / 2 + 56, `player_${ch.id}`).setScale(2.2).setAlpha(unlocked ? 1 : 0.25));
        if (!unlocked) card.add(this.add.image(0, -chh / 2 + 56, 'icon_lock').setDisplaySize(40, 40));
        card.add(glowText(this.add.text(0, -chh / 2 + 118, ch.name, style(20, unlocked ? ch.color : COLORS.dim, true)).setOrigin(0.5), ch.color, unlocked ? 8 : 0));
        card.add(this.add.text(0, -chh / 2 + 146, ch.desc, { ...style(13, COLORS.dim), align: 'center', wordWrap: { width: cw - 20, useAdvancedWrap: true } }).setOrigin(0.5, 0));
        card.add(this.add.image(-cw / 2 + 30, -chh / 2 + 196, weapon.icon).setDisplaySize(26, 26).setAlpha(unlocked ? 1 : 0.4));
        card.add(this.add.text(-cw / 2 + 50, -chh / 2 + 196, `初始：${weapon.name}`, style(13, unlocked ? COLORS.text : COLORS.dim)).setOrigin(0, 0.5));
        card.add(this.add.text(0, -chh / 2 + 220, lines.length ? lines.join('\n') : '无属性修正', { ...style(13, unlocked ? COLORS.text : COLORS.dim), align: 'center', lineSpacing: 4 }).setOrigin(0.5, 0));
        if (!unlocked && unlockAch) {
          card.add(this.add.text(0, chh / 2 - 12, `解锁：${unlockAch.desc}`, { ...style(12, COLORS.elite), align: 'center', wordWrap: { width: cw - 16, useAdvancedWrap: true } }).setOrigin(0.5, 1));
        } else if (selected) {
          card.add(this.add.text(0, chh / 2 - 14, '✓ 已选择', style(14, ch.color, true)).setOrigin(0.5, 1));
        }
      } else {
        const left = -cw / 2;
        card.add(this.add.image(left + 36, 0, `player_${ch.id}`).setScale(1.5).setAlpha(unlocked ? 1 : 0.25));
        if (!unlocked) card.add(this.add.image(left + 36, 0, 'icon_lock').setDisplaySize(32, 32));
        card.add(this.add.text(left + 70, -chh / 2 + 10, ch.name, style(17, unlocked ? ch.color : COLORS.dim, true)));
        card.add(this.add.image(cw / 2 - 20, -chh / 2 + 20, weapon.icon).setDisplaySize(24, 24).setAlpha(unlocked ? 1 : 0.4));
        const sub = !unlocked && unlockAch ? `解锁：${unlockAch.desc}` : `${lines.join(' · ') || '均衡，无属性修正'}`;
        card.add(this.add.text(left + 70, -chh / 2 + 36, sub, {
          ...style(12, !unlocked ? COLORS.elite : COLORS.text), wordWrap: { width: cw - 90, useAdvancedWrap: true },
        }));
        if (selected) card.add(this.add.text(cw / 2 - 10, chh / 2 - 6, '✓', style(16, ch.color, true)).setOrigin(1, 1));
      }
      c.add(card);
    });

    const cur = CHARACTERS.find((ch) => ch.id === save.selectedChar)!;
    const btnY = wide ? Math.min(h - 50, titleY + 70 + 320 + 56) : h - 44;
    c.add(makeButton(this, w / 2 - 96, btnY, 170, 48, '返回', () => this.closeOverlay(), COLORS.dim, 18));
    c.add(makeButton(this, w / 2 + 96, btnY, 170, 48, `出发 · ${cur.name}`, () => this.startGame(), cur.color, 18));
  }

  // ---------------------------------------------------------------- achievements

  private buildAchievements(c: Phaser.GameObjects.Container, w: number, h: number) {
    const save = loadSave();
    const pw = Math.min(640, w - 24);
    const rowH = 56;
    const perPage = Math.max(3, Math.min(ACHIEVEMENTS.length, Math.floor((h - 24 - 190) / rowH)));
    const pages = Math.ceil(ACHIEVEMENTS.length / perPage);
    this.achPage = Math.min(this.achPage, pages - 1);
    const ph = Math.min(h - 24, 190 + perPage * rowH);
    const top = h / 2 - ph / 2;
    c.add(panel(this, w / 2, h / 2, pw, ph, COLORS.elite));
    c.add(glowText(this.add.text(w / 2, top + 36, '成就', style(30, COLORS.elite, true)).setOrigin(0.5), COLORS.elite, 12));
    c.add(this.add.text(w / 2, top + 68, `已完成 ${save.achievements.length} / ${ACHIEVEMENTS.length}  ·  完成后立即获得奖励`, style(13, COLORS.dim)).setOrigin(0.5));

    const left = w / 2 - pw / 2 + 20;
    const right = w / 2 + pw / 2 - 20;
    ACHIEVEMENTS.slice(this.achPage * perPage, (this.achPage + 1) * perPage).forEach((a, i) => {
      const y = top + 100 + i * rowH + rowH / 2;
      const done = isDone(a.id);
      const unlock = charUnlockedBy(a.id);
      const cur = Math.min(a.target, a.value(save, null));
      c.add(this.add.image(left + 20, y, done ? 'icon_trophy' : 'icon_trophy_off').setDisplaySize(38, 38));
      c.add(this.add.text(left + 48, y - 16, a.name, style(16, done ? COLORS.elite : COLORS.text, true)));
      c.add(this.add.text(left + 48, y + 4, a.desc, style(12, COLORS.dim)));
      const reward = unlock ? `+${a.gold} 金 · 解锁${unlock.name}` : `+${a.gold} 金`;
      c.add(this.add.text(right, y - 14, reward, style(12, unlock ? unlock.color : COLORS.coin)).setOrigin(1, 0));
      if (done) {
        c.add(this.add.text(right, y + 4, '✓ 已完成', style(12, COLORS.elite, true)).setOrigin(1, 0));
      } else {
        const bw = Math.min(140, pw * 0.25);
        c.add(this.add.rectangle(right - bw, y + 11, bw, 6, 0x000000, 0.6).setOrigin(0, 0.5));
        c.add(this.add.rectangle(right - bw, y + 11, Math.max(1, (bw * cur) / a.target), 6, COLORS.elite, 0.9).setOrigin(0, 0.5));
        const fmt = (v: number) => (a.id === 'survive8' ? formatTime(v) : v.toLocaleString());
        c.add(this.add.text(right - bw - 8, y + 11, `${fmt(cur)}/${fmt(a.target)}`, style(11, COLORS.dim)).setOrigin(1, 0.5));
      }
    });

    const by = top + ph - 36;
    if (pages > 1) {
      c.add(this.add.text(w / 2, by - 36, `${this.achPage + 1} / ${pages}`, style(13, COLORS.dim)).setOrigin(0.5));
      const prev = makeButton(this, w / 2 - 150, by, 100, 38, '上一页', () => { this.achPage--; this.openOverlay('achievements'); }, COLORS.dim, 15);
      const next = makeButton(this, w / 2 + 150, by, 100, 38, '下一页', () => { this.achPage++; this.openOverlay('achievements'); }, COLORS.dim, 15);
      prev.setEnabled(this.achPage > 0);
      next.setEnabled(this.achPage < pages - 1);
      c.add([prev, next]);
    }
    c.add(makeButton(this, w / 2, by, 140, 40, '返回', () => this.closeOverlay(), COLORS.player, 18));
  }

  // ---------------------------------------------------------------- shop

  private buildShop(c: Phaser.GameObjects.Container, w: number, h: number) {
    const save = loadSave();
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
        this.openOverlay('shop');
      }, maxed ? COLORS.dim : COLORS.coin, 15);
      btn.setEnabled(!maxed && save.gold >= cost);
      c.add(btn);
    });

    c.add(makeButton(this, w / 2, top + ph - 36, 160, 40, '返回', () => this.closeOverlay(), COLORS.player, 18));
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
