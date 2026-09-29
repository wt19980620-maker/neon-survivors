import Phaser from 'phaser';
import { CHAR_BY_ID, CHARACTERS, ITEMS, MAPS, MAP_BY_ID, META_DEFS, charModLines, metaCost, type CharId, type GameMode } from '../game/data';
import { buildSettings } from '../ui/settings';
import { askFriendGroup, askNickname, fetchBoard, leaderboardEnabled, playerId, type ScoreRow } from '../game/leaderboard';
import { COLORS } from '../game/palette';
import { sfx } from '../game/audio';
import { music } from '../game/music';
import { loadSave, writeSave } from '../game/save';
import {
  ACHIEVEMENTS, ACHIEVEMENT_BY_ID, checkAchievements, unlockLabel, isCharUnlocked, isDone, isMapUnlocked,
} from '../game/achievements';
import { formatTime, glowText, makeButton, panel, style } from '../ui/widgets';
import { canSplit, fitCamera, isShort, isTouch, safeArea, vh, vw } from '../ui/screen';
import { texScale } from '../game/textures';

interface Drifter {
  img: Phaser.GameObjects.Image;
  vx: number;
  vy: number;
  spin: number;
}

type OverlayKind = 'shop' | 'chars' | 'achievements' | 'settings' | 'leaderboard';

export class MenuScene extends Phaser.Scene {
  private bg!: Phaser.GameObjects.TileSprite;
  private drifters: Drifter[] = [];
  private main!: Phaser.GameObjects.Container;
  private overlay: Phaser.GameObjects.Container | null = null;
  private overlayKind: OverlayKind | null = null;
  private achPage = 0;
  // leaderboard view state
  private boardMode: GameMode = 'endless';
  private boardScope: 'global' | 'group' = 'global';
  private boardRows: ScoreRow[] | null = null;
  private boardError = false;
  private boardReq = 0;
  private mapIndex = 0;
  private notice = '';

  constructor() {
    super('Menu');
  }

  create() {
    this.drifters = [];
    this.overlay = null;
    this.overlayKind = null;
    this.achPage = 0;
    this.mapIndex = Math.max(0, MAPS.findIndex((m) => m.id === loadSave().selectedMap));
    fitCamera(this);
    this.bg = this.add.tileSprite(0, 0, vw(this), vh(this), 'grid').setOrigin(0).setTileScale(texScale());
    const kinds = ['e_chaser', 'e_bat', 'e_brute', 'gem1', 'gem2', 'blade', 'disc'];
    for (let i = 0; i < 36; i++) {
      const img = this.add.image(
        Math.random() * vw(this),
        Math.random() * vh(this),
        kinds[i % kinds.length],
      ).setAlpha(0.18 + Math.random() * 0.2).setBlendMode(Phaser.BlendModes.ADD).setScale((0.8 + Math.random() * 0.8) * texScale());
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
    this.scale.on('enterfullscreen', this.onResize, this);
    this.scale.on('leavefullscreen', this.onResize, this);
    this.events.once('shutdown', () => {
      this.scale.off('resize', this.onResize, this);
      this.scale.off('enterfullscreen', this.onResize, this);
      this.scale.off('leavefullscreen', this.onResize, this);
    });
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
    fitCamera(this);
    this.bg.setSize(vw(this), vh(this));
    this.buildMain();
    if (this.overlayKind) this.openOverlay(this.overlayKind);
  }

  private buildMain() {
    this.main?.destroy();
    const w = vw(this);
    const h = vh(this);
    const save = loadSave();
    const c = this.add.container(0, 0);
    this.main = c;

    const ins = safeArea();
    // landscape phones only have ~400px of height: smaller title, buttons in a 3-row grid
    const compact = isShort(h) && w >= 360;
    const titleSize = Math.min(76, w / 7, compact ? h / 6.5 : Infinity);
    const cy = compact ? ins.top + h * 0.16 : h * 0.26;
    const title = glowText(this.add.text(w / 2, cy, '霓虹幸存者', style(titleSize, COLORS.player, true)).setOrigin(0.5), COLORS.player, 26);
    c.add(title);
    this.tweens.add({ targets: title, scale: 1.03, duration: 1400, yoyo: true, repeat: -1, ease: 'Sine.InOut' });
    c.add(glowText(this.add.text(w / 2, cy + titleSize * 0.8, 'N E O N   S U R V I V O R S', style(Math.min(20, w / 26), COLORS.orbit, true)).setOrigin(0.5), COLORS.orbit, 10));

    const done = save.achievements.length;
    const achLabel = `成就  ${done}/${ACHIEVEMENTS.length}`;
    let by: number;
    if (compact) {
      by = cy + titleSize * 0.8 + 52;
      c.add(makeButton(this, w / 2, by, 240, 48, '开始游戏', () => this.openOverlay('chars'), COLORS.player, 22));
      c.add(makeButton(this, w / 2 - 86, by + 56, 164, 40, '局外强化', () => this.openOverlay('shop'), COLORS.coin, 17));
      c.add(makeButton(this, w / 2 + 86, by + 56, 164, 40, achLabel, () => this.openOverlay('achievements'), COLORS.elite, 17));
      c.add(makeButton(this, w / 2 - 86, by + 104, 164, 34, '排行榜', () => this.openBoard(), COLORS.player, 16));
      c.add(makeButton(this, w / 2 + 86, by + 104, 164, 34, '设置', () => this.openOverlay('settings'), COLORS.dim, 16));
    } else {
      by = h * 0.5;
      c.add(makeButton(this, w / 2, by, 240, 54, '开始游戏', () => this.openOverlay('chars'), COLORS.player, 24));
      c.add(makeButton(this, w / 2 - 61, by + 66, 118, 44, '局外强化', () => this.openOverlay('shop'), COLORS.coin, 17));
      c.add(makeButton(this, w / 2 + 61, by + 66, 118, 44, achLabel, () => this.openOverlay('achievements'), COLORS.elite, 17));
      c.add(makeButton(this, w / 2, by + 120, 240, 44, '排行榜', () => this.openBoard(), COLORS.player, 19));
      c.add(makeButton(this, w / 2, by + 170, 240, 38, '设置', () => this.openOverlay('settings'), COLORS.dim, 17));
    }

    c.add(glowText(this.add.text(w - 20 - ins.right, 18 + ins.top, `金币 ${save.gold}`, style(20, COLORS.coin, true)).setOrigin(1, 0), COLORS.coin, 8));
    // browsers only enter fullscreen from a completed tap, hence trigger 'up'
    if (isTouch() && this.scale.fullscreen.available) {
      c.add(makeButton(this, 20 + ins.left + 50, 32 + ins.top, 100, 34, this.scale.isFullscreen ? '退出全屏' : '全屏', () => {
        if (this.scale.isFullscreen) this.scale.stopFullscreen();
        else this.scale.startFullscreen();
      }, COLORS.dim, 14, 'up'));
    }
    if (this.notice) {
      const n = glowText(this.add.text(w / 2, by - (compact ? 36 : 44), `★ ${this.notice}`, style(15, COLORS.elite, true)).setOrigin(0.5), COLORS.elite, 8);
      c.add(n);
      this.tweens.add({ targets: n, alpha: 0, delay: 4000, duration: 800, onComplete: () => { this.notice = ''; } });
    }
    const bottom = h - ins.bottom;
    const b = save.best;
    if (b.time > 0) {
      c.add(this.add.text(w / 2, bottom - (compact ? 30 : 56), `最长存活 ${formatTime(b.time)}  ·  最多击杀 ${b.kills}  ·  最高等级 ${b.level}  ·  通关 ${b.wins} 次${save.stats.endlessBest > 0 ? `  ·  无尽 ${formatTime(save.stats.endlessBest)}` : ''}`, {
        ...style(compact ? 12 : 13, COLORS.dim), align: 'center', wordWrap: { width: w - 32, useAdvancedWrap: true },
      }).setOrigin(0.5, 1));
    }
    const hint = isTouch() || w < 600
      ? '触屏拖动移动 · 武器自动攻击 · 存活 10 分钟并击败最终首领'
      : 'WASD / 方向键 移动  ·  武器自动攻击  ·  Esc 暂停  ·  M 静音  ·  存活 10 分钟并击败最终首领';
    c.add(this.add.text(w / 2, bottom - (compact ? 14 : 30), hint, {
      ...style(compact ? 12 : 14, COLORS.dim), align: 'center', wordWrap: { width: w - 32, useAdvancedWrap: true },
    }).setOrigin(0.5));
  }

  private toggleMute() {
    const save = loadSave();
    save.muted = !save.muted;
    sfx.setMuted(save.muted);
    music.applyVolume();
    writeSave();
    this.buildMain();
  }

  private startGame() {
    const save = loadSave();
    const char = save.selectedChar;
    const map = MAPS[this.mapIndex]?.id ?? save.selectedMap;
    if (!isCharUnlocked(char) || !isMapUnlocked(map)) return;
    sfx.unlock();
    this.scene.start('Game', { char, map, mode: save.selectedMode });
  }

  /** Browse maps (locked ones too, so players can see what to unlock). */
  private cycleMap(dir: number) {
    this.mapIndex = (this.mapIndex + dir + MAPS.length) % MAPS.length;
    const m = MAPS[this.mapIndex];
    if (isMapUnlocked(m.id)) {
      loadSave().selectedMap = m.id;
      writeSave();
    }
    sfx.play('select');
    this.openOverlay('chars');
  }

  private mapSelector(c: Phaser.GameObjects.Container, x: number, y: number, mw: number, bh: number) {
    const m = MAPS[this.mapIndex];
    const unlocked = isMapUnlocked(m.id);
    c.add(this.add.rectangle(x, y, mw, bh, COLORS.panel, 0.96).setStrokeStyle(2, unlocked ? m.accent : COLORS.panelEdge, 1));
    c.add(makeButton(this, x - mw / 2 + 20, y, 36, bh - 8, '‹', () => this.cycleMap(-1), COLORS.dim, 20));
    c.add(makeButton(this, x + mw / 2 - 20, y, 36, bh - 8, '›', () => this.cycleMap(1), COLORS.dim, 20));
    c.add(this.add.text(x, y - 9, `地图：${m.name}`, style(15, unlocked ? m.accent : COLORS.dim, true)).setOrigin(0.5));
    const pct = (v: number) => Math.round((v - 1) * 100);
    const mods = [m.hpMult > 1 ? `敌人血量 +${pct(m.hpMult)}%` : '', m.speedMult > 1 ? `移速 +${pct(m.speedMult)}%` : '', m.goldMult > 1 ? `金币 ×${m.goldMult}` : ''].filter(Boolean).join(' · ') || m.desc;
    const unlockAch = m.unlock ? ACHIEVEMENT_BY_ID[m.unlock] : null;
    const sub = unlocked ? mods : `解锁：${unlockAch?.desc ?? ''}`;
    c.add(this.add.text(x, y + 10, sub, style(11, unlocked ? COLORS.dim : COLORS.elite)).setOrigin(0.5));
    return unlocked;
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
    const w = vw(this);
    const h = vh(this);
    const c = this.add.container(0, 0).setDepth(50);
    c.add(this.add.rectangle(0, 0, w, h, 0x000000, 0.72).setOrigin(0).setInteractive());
    this.overlay = c;
    this.overlayKind = kind;
    this.main.setVisible(false);
    if (kind === 'shop') this.buildShop(c, w, h);
    else if (kind === 'chars') this.buildChars(c, w, h);
    else if (kind === 'achievements') this.buildAchievements(c, w, h);
    else if (kind === 'leaderboard') this.buildLeaderboard(c, w, h);
    else {
      buildSettings(this, c, w, h, {
        allowQuality: true,
        onChange: () => this.openOverlay('settings'),
        onClose: () => this.closeOverlay(),
      });
    }
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
    const ins = safeArea();
    const short = isShort(h);
    // landscape phones get the row of cards too, just shorter
    // ...unless the row of cards would be too narrow for their text
    const rowCw = (w - 60 - ins.left - ins.right - 14 * (CHARACTERS.length - 1)) / CHARACTERS.length;
    const wide = (w >= 900 || (short && canSplit(w))) && rowCw >= 90;
    const titleY = ins.top + (short ? 24 : wide ? h * 0.12 : 40);
    c.add(glowText(this.add.text(w / 2, titleY, '选择角色', style(short ? 24 : wide ? 36 : 28, COLORS.player, true)).setOrigin(0.5), COLORS.player, 14));
    // mode toggle: top-right when there's room, otherwise it takes the subtitle's place under the title
    const modeInCorner = w >= 520;
    const endless = save.selectedMode === 'endless';
    const modeLabel = endless ? '模式：无尽' : '模式：标准';
    const toggleMode = () => {
      save.selectedMode = endless ? 'standard' : 'endless';
      writeSave();
      sfx.play('select');
      this.openOverlay('chars');
    };
    if (modeInCorner) c.add(makeButton(this, w - ins.right - 80, titleY, 124, 32, modeLabel, toggleMode, endless ? COLORS.elite : COLORS.dim, 14));
    else c.add(makeButton(this, w / 2, titleY + 36, 150, 28, modeLabel, toggleMode, endless ? COLORS.elite : COLORS.dim, 14));
    if (!short && modeInCorner) c.add(this.add.text(w / 2, titleY + (wide ? 36 : 28), wide && !isTouch() ? '点击选择 · ←/→ 切换 · Enter 出发' : '点击选择角色', style(13, COLORS.dim)).setOrigin(0.5));
    const btnY = short ? h - ins.bottom - 30 : wide ? Math.min(h - 50, titleY + 70 + 320 + 56) : h - ins.bottom - 44;
    const cardsTop = titleY + (short ? 26 : wide ? 70 : modeInCorner ? 58 : 62);
    // map picker sits between the buttons when there's room, otherwise on its own row above them
    const inlineMap = w >= 560;
    const cardsBottom = inlineMap ? btnY : btnY - 58;

    const n = CHARACTERS.length;
    CHARACTERS.forEach((ch, i) => {
      const unlocked = isCharUnlocked(ch.id);
      const selected = save.selectedChar === ch.id;
      let cw: number, chh: number, x: number, y: number;
      if (wide) {
        const gap = 14;
        cw = Math.min(200, (w - 60 - ins.left - ins.right - gap * (n - 1)) / n);
        chh = Math.min(320, cardsBottom - 34 - cardsTop);
        x = w / 2 - ((n - 1) * (cw + gap)) / 2 + i * (cw + gap);
        y = cardsTop + chh / 2;
      } else {
        // list rows; two columns when a single column would squash them (landscape phones)
        const avail = cardsBottom - 34 - cardsTop;
        const gap = n > 6 ? 5 : 8;
        // two columns when rows get squashed: at 50px on wide screens, at 42px (too short for two lines) on any
        const perRow = avail / n - gap;
        let cols = (perRow < 50 && w >= 540) || perRow < 46 ? 2 : 1;
        // landscape phones with many characters: a third column of stacked cards
        if (cols === 2 && avail / Math.ceil(n / 2) - gap < 46 && w >= 540) cols = 3;
        const rows = Math.ceil(n / cols);
        cw = Math.min(460, (w - 24 - ins.left - ins.right - gap * (cols - 1)) / cols);
        chh = Math.min(96, avail / rows - gap);
        // an odd card out in the last row sits centred
        const inRow = Math.min(cols, n - Math.floor(i / cols) * cols);
        x = w / 2 - ((inRow - 1) * (cw + gap)) / 2 + (i % cols) * (cw + gap);
        y = cardsTop + chh / 2 + Math.floor(i / cols) * (chh + gap);
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
      if (wide && chh < 300) {
        // compact card for landscape phones: drop the flavour line, tighten the spacing
        card.add(this.add.image(0, -chh / 2 + 36, `player_${ch.id}`).setScale(1.6 * texScale()).setAlpha(unlocked ? 1 : 0.25));
        if (!unlocked) card.add(this.add.image(0, -chh / 2 + 36, 'icon_lock').setDisplaySize(32, 32));
        card.add(glowText(this.add.text(0, -chh / 2 + 76, ch.name, style(18, unlocked ? ch.color : COLORS.dim, true)).setOrigin(0.5), ch.color, unlocked ? 8 : 0));
        card.add(this.add.image(-cw / 2 + 22, -chh / 2 + 104, weapon.icon).setDisplaySize(22, 22).setAlpha(unlocked ? 1 : 0.4));
        card.add(this.add.text(-cw / 2 + 38, -chh / 2 + 104, weapon.name, style(12, unlocked ? COLORS.text : COLORS.dim)).setOrigin(0, 0.5));
        card.add(this.add.text(0, -chh / 2 + 122, lines.length ? lines.join('\n') : '无属性修正', { ...style(12, unlocked ? COLORS.text : COLORS.dim), align: 'center', lineSpacing: 3 }).setOrigin(0.5, 0));
        if (!unlocked && unlockAch) {
          card.add(this.add.text(0, chh / 2 - 8, `解锁：${unlockAch.desc}`, { ...style(11, COLORS.elite), align: 'center', wordWrap: { width: cw - 12, useAdvancedWrap: true } }).setOrigin(0.5, 1));
        } else if (selected) {
          card.add(this.add.text(0, chh / 2 - 10, '✓ 已选择', style(13, ch.color, true)).setOrigin(0.5, 1));
        }
      } else if (wide) {
        card.add(this.add.image(0, -chh / 2 + 56, `player_${ch.id}`).setScale(2.2 * texScale()).setAlpha(unlocked ? 1 : 0.25));
        if (!unlocked) card.add(this.add.image(0, -chh / 2 + 56, 'icon_lock').setDisplaySize(40, 40));
        card.add(glowText(this.add.text(0, -chh / 2 + 118, ch.name, style(20, unlocked ? ch.color : COLORS.dim, true)).setOrigin(0.5), ch.color, unlocked ? 8 : 0));
        // narrow cards (many characters, smaller windows): smaller text and a wider wrap keep it to two lines
        const roomy = cw >= 150;
        card.add(this.add.text(0, -chh / 2 + 146, ch.desc, {
          ...style(roomy ? 13 : 12, COLORS.dim), align: 'center', wordWrap: { width: cw - (roomy ? 20 : 10), useAdvancedWrap: true },
        }).setOrigin(0.5, 0));
        // narrow cards drop the "初始：" prefix (the icon already says it) and hug the left edge
        const ix = -cw / 2 + (roomy ? 30 : 18);
        card.add(this.add.image(ix, -chh / 2 + 196, weapon.icon).setDisplaySize(26, 26).setAlpha(unlocked ? 1 : 0.4));
        card.add(this.add.text(ix + 18, -chh / 2 + 196, roomy ? `初始：${weapon.name}` : weapon.name, style(13, unlocked ? COLORS.text : COLORS.dim)).setOrigin(0, 0.5));
        // narrow locked cards give the stats' room to the (longer, wrapping) unlock condition
        if (unlocked || roomy) {
          card.add(this.add.text(0, -chh / 2 + 220, lines.length ? lines.join('\n') : '无属性修正', { ...style(13, unlocked ? COLORS.text : COLORS.dim), align: 'center', lineSpacing: 4 }).setOrigin(0.5, 0));
        }
        if (!unlocked && unlockAch) {
          const cond = roomy ? unlockAch.desc : unlockAch.desc.replace(/ /g, '');
          card.add(this.add.text(0, roomy ? chh / 2 - 12 : -chh / 2 + 222, `解锁：${cond}`, {
            ...style(12, COLORS.elite), align: 'center', wordWrap: { width: cw - (roomy ? 16 : 10), useAdvancedWrap: true },
          }).setOrigin(0.5, roomy ? 1 : 0));
        } else if (selected) {
          card.add(this.add.text(0, chh / 2 - 14, '✓ 已选择', style(14, ch.color, true)).setOrigin(0.5, 1));
        }
      } else if (cw < 200) {
        // stacked card for two narrow columns on small portrait phones: icon + name on top, details below
        const left = -cw / 2;
        const top = -chh / 2;
        // shorter cards pull the header row and details up a little
        const hy = top + (chh < 70 ? 16 : 20);
        const dy = top + (chh < 70 ? 30 : 36);
        card.add(this.add.image(left + 20, hy, `player_${ch.id}`).setScale(1.0 * texScale()).setAlpha(unlocked ? 1 : 0.25));
        if (!unlocked) card.add(this.add.image(left + 20, hy, 'icon_lock').setDisplaySize(22, 22));
        card.add(this.add.text(left + 40, hy, ch.name, style(15, unlocked ? ch.color : COLORS.dim, true)).setOrigin(0, 0.5));
        card.add(this.add.image(cw / 2 - 16, hy, weapon.icon).setDisplaySize(20, 20).setAlpha(unlocked ? 1 : 0.4));
        if (selected) card.add(this.add.text(cw / 2 - 30, hy, '✓', style(15, ch.color, true)).setOrigin(1, 0.5));
        // two stats per line so a wrap never starts a line with the separator
        const stats = lines.length ? [lines.slice(0, 2).join(' · '), lines.slice(2).join(' · ')].filter(Boolean).join('\n') : '均衡，无属性修正';
        // unlock text without spaces wraps per character instead of breaking oddly at "前 3 / 分钟"
        const sub = !unlocked && unlockAch ? `解锁：${unlockAch.desc.replace(/ /g, '')}` : stats;
        card.add(this.add.text(left + 10, dy, sub, {
          ...style(11, !unlocked ? COLORS.elite : COLORS.text), wordWrap: { width: cw - 20, useAdvancedWrap: true }, lineSpacing: 1,
        }));
      } else {
        const left = -cw / 2;
        // short rows pull the name and the detail line closer together
        const tight = chh < 58;
        card.add(this.add.image(left + 36, 0, `player_${ch.id}`).setScale((tight ? 1.3 : 1.5) * texScale()).setAlpha(unlocked ? 1 : 0.25));
        if (!unlocked) card.add(this.add.image(left + 36, 0, 'icon_lock').setDisplaySize(tight ? 28 : 32, tight ? 28 : 32));
        card.add(this.add.text(left + 70, -chh / 2 + (tight ? 4 : 10), ch.name, style(tight ? 15 : 17, unlocked ? ch.color : COLORS.dim, true)));
        card.add(this.add.image(cw / 2 - 20, -chh / 2 + (tight ? 16 : 20), weapon.icon).setDisplaySize(24, 24).setAlpha(unlocked ? 1 : 0.4));
        const sub = !unlocked && unlockAch ? `解锁：${unlockAch.desc}` : `${lines.join(' · ') || '均衡，无属性修正'}`;
        // narrow rows (two columns) get a smaller detail line so three stat changes stay on one line
        const narrow = cw < 290;
        card.add(this.add.text(left + 70, -chh / 2 + (tight ? 25 : 36), sub, {
          ...style(narrow || tight ? 11 : 12, !unlocked ? COLORS.elite : COLORS.text), wordWrap: { width: cw - 80, useAdvancedWrap: true },
        }));
        if (selected) card.add(this.add.text(cw / 2 - 40, -chh / 2 + (tight ? 16 : 20), '✓', style(16, ch.color, true)).setOrigin(1, 0.5));
      }
      c.add(card);
    });

    const cur = CHARACTERS.find((ch) => ch.id === save.selectedChar)!;
    const bh = short ? 42 : 48;
    let back: number, go: number, bw: number;
    let mapOk: boolean;
    if (inlineMap) {
      const x0 = w / 2 - 267;
      back = x0 + 55;
      go = x0 + 449;
      bw = 170;
      mapOk = this.mapSelector(c, x0 + 237, btnY, 230, bh);
      c.add(makeButton(this, back, btnY, 110, bh, '返回', () => this.closeOverlay(), COLORS.dim, 18));
    } else {
      mapOk = this.mapSelector(c, w / 2, btnY - 58, Math.min(340, w - 24), bh);
      back = w / 2 - 82;
      go = w / 2 + 82;
      bw = 150;
      c.add(makeButton(this, back, btnY, bw, bh, '返回', () => this.closeOverlay(), COLORS.dim, 18));
    }
    const goBtn = makeButton(this, go, btnY, bw, bh, `出发 · ${cur.name}`, () => this.startGame(), cur.color, 17);
    goBtn.setEnabled(mapOk);
    c.add(goBtn);
  }

  // ---------------------------------------------------------------- achievements

  private buildAchievements(c: Phaser.GameObjects.Container, w: number, h: number) {
    const save = loadSave();
    const ins = safeArea();
    const short = isShort(h);
    const pw = Math.min(640, w - 24 - ins.left - ins.right);
    const rowH = short ? 48 : 56;
    const headerH = short ? 60 : 100;
    const footerH = short ? 50 : 90;
    const availH = h - (short ? 16 : 24) - ins.top - ins.bottom;
    const perPage = Math.max(2, Math.min(ACHIEVEMENTS.length, Math.floor((availH - headerH - footerH) / rowH)));
    const pages = Math.ceil(ACHIEVEMENTS.length / perPage);
    this.achPage = Math.min(this.achPage, pages - 1);
    const ph = Math.min(availH, headerH + perPage * rowH + footerH);
    const top = h / 2 - ph / 2;
    c.add(panel(this, w / 2, h / 2, pw, ph, COLORS.elite));
    c.add(glowText(this.add.text(w / 2, top + (short ? 22 : 36), '成就', style(short ? 24 : 30, COLORS.elite, true)).setOrigin(0.5), COLORS.elite, 12));
    // short screens fold the page counter into the subtitle to save a row
    const pageInfo = short && pages > 1 ? `  ·  第 ${this.achPage + 1}/${pages} 页` : '';
    c.add(this.add.text(w / 2, top + (short ? 44 : 68), `已完成 ${save.achievements.length} / ${ACHIEVEMENTS.length}${short ? '' : '  ·  完成后立即获得奖励'}${pageInfo}`, style(short ? 12 : 13, COLORS.dim)).setOrigin(0.5));

    const left = w / 2 - pw / 2 + 20;
    const right = w / 2 + pw / 2 - 20;
    ACHIEVEMENTS.slice(this.achPage * perPage, (this.achPage + 1) * perPage).forEach((a, i) => {
      const y = top + headerH + i * rowH + rowH / 2;
      const done = isDone(a.id);
      const unlock = unlockLabel(a.id);
      const cur = Math.min(a.target, a.value(save, null));
      // right column (reward, progress) has a fixed width; the description wraps to whatever is left
      const bw = Math.min(140, pw * 0.25);
      c.add(this.add.image(left + 20, y, done ? 'icon_trophy' : 'icon_trophy_off').setDisplaySize(38, 38));
      c.add(this.add.text(left + 48, y - 16, a.name, style(16, done ? COLORS.elite : COLORS.text, true)));
      // unlock rewards ride along with the description so the reward column stays narrow on phones
      const desc = unlock ? `${a.desc} · 解锁 ${unlock.text}` : a.desc;
      c.add(this.add.text(left + 48, y + 4, desc, {
        ...style(12, COLORS.dim), wordWrap: { width: right - bw - 16 - (left + 48), useAdvancedWrap: true },
      }));
      c.add(this.add.text(right, y - 16, `+${a.gold} 金`, style(12, COLORS.coin)).setOrigin(1, 0));
      if (done) {
        c.add(this.add.text(right, y + 3, '✓ 已完成', style(12, COLORS.elite, true)).setOrigin(1, 0));
      } else {
        const fmt = (v: number) => (a.id === 'survive8' ? formatTime(v) : v.toLocaleString());
        c.add(this.add.text(right, y + 1, `${fmt(cur)}/${fmt(a.target)}`, style(11, COLORS.dim)).setOrigin(1, 0));
        c.add(this.add.rectangle(right - bw, y + 19, bw, 5, 0x000000, 0.6).setOrigin(0, 0.5));
        c.add(this.add.rectangle(right - bw, y + 19, Math.max(1, (bw * cur) / a.target), 5, COLORS.elite, 0.9).setOrigin(0, 0.5));
      }
    });

    const by = top + ph - (short ? 26 : 36);
    const off = Math.min(150, pw / 2 - 62);
    if (pages > 1) {
      if (!short) c.add(this.add.text(w / 2, by - 36, `${this.achPage + 1} / ${pages}`, style(13, COLORS.dim)).setOrigin(0.5));
      const prev = makeButton(this, w / 2 - off, by, 100, short ? 34 : 38, '上一页', () => { this.achPage--; this.openOverlay('achievements'); }, COLORS.dim, 15);
      const next = makeButton(this, w / 2 + off, by, 100, short ? 34 : 38, '下一页', () => { this.achPage++; this.openOverlay('achievements'); }, COLORS.dim, 15);
      prev.setEnabled(this.achPage > 0);
      next.setEnabled(this.achPage < pages - 1);
      c.add([prev, next]);
    }
    c.add(makeButton(this, w / 2, by, pages > 1 ? Math.min(140, off * 2 - 110) : 140, short ? 36 : 40, '返回', () => this.closeOverlay(), COLORS.player, 18));
  }

  // ---------------------------------------------------------------- leaderboard

  private openBoard() {
    this.boardMode = loadSave().selectedMode;
    this.openOverlay('leaderboard');
    this.loadBoard();
  }

  /** Fetch the current tab; stale responses (tab switched meanwhile) are dropped. */
  private loadBoard() {
    const group = loadSave().friendGroup;
    this.boardRows = null;
    this.boardError = false;
    if (!leaderboardEnabled() || (this.boardScope === 'group' && !group)) return;
    const req = ++this.boardReq;
    fetchBoard(this.boardMode, this.boardScope === 'group' ? group : '')
      .then((rows) => {
        if (req !== this.boardReq) return;
        this.boardRows = rows;
      })
      .catch(() => {
        if (req !== this.boardReq) return;
        this.boardError = true;
      })
      .finally(() => {
        if (req === this.boardReq && this.overlayKind === 'leaderboard') this.openOverlay('leaderboard');
      });
  }

  private buildLeaderboard(c: Phaser.GameObjects.Container, w: number, h: number) {
    const save = loadSave();
    const ins = safeArea();
    const short = isShort(h);
    const pw = Math.min(560, w - 24 - ins.left - ins.right);
    const ph = Math.min(h - 16 - ins.top - ins.bottom, 620);
    const top = h / 2 - ph / 2;
    const left = w / 2 - pw / 2 + 18;
    const right = w / 2 + pw / 2 - 18;
    c.add(panel(this, w / 2, h / 2, pw, ph, COLORS.player));
    c.add(glowText(this.add.text(w / 2, top + (short ? 22 : 30), '排行榜', style(short ? 24 : 30, COLORS.player, true)).setOrigin(0.5), COLORS.player, 12));

    // tabs: mode + scope
    const tabY = top + (short ? 52 : 70);
    const tw = Math.min(96, (pw - 60) / 4);
    const tab = (x: number, label: string, on: boolean, tap: () => void) => {
      c.add(makeButton(this, x, tabY, tw, 30, label, () => {
        tap();
        this.openOverlay('leaderboard');
        this.loadBoard();
      }, on ? COLORS.player : COLORS.dim, 14));
      if (on) c.add(this.add.rectangle(x, tabY + 17, tw - 16, 2, COLORS.player, 1));
    };
    const g = tw + 6;
    tab(w / 2 - g * 1.5 - 8, '无尽', this.boardMode === 'endless', () => { this.boardMode = 'endless'; });
    tab(w / 2 - g * 0.5 - 8, '标准', this.boardMode === 'standard', () => { this.boardMode = 'standard'; });
    tab(w / 2 + g * 0.5 + 8, '全球', this.boardScope === 'global', () => { this.boardScope = 'global'; });
    tab(w / 2 + g * 1.5 + 8, '好友圈', this.boardScope === 'group', () => { this.boardScope = 'group'; });

    // footer: nickname / friend group / back (two rows on narrow panels)
    const narrow = pw < 420;
    const fy = top + ph - (narrow ? 70 : 30);
    const fw = narrow ? (pw - 48) / 2 : 150;
    c.add(makeButton(this, narrow ? w / 2 - fw / 2 - 6 : left + fw / 2, fy, fw, 32, `昵称：${save.nickname || '未设置'}`, () => {
      if (askNickname()) this.openOverlay('leaderboard');
    }, save.nickname ? COLORS.dim : COLORS.elite, 13));
    c.add(makeButton(this, narrow ? w / 2 + fw / 2 + 6 : left + fw * 1.5 + 12, fy, fw, 32, `好友圈：${save.friendGroup || '未加入'}`, () => {
      if (askFriendGroup() !== null) {
        this.openOverlay('leaderboard');
        this.loadBoard();
      }
    }, COLORS.dim, 13));
    c.add(makeButton(this, narrow ? w / 2 : right - 50, narrow ? fy + 40 : fy, narrow ? 140 : 100, 32, '返回', () => this.closeOverlay(), COLORS.player, 15));

    // list
    const listTop = tabY + 30;
    const listBottom = fy - (narrow ? 26 : 26);
    const rowH = short ? 22 : 26;
    const message = (text: string) => c.add(this.add.text(w / 2, (listTop + listBottom) / 2, text, {
      ...style(14, COLORS.dim), align: 'center', wordWrap: { width: pw - 40, useAdvancedWrap: true },
    }).setOrigin(0.5));
    if (!leaderboardEnabled()) return message('在线排行榜尚未配置');
    if (this.boardScope === 'group' && !save.friendGroup) return message('还没有加入好友圈\n点下方「好友圈」输入一个代码，把同一个代码发给朋友即可');
    if (this.boardError) return message('加载失败，请检查网络后重新切换标签');
    if (!this.boardRows) return message('加载中…');
    if (this.boardRows.length === 0) return message('还没有人上榜，来做第一个吧！');

    const me = playerId();
    const maxRows = Math.max(1, Math.floor((listBottom - listTop - rowH) / rowH));
    const cols = { rank: left + 16, name: left + 40, detail: right - 110, score: right };
    const head = listTop + rowH / 2;
    c.add(this.add.text(cols.name, head, '玩家', style(12, COLORS.dim)).setOrigin(0, 0.5));
    if (pw >= 380) c.add(this.add.text(cols.detail, head, '存活 · 地图', style(12, COLORS.dim)).setOrigin(1, 0.5));
    c.add(this.add.text(cols.score, head, '得分', style(12, COLORS.dim)).setOrigin(1, 0.5));
    const medal = [COLORS.elite, 0xd6e2ff, 0xffa36b];
    this.boardRows.slice(0, maxRows).forEach((r, i) => {
      const y = head + (i + 1) * rowH;
      const mine = r.player_id === me;
      if (mine) c.add(this.add.rectangle(w / 2, y, pw - 20, rowH - 2, COLORS.player, 0.12));
      const color = mine ? COLORS.player : i < 3 ? medal[i] : COLORS.text;
      c.add(this.add.text(cols.rank, y, String(i + 1), style(13, i < 3 ? medal[i] : COLORS.dim, true)).setOrigin(0.5));
      const charName = CHAR_BY_ID[r.char]?.name ?? '';
      c.add(this.add.text(cols.name, y, pw >= 380 ? `${r.name}  ·  ${charName}` : r.name, style(13, color, i < 3 || mine)).setOrigin(0, 0.5));
      if (pw >= 380) {
        const detail = `${formatTime(r.time_s)}${r.win ? ' ★' : ''}  ·  ${MAP_BY_ID[r.map]?.name ?? ''}`;
        c.add(this.add.text(cols.detail, y, detail, style(12, COLORS.dim)).setOrigin(1, 0.5));
      }
      c.add(this.add.text(cols.score, y, r.score.toLocaleString(), style(13, color, true)).setOrigin(1, 0.5));
    });
  }

  // ---------------------------------------------------------------- shop

  private buildShop(c: Phaser.GameObjects.Container, w: number, h: number) {
    const save = loadSave();
    const ins = safeArea();
    const rowH = 58;
    // landscape phones: two columns so rows don't have to shrink to unreadable sizes
    const short = isShort(h);
    const cols = short && canSplit(w, 520) ? 2 : 1;
    const perCol = Math.ceil(META_DEFS.length / cols);
    const pw = Math.min(cols === 2 ? 820 : 620, w - 24 - ins.left - ins.right);
    const ph = Math.min(h - 16 - ins.top - ins.bottom, 130 + perCol * rowH + 60);
    const top = h / 2 - ph / 2;
    c.add(panel(this, w / 2, h / 2, pw, ph, COLORS.coin));
    // short screens: tighter header and footer so the rows keep a readable size
    const headerH = short ? 66 : 108;
    const footerH = short ? 52 : 60;
    c.add(glowText(this.add.text(w / 2, top + (short ? 24 : 36), '局外强化', style(short ? 24 : 30, COLORS.coin, true)).setOrigin(0.5), COLORS.coin, 12));
    c.add(this.add.text(w / 2, top + (short ? 48 : 70), `持有金币 ${save.gold}  ·  每局结束时根据表现获得金币`, style(short ? 12 : 14, COLORS.dim)).setOrigin(0.5));

    const scale = Math.min(1, (ph - headerH - footerH) / (perCol * rowH));
    const rh = rowH * scale;
    const colW = (pw - 20) / cols;
    // narrow columns: rank pips go under the description instead of beside it
    const stackPips = colW < 440;
    META_DEFS.forEach((def, i) => {
      const col = Math.floor(i / perCol);
      const y = top + headerH + (i % perCol) * rh + rh / 2;
      const left = w / 2 - pw / 2 + 10 + col * colW + 14;
      const right = left + colW - 28;
      const rank = save.meta[def.id] ?? 0;
      const maxed = rank >= def.maxRank;
      const cost = metaCost(def, rank);
      const btnW = Math.min(108, colW * 0.28);
      c.add(this.add.image(left + 18, y, def.icon).setDisplaySize(38 * scale, 38 * scale));
      c.add(this.add.text(left + 46, y - (stackPips ? 15 : 10) * scale, def.name, style(17 * scale + 2, COLORS.text, true)).setOrigin(0, 0.5));
      c.add(this.add.text(left + 46, y + (stackPips ? 3 : 11) * scale, def.desc, style(13 * scale + 1, COLORS.dim)).setOrigin(0, 0.5));
      for (let r = 0; r < def.maxRank; r++) {
        const on = r < rank;
        const pip = stackPips
          ? this.add.rectangle(left + 50 + r * 12, y + 19 * scale, 8, 8, on ? COLORS.coin : 0x000000, on ? 1 : 0.5)
          : this.add.rectangle(left + Math.min(230, colW * 0.42) + r * 16, y, 11, 11, on ? COLORS.coin : 0x000000, on ? 1 : 0.5);
        c.add(pip.setStrokeStyle(1, COLORS.coin, 0.7));
      }
      const btn = makeButton(this, right - btnW / 2, y, btnW, Math.min(38, rh - 10), maxed ? '已满' : `${cost} 金`, () => {
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

    c.add(makeButton(this, w / 2, top + ph - (short ? 28 : 36), 160, short ? 36 : 40, '返回', () => this.closeOverlay(), COLORS.player, 18));
  }

  update(_t: number, deltaMs: number) {
    const dt = deltaMs / 1000;
    this.bg.tilePositionX += 12 * dt;
    this.bg.tilePositionY += 8 * dt;
    const w = vw(this);
    const h = vh(this);
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
