import { COLORS } from '@config/colors';
import { RU } from '@i18n/ru';
import type { PrizeWon } from '@core/SessionState';

/**
 * Призовой пул и весовая таблица.
 *
 * Решение из Phase 2:
 *  - 8 секторов на колесе (фиксировано — каждый приз = свой сектор)
 *  - 4 тира редкости: common / rare / epic / legendary
 *  - веса меняются по уровню сессии (чем выше — тем жирнее призы вероятнее)
 *
 * Чтобы поменять призы — правишь только этот файл и i18n/ru.ts.
 */

export type PrizeTier = 'common' | 'rare' | 'epic' | 'legendary';

export interface PrizeDef {
  id: string;
  i18nKey: string;
  tier: PrizeTier;
  /** Шаблон промокода — реальная подстановка в Phase 4.7 (или мок-строка) */
  promoCode?: string;
  /** Цвет фона сектора */
  color: number;
  /** Цвет текста на секторе (контрастный к цвету фона) */
  textColor: string;
  /** Эмодзи-иконка для сектора */
  icon: string;
}

/**
 * 8 призов. Порядок здесь = порядок секторов на колесе по часовой стрелке от 0°.
 * Тиры распределены так, чтобы соседние секторы редко были одинакового цвета —
 * визуально колесо «играет» лучше, и это снижает риск ошибки восприятия
 * («я думал выпала жёлтая, а это была другая жёлтая»).
 */
export const PRIZE_POOL: PrizeDef[] = [
  { id: 'nyamki50',     i18nKey: 'nyamki50',     tier: 'common',    color: COLORS.red,       textColor: '#FAF7F0', icon: '🍕' },
  { id: 'promo10',      i18nKey: 'promo10',      tier: 'common',    color: COLORS.cream,     textColor: '#0A0A0A', icon: '🎟️', promoCode: 'LOVE10' },
  { id: 'sauceFree',    i18nKey: 'sauceFree',    tier: 'common',    color: COLORS.purple,    textColor: '#FAF7F0', icon: '🥫', promoCode: 'SAUCE' },
  { id: 'life',         i18nKey: 'life',         tier: 'common',    color: COLORS.yellow,    textColor: '#0A0A0A', icon: '❤️' },
  { id: 'nyamki100',    i18nKey: 'nyamki100',    tier: 'rare',      color: COLORS.black,     textColor: '#FFE600', icon: '💯' },
  { id: 'promo20',      i18nKey: 'promo20',      tier: 'rare',      color: COLORS.cream,     textColor: '#FF2E2E', icon: '🎫', promoCode: 'LOVE20' },
  { id: 'oldscoolFree', i18nKey: 'oldscoolFree', tier: 'epic',      color: COLORS.red,       textColor: '#FFE600', icon: '🎸', promoCode: 'OLDSCHOOL' },
  { id: 'jackpot',      i18nKey: 'jackpot',      tier: 'legendary', color: COLORS.black,     textColor: '#FFE600', icon: '🤖', promoCode: 'NEROBOT' },
];

/**
 * Веса призов по тиру для каждого уровня сессии.
 * Считаем СУММУ (не нормированы) — нормировка делается в weightedPick.
 *
 * Уровень 1: почти всегда common, изредка rare, очень редко epic.
 * Уровень 2: common ослаблен, rare поднялся, epic уверенно появляется.
 * Уровень 3: rare уже почти равен common, epic 20%, legendary 5%.
 * Уровень 4 (джекпот): common минимум, легендарка 20%.
 */
export const WEIGHTS_BY_LEVEL: Record<1 | 2 | 3 | 4, Record<PrizeTier, number>> = {
  1: { common: 80, rare: 18, epic: 2,  legendary: 0 },
  2: { common: 60, rare: 30, epic: 9,  legendary: 1 },
  3: { common: 35, rare: 40, epic: 20, legendary: 5 },
  4: { common: 10, rare: 30, epic: 40, legendary: 20 },
};

/**
 * Конвертирует PrizeDef → PrizeWon (то, что кладём в SessionState).
 */
export function toWonPrize(def: PrizeDef): PrizeWon {
  return {
    id: def.id,
    label: RU.prizes[def.i18nKey] ?? def.id,
    tier: def.tier,
    promoCode: def.promoCode,
  };
}

/**
 * Взвешенный выбор приза для уровня.
 *
 * Алгоритм:
 *  1. Для каждого приза в пуле берём вес из WEIGHTS_BY_LEVEL по его тиру.
 *  2. Если у тира на этом уровне вес 0 — приз не может выпасть.
 *  3. Внутри тира все призы равновероятны.
 *
 * Возвращает индекс в PRIZE_POOL — нужен, чтобы знать, на каком секторе
 * остановить колесо.
 */
export function pickPrizeIndex(level: 1 | 2 | 3 | 4): number {
  const weights = WEIGHTS_BY_LEVEL[level];

  // Считаем эффективный вес каждого приза
  const effective: number[] = PRIZE_POOL.map((p) => weights[p.tier]);

  // Чтобы внутри тира равновероятно — делим вес тира на кол-во призов этого тира
  const tierCounts: Record<PrizeTier, number> = { common: 0, rare: 0, epic: 0, legendary: 0 };
  for (const p of PRIZE_POOL) tierCounts[p.tier]++;
  for (let i = 0; i < PRIZE_POOL.length; i++) {
    const tier = PRIZE_POOL[i].tier;
    effective[i] = weights[tier] / Math.max(1, tierCounts[tier]);
  }

  const total = effective.reduce((a, b) => a + b, 0);
  if (total <= 0) {
    // Подстраховка от кривого конфига — берём первый common
    return PRIZE_POOL.findIndex((p) => p.tier === 'common');
  }

  let r = Math.random() * total;
  for (let i = 0; i < effective.length; i++) {
    r -= effective[i];
    if (r <= 0) return i;
  }
  return effective.length - 1;
}
