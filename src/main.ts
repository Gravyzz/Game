import Phaser from 'phaser';
import { GAME } from '@config/game';
import { TicketProvider } from '@core/TicketProvider';
import { BootScene } from '@scenes/BootScene';
import { SplashScene } from '@scenes/SplashScene';
import { OrientationLockScene } from '@scenes/OrientationLockScene';
import { TutorialScene } from '@scenes/TutorialScene';
import { MinigameRunnerScene } from '@scenes/MinigameRunnerScene';
import { ChoiceScene } from '@scenes/ChoiceScene';
import { WheelScene } from '@scenes/WheelScene';
import { ResultScene } from '@scenes/ResultScene';
import { NoTicketScene } from '@scenes/NoTicketScene';
// === DEV: minigame test menu — REMOVE BEFORE PROD ===
import { DevMinigameMenuScene } from '@scenes/DevMinigameMenuScene';
import { FireStarterScene } from '@minigames/FireStarter';
import { DontWorkScene } from '@minigames/DontWork';
import { RhythmBattleScene } from '@minigames/RhythmBattle';
import { NightDeliveryScene } from '@minigames/NightDelivery';
import { SurferScene } from '@minigames/Surfer';
import { PizzaAssemblyScene } from '@minigames/PizzaAssembly';
import { ChopChopScene } from '@minigames/ChopChop';
import { DanceBeatScene } from '@minigames/DanceBeat';
import { FiveDollarScene } from '@minigames/FiveDollar';
import { RecipeMemoScene } from '@minigames/RecipeMemo';

/**
 * Точка входа Make Love Adventures.
 *
 * Phaser конфиг:
 * - Scale.FIT — масштабируем виртуальный холст 720x1280 под реальный экран,
 *   сохраняя соотношение. По бокам/сверху/снизу могут появиться чёрные поля
 *   (на iPad) — это ожидаемо для портретной mobile-first игры.
 * - autoCenter — центруем canvas по горизонтали и вертикали.
 * - WebGL с Canvas-фолбэком на старых девайсах.
 */
const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  parent: 'app',
  backgroundColor: 'rgba(0, 0, 0, 0)',
  transparent: true,

  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    width:  GAME.WIDTH,
    height: GAME.HEIGHT,
  },

  // Тач-инпут включён, мышь тоже работает — для отладки на десктопе
  input: {
    activePointers: 3, // одновременно до 3 пальцев (на будущее, для рит-минки)
    touch: { capture: true },
  },

  // FPS таргет
  fps: {
    target: GAME.TARGET_FPS,
    forceSetTimeOut: false,
  },

  // Регистрация сцен. Первая в массиве — стартует автоматически.
  scene: [
    BootScene,
    SplashScene,
    OrientationLockScene,
    TutorialScene,
    NoTicketScene,
    MinigameRunnerScene,
    ChoiceScene,
    WheelScene,
    ResultScene,
    // === DEV: minigame test menu — REMOVE BEFORE PROD ===
    DevMinigameMenuScene,
    // Мини-игры — Phaser scene key совпадает с MINIGAME_ORDER в registry
    FireStarterScene,
    DontWorkScene,
    RhythmBattleScene,
    NightDeliveryScene,
    SurferScene,
    PizzaAssemblyScene,
    ChopChopScene,
    DanceBeatScene,
    FiveDollarScene,
    RecipeMemoScene,
  ],

  // Без отрисовки физических тел — нам не нужны коллизии в этой игре
  physics: {
    default: 'arcade',
    arcade: {
      gravity: { x: 0, y: 0 },
      debug: GAME.DEBUG,
    },
  },
};

// Запускаем источники билетов до старта игры (URL-параметр и postMessage слушатель)
TicketProvider.init();

// Запускаем игру
const game = new Phaser.Game(config);

// Логи в консоль на старте — удобно дебажить с телефона
console.log(
  '%c MAKE LOVE ADVENTURES %c v0.1 ',
  'background: #FF2E2E; color: #FAF7F0; font-weight: 900; padding: 4px 8px;',
  'background: #0A0A0A; color: #FAF7F0; padding: 4px 8px;'
);
console.log('Кайф. Драйв. Рок-н-ролл.');

// Защита от случайного зума двойным тапом на iOS
let lastTouchEnd = 0;
document.addEventListener(
  'touchend',
  (e) => {
    const now = Date.now();
    if (now - lastTouchEnd <= 300) {
      e.preventDefault();
    }
    lastTouchEnd = now;
  },
  { passive: false }
);

// Защита от pinch-zoom на iOS
document.addEventListener(
  'gesturestart',
  (e) => e.preventDefault(),
  { passive: false }
);

// Экспортим для отладки в консоли
import { GameState } from '@core/GameState';
(window as unknown as { __game: Phaser.Game; __state: typeof GameState; __ticket: typeof TicketProvider }).__game = game;
(window as unknown as { __game: Phaser.Game; __state: typeof GameState; __ticket: typeof TicketProvider }).__state = GameState;
(window as unknown as { __game: Phaser.Game; __state: typeof GameState; __ticket: typeof TicketProvider }).__ticket = TicketProvider;
