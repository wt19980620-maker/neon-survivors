import Phaser from 'phaser';
import { generateTextures } from '../game/textures';
import { res } from '../ui/screen';

export class BootScene extends Phaser.Scene {
  constructor() {
    super('Boot');
  }

  create() {
    generateTextures(this, res());
    this.scene.start('Menu');
  }
}
