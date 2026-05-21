import { COLORS } from '@config/colors';
import { RU } from '@i18n/ru';
import type { PrizeWon } from '@core/SessionState';

/**
 * ╔══════════════════════════════════════════════════════════════════════╗
 * ║  ПРИЗОВОЙ КАТАЛОГ + ПО-УРОВНЕВОЕ КОЛЕСО                              ║
 * ║                                                                      ║
 * ║  АДМИН-ГАЙД: см. docs/WHEEL_GUIDE.md                                 ║
 * ║                                                                      ║
 * ║  Структура:                                                          ║
 * ║   • PRIZE_CATALOG — все призы в проекте (по id), визуал и метадата.  ║
 * ║   • WHEEL_BY_LEVEL — какие 8 призов и с какими весами на каждом      ║
 * ║     уровне сессии (1..4).                                            ║
 * ║                                                                      ║
 * ║  Бизнес-логика веса (пицца-friendly):                                ║
 * ║   • Уровень 1: «ходовые» дешёвые призы доминируют.                   ║
 * ║   • Уровень 2: топ-2 ходовых уходят, редкие из L1 учащаются,         ║
 * ║                добавляются 2 новых редких.                           ║
 * ║   • Уровень 3: тот же сдвиг — топ-2 уходят, редкие учащаются.        ║
 * ║   • Уровень 4 (джекпот): только дорогие призы.                       ║
 * ╚══════════════════════════════════════════════════════════════════════╝
 */

export type PrizeTier = 'common' | 'rare' | 'epic' | 'legendary';

export interface PrizeDef {
  /** Уникальный id — связывает PRIZE_CATALOG и WHEEL_BY_LEVEL. */
  id: string;
  /** Ключ в `RU.prizes` для красивого названия (на экране результата). */
  i18nKey: string;
  /** Короткая подпись на сектор колеса (без эмодзи). */
  displayLabel: string;
  tier: PrizeTier;
  /** Шаблон промокода — реальная подстановка в Phase 4.7 (или мок). */
  promoCode?: string;
  /** Цвет фона сектора. */
  color: number;
  /** Цвет текста на секторе (контрастный к color). */
  textColor: string;
  /** Эмодзи-иконка для сектора. */
  icon: string;
}

/**
 * Катало́г всех призов проекта. Чтобы добавить новый — добавь сюда + строку
 * в `RU.prizes` (i18n/ru.ts), потом вставь его id в WHEEL_BY_LEVEL.
 */
export const PRIZE_CATALOG: PrizeDef[] = [
  // === common: дешёвые ===
  { id: 'prize-1',  i18nKey: 'prize1',  displayLabel: 'ПРИЗ 1',  tier: 'common',    color: COLORS.red,    textColor: '#FAF7F0', icon: '🍕' },
  { id: 'prize-2',  i18nKey: 'prize2',  displayLabel: 'ПРИЗ 2',  tier: 'common',    color: COLORS.cream,  textColor: '#0A0A0A', icon: '🎟️', promoCode: 'LOVE10' },
  { id: 'prize-3',  i18nKey: 'prize3',  displayLabel: 'ПРИЗ 3',  tier: 'common',    color: COLORS.purple, textColor: '#FAF7F0', icon: '🥫', promoCode: 'SAUCE' },
  { id: 'prize-4',  i18nKey: 'prize4',  displayLabel: 'ПРИЗ 4',  tier: 'common',    color: COLORS.yellow, textColor: '#0A0A0A', icon: '❤️' },

  // === rare: средние ===
  { id: 'prize-5',  i18nKey: 'prize5',  displayLabel: 'ПРИЗ 5',  tier: 'rare',      color: 0x4ade80,      textColor: '#0A0A0A', icon: '🥤', promoCode: 'DRINK' },
  { id: 'prize-6',  i18nKey: 'prize6',  displayLabel: 'ПРИЗ 6',  tier: 'rare',      color: COLORS.cream,  textColor: '#FF2E2E', icon: '🎫', promoCode: 'LOVE20' },
  { id: 'prize-7',  i18nKey: 'prize7',  displayLabel: 'ПРИЗ 7',  tier: 'rare',      color: 0xe8794a,      textColor: '#FAF7F0', icon: '🍟', promoCode: 'FRIES' },
  { id: 'prize-8',  i18nKey: 'prize8',  displayLabel: 'ПРИЗ 8',  tier: 'rare',      color: COLORS.black,  textColor: '#FFE600', icon: '💯' },

  // === epic: ценные ===
  { id: 'prize-9',  i18nKey: 'prize9',  displayLabel: 'ПРИЗ 9',  tier: 'epic',      color: 0x6b5cff,      textColor: '#FFE600', icon: '🍰', promoCode: 'DESSERT' },
  { id: 'prize-10', i18nKey: 'prize10', displayLabel: 'ПРИЗ 10', tier: 'epic',      color: 0xff8a3d,      textColor: '#FAF7F0', icon: '🍔', promoCode: 'BURGER' },
  { id: 'prize-11', i18nKey: 'prize11', displayLabel: 'ПРИЗ 11', tier: 'epic',      color: COLORS.red,    textColor: '#FFE600', icon: '🎁', promoCode: 'GIFT30' },
  { id: 'prize-12', i18nKey: 'prize12', displayLabel: 'ПРИЗ 12', tier: 'epic',      color: 0x3c3a8c,      textColor: '#FAF7F0', icon: '🎸', promoCode: 'OLDSCHOOL' },

  // === legendary: эксклюзивы (только на джекпот-уровне) ===
  { id: 'prize-13', i18nKey: 'prize13', displayLabel: 'ПРИЗ 13', tier: 'legendary', color: 0xffd60a,      textColor: '#0A0A0A', icon: '👑', promoCode: 'CROWN' },
  { id: 'prize-14', i18nKey: 'prize14', displayLabel: 'ПРИЗ 14', tier: 'legendary', color: COLORS.black,  textColor: '#FFE600', icon: '🤖', promoCode: 'NEROBOT' },
];

/**
 * Один слот на колесе уровня: id приза из PRIZE_CATALOG + вес.
 * Вес — относительный (8:4:2:1 эквивалентно 80:40:20:10).
 */
export interface WheelSlot {
  prizeId: string;
  weight:  number;
}

/**
 * Конфиг колеса для каждого из 4 уровней сессии.
 * Длина массива = число секторов на колесе (рекомендуется 8 для красивого
 * рендера, но движок поддерживает любое 6..10).
 *
 * Чтобы поменять призы или вероятности — правишь ТОЛЬКО эту таблицу.
 * Каждая строка — отдельный сектор; порядок сверху-вниз = порядок секторов
 * по часовой стрелке от 12 часов.
 */
export const WHEEL_BY_LEVEL: Record<1 | 2 | 3 | 4, WheelSlot[]> = {
  // Уровень 1: дешёвые призы доминируют, редкие почти не выпадают.
  1: [
    { prizeId: 'prize-1',  weight: 32 },  // топ-1 ходовой → исчезнет в L2
    { prizeId: 'prize-2',  weight: 28 },  // топ-2 ходовой → исчезнет в L2
    { prizeId: 'prize-3',  weight: 14 },
    { prizeId: 'prize-4',  weight: 10 },
    { prizeId: 'prize-5',  weight: 7 },   // редкий → в L2 чаще
    { prizeId: 'prize-6',  weight: 5 },
    { prizeId: 'prize-7',  weight: 3 },
    { prizeId: 'prize-8',  weight: 1 },   // самый редкий
  ],

  // Уровень 2: prize-1, prize-2 ушли. Редкие prize-5/6/7/8 — стали чаще.
  // Появились 2 новых редких prize-9, prize-10.
  2: [
    { prizeId: 'prize-3',  weight: 26 },  // популярный → исчезнет в L3
    { prizeId: 'prize-4',  weight: 22 },  // популярный → исчезнет в L3
    { prizeId: 'prize-5',  weight: 18 },
    { prizeId: 'prize-6',  weight: 14 },
    { prizeId: 'prize-7',  weight: 10 },
    { prizeId: 'prize-8',  weight: 6 },
    { prizeId: 'prize-9',  weight: 3 },   // новый редкий
    { prizeId: 'prize-10', weight: 1 },   // новый редкий
  ],

  // Уровень 3: prize-3, prize-4 ушли. Редкие учащаются. Появились
  // 2 новых редких prize-11, prize-12.
  3: [
    { prizeId: 'prize-5',  weight: 24 },
    { prizeId: 'prize-6',  weight: 22 },
    { prizeId: 'prize-7',  weight: 18 },
    { prizeId: 'prize-8',  weight: 14 },
    { prizeId: 'prize-9',  weight: 10 },
    { prizeId: 'prize-10', weight: 6 },
    { prizeId: 'prize-11', weight: 4 },   // новый редкий
    { prizeId: 'prize-12', weight: 2 },   // новый редкий
  ],

  // Уровень 4 (джекпот): только дорогие призы.
  // prize-5, prize-6 ушли, добавились prize-13, prize-14 (legendary).
  4: [
    { prizeId: 'prize-7',  weight: 8 },
    { prizeId: 'prize-8',  weight: 12 },
    { prizeId: 'prize-9',  weight: 18 },
    { prizeId: 'prize-10', weight: 20 },
    { prizeId: 'prize-11', weight: 18 },
    { prizeId: 'prize-12', weight: 14 },
    { prizeId: 'prize-13', weight: 7 },   // легендарный
    { prizeId: 'prize-14', weight: 3 },   // легендарный эксклюзив
  ],
};

/** Описание одного приза, как он лежит на колесе конкретного уровня. */
export interface WheelPrize {
  /** Полное описание из PRIZE_CATALOG. */
  def:    PrizeDef;
  /** Индекс сектора (0..N-1) на колесе уровня. */
  index:  number;
  /** Вес в выборке. */
  weight: number;
}

/**
 * Собирает колесо для уровня: 8 призов в порядке секторов.
 * Бросает ошибку, если в WHEEL_BY_LEVEL указан несуществующий prizeId —
 * это намеренно, чтобы не выкатить кривой конфиг в прод.
 */
export function getWheelForLevel(level: 1 | 2 | 3 | 4): WheelPrize[] {
  return WHEEL_BY_LEVEL[level].map((slot, index) => {
    const def = PRIZE_CATALOG.find((p) => p.id === slot.prizeId);
    if (!def) throw new Error(`[prizes] id "${slot.prizeId}" не найден в PRIZE_CATALOG (level ${level}, slot ${index})`);
    return { def, index, weight: slot.weight };
  });
}

/** Конвертирует PrizeDef → PrizeWon (то, что кладём в SessionState). */
export function toWonPrize(def: PrizeDef): PrizeWon {
  return {
    id: def.id,
    label: RU.prizes[def.i18nKey] ?? def.id,
    tier: def.tier,
    promoCode: def.promoCode,
  };
}

/**
 * Взвешенный выбор сектора для уровня. Возвращает индекс сектора (0..N-1)
 * в массиве, который возвращает `getWheelForLevel(level)`.
 */
export function pickPrizeIndex(level: 1 | 2 | 3 | 4): number {
  const wheel = getWheelForLevel(level);
  const total = wheel.reduce((sum, p) => sum + p.weight, 0);
  if (total <= 0) {
    console.warn(`[prizes] суммарный вес на уровне ${level} = 0; возвращаю сектор 0`);
    return 0;
  }
  let r = Math.random() * total;
  for (let i = 0; i < wheel.length; i++) {
    r -= wheel[i].weight;
    if (r <= 0) return i;
  }
  return wheel.length - 1;
}

/**
 * Джекпот-выбор для уровня 4: гарантированно legendary, если есть в пуле;
 * иначе — самый дорогой epic. Веса игнорируем — здесь нужно «вау».
 */
export function pickJackpotIndex(level: 1 | 2 | 3 | 4 = 4): number {
  const wheel = getWheelForLevel(level);
  const legendaryIdx = wheel.findIndex((p) => p.def.tier === 'legendary');
  if (legendaryIdx >= 0) return legendaryIdx;
  const epicIdx = wheel.findIndex((p) => p.def.tier === 'epic');
  if (epicIdx >= 0) return epicIdx;
  return 0;
}
