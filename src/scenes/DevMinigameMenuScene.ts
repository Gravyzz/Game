// === DEV: minigame test menu — REMOVE BEFORE PROD ===
import Phaser from 'phaser';
import { COLORS } from '@config/colors';
import { GAME, DEPTH } from '@config/game';
import { RU } from '@i18n/ru';
import { Button } from '@ui/Button';
import { EventBus } from '@core/EventBus';
import { SessionState } from '@core/SessionState';
import { MINIGAME_POOL, getDifficultyForLevel } from '@core/MinigameRegistry';
import type { MinigameInitData, MinigameResult } from '@minigames/BaseMinigame';

/**
 * Дев-меню: запускает любую минку напрямую, в обход билета и сессии.
 * После завершения раунда возвращает обратно в меню.
 *
 * Временно — после интеграции всех минок удалить:
 *  - этот файл
 *  - регистрацию в main.ts
 *  - кнопку «🧪 ТЕСТ МИНОК» в SplashScene
 */
/** Сколько локальных «попыток» даёт дев-меню на одну минку. Кончились — возвращаемся в меню. */
const DEV_LOCAL_LIVES = 3;

export class DevMinigameMenuScene extends Phaser.Scene {
  private completeHandler: ((result: MinigameResult & { sceneKey: string }) => void) | null = null;
  private readonly pixelFont = '"Press Start 2P", monospace';

  // Состояние текущего «забега» в дев-меню.
  private currentSceneKey: string | null = null;
  private currentDurationMs = 0;
  private localLives = DEV_LOCAL_LIVES;

  constructor() {
    super({ key: 'DevMinigameMenuScene' });
  }

  create(): void {
    const { WIDTH, HEIGHT } = GAME;

    const title = this.add.text(WIDTH / 2, 115, 'МИНИ ИГРЫ', {
      fontFamily: this.pixelFont,
      fontSize: '42px',
      color: '#0A0A0A',
      align: 'center',
    });
    title.setOrigin(0.5);
    title.setDepth(DEPTH.ui);

    const sub = this.add.text(WIDTH / 2, 178, 'выбери игру', {
      fontFamily: this.pixelFont,
      fontSize: '14px',
      color: '#FAF7F0',
      align: 'center',
    });
    sub.setOrigin(0.5);
    sub.setAlpha(0.6);
    sub.setDepth(DEPTH.ui);

    // Кнопки на каждую минку из пула — 2 колонки
    const startY = 240;
    const stepY = 92;
    const colGap = 20;
    const btnW = 320;
    const btnH = 64;

    const classColors: Record<string, number> = {
      easy: COLORS.win,
      medium: COLORS.yellow,
      hard: COLORS.red,
    };
    const classTextColors: Record<string, string> = {
      easy: '#0A0A0A',
      medium: '#0A0A0A',
      hard: '#FAF7F0',
    };

    MINIGAME_POOL.forEach((meta, i) => {
      const col = i % 2;
      const row = Math.floor(i / 2);
      const x = WIDTH / 2 + (col === 0 ? -(btnW / 2 + colGap / 2) : (btnW / 2 + colGap / 2));
      const y = startY + row * stepY;

      const label = RU.minigame.names[meta.i18nKey] ?? meta.key;
      const btn = new Button(
        this,
        x,
        y,
        label,
        () => this.launchMinigame(meta.key, meta.durationMs),
        {
          width: btnW,
          height: btnH,
          bgColor: classColors[meta.class] ?? COLORS.red,
          textColor: classTextColors[meta.class] ?? '#FAF7F0',
          fontSize: '15px',
          fontFamily: this.pixelFont,
        }
      );
      btn.setDepth(DEPTH.ui);
      this.add.existing(btn);

      const classLabel = this.add.text(x, y + 38, `[${meta.class}] ${meta.key}`, {
        fontFamily: this.pixelFont,
        fontSize: '11px',
        color: '#FAF7F0',
        align: 'center',
      });
      classLabel.setOrigin(0.5);
      classLabel.setAlpha(0.55);
      classLabel.setDepth(DEPTH.ui);
    });

    // Серфёр Джеффри — отдельная standalone-игра
    const jeffreyBtn = new Button(
      this,
      WIDTH / 2,
      startY + Math.ceil(MINIGAME_POOL.length / 2) * stepY + 24,
      '🏄 СЕРФЁР ДЖЕФФРИ',
      () => this.scene.start('JeffreySurfer'),
      {
        width: btnW * 2 + colGap,
        height: btnH,
        bgColor: 0xF4A261,
        textColor: '#1A1209',
        fontSize: '18px',
        fontFamily: this.pixelFont,
      }
    );
    jeffreyBtn.setDepth(DEPTH.ui);
    this.add.existing(jeffreyBtn);

    // Назад на сплеш
    const backBtn = new Button(
      this,
      WIDTH / 2,
      HEIGHT - 100,
      '← НА ГЛАВНУЮ',
      () => this.scene.start('SplashScene'),
      {
        width: 320,
        height: 70,
        bgColor: COLORS.cream,
        textColor: '#0A0A0A',
        fontSize: '20px',
        fontFamily: this.pixelFont,
      }
    );
    backBtn.setDepth(DEPTH.ui);
    this.add.existing(backBtn);

    this.cameras.main.fadeIn(250, 90, 84, 249);
  }

  private launchMinigame(sceneKey: string, durationMs: number): void {
    // Сбрасываем локальный счётчик и сразу запускаем минку.
    this.currentSceneKey = sceneKey;
    this.currentDurationMs = durationMs;
    this.localLives = DEV_LOCAL_LIVES;
    SessionState.setLives(DEV_LOCAL_LIVES);
    this.startCurrent();
  }

  /** Запуск текущей минки из dev-меню. Используется и при первом запуске, и при ретрае. */
  private startCurrent(): void {
    if (!this.currentSceneKey) return;
    const initData: MinigameInitData = {
      level: 1,
      difficulty: getDifficultyForLevel(1),
      durationMs: this.currentDurationMs,
    };

    this.completeHandler = (result) => this.onMinigameComplete(result);
    EventBus.once('minigame:complete', this.completeHandler);

    // Прячем меню И блокируем его input — иначе тапы по «невидимым» кнопкам
    // меню будут пробрасываться сквозь активную минку.
    this.scene.launch(this.currentSceneKey, initData);
    this.scene.setVisible(false);
    this.input.enabled = false;
  }

  private onMinigameComplete(result: MinigameResult & { sceneKey: string }): void {
    console.log('[DevMenu] minigame complete:', result);
    this.completeHandler = null;

    // Игрок нажал «домой» — без штрафа возвращаемся в меню.
    const aborted = result.metadata?.aborted === true;
    if (aborted || result.outcome === 'win') {
      this.returnToMenu();
      return;
    }

    // Лоуз. Если есть локальные жизни — ретрай той же минки.
    this.localLives -= 1;
    SessionState.setLives(this.localLives);

    if (this.localLives > 0) {
      this.time.delayedCall(60, () => this.startCurrent());
      return;
    }

    // Все 3 локальные жизни сожжены — возврат в меню. Игрок может сразу
    // выбрать ту же минку и сыграть ещё раз с новой пачкой жизней.
    this.returnToMenu();
  }

  private returnToMenu(): void {
    this.currentSceneKey = null;
    this.scene.setVisible(true);
    this.input.enabled = true;
  }

  shutdown(): void {
    if (this.completeHandler) {
      EventBus.off('minigame:complete', this.completeHandler);
      this.completeHandler = null;
    }
  }
}
