import { StubMinigame } from '@minigames/StubMinigame';
import { COLORS } from '@config/colors';

/**
 * MG-02 Донтворк: Расколбас выходных.
 * 2-й уровень сессии. Свайп-слайсер по дедлайнам и письмам.
 *
 * Сейчас — заглушка для тестирования флоу.
 */
export class DontWorkScene extends StubMinigame {
  constructor() {
    super('DontWork', COLORS.purple, COLORS.yellow);
  }

  protected getDecorEmoji(): string {
    return '✂️';
  }
}
