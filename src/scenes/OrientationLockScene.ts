import Phaser from 'phaser';
import { GAME, DEPTH } from '@config/game';

/**
 * Заглушка «поверни телефон, братишка».
 * Слушает window.orientationchange — как только портрет, сразу выходит.
 */
export class OrientationLockScene extends Phaser.Scene {
  private resizeListener: () => void = () => {};
  private readonly pixelFont = '"Press Start 2P", monospace';

  constructor() {
    super({ key: 'OrientationLockScene' });
  }

  create(): void {
    const { WIDTH } = GAME;

    this.textures.get('orientation-phone-pixel').setFilter(Phaser.Textures.FilterMode.NEAREST);

    const phone = this.add.image(WIDTH / 2, 360, 'orientation-phone-pixel');
    phone.setOrigin(0.5);
    phone.setDisplaySize(230, 230);
    phone.setRotation(-Math.PI / 2);
    phone.setDepth(DEPTH.ui);

    // Анимируем поворот — будто телефон крутится
    this.tweens.add({
      targets: phone,
      rotation: { from: -Math.PI / 2, to: 0 },
      duration: 1900,
      hold: 450,
      repeatDelay: 450,
      yoyo: true,
      repeat: -1,
      ease: 'Cubic.easeInOut',
    });

    const title = this.add.text(WIDTH / 2, 720, 'Поверни\nтелефон!', {
      fontFamily: this.pixelFont,
      fontSize: '52px',
      color: '#0A0A0A',
      align: 'center',
      lineSpacing: 18,
    });
    title.setOrigin(0.5);
    title.setDepth(DEPTH.ui);

    const body = this.add.text(WIDTH / 2, 900, 'эта игра только\nдля вертикальных\nустройств', {
      fontFamily: this.pixelFont,
      fontSize: '24px',
      color: '#FAF7F0',
      align: 'center',
      lineSpacing: 10,
    });
    body.setOrigin(0.5);
    body.setDepth(DEPTH.ui);

    // Слушаем поворот
    this.resizeListener = () => {
      if (window.innerHeight >= window.innerWidth) {
        // Игрок повернул — возвращаемся в Splash
        this.scene.start('SplashScene');
      }
    };
    window.addEventListener('resize', this.resizeListener);
    window.addEventListener('orientationchange', this.resizeListener);

    // Чистим слушатели при выходе из сцены
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      window.removeEventListener('resize', this.resizeListener);
      window.removeEventListener('orientationchange', this.resizeListener);
    });
  }

}
