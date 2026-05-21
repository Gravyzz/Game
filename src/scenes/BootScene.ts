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
    this.load.image('play-interlevel-bg', 'assets/play/interlevel-bg.jpeg');
    this.load.image('fortune-bg', 'assets/play/fortune-bg.png');
    this.load.image('fortune-wheel', 'assets/play/fortune-wheel.png');
    this.load.image('spin-button', 'assets/play/spin-button.png');
    this.load.image('fortune-layout', 'assets/play/fortune-layout.png');
    this.load.image('unluck-bg', 'assets/play/unluck-bg.png');
    this.load.image('unluck-layout', 'assets/play/unluck-layout.png');
    this.load.image('luck-layout', 'assets/play/luck-layout.png');

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
    this.load.image('recipe-bg', 'assets/recipememo/bg.png');
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
    this.load.image('dontwork-office-bg', 'assets/dontwork/stages/office-bg.png');
    this.load.image('dontwork-boss-bg', 'assets/dontwork/stages/boss-bg.png');
    this.load.image('dontwork-deadline-bg', 'assets/dontwork/stages/deadline-bg.png');
    this.load.image('dontwork-basic-pizza', 'assets/dontwork/objects/basic-pizza.png');
    this.load.image('dontwork-bolognese', 'assets/dontwork/objects/bolognese.png');
    this.load.image('dontwork-caesar-salad', 'assets/dontwork/objects/caesar-salad.png');
    this.load.image('dontwork-cheese-pizza', 'assets/dontwork/objects/cheese-pizza.png');
    this.load.image('dontwork-coke', 'assets/dontwork/objects/coke.png');
    this.load.image('dontwork-french-fries', 'assets/dontwork/objects/french-fries.png');
    this.load.image('dontwork-bomb', 'assets/dontwork/objects/bomb.png');
    this.load.image('dontwork-coffee', 'assets/dontwork/objects/coffee.png');
    this.load.image('dontwork-clip', 'assets/dontwork/objects/clip.png');
    this.load.image('dontwork-folder', 'assets/dontwork/objects/folder.png');
    this.load.image('dontwork-folderr', 'assets/dontwork/objects/folderr.png');
    this.load.image('dontwork-papers', 'assets/dontwork/objects/papers.png');
    this.load.image('dontwork-stapler', 'assets/dontwork/objects/stapler.png');
    this.load.image('dontwork-kpi-boss', 'assets/dontwork/objects/kpi-boss.png');
    this.load.image('dontwork-name', 'assets/dontwork/objects/name.png');
    this.load.image('chopchop-bg', 'assets/chopchop/bg.png');
    this.load.image('chopchop-product-bacon', 'assets/chopchop/product-bacon.png');
    this.load.image('chopchop-product-basilic', 'assets/chopchop/product-basilic.png');
    this.load.image('chopchop-product-blue-cheese', 'assets/chopchop/product-blue-cheese.png');
    this.load.image('chopchop-product-cheese', 'assets/chopchop/product-cheese.png');
    this.load.image('chopchop-product-holopenio', 'assets/chopchop/product-holopenio.png');
    this.load.image('chopchop-product-italian-weed', 'assets/chopchop/product-italian-weed.png');
    this.load.image('chopchop-product-ham', 'assets/chopchop/product-ham.png');
    this.load.image('chopchop-product-maslins', 'assets/chopchop/product-maslins.png');
    this.load.image('chopchop-product-meat', 'assets/chopchop/product-meat.png');
    this.load.image('chopchop-product-olive', 'assets/chopchop/product-olive.png');
    this.load.image('chopchop-product-onion', 'assets/chopchop/product-onion.png');
    this.load.image('chopchop-product-parmedjano', 'assets/chopchop/product-parmedjano.png');
    this.load.image('chopchop-product-purple-basilic', 'assets/chopchop/product-purple-basilic.png');
    this.load.image('chopchop-product-pineaple', 'assets/chopchop/product-pineaple.png');
    this.load.image('chopchop-product-pepper', 'assets/chopchop/product-pepper.png');
    this.load.image('chopchop-product-peperoni', 'assets/chopchop/product-peperoni.png');
    this.load.image('chopchop-product-parsley', 'assets/chopchop/product-parsley.png');
    this.load.image('chopchop-product-red-onion', 'assets/chopchop/product-red-onion.png');
    this.load.image('chopchop-product-salad', 'assets/chopchop/product-salad.png');
    this.load.image('chopchop-product-sausage', 'assets/chopchop/product-sausage.png');
    this.load.image('chopchop-product-sause', 'assets/chopchop/product-sause.png');
    this.load.image('chopchop-product-shampinions', 'assets/chopchop/product-shampinions.png');
    this.load.image('chopchop-product-sweet-pepper', 'assets/chopchop/product-sweet-pepper.png');
    this.load.image('chopchop-product-tomato', 'assets/chopchop/product-tomato.png');
    this.load.image('chopchop-product-viled-tomatoes', 'assets/chopchop/product-viled-tomatoes.png');
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
    this.load.image('jeff-player-kurer', 'assets/jeffrey/player-kurer.png');
    this.load.image('jeff-tram', 'assets/jeffrey/tram.png');
    for (let i = 1; i <= 11; i += 1) this.load.image(`jeff-car-${i}`, `assets/jeffrey/car-${i}.png`);
    for (let i = 1; i <= 8; i += 1) this.load.image(`jeff-tree-${i}`, `assets/jeffrey/tree-${i}.png`);
    for (let i = 1; i <= 1; i += 1) this.load.image(`jeff-barrier-${i}`, `assets/jeffrey/barrier-${i}.png`);
    for (let i = 1; i <= 8; i += 1) this.load.image(`jeff-barrier-extra-${i}`, `assets/jeffrey/barrier-extra-${i}.png`);
    for (let i = 1; i <= 6; i += 1) this.load.image(`jeff-column-${i}`, `assets/jeffrey/column-${i}.png`);
    for (let i = 1; i <= 15; i += 1) this.load.image(`jeff-building-${i}`, `assets/jeffrey/building-${i}.png`);
    this.load.image('jeff-floor-puddle', 'assets/jeffrey/floors/puddle.png');
    this.load.image('jeff-floor-grid', 'assets/jeffrey/floors/grid.png');
    this.load.image('jeff-floor-snow', 'assets/jeffrey/floors/snow.png');
    this.load.image('jeff-floor-railway', 'assets/jeffrey/floors/railway.png');
    this.load.image('jeff-floor-parking', 'assets/jeffrey/floors/parking.png');
    this.load.image('jeff-floor-road-1', 'assets/jeffrey/floors/road-1.png');
    this.load.image('jeff-floor-road-2', 'assets/jeffrey/floors/road-2.png');
    for (let i = 1; i <= 8; i += 1) this.load.image(`jeff-floor-sidewalk-${i}`, `assets/jeffrey/floors/sidewalk-${i}.png`);
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
      'jeff-player-kurer',
      'jeff-tram',
      ...Array.from({ length: 11 }, (_, i) => `jeff-car-${i + 1}`),
      ...Array.from({ length: 8 }, (_, i) => `jeff-tree-${i + 1}`),
      ...Array.from({ length: 1 }, (_, i) => `jeff-barrier-${i + 1}`),
      ...Array.from({ length: 8 }, (_, i) => `jeff-barrier-extra-${i + 1}`),
      ...Array.from({ length: 6 }, (_, i) => `jeff-column-${i + 1}`),
      ...Array.from({ length: 15 }, (_, i) => `jeff-building-${i + 1}`),
      'jeff-floor-puddle', 'jeff-floor-grid', 'jeff-floor-snow', 'jeff-floor-railway',
      'jeff-floor-parking', 'jeff-floor-road-1', 'jeff-floor-road-2',
      ...Array.from({ length: 8 }, (_, i) => `jeff-floor-sidewalk-${i + 1}`),
    ].forEach((k) => {
      if (this.textures.exists(k)) {
        this.textures.get(k).setFilter(Phaser.Textures.FilterMode.NEAREST);
      }
    });

    // Снимаем HTML-лоадер ТОЛЬКО когда SplashScene уже отрисовала первый кадр.
    // Если убрать раньше (фейдом или setTimeout) — на 400мс camera fadeIn сплеша
    // оба слоя одновременно полупрозрачные, видна каша из тайл-звёзд лоадера
    // поверх логотипа. К моменту CREATE камера сплеша = сплошной #5a54f9, что
    // совпадает с фоном лоадера → переход незаметен, без флеша.
    const htmlLoader = document.getElementById('boot-loader');
    const splash = this.scene.get('SplashScene');
    splash.events.once(Phaser.Scenes.Events.CREATE, () => {
      htmlLoader?.remove();
    });

    this.scene.start('SplashScene');
  }
}
