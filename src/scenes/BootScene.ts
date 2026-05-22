import Phaser from 'phaser';
import { ALL_ASSETS, loadImageAssets } from '@core/AssetManifest';

export class BootScene extends Phaser.Scene {
  constructor() {
    super({ key: 'BootScene' });
  }

  preload(): void {
    // Грузим вообще всё разом — чтобы переходы между сценами и запуск минок
    // были мгновенными, без фиолетового экрана ожидания на телефоне.
    loadImageAssets(this, ALL_ASSETS);
  }

  async create(): Promise<void> {
    try {
      await Promise.race([
        Promise.all([
          document.fonts.load('900 italic 64px Unbounded'),
          document.fonts.load('800 italic 24px Unbounded'),
          document.fonts.load('600 18px Onest'),
          document.fonts.load('400 32px "Press Start 2P"'),
        ]),
        new Promise((resolve) => setTimeout(resolve, 3000)),
      ]);
    } catch (err) {
      console.warn('[BootScene] Fonts loading failed, using fallback', err);
    }

    const htmlLoader = document.getElementById('boot-loader');
    const comics = this.scene.get('ComicsScene');
    comics.events.once(Phaser.Scenes.Events.CREATE, () => {
      htmlLoader?.remove();
    });

    this.scene.start('ComicsScene');
  }
}
