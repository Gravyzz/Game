import type Phaser from 'phaser';

export interface ImageAsset {
  key: string;
  path: string;
}

const asset = (key: string, path: string): ImageAsset => ({ key, path });

const numberedAssets = (
  count: number,
  keyFor: (index: number) => string,
  pathFor: (index: number) => string,
): ImageAsset[] => Array.from({ length: count }, (_, i) => asset(keyFor(i + 1), pathFor(i + 1)));

export function loadImageAssets(scene: Phaser.Scene, assets: readonly ImageAsset[]): void {
  assets.forEach(({ key, path }) => {
    if (!scene.textures.exists(key)) {
      scene.load.image(key, path);
    }
  });
}

export const BOOT_ASSETS: ImageAsset[] = [
  asset('make-love-pizza-logo-pixel', 'assets/branding/logo-make-love-pizza-pixel.png'),
  asset('main-menu-bg', 'assets/branding/main-menu-bg.png'),
  asset('play-interlevel-bg', 'assets/play/interlevel-bg.jpeg'),

  ...Array.from({ length: 4 }, (_, i) => [
    asset(`comics-${i + 1}-close`, `assets/comics/comics-${i + 1}-close.png`),
    asset(`comics-${i + 1}-open`, `assets/comics/comics-${i + 1}-open.png`),
  ]).flat(),
  asset('comics-5', 'assets/comics/comics-5.png'),
  asset('comics-button', 'assets/comics/comics-button.png'),
  asset('comics-skip-button', 'assets/comics/skip-button.png'),

  asset('heart-pixel', 'assets/ui/heart-pixel.png'),
  asset('pizza-pixel', 'assets/ui/pizza-pixel.png'),
  asset('gamepad-pixel', 'assets/ui/gamepad-pixel.png'),
  asset('star-pixel', 'assets/ui/star-pixel.png'),
  asset('orientation-phone-pixel', 'assets/ui/orientation-phone-pixel.png'),
  asset('sound-on-pixel', 'assets/ui/sound-on-pixel.png'),
  asset('sound-off-pixel', 'assets/ui/sound-off-pixel.png'),
  asset('home-pixel', 'assets/ui/home.png'),
  asset('plus-pixel', 'assets/ui/plus.png'),
  asset('minus-pixel', 'assets/ui/minus.png'),
  asset('cancel-pixel', 'assets/ui/cancel.png'),
  asset('splash-tree-grey', 'assets/ui/tree-grey.png'),
  asset('splash-tree-purple', 'assets/ui/tree-purple.png'),
  asset('splash-tree-blue', 'assets/ui/tree-blue.png'),
];

export const WHEEL_ASSETS: ImageAsset[] = [
  asset('fortune-bg', 'assets/play/fortune-bg.png'),
  asset('fortune-wheel', 'assets/play/fortune-wheel.png'),
  asset('spin-button', 'assets/play/spin-button.png'),
];

export const RESULT_ASSETS: ImageAsset[] = [
  asset('unluck-bg', 'assets/play/unluck-bg.png'),
];

export const FIRESTARTER_ASSETS: ImageAsset[] = [
  asset('firestarter-bg', 'assets/firestarter/firestart-bg.png'),
  ...numberedAssets(4, (i) => `firestarter-result-cool-${i}`, (i) => `assets/firestarter/cool-${i}.png`),
  ...numberedAssets(3, (i) => `firestarter-result-coal-${i}`, (i) => `assets/firestarter/coal-${i}.png`),
  ...numberedAssets(2, (i) => `firestarter-result-ice-${i}`, (i) => `assets/firestarter/ice-${i}.png`),
];

export const RECIPE_MEMO_ASSETS: ImageAsset[] = [
  asset('recipe-bg', 'assets/recipememo/bg.png'),
  asset('recipe-card-cover', 'assets/recipememo/card-cover.png'),
  asset('recipe-card-face', 'assets/recipememo/card-face.png'),
  asset('recipe-5s', 'assets/recipememo/5s.png'),
  asset('recipe-cola', 'assets/recipememo/cola.png'),
  asset('recipe-cookie', 'assets/recipememo/cookie.png'),
  asset('recipe-frenchfries', 'assets/recipememo/frenchfries.png'),
  asset('recipe-magnifer', 'assets/recipememo/magnifer.png'),
  asset('recipe-pasta', 'assets/recipememo/pasta.png'),
  asset('recipe-pepperoni', 'assets/recipememo/pepperoni.png'),
  asset('recipe-roll', 'assets/recipememo/roll.png'),
  asset('recipe-runaway', 'assets/recipememo/runaway.png'),
  asset('recipe-sand-watch', 'assets/recipememo/sand-watch.png'),
  asset('recipe-balloon-b', 'assets/recipememo/balloon-b.png'),
  asset('recipe-balloon-y', 'assets/recipememo/balloon-y.png'),
  asset('recipe-balloon-g', 'assets/recipememo/balloon-g.png'),
  asset('recipe-balloon-o', 'assets/recipememo/balloon-o.png'),
  asset('recipe-balloon-r', 'assets/recipememo/balloon-r.png'),
  asset('recipe-win-balloon-purple', 'assets/recipememo/win-balloon-purple.png'),
  asset('recipe-win-balloon-red', 'assets/recipememo/win-balloon-red.png'),
  asset('recipe-win-balloon-green', 'assets/recipememo/win-balloon-green.png'),
  asset('recipe-win-balloon-yellow', 'assets/recipememo/win-balloon-yellow.png'),
  asset('recipe-win-balloon-orange', 'assets/recipememo/win-balloon-orange.png'),
  asset('recipe-win-balloon-heart', 'assets/recipememo/win-balloon-heart.png'),
];

export const DONT_WORK_ASSETS: ImageAsset[] = [
  asset('dontwork-office-bg', 'assets/dontwork/stages/office-bg.png'),
  asset('dontwork-boss-bg', 'assets/dontwork/stages/boss-bg.png'),
  asset('dontwork-deadline-bg', 'assets/dontwork/stages/deadline-bg.png'),
  asset('dontwork-basic-pizza', 'assets/dontwork/objects/basic-pizza.png'),
  asset('dontwork-bolognese', 'assets/dontwork/objects/bolognese.png'),
  asset('dontwork-caesar-salad', 'assets/dontwork/objects/caesar-salad.png'),
  asset('dontwork-cheese-pizza', 'assets/dontwork/objects/cheese-pizza.png'),
  asset('dontwork-coke', 'assets/dontwork/objects/coke.png'),
  asset('dontwork-french-fries', 'assets/dontwork/objects/french-fries.png'),
  asset('dontwork-bomb', 'assets/dontwork/objects/bomb.png'),
  asset('dontwork-coffee', 'assets/dontwork/objects/coffee.png'),
  asset('dontwork-clip', 'assets/dontwork/objects/clip.png'),
  asset('dontwork-folder', 'assets/dontwork/objects/folder.png'),
  asset('dontwork-folderr', 'assets/dontwork/objects/folderr.png'),
  asset('dontwork-papers', 'assets/dontwork/objects/papers.png'),
  asset('dontwork-stapler', 'assets/dontwork/objects/stapler.png'),
  asset('dontwork-kpi-boss', 'assets/dontwork/objects/kpi-boss.png'),
];

export const CHOP_CHOP_ASSETS: ImageAsset[] = [
  asset('chopchop-bg', 'assets/chopchop/bg.png'),
  asset('chopchop-product-bacon', 'assets/chopchop/product-bacon.png'),
  asset('chopchop-product-basilic', 'assets/chopchop/product-basilic.png'),
  asset('chopchop-product-blue-cheese', 'assets/chopchop/product-blue-cheese.png'),
  asset('chopchop-product-cheese', 'assets/chopchop/product-cheese.png'),
  asset('chopchop-product-holopenio', 'assets/chopchop/product-holopenio.png'),
  asset('chopchop-product-italian-weed', 'assets/chopchop/product-italian-weed.png'),
  asset('chopchop-product-ham', 'assets/chopchop/product-ham.png'),
  asset('chopchop-product-maslins', 'assets/chopchop/product-maslins.png'),
  asset('chopchop-product-meat', 'assets/chopchop/product-meat.png'),
  asset('chopchop-product-olive', 'assets/chopchop/product-olive.png'),
  asset('chopchop-product-onion', 'assets/chopchop/product-onion.png'),
  asset('chopchop-product-parmedjano', 'assets/chopchop/product-parmedjano.png'),
  asset('chopchop-product-purple-basilic', 'assets/chopchop/product-purple-basilic.png'),
  asset('chopchop-product-pineaple', 'assets/chopchop/product-pineaple.png'),
  asset('chopchop-product-pepper', 'assets/chopchop/product-pepper.png'),
  asset('chopchop-product-peperoni', 'assets/chopchop/product-peperoni.png'),
  asset('chopchop-product-parsley', 'assets/chopchop/product-parsley.png'),
  asset('chopchop-product-red-onion', 'assets/chopchop/product-red-onion.png'),
  asset('chopchop-product-salad', 'assets/chopchop/product-salad.png'),
  asset('chopchop-product-sausage', 'assets/chopchop/product-sausage.png'),
  asset('chopchop-product-sause', 'assets/chopchop/product-sause.png'),
  asset('chopchop-product-shampinions', 'assets/chopchop/product-shampinions.png'),
  asset('chopchop-product-sweet-pepper', 'assets/chopchop/product-sweet-pepper.png'),
  asset('chopchop-product-tomato', 'assets/chopchop/product-tomato.png'),
  asset('chopchop-product-viled-tomatoes', 'assets/chopchop/product-viled-tomatoes.png'),
  asset('chopchop-board', 'assets/chopchop/board.png'),
  asset('chopchop-jeffri', 'assets/chopchop/jeffri.png'),
  asset('chopchop-didi', 'assets/chopchop/didi.png'),
  asset('chopchop-bomb', 'assets/chopchop/bomb.png'),
  asset('chopchop-perk-timer', 'assets/chopchop/timer.png'),
  asset('chopchop-perk-turtle', 'assets/chopchop/turtle.png'),
  asset('chopchop-perk-finger', 'assets/chopchop/show_finger.png'),
  asset('chopchop-perk-axe', 'assets/chopchop/axe.png'),
  asset('chopchop-perk-knife', 'assets/chopchop/knife.png'),
];

export const PIZZA_ASSEMBLY_ASSETS: ImageAsset[] = [
  asset('pizzaassembly-new-pizza', 'assets/pizzaassembly/new-pizza.png'),
  asset('pizzaassembly-new-sausage', 'assets/pizzaassembly/new-sausage.png'),
  asset('pizzaassembly-new-cheese', 'assets/pizzaassembly/new-cheese.png'),
  asset('pizzaassembly-good-knife', 'assets/pizzaassembly/good-knife.png'),
  asset('pizzaassembly-knife-hit-bg', 'assets/pizzaassembly/knife-hit-bg.png'),
  asset('pizzaassembly-knife-hit-layout', 'assets/pizzaassembly/knife-hit-layout.png'),
];

export const SURFER_ASSETS: ImageAsset[] = [
  asset('surfer-jetpack-bg-day', 'assets/surfer/jetpack-afternoon-bg.png'),
  asset('surfer-jetpack-bg-evening', 'assets/surfer/jetpack-evening-bg.png'),
  asset('surfer-jetpack-bg-night', 'assets/surfer/jetpack-night-bg.png'),
  asset('surfer-jetpack-player', 'assets/surfer/jetpack-player.png'),
  asset('surfer-jetpack-column', 'assets/surfer/jetpack-column-texture.png'),
  asset('surfer-jetpack-frame', 'assets/surfer/jetpack-horizontal-frame.png'),
  ...numberedAssets(11, (i) => `surfer-jetpack-product-${i}`, (i) => `assets/surfer/jetpack-product-${i}.png`),
  asset('surfer-shield', 'assets/surfer/shield.png'),
];

export const DANCE_BEAT_ASSETS: ImageAsset[] = [
  asset('dancebeat-bg', 'assets/dancebeat/bg.png'),
  asset('dancebeat-up', 'assets/dancebeat/up.png'),
  asset('dancebeat-up-grey', 'assets/dancebeat/up-grey.png'),
  asset('dancebeat-up-pushed', 'assets/dancebeat/up-pushed.png'),
  asset('dancebeat-down', 'assets/dancebeat/down.png'),
  asset('dancebeat-down-grey', 'assets/dancebeat/down-grey.png'),
  asset('dancebeat-down-pushed', 'assets/dancebeat/down-pushed.png'),
  asset('dancebeat-left', 'assets/dancebeat/left.png'),
  asset('dancebeat-left-grey', 'assets/dancebeat/left-grey.png'),
  asset('dancebeat-left-pushed', 'assets/dancebeat/left-pushed.png'),
  asset('dancebeat-right', 'assets/dancebeat/right.png'),
  asset('dancebeat-right-grey', 'assets/dancebeat/right-grey.png'),
  asset('dancebeat-right-pushed', 'assets/dancebeat/right-pushed.png'),
];

export const JEFFREY_ASSETS: ImageAsset[] = [
  asset('jeff-player-kurer', 'assets/jeffrey/player-kurer.png'),
  asset('jeff-tram', 'assets/jeffrey/tram.png'),
  ...numberedAssets(11, (i) => `jeff-car-${i}`, (i) => `assets/jeffrey/car-${i}.png`),
  ...numberedAssets(8, (i) => `jeff-tree-${i}`, (i) => `assets/jeffrey/tree-${i}.png`),
  asset('jeff-barrier-1', 'assets/jeffrey/barrier-1.png'),
  ...numberedAssets(8, (i) => `jeff-barrier-extra-${i}`, (i) => `assets/jeffrey/barrier-extra-${i}.png`),
  ...numberedAssets(6, (i) => `jeff-column-${i}`, (i) => `assets/jeffrey/column-${i}.png`),
  ...numberedAssets(15, (i) => `jeff-building-${i}`, (i) => `assets/jeffrey/building-${i}.png`),
  asset('jeff-floor-puddle', 'assets/jeffrey/floors/puddle.png'),
  asset('jeff-floor-grid', 'assets/jeffrey/floors/grid.png'),
  asset('jeff-floor-snow', 'assets/jeffrey/floors/snow.png'),
  asset('jeff-floor-railway', 'assets/jeffrey/floors/railway.png'),
  asset('jeff-floor-parking', 'assets/jeffrey/floors/parking.png'),
  asset('jeff-floor-road-1', 'assets/jeffrey/floors/road-1.png'),
  asset('jeff-floor-road-2', 'assets/jeffrey/floors/road-2.png'),
  ...numberedAssets(8, (i) => `jeff-floor-sidewalk-${i}`, (i) => `assets/jeffrey/floors/sidewalk-${i}.png`),
];
