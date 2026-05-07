import Phaser from 'phaser';
import { COLORS } from '@config/colors';
import { TEXT_STYLES } from '@config/fonts';
import { GAME, DEPTH } from '@config/game';
import { RU } from '@i18n/ru';
import { PosterText } from '@ui/PosterText';
import { EventBus } from '@core/EventBus';
import { SessionState } from '@core/SessionState';
import { GameState } from '@core/GameState';
import { TicketProvider } from '@core/TicketProvider';
import { getDifficultyForLevel } from '@core/MinigameRegistry';
import type { MinigameInitData, MinigameResult } from '@minigames/BaseMinigame';

/**
 * Диспетчер минок.
 *
 * Не реализует геймплей сам — только:
 *  1. Показывает короткий «splash» с уровнем и хинтом жеста (~1.5 сек)
 *  2. Запускает scene минки через scene.launch() с MinigameInitData
 *  3. Слушает 'minigame:complete' через EventBus
 *  4. На win  → ChoiceScene (или WheelScene если уровень 4)
 *     На lose → минус глобальная жизнь и повтор текущей минки, пока жизни не кончатся
 */
export class MinigameRunnerScene extends Phaser.Scene {
  private completeHandler: ((result: MinigameResult & { sceneKey: string }) => void) | null = null;

  constructor() {
    super({ key: 'MinigameRunnerScene' });
  }

  create(): void {
    // Если сессия уже активна (после ChoiceScene → continue), просто продолжаем
    if (!SessionState.isActive()) {
      // Защита: сюда нельзя попасть без билета. Но если каким-то образом
      // попали — отправляем на NoTicketScene.
      if (!GameState.hasTicket()) {
        this.scene.start('NoTicketScene');
        return;
      }

      // Списываем билет (одна сессия — один билет)
      GameState.consumeTicket();

      // Стартуем сессию с уровня прогресса (для возобновления через 2 недели)
      const startLevel = GameState.getProgressLevel();
      SessionState.startSession(startLevel);
    }

    if (SessionState.getLivesLeft() <= 0) {
      const currentLevel = SessionState.getCurrentLevel();
      GameState.markProgressOnLose(currentLevel);
      SessionState.endSession('lose');
      TicketProvider.reportSessionEnd('lose', { failedAtLevel: currentLevel });
      this.scene.start('ResultScene', { outcome: 'lose' });
      return;
    }

    this.showHintSplash();
  }

  /** Показываем короткий хинт-сплэш «уровень N: тапай в ритм» перед запуском минки */
  private showHintSplash(): void {
    const { WIDTH, HEIGHT } = GAME;
    const level = SessionState.getCurrentLevel();
    const meta = SessionState.getMinigameAtLevel(level);

    // Чёрный фон
    const bg = this.add.rectangle(WIDTH / 2, HEIGHT / 2, WIDTH, HEIGHT, COLORS.black);
    bg.setDepth(DEPTH.background);

    // Уровень
    const levelText = this.add.text(
      WIDTH / 2,
      HEIGHT / 2 - 100,
      `${RU.choice.levelLabel} ${level} / 4`,
      {
        ...TEXT_STYLES.subtitle,
        fontSize: '22px',
        color: '#FAF7F0',
      }
    );
    levelText.setOrigin(0.5);
    levelText.setAlpha(0);
    levelText.setDepth(DEPTH.ui);

    // Название минки
    const namePoster = new PosterText(
      this,
      WIDTH / 2,
      HEIGHT / 2 - 30,
      RU.minigame.names[meta.i18nKey] ?? meta.key,
      {
        bgColor: COLORS.red,
        textColor: '#FAF7F0',
        fontSize: '36px',
        rotation: -0.025,
        paddingX: 24,
        paddingY: 12,
      }
    );
    namePoster.setDepth(DEPTH.ui);
    namePoster.setAlpha(0);
    this.add.existing(namePoster);

    // Хинт-стикер
    const hintPoster = new PosterText(
      this,
      WIDTH / 2,
      HEIGHT / 2 + 60,
      RU.minigame.hints[meta.hintI18nKey] ?? '',
      {
        bgColor: COLORS.yellow,
        textColor: '#0A0A0A',
        fontSize: '22px',
        rotation: 0.03,
        paddingX: 18,
        paddingY: 8,
      }
    );
    hintPoster.setDepth(DEPTH.ui);
    hintPoster.setAlpha(0);
    this.add.existing(hintPoster);

    // «ПОЕХАЛИ!» внизу
    const goText = this.add.text(WIDTH / 2, HEIGHT / 2 + 160, RU.minigame.starting, {
      ...TEXT_STYLES.subtitle,
      fontSize: '18px',
      color: '#FFE600',
    });
    goText.setOrigin(0.5);
    goText.setAlpha(0);
    goText.setDepth(DEPTH.ui);

    // Каскадная анимация появления
    this.tweens.add({ targets: levelText,  alpha: 1, duration: 250, delay: 100 });
    this.tweens.add({ targets: namePoster, alpha: 1, scale: { from: 0.7, to: 1 }, duration: 350, delay: 250, ease: 'Back.easeOut' });
    this.tweens.add({ targets: hintPoster, alpha: 1, scale: { from: 0.7, to: 1 }, duration: 350, delay: 500, ease: 'Back.easeOut' });
    this.tweens.add({ targets: goText,     alpha: 1, duration: 250, delay: 800 });

    // Через 1.6 сек запускаем минку
    this.time.delayedCall(1600, () => this.launchMinigame());
  }

  /** Запуск scene минки + подписка на результат */
  private launchMinigame(): void {
    if (SessionState.getLivesLeft() <= 0) {
      this.transitionTo('ResultScene', { outcome: 'lose' });
      return;
    }

    const level = SessionState.getCurrentLevel();
    const meta = SessionState.getMinigameAtLevel(level);

    const initData: MinigameInitData = {
      level,
      difficulty: getDifficultyForLevel(level),
      durationMs: meta.durationMs,
    };

    // Подписываемся на результат
    this.completeHandler = (result) => this.onMinigameComplete(result);
    EventBus.once('minigame:complete', this.completeHandler);

    // Скрываем себя и запускаем минку
    this.scene.launch(meta.key, initData);
    this.scene.setVisible(false);
  }

  /** Обработка завершения минки */
  private onMinigameComplete(result: MinigameResult & { sceneKey: string }): void {
    console.log('[Runner] minigame complete:', result);

    if (result.outcome === 'win') {
      SessionState.markLevelWon();

      // Уровень 4 → автоматически джекпот, без выбора
      if (SessionState.getCurrentLevel() >= 4) {
        this.transitionTo('WheelScene', { isJackpot: true });
        return;
      }

      // Иначе — переход на ChoiceScene «крутить или дальше»
      this.transitionTo('ChoiceScene', { wonLevel: SessionState.getCurrentLevel() });
    } else {
      const currentLevel = SessionState.getCurrentLevel();
      const lifeAlreadyLost = result.metadata?.lifeAlreadyLost === true;
      const livesLeft = lifeAlreadyLost ? SessionState.getLivesLeft() : SessionState.loseLife();

      if (livesLeft > 0) {
        const nextLevel = SessionState.advanceLevel();
        if (nextLevel !== null) {
          this.transitionTo('MinigameRunnerScene');
          return;
        }
      }

      // Жизни закончились — конец сессии, без приза.
      // ВАЖНО: фиксируем прогресс на ТЕКУЩЕМ уровне, чтобы при следующем заказе
      // игрок попал именно на эту минку, а не на следующую.
      GameState.markProgressOnLose(currentLevel);
      SessionState.endSession('lose');
      TicketProvider.reportSessionEnd('lose', { failedAtLevel: currentLevel });

      this.transitionTo('ResultScene', { outcome: 'lose' });
    }
  }

  /** Универсальный fade-переход */
  private transitionTo(sceneKey: string, data: object = {}): void {
    this.scene.setVisible(true);
    this.cameras.main.fadeOut(300, 10, 10, 10);
    this.cameras.main.once('camerafadeoutcomplete', () => {
      this.scene.start(sceneKey, data);
    });
  }

  shutdown(): void {
    if (this.completeHandler) {
      EventBus.off('minigame:complete', this.completeHandler);
      this.completeHandler = null;
    }
  }
}
