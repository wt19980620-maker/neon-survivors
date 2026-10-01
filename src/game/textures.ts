import Phaser from 'phaser';
import { COLORS, FONT, hex } from './palette';
import { CHARACTERS, EVOLUTIONS, MAPS, type CharId } from './data';

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
  fireball(ctx: CanvasRenderingContext2D, cx: number, cy: number, s: number, color: number = COLORS.fireball) {
    // teardrop flame pointing right, with a hot core
    neon(ctx, color, () => {
      ctx.moveTo(cx + 13 * s, cy);
      ctx.quadraticCurveTo(cx + 2 * s, cy - 10 * s, cx - 6 * s, cy - 7 * s);
      ctx.arc(cx - 6 * s, cy, 7 * s, -Math.PI / 2, Math.PI / 2, true);
      ctx.quadraticCurveTo(cx + 2 * s, cy + 10 * s, cx + 13 * s, cy);
      ctx.closePath();
    }, { fill: 0.55, line: 2, blur: 12 });
    neon(ctx, 0xfff2c4, () => ctx.arc(cx - 4 * s, cy, 3.5 * s, 0, Math.PI * 2), { fill: 1, line: 1, blur: 8 });
  },
  meteor(ctx: CanvasRenderingContext2D, cx: number, cy: number, s: number, color: number = COLORS.meteor) {
    // rock with a streaking tail up-left
    neon(ctx, color, () => {
      ctx.moveTo(cx - 15 * s, cy - 15 * s);
      ctx.lineTo(cx - 2 * s, cy - 6 * s);
      ctx.moveTo(cx - 9 * s, cy - 16 * s);
      ctx.lineTo(cx + 1 * s, cy - 8 * s);
      ctx.moveTo(cx - 16 * s, cy - 8 * s);
      ctx.lineTo(cx - 5 * s, cy - 1 * s);
    }, { fill: 0, line: 2 * s, blur: 8 });
    neon(ctx, color, () => poly(ctx, cx + 4 * s, cy + 4 * s, 8 * s, 7, 0.4), { fill: 0.6, line: 2, blur: 10 });
  },
  cyclone(ctx: CanvasRenderingContext2D, cx: number, cy: number, s: number, color: number = COLORS.cyclone) {
    // three spiral arms
    neon(ctx, color, () => {
      for (let k = 0; k < 3; k++) {
        const a0 = (k / 3) * Math.PI * 2;
        for (let i = 0; i <= 14; i++) {
          const t = i / 14;
          const a = a0 + t * 3.2;
          const r = (3 + t * 12) * s;
          const x = cx + Math.cos(a) * r;
          const y = cy + Math.sin(a) * r;
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
      }
    }, { fill: 0, line: 2.2 * s, blur: 8 });
  },
  spirit(ctx: CanvasRenderingContext2D, cx: number, cy: number, s: number, color: number = COLORS.spirit) {
    // wisp: round head with a wavy tail to the left
    neon(ctx, color, () => {
      ctx.arc(cx + 3 * s, cy, 7 * s, -Math.PI / 2, Math.PI / 2);
      ctx.quadraticCurveTo(cx - 6 * s, cy + 9 * s, cx - 14 * s, cy + 2 * s);
      ctx.quadraticCurveTo(cx - 7 * s, cy + 1 * s, cx - 10 * s, cy - 4 * s);
      ctx.quadraticCurveTo(cx - 4 * s, cy - 8 * s, cx + 3 * s, cy - 7 * s);
      ctx.closePath();
    }, { fill: 0.5, line: 2, blur: 12 });
    neon(ctx, 0xffffff, () => ctx.arc(cx + 4 * s, cy, 2.5 * s, 0, Math.PI * 2), { fill: 1, line: 1, blur: 6 });
  },
  sword(ctx: CanvasRenderingContext2D, cx: number, cy: number, s: number, color: number = COLORS.sword) {
    // diagonal blade with a crossguard, point to the upper right
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(-Math.PI / 4);
    neon(ctx, color, () => {
      ctx.moveTo(-6 * s, -2.5 * s);
      ctx.lineTo(13 * s, -2.5 * s);
      ctx.lineTo(17 * s, 0);
      ctx.lineTo(13 * s, 2.5 * s);
      ctx.lineTo(-6 * s, 2.5 * s);
      ctx.closePath();
    }, { fill: 0.55, line: 2, blur: 10 });
    neon(ctx, color, () => {
      ctx.moveTo(-6 * s, -7 * s);
      ctx.lineTo(-6 * s, 7 * s);
      ctx.moveTo(-6 * s, 0);
      ctx.lineTo(-14 * s, 0);
    }, { fill: 0, line: 2.6 * s, blur: 6 });
    ctx.restore();
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

/** Solid body (so it reads as terrain, not an effect) with a neon outline. Fits a radius-48 circle. */
function drawObstacle(ctx: CanvasRenderingContext2D, cx: number, cy: number, kind: 'pillar' | 'crystal' | 'ruin', color: number, bg: number) {
  // enemies are outlines only; a filled, tinted body makes terrain read as solid at a glance
  const body = (path: () => void) => {
    ctx.save();
    ctx.beginPath();
    path();
    ctx.fillStyle = hex(bg);
    ctx.globalAlpha = 0.95;
    ctx.fill();
    const grad = ctx.createRadialGradient(cx - 14, cy - 18, 4, cx, cy, 52);
    grad.addColorStop(0, hex(color));
    grad.addColorStop(1, hex(bg));
    ctx.fillStyle = grad;
    ctx.globalAlpha = 0.38;
    ctx.fill();
    ctx.restore();
    neon(ctx, color, path, { fill: 0.06, line: 4, blur: 16 });
  };
  if (kind === 'pillar') {
    body(() => ctx.arc(cx, cy, 44, 0, Math.PI * 2));
    neon(ctx, color, () => ctx.arc(cx, cy, 28, 0, Math.PI * 2), { fill: 0.08, line: 2, blur: 8 });
    neon(ctx, color, () => ctx.arc(cx, cy, 8, 0, Math.PI * 2), { fill: 0.6, line: 1.5, blur: 10 });
  } else if (kind === 'crystal') {
    // shards radiating from a solid base, filling the collision circle so there are no invisible walls
    const shards: [number, number, number, number][] = [
      [0, 0, 46, 0], [0, 0, 42, 1.25], [0, 0, 44, 2.5], [0, 0, 40, 3.8], [0, 0, 43, 5.05],
    ];
    body(() => poly(ctx, cx, cy, 30, 6, Math.PI / 6));
    for (const [dx, dy, len, rot] of shards) {
      body(() => {
        const x = cx + dx, y = cy + dy;
        const c = Math.cos(rot), s = Math.sin(rot);
        const pts: [number, number][] = [[0, -len], [len * 0.42, -len * 0.38], [len * 0.3, 0], [-len * 0.3, 0], [-len * 0.42, -len * 0.38]];
        pts.forEach(([px, py], i) => {
          const X = x + px * c - py * s;
          const Y = y + px * s + py * c;
          if (i === 0) ctx.moveTo(X, Y);
          else ctx.lineTo(X, Y);
        });
        ctx.closePath();
      });
    }
  } else {
    body(() => poly(ctx, cx, cy, 45, 8, Math.PI / 8));
    neon(ctx, color, () => {
      // cracks
      ctx.moveTo(cx - 30, cy - 12);
      ctx.lineTo(cx - 8, cy - 2);
      ctx.lineTo(cx + 4, cy - 22);
      ctx.moveTo(cx + 12, cy + 30);
      ctx.lineTo(cx + 2, cy + 8);
      ctx.lineTo(cx + 26, cy + 2);
    }, { fill: 0, line: 2, blur: 6 });
  }
}

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
    pyro: (ctx, cx, cy) => poly(ctx, cx, cy + 2, 15, 3, -Math.PI / 2),
    meihua: (ctx, cx, cy) => {
      // plum blossom: five round petals
      for (let k = 0; k < 5; k++) {
        const a = -Math.PI / 2 + (k / 5) * Math.PI * 2;
        const px = cx + Math.cos(a) * 8;
        const py = cy + Math.sin(a) * 8;
        ctx.moveTo(px + 6.5, py);
        ctx.arc(px, py, 6.5, 0, Math.PI * 2);
      }
    },
    caller: (ctx, cx, cy) => {
      // little ghost: round head, wavy hem
      ctx.moveTo(cx - 12, cy + 12);
      ctx.lineTo(cx - 12, cy - 2);
      ctx.arc(cx, cy - 2, 12, Math.PI, 0);
      ctx.lineTo(cx + 12, cy + 12);
      for (let i = 0; i < 3; i++) {
        const x0 = cx + 12 - i * 8;
        ctx.quadraticCurveTo(x0 - 2, cy + 6, x0 - 4, cy + 9);
        ctx.quadraticCurveTo(x0 - 6, cy + 12, x0 - 8, cy + 12);
      }
      ctx.closePath();
    },
    wind: (ctx, cx, cy) => {
      // three curved blades swirling round the core
      for (let k = 0; k < 3; k++) {
        const a = (k / 3) * Math.PI * 2;
        const tip = a + 1.2;
        ctx.moveTo(cx + Math.cos(a) * 4, cy + Math.sin(a) * 4);
        ctx.quadraticCurveTo(cx + Math.cos(a + 0.2) * 16, cy + Math.sin(a + 0.2) * 16, cx + Math.cos(tip) * 15, cy + Math.sin(tip) * 15);
        ctx.quadraticCurveTo(cx + Math.cos(a + 0.9) * 8, cy + Math.sin(a + 0.9) * 8, cx + Math.cos(a + 2.1) * 4, cy + Math.sin(a + 2.1) * 4);
      }
    },
    astro: (ctx, cx, cy) => {
      // crescent moon opening to the right
      ctx.arc(cx, cy, 14, Math.PI * 0.28, Math.PI * 1.72);
      ctx.arc(cx + 7, cy, 10, Math.PI * 1.45, Math.PI * 0.55, true);
      ctx.closePath();
    },
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
  sprite(scene, 'e_boss_hive', 128, 128, (ctx, w, h) => {
    // honeycomb: a big cell with seven chambers
    neon(ctx, COLORS.hive, () => poly(ctx, w / 2, h / 2, 48, 6, Math.PI / 6), { fill: 0.16, line: 4, blur: 18 });
    for (let i = 0; i < 7; i++) {
      const a = (i / 6) * Math.PI * 2;
      const r = i === 6 ? 0 : 22;
      neon(ctx, COLORS.hive, () => poly(ctx, w / 2 + Math.cos(a) * r, h / 2 + Math.sin(a) * r, 11, 6, Math.PI / 6), { fill: i === 6 ? 0.6 : 0.3, line: 2, blur: 6 });
    }
    neon(ctx, 0xffffff, () => ctx.arc(w / 2, h / 2, 5, 0, Math.PI * 2), { fill: 1, line: 1, blur: 12 });
  });
  sprite(scene, 'e_boss_prism', 128, 128, (ctx, w, h) => {
    // two interlocked triangles around a faceted core
    neon(ctx, COLORS.prism, () => poly(ctx, w / 2, h / 2, 50, 3, -Math.PI / 2), { fill: 0.14, line: 3.5, blur: 18 });
    neon(ctx, COLORS.prism, () => poly(ctx, w / 2, h / 2, 50, 3, Math.PI / 2), { fill: 0.14, line: 3.5, blur: 18 });
    neon(ctx, COLORS.prism, () => poly(ctx, w / 2, h / 2, 18, 6), { fill: 0.45, line: 2.5 });
    neon(ctx, 0xffffff, () => ctx.arc(w / 2, h / 2, 6, 0, Math.PI * 2), { fill: 1, line: 1, blur: 12 });
  });
  sprite(scene, 'e_egg', 36, 40, (ctx, w, h) => {
    neon(ctx, COLORS.hive, () => ctx.ellipse(w / 2, h / 2, 12, 15, 0, 0, Math.PI * 2), { fill: 0.3, line: 2.5, blur: 10 });
    neon(ctx, COLORS.hive, () => ctx.ellipse(w / 2, h / 2 + 2, 5, 6, 0, 0, Math.PI * 2), { fill: 0.7, line: 1.5, blur: 6 });
  });
  const bullet = (key: string, color: number) =>
    sprite(scene, key, 20, 20, (ctx, w, h) => {
      neon(ctx, color, () => ctx.arc(w / 2, h / 2, 5, 0, Math.PI * 2), { fill: 0.9, line: 2, blur: 8 });
    });
  bullet('ebullet', COLORS.enemyBullet);
  bullet('ebullet_acid', 0xb8ff4d);
  bullet('ebullet_void', 0xc79bff);
  bullet('ebullet_prism', COLORS.prism);

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

  // --- per-map floor tiles and obstacles (drawn at radius 48; sprites scale to the real radius)
  for (const m of MAPS) {
    make(scene, `grid_${m.id}`, 64, 64, (ctx, w, h) => {
      ctx.fillStyle = hex(m.bg);
      ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = hex(m.grid);
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0.5, 0);
      ctx.lineTo(0.5, h);
      ctx.moveTo(0, 0.5);
      ctx.lineTo(w, 0.5);
      ctx.stroke();
      ctx.globalAlpha = 0.25;
      ctx.fillStyle = hex(m.accent);
      ctx.fillRect(0, 0, 2, 2);
    });
    sprite(scene, `ob_${m.id}`, 96, 96, (ctx, w, h) => drawObstacle(ctx, w / 2, h / 2, m.obstacle, m.accent, m.bg));
  }

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
  weaponIcon('icon_fireball', COLORS.fireball, (ctx, cx, cy, s) => {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(-Math.PI / 4);
    shapes.fireball(ctx, 0, 0, s);
    ctx.restore();
  });
  weaponIcon('icon_meteor', COLORS.meteor, (ctx, cx, cy, s) => shapes.meteor(ctx, cx, cy, s));
  weaponIcon('icon_cyclone', COLORS.cyclone, (ctx, cx, cy, s) => shapes.cyclone(ctx, cx, cy, s));
  weaponIcon('icon_spirit', COLORS.spirit, (ctx, cx, cy, s) => shapes.spirit(ctx, cx, cy, s));
  weaponIcon('icon_sword', COLORS.sword, (ctx, cx, cy, s) => shapes.sword(ctx, cx, cy, s));
  // golden egg: pickup and icon
  const egg = (ctx: CanvasRenderingContext2D, cx: number, cy: number, k: number) => {
    neon(ctx, COLORS.coin, () => ctx.ellipse(cx, cy, 9 * k, 11.5 * k, 0, 0, Math.PI * 2), { fill: 0.55, line: 2.2, blur: 12 });
    ctx.save();
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.beginPath();
    ctx.ellipse(cx - 3 * k, cy - 4 * k, 2.2 * k, 3.4 * k, -0.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  };
  sprite(scene, 'egg', 32, 36, (ctx, w, h) => egg(ctx, w / 2, h / 2, 1));
  make(scene, 'icon_egg', 48, 48, (ctx, w, h) => {
    iconFrame(ctx, w, h, COLORS.coin);
    egg(ctx, w / 2, h / 2, 1.2);
  });
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
  glyphIcon(scene, 'icon_box', COLORS.box, '匣');
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
  sprite(scene, 'fireball', 36, 28, (ctx, w, h) => shapes.fireball(ctx, w / 2, h / 2, 1));
  sprite(scene, 'fireball_evo', 44, 34, (ctx, w, h) => shapes.fireball(ctx, w / 2, h / 2, 1.25, E.fireball.color));
  const rock = (key: string, color: number) =>
    sprite(scene, key, 40, 40, (ctx, w, h) => {
      neon(ctx, color, () => poly(ctx, w / 2, h / 2, 13, 7, 0.4), { fill: 0.55, line: 2.5, blur: 14 });
      neon(ctx, 0xffffff, () => ctx.arc(w / 2 - 2, h / 2 - 2, 4, 0, Math.PI * 2), { fill: 0.9, line: 1, blur: 8 });
    });
  rock('meteor_rock', COLORS.meteor);
  rock('meteor_rock_evo', E.meteor.color);
  sprite(scene, 'cyclone', 48, 48, (ctx, w, h) => shapes.cyclone(ctx, w / 2, h / 2, 1.4));
  sprite(scene, 'cyclone_evo', 48, 48, (ctx, w, h) => shapes.cyclone(ctx, w / 2, h / 2, 1.4, E.cyclone.color));
  sprite(scene, 'wisp', 36, 28, (ctx, w, h) => shapes.spirit(ctx, w / 2, h / 2, 0.9));
  sprite(scene, 'wisp_evo', 36, 28, (ctx, w, h) => shapes.spirit(ctx, w / 2, h / 2, 0.9, E.spirit.color));
  // sword slash: a crescent pointing right, centred on the swing's pivot (radius 50 = SLASH_TEX_R)
  const slash = (key: string, color: number) =>
    sprite(scene, key, 108, 108, (ctx, w, h) => {
      const cx = w / 2;
      const cy = h / 2;
      const a = (65 * Math.PI) / 180;
      neon(ctx, color, () => {
        ctx.arc(cx, cy, 50, -a, a);
        ctx.arc(cx - 10, cy, 36, a * 0.9, -a * 0.9, true);
        ctx.closePath();
      }, { fill: 0.3, line: 1.6, blur: 10 });
      // a thin leading edge in the same colour (a white one read as a camera flash)
      neon(ctx, color, () => ctx.arc(cx, cy, 48, -a * 0.8, a * 0.8), { fill: 0, line: 1.2, blur: 4 });
    });
  slash('slash', COLORS.sword);
  slash('slash_evo', E.sword.color);
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
  evoIcon('icon_evo_fireball', (ctx, cx, cy) => {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(-Math.PI / 4);
    shapes.fireball(ctx, 0, 0, 1.2, E.fireball.color);
    ctx.restore();
  });
  evoIcon('icon_evo_meteor', (ctx, cx, cy) => {
    shapes.meteor(ctx, cx - 4, cy - 2, 0.7, E.meteor.color);
    shapes.meteor(ctx, cx + 6, cy + 6, 0.55, E.meteor.color);
  });
  evoIcon('icon_evo_cyclone', (ctx, cx, cy) => {
    shapes.cyclone(ctx, cx - 6, cy + 2, 0.7, E.cyclone.color);
    shapes.cyclone(ctx, cx + 7, cy - 3, 0.6, E.cyclone.color);
  });
  evoIcon('icon_evo_spirit', (ctx, cx, cy) => {
    shapes.spirit(ctx, cx - 2, cy - 7, 0.6, E.spirit.color);
    shapes.spirit(ctx, cx + 3, cy + 1, 0.6, E.spirit.color);
    shapes.spirit(ctx, cx - 4, cy + 9, 0.6, E.spirit.color);
  });
  evoIcon('icon_evo_sword', (ctx, cx, cy) => {
    shapes.sword(ctx, cx - 2, cy + 2, 1.1, E.sword.color);
    neon(ctx, E.sword.color, () => ctx.arc(cx, cy, 15, Math.PI * 0.15, Math.PI * 0.85), { fill: 0, line: 2, blur: 6 });
  });
  evoIcon('icon_evo_disc', (ctx, cx, cy) => {
    shapes.disc(ctx, cx - 5, cy + 4, 0.65, E.disc.color);
    shapes.disc(ctx, cx + 7, cy - 6, 0.5, E.disc.color);
    shapes.disc(ctx, cx + 8, cy + 9, 0.4, E.disc.color);
  });
}
