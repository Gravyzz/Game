/**
 * Параметры прогрессии и хранилища.
 *
 * Решения из Phase 2/4:
 *  - Прогресс сохраняется 14 дней с момента ПОСЛЕДНЕЙ покупки (lastPurchaseAt).
 *    Каждый новый заказ обнуляет таймер.
 *  - Если 14 дней без заказа — progressLevel = 1, билет = false.
 *  - Билет = одна сессия (4 минки строго по одному разу).
 */

/** TTL прогресса в мс — 14 суток */
export const PROGRESS_TTL_MS = 14 * 24 * 60 * 60 * 1000;

/** Версия схемы хранилища. При несовместимых изменениях — инкремент + миграция в Storage */
export const STORAGE_SCHEMA_VERSION = 1;

/** Ключи в localStorage */
export const STORAGE_KEYS = {
  state:    'mla:state',     // основной PersistedState
  muted:    'mla:muted',     // SoundManager (уже используется)
  hapticsOff:'mla:hapticsOff',// Haptics (уже используется)
} as const;
