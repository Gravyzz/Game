import Phaser from 'phaser';
import { BaseMinigame } from '@minigames/BaseMinigame';
import { COLORS } from '@config/colors';
import { TEXT_STYLES } from '@config/fonts';
import { GAME, DEPTH } from '@config/game';
import { RU } from '@i18n/ru';
import { PosterText } from '@ui/PosterText';
import {
  generatePattern,
  HIT_WINDOWS,
  NOTE_TRAVEL_MS,
  BATTLE_METER_START,
  METER_DELTA,
  SCORE_DELTA,
  type Note,
  type Lane,
  type HitQuality,
} from '@minigames/RhythmBattle/config';

/**
 * MG-01 ⭐ ФЛАГМАН: Олдскул vs Шокинг Блю.
 *
 * Геймплей:
 * - 2 дорожки (левая = Олдскул, правая = Шокинг Блю)
 * - ноты падают сверху вниз к hit-line
 * - игрок тапает по половине экрана, когда нота на hit-line
 * - попал в окно ±80мс → perfect (+0.06 в свою сторону)
 *   попал в окно ±160мс → good    (+0.04)
 *   мимо или промах    → miss     (−0.05)
 * - в верху экрана — battle meter (0..1). Стартует с 0.5.
 *   Левая половина — твой прогресс за Олдскул, правая — за Шокинг Блю.
 * - раунд закончен → если meter ≥ 0.5 → win (Олдскул победил), иначе lose
 *
 * Без аудио в Phase 4.4 — всё по таймеру. В 4.5 синхронизируем с Web Audio.
 */

interface ActiveNote {
  data: Note;
  sprite: Phaser.GameObjects.Container;
  /** Уже обработана? (попадание или явный промах) */
  consumed: boolean;
}

export class RhythmBattleScene extends BaseMinigame {
  private readonly hitLineY = GAME.HEIGHT * 0.82;
  private readonly noteRadius = 36;

  private startTimeMs = 0;
  private notes: ActiveNote[] = [];
  private nextNoteIndex = 0;

  private score = 0;
  private combo = 0;
  private maxCombo = 0;
  private battleMeter = BATTLE_METER_START;
  private hitsByQuality: Record<HitQuality, number> = { perfect: 0, good: 0, miss: 0 };

  private isFinished = false;

  // UI
  private scoreText!: Phaser.GameObjects.Text;
  private comboText!: Phaser.GameObjects.Text;
  private meterFillLeft!: Phaser.GameObjects.Rectangle;
  private meterFillRight!: Phaser.GameObjects.Rectangle;
  private leftHitLine!: Phaser.GameObjects.Rectangle;
  private rightHitLine!: Phaser.GameObjects.Rectangle;
  private feedbackText!: Phaser.GameObjects.Text;

  constructor() {
    super({ key: 'RhythmBattle' });
  }

  create(): void {
    const { WIDTH, HEIGHT } = GAME;

    // Фон сцены
    this.add.rectangle(WIDTH / 2, HEIGHT / 2, WIDTH, HEIGHT, COLORS.black);
    this.drawNoise();
    this.drawStageStripes();

    // Battle meter
    this.drawBattleMeter();

    // Счётчик и комбо
    this.scoreText = this.add.text(WIDTH / 2, 145, '0', {
      fontFamily: 'Unbounded, sans-serif',
      fontSize: '36px',
      fontStyle: 'italic 900',
      color: '#FAF7F0',
    });
    this.scoreText.setOrigin(0.5);
    this.scoreText.setDepth(DEPTH.ui);

    this.comboText = this.add.text(WIDTH / 2, 195, '', {
      fontFamily: 'Unbounded, sans-serif',
      fontSize: '20px',
      fontStyle: 'italic 800',
      color: '#FFE600',
    });
    this.comboText.setOrigin(0.5);
    this.comboText.setDepth(DEPTH.ui);

    // Дорожки и hit-line
    this.drawLanes();

    // Feedback («PERFECT!», «GOOD», «MISS»)
    this.feedbackText = this.add.text(WIDTH / 2, this.hitLineY - 90, '', {
      fontFamily: 'Unbounded, sans-serif',
      fontSize: '38px',
      fontStyle: 'italic 900',
      color: '#FAF7F0',
    });
    this.feedbackText.setOrigin(0.5);
    this.feedbackText.setDepth(DEPTH.effects);
    this.feedbackText.setAlpha(0);

    // Паттерн нот
    const pattern = generatePattern(this.initData.difficulty, this.initData.durationMs);
    this.notes = pattern.map((data) => ({
      data,
      sprite: this.createNoteSprite(data),
      consumed: false,
    }));

    // Тач-зоны: левая и правая половины экрана
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => this.handleTap(p));

    // Стартуем после обратного отсчёта
    this.showStartCountdown();
  }

  override update(): void {
    if (this.isFinished || this.startTimeMs === 0) return;

    const elapsed = this.time.now - this.startTimeMs;
    if (elapsed < 0) return; // ещё countdown

    // Спавним ноты, чьё «появление» уже наступило
    while (this.nextNoteIndex < this.notes.length) {
      const n = this.notes[this.nextNoteIndex];
      if (elapsed >= n.data.timeMs - NOTE_TRAVEL_MS) {
        n.sprite.setVisible(true);
        this.nextNoteIndex++;
      } else {
        break;
      }
    }

    // Двигаем ноты вниз и проверяем промахи
    for (const n of this.notes) {
      if (n.consumed || !n.sprite.visible) continue;

      const targetTime = n.data.timeMs;
      const progress = (elapsed - (targetTime - NOTE_TRAVEL_MS)) / NOTE_TRAVEL_MS;
      n.sprite.y = -this.noteRadius + progress * (this.hitLineY + this.noteRadius);

      if (elapsed - targetTime > HIT_WINDOWS.good) {
        this.markMiss(n);
      }
    }

    if (elapsed >= this.initData.durationMs) {
      this.finishRound();
    }
  }

  // ============================================================
  // RENDERING
  // ============================================================

  private drawStageStripes(): void {
    const { WIDTH, HEIGHT } = GAME;
    const stripeColors = [COLORS.red, COLORS.purple];
    for (let i = 0; i < 4; i++) {
      const x = (i * WIDTH) / 4 + WIDTH / 8;
      const stripe = this.add.rectangle(x, HEIGHT / 2, 4, HEIGHT, stripeColors[i % 2]);
      stripe.setAlpha(0.08);
      stripe.setDepth(DEPTH.background);
    }
  }

  private drawBattleMeter(): void {
    const { WIDTH } = GAME;
    const meterY = 80;
    const meterW = WIDTH - 100;
    const meterH = 36;

    const bg = this.add.rectangle(WIDTH / 2, meterY, meterW, meterH, COLORS.greyDark);
    bg.setStrokeStyle(3, COLORS.cream);
    bg.setDepth(DEPTH.ui);

    this.meterFillLeft = this.add.rectangle(
      WIDTH / 2 - meterW / 2,
      meterY,
      meterW * BATTLE_METER_START,
      meterH - 6,
      COLORS.red
    );
    this.meterFillLeft.setOrigin(0, 0.5);
    this.meterFillLeft.setDepth(DEPTH.ui);

    this.meterFillRight = this.add.rectangle(
      WIDTH / 2 + meterW / 2,
      meterY,
      meterW * (1 - BATTLE_METER_START),
      meterH - 6,
      COLORS.purple
    );
    this.meterFillRight.setOrigin(1, 0.5);
    this.meterFillRight.setDepth(DEPTH.ui);

    // Иконки персонажей
    const oldscool = this.add.text(50, meterY, '🎸', { fontSize: '36px' });
    oldscool.setOrigin(0.5);
    oldscool.setDepth(DEPTH.ui);

    const shocking = this.add.text(WIDTH - 50, meterY, '🎤', { fontSize: '36px' });
    shocking.setOrigin(0.5);
    shocking.setDepth(DEPTH.ui);

    // Подписи
    const leftLabel = this.add.text(50, meterY + 38, 'ОЛДСКУЛ', {
      ...TEXT_STYLES.label,
      fontSize: '11px',
      color: '#FF2E2E',
    });
    leftLabel.setOrigin(0.5);
    leftLabel.setDepth(DEPTH.ui);

    const rightLabel = this.add.text(WIDTH - 50, meterY + 38, 'ШОКИНГ БЛЮ', {
      ...TEXT_STYLES.label,
      fontSize: '11px',
      color: '#7A5CFF',
    });
    rightLabel.setOrigin(0.5);
    rightLabel.setDepth(DEPTH.ui);

    const divider = this.add.line(WIDTH / 2, meterY, 0, -meterH / 2, 0, meterH / 2, COLORS.cream);
    divider.setLineWidth(2);
    divider.setDepth(DEPTH.ui);
  }

  private drawLanes(): void {
    const { WIDTH, HEIGHT } = GAME;
    const laneTopY = 240;
    const laneHeight = HEIGHT - laneTopY;

    const leftLane = this.add.rectangle(WIDTH / 4, laneTopY + laneHeight / 2, WIDTH / 2, laneHeight, COLORS.red);
    leftLane.setAlpha(0.06);
    leftLane.setDepth(DEPTH.background);

    const rightLane = this.add.rectangle((WIDTH * 3) / 4, laneTopY + laneHeight / 2, WIDTH / 2, laneHeight, COLORS.purple);
    rightLane.setAlpha(0.06);
    rightLane.setDepth(DEPTH.background);

    const middleLine = this.add.line(WIDTH / 2, 0, 0, laneTopY, 0, HEIGHT, COLORS.cream);
    middleLine.setLineWidth(1);
    middleLine.setAlpha(0.15);
    middleLine.setDepth(DEPTH.midground);

    // Hit-line
    this.leftHitLine = this.add.rectangle(WIDTH / 4, this.hitLineY, WIDTH / 2 - 8, 6, COLORS.red);
    this.leftHitLine.setDepth(DEPTH.midground);

    this.rightHitLine = this.add.rectangle((WIDTH * 3) / 4, this.hitLineY, WIDTH / 2 - 8, 6, COLORS.purple);
    this.rightHitLine.setDepth(DEPTH.midground);

    // Подписи
    const leftHint = this.add.text(WIDTH / 4, this.hitLineY + 50, 'ТАП', {
      fontFamily: 'Unbounded, sans-serif',
      fontSize: '20px',
      fontStyle: 'italic 800',
      color: '#FF2E2E',
    });
    leftHint.setOrigin(0.5);
    leftHint.setAlpha(0.6);
    leftHint.setDepth(DEPTH.ui);

    const rightHint = this.add.text((WIDTH * 3) / 4, this.hitLineY + 50, 'ТАП', {
      fontFamily: 'Unbounded, sans-serif',
      fontSize: '20px',
      fontStyle: 'italic 800',
      color: '#7A5CFF',
    });
    rightHint.setOrigin(0.5);
    rightHint.setAlpha(0.6);
    rightHint.setDepth(DEPTH.ui);
  }

  private createNoteSprite(note: Note): Phaser.GameObjects.Container {
    const { WIDTH } = GAME;
    const x = note.lane === 'left' ? WIDTH / 4 : (WIDTH * 3) / 4;
    const color = note.lane === 'left' ? COLORS.red : COLORS.purple;

    const container = this.add.container(x, -this.noteRadius * 2);
    container.setDepth(DEPTH.gameplay);
    container.setVisible(false);

    const ring = this.add.circle(0, 0, this.noteRadius, undefined, 0).setStrokeStyle(4, COLORS.cream);
    const fill = this.add.circle(0, 0, this.noteRadius - 4, color);
    const icon = this.add.text(0, 0, note.lane === 'left' ? '🎸' : '🎤', { fontSize: '32px' });
    icon.setOrigin(0.5);

    container.add([fill, ring, icon]);

    return container;
  }

  private showStartCountdown(): void {
    const { WIDTH, HEIGHT } = GAME;
    const counter = this.add.text(WIDTH / 2, HEIGHT / 2, '3', {
      fontFamily: 'Unbounded, sans-serif',
      fontSize: '160px',
      fontStyle: 'italic 900',
      color: '#FFE600',
      stroke: '#0A0A0A',
      strokeThickness: 8,
    });
    counter.setOrigin(0.5);
    counter.setDepth(DEPTH.modal);

    const sequence = ['3', '2', '1', 'РОК!'];
    const stepMs = 700;

    // Раунд начнётся через 4 шага по 700мс — фиксируем стартовое время
    this.startTimeMs = this.time.now + sequence.length * stepMs;

    let i = 0;
    const tick = () => {
      counter.setText(sequence[i]);
      counter.setScale(0.5);
      counter.setAlpha(1);
      this.tweens.add({
        targets: counter,
        scale: 1.2,
        alpha: { from: 1, to: 0 },
        duration: stepMs,
        ease: 'Cubic.easeOut',
        onComplete: () => {
          i++;
          if (i < sequence.length) {
            tick();
          } else {
            counter.destroy();
          }
        },
      });
    };
    tick();
  }

  // ============================================================
  // INPUT
  // ============================================================

  private handleTap(pointer: Phaser.Input.Pointer): void {
    if (this.isFinished) return;
    const elapsed = this.time.now - this.startTimeMs;
    if (elapsed < 0) return; // ещё обратный отсчёт

    const lane: Lane = pointer.x < GAME.WIDTH / 2 ? 'left' : 'right';

    // Ищем ближайшую необработанную ноту в этой дорожке в окне good
    let bestNote: ActiveNote | null = null;
    let bestDelta = Infinity;
    for (const n of this.notes) {
      if (n.consumed || n.data.lane !== lane) continue;
      const delta = Math.abs(elapsed - n.data.timeMs);
      if (delta < bestDelta && delta <= HIT_WINDOWS.good) {
        bestDelta = delta;
        bestNote = n;
      }
    }

    if (bestNote) {
      const quality: HitQuality = bestDelta <= HIT_WINDOWS.perfect ? 'perfect' : 'good';
      this.registerHit(bestNote, quality);
      this.flashHitLine(lane, quality);
    } else {
      // Тап в пустоту — лёгкий штраф (без срыва комбо)
      this.score = Math.max(0, this.score - 10);
      this.scoreText.setText(this.score.toString());
      this.flashHitLine(lane, 'miss', /*subtle=*/true);
    }
  }

  // ============================================================
  // GAME LOGIC
  // ============================================================

  private registerHit(n: ActiveNote, quality: HitQuality): void {
    n.consumed = true;
    n.sprite.destroy();

    this.hitsByQuality[quality]++;
    this.score += SCORE_DELTA[quality];
    this.scoreText.setText(this.score.toString());

    this.combo++;
    this.maxCombo = Math.max(this.maxCombo, this.combo);
    this.comboText.setText(this.combo >= 3 ? `КОМБО x${this.combo}` : '');

    // Левая дорожка → метр в красный, правая → в фиолетовый
    const delta = METER_DELTA[quality];
    if (n.data.lane === 'left') {
      this.battleMeter = Phaser.Math.Clamp(this.battleMeter + delta, 0, 1);
    } else {
      this.battleMeter = Phaser.Math.Clamp(this.battleMeter - delta, 0, 1);
    }
    this.updateMeter();
    this.showFeedback(quality);
  }

  private markMiss(n: ActiveNote): void {
    n.consumed = true;
    this.tweens.add({
      targets: n.sprite,
      alpha: 0,
      y: n.sprite.y + 40,
      duration: 250,
      onComplete: () => n.sprite.destroy(),
    });

    this.hitsByQuality.miss++;
    this.score = Math.max(0, this.score + SCORE_DELTA.miss);
    this.scoreText.setText(this.score.toString());

    this.combo = 0;
    this.comboText.setText('');

    // Промах в дорожке = метр уползает в сторону противоположного «героя»
    const delta = METER_DELTA.miss;
    if (n.data.lane === 'left') {
      this.battleMeter = Phaser.Math.Clamp(this.battleMeter + delta, 0, 1);
    } else {
      this.battleMeter = Phaser.Math.Clamp(this.battleMeter - delta, 0, 1);
    }
    this.updateMeter();
    this.showFeedback('miss');
  }

  private updateMeter(): void {
    const { WIDTH } = GAME;
    const meterW = WIDTH - 100;
    this.tweens.add({
      targets: this.meterFillLeft,
      width: meterW * this.battleMeter,
      duration: 200,
      ease: 'Cubic.easeOut',
    });
    this.tweens.add({
      targets: this.meterFillRight,
      width: meterW * (1 - this.battleMeter),
      duration: 200,
      ease: 'Cubic.easeOut',
    });
  }

  private flashHitLine(lane: Lane, quality: HitQuality, subtle = false): void {
    const target = lane === 'left' ? this.leftHitLine : this.rightHitLine;
    const flashColor =
      quality === 'perfect' ? COLORS.yellow :
      quality === 'good'    ? COLORS.win :
                              COLORS.lose;

    const originalColor = target.fillColor;
    target.setFillStyle(flashColor);

    this.tweens.add({
      targets: target,
      scaleY: subtle ? 1.5 : 3,
      duration: 80,
      yoyo: true,
      onComplete: () => target.setFillStyle(originalColor),
    });
  }

  private showFeedback(quality: HitQuality): void {
    const text =
      quality === 'perfect' ? 'PERFECT!' :
      quality === 'good'    ? 'GOOD'     :
                              'MISS :(';
    const color =
      quality === 'perfect' ? '#FFE600' :
      quality === 'good'    ? '#4ADE80' :
                              '#EF4444';

    this.feedbackText.setText(text);
    this.feedbackText.setColor(color);
    this.feedbackText.setAlpha(1);
    this.feedbackText.setScale(0.7);

    this.tweens.killTweensOf(this.feedbackText);
    this.tweens.add({
      targets: this.feedbackText,
      scale: 1,
      duration: 150,
      ease: 'Back.easeOut',
    });
    this.tweens.add({
      targets: this.feedbackText,
      alpha: 0,
      duration: 400,
      delay: 350,
    });
  }

  // ============================================================
  // FINISH
  // ============================================================

  private finishRound(): void {
    if (this.isFinished) return;
    this.isFinished = true;

    this.input.removeAllListeners();

    for (const n of this.notes) {
      if (!n.consumed) {
        n.sprite.destroy();
        n.consumed = true;
      }
    }

    const won = this.battleMeter >= 0.5;

    const { WIDTH, HEIGHT } = GAME;
    const finalPoster = new PosterText(this, WIDTH / 2, HEIGHT / 2, won ? RU.minigame.win : RU.minigame.lose, {
      bgColor: won ? COLORS.yellow : COLORS.lose,
      textColor: won ? '#0A0A0A' : '#FAF7F0',
      fontSize: '54px',
      rotation: -0.03,
      paddingX: 28,
      paddingY: 16,
    });
    finalPoster.setDepth(DEPTH.modal);
    finalPoster.setScale(0.5);
    finalPoster.setAlpha(0);
    this.add.existing(finalPoster);

    this.tweens.add({
      targets: finalPoster,
      alpha: 1,
      scale: 1,
      duration: 400,
      ease: 'Back.easeOut',
    });

    this.time.delayedCall(1400, () => {
      this.complete({
        outcome: won ? 'win' : 'lose',
        score: this.score,
        metadata: {
          perfect: this.hitsByQuality.perfect,
          good: this.hitsByQuality.good,
          miss: this.hitsByQuality.miss,
          maxCombo: this.maxCombo,
          finalMeter: Math.round(this.battleMeter * 100) / 100,
        },
      });
    });
  }

  private drawNoise(): void {
    const { WIDTH, HEIGHT } = GAME;
    const g = this.add.graphics();
    g.fillStyle(0x000000, 0.1);
    for (let i = 0; i < 800; i++) {
      const x = Math.random() * WIDTH;
      const y = Math.random() * HEIGHT;
      g.fillCircle(x, y, Math.random() * 1.5);
    }
    g.setDepth(DEPTH.background);
  }
}
