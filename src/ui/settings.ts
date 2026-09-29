import type Phaser from 'phaser';
import { COLORS } from '../game/palette';
import { sfx } from '../game/audio';
import { music } from '../game/music';
import { loadSave, writeSave } from '../game/save';
import { glowText, makeButton, panel, style } from './widgets';

const SHAKE_STEPS: [number, string][] = [[1, '强'], [0.5, '弱'], [0, '关']];

export interface SettingsOptions {
  /** quality needs a page reload, so it is only offered from the main menu */
  allowQuality: boolean;
  /** called after any change so the caller can re-apply live settings and redraw */
  onChange: () => void;
  onClose: () => void;
}

/** Shared settings panel, drawn into `c` (already holding the dim backdrop). */
export function buildSettings(scene: Phaser.Scene, c: Phaser.GameObjects.Container, w: number, h: number, opts: SettingsOptions) {
  const save = loadSave();
  const rows: { label: string; build: (right: number, y: number, bh: number) => void }[] = [];

  const stepper = (get: () => number, set: (v: number) => void) => (right: number, y: number, bh: number) => {
    const v = get();
    const pct = Math.round(v * 100);
    const minus = makeButton(scene, right - 150, y, 44, bh, '－', () => set(Math.max(0, Math.round((v - 0.1) * 10) / 10)), COLORS.dim, 18);
    const plus = makeButton(scene, right - 26, y, 44, bh, '＋', () => set(Math.min(1, Math.round((v + 0.1) * 10) / 10)), COLORS.dim, 18);
    minus.setEnabled(pct > 0);
    plus.setEnabled(pct < 100);
    c.add([minus, plus, scene.add.text(right - 88, y, pct === 0 ? '静音' : `${pct}%`, style(16, COLORS.text, true)).setOrigin(0.5)]);
  };
  const toggle = (label: string, onTap: () => void, color: number = COLORS.player) => (right: number, y: number, bh: number) => {
    c.add(makeButton(scene, right - 64, y, 128, bh, label, onTap, color, 15));
  };
  const changed = () => {
    writeSave();
    opts.onChange();
  };

  rows.push({
    label: '音效音量',
    build: stepper(() => save.sfxVolume, (v) => {
      save.sfxVolume = v;
      sfx.setVolume(v);
      sfx.play('pickup');
      changed();
    }),
  });
  rows.push({
    label: '音乐音量',
    build: stepper(() => save.musicVolume, (v) => {
      save.musicVolume = v;
      music.setVolume(v);
      changed();
    }),
  });
  rows.push({
    label: '伤害数字',
    build: toggle(save.damageNumbers ? '显示' : '隐藏', () => {
      save.damageNumbers = !save.damageNumbers;
      changed();
    }, save.damageNumbers ? COLORS.player : COLORS.dim),
  });
  rows.push({
    label: '屏幕震动',
    build: toggle(SHAKE_STEPS.find(([v]) => v === save.shake)?.[1] ?? '强', () => {
      const i = SHAKE_STEPS.findIndex(([v]) => v === save.shake);
      save.shake = SHAKE_STEPS[(i + 1) % SHAKE_STEPS.length][0];
      changed();
    }, save.shake > 0 ? COLORS.player : COLORS.dim),
  });
  if (opts.allowQuality) {
    rows.push({
      label: '画质',
      build: toggle(save.quality === 'smooth' ? '流畅' : '高清', () => {
        // textures are baked for the render density at boot, so apply by reloading
        save.quality = save.quality === 'smooth' ? 'high' : 'smooth';
        writeSave();
        window.location.reload();
      }),
    });
  }

  const pw = Math.min(460, w - 24);
  const headerH = h < 420 ? 56 : 76;
  const footerH = h < 420 ? 52 : 64;
  const rowH = Math.min(52, (h - 16 - headerH - footerH) / rows.length);
  const ph = headerH + rows.length * rowH + footerH;
  const top = h / 2 - ph / 2;
  const left = w / 2 - pw / 2 + 24;
  const right = w / 2 + pw / 2 - 20;
  c.add(panel(scene, w / 2, h / 2, pw, ph, COLORS.player));
  c.add(glowText(scene.add.text(w / 2, top + headerH / 2 + 2, '设置', style(h < 420 ? 24 : 30, COLORS.player, true)).setOrigin(0.5), COLORS.player, 12));
  const bh = Math.min(36, rowH - 8);
  rows.forEach((r, i) => {
    const y = top + headerH + i * rowH + rowH / 2;
    c.add(scene.add.text(left, y, r.label, style(16, COLORS.text)).setOrigin(0, 0.5));
    r.build(right, y, bh);
  });
  c.add(makeButton(scene, w / 2, top + ph - footerH / 2, 160, Math.min(40, footerH - 12), '返回', opts.onClose, COLORS.player, 18));
}
