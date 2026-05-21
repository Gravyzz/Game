import Phaser from 'phaser';
import { BaseMinigame } from '@minigames/BaseMinigame';
import { COLORS } from '@config/colors';
import { TEXT_STYLES } from '@config/fonts';
import { GAME, DEPTH } from '@config/game';
import { RU } from '@i18n/ru';
import { SoundManager } from '@core/SoundManager';
import { Haptics } from '@core/Haptics';
import {
  paintPageBackdrop,
  attachHomeButton,
  attachIntro,
  createGlobalLivesDisplay,
  type GlobalLivesDisplay,
} from '@utils/SceneHelpers';
import { SessionState } from '@core/SessionState';

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
// Радиус хитбокса серфера. Визуальный спрайт 120x120 (R=60), а хитбокс
// 26 (≈43% от визуала) — даёт «forgiving» столкновения: касание края
// препятствия спрайтом не убивает, нужно реально въехать.
const SURFER_R = 26;

const PILLAR_W = 100;
const PIXEL_FONT = '"Press Start 2P", monospace';
const WATER_KEYS = ['surfer-water-1', 'surfer-water-2', 'surfer-water-3'];
const SURFER_KEYS = [
  'surfer-knife-hit',
  'surfer-sand',
  'surfer-bubble',
  'surfer-fish-2',
  'surfer-fish-1',
  'surfer-hero',
  'surfer-sun',
  'surfer-water-3',
  'surfer-water-2',
  'surfer-water-1',
  'surfer-lightning-2',
  'surfer-lightning-1',
  'surfer-birds-2',
  'surfer-clouds-2',
  'surfer-clouds-1',
  'surfer-birds-1',
  'surfer-coral-4',
  'surfer-coral-3',
  'surfer-coral-2',
  'surfer-seaweed',
  'surfer-coral-1',
  'surfer-wave-2',
  'surfer-wave-1',
  'surfer-tornado',
  'surfer-shield',
];

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
    bgSky: 0xd8f6ff, bgSea: 0x4b6dff, waveColor: 0x7dd3fc,
    speed: 270, gap: 380, spawnInterval: 1600, goal: 5,
    hasPowerUps: false, hasLightning: false,
    pillarColor: 0x8b5a2b, pillarStroke: 0x4a2e15, capEmoji: '🪨',
    hint: '👆 ТАП — прыжок  •  пройди 5 проходов',
  },
  {
    name: 'РИФ', color: '#FFE600',
    bgSky: 0x5ca0df, bgSea: 0x4b6dff, waveColor: 0xf6dd82,
    speed: 330, gap: 320, spawnInterval: 1400, goal: 7,
    hasPowerUps: false, hasLightning: false,
    pillarColor: 0xea580c, pillarStroke: 0x7c2d12, capEmoji: '🪸',
    hint: 'уже зазоры  •  быстрее  •  7 проходов',
  },
  {
    name: 'ШТОРМ', color: '#FF2E2E',
    bgSky: 0x315d8b, bgSea: 0x4b6dff, waveColor: 0x475569,
    speed: 380, gap: 270, spawnInterval: 1250, goal: 9,
    hasPowerUps: true, hasLightning: true,
    pillarColor: 0x334155, pillarStroke: 0x0a0a0a, capEmoji: '⚡',
    hint: 'хватай ⭐ 🛟 🍺  •  9 проходов',
  },
];

const TOTAL_STAGES = STAGES.length;

interface Pillar {
  topRect:    Phaser.GameObjects.Rectangle;
  topCap:     Phaser.GameObjects.Image;
  bot:        Phaser.GameObjects.Image;
  topFrame:   Phaser.GameObjects.Rectangle;
  botFrame:   Phaser.GameObjects.Rectangle;
  topVisuals: Phaser.GameObjects.Image[];
  botVisuals: Phaser.GameObjects.Image[];
  gapTopY:    number;
  gapBottomY: number;
  passed:     boolean;
  alive:      boolean;
  lightningTween?: Phaser.Tweens.Tween;
  tornadoTimer?: Phaser.Time.TimerEvent;
}

type PowerUpType = 'star' | 'shield' | 'slowmo';

interface PowerUp {
  type:  PowerUpType;
  text:  Phaser.GameObjects.Image;
  alive: boolean;
  pulse: Phaser.Tweens.Tween | null;
}

interface Bubble {
  image: Phaser.GameObjects.Image;
  alive: boolean;
}

export class SurferScene extends BaseMinigame {
  // Stage state
  private stageIdx    = 0;
  private stage!:       Stage;
  private stagePassed = 0;
  private starCount   = 0;

  // Surfer
  private surfer!: Phaser.GameObjects.Image;
  private board!:  Phaser.GameObjects.Image;
  private surferY  = 0;
  private surferVY = 0;

  // Buffs
  private globalLifeLostThisRun = false;
  private invincibleUntil = 0;
  private shieldActive    = false;
  private timeScale       = 1;

  // Flow flags
  private finished     = false;
  private inTransition = false;
  private canPlay      = false;

  // Background
  private bgSky!:   Phaser.GameObjects.Rectangle;
  private bgSea!:   Phaser.GameObjects.Image;
  private sandLayer!: Phaser.GameObjects.Image;
  private sandTiles: Phaser.GameObjects.Image[] = [];
  private waveGfx!: Phaser.GameObjects.Graphics;
  private waveT  = 0;
  private waterFrame = 0;
  private waterTimer: Phaser.Time.TimerEvent | null = null;
  private bubbles: Bubble[] = [];
  private sun!:    Phaser.GameObjects.Image;
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
  private progLbl!:   Phaser.GameObjects.Text;
  private livesHud!: GlobalLivesDisplay;

  constructor() { super({ key: 'Surfer' }); }

  // ─── lifecycle ─────────────────────────────────────────────────────────────

  create(): void {
    this.stageIdx        = 0;
    this.stage           = STAGES[0];
    this.stagePassed     = 0;
    this.starCount       = 0;
    this.globalLifeLostThisRun = false;
    this.invincibleUntil = 0;
    this.shieldActive    = false;
    this.timeScale       = 1;
    this.finished        = false;
    this.inTransition    = true;
    this.canPlay         = false;
    this.pillars         = [];
    this.powerUps        = [];
    this.bubbles         = [];
    this.sandTiles       = [];
    this.surferVY        = 0;
    this.surferY         = (CEILING_Y + FLOOR_Y) / 2;
    this.waterFrame      = 0;

    SURFER_KEYS.forEach((key) => {
      this.textures.get(key).setFilter(Phaser.Textures.FilterMode.NEAREST);
    });
    this.textures.get('heart-pixel').setFilter(Phaser.Textures.FilterMode.NEAREST);
    this.textures.get('home-pixel').setFilter(Phaser.Textures.FilterMode.NEAREST);

    // Sky
    paintPageBackdrop(this, this.stage.bgSky);
    this.bgSky = this.add.rectangle(CX, H / 2, W, H, this.stage.bgSky)
      .setDepth(DEPTH.background);
    attachHomeButton(this);

    // Sun
    this.sun = this.add.image(120, 220, 'surfer-sun');
    this.sun.setOrigin(0.5).setDisplaySize(170, 170).setDepth(DEPTH.background + 1);
    this.sunTw = this.tweens.add({
      targets: this.sun, scale: 1.05,
      duration: 1400, yoyo: true, repeat: -1, ease: 'Sine.easeInOut',
    });

    // Sea + анимированная фоновая волна
    const seaY = FLOOR_Y + (H - FLOOR_Y) / 2;
    const seaH = H - FLOOR_Y;
    this.bgSea = this.add.image(CX, seaY, WATER_KEYS[0])
      .setOrigin(0.5)
      .setDisplaySize(W, seaH)
      .setDepth(DEPTH.midground);
    this.sandLayer = this.add.image(CX, 940, 'surfer-sand')
      .setOrigin(0.5)
      .setDisplaySize(W, 520)
      .setDepth(DEPTH.midground - 1)
      .setVisible(false);
    for (let i = 0; i < 3; i++) {
      const tile = this.add.image(i * W, 920, 'surfer-sand')
        .setOrigin(0, 0.5)
        .setDisplaySize(W, 560)
        .setDepth(DEPTH.midground - 1)
        .setVisible(false);
      this.sandTiles.push(tile);
    }
    this.waveGfx = this.add.graphics().setDepth(DEPTH.midground + 1);

    // Стейдж и прогресс — в одной линии y=80 с home-кнопкой и сердечками.
    // Чтобы влезло — сердечки компактнее (size 52, gap 68), а в progLbl
    // убираем слово «ПРОЙДЕНО» (контекст ясен по позиции на HUD).
    this.stageLbl = this.add
      .text(320, 80, '', { fontFamily: PIXEL_FONT, fontSize: '20px', color: '#ff2e2e' })
      .setOrigin(0, 0.5).setDepth(DEPTH.ui);

    this.progLbl = this.add
      .text(W - 26, 80, '', { fontFamily: PIXEL_FONT, fontSize: '20px', color: '#0A0A0A' })
      .setOrigin(1, 0.5).setDepth(DEPTH.ui);

    this.livesHud = createGlobalLivesDisplay(this, {
      x: 140, y: 80, heartSize: 52, heartGap: 68,
    });

    // Invisible collision/alpha companion kept for old tweens.
    this.board = this.add.image(SURFER_X, this.surferY, 'surfer-hero')
      .setOrigin(0.5)
      .setDisplaySize(1, 1)
      .setVisible(false)
      .setDepth(DEPTH.gameplay);

    this.surfer = this.add.image(SURFER_X, this.surferY, 'surfer-hero');
    this.surfer.setOrigin(0.5).setDisplaySize(120, 120).setDepth(DEPTH.gameplay + 1);

    this.waterTimer = this.time.addEvent({
      delay: 380,
      loop: true,
      callback: () => {
        this.waterFrame = (this.waterFrame + 1) % WATER_KEYS.length;
        this.bgSea.setTexture(WATER_KEYS[this.waterFrame]);
        this.bgSea.setDisplaySize(W, seaH);
      },
    });

    // Input
    this.input.on('pointerdown', this.onTap, this);
    this.input.keyboard?.on('keydown-SPACE', this.onTap, this);

    this.refreshHud();
    this.cameras.main.fadeIn(300, 10, 10, 10);

    attachIntro(
      this,
      RU.minigame.names.Surfer,
      RU.minigame.guides.Surfer,
      () => {
        // Intro-баннер первого стейджа после Погнали
        this.showStageBanner(this.stage, () => {
          if (this.finished) return;
          this.startStage(0);
          this.canPlay      = true;
          this.inTransition = false;
        });
      },
    );
  }

  override update(_t: number, dtMs: number): void {
    if (this.finished || this.gamePaused) return;

    const dt = Math.min(dtMs, 33) / 1000 * this.timeScale;

    // Wave anim
    this.waveT += dt * 2.4;
    this.drawWave();

    if (this.stage.name === 'РИФ') {
      for (const tile of this.sandTiles) {
        tile.x -= this.stage.speed * 0.35 * dt;
        if (tile.x <= -W) tile.x += W * this.sandTiles.length;
      }
    }

    for (const b of this.bubbles) {
      if (!b.alive) continue;
      b.image.x -= this.stage.speed * dt;
      b.image.y -= 42 * dt;
      b.image.alpha = Phaser.Math.Clamp((b.image.y - CEILING_Y) / 160, 0.15, 0.9);
      if (b.image.x < -60 || b.image.y < CEILING_Y - 20) {
        b.alive = false;
        b.image.destroy();
      }
    }
    this.bubbles = this.bubbles.filter(b => b.alive);

    if (!this.canPlay) {
      // Idle bobble
      this.surfer.y = this.surferY + Math.sin(this.waveT) * 4;
      this.board.y  = this.surfer.y;
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
    this.board.y  = this.surferY;

    if (this.shieldRing) this.shieldRing.setPosition(SURFER_X, this.surferY);

    if (this.surferY < CEILING_Y) {
      this.surferY  = CEILING_Y;
      this.surferVY = 0;
    }
    if (this.surferY > FLOOR_Y && this.time.now > this.invincibleUntil) {
      this.handleHit();
      if (this.inTransition || this.finished) return;
    }

    // Pillars
    const speed = this.stage.speed;
    for (const p of this.pillars) {
      if (!p.alive) continue;
      const move = speed * dt;
      p.topRect.x -= move;
      p.topFrame.x -= move;
      p.botFrame.x -= move;
      for (const visual of p.topVisuals) visual.x -= move;
      for (const visual of p.botVisuals) visual.x -= move;

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
        break;
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
    this.input.keyboard?.off('keydown-SPACE', this.onTap, this);
    this.spawnTimer?.remove();
    this.powerUpTimer?.remove();
    this.lightningTimer?.remove();
    this.waterTimer?.remove();
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
    const skyHex = '#' + this.stage.bgSky.toString(16).padStart(6, '0');
    document.body.style.background = skyHex;
    document.documentElement.style.background = skyHex;
    const app = document.getElementById('app');
    if (app) app.style.background = skyHex;
    this.sun.setVisible(!this.stage.hasLightning);
    this.sun.setAlpha(this.stage.name === 'РИФ' ? 0 : 1);
    this.sandLayer.setVisible(false);
    this.sandTiles.forEach((tile, i) => {
      tile.setVisible(this.stage.name === 'РИФ');
      tile.setPosition(i * W, 920);
    });
    this.bgSea.setVisible(this.stage.name !== 'РИФ');
    if (this.stage.name === 'ШТОРМ') {
      this.bgSea.setPosition(CX, H - 95);
      this.bgSea.setDisplaySize(W, 250);
    } else {
      const seaY = FLOOR_Y + (H - FLOOR_Y) / 2;
      const seaH = H - FLOOR_Y;
      this.bgSea.setPosition(CX, seaY);
      this.bgSea.setDisplaySize(W, seaH);
    }

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

    this.refreshHud();

    for (const p of this.pillars) {
      if (!p.alive) continue;
      p.alive = false;
      p.lightningTween?.stop();
      p.tornadoTimer?.remove();
      this.tweens.add({
        targets: [p.topRect, p.topFrame, p.botFrame, ...p.topVisuals, ...p.botVisuals],
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
    this.bubbles.forEach(b => b.image.destroy());
    this.bubbles = [];

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

    const topRect = this.add.rectangle(x, 0, PILLAR_W, gapTopY, this.stage.pillarColor, 0)
      .setOrigin(0.5, 0)
      .setDepth(DEPTH.gameplay);
    const botHeight = FLOOR_Y - gapBottomY;
    const topFrame = this.add.rectangle(x, gapTopY / 2, PILLAR_W + 34, Math.max(80, gapTopY), 0x000000, 0.03)
      .setStrokeStyle(4, this.obstacleFrameColor(), 0.55)
      .setDepth(DEPTH.gameplay);
    const botFrame = this.add.rectangle(x, gapBottomY + botHeight / 2, PILLAR_W + 34, Math.max(80, botHeight), 0x000000, 0.03)
      .setStrokeStyle(4, this.obstacleFrameColor(), 0.55)
      .setDepth(DEPTH.gameplay);

    const topVisuals = this.fillObstacleZone(x, 0, gapTopY, 'top');
    const botVisuals = this.fillObstacleZone(x, gapBottomY, botHeight, 'bottom');
    const topCap = topVisuals[0];
    const bot = botVisuals[0];

    let lightningTween: Phaser.Tweens.Tween | undefined;
    let tornadoTimer: Phaser.Time.TimerEvent | undefined;
    if (this.stage.name === 'ШТОРМ') {
      topVisuals.forEach((visual, i) => {
        visual.setAlpha(Phaser.Math.FloatBetween(0.35, 1));
        this.tweens.add({
          targets: visual,
          alpha: { from: 0.18, to: 1 },
          scaleX: { from: visual.scaleX * 0.92, to: visual.scaleX * 1.08 },
          scaleY: { from: visual.scaleY * 0.92, to: visual.scaleY * 1.08 },
          duration: Phaser.Math.Between(180, 420),
          yoyo: true,
          repeat: -1,
          delay: i * 130 + Phaser.Math.Between(0, 350),
          ease: 'Sine.easeInOut',
        });
      });
      lightningTween = this.tweens.add({
        targets: topFrame,
        alpha: { from: 0.35, to: 0.85 },
        duration: Phaser.Math.Between(260, 520),
        yoyo: true,
        repeat: -1,
        delay: Phaser.Math.Between(0, 700),
        ease: 'Sine.easeInOut',
      });
      tornadoTimer = this.time.addEvent({
        delay: 1000,
        loop: true,
        callback: () => botVisuals.forEach(visual => visual.setFlipX(!visual.flipX)),
      });
    }

    if (this.stage.name === 'РИФ') {
      this.spawnBubbleGroup(x);
    }

    this.pillars.push({
      topRect, topCap, bot, topFrame, botFrame, topVisuals, botVisuals,
      gapTopY, gapBottomY,
      passed: false, alive: true,
      lightningTween,
      tornadoTimer,
    });
  }

  private obstacleFrameColor(): number {
    if (this.stage.name === 'ПЛЯЖ') return 0xbcecff;
    if (this.stage.name === 'РИФ') return 0xffd52e;
    return 0x8cc9c7;
  }

  private fillObstacleZone(x: number, zoneY: number, zoneH: number, position: 'top' | 'bottom'): Phaser.GameObjects.Image[] {
    const minH = Math.max(70, zoneH);
    const count = Math.max(1, Math.floor(minH / this.obstacleSpacing(position)));
    const visuals: Phaser.GameObjects.Image[] = [];
    const topMargin = position === 'top' ? 56 : 70;
    const bottomMargin = position === 'top' ? 52 : 72;
    const usableTop = zoneY + topMargin;
    const usableBottom = zoneY + zoneH - bottomMargin;

    for (let i = 0; i < count; i++) {
      const key = this.pickObstacleKey(position);
      const y = count === 1
        ? Phaser.Math.Clamp(zoneY + zoneH / 2, usableTop, usableBottom)
        : Phaser.Math.Linear(usableTop, usableBottom, count === 1 ? 0.5 : i / (count - 1));
      const visual = this.add.image(x + Phaser.Math.Between(-16, 16), y, key)
        .setOrigin(0.5)
        .setDepth(DEPTH.gameplay + 1);
      this.sizeObstacle(visual, position);
      visuals.push(visual);
    }

    return visuals;
  }

  private obstacleSpacing(position: 'top' | 'bottom'): number {
    if (this.stage.name === 'ШТОРМ') return position === 'top' ? 150 : 190;
    if (this.stage.name === 'РИФ') return position === 'top' ? 110 : 145;
    return 130;
  }

  private pickObstacleKey(position: 'top' | 'bottom'): string {
    if (this.stage.name === 'ПЛЯЖ') {
      return position === 'top'
        ? Phaser.Math.RND.pick(['surfer-clouds-1', 'surfer-clouds-2'])
        : Phaser.Math.RND.pick(['surfer-birds-1', 'surfer-birds-2']);
    }
    if (this.stage.name === 'РИФ') {
      return position === 'top'
        ? Phaser.Math.RND.pick(['surfer-fish-1', 'surfer-fish-2', 'surfer-seaweed'])
        : Phaser.Math.RND.pick(['surfer-coral-1', 'surfer-coral-2', 'surfer-coral-3', 'surfer-coral-4', 'surfer-seaweed']);
    }
    return position === 'top'
      ? Phaser.Math.RND.pick(['surfer-lightning-1', 'surfer-lightning-2'])
      : 'surfer-tornado';
  }

  private sizeObstacle(image: Phaser.GameObjects.Image, position: 'top' | 'bottom'): void {
    if (this.stage.name === 'ШТОРМ' && position === 'bottom') {
      image.setDisplaySize(138, 190);
      return;
    }
    if (this.stage.name === 'ШТОРМ') {
      image.setDisplaySize(88, 145);
      return;
    }
    if (this.stage.name === 'РИФ') {
      image.setDisplaySize(position === 'top' ? 105 : 125, position === 'top' ? 82 : 145);
      return;
    }
    image.setDisplaySize(128, 108);
  }

  private spawnBubbleGroup(originX: number): void {
    for (let i = 0; i < 5; i++) {
      const b = this.add.image(
        originX + Phaser.Math.Between(-150, 150),
        Phaser.Math.Between(CEILING_Y + 80, FLOOR_Y - 80),
        'surfer-bubble',
      ).setOrigin(0.5).setDisplaySize(42, 42).setAlpha(0.82).setDepth(DEPTH.midground + 2);
      this.bubbles.push({ image: b, alive: true });
    }
  }

  private destroyPillar(p: Pillar): void {
    p.lightningTween?.stop();
    p.tornadoTimer?.remove();
    this.tweens.killTweensOf([p.topRect, p.topFrame, p.botFrame, ...p.topVisuals, ...p.botVisuals]);
    p.topRect.destroy();
    p.topFrame.destroy();
    p.botFrame.destroy();
    p.topVisuals.forEach(visual => visual.destroy());
    p.botVisuals.forEach(visual => visual.destroy());
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

    const types: PowerUpType[] = ['shield'];
    const type  = types[Math.floor(Math.random() * types.length)];
    const texture = type === 'shield' ? 'surfer-shield' : type === 'star' ? 'surfer-sun' : 'surfer-bubble';
    const y     = Phaser.Math.Between(CEILING_Y + 100, FLOOR_Y - 100);

    const text = this.add.image(W + 50, y, texture)
      .setOrigin(0.5)
      .setDisplaySize(58, 58)
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
    if (this.inTransition || this.finished) return;

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

    const livesLeft = SessionState.loseLife();
    this.globalLifeLostThisRun = true;
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

    if (livesLeft <= 0) {
      this.finish(false);
      return;
    }

    this.restartCurrentStageAfterHit();
  }

  private restartCurrentStageAfterHit(): void {
    if (this.finished) return;

    this.inTransition = true;
    this.canPlay = false;
    this.spawnTimer?.remove();
    this.powerUpTimer?.remove();
    this.lightningTimer?.remove();
    this.spawnTimer = null;
    this.powerUpTimer = null;
    this.lightningTimer = null;

    for (const p of this.pillars) {
      p.alive = false;
      this.destroyPillar(p);
    }
    for (const pu of this.powerUps) {
      pu.alive = false;
      this.destroyPowerUp(pu);
    }
    this.bubbles.forEach(b => b.image.destroy());
    this.pillars = [];
    this.powerUps = [];
    this.bubbles = [];

    this.surferY = (CEILING_Y + FLOOR_Y) / 2;
    this.surferVY = 0;
    this.surfer.setPosition(SURFER_X, this.surferY).setRotation(0).setAlpha(1);
    this.board.setPosition(SURFER_X, this.surferY).setRotation(0).setAlpha(1);
    if (this.shieldRing) this.shieldRing.setPosition(SURFER_X, this.surferY);

    this.showToast('-1 ЖИЗНЬ', '#EF4444');
    this.time.delayedCall(650, () => {
      if (this.finished) return;
      this.startStage(this.stageIdx);
      this.canPlay = true;
      this.inTransition = false;
    });
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
    if (this.stage.name === 'РИФ') {
      this.waveGfx.fillStyle(0xf6dd82, 0.45);
      this.waveGfx.fillRect(0, FLOOR_Y - 28, W, H - FLOOR_Y + 48);
      for (let i = 0; i < 28; i++) {
        const x = (i * 53 + Math.floor(this.waveT * 30)) % W;
        const y = FLOOR_Y + 8 + ((i * 37) % 160);
        this.waveGfx.fillStyle(i % 3 === 0 ? 0xffffff : i % 3 === 1 ? 0xffc21a : 0xb7b7b7, 0.75);
        this.waveGfx.fillRect(x, y, 6, 6);
      }
      return;
    }
    this.waveGfx.fillStyle(this.stage.waveColor, 0.6);
    this.waveGfx.beginPath();
    const baseY = this.stage.name === 'ШТОРМ' ? FLOOR_Y - 58 : FLOOR_Y + 40;
    const crestY = this.stage.name === 'ШТОРМ' ? FLOOR_Y - 92 : FLOOR_Y + 4;
    const bottomY = this.stage.name === 'ШТОРМ' ? H : FLOOR_Y + 80;
    this.waveGfx.moveTo(0, baseY);
    // Реже точки → дешевле рендер
    for (let x = 0; x <= W; x += 36) {
      const y = crestY + Math.sin((x + this.waveT * 120) * 0.012) * 10;
      this.waveGfx.lineTo(x, y);
    }
    this.waveGfx.lineTo(W, bottomY);
    this.waveGfx.lineTo(0, bottomY);
    this.waveGfx.closePath();
    this.waveGfx.fillPath();
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
    this.livesHud.update();
    const starsPart = this.starCount > 0 ? `  ⭐ ${this.starCount}` : '';
    this.progLbl.setText(`${this.stagePassed}/${this.stage.goal}${starsPart}`);
    this.stageLbl
      .setText(`${this.stage.name} ${this.stageIdx + 1}/${TOTAL_STAGES}`)
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

    const livesLeft = SessionState.getLivesLeft();
    const score = win
      ? Math.min(100, Math.round(70 + Math.min(livesLeft, 3) * 8 + this.starCount * 2))
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
          lives:        livesLeft,
          lifeAlreadyLost: this.globalLifeLostThisRun,
        },
      });
    });
  }
}
