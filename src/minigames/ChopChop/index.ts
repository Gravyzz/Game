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
 * NEW-03 Нарезка ингредиентов.
 *
 * На разделочной доске появляется ингредиент с подписью «нарежь на X кусков».
 * Каждый свайп через тело ингредиента = 1 разрез. После каждого свайпа есть
 * пауза 250мс — кнопка «ГОТОВО» автоматически нажимается, если игрок 700мс
 * не делает следующий разрез. Если итог == X → +1 успех. Иначе → штраф.
 *
 * Цель: нарезать REQUIRED_INGREDIENTS успешно за durationMs.
 *
 * Сложность:
 *  - Easy: 4 ингредиента нужно, 2-3 разреза каждый.
 *  - Hard: 7 ингредиентов, 1-6 разрезов.
 */

const INGREDIENT_POOL = [
  { emoji: '🍅', name: 'помидор',   color: COLORS.red    },
  { emoji: '🥒', name: 'огурец',    color: 0x4ade80      },
  { emoji: '🌶️', name: 'перец',     color: 0xff5656      },
  { emoji: '🧅', name: 'лук',       color: 0xfff8d6      },
  { emoji: '🥕', name: 'морковь',   color: 0xff9d3a      },
  { emoji: '🍆', name: 'баклажан',  color: 0x7a5cff      },
  { emoji: '🌽', name: 'кукуруза',  color: COLORS.yellow },
  { emoji: '🥔', name: 'картошка',  color: 0xb89968      },
];

const SWIPE_COMMIT_MS = 800;     // если нет нового свайпа за это время — фиксируем результат
const SWIPE_MIN_LENGTH = 40;     // минимальная длина свайпа, чтобы засчитать
const CUT_COOLDOWN_MS = 120;     // защита от двойного срабатывания

export class ChopChopScene extends BaseMinigame {
  private board!: Phaser.GameObjects.Rectangle;
  private currentIngredient: {
    emoji: string;
    name: string;
    color: number;
    targetCuts: number;
    text: Phaser.GameObjects.Text;
    halves: Phaser.GameObjects.Text[];
    centerX: number;
    centerY: number;
    radius: number;
  } | null = null;

  private cuts = 0;
  private successCount = 0;
  private requiredSuccesses = 4;
  private totalAttempts = 0;
  private maxAttempts = 6;

  private successText!: Phaser.GameObjects.Text;
  private timerText!: Phaser.GameObjects.Text;
  private targetText!: Phaser.GameObjects.Text;
  private cutsText!: Phaser.GameObjects.Text;
  private nameText!: Phaser.GameObjects.Text;

  private timeLeftMs = 0;
  private gameTimer: Phaser.Time.TimerEvent | null = null;
  private commitTimer: Phaser.Time.TimerEvent | null = null;
  private finished = false;

  private swipeStartX = 0;
  private swipeStartY = 0;
  private swiping = false;
  private lastCutAt = 0;

  private trailGfx!: Phaser.GameObjects.Graphics;

  constructor() {
    super({ key: 'ChopChop' });
  }

  create(): void {
    const { WIDTH, HEIGHT } = GAME;
    const diff = this.initData.difficulty;

    this.requiredSuccesses = Math.round(Phaser.Math.Linear(3, 6, diff));
    this.maxAttempts = Math.round(Phaser.Math.Linear(5, 8, diff));

    // Фон — кухонный
    this.add.rectangle(WIDTH / 2, HEIGHT / 2, WIDTH, HEIGHT, 0x2a4d3e);
    this.drawNoise();

    // Заголовок
    const title = new PosterText(this, WIDTH / 2, 80, 'НАРЕЗКА', {
      bgColor: COLORS.yellow, textColor: '#0A0A0A',
      fontSize: '32px', rotation: -0.025, paddingX: 22, paddingY: 10,
    });
    title.setDepth(DEPTH.ui);
    this.add.existing(title);

    // Hint
    const hint = this.add.text(WIDTH / 2, 140, '👆 свайп через ингредиент = разрез. Точно по числу!', {
      ...TEXT_STYLES.label, fontSize: '13px', color: '#FAF7F0',
    });
    hint.setOrigin(0.5);
    hint.setDepth(DEPTH.ui);

    // Доска
    this.board = this.add.rectangle(WIDTH / 2, HEIGHT * 0.55, 540, 540, 0xc88a4a);
    this.board.setStrokeStyle(8, 0x6e3f1d);
    this.board.setDepth(DEPTH.midground);
    // Доска — горизонтальная штриховка
    const boardLines = this.add.graphics();
    boardLines.lineStyle(2, 0x9c6c3a, 0.6);
    for (let i = -250; i < 250; i += 30) {
      boardLines.lineBetween(WIDTH / 2 - 250, HEIGHT * 0.55 + i, WIDTH / 2 + 250, HEIGHT * 0.55 + i);
    }
    boardLines.setDepth(DEPTH.midground + 1);

    // HUD
    this.successText = this.add.text(30, 30, '', {
      ...TEXT_STYLES.subtitle, fontSize: '20px', color: '#FAF7F0',
    });
    this.successText.setDepth(DEPTH.ui);

    this.timerText = this.add.text(WIDTH - 30, 30, '', {
      ...TEXT_STYLES.subtitle, fontSize: '22px', color: '#FAF7F0',
    });
    this.timerText.setOrigin(1, 0);
    this.timerText.setDepth(DEPTH.ui);

    this.targetText = this.add.text(WIDTH / 2, 200, '', {
      ...TEXT_STYLES.subtitle, fontSize: '26px', color: '#FFE600',
    });
    this.targetText.setOrigin(0.5);
    this.targetText.setDepth(DEPTH.ui);

    this.cutsText = this.add.text(WIDTH / 2, HEIGHT * 0.92, '', {
      ...TEXT_STYLES.subtitle, fontSize: '22px', color: '#FAF7F0',
    });
    this.cutsText.setOrigin(0.5);
    this.cutsText.setDepth(DEPTH.ui);

    this.nameText = this.add.text(WIDTH / 2, 240, '', {
      ...TEXT_STYLES.label, fontSize: '14px', color: '#FAF7F0',
    });
    this.nameText.setOrigin(0.5);
    this.nameText.setDepth(DEPTH.ui);

    this.trailGfx = this.add.graphics();
    this.trailGfx.setDepth(DEPTH.effects);

    // Инпут — свайпы
    this.input.on('pointerdown', this.onPointerDown, this);
    this.input.on('pointerup',   this.onPointerUp,   this);

    this.timeLeftMs = this.initData.durationMs;
    this.gameTimer = this.time.addEvent({
      delay: 200,
      loop: true,
      callback: this.onTick,
      callbackScope: this,
    });

    this.updateHud();
    this.spawnIngredient();
    this.cameras.main.fadeIn(250, 10, 10, 10);
  }

  private spawnIngredient(): void {
    if (this.totalAttempts >= this.maxAttempts) {
      this.finish();
      return;
    }

    const diff = this.initData.difficulty;
    const minCuts = 1;
    const maxCuts = Math.round(Phaser.Math.Linear(3, 6, diff));
    const targetCuts = Phaser.Math.Between(minCuts + 1, maxCuts);

    const def = INGREDIENT_POOL[Math.floor(Math.random() * INGREDIENT_POOL.length)];
    const cx = GAME.WIDTH / 2;
    const cy = GAME.HEIGHT * 0.55;

    const text = this.add.text(cx, cy, def.emoji, { fontSize: '200px' });
    text.setOrigin(0.5);
    text.setDepth(DEPTH.gameplay);

    // Появление
    text.setScale(0);
    this.tweens.add({
      targets: text,
      scale: 1,
      duration: 280,
      ease: 'Back.easeOut',
    });

    this.currentIngredient = {
      emoji: def.emoji,
      name: def.name,
      color: def.color,
      targetCuts,
      text,
      halves: [],
      centerX: cx,
      centerY: cy,
      radius: 110,
    };
    this.cuts = 0;
    this.targetText.setText(`нарежь на ${targetCuts} кусков`);
    this.nameText.setText(def.name.toUpperCase());
    this.cutsText.setText(this.cutsLabel());
  }

  private cutsLabel(): string {
    return `разрезов: ${this.cuts}`;
  }

  private onPointerDown(pointer: Phaser.Input.Pointer): void {
    this.swipeStartX = pointer.x;
    this.swipeStartY = pointer.y;
    this.swiping = true;
    this.trailGfx.clear();
  }

  private onPointerUp(pointer: Phaser.Input.Pointer): void {
    if (!this.swiping) return;
    this.swiping = false;
    this.trailGfx.clear();

    const dx = pointer.x - this.swipeStartX;
    const dy = pointer.y - this.swipeStartY;
    const len = Math.sqrt(dx * dx + dy * dy);
    if (len < SWIPE_MIN_LENGTH) return;

    const ing = this.currentIngredient;
    if (!ing) return;

    // Проверяем, проходит ли отрезок через окружность ингредиента
    if (!this.lineIntersectsCircle(this.swipeStartX, this.swipeStartY, pointer.x, pointer.y, ing.centerX, ing.centerY, ing.radius)) {
      return;
    }

    // Защита от двойных срабатываний
    if (this.time.now - this.lastCutAt < CUT_COOLDOWN_MS) return;
    this.lastCutAt = this.time.now;

    this.registerCut();
  }

  private registerCut(): void {
    const ing = this.currentIngredient;
    if (!ing) return;

    this.cuts += 1;
    this.cutsText.setText(this.cutsLabel());
    SoundManager.playSfx('tap');
    Haptics.trigger('tap');

    // Эффект: рисуем «след» среза и трясём ингредиент
    this.tweens.add({
      targets: ing.text,
      scale: 0.92,
      duration: 80,
      yoyo: true,
    });
    const flash = this.add.rectangle(ing.centerX, ing.centerY, ing.radius * 2.4, 6, COLORS.cream);
    flash.setRotation(Math.random() * Math.PI);
    flash.setDepth(DEPTH.effects);
    this.tweens.add({
      targets: flash, alpha: 0, duration: 250,
      onComplete: () => flash.destroy(),
    });

    // Сбрасываем commit-таймер на новое окно ожидания
    if (this.commitTimer) this.commitTimer.remove();
    this.commitTimer = this.time.delayedCall(SWIPE_COMMIT_MS, () => this.commitIngredient());

    // Защита от перерезания: если уже сильно превысил — фиксируем сразу
    if (this.cuts > ing.targetCuts + 2) {
      this.commitIngredient();
    }
  }

  private commitIngredient(): void {
    const ing = this.currentIngredient;
    if (!ing) return;
    this.currentIngredient = null;

    if (this.commitTimer) {
      this.commitTimer.remove();
      this.commitTimer = null;
    }

    const success = this.cuts === ing.targetCuts;
    this.totalAttempts += 1;
    if (success) {
      this.successCount += 1;
      SoundManager.playSfx('perfect');
      Haptics.trigger('perfect');
    } else {
      SoundManager.playSfx('miss');
      Haptics.trigger('miss');
    }

    // Анимация исчезновения / разлёта
    this.tweens.add({
      targets: ing.text,
      scale: success ? 0 : 1.4,
      alpha: 0,
      angle: success ? 0 : 90,
      duration: 350,
      ease: 'Quad.easeIn',
      onComplete: () => ing.text.destroy(),
    });

    // Подсказка под доской
    const fx = this.add.text(
      GAME.WIDTH / 2, GAME.HEIGHT * 0.55,
      success ? `ИДЕАЛЬНО! ${ing.targetCuts}/${ing.targetCuts}` : `ПРОМАХ ${this.cuts}/${ing.targetCuts}`,
      { ...TEXT_STYLES.subtitle, fontSize: '24px', color: success ? '#4ADE80' : '#EF4444' }
    );
    fx.setOrigin(0.5);
    fx.setDepth(DEPTH.modal);
    this.tweens.add({
      targets: fx, y: fx.y - 80, alpha: 0, duration: 800,
      onComplete: () => fx.destroy(),
    });

    this.updateHud();

    if (this.successCount >= this.requiredSuccesses) {
      this.time.delayedCall(500, () => this.finish());
      return;
    }
    if (this.totalAttempts >= this.maxAttempts) {
      this.time.delayedCall(500, () => this.finish());
      return;
    }

    this.time.delayedCall(500, () => this.spawnIngredient());
  }

  private updateHud(): void {
    this.successText.setText(`✅ ${this.successCount}/${this.requiredSuccesses}   попытка ${Math.min(this.totalAttempts + 1, this.maxAttempts)}/${this.maxAttempts}`);
  }

  private onTick(): void {
    this.timeLeftMs -= 200;
    const sec = Math.max(0, Math.ceil(this.timeLeftMs / 1000));
    this.timerText.setText(`⏱ ${sec}`);
    if (this.timeLeftMs <= 0) {
      this.finish();
    }
  }

  private finish(): void {
    if (this.finished) return;
    this.finished = true;

    if (this.gameTimer)   this.gameTimer.remove();
    if (this.commitTimer) this.commitTimer.remove();
    this.swiping = false;

    const win = this.successCount >= this.requiredSuccesses;
    if (win) { SoundManager.playSfx('win'); Haptics.trigger('win'); }
    else     { SoundManager.playSfx('lose'); Haptics.trigger('lose'); }

    const { WIDTH, HEIGHT } = GAME;
    const overlay = this.add.rectangle(WIDTH / 2, HEIGHT / 2, WIDTH, HEIGHT, COLORS.black, 0.6);
    overlay.setDepth(DEPTH.modal);
    const msg = this.add.text(
      WIDTH / 2, HEIGHT / 2,
      win ? RU.minigame.win : RU.minigame.lose,
      { ...TEXT_STYLES.hero, fontSize: '56px', color: win ? '#4ADE80' : '#EF4444' }
    );
    msg.setOrigin(0.5);
    msg.setDepth(DEPTH.modal + 1);

    const score = Math.round((this.successCount / Math.max(1, this.requiredSuccesses)) * 100);
    this.time.delayedCall(900, () => {
      this.complete({
        outcome: win ? 'win' : 'lose',
        score: Math.min(100, score),
        metadata: { successes: this.successCount, attempts: this.totalAttempts },
      });
    });
  }

  shutdown(): void {
    this.input.off('pointerdown', this.onPointerDown, this);
    this.input.off('pointerup',   this.onPointerUp,   this);
    if (this.gameTimer)   this.gameTimer.remove();
    if (this.commitTimer) this.commitTimer.remove();
  }

  /** Геометрия: пересекает ли отрезок (a,b) окружность (cx,cy,r). Покрывает и случай,
   *  когда один или оба конца отрезка находятся внутри окружности. */
  private lineIntersectsCircle(ax: number, ay: number, bx: number, by: number, cx: number, cy: number, r: number): boolean {
    // Один из концов внутри окружности — тогда отрезок гарантированно её затрагивает
    const dax = ax - cx, day = ay - cy;
    const dbx = bx - cx, dby = by - cy;
    if (dax * dax + day * day <= r * r) return true;
    if (dbx * dbx + dby * dby <= r * r) return true;

    const dx = bx - ax;
    const dy = by - ay;
    const fx = ax - cx;
    const fy = ay - cy;
    const a = dx * dx + dy * dy;
    const b = 2 * (fx * dx + fy * dy);
    const c = (fx * fx + fy * fy) - r * r;
    let disc = b * b - 4 * a * c;
    if (disc < 0) return false;
    disc = Math.sqrt(disc);
    const t1 = (-b - disc) / (2 * a);
    const t2 = (-b + disc) / (2 * a);
    return (t1 >= 0 && t1 <= 1) || (t2 >= 0 && t2 <= 1) || (t1 < 0 && t2 > 1);
  }

  private drawNoise(): void {
    const { WIDTH, HEIGHT } = GAME;
    const g = this.add.graphics();
    g.fillStyle(0x000000, 0.06);
    for (let i = 0; i < 500; i++) {
      g.fillCircle(Math.random() * WIDTH, Math.random() * HEIGHT, Math.random() * 1.5);
    }
    g.setDepth(DEPTH.background);
  }
}
