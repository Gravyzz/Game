import Phaser from 'phaser';
import { COLORS } from '@config/colors';
import { TEXT_STYLES } from '@config/fonts';
import { GAME, DEPTH } from '@config/game';
import { RU } from '@i18n/ru';
import { Button } from '@ui/Button';
import { PosterText } from '@ui/PosterText';
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
  constructor() {
    super({ key: 'SplashScene' });
  }

  create(): void {
    const { WIDTH, HEIGHT } = GAME;

    // ===== Фон: красный с лёгким шумом =====
    this.add.rectangle(WIDTH / 2, HEIGHT / 2, WIDTH, HEIGHT, COLORS.red);
    this.drawNoise();

    // ===== Декоративные плашки фоном (пиццамонстры-стиль) =====
    this.drawDecoStickers();

    // ===== Главное лого: «MAKE LOVE» — большое =====
    const logoBrand = this.add.text(WIDTH / 2, HEIGHT * 0.32, RU.splash.brand, {
      ...TEXT_STYLES.hero,
      fontSize: '88px',
      color: '#FAF7F0',
    });
    logoBrand.setOrigin(0.5);
    logoBrand.setDepth(DEPTH.ui);

    // Лёгкая тень-обводка для постерности
    logoBrand.setStroke('#0A0A0A', 6);

    // ===== Подзаголовок: «ADVENTURES» — на жёлтой плашке =====
    const adventures = new PosterText(this, WIDTH / 2, HEIGHT * 0.42, RU.splash.tagline, {
      bgColor: COLORS.yellow,
      textColor: '#0A0A0A',
      fontSize: '48px',
      rotation: 0.025,
      paddingX: 28,
      paddingY: 10,
    });
    adventures.setDepth(DEPTH.ui);
    this.add.existing(adventures);

    // ===== Tagline манифеста =====
    const tagline = this.add.text(WIDTH / 2, HEIGHT * 0.52, RU.splash.sub, {
      ...TEXT_STYLES.subtitle,
      fontSize: '22px',
      color: '#FAF7F0',
    });
    tagline.setOrigin(0.5);
    tagline.setDepth(DEPTH.ui);

    // ===== Главная кнопка =====
    const startBtn = new Button(
      this,
      WIDTH / 2,
      HEIGHT * 0.72,
      RU.splash.cta,
      () => this.startGame(),
      {
        width: 420,
        height: 100,
        bgColor: COLORS.yellow,
        fontSize: '32px',
      }
    );
    startBtn.setDepth(DEPTH.ui);
    this.add.existing(startBtn);

    // Лёгкая пульсация кнопки — чтобы притянуть взгляд
    this.tweens.add({
      targets: startBtn,
      scale: 1.04,
      duration: 800,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });

    // === DEV: minigame test menu — REMOVE BEFORE PROD ===
    if (GAME.DEBUG) {
      const devBtn = new Button(
        this,
        WIDTH / 2,
        HEIGHT * 0.85,
        '🧪 ТЕСТ МИНОК',
        () => {
          this.cameras.main.fadeOut(200, 10, 10, 10);
          this.cameras.main.once('camerafadeoutcomplete', () => {
            this.scene.start('DevMinigameMenuScene');
          });
        },
        {
          width: 320,
          height: 64,
          bgColor: COLORS.greyDark,
          textColor: '#FAF7F0',
          fontSize: '20px',
        }
      );
      devBtn.setDepth(DEPTH.ui);
      devBtn.setAlpha(0.85);
      this.add.existing(devBtn);
    }

    // ===== Версия (мелким) =====
    const version = this.add.text(WIDTH / 2, HEIGHT - 40, RU.splash.version, {
      ...TEXT_STYLES.label,
      color: '#FAF7F0',
    });
    version.setOrigin(0.5);
    version.setAlpha(0.5);
    version.setDepth(DEPTH.ui);

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

    // Эффект «появления» сцены
    // ===== Кнопка mute в углу =====
    attachSoundButton(this);

    this.cameras.main.fadeIn(400, 255, 46, 46);
  }

  /** Добавляем зернистую текстуру поверх фона — постерный эффект */
  private drawNoise(): void {
    const { WIDTH, HEIGHT } = GAME;
    const g = this.add.graphics();
    g.fillStyle(0x000000, 0.06);
    for (let i = 0; i < 800; i++) {
      const x = Math.random() * WIDTH;
      const y = Math.random() * HEIGHT;
      g.fillCircle(x, y, Math.random() * 1.5);
    }
    g.setDepth(DEPTH.background);
  }

  /** Декоративные плашки в углах — как «стикеры» с сайта */
  private drawDecoStickers(): void {
    const { WIDTH } = GAME;

    // Стикер «Я_не_робот» в верхнем правом углу
    const sticker1 = new PosterText(this, WIDTH - 120, 100, 'Я_НЕ_РОБОТ', {
      bgColor: COLORS.black,
      textColor: '#FFE600',
      fontSize: '16px',
      rotation: 0.12,
      paddingX: 12,
      paddingY: 6,
    });
    sticker1.setDepth(DEPTH.midground);
    sticker1.setAlpha(0.85);
    this.add.existing(sticker1);

    // Стикер «РОК-Н-РОЛЛ» в левом нижнем
    const sticker2 = new PosterText(this, 130, 1000, 'РОК-Н-РОЛЛ!', {
      bgColor: COLORS.cream,
      textColor: '#FF2E2E',
      fontSize: '18px',
      rotation: -0.08,
      paddingX: 14,
      paddingY: 6,
    });
    sticker2.setDepth(DEPTH.midground);
    sticker2.setAlpha(0.9);
    this.add.existing(sticker2);

    // Стикер «КАЙФ» справа в середине
    const sticker3 = new PosterText(this, WIDTH - 80, 880, 'КАЙФ', {
      bgColor: COLORS.purple,
      textColor: '#FAF7F0',
      fontSize: '20px',
      rotation: 0.18,
      paddingX: 14,
      paddingY: 6,
    });
    sticker3.setDepth(DEPTH.midground);
    sticker3.setAlpha(0.85);
    this.add.existing(sticker3);

    // Лёгкое колыхание стикеров
    [sticker1, sticker2, sticker3].forEach((s, i) => {
      this.tweens.add({
        targets: s,
        y: s.y + 8,
        duration: 1500 + i * 400,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut',
      });
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
