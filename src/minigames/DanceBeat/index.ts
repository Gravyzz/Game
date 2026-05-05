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
 * NEW-04 Танцпол — Simon-says на стрелках.
 *
 * 5 раундов. В каждом раунде машина показывает последовательность стрелок,
 * затем игрок должен повторить её на 4 кнопках (или клавиатурой ↑↓←→ / WASD).
 *
 * Прогрессия:
 *  - Раунд 1: длина 3, показ 700 мс/стрелка, окно ввода 1.6 сек/стрелка.
 *  - Раунд 2: длина 4
 *  - Раунд 3: длина 5
 *  - Раунд 4: длина 6
 *  - Раунд 5: длина 7, показ 420 мс, окно 0.9 сек.
 *
 * Одна жизнь: любая ошибка / просрочка окна = поражение в матче.
 * Победа = пройти все 5 раундов.
 */

type Dir = 'up' | 'down' | 'left' | 'right';

interface Zone {
  dir: Dir;
  rect: Phaser.GameObjects.Rectangle;
  arrow: Phaser.GameObjects.Text;
  baseColor: number;
  highlightColor: number;
  cx: number;
  cy: number;
}

interface RoundCfg {
  length: number;
  showStepMs: number;   // длительность подсветки одной стрелки в показе
  showGapMs: number;    // пауза между стрелками в показе
  inputWindowMs: number; // окно на ввод одной стрелки игроком
}

const ROUND_CONFIGS: RoundCfg[] = [
  { length: 3, showStepMs: 700, showGapMs: 220, inputWindowMs: 1600 },
  { length: 4, showStepMs: 620, showGapMs: 200, inputWindowMs: 1400 },
  { length: 5, showStepMs: 540, showGapMs: 180, inputWindowMs: 1200 },
  { length: 6, showStepMs: 480, showGapMs: 160, inputWindowMs: 1050 },
  { length: 7, showStepMs: 420, showGapMs: 140, inputWindowMs: 900 },
];

const TOTAL_ROUNDS = ROUND_CONFIGS.length;

const ARROW_BY_DIR: Record<Dir, string> = {
  up: '⬆',
  down: '⬇',
  left: '⬅',
  right: '➡',
};

export class DanceBeatScene extends BaseMinigame {
  private zones: Record<Dir, Zone> = {} as Record<Dir, Zone>;

  // HUD
  private statusText!: Phaser.GameObjects.Text;
  private bigText!: Phaser.GameObjects.Text;
  private timerBar!: Phaser.GameObjects.Rectangle;
  private timerBarBg!: Phaser.GameObjects.Rectangle;
  private timerBarMaxW = 0;

  // Состояние матча
  private roundIndex = 0;
  private currentSeq: Dir[] = [];
  private playerStep = 0;
  private finished = false;

  // Состояние ввода
  private acceptingInput = false;
  private inputDeadlineAt = 0;
  private inputTimer: Phaser.Time.TimerEvent | null = null;
  private showTimers: Phaser.Time.TimerEvent[] = [];

  // Клавиатура
  private keyHandlers: Array<(e: KeyboardEvent) => void> = [];

  constructor() {
    super({ key: 'DanceBeat' });
  }

  create(): void {
    const { WIDTH, HEIGHT } = GAME;

    // Фон
    this.add.rectangle(WIDTH / 2, HEIGHT / 2, WIDTH, HEIGHT, 0x121023);
    this.drawDiscoFloor();

    // Заголовок
    const title = new PosterText(this, WIDTH / 2, 80, 'ПОВТОРИ КОМБО', {
      bgColor: COLORS.purple, textColor: '#FAF7F0',
      fontSize: '30px', rotation: -0.025, paddingX: 22, paddingY: 10,
    });
    title.setDepth(DEPTH.ui);
    this.add.existing(title);

    const hint = this.add.text(WIDTH / 2, 138, 'смотри последовательность → повтори тапом или ↑↓←→', {
      ...TEXT_STYLES.label, fontSize: '13px', color: '#FAF7F0',
    });
    hint.setOrigin(0.5);
    hint.setDepth(DEPTH.ui);

    // Статус (раунд + длина)
    this.statusText = this.add.text(WIDTH / 2, 175, '', {
      ...TEXT_STYLES.subtitle, fontSize: '22px', color: '#FFE600',
    });
    this.statusText.setOrigin(0.5);
    this.statusText.setDepth(DEPTH.ui);

    // «Большой» статус по центру: «СМОТРИ» / «ПОВТОРИ» / «K.O.»
    this.bigText = this.add.text(WIDTH / 2, HEIGHT / 2, '', {
      ...TEXT_STYLES.hero, fontSize: '52px', color: '#FFE600',
    });
    this.bigText.setOrigin(0.5);
    this.bigText.setDepth(DEPTH.modal);

    // Полоса окна ввода
    this.timerBarMaxW = WIDTH - 120;
    this.timerBarBg = this.add.rectangle(WIDTH / 2, 220, this.timerBarMaxW, 14, COLORS.greyDark);
    this.timerBarBg.setStrokeStyle(2, COLORS.black);
    this.timerBarBg.setDepth(DEPTH.ui);
    this.timerBar = this.add.rectangle(WIDTH / 2 - this.timerBarMaxW / 2, 220, this.timerBarMaxW, 10, COLORS.win);
    this.timerBar.setOrigin(0, 0.5);
    this.timerBar.setDepth(DEPTH.ui + 1);
    this.timerBar.setVisible(false);
    this.timerBarBg.setVisible(false);

    // Зоны со стрелками
    this.buildZones();

    // Клавиатура
    this.bindKeyboard();

    this.cameras.main.fadeIn(250, 10, 10, 10);
    this.startRound();
  }

  // ========== UI ==========

  private buildZones(): void {
    const { WIDTH, HEIGHT } = GAME;
    const cx = WIDTH / 2;
    const cy = HEIGHT * 0.66;
    const padBetween = 24;
    const buttonSize = Math.min(220, (WIDTH - 100) / 3);

    const positions: Record<Dir, { x: number; y: number }> = {
      up:    { x: cx, y: cy - buttonSize - padBetween },
      down:  { x: cx, y: cy + buttonSize + padBetween },
      left:  { x: cx - buttonSize - padBetween, y: cy },
      right: { x: cx + buttonSize + padBetween, y: cy },
    };

    const colors: Record<Dir, { base: number; hi: number }> = {
      up:    { base: 0x4a4a8a, hi: COLORS.yellow },
      down:  { base: 0x4a4a8a, hi: COLORS.yellow },
      left:  { base: 0x4a4a8a, hi: COLORS.yellow },
      right: { base: 0x4a4a8a, hi: COLORS.yellow },
    };

    (Object.keys(positions) as Dir[]).forEach((dir) => {
      const pos = positions[dir];
      const c = colors[dir];

      const rect = this.add.rectangle(pos.x, pos.y, buttonSize, buttonSize, c.base);
      rect.setStrokeStyle(6, COLORS.black);
      rect.setDepth(DEPTH.gameplay);
      rect.setInteractive({ useHandCursor: true });
      rect.on('pointerdown', () => this.onPlayerInput(dir));

      const arrow = this.add.text(pos.x, pos.y, ARROW_BY_DIR[dir], {
        fontFamily: 'Arial, sans-serif', fontSize: `${Math.floor(buttonSize * 0.55)}px`,
        color: '#FAF7F0',
      });
      arrow.setOrigin(0.5);
      arrow.setDepth(DEPTH.gameplay + 1);

      this.zones[dir] = {
        dir, rect, arrow,
        baseColor: c.base, highlightColor: c.hi,
        cx: pos.x, cy: pos.y,
      };
    });
  }

  private highlightZone(dir: Dir, durationMs: number, isPlayer: boolean): void {
    const z = this.zones[dir];
    z.rect.setFillStyle(z.highlightColor);
    z.arrow.setColor('#0A0A0A');
    this.tweens.add({
      targets: [z.rect, z.arrow], scale: { from: 1.08, to: 1 },
      duration: 180, ease: 'Back.easeOut',
    });
    if (isPlayer) {
      SoundManager.playSfx('tap');
      Haptics.trigger('tap');
    } else {
      SoundManager.playSfx('tap');
    }
    this.time.delayedCall(durationMs, () => {
      z.rect.setFillStyle(z.baseColor);
      z.arrow.setColor('#FAF7F0');
    });
  }

  // ========== РАУНД ==========

  private startRound(): void {
    if (this.finished) return;
    if (this.roundIndex >= TOTAL_ROUNDS) {
      this.finishMatch(true);
      return;
    }
    const cfg = ROUND_CONFIGS[this.roundIndex];
    this.currentSeq = this.generateSequence(cfg.length);
    this.playerStep = 0;
    this.acceptingInput = false;

    this.statusText.setText(`РАУНД ${this.roundIndex + 1} / ${TOTAL_ROUNDS}  •  длина ${cfg.length}`);
    this.timerBar.setVisible(false);
    this.timerBarBg.setVisible(false);
    this.setBig('СМОТРИ', '#FFE600');

    // Небольшая задержка перед началом показа
    this.time.delayedCall(700, () => {
      if (this.finished) return;
      this.playSequence(cfg);
    });
  }

  private generateSequence(length: number): Dir[] {
    const dirs: Dir[] = ['up', 'down', 'left', 'right'];
    const seq: Dir[] = [];
    let prev: Dir | null = null;
    for (let i = 0; i < length; i++) {
      let pick = dirs[Phaser.Math.Between(0, 3)];
      // Не повторять подряд одно и то же — выглядит как фейк
      if (prev && pick === prev) {
        pick = dirs[(dirs.indexOf(pick) + 1) % 4];
      }
      seq.push(pick);
      prev = pick;
    }
    return seq;
  }

  private playSequence(cfg: RoundCfg): void {
    this.clearShowTimers();

    let elapsed = 0;
    this.currentSeq.forEach((dir) => {
      const at = elapsed;
      const t = this.time.delayedCall(at, () => {
        if (this.finished) return;
        this.highlightZone(dir, cfg.showStepMs, false);
      });
      this.showTimers.push(t);
      elapsed += cfg.showStepMs + cfg.showGapMs;
    });

    // После показа — даём ход игроку
    const tEnd = this.time.delayedCall(elapsed + 200, () => {
      if (this.finished) return;
      this.startPlayerInput(cfg);
    });
    this.showTimers.push(tEnd);
  }

  private startPlayerInput(cfg: RoundCfg): void {
    this.acceptingInput = true;
    this.playerStep = 0;
    this.setBig('ПОВТОРИ', '#4ADE80');
    this.tweens.add({
      targets: this.bigText, alpha: { from: 1, to: 0 }, duration: 700, delay: 350,
      onComplete: () => this.bigText.setAlpha(1),
    });
    this.startStepTimer(cfg.inputWindowMs);
  }

  private startStepTimer(windowMs: number): void {
    if (this.inputTimer) this.inputTimer.remove();
    this.inputDeadlineAt = this.time.now + windowMs;
    this.timerBar.setVisible(true);
    this.timerBarBg.setVisible(true);
    this.timerBar.displayWidth = this.timerBarMaxW;
    this.timerBar.setFillStyle(COLORS.win);

    this.inputTimer = this.time.addEvent({
      delay: 50,
      loop: true,
      callback: this.tickStepTimer,
      callbackScope: this,
    });
  }

  private tickStepTimer(): void {
    if (!this.acceptingInput || this.finished) return;
    const cfg = ROUND_CONFIGS[this.roundIndex];
    const remaining = Math.max(0, this.inputDeadlineAt - this.time.now);
    const ratio = remaining / cfg.inputWindowMs;
    this.timerBar.displayWidth = this.timerBarMaxW * ratio;
    if (ratio < 0.25) this.timerBar.setFillStyle(COLORS.lose);
    else if (ratio < 0.5) this.timerBar.setFillStyle(COLORS.yellow);
    else this.timerBar.setFillStyle(COLORS.win);

    if (remaining <= 0) {
      this.handleFail('ПРОСРОЧИЛ');
    }
  }

  // ========== ВВОД ==========

  private onPlayerInput(dir: Dir): void {
    if (!this.acceptingInput || this.finished) return;
    const expected = this.currentSeq[this.playerStep];
    const cfg = ROUND_CONFIGS[this.roundIndex];

    if (dir !== expected) {
      this.highlightZone(dir, 180, true);
      this.handleFail('НЕ ТОТ');
      return;
    }

    // Верное нажатие
    this.highlightZone(dir, 160, true);
    this.playerStep += 1;

    if (this.playerStep >= this.currentSeq.length) {
      this.acceptingInput = false;
      if (this.inputTimer) { this.inputTimer.remove(); this.inputTimer = null; }
      this.timerBar.setVisible(false);
      this.timerBarBg.setVisible(false);
      this.handleRoundCleared();
      return;
    }

    // Сбрасываем окно для следующей стрелки
    this.startStepTimer(cfg.inputWindowMs);
  }

  private handleRoundCleared(): void {
    SoundManager.playSfx('perfect');
    Haptics.trigger('win');
    this.setBig('K.O.', '#4ADE80');
    this.tweens.add({
      targets: this.bigText, scale: { from: 1.4, to: 1 },
      duration: 350, ease: 'Back.easeOut',
    });
    this.cameras.main.shake(220, 0.008);

    this.roundIndex += 1;
    this.time.delayedCall(900, () => {
      if (this.finished) return;
      this.setBig('', '#FFE600');
      this.startRound();
    });
  }

  private handleFail(reason: string): void {
    if (this.finished) return;
    this.acceptingInput = false;
    if (this.inputTimer) { this.inputTimer.remove(); this.inputTimer = null; }
    this.timerBar.setVisible(false);
    this.timerBarBg.setVisible(false);

    SoundManager.playSfx('miss');
    Haptics.trigger('miss');
    this.setBig(reason, '#EF4444');
    this.cameras.main.shake(280, 0.016);
    this.cameras.main.flash(220, 200, 50, 50);

    this.time.delayedCall(900, () => this.finishMatch(false));
  }

  // ========== КЛАВИАТУРА ==========

  private bindKeyboard(): void {
    const map: Record<string, Dir> = {
      ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right',
      w: 'up', W: 'up',
      s: 'down', S: 'down',
      a: 'left', A: 'left',
      d: 'right', D: 'right',
    };

    const handler = (e: KeyboardEvent) => {
      if (this.finished) return;
      const dir = map[e.key];
      if (!dir) return;
      e.preventDefault();
      this.onPlayerInput(dir);
    };

    window.addEventListener('keydown', handler);
    this.keyHandlers.push(handler);
  }

  private unbindKeyboard(): void {
    this.keyHandlers.forEach((h) => window.removeEventListener('keydown', h));
    this.keyHandlers = [];
  }

  // ========== ФИНАЛ ==========

  private finishMatch(win: boolean): void {
    if (this.finished) return;
    this.finished = true;
    this.acceptingInput = false;
    this.clearShowTimers();
    if (this.inputTimer) this.inputTimer.remove();

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

    const score = win ? 100 : Math.round((this.roundIndex / TOTAL_ROUNDS) * 60);
    this.time.delayedCall(900, () => {
      this.complete({
        outcome: win ? 'win' : 'lose',
        score: Math.min(100, score),
        metadata: { roundsCleared: this.roundIndex },
      });
    });
  }

  shutdown(): void {
    this.clearShowTimers();
    if (this.inputTimer) this.inputTimer.remove();
    this.unbindKeyboard();
  }

  // ========== УТИЛИТЫ ==========

  private clearShowTimers(): void {
    this.showTimers.forEach((t) => t.remove());
    this.showTimers = [];
  }

  private setBig(text: string, color: string): void {
    this.tweens.killTweensOf(this.bigText);
    this.bigText.setAlpha(1);
    this.bigText.setText(text);
    this.bigText.setColor(color);
  }

  private drawDiscoFloor(): void {
    const { WIDTH, HEIGHT } = GAME;
    const g = this.add.graphics();
    for (let i = 0; i < 80; i++) {
      const x = Math.random() * WIDTH;
      const y = Math.random() * HEIGHT;
      const r = Math.random() * 2.4 + 0.4;
      g.fillStyle(0x7a5cff, 0.06 + Math.random() * 0.05);
      g.fillCircle(x, y, r);
    }
    g.setDepth(DEPTH.background);
  }
}
