import { Storage, type PersistedState } from '@core/Storage';
import { EventBus } from '@core/EventBus';
import type { SessionLevel } from '@core/SessionState';

/**
 * Фасад над Storage. ВСЯ работа с persistent-стейтом (между сессиями) — отсюда.
 *
 * Зачем фасад: сцены не должны знать про сериализацию, миграции и TTL.
 * Они вызывают понятные методы: hasTicket(), consumeTicket(), markLevelCompleted(), etc.
 *
 * Эмитит события через EventBus:
 *   'state:changed'           — после любого save
 *   'state:ticket:received'   — выдан билет
 *   'state:ticket:consumed'   — билет потрачен (старт сессии)
 *   'state:progress:reset'    — 14 дней истекли, прогресс обнулён
 */

class GameStateImpl {
  private state: PersistedState;

  constructor() {
    this.state = Storage.load();
  }

  // ============================================================
  // Билеты
  // ============================================================

  hasTicket(): boolean {
    return this.state.ticketAvailable;
  }

  /**
   * Выдать билет (вызывается из TicketProvider).
   * Также обновляет lastPurchaseAt — таймер 14 дней начинается заново.
   */
  grantTicket(): void {
    const wasFirst = this.state.lastPurchaseAt === null;
    this.state.ticketAvailable = true;
    this.state.lastPurchaseAt = Date.now();
    Storage.save(this.state);
    EventBus.emit('state:changed', this.state);
    EventBus.emit('state:ticket:received', { firstPurchase: wasFirst });
  }

  /** Списать билет (вызывается из MinigameRunnerScene при старте первой минки сессии) */
  consumeTicket(): boolean {
    if (!this.state.ticketAvailable) return false;
    this.state.ticketAvailable = false;
    this.state.totalSessionsPlayed++;
    Storage.save(this.state);
    EventBus.emit('state:changed', this.state);
    EventBus.emit('state:ticket:consumed', undefined);
    return true;
  }

  // ============================================================
  // Прогресс
  // ============================================================

  /** На какой минке игрок начнёт следующую сессию (1..4) */
  getProgressLevel(): SessionLevel {
    return this.state.progressLevel;
  }

  /**
   * Игрок проиграл на уровне — фиксируем прогресс на этой же минке,
   * чтобы при следующем заказе он стартанул отсюда.
   */
  markProgressOnLose(level: SessionLevel): void {
    this.state.progressLevel = level;
    Storage.save(this.state);
    EventBus.emit('state:changed', this.state);
  }

  /**
   * Сессия закончилась полностью (победа на колесе или проигрыш на 1-м уровне) —
   * сбрасываем прогресс на 1, чтобы новая сессия началась с самого начала.
   */
  resetProgressAfterSession(): void {
    this.state.progressLevel = 1;
    Storage.save(this.state);
    EventBus.emit('state:changed', this.state);
  }

  // ============================================================
  // Метрики
  // ============================================================

  incrementPrizesWon(): void {
    this.state.totalPrizesWon++;
    Storage.save(this.state);
    EventBus.emit('state:changed', this.state);
  }

  // ============================================================
  // Tutorial
  // ============================================================

  hasSeenTutorial(): boolean {
    return this.state.tutorialSeen;
  }

  markTutorialSeen(): void {
    if (this.state.tutorialSeen) return;
    this.state.tutorialSeen = true;
    Storage.save(this.state);
    EventBus.emit('state:changed', this.state);
  }

  // ============================================================
  // 14-дневный таймер
  // ============================================================

  /**
   * Сколько мс осталось до сброса прогресса. null — таймер не запущен (нет покупок).
   * Storage сам сбрасывает при load(), но эта функция нужна для UI/аналитики.
   */
  getTimeUntilReset(): number | null {
    if (this.state.lastPurchaseAt === null) return null;
    const TTL = 14 * 24 * 60 * 60 * 1000;
    const left = (this.state.lastPurchaseAt + TTL) - Date.now();
    return Math.max(0, left);
  }

  // ============================================================
  // Дев-утилиты
  // ============================================================

  /** Полный сброс — для отладки (например, через консоль или ?reset=1) */
  resetAll(): void {
    Storage.resetAll();
    this.state = Storage.load();
    EventBus.emit('state:changed', this.state);
    EventBus.emit('state:progress:reset', undefined);
  }

  /** Снимок текущего состояния — для отладки и аналитики */
  snapshot(): PersistedState {
    return { ...this.state };
  }
}

export const GameState = new GameStateImpl();
