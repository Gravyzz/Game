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
import { attachSoundButton, attachNoiseBackdrop } from '@utils/SceneHelpers';

/**
 * Tutorial — экран обучения.
 * Показывается перед самой первой сессией игрока.
 *
 * Содержит:
 * - заголовок «КАК ИГРАТЬ»
 * - короткий intro-текст про press-your-luck механику
 * - 4 правила сессии (в виде стикеров)
 * - превью 4 минок (иконка + название + жест)
 * - кнопка «ВРУБАЕМСЯ»
 *
 * В Phase 4.6 здесь добавится флаг tutorialSeen — чтобы не показывать каждый раз.
 * Сейчас сцена просто вызывается со Splash → возвращается обратно в Splash.
 */
export class TutorialScene extends Phaser.Scene {
  constructor() {
    super({ key: 'TutorialScene' });
  }

  create(): void {
    const { WIDTH, HEIGHT } = GAME;

    // ===== Фон: бежевый постерный =====
    this.add.rectangle(WIDTH / 2, HEIGHT / 2, WIDTH, HEIGHT, COLORS.cream);
    this.drawNoise();

    // ===== Заголовок =====
    const titlePoster = new PosterText(this, WIDTH / 2, 110, RU.tutorial.title, {
      bgColor: COLORS.red,
      textColor: '#FAF7F0',
      fontSize: '48px',
      rotation: -0.025,
      paddingX: 30,
      paddingY: 14,
    });
    titlePoster.setDepth(DEPTH.ui);
    this.add.existing(titlePoster);

    // ===== Intro-текст =====
    const intro = this.add.text(WIDTH / 2, 220, RU.tutorial.intro, {
      ...TEXT_STYLES.body,
      fontSize: '18px',
      color: '#0A0A0A',
      wordWrap: { width: WIDTH - 100 },
      align: 'center',
      lineSpacing: 4,
    });
    intro.setOrigin(0.5, 0);
    intro.setDepth(DEPTH.ui);

    // ===== 4 правила сессии (стикеры в столбик) =====
    this.drawRulesList();

    // ===== Превью 4 минок (карточки) =====
    this.drawMinigameCards();

    // ===== Кнопка «ВРУБАЕМСЯ» =====
    const startBtn = new Button(
      this,
      WIDTH / 2,
      HEIGHT - 100,
      RU.tutorial.cta,
      () => this.finishTutorial(),
      {
        width: 420,
        height: 90,
        bgColor: COLORS.red,
        textColor: '#FAF7F0',
        fontSize: '28px',
      }
    );
    startBtn.setDepth(DEPTH.ui);
    this.add.existing(startBtn);

    // Пульсация кнопки
    this.tweens.add({
      targets: startBtn,
      scale: 1.04,
      duration: 800,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });

    attachSoundButton(this);

    this.cameras.main.fadeIn(300, 250, 247, 240);
  }

  /** Рисует список из 4 правил с эмодзи как стикеры */
  private drawRulesList(): void {
    const { WIDTH } = GAME;
    const startY = 380;
    const stepY = 56;

    RU.tutorial.rules.forEach((rule, i) => {
      // Альтернируем цвета плашек, чтобы было ритмично
      const bgColors = [COLORS.yellow, COLORS.purple, COLORS.red, COLORS.black];
      const textColors = ['#0A0A0A', '#FAF7F0', '#FAF7F0', '#FFE600'];
      const rotations = [-0.02, 0.025, -0.018, 0.022];

      const sticker = new PosterText(this, WIDTH / 2, startY + i * stepY, rule, {
        bgColor: bgColors[i],
        textColor: textColors[i],
        fontSize: '20px',
        rotation: rotations[i],
        paddingX: 18,
        paddingY: 8,
      });
      sticker.setDepth(DEPTH.ui);
      this.add.existing(sticker);

      // Лёгкая анимация появления — каскадом
      sticker.setAlpha(0);
      sticker.setScale(0.8);
      this.tweens.add({
        targets: sticker,
        alpha: 1,
        scale: 1,
        duration: 350,
        delay: 200 + i * 80,
        ease: 'Back.easeOut',
      });
    });
  }

  /** Рисует 4 карточки минок с иконкой жеста */
  private drawMinigameCards(): void {
    const { WIDTH } = GAME;
    const cardsY = 720;
    const cardW = 150;
    const cardH = 140;
    const gap = 14;
    const totalW = cardW * 4 + gap * 3;
    const startX = (WIDTH - totalW) / 2 + cardW / 2;

    const minigames = [
      { key: 'RhythmBattle',  emoji: '🎸', gestureIcon: 'tap' },
      { key: 'DontWork',      emoji: '✂️', gestureIcon: 'swipe' },
      { key: 'NightDelivery', emoji: '🛵', gestureIcon: 'swipeV' },
      { key: 'FireStarter',   emoji: '🔥', gestureIcon: 'tapTime' },
    ] as const;

    minigames.forEach((mg, i) => {
      const x = startX + i * (cardW + gap);
      const card = this.add.container(x, cardsY);

      // Фон карточки
      const bg = this.add.rectangle(0, 0, cardW, cardH, COLORS.black);
      bg.setStrokeStyle(3, COLORS.red);

      // Эмодзи-иконка
      const emoji = this.add.text(0, -36, mg.emoji, {
        fontSize: '40px',
      });
      emoji.setOrigin(0.5);

      // Название минки
      const name = this.add.text(0, 8, RU.minigame.names[mg.key] ?? mg.key, {
        fontFamily: 'Unbounded, sans-serif',
        fontSize: '10px',
        fontStyle: 'italic 800',
        color: '#FAF7F0',
        align: 'center',
        wordWrap: { width: cardW - 16 },
      });
      name.setOrigin(0.5);

      // Иконка жеста — рисуем графикой, чтобы не зависеть от ассетов
      const gesture = this.drawGestureIcon(mg.gestureIcon, 0, 50);

      card.add([bg, emoji, name, gesture]);
      card.setDepth(DEPTH.ui);
      // Слегка наклоняем для постерности, чередуя направления
      card.setRotation(i % 2 === 0 ? -0.03 : 0.03);

      // Каскадное появление
      card.setAlpha(0);
      card.setScale(0.7);
      this.tweens.add({
        targets: card,
        alpha: 1,
        scale: 1,
        duration: 400,
        delay: 600 + i * 100,
        ease: 'Back.easeOut',
      });
    });
  }

  /** Маленькая иконка жеста под карточкой минки */
  private drawGestureIcon(
    type: 'tap' | 'swipe' | 'swipeV' | 'tapTime',
    x: number,
    y: number
  ): Phaser.GameObjects.Container {
    const c = this.add.container(x, y);

    if (type === 'tap') {
      // Кружок + волны (как анимация тапа)
      const circle = this.add.circle(0, 0, 8, COLORS.yellow);
      const ring = this.add.circle(0, 0, 14, undefined, 0).setStrokeStyle(2, COLORS.yellow);
      c.add([ring, circle]);
      this.tweens.add({
        targets: ring,
        scale: 1.5,
        alpha: 0,
        duration: 800,
        repeat: -1,
        ease: 'Sine.easeOut',
      });
    } else if (type === 'swipe') {
      // Горизонтальная стрелка
      const g = this.add.graphics();
      g.lineStyle(3, COLORS.yellow);
      g.lineBetween(-20, 0, 20, 0);
      g.lineBetween(20, 0, 14, -6);
      g.lineBetween(20, 0, 14, 6);
      c.add(g);
    } else if (type === 'swipeV') {
      // Вертикальная стрелка двунаправленная
      const g = this.add.graphics();
      g.lineStyle(3, COLORS.yellow);
      g.lineBetween(0, -16, 0, 16);
      g.lineBetween(0, -16, -5, -10);
      g.lineBetween(0, -16, 5, -10);
      g.lineBetween(0, 16, -5, 10);
      g.lineBetween(0, 16, 5, 10);
      c.add(g);
    } else if (type === 'tapTime') {
      // Палец + часы
      const dot = this.add.circle(-10, 0, 5, COLORS.yellow);
      const clock = this.add.circle(8, 0, 8, undefined, 0).setStrokeStyle(2, COLORS.yellow);
      const hand = this.add.line(8, 0, 0, 0, 0, -5, COLORS.yellow).setLineWidth(2);
      c.add([dot, clock, hand]);
      this.tweens.add({
        targets: hand,
        rotation: Math.PI * 2,
        duration: 1500,
        repeat: -1,
        ease: 'Linear',
      });
    }

    return c;
  }

  /** Рисует тонкие чёрные точки шума поверх кремового фона */
  private drawNoise(): void {
    attachNoiseBackdrop(this, 'noise-tutorial', 600, 0.04);
  }

  private finishTutorial(): void {
    SoundManager.playSfx('choice');
    Haptics.trigger('tap');
    GameState.markTutorialSeen();
    // Стартуем сессию с уровня прогресса (для нового игрока progressLevel = 1)
    this.cameras.main.fadeOut(300, 10, 10, 10);
    this.cameras.main.once('camerafadeoutcomplete', () => {
      this.scene.start('MinigameRunnerScene');
    });
  }
}
