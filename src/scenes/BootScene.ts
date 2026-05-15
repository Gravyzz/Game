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
    // ===== Бренд =====
    this.load.image('make-love-pizza-logo-pixel', 'assets/branding/logo-make-love-pizza-pixel.png');
    this.load.image('main-menu-bg', 'assets/branding/main-menu-bg.png');

    // ===== UI =====
    this.load.image('heart-pixel',             'assets/ui/heart-pixel.png');
    this.load.image('pizza-pixel',             'assets/ui/pizza-pixel.png');
    this.load.image('gamepad-pixel',           'assets/ui/gamepad-pixel.png');
    this.load.image('star-pixel',              'assets/ui/star-pixel.png');
    this.load.image('orientation-phone-pixel', 'assets/ui/orientation-phone-pixel.png');
    this.load.image('sound-on-pixel',          'assets/ui/sound-on-pixel.png');
    this.load.image('sound-off-pixel',         'assets/ui/sound-off-pixel.png');
    this.load.image('home-pixel',              'assets/ui/home.png');
    this.load.image('plus-pixel',              'assets/ui/plus.png');
    this.load.image('minus-pixel',             'assets/ui/minus.png');
    this.load.image('cancel-pixel',            'assets/ui/cancel.png');
    this.load.image('splash-tree-grey',        'assets/ui/tree-grey.png');
    this.load.image('splash-tree-purple',      'assets/ui/tree-purple.png');
    this.load.image('splash-tree-blue',        'assets/ui/tree-blue.png');
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
    this.load.image('dontwork-bg', 'assets/dontwork/ninja-bg.png');
    this.load.image('chopchop-product-1', 'assets/chopchop/pixil-frame-0-34.png');
    this.load.image('chopchop-product-2', 'assets/chopchop/pixil-frame-0-33.png');
    this.load.image('chopchop-product-3', 'assets/chopchop/pixil-frame-0-32.png');
    this.load.image('chopchop-product-4', 'assets/chopchop/pixil-frame-0-31.png');
    this.load.image('chopchop-product-5', 'assets/chopchop/pixil-frame-0-30.png');
    this.load.image('chopchop-product-6', 'assets/chopchop/pixil-frame-0-29.png');
    this.load.image('chopchop-product-7', 'assets/chopchop/pixil-frame-0-28.png');
    this.load.image('chopchop-product-8', 'assets/chopchop/pixil-frame-0-27.png');
    this.load.image('chopchop-product-9', 'assets/chopchop/pixil-frame-0-26.png');
    this.load.image('chopchop-product-10', 'assets/chopchop/pixil-frame-0-25.png');
    this.load.image('chopchop-board', 'assets/chopchop/board.png');
    this.load.image('chopchop-jeffri', 'assets/chopchop/jeffri.png');
    this.load.image('chopchop-didi', 'assets/chopchop/didi.png');
    this.load.image('chopchop-bomb', 'assets/chopchop/bomb.png');
    this.load.image('chopchop-perk-timer', 'assets/chopchop/timer.png');
    this.load.image('chopchop-perk-turtle', 'assets/chopchop/turtle.png');
    this.load.image('chopchop-perk-finger', 'assets/chopchop/show_finger.png');
    this.load.image('chopchop-perk-axe', 'assets/chopchop/axe.png');
    this.load.image('chopchop-perk-knife', 'assets/chopchop/knife.png');
    this.load.image('pizzaassembly-target-1', 'assets/pizzaassembly/pixil-frame-0-41.png');
    this.load.image('pizzaassembly-target-2', 'assets/pizzaassembly/pixil-frame-0-40.png');
    this.load.image('pizzaassembly-target-3', 'assets/pizzaassembly/pixil-frame-0-39.png');
    this.load.image('pizzaassembly-woodoo', 'assets/pizzaassembly/woodoo.png');
    this.load.image('pizzaassembly-floor', 'assets/pizzaassembly/floor.png');
    this.load.image('pizzaassembly-lanter', 'assets/pizzaassembly/lanter.png');
    this.load.image('pizzaassembly-knife-hit', 'assets/pizzaassembly/knife-hit.png');
    this.load.image('pizzaassembly-new-pizza', 'assets/pizzaassembly/new-pizza.png');
    this.load.image('pizzaassembly-new-sausage', 'assets/pizzaassembly/new-sausage.png');
    this.load.image('pizzaassembly-new-cheese', 'assets/pizzaassembly/new-cheese.png');
    this.load.image('pizzaassembly-good-knife', 'assets/pizzaassembly/good-knife.png');
    this.load.image('pizzaassembly-knife-hit-bg', 'assets/pizzaassembly/knife-hit-bg.png');
    this.load.image('pizzaassembly-knife-hit-layout', 'assets/pizzaassembly/knife-hit-layout.png');
    this.load.image('surfer-knife-hit', 'assets/surfer/knife-hit.png');
    this.load.image('surfer-sand', 'assets/surfer/sand.png');
    this.load.image('surfer-bubble', 'assets/surfer/bubble.png');
    this.load.image('surfer-fish-2', 'assets/surfer/fish-2.png');
    this.load.image('surfer-fish-1', 'assets/surfer/fish-1.png');
    this.load.image('surfer-hero', 'assets/surfer/surfer.png');
    this.load.image('surfer-sun', 'assets/surfer/sun.png');
    this.load.image('surfer-water-3', 'assets/surfer/water-3.png');
    this.load.image('surfer-water-2', 'assets/surfer/water-2.png');
    this.load.image('surfer-water-1', 'assets/surfer/water-1.png');
    this.load.image('surfer-lightning-2', 'assets/surfer/lightning-2.png');
    this.load.image('surfer-lightning-1', 'assets/surfer/lightning-1.png');
    this.load.image('surfer-birds-2', 'assets/surfer/birds-2.png');
    this.load.image('surfer-clouds-2', 'assets/surfer/clouds-2.png');
    this.load.image('surfer-clouds-1', 'assets/surfer/clouds-1.png');
    this.load.image('surfer-birds-1', 'assets/surfer/birds-1.png');
    this.load.image('surfer-coral-4', 'assets/surfer/coral-4.png');
    this.load.image('surfer-coral-3', 'assets/surfer/coral-3.png');
    this.load.image('surfer-coral-2', 'assets/surfer/coral-2.png');
    this.load.image('surfer-seaweed', 'assets/surfer/seaweed.png');
    this.load.image('surfer-coral-1', 'assets/surfer/coral-1.png');
    this.load.image('surfer-wave-2', 'assets/surfer/wave-2.png');
    this.load.image('surfer-wave-1', 'assets/surfer/wave-1.png');
    this.load.image('surfer-tornado', 'assets/surfer/tornado.png');
    this.load.image('surfer-shield', 'assets/surfer/shield.png');
    this.load.image('dancebeat-bg', 'assets/dancebeat/bg.png');
    this.load.image('dancebeat-up', 'assets/dancebeat/up.png');
    this.load.image('dancebeat-up-grey', 'assets/dancebeat/up-grey.png');
    this.load.image('dancebeat-up-pushed', 'assets/dancebeat/up-pushed.png');
    this.load.image('dancebeat-down', 'assets/dancebeat/down.png');
    this.load.image('dancebeat-down-grey', 'assets/dancebeat/down-grey.png');
    this.load.image('dancebeat-down-pushed', 'assets/dancebeat/down-pushed.png');
    this.load.image('dancebeat-left', 'assets/dancebeat/left.png');
    this.load.image('dancebeat-left-grey', 'assets/dancebeat/left-grey.png');
    this.load.image('dancebeat-left-pushed', 'assets/dancebeat/left-pushed.png');
    this.load.image('dancebeat-right', 'assets/dancebeat/right.png');
    this.load.image('dancebeat-right-grey', 'assets/dancebeat/right-grey.png');
    this.load.image('dancebeat-right-pushed', 'assets/dancebeat/right-pushed.png');

    // ===== Crossy Jeffrey =====
    this.load.image('jeff-car-white',         'assets/jeffrey/pixil-frame-0-8.png');
    this.load.image('jeff-car-green',         'assets/jeffrey/pixil-frame-0-9.png');
    this.load.image('jeff-car-black',         'assets/jeffrey/pixil-frame-0-10.png');
    this.load.image('jeff-car-blue',          'assets/jeffrey/pixil-frame-0-11.png');
    this.load.image('jeff-tree',              'assets/jeffrey/pixil-frame-0-12.png');
    this.load.image('jeff-trash',             'assets/jeffrey/pixil-frame-0-13.png');
    this.load.image('jeff-bench',             'assets/jeffrey/pixil-frame-0-14.png');
    this.load.image('jeff-building-red',      'assets/jeffrey/pixil-frame-0-15.png');
    this.load.image('jeff-building-green',    'assets/jeffrey/pixil-frame-0-16.png');
    this.load.image('jeff-building-orange',   'assets/jeffrey/pixil-frame-0-17.png');
    this.load.image('jeff-building-blue',     'assets/jeffrey/pixil-frame-0-18.png');
    this.load.image('jeff-house-blue',        'assets/jeffrey/pixil-frame-0-19.png');
    this.load.image('jeff-house-orange',      'assets/jeffrey/pixil-frame-0-20.png');
    this.load.image('jeff-house-green',       'assets/jeffrey/pixil-frame-0-21.png');
    this.load.image('jeff-house-yellow',      'assets/jeffrey/pixil-frame-0-22.png');
    this.load.image('jeff-lamp',              'assets/jeffrey/pixil-frame-0-23.png');
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

    // Все Jeffrey-ассеты — пиксельные, нужен NEAREST фильтр чтобы не блюрило
    [
      'jeff-car-white', 'jeff-car-green', 'jeff-car-black', 'jeff-car-blue',
      'jeff-tree', 'jeff-trash', 'jeff-bench', 'jeff-lamp',
      'jeff-building-red', 'jeff-building-green', 'jeff-building-orange', 'jeff-building-blue',
      'jeff-house-blue', 'jeff-house-orange', 'jeff-house-green', 'jeff-house-yellow',
    ].forEach((k) => {
      if (this.textures.exists(k)) {
        this.textures.get(k).setFilter(Phaser.Textures.FilterMode.NEAREST);
      }
    });

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
