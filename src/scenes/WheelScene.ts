import Phaser from 'phaser';
import { COLORS } from '@config/colors';
import { GAME, DEPTH } from '@config/game';
import { RU } from '@i18n/ru';
import { SessionState } from '@core/SessionState';
import { GameState } from '@core/GameState';
import { TicketProvider } from '@core/TicketProvider';
import { SoundManager, type SfxName } from '@core/SoundManager';
import { Haptics } from '@core/Haptics';
import { WHEEL_ASSETS, loadImageAssets } from '@core/AssetManifest';
import { attachSoundButton, paintPageBackdrop } from '@utils/SceneHelpers';
import {
  getWheelForLevel,
  pickPrizeIndex,
  pickJackpotIndex,
  toWonPrize,
  type WheelPrize,
} from '@config/prizes';
import type { SessionLevel } from '@core/SessionState';

/**
 * Колесо Фортуны — финальный экран сессии.
 *
 * Состоит из:
 *  - радиального колеса с 8 секторами (по числу призов в PRIZE_POOL)
 *  - стрелки-указателя сверху (ticker)
 *  - кнопки «КРУТИ!»
 *
 * Алгоритм:
 *  1. До нажатия — колесо неподвижно, видны все 8 призов
 *  2. По «КРУТИ!» вызываем pickPrizeIndex(level) → получаем целевой сектор
 *  3. Считаем итоговый угол: 5 полных оборотов + угол до центра нужного сектора
 *  4. Tween с easeOut ~3.5 сек
 *  5. По мере вращения — отслеживаем пересечение секторных границ и тикаем
 *  6. На остановке: подсветка победного сектора + win-звук + переход в Result
 *
 * Угловая система:
 *  - угол 0° — на 12 часов (там стрелка-указатель)
 *  - возрастание угла идёт по часовой стрелке (визуально мы вращаем КОЛЕСО,
 *    а не указатель — но поскольку это эквивалентно, считаем «куда указатель
 *    укажет в системе колеса»)
 */

const WHEEL_RADIUS = 292;
const WHEEL_CENTER_Y = 670;
const SPIN_BUTTON_Y = 1136;
const SPIN_DURATION_MS = 3500;
const SPIN_REVOLUTIONS = 5;
const PIXEL_FONT = '"Press Start 2P", monospace';

export class WheelScene extends Phaser.Scene {
  private isJackpot = false;
  private wheelContainer!: Phaser.GameObjects.Container;
  private spinning = false;
  private lastTickedSector = -1;
  private spinBtn!: Phaser.GameObjects.Container;
  private spinHit!: Phaser.GameObjects.Rectangle;
  private spinButtonImage!: Phaser.GameObjects.Image;
  private spinButtonText!: Phaser.GameObjects.Text;
  /** Колесо для ТЕКУЩЕГО уровня сессии (массив 8 призов в порядке секторов). */
  private wheel: WheelPrize[] = [];
  private sectorCount = 0;
  private sectorRad = 0;

  constructor() {
    super({ key: 'WheelScene' });
  }

  preload(): void {
    loadImageAssets(this, WHEEL_ASSETS);
  }

  create(data: { isJackpot?: boolean } = {}): void {
    const { WIDTH, HEIGHT } = GAME;
    this.isJackpot = data.isJackpot ?? false;
    SoundManager.playMusic('relaxed');

    // Сброс state-полей: Phaser переиспользует scene-instance между запусками,
    // и class-field инициализация (`spinning = false`) срабатывает только при
    // первом конструировании. Без явного сброса второй заход на колесо после
    // прошлой крутки оставлял spinning=true → кнопка не нажималась.
    this.spinning = false;
    this.lastTickedSector = -1;

    // Колесо собираем по уровню сессии. Каждый уровень — свой пул призов
    // и свои веса (см. WHEEL_BY_LEVEL в @config/prizes).
    const level = SessionState.getCurrentLevel() as SessionLevel;
    this.wheel = getWheelForLevel(level);
    this.sectorCount = this.wheel.length;
    this.sectorRad = (Math.PI * 2) / this.sectorCount;

    this.preparePixelAssets();
    paintPageBackdrop(this, 0x0a0a0a);

    // ===== Фон по макету =====
    const bg = this.add.image(WIDTH / 2, HEIGHT / 2, 'fortune-bg');
    bg.setOrigin(0.5);
    bg.setScale(Math.max(WIDTH / bg.width, HEIGHT / bg.height));
    bg.setDepth(DEPTH.background);

    // ===== Колесо =====
    const wheelCenter = { x: WIDTH / 2, y: WHEEL_CENTER_Y };
    this.wheelContainer = this.add.container(wheelCenter.x, wheelCenter.y);
    this.wheelContainer.setDepth(DEPTH.gameplay);

    const wheelImage = this.add.image(0, 0, 'fortune-wheel');
    wheelImage.setOrigin(0.5);
    wheelImage.setDisplaySize(WHEEL_RADIUS * 2, WHEEL_RADIUS * 2);
    this.wheelContainer.add(wheelImage);
    this.drawWheelLabels(this.wheelContainer);

    // ===== Тикер (указатель сверху) =====
    this.drawTicker(wheelCenter.x, wheelCenter.y - WHEEL_RADIUS + 10);

    // ===== Кнопка «КРУТИ!» =====
    this.spinBtn = this.add.container(WIDTH / 2, SPIN_BUTTON_Y);
    this.spinBtn.setDepth(DEPTH.ui);
    this.spinButtonImage = this.add.image(0, 0, 'spin-button');
    this.spinButtonImage.setOrigin(0.5);
    this.spinButtonImage.setDisplaySize(500, 160);
    this.spinButtonText = this.add.text(0, 2, RU.wheel.spinCta.toUpperCase(), {
      fontFamily: PIXEL_FONT,
      fontSize: '42px',
      color: '#0A0A0A',
      align: 'center',
    });
    this.spinButtonText.setOrigin(0.5);
    this.spinHit = this.add.rectangle(0, 0, 500, 160, 0xffffff, 0);
    this.spinHit.setInteractive({ useHandCursor: true });
    this.spinBtn.add([this.spinButtonImage, this.spinButtonText, this.spinHit]);
    this.spinHit.on('pointerdown', (
      _pointer: Phaser.Input.Pointer,
      _localX: number,
      _localY: number,
      event: Phaser.Types.Input.EventData,
    ) => {
      event.stopPropagation();
      this.startSpin();
    });

    // Лёгкая пульсация
    this.tweens.add({
      targets: this.spinBtn,
      scale: 1.04,
      duration: 700,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });

    attachSoundButton(this);

    this.cameras.main.fadeIn(300, 122, 92, 255);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      SoundManager.stopSfx('wheelSpin', 120);
      SoundManager.stopSfx('wheelTick', 40);
    });
  }

  private drawWheelLabels(container: Phaser.GameObjects.Container): void {
    for (let i = 0; i < this.sectorCount; i++) {
      const { def } = this.wheel[i];
      const sectorCenterAngle = i * this.sectorRad - Math.PI / 2;
      const labelDist = WHEEL_RADIUS * 0.56;
      const labelX = Math.cos(sectorCenterAngle) * labelDist;
      const labelY = Math.sin(sectorCenterAngle) * labelDist;

      const labelContainer = this.add.container(labelX, labelY);
      labelContainer.setRotation(sectorCenterAngle + Math.PI / 2);

      const iconText = this.add.text(0, -28, def.icon, { fontSize: '30px' });
      iconText.setOrigin(0.5);

      // «ПРИЗ N» вместо длинных конкретных названий — гарантированно не
      // вылазит за грань сектора даже на 14-м призе.
      const labelText = this.add.text(0, 22, def.displayLabel, {
        fontFamily: PIXEL_FONT,
        fontSize: '16px',
        color: def.textColor,
        align: 'center',
        stroke: def.textColor === '#0A0A0A' ? undefined : '#0A0A0A',
        strokeThickness: def.textColor === '#0A0A0A' ? 0 : 4,
      });
      labelText.setOrigin(0.5);

      labelContainer.add([iconText, labelText]);
      container.add(labelContainer);
    }
  }

  /**
   * Указатель-треугольник сверху колеса — рисуется построчно прямоугольниками
   * в чанковом 8-битном стиле, чтобы соответствовать пиксельной эстетике игры.
   * Слой 1 — чёрный «контур» (большой), слой 2 — жёлтое тело (меньшее со
   * сдвигом вверх, оставляя 4px чёрный кант снизу/слева/справа).
   */
  private drawTicker(x: number, y: number): void {
    const tickerContainer = this.add.container(x, y);
    tickerContainer.setDepth(DEPTH.effects);

    const STEP = 6;
    const OUTLINE_W = 76;
    const OUTLINE_H = 72;
    const BODY_W = 60;
    const BODY_H = 56;

    const g = this.add.graphics();
    // Чёрный контур: вершина внизу (y=44), основание сверху.
    this.drawPixelTriDown(g, 0, 44 - OUTLINE_H, OUTLINE_W, OUTLINE_H, STEP, COLORS.black);
    // Жёлтое тело, чуть меньше и сдвинуто на 4px вверх → 4px чёрного канта.
    this.drawPixelTriDown(g, 0, 44 - OUTLINE_H - 4 + (OUTLINE_H - BODY_H) / 2, BODY_W, BODY_H, STEP, COLORS.yellow);

    tickerContainer.add(g);
  }

  /**
   * Рисует пиксельный треугольник с основанием сверху и вершиной снизу.
   * Каждая «ступенька» = step px высотой.
   */
  private drawPixelTriDown(
    g: Phaser.GameObjects.Graphics,
    cx: number, topY: number,
    width: number, height: number,
    step: number, color: number,
  ): void {
    g.fillStyle(color, 1);
    const halfBase = width / 2;
    const steps = Math.max(1, Math.ceil(height / step));
    for (let i = 0; i < steps; i++) {
      const t = i / steps;
      const halfW = Math.max(step / 2, halfBase * (1 - t));
      const y = topY + i * step;
      g.fillRect(cx - halfW, y, halfW * 2, step);
    }
  }

  // ============================================================
  // SPIN LOGIC
  // ============================================================

  private startSpin(): void {
    if (this.spinning) return;
    this.spinning = true;

    this.spinHit.disableInteractive();
    this.spinBtn.setAlpha(0.74);
    this.spinButtonText.setText(RU.wheel.spinning.toUpperCase());

    SoundManager.playSfx('wheelSpin');
    Haptics.trigger('tap');

    // Определяем целевой приз и сектор
    const level = SessionState.getCurrentLevel() as SessionLevel;
    const prizeIndex = this.isJackpot
      ? pickJackpotIndex(level)
      : pickPrizeIndex(level);
    const targetPrize = this.wheel[prizeIndex].def;

    const targetSectorAngle = -prizeIndex * this.sectorRad;
    const finalRotation = -SPIN_REVOLUTIONS * Math.PI * 2 + targetSectorAngle;

    this.lastTickedSector = -1;

    this.tweens.add({
      targets: this.wheelContainer,
      rotation: finalRotation,
      duration: SPIN_DURATION_MS,
      ease: 'Cubic.easeOut',
      onUpdate: () => this.checkTick(),
      onComplete: () => this.onSpinComplete(targetPrize, prizeIndex),
    });
  }

  /**
   * Проверяет, не пересёк ли указатель границу сектора с момента предыдущего апдейта,
   * и если да — играет тик.
   */
  private checkTick(): void {
    // Текущий угол колеса в [0, 2π)
    const rot = ((this.wheelContainer.rotation % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
    // Какой сектор сейчас под стрелкой?
    // Стрелка на -90° (== 1.5π). Колесо повёрнуто на rot.
    // Угол центра сектора 0 в системе экрана: -90° + rot.
    // Сектор под стрелкой = round((1.5π - rot) / SECTOR_RAD) mod 8.
    const angleAtTicker = (Math.PI * 1.5 - rot + Math.PI * 4) % (Math.PI * 2);
    const sectorIndex = Math.floor(angleAtTicker / this.sectorRad) % this.sectorCount;

    if (sectorIndex !== this.lastTickedSector) {
      this.lastTickedSector = sectorIndex;
      SoundManager.playSfx('wheelTick');
      Haptics.trigger('wheelTick');
    }
  }

  // ============================================================
  // FINISH
  // ============================================================

  private onSpinComplete(prize: WheelPrize['def'], prizeIndex: number): void {
    SoundManager.stopSfx('wheelSpin', 120);
    // Подсветка победного сектора
    this.flashWinningSector(prizeIndex);

    SoundManager.playSfx(this.getPrizeSfx(prize.tier));
    Haptics.trigger('win');

    const wonPrize = toWonPrize(prize);

    SessionState.setPrize(wonPrize);
    SessionState.endSession('win');

    // Persistent: сессия закрыта успехом — прогресс на 1, инкремент призов
    GameState.resetProgressAfterSession();
    GameState.incrementPrizesWon();

    // Уведомляем родительское окно (если игра встроена в webview)
    TicketProvider.reportPrize(wonPrize);
    TicketProvider.reportSessionEnd('win', { prizeId: wonPrize.id, prizeTier: wonPrize.tier });

    // Дать пользователю секунду полюбоваться, потом переход
    this.time.delayedCall(1100, () => {
      this.cameras.main.fadeOut(400, 10, 10, 10);
      this.cameras.main.once('camerafadeoutcomplete', () => {
        this.scene.start('ResultScene', { outcome: 'win' });
      });
    });
  }

  /** Пульсирующий блик в центре победного сектора */
  private getPrizeSfx(tier: WheelPrize['def']['tier']): SfxName {
    if (tier === 'legendary') return 'legendaryPrize';
    if (tier === 'epic') return 'epicPrize';
    if (tier === 'rare') return 'rarePrize';
    return 'commonPrize';
  }

  private flashWinningSector(prizeIndex: number): void {
    // Координаты центра сектора с учётом текущего угла колеса
    const rot = this.wheelContainer.rotation;
    const sectorCenterAngle = prizeIndex * this.sectorRad - Math.PI / 2 + rot;
    const dist = WHEEL_RADIUS * 0.62;
    const x = this.wheelContainer.x + Math.cos(sectorCenterAngle) * dist;
    const y = this.wheelContainer.y + Math.sin(sectorCenterAngle) * dist;

    const flash = this.add.circle(x, y, WHEEL_RADIUS * 0.22, COLORS.yellow, 0.6);
    flash.setDepth(DEPTH.effects);
    this.tweens.add({
      targets: flash,
      radius: WHEEL_RADIUS * 0.48,
      alpha: 0,
      duration: 800,
      ease: 'Cubic.easeOut',
      onComplete: () => flash.destroy(),
    });

    // Звёздочки-разлёт из центра сектора
    for (let i = 0; i < 12; i++) {
      const angle = (i / 12) * Math.PI * 2;
      const star = this.add.text(x, y, '✨', { fontSize: '20px' });
      star.setOrigin(0.5);
      star.setDepth(DEPTH.effects);
      this.tweens.add({
        targets: star,
        x: x + Math.cos(angle) * WHEEL_RADIUS * 0.36,
        y: y + Math.sin(angle) * WHEEL_RADIUS * 0.36,
        alpha: 0,
        scale: 0.4,
        duration: 700,
        ease: 'Cubic.easeOut',
        onComplete: () => star.destroy(),
      });
    }
  }

  private preparePixelAssets(): void {
    ['fortune-bg', 'fortune-wheel', 'spin-button'].forEach((key) => {
      if (this.textures.exists(key)) {
        this.textures.get(key).setFilter(Phaser.Textures.FilterMode.NEAREST);
      }
    });
  }
}
