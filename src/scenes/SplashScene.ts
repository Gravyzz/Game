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
    this.setPixelTexture('star-pixel');
    this.setPixelTexture('make-love-pizza-logo-pixel');

    // ===== Фон: #5A54F9 с плавным переливом оттенков =====
    const background = this.add.rectangle(WIDTH / 2, HEIGHT / 2, WIDTH, HEIGHT, 0x5a54f9);
    background.setDepth(DEPTH.background);
    const backgroundGlowA = this.add.rectangle(WIDTH / 2, HEIGHT / 2, WIDTH, HEIGHT, 0x766dff);
    backgroundGlowA.setAlpha(0);
    backgroundGlowA.setDepth(DEPTH.background);
    const backgroundGlowB = this.add.rectangle(WIDTH / 2, HEIGHT / 2, WIDTH, HEIGHT, 0x423dd4);
    backgroundGlowB.setAlpha(0);
    backgroundGlowB.setDepth(DEPTH.background);
    this.tweens.add({
      targets: backgroundGlowA,
      alpha: 0.55,
      duration: 2200,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });
    this.tweens.add({
      targets: backgroundGlowB,
      alpha: 0.38,
      duration: 3200,
      delay: 700,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });
    this.createFallingStars();

    const frame = this.add.rectangle(WIDTH / 2, HEIGHT / 2, WIDTH - 8, HEIGHT - 8);
    frame.setStrokeStyle(8, COLORS.black);
    frame.setDepth(DEPTH.background);

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

    // ===== Слушаем поворот: ушли в landscape — улетаем в lock =====
    const onResize = () => {
      if (window.innerWidth > window.innerHeight) {
        this.scene.start('OrientationLockScene');
      }
    };
    window.addEventListener('resize', onResize);
    window.addEventListener('orientationchange', onResize);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      window.removeEventListener('resize', onResize);
      window.removeEventListener('orientationchange', onResize);
    });

    // ===== Кнопка mute в углу =====
    attachSoundButton(this);

    this.cameras.main.fadeIn(400, 255, 46, 46);
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

  private createFallingStars(): void {
    const { WIDTH, HEIGHT } = GAME;
    for (let i = 0; i < 18; i++) {
      const star = this.add.image(
        Phaser.Math.Between(35, WIDTH - 35),
        Phaser.Math.Between(-HEIGHT, HEIGHT),
        'star-pixel'
      );
      const size = Phaser.Math.Between(24, 58);
      star.setDisplaySize(size, size);
      star.setAlpha(Phaser.Math.FloatBetween(0.55, 0.95));
      star.setRotation(Phaser.Math.FloatBetween(-0.25, 0.25));
      star.setDepth(DEPTH.midground);

      this.tweens.add({
        targets: star,
        y: HEIGHT + 80,
        x: star.x + Phaser.Math.Between(-80, 80),
        rotation: star.rotation + Phaser.Math.FloatBetween(-0.45, 0.45),
        duration: Phaser.Math.Between(5200, 9800),
        delay: Phaser.Math.Between(0, 3600),
        repeat: -1,
        onRepeat: () => {
          star.setPosition(Phaser.Math.Between(35, WIDTH - 35), Phaser.Math.Between(-180, -40));
          star.setDisplaySize(size, size);
          star.setAlpha(Phaser.Math.FloatBetween(0.55, 0.95));
        },
      });
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
    this.cameras.main.fadeOut(200, 10, 10, 10);
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

    this.cameras.main.fadeOut(300, 10, 10, 10);
    this.cameras.main.once('camerafadeoutcomplete', () => {
      this.scene.start(nextScene);
    });
  }
}
