import Phaser from 'phaser';
import { COLORS, FONT, hex } from './palette';
import { CHARACTERS, EVOLUTIONS, type CharId } from './data';

type Draw = (ctx: CanvasRenderingContext2D, w: number, h: number) => void;

/**
 * Textures are drawn at TEX× their logical size so sprites stay sharp on the high-res canvas.
 * Every sprite using them must be scaled by texScale() (= 1 / TEX); UI icons that use
 * setDisplaySize() are unaffected.
 */
let TEX = 1;

export function texScale() {
  return 1 / TEX;
}

function make(scene: Phaser.Scene, key: string, w: number, h: number, draw: Draw, pad = 0) {
  if (scene.textures.exists(key)) scene.textures.remove(key);
  const tex = scene.textures.createCanvas(key, Math.ceil((w + pad * 2) * TEX), Math.ceil((h + pad * 2) * TEX))!;
  const ctx = tex.getContext();
  ctx.scale(TEX, TEX);
  ctx.translate(pad, pad);
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  draw(ctx, w, h);
  tex.refresh();
}

/**
 * Centred world sprite: adds a transparent margin so the neon glow fades out instead of
 * being clipped into a visible square. Only for origin-centred sprites (not icons shown
 * with setDisplaySize, not tiles).
 */
function sprite(scene: Phaser.Scene, key: string, w: number, h: number, draw: Draw) {
  make(scene, key, w, h, draw, 12);
}

/** shadowBlur is in device pixels and ignores the context transform. */
const blur = (px: number) => px * TEX;

/** Stroke + translucent fill with a neon glow, drawn twice for a stronger halo. */
function neon(ctx: CanvasRenderingContext2D, color: number, path: () => void, opts: { fill?: number; line?: number; blur?: number } = {}) {
  const c = hex(color);
  ctx.save();
  ctx.shadowColor = c;
  ctx.shadowBlur = blur(opts.blur ?? 10);
  ctx.strokeStyle = c;
  ctx.lineWidth = opts.line ?? 2.5;
  ctx.fillStyle = c;
  for (let i = 0; i < 2; i++) {
    ctx.beginPath();
    path();
    ctx.globalAlpha = opts.fill ?? 0.25;
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.stroke();
  }
  ctx.restore();
}

function poly(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, sides: number, rot = 0) {
  for (let i = 0; i < sides; i++) {
    const a = rot + (i / sides) * Math.PI * 2;
    const x = cx + Math.cos(a) * r;
    const y = cy + Math.sin(a) * r;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
}

function star(ctx: CanvasRenderingContext2D, cx: number, cy: number, r1: number, r2: number, points: number, rot = 0) {
  for (let i = 0; i < points * 2; i++) {
    const a = rot + (i / (points * 2)) * Math.PI * 2;
    const r = i % 2 === 0 ? r1 : r2;
    const x = cx + Math.cos(a) * r;
    const y = cy + Math.sin(a) * r;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
}

function radial(ctx: CanvasRenderingContext2D, w: number, h: number, inner = 'rgba(255,255,255,1)') {
  const g = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
  g.addColorStop(0, inner);
  g.addColorStop(0.35, 'rgba(255,255,255,0.45)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
}

// Shape painters shared by world sprites and UI icons.
const shapes = {
  bolt(ctx: CanvasRenderingContext2D, cx: number, cy: number, s: number, color: number = COLORS.bolt) {
    neon(ctx, color, () => ctx.ellipse(cx, cy, 11 * s, 4.5 * s, 0, 0, Math.PI * 2), { fill: 0.8, blur: 12 });
  },
  blade(ctx: CanvasRenderingContext2D, cx: number, cy: number, s: number, color: number = COLORS.orbit) {
    neon(ctx, color, () => {
      ctx.moveTo(cx, cy - 14 * s);
      ctx.lineTo(cx + 6 * s, cy);
      ctx.lineTo(cx, cy + 14 * s);
      ctx.lineTo(cx - 6 * s, cy);
      ctx.closePath();
    }, { fill: 0.55, blur: 12 });
  },
  disc(ctx: CanvasRenderingContext2D, cx: number, cy: number, s: number, color: number = COLORS.disc) {
    neon(ctx, color, () => ctx.arc(cx, cy, 13 * s, 0, Math.PI * 2), { fill: 0.2, line: 3, blur: 12 });
    neon(ctx, color, () => {
      for (let i = 0; i < 3; i++) {
        const a = (i / 3) * Math.PI * 2;
        ctx.moveTo(cx, cy);
        ctx.lineTo(cx + Math.cos(a) * 13 * s, cy + Math.sin(a) * 13 * s);
      }
    }, { fill: 0, line: 2.5, blur: 6 });
  },
  nova(ctx: CanvasRenderingContext2D, cx: number, cy: number, s: number, color: number = COLORS.nova) {
    neon(ctx, color, () => ctx.arc(cx, cy, 14 * s, 0, Math.PI * 2), { fill: 0.05, line: 2.5 });
    neon(ctx, color, () => ctx.arc(cx, cy, 8 * s, 0, Math.PI * 2), { fill: 0.1, line: 2 });
    neon(ctx, color, () => ctx.arc(cx, cy, 3 * s, 0, Math.PI * 2), { fill: 1, line: 1 });
  },
  laser(ctx: CanvasRenderingContext2D, cx: number, cy: number, s: number, color: number = COLORS.laser) {
    neon(ctx, color, () => {
      ctx.moveTo(cx - 15 * s, cy + 15 * s);
      ctx.lineTo(cx + 15 * s, cy - 15 * s);
    }, { fill: 0, line: 5 * s, blur: 12 });
    neon(ctx, 0xffffff, () => {
      ctx.moveTo(cx - 13 * s, cy + 13 * s);
      ctx.lineTo(cx + 13 * s, cy - 13 * s);
    }, { fill: 0, line: 1.5 * s, blur: 4 });
  },
  frost(ctx: CanvasRenderingContext2D, cx: number, cy: number, s: number, color: number = COLORS.frost) {
    // six-armed snowflake
    neon(ctx, color, () => {
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        const x = cx + Math.cos(a) * 14 * s;
        const y = cy + Math.sin(a) * 14 * s;
        ctx.moveTo(cx, cy);
        ctx.lineTo(x, y);
        const bx = cx + Math.cos(a) * 8 * s;
        const by = cy + Math.sin(a) * 8 * s;
        ctx.moveTo(bx, by);
        ctx.lineTo(bx + Math.cos(a + 0.8) * 4 * s, by + Math.sin(a + 0.8) * 4 * s);
        ctx.moveTo(bx, by);
        ctx.lineTo(bx + Math.cos(a - 0.8) * 4 * s, by + Math.sin(a - 0.8) * 4 * s);
      }
    }, { fill: 0, line: 2 * s, blur: 8 });
  },
  mine(ctx: CanvasRenderingContext2D, cx: number, cy: number, s: number, color: number = COLORS.mine) {
    neon(ctx, color, () => ctx.arc(cx, cy, 10 * s, 0, Math.PI * 2), { fill: 0.25, line: 2.5 });
    neon(ctx, color, () => {
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
        ctx.moveTo(cx + Math.cos(a) * 10 * s, cy + Math.sin(a) * 10 * s);
        ctx.lineTo(cx + Math.cos(a) * 15 * s, cy + Math.sin(a) * 15 * s);
      }
    }, { fill: 0, line: 2.5 });
    neon(ctx, 0xffffff, () => ctx.arc(cx, cy, 3 * s, 0, Math.PI * 2), { fill: 1, line: 1, blur: 6 });
  },
  chain(ctx: CanvasRenderingContext2D, cx: number, cy: number, s: number, color: number = COLORS.chain) {
    neon(ctx, color, () => {
      ctx.moveTo(cx + 3 * s, cy - 15 * s);
      ctx.lineTo(cx - 7 * s, cy + 1 * s);
      ctx.lineTo(cx + 1 * s, cy + 1 * s);
      ctx.lineTo(cx - 3 * s, cy + 15 * s);
      ctx.lineTo(cx + 8 * s, cy - 3 * s);
      ctx.lineTo(cx, cy - 3 * s);
      ctx.closePath();
    }, { fill: 0.6, line: 2 });
  },
};

function iconFrame(ctx: CanvasRenderingContext2D, w: number, h: number, color: number) {
  ctx.save();
  ctx.fillStyle = 'rgba(18,16,40,0.95)';
  ctx.strokeStyle = hex(color);
  ctx.lineWidth = 2;
  ctx.shadowColor = hex(color);
  ctx.shadowBlur = blur(6);
  const r = 9;
  ctx.beginPath();
  ctx.roundRect(3, 3, w - 6, h - 6, r);
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

function glyphIcon(scene: Phaser.Scene, key: string, color: number, glyph: string) {
  make(scene, key, 48, 48, (ctx, w, h) => {
    iconFrame(ctx, w, h, color);
    ctx.save();
    ctx.font = `bold 22px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = hex(color);
    ctx.shadowColor = hex(color);
    ctx.shadowBlur = blur(8);
    ctx.fillText(glyph, w / 2, h / 2 + 1);
    ctx.restore();
  });
}

export function generateTextures(scene: Phaser.Scene, scale = 1) {
  TEX = scale;
  // --- players: each character has its own colour and silhouette
  const bodies: Record<CharId, (ctx: CanvasRenderingContext2D, cx: number, cy: number) => void> = {
    runner: (ctx, cx, cy) => ctx.arc(cx, cy, 12, 0, Math.PI * 2),
    guardian: (ctx, cx, cy) => poly(ctx, cx, cy, 13, 6, Math.PI / 6),
    assassin: (ctx, cx, cy) => poly(ctx, cx, cy, 14, 4),
    storm: (ctx, cx, cy) => star(ctx, cx, cy, 15, 7, 5, -Math.PI / 2),
    monk: (ctx, cx, cy) => {
      ctx.arc(cx, cy, 13, 0, Math.PI * 2);
      ctx.moveTo(cx + 8, cy);
      ctx.arc(cx, cy, 8, 0, Math.PI * 2);
    },
  };
  for (const c of CHARACTERS) {
    sprite(scene, `player_${c.id}`, 48, 48, (ctx, w, h) => {
      neon(ctx, c.color, () => bodies[c.id](ctx, w / 2, h / 2), { fill: 0.35, line: 3, blur: 14 });
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(w / 2, h / 2, 4.5, 0, Math.PI * 2);
      ctx.fill();
    });
    sprite(scene, `player_dir_${c.id}`, 48, 48, (ctx, w, h) => {
      neon(ctx, c.color, () => {
        ctx.moveTo(w / 2 + 22, h / 2);
        ctx.lineTo(w / 2 + 15, h / 2 - 5);
        ctx.lineTo(w / 2 + 15, h / 2 + 5);
        ctx.closePath();
      }, { fill: 0.9, line: 1.5, blur: 6 });
    });
  }

  // --- enemies
  sprite(scene, 'e_chaser', 40, 40, (ctx, w, h) => {
    neon(ctx, COLORS.chaser, () => {
      ctx.moveTo(w / 2 + 13, h / 2);
      ctx.lineTo(w / 2 - 10, h / 2 - 11);
      ctx.lineTo(w / 2 - 5, h / 2);
      ctx.lineTo(w / 2 - 10, h / 2 + 11);
      ctx.closePath();
    }, { fill: 0.3 });
  });
  sprite(scene, 'e_bat', 32, 32, (ctx, w, h) => {
    neon(ctx, COLORS.bat, () => {
      ctx.moveTo(w / 2 + 9, h / 2);
      ctx.lineTo(w / 2 - 2, h / 2 - 9);
      ctx.lineTo(w / 2 - 8, h / 2 - 4);
      ctx.lineTo(w / 2 - 3, h / 2);
      ctx.lineTo(w / 2 - 8, h / 2 + 4);
      ctx.lineTo(w / 2 - 2, h / 2 + 9);
      ctx.closePath();
    }, { fill: 0.35, line: 2 });
  });
  sprite(scene, 'e_brute', 64, 64, (ctx, w, h) => {
    neon(ctx, COLORS.brute, () => poly(ctx, w / 2, h / 2, 21, 6, Math.PI / 6), { fill: 0.25, line: 3.5, blur: 12 });
    neon(ctx, COLORS.brute, () => poly(ctx, w / 2, h / 2, 9, 6, Math.PI / 6), { fill: 0.6, line: 2 });
  });
  sprite(scene, 'e_boss', 128, 128, (ctx, w, h) => {
    neon(ctx, COLORS.boss, () => star(ctx, w / 2, h / 2, 48, 30, 8), { fill: 0.22, line: 4, blur: 18 });
    neon(ctx, COLORS.boss, () => poly(ctx, w / 2, h / 2, 20, 8, Math.PI / 8), { fill: 0.35, line: 3 });
    neon(ctx, 0xffffff, () => ctx.arc(w / 2, h / 2, 7, 0, Math.PI * 2), { fill: 1, line: 1, blur: 12 });
  });
  sprite(scene, 'e_spitter', 40, 40, (ctx, w, h) => {
    // round body with a forward-facing "nozzle"
    neon(ctx, COLORS.spitter, () => ctx.arc(w / 2 - 2, h / 2, 11, 0, Math.PI * 2), { fill: 0.25, line: 2.5 });
    neon(ctx, COLORS.spitter, () => {
      ctx.moveTo(w / 2 + 8, h / 2 - 5);
      ctx.lineTo(w / 2 + 16, h / 2);
      ctx.lineTo(w / 2 + 8, h / 2 + 5);
    }, { fill: 0, line: 2.5 });
    neon(ctx, 0xffffff, () => ctx.arc(w / 2 + 1, h / 2, 3, 0, Math.PI * 2), { fill: 1, line: 1, blur: 6 });
  });
  sprite(scene, 'e_splitter', 48, 48, (ctx, w, h) => {
    neon(ctx, COLORS.splitter, () => poly(ctx, w / 2, h / 2, 17, 4, Math.PI / 4), { fill: 0.2, line: 3 });
    neon(ctx, COLORS.splitter, () => {
      ctx.moveTo(w / 2 - 9, h / 2);
      ctx.lineTo(w / 2 + 9, h / 2);
      ctx.moveTo(w / 2, h / 2 - 9);
      ctx.lineTo(w / 2, h / 2 + 9);
    }, { fill: 0, line: 2 });
  });
  sprite(scene, 'e_splitling', 26, 26, (ctx, w, h) => {
    neon(ctx, COLORS.splitter, () => poly(ctx, w / 2, h / 2, 8, 4, Math.PI / 4), { fill: 0.45, line: 2 });
  });
  sprite(scene, 'e_bomber', 36, 36, (ctx, w, h) => {
    neon(ctx, COLORS.bomber, () => star(ctx, w / 2, h / 2, 13, 7, 8), { fill: 0.35, line: 2 });
    neon(ctx, 0xffffff, () => ctx.arc(w / 2, h / 2, 3.5, 0, Math.PI * 2), { fill: 1, line: 1, blur: 8 });
  });
  sprite(scene, 'ebullet', 20, 20, (ctx, w, h) => {
    neon(ctx, COLORS.enemyBullet, () => ctx.arc(w / 2, h / 2, 5, 0, Math.PI * 2), { fill: 0.9, line: 2, blur: 8 });
  });

  // --- weapons
  sprite(scene, 'bolt', 36, 20, (ctx, w, h) => shapes.bolt(ctx, w / 2, h / 2, 1));
  sprite(scene, 'blade', 36, 40, (ctx, w, h) => shapes.blade(ctx, w / 2, h / 2, 1));
  sprite(scene, 'disc', 40, 40, (ctx, w, h) => shapes.disc(ctx, w / 2, h / 2, 1));
  make(scene, 'ring', 256, 256, (ctx, w, h) => {
    ctx.save();
    ctx.strokeStyle = '#ffffff';
    ctx.shadowColor = '#ffffff';
    ctx.shadowBlur = blur(16);
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.arc(w / 2, h / 2, 110, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
    const g = ctx.createRadialGradient(w / 2, h / 2, 40, w / 2, h / 2, 112);
    g.addColorStop(0, 'rgba(255,255,255,0)');
    g.addColorStop(1, 'rgba(255,255,255,0.25)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(w / 2, h / 2, 112, 0, Math.PI * 2);
    ctx.fill();
  });
  make(scene, 'glow', 64, 64, (ctx, w, h) => radial(ctx, w, h));
  make(scene, 'spark', 12, 12, (ctx, w, h) => radial(ctx, w, h));

  // --- pickups
  const gem = (key: string, color: number, s: number) =>
    sprite(scene, key, 24, 28, (ctx, w, h) => {
      neon(ctx, color, () => {
        ctx.moveTo(w / 2, h / 2 - 8 * s);
        ctx.lineTo(w / 2 + 5.5 * s, h / 2);
        ctx.lineTo(w / 2, h / 2 + 8 * s);
        ctx.lineTo(w / 2 - 5.5 * s, h / 2);
        ctx.closePath();
      }, { fill: 0.6, line: 2, blur: 8 });
    });
  gem('gem1', COLORS.gem1, 0.9);
  gem('gem2', COLORS.gem2, 1.05);
  gem('gem3', COLORS.gem3, 1.25);
  sprite(scene, 'heart', 28, 28, (ctx, w, h) => {
    neon(ctx, COLORS.heart, () => {
      const x = w / 2, y = h / 2 + 2;
      ctx.moveTo(x, y + 7);
      ctx.bezierCurveTo(x - 12, y - 2, x - 6, y - 12, x, y - 5);
      ctx.bezierCurveTo(x + 6, y - 12, x + 12, y - 2, x, y + 7);
      ctx.closePath();
    }, { fill: 0.7, line: 2 });
  });
  sprite(scene, 'magnet', 30, 30, (ctx, w, h) => {
    neon(ctx, COLORS.magnet, () => {
      ctx.arc(w / 2, h / 2, 8, Math.PI, 0, true);
      ctx.moveTo(w / 2 - 8, h / 2);
      ctx.lineTo(w / 2 - 8, h / 2 - 8);
      ctx.moveTo(w / 2 + 8, h / 2);
      ctx.lineTo(w / 2 + 8, h / 2 - 8);
    }, { fill: 0, line: 4.5 });
  });
  sprite(scene, 'chest', 36, 32, (ctx, w, h) => {
    neon(ctx, COLORS.chest, () => ctx.roundRect(5, 8, w - 10, h - 14, 4), { fill: 0.35, line: 2.5, blur: 12 });
    neon(ctx, COLORS.chest, () => {
      ctx.moveTo(5, 15);
      ctx.lineTo(w - 5, 15);
      ctx.moveTo(w / 2, 12);
      ctx.lineTo(w / 2, 19);
    }, { fill: 0, line: 2 });
  });
  sprite(scene, 'coin', 20, 20, (ctx, w, h) => {
    neon(ctx, COLORS.coin, () => ctx.arc(w / 2, h / 2, 5.5, 0, Math.PI * 2), { fill: 0.6, line: 2, blur: 6 });
  });

  // --- background grid tile
  make(scene, 'grid', 64, 64, (ctx, w, h) => {
    ctx.fillStyle = hex(COLORS.bg);
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = hex(COLORS.grid);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0.5, 0);
    ctx.lineTo(0.5, h);
    ctx.moveTo(0, 0.5);
    ctx.lineTo(w, 0.5);
    ctx.stroke();
    ctx.fillStyle = 'rgba(94,242,255,0.18)';
    ctx.fillRect(0, 0, 2, 2);
  });

  // --- UI icons
  const weaponIcon = (key: string, color: number, paint: (ctx: CanvasRenderingContext2D, cx: number, cy: number, s: number) => void) =>
    make(scene, key, 48, 48, (ctx, w, h) => {
      iconFrame(ctx, w, h, color);
      paint(ctx, w / 2, h / 2, 1.1);
    });
  weaponIcon('icon_bolt', COLORS.bolt, (ctx, cx, cy, s) => {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(-Math.PI / 4);
    shapes.bolt(ctx, 0, 0, s);
    ctx.restore();
  });
  weaponIcon('icon_orbit', COLORS.orbit, (ctx, cx, cy, s) => shapes.blade(ctx, cx, cy, s));
  weaponIcon('icon_nova', COLORS.nova, (ctx, cx, cy, s) => shapes.nova(ctx, cx, cy, s));
  weaponIcon('icon_chain', COLORS.chain, (ctx, cx, cy, s) => shapes.chain(ctx, cx, cy, s));
  weaponIcon('icon_disc', COLORS.disc, (ctx, cx, cy, s) => shapes.disc(ctx, cx, cy, s));
  weaponIcon('icon_laser', COLORS.laser, (ctx, cx, cy, s) => shapes.laser(ctx, cx, cy, s));
  weaponIcon('icon_frost', COLORS.frost, (ctx, cx, cy, s) => shapes.frost(ctx, cx, cy, s));
  weaponIcon('icon_mine', COLORS.mine, (ctx, cx, cy, s) => shapes.mine(ctx, cx, cy, s));
  sprite(scene, 'mine', 32, 32, (ctx, w, h) => shapes.mine(ctx, w / 2, h / 2, 0.8));
  sprite(scene, 'mine_evo', 32, 32, (ctx, w, h) => shapes.mine(ctx, w / 2, h / 2, 0.8, EVOLUTIONS.mine.color));

  glyphIcon(scene, 'icon_might', 0xff6b6b, '力');
  glyphIcon(scene, 'icon_haste', 0x7cf8ff, '急');
  glyphIcon(scene, 'icon_area', 0xb58cff, '域');
  glyphIcon(scene, 'icon_amount', 0xffd24d, '多');
  glyphIcon(scene, 'icon_speed', 0x7dffb0, '疾');
  glyphIcon(scene, 'icon_magnet', 0xff9a3d, '磁');
  glyphIcon(scene, 'icon_armor', 0x9aa8ff, '甲');
  glyphIcon(scene, 'icon_vitality', 0xff6b8b, '命');
  glyphIcon(scene, 'icon_growth', 0x4dc3ff, '长');
  glyphIcon(scene, 'icon_coin', 0xffd24d, '金');
  glyphIcon(scene, 'icon_revive', 0xffffff, '魂');
  glyphIcon(scene, 'icon_heal', COLORS.heart, '愈');
  glyphIcon(scene, 'icon_lock', COLORS.dim, '锁');
  glyphIcon(scene, 'icon_trophy', COLORS.elite, '奖');
  glyphIcon(scene, 'icon_trophy_off', COLORS.panelEdge, '奖');

  // --- evolved weapons: recoloured world sprites + gold-framed icons with a star badge
  const E = EVOLUTIONS;
  sprite(scene, 'bolt_evo', 40, 22, (ctx, w, h) => shapes.bolt(ctx, w / 2, h / 2, 1.1, E.bolt.color));
  sprite(scene, 'blade_evo', 40, 44, (ctx, w, h) => shapes.blade(ctx, w / 2, h / 2, 1.1, E.orbit.color));
  sprite(scene, 'disc_evo', 44, 44, (ctx, w, h) => shapes.disc(ctx, w / 2, h / 2, 1.1, E.disc.color));
  const evoIcon = (key: string, paint: (ctx: CanvasRenderingContext2D, cx: number, cy: number) => void) =>
    make(scene, key, 48, 48, (ctx, w, h) => {
      iconFrame(ctx, w, h, COLORS.elite);
      paint(ctx, w / 2, h / 2);
      ctx.save();
      ctx.fillStyle = hex(COLORS.elite);
      ctx.shadowColor = hex(COLORS.elite);
      ctx.shadowBlur = blur(6);
      ctx.beginPath();
      star(ctx, w - 11, 11, 7, 3, 5, -Math.PI / 2);
      ctx.fill();
      ctx.restore();
    });
  evoIcon('icon_evo_bolt', (ctx, cx, cy) => {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(-Math.PI / 4);
    shapes.bolt(ctx, -3, -5, 0.8, E.bolt.color);
    shapes.bolt(ctx, 3, 5, 0.8, E.bolt.color);
    ctx.restore();
  });
  evoIcon('icon_evo_orbit', (ctx, cx, cy) => {
    for (let i = 0; i < 4; i++) {
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate((i * Math.PI) / 2);
      shapes.blade(ctx, 0, -9, 0.55, E.orbit.color);
      ctx.restore();
    }
  });
  evoIcon('icon_evo_nova', (ctx, cx, cy) => shapes.nova(ctx, cx, cy, 1.15, E.nova.color));
  evoIcon('icon_evo_chain', (ctx, cx, cy) => shapes.chain(ctx, cx, cy, 1.15, E.chain.color));
  evoIcon('icon_evo_laser', (ctx, cx, cy) => {
    ctx.save();
    ctx.translate(cx, cy);
    for (const a of [-Math.PI / 4, Math.PI / 4]) {
      ctx.save();
      ctx.rotate(a);
      shapes.laser(ctx, 0, 0, 0.9, E.laser.color);
      ctx.restore();
    }
    ctx.restore();
  });
  evoIcon('icon_evo_frost', (ctx, cx, cy) => shapes.frost(ctx, cx, cy, 1.15, E.frost.color));
  evoIcon('icon_evo_mine', (ctx, cx, cy) => shapes.mine(ctx, cx, cy, 1.1, E.mine.color));
  evoIcon('icon_evo_disc', (ctx, cx, cy) => {
    shapes.disc(ctx, cx - 5, cy + 4, 0.65, E.disc.color);
    shapes.disc(ctx, cx + 7, cy - 6, 0.5, E.disc.color);
    shapes.disc(ctx, cx + 8, cy + 9, 0.4, E.disc.color);
  });
}
