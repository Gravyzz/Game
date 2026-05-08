import Phaser from 'phaser';
import { BaseMinigame } from '@minigames/BaseMinigame';
import { COLORS } from '@config/colors';
import { TEXT_STYLES } from '@config/fonts';
import { GAME, DEPTH } from '@config/game';
import { RU } from '@i18n/ru';
import { PosterText } from '@ui/PosterText';
import { SoundManager } from '@core/SoundManager';
import { Haptics } from '@core/Haptics';
import { attachNoiseBackdrop, paintPageBackdrop } from '@utils/SceneHelpers';

/**
 * NEW-03 Перетапай Диди.
 *
 * Бой за нарезку овощей в стиле Mortal Kombat.
 * 5 раундов, кто первым набрал 3 победы — берёт матч.
 *
 * Режимы раундов:
 *  - 1, 2, 5 — TAP: тап в любую точку = разрез.
 *  - 3 — SWIPE: овощ прыгает по экрану, его надо «перерезать» свайпом.
 *  - 4 — BOMB: овощ периодически меняется на 💣. Тап по бомбе = -2 к шкале.
 *
 * Перки между раундами (выпадают рандомно):
 *  - 🔪 ОСТРЫЙ НОЖ        каждый твой тап = +2
 *  - 👆 ДВОЙНОЙ ТАП        первые 6 тапов идут x2
 *  - 🐢 СТОПОР             Диди стартует на 1 сек позже
 *  - 🪓 ТУПОЙ НОЖ          (-) каждый второй тап в холостую
 *  - ⏱  СЛОМАН НОЖИК       (-) Диди тапает первые 2 сек один
 */

const ROUNDS_PER_MATCH = 5;
const ROUNDS_TO_WIN = 3;

type RoundMode = 'tap' | 'swipe' | 'bomb';
type PerkId = 'sharpKnife' | 'doubleTap' | 'slowDidi' | 'dullKnife' | 'didiHeadstart';

interface RoundCfg {
  target: number;
  didiIntervalMs: number;
  headstartMs: number;
  mode: RoundMode;
  label: string;
}

const ROUND_CONFIG: RoundCfg[] = [
  { target: 12, didiIntervalMs: 430, headstartMs: 700, mode: 'tap',   label: 'ТАП-БАТЛ' },
  { target: 15, didiIntervalMs: 380, headstartMs: 600, mode: 'tap',   label: 'ТАП-БАТЛ' },
  { target: 14, didiIntervalMs: 360, headstartMs: 500, mode: 'swipe', label: 'СВАЙП ЧЕРЕЗ ОВОЩ' },
  { target: 18, didiIntervalMs: 320, headstartMs: 400, mode: 'bomb',  label: 'БОМБОВЫЙ — НЕ ТАП ПО 💣' },
  { target: 25, didiIntervalMs: 270, headstartMs: 300, mode: 'tap',   label: 'ФИНАЛ' },
];

const VEGGIES = ['🍅', '🥒', '🌶️', '🧅', '🥕', '🍆', '🌽', '🥔'];

const BAR_WIDTH = 600;
const BAR_HEIGHT = 38;

const PERKS: Record<PerkId, { emoji: string; name: string; desc: string; isCurse: boolean }> = {
  sharpKnife:    { emoji: '🔪', name: 'ОСТРЫЙ НОЖ',    desc: 'Каждый твой тап рубит за двоих', isCurse: false },
  doubleTap:     { emoji: '👆', name: 'ДВОЙНОЙ ТАП',   desc: 'Первые 6 тапов идут x2',          isCurse: false },
  slowDidi:      { emoji: '🐢', name: 'СТОПОР',        desc: 'Диди тормозит ещё на 1 сек',      isCurse: false },
  dullKnife:     { emoji: '🪓', name: 'ТУПОЙ НОЖ',     desc: 'Каждый второй тап в холостую',    isCurse: true  },
  didiHeadstart: { emoji: '⏱',  name: 'СЛОМАН НОЖИК',  desc: 'Диди рубит 2 сек один',           isCurse: true  },
};
const PERK_IDS: PerkId[] = ['sharpKnife', 'doubleTap', 'slowDidi', 'dullKnife', 'didiHeadstart'];

const SWIPE_MIN_LEN = 5;
const SWIPE_COOLDOWN_MS = 120;
const VEGGIE_RADIUS = 88;

// Пиксельный шрифт — как на главном меню
const PIXEL_FONT = '"Press Start 2P", monospace';

// Зона спавна овощей в swipe-режиме (фиксированная, видимая рамкой)
const SPAWN_X_MIN = 70;
const SPAWN_X_MAX = GAME.WIDTH - 70;
const SPAWN_Y_MIN = 410;
const SPAWN_Y_MAX = 920;

export class ChopChopScene extends BaseMinigame {
  // Прогресс матча
  private currentRoundIndex = 0;
  private playerCount = 0;
  private didiCount = 0;
  private playerWins = 0;
  private didiWins = 0;
  private currentTarget = 0;
  private currentMode: RoundMode = 'tap';

  // UI
  private didiBar!: Phaser.GameObjects.Rectangle;
  private playerBar!: Phaser.GameObjects.Rectangle;
  private didiCountText!: Phaser.GameObjects.Text;
  private playerCountText!: Phaser.GameObjects.Text;
  private roundText!: Phaser.GameObjects.Text;
  private modeText!: Phaser.GameObjects.Text;
  private bigText!: Phaser.GameObjects.Text;
  private scoreText!: Phaser.GameObjects.Text;
  private didiPortrait!: Phaser.GameObjects.Text;
  private playerPortrait!: Phaser.GameObjects.Text;
  private veggie!: Phaser.GameObjects.Text;
  private veggieIdx = 0;
  private trailGfx!: Phaser.GameObjects.Graphics;
  private perkBadgeText: Phaser.GameObjects.Text | null = null;
  private spawnFrame!: Phaser.GameObjects.Graphics;
  private tapZoneBg!: Phaser.GameObjects.Rectangle;
  private tapZoneLabel!: Phaser.GameObjects.Text;

  // Таймеры
  private didiTimer: Phaser.Time.TimerEvent | null = null;
  private headstartTimer: Phaser.Time.TimerEvent | null = null;
  private playerUnlockTimer: Phaser.Time.TimerEvent | null = null;
  private bombCycleTimer: Phaser.Time.TimerEvent | null = null;

  // Состояние ввода
  private accepting = false;
  private playerCanTap = false;
  private finished = false;

  // Свайп
  private swipeActive = false;
  private prevPointerX = 0;
  private prevPointerY = 0;
  private lastSwipeChopAt = 0;

  // Бомба-режим
  private currentlyBomb = false;

  // Перки
  private nextPerk: PerkId | null = null;
  private activePerk: PerkId | null = null;
  private perkSharpKnife = false;
  private perkDoubleRemaining = 0;
  private perkSlowDidi = false;
  private perkDullKnife = false;
  private perkDidiHeadstart = false;
  private dullKnifeFlip = false;

  constructor() {
    super({ key: 'ChopChop' });
  }

  create(): void {
    const { WIDTH, HEIGHT } = GAME;

    // Фон
    paintPageBackdrop(this, 0x2a4d3e);
    this.add.rectangle(WIDTH / 2, HEIGHT / 2, WIDTH, HEIGHT, 0x2a4d3e);
    this.drawNoise();

    // Заголовок
    const title = new PosterText(this, WIDTH / 2, 70, 'ПЕРЕТАПАЙ ДИДИ', {
      bgColor: COLORS.yellow, textColor: '#0A0A0A',
      fontSize: '28px', rotation: -0.025, paddingX: 22, paddingY: 8,
    });
    title.setDepth(DEPTH.ui);
    this.add.existing(title);

    // Счёт раундов — пиксельный шрифт как на мейн-меню
    this.scoreText = this.add.text(WIDTH / 2, 130, '', {
      fontFamily: PIXEL_FONT, fontSize: '18px', color: '#FAF7F0',
    });
    this.scoreText.setOrigin(0.5);
    this.scoreText.setDepth(DEPTH.ui);

    // === Диди (верх) ===
    const didiNameY = 180;
    const didiBarY = 230;

    this.didiPortrait = this.add.text(WIDTH / 2 - BAR_WIDTH / 2 - 10, didiBarY, '👨‍🍳', { fontSize: '54px' });
    this.didiPortrait.setOrigin(1, 0.5);
    this.didiPortrait.setDepth(DEPTH.ui);

    const didiName = this.add.text(WIDTH / 2, didiNameY, 'DIDI', {
      fontFamily: PIXEL_FONT, fontSize: '22px', color: '#FF2E2E',
    });
    didiName.setOrigin(0.5);
    didiName.setDepth(DEPTH.ui);

    const didiBarBg = this.add.rectangle(WIDTH / 2, didiBarY, BAR_WIDTH, BAR_HEIGHT, 0x1a1a1a);
    didiBarBg.setStrokeStyle(4, COLORS.black);
    didiBarBg.setDepth(DEPTH.gameplay);

    this.didiBar = this.add.rectangle(WIDTH / 2 + BAR_WIDTH / 2 - 3, didiBarY, BAR_WIDTH, BAR_HEIGHT - 6, COLORS.red);
    this.didiBar.setOrigin(1, 0.5);
    this.didiBar.displayWidth = 0;
    this.didiBar.setDepth(DEPTH.gameplay + 1);

    this.didiCountText = this.add.text(WIDTH / 2, didiBarY, '', {
      fontFamily: PIXEL_FONT, fontSize: '14px', color: '#FAF7F0',
    });
    this.didiCountText.setOrigin(0.5);
    this.didiCountText.setDepth(DEPTH.ui);

    // === Центр ===
    this.roundText = this.add.text(WIDTH / 2, 310, '', {
      fontFamily: PIXEL_FONT, fontSize: '16px', color: '#FFE600',
    });
    this.roundText.setOrigin(0.5);
    this.roundText.setDepth(DEPTH.ui);

    this.modeText = this.add.text(WIDTH / 2, 345, '', {
      fontFamily: PIXEL_FONT, fontSize: '12px', color: '#FAF7F0',
    });
    this.modeText.setOrigin(0.5);
    this.modeText.setDepth(DEPTH.ui);

    this.bigText = this.add.text(WIDTH / 2, HEIGHT * 0.5, '', {
      fontFamily: PIXEL_FONT, fontSize: '48px', color: '#FFE600',
    });
    this.bigText.setOrigin(0.5);
    this.bigText.setDepth(DEPTH.modal);

    this.veggie = this.add.text(WIDTH / 2, HEIGHT * 0.62, '🍅', { fontSize: '120px' });
    this.veggie.setOrigin(0.5);
    this.veggie.setDepth(DEPTH.gameplay);
    this.veggie.setVisible(false);

    // Видимая рамка зоны спавна для свайп-режима
    this.spawnFrame = this.add.graphics();
    this.spawnFrame.setDepth(DEPTH.midground);
    this.spawnFrame.setVisible(false);

    this.trailGfx = this.add.graphics();
    this.trailGfx.setDepth(DEPTH.effects);

    // === Игрок (низ) ===
    const playerNameY = HEIGHT - 320;
    const playerBarY = HEIGHT - 270;

    this.playerPortrait = this.add.text(WIDTH / 2 + BAR_WIDTH / 2 + 10, playerBarY, '🧑‍🍳', { fontSize: '54px' });
    this.playerPortrait.setOrigin(0, 0.5);
    this.playerPortrait.setDepth(DEPTH.ui);

    const playerName = this.add.text(WIDTH / 2, playerNameY, 'YOU', {
      fontFamily: PIXEL_FONT, fontSize: '22px', color: '#4ADE80',
    });
    playerName.setOrigin(0.5);
    playerName.setDepth(DEPTH.ui);

    const playerBarBg = this.add.rectangle(WIDTH / 2, playerBarY, BAR_WIDTH, BAR_HEIGHT, 0x1a1a1a);
    playerBarBg.setStrokeStyle(4, COLORS.black);
    playerBarBg.setDepth(DEPTH.gameplay);

    this.playerBar = this.add.rectangle(WIDTH / 2 - BAR_WIDTH / 2 + 3, playerBarY, BAR_WIDTH, BAR_HEIGHT - 6, COLORS.win);
    this.playerBar.setOrigin(0, 0.5);
    this.playerBar.displayWidth = 0;
    this.playerBar.setDepth(DEPTH.gameplay + 1);

    this.playerCountText = this.add.text(WIDTH / 2, playerBarY, '', {
      fontFamily: PIXEL_FONT, fontSize: '14px', color: '#FAF7F0',
    });
    this.playerCountText.setOrigin(0.5);
    this.playerCountText.setDepth(DEPTH.ui);

    // Кнопка ТАП — визуальная, в стилистике пиксельных кнопок мейн-меню
    this.tapZoneBg = this.add.rectangle(WIDTH / 2, HEIGHT - 130, BAR_WIDTH + 60, 130, 0x69bd45);
    this.tapZoneBg.setStrokeStyle(6, COLORS.black);
    this.tapZoneBg.setDepth(DEPTH.gameplay);
    this.tapZoneLabel = this.add.text(WIDTH / 2, HEIGHT - 130, 'TAP TAP TAP', {
      fontFamily: PIXEL_FONT, fontSize: '32px', color: '#0A0A0A',
    });
    this.tapZoneLabel.setOrigin(0.5);
    this.tapZoneLabel.setDepth(DEPTH.gameplay + 1);

    // Инпут
    this.input.on('pointerdown', this.onPointerDown, this);
    this.input.on('pointermove', this.onPointerMove, this);
    this.input.on('pointerup', this.onPointerUp, this);

    this.cameras.main.fadeIn(250, 10, 10, 10);
    this.updateUi();
    this.startRound();
  }

  // ========== РАУНД ==========

  private startRound(): void {
    if (this.finished) return;
    if (this.currentRoundIndex >= ROUNDS_PER_MATCH) {
      this.finishMatch();
      return;
    }
    const cfg = ROUND_CONFIG[this.currentRoundIndex];
    this.currentTarget = cfg.target;
    this.currentMode = cfg.mode;
    this.playerCount = 0;
    this.didiCount = 0;
    this.veggieIdx = Phaser.Math.Between(0, VEGGIES.length - 1);
    this.veggie.setText(VEGGIES[this.veggieIdx]);
    this.veggie.setScale(1);

    // Перк применяем строго на этот раунд
    this.resetPerks();
    if (this.nextPerk) {
      this.activePerk = this.nextPerk;
      this.nextPerk = null;
      this.applyPerkEffects(this.activePerk);
    } else {
      this.activePerk = null;
    }

    this.setBig('', '#FFE600');
    this.roundText.setText(`РАУНД ${this.currentRoundIndex + 1} / ${ROUNDS_PER_MATCH}  •  цель ${cfg.target}`);
    this.modeText.setText(cfg.label);

    this.updatePerkBadge();
    this.updateUi();
    this.setupRoundVisual();

    this.accepting = false;
    this.playerCanTap = false;

    this.showCountdown(() => {
      if (this.finished) return;
      this.veggie.setVisible(true);
      this.accepting = true;
      this.startGameplayTimers(cfg);
    });
  }

  private setupRoundVisual(): void {
    const { WIDTH, HEIGHT } = GAME;
    if (this.currentMode === 'swipe') {
      this.drawSpawnFrame();
      this.spawnFrame.setVisible(true);
      this.spawnFrame.setAlpha(1);
      this.tweens.killTweensOf(this.spawnFrame);
      this.tweens.add({
        targets: this.spawnFrame, alpha: { from: 0.55, to: 1 },
        duration: 900, yoyo: true, repeat: -1, ease: 'Sine.easeInOut',
      });
      this.tapZoneBg.setVisible(false);
      this.tapZoneLabel.setVisible(false);
      this.placeVeggieRandom();
      this.veggie.setVisible(false);
    } else {
      this.tweens.killTweensOf(this.spawnFrame);
      this.spawnFrame.setVisible(false);
      this.tapZoneBg.setVisible(true);
      this.tapZoneLabel.setVisible(true);
      this.tapZoneLabel.setText(this.currentMode === 'bomb' ? 'NO BOMB!' : 'TAP TAP TAP');
      this.tapZoneBg.setFillStyle(this.currentMode === 'bomb' ? 0xff8a3a : 0x69bd45);
      this.veggie.x = WIDTH / 2;
      this.veggie.y = HEIGHT * 0.62;
      this.veggie.setVisible(false);
    }
  }

  /** Пиксельный «арена-фрейм» для зоны спавна — четыре уголка-скобки + штрих по периметру */
  private drawSpawnFrame(): void {
    const g = this.spawnFrame;
    g.clear();
    const x = SPAWN_X_MIN;
    const y = SPAWN_Y_MIN;
    const w = SPAWN_X_MAX - SPAWN_X_MIN;
    const h = SPAWN_Y_MAX - SPAWN_Y_MIN;

    // Лёгкая подложка
    g.fillStyle(0x000000, 0.18);
    g.fillRect(x, y, w, h);

    // Пунктирная жёлтая рамка по периметру
    const dash = 14;
    const gap = 10;
    g.lineStyle(3, COLORS.yellow, 0.7);
    // Верх / низ
    for (let dx = 0; dx < w; dx += dash + gap) {
      const x1 = x + dx;
      const x2 = Math.min(x + dx + dash, x + w);
      g.lineBetween(x1, y, x2, y);
      g.lineBetween(x1, y + h, x2, y + h);
    }
    // Лево / право
    for (let dy = 0; dy < h; dy += dash + gap) {
      const y1 = y + dy;
      const y2 = Math.min(y + dy + dash, y + h);
      g.lineBetween(x, y1, x, y2);
      g.lineBetween(x + w, y1, x + w, y2);
    }

    // Толстые угловые скобки — как в аркадных таргетах
    const c = 26;
    g.lineStyle(6, COLORS.yellow, 1);
    // top-left
    g.lineBetween(x, y, x + c, y);
    g.lineBetween(x, y, x, y + c);
    // top-right
    g.lineBetween(x + w - c, y, x + w, y);
    g.lineBetween(x + w, y, x + w, y + c);
    // bottom-left
    g.lineBetween(x, y + h - c, x, y + h);
    g.lineBetween(x, y + h, x + c, y + h);
    // bottom-right
    g.lineBetween(x + w - c, y + h, x + w, y + h);
    g.lineBetween(x + w, y + h - c, x + w, y + h);
  }

  private startGameplayTimers(cfg: RoundCfg): void {
    if (this.finished) return;

    // «Сломан ножик» — игрок 2 сек смотрит, Диди работает
    if (this.perkDidiHeadstart) {
      this.playerCanTap = false;
      this.setBig('НОЖИК СЛОМАЛСЯ…', '#EF4444');
      this.tweens.add({
        targets: this.bigText, alpha: { from: 1, to: 0.4 },
        duration: 1700, ease: 'Sine.easeIn',
      });
      this.playerUnlockTimer = this.time.delayedCall(2000, () => {
        if (this.finished) return;
        this.playerCanTap = true;
        this.setBig('', '#FFE600');
      });
    } else {
      this.playerCanTap = true;
    }

    // Старт Диди
    let didiDelay = cfg.headstartMs;
    if (this.perkSlowDidi) didiDelay += 1000;
    if (this.perkDidiHeadstart) didiDelay = 100;

    this.headstartTimer = this.time.delayedCall(didiDelay, () => {
      if (this.finished || !this.accepting) return;
      this.didiTimer = this.time.addEvent({
        delay: cfg.didiIntervalMs,
        loop: true,
        callback: this.onDidiTick,
        callbackScope: this,
      });
    });

    if (this.currentMode === 'bomb') {
      this.scheduleBombSwap();
    }
  }

  private showCountdown(onDone: () => void): void {
    this.veggie.setVisible(false);
    const seq = ['3', '2', '1', 'НАРЕЗАЙ!'];
    const colors = ['#FAF7F0', '#FFE600', '#FF2E2E', '#4ADE80'];
    let i = 0;
    const tick = () => {
      if (this.finished) return;
      this.setBig(seq[i], colors[i]);
      this.bigText.setScale(1.6);
      this.tweens.add({
        targets: this.bigText, scale: 1, duration: 320, ease: 'Back.easeOut',
      });
      i++;
      if (i < seq.length) {
        this.time.delayedCall(450, tick);
      } else {
        this.time.delayedCall(380, () => {
          if (this.finished) return;
          this.setBig('', '#FFE600');
          onDone();
        });
      }
    };
    tick();
  }

  // ========== ПЕРКИ ==========

  private resetPerks(): void {
    this.perkSharpKnife = false;
    this.perkDoubleRemaining = 0;
    this.perkSlowDidi = false;
    this.perkDullKnife = false;
    this.perkDidiHeadstart = false;
    this.dullKnifeFlip = false;
  }

  private applyPerkEffects(id: PerkId): void {
    switch (id) {
      case 'sharpKnife':    this.perkSharpKnife = true; break;
      case 'doubleTap':     this.perkDoubleRemaining = 6; break;
      case 'slowDidi':      this.perkSlowDidi = true; break;
      case 'dullKnife':     this.perkDullKnife = true; break;
      case 'didiHeadstart': this.perkDidiHeadstart = true; break;
    }
  }

  private updatePerkBadge(): void {
    const { WIDTH } = GAME;
    if (this.perkBadgeText) {
      this.perkBadgeText.destroy();
      this.perkBadgeText = null;
    }
    if (!this.activePerk) return;
    const p = PERKS[this.activePerk];
    this.perkBadgeText = this.add.text(WIDTH / 2, 380,
      `${p.emoji} ${p.name}`,
      { ...TEXT_STYLES.label, fontSize: '14px', color: p.isCurse ? '#EF4444' : '#4ADE80' });
    this.perkBadgeText.setOrigin(0.5);
    this.perkBadgeText.setDepth(DEPTH.ui);
  }

  private pickRandomPerk(): PerkId {
    return PERK_IDS[Phaser.Math.Between(0, PERK_IDS.length - 1)];
  }

  /** Рулетка перков а-ля казино: карточка быстро прокручивает варианты, замедляется и
   *  останавливается на финальном перке, после чего раскрывается описание. */
  private showPerkCard(perkId: PerkId, onDone: () => void): void {
    const { WIDTH, HEIGHT } = GAME;

    const overlay = this.add.rectangle(WIDTH / 2, HEIGHT / 2, WIDTH, HEIGHT, COLORS.black, 0.7);
    overlay.setDepth(DEPTH.modal);

    // Рамка карточки в стилистике пиксельных кнопок мейн-меню
    const cardBg = this.add.rectangle(WIDTH / 2, HEIGHT / 2, 540, 380, COLORS.cream);
    cardBg.setStrokeStyle(8, COLORS.yellow);
    cardBg.setDepth(DEPTH.modal + 1);

    const titleTop = this.add.text(WIDTH / 2, HEIGHT / 2 - 150, 'РУЛЕТКА', {
      fontFamily: PIXEL_FONT, fontSize: '20px', color: '#0A0A0A',
    });
    titleTop.setOrigin(0.5);
    titleTop.setDepth(DEPTH.modal + 2);

    // «Окошко» рулетки — мигающая полоса как у слот-машины
    const slotBg = this.add.rectangle(WIDTH / 2, HEIGHT / 2 - 30, 440, 180, 0x1a1a1a);
    slotBg.setStrokeStyle(6, COLORS.black);
    slotBg.setDepth(DEPTH.modal + 1);

    const emoji = this.add.text(WIDTH / 2, HEIGHT / 2 - 50, '', { fontSize: '96px' });
    emoji.setOrigin(0.5);
    emoji.setDepth(DEPTH.modal + 2);

    const name = this.add.text(WIDTH / 2, HEIGHT / 2 + 30, '', {
      fontFamily: PIXEL_FONT, fontSize: '20px', color: '#FAF7F0',
    });
    name.setOrigin(0.5);
    name.setDepth(DEPTH.modal + 2);

    const desc = this.add.text(WIDTH / 2, HEIGHT / 2 + 130, '', {
      fontFamily: 'Onest, system-ui, sans-serif', fontSize: '16px', color: '#1A1A1A',
      align: 'center', wordWrap: { width: 480 },
    });
    desc.setOrigin(0.5);
    desc.setDepth(DEPTH.modal + 2);
    desc.setAlpha(0);

    // Появление карточки
    cardBg.setScale(0);
    slotBg.setScale(0);
    this.tweens.add({
      targets: [cardBg, slotBg, titleTop],
      scale: { from: 0, to: 1 }, duration: 320, ease: 'Back.easeOut',
    });

    // Прокрутка
    const finalIdx = PERK_IDS.indexOf(perkId);
    // 3 полных оборота + дотягиваемся до финального индекса
    const totalSteps = PERK_IDS.length * 3 + finalIdx + 1;
    let step = 0;

    const cleanup = () => {
      this.tweens.add({
        targets: [overlay, cardBg, slotBg, titleTop, emoji, name, desc],
        alpha: 0, duration: 250,
        onComplete: () => {
          overlay.destroy();
          cardBg.destroy();
          slotBg.destroy();
          titleTop.destroy();
          emoji.destroy();
          name.destroy();
          desc.destroy();
          onDone();
        },
      });
    };

    const tick = () => {
      if (this.finished) { cleanup(); return; }
      const cur = PERK_IDS[step % PERK_IDS.length];
      const p = PERKS[cur];
      emoji.setText(p.emoji);
      name.setText(p.name);
      name.setColor(p.isCurse ? '#FF6B6B' : '#5DFF8E');
      slotBg.setStrokeStyle(6, p.isCurse ? COLORS.lose : COLORS.win);

      // Тик-пульс
      this.tweens.killTweensOf(emoji);
      emoji.setScale(1.0);
      this.tweens.add({
        targets: emoji, scale: { from: 1.18, to: 1 }, duration: 90,
      });

      SoundManager.playSfx('tap');
      Haptics.trigger('tap');

      step += 1;
      if (step >= totalSteps) {
        // Финальная остановка
        const final = PERKS[perkId];
        emoji.setText(final.emoji);
        name.setText(final.name);
        name.setColor(final.isCurse ? '#FF6B6B' : '#5DFF8E');
        slotBg.setStrokeStyle(6, final.isCurse ? COLORS.lose : COLORS.win);

        const tag = final.isCurse ? 'ПОДЛЯНА' : 'БУФФ';
        titleTop.setText(tag);
        titleTop.setColor(final.isCurse ? '#EF4444' : '#0A8C45');

        this.tweens.killTweensOf(emoji);
        emoji.setScale(1);
        this.tweens.add({
          targets: emoji, scale: { from: 1.6, to: 1 },
          duration: 450, ease: 'Back.easeOut',
        });
        desc.setText(final.desc);
        this.tweens.add({
          targets: desc, alpha: { from: 0, to: 1 }, duration: 380, delay: 200,
        });
        SoundManager.playSfx(final.isCurse ? 'miss' : 'perfect');
        Haptics.trigger(final.isCurse ? 'miss' : 'perfect');
        this.cameras.main.shake(220, 0.008);

        this.time.delayedCall(1700, cleanup);
        return;
      }

      // Кривая замедления: 50мс → ~340мс
      const t = step / totalSteps;
      const delay = 50 + Math.pow(t, 2.4) * 290;
      this.time.delayedCall(delay, tick);
    };

    // Запускаем рулетку чуть позже, чтобы успела появиться карточка
    this.time.delayedCall(280, tick);
  }

  // ========== ИНПУТ ==========

  private onPointerDown(p: Phaser.Input.Pointer): void {
    if (!this.accepting || this.finished) return;
    if (this.currentMode === 'swipe') {
      this.swipeActive = true;
      this.prevPointerX = p.x;
      this.prevPointerY = p.y;
      this.trailGfx.clear();
      // Прямое касание ровно по овощу тоже считается за разрез
      const dx = p.x - this.veggie.x;
      const dy = p.y - this.veggie.y;
      if (this.playerCanTap
          && dx * dx + dy * dy <= VEGGIE_RADIUS * VEGGIE_RADIUS
          && this.time.now - this.lastSwipeChopAt > SWIPE_COOLDOWN_MS) {
        this.lastSwipeChopAt = this.time.now;
        this.handleSwipeChop();
      }
      return;
    }
    this.handleTap();
  }

  private onPointerMove(p: Phaser.Input.Pointer): void {
    if (!this.accepting || this.finished) return;
    if (this.currentMode !== 'swipe' || !this.swipeActive) return;

    const dx = p.x - this.prevPointerX;
    const dy = p.y - this.prevPointerY;
    const len = Math.sqrt(dx * dx + dy * dy);
    if (len < SWIPE_MIN_LEN) return;

    if (this.playerCanTap
        && this.lineIntersectsCircle(this.prevPointerX, this.prevPointerY, p.x, p.y, this.veggie.x, this.veggie.y, VEGGIE_RADIUS)
        && this.time.now - this.lastSwipeChopAt > SWIPE_COOLDOWN_MS) {
      this.lastSwipeChopAt = this.time.now;
      this.handleSwipeChop();
    }

    // След от свайпа — толстый «нож»
    this.trailGfx.lineStyle(8, COLORS.yellow, 0.85);
    this.trailGfx.lineBetween(this.prevPointerX, this.prevPointerY, p.x, p.y);
    this.trailGfx.lineStyle(3, COLORS.cream, 1);
    this.trailGfx.lineBetween(this.prevPointerX, this.prevPointerY, p.x, p.y);
    this.trailGfx.setAlpha(1);
    this.tweens.killTweensOf(this.trailGfx);
    this.tweens.add({
      targets: this.trailGfx, alpha: 0, duration: 220, delay: 90,
      onComplete: () => this.trailGfx.clear(),
    });

    this.prevPointerX = p.x;
    this.prevPointerY = p.y;
  }

  private onPointerUp(): void {
    if (this.currentMode === 'swipe') {
      this.swipeActive = false;
      this.trailGfx.clear();
    }
  }

  // ========== ОБРАБОТЧИКИ ==========

  private handleTap(): void {
    if (!this.playerCanTap) return;

    // Бомба-режим: если на экране 💣 — штраф
    if (this.currentMode === 'bomb' && this.currentlyBomb) {
      this.handleBombHit();
      return;
    }

    // Тупой нож: каждый второй тап игнорируется
    if (this.perkDullKnife) {
      this.dullKnifeFlip = !this.dullKnifeFlip;
      if (!this.dullKnifeFlip) {
        this.flashVeggieMiss();
        return;
      }
    }

    let value = 1;
    if (this.perkSharpKnife) value = 2;
    if (this.perkDoubleRemaining > 0) {
      value *= 2;
      this.perkDoubleRemaining -= 1;
    }
    this.applyChop(value);
    this.feedbackTap();
  }

  private handleSwipeChop(): void {
    if (this.perkDullKnife) {
      this.dullKnifeFlip = !this.dullKnifeFlip;
      if (!this.dullKnifeFlip) {
        this.flashVeggieMiss();
        this.placeVeggieRandom();
        return;
      }
    }

    let value = 1;
    if (this.perkSharpKnife) value = 2;
    if (this.perkDoubleRemaining > 0) {
      value *= 2;
      this.perkDoubleRemaining -= 1;
    }
    this.applyChop(value);
    this.feedbackTap();
    this.placeVeggieRandom();
  }

  private handleBombHit(): void {
    this.playerCount = Math.max(0, this.playerCount - 2);
    this.currentlyBomb = false;
    SoundManager.playSfx('miss');
    Haptics.trigger('miss');
    this.cameras.main.shake(180, 0.015);
    this.cameras.main.flash(180, 220, 50, 50);
    this.setBig('-2', '#EF4444');
    this.bigText.setScale(1.4);
    this.tweens.add({
      targets: this.bigText, scale: 1, alpha: 0, duration: 600,
      onComplete: () => { this.setBig('', '#FFE600'); },
    });
    // Спрятать бомбу — следующий цикл вернёт овощ
    this.veggie.setText('💥');
    this.updateUi();
  }

  private applyChop(value: number): void {
    if (!this.accepting || this.finished) return;
    this.playerCount += value;
    this.updateUi();
    if (this.playerCount >= this.currentTarget) {
      this.endRound('player');
    }
  }

  private feedbackTap(): void {
    SoundManager.playSfx('tap');
    Haptics.trigger('tap');
    this.tweens.add({
      targets: this.veggie, scale: { from: 0.78, to: 1 },
      duration: 110, ease: 'Quad.easeOut',
    });
    this.tweens.add({
      targets: this.playerPortrait, scale: { from: 1.18, to: 1 },
      duration: 130, ease: 'Quad.easeOut',
    });
    this.spawnSlash();

    if (this.currentMode === 'tap' && this.playerCount % 3 === 0) {
      this.veggieIdx = (this.veggieIdx + 1) % VEGGIES.length;
      this.veggie.setText(VEGGIES[this.veggieIdx]);
    }
  }

  private flashVeggieMiss(): void {
    SoundManager.playSfx('miss');
    Haptics.trigger('miss');
    this.tweens.add({
      targets: this.veggie, alpha: { from: 1, to: 0.4 }, duration: 80, yoyo: true,
    });
  }

  private spawnSlash(): void {
    const cx = this.veggie.x;
    const cy = this.veggie.y;
    const flash = this.add.rectangle(cx, cy, 220, 6, COLORS.cream);
    flash.setRotation((Math.random() - 0.5) * Math.PI);
    flash.setDepth(DEPTH.effects);
    this.tweens.add({
      targets: flash, alpha: 0, duration: 220,
      onComplete: () => flash.destroy(),
    });
  }

  private onDidiTick(): void {
    if (!this.accepting || this.finished) return;
    this.didiCount += 1;

    this.tweens.add({
      targets: this.didiPortrait, scale: { from: 1.12, to: 1 },
      duration: 140, ease: 'Quad.easeOut',
    });

    this.updateUi();

    if (this.didiCount >= this.currentTarget) {
      this.endRound('didi');
    }
  }

  // ========== РЕЖИМЫ ==========

  private placeVeggieRandom(): void {
    // Чтобы овощ не вылезал за рамку — отступ от краёв
    const padding = VEGGIE_RADIUS;
    const prevX = this.veggie.x;
    const prevY = this.veggie.y;
    let nx = prevX, ny = prevY;
    // Стараемся не спавнить в той же точке — несколько попыток
    for (let i = 0; i < 6; i++) {
      nx = Phaser.Math.Between(SPAWN_X_MIN + padding, SPAWN_X_MAX - padding);
      ny = Phaser.Math.Between(SPAWN_Y_MIN + padding, SPAWN_Y_MAX - padding);
      if (Math.hypot(nx - prevX, ny - prevY) > VEGGIE_RADIUS * 2) break;
    }
    this.veggie.x = nx;
    this.veggie.y = ny;
    this.veggieIdx = (this.veggieIdx + 1) % VEGGIES.length;
    this.veggie.setText(VEGGIES[this.veggieIdx]);
    this.veggie.setScale(0);
    this.veggie.setVisible(true);
    this.tweens.add({
      targets: this.veggie, scale: 1, duration: 200, ease: 'Back.easeOut',
    });
  }

  private scheduleBombSwap(): void {
    if (this.finished || !this.accepting) return;
    const delay = Phaser.Math.Between(700, 1100);
    this.bombCycleTimer = this.time.delayedCall(delay, () => {
      if (this.finished || !this.accepting) return;
      const wantBomb = Phaser.Math.Between(0, 99) < 28;
      if (wantBomb && !this.currentlyBomb) {
        this.currentlyBomb = true;
        this.veggie.setText('💣');
        this.veggie.setScale(0.8);
        this.tweens.add({
          targets: this.veggie, scale: 1, duration: 180, ease: 'Back.easeOut',
        });
      } else {
        this.currentlyBomb = false;
        this.veggieIdx = (this.veggieIdx + 1) % VEGGIES.length;
        this.veggie.setText(VEGGIES[this.veggieIdx]);
      }
      this.scheduleBombSwap();
    });
  }

  // ========== UI ==========

  private setBig(text: string, color: string): void {
    this.tweens.killTweensOf(this.bigText);
    this.bigText.setAlpha(1);
    this.bigText.setText(text);
    this.bigText.setColor(color);
  }

  private updateUi(): void {
    const target = this.currentTarget || 1;
    const fillP = Math.min(1, this.playerCount / target);
    const fillD = Math.min(1, this.didiCount / target);
    this.playerBar.displayWidth = (BAR_WIDTH - 6) * fillP;
    this.didiBar.displayWidth = (BAR_WIDTH - 6) * fillD;
    this.playerCountText.setText(`${this.playerCount} / ${target}`);
    this.didiCountText.setText(`${this.didiCount} / ${target}`);
    this.scoreText.setText(`ТЫ ${this.playerWins}  :  ${this.didiWins} ДИДИ`);
  }

  // ========== ФИНАЛ РАУНДА ==========

  private endRound(winner: 'player' | 'didi'): void {
    // Идемпотентность: если accepting=false, раунд уже закрыт.
    if (!this.accepting || this.finished) return;
    this.accepting = false;
    this.playerCanTap = false;
    if (this.didiTimer) { this.didiTimer.remove(); this.didiTimer = null; }
    if (this.headstartTimer) { this.headstartTimer.remove(); this.headstartTimer = null; }
    if (this.playerUnlockTimer) { this.playerUnlockTimer.remove(); this.playerUnlockTimer = null; }
    if (this.bombCycleTimer) { this.bombCycleTimer.remove(); this.bombCycleTimer = null; }
    this.currentlyBomb = false;
    this.swipeActive = false;
    this.trailGfx.clear();

    if (winner === 'player') {
      this.playerWins += 1;
      SoundManager.playSfx('perfect');
      Haptics.trigger('win');
      this.setBig('K.O.', '#4ADE80');
    } else {
      this.didiWins += 1;
      SoundManager.playSfx('miss');
      Haptics.trigger('miss');
      this.setBig('ДИДИ ВЫРВАЛСЯ', '#EF4444');
    }
    this.tweens.add({
      targets: this.bigText, scale: { from: 1.6, to: 1 },
      duration: 350, ease: 'Back.easeOut',
    });
    this.cameras.main.shake(280, 0.012);
    this.updateUi();

    this.currentRoundIndex += 1;

    // Финал матча
    if (this.playerWins >= ROUNDS_TO_WIN || this.didiWins >= ROUNDS_TO_WIN) {
      this.time.delayedCall(1100, () => this.finishMatch());
      return;
    }
    if (this.currentRoundIndex >= ROUNDS_PER_MATCH) {
      this.time.delayedCall(1100, () => this.finishMatch());
      return;
    }

    // Перк перед следующим раундом
    this.time.delayedCall(900, () => {
      const next = this.pickRandomPerk();
      this.nextPerk = next;
      this.showPerkCard(next, () => this.startRound());
    });
  }

  private finishMatch(): void {
    if (this.finished) return;
    this.finished = true;

    if (this.didiTimer) this.didiTimer.remove();
    if (this.headstartTimer) this.headstartTimer.remove();
    if (this.playerUnlockTimer) this.playerUnlockTimer.remove();
    if (this.bombCycleTimer) this.bombCycleTimer.remove();

    const win = this.playerWins > this.didiWins;
    if (win) { SoundManager.playSfx('win'); Haptics.trigger('win'); }
    else     { SoundManager.playSfx('lose'); Haptics.trigger('lose'); }

    const { WIDTH, HEIGHT } = GAME;
    const overlay = this.add.rectangle(WIDTH / 2, HEIGHT / 2, WIDTH, HEIGHT, COLORS.black, 0.6);
    overlay.setDepth(DEPTH.modal);
    const msg = this.add.text(
      WIDTH / 2, HEIGHT / 2,
      win ? RU.minigame.win : RU.minigame.lose,
      { ...TEXT_STYLES.hero, fontSize: '56px', color: win ? '#4ADE80' : '#EF4444' },
    );
    msg.setOrigin(0.5);
    msg.setDepth(DEPTH.modal + 1);

    const score = Math.round((this.playerWins / ROUNDS_PER_MATCH) * 100);
    this.time.delayedCall(900, () => {
      this.complete({
        outcome: win ? 'win' : 'lose',
        score: Math.min(100, score),
        metadata: { playerWins: this.playerWins, didiWins: this.didiWins },
      });
    });
  }

  // ========== УТИЛИТЫ ==========

  /** Пересекает ли отрезок (a,b) окружность (cx,cy,r) — учитывает и случай,
   *  когда один или оба конца внутри круга. */
  private lineIntersectsCircle(ax: number, ay: number, bx: number, by: number, cx: number, cy: number, r: number): boolean {
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
    attachNoiseBackdrop(this, 'noise-chopchop', 500);
  }

  shutdown(): void {
    this.input.off('pointerdown', this.onPointerDown, this);
    this.input.off('pointermove', this.onPointerMove, this);
    this.input.off('pointerup', this.onPointerUp, this);
    if (this.didiTimer) this.didiTimer.remove();
    if (this.headstartTimer) this.headstartTimer.remove();
    if (this.playerUnlockTimer) this.playerUnlockTimer.remove();
    if (this.bombCycleTimer) this.bombCycleTimer.remove();
  }
}
