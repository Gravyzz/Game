import Phaser from 'phaser';
import { BaseMinigame } from '@minigames/BaseMinigame';
import { COLORS } from '@config/colors';
import { GAME, DEPTH } from '@config/game';
import { RU } from '@i18n/ru';
import { SoundManager } from '@core/SoundManager';
import { Haptics } from '@core/Haptics';
import {
  paintPageBackdrop,
  attachHomeButton,
  attachIntro,
  createGlobalLivesDisplay,
} from '@utils/SceneHelpers';

/**
 * NEW-04 Танцпол — Simon-says на стрелках.
 *
 * 5 раундов. В каждом раунде машина показывает последовательность стрелок,
 * затем игрок должен повторить её на 4 кнопках (или клавиатурой ↑↓←→ / WASD).
 *
 * Прогрессия:
 *  - Раунд 1: длина 3, показ 700 мс/стрелка, окно ввода 1.6 сек/стрелка.
 *  - Раунд 5: длина 7, показ 420 мс, окно 0.9 сек.
 *
 * Одна жизнь: любая ошибка / просрочка окна = поражение в матче.
 * Победа = пройти все 5 раундов.
 */

type Dir = 'up' | 'down' | 'left' | 'right';

interface Zone {
  dir: Dir;
  button: Phaser.GameObjects.Image;
  cx: number;
  cy: number;
}

interface RoundCfg {
  length: number;
  showStepMs: number;
  showGapMs: number;
  inputWindowMs: number;
}

const ROUND_CONFIGS: RoundCfg[] = [
  { length: 3, showStepMs: 700, showGapMs: 220, inputWindowMs: 1600 },
  { length: 4, showStepMs: 620, showGapMs: 200, inputWindowMs: 1400 },
  { length: 5, showStepMs: 540, showGapMs: 180, inputWindowMs: 1200 },
  { length: 6, showStepMs: 480, showGapMs: 160, inputWindowMs: 1050 },
];

const TOTAL_ROUNDS = ROUND_CONFIGS.length;

const PIXEL_FONT = '"Press Start 2P", monospace';
const BG_ZOOM = 1.8;
const BG_OFFSET_Y = 200;
const BUTTON_SIZE = 126;
const PROMPT_PANEL = {
  x: GAME.WIDTH / 2,
  y: 790,
  width: 262,
  height: 70,
  textWidth: 230,
};

const BUTTON_TEXTURES: Record<Dir, { normal: string; grey: string; pushed: string }> = {
  up: {
    normal: 'dancebeat-up',
    grey: 'dancebeat-up-grey',
    pushed: 'dancebeat-up-pushed',
  },
  down: {
    normal: 'dancebeat-down',
    grey: 'dancebeat-down-grey',
    pushed: 'dancebeat-down-pushed',
  },
  left: {
    normal: 'dancebeat-left',
    grey: 'dancebeat-left-grey',
    pushed: 'dancebeat-left-pushed',
  },
  right: {
    normal: 'dancebeat-right',
    grey: 'dancebeat-right-grey',
    pushed: 'dancebeat-right-pushed',
  },
};

export class DanceBeatScene extends BaseMinigame {
  private zones: Record<Dir, Zone> = {} as Record<Dir, Zone>;

  // HUD
  private statusText!: Phaser.GameObjects.Text;
  private bigTextPanel!: Phaser.GameObjects.Rectangle;
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
  private inputLocked = false;
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

    // Сброс state — Phaser переиспользует scene-instance.
    this.roundIndex = 0;
    this.currentSeq = [];
    this.playerStep = 0;
    this.finished = false;
    this.acceptingInput = false;
    this.inputLocked = false;
    this.inputDeadlineAt = 0;

    this.configurePixelAssets();

    // Фон
    paintPageBackdrop(this, 0x120608);
    const bg = this.add.image(WIDTH / 2, HEIGHT / 2 + BG_OFFSET_Y, 'dancebeat-bg');
    bg.setOrigin(0.5);
    bg.setDepth(DEPTH.background);
    bg.setScale(Math.max(WIDTH / bg.width, HEIGHT / bg.height) * BG_ZOOM);
    attachHomeButton(this);
    createGlobalLivesDisplay(this);

    // Статус (раунд + длина)
    this.statusText = this.add.text(WIDTH - 34, 50, '', {
      fontFamily: PIXEL_FONT,
      fontSize: '22px',
      color: '#FFFFFF',
      align: 'right',
      lineSpacing: 16,
    });
    this.statusText.setOrigin(1, 0);
    this.statusText.setDepth(DEPTH.ui);

    this.bigTextPanel = this.add.rectangle(
      PROMPT_PANEL.x,
      PROMPT_PANEL.y,
      PROMPT_PANEL.width,
      PROMPT_PANEL.height,
      0x050608,
      0.92,
    );
    this.bigTextPanel.setStrokeStyle(5, 0x2b2329, 1);
    this.bigTextPanel.setDepth(DEPTH.gameplay + 2);

    // Статус автомата: «СМОТРИ» / «ПОВТОРИ» / «K.O.»
    this.bigText = this.add.text(PROMPT_PANEL.x, PROMPT_PANEL.y, '', {
      fontFamily: PIXEL_FONT,
      fontSize: '24px',
      color: '#FFE600',
      align: 'center',
      lineSpacing: 6,
      wordWrap: { width: PROMPT_PANEL.textWidth, useAdvancedWrap: true },
    });
    this.bigText.setOrigin(0.5);
    this.bigText.setDepth(DEPTH.gameplay + 3);

    // Полоса окна ввода
    this.timerBarMaxW = WIDTH - 150;
    this.timerBarBg = this.add.rectangle(WIDTH / 2, 210, this.timerBarMaxW, 12, 0x171717);
    this.timerBarBg.setStrokeStyle(2, COLORS.black);
    this.timerBarBg.setDepth(DEPTH.ui);
    this.timerBar = this.add.rectangle(WIDTH / 2 - this.timerBarMaxW / 2, 210, this.timerBarMaxW, 8, COLORS.win);
    this.timerBar.setOrigin(0, 0.5);
    this.timerBar.setDepth(DEPTH.ui + 1);
    this.timerBar.setVisible(false);
    this.timerBarBg.setVisible(false);

    // Зоны со стрелками
    this.buildZones();

    // Клавиатура
    this.bindKeyboard();

    this.cameras.main.fadeIn(250, 10, 10, 10);
    attachIntro(
      this,
      RU.minigame.names.DanceBeat,
      RU.minigame.guides.DanceBeat,
      () => this.startRound(),
    );
  }

  // ========== UI ==========

  private buildZones(): void {
    const { WIDTH } = GAME;
    const cx = WIDTH / 2;

    const positions: Record<Dir, { x: number; y: number }> = {
      up:    { x: cx, y: 452 },
      down:  { x: cx, y: 648 },
      left:  { x: cx - 118, y: 552 },
      right: { x: cx + 118, y: 552 },
    };

    (Object.keys(positions) as Dir[]).forEach((dir) => {
      const pos = positions[dir];

      const button = this.add.image(pos.x, pos.y, BUTTON_TEXTURES[dir].grey);
      button.setOrigin(0.5);
      button.setDisplaySize(BUTTON_SIZE, BUTTON_SIZE);
      button.setDepth(DEPTH.gameplay + 1);
      button.setInteractive({ useHandCursor: true });
      button.disableInteractive();
      button.on('pointerdown', () => this.onPlayerInput(dir));

      this.zones[dir] = {
        dir,
        button,
        cx: pos.x,
        cy: pos.y,
      };
    });
  }

  private setButtonsMode(mode: 'grey' | 'normal'): void {
    (Object.keys(this.zones) as Dir[]).forEach((dir) => {
      this.setButtonState(dir, mode);
    });
  }

  private setButtonsInputEnabled(enabled: boolean): void {
    (Object.keys(this.zones) as Dir[]).forEach((dir) => {
      const button = this.zones[dir].button;
      if (enabled) button.setInteractive({ useHandCursor: true });
      else button.disableInteractive();
    });
  }

  private setButtonState(dir: Dir, state: 'grey' | 'normal' | 'pushed'): void {
    const zone = this.zones[dir];
    if (!zone) return;
    zone.button.setTexture(BUTTON_TEXTURES[dir][state]);
    zone.button.setDisplaySize(BUTTON_SIZE, BUTTON_SIZE);
  }

  private showSequenceButton(dir: Dir, durationMs: number): void {
    this.setButtonsMode('grey');
    const z = this.zones[dir];
    this.setButtonState(dir, 'normal');
    this.tweens.add({
      targets: z.button,
      scaleX: { from: z.button.scaleX * 1.08, to: z.button.scaleX },
      scaleY: { from: z.button.scaleY * 1.08, to: z.button.scaleY },
      duration: 180, ease: 'Back.easeOut',
    });
    SoundManager.playSfx('tap');
    this.time.delayedCall(durationMs, () => {
      if (!this.finished && !this.acceptingInput) this.setButtonsMode('grey');
    });
  }

  private pressButton(dir: Dir, durationMs: number): void {
    const z = this.zones[dir];
    this.setButtonState(dir, 'pushed');
    this.tweens.add({
      targets: z.button,
      scaleX: { from: z.button.scaleX * 0.94, to: z.button.scaleX },
      scaleY: { from: z.button.scaleY * 0.94, to: z.button.scaleY },
      duration: 120,
      ease: 'Back.easeOut',
    });
    SoundManager.playSfx('tap');
    this.time.delayedCall(durationMs, () => {
      if (!this.finished && this.acceptingInput) this.setButtonState(dir, 'normal');
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
    this.inputLocked = false;

    this.statusText.setText(`раунд ${this.roundIndex + 1}/${TOTAL_ROUNDS}\nповтори ${cfg.length}`);
    this.timerBar.setVisible(false);
    this.timerBarBg.setVisible(false);
    this.setButtonsMode('grey');
    this.setButtonsInputEnabled(false);
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
      // Не повторять подряд: если выпал тот же — берём случайно из трёх остальных,
      // а не детерминированно «следующий по порядку» (это давало предсказуемые паттерны).
      if (prev && pick === prev) {
        const rest = dirs.filter((d) => d !== prev);
        pick = rest[Phaser.Math.Between(0, rest.length - 1)];
      }
      seq.push(pick);
      prev = pick;
    }
    return seq;
  }

  private playSequence(cfg: RoundCfg): void {
    this.clearShowTimers();
    this.setButtonsInputEnabled(false);

    // Прячем «СМОТРИ» — иначе он на DEPTH.modal залазит поверх стрелок при показе.
    // setBig('ПОВТОРИ') в startPlayerInput сам восстановит alpha=1.
    this.tweens.add({
      targets: this.bigText,
      alpha: 0,
      duration: 200,
      ease: 'Sine.easeOut',
    });

    let elapsed = 0;
    this.currentSeq.forEach((dir) => {
      const at = elapsed;
      const t = this.time.delayedCall(at, () => {
        if (this.finished) return;
        this.showSequenceButton(dir, cfg.showStepMs);
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
    this.inputLocked = false;
    this.playerStep = 0;
    this.setButtonsMode('normal');
    this.setButtonsInputEnabled(true);
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
    if (!this.acceptingInput || this.inputLocked || this.finished) return;
    this.inputLocked = true;
    const expected = this.currentSeq[this.playerStep];
    const cfg = ROUND_CONFIGS[this.roundIndex];

    if (dir !== expected) {
      this.pressButton(dir, 180);
      Haptics.trigger('miss');
      this.handleFail('НЕ ТОТ');
      return;
    }

    // Верное нажатие
    this.pressButton(dir, 160);
    Haptics.trigger('tap');
    this.playerStep += 1;

    if (this.playerStep >= this.currentSeq.length) {
      this.acceptingInput = false;
      this.inputLocked = false;
      this.setButtonsInputEnabled(false);
      if (this.inputTimer) { this.inputTimer.remove(); this.inputTimer = null; }
      this.timerBar.setVisible(false);
      this.timerBarBg.setVisible(false);
      this.handleRoundCleared();
      return;
    }

    // Сбрасываем окно для следующей стрелки
    this.startStepTimer(cfg.inputWindowMs);
    this.time.delayedCall(150, () => {
      if (this.acceptingInput && !this.finished) this.inputLocked = false;
    });
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
    this.inputLocked = false;
    this.setButtonsInputEnabled(false);
    this.setButtonsMode('grey');
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
      if (this.finished || this.gamePaused) return;
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
      {
        fontFamily: PIXEL_FONT,
        fontSize: '48px',
        color: win ? '#4ADE80' : '#EF4444',
      },
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
    this.bigText.setScale(1);
    this.bigText.setFontSize(text.length > 8 ? '18px' : '24px');
    this.bigText.setText(text);
    this.bigText.setColor(color);
  }

  private configurePixelAssets(): void {
    [
      'dancebeat-bg',
      ...Object.values(BUTTON_TEXTURES).flatMap((set) => [set.normal, set.grey, set.pushed]),
    ].forEach((key) => {
      if (this.textures.exists(key)) {
        this.textures.get(key).setFilter(Phaser.Textures.FilterMode.NEAREST);
      }
    });
  }
}
