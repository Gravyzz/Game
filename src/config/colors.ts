/**
 * Фирменная палитра Make Love Adventures.
 * Используется во всех сценах — ни одного хардкода #FF2E2E где-то ещё.
 */

export const COLORS = {
  // Основные
  red:    0xff2e2e, // Make Love red, action, акценты
  black:  0x0a0a0a, // фон, основной текст
  cream:  0xfaf7f0, // тёплый бежевый фон-постер, светлый текст

  // Акценты
  yellow: 0xffe600, // награды, призы, восклицания
  purple: 0x7a5cff, // космос-сцены, лайт-акценты

  // Вспомогательные
  greyDark:  0x1a1a1a,
  greyMid:   0x444444,
  greyLight: 0x9a9a9a,

  // Семантика геймплея
  win:  0x4ade80, // победа
  lose: 0xef4444, // поражение
} as const;

/** То же самое, но строками для CSS/HTML контекста */
export const HEX = {
  red:    '#FF2E2E',
  black:  '#0A0A0A',
  cream:  '#FAF7F0',
  yellow: '#FFE600',
  purple: '#7A5CFF',
  greyDark:  '#1A1A1A',
  greyMid:   '#444444',
  greyLight: '#9A9A9A',
  win:  '#4ADE80',
  lose: '#EF4444',
} as const;
