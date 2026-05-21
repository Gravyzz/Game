import Phaser from 'phaser';
import { COLORS } from '@config/colors';
import { GAME, DEPTH } from '@config/game';
import { RU } from '@i18n/ru';
import { SessionState } from '@core/SessionState';
import { GameState } from '@core/GameState';
import { TicketProvider } from '@core/TicketProvider';
import { SoundManager } from '@core/SoundManager';
import { Haptics } from '@core/Haptics';
import { attachSoundButton } from '@utils/SceneHelpers';
import { PRIZE_POOL, pickPrizeIndex, toWonPrize, type PrizeDef } from '@config/prizes';
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

const WHEEL_RADIUS = 330;
const SECTOR_COUNT = PRIZE_POOL.length; // 8
const SECTOR_RAD = (Math.PI * 2) / SECTOR_COUNT; // 45°
const SPIN_DURATION_MS = 3500;
const SPIN_REVOLUTIONS = 5;
const PIXEL_FONT = '"Press Start 2P", monospace';

export class WheelScene extends Phaser.Scene {
  private isJackpot = false;
  private wheelContainer!: Phaser.GameObjects.Container;
  private spinning = false;
  private lastTickedSector = -1;
  private spinBtn!: Phaser.GameObjects.Container;
  private spinButtonImage!: Phaser.GameObjects.Image;
  private spinButtonText!: Phaser.GameObjects.Text;

  constructor() {
    super({ key: 'WheelScene' });
  }

  create(data: { isJackpot?: boolean } = {}): void {
    const { WIDTH, HEIGHT } = GAME;
    this.isJackpot = data.isJackpot ?? false;

    this.preparePixelAssets();

    // ===== Фон по макету =====
    const bg = this.add.image(WIDTH / 2, HEIGHT / 2, 'fortune-bg');
    bg.setOrigin(0.5);
    bg.setScale(Math.max(WIDTH / bg.width, HEIGHT / bg.height));
    bg.setDepth(DEPTH.background);

    // ===== Колесо =====
    const wheelCenter = { x: WIDTH / 2, y: 635 };
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
    this.spinBtn = this.add.container(WIDTH / 2, 1136);
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
    this.spinBtn.add([this.spinButtonImage, this.spinButtonText]);
    this.spinBtn.setSize(500, 160);
    this.spinBtn.setInteractive({ useHandCursor: true });
    this.spinBtn.on('pointerdown', () => this.startSpin());

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
  }

  private drawWheelLabels(container: Phaser.GameObjects.Container): void {
    for (let i = 0; i < SECTOR_COUNT; i++) {
      const prize = PRIZE_POOL[i];
      const sectorCenterAngle = i * SECTOR_RAD - Math.PI / 2;
      const labelDist = WHEEL_RADIUS * 0.58;
      const labelX = Math.cos(sectorCenterAngle) * labelDist;
      const labelY = Math.sin(sectorCenterAngle) * labelDist;

      const labelContainer = this.add.container(labelX, labelY);
      labelContainer.setRotation(sectorCenterAngle + Math.PI / 2);

      const iconText = this.add.text(0, -30, prize.icon, { fontSize: '34px' });
      iconText.setOrigin(0.5);

      const labelText = this.add.text(0, 18, (RU.prizes[prize.i18nKey] ?? prize.id).toUpperCase(), {
        fontFamily: PIXEL_FONT,
        fontSize: '16px',
        color: prize.textColor,
        align: 'center',
        stroke: prize.textColor === '#0A0A0A' ? undefined : '#0A0A0A',
        strokeThickness: prize.textColor === '#0A0A0A' ? 0 : 4,
        wordWrap: { width: 150 },
      });
      labelText.setOrigin(0.5);

      labelContainer.add([iconText, labelText]);
      container.add(labelContainer);
    }
  }

  /** Стрелка-указатель сверху колеса */
  private drawTicker(x: number, y: number): void {
    const tickerContainer = this.add.container(x, y);
    tickerContainer.setDepth(DEPTH.effects);

    const g = this.add.graphics();
    g.fillStyle(COLORS.yellow, 1);
    g.lineStyle(5, COLORS.black, 1);
    g.beginPath();
    g.moveTo(0, 44);
    g.lineTo(-34, -22);
    g.lineTo(34, -22);
    g.closePath();
    g.fillPath();
    g.strokePath();

    tickerContainer.add(g);
  }

  // ============================================================
  // SPIN LOGIC
  // ============================================================

  private startSpin(): void {
    if (this.spinning) return;
    this.spinning = true;

    this.spinBtn.disableInteractive();
    this.spinBtn.setAlpha(0.74);
    this.spinButtonText.setText(RU.wheel.spinning.toUpperCase());

    SoundManager.playSfx('wheelSpin');
    Haptics.trigger('tap');

    // Определяем целевой приз и сектор
    const level = SessionState.getCurrentLevel();
    const prizeIndex = this.isJackpot
      ? this.pickJackpotIndex()
      : pickPrizeIndex(level as SessionLevel);
    const targetPrize = PRIZE_POOL[prizeIndex];

    // Считаем целевой угол вращения колеса.
    // Текущий угол колеса считаем от 0 (стартовая позиция).
    // Чтобы СЕКТОР prizeIndex оказался под стрелкой (направление = -90° / «вверх»),
    // нужно повернуть колесо так, чтобы центр этого сектора был на 270° (= -90°).
    //
    // Центр сектора i при rotation=0 находится по углу: (i * SECTOR_RAD) - 90°.
    // Стрелка указывает на угол: -90° (= 270°).
    // Решая, какое rotation нужно: -prizeIndex * SECTOR_RAD (по модулю 2π).
    //
    // Плюс прибавляем SPIN_REVOLUTIONS полных оборотов для драматизма.

    const targetSectorAngle = -prizeIndex * SECTOR_RAD;
    // Нормализуем в [0, 2π) и прибавляем обороты (отрицательные = по часовой)
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
    const sectorIndex = Math.floor(angleAtTicker / SECTOR_RAD) % SECTOR_COUNT;

    if (sectorIndex !== this.lastTickedSector) {
      this.lastTickedSector = sectorIndex;
      SoundManager.playSfx('wheelTick');
      Haptics.trigger('wheelTick');
    }
  }

  /** Гарантированно epic/legendary для джекпота на 4-м уровне */
  private pickJackpotIndex(): number {
    const epicAndLegendary = PRIZE_POOL
      .map((p, i) => ({ p, i }))
      .filter(({ p }) => p.tier === 'epic' || p.tier === 'legendary');

    // 30% шанс легендарки, 70% — epic. На джекпоте можно щедрее, чем по таблице
    if (Math.random() < 0.3) {
      const legendaries = epicAndLegendary.filter(({ p }) => p.tier === 'legendary');
      if (legendaries.length > 0) return legendaries[Math.floor(Math.random() * legendaries.length)].i;
    }
    const epics = epicAndLegendary.filter(({ p }) => p.tier === 'epic');
    if (epics.length > 0) return epics[Math.floor(Math.random() * epics.length)].i;
    return epicAndLegendary[0].i;
  }

  // ============================================================
  // FINISH
  // ============================================================

  private onSpinComplete(prize: PrizeDef, prizeIndex: number): void {
    // Подсветка победного сектора
    this.flashWinningSector(prizeIndex);

    SoundManager.playSfx('win');
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
  private flashWinningSector(prizeIndex: number): void {
    // Координаты центра сектора с учётом текущего угла колеса
    const rot = this.wheelContainer.rotation;
    const sectorCenterAngle = prizeIndex * SECTOR_RAD - Math.PI / 2 + rot;
    const dist = WHEEL_RADIUS * 0.62;
    const x = this.wheelContainer.x + Math.cos(sectorCenterAngle) * dist;
    const y = this.wheelContainer.y + Math.sin(sectorCenterAngle) * dist;

    const flash = this.add.circle(x, y, 80, COLORS.yellow, 0.6);
    flash.setDepth(DEPTH.effects);
    this.tweens.add({
      targets: flash,
      radius: 180,
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
        x: x + Math.cos(angle) * 120,
        y: y + Math.sin(angle) * 120,
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
