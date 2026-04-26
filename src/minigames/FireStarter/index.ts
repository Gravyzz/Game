import { StubMinigame } from '@minigames/StubMinigame';
import { COLORS } from '@config/colors';

/**
 * MG-04 Фаерстартер: Тайминг печи.
 * 1-й уровень сессии — лёгкий вход.
 * Один тап в нужный момент, чтобы вытащить пиццу.
 *
 * Сейчас — заглушка для тестирования флоу.
 */
export class FireStarterScene extends StubMinigame {
  constructor() {
    super('FireStarter', COLORS.red, COLORS.yellow);
  }

  protected getDecorEmoji(): string {
    return '🔥';
  }
}
