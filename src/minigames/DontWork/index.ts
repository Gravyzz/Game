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
 * MG-02 Донтворк: расколбас выходных.
 *
 * Геймплей (Fruit Ninja-стайл):
 *  - По экрану взлетают объекты по дугообразной траектории.
 *  - «Плохие» (📧 ✉️ ⏰ 📊 'ДЕДЛАЙН') — нужно резать свайпом.
 *  - «Хорошие» (🍕 🥤 🎸 🎵) — резать НЕЛЬЗЯ, иначе штраф.
 *  - Если плохой объект упал не разрезанным — штраф.
 *  - WIN если процент успеха >= порога к концу таймера.
 *
 * Сложность:
 *  - Easy (0.25): спавн каждые 1100мс, шанс «хорошего» 25%, порог 0.55.
 *  - Hard (1.0):  спавн каждые 600мс,  шанс «хорошего» 35%, порог 0.7.
 */

const GRAVITY = 1400;        // px/s²
const SPRITE_SIZE = 96;
const SLICE_TOLERANCE = 60;  // расстояние от линии свайпа до объекта для среза

interface FlyingObject {
  type: 'bad' | 'good';
  emoji: string;
  text: Phaser.GameObjects.Text;
  vx: number;
  vy: number;
  rotSpeed: number;
  alive: boolean;
  cut: boolean;
}

const BAD_EMOJI = ['📧', '✉️', '⏰', '📊', '📎', '📞'];
const GOOD_EMOJI = ['🍕', '🥤', '🎸', '🎵', '🍔', '🌮'];

export class DontWorkScene extends BaseMinigame {
  private objects: FlyingObject[] = [];

  private timeLeftMs = 0;
  private spawnTimer: Phaser.Time.TimerEvent | null = null;
  private gameTimer: Phaser.Time.TimerEvent | null = null;

  private goodSliced = 0;     // хорошие зарезанные (штрафы)
  private badSliced = 0;      // плохие зарезанные (заслуга)
  private badMissed = 0;      // плохие упали (штрафы)

  private scoreText!: Phaser.GameObjects.Text;
  private timerText!: Phaser.GameObjects.Text;

  // Tracker для свайпа — рисуем «след клинка»
  private trail: Phaser.GameObjects.Graphics | null = null;
  private lastPointerX = -1;
  private lastPointerY = -1;
  private isDragging = false;

  private goodChance = 0.25;
  private spawnInterval = 1100;
  private winThreshold = 0.55;
  private finished = false;

  constructor() {
    super({ key: 'DontWork' });
  }

  create(): void {
    const { WIDTH, HEIGHT } = GAME;
    const diff = this.initData.difficulty;

    // Параметры сложности
    this.spawnInterval = Math.round(Phaser.Math.Linear(1100, 600, diff));
    this.goodChance = Phaser.Math.Linear(0.25, 0.35, diff);
    this.winThreshold = Phaser.Math.Linear(0.55, 0.7, diff);

    // Фон фиолетовый
    this.add.rectangle(WIDTH / 2, HEIGHT / 2, WIDTH, HEIGHT, COLORS.purple);
    this.drawNoise();

    // Заголовок
    const title = new PosterText(this, WIDTH / 2, 90, 'РЕЖЬ ДЕДЛАЙНЫ', {
      bgColor: COLORS.yellow,
      textColor: '#0A0A0A',
      fontSize: '28px',
      rotation: -0.025,
      paddingX: 20,
      paddingY: 10,
    });
    title.setDepth(DEPTH.ui);
    this.add.existing(title);

    // Hint о хороших объектах
    const hint = this.add.text(WIDTH / 2, 150, '⚠️ не задень 🍕 / 🎸 / 🥤', {
      ...TEXT_STYLES.label,
      fontSize: '15px',
      color: '#FAF7F0',
    });
    hint.setOrigin(0.5);
    hint.setDepth(DEPTH.ui);

    // Счёт
    this.scoreText = this.add.text(30, 30, '', {
      ...TEXT_STYLES.subtitle,
      fontSize: '20px',
      color: '#FAF7F0',
    });
    this.scoreText.setDepth(DEPTH.ui);

    // Таймер
    this.timerText = this.add.text(WIDTH - 30, 30, '', {
      ...TEXT_STYLES.subtitle,
      fontSize: '22px',
      color: '#FAF7F0',
    });
    this.timerText.setOrigin(1, 0);
    this.timerText.setDepth(DEPTH.ui);

    // Графика для следа клинка
    this.trail = this.add.graphics();
    this.trail.setDepth(DEPTH.effects);

    // Свайп-инпут
    this.input.on('pointerdown', this.onPointerDown, this);
    this.input.on('pointermove', this.onPointerMove, this);
    this.input.on('pointerup',   this.onPointerUp,   this);

    // Таймеры
    this.timeLeftMs = this.initData.durationMs;
    this.spawnTimer = this.time.addEvent({
      delay: this.spawnInterval,
      loop: true,
      callback: this.spawnObject,
      callbackScope: this,
    });
    this.gameTimer = this.time.addEvent({
      delay: 200,
      loop: true,
      callback: this.onTick,
      callbackScope: this,
    });

    this.updateScore();
    this.cameras.main.fadeIn(250, 10, 10, 10);
  }

  override update(_t: number, dtMs: number): void {
    const dt = dtMs / 1000;
    const { HEIGHT, WIDTH } = GAME;

    for (const obj of this.objects) {
      if (!obj.alive) continue;

      obj.vy += GRAVITY * dt;
      obj.text.x += obj.vx * dt;
      obj.text.y += obj.vy * dt;
      obj.text.rotation += obj.rotSpeed * dt;

      // Вышел за пределы снизу или сильно за бок
      if (obj.text.y > HEIGHT + SPRITE_SIZE || obj.text.x < -SPRITE_SIZE || obj.text.x > WIDTH + SPRITE_SIZE) {
        obj.alive = false;
        // Если плохой и не разрезан — штраф
        if (obj.type === 'bad' && !obj.cut) {
          this.badMissed += 1;
          this.updateScore();
        }
        obj.text.destroy();
      }
    }

    // Чистим массив
    this.objects = this.objects.filter(o => o.alive);

    // След клинка затухает только когда не свайпают
    if (this.trail && !this.isDragging) {
      this.trail.alpha = Math.max(0, this.trail.alpha - 0.04);
      if (this.trail.alpha < 0.05) this.trail.clear();
    }
  }

  private spawnObject(): void {
    const { WIDTH, HEIGHT } = GAME;

    const isGood = Math.random() < this.goodChance;
    const emoji = isGood
      ? GOOD_EMOJI[Math.floor(Math.random() * GOOD_EMOJI.length)]
      : BAD_EMOJI[Math.floor(Math.random() * BAD_EMOJI.length)];

    const startX = Phaser.Math.Between(120, WIDTH - 120);
    const startY = HEIGHT + 50;
    // Целимся в верхнюю треть экрана
    const targetX = Phaser.Math.Between(80, WIDTH - 80);
    const targetY = Phaser.Math.Between(HEIGHT * 0.20, HEIGHT * 0.45);

    // Обратная баллистика: знаем стартовую и целевую точку, выбираем время полёта
    const flightTime = 1.4; // сек до апогея — ~1.4с
    const dx = targetX - startX;
    const dy = targetY - startY;

    const vx = dx / flightTime;
    const vy = (dy - 0.5 * GRAVITY * flightTime * flightTime) / flightTime;

    const text = this.add.text(startX, startY, emoji, { fontSize: '76px' });
    text.setOrigin(0.5);
    text.setDepth(DEPTH.gameplay);

    // «Плохие» — лёгкая красная подсветка вокруг эмодзи через tint shadow
    if (!isGood) {
      text.setStroke('#FF2E2E', 6);
    }

    const obj: FlyingObject = {
      type: isGood ? 'good' : 'bad',
      emoji,
      text,
      vx,
      vy,
      rotSpeed: Phaser.Math.FloatBetween(-2.5, 2.5),
      alive: true,
      cut: false,
    };
    this.objects.push(obj);
  }

  // ===== Свайп-логика =====

  private onPointerDown(pointer: Phaser.Input.Pointer): void {
    this.isDragging = true;
    this.lastPointerX = pointer.x;
    this.lastPointerY = pointer.y;
    if (this.trail) {
      this.trail.clear();
      this.trail.alpha = 1;
    }
  }

  private onPointerMove(pointer: Phaser.Input.Pointer): void {
    if (!this.isDragging) return;
    if (!this.trail) return;

    const x1 = this.lastPointerX;
    const y1 = this.lastPointerY;
    const x2 = pointer.x;
    const y2 = pointer.y;

    // Рисуем линию следа на полной непрозрачности (выцветать начнёт после отпускания)
    this.trail.alpha = 1;
    this.trail.lineStyle(8, COLORS.yellow, 0.85);
    this.trail.beginPath();
    this.trail.moveTo(x1, y1);
    this.trail.lineTo(x2, y2);
    this.trail.strokePath();

    // Проверяем пересечение с объектами
    this.checkSliceLine(x1, y1, x2, y2);

    this.lastPointerX = x2;
    this.lastPointerY = y2;
  }

  private onPointerUp(): void {
    this.isDragging = false;
  }

  /** Проверяем все живые объекты — если линия свайпа проходит рядом, режем. */
  private checkSliceLine(x1: number, y1: number, x2: number, y2: number): void {
    for (const obj of this.objects) {
      if (!obj.alive || obj.cut) continue;

      const dist = this.distancePointToSegment(obj.text.x, obj.text.y, x1, y1, x2, y2);
      if (dist <= SLICE_TOLERANCE) {
        this.sliceObject(obj);
      }
    }
  }

  /** Расстояние от точки P до отрезка AB */
  private distancePointToSegment(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
    const abx = bx - ax;
    const aby = by - ay;
    const apx = px - ax;
    const apy = py - ay;
    const ab2 = abx * abx + aby * aby;
    const t = ab2 > 0 ? Math.max(0, Math.min(1, (apx * abx + apy * aby) / ab2)) : 0;
    const cx = ax + abx * t;
    const cy = ay + aby * t;
    const dx = px - cx;
    const dy = py - cy;
    return Math.sqrt(dx * dx + dy * dy);
  }

  private sliceObject(obj: FlyingObject): void {
    obj.cut = true;
    obj.alive = false;

    if (obj.type === 'bad') {
      this.badSliced += 1;
      SoundManager.playSfx('good');
      Haptics.trigger('good');
      this.spawnSliceParticles(obj.text.x, obj.text.y, COLORS.win);
    } else {
      this.goodSliced += 1;
      SoundManager.playSfx('miss');
      Haptics.trigger('miss');
      this.spawnSliceParticles(obj.text.x, obj.text.y, COLORS.lose);
    }
    this.updateScore();

    // Анимация разреза: две половинки разлетаются
    const half1 = this.add.text(obj.text.x - 12, obj.text.y, obj.emoji, { fontSize: '76px' });
    const half2 = this.add.text(obj.text.x + 12, obj.text.y, obj.emoji, { fontSize: '76px' });
    half1.setOrigin(0.5);
    half2.setOrigin(0.5);
    half1.setDepth(DEPTH.gameplay);
    half2.setDepth(DEPTH.gameplay);
    half1.setAlpha(0.85);
    half2.setAlpha(0.85);

    this.tweens.add({
      targets: half1,
      x: half1.x - 80,
      y: half1.y + 100,
      angle: -180,
      alpha: 0,
      duration: 600,
      ease: 'Quad.easeIn',
      onComplete: () => half1.destroy(),
    });
    this.tweens.add({
      targets: half2,
      x: half2.x + 80,
      y: half2.y + 120,
      angle: 180,
      alpha: 0,
      duration: 600,
      ease: 'Quad.easeIn',
      onComplete: () => half2.destroy(),
    });

    obj.text.destroy();
  }

  private spawnSliceParticles(x: number, y: number, color: number): void {
    for (let i = 0; i < 8; i++) {
      const p = this.add.circle(x, y, 6, color);
      p.setDepth(DEPTH.effects);
      const angle = Math.random() * Math.PI * 2;
      const speed = 120 + Math.random() * 180;
      this.tweens.add({
        targets: p,
        x: x + Math.cos(angle) * speed,
        y: y + Math.sin(angle) * speed,
        alpha: 0,
        scale: 0.2,
        duration: 500,
        ease: 'Quad.easeOut',
        onComplete: () => p.destroy(),
      });
    }
  }

  private updateScore(): void {
    this.scoreText.setText(`✂️ ${this.badSliced}   💔 ${this.goodSliced + this.badMissed}`);
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
    if (this.finished) return;
    this.finished = true;

    if (this.spawnTimer) this.spawnTimer.remove();
    if (this.gameTimer)  this.gameTimer.remove();

    // Метрика: точность нарезки.
    //   1. Базовая доля порезанных «плохих» (хочется, чтобы все долетающие плохие
    //      были порезаны).
    //   2. Каждый случайный срез «хорошего» — серьёзный штраф.
    // Формула: success = badSliced / (badSliced + badMissed) − goodSliced * 0.10
    // — т.е. за каждый порезанный хороший снимаем 10% точности.
    const badTotal = this.badSliced + this.badMissed;
    const accuracy = badTotal > 0 ? this.badSliced / badTotal : 0;
    const success = Math.max(0, accuracy - this.goodSliced * 0.10);
    const win = success >= this.winThreshold && this.badSliced >= 3;

    if (win) {
      SoundManager.playSfx('win');
      Haptics.trigger('win');
    } else {
      SoundManager.playSfx('lose');
      Haptics.trigger('lose');
    }

    // Финальное сообщение
    const { WIDTH, HEIGHT } = GAME;
    const overlay = this.add.rectangle(WIDTH / 2, HEIGHT / 2, WIDTH, HEIGHT, COLORS.black, 0.55);
    overlay.setDepth(DEPTH.modal);
    const msg = this.add.text(
      WIDTH / 2,
      HEIGHT / 2,
      win ? RU.minigame.win : RU.minigame.lose,
      { ...TEXT_STYLES.hero, fontSize: '56px', color: win ? '#4ADE80' : '#EF4444' }
    );
    msg.setOrigin(0.5);
    msg.setDepth(DEPTH.modal + 1);

    const score = Math.round(success * 100);
    this.time.delayedCall(900, () => {
      this.complete({
        outcome: win ? 'win' : 'lose',
        score,
        metadata: {
          badSliced: this.badSliced,
          badMissed: this.badMissed,
          goodSliced: this.goodSliced,
        },
      });
    });
  }

  shutdown(): void {
    this.input.off('pointerdown', this.onPointerDown, this);
    this.input.off('pointermove', this.onPointerMove, this);
    this.input.off('pointerup',   this.onPointerUp,   this);
    if (this.spawnTimer) this.spawnTimer.remove();
    if (this.gameTimer)  this.gameTimer.remove();
  }

  private drawNoise(): void {
    const { WIDTH, HEIGHT } = GAME;
    const g = this.add.graphics();
    g.fillStyle(0x000000, 0.06);
    for (let i = 0; i < 600; i++) {
      g.fillCircle(Math.random() * WIDTH, Math.random() * HEIGHT, Math.random() * 1.5);
    }
    g.setDepth(DEPTH.background);
  }
}
