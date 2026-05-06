import Phaser from 'phaser';
import { BaseMinigame } from '@minigames/BaseMinigame';
import { COLORS } from '@config/colors';
import { TEXT_STYLES } from '@config/fonts';
import { GAME, DEPTH } from '@config/game';
import { RU } from '@i18n/ru';
import { SoundManager } from '@core/SoundManager';
import { Haptics } from '@core/Haptics';
import { SessionState } from '@core/SessionState';
import { paintPageBackdrop } from '@utils/SceneHelpers';

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

const PAIR_ICONS = [
  'recipe-5s',
  'recipe-cola',
  'recipe-cookie',
  'recipe-frenchfries',
  'recipe-pasta',
  'recipe-pepperoni',
  'recipe-roll',
  'recipe-runaway',
];
const RECIPE_BG = 0xefd2a7;
const BOARD_GREEN = 0x2a5520;
const BOTTOM_PANEL = 0x3a342b;

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
const ROUND_WIN_CELEBRATION_MS = 3000;

interface Card {
  pairId: number;
  icon: string;
  container: Phaser.GameObjects.Container;
  back: Phaser.GameObjects.Image;
  front: Phaser.GameObjects.Image;
  iconImage: Phaser.GameObjects.Image;
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
  private sandWatch!: Phaser.GameObjects.Image;
  private timerBar!: Phaser.GameObjects.Rectangle;
  private timerBarBg!: Phaser.GameObjects.Rectangle;
  private timerBarMaxWidth = 0;
  private statusText!: Phaser.GameObjects.Text;
  private mistakesText!: Phaser.GameObjects.Text;
  private peekBtn!: Phaser.GameObjects.Rectangle;
  private peekLabel!: Phaser.GameObjects.Text;
  private peekIcon!: Phaser.GameObjects.Image;
  private hearts: Phaser.GameObjects.Image[] = [];
  private livesCountText!: Phaser.GameObjects.Text;
  private board: Phaser.GameObjects.Rectangle | null = null;
  private bannerOverlay: Phaser.GameObjects.Rectangle | null = null;
  private bannerText: Phaser.GameObjects.Text | null = null;

  private finished = false;

  constructor() {
    super({ key: 'RecipeMemo' });
  }

  create(): void {
    const { WIDTH, HEIGHT } = GAME;

    this.resetRuntimeState();
    this.preparePixelTextures();

    paintPageBackdrop(this, RECIPE_BG);
    this.add.rectangle(WIDTH / 2, HEIGHT / 2, WIDTH, HEIGHT, RECIPE_BG)
      .setStrokeStyle(4, COLORS.black)
      .setDepth(DEPTH.background);
    this.add.rectangle(WIDTH / 2, HEIGHT - 135, WIDTH, 270, BOTTOM_PANEL)
      .setDepth(DEPTH.background + 1);
    this.drawTopHud();

    // Таймер-бар
    const barW = WIDTH - 92;
    this.timerBarMaxWidth = barW - 10;
    this.timerBarBg = this.add.rectangle(WIDTH / 2, 225, barW, 28, COLORS.cream);
    this.timerBarBg.setStrokeStyle(7, COLORS.black);
    this.timerBarBg.setDepth(DEPTH.ui);
    this.timerBar = this.add.rectangle(WIDTH / 2 - barW / 2 + 5, 225, this.timerBarMaxWidth, 18, COLORS.win);
    this.timerBar.setOrigin(0, 0.5);
    this.timerBar.setDepth(DEPTH.ui + 1);

    this.sandWatch = this.add.image(78, 175, 'recipe-sand-watch');
    this.sandWatch.setDisplaySize(36, 36);
    this.sandWatch.setAngle(180);
    this.sandWatch.setDepth(DEPTH.ui);
    this.tweens.add({
      targets: this.sandWatch,
      angle: 360,
      duration: 260,
      hold: 4480,
      repeatDelay: 0,
      repeat: -1,
      yoyo: true,
      ease: 'Cubic.easeInOut',
    });
    this.timerText = this.add.text(112, 160, '', {
      fontFamily: '"Press Start 2P", monospace',
      fontSize: '30px',
      color: '#0A0A0A',
    });
    this.timerText.setDepth(DEPTH.ui);

    this.statusText = this.add.text(WIDTH - 45, 55, '', {
      fontFamily: '"Press Start 2P", monospace',
      fontSize: '30px',
      color: '#0A0A0A',
      align: 'center',
      lineSpacing: 8,
    });
    this.statusText.setOrigin(1, 0);
    this.statusText.setDepth(DEPTH.ui);

    this.mistakesText = this.add.text(WIDTH - 48, 162, '', {
      fontFamily: '"Press Start 2P", monospace',
      fontSize: '30px',
      color: '#FF2E2E',
    });
    this.mistakesText.setOrigin(1, 0);
    this.mistakesText.setDepth(DEPTH.ui);

    // Кнопка «ПОДСМОТРЕТЬ»
    this.peekBtn = this.add.rectangle(WIDTH / 2, 1080, WIDTH - 190, 78, 0xff4e25);
    this.peekBtn.setStrokeStyle(4, COLORS.black);
    this.peekBtn.setDepth(DEPTH.ui);
    this.peekBtn.setInteractive({ useHandCursor: true });
    this.peekBtn.on('pointerdown', () => this.onPeek());

    this.peekIcon = this.add.image(WIDTH / 2 - 135, 1080, 'recipe-magnifer');
    this.peekIcon.setDisplaySize(55, 55);
    this.peekIcon.setDepth(DEPTH.ui + 1);

    this.peekLabel = this.add.text(WIDTH / 2 + 55, 1080, '', {
      fontFamily: '"Press Start 2P", monospace',
      fontSize: '28px',
      color: '#FAF7F0',
      align: 'center',
    });
    this.peekLabel.setOrigin(0.5);
    this.peekLabel.setDepth(DEPTH.ui + 1);

    const helpPanel = this.add.rectangle(WIDTH / 2, 1192, WIDTH - 190, 128, 0x5a54f9);
    helpPanel.setStrokeStyle(4, COLORS.black);
    helpPanel.setDepth(DEPTH.ui);
    const helpText = this.add.text(WIDTH / 2, 1192, 'Собери все рецепты!\nне угадал = -10 сек\nподсмотреть больше\n1 раза = -20 сек', {
      fontFamily: '"Press Start 2P", monospace',
      fontSize: '19px',
      color: '#FAF7F0',
      align: 'center',
      lineSpacing: 12,
    });
    helpText.setOrigin(0.5);
    helpText.setDepth(DEPTH.ui + 1);

    this.cameras.main.fadeIn(250, 10, 10, 10);
    this.startRound();
  }

  private resetRuntimeState(): void {
    this.roundIndex = 0;
    this.cards = [];
    this.firstFlipped = null;
    this.secondFlipped = null;
    this.busy = false;
    this.peeksUsed = 0;
    this.mistakesThisRound = 0;
    this.matchedPairs = 0;
    this.totalMistakes = 0;
    this.timeLeftMs = 0;
    this.gameTimer = null;
    this.peekTimer = null;
    this.timerBarMaxWidth = 0;
    this.hearts = [];
    this.board = null;
    this.bannerOverlay = null;
    this.bannerText = null;
    this.finished = false;
  }

  private preparePixelTextures(): void {
    [
      'heart-pixel',
      'home-pixel',
      'recipe-card-cover',
      'recipe-card-face',
      'recipe-5s',
      'recipe-cola',
      'recipe-cookie',
      'recipe-frenchfries',
      'recipe-magnifer',
      'recipe-pasta',
      'recipe-pepperoni',
      'recipe-roll',
      'recipe-runaway',
      'recipe-sand-watch',
      'recipe-balloon-b',
      'recipe-balloon-y',
      'recipe-balloon-g',
      'recipe-balloon-o',
      'recipe-balloon-r',
    ].forEach((key) => this.textures.get(key).setFilter(Phaser.Textures.FilterMode.NEAREST));
  }

  private drawTopHud(): void {
    this.drawHomeButton();

    this.livesCountText = this.add.text(150, 80, '', {
      fontFamily: '"Press Start 2P", monospace',
      fontSize: '42px',
      color: '#0A0A0A',
    });
    this.livesCountText.setOrigin(0.5);
    this.livesCountText.setDepth(DEPTH.ui);

    for (let i = 0; i < 3; i++) {
      const heart = this.add.image(150 + i * 82, 80, 'heart-pixel');
      heart.setDisplaySize(62, 62);
      heart.setDepth(DEPTH.ui);
      this.hearts.push(heart);
    }
  }

  private drawHomeButton(): void {
    const button = this.add.image(54, 80, 'home-pixel');
    button.setOrigin(0.5);
    button.setDisplaySize(124, 124);
    button.setDepth(DEPTH.ui);
    button.setInteractive({ useHandCursor: true });
    button.on('pointerdown', () => this.showExitConfirm());
  }

  private showExitConfirm(): void {
    if (this.finished) return;
    const wasBusy = this.busy;
    this.busy = true;
    if (this.gameTimer) this.gameTimer.paused = true;

    const { WIDTH, HEIGHT } = GAME;
    const overlay = this.add.rectangle(WIDTH / 2, HEIGHT / 2, WIDTH, HEIGHT, COLORS.black, 0.68);
    overlay.setDepth(DEPTH.modal);
    overlay.setInteractive();

    const panel = this.add.rectangle(WIDTH / 2, HEIGHT / 2, 500, 310, 0x5a54f9);
    panel.setStrokeStyle(6, COLORS.black);
    panel.setDepth(DEPTH.modal + 1);

    const title = this.add.text(WIDTH / 2, HEIGHT / 2 - 95, 'Вы уверены,\nчто хотите выйти?', {
      fontFamily: '"Press Start 2P", monospace',
      fontSize: '22px',
      color: '#FAF7F0',
      align: 'center',
      lineSpacing: 8,
    });
    title.setOrigin(0.5);
    title.setDepth(DEPTH.modal + 2);

    const body = this.add.text(WIDTH / 2, HEIGHT / 2 - 20, 'При выходе из игры\nу Вас сгорает 1 жизнь!', {
      fontFamily: '"Press Start 2P", monospace',
      fontSize: '14px',
      color: '#0A0A0A',
      align: 'center',
      lineSpacing: 10,
    });
    body.setOrigin(0.5);
    body.setDepth(DEPTH.modal + 2);

    const yes = this.add.rectangle(WIDTH / 2 - 105, HEIGHT / 2 + 85, 95, 50, COLORS.win);
    yes.setStrokeStyle(4, COLORS.black);
    yes.setDepth(DEPTH.modal + 2);
    yes.setInteractive({ useHandCursor: true });
    const yesText = this.add.text(yes.x, yes.y, 'Да', {
      fontFamily: '"Press Start 2P", monospace',
      fontSize: '18px',
      color: '#FAF7F0',
    });
    yesText.setOrigin(0.5);
    yesText.setDepth(DEPTH.modal + 3);

    const no = this.add.rectangle(WIDTH / 2 + 105, HEIGHT / 2 + 85, 95, 50, 0xff4e25);
    no.setStrokeStyle(4, COLORS.black);
    no.setDepth(DEPTH.modal + 2);
    no.setInteractive({ useHandCursor: true });
    const noText = this.add.text(no.x, no.y, 'Нет', {
      fontFamily: '"Press Start 2P", monospace',
      fontSize: '18px',
      color: '#FAF7F0',
    });
    noText.setOrigin(0.5);
    noText.setDepth(DEPTH.modal + 3);

    const modalObjects = [overlay, panel, title, body, yes, yesText, no, noText];
    const close = () => {
      modalObjects.forEach((obj) => obj.destroy());
      this.busy = wasBusy;
      if (this.gameTimer) this.gameTimer.paused = false;
    };

    yes.on('pointerdown', (_pointer: Phaser.Input.Pointer, _localX: number, _localY: number, event: Phaser.Types.Input.EventData) => {
      event.stopPropagation();
      this.exitToHome();
    });
    no.on('pointerdown', (_pointer: Phaser.Input.Pointer, _localX: number, _localY: number, event: Phaser.Types.Input.EventData) => {
      event.stopPropagation();
      close();
    });
  }

  private exitToHome(): void {
    SoundManager.playSfx('miss');
    Haptics.trigger('miss');
    SessionState.loseLife();
    this.scene.stop('MinigameRunnerScene');
    this.scene.start('SplashScene');
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
    if (this.board) {
      this.board.destroy();
      this.board = null;
    }
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
    const { WIDTH } = GAME;
    const total = cfg.pairs * 2;

    const icons = this.shuffle([...PAIR_ICONS]).slice(0, cfg.pairs);
    const deck: { icon: string; pairId: number }[] = [];
    icons.forEach((icon, i) => {
      deck.push({ icon, pairId: i });
      deck.push({ icon, pairId: i });
    });
    const shuffledDeck = this.shuffle(deck);

    // Доступная зона: зелёная доска из макета
    const boardX = WIDTH / 2;
    const boardY = 625;
    const boardW = WIDTH - 24;
    const boardH = 740;
    this.board = this.add.rectangle(boardX, boardY, boardW, boardH, BOARD_GREEN);
    this.board.setStrokeStyle(7, 0x7a4a2a);
    this.board.setDepth(DEPTH.midground);

    const gridTop = boardY - boardH / 2 + 58;
    const gridBottom = boardY + boardH / 2 - 58;
    const gridArea = gridBottom - gridTop;

    const visualCols = cfg.cols;
    const visualRows = cfg.rows;
    const gap = cfg.rows > 2 ? 4 : 8;
    const maxCardSize = cfg.rows > 3 ? 152 : 168;
    const cardSize = Math.min(
      maxCardSize,
      (boardW - 24 - (visualCols - 1) * gap) / visualCols,
      (gridArea - (visualRows - 1) * gap) / visualRows,
    );
    const cardW = cardSize;
    const cardH = cardSize;

    const gridW = visualCols * cardW + (visualCols - 1) * gap;
    const gridH = visualRows * cardH + (visualRows - 1) * gap;
    const startX = WIDTH / 2 - gridW / 2 + cardW / 2;
    const startY = gridTop + (gridArea - gridH) / 2 + cardH / 2;

    shuffledDeck.slice(0, total).forEach((d, i) => {
      const col = i % visualCols;
      const row = Math.floor(i / visualCols);
      const x = startX + col * (cardW + gap);
      const y = startY + row * (cardH + gap);
      this.makeCard(d.pairId, d.icon, x, y, cardW, cardH);
    });
  }

  private makeCard(pairId: number, icon: string, x: number, y: number, w: number, h: number): void {
    const container = this.add.container(x, y);

    const back = this.add.image(0, 0, 'recipe-card-cover');
    back.setDisplaySize(w, h);
    const front = this.add.image(0, 0, 'recipe-card-face');
    front.setDisplaySize(w, h);
    front.setVisible(false);
    const iconImage = this.add.image(0, 0, icon);
    const iconSize = Math.min(w * 0.56, h * 0.56, 62);
    iconImage.setDisplaySize(iconSize, iconSize);
    iconImage.setVisible(false);

    container.add([back, front, iconImage]);
    container.setSize(w, h);
    container.setInteractive({ useHandCursor: true });
    container.setDepth(DEPTH.gameplay);

    const card: Card = {
      pairId, icon, container, back, front, iconImage,
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
    this.timerText.setText(`${sec} c`);

    const ratio = Math.max(0, this.timeLeftMs / this.currentCfg.durationMs);
    this.timerBar.width = this.timerBarMaxWidth * Math.min(1, ratio);
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
    card.front.setVisible(toFront);
    card.iconImage.setVisible(toFront);
  }

  private flashCard(card: Card, color: number): void {
    card.iconImage.setTint(color);
    this.tweens.add({
      targets: card.container,
      scale: 1.08,
      duration: 200,
      yoyo: true,
      onComplete: () => card.iconImage.clearTint(),
    });
  }

  private checkRoundComplete(): void {
    if (this.matchedPairs >= this.currentCfg.pairs) {
      this.busy = true;
      this.playRoundWinCelebration();
      this.showBanner(`РАУНД ${this.roundIndex + 1} ✓`, 900, () => {
        if (this.gameTimer) this.gameTimer.remove();
        this.time.delayedCall(ROUND_WIN_CELEBRATION_MS - 900, () => {
          this.roundIndex += 1;
          this.startRound();
        });
      });
    }
  }

  private playRoundWinCelebration(): void {
    const { WIDTH, HEIGHT } = GAME;
    const balloonKeys = [
      'recipe-balloon-b',
      'recipe-balloon-y',
      'recipe-balloon-g',
      'recipe-balloon-o',
      'recipe-balloon-r',
    ];
    const labels = ['СУПЕР!', 'ТАК ДЕРЖАТЬ!', '#МЕГАКРУТО'];

    for (let i = 0; i < 22; i++) {
      this.time.delayedCall(i * 95, () => {
        const balloon = this.add.image(
          Phaser.Math.Between(35, WIDTH - 35),
          HEIGHT + 80,
          Phaser.Utils.Array.GetRandom(balloonKeys),
        );
        const size = Phaser.Math.Between(105, 180);
        balloon.setOrigin(0.5);
        balloon.setDisplaySize(size, size);
        balloon.setDepth(DEPTH.effects);

        this.tweens.add({
          targets: balloon,
          y: -100,
          x: balloon.x + Phaser.Math.Between(-70, 70),
          angle: Phaser.Math.Between(-20, 20),
          duration: Phaser.Math.Between(1900, ROUND_WIN_CELEBRATION_MS),
          ease: 'Sine.easeOut',
          onComplete: () => balloon.destroy(),
        });
      });
    }

    for (let i = 0; i < 8; i++) {
      this.time.delayedCall(i * 220, () => {
        const label = this.add.text(
          Phaser.Math.Between(75, WIDTH - 75),
          HEIGHT + 70,
          Phaser.Utils.Array.GetRandom(labels),
          {
            fontFamily: '"Press Start 2P", monospace',
            fontSize: '28px',
            color: Phaser.Utils.Array.GetRandom(['#FF2E2E', '#FFE600', '#25B855', '#0AACE0']),
            align: 'center',
          },
        );
        label.setOrigin(0.5);
        label.setDepth(DEPTH.effects + 1);
        label.setRotation(Phaser.Math.FloatBetween(-0.18, 0.18));

        this.tweens.add({
          targets: label,
          y: -90,
          x: label.x + Phaser.Math.Between(-45, 45),
          rotation: label.rotation + Phaser.Math.FloatBetween(-0.25, 0.25),
          duration: Phaser.Math.Between(2100, ROUND_WIN_CELEBRATION_MS),
          ease: 'Sine.easeOut',
          onComplete: () => label.destroy(),
        });
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
    const livesLeft = SessionState.getLivesLeft();
    this.renderGlobalLives(livesLeft);
    this.statusText.setText(`угадано\n${this.matchedPairs}/${this.currentCfg.pairs}`);

    // Каждый промах — минус 10 сек, с самого первого
    this.mistakesText.setText(`раунд ${this.roundIndex + 1}`);

    if (this.peeksUsed === 0) {
      this.peekLabel.setText('подсмотреть');
      this.peekBtn.setFillStyle(0xff4e25);
      this.peekLabel.setColor('#FAF7F0');
    } else {
      this.peekLabel.setText(`подсмотреть`);
      this.peekBtn.setFillStyle(0xff4e25);
      this.peekLabel.setColor('#FAF7F0');
    }
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
}
