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
    this.load.image('orientation-phone-pixel', 'assets/orientation-phone-pixel.png');
    this.load.image('sound-on-pixel', 'assets/sound-on-pixel.png');
    this.load.image('sound-off-pixel', 'assets/sound-off-pixel.png');
    this.load.image('firestarter-oven-1', 'assets/firestarter/oven-1.png');
    this.load.image('firestarter-oven-2', 'assets/firestarter/oven-2.png');
    this.load.image('firestarter-oven-3', 'assets/firestarter/oven-3.png');
    this.load.image('firestarter-smoke-1', 'assets/firestarter/smoke-1.png');
    this.load.image('firestarter-smoke-2', 'assets/firestarter/smoke-2.png');
    this.load.image('firestarter-pizza-raw', 'assets/firestarter/pizza-raw.png');
    this.load.image('firestarter-pizza-ok', 'assets/firestarter/pizza-ok.png');
    this.load.image('firestarter-pizza-coal', 'assets/firestarter/pizza-coal.png');
    this.load.image('firestarter-result-coal', 'assets/firestarter/coal.png');
    this.load.image('firestarter-result-ice', 'assets/firestarter/ice.png');
    this.load.image('firestarter-result-ok', 'assets/firestarter/ok.png');
    this.load.image('firestarter-picture', 'assets/firestarter/picture.png');
    this.load.image('firestarter-plant', 'assets/firestarter/plant.png');
    this.load.image('firestarter-lamp', 'assets/firestarter/lamp.png');
    this.load.image('recipe-card-cover', 'assets/recipememo/card-cover.png');
    this.load.image('recipe-card-face', 'assets/recipememo/card-face.png');
    this.load.image('recipe-5s', 'assets/recipememo/5s.png');
    this.load.image('recipe-cola', 'assets/recipememo/cola.png');
    this.load.image('recipe-cookie', 'assets/recipememo/cookie.png');
    this.load.image('recipe-frenchfries', 'assets/recipememo/frenchfries.png');
    this.load.image('recipe-magnifer', 'assets/recipememo/magnifer.png');
    this.load.image('recipe-pasta', 'assets/recipememo/pasta.png');
    this.load.image('recipe-pepperoni', 'assets/recipememo/pepperoni.png');
    this.load.image('recipe-roll', 'assets/recipememo/roll.png');
    this.load.image('recipe-runaway', 'assets/recipememo/runaway.png');
    this.load.image('recipe-sand-watch', 'assets/recipememo/sand-watch.png');
    this.load.image('recipe-balloon-b', 'assets/recipememo/balloon-b.png');
    this.load.image('recipe-balloon-y', 'assets/recipememo/balloon-y.png');
    this.load.image('recipe-balloon-g', 'assets/recipememo/balloon-g.png');
    this.load.image('recipe-balloon-o', 'assets/recipememo/balloon-o.png');
    this.load.image('recipe-balloon-r', 'assets/recipememo/balloon-r.png');
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

    this.scene.start('SplashScene');
  }
}
