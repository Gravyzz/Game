import Phaser from 'phaser';
import { BaseMinigame } from '@minigames/BaseMinigame';
import { COLORS } from '@config/colors';
import { TEXT_STYLES } from '@config/fonts';
import { GAME, DEPTH } from '@config/game';
import { RU } from '@i18n/ru';
import { PosterText } from '@ui/PosterText';
import { Button } from '@ui/Button';
import { SoundManager } from '@core/SoundManager';
import { Haptics } from '@core/Haptics';
import { attachNoiseBackdrop, paintPageBackdrop, attachHomeButton } from '@utils/SceneHelpers';

/**
 * NEW-05 Тот самый за 5 долларов.
 *
 * Цель: набрать ингредиентов в миксер ровно на $5.00.
 *  - Тап на карточку = добавить порцию (можно повторно).
 *  - «ОТМЕНА» убирает последний.
 *  - «ВЗБИТЬ!» проверяет сумму. Точно 500¢ → WIN. Иначе → LOSE.
 *
 * Сложность:
 *  - Easy: цены кратны 25¢, 5 ингредиентов, нет «запрещённых».
 *  - Hard: дробные цены, 6 ингредиентов, есть запрещённый ☠️ (нельзя добавлять).
 *
 * Считаем в центах, чтобы избежать float-glitches.
 */

interface ShopItem {
  id: number;
  emoji: string;
  name: string;
  priceCents: number;
  forbidden?: boolean;
  card: Phaser.GameObjects.Container;
}

const TARGET_CENTS = 500;

// Простой пресет цен (кратны 25¢)
const EASY_PRESET = [
  { emoji: '🍓', name: 'клубника', cents: 150 },
  { emoji: '🍌', name: 'банан',    cents: 75  },
  { emoji: '🌿', name: 'мята',     cents: 25  },
  { emoji: '🥛', name: 'молоко',   cents: 200 },
  { emoji: '🧊', name: 'лёд',      cents: 50  },
];

// Сложный пресет (дробные)
const HARD_PRESET = [
  { emoji: '🍓', name: 'клубника', cents: 137 },
  { emoji: '🍌', name: 'банан',    cents: 89  },
  { emoji: '🥥', name: 'кокос',    cents: 213 },
  { emoji: '🌿', name: 'мята',     cents: 47  },
  { emoji: '🥛', name: 'молоко',   cents: 161 },
  { emoji: '🍯', name: 'мёд',      cents: 79  },
];

export class FiveDollarScene extends BaseMinigame {
  private items: ShopItem[] = [];
  private picked: ShopItem[] = [];
  private pickedDisplay: Phaser.GameObjects.Text[] = [];

  private sumText!: Phaser.GameObjects.Text;
  private targetText!: Phaser.GameObjects.Text;
  private timerText!: Phaser.GameObjects.Text;
  private mixerCircle!: Phaser.GameObjects.Arc;
  private liquidLevel!: Phaser.GameObjects.Rectangle;

  private timeLeftMs = 0;
  private gameTimer: Phaser.Time.TimerEvent | null = null;

  private blendDone = false;

  constructor() {
    super({ key: 'FiveDollar' });
  }

  create(): void {
    const { WIDTH, HEIGHT } = GAME;
    const diff = this.initData.difficulty;

    // Фон — бар
    paintPageBackdrop(this, 0x2a1f3d);
    this.add.rectangle(WIDTH / 2, HEIGHT / 2, WIDTH, HEIGHT, 0x2a1f3d);
    attachHomeButton(this);
    this.drawNoise();

    // Заголовок
    const title = new PosterText(this, WIDTH / 2, 80, '$5 КОКТЕЙЛЬ', {
      bgColor: COLORS.yellow, textColor: '#0A0A0A',
      fontSize: '34px', rotation: -0.025, paddingX: 22, paddingY: 10,
    });
    title.setDepth(DEPTH.ui);
    this.add.existing(title);

    const hint = this.add.text(WIDTH / 2, 140, 'набери ингредиентов на ровно $5.00', {
      ...TEXT_STYLES.label, fontSize: '14px', color: '#FAF7F0',
    });
    hint.setOrigin(0.5);
    hint.setDepth(DEPTH.ui);

    // Таймер
    this.timerText = this.add.text(WIDTH - 30, 30, '', {
      ...TEXT_STYLES.subtitle, fontSize: '22px', color: '#FAF7F0',
    });
    this.timerText.setOrigin(1, 0);
    this.timerText.setDepth(DEPTH.ui);

    // ===== Миксер по центру =====
    const mixerY = HEIGHT * 0.32;
    const mixerW = 200;
    const mixerH = 240;
    const mixerBody = this.add.rectangle(WIDTH / 2, mixerY, mixerW, mixerH, COLORS.greyDark);
    mixerBody.setStrokeStyle(6, COLORS.cream);
    mixerBody.setDepth(DEPTH.gameplay);

    // Жидкость внутри (растёт по мере добавления)
    this.liquidLevel = this.add.rectangle(WIDTH / 2, mixerY + mixerH / 2 - 6, mixerW - 24, 0, 0xff80c8, 0.8);
    this.liquidLevel.setOrigin(0.5, 1);
    this.liquidLevel.setDepth(DEPTH.gameplay + 1);

    // Сумма по центру миксера
    this.sumText = this.add.text(WIDTH / 2, mixerY, '$0.00', {
      ...TEXT_STYLES.hero, fontSize: '52px', color: '#FFE600',
    });
    this.sumText.setOrigin(0.5);
    this.sumText.setDepth(DEPTH.gameplay + 2);

    this.targetText = this.add.text(WIDTH / 2, mixerY + 70, 'цель: $5.00', {
      ...TEXT_STYLES.subtitle, fontSize: '18px', color: '#FAF7F0',
    });
    this.targetText.setOrigin(0.5);
    this.targetText.setDepth(DEPTH.gameplay + 2);

    // Эмодзи добавленных ингредиентов слева от миксера
    this.mixerCircle = this.add.circle(WIDTH / 2, mixerY - 130, 20, COLORS.cream, 0.0);
    this.mixerCircle.setDepth(DEPTH.gameplay);

    // ===== Карточки ингредиентов =====
    const preset = diff < 0.5 ? EASY_PRESET : HARD_PRESET;
    const cardsPerRow = 3;
    const cardW = 200;
    const cardH = 110;
    const gridStartY = HEIGHT * 0.55;

    preset.forEach((p, i) => {
      const col = i % cardsPerRow;
      const row = Math.floor(i / cardsPerRow);
      const x = WIDTH / 2 + (col - 1) * (cardW + 18);
      const y = gridStartY + row * (cardH + 18);

      const container = this.add.container(x, y);
      const bg = this.add.rectangle(0, 0, cardW, cardH, COLORS.cream);
      bg.setStrokeStyle(3, COLORS.black);
      const emoji = this.add.text(-cardW / 2 + 35, 0, p.emoji, { fontSize: '52px' });
      emoji.setOrigin(0.5);
      const name = this.add.text(20, -22, p.name, {
        ...TEXT_STYLES.label, fontSize: '14px', color: '#0A0A0A',
      });
      name.setOrigin(0, 0.5);
      const price = this.add.text(20, 18, `$${(p.cents / 100).toFixed(2)}`, {
        ...TEXT_STYLES.subtitle, fontSize: '22px', color: '#FF2E2E',
      });
      price.setOrigin(0, 0.5);
      container.add([bg, emoji, name, price]);
      container.setSize(cardW, cardH);
      container.setInteractive({ useHandCursor: true });
      container.setDepth(DEPTH.ui);

      const item: ShopItem = { id: i, emoji: p.emoji, name: p.name, priceCents: p.cents, card: container };

      // На сложном уровне один из ингредиентов помечаем как «запрещённый»
      if (diff >= 0.7 && i === preset.length - 1) {
        item.forbidden = true;
        const skull = this.add.text(cardW / 2 - 18, -cardH / 2 + 18, '☠️', { fontSize: '24px' });
        skull.setOrigin(0.5);
        container.add(skull);
        bg.setFillStyle(0xff8a8a);
      }

      // Запоминаем «настоящий» цвет фона карточки — нужен для flashCard
      container.setData('originalColor', bg.fillColor);

      container.on('pointerdown', () => this.addItem(item));
      this.items.push(item);
    });

    // ===== Кнопки управления =====
    const btnY = HEIGHT - 100;
    const undoBtn = new Button(this, WIDTH / 2 - 160, btnY, 'ОТМЕНА', () => this.undo(), {
      width: 280, height: 80, bgColor: COLORS.greyMid, textColor: '#FAF7F0', fontSize: '22px',
    });
    undoBtn.setDepth(DEPTH.ui);
    this.add.existing(undoBtn);

    const blendBtn = new Button(this, WIDTH / 2 + 160, btnY, 'ВЗБИТЬ!', () => this.blend(), {
      width: 280, height: 80, bgColor: COLORS.win, textColor: '#0A0A0A', fontSize: '24px',
    });
    blendBtn.setDepth(DEPTH.ui);
    this.add.existing(blendBtn);

    // Таймер
    this.timeLeftMs = this.initData.durationMs;
    this.gameTimer = this.time.addEvent({
      delay: 200,
      loop: true,
      callback: this.onTick,
      callbackScope: this,
    });

    this.cameras.main.fadeIn(250, 10, 10, 10);
    this.updateSum();
  }

  private addItem(item: ShopItem): void {
    if (this.blendDone) return;

    if (item.forbidden) {
      // Запрещённый — мгновенный проигрыш
      SoundManager.playSfx('miss');
      Haptics.trigger('miss');
      this.cameras.main.shake(220, 0.018);
      this.flashCard(item.card, COLORS.lose);
      this.time.delayedCall(500, () => this.finalize(false, 'добавлен ☠️'));
      return;
    }

    SoundManager.playSfx('tap');
    Haptics.trigger('tap');

    this.picked.push(item);

    // Эмодзи летит в миксер
    const startX = item.card.x;
    const startY = item.card.y;
    const flyer = this.add.text(startX, startY, item.emoji, { fontSize: '40px' });
    flyer.setOrigin(0.5);
    flyer.setDepth(DEPTH.modal);
    this.tweens.add({
      targets: flyer,
      x: GAME.WIDTH / 2,
      y: GAME.HEIGHT * 0.32,
      scale: 0.6,
      duration: 320,
      ease: 'Quad.easeIn',
      onComplete: () => {
        flyer.destroy();
        // Маленькая иконка «состава» под миксером
        const icon = this.add.text(
          GAME.WIDTH / 2 - 110 + (this.pickedDisplay.length * 22),
          GAME.HEIGHT * 0.32 + 130,
          item.emoji,
          { fontSize: '24px' }
        );
        icon.setOrigin(0.5);
        icon.setDepth(DEPTH.gameplay + 2);
        this.pickedDisplay.push(icon);
      },
    });

    this.flashCard(item.card, COLORS.yellow);
    this.updateSum();
  }

  private undo(): void {
    if (this.blendDone) return;
    if (this.picked.length === 0) return;
    SoundManager.playSfx('tap');
    Haptics.trigger('tap');
    this.picked.pop();
    const last = this.pickedDisplay.pop();
    if (last) last.destroy();
    this.updateSum();
  }

  private flashCard(card: Phaser.GameObjects.Container, color: number): void {
    // Берём «оригинальный» цвет из data, который мы запоминаем при создании
    // (иначе быстрые повторные тапы запомнят временный flash-цвет навсегда).
    const bg = card.getAt(0) as Phaser.GameObjects.Rectangle;
    const original = card.getData('originalColor') as number | undefined;
    bg.setFillStyle(color);
    this.time.delayedCall(180, () => {
      if (original !== undefined) bg.setFillStyle(original);
    });
    this.tweens.add({
      targets: card,
      scale: 0.96,
      duration: 80,
      yoyo: true,
    });
  }

  private updateSum(): void {
    const sum = this.picked.reduce((acc, p) => acc + p.priceCents, 0);
    this.sumText.setText(`$${(sum / 100).toFixed(2)}`);

    // Цвет суммы: красный если перебор, жёлтый по умолчанию, зелёный если ровно 500
    if (sum === TARGET_CENTS) this.sumText.setColor('#4ADE80');
    else if (sum > TARGET_CENTS) this.sumText.setColor('#EF4444');
    else this.sumText.setColor('#FFE600');

    // Высота жидкости
    const ratio = Math.min(1, sum / TARGET_CENTS);
    const maxH = 220;
    this.liquidLevel.height = maxH * ratio;
  }

  private blend(): void {
    if (this.blendDone) return;
    const sum = this.picked.reduce((acc, p) => acc + p.priceCents, 0);
    const win = sum === TARGET_CENTS;
    this.finalize(win, win ? 'идеально!' : `сумма: $${(sum / 100).toFixed(2)}`);
  }

  private finalize(win: boolean, msg: string): void {
    if (this.blendDone) return;
    this.blendDone = true;

    if (this.gameTimer) this.gameTimer.remove();

    if (win) {
      SoundManager.playSfx('win');
      Haptics.trigger('win');
      this.tweens.add({
        targets: this.liquidLevel,
        scaleY: 1.05,
        duration: 200,
        yoyo: true,
        repeat: 3,
      });
    } else {
      SoundManager.playSfx('lose');
      Haptics.trigger('lose');
      this.cameras.main.shake(250, 0.015);
    }

    const { WIDTH, HEIGHT } = GAME;
    const overlay = this.add.rectangle(WIDTH / 2, HEIGHT / 2, WIDTH, HEIGHT, COLORS.black, 0.6);
    overlay.setDepth(DEPTH.modal);
    const big = this.add.text(
      WIDTH / 2, HEIGHT / 2 - 30,
      win ? RU.minigame.win : RU.minigame.lose,
      { ...TEXT_STYLES.hero, fontSize: '56px', color: win ? '#4ADE80' : '#EF4444' }
    );
    big.setOrigin(0.5);
    big.setDepth(DEPTH.modal + 1);
    const small = this.add.text(
      WIDTH / 2, HEIGHT / 2 + 40,
      msg,
      { ...TEXT_STYLES.subtitle, fontSize: '22px', color: '#FAF7F0' }
    );
    small.setOrigin(0.5);
    small.setDepth(DEPTH.modal + 1);

    const score = win ? Math.max(50, 100 - Math.max(0, this.picked.length - 3) * 5) : 0;
    this.time.delayedCall(900, () => {
      this.complete({
        outcome: win ? 'win' : 'lose',
        score: Math.min(100, score),
        metadata: { picked: this.picked.length, sumCents: this.picked.reduce((a, p) => a + p.priceCents, 0) },
      });
    });
  }

  private onTick(): void {
    this.timeLeftMs -= 200;
    const sec = Math.max(0, Math.ceil(this.timeLeftMs / 1000));
    this.timerText.setText(`⏱ ${sec}`);
    if (this.timeLeftMs <= 0 && !this.blendDone) {
      this.finalize(false, 'время вышло');
    }
  }

  shutdown(): void {
    if (this.gameTimer) this.gameTimer.remove();
  }

  private drawNoise(): void {
    attachNoiseBackdrop(this, 'noise-fivedollar', 400, 0.04, 0xffffff);
  }
}
