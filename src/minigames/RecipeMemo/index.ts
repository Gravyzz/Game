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
 * Memory из 3 раундов:
 *  - Раунд 1: 8 карт (4 пары), 35 сек.
 *  - Раунд 2: 12 карт (6 пар),  50 сек.
 *  - Раунд 3: 16 карт (8 пар),  65 сек.
 *
 * В начале каждого раунда все карты открываются на 2.5 / 3 / 3.5 сек, чтобы игрок
 * успел запомнить (и просто понял, во что играет).
 *
 * Совпавшая пара: +3 сек.
 * Промах: каждый неверный ход = −10 сек, начиная с первого.
 *
 * Кнопка «ПОДСМОТРЕТЬ» — открывает все ещё не найденные карты на 0.9 сек.
 * Первый подсмотр — бесплатно. Каждый следующий — −20 сек таймера.
 *
 * Победа: пройти все 3 раунда. Поражение: таймер дошёл до нуля в любом раунде.
 */

const PAIR_ICONS = ['🍕', '🌮', '🍔', '🥪', '🌯', '🍱', '🥡', '🍜', '🥗', '🍝'];

interface RoundCfg {
  pairs: number;
  cols: number;
  rows: number;
  durationMs: number;
  previewMs: number;
}

const ROUND_CONFIGS: RoundCfg[] = [
  { pairs: 4, cols: 4, rows: 2, durationMs: 35_000, previewMs: 600 },
  { pairs: 6, cols: 4, rows: 3, durationMs: 50_000, previewMs: 900 },
  { pairs: 8, cols: 4, rows: 4, durationMs: 65_000, previewMs: 1300 },
];

const TOTAL_ROUNDS = ROUND_CONFIGS.length;
const PEEK_DURATION_MS = 900;
const PEEK_PENALTY_MS = 20_000; // штраф за каждый подсмотр после первого
const MISTAKE_PENALTY_MS = 10_000;
const MATCH_BONUS_MS = 3_000;
const FLIP_BACK_MS = 1000;

interface Card {
  pairId: number;
  icon: string;
  container: Phaser.GameObjects.Container;
  back: Phaser.GameObjects.Rectangle;
  backLines: Phaser.GameObjects.Graphics;
  backLabel: Phaser.GameObjects.Text;
  front: Phaser.GameObjects.Rectangle;
  iconText: Phaser.GameObjects.Text;
  flipped: boolean;
  matched: boolean;
}

export class RecipeMemoScene extends BaseMinigame {
  // Состояние раунда
  private roundIndex = 0;
  private currentCfg!: RoundCfg;
  private cards: Card[] = [];
  private firstFlipped: Card | null = null;
  private secondFlipped: Card | null = null;
  private busy = false;

  // Состояние матча
  private peeksUsed = 0;
  private mistakesThisRound = 0;
  private matchedPairs = 0;
  private totalMistakes = 0;

  // Таймер
  private timeLeftMs = 0;
  private gameTimer: Phaser.Time.TimerEvent | null = null;
  private peekTimer: Phaser.Time.TimerEvent | null = null;

  // UI
  private timerText!: Phaser.GameObjects.Text;
  private timerBar!: Phaser.GameObjects.Rectangle;
  private timerBarBg!: Phaser.GameObjects.Rectangle;
  private statusText!: Phaser.GameObjects.Text;
  private mistakesText!: Phaser.GameObjects.Text;
  private peekBtn!: Phaser.GameObjects.Rectangle;
  private peekLabel!: Phaser.GameObjects.Text;
  private bannerOverlay: Phaser.GameObjects.Rectangle | null = null;
  private bannerText: Phaser.GameObjects.Text | null = null;

  private finished = false;

  constructor() {
    super({ key: 'RecipeMemo' });
  }

  create(): void {
    const { WIDTH, HEIGHT } = GAME;

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

    const hint = this.add.text(WIDTH / 2, 130, '👆 переверни 2 одинаковые карточки', {
      ...TEXT_STYLES.label, fontSize: '14px', color: '#FAF7F0',
    });
    hint.setOrigin(0.5);
    hint.setDepth(DEPTH.ui);

    // Таймер-бар
    const barW = WIDTH - 80;
    this.timerBarBg = this.add.rectangle(WIDTH / 2, 170, barW, 14, COLORS.greyDark);
    this.timerBarBg.setStrokeStyle(2, COLORS.black);
    this.timerBarBg.setDepth(DEPTH.ui);
    this.timerBar = this.add.rectangle(WIDTH / 2 - barW / 2, 170, barW, 10, COLORS.win);
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

    this.mistakesText = this.add.text(WIDTH / 2, 200, '', {
      ...TEXT_STYLES.label, fontSize: '14px', color: '#FAF7F0',
    });
    this.mistakesText.setOrigin(0.5);
    this.mistakesText.setDepth(DEPTH.ui);

    // Кнопка «ПОДСМОТРЕТЬ»
    this.peekBtn = this.add.rectangle(WIDTH / 2, HEIGHT - 90, WIDTH - 100, 80, COLORS.yellow);
    this.peekBtn.setStrokeStyle(6, COLORS.black);
    this.peekBtn.setDepth(DEPTH.ui);
    this.peekBtn.setInteractive({ useHandCursor: true });
    this.peekBtn.on('pointerdown', () => this.onPeek());

    this.peekLabel = this.add.text(WIDTH / 2, HEIGHT - 90, '', {
      ...TEXT_STYLES.button, fontSize: '24px', color: '#0A0A0A',
    });
    this.peekLabel.setOrigin(0.5);
    this.peekLabel.setDepth(DEPTH.ui + 1);

    this.cameras.main.fadeIn(250, 10, 10, 10);
    this.startRound();
  }

  // ========== РАУНД ==========

  private startRound(): void {
    if (this.finished) return;
    if (this.roundIndex >= TOTAL_ROUNDS) {
      this.finish(true);
      return;
    }

    // Чистим предыдущие карты
    this.cards.forEach((c) => c.container.destroy());
    this.cards = [];
    this.firstFlipped = null;
    this.secondFlipped = null;

    this.currentCfg = ROUND_CONFIGS[this.roundIndex];
    this.matchedPairs = 0;
    this.mistakesThisRound = 0;
    this.timeLeftMs = this.currentCfg.durationMs;

    this.buildGrid(this.currentCfg);
    this.updateHud();

    // Превью: баннер на закрытых картах → открыть → подержать previewMs → закрыть → старт
    this.busy = true;
    this.cards.forEach((c) => this.setCardFace(c, false));
    this.showBanner(`РАУНД ${this.roundIndex + 1} / ${TOTAL_ROUNDS}`, 900, () => {
      if (this.finished) return;
      this.cards.forEach((c) => {
        if (!c.matched) this.setCardFace(c, true);
      });
      this.time.delayedCall(this.currentCfg.previewMs, () => {
        if (this.finished) return;
        this.cards.forEach((c) => {
          if (!c.matched) this.flipCard(c, false);
        });
        this.time.delayedCall(280, () => {
          if (this.finished) return;
          this.busy = false;
          this.startTimer();
        });
      });
    });
  }

  private buildGrid(cfg: RoundCfg): void {
    const { WIDTH, HEIGHT } = GAME;
    const total = cfg.pairs * 2;

    const icons = this.shuffle([...PAIR_ICONS]).slice(0, cfg.pairs);
    const deck: { icon: string; pairId: number }[] = [];
    icons.forEach((icon, i) => {
      deck.push({ icon, pairId: i });
      deck.push({ icon, pairId: i });
    });
    const shuffledDeck = this.shuffle(deck);

    // Доступная зона: между HUD сверху и кнопкой «подсмотреть» снизу
    const gridTop = 240;
    const gridBottom = HEIGHT - 160;
    const gridArea = gridBottom - gridTop;

    const gap = 14;
    const sideMargin = 40;
    const maxCardW = 180;
    const maxCardH = 240;
    const cardW = Math.min(maxCardW, (WIDTH - sideMargin * 2 - (cfg.cols - 1) * gap) / cfg.cols);
    const cardH = Math.min(maxCardH, (gridArea - (cfg.rows - 1) * gap) / cfg.rows);

    const gridW = cfg.cols * cardW + (cfg.cols - 1) * gap;
    const gridH = cfg.rows * cardH + (cfg.rows - 1) * gap;
    const startX = WIDTH / 2 - gridW / 2 + cardW / 2;
    const startY = gridTop + (gridArea - gridH) / 2 + cardH / 2;

    shuffledDeck.slice(0, total).forEach((d, i) => {
      const col = i % cfg.cols;
      const row = Math.floor(i / cfg.cols);
      const x = startX + col * (cardW + gap);
      const y = startY + row * (cardH + gap);
      this.makeCard(d.pairId, d.icon, x, y, cardW, cardH);
    });
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

    // «Лицо» — иконка
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
      pairId, icon, container, back, backLines, backLabel, front, iconText,
      flipped: false, matched: false,
    };

    container.on('pointerdown', () => this.onCardClick(card));
    this.cards.push(card);
  }

  private startTimer(): void {
    if (this.gameTimer) this.gameTimer.remove();
    this.gameTimer = this.time.addEvent({
      delay: 100,
      loop: true,
      callback: this.onTick,
      callbackScope: this,
    });
  }

  private onTick(): void {
    if (this.finished || this.busy && this.peeksOpen()) {
      // время не идёт во время превью раунда (busy без peek)
    }
    if (this.finished) return;
    this.timeLeftMs -= 100;
    const sec = Math.max(0, Math.ceil(this.timeLeftMs / 1000));
    this.timerText.setText(`⏱ ${sec}`);

    const ratio = Math.max(0, this.timeLeftMs / this.currentCfg.durationMs);
    this.timerBar.width = (GAME.WIDTH - 80) * Math.min(1, ratio);
    if (ratio < 0.25) this.timerBar.setFillStyle(COLORS.lose);
    else if (ratio < 0.5) this.timerBar.setFillStyle(COLORS.yellow);
    else this.timerBar.setFillStyle(COLORS.win);

    if (this.timeLeftMs <= 0) {
      this.finish(false);
    }
  }

  /** Помощник: сейчас открыт ли «подсмотр». Сейчас не используется напрямую,
   *  но оставлено как точка расширения. */
  private peeksOpen(): boolean {
    return this.peekTimer !== null;
  }

  // ========== ОТКРЫТИЕ КАРТ ==========

  private onCardClick(card: Card): void {
    if (this.finished) return;
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
      this.time.delayedCall(380, () => this.handleMatch());
    } else {
      // Несовпадение
      this.time.delayedCall(FLIP_BACK_MS, () => this.handleMismatch());
    }
  }

  private handleMatch(): void {
    if (this.finished) return;
    if (this.firstFlipped) this.firstFlipped.matched = true;
    if (this.secondFlipped) this.secondFlipped.matched = true;
    SoundManager.playSfx('perfect');
    Haptics.trigger('perfect');
    this.matchedPairs += 1;
    this.timeLeftMs = Math.min(this.currentCfg.durationMs + 8_000, this.timeLeftMs + MATCH_BONUS_MS);

    if (this.firstFlipped) this.flashCard(this.firstFlipped, COLORS.win);
    if (this.secondFlipped) this.flashCard(this.secondFlipped, COLORS.win);

    this.firstFlipped = null;
    this.secondFlipped = null;
    this.busy = false;
    this.updateHud();
    this.checkRoundComplete();
  }

  private handleMismatch(): void {
    if (this.finished) return;
    if (this.firstFlipped) this.flipCard(this.firstFlipped, false);
    if (this.secondFlipped) this.flipCard(this.secondFlipped, false);
    SoundManager.playSfx('miss');
    Haptics.trigger('miss');
    this.mistakesThisRound += 1;
    this.totalMistakes += 1;

    // Штраф −10 сек за каждый неверный ход, с самого первого
    this.timeLeftMs = Math.max(0, this.timeLeftMs - MISTAKE_PENALTY_MS);
    this.spawnPenaltyToast(`−${MISTAKE_PENALTY_MS / 1000} СЕК`);

    this.firstFlipped = null;
    this.secondFlipped = null;
    this.busy = false;
    this.updateHud();

    if (this.timeLeftMs <= 0) {
      this.finish(false);
    }
  }

  /** Анимация переворота. Если toFront=true, открываем «лицо» иконкой; иначе скрываем. */
  private flipCard(card: Card, toFront: boolean): void {
    card.flipped = toFront;
    this.tweens.add({
      targets: card.container,
      scaleX: 0,
      duration: 120,
      onComplete: () => {
        this.setCardFace(card, toFront);
        this.tweens.add({
          targets: card.container,
          scaleX: 1,
          duration: 120,
        });
      },
    });
  }

  /** Без анимации показывает либо рубашку, либо лицо. Используется для превью раунда. */
  private setCardFace(card: Card, toFront: boolean): void {
    card.flipped = toFront;
    card.back.setVisible(!toFront);
    card.backLines.setVisible(!toFront);
    card.backLabel.setVisible(!toFront);
    card.front.setVisible(toFront);
    card.iconText.setVisible(toFront);
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

  private checkRoundComplete(): void {
    if (this.matchedPairs >= this.currentCfg.pairs) {
      this.busy = true;
      this.showBanner(`РАУНД ${this.roundIndex + 1} ✓`, 900, () => {
        if (this.gameTimer) this.gameTimer.remove();
        this.roundIndex += 1;
        this.startRound();
      });
    }
  }

  // ========== ПОДСМОТРЕТЬ ==========

  private onPeek(): void {
    if (this.finished) return;
    if (this.busy) return;
    if (this.peekTimer) return; // уже идёт показ

    // Первый подсмотр — бесплатный, остальные снимают по 20 сек
    const willCharge = this.peeksUsed >= 1;
    if (willCharge) {
      this.timeLeftMs = Math.max(0, this.timeLeftMs - PEEK_PENALTY_MS);
      this.spawnPenaltyToast(`−${PEEK_PENALTY_MS / 1000} СЕК`);
      if (this.timeLeftMs <= 0) {
        this.finish(false);
        return;
      }
    }
    this.peeksUsed += 1;
    this.busy = true;
    SoundManager.playSfx(willCharge ? 'miss' : 'tap');
    Haptics.trigger(willCharge ? 'miss' : 'tap');

    // Если у игрока что-то открыто, гасим выбор без штрафа
    this.firstFlipped = null;
    this.secondFlipped = null;

    this.cards.forEach((c) => {
      if (!c.matched && !c.flipped) {
        this.flipCard(c, true);
      }
    });

    this.peekTimer = this.time.delayedCall(PEEK_DURATION_MS, () => {
      this.cards.forEach((c) => {
        if (!c.matched && c.flipped) {
          this.flipCard(c, false);
        }
      });
      this.time.delayedCall(280, () => {
        this.busy = false;
        this.peekTimer = null;
      });
    });

    this.updateHud();
  }

  // ========== UI ==========

  private updateHud(): void {
    this.statusText.setText(`✓ ${this.matchedPairs}/${this.currentCfg.pairs}`);

    // Каждый промах — минус 10 сек, с самого первого
    this.mistakesText.setText(`✗ ${this.mistakesThisRound} промахов  •  −10 сек/ход`);
    this.mistakesText.setColor(this.mistakesThisRound > 0 ? '#FF8A8A' : '#FAF7F0');

    if (this.peeksUsed === 0) {
      this.peekLabel.setText('🔍 ПОДСМОТРЕТЬ  •  БЕСПЛАТНО');
      this.peekBtn.setFillStyle(COLORS.yellow);
      this.peekLabel.setColor('#0A0A0A');
    } else {
      this.peekLabel.setText(`🔍 ПОДСМОТРЕТЬ  •  −${PEEK_PENALTY_MS / 1000} СЕК`);
      this.peekBtn.setFillStyle(0xff8a3a);
      this.peekLabel.setColor('#0A0A0A');
    }
  }

  private spawnPenaltyToast(label: string): void {
    const { WIDTH, HEIGHT } = GAME;
    const toast = this.add.text(WIDTH / 2, HEIGHT / 2, label, {
      ...TEXT_STYLES.hero, fontSize: '64px', color: '#EF4444',
    });
    toast.setOrigin(0.5);
    toast.setDepth(DEPTH.modal + 2);
    this.cameras.main.shake(180, 0.012);
    this.tweens.add({
      targets: toast, y: HEIGHT / 2 - 80, alpha: 0, duration: 700,
      onComplete: () => toast.destroy(),
    });
  }

  private showBanner(text: string, duration: number, onDone: () => void): void {
    const { WIDTH, HEIGHT } = GAME;
    if (this.bannerOverlay) this.bannerOverlay.destroy();
    if (this.bannerText) this.bannerText.destroy();

    this.bannerOverlay = this.add.rectangle(WIDTH / 2, HEIGHT / 2, WIDTH, 200, COLORS.black, 0.55);
    this.bannerOverlay.setDepth(DEPTH.modal);
    this.bannerText = this.add.text(WIDTH / 2, HEIGHT / 2, text, {
      ...TEXT_STYLES.hero, fontSize: '52px', color: '#FFE600',
    });
    this.bannerText.setOrigin(0.5);
    this.bannerText.setDepth(DEPTH.modal + 1);
    this.bannerText.setScale(0.7);
    this.tweens.add({
      targets: this.bannerText, scale: 1, duration: 250, ease: 'Back.easeOut',
    });

    this.time.delayedCall(duration, () => {
      this.tweens.add({
        targets: [this.bannerOverlay, this.bannerText], alpha: 0, duration: 220,
        onComplete: () => {
          if (this.bannerOverlay) { this.bannerOverlay.destroy(); this.bannerOverlay = null; }
          if (this.bannerText) { this.bannerText.destroy(); this.bannerText = null; }
          onDone();
        },
      });
    });
  }

  // ========== ФИНАЛ ==========

  private finish(win: boolean): void {
    if (this.finished) return;
    this.finished = true;

    if (this.gameTimer) this.gameTimer.remove();
    if (this.peekTimer) this.peekTimer.remove();
    this.busy = true;

    if (win) { SoundManager.playSfx('win'); Haptics.trigger('win'); }
    else     { SoundManager.playSfx('lose'); Haptics.trigger('lose'); }

    const { WIDTH, HEIGHT } = GAME;
    const overlay = this.add.rectangle(WIDTH / 2, HEIGHT / 2, WIDTH, HEIGHT, COLORS.black, 0.65);
    overlay.setDepth(DEPTH.modal);
    const msg = this.add.text(
      WIDTH / 2, HEIGHT / 2,
      win ? RU.minigame.win : RU.minigame.lose,
      { ...TEXT_STYLES.hero, fontSize: '56px', color: win ? '#4ADE80' : '#EF4444' },
    );
    msg.setOrigin(0.5);
    msg.setDepth(DEPTH.modal + 1);

    // Скор: победа — за минусом ошибок, поражение — пропорционально пройденным раундам
    const score = win
      ? Math.max(40, 100 - this.totalMistakes * 6)
      : Math.round((this.roundIndex / TOTAL_ROUNDS) * 50 + (this.matchedPairs / Math.max(1, this.currentCfg.pairs)) * 10);
    this.time.delayedCall(900, () => {
      this.complete({
        outcome: win ? 'win' : 'lose',
        score: Math.min(100, score),
        metadata: { round: this.roundIndex + 1, mistakes: this.totalMistakes, peeksUsed: this.peeksUsed },
      });
    });
  }

  shutdown(): void {
    if (this.gameTimer) this.gameTimer.remove();
    if (this.peekTimer) this.peekTimer.remove();
  }

  // ========== УТИЛИТЫ ==========

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
