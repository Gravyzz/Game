import { StubMinigame } from '@minigames/StubMinigame';
import { COLORS } from '@config/colors';

/**
 * MG-03 Доставка под Black Keys: Ночной Томск.
 * 4-й уровень — финальный спринт перед джекпотом.
 * Endless-runner: скутер с термосумкой, свайпы вверх/вниз.
 *
 * Сейчас — заглушка для тестирования флоу.
 */
export class NightDeliveryScene extends StubMinigame {
  constructor() {
    super('NightDelivery', COLORS.greyDark, COLORS.purple);
  }

  protected getDecorEmoji(): string {
    return '🛵';
  }
}
