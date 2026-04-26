/**
 * Шрифтовые пресеты.
 * Unbounded — постерные заголовки (жирный италик).
 * Onest — UI и body-текст.
 */

export const FONTS = {
  poster: 'Unbounded, sans-serif',
  ui:     'Onest, system-ui, sans-serif',
} as const;

/** Стили для Phaser Text — чтобы не дублировать конфиги по сценам */
export const TEXT_STYLES = {
  // Гигантский постерный заголовок (Splash, экраны побед)
  hero: {
    fontFamily: FONTS.poster,
    fontSize: '64px',
    fontStyle: 'italic 900',
    color: '#FAF7F0',
  },

  // Постерный заголовок поменьше
  title: {
    fontFamily: FONTS.poster,
    fontSize: '40px',
    fontStyle: 'italic 800',
    color: '#FAF7F0',
  },

  // Подзаголовок
  subtitle: {
    fontFamily: FONTS.poster,
    fontSize: '24px',
    fontStyle: 'italic 600',
    color: '#FAF7F0',
  },

  // Текст для кнопок
  button: {
    fontFamily: FONTS.poster,
    fontSize: '22px',
    fontStyle: 'italic 800',
    color: '#0A0A0A',
  },

  // Body / описания
  body: {
    fontFamily: FONTS.ui,
    fontSize: '18px',
    fontStyle: 'normal 400',
    color: '#FAF7F0',
    wordWrap: { width: 320 },
    align: 'center',
  },

  // Мелкий лейбл
  label: {
    fontFamily: FONTS.ui,
    fontSize: '14px',
    fontStyle: 'normal 600',
    color: '#9A9A9A',
  },
} as const;
