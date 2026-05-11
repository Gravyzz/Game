import Phaser from 'phaser';
import { BaseMinigame } from '@minigames/BaseMinigame';
import { GAME, DEPTH } from '@config/game';
import { SoundManager } from '@core/SoundManager';
import { Haptics } from '@core/Haptics';
import { paintPageBackdrop, attachHomeButton } from '@utils/SceneHelpers';

/**
 * NEW Crossy Jeffrey — Crossy Road в нашем сеттинге.
 *
 * Полосы (rows) генерируются процедурно:
 *   GRASS    — безопасно, могут быть деревья (препятствия)
 *   ROAD     — машины едут поперёк
 *   RAIL     — поезд прилетает на скорости, перед прилётом мигают шпалы
 *   PAVEMENT — фонари, скамейки, мусорки (декорации + препятствия)
 *
 * Управление: свайп / тап вверх / WASD / стрелки.
 * Тап в любую точку = шаг вперёд.
 *
 * Режимы (через initData.infinite):
 *   step  — 3 уровня, цель пройти N шагов вперёд (25/50/80)
 *   inf   — бесконечная генерация, очки = макс шагов вперёд (для дев-меню)
 *
 * Камера медленно подбирается снизу — стой долго и тебя «съест».
 */

const TILE = 80;
const COLS = 9;
const PLAYER_SCREEN_ROW = 5; // на каком экранном «ряду снизу» держим игрока
const MOVE_DURATION_MS = 110;

const STEP_GOALS_BY_LEVEL: Record<number, number> = {
  1: 25,
  2: 50,
  3: 80,
  4: 80,
};

// Скорость наплыва камеры (шагов в секунду)
const CAMERA_CREEP_PER_SEC_BY_LEVEL: Record<number, number> = {
  1: 0.45,
  2: 0.6,
  3: 0.8,
  4: 0.85,
};

const CAR_SPEED_BY_LEVEL: Record<number, [number, number]> = {
  // [min, max] px/sec
  1: [110, 170],
  2: [150, 220],
  3: [200, 290],
  4: [220, 320],
};

const TRAIN_SPEED_BY_LEVEL: Record<number, [number, number]> = {
  1: [380, 460],
  2: [460, 560],
  3: [550, 680],
  4: [600, 720],
};

const COLORS_GRASS = [0x9cd66f, 0xa6da77, 0x88c75d];
const COLOR_ROAD = 0x303035;
const COLOR_ROAD_LINE = 0xfff0a8;
const COLORS_RAIL = [0x7d5a3b, 0x896645];
const COLOR_PAVEMENT = 0xd0d4d8;
const COLOR_PAVEMENT_DARK = 0xb6bcc1;

const CAR_TEXTURES = ['jeff-car-white', 'jeff-car-green', 'jeff-car-black', 'jeff-car-blue'];

// Декорации тротуара — рандомно из списка
const PAVEMENT_OBSTACLES = [
  'jeff-lamp', 'jeff-bench', 'jeff-trash',
  'jeff-house-blue', 'jeff-house-orange', 'jeff-house-green', 'jeff-house-yellow',
  'jeff-building-red', 'jeff-building-green', 'jeff-building-orange', 'jeff-building-blue',
];

type RowKind = 'grass' | 'road' | 'rail' | 'pavement';
type Direction = 'left' | 'right';

interface Row {
  worldY: number;       // координата ряда в мире (0 = старт, растёт вперёд)
  kind: RowKind;
  fillColor: number;
  // ROAD/RAIL: вектор движения транспорта
  dir?: Direction;
  speed?: number;       // px/sec
  // GRASS/PAVEMENT: статические препятствия в столбцах (нельзя ступить)
  blocked?: Set<number>;
}

interface Vehicle {
  sprite: Phaser.GameObjects.Image;
  worldY: number;
  x: number;
  width: number;
  speed: number;
  dir: Direction;
}

export class JeffreySurferScene extends BaseMinigame {
  // Режим
  private infinite = false;
  private goalSteps = 25;
  private cameraCreepPerSec = 0.5;

  // Состояние
  private finished = false;
  private dead = false;
  private accepting = false;
  private playerWorldY = 0;
  private maxWorldY = 0;
  private playerCol = Math.floor(COLS / 2);
  private cameraWorldY = 0;       // нижняя видимая «зона» в world units
  private rows = new Map<number, Row>();
  private vehicles = new Map<number, Vehicle[]>();

  // Спрайт игрока
  private playerSprite!: Phaser.GameObjects.Container;
  private playerBody!: Phaser.GameObjects.Rectangle;
  private playerBox!: Phaser.GameObjects.Rectangle;
  private moving = false;

  // Контейнер мира — двигаем его, чтобы скроллить
  private world!: Phaser.GameObjects.Container;

  // Top HUD
  private stepsText!: Phaser.GameObjects.Text;
  private goalText!: Phaser.GameObjects.Text;
  private bigText!: Phaser.GameObjects.Text;

  // Контролы
  private keyboardCleanup: (() => void) | null = null;
  private touchStartX = 0;
  private touchStartY = 0;
  private touchActive = false;

  constructor() {
    super({ key: 'JeffreySurfer' });
  }

  create(): void {
    this.infinite = this.initData.infinite === true;
    this.goalSteps = STEP_GOALS_BY_LEVEL[this.initData.level] ?? 30;
    this.cameraCreepPerSec = CAMERA_CREEP_PER_SEC_BY_LEVEL[this.initData.level] ?? 0.6;
    if (this.infinite) {
      this.cameraCreepPerSec = 0.4;
    }

    paintPageBackdrop(this, 0x9cd66f);

    this.bakeTextures();

    this.world = this.add.container(0, 0);
    this.world.setDepth(DEPTH.gameplay);

    // Стартовые ряды — генерим вперёд на 30 рядов от старта игрока (worldY=0).
    // Дальше cullFarRows будет подгенерировать вперёд игрока по мере его движения.
    for (let y = -3; y <= 30; y++) {
      this.ensureRow(y);
    }

    this.spawnPlayer();
    this.buildHud();

    this.bindInput();
    this.bindKeyboard();
    attachHomeButton(this);

    this.cameras.main.fadeIn(220, 10, 10, 10);
    this.accepting = true;
  }

  // ============================================================
  // Текстуры (печём один раз)
  // ============================================================

  /** Поезд процедурный — отдельной PNG-ки не приехало; машины/декор идут через
   *  загруженные jeff-* текстуры из BootScene. */
  private bakeTextures(): void {
    if (this.textures.exists('cj-train')) return;
    const w = TILE * 4;
    const h = TILE * 0.8;
    const g = this.make.graphics({ x: 0, y: 0 }, false);
    g.fillStyle(0xc92e2e, 1);
    g.fillRect(0, 0, w, h);
    g.fillStyle(0xfff0a8, 1);
    g.fillRect(0, h * 0.45, w, h * 0.12);
    g.fillStyle(0x88c1ff, 1);
    for (let i = 0; i < 6; i++) {
      g.fillRect(20 + i * (w / 6), 10, w / 6 - 18, h * 0.3);
    }
    g.lineStyle(3, 0x111111, 1);
    g.strokeRect(0, 0, w, h);
    g.generateTexture('cj-train', w, h);
    g.destroy();
  }

  // ============================================================
  // Игрок
  // ============================================================

  private spawnPlayer(): void {
    this.playerCol = Math.floor(COLS / 2);
    this.playerWorldY = 0;
    this.maxWorldY = 0;
    this.cameraWorldY = -PLAYER_SCREEN_ROW;
    this.refreshWorldOffset();

    const c = this.add.container(0, 0);
    this.playerBody = this.add.rectangle(0, 0, TILE * 0.7, TILE * 0.7, 0xffd166);
    this.playerBody.setStrokeStyle(3, 0x111111);
    this.playerBox = this.add.rectangle(0, -TILE * 0.4, TILE * 0.55, TILE * 0.18, 0xd9534f);
    this.playerBox.setStrokeStyle(2, 0x111111);
    const eyeL = this.add.rectangle(-TILE * 0.13, -TILE * 0.05, 8, 8, 0x111111);
    const eyeR = this.add.rectangle(TILE * 0.13, -TILE * 0.05, 8, 8, 0x111111);
    c.add([this.playerBody, this.playerBox, eyeL, eyeR]);
    c.setDepth(DEPTH.gameplay + 5);
    this.playerSprite = c;

    const { x, y } = this.tileToScreen(this.playerCol, this.playerWorldY);
    this.playerSprite.setPosition(x, y);
  }

  // ============================================================
  // HUD
  // ============================================================

  private buildHud(): void {
    const { WIDTH } = GAME;
    const pixel = '"Press Start 2P", monospace';

    const hudBg = this.add.rectangle(WIDTH / 2, 56, WIDTH, 112, 0x000000, 0.55);
    hudBg.setDepth(DEPTH.ui);

    this.stepsText = this.add.text(28, 38, '', {
      fontFamily: pixel, fontSize: '22px', color: '#FAF7F0',
    });
    this.stepsText.setDepth(DEPTH.ui + 1);

    this.goalText = this.add.text(WIDTH - 28, 38, '', {
      fontFamily: pixel, fontSize: '18px', color: '#FFE600',
    });
    this.goalText.setOrigin(1, 0);
    this.goalText.setDepth(DEPTH.ui + 1);

    this.bigText = this.add.text(WIDTH / 2, GAME.HEIGHT * 0.4, '', {
      fontFamily: pixel, fontSize: '40px', color: '#FF2E2E', align: 'center',
    });
    this.bigText.setOrigin(0.5);
    this.bigText.setDepth(DEPTH.modal);

    this.refreshHud();
  }

  private refreshHud(): void {
    this.stepsText.setText(`шаги: ${this.maxWorldY}`);
    if (this.infinite) {
      this.goalText.setText(`режим: бесконечный`);
    } else {
      this.goalText.setText(`цель: ${this.maxWorldY} / ${this.goalSteps}`);
    }
  }

  // ============================================================
  // Управление
  // ============================================================

  private bindInput(): void {
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      this.touchStartX = p.x;
      this.touchStartY = p.y;
      this.touchActive = true;
    });
    this.input.on('pointerup', (p: Phaser.Input.Pointer) => {
      if (!this.touchActive) return;
      this.touchActive = false;
      const dx = p.x - this.touchStartX;
      const dy = p.y - this.touchStartY;
      const adx = Math.abs(dx);
      const ady = Math.abs(dy);
      if (adx < 24 && ady < 24) {
        this.tryMove(0, 1);
        return;
      }
      if (adx > ady) this.tryMove(dx > 0 ? 1 : -1, 0);
      else            this.tryMove(0, dy < 0 ? 1 : -1);
    });
  }

  private bindKeyboard(): void {
    const handler = (e: KeyboardEvent) => {
      if (this.finished) return;
      let dx = 0, dy = 0;
      switch (e.key) {
        case 'ArrowUp':    case 'w': case 'W': dy = 1; break;
        case 'ArrowDown':  case 's': case 'S': dy = -1; break;
        case 'ArrowLeft':  case 'a': case 'A': dx = -1; break;
        case 'ArrowRight': case 'd': case 'D': dx = 1; break;
        default: return;
      }
      e.preventDefault();
      this.tryMove(dx, dy);
    };
    window.addEventListener('keydown', handler);
    this.keyboardCleanup = () => window.removeEventListener('keydown', handler);
  }

  private tryMove(dx: number, dy: number): void {
    if (!this.accepting || this.dead || this.moving) return;
    const newCol = this.playerCol + dx;
    const newY = this.playerWorldY + dy;
    if (newCol < 0 || newCol >= COLS) return;
    if (newY < 0) return;

    const targetRow = this.ensureRow(newY);
    if (targetRow.blocked && targetRow.blocked.has(newCol)) return;

    this.moving = true;
    this.playerCol = newCol;
    this.playerWorldY = newY;
    if (newY > this.maxWorldY) this.maxWorldY = newY;
    this.refreshHud();

    SoundManager.playSfx('tap');
    Haptics.trigger('tap');

    // Камера ПЛАВНО следует за игроком — лерп идёт в update().
    // Чтобы tween игрока не «дёргался» (камера двигается параллельно), считаем
    // destination для позиции, до которой камера ДОЛЖНА доехать за то же время
    // что и tween игрока: max между текущей камерой и player - PLAYER_SCREEN_ROW.
    const { HEIGHT } = GAME;
    const cameraAtTweenEnd = Math.max(
      this.cameraWorldY,
      this.playerWorldY - PLAYER_SCREEN_ROW,
    );
    const tx = this.colToScreenX(this.playerCol);
    const ty = HEIGHT - 200 - (this.playerWorldY - cameraAtTweenEnd) * TILE;

    this.tweens.add({
      targets: this.playerSprite,
      x: tx, y: ty,
      duration: MOVE_DURATION_MS,
      ease: 'Sine.easeOut',
      onComplete: () => { this.moving = false; },
    });
    this.tweens.add({
      targets: this.playerBox, y: { from: -TILE * 0.55, to: -TILE * 0.4 },
      duration: MOVE_DURATION_MS, ease: 'Sine.easeOut',
    });

    if (!this.infinite && this.maxWorldY >= this.goalSteps) {
      this.win();
    }
  }

  // ============================================================
  // Генерация рядов
  // ============================================================

  private ensureRow(worldY: number): Row {
    const existing = this.rows.get(worldY);
    if (existing) return existing;

    const row: Row = this.makeRow(worldY);
    this.rows.set(worldY, row);
    this.drawRowVisuals(row);
    return row;
  }

  private makeRow(worldY: number): Row {
    if (worldY < 4) {
      return {
        worldY,
        kind: 'grass',
        fillColor: COLORS_GRASS[((worldY % COLORS_GRASS.length) + COLORS_GRASS.length) % COLORS_GRASS.length],
      };
    }

    const prev = this.rows.get(worldY - 1);
    const r = Math.random();
    let kind: RowKind;
    if (prev?.kind === 'rail') kind = Math.random() < 0.5 ? 'pavement' : 'grass';
    else if (prev?.kind === 'road') kind = r < 0.45 ? 'road' : (r < 0.7 ? 'grass' : 'pavement');
    else if (prev?.kind === 'pavement') kind = r < 0.6 ? 'road' : 'grass';
    else /* grass */ kind = r < 0.4 ? 'road' : (r < 0.6 ? 'pavement' : (r < 0.8 ? 'rail' : 'grass'));

    if (kind === 'grass') {
      const blocked = new Set<number>();
      const treeCount = Math.random() < 0.5 ? 0 : Phaser.Math.Between(1, 3);
      const start = Phaser.Math.Between(0, COLS - 1);
      for (let i = 0; i < treeCount; i++) {
        const c = (start + i * 2) % COLS;
        blocked.add(c);
      }
      return {
        worldY, kind,
        fillColor: COLORS_GRASS[((worldY % COLORS_GRASS.length) + COLORS_GRASS.length) % COLORS_GRASS.length],
        blocked,
      };
    }

    if (kind === 'pavement') {
      const blocked = new Set<number>();
      const obs = Math.random() < 0.4 ? 1 : (Math.random() < 0.7 ? 2 : 3);
      const positions = this.shuffleCols();
      for (let i = 0; i < obs; i++) blocked.add(positions[i]);
      return {
        worldY, kind, fillColor: COLOR_PAVEMENT,
        blocked,
      };
    }

    if (kind === 'rail') {
      return {
        worldY, kind,
        fillColor: COLORS_RAIL[((worldY % COLORS_RAIL.length) + COLORS_RAIL.length) % COLORS_RAIL.length],
        dir: Math.random() < 0.5 ? 'left' : 'right',
        speed: Phaser.Math.Between(this.trainSpeedRange()[0], this.trainSpeedRange()[1]),
      };
    }

    // road
    const dir: Direction = Math.random() < 0.5 ? 'left' : 'right';
    return {
      worldY, kind, fillColor: COLOR_ROAD,
      dir,
      speed: Phaser.Math.Between(this.carSpeedRange()[0], this.carSpeedRange()[1]),
    };
  }

  private shuffleCols(): number[] {
    const a: number[] = [];
    for (let i = 0; i < COLS; i++) a.push(i);
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  private carSpeedRange(): [number, number] {
    const lvl = this.infinite ? 3 : (this.initData.level || 1);
    return CAR_SPEED_BY_LEVEL[lvl] ?? CAR_SPEED_BY_LEVEL[1];
  }

  private trainSpeedRange(): [number, number] {
    const lvl = this.infinite ? 3 : (this.initData.level || 1);
    return TRAIN_SPEED_BY_LEVEL[lvl] ?? TRAIN_SPEED_BY_LEVEL[1];
  }

  // ============================================================
  // Визуал ряда
  // ============================================================

  private drawRowVisuals(row: Row): void {
    const { WIDTH } = GAME;
    const screenY = this.worldYToScreenY(row.worldY);
    const rect = this.add.rectangle(WIDTH / 2, screenY, WIDTH, TILE, row.fillColor);
    rect.setData('rowY', row.worldY);
    this.world.add(rect);

    if (row.kind === 'road') {
      const stripe = this.add.graphics();
      stripe.fillStyle(COLOR_ROAD_LINE, 0.85);
      for (let x = 8; x < WIDTH; x += TILE) {
        stripe.fillRect(x, screenY - 2, TILE * 0.45, 4);
      }
      stripe.setData('rowY', row.worldY);
      this.world.add(stripe);
    }
    if (row.kind === 'rail') {
      const g = this.add.graphics();
      g.fillStyle(0x4a3a25, 1);
      for (let x = 4; x < WIDTH; x += 30) {
        g.fillRect(x, screenY - TILE * 0.35, 22, TILE * 0.7);
      }
      g.fillStyle(0x666666, 1);
      g.fillRect(0, screenY - 14, WIDTH, 4);
      g.fillRect(0, screenY + 10, WIDTH, 4);
      g.setData('rowY', row.worldY);
      this.world.add(g);
    }
    if (row.kind === 'pavement') {
      const g = this.add.graphics();
      g.fillStyle(COLOR_PAVEMENT_DARK, 0.7);
      for (let x = 0; x < WIDTH; x += TILE) {
        g.fillRect(x + TILE - 4, screenY - TILE / 2, 4, TILE);
      }
      g.setData('rowY', row.worldY);
      this.world.add(g);
    }

    if (row.blocked) {
      row.blocked.forEach((col) => {
        const obs = this.makeObstacle(row, col);
        if (obs) {
          obs.setData('rowY', row.worldY);
          this.world.add(obs);
        }
      });
    }
  }

  private makeObstacle(row: Row, col: number): Phaser.GameObjects.Image | null {
    // Декорации лежат в world-контейнере, поэтому используем камеро-независимую Y
    // (worldYToScreenY), иначе будет двойное смещение от world.y.
    const x = this.colToScreenX(col);
    const y = this.worldYToScreenY(row.worldY);
    if (row.kind === 'grass') {
      const tree = this.add.image(x, y + 8, 'jeff-tree');
      tree.setOrigin(0.5, 1);
      // Дерево чуть выше тайла, корнями стоит на земле
      tree.setDisplaySize(TILE * 0.9, TILE * 1.1);
      return tree;
    }
    if (row.kind === 'pavement') {
      const tex = PAVEMENT_OBSTACLES[Phaser.Math.Between(0, PAVEMENT_OBSTACLES.length - 1)];
      const obj = this.add.image(x, y + 8, tex);
      obj.setOrigin(0.5, 1);
      // Высокие здания крупнее, фонари/мусорки/скамейки — поменьше
      const isTall = tex.startsWith('jeff-building');
      const isMedium = tex.startsWith('jeff-house');
      if (isTall) obj.setDisplaySize(TILE * 0.95, TILE * 1.55);
      else if (isMedium) obj.setDisplaySize(TILE * 0.9, TILE * 0.9);
      else if (tex === 'jeff-bench') obj.setDisplaySize(TILE * 0.95, TILE * 0.6);
      else if (tex === 'jeff-trash') obj.setDisplaySize(TILE * 0.6, TILE * 0.75);
      else /* lamp */ obj.setDisplaySize(TILE * 0.42, TILE * 1.0);
      return obj;
    }
    return null;
  }

  private colToScreenX(col: number): number {
    return (GAME.WIDTH - COLS * TILE) / 2 + col * TILE + TILE / 2;
  }

  // ============================================================
  // Спавн транспорта
  // ============================================================

  private spawnVehicleForRow(row: Row): void {
    if (!row.dir || !row.speed) return;
    const { WIDTH } = GAME;
    const screenY = this.worldYToScreenY(row.worldY);

    const isTrain = row.kind === 'rail';
    const tex = isTrain
      ? 'cj-train'
      : CAR_TEXTURES[Phaser.Math.Between(0, CAR_TEXTURES.length - 1)];
    const sprite = this.add.image(0, screenY, tex);
    sprite.setOrigin(0.5);

    // Размер: машина ~1.4 тайла шириной, поезд оставляем как есть (запечён 4×TILE)
    if (!isTrain) {
      sprite.setDisplaySize(TILE * 1.4, TILE * 0.95);
    }

    // Инвертированная логика: PNG-машины фактически смотрят ВПРАВО, поэтому
    // flipX нужен когда едем влево. Поезд тоже флипаем для соответствия.
    if (!isTrain && row.dir === 'left') sprite.setFlipX(true);
    if (isTrain && row.dir === 'right') sprite.setFlipX(true);

    const w = sprite.displayWidth;
    const startX = row.dir === 'right' ? -w : WIDTH + w;
    sprite.x = startX;
    // НЕ ставим setData('rowY') — иначе cullFarRows уничтожит машину через
    // world.getAll(), а потом ещё раз через this.vehicles map.
    this.world.add(sprite);

    const v: Vehicle = {
      sprite, worldY: row.worldY, x: startX,
      width: w, speed: row.speed, dir: row.dir,
    };
    const list = this.vehicles.get(row.worldY) ?? [];
    list.push(v);
    this.vehicles.set(row.worldY, list);
  }

  private spawnTrainWarning(row: Row): void {
    const { WIDTH } = GAME;
    const screenY = this.worldYToScreenY(row.worldY);
    const flash = this.add.rectangle(WIDTH / 2, screenY, WIDTH, TILE, 0xff2e2e, 0.4);
    // Без rowY: жизнь warning'а контролируется только своим твином, чтобы cullFarRows
    // не уничтожил его раньше времени.
    this.world.add(flash);
    this.tweens.add({
      targets: flash, alpha: { from: 0.4, to: 0 },
      duration: 500, repeat: 1, yoyo: true,
      onComplete: () => flash.destroy(),
    });
  }

  // ============================================================
  // Update
  // ============================================================

  override update(_t: number, dtMs: number): void {
    if (this.finished || this.gamePaused) return;

    const dt = Math.min(dtMs, 50) / 1000;

    // 1) Плавный «follow» — камера догоняет игрока к позиции `player - PLAYER_SCREEN_ROW`
    //    со скоростью ~10 тайлов/сек, что синхронно с tween игрока (~110мс на тайл).
    const cameraFollowTarget = this.playerWorldY - PLAYER_SCREEN_ROW;
    if (cameraFollowTarget > this.cameraWorldY) {
      const FOLLOW_SPEED = 10; // tiles per second
      const delta = cameraFollowTarget - this.cameraWorldY;
      this.cameraWorldY += Math.min(delta, FOLLOW_SPEED * dt);
    }

    // 2) Постоянный креп — даже когда игрок стоит, камера ползёт вверх.
    //    Это создаёт давление и в итоге убивает «кемперов».
    if (this.maxWorldY > 0 || this.time.now > 1500) {
      this.cameraWorldY += this.cameraCreepPerSec * dt;
    }
    if (this.infinite) {
      this.cameraCreepPerSec = Math.min(1.6, this.cameraCreepPerSec + dt * 0.012);
    }

    this.refreshWorldOffset();

    this.maybeSpawnVehicles();
    this.moveVehicles(dt);
    this.cullFarRows();
    this.checkPlayerCollision();

    if (this.playerWorldY < this.cameraWorldY - 0.3) {
      this.die('камера догнала!');
    }
  }

  private maybeSpawnVehicles(): void {
    this.rows.forEach((row) => {
      if (row.kind !== 'road' && row.kind !== 'rail') return;
      if (row.worldY < this.cameraWorldY - 1 || row.worldY > this.cameraWorldY + 18) return;
      const list = this.vehicles.get(row.worldY) ?? [];
      const limit = row.kind === 'road' ? 3 : 1;
      if (list.length >= limit) return;
      const chance = row.kind === 'road' ? 0.012 : 0.004;
      if (Math.random() < chance) {
        if (row.kind === 'rail') {
          this.spawnTrainWarning(row);
          this.time.delayedCall(900, () => this.spawnVehicleForRow(row));
        } else {
          this.spawnVehicleForRow(row);
        }
      }
    });
  }

  private moveVehicles(dt: number): void {
    const { WIDTH } = GAME;
    this.vehicles.forEach((list, rowY) => {
      for (let i = list.length - 1; i >= 0; i--) {
        const v = list[i];
        const move = v.speed * dt * (v.dir === 'right' ? 1 : -1);
        v.x += move;
        v.sprite.x = v.x;
        if ((v.dir === 'right' && v.x > WIDTH + v.width)
            || (v.dir === 'left' && v.x < -v.width)) {
          v.sprite.destroy();
          list.splice(i, 1);
        }
      }
      if (list.length === 0) this.vehicles.delete(rowY);
    });
  }

  private checkPlayerCollision(): void {
    const list = this.vehicles.get(this.playerWorldY);
    if (!list) return;
    const { x: px } = this.tileToScreen(this.playerCol, this.playerWorldY);
    const playerHalf = TILE * 0.32;
    for (const v of list) {
      const halfW = v.width * 0.5;
      if (Math.abs(v.x - px) < playerHalf + halfW * 0.85) {
        const row = this.rows.get(this.playerWorldY);
        const reason = row?.kind === 'rail' ? 'поезд!' : 'сбила машина!';
        this.die(reason);
        return;
      }
    }
  }

  private cullFarRows(): void {
    // Горизонт рендера привязан к ИГРОКУ, не к камере. Даже если игрок убежит
    // далеко вперёд камеры (после серии быстрых тапов), впереди него всегда
    // есть AHEAD_BUFFER подготовленных рядов.
    const AHEAD_BUFFER = 30;
    const minKeep = Math.floor(this.cameraWorldY) - 3;
    const maxKeep = Math.max(
      Math.ceil(this.cameraWorldY) + 18,           // как минимум 18 рядов от камеры (за пределы видимого экрана)
      Math.ceil(this.playerWorldY) + AHEAD_BUFFER, // и всегда 30 рядов впереди игрока
    );
    this.rows.forEach((_row, y) => {
      if (y < minKeep || y > maxKeep) {
        this.world.getAll().forEach((obj) => {
          const owner = obj as Phaser.GameObjects.GameObject & { getData?: (k: string) => unknown };
          if (owner.getData && owner.getData('rowY') === y) {
            obj.destroy();
          }
        });
        this.rows.delete(y);
        const vList = this.vehicles.get(y);
        if (vList) {
          vList.forEach((v) => v.sprite.destroy());
          this.vehicles.delete(y);
        }
      }
    });
    // Догоняем буфер по фронту — несколько рядов за кадр, без задержки.
    for (let y = Math.ceil(this.cameraWorldY); y < maxKeep; y++) {
      this.ensureRow(y);
    }
  }

  // ============================================================
  // Геометрия
  // ============================================================

  private tileToScreen(col: number, worldY: number): { x: number; y: number } {
    const { WIDTH, HEIGHT } = GAME;
    const x = (WIDTH - COLS * TILE) / 2 + col * TILE + TILE / 2;
    const y = HEIGHT - 200 - (worldY - this.cameraWorldY) * TILE;
    return { x, y };
  }

  private worldYToScreenY(worldY: number): number {
    const { HEIGHT } = GAME;
    // Используем cameraWorldY = 0 как «опорное» значение, которое будет
    // компенсироваться смещением world контейнера.
    return HEIGHT - 200 - worldY * TILE;
  }

  /** Двигаем мир-контейнер согласно cameraWorldY и подстраиваем игрока. */
  private refreshWorldOffset(): void {
    if (this.world) this.world.y = this.cameraWorldY * TILE;
    // playerSprite может ещё не существовать (вызов из spawnPlayer ДО создания контейнера)
    if (this.playerSprite && !this.moving) {
      const { x, y } = this.tileToScreen(this.playerCol, this.playerWorldY);
      this.playerSprite.setPosition(x, y);
    }
  }

  // ============================================================
  // Финал
  // ============================================================

  private die(reason: string): void {
    if (this.dead || this.finished) return;
    this.dead = true;
    this.accepting = false;
    SoundManager.playSfx('lose');
    Haptics.trigger('lose');
    this.cameras.main.shake(280, 0.018);
    this.cameras.main.flash(180, 220, 50, 50);

    this.bigText.setText(`${reason}\nшагов: ${this.maxWorldY}`);

    this.time.delayedCall(1100, () => this.finishMatch(false));
  }

  private win(): void {
    if (this.dead || this.finished) return;
    this.accepting = false;
    SoundManager.playSfx('win');
    Haptics.trigger('win');
    this.bigText.setColor('#4ADE80');
    this.bigText.setText(`ДОШЁЛ!\n${this.maxWorldY} шагов`);
    this.time.delayedCall(900, () => this.finishMatch(true));
  }

  private finishMatch(win: boolean): void {
    if (this.finished) return;
    this.finished = true;

    const score = win
      ? Math.min(100, 70 + Math.floor(this.maxWorldY / 4))
      : Math.min(60, Math.floor(this.maxWorldY * 1.4));

    this.complete({
      outcome: win ? 'win' : 'lose',
      score,
      metadata: {
        steps: this.maxWorldY,
        infinite: this.infinite,
        lifeAlreadyLost: false,
      },
    });
  }

  shutdown(): void {
    if (this.keyboardCleanup) {
      this.keyboardCleanup();
      this.keyboardCleanup = null;
    }
  }
}
