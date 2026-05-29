import Phaser from 'phaser';
import { COLORS } from '@config/colors';
import { GAME, DEPTH } from '@config/game';
import { RU } from '@i18n/ru';
import { Button } from '@ui/Button';
import { SessionState } from '@core/SessionState';
import { SoundManager } from '@core/SoundManager';
import { Haptics } from '@core/Haptics';
import { attachSoundButton, paintPageBackdrop } from '@utils/SceneHelpers';

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
  private readonly pixelFont = '"Press Start 2P", monospace';

  constructor() {
    super({ key: 'ChoiceScene' });
  }

  create(_data: { wonLevel?: number } = {}): void {
    const { WIDTH, HEIGHT } = GAME;
    SoundManager.playMusic('relaxed');
    paintPageBackdrop(this, 0x130709, 'play-interlevel-bg');

    if (SessionState.getLivesLeft() <= 0) {
      this.scene.start('ResultScene', { outcome: 'lose' });
      return;
    }

    const currentLevel = SessionState.getCurrentLevel();

    const bg = this.add.image(WIDTH / 2, HEIGHT / 2, 'play-interlevel-bg');
    bg.setOrigin(0.5);
    bg.setScale(Math.max(WIDTH / bg.width, HEIGHT / bg.height));
    bg.setDepth(DEPTH.background);
    this.add.rectangle(WIDTH / 2, HEIGHT / 2, WIDTH, HEIGHT, 0x000000, 0.08)
      .setDepth(DEPTH.background + 1);

    this.coverReferenceUi();

    const levelLabel = this.add.text(WIDTH / 2, 470, `${RU.choice.levelLabel} ${currentLevel} / 4 ✓`, {
      fontFamily: this.pixelFont,
      fontSize: '25px',
      color: '#FAF7F0',
      stroke: '#0A0A0A',
      strokeThickness: 7,
    });
    levelLabel.setOrigin(0.5);
    levelLabel.setDepth(DEPTH.ui);

    this.drawProgressBar(currentLevel);

    const body = this.add.text(WIDTH / 2, 675, RU.choice.body, {
      fontFamily: this.pixelFont,
      fontSize: '23px',
      color: '#FAF7F0',
      stroke: '#0A0A0A',
      strokeThickness: 7,
      align: 'center',
    });
    body.setOrigin(0.5);
    body.setDepth(DEPTH.ui);

    const wheelBtn = new Button(
      this,
      WIDTH / 2,
      825,
      RU.choice.ctaWheel,
      () => this.chooseWheel(),
      {
        width: 590,
        height: 130,
        bgColor: COLORS.red,
        textColor: '#FAF7F0',
        fontSize: '30px',
        fontFamily: this.pixelFont,
        pixel: true,
        pixelStyle: { step: 6, border: 6, corner: 24 },
        textStroke: '#0A0A0A',
        textStrokeWidth: 8,
      }
    );
    wheelBtn.setDepth(DEPTH.ui);
    this.add.existing(wheelBtn);

    const wheelIcon = this.add.image(118, 825, 'star-pixel');
    wheelIcon.setOrigin(0.5);
    wheelIcon.setDisplaySize(58, 58);
    wheelIcon.setDepth(DEPTH.ui + 1);

    const wheelHint = this.add.text(WIDTH / 2, 920, RU.choice.hintWheel, {
      fontFamily: this.pixelFont,
      fontSize: '19px',
      color: '#FAF7F0',
      stroke: '#0A0A0A',
      strokeThickness: 6,
    });
    wheelHint.setOrigin(0.5);
    wheelHint.setDepth(DEPTH.ui);

    const continueBtn = new Button(
      this,
      WIDTH / 2,
      1050,
      RU.choice.ctaContinue,
      () => this.chooseContinue(),
      {
        width: 590,
        height: 130,
        bgColor: COLORS.yellow,
        textColor: '#FAF7F0',
        fontSize: '30px',
        fontFamily: this.pixelFont,
        pixel: true,
        pixelStyle: { step: 6, border: 6, corner: 24 },
        textStroke: '#0A0A0A',
        textStrokeWidth: 8,
      }
    );
    continueBtn.setDepth(DEPTH.ui);
    this.add.existing(continueBtn);

    // Иконка геймпада на «ИДТИ ДАЛЬШЕ» снята — UI стал чище, осталась только
    // звезда-блик на верхней «КРУТИТЬ КОЛЕСО».

    const continueHint = this.add.text(WIDTH / 2, 1145, RU.choice.hintContinue, {
      fontFamily: this.pixelFont,
      fontSize: '19px',
      color: '#FAF7F0',
      stroke: '#0A0A0A',
      strokeThickness: 6,
    });
    continueHint.setOrigin(0.5);
    continueHint.setDepth(DEPTH.ui);

    // Звук победы на входе на ChoiceScene
    SoundManager.playSfx('win');
    Haptics.trigger('win');

    attachSoundButton(this);

    this.cameras.main.fadeIn(300, 255, 230, 0);
  }

  /**
   * Прогресс-бар: 4 кружка с литыми линиями между ними.
   * Кружки и линии красные, если уровень пройден; иначе серые.
   * Линия рисуется ОТ предыдущего кружка ДО текущего и красится только если
   * её правая граница попадает в пройденный кружок.
   */
  private drawProgressBar(currentLevel: number): void {
    const { WIDTH } = GAME;
    const cx = WIDTH / 2;
    const cy = 552;
    const gap = 82;
    const totalW = gap * 3;
    const startX = cx - totalW / 2;
    const radius = 18;
    const lineThickness = 10;
    const lineBorderThickness = 16;
    const inactiveColor = 0xb7b7b7;

    // 1) Сначала линии — на слое ПОД кружками, чтобы кружки их перекрыли по краям.
    for (let i = 2; i <= 4; i++) {
      const prevX = startX + (i - 2) * gap;
      const x = startX + (i - 1) * gap;
      const completed = i <= currentLevel;
      const lineColor = completed ? COLORS.red : inactiveColor;

      // Чёрная обводка-«литник»
      this.add.line(0, 0, prevX, cy, x, cy, 0x0a0a0a)
        .setLineWidth(lineBorderThickness)
        .setOrigin(0, 0)
        .setDepth(DEPTH.ui - 1);
      // Цветная заливка по центру
      this.add.line(0, 0, prevX, cy, x, cy, lineColor)
        .setLineWidth(lineThickness)
        .setOrigin(0, 0)
        .setDepth(DEPTH.ui);
    }

    // 2) Кружки поверх линий
    for (let i = 1; i <= 4; i++) {
      const x = startX + (i - 1) * gap;
      const isCompleted = i <= currentLevel;
      const color = isCompleted ? COLORS.red : inactiveColor;

      this.add.circle(x, cy, radius + 6, 0x0a0a0a).setDepth(DEPTH.ui + 1);
      this.add.circle(x, cy, radius, color).setDepth(DEPTH.ui + 2);
    }
  }

  private coverReferenceUi(): void {
    const { WIDTH } = GAME;
    this.add.rectangle(WIDTH / 2, 502, WIDTH - 150, 150, 0x090604, 0.46)
      .setDepth(DEPTH.background + 2);
    this.add.rectangle(WIDTH / 2, 820, WIDTH - 74, 330, 0x090604, 0.28)
      .setDepth(DEPTH.background + 2);
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
    if (SessionState.getLivesLeft() <= 0) {
      this.scene.start('ResultScene', { outcome: 'lose' });
      return;
    }

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
