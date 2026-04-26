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
    // В будущем тут грузим спрайты, атласы. Пока пусто — всё генерируется в коде.
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
