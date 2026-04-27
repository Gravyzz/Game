import { PROGRESS_TTL_MS, STORAGE_SCHEMA_VERSION, STORAGE_KEYS } from '@config/progression';

/**
 * Persistent state игрока. Хранится в localStorage.
 *
 * При изменении формы — инкрементируем STORAGE_SCHEMA_VERSION и пишем миграцию в migrate().
 */
export interface PersistedState {
  schemaVersion: number;

  /** Прогресс — на какой минке игрок остановился (1..4). При полном сбросе = 1 */
  progressLevel: 1 | 2 | 3 | 4;

  /** Есть ли неиспользованный билет (= 1 сессия в запасе) */
  ticketAvailable: boolean;

  /**
   * Timestamp последней покупки (мс). Источник правды для 14-дневного сброса.
   * null — игрок ещё не покупал (первый запуск).
   */
  lastPurchaseAt: number | null;

  /** Флаг: туториал уже показан */
  tutorialSeen: boolean;

  /** Метрики (для аналитики) */
  totalSessionsPlayed: number;
  totalPrizesWon: number;
}

const DEFAULT_STATE: PersistedState = {
  schemaVersion: STORAGE_SCHEMA_VERSION,
  progressLevel: 1,
  ticketAvailable: false,
  lastPurchaseAt: null,
  tutorialSeen: false,
  totalSessionsPlayed: 0,
  totalPrizesWon: 0,
};

/**
 * Storage с защитой:
 * 1. Если localStorage недоступен (приватный режим Safari, iframe без storage) —
 *    держим состояние in-memory, игра не падает.
 * 2. При парсе невалидного JSON — возвращаем дефолт, не крашимся.
 * 3. Миграции версий — точечно, не всё подряд переписывая.
 *
 * Нет реактивности — кто хочет следить за изменениями, использует EventBus напрямую.
 */
class StorageImpl {
  private memoryFallback: PersistedState | null = null;
  private storageWorks: boolean;

  constructor() {
    this.storageWorks = this.testStorage();
  }

  /** Проверяем, реально ли работает localStorage */
  private testStorage(): boolean {
    try {
      const k = '__mla_test__';
      window.localStorage.setItem(k, '1');
      window.localStorage.removeItem(k);
      return true;
    } catch {
      console.warn('[Storage] localStorage недоступен, fallback in-memory');
      return false;
    }
  }

  /** Загружает состояние с применением 14-дневного сброса и миграций */
  load(): PersistedState {
    const raw = this.readRaw();
    const state = raw ? this.migrate(raw) : { ...DEFAULT_STATE };

    // Проверяем 14-дневный TTL — если просрочено, сбрасываем прогресс и билет
    if (this.isExpired(state)) {
      state.progressLevel = 1;
      state.ticketAvailable = false;
      // lastPurchaseAt НЕ обнуляем — пусть остаётся как «последний известный заказ»,
      // tutorialSeen и totalSessions тоже сохраняем (это lifetime-метрики)
      this.save(state);
    }

    return state;
  }

  /** Сохраняет состояние */
  save(state: PersistedState): void {
    state.schemaVersion = STORAGE_SCHEMA_VERSION;

    if (this.storageWorks) {
      try {
        window.localStorage.setItem(STORAGE_KEYS.state, JSON.stringify(state));
      } catch (err) {
        console.warn('[Storage] save failed', err);
        this.memoryFallback = state;
      }
    } else {
      this.memoryFallback = state;
    }
  }

  /** Сброс всего (для dev-инструментов) */
  resetAll(): void {
    this.memoryFallback = null;
    if (this.storageWorks) {
      try {
        window.localStorage.removeItem(STORAGE_KEYS.state);
      } catch {
        // ignore
      }
    }
  }

  // ============================================================
  // Internal
  // ============================================================

  private readRaw(): unknown {
    if (!this.storageWorks) return this.memoryFallback;

    try {
      const raw = window.localStorage.getItem(STORAGE_KEYS.state);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch (err) {
      console.warn('[Storage] read/parse failed, using defaults', err);
      return null;
    }
  }

  /** Применяет миграции и валидацию. Если данные битые — возвращает дефолт */
  private migrate(raw: unknown): PersistedState {
    if (typeof raw !== 'object' || raw === null) return { ...DEFAULT_STATE };

    const r = raw as Partial<PersistedState>;

    // Валидируем тип каждого поля. Если значение не подходит — берём дефолт.
    const state: PersistedState = {
      schemaVersion: typeof r.schemaVersion === 'number' ? r.schemaVersion : STORAGE_SCHEMA_VERSION,
      progressLevel: this.validLevel(r.progressLevel),
      ticketAvailable: typeof r.ticketAvailable === 'boolean' ? r.ticketAvailable : false,
      lastPurchaseAt: typeof r.lastPurchaseAt === 'number' ? r.lastPurchaseAt : null,
      tutorialSeen: typeof r.tutorialSeen === 'boolean' ? r.tutorialSeen : false,
      totalSessionsPlayed: typeof r.totalSessionsPlayed === 'number' ? r.totalSessionsPlayed : 0,
      totalPrizesWon: typeof r.totalPrizesWon === 'number' ? r.totalPrizesWon : 0,
    };

    // Здесь будут будущие миграции:
    // if (state.schemaVersion < 2) { ...transform... state.schemaVersion = 2; }

    return state;
  }

  private validLevel(v: unknown): 1 | 2 | 3 | 4 {
    return v === 1 || v === 2 || v === 3 || v === 4 ? v : 1;
  }

  /** Истёк ли 14-дневный таймер? */
  private isExpired(state: PersistedState): boolean {
    if (state.lastPurchaseAt === null) return false; // ни разу не покупал — нечему истекать
    return Date.now() - state.lastPurchaseAt > PROGRESS_TTL_MS;
  }
}

export const Storage = new StorageImpl();
