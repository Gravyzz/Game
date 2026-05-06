import Phaser from 'phaser';
import { BaseMinigame } from '@minigames/BaseMinigame';
import { COLORS } from '@config/colors';
import { TEXT_STYLES } from '@config/fonts';
import { GAME, DEPTH } from '@config/game';
import { RU } from '@i18n/ru';
import { PosterText } from '@ui/PosterText';
import { SoundManager } from '@core/SoundManager';
import { Haptics } from '@core/Haptics';
import { paintPageBackdrop } from '@utils/SceneHelpers';

/**
 * NEW-01 СЁРФЕР НА ВОЛНЕ — Flappy Bird в трёх стейджах.
 *
 * Тап → импульс вверх. Гравитация тянет вниз. Проходи между парами препятствий.
 *  1. ПЛЯЖ   — широкие зазоры, медленная скорость, тёплое море.
 *  2. РИФ    — уже зазоры, быстрее, закатное небо.
 *  3. ШТОРМ — самые узкие зазоры + бонусы (⭐ 🛟 🍺) + молнии в небе.
 *
 * Сверху — каменные/коралловые/грозовые столбы (свисают с неба).
 * Снизу — гигантские волны (вздымаются с моря) с белой пенной шапкой.
 *
 * Жизни (3) переносятся между стейджами, +1 бонус между ними.
 */

const W  = GAME.WIDTH;
const H  = GAME.HEIGHT;
const CX = W / 2;
const SURFER_X = 200;

const CEILING_Y = 240;
const FLOOR_Y   = H - 120;

// Мягкая физика — Flappy-feel без чугунной гравитации
const GRAVITY  = 1500;
const JUMP_VY  = -540;
const SURFER_R = 32;

const PILLAR_W = 100;

interface Stage {
  name:          string;
  color:         string;
  bgSky:         number;
  bgSea:         number;
  waveColor:     number;     // цвет нижней волны-препятствия
  speed:         number;
  gap:           number;
  spawnInterval: number;
  goal:          number;
  hasPowerUps:   boolean;
  hasLightning:  boolean;
  pillarColor:   number;     // цвет верхнего столба
  pillarStroke:  number;
  capEmoji:      string;
  hint:          string;
}

const STAGES: Stage[] = [
  {
    name: 'ПЛЯЖ', color: '#4ADE80',
    bgSky: 0x4ec3ff, bgSea: 0x1d4ed8, waveColor: 0x06b6d4,
    speed: 270, gap: 380, spawnInterval: 1600, goal: 5,
    hasPowerUps: false, hasLightning: false,
    pillarColor: 0x8b5a2b, pillarStroke: 0x4a2e15, capEmoji: '🪨',
    hint: '👆 ТАП — прыжок  •  пройди 5 проходов',
  },
  {
    name: 'РИФ', color: '#FFE600',
    bgSky: 0xfdba74, bgSea: 0x7c2d12, waveColor: 0xfb923c,
    speed: 330, gap: 320, spawnInterval: 1400, goal: 7,
    hasPowerUps: false, hasLightning: false,
    pillarColor: 0xea580c, pillarStroke: 0x7c2d12, capEmoji: '🪸',
    hint: 'уже зазоры  •  быстрее  •  7 проходов',
  },
  {
    name: 'ШТОРМ', color: '#FF2E2E',
    bgSky: 0x1e293b, bgSea: 0x0f172a, waveColor: 0x475569,
    speed: 380, gap: 270, spawnInterval: 1250, goal: 9,
    hasPowerUps: true, hasLightning: true,
    pillarColor: 0x334155, pillarStroke: 0x0a0a0a, capEmoji: '⚡',
    hint: 'хватай ⭐ 🛟 🍺  •  9 проходов',
  },
];

const TOTAL_STAGES = STAGES.length;

interface Pillar {
  topRect:    Phaser.GameObjects.Rectangle;
  topCap:     Phaser.GameObjects.Text;
  bot:        Phaser.GameObjects.Graphics;   // волна снизу
  gapTopY:    number;
  gapBottomY: number;
  passed:     boolean;
  alive:      boolean;
}

type PowerUpType = 'star' | 'shield' | 'slowmo';

interface PowerUp {
  type:  PowerUpType;
  text:  Phaser.GameObjects.Text;
  alive: boolean;
  pulse: Phaser.Tweens.Tween | null;
}

export class SurferScene extends BaseMinigame {
  // Stage state
  private stageIdx    = 0;
  private stage!:       Stage;
  private stagePassed = 0;
  private starCount   = 0;

  // Surfer
  private surfer!: Phaser.GameObjects.Text;
  private board!:  Phaser.GameObjects.Rectangle;
  private surferY  = 0;
  private surferVY = 0;

  // Lives & buffs
  private lives           = 3;
  private maxLives        = 3;
  private invincibleUntil = 0;
  private shieldActive    = false;
  private timeScale       = 1;

  // Flow flags
  private finished     = false;
  private inTransition = false;
  private canPlay      = false;

  // Background
  private bgSky!:   Phaser.GameObjects.Rectangle;
  private bgSea!:   Phaser.GameObjects.Rectangle;
  private waveGfx!: Phaser.GameObjects.Graphics;
  private waveT  = 0;
  private clouds: Phaser.GameObjects.Text[] = [];
  private sun!:    Phaser.GameObjects.Arc;
  private sunTw:   Phaser.Tweens.Tween | null = null;

  // Obstacles
  private pillars:  Pillar[] = [];
  private powerUps: PowerUp[] = [];
  private spawnTimer:     Phaser.Time.TimerEvent | null = null;
  private powerUpTimer:   Phaser.Time.TimerEvent | null = null;
  private lightningTimer: Phaser.Time.TimerEvent | null = null;

  // Shield aura
  private shieldRing: Phaser.GameObjects.Arc | null = null;
  private shieldTw:   Phaser.Tweens.Tween    | null = null;

  // UI
  private stageLbl!:  Phaser.GameObjects.Text;
  private livesLbl!:  Phaser.GameObjects.Text;
  private progLbl!:   Phaser.GameObjects.Text;

  constructor() { super({ key: 'Surfer' }); }

  // ─── lifecycle ─────────────────────────────────────────────────────────────

  create(): void {
    this.stageIdx        = 0;
    this.stage           = STAGES[0];
    this.stagePassed     = 0;
    this.starCount       = 0;
    this.lives           = 3;
    this.maxLives        = 3;
    this.invincibleUntil = 0;
    this.shieldActive    = false;
    this.timeScale       = 1;
    this.finished        = false;
    this.inTransition    = true;
    this.canPlay         = false;
    this.pillars         = [];
    this.powerUps        = [];
    this.surferVY        = 0;
    this.surferY         = (CEILING_Y + FLOOR_Y) / 2;

    // Sky
    paintPageBackdrop(this, this.stage.bgSky);
    this.bgSky = this.add.rectangle(CX, H / 2, W, H, this.stage.bgSky)
      .setDepth(DEPTH.background);

    // Sun
    this.sun = this.add.circle(W - 140, 230, 70, COLORS.yellow);
    this.sun.setAlpha(0.85).setDepth(DEPTH.background + 1);
    this.sunTw = this.tweens.add({
      targets: this.sun, scale: 1.05,
      duration: 1400, yoyo: true, repeat: -1, ease: 'Sine.easeInOut',
    });

    // Clouds
    for (let i = 0; i < 5; i++) {
      const c = this.add.text(
        Math.random() * W,
        100 + Math.random() * 250,
        '☁️',
        { fontSize: `${50 + Math.random() * 30}px` }
      );
      c.setOrigin(0.5).setAlpha(0.85).setDepth(DEPTH.background + 2);
      this.clouds.push(c);
    }

    // Sea + анимированная фоновая волна
    const seaY = FLOOR_Y + (H - FLOOR_Y) / 2;
    const seaH = H - FLOOR_Y;
    this.bgSea = this.add.rectangle(CX, seaY, W, seaH, this.stage.bgSea)
      .setDepth(DEPTH.midground);
    this.waveGfx = this.add.graphics().setDepth(DEPTH.midground + 1);

    // Title
    const title = new PosterText(this, CX, 70, 'СЁРФЕР', {
      bgColor: COLORS.red, textColor: '#FAF7F0',
      fontSize: '28px', rotation: -0.025, paddingX: 22, paddingY: 10,
    });
    title.setDepth(DEPTH.ui);
    this.add.existing(title);

    this.stageLbl = this.add
      .text(CX, 110, '', { ...TEXT_STYLES.subtitle, fontSize: '16px', color: this.stage.color })
      .setOrigin(0.5, 0).setDepth(DEPTH.ui);

    this.livesLbl = this.add
      .text(28, 145, '', { ...TEXT_STYLES.subtitle, fontSize: '24px', color: '#FAF7F0' })
      .setDepth(DEPTH.ui);

    this.progLbl = this.add
      .text(W - 28, 145, '', { ...TEXT_STYLES.subtitle, fontSize: '20px', color: '#FAF7F0' })
      .setOrigin(1, 0).setDepth(DEPTH.ui);

    // Surfer board + emoji
    this.board = this.add.rectangle(SURFER_X, this.surferY + 28, 110, 14, COLORS.cream);
    this.board.setStrokeStyle(3, COLORS.black);
    this.board.setDepth(DEPTH.gameplay);

    this.surfer = this.add.text(SURFER_X, this.surferY, '🏄', { fontSize: '76px' });
    this.surfer.setOrigin(0.5).setDepth(DEPTH.gameplay + 1);

    // Input
    this.input.on('pointerdown', this.onTap, this);

    this.refreshHud();
    this.cameras.main.fadeIn(300, 10, 10, 10);

    // Intro stage 1
    this.showStageBanner(this.stage, () => {
      if (this.finished) return;
      this.startStage(0);
      this.canPlay      = true;
      this.inTransition = false;
    });
  }

  override update(_t: number, dtMs: number): void {
    if (this.finished) return;

    const dt = Math.min(dtMs, 33) / 1000 * this.timeScale;

    // Wave anim
    this.waveT += dt * 2.4;
    this.drawWave();

    // Clouds drift
    for (const c of this.clouds) {
      c.x -= this.stage.speed * 0.06 * dt;
      if (c.x < -80) c.x = W + 80;
    }

    if (!this.canPlay) {
      // Idle bobble
      this.surfer.y = this.surferY + Math.sin(this.waveT) * 4;
      this.board.y  = this.surferY + 28 + Math.sin(this.waveT) * 4;
      return;
    }

    // Surfer physics
    this.surferVY += GRAVITY * dt;
    this.surferY  += this.surferVY * dt;

    // Tilt by velocity
    const tilt = Phaser.Math.Clamp(this.surferVY / 800, -0.5, 0.7);
    this.surfer.setRotation(tilt);
    this.board.setRotation(tilt);

    this.surfer.y = this.surferY;
    this.board.y  = this.surferY + 28;

    if (this.shieldRing) this.shieldRing.setPosition(SURFER_X, this.surferY);

    if (this.surferY < CEILING_Y) {
      this.surferY  = CEILING_Y;
      this.surferVY = 0;
    }
    if (this.surferY > FLOOR_Y && this.time.now > this.invincibleUntil) {
      this.handleHit();
    }

    // Pillars
    const speed = this.stage.speed;
    for (const p of this.pillars) {
      if (!p.alive) continue;
      const move = speed * dt;
      p.topRect.x -= move;
      p.topCap.x   = p.topRect.x;
      p.bot.x     -= move;

      if (p.topRect.x < -PILLAR_W) {
        p.alive = false;
        this.destroyPillar(p);
        continue;
      }

      if (!p.passed && p.topRect.x < SURFER_X - PILLAR_W / 2) {
        p.passed = true;
        this.onPassPillar();
      }

      if (this.time.now > this.invincibleUntil && this.checkPillarCollision(p)) {
        this.handleHit();
      }
    }
    this.pillars = this.pillars.filter(p => p.alive);

    // Power-ups
    for (const pu of this.powerUps) {
      if (!pu.alive) continue;
      pu.text.x -= speed * dt;
      pu.text.y += Math.sin((pu.text.x + this.waveT * 100) * 0.02) * 0.4;

      if (pu.text.x < -50) {
        pu.alive = false;
        this.destroyPowerUp(pu);
        continue;
      }
      if (this.checkPowerUpCollision(pu)) {
        this.applyPowerUp(pu.type, pu.text.x, pu.text.y);
        pu.alive = false;
        this.destroyPowerUp(pu);
      }
    }
    this.powerUps = this.powerUps.filter(pu => pu.alive);
  }

  shutdown(): void {
    this.input.off('pointerdown', this.onTap, this);
    this.spawnTimer?.remove();
    this.powerUpTimer?.remove();
    this.lightningTimer?.remove();
    this.sunTw?.stop();
    this.shieldTw?.stop();
    this.tweens.killAll();
  }

  // ─── stage flow ────────────────────────────────────────────────────────────

  private startStage(idx: number): void {
    this.stageIdx    = idx;
    this.stage       = STAGES[idx];
    this.stagePassed = 0;

    this.bgSky.setFillStyle(this.stage.bgSky);
    this.bgSea.setFillStyle(this.stage.bgSea);
    const skyHex = '#' + this.stage.bgSky.toString(16).padStart(6, '0');
    document.body.style.background = skyHex;
    document.documentElement.style.background = skyHex;
    const app = document.getElementById('app');
    if (app) app.style.background = skyHex;
    this.sun.setVisible(!this.stage.hasLightning);
    if (this.stage.name === 'РИФ') this.sun.setFillStyle(0xfb923c);
    else                            this.sun.setFillStyle(COLORS.yellow);

    this.refreshHud();

    this.spawnTimer = this.time.addEvent({
      delay: this.stage.spawnInterval,
      loop: true,
      callback: this.spawnPillar,
      callbackScope: this,
    });

    if (this.stage.hasPowerUps) {
      this.powerUpTimer = this.time.addEvent({
        delay: 4500,
        loop: true,
        callback: this.spawnPowerUp,
        callbackScope: this,
      });
    }
    if (this.stage.hasLightning) {
      this.lightningTimer = this.time.addEvent({
        delay: 3500,
        loop: true,
        callback: this.flashLightning,
        callbackScope: this,
      });
    }
  }

  private completeStage(): void {
    if (this.inTransition || this.finished) return;
    this.inTransition = true;
    this.canPlay      = false;
    this.spawnTimer?.remove();
    this.powerUpTimer?.remove();
    this.lightningTimer?.remove();
    this.spawnTimer    = null;
    this.powerUpTimer  = null;
    this.lightningTimer = null;

    if (this.lives < this.maxLives) this.lives++;
    this.refreshHud();

    for (const p of this.pillars) {
      if (!p.alive) continue;
      p.alive = false;
      this.tweens.add({
        targets: [p.topRect, p.topCap, p.bot],
        alpha: 0, duration: 400,
        onComplete: () => this.destroyPillar(p),
      });
    }
    for (const pu of this.powerUps) {
      if (!pu.alive) continue;
      pu.alive = false;
      pu.pulse?.stop();
      this.tweens.add({
        targets: pu.text, alpha: 0, scale: 0.6, duration: 400,
        onComplete: () => pu.text.destroy(),
      });
    }
    this.pillars  = [];
    this.powerUps = [];

    const banner = this.add
      .text(CX, H / 2, 'СТЕЙДЖ ПРОЙДЕН!', {
        ...TEXT_STYLES.hero, fontSize: '46px', color: '#4ADE80',
      })
      .setOrigin(0.5).setDepth(DEPTH.toast).setAlpha(0).setScale(0.85);

    SoundManager.playSfx('win');
    Haptics.trigger('win');

    this.tweens.add({ targets: banner, alpha: 1, scale: 1, duration: 280, ease: 'Cubic.easeOut' });
    this.tweens.add({
      targets: banner, alpha: 0, y: H / 2 - 20,
      delay: 700, duration: 350, ease: 'Sine.easeIn',
      onComplete: () => banner.destroy(),
    });

    this.time.delayedCall(900, () => {
      if (this.finished) return;
      const nextIdx = this.stageIdx + 1;
      if (nextIdx >= TOTAL_STAGES) {
        this.finish(true);
        return;
      }
      const next = STAGES[nextIdx];

      this.bgSky.setFillStyle(next.bgSky);
      this.bgSea.setFillStyle(next.bgSea);
      this.sun.setVisible(!next.hasLightning);

      this.showStageBanner(next, () => {
        if (this.finished) return;
        this.startStage(nextIdx);
        this.canPlay      = true;
        this.inTransition = false;
        this.surferY  = (CEILING_Y + FLOOR_Y) / 2;
        this.surferVY = 0;
      });
    });
  }

  private showStageBanner(stage: Stage, after: () => void): void {
    const idx = STAGES.indexOf(stage);

    const txt = this.add
      .text(CX, H / 2 - 24, `${stage.name}  ${idx + 1}/${TOTAL_STAGES}`, {
        ...TEXT_STYLES.hero, fontSize: '60px', color: stage.color,
      })
      .setOrigin(0.5).setDepth(DEPTH.toast).setAlpha(0).setScale(0.7);

    const hint = this.add
      .text(CX, H / 2 + 36, stage.hint, {
        ...TEXT_STYLES.subtitle, fontSize: '17px', color: '#FAF7F0',
      })
      .setOrigin(0.5).setDepth(DEPTH.toast).setAlpha(0);

    this.tweens.add({ targets: txt,  alpha: 1, scale: 1, duration: 360, ease: 'Cubic.easeOut' });
    this.tweens.add({ targets: hint, alpha: 1,           duration: 360, delay: 120, ease: 'Cubic.easeOut' });

    this.tweens.add({
      targets: [txt, hint], alpha: 0, y: '-=30',
      delay: 1300, duration: 400, ease: 'Sine.easeIn',
      onComplete: () => { txt.destroy(); hint.destroy(); after(); },
    });
  }

  // ─── pillars ───────────────────────────────────────────────────────────────

  private spawnPillar(): void {
    if (this.inTransition || this.finished) return;

    const gap = this.stage.gap;
    const minCenter = CEILING_Y + gap / 2 + 60;
    const maxCenter = FLOOR_Y - gap / 2 - 60;
    const gapCenter = Phaser.Math.Between(minCenter, maxCenter);
    const gapTopY    = gapCenter - gap / 2;
    const gapBottomY = gapCenter + gap / 2;

    const x = W + PILLAR_W;

    // ВЕРХ — каменный/коралловый/грозовой столб
    const topH = gapTopY;
    const topRect = this.add.rectangle(x, 0, PILLAR_W, topH, this.stage.pillarColor)
      .setOrigin(0.5, 0)
      .setStrokeStyle(4, this.stage.pillarStroke)
      .setDepth(DEPTH.gameplay);
    const topCap = this.add.text(x, gapTopY - 26, this.stage.capEmoji, { fontSize: '46px' })
      .setOrigin(0.5)
      .setDepth(DEPTH.gameplay + 1);

    // НИЗ — волна с пенной шапкой
    const bot = this.makeWaveObstacle(x, gapBottomY, FLOOR_Y - gapBottomY);

    this.pillars.push({
      topRect, topCap, bot,
      gapTopY, gapBottomY,
      passed: false, alive: true,
    });
  }

  /** Препятствие-волна: заливная wavy-форма + белая пена сверху. */
  private makeWaveObstacle(x: number, gapBottomY: number, height: number): Phaser.GameObjects.Graphics {
    const g     = this.add.graphics();
    const halfW = PILLAR_W / 2 + 6;
    const amp   = 16;          // высота пенного гребня
    const numPts = 14;
    const stage = this.stage;

    // Тело — заливная волна (один большой гребень, троги по краям)
    g.fillStyle(stage.waveColor, 1);
    g.beginPath();
    for (let i = 0; i <= numPts; i++) {
      const t  = i / numPts;
      const px = -halfW + t * 2 * halfW;
      const py = -amp * Math.sin(t * Math.PI);
      if (i === 0) g.moveTo(px, py); else g.lineTo(px, py);
    }
    g.lineTo(halfW, height);
    g.lineTo(-halfW, height);
    g.closePath();
    g.fillPath();

    // Контур всей формы
    g.lineStyle(3, stage.pillarStroke, 1);
    g.strokePath();

    // Пенная шапка — белая линия по wavy-кромке
    g.lineStyle(3, 0xffffff, 0.9);
    g.beginPath();
    for (let i = 0; i <= numPts; i++) {
      const t  = i / numPts;
      const px = -halfW + t * 2 * halfW;
      const py = -amp * Math.sin(t * Math.PI);
      if (i === 0) g.moveTo(px, py); else g.lineTo(px, py);
    }
    g.strokePath();

    // Внутренняя «вторая волна» для глубины
    g.lineStyle(2, 0xffffff, 0.35);
    g.beginPath();
    for (let i = 0; i <= numPts; i++) {
      const t  = i / numPts;
      const px = -halfW + t * 2 * halfW;
      const py = -amp * Math.sin(t * Math.PI) + 14;
      if (i === 0) g.moveTo(px, py); else g.lineTo(px, py);
    }
    g.strokePath();

    g.x = x;
    g.y = gapBottomY;
    g.setDepth(DEPTH.gameplay);
    return g;
  }

  private destroyPillar(p: Pillar): void {
    this.tweens.killTweensOf([p.topRect, p.topCap, p.bot]);
    p.topRect.destroy();
    p.topCap.destroy();
    p.bot.destroy();
  }

  private checkPillarCollision(p: Pillar): boolean {
    const px = p.topRect.x;
    const halfW = PILLAR_W / 2;
    if (px + halfW < SURFER_X - SURFER_R) return false;
    if (px - halfW > SURFER_X + SURFER_R) return false;
    if (this.surferY - SURFER_R < p.gapTopY)    return true;
    if (this.surferY + SURFER_R > p.gapBottomY) return true;
    return false;
  }

  private onPassPillar(): void {
    this.stagePassed++;
    SoundManager.playSfx('good');
    Haptics.trigger('good');
    this.refreshHud();

    const fx = this.add.text(SURFER_X, this.surferY - 60, '+1', {
      ...TEXT_STYLES.subtitle, fontSize: '24px', color: '#4ADE80',
    }).setOrigin(0.5).setDepth(DEPTH.effects).setAlpha(0);
    this.tweens.add({ targets: fx, alpha: 1, duration: 120, ease: 'Cubic.easeOut' });
    this.tweens.add({
      targets: fx, alpha: 0, y: fx.y - 50,
      delay: 200, duration: 380, ease: 'Sine.easeIn',
      onComplete: () => fx.destroy(),
    });

    if (this.stagePassed >= this.stage.goal) this.completeStage();
  }

  // ─── power-ups ─────────────────────────────────────────────────────────────

  private spawnPowerUp(): void {
    if (this.inTransition || this.finished) return;

    const types: PowerUpType[] = ['star', 'shield', 'slowmo'];
    const type  = types[Math.floor(Math.random() * types.length)];
    const emoji = type === 'star' ? '⭐' : type === 'shield' ? '🛟' : '🍺';
    const y     = Phaser.Math.Between(CEILING_Y + 100, FLOOR_Y - 100);

    const text = this.add.text(W + 50, y, emoji, { fontSize: '54px' })
      .setOrigin(0.5)
      .setDepth(DEPTH.gameplay + 2);

    const pulse = this.tweens.add({
      targets: text, scale: 1.08,
      yoyo: true, repeat: -1, duration: 500, ease: 'Sine.easeInOut',
    });

    this.powerUps.push({ type, text, alive: true, pulse });
  }

  private destroyPowerUp(pu: PowerUp): void {
    pu.pulse?.stop();
    pu.text.destroy();
  }

  private checkPowerUpCollision(pu: PowerUp): boolean {
    const dx = pu.text.x - SURFER_X;
    const dy = pu.text.y - this.surferY;
    const r  = SURFER_R + 30;
    return dx * dx + dy * dy < r * r;
  }

  private applyPowerUp(type: PowerUpType, x: number, y: number): void {
    SoundManager.playSfx('perfect');
    Haptics.trigger('perfect');
    this.spawnSparks(x, y, 0xffe600);

    if (type === 'star') {
      this.starCount++;
      this.refreshHud();
      this.showToast('+⭐', '#FFE600');
    } else if (type === 'shield') {
      this.shieldActive = true;
      this.attachShield();
      this.showToast('🛟 ЩИТ', '#4ADE80');
    } else {
      this.timeScale = 0.5;
      this.showToast('🍺 SLOW-MO', '#7A5CFF');
      this.time.delayedCall(2500, () => {
        if (this.finished) return;
        this.timeScale = 1;
      });
    }
  }

  private attachShield(): void {
    if (this.shieldRing) this.detachShield();
    const ring = this.add.circle(SURFER_X, this.surferY, SURFER_R + 16, 0x4ade80, 0)
      .setStrokeStyle(4, 0x4ade80, 0.85)
      .setDepth(DEPTH.gameplay + 2);
    this.shieldTw = this.tweens.add({
      targets: ring, scale: 1.06, alpha: 0.6,
      yoyo: true, repeat: -1, duration: 500, ease: 'Sine.easeInOut',
    });
    this.shieldRing = ring;
  }

  private detachShield(): void {
    if (!this.shieldRing) return;
    const r = this.shieldRing;
    this.shieldTw?.stop();
    this.shieldTw   = null;
    this.shieldRing = null;
    this.tweens.add({
      targets: r, alpha: 0, scale: 1.6,
      duration: 280, ease: 'Cubic.easeOut',
      onComplete: () => r.destroy(),
    });
  }

  // ─── hit handling ──────────────────────────────────────────────────────────

  private handleHit(): void {
    if (this.shieldActive) {
      this.shieldActive = false;
      this.detachShield();
      this.invincibleUntil = this.time.now + 1100;
      SoundManager.playSfx('good');
      Haptics.trigger('good');
      this.showToast('🛟 БЛОК!', '#4ADE80');
      this.cameras.main.shake(80, 0.006);
      return;
    }

    this.lives--;
    this.invincibleUntil = this.time.now + 1100;
    SoundManager.playSfx('miss');
    Haptics.trigger('miss');
    this.cameras.main.shake(180, 0.014);

    const flash = this.add.rectangle(CX, H / 2, W, H, 0xff2e2e, 0.32).setDepth(DEPTH.effects);
    this.tweens.add({
      targets: flash, alpha: 0, duration: 280, ease: 'Sine.easeOut',
      onComplete: () => flash.destroy(),
    });

    this.tweens.add({
      targets: [this.surfer, this.board], alpha: 0.3,
      duration: 100, yoyo: true, repeat: 4,
      onComplete: () => { this.surfer.setAlpha(1); this.board.setAlpha(1); },
    });

    this.refreshHud();

    this.surferY  = (CEILING_Y + FLOOR_Y) / 2;
    this.surferVY = 0;

    if (this.lives <= 0) this.finish(false);
  }

  // ─── input ─────────────────────────────────────────────────────────────────

  private onTap(): void {
    if (!this.canPlay || this.finished || this.inTransition) return;
    this.surferVY = JUMP_VY;
    SoundManager.playSfx('tap');
    Haptics.trigger('tap');
  }

  // ─── visuals ───────────────────────────────────────────────────────────────

  private drawWave(): void {
    this.waveGfx.clear();
    this.waveGfx.fillStyle(this.stage.waveColor, 0.6);
    this.waveGfx.beginPath();
    this.waveGfx.moveTo(0, FLOOR_Y + 40);
    // Реже точки → дешевле рендер
    for (let x = 0; x <= W; x += 36) {
      const y = FLOOR_Y + 4 + Math.sin((x + this.waveT * 120) * 0.012) * 10;
      this.waveGfx.lineTo(x, y);
    }
    this.waveGfx.lineTo(W, FLOOR_Y + 80);
    this.waveGfx.lineTo(0, FLOOR_Y + 80);
    this.waveGfx.closePath();
    this.waveGfx.fillPath();
  }

  private flashLightning(): void {
    if (this.finished || this.inTransition) return;

    const f = this.add.rectangle(CX, H / 2, W, H, 0xffffff, 0.5).setDepth(DEPTH.effects);
    this.tweens.add({
      targets: f, alpha: 0,
      duration: 220, ease: 'Sine.easeOut',
      onComplete: () => f.destroy(),
    });

    this.cameras.main.shake(70, 0.005);
  }

  private spawnSparks(x: number, y: number, color: number): void {
    for (let i = 0; i < 8; i++) {
      const len = 6 + Math.random() * 10;
      const r   = this.add.rectangle(x, y, 4, len, color).setDepth(DEPTH.effects);
      const angle = Math.random() * Math.PI * 2;
      r.setRotation(angle);
      const speed = 120 + Math.random() * 180;
      this.tweens.add({
        targets: r,
        x: x + Math.cos(angle) * speed,
        y: y + Math.sin(angle) * speed,
        alpha: 0, scale: 0.3,
        duration: 450 + Math.random() * 200,
        ease: 'Cubic.easeOut',
        onComplete: () => r.destroy(),
      });
    }
  }

  private showToast(text: string, color: string): void {
    const t = this.add.text(CX, H / 2 - 100, text, {
      ...TEXT_STYLES.hero, fontSize: '38px', color,
    }).setOrigin(0.5).setDepth(DEPTH.toast).setAlpha(0).setScale(0.7);
    this.tweens.add({ targets: t, alpha: 1, scale: 1, duration: 220, ease: 'Cubic.easeOut' });
    this.tweens.add({
      targets: t, alpha: 0, y: t.y - 30,
      delay: 700, duration: 350, ease: 'Sine.easeIn',
      onComplete: () => t.destroy(),
    });
  }

  // ─── HUD ───────────────────────────────────────────────────────────────────

  private refreshHud(): void {
    this.livesLbl.setText(
      '❤️'.repeat(Math.max(0, this.lives)) +
      '🖤'.repeat(Math.max(0, this.maxLives - this.lives)),
    );
    const starsPart = this.starCount > 0 ? `  ⭐ ${this.starCount}` : '';
    this.progLbl.setText(`📍 ${this.stagePassed}/${this.stage.goal}${starsPart}`);
    this.stageLbl
      .setText(`${this.stage.name}  ${this.stageIdx + 1}/${TOTAL_STAGES}`)
      .setColor(this.stage.color);
  }

  // ─── finish ────────────────────────────────────────────────────────────────

  private finish(win: boolean): void {
    if (this.finished) return;
    this.finished = true;
    this.canPlay  = false;
    this.spawnTimer?.remove();
    this.powerUpTimer?.remove();
    this.lightningTimer?.remove();

    if (win) { SoundManager.playSfx('win');  Haptics.trigger('win');  }
    else     { SoundManager.playSfx('lose'); Haptics.trigger('lose'); }

    this.add.rectangle(CX, H / 2, W, H, COLORS.black, 0.65).setDepth(DEPTH.modal);
    this.add
      .text(CX, H / 2, win ? RU.minigame.win : RU.minigame.lose, {
        ...TEXT_STYLES.hero, fontSize: '56px', color: win ? '#4ADE80' : '#EF4444',
      })
      .setOrigin(0.5)
      .setDepth(DEPTH.modal + 1);

    const totalGoal = STAGES.reduce((s, st) => s + st.goal, 0);
    const totalDone = STAGES.slice(0, this.stageIdx).reduce((s, st) => s + st.goal, 0)
                    + this.stagePassed;

    const score = win
      ? Math.min(100, Math.round(60 + (this.lives / this.maxLives) * 30 + this.starCount * 2))
      : Math.round((totalDone / totalGoal) * 50);

    this.time.delayedCall(900, () => {
      this.complete({
        outcome: win ? 'win' : 'lose',
        score,
        metadata: {
          stageReached: this.stageIdx + 1,
          totalStages:  TOTAL_STAGES,
          totalDone,
          stars:        this.starCount,
          lives:        this.lives,
        },
      });
    });
  }
}
