import Phaser from 'phaser';
import { COLORS } from '@config/colors';
import { TEXT_STYLES } from '@config/fonts';
import { GAME, DEPTH } from '@config/game';
import { RU } from '@i18n/ru';
import { Button } from '@ui/Button';
import { PosterText } from '@ui/PosterText';
import { SessionState, type PrizeWon } from '@core/SessionState';

/**
 * Колесо Фортуны.
 *
 * ЗАГЛУШКА в Phase 4.3 — простой экран с кнопкой «КРУТИ!»,
 * которая после клика рандомно выбирает приз и переходит на ResultScene.
 *
 * В Phase 4.6 будет:
 * - реальное анимированное колесо (8 секторов)
 * - тик-звук при прокрутке
 * - веса призов по уровню (PRIZE_POOL + WEIGHTS_BY_LEVEL)
 * - физика остановки с easing
 */

const PLACEHOLDER_PRIZES: PrizeWon[] = [
  { id: 'nyamki50',     label: RU.prizes.nyamki50,     tier: 'common' },
  { id: 'promo10',      label: RU.prizes.promo10,      tier: 'common',    promoCode: 'LOVE10' },
  { id: 'sauceFree',    label: RU.prizes.sauceFree,    tier: 'common',    promoCode: 'SAUCE' },
  { id: 'life',         label: RU.prizes.life,         tier: 'common' },
  { id: 'nyamki100',    label: RU.prizes.nyamki100,    tier: 'rare' },
  { id: 'promo20',      label: RU.prizes.promo20,      tier: 'rare',      promoCode: 'LOVE20' },
  { id: 'oldscoolFree', label: RU.prizes.oldscoolFree, tier: 'epic',      promoCode: 'OLDSCHOOL' },
  { id: 'jackpot',      label: RU.prizes.jackpot,      tier: 'legendary', promoCode: 'NEROBOT' },
];

export class WheelScene extends Phaser.Scene {
  private isJackpot = false;

  constructor() {
    super({ key: 'WheelScene' });
  }

  create(data: { isJackpot?: boolean } = {}): void {
    const { WIDTH, HEIGHT } = GAME;
    this.isJackpot = data.isJackpot ?? false;

    // ===== Фон =====
    this.add.rectangle(WIDTH / 2, HEIGHT / 2, WIDTH, HEIGHT, COLORS.purple);
    this.drawNoise();

    // ===== Заголовок =====
    const titleText = this.isJackpot ? `${RU.wheel.title}\n🎰 ДЖЕКПОТ! 🎰` : RU.wheel.title;
    const titlePoster = new PosterText(this, WIDTH / 2, 180, titleText, {
      bgColor: COLORS.yellow,
      textColor: '#0A0A0A',
      fontSize: '36px',
      rotation: -0.025,
      paddingX: 24,
      paddingY: 14,
    });
    titlePoster.setDepth(DEPTH.ui);
    this.add.existing(titlePoster);

    // ===== Плейсхолдер «колеса» — большой круг с эмодзи =====
    const wheelCircle = this.add.circle(WIDTH / 2, HEIGHT / 2 - 40, 200, COLORS.cream);
    wheelCircle.setStrokeStyle(8, COLORS.red);
    wheelCircle.setDepth(DEPTH.gameplay);

    const wheelEmoji = this.add.text(WIDTH / 2, HEIGHT / 2 - 40, '🎰', {
      fontSize: '180px',
    });
    wheelEmoji.setOrigin(0.5);
    wheelEmoji.setDepth(DEPTH.gameplay);

    // ===== Метка «заглушка» =====
    const stubLabel = this.add.text(WIDTH / 2, HEIGHT / 2 + 200, '⚙️ настоящее колесо в Phase 4.6', {
      ...TEXT_STYLES.label,
      fontSize: '14px',
      color: '#FAF7F0',
    });
    stubLabel.setOrigin(0.5);
    stubLabel.setAlpha(0.7);
    stubLabel.setDepth(DEPTH.ui);

    // ===== Кнопка «КРУТИ!» =====
    const spinBtn = new Button(
      this,
      WIDTH / 2,
      HEIGHT - 160,
      RU.wheel.spinCta,
      () => this.spin(wheelEmoji, spinBtn),
      {
        width: 380,
        height: 100,
        bgColor: COLORS.yellow,
        textColor: '#0A0A0A',
        fontSize: '32px',
      }
    );
    spinBtn.setDepth(DEPTH.ui);
    this.add.existing(spinBtn);

    this.cameras.main.fadeIn(300, 122, 92, 255);
  }

  private spin(wheelEmoji: Phaser.GameObjects.Text, spinBtn: Button): void {
    spinBtn.setEnabled(false);
    spinBtn.setText(RU.wheel.spinning.toUpperCase());

    // Имитируем кручение поворотом эмодзи
    this.tweens.add({
      targets: wheelEmoji,
      rotation: Math.PI * 6, // 3 полных оборота
      duration: 2000,
      ease: 'Cubic.easeOut',
      onComplete: () => {
        const prize = this.pickPrize();
        SessionState.setPrize(prize);
        SessionState.endSession('win');

        this.cameras.main.fadeOut(300, 10, 10, 10);
        this.cameras.main.once('camerafadeoutcomplete', () => {
          this.scene.start('ResultScene', { outcome: 'win' });
        });
      },
    });
  }

  /** Временный рандом без весов. В Phase 4.6 — взвешенный по уровню */
  private pickPrize(): PrizeWon {
    if (this.isJackpot) {
      // На джекпоте — гарантированно один из эпиков/легендарок
      const top = PLACEHOLDER_PRIZES.filter((p) => p.tier === 'epic' || p.tier === 'legendary');
      return top[Math.floor(Math.random() * top.length)];
    }
    return PLACEHOLDER_PRIZES[Math.floor(Math.random() * PLACEHOLDER_PRIZES.length)];
  }

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
