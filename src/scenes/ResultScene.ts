import Phaser from 'phaser';
import { COLORS } from '@config/colors';
import { TEXT_STYLES } from '@config/fonts';
import { GAME, DEPTH } from '@config/game';
import { RU } from '@i18n/ru';
import { Button } from '@ui/Button';
import { PosterText } from '@ui/PosterText';
import { SessionState } from '@core/SessionState';

/**
 * Финальный экран сессии.
 *
 * outcome: 'win'  → показываем приз с промокодом и кнопкой «СКОПИРОВАТЬ»
 * outcome: 'lose' → показываем «не повезло, прогресс сохранится 2 недели»
 *
 * Кнопка «НА ГЛАВНУЮ» возвращает в Splash.
 *
 * В Phase 4.7 здесь будет:
 *   - postMessage в родительское окно с призом (для интеграции с приложением)
 *   - аналитика session:end
 *   - запись lastSessionAt в Storage
 */
export class ResultScene extends Phaser.Scene {
  constructor() {
    super({ key: 'ResultScene' });
  }

  create(data: { outcome?: 'win' | 'lose' } = {}): void {
    const outcome = data.outcome ?? 'lose';

    if (outcome === 'win') {
      this.renderWin();
    } else {
      this.renderLose();
    }

    // Сбрасываем сессию в памяти после показа экрана
    // (в Phase 4.7 здесь же — фиксация прогресса в Storage)
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      SessionState.reset();
    });
  }

  private renderWin(): void {
    const { WIDTH, HEIGHT } = GAME;
    const prize = SessionState.getPrize();

    // ===== Фон: победный жёлтый =====
    this.add.rectangle(WIDTH / 2, HEIGHT / 2, WIDTH, HEIGHT, COLORS.yellow);
    this.drawNoise();

    // ===== «НЯМКА!» постером =====
    const titlePoster = new PosterText(this, WIDTH / 2, 200, RU.result.winTitle, {
      bgColor: COLORS.red,
      textColor: '#FAF7F0',
      fontSize: '64px',
      rotation: -0.03,
      paddingX: 30,
      paddingY: 16,
    });
    titlePoster.setDepth(DEPTH.ui);
    this.add.existing(titlePoster);

    // Лёгкая «рандомная встряска»
    titlePoster.setScale(0.5);
    this.tweens.add({
      targets: titlePoster,
      scale: 1,
      duration: 500,
      ease: 'Back.easeOut',
    });

    // ===== Sub: «Твой приз:» =====
    const subText = this.add.text(WIDTH / 2, 320, RU.result.winSub, {
      ...TEXT_STYLES.subtitle,
      fontSize: '20px',
      color: '#0A0A0A',
    });
    subText.setOrigin(0.5);
    subText.setDepth(DEPTH.ui);

    // ===== Карточка приза =====
    if (prize) {
      const cardBg = this.add.rectangle(WIDTH / 2, 480, WIDTH - 100, 220, COLORS.black);
      cardBg.setStrokeStyle(4, COLORS.red);
      cardBg.setDepth(DEPTH.ui);

      const prizeTier = this.add.text(WIDTH / 2, 400, prize.tier.toUpperCase(), {
        ...TEXT_STYLES.label,
        fontSize: '14px',
        color: '#FFE600',
      });
      prizeTier.setOrigin(0.5);
      prizeTier.setDepth(DEPTH.ui);

      const prizeLabel = this.add.text(WIDTH / 2, 450, prize.label, {
        ...TEXT_STYLES.title,
        fontSize: '32px',
        color: '#FAF7F0',
      });
      prizeLabel.setOrigin(0.5);
      prizeLabel.setDepth(DEPTH.ui);

      if (prize.promoCode) {
        const codeBox = this.add.rectangle(WIDTH / 2, 525, 280, 50, COLORS.yellow);
        codeBox.setDepth(DEPTH.ui);

        const codeText = this.add.text(WIDTH / 2, 525, prize.promoCode, {
          fontFamily: 'Unbounded, sans-serif',
          fontSize: '24px',
          fontStyle: 'italic 800',
          color: '#0A0A0A',
        });
        codeText.setOrigin(0.5);
        codeText.setDepth(DEPTH.ui);

        // Кнопка «СКОПИРОВАТЬ ПРОМОКОД»
        const copyBtn = new Button(
          this,
          WIDTH / 2,
          720,
          RU.result.copyCta,
          () => this.copyPromoCode(prize.promoCode!, copyBtn),
          {
            width: 420,
            height: 80,
            bgColor: COLORS.red,
            textColor: '#FAF7F0',
            fontSize: '22px',
          }
        );
        copyBtn.setDepth(DEPTH.ui);
        this.add.existing(copyBtn);
      }
    }

    // ===== Декор-стикер =====
    const sticker = new PosterText(this, WIDTH / 2, 850, 'НЯМКА ЕСТЬ — КАЙФ ЕСТЬ!', {
      bgColor: COLORS.purple,
      textColor: '#FAF7F0',
      fontSize: '18px',
      rotation: 0.03,
      paddingX: 16,
      paddingY: 8,
    });
    sticker.setDepth(DEPTH.ui);
    this.add.existing(sticker);

    // ===== Кнопка возврата =====
    const backBtn = new Button(
      this,
      WIDTH / 2,
      HEIGHT - 100,
      RU.result.backCta,
      () => this.goHome(),
      {
        width: 380,
        height: 80,
        bgColor: COLORS.black,
        textColor: '#FFE600',
        fontSize: '22px',
      }
    );
    backBtn.setDepth(DEPTH.ui);
    this.add.existing(backBtn);

    this.cameras.main.fadeIn(300, 255, 230, 0);
  }

  private renderLose(): void {
    const { WIDTH, HEIGHT } = GAME;

    // ===== Фон: тёмный =====
    this.add.rectangle(WIDTH / 2, HEIGHT / 2, WIDTH, HEIGHT, COLORS.greyDark);
    this.drawNoise();

    // ===== Заголовок =====
    const titlePoster = new PosterText(this, WIDTH / 2, HEIGHT / 2 - 200, RU.result.loseTitle, {
      bgColor: COLORS.lose,
      textColor: '#FAF7F0',
      fontSize: '44px',
      rotation: -0.025,
      paddingX: 26,
      paddingY: 14,
    });
    titlePoster.setDepth(DEPTH.ui);
    this.add.existing(titlePoster);

    // ===== Body =====
    const body = this.add.text(WIDTH / 2, HEIGHT / 2 - 60, RU.result.loseSub, {
      ...TEXT_STYLES.body,
      fontSize: '20px',
      color: '#FAF7F0',
      wordWrap: { width: WIDTH - 100 },
      lineSpacing: 6,
    });
    body.setOrigin(0.5);
    body.setDepth(DEPTH.ui);

    // ===== Большой эмодзи =====
    const emoji = this.add.text(WIDTH / 2, HEIGHT / 2 + 100, '🍕', {
      fontSize: '140px',
    });
    emoji.setOrigin(0.5);
    emoji.setAlpha(0.5);
    emoji.setDepth(DEPTH.midground);
    this.tweens.add({
      targets: emoji,
      angle: { from: -5, to: 5 },
      duration: 1500,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });

    // ===== Кнопка возврата =====
    const backBtn = new Button(
      this,
      WIDTH / 2,
      HEIGHT - 100,
      RU.result.backCta,
      () => this.goHome(),
      {
        width: 380,
        height: 80,
        bgColor: COLORS.red,
        textColor: '#FAF7F0',
        fontSize: '22px',
      }
    );
    backBtn.setDepth(DEPTH.ui);
    this.add.existing(backBtn);

    this.cameras.main.fadeIn(300, 26, 26, 26);
  }

  private async copyPromoCode(code: string, btn: Button): Promise<void> {
    try {
      // Современный API
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(code);
      } else {
        // Фолбэк для старых браузеров и небезопасных контекстов
        const textarea = document.createElement('textarea');
        textarea.value = code;
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
      }
      btn.setText(RU.result.copied);
      btn.setEnabled(false);
    } catch (err) {
      console.warn('[ResultScene] copy failed', err);
      btn.setText('НЕ УДАЛОСЬ :(');
    }
  }

  private goHome(): void {
    this.cameras.main.fadeOut(300, 10, 10, 10);
    this.cameras.main.once('camerafadeoutcomplete', () => {
      this.scene.start('SplashScene');
    });
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
