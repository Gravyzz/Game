import Phaser from 'phaser';
import { ALL_IMAGE_ASSETS, loadImageAssets } from '@core/AssetManifest';
import { ALL_AUDIO_PATHS } from '@core/AudioCatalog';

export class BootScene extends Phaser.Scene {
  private imageRatio = 0;
  private audioDone = 0;

  constructor() {
    super({ key: 'BootScene' });
  }

  preload(): void {
    loadImageAssets(this, ALL_IMAGE_ASSETS);
    this.load.on('progress', (val: number) => {
      this.imageRatio = val;
      this.updateBootProgress();
    });
  }

  async create(): Promise<void> {
    this.imageRatio = 1;
    this.updateBootProgress();

    const audioPromise = Promise.all(
      ALL_AUDIO_PATHS.map((path) =>
        fetch(path)
          .then((res) => res.arrayBuffer())
          .catch(() => undefined)
          .finally(() => {
            this.audioDone += 1;
            this.updateBootProgress();
          })
      )
    );

    const fontsPromise = Promise.race([
      Promise.all([
        document.fonts.load('900 italic 64px Unbounded'),
        document.fonts.load('800 italic 24px Unbounded'),
        document.fonts.load('600 18px Onest'),
        document.fonts.load('400 32px "Press Start 2P"'),
      ]),
      new Promise((resolve) => setTimeout(resolve, 3000)),
    ]).catch((err) => {
      console.warn('[BootScene] Fonts loading failed, using fallback', err);
    });

    await Promise.all([audioPromise, fontsPromise]);

    this.updateBootProgress(1);

    const htmlLoader = document.getElementById('boot-loader');
    const comics = this.scene.get('ComicsScene');
    comics.events.once(Phaser.Scenes.Events.CREATE, () => {
      htmlLoader?.remove();
    });

    this.scene.start('ComicsScene');
  }

  private updateBootProgress(forceRatio?: number): void {
    const totalImages = ALL_IMAGE_ASSETS.length;
    const totalAudio = ALL_AUDIO_PATHS.length;
    const total = totalImages + totalAudio;

    const ratio =
      forceRatio !== undefined
        ? forceRatio
        : total > 0
          ? (this.imageRatio * totalImages + this.audioDone) / total
          : 1;

    const pct = Math.max(0, Math.min(100, Math.round(ratio * 100)));
    const text = document.getElementById('boot-loader-progress');
    if (text) text.textContent = `${pct}%`;
    const bar = document.getElementById('boot-loader-bar-fill');
    if (bar) bar.style.width = `${pct}%`;
  }
}
