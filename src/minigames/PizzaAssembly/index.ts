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
 * NEW-02 Сборка пиццы.
 *
 * По экрану слева направо ползёт «конвейер» ингредиентов.
 * Сверху — рецепт (3-5 нужных ингредиентов).
 * Игрок перетаскивает ингредиент с конвейера на пиццу-основу внизу.
 *  - Нужный по рецепту → +1 успех, отмечаем слот.
 *  - Лишний → −1 жизнь.
 * Цель: заполнить рецепт за отведённое время.
 *
 * Сложность:
 *  - Easy: 3 слота, скорость 60 px/s, мало мусора.
 *  - Hard: 5 слотов, скорость 130 px/s, много мусора + ананасы.
 */

const ALL_INGREDIENTS = [
  { key: 'tomato',     emoji: '🍅', label: 'помидор'   },
  { key: 'cheese',     emoji: '🧀', label: 'сыр'       },
  { key: 'pepperoni',  emoji: '🍖', label: 'пепперони' },
  { key: 'mushroom',   emoji: '🍄', label: 'грибы'     },
  { key: 'olive',      emoji: '🫒', label: 'оливки'    },
  { key: 'pepper',     emoji: '🌶️', label: 'перец'     },
  { key: 'onion',      emoji: '🧅', label: 'лук'       },
  { key: 'corn',       emoji: '🌽', label: 'кукуруза'  },
] as const;

const FORBIDDEN_KEY = 'pineapple';
const FORBIDDEN = { key: FORBIDDEN_KEY, emoji: '🍍', label: 'ананас' } as const;

interface ConveyorItem {
  key: string;
  emoji: string;
  container: Phaser.GameObjects.Container;
  bg: Phaser.GameObjects.Rectangle;
  text: Phaser.GameObjects.Text;
  vx: number;
  alive: boolean;
  beingDragged: boolean;
}

interface RecipeSlot {
  key: string;
  emoji: string;
  filled: boolean;
  display: Phaser.GameObjects.Container;
  bg: Phaser.GameObjects.Rectangle;
  iconText: Phaser.GameObjects.Text;
}

export class PizzaAssemblyScene extends BaseMinigame {
  private items: ConveyorItem[] = [];
  private recipe: RecipeSlot[] = [];

  private speed = 80;
  private spawnInterval = 1100;
  private decoyChance = 0.55;

  private lives = 3;
  private livesText!: Phaser.GameObjects.Text;
  private timerText!: Phaser.GameObjects.Text;

  private timeLeftMs = 0;
  private spawnTimer: Phaser.Time.TimerEvent | null = null;
  private gameTimer: Phaser.Time.TimerEvent | null = null;
  private finished = false;

  private pizzaBaseX = 0;
  private pizzaBaseY = 0;
  private pizzaCircle!: Phaser.GameObjects.Arc;

  private draggingItem: ConveyorItem | null = null;
  private dragOffsetX = 0;
  private dragOffsetY = 0;

  private conveyorY = 0;
  private conveyorBeltGfx!: Phaser.GameObjects.Graphics;

  constructor() {
    super({ key: 'PizzaAssembly' });
  }

  create(): void {
    const { WIDTH, HEIGHT } = GAME;
    const diff = this.initData.difficulty;

    this.speed = Phaser.Math.Linear(60, 130, diff);
    this.spawnInterval = Math.round(Phaser.Math.Linear(1100, 700, diff));
    this.decoyChance = Phaser.Math.Linear(0.3, 0.6, diff);
    const slotsCount = Math.round(Phaser.Math.Linear(3, 5, diff));

    // Фон
    this.add.rectangle(WIDTH / 2, HEIGHT / 2, WIDTH, HEIGHT, COLORS.cream);
    this.drawNoise();

    // Заголовок
    const title = new PosterText(this, WIDTH / 2, 60, 'СБОРКА ПИЦЦЫ', {
      bgColor: COLORS.red,
      textColor: '#FAF7F0',
      fontSize: '28px',
      rotation: -0.025,
      paddingX: 20,
      paddingY: 10,
    });
    title.setDepth(DEPTH.ui);
    this.add.existing(title);

    // ===== Рецепт сверху =====
    const recipeLabel = this.add.text(WIDTH / 2, 110, 'РЕЦЕПТ:', {
      ...TEXT_STYLES.subtitle, fontSize: '16px', color: '#0A0A0A',
    });
    recipeLabel.setOrigin(0.5);
    recipeLabel.setDepth(DEPTH.ui);

    const ingredients = this.shuffle([...ALL_INGREDIENTS]);
    const chosen = ingredients.slice(0, slotsCount);
    const slotW = 80;
    const totalW = slotW * slotsCount + (slotsCount - 1) * 10;
    const startX = WIDTH / 2 - totalW / 2 + slotW / 2;

    for (let i = 0; i < slotsCount; i++) {
      const ing = chosen[i];
      const x = startX + i * (slotW + 10);
      const y = 165;

      const container = this.add.container(x, y);
      const bg = this.add.rectangle(0, 0, slotW, slotW, COLORS.greyLight, 0.5);
      bg.setStrokeStyle(3, COLORS.black);
      const iconText = this.add.text(0, 0, ing.emoji, { fontSize: '52px' });
      iconText.setOrigin(0.5);
      iconText.setAlpha(0.4);
      container.add([bg, iconText]);
      container.setDepth(DEPTH.ui);

      this.recipe.push({
        key: ing.key,
        emoji: ing.emoji,
        filled: false,
        display: container,
        bg,
        iconText,
      });
    }

    // ===== Конвейер =====
    this.conveyorY = HEIGHT * 0.42;
    const beltBg = this.add.rectangle(WIDTH / 2, this.conveyorY, WIDTH - 40, 130, COLORS.greyDark);
    beltBg.setStrokeStyle(4, COLORS.black);
    beltBg.setDepth(DEPTH.midground);

    this.conveyorBeltGfx = this.add.graphics();
    this.conveyorBeltGfx.setDepth(DEPTH.midground + 1);

    // ===== Пицца-основа =====
    this.pizzaBaseX = WIDTH / 2;
    this.pizzaBaseY = HEIGHT * 0.74;
    const baseCircle = this.add.circle(this.pizzaBaseX, this.pizzaBaseY, 175, 0xf0c994);
    baseCircle.setStrokeStyle(8, 0x8b5a2b);
    baseCircle.setDepth(DEPTH.gameplay);
    // Соус
    this.pizzaCircle = this.add.circle(this.pizzaBaseX, this.pizzaBaseY, 140, COLORS.red, 0.85);
    this.pizzaCircle.setDepth(DEPTH.gameplay + 1);

    const baseHint = this.add.text(this.pizzaBaseX, this.pizzaBaseY + 220, '👆 тяни ингредиент сюда', {
      ...TEXT_STYLES.label, fontSize: '14px', color: '#0A0A0A',
    });
    baseHint.setOrigin(0.5);
    baseHint.setDepth(DEPTH.ui);

    // HUD
    this.livesText = this.add.text(30, 30, '', {
      ...TEXT_STYLES.subtitle, fontSize: '22px', color: '#0A0A0A',
    });
    this.livesText.setDepth(DEPTH.ui);
    this.timerText = this.add.text(WIDTH - 30, 30, '', {
      ...TEXT_STYLES.subtitle, fontSize: '22px', color: '#0A0A0A',
    });
    this.timerText.setOrigin(1, 0);
    this.timerText.setDepth(DEPTH.ui);

    // Глобальный pointer для драга
    this.input.on('pointermove', this.onPointerMove, this);
    this.input.on('pointerup',   this.onPointerUp,   this);

    this.timeLeftMs = this.initData.durationMs;
    this.spawnTimer = this.time.addEvent({
      delay: this.spawnInterval,
      loop: true,
      callback: this.spawnItem,
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

    // Анимация ленты конвейера — движущиеся диагональные полосы
    this.drawBelt(dt);

    for (const item of this.items) {
      if (!item.alive || item.beingDragged) continue;
      item.container.x += item.vx * dt;
      if (item.container.x > GAME.WIDTH + 60) {
        item.alive = false;
        item.container.destroy();
      }
    }
    this.items = this.items.filter(i => i.alive);
  }

  private beltOffset = 0;
  private drawBelt(dt: number): void {
    this.beltOffset += this.speed * dt;
    if (this.beltOffset > 40) this.beltOffset -= 40;
    this.conveyorBeltGfx.clear();
    this.conveyorBeltGfx.lineStyle(3, COLORS.yellow, 0.6);
    const beltLeft = 40;
    const beltRight = GAME.WIDTH - 40;
    for (let x = beltLeft - 40 + this.beltOffset; x < beltRight; x += 40) {
      this.conveyorBeltGfx.lineBetween(x, this.conveyorY + 50, x + 24, this.conveyorY + 70);
    }
  }

  private spawnItem(): void {
    // С decoyChance — мусорный (не нужный по рецепту), иначе — случайный из недостающих
    let key: string;
    let emoji: string;

    const missing = this.recipe.filter(s => !s.filled);
    const isDecoy = Math.random() < this.decoyChance || missing.length === 0;
    const isPineapple = isDecoy && Math.random() < 0.18;

    if (isPineapple) {
      key = FORBIDDEN.key;
      emoji = FORBIDDEN.emoji;
    } else if (isDecoy) {
      // Приманка: всё из ALL_INGREDIENTS, кроме того, что вообще присутствует в рецепте
      // (включая уже filled — иначе игрок будет тянуть и попадать в штраф «дубль»,
      //  что запутывает после нескольких успешных).
      const recipeKeys = new Set(this.recipe.map(s => s.key));
      const decoys = ALL_INGREDIENTS.filter(i => !recipeKeys.has(i.key));
      const pick = decoys.length > 0
        ? decoys[Math.floor(Math.random() * decoys.length)]
        : ALL_INGREDIENTS[Math.floor(Math.random() * ALL_INGREDIENTS.length)];
      key = pick.key; emoji = pick.emoji;
    } else {
      const pick = missing[Math.floor(Math.random() * missing.length)];
      key = pick.key; emoji = pick.emoji;
    }

    const startX = -60;
    const y = this.conveyorY;

    const container = this.add.container(startX, y);
    const bg = this.add.rectangle(0, 0, 86, 86, COLORS.cream, 1);
    bg.setStrokeStyle(3, COLORS.black);
    const text = this.add.text(0, 0, emoji, { fontSize: '60px' });
    text.setOrigin(0.5);
    container.add([bg, text]);
    container.setSize(86, 86);
    container.setInteractive({ useHandCursor: true, draggable: false });
    container.setDepth(DEPTH.gameplay);

    const item: ConveyorItem = {
      key, emoji, container, bg, text,
      vx: this.speed,
      alive: true,
      beingDragged: false,
    };

    container.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      this.startDrag(item, pointer);
    });

    this.items.push(item);
  }

  // ===== Drag & Drop =====

  private startDrag(item: ConveyorItem, pointer: Phaser.Input.Pointer): void {
    if (!item.alive || this.draggingItem) return;
    this.draggingItem = item;
    item.beingDragged = true;
    item.container.setDepth(DEPTH.modal);
    item.bg.setStrokeStyle(4, COLORS.yellow);
    this.dragOffsetX = item.container.x - pointer.x;
    this.dragOffsetY = item.container.y - pointer.y;
    SoundManager.playSfx('tap');
  }

  private onPointerMove(pointer: Phaser.Input.Pointer): void {
    if (!this.draggingItem) return;
    this.draggingItem.container.x = pointer.x + this.dragOffsetX;
    this.draggingItem.container.y = pointer.y + this.dragOffsetY;
  }

  private onPointerUp(): void {
    if (!this.draggingItem) return;
    const item = this.draggingItem;
    this.draggingItem = null;

    // Проверяем, попал ли в пиццу
    const dx = item.container.x - this.pizzaBaseX;
    const dy = item.container.y - this.pizzaBaseY;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist <= 175) {
      this.dropOnPizza(item);
    } else {
      // Не попал — возвращаем на конвейер
      this.returnToConveyor(item);
    }
  }

  private dropOnPizza(item: ConveyorItem): void {
    item.beingDragged = false;
    item.alive = false;

    // Запрещённый ингредиент — штраф
    if (item.key === FORBIDDEN_KEY) {
      this.takeDamage('🍍 НЕТ АНАНАСАМ!');
      item.container.destroy();
      return;
    }

    const slot = this.recipe.find(s => !s.filled && s.key === item.key);
    if (slot) {
      // Правильный ингредиент → отмечаем слот, оставляем на пицце
      slot.filled = true;
      slot.iconText.setAlpha(1);
      slot.bg.setFillStyle(COLORS.win, 0.4);

      SoundManager.playSfx('perfect');
      Haptics.trigger('perfect');

      // Анимация: ингредиент остаётся на пицце с разбросом
      const offX = (Math.random() - 0.5) * 180;
      const offY = (Math.random() - 0.5) * 180;
      this.tweens.add({
        targets: item.container,
        x: this.pizzaBaseX + offX,
        y: this.pizzaBaseY + offY,
        scale: 0.7,
        duration: 200,
        ease: 'Back.easeOut',
      });
      // Делаем интерактив отключённым
      item.container.disableInteractive();
      item.container.setDepth(DEPTH.gameplay + 5);

      this.checkWin();
    } else {
      // Лишний (или дубль уже заполненного) → штраф
      this.takeDamage('ЭТОГО НЕТ В РЕЦЕПТЕ');
      item.container.destroy();
    }
  }

  private returnToConveyor(item: ConveyorItem): void {
    item.beingDragged = false;
    item.bg.setStrokeStyle(3, COLORS.black);
    item.container.setDepth(DEPTH.gameplay);
    this.tweens.add({
      targets: item.container,
      y: this.conveyorY,
      duration: 200,
      ease: 'Sine.easeOut',
    });
  }

  private takeDamage(reason: string): void {
    this.lives -= 1;
    SoundManager.playSfx('miss');
    Haptics.trigger('miss');
    this.updateLives();

    const fx = this.add.text(GAME.WIDTH / 2, this.pizzaBaseY - 200, reason, {
      ...TEXT_STYLES.subtitle, fontSize: '24px', color: '#EF4444',
    });
    fx.setOrigin(0.5);
    fx.setDepth(DEPTH.modal);
    this.tweens.add({
      targets: fx, y: fx.y - 80, alpha: 0, duration: 800,
      onComplete: () => fx.destroy(),
    });
    this.cameras.main.shake(150, 0.012);

    if (this.lives <= 0) this.finish(false);
  }

  private updateLives(): void {
    this.livesText.setText('❤️'.repeat(Math.max(0, this.lives)) + '🖤'.repeat(Math.max(0, 3 - this.lives)));
  }

  private checkWin(): void {
    if (this.recipe.every(s => s.filled)) {
      this.finish(true);
    }
  }

  private onTick(): void {
    this.timeLeftMs -= 200;
    const sec = Math.max(0, Math.ceil(this.timeLeftMs / 1000));
    this.timerText.setText(`⏱ ${sec}`);
    if (this.timeLeftMs <= 0) {
      this.finish(this.recipe.every(s => s.filled));
    }
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

    const filled = this.recipe.filter(s => s.filled).length;
    const score = win ? Math.round(60 + this.lives * 12) : Math.round((filled / this.recipe.length) * 40);
    this.time.delayedCall(900, () => {
      this.complete({
        outcome: win ? 'win' : 'lose',
        score,
        metadata: { filled, total: this.recipe.length, lives: this.lives },
      });
    });
  }

  shutdown(): void {
    this.input.off('pointermove', this.onPointerMove, this);
    this.input.off('pointerup',   this.onPointerUp,   this);
    if (this.spawnTimer) this.spawnTimer.remove();
    if (this.gameTimer)  this.gameTimer.remove();
  }

  private shuffle<T>(arr: T[]): T[] {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  private drawNoise(): void {
    const { WIDTH, HEIGHT } = GAME;
    const g = this.add.graphics();
    g.fillStyle(0x000000, 0.04);
    for (let i = 0; i < 500; i++) {
      g.fillCircle(Math.random() * WIDTH, Math.random() * HEIGHT, Math.random() * 1.5);
    }
    g.setDepth(DEPTH.background);
  }
}
