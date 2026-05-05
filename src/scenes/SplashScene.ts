import Phaser from 'phaser';
import { COLORS } from '@config/colors';
import { GAME, DEPTH } from '@config/game';
import { RU } from '@i18n/ru';
import { SoundManager } from '@core/SoundManager';
import { Haptics } from '@core/Haptics';
import { GameState } from '@core/GameState';
import { attachSoundButton } from '@utils/SceneHelpers';

/**
 * Splash — стартовый экран.
 * Лого Make Love + tagline + кнопка «ЙОУ, ПОГНАЛИ».
 *
 * Стиль: красный фон в духе их сайтовых баннеров,
 * наклонные плашки, постерная типографика.
 *
 * В Phase 4.6 здесь добавится проверка билета: при отсутствии — переход в NoTicketScene.
 * Пока кнопка ведёт в TutorialScene → MinigameRunner.
 */
export class SplashScene extends Phaser.Scene {
  private readonly pixelFont = '"Press Start 2P", monospace';

  constructor() {
    super({ key: 'SplashScene' });
  }

  create(): void {
    const { WIDTH, HEIGHT } = GAME;

    this.setPixelTexture('heart-pixel');
    this.setPixelTexture('pizza-pixel');
    this.setPixelTexture('gamepad-pixel');
    this.setPixelTexture('make-love-pizza-logo-pixel');

    const screenContent = this.add.container(WIDTH / 2, HEIGHT / 2);
    screenContent.setSize(WIDTH, HEIGHT);
    screenContent.setDepth(DEPTH.ui);

    // ===== Сердца: количество жизней/доступа к сессии =====
    this.drawHearts();

    // ===== Главное лого Make Love Pizza =====
    const logoBrand = this.add.image(0, 305 - HEIGHT / 2, 'make-love-pizza-logo-pixel');
    logoBrand.setOrigin(0.5);
    logoBrand.setDisplaySize(500, 333);
    logoBrand.setDepth(DEPTH.ui);
    screenContent.add(logoBrand);

    const adventures = this.add.text(0, 485 - HEIGHT / 2, RU.splash.tagline, {
      fontFamily: this.pixelFont,
      fontSize: '42px',
      color: '#0A0A0A',
      align: 'center',
    });
    adventures.setOrigin(0.5);
    adventures.setDepth(DEPTH.ui);
    screenContent.add(adventures);

    // ===== Главная кнопка =====
    const startBtn = this.createPixelButton(
      0,
      735 - HEIGHT / 2,
      510,
      120,
      'PLAY',
      0x69bd45,
      'pizza-pixel',
      () => this.startPlayScenario()
    );
    screenContent.add(startBtn);

    const miniGamesBtn = this.createPixelButton(
      0,
      895 - HEIGHT / 2,
      510,
      120,
      'MINI\nGAMES',
      COLORS.red,
      'gamepad-pixel',
      () => this.openMiniGames()
    );
    screenContent.add(miniGamesBtn);

    // ===== Кнопка mute в углу =====
    attachSoundButton(this);

    this.cameras.main.fadeIn(400, 90, 84, 249);
  }

  private drawHearts(): void {
    const lives = this.getMainScreenLives();
    for (let i = 0; i < lives; i++) {
      const heart = this.add.image(78 + i * 82, 78, 'heart-pixel');
      heart.setOrigin(0.5);
      heart.setDisplaySize(62, 62);
      heart.setDepth(DEPTH.ui);
    }
  }

  private getMainScreenLives(): number {
    if (GAME.DEBUG) return 3;
    return GameState.hasTicket() ? 3 : 0;
  }

  private createPixelButton(
    x: number,
    y: number,
    width: number,
    height: number,
    label: string,
    bgColor: number,
    iconKey: string,
    onClick: () => void
  ): Phaser.GameObjects.Container {
    const button = this.add.container(x, y);
    button.setSize(width, height);
    button.setDepth(DEPTH.ui);

    const bg = this.add.rectangle(0, 0, width, height, bgColor);
    bg.setStrokeStyle(6, COLORS.black);

    const icon = this.add.image(-width / 2 + 85, 0, iconKey);
    icon.setDisplaySize(86, 86);

    const text = this.add.text(70, 4, label, {
      fontFamily: this.pixelFont,
      fontSize: label.includes('\n') ? '37px' : '42px',
      color: '#0A0A0A',
      align: 'center',
      lineSpacing: 10,
    });
    text.setOrigin(0.5);

    button.add([bg, icon, text]);
    button.setInteractive(
      new Phaser.Geom.Rectangle(-width / 2, -height / 2, width, height),
      Phaser.Geom.Rectangle.Contains
    );
    button.input!.cursor = 'pointer';
    button.on('pointerdown', () => {
      Haptics.trigger('tap');
      SoundManager.playSfx('tap');
      onClick();
    });
    button.on('pointerover', () => button.setScale(1.03));
    button.on('pointerout', () => button.setScale(1));

    return button;
  }

  private setPixelTexture(key: string): void {
    this.textures.get(key).setFilter(Phaser.Textures.FilterMode.NEAREST);
  }

  private startPlayScenario(): void {
    if (!GameState.hasTicket()) {
      GameState.grantTicket();
    }
    this.startGame();
  }

  private openMiniGames(): void {
    this.cameras.main.fadeOut(200, 90, 84, 249);
    this.cameras.main.once('camerafadeoutcomplete', () => {
      this.scene.start('DevMinigameMenuScene');
    });
  }

  private startGame(): void {
    // Первый пользовательский жест — самое время поднять AudioContext и запустить музыку.
    SoundManager.startMusic();
    SoundManager.playSfx('sessionStart');
    Haptics.trigger('tap');

    // Куда идём дальше — зависит от наличия билета и прогресса:
    //  - нет билета → NoTicketScene
    //  - билет есть, туториал не виден → Tutorial → Runner
    //  - билет есть, туториал виден    → Runner (с minigame.progressLevel)
    let nextScene: string;
    if (!GameState.hasTicket()) {
      nextScene = 'NoTicketScene';
    } else if (!GameState.hasSeenTutorial()) {
      nextScene = 'TutorialScene';
    } else {
      nextScene = 'MinigameRunnerScene';
    }

    this.cameras.main.fadeOut(300, 90, 84, 249);
    this.cameras.main.once('camerafadeoutcomplete', () => {
      this.scene.start(nextScene);
    });
  }
}
