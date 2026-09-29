import Phaser from 'phaser';
import { BootScene } from './scenes/BootScene';
import { MenuScene } from './scenes/MenuScene';
import { GameScene } from './scenes/GameScene';
import { UIScene } from './scenes/UIScene';
import { sfx } from './game/audio';
import { music } from './game/music';
import { loadSave } from './game/save';
import { res, updateRes } from './ui/screen';

sfx.setMuted(loadSave().muted);
music.setEnabled(loadSave().music);

// Browsers only allow audio after a user gesture.
const unlock = () => {
  sfx.unlock();
  music.start();
};
window.addEventListener('pointerdown', unlock);
window.addEventListener('keydown', unlock);
// long-press on phones would otherwise pop the browser's context menu mid-game
window.addEventListener('contextmenu', (e) => e.preventDefault());

/** CSS size of the game area. */
function cssSize() {
  const app = document.getElementById('app')!;
  return { w: app.clientWidth || window.innerWidth, h: app.clientHeight || window.innerHeight };
}

function boot() {
  // Render at physical pixel density: game size = CSS size × res, displayed at CSS size
  // (zoom 1/res). Phaser 3's RESIZE mode only renders at CSS pixels, which is blurry on phones.
  const r = res();
  const { w, h } = cssSize();
  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent: 'app',
    backgroundColor: '#07060f',
    scale: {
      mode: Phaser.Scale.NONE,
      width: Math.round(w * r),
      height: Math.round(h * r),
      zoom: 1 / r,
    },
    input: { activePointers: 3 },
    render: { antialias: true, powerPreference: 'high-performance' },
    scene: [BootScene, MenuScene, GameScene, UIScene],
  });

  const fit = () => {
    const nr = updateRes();
    const s = cssSize();
    if (s.w <= 0 || s.h <= 0) return;
    game.scale.setZoom(1 / nr);
    game.scale.resize(Math.round(s.w * nr), Math.round(s.h * nr));
  };
  window.addEventListener('resize', fit);
  window.addEventListener('orientationchange', () => setTimeout(fit, 200));
  window.visualViewport?.addEventListener('resize', fit);

  // Handy for debugging from the console.
  (window as unknown as { __game: Phaser.Game }).__game = game;
  if (import.meta.env.DEV) (window as unknown as { __audio: object }).__audio = { sfx, music };
}

// WebGL framebuffers fail to initialise at 0×0 (e.g. a hidden iframe/tab), so wait for a real size.
let booted = false;
function bootWhenSized() {
  if (booted) return;
  if (window.innerWidth > 0 && window.innerHeight > 0) {
    booted = true;
    window.removeEventListener('resize', bootWhenSized);
    boot();
  } else {
    requestAnimationFrame(bootWhenSized);
  }
}
window.addEventListener('resize', bootWhenSized);
bootWhenSized();
