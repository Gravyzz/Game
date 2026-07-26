import Phaser from 'phaser';
import { GAME } from '@config/game';
import { GameState } from '@core/GameState';
import { TicketProvider } from '@core/TicketProvider';
import { SoundManager } from '@core/SoundManager';
import { BootScene } from '@scenes/BootScene';
import { ComicsScene } from '@scenes/ComicsScene';
import { SplashScene } from '@scenes/SplashScene';
import { OrientationLockScene } from '@scenes/OrientationLockScene';
import { MinigameRunnerScene } from '@scenes/MinigameRunnerScene';
import { ChoiceScene } from '@scenes/ChoiceScene';
import { WheelScene } from '@scenes/WheelScene';
import { ResultScene } from '@scenes/ResultScene';
import { NoTicketScene } from '@scenes/NoTicketScene';
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
import { JeffreySurferScene } from '@minigames/JeffreySurfer';

const getViewportSize = (): { width: number; height: number } => {
  const viewport = window.visualViewport;
  return {
    width: viewport?.width ?? window.innerWidth,
    height: viewport?.height ?? window.innerHeight,
  };
};

const shouldScaleToMobileWidth = (): boolean => {
  const { width, height } = getViewportSize();
  return width <= 768 && height >= width;
};

const getScaleMode = (): Phaser.Scale.ScaleModeType =>
  shouldScaleToMobileWidth() ? Phaser.Scale.WIDTH_CONTROLS_HEIGHT : Phaser.Scale.FIT;

const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  parent: 'app',
  backgroundColor: 'rgba(0, 0, 0, 0)',
  transparent: true,

  scale: {
    mode: getScaleMode(),
    autoCenter: Phaser.Scale.CENTER_BOTH,
    width: GAME.WIDTH,
    height: GAME.HEIGHT,
  },

  input: {
    activePointers: 3,
    touch: { capture: true },
  },

  fps: {
    target: GAME.TARGET_FPS,
    forceSetTimeOut: false,
  },

  scene: [
    BootScene,
    ComicsScene,
    SplashScene,
    OrientationLockScene,
    NoTicketScene,
    MinigameRunnerScene,
    ChoiceScene,
    WheelScene,
    ResultScene,
    DevMinigameMenuScene,
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
    JeffreySurferScene,
  ],

  physics: {
    default: 'arcade',
    arcade: {
      gravity: { x: 0, y: 0 },
      debug: GAME.DEBUG,
    },
  },
};

TicketProvider.init();

const game = new Phaser.Game(config);

let scaleSyncTimer: number | undefined;

const syncScaleMode = (): void => {
  const nextMode = getScaleMode();

  if (game.scale.scaleMode !== nextMode) {
    game.scale.scaleMode = nextMode;
  }

  game.scale.refresh();
};

const scheduleScaleSync = (): void => {
  if (scaleSyncTimer !== undefined) {
    window.clearTimeout(scaleSyncTimer);
  }

  scaleSyncTimer = window.setTimeout(syncScaleMode, 0);
};

window.addEventListener('resize', scheduleScaleSync);
window.addEventListener('orientationchange', scheduleScaleSync);
window.visualViewport?.addEventListener('resize', scheduleScaleSync);
game.events.once(Phaser.Core.Events.READY, scheduleScaleSync);
window.setTimeout(scheduleScaleSync, 0);

const ORIENTATION_LOCK_SCENE = 'OrientationLockScene';
let orientationListenersReady = false;
const pausedByOrientation = new Set<string>();

const isLandscape = (): boolean => window.innerWidth > window.innerHeight;

const syncOrientationLock = (): void => {
  if (isLandscape()) {
    document.body.classList.add('orientation-locked');
    SoundManager.stopAll(180);

    const activeScenes = game.scene
      .getScenes(true)
      .filter((scene) => scene.scene.key !== ORIENTATION_LOCK_SCENE);

    activeScenes.forEach((scene) => {
      const key = scene.scene.key;
      if (!game.scene.isPaused(key)) {
        pausedByOrientation.add(key);
        game.scene.pause(key);
      }
    });
    return;
  }

  document.body.classList.remove('orientation-locked');
  SoundManager.resumeMusic();

  if (game.scene.isActive(ORIENTATION_LOCK_SCENE)) {
    game.scene.stop(ORIENTATION_LOCK_SCENE);
  }

  pausedByOrientation.forEach((key) => {
    if (game.scene.isPaused(key)) {
      game.scene.resume(key);
    }
  });
  pausedByOrientation.clear();
};

const scheduleOrientationSync = (): void => {
  window.setTimeout(syncOrientationLock, 0);
};

const registerOrientationLock = (): void => {
  if (orientationListenersReady) return;
  orientationListenersReady = true;

  game.scene.getScenes(false).forEach((scene) => {
    scene.events.on(Phaser.Scenes.Events.START, scheduleOrientationSync);
  });

  window.addEventListener('resize', syncOrientationLock);
  window.addEventListener('orientationchange', syncOrientationLock);
  scheduleOrientationSync();
};

game.events.once(Phaser.Core.Events.READY, registerOrientationLock);
window.setTimeout(registerOrientationLock, 0);

console.log(
  '%c MAKE LOVE ADVENTURES %c v0.1 ',
  'background: #FF2E2E; color: #FAF7F0; font-weight: 900; padding: 4px 8px;',
  'background: #0A0A0A; color: #FAF7F0; padding: 4px 8px;',
);
console.log('Make Love Adventures started');

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
  { passive: false },
);

document.addEventListener(
  'gesturestart',
  (e) => e.preventDefault(),
  { passive: false },
);

(window as unknown as { __game: Phaser.Game; __state: typeof GameState; __ticket: typeof TicketProvider }).__game = game;
(window as unknown as { __game: Phaser.Game; __state: typeof GameState; __ticket: typeof TicketProvider }).__state = GameState;
(window as unknown as { __game: Phaser.Game; __state: typeof GameState; __ticket: typeof TicketProvider }).__ticket = TicketProvider;
