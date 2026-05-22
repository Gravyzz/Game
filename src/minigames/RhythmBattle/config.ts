/**
 * Конфиг рит-минки «Олдскул vs Шокинг Блю».
 *
 * Без аудио в Phase 4.4 — играем по чистому таймеру (BPM как абстрактная единица темпа).
 * В Phase 4.5 здесь же привяжемся к Web Audio (AudioContext.currentTime) для честной синхронизации.
 */

/** Дорожки — у каждой свой персонаж */
export type Lane = 'left' | 'right';

/** Качество попадания */
export type HitQuality = 'perfect' | 'good' | 'miss';

/** Одна нота в паттерне */
export interface Note {
  /** Время появления у hit-line, в мс от старта раунда */
  timeMs: number;
  lane: Lane;
}

/**
 * Окна попадания (в мс от целевого времени ноты).
 * iOS Safari иногда добавляет ~50мс задержку на тач — окна щедрые.
 */
export const HIT_WINDOWS = {
  perfect: 80,   // ±80мс — идеал
  good:    160,  // ±160мс — норм
  // больше → miss
} as const;

/** Сколько мс нота летит сверху вниз до hit-line */
export const NOTE_TRAVEL_MS = 1400;

/** Длительность раунда в мс. Должна совпадать с durationMs в registry */
export const ROUND_DURATION_MS = 50_000;

/** Стартовое значение «баттл-метра» (0..1) — 0.5 равновесие */
export const BATTLE_METER_START = 0.5;

/** Сдвиг баттл-метра за каждый исход */
export const METER_DELTA = {
  perfect: +0.06,
  good:    +0.04,
  miss:    -0.05,
} as const;

/** Очки за каждый исход (для аналитики) */
export const SCORE_DELTA = {
  perfect: 100,
  good:    60,
  miss:    -20,
} as const;

/**
 * Генератор паттерна.
 *
 * difficulty 0..1 управляет:
 *  - плотностью нот (интервал между ними)
 *  - вероятностью двойных ударов (одновременно лево+право)
 *  - стартовым «спокойным» промежутком
 *
 * В активной сессии difficulty фиксированная, поэтому паттерн не усложняется
 * от номера слота 1..4.
 */
export function generatePattern(difficulty: number, durationMs: number): Note[] {
  const notes: Note[] = [];

  // Стартовый интервал между нотами в мс. Чем выше сложность — тем плотнее.
  // 0.0 → 700мс, 0.5 → 560мс, 1.0 → 420мс
  const baseIntervalMs = 700 - difficulty * 280;

  // Шанс двойного удара (одновременно лево+право)
  const doubleChance = 0.05 + difficulty * 0.15;

  // Первые 1500мс — пустые, чтобы игрок успел сориентироваться
  let t = 1800;

  // Псевдо-рандом с фиксированным сидом — паттерн воспроизводимый
  let seed = 0x9e3779b1 ^ Math.floor(difficulty * 1000);
  const rand = () => {
    seed = (seed * 1664525 + 1013904223) | 0;
    return ((seed >>> 0) / 0xffffffff);
  };

  let lastLane: Lane = 'left';

  while (t < durationMs - 1500) {
    // Лёгкая вариация интервала ±15% — чтобы не звучало как метроном
    const variation = 1 + (rand() - 0.5) * 0.3;
    const interval = baseIntervalMs * variation;

    // Чередуем дорожки чаще, чтобы был «обмен ударами»
    let lane: Lane;
    if (rand() < 0.7) {
      lane = lastLane === 'left' ? 'right' : 'left';
    } else {
      lane = rand() < 0.5 ? 'left' : 'right';
    }
    lastLane = lane;

    notes.push({ timeMs: t, lane });

    // Двойной удар?
    if (rand() < doubleChance) {
      const otherLane: Lane = lane === 'left' ? 'right' : 'left';
      notes.push({ timeMs: t, lane: otherLane });
    }

    t += interval;
  }

  return notes.sort((a, b) => a.timeMs - b.timeMs);
}
