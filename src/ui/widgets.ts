import Phaser from 'phaser';
import { COLORS, FONT, hex } from '../game/palette';
import { sfx } from '../game/audio';

export function style(size: number, color: number | string = COLORS.text, bold = false): Phaser.Types.GameObjects.Text.TextStyle {
  return {
    fontFamily: FONT,
    fontSize: `${Math.round(size)}px`,
    fontStyle: bold ? 'bold' : 'normal',
    color: typeof color === 'number' ? hex(color) : color,
  };
}

export function glowText(t: Phaser.GameObjects.Text, color: number, blur = 14) {
  return t.setShadow(0, 0, hex(color), blur, true, true);
}

export function formatTime(sec: number) {
  const s = Math.max(0, Math.floor(sec));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

export interface Button extends Phaser.GameObjects.Container {
  setLabel(text: string): Button;
  setEnabled(on: boolean): Button;
}

export function makeButton(
  scene: Phaser.Scene,
  x: number,
  y: number,
  w: number,
  h: number,
  label: string,
  onClick: () => void,
  color: number = COLORS.player,
  size = 20,
  /** 'up' is needed for actions browsers only allow on a completed tap, e.g. fullscreen */
  trigger: 'down' | 'up' = 'down',
): Button {
  const c = scene.add.container(x, y) as Button;
  const bg = scene.add.rectangle(0, 0, w, h, COLORS.panel, 0.92).setStrokeStyle(2, color, 0.9);
  const glow = scene.add.rectangle(0, 0, w, h, color, 0).setBlendMode(Phaser.BlendModes.ADD);
  const txt = glowText(scene.add.text(0, 0, label, style(size, color, true)).setOrigin(0.5), color, 8);
  c.add([bg, glow, txt]);
  let enabled = true;
  bg.setInteractive({ useHandCursor: true });
  bg.on('pointerover', () => {
    if (!enabled) return;
    glow.setFillStyle(color, 0.16);
    c.setScale(1.04);
  });
  bg.on('pointerout', () => {
    glow.setFillStyle(color, 0);
    c.setScale(1);
  });
  bg.on('pointerdown', (_p: Phaser.Input.Pointer, _x: number, _y: number, ev: Phaser.Types.Input.EventData) => {
    ev.stopPropagation();
    if (!enabled || trigger !== 'down') return;
    sfx.play('select');
    onClick();
  });
  if (trigger === 'up') {
    bg.on('pointerup', () => {
      if (!enabled) return;
      sfx.play('select');
      onClick();
    });
  }
  c.setLabel = (t: string) => {
    txt.setText(t);
    return c;
  };
  c.setEnabled = (on: boolean) => {
    enabled = on;
    c.setAlpha(on ? 1 : 0.45);
    return c;
  };
  return c;
}

/** Panel background: translucent fill, neon edge. */
export function panel(scene: Phaser.Scene, x: number, y: number, w: number, h: number, edge: number = COLORS.panelEdge) {
  return scene.add.rectangle(x, y, w, h, COLORS.panel, 0.94).setStrokeStyle(2, edge, 1);
}
