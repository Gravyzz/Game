import Phaser from 'phaser';
import { COLORS } from '@config/colors';
import { GAME, DEPTH } from '@config/game';
import { RU } from '@i18n/ru';
import { EventBus } from '@core/EventBus';
import { SessionState } from '@core/SessionState';
import { GameState } from '@core/GameState';
import { TicketProvider } from '@core/TicketProvider';
import { getDifficultyForLevel } from '@core/MinigameRegistry';
import type { MinigameInitData, MinigameResult } from '@minigames/BaseMinigame';

const PIXEL_FONT = '"Press Start 2P", monospace';

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

      // Прогресс между сессиями не сохраняется — игрок всегда начинает с 1-го слота
      // со свежими жизнями. Поле GameState.progressLevel оставлено под лидерборд.
      SessionState.startSession(1);
    }

    if (SessionState.getLivesLeft() <= 0) {
      SessionState.endSession('lose');
      TicketProvider.reportSessionEnd('lose', { failedAtLevel: SessionState.getCurrentLevel() });
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

    // Атмосферный фон пиццерии
    const bg = this.add.image(WIDTH / 2, HEIGHT / 2, 'play-interlevel-bg');
    bg.setOrigin(0.5);
    bg.setScale(Math.max(WIDTH / bg.width, HEIGHT / bg.height));
    bg.setDepth(DEPTH.background);
    this.add.rectangle(WIDTH / 2, HEIGHT / 2, WIDTH, HEIGHT, COLORS.black, 0.16)
      .setDepth(DEPTH.background + 1);

    // Уровень
    const levelPanel = this.createPixelPanel(
      WIDTH / 2,
      HEIGHT * 0.62,
      `${RU.choice.levelLabel} ${level} / 4`,
      {
        bgColor: 0x171717,
        textColor: '#FAF7F0',
        fontSize: '22px',
        paddingX: 18,
        paddingY: 8,
        strokeColor: 0xfaf7f0,
        strokeAlpha: 0.25,
      }
    );
    levelPanel.setAlpha(0);
    levelPanel.setDepth(DEPTH.ui);

    // Название минки
    const namePanel = this.createPixelPanel(
      WIDTH / 2,
      HEIGHT * 0.69,
      RU.minigame.names[meta.i18nKey] ?? meta.key,
      {
        bgColor: 0xd8323f,
        textColor: '#FAF7F0',
        fontSize: '36px',
        paddingX: 28,
        paddingY: 18,
        strokeColor: 0x0a0a0a,
      }
    );
    namePanel.setAlpha(0);
    namePanel.setDepth(DEPTH.ui);

    // Хинт-стикер
    const hintPanel = this.createPixelPanel(
      WIDTH / 2,
      HEIGHT * 0.77,
      RU.minigame.hints[meta.hintI18nKey] ?? '',
      {
        bgColor: 0xffd228,
        textColor: '#0A0A0A',
        fontSize: '22px',
        paddingX: 22,
        paddingY: 12,
        strokeColor: 0x0a0a0a,
      }
    );
    hintPanel.setAlpha(0);
    hintPanel.setDepth(DEPTH.ui);

    // «ПОЕХАЛИ!» внизу
    const goPanel = this.createPixelPanel(WIDTH / 2, HEIGHT * 0.84, RU.minigame.starting, {
      bgColor: 0x171717,
      bgAlpha: 0.76,
      textColor: '#FFE600',
      fontSize: '18px',
      paddingX: 18,
      paddingY: 8,
      strokeColor: 0xffe600,
      strokeAlpha: 0.25,
    });
    goPanel.setAlpha(0);
    goPanel.setDepth(DEPTH.ui);

    // Каскадная анимация появления
    this.tweens.add({ targets: levelPanel, alpha: 1, duration: 250, delay: 100 });
    this.tweens.add({ targets: namePanel, alpha: 1, scale: { from: 0.7, to: 1 }, duration: 350, delay: 250, ease: 'Back.easeOut' });
    this.tweens.add({ targets: hintPanel, alpha: 1, scale: { from: 0.7, to: 1 }, duration: 350, delay: 500, ease: 'Back.easeOut' });
    this.tweens.add({ targets: goPanel, alpha: 1, duration: 250, delay: 800 });

    // Через 1.6 сек запускаем минку
    this.time.delayedCall(1600, () => this.launchMinigame());
  }

  private createPixelPanel(
    x: number,
    y: number,
    text: string,
    options: {
      bgColor: number;
      textColor: string;
      fontSize: string;
      paddingX: number;
      paddingY: number;
      bgAlpha?: number;
      strokeColor?: number;
      strokeAlpha?: number;
    },
  ): Phaser.GameObjects.Container {
    const container = this.add.container(x, y);
    const label = this.add.text(0, 0, text.toUpperCase(), {
      fontFamily: PIXEL_FONT,
      fontSize: options.fontSize,
      color: options.textColor,
      align: 'center',
      wordWrap: { width: GAME.WIDTH - 130 },
    });
    label.setOrigin(0.5);

    const panelW = label.width + options.paddingX * 2;
    const panelH = label.height + options.paddingY * 2;
    const shadow = this.add.rectangle(7, 7, panelW, panelH, 0x000000, 0.7);
    const bg = this.add.rectangle(0, 0, panelW, panelH, options.bgColor, options.bgAlpha ?? 0.96);
    bg.setStrokeStyle(5, options.strokeColor ?? 0x0a0a0a, options.strokeAlpha ?? 1);

    container.add([shadow, bg, label]);
    return container;
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

    // Принудительно гасим scene минки СРАЗУ, не дожидаясь её собственного
    // delayedCall(0)→scene.stop(). Иначе на пути «win L4 → WheelScene jackpot»
    // launched-сцена ещё активна во время старта WheelScene и её input-плагин
    // перехватывает первый клик по кнопке КРУТИ.
    if (result.sceneKey && this.scene.isActive(result.sceneKey)) {
      this.scene.stop(result.sceneKey);
    }

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
      // Игрок нажал «домой» из минки — сессия закрывается, минуем advance/жизни.
      const aborted = result.metadata?.aborted === true;
      if (aborted) {
        SessionState.endSession('lose');
        TicketProvider.reportSessionEnd('lose', { aborted: true });
        this.transitionTo('SplashScene');
        return;
      }

      const lifeAlreadyLost = result.metadata?.lifeAlreadyLost === true;
      const livesLeft = lifeAlreadyLost ? SessionState.getLivesLeft() : SessionState.loseLife();

      // Любую минку играем не более одного раза за сессию: на провале
      // переходим к СЛЕДУЮЩЕМУ слоту, а не повторяем эту же.
      if (livesLeft > 0) {
        this.transitionTo('MinigameRunnerScene');
        return;
      }

      // Жизни закончились — сессия окончена.
      SessionState.endSession('lose');
      TicketProvider.reportSessionEnd('lose', { failedAtLevel: SessionState.getCurrentLevel() });
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
