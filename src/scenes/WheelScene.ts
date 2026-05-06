import Phaser from 'phaser';
import { COLORS } from '@config/colors';
import { GAME, DEPTH } from '@config/game';
import { RU } from '@i18n/ru';
import { Button } from '@ui/Button';
import { PosterText } from '@ui/PosterText';
import { SessionState } from '@core/SessionState';
import { GameState } from '@core/GameState';
import { TicketProvider } from '@core/TicketProvider';
import { SoundManager } from '@core/SoundManager';
import { Haptics } from '@core/Haptics';
import { attachSoundButton, attachNoiseBackdrop } from '@utils/SceneHelpers';
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

const WHEEL_RADIUS = 280;
const SECTOR_COUNT = PRIZE_POOL.length; // 8
const SECTOR_RAD = (Math.PI * 2) / SECTOR_COUNT; // 45°
const SPIN_DURATION_MS = 3500;
const SPIN_REVOLUTIONS = 5;

export class WheelScene extends Phaser.Scene {
  private isJackpot = false;
  private wheelContainer!: Phaser.GameObjects.Container;
  private spinning = false;
  private lastTickedSector = -1;
  private spinBtn!: Button;

  constructor() {
    super({ key: 'WheelScene' });
  }

  create(data: { isJackpot?: boolean } = {}): void {
    const { WIDTH, HEIGHT } = GAME;
    this.isJackpot = data.isJackpot ?? false;

    // ===== Фон =====
    this.add.rectangle(WIDTH / 2, HEIGHT / 2, WIDTH, HEIGHT, COLORS.purple);
    this.drawNoise();

    // ===== Заголовок =====
    const titleText = this.isJackpot ? '🎰 ДЖЕКПОТ! 🎰' : RU.wheel.title;
    const titlePoster = new PosterText(this, WIDTH / 2, 130, titleText, {
      bgColor: COLORS.yellow,
      textColor: '#0A0A0A',
      fontSize: this.isJackpot ? '34px' : '38px',
      rotation: -0.025,
      paddingX: 24,
      paddingY: 14,
    });
    titlePoster.setDepth(DEPTH.ui);
    this.add.existing(titlePoster);

    // ===== Колесо =====
    const wheelCenter = { x: WIDTH / 2, y: HEIGHT / 2 - 40 };
    this.wheelContainer = this.add.container(wheelCenter.x, wheelCenter.y);
    this.wheelContainer.setDepth(DEPTH.gameplay);

    this.drawWheelSectors(this.wheelContainer);
    this.drawWheelCenterCap(this.wheelContainer);

    // ===== Тикер (указатель сверху) =====
    this.drawTicker(wheelCenter.x, wheelCenter.y - WHEEL_RADIUS - 10);

    // ===== Декоративные стикеры =====
    const sticker = new PosterText(this, 100, 250, 'КРУТИ!', {
      bgColor: COLORS.red,
      textColor: '#FAF7F0',
      fontSize: '20px',
      rotation: -0.18,
      paddingX: 12,
      paddingY: 6,
    });
    sticker.setDepth(DEPTH.midground);
    sticker.setAlpha(0.85);
    this.add.existing(sticker);

    // ===== Кнопка «КРУТИ!» =====
    this.spinBtn = new Button(
      this,
      WIDTH / 2,
      HEIGHT - 130,
      RU.wheel.spinCta,
      () => this.startSpin(),
      {
        width: 380,
        height: 100,
        bgColor: COLORS.yellow,
        textColor: '#0A0A0A',
        fontSize: '32px',
      }
    );
    this.spinBtn.setDepth(DEPTH.ui);
    this.add.existing(this.spinBtn);

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

  /**
   * Рисует 8 секторов колеса как клиновидные графические фигуры
   * + текст и иконку приза, повёрнутые радиально.
   */
  private drawWheelSectors(container: Phaser.GameObjects.Container): void {
    // Внешний обод (черная окантовка)
    const rim = this.add.circle(0, 0, WHEEL_RADIUS + 8, COLORS.black);
    container.add(rim);

    // Каждый сектор
    for (let i = 0; i < SECTOR_COUNT; i++) {
      const prize = PRIZE_POOL[i];
      // Сектор i занимает углы [i * 45° - 22.5°, i * 45° + 22.5°]
      // относительно вертикали (0° = вверх).
      // В Phaser нулевой угол смотрит вправо (3 часа), поэтому сдвигаем на -90°.
      const sectorCenterAngle = i * SECTOR_RAD - Math.PI / 2;
      const startAngle = sectorCenterAngle - SECTOR_RAD / 2;
      const endAngle = sectorCenterAngle + SECTOR_RAD / 2;

      // Рисуем заливку сектора через Graphics
      const g = this.add.graphics();
      g.fillStyle(prize.color, 1);
      g.beginPath();
      g.moveTo(0, 0);
      g.arc(0, 0, WHEEL_RADIUS, startAngle, endAngle, false);
      g.closePath();
      g.fillPath();

      // Чёрная разделительная линия между секторами
      g.lineStyle(3, COLORS.black, 1);
      g.beginPath();
      g.moveTo(0, 0);
      g.lineTo(Math.cos(startAngle) * WHEEL_RADIUS, Math.sin(startAngle) * WHEEL_RADIUS);
      g.strokePath();

      container.add(g);

      // Текст и иконка приза — размещаем по середине сектора, ~75% радиуса
      const labelDist = WHEEL_RADIUS * 0.62;
      const labelX = Math.cos(sectorCenterAngle) * labelDist;
      const labelY = Math.sin(sectorCenterAngle) * labelDist;

      // Поворачиваем текст так, чтобы он читался от центра наружу
      // (т.е. перпендикулярно радиусу). Если сектор «кверху ногами» — переворачиваем.
      let textRotation = sectorCenterAngle + Math.PI / 2;
      if (textRotation > Math.PI / 2 && textRotation < Math.PI * 1.5) {
        textRotation += Math.PI;
      }

      const labelContainer = this.add.container(labelX, labelY);
      labelContainer.setRotation(textRotation);

      const iconText = this.add.text(0, -22, prize.icon, { fontSize: '32px' });
      iconText.setOrigin(0.5);

      const labelText = this.add.text(0, 14, RU.prizes[prize.i18nKey] ?? prize.id, {
        fontFamily: 'Unbounded, sans-serif',
        fontSize: '13px',
        fontStyle: 'italic 800',
        color: prize.textColor,
        align: 'center',
        wordWrap: { width: 130 },
      });
      labelText.setOrigin(0.5);

      labelContainer.add([iconText, labelText]);
      container.add(labelContainer);
    }
  }

  /** Центральный «болт» колеса с эмодзи 🎸 */
  private drawWheelCenterCap(container: Phaser.GameObjects.Container): void {
    const cap = this.add.circle(0, 0, 36, COLORS.black);
    cap.setStrokeStyle(4, COLORS.cream);
    container.add(cap);

    const capIcon = this.add.text(0, 0, '🎸', { fontSize: '32px' });
    capIcon.setOrigin(0.5);
    container.add(capIcon);
  }

  /** Стрелка-указатель сверху колеса */
  private drawTicker(x: number, y: number): void {
    const tickerContainer = this.add.container(x, y);
    tickerContainer.setDepth(DEPTH.effects);

    const g = this.add.graphics();
    g.fillStyle(COLORS.yellow, 1);
    g.lineStyle(3, COLORS.black, 1);
    g.beginPath();
    g.moveTo(0, 0);
    g.lineTo(-22, -28);
    g.lineTo(22, -28);
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

    this.spinBtn.setEnabled(false);
    this.spinBtn.setText(RU.wheel.spinning.toUpperCase());

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

  private drawNoise(): void {
    attachNoiseBackdrop(this, 'noise-wheel', 600);
  }
}
