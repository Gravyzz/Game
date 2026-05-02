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
 * NEW-01 Серфер на доске.
 *
 * Раннер сбоку. Серфер автоматически едет на доске, экран прокручивается.
 * Тап = прыжок через препятствие. Свайп вниз = пригнуться под волну.
 * 3 жизни. Бонусные ⭐ дают очки.
 *
 * Сложность:
 *  - Easy: скорость 320 px/s, спавн 1600мс.
 *  - Hard: скорость 580 px/s, спавн 900мс.
 */

const WAVE_Y_RATIO = 0.78;
const SURFER_X = 220;

interface Hazard {
  emoji: string;
  text: Phaser.GameObjects.Text;
  type: 'rock' | 'shark' | 'bird' | 'star';
  width: number;
  alive: boolean;
  collected?: boolean;
}

export class SurferScene extends BaseMinigame {
  private surfer!: Phaser.GameObjects.Text;
  private board!: Phaser.GameObjects.Rectangle;

  private hazards: Hazard[] = [];

  private state: 'run' | 'jump' | 'duck' = 'run';
  private invincibleUntil = 0;

  private lives = 3;
  private score = 0;

  private livesText!: Phaser.GameObjects.Text;
  private scoreText!: Phaser.GameObjects.Text;
  private timerText!: Phaser.GameObjects.Text;

  private speed = 320;
  private spawnInterval = 1600;
  private timeLeftMs = 0;

  private waveY = 0;
  private waveGfx!: Phaser.GameObjects.Graphics;
  private waveT = 0;

  private spawnTimer: Phaser.Time.TimerEvent | null = null;
  private gameTimer: Phaser.Time.TimerEvent | null = null;
  private finished = false;

  private dragStartY = 0;
  private dragging = false;

  private clouds: Phaser.GameObjects.Text[] = [];

  constructor() {
    super({ key: 'Surfer' });
  }

  create(): void {
    const { WIDTH, HEIGHT } = GAME;
    const diff = this.initData.difficulty;

    this.speed = Phaser.Math.Linear(320, 580, diff);
    this.spawnInterval = Math.round(Phaser.Math.Linear(1600, 900, diff));

    this.waveY = HEIGHT * WAVE_Y_RATIO;

    // Небо — голубой градиент
    this.add.rectangle(WIDTH / 2, HEIGHT / 2, WIDTH, HEIGHT, 0x4ec3ff);
    // Солнце
    const sun = this.add.circle(WIDTH - 140, 220, 70, COLORS.yellow);
    sun.setAlpha(0.85);
    sun.setDepth(DEPTH.background + 1);
    this.tweens.add({ targets: sun, scale: 1.05, duration: 1400, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });

    // Облака
    for (let i = 0; i < 5; i++) {
      const c = this.add.text(
        Math.random() * WIDTH,
        100 + Math.random() * 350,
        '☁️',
        { fontSize: `${50 + Math.random() * 30}px` }
      );
      c.setOrigin(0.5);
      c.setAlpha(0.85);
      c.setDepth(DEPTH.background + 2);
      this.clouds.push(c);
    }

    // Море — глубокий синий
    const sea = this.add.rectangle(WIDTH / 2, this.waveY + (HEIGHT - this.waveY) / 2, WIDTH, HEIGHT - this.waveY + 20, 0x1d4ed8);
    sea.setDepth(DEPTH.midground);

    // Волна — анимированная синусоида
    this.waveGfx = this.add.graphics();
    this.waveGfx.setDepth(DEPTH.midground + 1);

    // Заголовок
    const title = new PosterText(this, WIDTH / 2, 80, 'СЁРФЕР', {
      bgColor: COLORS.red,
      textColor: '#FAF7F0',
      fontSize: '32px',
      rotation: -0.025,
      paddingX: 22,
      paddingY: 10,
    });
    title.setDepth(DEPTH.ui);
    this.add.existing(title);

    const hint = this.add.text(WIDTH / 2, 140, '👆 ТАП — прыжок · СВАЙП ВНИЗ — пригнуться · ⭐ — очки', {
      ...TEXT_STYLES.label,
      fontSize: '13px',
      color: '#FAF7F0',
    });
    hint.setOrigin(0.5);
    hint.setDepth(DEPTH.ui);

    // HUD
    this.livesText = this.add.text(30, 30, '', {
      ...TEXT_STYLES.subtitle, fontSize: '24px', color: '#FAF7F0',
    });
    this.livesText.setDepth(DEPTH.ui);
    this.scoreText = this.add.text(WIDTH / 2, 30, '', {
      ...TEXT_STYLES.subtitle, fontSize: '20px', color: '#FFE600',
    });
    this.scoreText.setOrigin(0.5, 0);
    this.scoreText.setDepth(DEPTH.ui);
    this.timerText = this.add.text(WIDTH - 30, 30, '', {
      ...TEXT_STYLES.subtitle, fontSize: '22px', color: '#FAF7F0',
    });
    this.timerText.setOrigin(1, 0);
    this.timerText.setDepth(DEPTH.ui);

    // Доска под серфером
    this.board = this.add.rectangle(SURFER_X, this.waveY - 12, 130, 16, COLORS.cream);
    this.board.setStrokeStyle(3, COLORS.black);
    this.board.setDepth(DEPTH.gameplay);

    // Серфер
    this.surfer = this.add.text(SURFER_X, this.waveY - 22, '🏄', { fontSize: '92px' });
    this.surfer.setOrigin(0.5, 1);
    this.surfer.setDepth(DEPTH.gameplay + 1);

    // Инпут
    this.input.on('pointerdown', this.onPointerDown, this);
    this.input.on('pointerup',   this.onPointerUp,   this);

    this.timeLeftMs = this.initData.durationMs;
    this.spawnTimer = this.time.addEvent({
      delay: this.spawnInterval,
      loop: true,
      callback: this.spawnHazard,
      callbackScope: this,
    });
    this.gameTimer = this.time.addEvent({
      delay: 200,
      loop: true,
      callback: this.onTick,
      callbackScope: this,
    });

    this.updateLives();
    this.updateScore();
    this.cameras.main.fadeIn(250, 10, 10, 10);
  }

  override update(_t: number, dtMs: number): void {
    const dt = dtMs / 1000;
    const { WIDTH } = GAME;

    // Облака
    for (const c of this.clouds) {
      c.x -= this.speed * 0.08 * dt;
      if (c.x < -80) c.x = WIDTH + 80;
    }

    // Волна
    this.waveT += dt * 2.4;
    this.drawWave();

    // Препятствия
    for (const h of this.hazards) {
      if (!h.alive) continue;
      h.text.x -= this.speed * dt;
      // Звезда чуть качается вверх-вниз
      if (h.type === 'star') {
        h.text.y += Math.sin((h.text.x + this.waveT * 100) * 0.02) * 0.5;
      }
      if (h.text.x < -h.width) {
        h.alive = false;
        h.text.destroy();
        continue;
      }
      this.checkCollision(h);
    }
    this.hazards = this.hazards.filter(h => h.alive);

    // Покачивание доски и серфера от волны
    const wave = Math.sin(this.waveT * 1.5) * 4;
    if (this.state === 'run') {
      this.board.y = this.waveY - 12 + wave;
      this.surfer.y = this.waveY - 22 + wave;
    }
  }

  private drawWave(): void {
    const { WIDTH } = GAME;
    this.waveGfx.clear();
    this.waveGfx.fillStyle(0x06b6d4, 0.6);
    this.waveGfx.beginPath();
    this.waveGfx.moveTo(0, this.waveY + 40);
    for (let x = 0; x <= WIDTH; x += 16) {
      const y = this.waveY + 4 + Math.sin((x + this.waveT * 120) * 0.012) * 10;
      this.waveGfx.lineTo(x, y);
    }
    this.waveGfx.lineTo(WIDTH, this.waveY + 80);
    this.waveGfx.lineTo(0, this.waveY + 80);
    this.waveGfx.closePath();
    this.waveGfx.fillPath();
  }

  private spawnHazard(): void {
    const { WIDTH } = GAME;
    const roll = Math.random();
    let type: Hazard['type'];
    let emoji: string;
    let y: number;

    if (roll < 0.20) {
      type = 'star';
      emoji = '⭐';
      y = this.waveY - 180;
    } else if (roll < 0.45) {
      type = 'bird';   // надо пригибаться — летит на уровне головы серфера
      emoji = '🪁';
      y = this.waveY - 100;
    } else if (roll < 0.75) {
      type = 'rock';   // надо прыгать
      emoji = '🪨';
      y = this.waveY - 16;
    } else {
      type = 'shark';
      emoji = '🦈';
      y = this.waveY - 16;
    }

    const text = this.add.text(WIDTH + 80, y, emoji, { fontSize: '76px' });
    text.setOrigin(0.5, 1);
    text.setDepth(DEPTH.gameplay);

    this.hazards.push({ emoji, text, type, width: 84, alive: true });
  }

  // ===== Управление =====

  private onPointerDown(pointer: Phaser.Input.Pointer): void {
    this.dragStartY = pointer.y;
    this.dragging = true;
  }

  private onPointerUp(pointer: Phaser.Input.Pointer): void {
    if (!this.dragging) return;
    this.dragging = false;

    const dy = pointer.y - this.dragStartY;
    if (dy > 60) {
      this.duck();
    } else {
      this.jump();
    }
  }

  private jump(): void {
    if (this.state !== 'run') return;
    this.state = 'jump';
    SoundManager.playSfx('tap');
    Haptics.trigger('tap');

    // Прыжок чуть ниже верхней границы птицы — чтобы визуально серфер
    // не пролетал поверх летящих хазардов, а тех, что на воде, перепрыгивал.
    const peakY = this.waveY - 170;
    this.tweens.add({
      targets: [this.surfer],
      y: peakY,
      duration: 320,
      ease: 'Sine.easeOut',
      yoyo: true,
      onComplete: () => { this.state = 'run'; },
    });
    this.tweens.add({
      targets: [this.board],
      y: peakY + 10,
      duration: 320,
      ease: 'Sine.easeOut',
      yoyo: true,
    });
  }

  private duck(): void {
    if (this.state !== 'run') return;
    this.state = 'duck';
    SoundManager.playSfx('tap');
    Haptics.trigger('tap');
    this.surfer.setScale(1, 0.6);
    this.time.delayedCall(550, () => {
      this.surfer.setScale(1, 1);
      this.state = 'run';
    });
  }

  // ===== Коллизии =====

  private checkCollision(h: Hazard): void {
    if (h.collected) return;
    const left  = h.text.x - h.width / 2;
    const right = h.text.x + h.width / 2;
    if (right < SURFER_X - 50 || left > SURFER_X + 50) return;

    if (h.type === 'star') {
      // Бонус — собираем
      h.collected = true;
      h.alive = false;
      this.score += 25;
      this.updateScore();
      SoundManager.playSfx('good');
      Haptics.trigger('good');
      const fx = this.add.text(h.text.x, h.text.y, '+25', {
        ...TEXT_STYLES.subtitle, fontSize: '24px', color: '#FFE600',
      });
      fx.setOrigin(0.5);
      fx.setDepth(DEPTH.effects);
      this.tweens.add({
        targets: fx, y: fx.y - 60, alpha: 0, duration: 600,
        onComplete: () => fx.destroy(),
      });
      h.text.destroy();
      return;
    }

    if (this.time.now < this.invincibleUntil) return;

    let hit = false;
    if ((h.type === 'rock' || h.type === 'shark') && this.state !== 'jump') hit = true;
    if (h.type === 'bird' && this.state !== 'duck') hit = true;

    if (hit) {
      this.takeDamage(h);
    } else {
      h.alive = false;
      h.text.destroy();
    }
  }

  private takeDamage(h: Hazard): void {
    this.invincibleUntil = this.time.now + 700;
    this.lives -= 1;
    SoundManager.playSfx('miss');
    Haptics.trigger('miss');
    this.updateLives();

    this.tweens.add({
      targets: [this.surfer, this.board], alpha: 0.3,
      duration: 100, yoyo: true, repeat: 3,
      onComplete: () => { this.surfer.setAlpha(1); this.board.setAlpha(1); },
    });
    this.cameras.main.shake(180, 0.012);

    h.alive = false;
    h.text.destroy();

    if (this.lives <= 0) this.finish(false);
  }

  private updateLives(): void {
    this.livesText.setText('❤️'.repeat(Math.max(0, this.lives)) + '🖤'.repeat(Math.max(0, 3 - this.lives)));
  }

  private updateScore(): void {
    this.scoreText.setText(`⭐ ${this.score}`);
  }

  private onTick(): void {
    this.timeLeftMs -= 200;
    const sec = Math.max(0, Math.ceil(this.timeLeftMs / 1000));
    this.timerText.setText(`⏱ ${sec}`);
    this.speed += 0.12;
    if (this.timeLeftMs <= 0 && this.lives > 0) this.finish(true);
  }

  private finish(win: boolean): void {
    if (this.finished) return;
    this.finished = true;

    if (this.spawnTimer) this.spawnTimer.remove();
    if (this.gameTimer)  this.gameTimer.remove();

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

    const finalScore = win ? Math.round(50 + this.lives * 10 + this.score / 5) : Math.round(this.score / 5);
    this.time.delayedCall(900, () => {
      this.complete({
        outcome: win ? 'win' : 'lose',
        score: Math.min(100, finalScore),
        metadata: { livesLeft: this.lives, stars: this.score / 25 },
      });
    });
  }

  shutdown(): void {
    this.input.off('pointerdown', this.onPointerDown, this);
    this.input.off('pointerup',   this.onPointerUp,   this);
    if (this.spawnTimer) this.spawnTimer.remove();
    if (this.gameTimer)  this.gameTimer.remove();
  }
}
