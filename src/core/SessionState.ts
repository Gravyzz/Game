import { EventBus } from '@core/EventBus';
import { generateSessionSequence, type MinigameMeta } from '@core/MinigameRegistry';

/**
 * Состояние ОДНОЙ игровой сессии (от старта первой минки до колеса/проигрыша).
 *
 * В Phase 4.7 рядом появится PersistedState (через Storage) с прогрессом
 * между сессиями (progressLevel, lastPurchaseAt). Сейчас — чисто in-memory.
 */

export type SessionLevel = 1 | 2 | 3 | 4;

export interface PrizeWon {
  id: string;        // ключ из PRIZE_POOL
  label: string;     // лейбл из i18n.prizes
  tier: string;      // common / rare / epic / legendary
  promoCode?: string; // если применимо
}

interface SessionData {
  /** Текущий слот сессии. 1..4 включительно. */
  currentLevel: SessionLevel;
  /** Слоты, которые игрок прошёл успешно в этой сессии */
  completedLevels: SessionLevel[];
  /** Финальный приз (если сессия закрыта успешно) */
  prizeWon: PrizeWon | null;
  /** Активна ли сессия (false до старта и после завершения) */
  active: boolean;
  /** Общие жизни сессии. Проигрыш в любой мини-игре снимает одну. */
  livesLeft: number;
  /** Случайная последовательность минок, сгенерированная при старте сессии */
  sequence: MinigameMeta[];
}

const SESSION_LIVES = 3;
const MAX_SESSION_LIVES = 99;

class SessionStateManager {
  private data: SessionData = {
    currentLevel: 1,
    completedLevels: [],
    prizeWon: null,
    active: false,
    livesLeft: SESSION_LIVES,
    sequence: [],
  };

  /** Стартует новую сессию с указанного уровня (для возобновления прогресса) */
  startSession(startLevel: SessionLevel = 1): void {
    this.data = {
      currentLevel: startLevel,
      completedLevels: [],
      prizeWon: null,
      active: true,
      livesLeft: this.data.livesLeft,
      sequence: generateSessionSequence(),
    };
    EventBus.emit('session:start', { startLevel });
  }

  /** Текущий уровень (слот) сессии */
  getCurrentLevel(): SessionLevel {
    return this.data.currentLevel;
  }

  /** Минка для конкретного слота (1..4) из сгенерированной последовательности */
  getMinigameAtLevel(level: SessionLevel): MinigameMeta {
    return this.data.sequence[level - 1];
  }

  /** Фиксируем победу на текущем уровне */
  markLevelWon(): void {
    if (!this.data.completedLevels.includes(this.data.currentLevel)) {
      this.data.completedLevels.push(this.data.currentLevel);
    }
  }

  /** Переход на следующий уровень. Возвращает новый уровень или null, если сессия закончилась */
  advanceLevel(): SessionLevel | null {
    if (this.data.currentLevel >= 4) return null;
    this.data.currentLevel = (this.data.currentLevel + 1) as SessionLevel;
    return this.data.currentLevel;
  }

  getLivesLeft(): number {
    return this.data.livesLeft;
  }

  setLives(lives: number): number {
    this.data.livesLeft = Math.max(0, Math.min(MAX_SESSION_LIVES, Math.round(lives)));
    EventBus.emit('session:lives:changed', { livesLeft: this.data.livesLeft });
    return this.data.livesLeft;
  }

  loseLife(): number {
    this.data.livesLeft = Math.max(0, this.data.livesLeft - 1);
    EventBus.emit('session:lives:changed', { livesLeft: this.data.livesLeft });
    return this.data.livesLeft;
  }

  /** Кладём приз в сессию (после колеса) */
  setPrize(prize: PrizeWon): void {
    this.data.prizeWon = prize;
  }

  getPrize(): PrizeWon | null {
    return this.data.prizeWon;
  }

  /** Закрываем сессию (после колеса/проигрыша) */
  endSession(outcome: 'win' | 'lose'): void {
    this.data.active = false;
    EventBus.emit('session:end', { outcome, prize: this.data.prizeWon });
  }

  isActive(): boolean {
    return this.data.active;
  }

  /** Сброс — для dev/тестов */
  reset(): void {
    this.data = {
      currentLevel: 1,
      completedLevels: [],
      prizeWon: null,
      active: false,
      livesLeft: SESSION_LIVES,
      sequence: [],
    };
  }
}

/** Singleton — один экземпляр на всё приложение */
export const SessionState = new SessionStateManager();
