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
  type GlobalLivesDisplay,
} from '@utils/SceneHelpers';

// ─── layout ──────────────────────────────────────────────────────────────────
const W        = GAME.WIDTH;
const H        = GAME.HEIGHT;
const CX       = W / 2;
const CY       = 610;          // target centre y
const RADIUS   = 123;          // target radius
const KNIFE_STUCK_RADIUS = RADIUS - 23;
const KNIFE_Y0 = 1012;         // knife resting position

// Cached texture keys (живут в TextureManager, шарятся между ре-стартами сцены)
const TEX_NOISE  = 'pa_noise_v2';
const TEX_SALAMI = 'pa_salami_v2';
const TEX_KNIFE  = 'pizzaassembly-good-knife'; // одна текстура для летящего и воткнутого
const PIXEL_FONT = '"Press Start 2P", monospace';
const TARGET_TEXTURES = [
  'pizzaassembly-new-pizza',
  'pizzaassembly-new-cheese',
  'pizzaassembly-new-sausage',
];

// Воткнутый нож рисуется НИЖЕ круга — лезвие прячется под колбасой
const D_STUCK = DEPTH.midground + 5;

// origin Y для ножа — точка у острия, которая садится на край цели
const KNIFE_OY = 0.12;
const HUD_KNIFE_ROTATION = -0.62;
const PA_BG = 0x130709;

// ─── stages ──────────────────────────────────────────────────────────────────
interface Stage {
  name:        'EASY' | 'MEDIUM' | 'HARD';
  color:       string;
  rotSpeed:    number;  // rad/s
  goal:        number;  // ножей, чтобы пройти стейдж
  minAngle:    number;  // мин. угловая дистанция между ножами (rad)
  knifeSpd:    number;  // px/s — скорость броска
  flipEnabled: boolean;
  flipMin:     number;  // ms
  flipMax:     number;  // ms
}

const STAGES: Stage[] = [
  {
    name: 'EASY',  color: '#4ADE80',
    rotSpeed: 1.4, goal: 11, minAngle: 0.14, knifeSpd: 3200,
    flipEnabled: false, flipMin: 0,    flipMax: 0,
  },
  {
    name: 'MEDIUM', color: '#FFE600',
    rotSpeed: 2.1, goal: 13, minAngle: 0.12, knifeSpd: 3500,
    flipEnabled: false, flipMin: 0,    flipMax: 0,
  },
  {
    name: 'HARD',  color: '#FF2E2E',
    rotSpeed: 2.7, goal: 15, minAngle: 0.10, knifeSpd: 3800,
    flipEnabled: true,  flipMin: 2400, flipMax: 3800,
  },
];

const TOTAL_STAGES = STAGES.length;

// ─── helpers ─────────────────────────────────────────────────────────────────
function angleDiff(a: number, b: number): number {
  let d = ((a - b) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2);
  if (d > Math.PI) d = Math.PI * 2 - d;
  return d;
}

interface StuckKnife {
  localAngle: number;
  sprite:     Phaser.GameObjects.Image;
}

/**
 * КОЛБАСКА НА НОЖАХ — knife-hit в пиццерийной теме.
 *
 * 3 стейджа в серии: EASY → MEDIUM → HARD. Каждый — отдельная цель по ножам.
 * Жизни переносятся между стейджами; +1 в награду между стейджами.
 *
 * Графика запекается в текстуры (1 спрайт на нож/колбасу/шум) —
 * минимум draw calls, плавные тёплые твины.
 */
export class PizzaAssemblyScene extends BaseMinigame {
  private stageIdx = 0;
  private stage!:   Stage;

  private circleRot = 0;
  private rotSpeed  = 0;        // меняется плавным твином при смене стейджа

  private salami!: Phaser.GameObjects.Image;
  private salamiTexture = TARGET_TEXTURES[0];
  private stuck:   StuckKnife[] = [];
  private stageStuck = 0;

  private knife: Phaser.GameObjects.Image | null = null;
  private knifeY = KNIFE_Y0;
  private flying = false;
  private canThrow = true;

  private lives    = 3;
  private maxLives = 3;
  private done     = false;
  private inTransition = false;

  private livesHud!: GlobalLivesDisplay;
  private progLbl!:  Phaser.GameObjects.Text;
  private stageLbl!: Phaser.GameObjects.Text;

  private flipEvt?: Phaser.Time.TimerEvent;

  constructor() { super({ key: 'PizzaAssembly' }); }

  // ─── lifecycle ─────────────────────────────────────────────────────────────

  create(): void {
    this.stageIdx     = 0;
    this.stage        = STAGES[0];
    this.circleRot    = 0;
    this.rotSpeed     = this.stage.rotSpeed;
    this.maxLives     = 3;
    this.lives        = this.maxLives;
    this.stuck        = [];
    this.stageStuck   = 0;
    this.done         = false;
    this.flying       = false;
    this.canThrow     = false;        // включается после intro-баннера
    this.inTransition = true;

    this.bakeTextures();
    [
      ...TARGET_TEXTURES,
      'pizzaassembly-good-knife',
      'pizzaassembly-knife-hit-bg',
      'pizzaassembly-knife-hit-layout',
    ].forEach((key) => {
      this.textures.get(key).setFilter(Phaser.Textures.FilterMode.NEAREST);
    });

    this.drawRoom();
    attachHomeButton(this);

    this.stageLbl = this.add
      .text(W - 36, 54, '', {
        fontFamily: '"Press Start 2P", monospace',
        fontSize: '22px',
        color: '#0A0A0A',
      })
      .setOrigin(1, 0)
      .setDepth(DEPTH.ui);

    this.livesHud = createGlobalLivesDisplay(this, {
      x: 150,
      countX: 150,
      stackFirstX: 214,
      y: 80,
      heartSize: 62,
      heartGap: 82,
      fontSize: '42px',
    });

    this.add.image(W - 194, 124, TEX_KNIFE)
      .setOrigin(0.5)
      .setDisplaySize(32, 32)
      .setRotation(HUD_KNIFE_ROTATION)
      .setDepth(DEPTH.ui);

    this.progLbl = this.add
      .text(W - 36, 108, '', {
        fontFamily: '"Press Start 2P", monospace',
        fontSize: '28px',
        color: '#FAF7F0',
      })
      .setOrigin(1, 0)
      .setDepth(DEPTH.ui);

    // Центральная цель
    this.salamiTexture = this.randomTargetTexture();
    this.salami = this.add.image(CX, CY, this.salamiTexture)
      .setDepth(DEPTH.gameplay)
      .setDisplaySize(RADIUS * 2, RADIUS * 2);

    this.refreshStageLabel();
    this.updateHUD();

    const hint = this.add
      .text(CX, KNIFE_Y0 + 90, 'ТАП → БРОСИТЬ НОЖ', {
        fontFamily: PIXEL_FONT,
        fontSize: '18px',
        color: '#0A0A0A',
      })
      .setOrigin(0.5)
      .setDepth(DEPTH.ui);
    this.tweens.add({
      targets: hint, alpha: 0, delay: 1800, duration: 700,
      onComplete: () => hint.destroy(),
    });

    this.input.on('pointerdown', this.onTap, this);
    this.cameras.main.fadeIn(300, 10, 10, 10);

    attachIntro(
      this,
      RU.minigame.names.PizzaAssembly,
      RU.minigame.guides.PizzaAssembly,
      () => {
        // Intro-баннер первого стейджа, потом старт
        this.showStageBanner(this.stage, true, () => {
          if (this.stage.flipEnabled) this.scheduleFlip();
          this.spawnKnife();
          this.canThrow     = true;
          this.inTransition = false;
        });
      },
    );
  }

  override update(_t: number, dtMs: number): void {
    if (this.done || this.gamePaused) return;

    // Clamp dt — защита от скачков (таб в фоне, лаг в браузере)
    const dt = Math.min(dtMs, 33) / 1000;

    // Вращение колбасы (rotSpeed может твиниться при смене стейджа)
    this.circleRot += this.rotSpeed * dt;
    this.salami.setRotation(this.circleRot);

    // Воткнутые ножи — на орбите вокруг колбасы
    const len = this.stuck.length;
    for (let i = 0; i < len; i++) {
      const k  = this.stuck[i];
      const ga = k.localAngle + this.circleRot;
      const cs = Math.cos(ga);
      const sn = Math.sin(ga);
      k.sprite.setPosition(CX + cs * KNIFE_STUCK_RADIUS, CY + sn * KNIFE_STUCK_RADIUS);
      k.sprite.setRotation(ga - Math.PI / 2);
    }

    // Летящий нож
    if (this.flying && this.knife) {
      this.knifeY -= this.stage.knifeSpd * dt;
      this.knife.setY(this.knifeY);

      if (this.knifeY <= CY + KNIFE_STUCK_RADIUS) {
        this.knifeY = CY + KNIFE_STUCK_RADIUS; // защёлкиваем глубже в цель — без подёргивания
        this.knife.setY(this.knifeY);
        this.landKnife();
      }
    }
  }

  shutdown(): void {
    this.input.off('pointerdown', this.onTap, this);
    this.flipEvt?.remove();
    this.tweens.killAll();
  }

  // ─── texture baking ────────────────────────────────────────────────────────

  private bakeTextures(): void {
    const tex = this.textures;

    // Шум фона
    if (!tex.exists(TEX_NOISE)) {
      const g = this.make.graphics({ x: 0, y: 0 }, false);
      g.fillStyle(0x000000, 0.04);
      for (let i = 0; i < 200; i++) {
        g.fillCircle(Math.random() * W, Math.random() * H, Math.random() * 1.5);
      }
      g.generateTexture(TEX_NOISE, W, H);
      g.destroy();
    }

    // Колбаса
    if (!tex.exists(TEX_SALAMI)) {
      const PAD = 8;
      const D   = (RADIUS + PAD) * 2;
      const cx  = D / 2;
      const cy  = D / 2;
      const g   = this.make.graphics({ x: 0, y: 0 }, false);

      // тело
      g.fillStyle(0xb33a2a);
      g.fillCircle(cx, cy, RADIUS);
      g.lineStyle(8, 0x7a2218);
      g.strokeCircle(cx, cy, RADIUS);

      // жиринки
      g.fillStyle(0xf5e6d3, 0.75);
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * Math.PI * 2;
        g.fillCircle(
          cx + Math.cos(a) * RADIUS * 0.52,
          cy + Math.sin(a) * RADIUS * 0.52,
          12,
        );
      }

      // внутреннее кольцо + центр
      g.fillStyle(0xe07060, 0.9);
      g.fillCircle(cx, cy, Math.round(RADIUS * 0.34));
      g.fillStyle(0xc84030);
      g.fillCircle(cx, cy, 20);

      g.generateTexture(TEX_SALAMI, D, D);
      g.destroy();

      // Линейная фильтрация → плавная картинка при повороте
      tex.get(TEX_SALAMI).setFilter(Phaser.Textures.FilterMode.LINEAR);
    }

    // Нож (одна текстура для летящего и воткнутого, чтобы не было «прыжка»
    // при превращении flying → stuck — просто перестаём двигать тот же спрайт).
    // Bbox оригинала: y=-96..+52, итого 148. Origin = 96 от верха.
    if (!tex.exists(TEX_KNIFE)) {
      const TW = 24, TH = 148;
      const cx = TW / 2;
      const g  = this.make.graphics({ x: 0, y: 0 }, false);

      // blade y=0..96
      g.fillStyle(0xc8d0d8);
      g.fillRect(cx - 4.5, 0, 9, 96);
      g.lineStyle(1.5, 0x8899aa);
      g.strokeRect(cx - 4.5, 0, 9, 96);

      // guard y=98..106
      g.fillStyle(0x889999);
      g.fillRect(cx - 12, 98, 24, 8);

      // handle y=104..148
      g.fillStyle(0x7b4a2a);
      g.fillRect(cx - 7, 104, 14, 44);
      g.lineStyle(2, 0x4e2e18);
      g.strokeRect(cx - 7, 104, 14, 44);

      // wraps
      g.fillStyle(0x5a3018, 0.7);
      g.fillRect(cx - 8, 116, 16, 5);
      g.fillRect(cx - 8, 132, 16, 5);

      g.generateTexture(TEX_KNIFE, TW, TH);
      g.destroy();

      tex.get(TEX_KNIFE).setFilter(Phaser.Textures.FilterMode.LINEAR);
    }
  }

  private randomTargetTexture(): string {
    return TARGET_TEXTURES[Phaser.Math.Between(0, TARGET_TEXTURES.length - 1)];
  }

  private setRandomTargetTexture(): void {
    if (!this.salami) return;
    this.salamiTexture = this.randomTargetTexture();
    this.salami.setTexture(this.salamiTexture);
    this.salami.setDisplaySize(RADIUS * 2, RADIUS * 2);
  }

  // ─── construction ──────────────────────────────────────────────────────────

  private drawRoom(): void {
    paintPageBackdrop(this, PA_BG);
    this.add.image(CX, H / 2, 'pizzaassembly-knife-hit-bg')
      .setOrigin(0.5)
      .setDisplaySize(W, H)
      .setDepth(DEPTH.background);
  }

  private spawnKnife(): void {
    const k = this.add
      .image(CX, KNIFE_Y0, TEX_KNIFE)
      .setOrigin(0.5, KNIFE_OY)
      .setDepth(DEPTH.gameplay + 5)
      .setAlpha(0)
      .setDisplaySize(35, 129);

    // Плавный fade-in + scale-up без overshoot
    this.tweens.add({
      targets: k,
      alpha:   1,
      duration: 220,
      ease: 'Cubic.easeOut',
    });

    this.knife  = k;
    this.knifeY = KNIFE_Y0;
    this.flying = false;
  }

  // ─── input & flight ────────────────────────────────────────────────────────

  private onTap(): void {
    if (!this.canThrow || this.flying || this.done || this.inTransition) return;
    this.flying   = true;
    this.canThrow = false;
    SoundManager.playSfx('tap');
  }

  private landKnife(): void {
    this.flying = false;
    const ABS_ANGLE = Math.PI / 2;

    let hit = false;
    const min = this.stage.minAngle;
    for (let i = 0; i < this.stuck.length; i++) {
      if (angleDiff(ABS_ANGLE, this.stuck[i].localAngle + this.circleRot) < min) {
        hit = true;
        break;
      }
    }

    if (hit) this.onCollision();
    else     this.onStick();
  }

  // ─── outcomes ──────────────────────────────────────────────────────────────

  private onStick(): void {
    // Тот же спрайт превращается из «летящего» в «воткнутый» — без destroy/create.
    const k = this.knife;
    if (!k) return;
    this.knife = null;

    const localAngle = Math.PI / 2 - this.circleRot;
    k.setDepth(D_STUCK);

    // Тонкий «втык» — лёгкий пульс scale без overshoot
    const scaleX = k.scaleX;
    const scaleY = k.scaleY;
    this.tweens.add({
      targets: k,
      scaleX: { from: scaleX * 1.1, to: scaleX },
      scaleY: { from: scaleY * 1.1, to: scaleY },
      duration: 160,
      ease: 'Cubic.easeOut',
    });

    this.stuck.push({ localAngle, sprite: k });
    this.stageStuck++;

    SoundManager.playSfx('perfect');
    Haptics.trigger('perfect');
    this.spawnImpactRing();
    this.spawnHitChips(CX, CY + KNIFE_STUCK_RADIUS);
    this.updateHUD();

    if (this.stageStuck >= this.stage.goal) {
      this.completeStage();
      return;
    }

    this.time.delayedCall(180, () => {
      if (!this.done && !this.inTransition) {
        this.spawnKnife();
        this.canThrow = true;
      }
    });
  }

  private onCollision(): void {
    this.lives--;
    SoundManager.playSfx('miss');
    Haptics.trigger('miss');
    this.cameras.main.shake(160, 0.012);

    const flash = this.add.rectangle(CX, H / 2, W, H, 0xff0000, 0.28).setDepth(DEPTH.effects);
    this.tweens.add({
      targets: flash, alpha: 0, duration: 280, ease: 'Sine.easeOut',
      onComplete: () => flash.destroy(),
    });

    this.tweens.add({
      targets: this.knife,
      y: KNIFE_Y0 + 110,
      alpha: 0,
      angle: 22,
      duration: 360,
      ease: 'Sine.easeIn',
      onComplete: () => {
        this.knife?.destroy();
        this.knife = null;
        this.updateHUD();

        if (this.lives <= 0) {
          this.playLoseAnimation(() => this.finish(false));
        } else {
          this.time.delayedCall(220, () => {
            if (!this.done && !this.inTransition) {
              this.spawnKnife();
              this.canThrow = true;
            }
          });
        }
      },
    });
  }

  // ─── stage transitions ─────────────────────────────────────────────────────

  private completeStage(): void {
    this.inTransition = true;
    this.canThrow     = false;
    this.flipEvt?.remove();

    // Победный «STAGE CLEAR»
    const banner = this.add
      .text(CX, H / 2, 'СТЕЙДЖ ПРОЙДЕН!', {
        fontFamily: PIXEL_FONT,
        fontSize: '36px',
        color: '#4ADE80',
      })
      .setOrigin(0.5)
      .setDepth(DEPTH.toast)
      .setAlpha(0)
      .setScale(0.85);

    SoundManager.playSfx('win');
    Haptics.trigger('win');
    this.playRoundWinAnimation();

    this.tweens.add({
      targets: banner, alpha: 1, scale: 1,
      duration: 280, ease: 'Cubic.easeOut',
    });
    this.tweens.add({
      targets: banner, alpha: 0, y: H / 2 - 20,
      delay: 700, duration: 350, ease: 'Sine.easeIn',
      onComplete: () => banner.destroy(),
    });

    // Унесём воткнутые ножи плавно «в стороны»
    for (const k of this.stuck) {
      const dx = Math.cos(k.localAngle + this.circleRot);
      const dy = Math.sin(k.localAngle + this.circleRot);
      this.tweens.add({
        targets: k.sprite,
        x: '+=' + dx * 220,
        y: '+=' + dy * 220,
        alpha: 0,
        scale: 0.6,
        duration: 600,
        ease: 'Cubic.easeIn',
        onComplete: () => k.sprite.destroy(),
      });
    }

    // Бонус-жизнь, если есть куда
    const bonusLife = this.lives < this.maxLives;
    if (bonusLife) this.lives++;

    this.time.delayedCall(900, () => {
      if (this.done) return;
      this.stuck      = [];
      this.stageStuck = 0;
      this.stageIdx++;

      if (this.stageIdx >= TOTAL_STAGES) {
        this.finish(true);
        return;
      }

      const next = STAGES[this.stageIdx];
      this.stage = next;
      this.setRandomTargetTexture();
      this.refreshStageLabel();
      this.updateHUD();

      // Плавно меняем скорость вращения
      const targetRot = next.rotSpeed;
      this.tweens.add({
        targets: this,
        rotSpeed: targetRot,
        duration: 700,
        ease: 'Cubic.easeInOut',
      });

      // Баннер нового стейджа
      this.showStageBanner(next, false, () => {
        if (this.done) return;
        if (next.flipEnabled) this.scheduleFlip();
        this.spawnKnife();
        this.canThrow     = true;
        this.inTransition = false;
      });
    });
  }

  private showStageBanner(stage: Stage, isIntro: boolean, after: () => void): void {
    const label = `${stage.name}  ${this.stageIdx + 1}/${TOTAL_STAGES}`;

    const txt = this.add
      .text(CX, H / 2, label, {
        fontFamily: PIXEL_FONT,
        fontSize: '44px',
        color: stage.color,
      })
      .setOrigin(0.5)
      .setDepth(DEPTH.toast)
      .setAlpha(0)
      .setScale(0.7);

    const inDelay = isIntro ? 250 : 0;

    this.tweens.add({
      targets: txt, alpha: 1, scale: 1,
      delay: inDelay, duration: 360, ease: 'Cubic.easeOut',
    });
    this.tweens.add({
      targets: txt, alpha: 0, y: H / 2 - 30,
      delay: inDelay + 750, duration: 400, ease: 'Sine.easeIn',
      onComplete: () => {
        txt.destroy();
        after();
      },
    });
  }

  private refreshStageLabel(): void {
    this.stageLbl
      .setText(`${this.stage.name.toLowerCase()} ${this.stageIdx + 1}/${TOTAL_STAGES}`)
      .setColor('#0A0A0A');
  }

  // ─── HARD modifiers ────────────────────────────────────────────────────────

  private scheduleFlip(): void {
    const delay = Phaser.Math.Between(this.stage.flipMin, this.stage.flipMax);
    this.flipEvt = this.time.delayedCall(delay, () => {
      if (this.done || this.inTransition) return;
      this.flipDirection();
      this.scheduleFlip();
    });
  }

  private flipDirection(): void {
    // Плавный «тормоз → разворот → разгон» через твин
    const startSpeed = this.rotSpeed;
    const target     = -startSpeed;

    this.tweens.add({
      targets: this,
      rotSpeed: target,
      duration: 480,
      ease: 'Sine.easeInOut',
    });

    this.cameras.main.shake(50, 0.004);

    const arrow = this.add
      .text(CX, CY - RADIUS - 55, target > 0 ? '→ РАЗВОРОТ' : '← РАЗВОРОТ', {
        fontFamily: PIXEL_FONT,
        fontSize: '24px',
        color: '#FF2E2E',
      })
      .setOrigin(0.5)
      .setAlpha(0)
      .setDepth(DEPTH.toast);
    this.tweens.add({
      targets: arrow, alpha: 1, duration: 180, ease: 'Sine.easeOut',
    });
    this.tweens.add({
      targets: arrow, alpha: 0, y: arrow.y - 50,
      delay: 400, duration: 500, ease: 'Sine.easeIn',
      onComplete: () => arrow.destroy(),
    });
  }

  // ─── small fx ──────────────────────────────────────────────────────────────

  private spawnImpactRing(): void {
    // Круг на ободе колбасы — расходящаяся волна
    const ring = this.add
      .circle(CX, CY + RADIUS, 18, 0xfaf7f0, 0)
      .setStrokeStyle(3, 0xfaf7f0, 0.9)
      .setDepth(DEPTH.effects);

    this.tweens.add({
      targets: ring,
      scale: 2.2,
      alpha: 0,
      duration: 380,
      ease: 'Cubic.easeOut',
      onComplete: () => ring.destroy(),
    });
  }

  private currentTargetChipColor(): number {
    if (this.salamiTexture === 'pizzaassembly-new-sausage') return 0x8c1734;
    return 0xffe65a;
  }

  private spawnHitChips(x: number, y: number): void {
    const color = this.currentTargetChipColor();
    for (let i = 0; i < 10; i++) {
      const chip = this.add.rectangle(
        x + Phaser.Math.Between(-10, 10),
        y + Phaser.Math.Between(-8, 8),
        Phaser.Math.Between(5, 9),
        Phaser.Math.Between(5, 9),
        color,
      )
        .setDepth(DEPTH.effects)
        .setAlpha(0.95)
        .setRotation(Math.random() * Math.PI);
      this.tweens.add({
        targets: chip,
        x: chip.x + Phaser.Math.Between(-55, 55),
        y: chip.y + Phaser.Math.Between(25, 85),
        alpha: 0,
        angle: Phaser.Math.Between(-120, 120),
        duration: 520 + Math.random() * 180,
        ease: 'Cubic.easeOut',
        onComplete: () => chip.destroy(),
      });
    }
  }

  private playRoundWinAnimation(): void {
    this.tweens.add({
      targets: this.salami,
      scale: { from: this.salami.scale * 1.08, to: this.salami.scale },
      duration: 520,
      ease: 'Elastic.easeOut',
    });

    for (let i = 0; i < 28; i++) {
      const a = (i / 28) * Math.PI * 2;
      const dist = 120 + Math.random() * 70;
      const spark = this.add.rectangle(CX, CY, 8, 8, i % 2 === 0 ? 0xffe600 : 0xfaf7f0)
        .setDepth(DEPTH.effects)
        .setAlpha(0.95)
        .setRotation(a);
      this.tweens.add({
        targets: spark,
        x: CX + Math.cos(a) * dist,
        y: CY + Math.sin(a) * dist,
        alpha: 0,
        scale: 0.25,
        duration: 620 + Math.random() * 220,
        ease: 'Cubic.easeOut',
        onComplete: () => spark.destroy(),
      });
    }
  }

  private playLoseAnimation(after: () => void): void {
    this.inTransition = true;
    this.canThrow = false;

    const text = this.add.text(CX, H / 2, 'ПРОМАХ!', {
      fontFamily: PIXEL_FONT,
      fontSize: '48px',
      color: '#FF2E2E',
    }).setOrigin(0.5).setDepth(DEPTH.toast).setAlpha(0).setScale(0.65);

    this.tweens.add({
      targets: this.salami,
      angle: '+=10',
      duration: 70,
      yoyo: true,
      repeat: 5,
      ease: 'Stepped',
    });
    this.tweens.add({ targets: text, alpha: 1, scale: 1, duration: 220, ease: 'Cubic.easeOut' });
    this.tweens.add({
      targets: text,
      alpha: 0,
      y: text.y - 40,
      delay: 650,
      duration: 300,
      ease: 'Sine.easeIn',
      onComplete: () => {
        text.destroy();
        after();
      },
    });
  }

  // ─── HUD ───────────────────────────────────────────────────────────────────

  private updateHUD(): void {
    this.livesHud.update();
    this.progLbl.setText(`${this.stageStuck}/${this.stage.goal}`);
  }

  // ─── finish ────────────────────────────────────────────────────────────────

  private finish(win: boolean): void {
    if (this.done) return;
    this.done = true;

    this.flipEvt?.remove();
    this.input.off('pointerdown', this.onTap, this);

    if (win) { SoundManager.playSfx('win');  Haptics.trigger('win');  }
    else     { SoundManager.playSfx('lose'); Haptics.trigger('lose'); }

    this.add.rectangle(CX, H / 2, W, H, COLORS.black, 0.65).setDepth(DEPTH.modal);
    this.add
      .text(CX, H / 2, win ? RU.minigame.win : RU.minigame.lose, {
        fontFamily: PIXEL_FONT,
        fontSize: '42px',
        color: win ? '#4ADE80' : '#EF4444',
      })
      .setOrigin(0.5)
      .setDepth(DEPTH.modal + 1);

    // Score: насколько глубоко прошёл + сколько жизней осталось
    const totalGoal = STAGES.reduce((s, st) => s + st.goal, 0);
    const totalDone = STAGES.slice(0, this.stageIdx).reduce((s, st) => s + st.goal, 0)
                    + this.stageStuck;
    const baseFrac  = totalDone / totalGoal;
    const score = win
      ? Math.round(60 + (this.lives / this.maxLives) * 40)
      : Math.round(baseFrac * 50);

    this.time.delayedCall(900, () => {
      this.complete({
        outcome: win ? 'win' : 'lose',
        score,
        metadata: {
          stageReached: this.stageIdx + 1,
          totalStages:  TOTAL_STAGES,
          totalDone,
          totalGoal,
          lives:        this.lives,
        },
      });
    });
  }
}
