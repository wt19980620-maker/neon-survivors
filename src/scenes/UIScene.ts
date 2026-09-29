import Phaser from 'phaser';
import { EVOLUTIONS, ITEMS, RUN_LENGTH, WEAPON_IDS, xpToNext } from '../game/data';
import { COLORS, hex } from '../game/palette';
import { sfx } from '../game/audio';
import { music } from '../game/music';
import { inputState } from '../game/input';
import { loadSave, writeSave } from '../game/save';
import { formatTime, glowText, makeButton, panel, style } from '../ui/widgets';
import { canSplit, fitCamera, isShort, res, safeArea, vh, vw, type Insets } from '../ui/screen';
import { charUnlockedBy, type AchievementDef } from '../game/achievements';
import type { GameScene, RunResult, UpgradeOption } from './GameScene';

type ModalKind = 'level' | 'pause' | 'result';

const JOY_R = 56;

export class UIScene extends Phaser.Scene {
  private gs!: GameScene;
  private xpBar!: Phaser.GameObjects.Graphics;
  private levelText!: Phaser.GameObjects.Text;
  private timerText!: Phaser.GameObjects.Text;
  private killText!: Phaser.GameObjects.Text;
  private goldText!: Phaser.GameObjects.Text;
  private icons!: Phaser.GameObjects.Container;
  private iconSig = '';
  private bossBar!: Phaser.GameObjects.Graphics;
  private bossName!: Phaser.GameObjects.Text;
  private bannerText!: Phaser.GameObjects.Text;
  private vignette!: Phaser.GameObjects.Graphics;
  private joy!: Phaser.GameObjects.Graphics;
  private pauseBtn!: Phaser.GameObjects.Container;

  private modal: Phaser.GameObjects.Container | null = null;
  private modalKind: ModalKind | null = null;
  private rebuildModal: (() => void) | null = null;
  private pick: ((i: number) => void) | null = null;
  private primary: (() => void) | null = null;
  private joyBase = { x: 0, y: 0 };
  private joyPointer = -1;
  private toastQueue: AchievementDef[] = [];
  private ins: Insets = { top: 0, right: 0, bottom: 0, left: 0 };
  private toastBusy = false;

  constructor() {
    super('UI');
  }

  create() {
    this.gs = this.scene.get('Game') as GameScene;
    this.modal = null;
    this.modalKind = null;
    this.rebuildModal = null;
    this.pick = null;
    this.primary = null;
    this.iconSig = '';
    this.joyPointer = -1;
    this.toastQueue = [];
    this.toastBusy = false;
    inputState.active = false;

    this.vignette = this.add.graphics().setAlpha(0).setDepth(5);
    this.xpBar = this.add.graphics().setDepth(10);
    this.levelText = glowText(this.add.text(12, 16, 'Lv 1', style(18, COLORS.text, true)), COLORS.xp, 8).setDepth(10);
    this.timerText = glowText(this.add.text(0, 14, '00:00', style(28, COLORS.text, true)).setOrigin(0.5, 0), COLORS.player, 10).setDepth(10);
    this.killText = this.add.text(0, 16, '', style(16, COLORS.text)).setOrigin(1, 0).setDepth(10);
    this.goldText = this.add.text(0, 38, '', style(16, COLORS.coin)).setOrigin(1, 0).setDepth(10);
    this.icons = this.add.container(12, 44).setDepth(10);
    this.bossBar = this.add.graphics().setDepth(10);
    this.bossName = glowText(this.add.text(0, 0, '', style(15, COLORS.boss, true)).setOrigin(0.5, 1), COLORS.boss, 8).setDepth(10);
    this.bannerText = this.add.text(0, 0, '', style(34, COLORS.text, true)).setOrigin(0.5).setAlpha(0).setDepth(20);
    this.joy = this.add.graphics().setDepth(30);
    this.pauseBtn = makeButton(this, 0, 0, 44, 36, 'II', () => this.gs.requestPause(), COLORS.dim, 16).setDepth(10);

    this.input.keyboard!.on('keydown', this.onKey, this);
    this.input.on('pointerdown', this.onPointerDown, this);
    this.input.on('pointermove', this.onPointerMove, this);
    this.input.on('pointerup', this.onPointerUp, this);
    this.input.on('pointerupoutside', this.onPointerUp, this);
    this.scale.on('resize', this.layout, this);
    this.events.once('shutdown', () => {
      this.scale.off('resize', this.layout, this);
      inputState.active = false;
    });
    this.layout();
  }

  // ================================================================ layout / HUD

  private layout() {
    fitCamera(this);
    const w = vw(this);
    const h = vh(this);
    const ins = (this.ins = safeArea());
    this.levelText.setPosition(12 + ins.left, 16 + ins.top);
    this.timerText.setPosition(w / 2, 14 + ins.top);
    this.killText.setPosition(w - 66 - ins.right, 16 + ins.top);
    this.goldText.setPosition(w - 66 - ins.right, 38 + ins.top);
    this.pauseBtn.setPosition(w - 32 - ins.right, 32 + ins.top);
    this.icons.setPosition(12 + ins.left, 44 + ins.top);
    this.bannerText.setPosition(w / 2, h * 0.26).setWordWrapWidth(w - 32, true).setAlign('center');

    const v = this.vignette;
    v.clear();
    for (let i = 0; i < 14; i++) {
      v.lineStyle(8, COLORS.hp, 0.12 * (1 - i / 14));
      v.strokeRect(i * 6, i * 6, w - i * 12, h - i * 12);
    }
    if (this.rebuildModal) this.rebuildModal();
  }

  update() {
    const gs = this.gs;
    if (!gs.stats) return;
    const w = vw(this);

    const need = xpToNext(gs.level);
    const ratio = Phaser.Math.Clamp(gs.xp / need, 0, 1);
    const g = this.xpBar;
    g.clear();
    const top = this.ins.top;
    g.fillStyle(0x000000, 0.55).fillRect(0, top, w, 9);
    g.fillStyle(COLORS.xp, 1).fillRect(0, top, w * ratio, 9);
    g.fillStyle(0xffffff, 0.35).fillRect(0, top, w * ratio, 2);

    this.levelText.setText(`Lv ${gs.level}`);
    const t = gs.elapsed;
    this.timerText.setText(formatTime(t));
    this.timerText.setColor(t >= RUN_LENGTH ? '#ff5c8a' : '#e8e6ff');
    this.killText.setText(`击杀 ${gs.kills}`);
    this.goldText.setText(`金币 ${gs.coins}`);

    const sig = [...gs.itemLevels.entries()].map(([k, v]) => k + v).join(',')
      + gs.weapons.map((w) => (w.evolved ? 'E' : '')).join('');
    if (sig !== this.iconSig) {
      this.iconSig = sig;
      this.buildIcons();
    }

    const bb = this.bossBar;
    bb.clear();
    const boss = gs.bosses.find((b) => b.alive);
    if (boss) {
      const bw = Math.min(460, w * 0.6);
      const x = (w - bw) / 2;
      const y = 74 + this.ins.top;
      bb.fillStyle(0x000000, 0.6).fillRect(x - 2, y - 2, bw + 4, 14);
      bb.fillStyle(COLORS.boss, 1).fillRect(x, y, bw * Phaser.Math.Clamp(boss.hp / boss.maxHp, 0, 1), 10);
      bb.lineStyle(1, 0xffffff, 0.5).strokeRect(x - 2, y - 2, bw + 4, 14);
      this.bossName.setText(boss.finalBoss ? '虚空之主' : '猩红守望者').setPosition(w / 2, y - 4).setVisible(true);
    } else {
      this.bossName.setVisible(false);
    }
  }

  private buildIcons() {
    this.icons.removeAll(true);
    const gs = this.gs;
    const size = 32;
    const gap = 4;
    const put = (id: string, lvl: number, col: number, row: number) => {
      const def = ITEMS[id as keyof typeof ITEMS];
      const x = col * (size + gap) + size / 2;
      const y = row * (size + gap) + size / 2;
      const img = this.add.image(x, y, def.icon).setDisplaySize(size, size);
      const lv = this.add.text(x + size / 2 - 2, y + size / 2 - 1, lvl >= def.maxLevel ? 'M' : String(lvl), style(11, lvl >= def.maxLevel ? COLORS.coin : COLORS.text, true))
        .setOrigin(1, 1).setStroke('#07060f', 3);
      this.icons.add([img, lv]);
    };
    gs.weapons.forEach((wp, i) => {
      if (!wp.evolved) return put(wp.id, wp.level, i, 0);
      const x = i * (size + gap) + size / 2;
      const y = size / 2;
      this.icons.add([
        this.add.image(x, y, EVOLUTIONS[wp.id].icon).setDisplaySize(size, size),
        this.add.text(x + size / 2 - 2, y + size / 2 - 1, '★', style(11, COLORS.elite, true)).setOrigin(1, 1).setStroke('#07060f', 3),
      ]);
    });
    gs.passiveOrder.forEach((id, i) => put(id, gs.itemLevels.get(id) ?? 0, i, 1));
  }

  banner(text: string, big = false, color?: number) {
    const b = this.bannerText;
    this.tweens.killTweensOf(b);
    const c = color ?? (big ? COLORS.boss : COLORS.coin);
    const narrow = vw(this) < 600;
    b.setText(text).setFontSize(big ? (narrow ? 28 : 38) : narrow ? 20 : 28).setColor(hex(c));
    glowText(b, c, 16);
    b.setAlpha(0).setScale(0.8);
    this.tweens.add({ targets: b, alpha: 1, scale: 1, duration: 250, ease: 'Back.Out' });
    this.tweens.add({ targets: b, alpha: 0, delay: 2200, duration: 500 });
  }

  /** Achievement popup, top-right, one at a time. */
  toast(a: AchievementDef) {
    this.toastQueue.push(a);
    if (!this.toastBusy) this.nextToast();
  }

  private nextToast() {
    const a = this.toastQueue.shift();
    if (!a) {
      this.toastBusy = false;
      return;
    }
    this.toastBusy = true;
    const w = vw(this);
    const tw = Math.min(290, w - 24);
    const th = 64;
    const unlock = charUnlockedBy(a.id);
    const x = w - 12 - this.ins.right - tw / 2;
    // on phones the item icons sit under the top-right corner, so drop below them
    const y = (w < 600 ? 150 : 96) + this.ins.top;
    const c = this.add.container(w + tw, y).setDepth(110);
    c.add(this.add.rectangle(0, 0, tw, th, COLORS.panel, 0.96).setStrokeStyle(2, COLORS.elite, 1));
    c.add(this.add.image(-tw / 2 + 32, 0, 'icon_trophy').setDisplaySize(42, 42));
    c.add(this.add.text(-tw / 2 + 62, -th / 2 + 8, '成就达成', style(11, COLORS.dim)));
    c.add(glowText(this.add.text(-tw / 2 + 62, -th / 2 + 22, a.name, style(17, COLORS.elite, true)), COLORS.elite, 6));
    const reward = unlock ? `+${a.gold} 金 · 解锁角色「${unlock.name}」` : `+${a.gold} 金`;
    c.add(this.add.text(-tw / 2 + 62, th / 2 - 8, reward, style(12, unlock ? unlock.color : COLORS.coin)).setOrigin(0, 1));
    sfx.play('chest');
    this.tweens.add({ targets: c, x, duration: 320, ease: 'Cubic.Out' });
    this.tweens.add({
      targets: c, x: w + tw, delay: 3000, duration: 300, ease: 'Cubic.In',
      onComplete: () => {
        c.destroy();
        this.nextToast();
      },
    });
  }

  flashDamage() {
    this.tweens.killTweensOf(this.vignette);
    this.vignette.setAlpha(1);
    this.tweens.add({ targets: this.vignette, alpha: 0, duration: 380 });
  }

  // ================================================================ input

  private onKey(ev: KeyboardEvent) {
    const k = ev.key.toLowerCase();
    if (k === 'm') {
      const save = loadSave();
      save.muted = !save.muted;
      sfx.setMuted(save.muted);
      music.applyVolume();
      writeSave();
      this.banner(save.muted ? '已静音' : '声音开启');
      return;
    }
    if (k === 'escape' || k === 'p') {
      if (this.modalKind === 'pause') this.primary?.();
      else if (!this.modalKind) this.gs.requestPause();
      return;
    }
    if (this.modalKind === 'level' && this.pick) {
      const n = Number(k);
      if (n >= 1 && n <= 4) this.pick(n - 1);
      return;
    }
    if ((k === 'enter' || k === ' ') && this.primary && this.modalKind !== 'level') this.primary();
  }

  /** Pointer coordinates are in physical canvas pixels; the UI is laid out in logical ones. */
  private logical(p: Phaser.Input.Pointer) {
    const r = res();
    return { x: p.x / r, y: p.y / r };
  }

  private onPointerDown(p: Phaser.Input.Pointer, over: Phaser.GameObjects.GameObject[]) {
    if (this.modalKind || over.length > 0 || this.joyPointer !== -1) return;
    if (this.gs.state !== 'playing') return;
    this.joyPointer = p.id;
    const { x, y } = this.logical(p);
    this.joyBase = { x, y };
    inputState.active = true;
    inputState.x = 0;
    inputState.y = 0;
    this.drawJoy(x, y);
  }

  private onPointerMove(p: Phaser.Input.Pointer) {
    if (p.id !== this.joyPointer) return;
    const { x, y } = this.logical(p);
    let dx = x - this.joyBase.x;
    let dy = y - this.joyBase.y;
    const d = Math.hypot(dx, dy);
    if (d > JOY_R) {
      // drag the base along so direction changes stay responsive
      this.joyBase.x += (dx / d) * (d - JOY_R);
      this.joyBase.y += (dy / d) * (d - JOY_R);
      dx = x - this.joyBase.x;
      dy = y - this.joyBase.y;
    }
    const mag = Math.min(1, Math.hypot(dx, dy) / (JOY_R * 0.7));
    const a = Math.atan2(dy, dx);
    inputState.x = d > 4 ? Math.cos(a) * mag : 0;
    inputState.y = d > 4 ? Math.sin(a) * mag : 0;
    this.drawJoy(x, y);
  }

  private onPointerUp(p: Phaser.Input.Pointer) {
    if (p.id !== this.joyPointer) return;
    this.releaseJoy();
  }

  private releaseJoy() {
    this.joyPointer = -1;
    inputState.active = false;
    inputState.x = 0;
    inputState.y = 0;
    this.joy.clear();
  }

  private drawJoy(x: number, y: number) {
    const g = this.joy;
    g.clear();
    g.lineStyle(2, COLORS.player, 0.5).strokeCircle(this.joyBase.x, this.joyBase.y, JOY_R);
    g.fillStyle(COLORS.player, 0.08).fillCircle(this.joyBase.x, this.joyBase.y, JOY_R);
    const dx = x - this.joyBase.x;
    const dy = y - this.joyBase.y;
    const d = Math.min(JOY_R, Math.hypot(dx, dy));
    const a = Math.atan2(dy, dx);
    g.fillStyle(COLORS.player, 0.5).fillCircle(this.joyBase.x + Math.cos(a) * d, this.joyBase.y + Math.sin(a) * d, 22);
  }

  // ================================================================ modals

  private closeModal() {
    this.modal?.destroy();
    this.modal = null;
    this.modalKind = null;
    this.rebuildModal = null;
    this.pick = null;
    this.primary = null;
  }

  private openModal(kind: ModalKind, build: (c: Phaser.GameObjects.Container, w: number, h: number) => void) {
    this.releaseJoy();
    this.tweens.killTweensOf(this.bannerText);
    this.bannerText.setAlpha(0);
    const rebuild = () => {
      this.modal?.destroy();
      const w = vw(this);
      const h = vh(this);
      const c = this.add.container(0, 0).setDepth(100);
      c.add(this.add.rectangle(0, 0, w, h, 0x000000, 0.72).setOrigin(0).setInteractive());
      this.modal = c;
      this.modalKind = kind;
      build(c, w, h);
    };
    this.rebuildModal = rebuild;
    rebuild();
  }

  showLevelUp(kind: 'level' | 'chest' | 'evolve', options: UpgradeOption[], onPick: (o: UpgradeOption) => void) {
    const openedAt = this.time.now;
    let first = true;
    this.openModal('level', (c, w, h) => {
      const narrow = w < 780;
      // landscape phones: shrink the title block and fit the cards to the remaining height
      const short = isShort(h);
      const ins = this.ins;
      const title = kind === 'evolve' ? '进化！' : kind === 'chest' ? '宝箱！' : '升级！';
      const tColor = kind === 'evolve' ? COLORS.elite : kind === 'chest' ? COLORS.chest : COLORS.xp;
      const titleY = ins.top + (short ? 26 : narrow ? Math.max(50, h * 0.12) : h * 0.18);
      c.add(glowText(this.add.text(w / 2, titleY, title, style(short ? 28 : narrow ? 34 : 44, tColor, true)).setOrigin(0.5), tColor, 18));
      if (!short) c.add(this.add.text(w / 2, titleY + (narrow ? 32 : 42), kind === 'evolve' ? '武器与被动产生共鸣，突破极限' : narrow ? '点击选择一项强化' : '选择一项强化  ·  按 1 / 2 / 3 快速选择', style(15, COLORS.dim)).setOrigin(0.5));

      const cards: Phaser.GameObjects.Container[] = [];
      options.forEach((opt, i) => {
        let cw: number, ch: number, cx: number, cy: number;
        if (narrow) {
          cw = Math.min(460, w - 32);
          const top = titleY + (short ? 34 : 70);
          ch = Math.min(116, (h - top - ins.bottom - 8) / options.length - 10);
          cx = w / 2;
          cy = top + ch / 2 + i * (ch + 10);
        } else {
          cw = 236;
          const top = titleY + (short ? 26 : 80);
          ch = Math.min(312, h - top - ins.bottom - 10);
          const gap = 22;
          const total = options.length * cw + (options.length - 1) * gap;
          cx = (w - total) / 2 + cw / 2 + i * (cw + gap);
          cy = short ? top + ch / 2 : Math.min(h * 0.58, top + ch / 2);
        }
        const card = this.makeCard(opt, i, cw, ch, narrow);
        card.setPosition(cx, cy);
        c.add(card);
        cards.push(card);
        card.getAt<Phaser.GameObjects.Rectangle>(0).on('pointerdown', () => this.pick?.(i));
      });

      if (first) {
        first = false;
        cards.forEach((card, i) => {
          const y = card.y;
          card.setAlpha(0).setY(y + 30);
          this.tweens.add({ targets: card, alpha: 1, y, duration: 260, delay: 60 * i, ease: 'Cubic.Out' });
        });
      }
    });

    this.pick = (i: number) => {
      if (i >= options.length) return;
      if (this.time.now - openedAt < 350) return; // guard against mashing through the choice
      sfx.play('select');
      this.closeModal();
      onPick(options[i]);
    };
  }

  private makeCard(opt: UpgradeOption, index: number, cw: number, ch: number, narrow: boolean) {
    const card = this.add.container(0, 0);
    const bg = this.add.rectangle(0, 0, cw, ch, COLORS.panel, 0.96).setStrokeStyle(2, opt.color, 0.9);
    const glow = this.add.rectangle(0, 0, cw, ch, opt.color, 0).setBlendMode(Phaser.BlendModes.ADD);
    card.add([bg, glow]);
    bg.setInteractive({ useHandCursor: true });
    bg.on('pointerover', () => {
      glow.setFillStyle(opt.color, 0.12);
      card.setScale(1.03);
    });
    bg.on('pointerout', () => {
      glow.setFillStyle(opt.color, 0);
      card.setScale(1);
    });

    const evolve = opt.id === 'evolve';
    if (evolve) {
      bg.setStrokeStyle(3, COLORS.elite, 1);
      this.tweens.add({ targets: glow, fillAlpha: 0.14, duration: 700, yoyo: true, repeat: -1, ease: 'Sine.InOut' });
    }
    const lvlColor = evolve ? COLORS.elite : opt.isNew ? COLORS.coin : COLORS.dim;
    if (narrow) {
      const left = -cw / 2;
      card.add(this.add.image(left + 46, 0, opt.icon).setDisplaySize(60, 60));
      card.add(glowText(this.add.text(left + 88, -ch / 2 + 14, opt.name, style(20, opt.color, true)), opt.color, 8));
      card.add(this.add.text(cw / 2 - 14, -ch / 2 + 17, opt.levelText, style(14, lvlColor, true)).setOrigin(1, 0));
      card.add(this.add.text(left + 88, -ch / 2 + 44, opt.desc, { ...style(15, COLORS.text), wordWrap: { width: cw - 110, useAdvancedWrap: true } }));
      if (opt.hint) card.add(this.add.text(left + 88, ch / 2 - 9, opt.hint, style(12, COLORS.elite)).setOrigin(0, 1));
      card.add(this.add.text(cw / 2 - 10, ch / 2 - 8, `[${index + 1}]`, style(12, COLORS.dim)).setOrigin(1, 1));
    } else if (ch < 300) {
      // compact column card for short (landscape phone) screens
      card.add(this.add.image(0, -ch / 2 + 44, opt.icon).setDisplaySize(58, 58));
      card.add(glowText(this.add.text(0, -ch / 2 + 92, opt.name, style(21, opt.color, true)).setOrigin(0.5), opt.color, 10));
      card.add(this.add.text(0, -ch / 2 + 117, opt.levelText, style(14, lvlColor, true)).setOrigin(0.5));
      card.add(this.add.text(0, -ch / 2 + 138, opt.desc, {
        ...style(15, COLORS.text), align: 'center', wordWrap: { width: cw - 30, useAdvancedWrap: true },
      }).setOrigin(0.5, 0));
      if (opt.hint) {
        card.add(this.add.text(0, ch / 2 - 12, opt.hint, {
          ...style(12, COLORS.elite), align: 'center', wordWrap: { width: cw - 24, useAdvancedWrap: true },
        }).setOrigin(0.5, 1));
      }
    } else {
      card.add(this.add.image(0, -ch / 2 + 70, opt.icon).setDisplaySize(84, 84));
      card.add(glowText(this.add.text(0, -ch / 2 + 136, opt.name, style(24, opt.color, true)).setOrigin(0.5), opt.color, 10));
      card.add(this.add.text(0, -ch / 2 + 168, opt.levelText, style(15, lvlColor, true)).setOrigin(0.5));
      card.add(this.add.text(0, -ch / 2 + 200, opt.desc, {
        ...style(16, COLORS.text), align: 'center', wordWrap: { width: cw - 36, useAdvancedWrap: true },
      }).setOrigin(0.5, 0));
      if (opt.hint) {
        card.add(this.add.text(0, ch / 2 - 44, opt.hint, {
          ...style(13, COLORS.elite), align: 'center', wordWrap: { width: cw - 30, useAdvancedWrap: true },
        }).setOrigin(0.5, 1));
      }
      card.add(this.add.text(0, ch / 2 - 20, `[ ${index + 1} ]`, style(14, COLORS.dim)).setOrigin(0.5));
    }
    return card;
  }

  showPause() {
    this.openModal('pause', (c, w, h) => {
      const gs = this.gs;
      const ins = this.ins;
      const items: [string, number][] = [
        ...gs.weapons.map((wp) => [wp.id, wp.level] as [string, number]),
        ...gs.passiveOrder.map((id) => [id, gs.itemLevels.get(id) ?? 0] as [string, number]),
      ];
      // landscape phones: build + buttons on the left, evolution recipes on the right
      const split = isShort(h) && canSplit(w, 520);
      const pw = split ? Math.min(780, w - 24 - ins.left - ins.right) : Math.min(520, w - 32);
      const colW = split ? (pw - 30) / 2 : pw;
      const cell = split ? 48 : 58;
      const icon = split ? 34 : 44;
      const rowH = icon + (split ? 18 : 22);
      const perRow = Math.max(1, Math.floor((colW - 30) / cell));
      const rows = Math.max(1, Math.ceil(items.length / perRow));
      const recipeRow = split ? 19 : 21;
      const recipeH = 34 + WEAPON_IDS.length * recipeRow;
      const ph = split
        ? Math.min(h - 16 - ins.top - ins.bottom, 360)
        : Math.min(h - 40, 110 + rows * rowH + recipeH + 190);
      c.add(panel(this, w / 2, h / 2, pw, ph));
      const top = h / 2 - ph / 2;
      const leftCx = split ? w / 2 - pw / 2 + 15 + colW / 2 : w / 2;
      const rightCx = split ? w / 2 + pw / 2 - 15 - colW / 2 : w / 2;
      c.add(glowText(this.add.text(leftCx, top + (split ? 26 : 40), '暂停', style(split ? 26 : 36, COLORS.player, true)).setOrigin(0.5), COLORS.player, 14));

      const itemsTop = top + (split ? 64 : 104);
      items.forEach(([id, lvl], i) => {
        const def = ITEMS[id as keyof typeof ITEMS];
        const col = i % perRow;
        const row = Math.floor(i / perRow);
        const rowCount = Math.min(perRow, items.length - row * perRow);
        const x = leftCx - ((rowCount - 1) * cell) / 2 + col * cell;
        const y = itemsTop + row * rowH;
        const evolved = gs.weapons.find((wp) => wp.id === id)?.evolved;
        const maxed = lvl >= def.maxLevel;
        const tex = evolved ? EVOLUTIONS[id as keyof typeof EVOLUTIONS].icon : def.icon;
        c.add(this.add.image(x, y, tex).setDisplaySize(icon, icon));
        c.add(this.add.text(x, y + icon / 2 + 9, evolved ? '进化' : maxed ? 'MAX' : `Lv ${lvl}`, style(12, evolved ? COLORS.elite : maxed ? COLORS.coin : COLORS.dim, maxed)).setOrigin(0.5));
      });
      const itemsBottom = itemsTop + (rows - 1) * rowH + icon / 2 + 18;

      // evolution recipes: what each weapon needs, with live progress
      const recipeTop = split ? top + 12 : itemsBottom + 4;
      const rl = rightCx - colW / 2 + (split ? 12 : 28);
      const rr = rightCx + colW / 2 - (split ? 12 : 28);
      c.add(this.add.text(rightCx, recipeTop, split ? '进化配方（满级 + 对应被动，开宝箱进化）' : '进化配方（武器满级 + 对应被动，打开宝箱时进化）', style(12, COLORS.dim)).setOrigin(0.5, 0));
      WEAPON_IDS.forEach((id, i) => {
        const evo = EVOLUTIONS[id];
        const wp = gs.weapons.find((x) => x.id === id);
        const y = recipeTop + 22 + i * recipeRow;
        let status: string;
        let color: number = COLORS.dim;
        if (wp?.evolved) {
          status = '★ 已进化';
          color = COLORS.elite;
        } else {
          const maxed = !!wp && wp.level >= ITEMS[id].maxLevel;
          const hasPassive = gs.itemLevels.has(evo.passive);
          status = `满级${maxed ? '✓' : '✗'}  ${ITEMS[evo.passive].name}${hasPassive ? '✓' : '✗'}`;
          if (maxed && hasPassive) color = COLORS.coin;
          else if (wp) color = COLORS.text;
        }
        c.add(this.add.text(rl, y, `${ITEMS[id].name} → ${evo.name}`, style(13, wp ? evo.color : COLORS.dim)).setAlpha(wp ? 1 : 0.6));
        c.add(this.add.text(rr, y, status, style(13, color)).setOrigin(1, 0).setAlpha(wp ? 1 : 0.6));
      });

      const s = gs.stats;
      const line = `伤害 ×${s.might.toFixed(2)}   冷却 ×${s.haste.toFixed(2)}   范围 ×${s.area.toFixed(2)}\n移速 ${Math.round(s.speed)}   拾取 ${Math.round(s.magnet)}   护甲 ${s.armor}   回复 ${s.regen.toFixed(1)}/秒`;
      // split: stats sit under the recipes on the right, freeing the left column for the build
      const statsY = split ? recipeTop + 22 + WEAPON_IDS.length * recipeRow + 20 : top + ph - 150;
      c.add(this.add.text(split ? rightCx : leftCx, statsY, line, { ...style(split ? 12 : 13, COLORS.dim), align: 'center', lineSpacing: 6 }).setOrigin(0.5));

      const muted = loadSave().muted;
      // split: one row of four buttons along the bottom edge; otherwise continue + a row of three
      const bw = split ? Math.min(150, (pw - 60) / 4) : Math.min(140, (colW - 50) / 3);
      const gap = bw + 10;
      const by = top + ph - (split ? 30 : 44);
      const bx = split ? w / 2 + gap / 2 : leftCx;
      if (split) c.add(makeButton(this, w / 2 - gap * 1.5, by, bw, 36, '继续游戏', () => this.primary?.(), COLORS.player, 15));
      else c.add(makeButton(this, leftCx, top + ph - 96, 200, 40, '继续游戏', () => this.primary?.(), COLORS.player));
      c.add(makeButton(this, bx - gap, by, bw, 36, muted ? '声音：关' : '声音：开', () => {
        const save = loadSave();
        save.muted = !save.muted;
        sfx.setMuted(save.muted);
        music.applyVolume();
        writeSave();
        this.rebuildModal?.();
      }, COLORS.dim, 15));
      c.add(makeButton(this, bx, by, bw, 36, loadSave().music ? '音乐：开' : '音乐：关', () => {
        const save = loadSave();
        save.music = !save.music;
        music.setEnabled(save.music);
        writeSave();
        this.rebuildModal?.();
      }, COLORS.dim, 15));
      c.add(makeButton(this, bx + gap, by, bw, 36, '返回菜单', () => this.toMenu(), COLORS.hp, 15));
    });
    this.primary = () => {
      this.closeModal();
      this.gs.resumeFromPause();
    };
  }

  showResult(r: RunResult) {
    this.openModal('result', (c, w, h) => {
      const ins = this.ins;
      // landscape phones: summary on the left, weapon damage on the right
      const split = isShort(h) && canSplit(w);
      const pw = split ? Math.min(780, w - 24 - ins.left - ins.right) : Math.min(540, w - 32);
      const ph = split
        ? Math.min(h - 16 - ins.top - ins.bottom, 400)
        : Math.min(r.achievements.length ? 580 : 520, h - 32);
      const top = h / 2 - ph / 2;
      const colW = split ? (pw - 30) / 2 : pw;
      const leftX = w / 2 - pw / 2 + (split ? 24 : 40);
      const leftR = split ? leftX + colW - 30 : w / 2 + pw / 2 - 40;
      const leftCx = split ? w / 2 - pw / 2 + 15 + colW / 2 : w / 2;
      const color = r.win ? COLORS.coin : COLORS.hp;
      c.add(panel(this, w / 2, h / 2, pw, ph, color));
      c.add(glowText(this.add.text(leftCx, top + (split ? 32 : 44), r.win ? '胜利！' : '你倒下了', style(split ? 32 : 40, color, true)).setOrigin(0.5), color, 18));
      if (r.newBest) c.add(this.add.text(leftCx, top + (split ? 62 : 80), '★ 新的最长存活纪录 ★', style(split ? 13 : 15, COLORS.coin, true)).setOrigin(0.5));

      const stats = [
        ['存活时间', formatTime(r.time)],
        ['等级', String(r.level)],
        ['击杀', String(r.kills)],
        ['获得金币', `+${r.gold}（共 ${r.totalGold}）`],
      ];
      const statsTop = top + (split ? 82 : 112);
      const statRow = split ? 25 : 28;
      stats.forEach(([k, v], i) => {
        const y = statsTop + i * statRow;
        c.add(this.add.text(leftX, y, k, style(split ? 15 : 16, COLORS.dim)));
        c.add(this.add.text(leftR, y, v, style(split ? 15 : 16, COLORS.text, true)).setOrigin(1, 0));
      });

      let achH = 0;
      if (r.achievements.length) {
        const names = r.achievements.map((a) => {
          const unlock = charUnlockedBy(a.id);
          return unlock ? `${a.name}（解锁${unlock.name}）` : a.name;
        });
        const t = this.add.text(leftX, statsTop + 4 * statRow + 8, `★ 新成就：${names.join('、')}`, {
          ...style(split ? 13 : 14, COLORS.elite, true), wordWrap: { width: leftR - leftX, useAdvancedWrap: true },
        });
        c.add(t);
        achH = t.height + 12;
      }

      // weapon damage: below the summary, or in the right column when split
      const dmgLeft = split ? w / 2 + pw / 2 - 15 - colW + 12 : leftX;
      const dmgRight = split ? w / 2 + pw / 2 - 24 : w / 2 + pw / 2 - 40;
      const dmgTop = split ? top + 22 : top + 242 + achH;
      const dmgRow = split ? 30 : 34;
      const btnSpace = split ? 64 : 0;
      c.add(this.add.text(dmgLeft, dmgTop, '武器伤害', style(14, COLORS.dim)));
      const maxDmg = Math.max(1, ...r.damage.map((d) => d.value));
      const maxRows = split
        ? Math.floor((ph - (dmgTop - top) - 40 - btnSpace) / dmgRow)
        : Math.floor((ph - 360 - achH) / dmgRow);
      r.damage.slice(0, Math.max(1, maxRows)).forEach((d, i) => {
        const y = dmgTop + 36 + i * dmgRow;
        const def = d.evolved ? EVOLUTIONS[d.id] : ITEMS[d.id];
        c.add(this.add.image(dmgLeft + 12, y, def.icon).setDisplaySize(26, 26));
        c.add(this.add.text(dmgLeft + 32, y, def.name, style(14, COLORS.text)).setOrigin(0, 0.5));
        const barX = dmgLeft + 120;
        const barW = Math.max(30, dmgRight - barX - 70);
        c.add(this.add.rectangle(barX, y, barW, 8, 0x000000, 0.6).setOrigin(0, 0.5));
        c.add(this.add.rectangle(barX, y, Math.max(2, (barW * d.value) / maxDmg), 8, def.color, 1).setOrigin(0, 0.5));
        c.add(this.add.text(dmgRight, y, Math.round(d.value).toLocaleString(), style(13, COLORS.dim)).setOrigin(1, 0.5));
      });

      const bw = Math.min(170, (pw - 60) / 2);
      const by = top + ph - (split ? 34 : 42);
      c.add(makeButton(this, w / 2 - bw / 2 - 10, by, bw, 42, '再来一局', () => this.primary?.(), COLORS.player));
      c.add(makeButton(this, w / 2 + bw / 2 + 10, by, bw, 42, '返回菜单', () => this.toMenu(), COLORS.dim));
    });
    this.primary = () => this.retry();
  }

  private retry() {
    const char = this.gs.charId;
    this.closeModal();
    this.scene.stop('Game');
    this.scene.start('Game', { char });
  }

  private toMenu() {
    this.gs.abandonRun();
    this.closeModal();
    this.scene.stop('Game');
    this.scene.start('Menu');
  }
}
