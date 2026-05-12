import type { SessionLevel } from '@core/SessionState';

/**
 * Реестр всех минок Make Love Adventures.
 *
 * Минки разбиты на три класса сложности. Каждый слот сессии (1..4) привязан
 * к классу — раннер случайно выбирает минку из нужного класса, избегая повторов
 * в рамках одной сессии. Это даёт разнообразие при каждом новом заказе.
 *
 * Чтобы добавить новую минку:
 *   1. Создай scene-класс extends BaseMinigame в src/minigames/MyGame/index.ts
 *   2. Зарегистрируй scene в main.ts
 *   3. Добавь запись в MINIGAME_POOL с нужным классом
 *   4. При необходимости добавь строки в i18n/ru.ts (names, hints)
 */

/** Класс сложности мини-игры */
export type MinigameClass = 'easy' | 'medium' | 'hard';

export interface MinigameMeta {
  /** Уникальный ключ — также используется как Phaser scene key */
  key: string;
  /** Имя для UI (берётся из i18n.minigame.names[key]) */
  i18nKey: string;
  /** Хинт-стикер перед запуском (берётся из i18n.minigame.hints[key]) */
  hintI18nKey: string;
  /** Длительность раунда в мс — рекомендация для минки */
  durationMs: number;
  /** Класс сложности — определяет, в какой слот сессии попадёт минка */
  class: MinigameClass;
}

/**
 * Пул всех зарегистрированных мини-игр.
 *
 * Классы:
 *   easy   — лёгкий вход, одна простая механика (слот 1)
 *   medium — средний драйв, смешанная механика (слоты 2–3)
 *   hard   — высокая нагрузка, кульминация и финал (слоты 3–4)
 */
export const MINIGAME_POOL: MinigameMeta[] = [
  // ===== EASY =====
  {
    key: 'FireStarter',
    i18nKey: 'FireStarter',
    hintI18nKey: 'FireStarter',
    durationMs: 30_000,
    class: 'easy',
  },
  {
    key: 'ChopChop',
    i18nKey: 'ChopChop',
    hintI18nKey: 'ChopChop',
    durationMs: 35_000,
    class: 'easy',
  },
  {
    key: 'PizzaAssembly',
    i18nKey: 'PizzaAssembly',
    hintI18nKey: 'PizzaAssembly',
    durationMs: 40_000,
    class: 'easy',
  },
  {
    key: 'RecipeMemo',
    i18nKey: 'RecipeMemo',
    hintI18nKey: 'RecipeMemo',
    durationMs: 35_000,
    class: 'easy',
  },

  // ===== MEDIUM =====
  {
    key: 'DontWork',
    i18nKey: 'DontWork',
    hintI18nKey: 'DontWork',
    durationMs: 45_000,
    class: 'medium',
  },
  {
    key: 'FiveDollar',
    i18nKey: 'FiveDollar',
    hintI18nKey: 'FiveDollar',
    durationMs: 40_000,
    class: 'medium',
  },
  {
    key: 'Surfer',
    i18nKey: 'Surfer',
    hintI18nKey: 'Surfer',
    durationMs: 35_000,
    class: 'medium',
  },
  {
    key: 'DanceBeat',
    i18nKey: 'DanceBeat',
    hintI18nKey: 'DanceBeat',
    durationMs: 35_000,
    class: 'medium',
  },
  {
    key: 'JeffreySurfer',
    i18nKey: 'JeffreySurfer',
    hintI18nKey: 'JeffreySurfer',
    durationMs: 60_000,
    class: 'medium',
  },
];

/** Сколько минок в одной сессии (4 слота) */
const SESSION_LENGTH = 4;

/**
 * Генерирует уникальную последовательность из {@link SESSION_LENGTH} минок для сессии.
 *
 * Алгоритм: чистый рандом — берём весь пул, тасуем, отрезаем первые N.
 * Поле `class` в записях остаётся для будущих фильтров, но в выборку не влияет.
 * Гарантия: внутри одной сессии минки не повторяются.
 */
export function generateSessionSequence(): MinigameMeta[] {
  const shuffled = [...MINIGAME_POOL];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled.slice(0, SESSION_LENGTH);
}

/** Сложность 0..1 для конкретного слота (1..4) — не зависит от конкретной минки */
export function getDifficultyForLevel(level: SessionLevel): number {
  // 1 → 0.25, 2 → 0.5, 3 → 0.75, 4 → 1.0
  return level / 4;
}
