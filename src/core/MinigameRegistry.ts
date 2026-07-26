/**
 * Реестр активных мини-игр Make Love Adventures.
 *
 * Сессия состоит из 4 разных мини-игр. На старте сессии раннер тасует
 * активный пул и берёт первые 4 позиции без повторов.
 *
 * Чтобы добавить новую мини-игру:
 *   1. Создай scene-класс extends BaseMinigame в src/minigames/MyGame/index.ts
 *   2. Зарегистрируй scene в src/main.ts
 *   3. Добавь запись в MINIGAME_POOL
 *   4. Добавь строки в src/i18n/ru.ts: names, hints, guides
 */

export interface MinigameMeta {
  /** Уникальный ключ. Также используется как Phaser scene key. */
  key: string;
  /** Ключ имени в RU.minigame.names. */
  i18nKey: string;
  /** Ключ короткой подсказки в RU.minigame.hints. */
  hintI18nKey: string;
  /** Рекомендованная длительность мини-игры в миллисекундах. */
  durationMs: number;
}

/** Фиксированная сложность: мини-игры сами масштабируют прогрессию внутри себя. */
export const MINIGAME_DIFFICULTY = 0.5;

/** Активный пул мини-игр для Play и Mini Games. */
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

/** Сколько мини-игр входит в одну сессию. */
const SESSION_LENGTH = 4;

export function pickOneFromRemaining(remaining: MinigameMeta[]): MinigameMeta {
  if (remaining.length <= 0) {
    throw new Error('Cannot pick a minigame from an empty pool.');
  }

  const index = Math.floor(Math.random() * remaining.length);
  const picked = remaining[index];
  if (!picked) {
    throw new Error(`Minigame pick failed at index ${index}.`);
  }

  remaining.splice(index, 1);
  return picked;
}

/**
 * Генерирует уникальную случайную последовательность для одной сессии.
 * Внутри одной сессии мини-игры не повторяются.
 */
export function generateSessionSequence(): MinigameMeta[] {
  const remaining = [...MINIGAME_POOL];
  const sequence: MinigameMeta[] = [];

  while (sequence.length < SESSION_LENGTH && remaining.length > 0) {
    sequence.push(pickOneFromRemaining(remaining));
  }

  if (import.meta.env.DEV) {
    console.info(
      '[Minigames] session sequence:',
      sequence.map((meta, idx) => `${idx + 1}:${meta.key}`).join(' -> '),
    );
  }

  return sequence;
}
