import Phaser from 'phaser';

/**
 * Глобальная pub/sub шина событий.
 * Используется для коммуникации между сценами и подсистемами,
 * когда напрямую через Phaser scene API неудобно (например,
 * минка → раннер не знают друг о друге напрямую).
 *
 * Зарегистрированные события:
 *   'minigame:complete' { outcome, score, metadata } — минка закончилась
 *   'session:start'                                  — началась новая сессия
 *   'session:end'    { outcome, prize? }             — сессия завершилась
 *   'analytics'      { name, payload }               — событие для будущей аналитики
 */
export const EventBus = new Phaser.Events.EventEmitter();
