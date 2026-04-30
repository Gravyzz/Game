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
 * NEW-06 Перепутанные рецепты.
 *
 * Memory/Concentration: открой две карточки. Если у обеих на лицевой стороне
 * один и тот же значок-«пиццарисунок» — пара. Найди все пары до конца таймера.
 *
 *  - Каждая карточка имеет icon (один из небольшого набора) и текстовую плашку.
 *  - 3-6 пар в зависимости от сложности.
 *  - Неверная пара → −2 сек таймера. Верная пара с первой попытки → +3 сек.
 *
 * Сложность:
 *  - Easy: 3 пары (6 карт), таймер ~30c.
 *  - Hard: 6 пар (12 карт), таймер ~30c, иконки похожие.
 */

const PAIR_ICONS = ['🍕', '🌮', '🍔', '🥪', '🌯', '🍱', '🥡', '🍜'];

interface Card {
  pairId: number;
  icon: string;
  container: Phaser.GameObjects.Container;
  back: Phaser.GameObjects.Rectangle;
  front: Phaser.GameObjects.Rectangle;
  iconText: Phaser.GameObjects.Text;
  flipped: boolean;
  matched: boolean;
}

export class RecipeMemoScene extends BaseMinigame {
  private cards: Card[] = [];
  private firstFlipped: Card | null = null;
  private secondFlipped: Card | null = null;
  private busy = false;

  private timerText!: Phaser.GameObjects.Text;
  private timerBar!: Phaser.GameObjects.Rectangle;
  private timerBarBg!: Phaser.GameObjects.Rectangle;
  private statusText!: Phaser.GameObjects.Text;

  private timeLeftMs = 0;
  private totalTimeMs = 0;
  private gameTimer: Phaser.Time.TimerEvent | null = null;

  private matchedPairs = 0;
  private totalPairs = 3;
  private mistakes = 0;

  constructor() {
    super({ key: 'RecipeMemo' });
  }

  create(): void {
    const { WIDTH, HEIGHT } = GAME;
    const diff = this.initData.difficulty;

    this.totalPairs = Math.round(Phaser.Math.Linear(3, 6, diff));
    this.totalTimeMs = this.initData.durationMs;
    this.timeLeftMs = this.totalTimeMs;

    // Фон — пробковая доска
    this.add.rectangle(WIDTH / 2, HEIGHT / 2, WIDTH, HEIGHT, 0x6b4a2e);
    this.drawCorkNoise();

    // Заголовок
    const title = new PosterText(this, WIDTH / 2, 80, 'РЕЦЕПТЫ-МЕМО', {
      bgColor: COLORS.cream, textColor: '#0A0A0A',
      fontSize: '28px', rotation: -0.025, paddingX: 20, paddingY: 10,
    });
    title.setDepth(DEPTH.ui);
    this.add.existing(title);

    const hint = this.add.text(WIDTH / 2, 140, '👆 переверни 2 карточки. Найди все пары!', {
      ...TEXT_STYLES.label, fontSize: '14px', color: '#FAF7F0',
    });
    hint.setOrigin(0.5);
    hint.setDepth(DEPTH.ui);

    // Таймер-бар
    const barW = WIDTH - 80;
    this.timerBarBg = this.add.rectangle(WIDTH / 2, 180, barW, 14, COLORS.greyDark);
    this.timerBarBg.setStrokeStyle(2, COLORS.black);
    this.timerBarBg.setDepth(DEPTH.ui);
    this.timerBar = this.add.rectangle(WIDTH / 2 - barW / 2, 180, barW, 10, COLORS.win);
    this.timerBar.setOrigin(0, 0.5);
    this.timerBar.setDepth(DEPTH.ui + 1);

    this.timerText = this.add.text(WIDTH - 30, 30, '', {
      ...TEXT_STYLES.subtitle, fontSize: '22px', color: '#FAF7F0',
    });
    this.timerText.setOrigin(1, 0);
    this.timerText.setDepth(DEPTH.ui);

    this.statusText = this.add.text(30, 30, '', {
      ...TEXT_STYLES.subtitle, fontSize: '20px', color: '#FAF7F0',
    });
    this.statusText.setDepth(DEPTH.ui);

    // ===== Сетка карточек =====
    const totalCards = this.totalPairs * 2;
    const { cols, rows } = this.gridFor(totalCards);

    const icons = this.shuffle([...PAIR_ICONS]).slice(0, this.totalPairs);
    const deck: { icon: string; pairId: number }[] = [];
    icons.forEach((icon, i) => {
      deck.push({ icon, pairId: i });
      deck.push({ icon, pairId: i });
    });
    const shuffledDeck = this.shuffle(deck);

    const cardW = Math.min(180, (WIDTH - 80 - (cols - 1) * 14) / cols);
    const cardH = Math.min(220, (HEIGHT * 0.65 - (rows - 1) * 14) / rows);
    const gridW = cols * cardW + (cols - 1) * 14;
    const gridH = rows * cardH + (rows - 1) * 14;
    const startX = WIDTH / 2 - gridW / 2 + cardW / 2;
    const startY = HEIGHT / 2 - gridH / 2 + cardH / 2 + 40;

    shuffledDeck.forEach((d, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const x = startX + col * (cardW + 14);
      const y = startY + row * (cardH + 14);
      this.makeCard(d.pairId, d.icon, x, y, cardW, cardH);
    });

    this.timeLeftMs = this.totalTimeMs;
    this.gameTimer = this.time.addEvent({
      delay: 100,
      loop: true,
      callback: this.onTick,
      callbackScope: this,
    });

    this.updateStatus();
    this.cameras.main.fadeIn(250, 10, 10, 10);
  }

  private gridFor(n: number): { cols: number; rows: number } {
    if (n <= 6)  return { cols: 3, rows: 2 };
    if (n <= 8)  return { cols: 4, rows: 2 };
    if (n <= 10) return { cols: 5, rows: 2 };
    return { cols: 4, rows: 3 };
  }

  private makeCard(pairId: number, icon: string, x: number, y: number, w: number, h: number): void {
    const container = this.add.container(x, y);

    // «Рубашка» — лист рецепта
    const back = this.add.rectangle(0, 0, w, h, COLORS.cream);
    back.setStrokeStyle(3, COLORS.black);
    const backLines = this.add.graphics();
    backLines.lineStyle(1.5, 0x9c8a6e, 0.6);
    for (let i = -h / 2 + 16; i < h / 2; i += 18) {
      backLines.lineBetween(-w / 2 + 12, i, w / 2 - 12, i);
    }
    const backLabel = this.add.text(0, h / 2 - 18, 'РЕЦЕПТ', {
      ...TEXT_STYLES.label, fontSize: '12px', color: '#0A0A0A',
    });
    backLabel.setOrigin(0.5);

    // «Лицо» — иконка пиццы
    const front = this.add.rectangle(0, 0, w, h, COLORS.red);
    front.setStrokeStyle(3, COLORS.black);
    front.setVisible(false);
    const iconText = this.add.text(0, 0, icon, { fontSize: `${Math.floor(h * 0.5)}px` });
    iconText.setOrigin(0.5);
    iconText.setVisible(false);

    container.add([back, backLines, backLabel, front, iconText]);
    container.setSize(w, h);
    container.setInteractive({ useHandCursor: true });
    container.setDepth(DEPTH.gameplay);

    const card: Card = {
      pairId, icon, container, back, front, iconText,
      flipped: false, matched: false,
    };

    container.on('pointerdown', () => this.onCardClick(card));

    this.cards.push(card);
  }

  private onCardClick(card: Card): void {
    if (this.busy) return;
    if (card.flipped || card.matched) return;
    if (this.firstFlipped && this.secondFlipped) return;

    this.flipCard(card, true);
    SoundManager.playSfx('tap');
    Haptics.trigger('tap');

    if (!this.firstFlipped) {
      this.firstFlipped = card;
      return;
    }

    this.secondFlipped = card;
    this.busy = true;

    if (this.firstFlipped.pairId === card.pairId) {
      // Совпадение
      this.time.delayedCall(380, () => {
        if (this.firstFlipped) this.firstFlipped.matched = true;
        if (this.secondFlipped) this.secondFlipped.matched = true;
        SoundManager.playSfx('perfect');
        Haptics.trigger('perfect');
        this.matchedPairs += 1;
        // Бонус +3 сек
        this.timeLeftMs = Math.min(this.totalTimeMs + 5000, this.timeLeftMs + 3000);

        // Анимация: оба светятся зелёным
        if (this.firstFlipped) this.flashCard(this.firstFlipped, COLORS.win);
        if (this.secondFlipped) this.flashCard(this.secondFlipped, COLORS.win);

        this.firstFlipped = null;
        this.secondFlipped = null;
        this.busy = false;
        this.updateStatus();
        this.checkWin();
      });
    } else {
      // Несовпадение → переворачиваем обратно через паузу
      this.time.delayedCall(900, () => {
        if (this.firstFlipped) this.flipCard(this.firstFlipped, false);
        if (this.secondFlipped) this.flipCard(this.secondFlipped, false);
        SoundManager.playSfx('miss');
        Haptics.trigger('miss');
        this.mistakes += 1;
        // Штраф −2 сек
        this.timeLeftMs = Math.max(0, this.timeLeftMs - 2000);

        this.firstFlipped = null;
        this.secondFlipped = null;
        this.busy = false;
        this.updateStatus();
      });
    }
  }

  private flipCard(card: Card, toFront: boolean): void {
    card.flipped = toFront;
    // Анимация: scaleX -> 0 -> 1 со сменой видимости
    this.tweens.add({
      targets: card.container,
      scaleX: 0,
      duration: 120,
      onComplete: () => {
        card.back.setVisible(!toFront);
        card.front.setVisible(toFront);
        card.iconText.setVisible(toFront);
        // Стороны рубашки скрываем тоже
        const backLabel = card.container.list[2] as Phaser.GameObjects.Text;
        const backLines = card.container.list[1] as Phaser.GameObjects.Graphics;
        if (backLabel && 'setVisible' in backLabel) backLabel.setVisible(!toFront);
        if (backLines && 'setVisible' in backLines) backLines.setVisible(!toFront);
        this.tweens.add({
          targets: card.container,
          scaleX: 1,
          duration: 120,
        });
      },
    });
  }

  private flashCard(card: Card, color: number): void {
    card.front.setFillStyle(color);
    this.tweens.add({
      targets: card.container,
      scale: 1.08,
      duration: 200,
      yoyo: true,
    });
  }

  private updateStatus(): void {
    this.statusText.setText(`✅ ${this.matchedPairs}/${this.totalPairs}   ❌ ${this.mistakes}`);
  }

  private checkWin(): void {
    if (this.matchedPairs >= this.totalPairs) {
      this.finish(true);
    }
  }

  private onTick(): void {
    this.timeLeftMs -= 100;
    const sec = Math.max(0, Math.ceil(this.timeLeftMs / 1000));
    this.timerText.setText(`⏱ ${sec}`);

    const ratio = Math.max(0, this.timeLeftMs / this.totalTimeMs);
    this.timerBar.width = (GAME.WIDTH - 80) * Math.min(1, ratio);
    if (ratio < 0.25) this.timerBar.setFillStyle(COLORS.lose);
    else if (ratio < 0.5) this.timerBar.setFillStyle(COLORS.yellow);
    else this.timerBar.setFillStyle(COLORS.win);

    if (this.timeLeftMs <= 0) {
      this.finish(this.matchedPairs >= this.totalPairs);
    }
  }

  private finish(win: boolean): void {
    if (this.gameTimer) this.gameTimer.remove();
    this.busy = true;

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

    const score = win
      ? Math.max(40, 100 - this.mistakes * 8)
      : Math.round((this.matchedPairs / this.totalPairs) * 50);
    this.time.delayedCall(900, () => {
      this.complete({
        outcome: win ? 'win' : 'lose',
        score: Math.min(100, score),
        metadata: { matched: this.matchedPairs, mistakes: this.mistakes },
      });
    });
  }

  shutdown(): void {
    if (this.gameTimer) this.gameTimer.remove();
  }

  private shuffle<T>(arr: T[]): T[] {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  private drawCorkNoise(): void {
    const { WIDTH, HEIGHT } = GAME;
    const g = this.add.graphics();
    g.fillStyle(0x000000, 0.05);
    for (let i = 0; i < 800; i++) {
      g.fillCircle(Math.random() * WIDTH, Math.random() * HEIGHT, Math.random() * 1.5);
    }
    g.setDepth(DEPTH.background);
  }
}
