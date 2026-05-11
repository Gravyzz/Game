import Phaser from 'phaser';
import { BaseMinigame } from '@minigames/BaseMinigame';
import { COLORS } from '@config/colors';
import { GAME, DEPTH } from '@config/game';
import { RU } from '@i18n/ru';
import { SoundManager } from '@core/SoundManager';
import { Haptics } from '@core/Haptics';
import { SessionState } from '@core/SessionState';
import { paintPageBackdrop, attachHomeButton } from '@utils/SceneHelpers';

/**
 * MG-03 Фаерстартер: тайминг печи.
 *
 * Геймплей:
 *  - 10 раундов на одной жизни, общий таймер 50 секунд.
 *  - С каждым раундом маркер ускоряется, а зелёная зона сужается.
 *  - С 6-го раунда зона сама начинает ходить по шкале — сначала медленно
 *    с малой амплитудой, к 10-му раунду заметно быстрее и шире.
 *  - Любой промах — поражение, время вышло без 10 попаданий — поражение.
 */

const ROUNDS_PER_GAME = 10;
const WIN_THRESHOLD = 10; // нужно пройти все 10 попаданий
const TOTAL_LIVES = 3;
const TOTAL_TIME_MS = 50_000;

const BAR_WIDTH = 640;
const BAR_HEIGHT = 30;
const FIRESTARTER_BG = 0xf7c06f;

// Прогрессия от 1-го к 10-му раунду
const ZONE_RATIO_START = 0.32;
const ZONE_RATIO_END = 0.14;
const SPEED_START = 1.0;
const SPEED_END = 2.5;
const RESULT_RAIN_MS = 2000;

// С какого раунда (0-индекс) зона начинает двигаться
const MOVING_ZONE_FROM_ROUND = 5;
// Период полного цикла осцилляции зоны (мс)
const ZONE_PERIOD_START = 2600;
const ZONE_PERIOD_END = 1700;

type CookResult = 'raw' | 'ok' | 'coal';

export class FireStarterScene extends BaseMinigame {
  private currentRound = 0;
  private hits = 0;
  private misses = 0;

  private bar!: Phaser.GameObjects.Rectangle;
  private greenZone!: Phaser.GameObjects.Rectangle;
  private marker!: Phaser.GameObjects.Rectangle;
  private statusText!: Phaser.GameObjects.Text;
  private roundText!: Phaser.GameObjects.Text;
  private hearts: Phaser.GameObjects.Image[] = [];
  private livesCountText!: Phaser.GameObjects.Text;
  private ovenImage!: Phaser.GameObjects.Image;
  private smokeImage!: Phaser.GameObjects.Image;
  private pizzaImage!: Phaser.GameObjects.Image;

  private markerTween: Phaser.Tweens.Tween | null = null;
  private ovenFrameEvent: Phaser.Time.TimerEvent | null = null;
  private smokeFrameEvent: Phaser.Time.TimerEvent | null = null;
  private greenStart = 0;
  private greenEnd = 0;
  private barLeft = 0;
  private barRight = 0;

  // Параметры движения зоны на текущем раунде
  private zoneMoving = false;
  private zoneAmplitude = 0;
  private zonePeriodMs = ZONE_PERIOD_START;
  private zonePhase = 0;
  private zoneAnchorX = 0;

  private accepting = false;
  private exitModalOpen = false;
  private timeLeftMs = 0;
  private timerEvent: Phaser.Time.TimerEvent | null = null;
  private finished = false;
  private keyHandler: ((e: KeyboardEvent) => void) | null = null;

  constructor() {
    super({ key: 'FireStarter' });
  }

  create(): void {
    const { WIDTH, HEIGHT } = GAME;

    this.resetRuntimeState();
    this.preparePixelTextures();

    paintPageBackdrop(this, FIRESTARTER_BG);
    this.add.rectangle(WIDTH / 2, HEIGHT / 2, WIDTH, HEIGHT, FIRESTARTER_BG)
      .setStrokeStyle(4, COLORS.black)
      .setDepth(DEPTH.background);

    this.drawHud();
    this.drawDecor();

    this.smokeImage = this.add.image(WIDTH / 2, 300, 'firestarter-smoke-1');
    this.smokeImage.setOrigin(0.5);
    this.smokeImage.setDisplaySize(155, 155);
    this.smokeImage.setDepth(DEPTH.midground + 1);

    this.ovenImage = this.add.image(WIDTH / 2, 600, 'firestarter-oven-1');
    this.ovenImage.setOrigin(0.5);
    this.ovenImage.setDisplaySize(370, 370);
    this.ovenImage.setDepth(DEPTH.midground);

    this.pizzaImage = this.add.image(WIDTH / 2, 620, 'firestarter-pizza-raw');
    this.pizzaImage.setOrigin(0.5);
    this.pizzaImage.setDisplaySize(170, 32);
    this.pizzaImage.setDepth(DEPTH.gameplay);

    this.startSpriteAnimations();

    // ===== Полоса прожарки =====
    const barY = 945;
    this.barLeft = WIDTH / 2 - BAR_WIDTH / 2;
    this.barRight = WIDTH / 2 + BAR_WIDTH / 2;

    // Подпись слева/справа
    this.add.text(this.barLeft, barY - 70, 'сырая', {
      fontFamily: '"Press Start 2P", monospace',
      fontSize: '28px',
      color: '#0A0A0A',
    }).setOrigin(0, 0.5).setDepth(DEPTH.ui);
    this.add.text(this.barRight, barY - 70, 'угольки', {
      fontFamily: '"Press Start 2P", monospace',
      fontSize: '28px',
      color: '#0A0A0A',
    }).setOrigin(1, 0.5).setDepth(DEPTH.ui);

    // Сама шкала
    this.bar = this.add.rectangle(WIDTH / 2, barY, BAR_WIDTH, BAR_HEIGHT, COLORS.cream);
    this.bar.setStrokeStyle(7, COLORS.black);
    this.bar.setDepth(DEPTH.gameplay);

    // Зона создаётся на полную ширину шкалы; реальный размер задаём через displayWidth
    this.greenZone = this.add.rectangle(WIDTH / 2, barY, BAR_WIDTH, BAR_HEIGHT - 10, COLORS.win);
    this.greenZone.displayWidth = BAR_WIDTH * ZONE_RATIO_START;
    this.greenZone.setDepth(DEPTH.gameplay + 1);

    // Маркер
    this.marker = this.add.rectangle(this.barLeft, barY, 18, BAR_HEIGHT + 52, COLORS.black);
    this.marker.setDepth(DEPTH.gameplay + 2);

    // Статус снизу
    const statusPanel = this.add.rectangle(WIDTH / 2, 1085, WIDTH - 90, 210, 0xfaf7f0);
    statusPanel.setStrokeStyle(7, COLORS.black);
    statusPanel.setDepth(DEPTH.ui - 1);

    this.statusText = this.add.text(WIDTH / 2, 1085, '', {
      fontFamily: '"Press Start 2P", monospace',
      fontSize: '28px',
      color: '#0A0A0A',
      align: 'center',
      lineSpacing: 16,
      wordWrap: { width: WIDTH - 120 },
    });
    this.statusText.setOrigin(0.5);
    this.statusText.setDepth(DEPTH.ui);

    // Тап по экрану — фиксируем результат раунда
    this.input.on('pointerdown', this.handleTap, this);

    // SPACE на клавиатуре — то же самое что тап
    this.keyHandler = (e: KeyboardEvent) => {
      if (e.code !== 'Space' && e.key !== ' ') return;
      e.preventDefault();
      this.handleTap();
    };
    window.addEventListener('keydown', this.keyHandler);

    // Общий таймер на всю минку — 50 секунд
    this.timeLeftMs = TOTAL_TIME_MS;
    this.timerEvent = this.time.addEvent({
      delay: 100,
      loop: true,
      callback: this.onTick,
      callbackScope: this,
    });

    this.cameras.main.fadeIn(250, 10, 10, 10);

    this.updateHud();
    this.startRound();
  }

  private resetRuntimeState(): void {
    this.currentRound = 0;
    this.hits = 0;
    this.misses = 0;
    this.hearts = [];
    this.markerTween = null;
    this.ovenFrameEvent = null;
    this.smokeFrameEvent = null;
    this.greenStart = 0;
    this.greenEnd = 0;
    this.barLeft = 0;
    this.barRight = 0;
    this.zoneMoving = false;
    this.zoneAmplitude = 0;
    this.zonePeriodMs = ZONE_PERIOD_START;
    this.zonePhase = 0;
    this.zoneAnchorX = 0;
    this.accepting = false;
    this.exitModalOpen = false;
    this.timeLeftMs = 0;
    this.timerEvent = null;
    this.finished = false;
  }

  override update(_time: number, delta: number): void {
    if (!this.accepting || this.gamePaused) return;

    if (this.zoneMoving) {
      this.zonePhase += delta;
      const t = (this.zonePhase / this.zonePeriodMs) * Math.PI * 2;
      const offset = Math.sin(t) * this.zoneAmplitude;
      const newX = this.zoneAnchorX + offset;
      const halfW = this.greenZone.displayWidth / 2;
      this.greenZone.x = newX;
      this.greenStart = newX - halfW;
      this.greenEnd = newX + halfW;
    }

    this.updatePizzaTexture();
  }

  private preparePixelTextures(): void {
    [
      'heart-pixel',
      'home-pixel',
      'firestarter-oven-1',
      'firestarter-oven-2',
      'firestarter-oven-3',
      'firestarter-smoke-1',
      'firestarter-smoke-2',
      'firestarter-pizza-raw',
      'firestarter-pizza-ok',
      'firestarter-pizza-coal',
      'firestarter-result-coal',
      'firestarter-result-ice',
      'firestarter-result-ok',
      'firestarter-picture',
      'firestarter-plant',
      'firestarter-lamp',
    ].forEach((key) => this.textures.get(key).setFilter(Phaser.Textures.FilterMode.NEAREST));
  }

  private drawDecor(): void {
    const leftLamp = this.add.image(112, 305, 'firestarter-lamp');
    leftLamp.setOrigin(0.5);
    leftLamp.setDisplaySize(120, 120);
    leftLamp.setDepth(DEPTH.midground);

    const rightLamp = this.add.image(GAME.WIDTH - 112, 305, 'firestarter-lamp');
    rightLamp.setOrigin(0.5);
    rightLamp.setDisplaySize(120, 120);
    rightLamp.setDepth(DEPTH.midground);

    const plant = this.add.image(92, 665, 'firestarter-plant');
    plant.setOrigin(0.5);
    plant.setDisplaySize(155, 155);
    plant.setDepth(DEPTH.midground);

    const picture = this.add.image(GAME.WIDTH - 110, 510, 'firestarter-picture');
    picture.setOrigin(0.5);
    picture.setDisplaySize(112, 112);
    picture.setDepth(DEPTH.midground);
  }

  private drawHud(): void {
    attachHomeButton(this);

    this.livesCountText = this.add.text(150, 80, '', {
      fontFamily: '"Press Start 2P", monospace',
      fontSize: '42px',
      color: '#0A0A0A',
    });
    this.livesCountText.setOrigin(0.5);
    this.livesCountText.setDepth(DEPTH.ui);

    for (let i = 0; i < TOTAL_LIVES; i++) {
      const heart = this.add.image(150 + i * 82, 80, 'heart-pixel');
      heart.setOrigin(0.5);
      heart.setDisplaySize(62, 62);
      heart.setDepth(DEPTH.ui);
      this.hearts.push(heart);
    }

    this.roundText = this.add.text(GAME.WIDTH - 36, 58, '', {
      fontFamily: '"Press Start 2P", monospace',
      fontSize: '28px',
      color: '#0A0A0A',
      align: 'center',
      lineSpacing: 8,
    });
    this.roundText.setOrigin(1, 0);
    this.roundText.setDepth(DEPTH.ui);
  }

  private startSpriteAnimations(): void {
    const ovenFrames = ['firestarter-oven-1', 'firestarter-oven-2', 'firestarter-oven-3'];
    const smokeFrames = ['firestarter-smoke-1', 'firestarter-smoke-2'];
    let ovenFrame = 0;
    let smokeFrame = 0;

    this.ovenFrameEvent = this.time.addEvent({
      delay: 1000,
      loop: true,
      callback: () => {
        ovenFrame = (ovenFrame + 1) % ovenFrames.length;
        this.ovenImage.setTexture(ovenFrames[ovenFrame]);
      },
    });

    this.smokeFrameEvent = this.time.addEvent({
      delay: 1000,
      loop: true,
      callback: () => {
        smokeFrame = (smokeFrame + 1) % smokeFrames.length;
        this.smokeImage.setTexture(smokeFrames[smokeFrame]);
      },
    });
  }

  private getRoundProgress(): number {
    return ROUNDS_PER_GAME <= 1 ? 0 : this.currentRound / (ROUNDS_PER_GAME - 1);
  }

  private updateHud(): void {
    const round = Math.min(this.currentRound + 1, ROUNDS_PER_GAME);
    const livesLeft = SessionState.getLivesLeft();
    this.renderGlobalLives(livesLeft);
    this.roundText.setText(`раунд\n${round}/${ROUNDS_PER_GAME}`);
  }

  private renderGlobalLives(livesLeft: number): void {
    if (livesLeft > 3) {
      this.livesCountText.setText(`${livesLeft}`);
      this.livesCountText.setVisible(true);
      this.hearts.forEach((heart, i) => {
        heart.setVisible(true);
        heart.setPosition(214 + i * 32, 80);
        heart.setDepth(DEPTH.ui + i);
      });
      return;
    }

    this.livesCountText.setVisible(false);
    this.hearts.forEach((heart, i) => {
      heart.setVisible(i < livesLeft);
      heart.setPosition(150 + i * 82, 80);
      heart.setDepth(DEPTH.ui);
    });
  }

  /** Готовим раунд: размер и позиция зоны, скорость маркера, осцилляция зоны */
  private startRound(): void {
    if (this.currentRound >= ROUNDS_PER_GAME) {
      this.finish();
      return;
    }

    const p = this.getRoundProgress();

    // Ширина зоны
    const zoneRatio = Phaser.Math.Linear(ZONE_RATIO_START, ZONE_RATIO_END, p);
    const zoneWidth = BAR_WIDTH * zoneRatio;
    this.greenZone.displayWidth = zoneWidth;

    // Якорь зоны (центр) — случайная позиция, не у самых краёв
    const padding = 30;
    const minX = this.barLeft + zoneWidth / 2 + padding;
    const maxX = this.barRight - zoneWidth / 2 - padding;
    this.zoneAnchorX = Phaser.Math.Between(minX, maxX);
    this.greenZone.x = this.zoneAnchorX;
    this.greenStart = this.zoneAnchorX - zoneWidth / 2;
    this.greenEnd = this.zoneAnchorX + zoneWidth / 2;

    // Движение зоны для поздних раундов
    if (this.currentRound >= MOVING_ZONE_FROM_ROUND) {
      const span = ROUNDS_PER_GAME - 1 - MOVING_ZONE_FROM_ROUND;
      const movePhase = span <= 0 ? 1 : (this.currentRound - MOVING_ZONE_FROM_ROUND) / span;
      this.zoneMoving = true;
      this.zonePeriodMs = Phaser.Math.Linear(ZONE_PERIOD_START, ZONE_PERIOD_END, movePhase);

      // Максимально допустимое смещение центра зоны без вылета за полосу
      const maxAmpLeft = this.zoneAnchorX - (this.barLeft + zoneWidth / 2);
      const maxAmpRight = (this.barRight - zoneWidth / 2) - this.zoneAnchorX;
      const maxAmp = Math.max(0, Math.min(maxAmpLeft, maxAmpRight));
      const ampRatio = Phaser.Math.Linear(0.25, 0.5, movePhase);
      this.zoneAmplitude = maxAmp * ampRatio;
      this.zonePhase = 0;
    } else {
      this.zoneMoving = false;
      this.zoneAmplitude = 0;
    }

    // Скорость маркера
    const speedMul = Phaser.Math.Linear(SPEED_START, SPEED_END, p);
    const sweepDur = 1500 / speedMul;

    this.marker.x = this.barLeft;
    this.updatePizzaTexture();

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

    this.statusText.setText('Попади в зеленую\nзону, чтобы\nидеально испечь\nпиццулю');
    this.accepting = true;
  }

  private updatePizzaTexture(): void {
    if (this.marker.x < this.greenStart) {
      this.pizzaImage.setTexture('firestarter-pizza-raw');
    } else if (this.marker.x <= this.greenEnd) {
      this.pizzaImage.setTexture('firestarter-pizza-ok');
    } else {
      this.pizzaImage.setTexture('firestarter-pizza-coal');
    }
  }

  private handleTap(): void {
    if (!this.accepting || this.exitModalOpen) return;
    this.accepting = false;

    const x = this.marker.x;
    const inZone = x >= this.greenStart && x <= this.greenEnd;
    const result: CookResult = inZone ? 'ok' : x > this.greenEnd ? 'coal' : 'raw';

    // Стопаем маркер
    if (this.markerTween) {
      this.markerTween.pause();
    }

    if (inZone) {
      this.hits += 1;
      this.currentRound += 1;
      SoundManager.playSfx('perfect');
      Haptics.trigger('perfect');
      this.statusText.setText('Идеально!');
      this.bumpPizza();
    } else {
      this.misses += 1;
      SoundManager.playSfx('miss');
      Haptics.trigger('miss');
      this.statusText.setText(result === 'coal' ? 'Угольки!' : 'Сырая!');
      this.bumpPizza();
    }

    this.updateHud();
    this.playResultRain(result);

    // Внутри минки одна жизнь: любой промах — конец матча.
    // Сессионную жизнь спишет раннер (lifeAlreadyLost: false в metadata).
    if (this.misses > 0) {
      this.time.delayedCall(RESULT_RAIN_MS, () => this.finish());
      return;
    }

    // Иначе — следующий раунд через паузу
    this.time.delayedCall(RESULT_RAIN_MS, () => this.startRound());
  }

  private playResultRain(result: CookResult): void {
    const { WIDTH, HEIGHT } = GAME;
    const config = {
      raw: { text: 'СЫРАЯ!', asset: 'firestarter-result-ice', color: '#2EC7F0' },
      ok: { text: 'ИДЕАЛЬНО!', asset: 'firestarter-result-ok', color: '#FF2E2E' },
      coal: { text: 'УГОЛЬКИ!', asset: 'firestarter-result-coal', color: '#0A0A0A' },
    }[result];

    const count = result === 'ok' ? 16 : 20;
    for (let i = 0; i < count; i++) {
      this.time.delayedCall(i * 110, () => {
        const item = this.add.image(
          Phaser.Math.Between(35, WIDTH - 35),
          -70,
          config.asset,
        );
        item.setOrigin(0.5);
        const itemSize = Phaser.Math.Between(58, 96);
        item.setDisplaySize(itemSize, itemSize);
        item.setDepth(DEPTH.effects);
        item.setRotation(Phaser.Math.FloatBetween(-0.5, 0.5));

        this.tweens.add({
          targets: item,
          y: HEIGHT + 90,
          x: item.x + Phaser.Math.Between(-90, 90),
          rotation: item.rotation + Phaser.Math.FloatBetween(-Math.PI * 1.4, Math.PI * 1.4),
          duration: Phaser.Math.Between(1300, RESULT_RAIN_MS),
          ease: 'Sine.easeIn',
          onComplete: () => item.destroy(),
        });
      });
    }

    for (let i = 0; i < 6; i++) {
      this.time.delayedCall(Phaser.Math.Between(0, 1400), () => {
        const label = this.add.text(
          Phaser.Math.Between(70, WIDTH - 70),
          -80,
          config.text,
          {
            fontFamily: '"Press Start 2P", monospace',
            fontSize: '36px',
            color: config.color,
            align: 'center',
          },
        );
        label.setOrigin(0.5);
        label.setDepth(DEPTH.effects + 1);
        label.setRotation(Phaser.Math.FloatBetween(-0.28, 0.28));

        this.tweens.add({
          targets: label,
          y: HEIGHT + 100,
          x: label.x + Phaser.Math.Between(-55, 55),
          rotation: label.rotation + Phaser.Math.FloatBetween(-0.45, 0.45),
          duration: Phaser.Math.Between(1400, RESULT_RAIN_MS),
          ease: 'Sine.easeIn',
          onComplete: () => label.destroy(),
        });
      });
    }
  }

  private bumpPizza(): void {
    this.tweens.add({
      targets: this.pizzaImage,
      scale: { from: 1.3, to: 1 },
      duration: 350,
      ease: 'Back.easeOut',
    });
  }

  private onTick(): void {
    this.timeLeftMs -= 100;
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

    // Победа = добил 10 успешных раундов. Сессионные жизни уже списаны промахами;
    // их учёт делается раннером и не должен здесь убивать выигрыш.
    const win = this.hits >= WIN_THRESHOLD;
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
        metadata: { hits: this.hits, misses: this.misses, lifeAlreadyLost: false },
      });
    });
  }

  shutdown(): void {
    this.input.off('pointerdown', this.handleTap, this);
    if (this.keyHandler) {
      window.removeEventListener('keydown', this.keyHandler);
      this.keyHandler = null;
    }
    if (this.markerTween) this.markerTween.remove();
    if (this.timerEvent) this.timerEvent.remove();
    if (this.ovenFrameEvent) this.ovenFrameEvent.remove();
    if (this.smokeFrameEvent) this.smokeFrameEvent.remove();
  }
}
