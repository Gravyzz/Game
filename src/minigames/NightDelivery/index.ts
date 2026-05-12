import Phaser from 'phaser';
import { BaseMinigame } from '@minigames/BaseMinigame';
import { COLORS } from '@config/colors';
import { TEXT_STYLES } from '@config/fonts';
import { GAME, DEPTH } from '@config/game';
import { RU } from '@i18n/ru';
import { PosterText } from '@ui/PosterText';
import { SoundManager } from '@core/SoundManager';
import { Haptics } from '@core/Haptics';
import { createGlobalLivesDisplay, type GlobalLivesDisplay } from '@utils/SceneHelpers';

/**
 * MG-04 Ночная доставка.
 *
 * Endless-runner. Скутер слева, препятствия едут справа налево.
 * Управление:
 *   - свайп вверх → прыжок (нужен над «низкими» препятствиями: лужа/яма/конус)
 *   - свайп вниз  → пригнуться (нужно под «высокими»: провод/трос/растяжка)
 *   - можно просто тапать верх/низ половины экрана.
 *
 * 3 жизни. Удар = -1 жизнь + i-frames 600мс.
 * Дожить до конца таймера → WIN. Жизни на 0 → LOSE.
 *
 * Сложность:
 *  - Easy: скорость 360 px/s, спавн 1500мс, шанс «верх» 30%.
 *  - Hard: скорость 620 px/s, спавн 850мс,  шанс «верх» 50%.
 */

const GROUND_Y_RATIO = 0.78;
const SCOOTER_X = 200;

const STATE_RUN = 'run';
const STATE_JUMP = 'jump';
const STATE_DUCK = 'duck';

interface Obstacle {
  text: Phaser.GameObjects.Text;
  bg: Phaser.GameObjects.Rectangle;
  type: 'low' | 'high';   // low = надо прыгать, high = надо пригибаться
  width: number;
  alive: boolean;
}

export class NightDeliveryScene extends BaseMinigame {
  private scooter!: Phaser.GameObjects.Text;
  private scooterShadow!: Phaser.GameObjects.Ellipse;

  private obstacles: Obstacle[] = [];
  private state: 'run' | 'jump' | 'duck' = STATE_RUN;
  private invincibleUntil = 0;

  private lives = 3;
  private livesHud!: GlobalLivesDisplay;
  private timerText!: Phaser.GameObjects.Text;
  private hintText!: Phaser.GameObjects.Text;

  private speed = 360;       // px/s, ползёт вверх со временем
  private spawnInterval = 1500;
  private highChance = 0.4;

  private timeLeftMs = 0;
  private spawnTimer: Phaser.Time.TimerEvent | null = null;
  private gameTimer: Phaser.Time.TimerEvent | null = null;
  private finished = false;

  // Свайп
  private dragStartX = 0;
  private dragStartY = 0;
  private dragging = false;

  private groundY = 0;
  private jumpTween: Phaser.Tweens.Tween | null = null;

  private parallaxFar: Phaser.GameObjects.Rectangle[] = [];
  private parallaxNear: Phaser.GameObjects.Rectangle[] = [];

  constructor() {
    super({ key: 'NightDelivery' });
  }

  create(): void {
    const { WIDTH, HEIGHT } = GAME;
    const diff = this.initData.difficulty;

    this.speed = Phaser.Math.Linear(360, 620, diff);
    this.spawnInterval = Math.round(Phaser.Math.Linear(1500, 850, diff));
    this.highChance = Phaser.Math.Linear(0.30, 0.50, diff);

    this.groundY = HEIGHT * GROUND_Y_RATIO;

    // Фон тёмно-серый с фиолетовыми бликами
    this.add.rectangle(WIDTH / 2, HEIGHT / 2, WIDTH, HEIGHT, COLORS.greyDark);
    // Небо-ночь
    const sky = this.add.rectangle(WIDTH / 2, HEIGHT * 0.3, WIDTH, HEIGHT * 0.6, COLORS.black);
    sky.setAlpha(0.7);
    sky.setDepth(DEPTH.background);

    // Звёзды
    for (let i = 0; i < 60; i++) {
      const star = this.add.circle(
        Math.random() * WIDTH,
        Math.random() * HEIGHT * 0.55,
        Math.random() * 1.4 + 0.4,
        COLORS.cream,
        0.5 + Math.random() * 0.4
      );
      star.setDepth(DEPTH.background);
      this.tweens.add({
        targets: star,
        alpha: 0.2,
        duration: 1000 + Math.random() * 1500,
        yoyo: true,
        repeat: -1,
      });
    }

    // Дальний параллакс — здания
    for (let i = 0; i < 12; i++) {
      const x = i * (WIDTH / 6) + Math.random() * 80;
      const h = 100 + Math.random() * 120;
      const b = this.add.rectangle(x, this.groundY - h / 2, 80 + Math.random() * 30, h, COLORS.purple, 0.35);
      b.setDepth(DEPTH.background + 1);
      this.parallaxFar.push(b);
    }

    // Ближний параллакс — фонари
    for (let i = 0; i < 8; i++) {
      const x = i * (WIDTH / 4) + 60;
      const lamp = this.add.rectangle(x, this.groundY - 60, 6, 90, COLORS.yellow, 0.6);
      lamp.setDepth(DEPTH.midground);
      this.parallaxNear.push(lamp);
    }

    // Земля
    const ground = this.add.rectangle(WIDTH / 2, this.groundY + (HEIGHT - this.groundY) / 2, WIDTH, HEIGHT - this.groundY, COLORS.black);
    ground.setDepth(DEPTH.midground + 1);
    // Линия дороги
    const roadLine = this.add.rectangle(WIDTH / 2, this.groundY + 4, WIDTH, 4, COLORS.yellow);
    roadLine.setAlpha(0.7);
    roadLine.setDepth(DEPTH.midground + 2);

    // Заголовок
    const title = new PosterText(this, WIDTH / 2, 80, 'НОЧНАЯ ДОСТАВКА', {
      bgColor: COLORS.purple,
      textColor: '#FAF7F0',
      fontSize: '28px',
      rotation: -0.025,
      paddingX: 20,
      paddingY: 10,
    });
    title.setDepth(DEPTH.ui);
    this.add.existing(title);

    // Жизни / таймер
    this.livesHud = createGlobalLivesDisplay(this, {
      x: 78,
      countX: 54,
      stackFirstX: 118,
      y: 78,
    });
    this.timerText = this.add.text(WIDTH - 30, 30, '', {
      ...TEXT_STYLES.subtitle,
      fontSize: '22px',
      color: '#FAF7F0',
    });
    this.timerText.setOrigin(1, 0);
    this.timerText.setDepth(DEPTH.ui);

    this.hintText = this.add.text(WIDTH / 2, 150, '👆 свайп ВВЕРХ — прыжок · ВНИЗ — пригнуться', {
      ...TEXT_STYLES.label,
      fontSize: '14px',
      color: '#FAF7F0',
    });
    this.hintText.setOrigin(0.5);
    this.hintText.setDepth(DEPTH.ui);

    // Скутер: тень + эмодзи
    this.scooterShadow = this.add.ellipse(SCOOTER_X, this.groundY + 8, 110, 16, COLORS.black, 0.4);
    this.scooterShadow.setDepth(DEPTH.gameplay);

    this.scooter = this.add.text(SCOOTER_X, this.groundY - 50, '🛵', { fontSize: '96px' });
    this.scooter.setOrigin(0.5, 1);
    this.scooter.setDepth(DEPTH.gameplay + 1);

    // Инпут — свайпы по экрану
    this.input.on('pointerdown', this.onPointerDown, this);
    this.input.on('pointerup',   this.onPointerUp,   this);

    // Таймеры
    this.timeLeftMs = this.initData.durationMs;
    this.spawnTimer = this.time.addEvent({
      delay: this.spawnInterval,
      loop: true,
      callback: this.spawnObstacle,
      callbackScope: this,
    });
    this.gameTimer = this.time.addEvent({
      delay: 200,
      loop: true,
      callback: this.onTick,
      callbackScope: this,
    });

    this.updateLives();
    this.cameras.main.fadeIn(250, 10, 10, 10);
  }

  override update(_t: number, dtMs: number): void {
    const dt = dtMs / 1000;
    const { WIDTH } = GAME;

    // Параллакс
    for (const b of this.parallaxFar) {
      b.x -= this.speed * 0.15 * dt;
      if (b.x + b.width / 2 < 0) b.x += WIDTH + b.width;
    }
    for (const lamp of this.parallaxNear) {
      lamp.x -= this.speed * 0.45 * dt;
      if (lamp.x + 20 < 0) lamp.x += WIDTH + 40;
    }

    // Препятствия
    for (const obs of this.obstacles) {
      if (!obs.alive) continue;
      obs.text.x -= this.speed * dt;
      obs.bg.x = obs.text.x;
      if (obs.text.x < -obs.width) {
        obs.alive = false;
        obs.text.destroy();
        obs.bg.destroy();
        continue;
      }
      this.checkCollision(obs);
    }
    this.obstacles = this.obstacles.filter(o => o.alive);
  }

  private spawnObstacle(): void {
    const { WIDTH } = GAME;
    const isHigh = Math.random() < this.highChance;
    const emoji = isHigh
      ? this.pick(['🚧', '⚡', '🪧'])
      : this.pick(['🕳️', '🚙', '🪨', '💧']);

    const w = 92;
    const h = 92;
    const x = WIDTH + 80;
    // low — на земле, high — над землёй (надо пригнуться)
    const y = isHigh ? this.groundY - 120 : this.groundY - 6;

    const bg = this.add.rectangle(x, y, w - 12, h - 12, isHigh ? COLORS.red : COLORS.yellow, 0.25);
    bg.setOrigin(0.5, 1);
    bg.setDepth(DEPTH.gameplay);

    const text = this.add.text(x, y, emoji, { fontSize: '76px' });
    text.setOrigin(0.5, 1);
    text.setDepth(DEPTH.gameplay + 1);

    this.obstacles.push({
      text,
      bg,
      type: isHigh ? 'high' : 'low',
      width: w,
      alive: true,
    });
  }

  // ===== Управление =====

  private onPointerDown(pointer: Phaser.Input.Pointer): void {
    this.dragStartX = pointer.x;
    this.dragStartY = pointer.y;
    this.dragging = true;
  }

  private onPointerUp(pointer: Phaser.Input.Pointer): void {
    if (!this.dragging) return;
    this.dragging = false;

    const dx = pointer.x - this.dragStartX;
    const dy = pointer.y - this.dragStartY;
    const absX = Math.abs(dx);
    const absY = Math.abs(dy);

    // Тап без движения → используем половину экрана
    if (absX < 25 && absY < 25) {
      if (pointer.y < GAME.HEIGHT / 2) this.jump();
      else this.duck();
      return;
    }

    // Свайп
    if (absY > absX) {
      if (dy < 0) this.jump();
      else this.duck();
    }
  }

  private jump(): void {
    if (this.state !== STATE_RUN) return;
    this.state = STATE_JUMP;
    SoundManager.playSfx('tap');
    Haptics.trigger('tap');

    // Высота прыжка подобрана так, чтобы:
    //  - перепрыгивать «низкие» препятствия (лужа/яма/конус)
    //  - врезаться в «высокие» (провода/растяжка) — для них нужно пригибаться
    const peakY = this.groundY - 170;
    this.jumpTween = this.tweens.add({
      targets: this.scooter,
      y: peakY,
      duration: 320,
      ease: 'Sine.easeOut',
      yoyo: true,
      onComplete: () => {
        this.scooter.y = this.groundY - 50;
        this.state = STATE_RUN;
      },
    });
    // Тень мелкая во время прыжка
    this.tweens.add({
      targets: this.scooterShadow,
      scaleX: 0.5,
      scaleY: 0.5,
      alpha: 0.2,
      duration: 320,
      yoyo: true,
    });
  }

  private duck(): void {
    if (this.state !== STATE_RUN) return;
    this.state = STATE_DUCK;
    SoundManager.playSfx('tap');
    Haptics.trigger('tap');

    this.scooter.setScale(1, 0.55);
    this.time.delayedCall(550, () => {
      this.scooter.setScale(1, 1);
      this.state = STATE_RUN;
    });
  }

  // ===== Коллизии =====

  private checkCollision(obs: Obstacle): void {
    if (this.time.now < this.invincibleUntil) return;

    const obsLeft  = obs.text.x - obs.width / 2;
    const obsRight = obs.text.x + obs.width / 2;
    const scooterLeft  = SCOOTER_X - 40;
    const scooterRight = SCOOTER_X + 40;

    if (obsRight < scooterLeft || obsLeft > scooterRight) return;

    // Пересечение по X есть. Проверяем, увернулся ли игрок:
    //  - low (на земле) → надо прыгать
    //  - high (наверху) → надо пригибаться
    let hit = false;
    if (obs.type === 'low' && this.state !== STATE_JUMP) hit = true;
    if (obs.type === 'high' && this.state !== STATE_DUCK) hit = true;

    if (hit) {
      this.takeDamage(obs);
    } else {
      // Удачный увоk — мгновенно убираем препятствие, чтобы не триггерить ещё раз
      obs.alive = false;
      obs.text.destroy();
      obs.bg.destroy();
    }
  }

  private takeDamage(obs: Obstacle): void {
    this.invincibleUntil = this.time.now + 700;
    this.lives -= 1;
    SoundManager.playSfx('miss');
    Haptics.trigger('miss');
    this.updateLives();

    // Мерцание скутера
    this.tweens.add({
      targets: this.scooter,
      alpha: 0.3,
      duration: 100,
      yoyo: true,
      repeat: 3,
      onComplete: () => this.scooter.setAlpha(1),
    });

    // Камера тряска
    this.cameras.main.shake(180, 0.012);

    // Уносим препятствие
    obs.alive = false;
    obs.text.destroy();
    obs.bg.destroy();

    if (this.lives <= 0) {
      this.finish(false);
    }
  }

  private updateLives(): void {
    this.livesHud.update();
  }

  private onTick(): void {
    this.timeLeftMs -= 200;
    const sec = Math.max(0, Math.ceil(this.timeLeftMs / 1000));
    this.timerText.setText(`⏱ ${sec}`);

    // Лёгкое нарастание скорости со временем (~+50px/s за весь раунд).
    // tick = 200мс, +1.2 за тик ≈ +6 px/s в секунду.
    this.speed += 1.2;

    if (this.timeLeftMs <= 0 && this.lives > 0) {
      this.finish(true);
    }
  }

  private finish(win: boolean): void {
    if (this.finished) return;
    this.finished = true;

    if (this.spawnTimer) this.spawnTimer.remove();
    if (this.gameTimer)  this.gameTimer.remove();

    if (win) {
      SoundManager.playSfx('win');
      Haptics.trigger('win');
    } else {
      SoundManager.playSfx('lose');
      Haptics.trigger('lose');
    }

    const { WIDTH, HEIGHT } = GAME;
    const overlay = this.add.rectangle(WIDTH / 2, HEIGHT / 2, WIDTH, HEIGHT, COLORS.black, 0.6);
    overlay.setDepth(DEPTH.modal);
    const msg = this.add.text(
      WIDTH / 2,
      HEIGHT / 2,
      win ? RU.minigame.win : RU.minigame.lose,
      { ...TEXT_STYLES.hero, fontSize: '56px', color: win ? '#4ADE80' : '#EF4444' }
    );
    msg.setOrigin(0.5);
    msg.setDepth(DEPTH.modal + 1);

    const score = win ? Math.round(60 + this.lives * 12) : 0;
    this.time.delayedCall(900, () => {
      this.complete({
        outcome: win ? 'win' : 'lose',
        score,
        metadata: { livesLeft: this.lives },
      });
    });
  }

  shutdown(): void {
    this.input.off('pointerdown', this.onPointerDown, this);
    this.input.off('pointerup',   this.onPointerUp,   this);
    if (this.spawnTimer) this.spawnTimer.remove();
    if (this.gameTimer)  this.gameTimer.remove();
    if (this.jumpTween)  this.jumpTween.remove();
  }

  private pick<T>(arr: T[]): T {
    return arr[Math.floor(Math.random() * arr.length)];
  }
}
