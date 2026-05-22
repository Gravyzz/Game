/**
 * Реестр всех активных минок Make Love Adventures.
 *
 * Сессия состоит из 4 разных мини-игр. Выбор полностью случайный:
 * берём весь активный пул, тасуем его и отрезаем первые 4 элемента.
 *
 * Чтобы добавить новую минку:
 *   1. Создай scene-класс extends BaseMinigame в src/minigames/MyGame/index.ts
 *   2. Зарегистрируй scene в main.ts
 *   3. Добавь запись в MINIGAME_POOL
 *   4. При необходимости добавь строки в i18n/ru.ts (names, hints, guides)
 */

export interface MinigameMeta {
  /** Уникальный ключ - также используется как Phaser scene key */
  key: string;
  /** Имя для UI (берётся из i18n.minigame.names[key]) */
  i18nKey: string;
  /** Хинт-стикер перед запуском (берётся из i18n.minigame.hints[key]) */
  hintI18nKey: string;
  /** Длительность раунда в мс */
  durationMs: number;
}

/** Фиксированная сложность: она больше не зависит от номера слота 1..4. */
export const MINIGAME_DIFFICULTY = 0.5;

/** Активный пул из 8 готовых мини-игр. */
export const MINIGAME_POOL: MinigameMeta[] = [
  {
    key: 'FireStarter',
    i18nKey: 'FireStarter',
    hintI18nKey: 'FireStarter',
    durationMs: 30_000,
  },
  {
    key: 'ChopChop',
    i18nKey: 'ChopChop',
    hintI18nKey: 'ChopChop',
    durationMs: 35_000,
  },
  {
    key: 'PizzaAssembly',
    i18nKey: 'PizzaAssembly',
    hintI18nKey: 'PizzaAssembly',
    durationMs: 40_000,
  },
  {
    key: 'RecipeMemo',
    i18nKey: 'RecipeMemo',
    hintI18nKey: 'RecipeMemo',
    durationMs: 35_000,
  },
  {
    key: 'DontWork',
    i18nKey: 'DontWork',
    hintI18nKey: 'DontWork',
    durationMs: 45_000,
  },
  {
    key: 'Surfer',
    i18nKey: 'Surfer',
    hintI18nKey: 'Surfer',
    durationMs: 35_000,
  },
  {
    key: 'DanceBeat',
    i18nKey: 'DanceBeat',
    hintI18nKey: 'DanceBeat',
    durationMs: 35_000,
  },
  {
    key: 'JeffreySurfer',
    i18nKey: 'JeffreySurfer',
    hintI18nKey: 'JeffreySurfer',
    durationMs: 60_000,
  },
];

/** Сколько минок в одной сессии. */
const SESSION_LENGTH = 4;

/**
 * Генерирует уникальную случайную последовательность из 4 мини-игр.
 * Гарантия: внутри одной сессии мини-игры не повторяются.
 */
export function generateSessionSequence(): MinigameMeta[] {
  const shuffled = [...MINIGAME_POOL];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled.slice(0, SESSION_LENGTH);
}
