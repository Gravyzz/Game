import Phaser from 'phaser';
import { BaseMinigame } from '@minigames/BaseMinigame';
import { COLORS } from '@config/colors';
import { TEXT_STYLES } from '@config/fonts';
import { GAME, DEPTH } from '@config/game';
import { RU } from '@i18n/ru';
import { SoundManager } from '@core/SoundManager';
import { Haptics } from '@core/Haptics';
import { DONT_WORK_ASSETS, loadImageAssets } from '@core/AssetManifest';
import {
  paintPageBackdrop,
  attachHomeButton,
  attachIntro,
  createGlobalLivesDisplay,
  type GlobalLivesDisplay,
} from '@utils/SceneHelpers';
import { drawPixelButton } from '@utils/PixelButton';

/**
 * MG-02 ДОНТВОРК: РАСКОЛБАС
 *
 * Fruit-Ninja-стайл, заточенный под бренд: 3 стейджа в серии.
 *  1. ОФИС     — обычные дедлайны и кайфы.
 *  2. ЧАТ БОССА — добавляются бомбы 💼 (мгновенный лосс).
 *  3. АВРАЛ    — добавляются бонусы (⏳ slow-mo, 🍺 бонус-очки, ⚡ ×3 урон)
 *                и босс KPI ОТЧЁТ с HP-баром.
 *
 * Визуальный код:
 *  • дедлайн (РЕЖЬ)        — зелёное кольцо вокруг эмодзи
 *  • кайф    (НЕ ТРОГАЙ)   — голый эмодзи без рамки
 *  • бомба   (СМЕРТЬ)      — красный круг + пульс + подпись БОМБА!
 *  • бонус   (ХВАТАЙ)      — золотое кольцо + пульс + подпись
 */

const W  = GAME.WIDTH;
const H  = GAME.HEIGHT;
const CX = W / 2;
const GRAVITY = 1400;
const SLICE_TOLERANCE = 60;
const TEX_NOISE = 'dw_noise_v2';
const PIXEL_FONT = '"Press Start 2P", monospace';
const DISPLAY_SCORE_GOAL = 150;

type ObjType = 'bad' | 'good' | 'bomb' | 'pwr-slowmo' | 'pwr-life' | 'pwr-rage';

interface Stage {
  name:          string;
  color:         string;
  hint:          string;          // подсказка под баннером стейджа
  goal:          number;
  spawnInterval: number;
  goodChance:    number;
  bombChance:    number;
  pwrChance:     number;
  hasBoss:       boolean;
  bossHP:        number;
  badEmojis:     string[];
  goodEmojis:    string[];
  bgTexture:      string;
}

const BAD_BASE  = ['dontwork-papers', 'dontwork-folder', 'dontwork-folderr'];
const BAD_EXTRA = ['dontwork-clip', 'dontwork-stapler'];
const GOOD      = [
  'dontwork-basic-pizza',
  'dontwork-bolognese',
  'dontwork-caesar-salad',
  'dontwork-cheese-pizza',
  'dontwork-coke',
  'dontwork-french-fries',
];
const BOMB_EMOJI = 'dontwork-bomb';

const PWR_EMOJI: Record<'pwr-slowmo' | 'pwr-life' | 'pwr-rage', string> = {
  'pwr-slowmo': 'dontwork-coffee',
  'pwr-life':   'dontwork-coffee',
  'pwr-rage':   'dontwork-coffee',
};

const STAGES: Stage[] = [
  {
    name: 'офис',  color: '#0A0A0A',
    hint: '✂️ режь дедлайны  •  ❌ не задень кайф',
    goal: 7,  spawnInterval: 850,
    goodChance: 0.28, bombChance: 0,    pwrChance: 0,
    hasBoss: false, bossHP: 0,
    badEmojis: BAD_BASE, goodEmojis: GOOD.slice(0, 3),
    bgTexture: 'dontwork-office-bg',
  },
  {
    name: 'у босса', color: '#0A0A0A',
    hint: '⚠ появилась 💼 БОМБА — мгновенная смерть',
    goal: 9,  spawnInterval: 650,
    goodChance: 0.32, bombChance: 0.14, pwrChance: 0,
    hasBoss: false, bossHP: 0,
    badEmojis: [...BAD_BASE, BAD_EXTRA[0]], goodEmojis: GOOD.slice(0, 4),
    bgTexture: 'dontwork-boss-bg',
  },
  {
    name: 'дедлайн', color: '#0A0A0A',
    hint: '🎁 хватай бонусы  •  завали босса KPI',
    goal: 99, spawnInterval: 520,
    goodChance: 0.30, bombChance: 0.20, pwrChance: 0.10,
    hasBoss: true, bossHP: 10,
    badEmojis: [...BAD_BASE, ...BAD_EXTRA], goodEmojis: GOOD,
    bgTexture: 'dontwork-deadline-bg',
  },
];

const TOTAL_STAGES = STAGES.length;

interface FlyingObject {
  type:     ObjType;
  emoji:    string;
  ctx:      Phaser.GameObjects.Container;
  bg:       Phaser.GameObjects.Arc | null;
  vx:       number;
  vy:       number;
  rotSpeed: number;
  alive:    boolean;
  cut:      boolean;
  pulse:    Phaser.Tweens.Tween | null;
}

interface Decor {
  radius:       number;
  fontSize:     string;
  fillColor:    number;
  fillAlpha:    number;
  strokeColor:  number;
  strokeWidth:  number;
  strokeAlpha:  number;
  label:        string | null;
  labelColor:   string;
  pulse:        'bomb' | 'pwr' | null;
}

function decorationFor(type: ObjType): Decor {
  switch (type) {
    case 'bad':
      return {
        radius: 56, fontSize: '64px',
        fillColor: 0x72df67, fillAlpha: 0.18,
        strokeColor: 0x72df67, strokeWidth: 4, strokeAlpha: 0.95,
        label: null, labelColor: '#4ADE80', pulse: null,
      };
    case 'good':
      return {
        radius: 56, fontSize: '64px',
        fillColor: 0xff2e2e, fillAlpha: 0.12,
        strokeColor: 0xff2e2e, strokeWidth: 4, strokeAlpha: 0.95,
        label: null, labelColor: '#FAF7F0', pulse: null,
      };
    case 'bomb':
      return {
        radius: 64, fontSize: '70px',
        fillColor: 0xff2e2e, fillAlpha: 0.14,
        strokeColor: 0xff2e2e, strokeWidth: 4, strokeAlpha: 1,
        label: null, labelColor: '#FF2E2E', pulse: 'bomb',
      };
    case 'pwr-slowmo':
    case 'pwr-life':
    case 'pwr-rage':
      return {
        radius: 56, fontSize: '60px',
        fillColor: 0xffe55c, fillAlpha: 0.18,
        strokeColor: 0xffe55c, strokeWidth: 4, strokeAlpha: 1,
        label: null, labelColor: '#FFE600', pulse: 'pwr',
      };
  }
}

export class DontWorkScene extends BaseMinigame {
  // Stage state
  private stageIdx     = 0;
  private stage!:        Stage;
  private stageBadCut  = 0;
  private bossHP       = 0;

  // Score
  private streak       = 0;
  private comboInSwipe = 0;
  private totalScore   = 0;
  private errors       = 0;

  // Buffs
  private timeScale  = 1;
  private rageEndsAt = 0;

  // Flow flags
  private finished     = false;
  private inTransition = false;
  private canPlay      = false;

  // Objects
  private objects: FlyingObject[] = [];
  private spawnTimer: Phaser.Time.TimerEvent | null = null;

  // UI
  private stageLbl!:  Phaser.GameObjects.Text;
  private livesHud!:  GlobalLivesDisplay;
  private scoreLbl!:  Phaser.GameObjects.Text;
  private errorsLbl!: Phaser.GameObjects.Text;
  private streakLbl!: Phaser.GameObjects.Text;
  private bgImage!:   Phaser.GameObjects.Image;
  private bossCtx:    Phaser.GameObjects.Container | null = null;
  private bossLbl:    Phaser.GameObjects.Image      | null = null;
  private bossHpFill: Phaser.GameObjects.Rectangle  | null = null;

  // Trail
  private trail: Phaser.GameObjects.Graphics | null = null;
  private trailPoints: Array<{ x: number; y: number; t: number }> = [];
  private isDragging = false;
  private lastPx = -1;
  private lastPy = -1;

  constructor() { super({ key: 'DontWork' }); }

  preload(): void {
    loadImageAssets(this, DONT_WORK_ASSETS);
  }

  // ─── lifecycle ─────────────────────────────────────────────────────────────

  create(): void {
    this.stageIdx     = 0;
    this.stage        = STAGES[0];
    this.objects      = [];
    this.stageBadCut  = 0;
    this.bossHP       = 0;
    this.streak       = 0;
    this.comboInSwipe = 0;
    this.totalScore   = 0;
    this.errors       = 0;
    this.timeScale    = 1;
    this.rageEndsAt   = 0;
    this.finished     = false;
    this.inTransition = true;
    this.canPlay      = false;
    this.trailPoints  = [];

    [
      ...GOOD,
      ...BAD_BASE,
      ...BAD_EXTRA,
      BOMB_EMOJI,
      'dontwork-coffee',
      'dontwork-kpi-boss',
      'dontwork-office-bg',
      'dontwork-boss-bg',
      'dontwork-deadline-bg',
    ].forEach((key) => {
      this.textures.get(key).setFilter(Phaser.Textures.FilterMode.NEAREST);
    });

    this.bakeNoise();

    // Background
    paintPageBackdrop(this, 0x17110d);
    this.bgImage = this.add.image(CX, H / 2, this.stage.bgTexture)
      .setOrigin(0.5)
      .setDepth(DEPTH.background);
    this.fitStageBackground();
    attachHomeButton(this);

    // Весь HUD выровнен по y=80 (центр home-кнопки). Сердечки, центр панели
    // и сама home-кнопка теперь визуально на одной линии.
    // Панель счёта — в едином пиксельном стиле с легендой/кнопками меню.
    const scorePanelW = 252;
    const scorePanelH = 116;
    const scorePanelG = this.add.graphics().setDepth(DEPTH.ui);
    scorePanelG.setPosition(W - 154 - scorePanelW / 2, 80 - scorePanelH / 2);
    drawPixelButton(scorePanelG, scorePanelW, scorePanelH, 0xeeeeee, {
      step: 4, border: 4, corner: 12,
    });

    this.stageLbl = this.add
      .text(W - 270, 36, '', {
        ...TEXT_STYLES.subtitle,
        fontFamily: PIXEL_FONT,
        fontSize: '16px',
        color: '#0A0A0A',
      })
      .setOrigin(0, 0)
      .setDepth(DEPTH.ui);

    this.livesHud = createGlobalLivesDisplay(this, {
      x: 140,
      countX: 106,
      stackFirstX: 158,
      y: 80,
      heartSize: 52,
      heartGap: 58,
      fontSize: '34px',
      color: '#FAF7F0',
    });

    this.scoreLbl = this.add
      .text(W - 270, 74, '', {
        ...TEXT_STYLES.subtitle,
        fontFamily: PIXEL_FONT,
        fontSize: '15px',
        color: '#2CA044',
      })
      .setOrigin(0, 0)
      .setDepth(DEPTH.ui);

    this.errorsLbl = this.add
      .text(W - 270, 107, '', {
        ...TEXT_STYLES.subtitle,
        fontFamily: PIXEL_FONT,
        fontSize: '15px',
        color: '#C24A4A',
      })
      .setOrigin(0, 0)
      .setDepth(DEPTH.ui);

    // Постоянная легенда — что резать, что не трогать
    this.buildLegend();

    this.streakLbl = this.add
      .text(CX, 220, '', {
        ...TEXT_STYLES.subtitle,
        fontFamily: PIXEL_FONT,
        fontSize: '20px',
        color: '#FFE600',
      })
      .setOrigin(0.5, 0)
      .setDepth(DEPTH.ui)
      .setAlpha(0);

    this.trail = this.add.graphics().setDepth(DEPTH.effects);

    this.input.on('pointerdown', this.onPointerDown, this);
    this.input.on('pointermove', this.onPointerMove, this);
    this.input.on('pointerup',   this.onPointerUp,   this);

    this.refreshHud();
    this.cameras.main.fadeIn(300, 10, 10, 10);

    attachIntro(
      this,
      RU.minigame.names.DontWork,
      RU.minigame.guides.DontWork,
      () => {
        // Intro stage 1 — после Погнали
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

    // Physics — двигаем контейнер каждого объекта
    for (const obj of this.objects) {
      if (!obj.alive) continue;
      obj.vy += GRAVITY * dt;
      obj.ctx.x += obj.vx * dt;
      obj.ctx.y += obj.vy * dt;
      obj.ctx.rotation += obj.rotSpeed * dt;

      if (obj.ctx.y > H + 100 || obj.ctx.x < -100 || obj.ctx.x > W + 100) {
        obj.alive = false;
        if (obj.type === 'bad' && !obj.cut) this.onMissBad();
        this.destroyObject(obj);
      }
    }
    this.objects = this.objects.filter(o => o.alive);

    // Trail render
    this.redrawTrail();
  }

  shutdown(): void {
    this.input.off('pointerdown', this.onPointerDown, this);
    this.input.off('pointermove', this.onPointerMove, this);
    this.input.off('pointerup',   this.onPointerUp,   this);
    this.spawnTimer?.remove();
    this.tweens.killAll();
  }

  // ─── legend ────────────────────────────────────────────────────────────────

  private buildLegend(): void {
    // Панель: ужата (600x170 vs 650x210), в едином пиксельном стиле с
    // кнопками меню — чёрный ступенчатый аутлайн, светлая заливка.
    // Иконки и текст подросли (круг 26→32, картинка 44→56, шрифт 16→18),
    // чтобы внутри не оставалось пустого воздуха.
    const panelW = 600;
    const panelH = 170;
    const panelX = CX;
    const panelY = H - 110;
    const panelG = this.add.graphics().setDepth(DEPTH.ui);
    panelG.setPosition(panelX - panelW / 2, panelY - panelH / 2);
    drawPixelButton(panelG, panelW, panelH, 0xeeeeee, {
      step: 6, border: 6, corner: 18,
    });

    const cells = [
      { x: panelX - 180, y: panelY - 38, icon: 'dontwork-basic-pizza', label: 'нельзя', ring: 0xff2e2e },
      { x: panelX + 30,  y: panelY - 38, icon: 'dontwork-bomb',        label: 'смерть', ring: 0xff2e2e },
      { x: panelX - 180, y: panelY + 38, icon: 'dontwork-papers',      label: 'можно',  ring: 0x72df67 },
      { x: panelX + 30,  y: panelY + 38, icon: 'dontwork-coffee',      label: 'бонус',  ring: 0xffe55c },
    ];

    for (const c of cells) {
      this.add.circle(c.x, c.y, 32, c.ring, 0.22)
        .setStrokeStyle(4, c.ring, 0.95)
        .setDepth(DEPTH.ui + 1);
      this.add.image(c.x, c.y, c.icon)
        .setDisplaySize(56, 56)
        .setDepth(DEPTH.ui + 2);

      this.add.text(c.x + 52, c.y, c.label, {
        ...TEXT_STYLES.subtitle,
        fontFamily: PIXEL_FONT,
        fontSize: '18px',
        color: '#C24A4A',
      }).setOrigin(0, 0.5).setDepth(DEPTH.ui + 1);
    }
  }

  // ─── stage flow ────────────────────────────────────────────────────────────

  private startStage(idx: number): void {
    this.stageIdx    = idx;
    this.stage       = STAGES[idx];
    this.stageBadCut = 0;
    this.bossHP      = this.stage.bossHP;
    this.bgImage.setTexture(this.stage.bgTexture);
    this.fitStageBackground();
    this.refreshHud();

    if (this.stage.hasBoss) this.spawnBoss();

    this.spawnTimer = this.time.addEvent({
      delay: this.stage.spawnInterval,
      loop: true,
      callback: this.spawnObject,
      callbackScope: this,
    });
  }

  private completeStage(): void {
    if (this.inTransition || this.finished) return;
    this.inTransition = true;
    this.canPlay      = false;
    this.spawnTimer?.remove();
    this.spawnTimer = null;

    this.refreshHud();

    // Sweep alive objects off-screen
    for (const obj of this.objects) {
      if (!obj.alive) continue;
      obj.alive = false;
      obj.pulse?.stop();
      this.tweens.add({
        targets: obj.ctx, alpha: 0, scale: 0.6,
        duration: 380, ease: 'Cubic.easeIn',
        onComplete: () => obj.ctx.destroy(),
      });
    }
    this.objects = [];

    // Despawn boss
    if (this.bossCtx) {
      const ctx = this.bossCtx;
      this.tweens.add({
        targets: ctx, alpha: 0, scale: 0.6,
        duration: 400, ease: 'Cubic.easeIn',
        onComplete: () => ctx.destroy(),
      });
      this.bossCtx = null;
      this.bossLbl = null;
      this.bossHpFill = null;
    }

    // Stage clear banner
    const banner = this.add
      .text(CX, H / 2, 'СТЕЙДЖ ПРОЙДЕН!', {
        ...TEXT_STYLES.hero,
        fontFamily: PIXEL_FONT,
        fontSize: '40px',
        color: '#4ADE80',
        stroke: '#0A0A0A',
        strokeThickness: 7,
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
      this.showStageBanner(next, () => {
        if (this.finished) return;
        this.startStage(nextIdx);
        this.canPlay      = true;
        this.inTransition = false;
      });
    });
  }

  /** Большой баннер с названием стейджа + подсказка под ним */
  private showStageBanner(stage: Stage, after: () => void): void {
    const idx = STAGES.indexOf(stage);

    const txt = this.add
      .text(CX, H / 2 - 24, `${stage.name}  ${idx + 1}/${TOTAL_STAGES}`, {
        ...TEXT_STYLES.hero,
        fontFamily: PIXEL_FONT,
        fontSize: '52px',
        color: '#FAF7F0',
        stroke: '#0A0A0A',
        strokeThickness: 8,
      })
      .setOrigin(0.5).setDepth(DEPTH.toast).setAlpha(0).setScale(0.7);

    const hint = this.add
      .text(CX, H / 2 + 36, stage.hint, {
        ...TEXT_STYLES.subtitle,
        fontFamily: PIXEL_FONT,
        fontSize: '16px',
        color: '#FAF7F0',
        stroke: '#0A0A0A',
        strokeThickness: 5,
      })
      .setOrigin(0.5).setDepth(DEPTH.toast).setAlpha(0);

    this.tweens.add({ targets: txt,  alpha: 1, scale: 1, duration: 360, ease: 'Cubic.easeOut' });
    this.tweens.add({ targets: hint, alpha: 1,           duration: 360, delay: 120, ease: 'Cubic.easeOut' });

    this.tweens.add({
      targets: [txt, hint], alpha: 0, y: '-=30',
      delay: 1200, duration: 400, ease: 'Sine.easeIn',
      onComplete: () => { txt.destroy(); hint.destroy(); after(); },
    });
  }

  // ─── spawning ──────────────────────────────────────────────────────────────

  private spawnObject(): void {
    if (this.inTransition || this.finished) return;

    let type: ObjType;
    const r = Math.random();
    if (r < this.stage.bombChance) {
      type = 'bomb';
    } else if (r < this.stage.bombChance + this.stage.pwrChance) {
      const p = Math.random();
      type = p < 0.5 ? 'pwr-slowmo' : p < 0.8 ? 'pwr-life' : 'pwr-rage';
    } else if (Math.random() < this.stage.goodChance) {
      type = 'good';
    } else {
      type = 'bad';
    }

    const emoji = this.pickEmoji(type);
    const decor = decorationFor(type);

    const startX = Phaser.Math.Between(120, W - 120);
    const startY = H + 50;
    const targetX = Phaser.Math.Between(80, W - 80);
    const targetY = Phaser.Math.Between(H * 0.30, H * 0.50);
    const flightTime = 1.4;
    const dx = targetX - startX;
    const dy = targetY - startY;
    const vx = dx / flightTime;
    const vy = (dy - 0.5 * GRAVITY * flightTime * flightTime) / flightTime;

    // Контейнер: фон-кольцо + эмодзи + (опционально) подпись
    const ctx = this.add.container(startX, startY).setDepth(DEPTH.gameplay);

    let bg: Phaser.GameObjects.Arc | null = null;
    if (decor.radius > 0) {
      bg = this.add.circle(0, 0, decor.radius, decor.fillColor, decor.fillAlpha);
      if (decor.strokeWidth > 0) {
        bg.setStrokeStyle(decor.strokeWidth, decor.strokeColor, decor.strokeAlpha);
      }
      ctx.add(bg);
    }

    if (this.textures.exists(emoji)) {
      const image = this.add.image(0, 0, emoji).setOrigin(0.5);
      const size = this.getObjectDisplaySize(emoji, type);
      image.setDisplaySize(size.w, size.h);
      ctx.add(image);
    } else {
      const text = this.add.text(0, 0, emoji, {
        fontFamily: PIXEL_FONT,
        fontSize: decor.fontSize,
      }).setOrigin(0.5);
      ctx.add(text);
    }

    if (decor.label) {
      const lbl = this.add.text(0, decor.radius + 14, decor.label, {
        fontFamily: PIXEL_FONT,
        fontSize: '14px',
        color: decor.labelColor,
        stroke: '#0A0A0A',
        strokeThickness: 4,
      }).setOrigin(0.5);
      ctx.add(lbl);
    }

    // Пульс на бомбе и бонусах
    let pulse: Phaser.Tweens.Tween | null = null;
    if (decor.pulse === 'bomb' && bg) {
      pulse = this.tweens.add({
        targets: bg, scale: 1.18, yoyo: true, repeat: -1,
        duration: 320, ease: 'Sine.easeInOut',
      });
    } else if (decor.pulse === 'pwr' && bg) {
      pulse = this.tweens.add({
        targets: bg, scale: 1.10, yoyo: true, repeat: -1,
        duration: 500, ease: 'Sine.easeInOut',
      });
    }

    this.objects.push({
      type, emoji, ctx, bg, vx, vy,
      rotSpeed: Phaser.Math.FloatBetween(-2.5, 2.5),
      alive: true, cut: false, pulse,
    });
  }

  private pickEmoji(type: ObjType): string {
    if (type === 'bad')  return this.stage.badEmojis[Math.floor(Math.random() * this.stage.badEmojis.length)];
    if (type === 'good') return this.stage.goodEmojis[Math.floor(Math.random() * this.stage.goodEmojis.length)];
    if (type === 'bomb') return BOMB_EMOJI;
    return PWR_EMOJI[type as keyof typeof PWR_EMOJI];
  }

  private getObjectDisplaySize(texture: string, type: ObjType): { w: number; h: number } {
    if (type === 'bomb') return { w: 100, h: 100 };
    if (type === 'pwr-slowmo' || type === 'pwr-life' || type === 'pwr-rage') return { w: 72, h: 72 };
    if (texture === 'dontwork-french-fries') return { w: 78, h: 90 };
    if (texture === 'dontwork-coke') return { w: 56, h: 92 };
    if (texture === 'dontwork-clip') return { w: 76, h: 76 };
    if (texture === 'dontwork-folder' || texture === 'dontwork-folderr') return { w: 88, h: 78 };
    if (texture === 'dontwork-stapler') return { w: 86, h: 62 };
    return { w: 86, h: 86 };
  }

  private destroyObject(obj: FlyingObject): void {
    obj.pulse?.stop();
    obj.ctx.destroy();
  }

  // ─── input & slicing ───────────────────────────────────────────────────────

  private onPointerDown(p: Phaser.Input.Pointer): void {
    if (!this.canPlay || this.finished) return;
    this.isDragging   = true;
    this.lastPx       = p.x;
    this.lastPy       = p.y;
    this.comboInSwipe = 0;
    this.trailPoints  = [{ x: p.x, y: p.y, t: this.time.now }];
  }

  private onPointerMove(p: Phaser.Input.Pointer): void {
    if (!this.isDragging) return;
    const x1 = this.lastPx, y1 = this.lastPy;
    const x2 = p.x,         y2 = p.y;

    this.trailPoints.push({ x: x2, y: y2, t: this.time.now });
    if (this.trailPoints.length > 30) this.trailPoints.shift();

    this.checkSliceLine(x1, y1, x2, y2);

    this.lastPx = x2;
    this.lastPy = y2;
  }

  private onPointerUp(): void {
    this.isDragging = false;
  }

  private redrawTrail(): void {
    if (!this.trail) return;
    const now = this.time.now;
    while (this.trailPoints.length > 0 && now - this.trailPoints[0].t > 220) {
      this.trailPoints.shift();
    }

    this.trail.clear();
    if (this.trailPoints.length < 2) return;

    const layers: Array<{ width: number; color: number; alpha: number }> = [
      { width: 22, color: 0xff7a40, alpha: 0.18 },
      { width: 12, color: 0xffd060, alpha: 0.45 },
      { width: 4,  color: 0xffffff, alpha: 0.9  },
    ];

    for (const ly of layers) {
      this.trail.lineStyle(ly.width, ly.color, ly.alpha);
      this.trail.beginPath();
      this.trail.moveTo(this.trailPoints[0].x, this.trailPoints[0].y);
      for (let i = 1; i < this.trailPoints.length; i++) {
        this.trail.lineTo(this.trailPoints[i].x, this.trailPoints[i].y);
      }
      this.trail.strokePath();
    }
  }

  private checkSliceLine(x1: number, y1: number, x2: number, y2: number): void {
    for (const obj of this.objects) {
      if (!obj.alive || obj.cut) continue;
      const d = this.distancePointToSegment(obj.ctx.x, obj.ctx.y, x1, y1, x2, y2);
      if (d <= SLICE_TOLERANCE) this.sliceObject(obj);
    }
  }

  private distancePointToSegment(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
    const abx = bx - ax, aby = by - ay;
    const apx = px - ax, apy = py - ay;
    const ab2 = abx * abx + aby * aby;
    const t = ab2 > 0 ? Math.max(0, Math.min(1, (apx * abx + apy * aby) / ab2)) : 0;
    const cx = ax + abx * t, cy = ay + aby * t;
    const dx = px - cx,      dy = py - cy;
    return Math.sqrt(dx * dx + dy * dy);
  }

  private sliceObject(obj: FlyingObject): void {
    obj.cut = true;
    obj.alive = false;

    const x = obj.ctx.x, y = obj.ctx.y;
    const t = obj.type;

    this.spawnHalves(obj.emoji, x, y);
    this.destroyObject(obj);

    if (t === 'bad')         this.onCutBad(x, y);
    else if (t === 'good')   this.onCutGood(x, y);
    else if (t === 'bomb')   this.onCutBomb(x, y);
    else                     this.applyPowerUp(t);
  }

  private onCutBad(x: number, y: number): void {
    this.comboInSwipe++;
    this.streak++;
    this.stageBadCut++;

    const mult = Math.min(this.comboInSwipe, 5);
    this.totalScore += 10 * mult;
    if (mult >= 2) this.showCombo(x, y, mult);

    SoundManager.playSfx('impact');
    Haptics.trigger('good');
    this.spawnSparks(x, y, 0xffe600);
    this.refreshHud();

    if (this.stage.hasBoss) {
      const dmg = this.isRageActive() ? 3 : 1;
      this.damageBoss(dmg);
    } else if (this.stageBadCut >= this.stage.goal) {
      this.completeStage();
    }

    if (this.streak > 0 && this.streak % 5 === 0) this.showStreak(this.streak);
  }

  private onCutGood(x: number, y: number): void {
    this.streak = 0;
    this.errors++;
    SoundManager.playSfx('miss');
    Haptics.trigger('miss');
    this.spawnSparks(x, y, 0xef4444);
    this.flashScreen(0xef4444, 0.32, 250);
    this.refreshHud();
    this.finish(false);
  }

  private onCutBomb(x: number, y: number): void {
    this.spawnSparks(x, y, 0xff2e2e);
    this.flashScreen(0xff2e2e, 0.55, 350);
    this.cameras.main.shake(260, 0.022);
    SoundManager.playSfx('heavyImpact');
    Haptics.trigger('lose');
    this.errors++;
    this.refreshHud();
    this.finish(false);
  }

  private onMissBad(): void {
    this.streak = 0;
    this.errors++;
    SoundManager.playSfx('miss');
    Haptics.trigger('miss');
    this.refreshHud();
    this.finish(false);
  }

  // ─── power-ups ─────────────────────────────────────────────────────────────

  private applyPowerUp(t: 'pwr-slowmo' | 'pwr-life' | 'pwr-rage'): void {
    SoundManager.playSfx('bubblePop');
    Haptics.trigger('perfect');

    if (t === 'pwr-slowmo') {
      this.timeScale = 0.45;
      this.showToast('SLOW-MO', '#7A5CFF');
      this.time.delayedCall(2500, () => { this.timeScale = 1; });
    } else if (t === 'pwr-life') {
      this.totalScore += 50;
      this.showToast('+50', '#4ADE80');
      this.refreshHud();
    } else {
      this.rageEndsAt = this.time.now + 7000;
      this.showToast('×3 УРОН', '#FF2E2E');
    }
  }

  private isRageActive(): boolean {
    return this.time.now < this.rageEndsAt;
  }

  // ─── boss ──────────────────────────────────────────────────────────────────

  private spawnBoss(): void {
    const c = this.add.container(CX, 245).setDepth(DEPTH.gameplay);

    const boss = this.add.image(0, -18, 'dontwork-kpi-boss').setOrigin(0.5);
    boss.setDisplaySize(130, 130);

    const bw = 280, bh = 18;
    const frame = this.add.rectangle(0, 72, bw, bh, 0x0a0a0a)
      .setStrokeStyle(3, 0x0a0a0a);
    const fill  = this.add.rectangle(-bw / 2 + 3, 72, bw - 6, bh - 6, 0x4ade80)
      .setOrigin(0, 0.5);
    fill.setData('maxHP', this.bossHP);

    c.add([boss, frame, fill]);
    c.setAlpha(0).setScale(0.7);

    this.tweens.add({ targets: c, alpha: 1, scale: 1, duration: 350, ease: 'Cubic.easeOut' });

    this.bossCtx    = c;
    this.bossLbl    = boss;
    this.bossHpFill = fill;
  }

  private damageBoss(amount: number): void {
    if (!this.bossHpFill || !this.bossLbl) return;

    this.bossHP = Math.max(0, this.bossHP - amount);
    const maxHP = this.bossHpFill.getData('maxHP') as number;
    const frac  = this.bossHP / maxHP;

    this.tweens.add({
      targets: this.bossHpFill, scaleX: frac,
      duration: 220, ease: 'Cubic.easeOut',
    });
    if      (frac < 0.35) this.bossHpFill.setFillStyle(0xef4444);
    else if (frac < 0.65) this.bossHpFill.setFillStyle(0xffe600);

    this.tweens.add({
      targets: this.bossLbl,
      x: { from: -8, to: 0 }, duration: 90, ease: 'Sine.easeOut',
    });

    if (this.bossHP <= 0) this.completeStage();
  }

  // ─── visual fx ─────────────────────────────────────────────────────────────

  private spawnHalves(emoji: string, x: number, y: number): void {
    const isTexture = this.textures.exists(emoji);
    const h1 = isTexture
      ? this.add.image(x - 12, y, emoji).setDisplaySize(58, 58)
      : this.add.text(x - 12, y, emoji, { fontSize: '64px' });
    const h2 = isTexture
      ? this.add.image(x + 12, y, emoji).setDisplaySize(58, 58)
      : this.add.text(x + 12, y, emoji, { fontSize: '64px' });

    h1.setOrigin(0.5).setDepth(DEPTH.gameplay).setAlpha(0.9);
    h2.setOrigin(0.5).setDepth(DEPTH.gameplay).setAlpha(0.9);

    this.tweens.add({
      targets: h1, x: x - 90, y: y + 110, angle: -180, alpha: 0,
      duration: 600, ease: 'Quad.easeIn', onComplete: () => h1.destroy(),
    });
    this.tweens.add({
      targets: h2, x: x + 90, y: y + 130, angle: 180, alpha: 0,
      duration: 600, ease: 'Quad.easeIn', onComplete: () => h2.destroy(),
    });
  }

  private spawnSparks(x: number, y: number, color: number): void {
    for (let i = 0; i < 10; i++) {
      const len = 6 + Math.random() * 10;
      const r = this.add.rectangle(x, y, 4, len, color).setDepth(DEPTH.effects);
      const angle = Math.random() * Math.PI * 2;
      r.setRotation(angle);
      const speed = 140 + Math.random() * 200;
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

  private showCombo(x: number, y: number, mult: number): void {
    const t = this.add.text(x, y - 50, `×${mult}`, {
      ...TEXT_STYLES.hero,
      fontFamily: PIXEL_FONT,
      fontSize: '38px',
      color: '#FFE600',
    }).setOrigin(0.5).setDepth(DEPTH.toast).setAlpha(0).setScale(0.6);
    this.tweens.add({ targets: t, alpha: 1, scale: 1, duration: 160, ease: 'Cubic.easeOut' });
    this.tweens.add({
      targets: t, alpha: 0, y: y - 100,
      delay: 240, duration: 380, ease: 'Sine.easeIn',
      onComplete: () => t.destroy(),
    });
  }

  private showStreak(n: number): void {
    this.streakLbl.setText(`РАСКОЛБАС ×${n}!`).setAlpha(0).setScale(0.7);
    this.tweens.add({
      targets: this.streakLbl, alpha: 1, scale: 1,
      duration: 220, ease: 'Cubic.easeOut',
    });
    this.tweens.add({
      targets: this.streakLbl, alpha: 0,
      delay: 1100, duration: 350, ease: 'Sine.easeIn',
    });
  }

  private showToast(text: string, color: string): void {
    const t = this.add.text(CX, H / 2 - 100, text, {
      ...TEXT_STYLES.hero,
      fontFamily: PIXEL_FONT,
      fontSize: '42px',
      color,
    }).setOrigin(0.5).setDepth(DEPTH.toast).setAlpha(0).setScale(0.7);
    this.tweens.add({ targets: t, alpha: 1, scale: 1, duration: 220, ease: 'Cubic.easeOut' });
    this.tweens.add({
      targets: t, alpha: 0, y: t.y - 30,
      delay: 800, duration: 350, ease: 'Sine.easeIn',
      onComplete: () => t.destroy(),
    });
  }

  private flashScreen(color: number, alpha: number, duration: number): void {
    const f = this.add.rectangle(CX, H / 2, W, H, color, alpha).setDepth(DEPTH.effects);
    this.tweens.add({
      targets: f, alpha: 0, duration, ease: 'Sine.easeOut',
      onComplete: () => f.destroy(),
    });
  }

  // ─── HUD ───────────────────────────────────────────────────────────────────

  private refreshHud(): void {
    this.livesHud.update();
    const stageScore = this.getStageDisplayScore();
    const stageScoreGoal = this.getStageDisplayScoreGoal();
    this.scoreLbl.setText(`очки ${stageScore}/${stageScoreGoal}`);
    this.errorsLbl.setText(`ошибки ${this.errors}`);
    this.stageLbl
      .setText(`${this.stage.name}  ${this.stageIdx + 1}/${TOTAL_STAGES}`)
      .setColor(this.stage.color);
  }

  private getStageDisplayScore(): number {
    const goal = this.stage.hasBoss ? this.stage.bossHP : this.stage.goal;
    const done = this.stage.hasBoss ? Math.max(0, this.stage.bossHP - this.bossHP) : this.stageBadCut;
    if (goal <= 0) return 0;
    return Math.min(DISPLAY_SCORE_GOAL, Math.round((done / goal) * DISPLAY_SCORE_GOAL));
  }

  private getStageDisplayScoreGoal(): number {
    return DISPLAY_SCORE_GOAL;
  }

  private fitStageBackground(): void {
    this.bgImage.setPosition(CX, H / 2);
    this.bgImage.setScale(Math.max(W / this.bgImage.width, H / this.bgImage.height));
  }

  // ─── finish ────────────────────────────────────────────────────────────────

  private finish(win: boolean): void {
    if (this.finished) return;
    this.finished = true;
    this.canPlay  = false;
    this.spawnTimer?.remove();

    if (win) { SoundManager.playSfx('win');  Haptics.trigger('win');  }
    else     { SoundManager.playSfx('lose'); Haptics.trigger('lose'); }

    this.add.rectangle(CX, H / 2, W, H, COLORS.black, 0.65).setDepth(DEPTH.modal);
    this.add
      .text(CX, H / 2, win ? RU.minigame.win : RU.minigame.lose, {
        ...TEXT_STYLES.hero,
        fontFamily: PIXEL_FONT,
        fontSize: '48px',
        color: win ? '#4ADE80' : '#EF4444',
      })
      .setOrigin(0.5)
      .setDepth(DEPTH.modal + 1);

    const score = win ? 100 : Math.round((this.stageIdx / TOTAL_STAGES) * 50);

    this.time.delayedCall(900, () => {
      this.complete({
        outcome: win ? 'win' : 'lose',
        score,
        metadata: {
          stageReached: this.stageIdx + 1,
          totalStages:  TOTAL_STAGES,
          totalScore:   this.totalScore,
        },
      });
    });
  }

  // ─── helpers ───────────────────────────────────────────────────────────────

  private bakeNoise(): void {
    if (this.textures.exists(TEX_NOISE)) return;
    const g = this.make.graphics({ x: 0, y: 0 }, false);
    g.fillStyle(0x000000, 0.06);
    for (let i = 0; i < 250; i++) {
      g.fillCircle(Math.random() * W, Math.random() * H, Math.random() * 1.5);
    }
    g.generateTexture(TEX_NOISE, W, H);
    g.destroy();
  }
}
