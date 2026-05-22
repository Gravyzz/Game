import Phaser from 'phaser';
import { EventBus } from '@core/EventBus';

/**
 * Данные, которые раннер передаёт минке при запуске.
 */
export interface MinigameInitData {
  /** На каком уровне сессии запускается минка (1..4). Влияет на сложность и призы */
  level: 1 | 2 | 3 | 4;
  /** Нормализованная сложность 0..1 — каждая минка решает сама, как её применить */
  difficulty: number;
  /** Рекомендованная длительность раунда в мс. Минка может игнорировать */
  durationMs: number;
  /** Бесконечный/«аркадный» режим. Передаётся из DevMinigameMenuScene. Минки,
   *  у которых есть бесконечный режим (Crossy/Surfer и тп), могут на него переключиться. */
  infinite?: boolean;
}

/**
 * Результат раунда минки.
 */
export interface MinigameResult {
  outcome: 'win' | 'lose';
  /** Очки за раунд, 0..100. Опционально, для аналитики и будущих лидербордов */
  score: number;
  /** Дополнительные метрики раунда (промахи, время, комбо) */
  metadata?: Record<string, unknown>;
}

/**
 * Абстрактный базовый класс мини-игры. Все 4 минки наследуют его.
 *
 * Контракт:
 * 1. Раннер запускает минку через `scene.launch(key, MinigameInitData)`.
 * 2. Минка реализует свой геймплей в create() / update() как обычная Phaser-сцена.
 * 3. Когда раунд закончен (победа или проигрыш), минка ОБЯЗАНА вызвать
 *    `this.complete({ outcome, score })`.
 * 4. После complete() минка автоматически останавливается, раннер получает
 *    событие 'minigame:complete' через EventBus и решает, что делать дальше.
 *
 * Как добавить новую минку (короткий чек-лист):
 *   а) Создать src/minigames/MyGame/index.ts с классом extends BaseMinigame
 *   б) Реализовать create() — это единственный обязательный метод
 *   в) Не забыть вызвать this.complete({...}) когда раунд закончен
 *   г) Зарегистрировать в MinigameRegistry.ts
 *
 * Полная инструкция — в README (Phase 4.8).
 */
export abstract class BaseMinigame extends Phaser.Scene {
  protected initData!: MinigameInitData;

  /** Защита от двойного complete (если в коде минки два пути к завершению) */
  private completed = false;

  /** Флаг паузы геймплея. Используется когда поверх минки висит home-модалка.
   *  Минки которые гоняют логику в update() должны проверять `if (this.gamePaused) return`. */
  public gamePaused = false;

  init(data: MinigameInitData): void {
    this.initData = data;
    this.completed = false;
    // Сбрасываем флаг паузы — Phaser переиспользует scene-instance, и если в прошлом
    // ране модалка осталась открытой при crash/abort, флаг застрял бы в true.
    this.gamePaused = false;
  }

  /**
   * ЕДИНСТВЕННЫЙ способ выхода из минки.
   * Эмитит событие, останавливает сцену.
   */
  protected complete(result: MinigameResult): void {
    if (this.completed) {
      console.warn(`[${this.scene.key}] complete() вызван дважды — игнорируем повтор`);
      return;
    }
    this.completed = true;

    EventBus.emit('minigame:complete', {
      ...result,
      sceneKey: this.scene.key,
      level: this.initData.level,
    });

    // Стопаем сцену через 1 кадр, чтобы текущий handler завершился.
    // В дев-меню (isInfinite) возвращаемся обратно в меню через scene.start —
    // иначе минка просто остановится и канвас останется пустым.
    this.time.delayedCall(0, () => {
      if (this.isInfinite) {
        this.scene.start('DevMinigameMenuScene');
      } else {
        this.scene.stop();
      }
    });
  }

  /** В каком режиме запущена минка: бесконечный (дев-меню) или сессионный (Play) */
  public get isInfinite(): boolean {
    return this.initData?.infinite === true;
  }

  /** Текущий уровень сессии (1..4). Используется для metadata в EventBus. */
  public get currentLevel(): number {
    return this.initData?.level ?? 1;
  }

  /**
   * Игрок выходит из минки через кнопку «домой».
   * Раннер увидит metadata.aborted и закроет всю сессию (а не списывает жизнь).
   * В дев-меню — просто возврат в меню без списания локальной жизни.
   *
   * NOTE: фактически НЕ используется текущим UI (HomeExitModalScene делает
   * scene-переходы сама). Оставлено как публичное API на случай если минке
   * понадобится self-abort из своего кода.
   */
  public abort(): void {
    this.complete({
      outcome: 'lose',
      score: 0,
      metadata: { aborted: true, lifeAlreadyLost: true },
    });
  }

  /** Каждая минка обязана реализовать */
  abstract create(): void;
}
