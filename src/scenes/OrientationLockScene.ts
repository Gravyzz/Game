import Phaser from 'phaser';
import { COLORS } from '@config/colors';
import { TEXT_STYLES } from '@config/fonts';
import { GAME } from '@config/game';
import { RU } from '@i18n/ru';

/**
 * Заглушка «поверни телефон, братишка».
 * Слушает window.orientationchange — как только портрет, сразу выходит.
 */
export class OrientationLockScene extends Phaser.Scene {
  private resizeListener: () => void = () => {};

  constructor() {
    super({ key: 'OrientationLockScene' });
  }

  create(): void {
    const { WIDTH, HEIGHT } = GAME;

    // Чёрный фон
    this.add.rectangle(WIDTH / 2, HEIGHT / 2, WIDTH, HEIGHT, COLORS.black);

    // Пиктограмма — простой rotated phone (ASCII-art из прямоугольников,
    // потом заменим на красивый SVG/спрайт)
    const phone = this.add.container(WIDTH / 2, HEIGHT / 2 - 120);
    const body = this.add.rectangle(0, 0, 180, 320, COLORS.cream).setStrokeStyle(6, COLORS.red);
    const screen = this.add.rectangle(0, 0, 140, 260, COLORS.greyDark);
    phone.add([body, screen]);

    // Анимируем поворот — будто телефон крутится
    this.tweens.add({
      targets: phone,
      rotation: { from: 0, to: -Math.PI / 2 },
      duration: 1200,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });

    // Заголовок
    const title = this.add.text(WIDTH / 2, HEIGHT / 2 + 140, RU.orientationLock.title, {
      ...TEXT_STYLES.title,
      color: '#FF2E2E',
    });
    title.setOrigin(0.5);

    // Подпись
    const body2 = this.add.text(WIDTH / 2, HEIGHT / 2 + 220, RU.orientationLock.body, {
      ...TEXT_STYLES.body,
      wordWrap: { width: WIDTH - 100 },
    });
    body2.setOrigin(0.5);

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
