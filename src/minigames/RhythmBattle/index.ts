import { StubMinigame } from '@minigames/StubMinigame';
import { COLORS } from '@config/colors';

/**
 * MG-01 ⭐ ФЛАГМАН: Олдскул vs Шокинг Блю.
 * 3-й уровень сессии — кульминация.
 * Рит-механика: ноты падают по двум дорожкам, тапаешь в ритм по своей стороне.
 *
 * Сейчас — заглушка. В Phase 4.4 будет полная реализация:
 * - 2 дорожки (Олдскул слева, Шокинг Блю справа)
 * - паттерн нот с возрастающим темпом
 * - HitDetector с окном попадания ±150мс
 * - комбо-счётчик
 * - визуал «рок-сцены»
 */
export class RhythmBattleScene extends StubMinigame {
  constructor() {
    super('RhythmBattle', COLORS.black, COLORS.red);
  }

  protected getDecorEmoji(): string {
    return '🎸';
  }
}
