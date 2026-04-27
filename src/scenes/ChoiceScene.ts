import Phaser from 'phaser';
import { COLORS } from '@config/colors';
import { TEXT_STYLES } from '@config/fonts';
import { GAME, DEPTH } from '@config/game';
import { RU } from '@i18n/ru';
import { Button } from '@ui/Button';
import { PosterText } from '@ui/PosterText';
import { SessionState } from '@core/SessionState';
import { SoundManager } from '@core/SoundManager';
import { Haptics } from '@core/Haptics';
import { attachSoundButton } from '@utils/SceneHelpers';

/**
 * Экран выбора после победы в минке.
 *
 * Показывает: текущий уровень, поздравление и две кнопки:
 *   🎰 КРУТИТЬ КОЛЕСО — забрать приз сейчас (приз соответствует уровню)
 *   🎸 ИДТИ ДАЛЬШЕ   — перейти на следующую минку, призы будут жирнее
 *
 * На уровне 4 эта сцена не показывается — после победы сразу WheelScene с джекпотом.
 */
export class ChoiceScene extends Phaser.Scene {
  constructor() {
    super({ key: 'ChoiceScene' });
  }

  create(_data: { wonLevel?: number } = {}): void {
    const { WIDTH, HEIGHT } = GAME;
    const currentLevel = SessionState.getCurrentLevel();

    // ===== Фон: победный жёлтый =====
    this.add.rectangle(WIDTH / 2, HEIGHT / 2, WIDTH, HEIGHT, COLORS.yellow);
    this.drawNoise();

    // ===== Декоративные стикеры =====
    this.drawDecoStickers();

    // ===== Заголовок «РАСКОЛБАС! :3» =====
    const titlePoster = new PosterText(this, WIDTH / 2, 200, RU.choice.titleAfterWin, {
      bgColor: COLORS.red,
      textColor: '#FAF7F0',
      fontSize: '52px',
      rotation: -0.03,
      paddingX: 28,
      paddingY: 14,
    });
    titlePoster.setDepth(DEPTH.ui);
    this.add.existing(titlePoster);

    // Появление с пружиной
    titlePoster.setScale(0.5);
    this.tweens.add({
      targets: titlePoster,
      scale: 1,
      duration: 450,
      ease: 'Back.easeOut',
    });

    // ===== Метка уровня =====
    const levelLabel = this.add.text(WIDTH / 2, 290, `${RU.choice.levelLabel} ${currentLevel} / 4 ✓`, {
      ...TEXT_STYLES.subtitle,
      fontSize: '22px',
      color: '#0A0A0A',
    });
    levelLabel.setOrigin(0.5);
    levelLabel.setDepth(DEPTH.ui);

    // ===== Прогресс-бар уровней =====
    this.drawProgressBar(currentLevel);

    // ===== Body =====
    const body = this.add.text(WIDTH / 2, 460, RU.choice.body, {
      ...TEXT_STYLES.body,
      fontSize: '20px',
      color: '#0A0A0A',
    });
    body.setOrigin(0.5);
    body.setDepth(DEPTH.ui);

    // ===== Кнопка «КРУТИТЬ КОЛЕСО» =====
    const wheelBtn = new Button(
      this,
      WIDTH / 2,
      HEIGHT - 380,
      RU.choice.ctaWheel,
      () => this.chooseWheel(),
      {
        width: 460,
        height: 100,
        bgColor: COLORS.red,
        textColor: '#FAF7F0',
        fontSize: '26px',
      }
    );
    wheelBtn.setDepth(DEPTH.ui);
    this.add.existing(wheelBtn);

    const wheelHint = this.add.text(WIDTH / 2, HEIGHT - 320, RU.choice.hintWheel, {
      ...TEXT_STYLES.label,
      fontSize: '14px',
      color: '#0A0A0A',
    });
    wheelHint.setOrigin(0.5);
    wheelHint.setAlpha(0.7);
    wheelHint.setDepth(DEPTH.ui);

    // ===== Кнопка «ИДТИ ДАЛЬШЕ» =====
    const continueBtn = new Button(
      this,
      WIDTH / 2,
      HEIGHT - 200,
      RU.choice.ctaContinue,
      () => this.chooseContinue(),
      {
        width: 460,
        height: 100,
        bgColor: COLORS.black,
        textColor: '#FFE600',
        fontSize: '26px',
      }
    );
    continueBtn.setDepth(DEPTH.ui);
    this.add.existing(continueBtn);

    const continueHint = this.add.text(WIDTH / 2, HEIGHT - 140, RU.choice.hintContinue, {
      ...TEXT_STYLES.label,
      fontSize: '14px',
      color: '#0A0A0A',
    });
    continueHint.setOrigin(0.5);
    continueHint.setAlpha(0.7);
    continueHint.setDepth(DEPTH.ui);

    // Звук победы на входе на ChoiceScene
    SoundManager.playSfx('win');
    Haptics.trigger('win');

    attachSoundButton(this);

    this.cameras.main.fadeIn(300, 255, 230, 0);
  }

  /** Прогресс-бар: 4 кружка, заполненные = пройденные уровни */
  private drawProgressBar(currentLevel: number): void {
    const { WIDTH } = GAME;
    const cx = WIDTH / 2;
    const cy = 360;
    const gap = 60;
    const totalW = gap * 3;
    const startX = cx - totalW / 2;

    for (let i = 1; i <= 4; i++) {
      const x = startX + (i - 1) * gap;
      const isCompleted = i <= currentLevel;
      const color = isCompleted ? COLORS.red : COLORS.greyLight;
      const radius = isCompleted ? 14 : 10;

      this.add.circle(x, cy, radius, color).setDepth(DEPTH.ui);

      // Соединительные линии
      if (i > 1) {
        const prevX = startX + (i - 2) * gap;
        const lineColor = i <= currentLevel ? COLORS.red : COLORS.greyLight;
        this.add.line(0, 0, prevX + 14, cy, x - 14, cy, lineColor).setLineWidth(3).setDepth(DEPTH.midground);
      }
    }
  }

  private drawDecoStickers(): void {
    const { WIDTH } = GAME;

    const s1 = new PosterText(this, 100, 110, 'КАЙФ!', {
      bgColor: COLORS.red,
      textColor: '#FAF7F0',
      fontSize: '18px',
      rotation: -0.18,
      paddingX: 12,
      paddingY: 6,
    });
    s1.setDepth(DEPTH.midground);
    s1.setAlpha(0.85);
    this.add.existing(s1);

    const s2 = new PosterText(this, WIDTH - 100, 130, 'ЙОУ!', {
      bgColor: COLORS.purple,
      textColor: '#FAF7F0',
      fontSize: '18px',
      rotation: 0.16,
      paddingX: 12,
      paddingY: 6,
    });
    s2.setDepth(DEPTH.midground);
    s2.setAlpha(0.85);
    this.add.existing(s2);
  }

  private drawNoise(): void {
    const { WIDTH, HEIGHT } = GAME;
    const g = this.add.graphics();
    g.fillStyle(0x000000, 0.05);
    for (let i = 0; i < 600; i++) {
      const x = Math.random() * WIDTH;
      const y = Math.random() * HEIGHT;
      g.fillCircle(x, y, Math.random() * 1.5);
    }
    g.setDepth(DEPTH.background);
  }

  private chooseWheel(): void {
    SoundManager.playSfx('choice');
    Haptics.trigger('tap');
    this.cameras.main.fadeOut(300, 10, 10, 10);
    this.cameras.main.once('camerafadeoutcomplete', () => {
      this.scene.start('WheelScene', { isJackpot: false });
    });
  }

  private chooseContinue(): void {
    SoundManager.playSfx('choice');
    Haptics.trigger('tap');
    const next = SessionState.advanceLevel();
    if (next === null) {
      // На всякий случай — но сюда мы не должны попадать (уровень 4 минует ChoiceScene)
      this.scene.start('WheelScene', { isJackpot: true });
      return;
    }
    this.cameras.main.fadeOut(300, 10, 10, 10);
    this.cameras.main.once('camerafadeoutcomplete', () => {
      this.scene.start('MinigameRunnerScene');
    });
  }
}
