import Phaser from 'phaser';
import { COLORS } from '@config/colors';
import { GAME, DEPTH } from '@config/game';
import { RU } from '@i18n/ru';
import { Button } from '@ui/Button';
import { SessionState } from '@core/SessionState';
import { SoundManager } from '@core/SoundManager';
import { Haptics } from '@core/Haptics';
import { attachSoundButton } from '@utils/SceneHelpers';

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
  private readonly pixelFont = '"Press Start 2P", monospace';

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

    const bg = this.add.image(WIDTH / 2, HEIGHT / 2, 'unluck-bg');
    bg.setOrigin(0.5);
    bg.setScale(Math.max(WIDTH / bg.width, HEIGHT / bg.height));
    bg.setDepth(DEPTH.background);

    const titleTape = this.add.rectangle(WIDTH / 2, 230, 510, 120, COLORS.red, 1);
    titleTape.setStrokeStyle(6, 0x0a0a0a);
    titleTape.setAngle(-4);
    titleTape.setDepth(DEPTH.ui);

    const title = this.add.text(WIDTH / 2, 230, RU.result.winTitle.toUpperCase(), {
      fontFamily: this.pixelFont,
      fontSize: '58px',
      color: '#FAF7F0',
      fontStyle: 'italic',
      align: 'center',
    });
    title.setOrigin(0.5);
    title.setAngle(-4);
    title.setDepth(DEPTH.ui + 1);

    const subText = this.add.text(WIDTH / 2, 392, RU.result.winSub.toUpperCase(), {
      fontFamily: this.pixelFont,
      fontSize: '25px',
      color: '#FFE600',
      stroke: '#0A0A0A',
      strokeThickness: 6,
    });
    subText.setOrigin(0.5);
    subText.setDepth(DEPTH.ui);

    const cardBg = this.add.rectangle(WIDTH / 2, 575, WIDTH - 116, 275, 0x050607, 0.94);
    cardBg.setStrokeStyle(7, COLORS.red);
    cardBg.setDepth(DEPTH.ui);

    if (prize) {
      const prizeTier = this.add.text(WIDTH / 2, 486, prize.tier.toUpperCase(), {
        fontFamily: this.pixelFont,
        fontSize: '20px',
        color: '#FFE600',
      });
      prizeTier.setOrigin(0.5);
      prizeTier.setDepth(DEPTH.ui + 1);

      const prizeLabel = this.add.text(WIDTH / 2, 560, prize.label.toUpperCase(), {
        fontFamily: this.pixelFont,
        fontSize: '32px',
        color: '#FAF7F0',
        align: 'center',
        wordWrap: { width: WIDTH - 170, useAdvancedWrap: true },
      });
      prizeLabel.setOrigin(0.5);
      prizeLabel.setDepth(DEPTH.ui + 1);

      if (prize.promoCode) {
        const codeBox = this.add.rectangle(WIDTH / 2, 660, 340, 62, COLORS.yellow);
        codeBox.setStrokeStyle(5, 0x0a0a0a);
        codeBox.setDepth(DEPTH.ui + 1);

        const codeText = this.add.text(WIDTH / 2, 660, prize.promoCode, {
          fontFamily: this.pixelFont,
          fontSize: '25px',
          color: '#0A0A0A',
        });
        codeText.setOrigin(0.5);
        codeText.setDepth(DEPTH.ui + 2);
      }
    }

    if (prize?.promoCode) {
      const copyBtn = new Button(
        this,
        WIDTH / 2,
        800,
        RU.result.copyCta,
        () => this.copyPromoCode(prize.promoCode!, copyBtn),
        {
          width: 500,
          height: 88,
          bgColor: COLORS.red,
          textColor: '#FAF7F0',
          fontSize: '21px',
          fontFamily: this.pixelFont,
          pixel: true,
          pixelStyle: { step: 6, border: 6, corner: 18 },
        }
      );
      copyBtn.setDepth(DEPTH.ui);
      this.add.existing(copyBtn);
    }

    const sticker = this.add.rectangle(WIDTH / 2, 920, 450, 62, COLORS.purple);
    sticker.setStrokeStyle(5, 0x0a0a0a);
    sticker.setDepth(DEPTH.ui);
    const stickerText = this.add.text(WIDTH / 2, 920, 'НЯМКА ЕСТЬ — КАЙФ ЕСТЬ!', {
      fontFamily: this.pixelFont,
      fontSize: '19px',
      color: '#FAF7F0',
    });
    stickerText.setOrigin(0.5);
    stickerText.setDepth(DEPTH.ui + 1);

    const backBtn = new Button(
      this,
      WIDTH / 2,
      1090,
      RU.result.backCta,
      () => this.goHome(),
      {
        width: 500,
        height: 96,
        bgColor: COLORS.black,
        textColor: '#FFE600',
        fontSize: '27px',
        fontFamily: this.pixelFont,
        pixel: true,
        pixelStyle: { step: 6, border: 6, corner: 18, outline: COLORS.yellow },
      }
    );
    backBtn.setDepth(DEPTH.ui);
    this.add.existing(backBtn);

    SoundManager.playSfx('win');
    Haptics.trigger('win');

    attachSoundButton(this);

    this.cameras.main.fadeIn(300, 255, 230, 0);
  }

  private renderLose(): void {
    const { WIDTH, HEIGHT } = GAME;

    const bg = this.add.image(WIDTH / 2, HEIGHT / 2, 'unluck-bg');
    bg.setOrigin(0.5);
    bg.setScale(Math.max(WIDTH / bg.width, HEIGHT / bg.height));
    bg.setDepth(DEPTH.background);

    const panel = this.add.rectangle(WIDTH / 2, 615, WIDTH - 118, 620, 0x050607, 0.94);
    panel.setStrokeStyle(7, COLORS.red);
    panel.setDepth(DEPTH.ui);

    const titleTape = this.add.rectangle(WIDTH / 2, 394, 430, 88, COLORS.red, 1);
    titleTape.setStrokeStyle(5, 0x0a0a0a);
    titleTape.setDepth(DEPTH.ui + 1);

    const title = this.add.text(WIDTH / 2, 394, RU.result.loseTitle.toUpperCase(), {
      fontFamily: '"Press Start 2P", monospace',
      fontSize: '32px',
      color: '#FAF7F0',
      align: 'center',
    });
    title.setOrigin(0.5);
    title.setDepth(DEPTH.ui + 2);

    const bodyText = 'ПРОГРЕСС СОХРАНЁН НА 2 НЕДЕЛИ.\nВОЗВРАЩАЙСЯ ПОСЛЕ\nСЛЕДУЮЩЕГО ЗАКАЗА, БРАТИШКА <3';
    const body = this.add.text(WIDTH / 2, 535, bodyText, {
      fontFamily: '"Press Start 2P", monospace',
      fontSize: '20px',
      color: '#FAF7F0',
      align: 'center',
      lineSpacing: 16,
      wordWrap: { width: WIDTH - 180 },
    });
    body.setOrigin(0.5);
    body.setDepth(DEPTH.ui + 1);

    const emoji = this.add.text(WIDTH / 2, HEIGHT / 2 + 100, '🍕', {
      fontSize: '118px',
    });
    emoji.setOrigin(0.5);
    emoji.setDepth(DEPTH.ui + 1);
    this.tweens.add({
      targets: emoji,
      angle: { from: -5, to: 5 },
      duration: 1500,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });

    const backBtn = new Button(
      this,
      WIDTH / 2,
      1048,
      RU.result.backCta,
      () => this.goHome(),
      {
        width: 430,
        height: 92,
        bgColor: COLORS.red,
        textColor: '#FAF7F0',
        fontSize: '22px',
        fontFamily: '"Press Start 2P", monospace',
        pixel: true,
        pixelStyle: { step: 6, border: 6, corner: 18 },
      }
    );
    backBtn.setDepth(DEPTH.ui);
    this.add.existing(backBtn);

    SoundManager.playSfx('lose');
    Haptics.trigger('lose');

    attachSoundButton(this);

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
      SoundManager.playSfx('perfect');
      Haptics.trigger('good');
    } catch (err) {
      console.warn('[ResultScene] copy failed', err);
      btn.setText('НЕ УДАЛОСЬ :(');
    }
  }

  private goHome(): void {
    SoundManager.playSfx('tap');
    Haptics.trigger('tap');
    this.cameras.main.fadeOut(300, 10, 10, 10);
    this.cameras.main.once('camerafadeoutcomplete', () => {
      this.scene.start('SplashScene');
    });
  }
}
