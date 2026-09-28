import Phaser from 'phaser';
import { BootScene } from './scenes/BootScene';
import { MenuScene } from './scenes/MenuScene';
import { GameScene } from './scenes/GameScene';
import { UIScene } from './scenes/UIScene';
import { sfx } from './game/audio';
import { loadSave } from './game/save';

sfx.setMuted(loadSave().muted);

// Browsers only allow audio after a user gesture.
const unlock = () => sfx.unlock();
window.addEventListener('pointerdown', unlock);
window.addEventListener('keydown', unlock);

function boot() {
  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent: 'app',
    backgroundColor: '#07060f',
    scale: {
      mode: Phaser.Scale.RESIZE,
      width: window.innerWidth,
      height: window.innerHeight,
    },
    input: { activePointers: 3 },
    render: { antialias: true, powerPreference: 'high-performance' },
    scene: [BootScene, MenuScene, GameScene, UIScene],
  });
  // Handy for debugging from the console.
  (window as unknown as { __game: Phaser.Game }).__game = game;
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
