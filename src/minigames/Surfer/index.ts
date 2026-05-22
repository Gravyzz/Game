import Phaser from 'phaser';
import { BaseMinigame } from '@minigames/BaseMinigame';
import { COLORS } from '@config/colors';
import { GAME, DEPTH } from '@config/game';
import { RU } from '@i18n/ru';
import { SoundManager } from '@core/SoundManager';
import { Haptics } from '@core/Haptics';
import { SURFER_ASSETS, loadImageAssets } from '@core/AssetManifest';
import {
  paintPageBackdrop,
  attachHomeButton,
  attachIntro,
  createGlobalLivesDisplay,
  type GlobalLivesDisplay,
} from '@utils/SceneHelpers';

const W  = GAME.WIDTH;
const H  = GAME.HEIGHT;
const CX = W / 2;
const SURFER_X = 200;

const CEILING_Y = 96;
const FLOOR_Y   = H - 56;

// Мягкая физика — Flappy-feel без чугунной гравитации
const GRAVITY  = 1500;
const JUMP_VY  = -540;
// Радиус хитбокса серфера. Визуальный спрайт 120x120 (R=60), а хитбокс
// 26 (≈43% от визуала) — даёт «forgiving» столкновения: касание края
// препятствия спрайтом не убивает, нужно реально въехать.
const SURFER_R = 26;

const PILLAR_W = 147;
const PIXEL_FONT = '"Press Start 2P", monospace';
const JETPACK_PRODUCT_KEYS = Array.from({ length: 11 }, (_, i) => `surfer-jetpack-product-${i + 1}`);
const SURFER_KEYS = [
  'surfer-jetpack-bg-day',
  'surfer-jetpack-bg-evening',
  'surfer-jetpack-bg-night',
  'surfer-jetpack-player',
  'surfer-jetpack-column',
  'surfer-jetpack-frame',
  ...JETPACK_PRODUCT_KEYS,
  'surfer-shield',
];

interface Stage {
  name:          string;
  color:         string;
  bgTexture:     string;
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
    name: 'день', color: '#FFFFFF', bgTexture: 'surfer-jetpack-bg-day',
    bgSky: 0xd8f6ff, bgSea: 0x4b6dff, waveColor: 0x7dd3fc,
    speed: 270, gap: 380, spawnInterval: 1600, goal: 10,
    hasPowerUps: false, hasLightning: false,
    pillarColor: 0x8b5a2b, pillarStroke: 0x4a2e15, capEmoji: '🪨',
    hint: 'тап — импульс джетпака  •  пройди 10 проходов',
  },
  {
    name: 'вечер', color: '#FFFFFF', bgTexture: 'surfer-jetpack-bg-evening',
    bgSky: 0x5ca0df, bgSea: 0x4b6dff, waveColor: 0xf6dd82,
    speed: 330, gap: 320, spawnInterval: 1400, goal: 10,
    hasPowerUps: false, hasLightning: false,
    pillarColor: 0xea580c, pillarStroke: 0x7c2d12, capEmoji: '🪸',
    hint: 'уже зазоры  •  быстрее  •  10 проходов',
  },
  {
    name: 'ночь', color: '#FFFFFF', bgTexture: 'surfer-jetpack-bg-night',
    bgSky: 0x315d8b, bgSea: 0x4b6dff, waveColor: 0x475569,
    speed: 380, gap: 270, spawnInterval: 1250, goal: 10,
    hasPowerUps: true, hasLightning: true,
    pillarColor: 0x334155, pillarStroke: 0x0a0a0a, capEmoji: '⚡',
    hint: 'узкие проходы  •  10 очков',
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
  private invincibleUntil = 0;
  private shieldActive    = false;
  private timeScale       = 1;

  // Flow flags
  private finished     = false;
  private inTransition = false;
  private canPlay      = false;

  // Background
  private bgSky!:   Phaser.GameObjects.Image;
  private waveT  = 0;
  private bubbles: Bubble[] = [];

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

  preload(): void {
    loadImageAssets(this, SURFER_ASSETS);
  }

  // ─── lifecycle ─────────────────────────────────────────────────────────────

  create(): void {
    this.stageIdx        = 0;
    this.stage           = STAGES[0];
    this.stagePassed     = 0;
    this.starCount       = 0;
    this.invincibleUntil = 0;
    this.shieldActive    = false;
    this.timeScale       = 1;
    this.finished        = false;
    this.inTransition    = true;
    this.canPlay         = false;
    this.pillars         = [];
    this.powerUps        = [];
    this.bubbles         = [];
    this.surferVY        = 0;
    this.surferY         = (CEILING_Y + FLOOR_Y) / 2;

    SURFER_KEYS.forEach((key) => {
      this.textures.get(key).setFilter(Phaser.Textures.FilterMode.NEAREST);
    });
    this.textures.get('heart-pixel').setFilter(Phaser.Textures.FilterMode.NEAREST);
    this.textures.get('home-pixel').setFilter(Phaser.Textures.FilterMode.NEAREST);

    paintPageBackdrop(this, this.stage.bgSky);
    this.bgSky = this.add.image(CX, H / 2, this.stage.bgTexture)
      .setOrigin(0.5)
      .setDepth(DEPTH.background);
    this.fitBackgroundCover();
    attachHomeButton(this);

    this.stageLbl = this.add
      .text(W - 26, 94, '', {
        fontFamily: PIXEL_FONT,
        fontSize: '18px',
        color: '#FFFFFF',
        stroke: '#0A0A0A',
        strokeThickness: 6,
        align: 'right',
        lineSpacing: 4,
      })
      .setOrigin(1, 0.5).setDepth(DEPTH.ui);

    this.progLbl = this.add
      .text(W - 26, 54, '', {
        fontFamily: PIXEL_FONT,
        fontSize: '18px',
        color: '#FFFFFF',
        stroke: '#0A0A0A',
        strokeThickness: 6,
        align: 'right',
        lineSpacing: 4,
      })
      .setOrigin(1, 0.5).setDepth(DEPTH.ui);

    this.add.text(W - 26, 16, 'пройдено', {
      fontFamily: PIXEL_FONT,
      fontSize: '18px',
      color: '#FFFFFF',
      stroke: '#0A0A0A',
      strokeThickness: 6,
      align: 'right',
    })
      .setOrigin(1, 0).setDepth(DEPTH.ui);

    this.livesHud = createGlobalLivesDisplay(this, {
      x: 140, y: 80, heartSize: 52, heartGap: 68,
    });

    // Invisible collision/alpha companion kept for old tweens.
    this.board = this.add.image(SURFER_X, this.surferY, 'surfer-jetpack-player')
      .setOrigin(0.5)
      .setDisplaySize(1, 1)
      .setVisible(false)
      .setDepth(DEPTH.gameplay);

    this.surfer = this.add.image(SURFER_X, this.surferY, 'surfer-jetpack-player');
    this.surfer.setOrigin(0.5).setDisplaySize(142, 150).setDepth(DEPTH.gameplay + 3);

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

    this.waveT += dt * 2.4;

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
    this.shieldTw?.stop();
    this.tweens.killAll();
  }

  // ─── stage flow ────────────────────────────────────────────────────────────

  private startStage(idx: number): void {
    this.stageIdx    = idx;
    this.stage       = STAGES[idx];
    this.stagePassed = 0;

    this.bgSky.setTexture(this.stage.bgTexture);
    this.fitBackgroundCover();
    const skyHex = '#' + this.stage.bgSky.toString(16).padStart(6, '0');
    document.body.style.background = skyHex;
    document.documentElement.style.background = skyHex;
    const app = document.getElementById('app');
    if (app) app.style.background = skyHex;

    this.refreshHud();

    this.spawnTimer = this.time.addEvent({
      delay: this.stage.spawnInterval,
      loop: true,
      callback: this.spawnPillar,
      callbackScope: this,
    });

  }

  private fitBackgroundCover(): void {
    const source = this.bgSky.texture.getSourceImage() as HTMLImageElement | HTMLCanvasElement;
    const scale = Math.max(W / source.width, H / source.height);
    this.bgSky.setDisplaySize(source.width * scale, source.height * scale);
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
        fontFamily: PIXEL_FONT,
        fontSize: '46px',
        color: '#FFFFFF',
        stroke: '#0A0A0A',
        strokeThickness: 8,
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

      this.bgSky.setTexture(next.bgTexture);
      this.fitBackgroundCover();

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
        fontFamily: PIXEL_FONT,
        fontSize: '52px',
        color: '#FFFFFF',
        stroke: '#0A0A0A',
        strokeThickness: 8,
      })
      .setOrigin(0.5).setDepth(DEPTH.toast).setAlpha(0).setScale(0.7);

    const hint = this.add
      .text(CX, H / 2 + 36, stage.hint, {
        fontFamily: PIXEL_FONT,
        fontSize: '17px',
        color: '#FFFFFF',
        stroke: '#0A0A0A',
        strokeThickness: 5,
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
    const minCenter = CEILING_Y + gap / 2 + 40;
    const maxCenter = FLOOR_Y - gap / 2 - 40;
    const gapCenter = Phaser.Math.Between(minCenter, maxCenter);
    const gapTopY    = gapCenter - gap / 2;
    const gapBottomY = gapCenter + gap / 2;

    const x = W + PILLAR_W;

    const topRect = this.add.rectangle(x, 0, PILLAR_W, gapTopY, this.stage.pillarColor, 0)
      .setOrigin(0.5, 0)
      .setDepth(DEPTH.gameplay);
    const botHeight = FLOOR_Y - gapBottomY;
    const topFrame = this.add.rectangle(x, gapTopY / 2, PILLAR_W, Math.max(80, gapTopY), 0x000000, 0)
      .setDepth(DEPTH.gameplay);
    const botFrame = this.add.rectangle(x, gapBottomY + botHeight / 2, PILLAR_W, Math.max(80, botHeight), 0x000000, 0)
      .setDepth(DEPTH.gameplay);

    const topVisuals = this.fillObstacleZone(x, 0, gapTopY, 'top');
    const botVisuals = this.fillObstacleZone(x, gapBottomY, botHeight, 'bottom');
    const topCap = topVisuals[0];
    const bot = botVisuals[0];

    this.pillars.push({
      topRect, topCap, bot, topFrame, botFrame, topVisuals, botVisuals,
      gapTopY, gapBottomY,
      passed: false, alive: true,
    });
  }

  private fillObstacleZone(x: number, zoneY: number, zoneH: number, _position: 'top' | 'bottom'): Phaser.GameObjects.Image[] {
    const visuals: Phaser.GameObjects.Image[] = [];

    if (zoneH < 86) return visuals;

    const column = this.add.image(x, zoneY + zoneH / 2, 'surfer-jetpack-column')
      .setOrigin(0.5)
      .setDisplaySize(PILLAR_W, zoneH)
      .setDepth(DEPTH.gameplay + 1);
    visuals.push(column);

    const topCap = this.add.image(x, zoneY + 18, 'surfer-jetpack-frame')
      .setOrigin(0.5)
      .setDisplaySize(PILLAR_W, 37)
      .setDepth(DEPTH.gameplay + 3);
    const bottomCap = this.add.image(x, zoneY + zoneH - 18, 'surfer-jetpack-frame')
      .setOrigin(0.5)
      .setDisplaySize(PILLAR_W, 37)
      .setDepth(DEPTH.gameplay + 3);
    visuals.push(topCap, bottomCap);

    const shelves = Math.max(1, Math.min(4, Math.floor((zoneH - 96) / 118)));
    const productKeys = Phaser.Utils.Array.Shuffle([...JETPACK_PRODUCT_KEYS]).slice(0, shelves);
    const yStart = zoneY + 70;
    const yEnd = zoneY + zoneH - 70;
    for (let i = 0; i < shelves; i++) {
      const y = shelves === 1
        ? (yStart + yEnd) / 2
        : Phaser.Math.Linear(yStart, yEnd, i / (shelves - 1));
      const product = this.add.image(
        x + Phaser.Math.Between(-4, 4),
        y + Phaser.Math.Between(-8, 8),
        productKeys[i],
      )
        .setOrigin(0.5)
        .setDepth(DEPTH.gameplay + 4);
      this.sizeProduct(product);
      visuals.push(product);
    }

    return visuals;
  }

  private sizeProduct(image: Phaser.GameObjects.Image): void {
    const source = image.texture.getSourceImage() as HTMLImageElement | HTMLCanvasElement;
    const maxW = PILLAR_W - 34;
    const maxH = 82;
    const scale = Math.min(maxW / source.width, maxH / source.height);
    image.setDisplaySize(source.width * scale, source.height * scale);
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
    SoundManager.playSfx('commonPrize');
    Haptics.trigger('good');
    this.refreshHud();

    const fx = this.add.text(SURFER_X, this.surferY - 60, '+1', {
      fontFamily: PIXEL_FONT,
      fontSize: '24px',
      color: '#FFFFFF',
      stroke: '#0A0A0A',
      strokeThickness: 5,
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
    SoundManager.playSfx('bubblePop');
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
      SoundManager.playSfx('bubblePop');
      Haptics.trigger('good');
      this.showToast('🛟 БЛОК!', '#4ADE80');
      this.cameras.main.shake(80, 0.006);
      return;
    }

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

    this.showToast('ПРОМАХ!', '#EF4444');
    this.time.delayedCall(450, () => this.finish(false));
  }

  // ─── input ─────────────────────────────────────────────────────────────────

  private onTap(): void {
    if (!this.canPlay || this.finished || this.inTransition) return;
    this.surferVY = JUMP_VY;
    this.spawnJetpackCubes();
    SoundManager.playSfx('jump');
    Haptics.trigger('tap');
  }

  // ─── visuals ───────────────────────────────────────────────────────────────

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

  private spawnJetpackCubes(): void {
    const baseX = SURFER_X - 62;
    const baseY = this.surferY + 32;
    const colors = [0xf03a2e, 0x9b1c16, 0x4a5568, 0xffffff];

    for (let i = 0; i < 10; i++) {
      const size = Phaser.Math.Between(5, 9);
      const cube = this.add.rectangle(
        baseX + Phaser.Math.Between(-8, 8),
        baseY + Phaser.Math.Between(-12, 12),
        size,
        size,
        Phaser.Utils.Array.GetRandom(colors),
        0.92,
      ).setDepth(DEPTH.effects);

      this.tweens.add({
        targets: cube,
        x: cube.x - Phaser.Math.Between(35, 88),
        y: cube.y + Phaser.Math.Between(18, 68),
        alpha: 0,
        scale: 0.35,
        duration: Phaser.Math.Between(360, 620),
        ease: 'Cubic.easeOut',
        onComplete: () => cube.destroy(),
      });
    }
  }

  private showToast(text: string, _color: string): void {
    const t = this.add.text(CX, H / 2 - 100, text, {
      fontFamily: PIXEL_FONT,
      fontSize: '38px',
      color: '#FFFFFF',
      stroke: '#0A0A0A',
      strokeThickness: 7,
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
    this.progLbl.setText(`${this.stagePassed}/${this.stage.goal}`);
    this.stageLbl
      .setText(`${this.stage.name} ${this.stageIdx + 1}/${TOTAL_STAGES}`);
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
        fontFamily: PIXEL_FONT,
        fontSize: '56px',
        color: '#FFFFFF',
        stroke: '#0A0A0A',
        strokeThickness: 9,
      })
      .setOrigin(0.5)
      .setDepth(DEPTH.modal + 1);

    const totalGoal = STAGES.reduce((s, st) => s + st.goal, 0);
    const totalDone = STAGES.slice(0, this.stageIdx).reduce((s, st) => s + st.goal, 0)
                    + this.stagePassed;

    const score = win
      ? Math.min(100, Math.round(80 + this.starCount * 2))
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
        },
      });
    });
  }
}
