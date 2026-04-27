import type { SessionLevel } from '@core/SessionState';

/**
 * Реестр всех минок Make Love Adventures.
 *
 * Порядок здесь = порядок прохождения в сессии:
 *   уровень 1 → minigamesByLevel[1]
 *   уровень 2 → minigamesByLevel[2]
 *   и т.д.
 *
 * Меняешь порядок — меняется драматургия сессии (с какой минки начинается,
 * какая в кульминации перед джекпотом).
 *
 * Чтобы добавить новую минку:
 *   1. Создай scene-класс extends BaseMinigame в src/minigames/MyGame/index.ts
 *   2. Импортируй сюда
 *   3. Добавь в массив minigamesOrder
 *   4. Добавь в массив для регистрации в Phaser в main.ts
 */

export interface MinigameMeta {
  /** Уникальный ключ — также используется как Phaser scene key */
  key: string;
  /** Имя для UI (берётся из i18n.minigame.names[key]) */
  i18nKey: string;
  /** Хинт-стикер перед запуском (берётся из i18n.minigame.hints[key]) */
  hintI18nKey: string;
  /** Длительность раунда в мс — рекомендация для минки */
  durationMs: number;
}

/**
 * Порядок минок в сессии.
 * 1-я: лёгкий вход (FireStarter — один тап).
 * 2-я: средний драйв (DontWork — слайсер).
 * 3-я: ритм-челлендж (RhythmBattle — флагман, кульминация).
 * 4-я: финальный спринт (NightDelivery — runner перед джекпотом).
 *
 * Можно перетасовать после плейтестов.
 */
export const MINIGAME_ORDER: MinigameMeta[] = [
  {
    key: 'FireStarter',
    i18nKey: 'FireStarter',
    hintI18nKey: 'FireStarter',
    durationMs: 30000,
  },
  {
    key: 'DontWork',
    i18nKey: 'DontWork',
    hintI18nKey: 'DontWork',
    durationMs: 45000,
  },
  {
    key: 'RhythmBattle',
    i18nKey: 'RhythmBattle',
    hintI18nKey: 'RhythmBattle',
    durationMs: 35000,
  },
  {
    key: 'NightDelivery',
    i18nKey: 'NightDelivery',
    hintI18nKey: 'NightDelivery',
    durationMs: 45000,
  },
];

/** Получить минку для конкретного уровня сессии (1..4) */
export function getMinigameForLevel(level: SessionLevel): MinigameMeta {
  // level 1..4 → массив 0..3
  return MINIGAME_ORDER[level - 1];
}

/** Сложность 0..1 для конкретного уровня (равномерное возрастание) */
export function getDifficultyForLevel(level: SessionLevel): number {
  // 1 → 0.25, 2 → 0.5, 3 → 0.75, 4 → 1.0
  return level / 4;
}
