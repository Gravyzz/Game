import Phaser from 'phaser';

/**
 * Boot scene. Грузит шрифты, прячет HTML-лоадер, переходит в Splash.
 *
 * Phaser сам не дёргает Google Fonts — приходится дожидаться загрузки
 * через document.fonts API, иначе на первом рендере увидим fallback-шрифт.
 */
export class BootScene extends Phaser.Scene {
  constructor() {
    super({ key: 'BootScene' });
  }

  preload(): void {
    this.load.svg('make-love-pizza-logo', 'assets/logo-make-love-pizza.svg');
    this.load.image('make-love-pizza-logo-pixel', 'assets/logo-make-love-pizza-pixel.png');
    this.load.image('heart-pixel', 'assets/heart-pixel.png');
    this.load.image('pizza-pixel', 'assets/pizza-pixel.png');
    this.load.image('gamepad-pixel', 'assets/gamepad-pixel.png');
    this.load.image('star-pixel', 'assets/star-pixel.png');
    this.load.image('sound-on-pixel', 'assets/sound-on-pixel.png');
    this.load.image('sound-off-pixel', 'assets/sound-off-pixel.png');
  }

  async create(): Promise<void> {
    // Ждём шрифты с Google Fonts. Если не дождались за 3 сек — продолжаем
    // с fallback (system-ui), чтобы игра не зависла на медленной сети.
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

    // Прячем HTML-лоадер — теперь рулит Phaser
    const htmlLoader = document.getElementById('boot-loader');
    if (htmlLoader) {
      htmlLoader.classList.add('hidden');
      // Удаляем из DOM после анимации, чтобы не перехватывал тачи
      setTimeout(() => htmlLoader.remove(), 500);
    }

    // Проверяем ориентацию ПЕРЕД сплэшем — если landscape, сразу в lock
    if (this.isLandscape()) {
      this.scene.start('OrientationLockScene');
    } else {
      this.scene.start('SplashScene');
    }
  }

  private isLandscape(): boolean {
    return window.innerWidth > window.innerHeight;
  }
}
