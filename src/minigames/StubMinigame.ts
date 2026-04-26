import { BaseMinigame } from '@minigames/BaseMinigame';
import { COLORS } from '@config/colors';
import { TEXT_STYLES } from '@config/fonts';
import { GAME, DEPTH } from '@config/game';
import { RU } from '@i18n/ru';
import { Button } from '@ui/Button';
import { PosterText } from '@ui/PosterText';

/**
 * Общая логика для всех минок-заглушек.
 *
 * Показывает:
 * - название минки крупно
 * - хинт жеста
 * - метку «ЗАГЛУШКА» (чтобы тестер понимал)
 * - две кнопки: WIN и LOSE — для теста флоу всей сессии
 *
 * Каждая заглушка наследует это и передаёт в конструктор свой ключ
 * и фоновый цвет. В Phase 4.4 RhythmBattle переопределит create() полностью.
 */
export abstract class StubMinigame extends BaseMinigame {
  constructor(
    private readonly minigameKey: string,
    private readonly bgColor: number,
    private readonly accentColor: number
  ) {
    super({ key: minigameKey });
  }

  create(): void {
    const { WIDTH, HEIGHT } = GAME;
    const name = RU.minigame.names[this.minigameKey] ?? this.minigameKey;
    const hint = RU.minigame.hints[this.minigameKey] ?? '';

    // ===== Фон =====
    this.add.rectangle(WIDTH / 2, HEIGHT / 2, WIDTH, HEIGHT, this.bgColor);
    this.drawNoise();

    // ===== Метка «УРОВЕНЬ N» =====
    const levelLabel = this.add.text(WIDTH / 2, 80, `${RU.choice.levelLabel} ${this.initData.level} / 4`, {
      ...TEXT_STYLES.label,
      fontSize: '16px',
      color: '#FAF7F0',
    });
    levelLabel.setOrigin(0.5);
    levelLabel.setAlpha(0.7);
    levelLabel.setDepth(DEPTH.ui);

    // ===== Заголовок минки =====
    const titlePoster = new PosterText(this, WIDTH / 2, 180, name, {
      bgColor: this.accentColor,
      textColor: this.accentColor === COLORS.yellow ? '#0A0A0A' : '#FAF7F0',
      fontSize: '32px',
      rotation: -0.025,
      paddingX: 22,
      paddingY: 12,
    });
    titlePoster.setDepth(DEPTH.ui);
    this.add.existing(titlePoster);

    // ===== Хинт жеста =====
    const hintPoster = new PosterText(this, WIDTH / 2, 280, hint, {
      bgColor: COLORS.cream,
      textColor: '#0A0A0A',
      fontSize: '20px',
      rotation: 0.02,
      paddingX: 18,
      paddingY: 8,
    });
    hintPoster.setDepth(DEPTH.ui);
    this.add.existing(hintPoster);

    // ===== Декор: иконка-эмодзи большая по центру =====
    const decor = this.add.text(WIDTH / 2, HEIGHT / 2 - 60, this.getDecorEmoji(), {
      fontSize: '180px',
    });
    decor.setOrigin(0.5);
    decor.setAlpha(0.85);
    decor.setDepth(DEPTH.midground);
    this.tweens.add({
      targets: decor,
      scale: 1.06,
      duration: 1200,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });

    // ===== Метка ЗАГЛУШКА =====
    const stubLabel = this.add.text(WIDTH / 2, HEIGHT / 2 + 110, '⚙️ заглушка для теста флоу', {
      ...TEXT_STYLES.label,
      fontSize: '14px',
      color: '#FAF7F0',
    });
    stubLabel.setOrigin(0.5);
    stubLabel.setAlpha(0.6);
    stubLabel.setDepth(DEPTH.ui);

    // ===== Кнопка ВЫИГРАЛ =====
    const winBtn = new Button(
      this,
      WIDTH / 2,
      HEIGHT - 220,
      '🎸 ВЫИГРАЛ',
      () => this.complete({ outcome: 'win', score: 80 + Math.floor(Math.random() * 20) }),
      {
        width: 380,
        height: 80,
        bgColor: COLORS.win,
        textColor: '#0A0A0A',
        fontSize: '24px',
      }
    );
    winBtn.setDepth(DEPTH.ui);
    this.add.existing(winBtn);

    // ===== Кнопка ПРОИГРАЛ =====
    const loseBtn = new Button(
      this,
      WIDTH / 2,
      HEIGHT - 110,
      '💔 ПРОИГРАЛ',
      () => this.complete({ outcome: 'lose', score: Math.floor(Math.random() * 30) }),
      {
        width: 380,
        height: 80,
        bgColor: COLORS.lose,
        textColor: '#FAF7F0',
        fontSize: '24px',
      }
    );
    loseBtn.setDepth(DEPTH.ui);
    this.add.existing(loseBtn);

    this.cameras.main.fadeIn(250, 10, 10, 10);
  }

  /** Каждая минка возвращает свой эмодзи-плейсхолдер для центра экрана */
  protected abstract getDecorEmoji(): string;

  private drawNoise(): void {
    const { WIDTH, HEIGHT } = GAME;
    const g = this.add.graphics();
    g.fillStyle(0x000000, 0.06);
    for (let i = 0; i < 600; i++) {
      const x = Math.random() * WIDTH;
      const y = Math.random() * HEIGHT;
      g.fillCircle(x, y, Math.random() * 1.5);
    }
    g.setDepth(DEPTH.background);
  }
}
