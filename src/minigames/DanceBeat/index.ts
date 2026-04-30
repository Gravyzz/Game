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
 * NEW-04 Потанцевать в бит.
 *
 * 4 цветные зоны (UP / DOWN / LEFT / RIGHT). Под бит вспыхивает одна из зон,
 * игрок должен тапнуть по ней до следующего бита.
 *  - В нужное окно → +1 хит, персонаж крутится.
 *  - Промах или мимо → миссы.
 *
 * Выигрыш: hits >= порога к концу таймера.
 *
 * Сложность:
 *  - Easy: интервал 850мс, окно ±320мс, порог 0.5.
 *  - Hard: интервал 480мс, окно ±200мс, порог 0.7.
 */

type Dir = 'up' | 'down' | 'left' | 'right';

interface Zone {
  dir: Dir;
  rect: Phaser.GameObjects.Rectangle;
  arrow: Phaser.GameObjects.Text;
  color: number;
  highlightColor: number;
  cx: number;
  cy: number;
  w: number;
  h: number;
}

interface PendingPrompt {
  dir: Dir;
  spawnTime: number;
  resolved: boolean;
}

export class DanceBeatScene extends BaseMinigame {
  private zones: Record<Dir, Zone> = {} as Record<Dir, Zone>;
  private dancer!: Phaser.GameObjects.Text;

  private hits = 0;
  private misses = 0;
  private totalPrompts = 0;

  private hitsText!: Phaser.GameObjects.Text;
  private timerText!: Phaser.GameObjects.Text;
  private comboText!: Phaser.GameObjects.Text;
  private combo = 0;
  private maxCombo = 0;

  private beatInterval = 700;
  private hitWindow = 280;
  private winRatio = 0.55;

  private timeLeftMs = 0;
  private gameTimer: Phaser.Time.TimerEvent | null = null;
  private beatTimer: Phaser.Time.TimerEvent | null = null;

  private pending: PendingPrompt | null = null;

  constructor() {
    super({ key: 'DanceBeat' });
  }

  create(): void {
    const { WIDTH, HEIGHT } = GAME;
    const diff = this.initData.difficulty;

    this.beatInterval = Math.round(Phaser.Math.Linear(850, 480, diff));
    this.hitWindow = Math.round(Phaser.Math.Linear(320, 200, diff));
    this.winRatio = Phaser.Math.Linear(0.5, 0.7, diff);

    // Фон
    this.add.rectangle(WIDTH / 2, HEIGHT / 2, WIDTH, HEIGHT, 0x121023);
    this.drawDiscoFloor();

    // Заголовок
    const title = new PosterText(this, WIDTH / 2, 80, 'ТАНЦПОЛ', {
      bgColor: COLORS.purple, textColor: '#FAF7F0',
      fontSize: '32px', rotation: -0.025, paddingX: 22, paddingY: 10,
    });
    title.setDepth(DEPTH.ui);
    this.add.existing(title);

    const hint = this.add.text(WIDTH / 2, 140, '👆 тапай зону, которая загорелась', {
      ...TEXT_STYLES.label, fontSize: '14px', color: '#FAF7F0',
    });
    hint.setOrigin(0.5);
    hint.setDepth(DEPTH.ui);

    // HUD
    this.hitsText = this.add.text(30, 30, '', {
      ...TEXT_STYLES.subtitle, fontSize: '20px', color: '#FAF7F0',
    });
    this.hitsText.setDepth(DEPTH.ui);

    this.timerText = this.add.text(WIDTH - 30, 30, '', {
      ...TEXT_STYLES.subtitle, fontSize: '22px', color: '#FAF7F0',
    });
    this.timerText.setOrigin(1, 0);
    this.timerText.setDepth(DEPTH.ui);

    this.comboText = this.add.text(WIDTH / 2, 200, '', {
      ...TEXT_STYLES.hero, fontSize: '40px', color: '#FFE600',
    });
    this.comboText.setOrigin(0.5);
    this.comboText.setDepth(DEPTH.ui);

    // Танцор
    this.dancer = this.add.text(WIDTH / 2, HEIGHT * 0.5, '🕺', { fontSize: '180px' });
    this.dancer.setOrigin(0.5);
    this.dancer.setDepth(DEPTH.gameplay);
    this.tweens.add({
      targets: this.dancer,
      scale: 1.05,
      duration: this.beatInterval,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });

    // Зоны: 4 ромба по сторонам
    const zoneW = 240;
    const zoneH = 140;
    const cy = HEIGHT * 0.82;
    this.makeZone('up',    WIDTH / 2,           cy - 200, zoneW, zoneH, COLORS.red,    0xff7878, '↑');
    this.makeZone('down',  WIDTH / 2,           cy + 200, zoneW, zoneH, COLORS.purple, 0xa68bff, '↓');
    this.makeZone('left',  WIDTH / 2 - 220,     cy,       zoneW, zoneH, COLORS.yellow, 0xffff80, '←');
    this.makeZone('right', WIDTH / 2 + 220,     cy,       zoneW, zoneH, COLORS.win,    0x88f4a4, '→');

    // Глобальный pointer для всей сцены — выбираем зону по позиции тапа
    this.input.on('pointerdown', this.onTap, this);

    this.timeLeftMs = this.initData.durationMs;
    this.gameTimer = this.time.addEvent({
      delay: 200,
      loop: true,
      callback: this.onTick,
      callbackScope: this,
    });

    // Первый бит — небольшая задержка для подготовки
    this.time.delayedCall(800, () => this.startBeats());

    this.updateHud();
    this.cameras.main.fadeIn(250, 10, 10, 10);
  }

  private makeZone(dir: Dir, x: number, y: number, w: number, h: number, color: number, highlightColor: number, arrow: string): void {
    const rect = this.add.rectangle(x, y, w, h, color, 0.4);
    rect.setStrokeStyle(4, COLORS.cream);
    rect.setDepth(DEPTH.gameplay);

    const arrowText = this.add.text(x, y, arrow, {
      ...TEXT_STYLES.hero, fontSize: '64px', color: '#FAF7F0',
    });
    arrowText.setOrigin(0.5);
    arrowText.setDepth(DEPTH.gameplay + 1);

    this.zones[dir] = { dir, rect, arrow: arrowText, color, highlightColor, cx: x, cy: y, w, h };
  }

  private startBeats(): void {
    this.beatTimer = this.time.addEvent({
      delay: this.beatInterval,
      loop: true,
      callback: this.spawnBeat,
      callbackScope: this,
    });
    this.spawnBeat(); // первый бит сразу
  }

  private spawnBeat(): void {
    // Если предыдущий не разрешён — засчитываем как промах
    if (this.pending && !this.pending.resolved) {
      this.misses += 1;
      this.combo = 0;
      this.flashFeedback('MISS', '#EF4444');
    }

    const dirs: Dir[] = ['up', 'down', 'left', 'right'];
    const dir = dirs[Math.floor(Math.random() * dirs.length)];

    this.pending = { dir, spawnTime: this.time.now, resolved: false };
    this.totalPrompts += 1;

    // Подсветка зоны
    const zone = this.zones[dir];
    zone.rect.setFillStyle(zone.highlightColor, 0.85);
    this.tweens.add({
      targets: zone.rect,
      scaleX: 1.08,
      scaleY: 1.08,
      duration: 120,
      yoyo: true,
    });
    SoundManager.playSfx('tap');

    // По истечении окна — погасить
    this.time.delayedCall(this.hitWindow, () => {
      zone.rect.setFillStyle(zone.color, 0.4);
    });

    this.updateHud();
  }

  private onTap(pointer: Phaser.Input.Pointer): void {
    if (!this.pending || this.pending.resolved) return;

    // Определяем, в какую зону попал тап
    let hitZone: Zone | null = null;
    for (const z of Object.values(this.zones)) {
      const left = z.cx - z.w / 2;
      const right = z.cx + z.w / 2;
      const top = z.cy - z.h / 2;
      const bot = z.cy + z.h / 2;
      if (pointer.x >= left && pointer.x <= right && pointer.y >= top && pointer.y <= bot) {
        hitZone = z;
        break;
      }
    }
    if (!hitZone) return;

    const elapsed = this.time.now - this.pending.spawnTime;
    if (elapsed > this.hitWindow) return; // окно уже закрылось

    if (hitZone.dir === this.pending.dir) {
      // Попадание
      this.pending.resolved = true;
      this.hits += 1;
      this.combo += 1;
      this.maxCombo = Math.max(this.maxCombo, this.combo);
      SoundManager.playSfx('perfect');
      Haptics.trigger('perfect');
      this.flashFeedback(`HIT! +${this.combo}`, '#4ADE80');

      // Танцор подпрыгивает
      this.tweens.add({
        targets: this.dancer,
        angle: this.combo % 2 === 0 ? -20 : 20,
        duration: 120,
        yoyo: true,
      });
      // Зона ярко вспыхивает
      this.tweens.add({
        targets: hitZone.rect,
        scaleX: 1.15,
        scaleY: 1.15,
        duration: 120,
        yoyo: true,
      });
    } else {
      // Тап не туда → промах
      this.pending.resolved = true;
      this.misses += 1;
      this.combo = 0;
      SoundManager.playSfx('miss');
      Haptics.trigger('miss');
      this.flashFeedback('NOT HERE', '#EF4444');
    }

    this.updateHud();
  }

  private flashFeedback(text: string, color: string): void {
    this.comboText.setText(text);
    this.comboText.setColor(color);
    this.comboText.setAlpha(1);
    this.tweens.add({
      targets: this.comboText,
      alpha: 0,
      duration: 600,
      delay: 200,
    });
  }

  private updateHud(): void {
    this.hitsText.setText(`✅ ${this.hits}   ❌ ${this.misses}`);
  }

  private drawDiscoFloor(): void {
    const { WIDTH, HEIGHT } = GAME;
    const g = this.add.graphics();
    const colors = [0x7a5cff, 0xff2e2e, 0xffe600, 0x4ade80];
    const tile = 80;
    for (let y = 0; y < HEIGHT; y += tile) {
      for (let x = 0; x < WIDTH; x += tile) {
        const c = colors[(Math.floor(x / tile) + Math.floor(y / tile)) % colors.length];
        g.fillStyle(c, 0.08);
        g.fillRect(x, y, tile, tile);
      }
    }
    g.setDepth(DEPTH.background);
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
    if (this.gameTimer) this.gameTimer.remove();
    if (this.beatTimer) this.beatTimer.remove();

    const ratio = this.totalPrompts > 0 ? this.hits / this.totalPrompts : 0;
    const win = ratio >= this.winRatio && this.hits >= 5;
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

    const score = Math.round(ratio * 100);
    this.time.delayedCall(900, () => {
      this.complete({
        outcome: win ? 'win' : 'lose',
        score: Math.min(100, score),
        metadata: { hits: this.hits, misses: this.misses, maxCombo: this.maxCombo },
      });
    });
  }

  shutdown(): void {
    this.input.off('pointerdown', this.onTap, this);
    if (this.gameTimer) this.gameTimer.remove();
    if (this.beatTimer) this.beatTimer.remove();
  }
}
