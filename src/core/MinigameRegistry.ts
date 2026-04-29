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
  {
    key: 'FireStarter',
    i18nKey: 'FireStarter',
    hintI18nKey: 'FireStarter',
    durationMs: 30_000,
    class: 'easy',
  },
  {
    key: 'DontWork',
    i18nKey: 'DontWork',
    hintI18nKey: 'DontWork',
    durationMs: 45_000,
    class: 'medium',
  },
  {
    key: 'RhythmBattle',
    i18nKey: 'RhythmBattle',
    hintI18nKey: 'RhythmBattle',
    durationMs: 35_000,
    class: 'hard',
  },
  {
    key: 'NightDelivery',
    i18nKey: 'NightDelivery',
    hintI18nKey: 'NightDelivery',
    durationMs: 45_000,
    class: 'hard',
  },
];

/**
 * Классы сложности для каждого из 4 слотов сессии.
 * Драматургическая дуга: лёгкий вход → разгон → кульминация → финальный спринт.
 */
const SLOT_CLASSES: MinigameClass[] = ['easy', 'medium', 'hard', 'hard'];

/**
 * Генерирует уникальную последовательность из 4 минок для одной сессии.
 *
 * Алгоритм:
 *  1. Для каждого слота берём класс из SLOT_CLASSES.
 *  2. Из пула выбираем случайную минку нужного класса, которая ещё не использована.
 *  3. Если пул класса исчерпан (мало игр) — берём любую оставшуюся неиспользованную.
 *
 * Гарантирует отсутствие дубликатов внутри одной сессии.
 */
export function generateSessionSequence(): MinigameMeta[] {
  const sequence: MinigameMeta[] = [];
  const used = new Set<string>();

  for (const slotClass of SLOT_CLASSES) {
    const byClass   = MINIGAME_POOL.filter(m => m.class === slotClass && !used.has(m.key));
    const fallback  = MINIGAME_POOL.filter(m => !used.has(m.key));
    const pool      = byClass.length > 0 ? byClass : fallback;

    const picked = pool[Math.floor(Math.random() * pool.length)];
    sequence.push(picked);
    used.add(picked.key);
  }

  return sequence;
}

/** Сложность 0..1 для конкретного слота (1..4) — не зависит от конкретной минки */
export function getDifficultyForLevel(level: SessionLevel): number {
  // 1 → 0.25, 2 → 0.5, 3 → 0.75, 4 → 1.0
  return level / 4;
}
