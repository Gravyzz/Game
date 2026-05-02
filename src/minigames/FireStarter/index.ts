import Phaser from 'phaser';
import { BaseMinigame } from '@minigames/BaseMinigame';
import { COLORS } from '@config/colors';
import { TEXT_STYLES } from '@config/fonts';
import { GAME, DEPTH } from '@config/game';
import { RU } from '@i18n/ru';
import { PosterText } from '@ui/PosterText';
import { SoundManager } from '@core/SoundManager';
import { Haptics } from '@core/Haptics';

/**
 * MG-03 Фаерстартер: тайминг печи.
 *
 * Геймплей:
 *  - На экране печь и горизонтальный индикатор прожарки.
 *  - Маркер снуёт по индикатору слева-направо и обратно с растущей скоростью.
 *  - В середине шкалы — узкая «зелёная зона» идеальной прожарки.
 *  - Игрок тапает в любую точку экрана, чтобы «вытащить пиццу».
 *  - Один тап в зелёной зоне = пицца идеальная (+1).
 *  - Тап мимо = сырая или сгоревшая (−1 жизнь).
 *  - Раунд состоит из ROUNDS_PER_GAME пиццы. Хотя бы WIN_THRESHOLD идеальных = WIN.
 *
 * Сложность (difficulty 0..1):
 *  - Ширина зелёной зоны: 32% (easy) → 9% (hard).
 *  - Скорость маркера: 1.0× → 2.2×.
 */

const ROUNDS_PER_GAME = 3;
const WIN_THRESHOLD = 2; // нужно ≥ 2 попадания из 3
const MAX_MISSES = 1;

const BAR_WIDTH = 600;
const BAR_HEIGHT = 36;

export class FireStarterScene extends BaseMinigame {
  private currentRound = 0;
  private hits = 0;
  private misses = 0;

  private bar!: Phaser.GameObjects.Rectangle;
  private greenZone!: Phaser.GameObjects.Rectangle;
  private marker!: Phaser.GameObjects.Rectangle;
  private statusText!: Phaser.GameObjects.Text;
  private livesText!: Phaser.GameObjects.Text;
  private pizzaIcon!: Phaser.GameObjects.Text;
  private timerText!: Phaser.GameObjects.Text;

  private markerTween: Phaser.Tweens.Tween | null = null;
  private greenStart = 0;
  private greenEnd = 0;
  private barLeft = 0;
  private barRight = 0;

  private accepting = false;
  private timeLeftMs = 0;
  private timerEvent: Phaser.Time.TimerEvent | null = null;
  private finished = false;

  constructor() {
    super({ key: 'FireStarter' });
  }

  create(): void {
    const { WIDTH, HEIGHT } = GAME;
    const diff = this.initData.difficulty;

    // Фон — красный
    this.add.rectangle(WIDTH / 2, HEIGHT / 2, WIDTH, HEIGHT, COLORS.red);
    this.drawBackgroundDeco();

    // Заголовок
    const title = new PosterText(this, WIDTH / 2, 90, 'ПЕЧЬ', {
      bgColor: COLORS.yellow,
      textColor: '#0A0A0A',
      fontSize: '36px',
      rotation: -0.025,
      paddingX: 24,
      paddingY: 10,
    });
    title.setDepth(DEPTH.ui);
    this.add.existing(title);

    // Жизни/счёт сверху
    this.livesText = this.add.text(WIDTH / 2, 170, '', {
      ...TEXT_STYLES.subtitle,
      fontSize: '20px',
      color: '#FAF7F0',
    });
    this.livesText.setOrigin(0.5);
    this.livesText.setDepth(DEPTH.ui);

    // Печь — большой прямоугольник с эмодзи
    const ovenY = HEIGHT * 0.34;
    const oven = this.add.rectangle(WIDTH / 2, ovenY, 360, 220, COLORS.greyDark);
    oven.setStrokeStyle(6, COLORS.black);
    oven.setDepth(DEPTH.midground);

    // Внутри печи — оранжевое свечение
    const glow = this.add.rectangle(WIDTH / 2, ovenY, 320, 180, COLORS.yellow);
    glow.setAlpha(0.2);
    glow.setDepth(DEPTH.midground);
    this.tweens.add({
      targets: glow,
      alpha: { from: 0.15, to: 0.35 },
      duration: 600,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });

    // Пицца внутри печи
    this.pizzaIcon = this.add.text(WIDTH / 2, ovenY, '🍕', { fontSize: '128px' });
    this.pizzaIcon.setOrigin(0.5);
    this.pizzaIcon.setDepth(DEPTH.gameplay);

    // ===== Полоса прожарки =====
    const barY = HEIGHT * 0.62;
    this.barLeft = WIDTH / 2 - BAR_WIDTH / 2;
    this.barRight = WIDTH / 2 + BAR_WIDTH / 2;

    // Подпись слева/справа
    this.add.text(this.barLeft - 10, barY, 'СЫРАЯ', {
      ...TEXT_STYLES.label,
      fontSize: '14px',
      color: '#FAF7F0',
    }).setOrigin(1, 0.5).setDepth(DEPTH.ui);
    this.add.text(this.barRight + 10, barY, 'УГОЛЁК', {
      ...TEXT_STYLES.label,
      fontSize: '14px',
      color: '#FAF7F0',
    }).setOrigin(0, 0.5).setDepth(DEPTH.ui);

    // Сама шкала — градиент-ish с 3 зон
    this.bar = this.add.rectangle(WIDTH / 2, barY, BAR_WIDTH, BAR_HEIGHT, COLORS.cream);
    this.bar.setStrokeStyle(4, COLORS.black);
    this.bar.setDepth(DEPTH.gameplay);

    // Зелёная зона — позиция и размер вычисляются перед каждым раундом
    const zoneWidth = this.computeZoneWidth(diff);
    this.greenZone = this.add.rectangle(WIDTH / 2, barY, zoneWidth, BAR_HEIGHT - 8, COLORS.win);
    this.greenZone.setDepth(DEPTH.gameplay + 1);

    // Маркер
    this.marker = this.add.rectangle(this.barLeft, barY, 10, BAR_HEIGHT + 16, COLORS.black);
    this.marker.setDepth(DEPTH.gameplay + 2);

    // Статус снизу
    this.statusText = this.add.text(WIDTH / 2, HEIGHT * 0.74, '', {
      ...TEXT_STYLES.subtitle,
      fontSize: '20px',
      color: '#FFE600',
    });
    this.statusText.setOrigin(0.5);
    this.statusText.setDepth(DEPTH.ui);

    // Таймер
    this.timerText = this.add.text(WIDTH - 30, 30, '', {
      ...TEXT_STYLES.subtitle,
      fontSize: '22px',
      color: '#FAF7F0',
    });
    this.timerText.setOrigin(1, 0);
    this.timerText.setDepth(DEPTH.ui);

    // Тап по экрану — фиксируем результат раунда
    this.input.on('pointerdown', this.handleTap, this);

    // Таймер раунда (общий)
    this.timeLeftMs = this.initData.durationMs;
    this.timerEvent = this.time.addEvent({
      delay: 100,
      loop: true,
      callback: this.onTick,
      callbackScope: this,
    });

    this.cameras.main.fadeIn(250, 10, 10, 10);

    this.updateLivesText();
    this.startRound();
  }

  /** Подсветка для контраста */
  private drawBackgroundDeco(): void {
    const { WIDTH, HEIGHT } = GAME;
    const g = this.add.graphics();
    g.fillStyle(0x000000, 0.06);
    for (let i = 0; i < 600; i++) {
      g.fillCircle(Math.random() * WIDTH, Math.random() * HEIGHT, Math.random() * 1.5);
    }
    g.setDepth(DEPTH.background);
  }

  /** Ширина зелёной зоны 0..1 от ширины шкалы — зависит от сложности */
  private computeZoneWidth(diff: number): number {
    const ratio = Phaser.Math.Linear(0.32, 0.09, diff);
    return BAR_WIDTH * ratio;
  }

  private updateLivesText(): void {
    this.livesText.setText(`Раунд ${Math.min(this.currentRound + 1, ROUNDS_PER_GAME)} / ${ROUNDS_PER_GAME}    🍕 ${this.hits}    💔 ${this.misses}/${MAX_MISSES}`);
  }

  /** Готовим раунд: позиция зелёной зоны и старт маркера */
  private startRound(): void {
    if (this.currentRound >= ROUNDS_PER_GAME) {
      this.finish();
      return;
    }

    const diff = this.initData.difficulty;

    // Случайная позиция зелёной зоны (не у самых краёв)
    const zoneWidth = this.greenZone.width;
    const minX = this.barLeft + zoneWidth / 2 + 30;
    const maxX = this.barRight - zoneWidth / 2 - 30;
    const zoneCenterX = Phaser.Math.Between(minX, maxX);
    this.greenZone.x = zoneCenterX;
    this.greenStart = zoneCenterX - zoneWidth / 2;
    this.greenEnd = zoneCenterX + zoneWidth / 2;

    // Скорость маркера
    const speedMul = Phaser.Math.Linear(1.0, 2.2, diff);
    const sweepDur = 1500 / speedMul; // время прохода слева-направо

    // Сбрасываем маркер
    this.marker.x = this.barLeft;

    // Тwin маркера: туда-сюда бесконечно до тапа
    if (this.markerTween) {
      this.markerTween.remove();
      this.markerTween = null;
    }
    this.markerTween = this.tweens.add({
      targets: this.marker,
      x: this.barRight,
      duration: sweepDur,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });

    this.statusText.setText('ТАПАЙ В ЗЕЛЁНУЮ ЗОНУ');
    this.accepting = true;
  }

  private handleTap(): void {
    if (!this.accepting) return;
    this.accepting = false;

    const x = this.marker.x;
    const inZone = x >= this.greenStart && x <= this.greenEnd;

    // Стопаем маркер
    if (this.markerTween) {
      this.markerTween.pause();
    }

    if (inZone) {
      this.hits += 1;
      SoundManager.playSfx('perfect');
      Haptics.trigger('perfect');
      this.statusText.setText('ИДЕАЛЬНО! 🍕');
      this.flashPizza(COLORS.win);
    } else {
      this.misses += 1;
      SoundManager.playSfx('miss');
      Haptics.trigger('miss');
      const burnt = x > this.greenEnd;
      this.statusText.setText(burnt ? 'СГОРЕЛА 🔥' : 'СЫРАЯ 🥶');
      this.flashPizza(COLORS.lose);
    }

    this.currentRound += 1;
    this.updateLivesText();

    // Если уже больше допустимых промахов — досрочное поражение
    if (this.misses > MAX_MISSES) {
      this.time.delayedCall(700, () => this.finish());
      return;
    }

    // Иначе — следующий раунд через паузу
    this.time.delayedCall(900, () => this.startRound());
  }

  private flashPizza(color: number): void {
    this.pizzaIcon.setTint(color);
    this.tweens.add({
      targets: this.pizzaIcon,
      scale: { from: 1.3, to: 1 },
      duration: 350,
      ease: 'Back.easeOut',
      onComplete: () => this.pizzaIcon.clearTint(),
    });
  }

  private onTick(): void {
    this.timeLeftMs -= 100;
    const sec = Math.max(0, Math.ceil(this.timeLeftMs / 1000));
    this.timerText.setText(`⏱ ${sec}`);
    if (this.timeLeftMs <= 0) {
      this.finish();
    }
  }

  private finish(): void {
    if (this.finished) return;
    this.finished = true;

    this.accepting = false;
    if (this.markerTween) this.markerTween.remove();
    if (this.timerEvent) this.timerEvent.remove();

    const win = this.hits >= WIN_THRESHOLD && this.misses <= MAX_MISSES;
    const score = Math.min(100, Math.round((this.hits / ROUNDS_PER_GAME) * 100));

    if (win) {
      SoundManager.playSfx('win');
      Haptics.trigger('win');
    } else {
      SoundManager.playSfx('lose');
      Haptics.trigger('lose');
    }

    this.statusText.setText(win ? RU.minigame.win : RU.minigame.lose);

    this.time.delayedCall(700, () => {
      this.complete({
        outcome: win ? 'win' : 'lose',
        score,
        metadata: { hits: this.hits, misses: this.misses },
      });
    });
  }

  shutdown(): void {
    this.input.off('pointerdown', this.handleTap, this);
    if (this.markerTween) this.markerTween.remove();
    if (this.timerEvent) this.timerEvent.remove();
  }
}
