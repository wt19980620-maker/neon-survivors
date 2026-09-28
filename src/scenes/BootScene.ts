import Phaser from 'phaser';
import { generateTextures } from '../game/textures';

export class BootScene extends Phaser.Scene {
  constructor() {
    super('Boot');
  }

  create() {
    generateTextures(this);
    this.scene.start('Menu');
  }
}
