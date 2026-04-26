/**
 * Базовый конфиг игры.
 * Дизайн ведём в виртуальном холсте 720x1280 (9:16).
 * Phaser FIT-режим масштабирует под реальный экран автоматически.
 */

export const GAME = {
  /** Виртуальный холст для дизайна. Все координаты — в этих единицах */
  WIDTH:  720,
  HEIGHT: 1280,

  /** Соотношение сторон (для проверки на ориентацию) */
  ASPECT_RATIO: 9 / 16,

  /** Целевой FPS на средних андроидах */
  TARGET_FPS: 60,

  /** Включаем дебаг-плашки в dev-режиме */
  DEBUG: import.meta.env.DEV,
} as const;

/** Z-index слоёв (для Phaser depth) */
export const DEPTH = {
  background:  0,
  midground:   10,
  gameplay:    20,
  effects:     30,
  ui:          40,
  modal:       50,
  toast:       60,
} as const;
