// === DEV: minigame test menu — REMOVE BEFORE PROD ===
import Phaser from 'phaser';
import { COLORS } from '@config/colors';
import { GAME, DEPTH } from '@config/game';
import { RU } from '@i18n/ru';
import { Button } from '@ui/Button';
import { SessionState } from '@core/SessionState';
import { MINIGAME_POOL, getDifficultyForLevel } from '@core/MinigameRegistry';
import type { MinigameInitData } from '@minigames/BaseMinigame';

/**
 * Дев-меню: запускает любую минку напрямую, в обход билета и сессии.
 * После завершения раунда возвращает обратно в меню.
 *
 * Временно — после интеграции всех минок удалить:
 *  - этот файл
 *  - регистрацию в main.ts
 *  - кнопку «🧪 ТЕСТ МИНОК» в SplashScene
 */
/** Сколько жизней игрок получает на одну минку при заходе из дев-меню. */
const DEV_LOCAL_LIVES = 3;

export class DevMinigameMenuScene extends Phaser.Scene {
  private readonly pixelFont = '"Press Start 2P", monospace';

  constructor() {
    super({ key: 'DevMinigameMenuScene' });
  }

  create(): void {
    const { WIDTH, HEIGHT } = GAME;

    this.setPixelTexture('splash-tree-grey');
    this.setPixelTexture('splash-tree-purple');
    this.setPixelTexture('splash-tree-blue');
    this.drawTreeBackdrop();

    const title = this.add.text(WIDTH / 2, 115, 'МИНИ ИГРЫ', {
      fontFamily: this.pixelFont,
      fontSize: '42px',
      color: '#FAF7F0',
      stroke: '#0A0A0A',
      strokeThickness: 9,
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

    // Кнопки в одну колонку во всю ширину — длинные названия (типа
    // «ПЕРЕПУТАННЫЕ РЕЦЕПТЫ») спокойно помещаются без вылета за рамку.
    // 8 минок + 1 «назад» равномерно делят свободную высоту между sub
    // и нижним краем экрана.
    const btnW = 640;
    const btnH = 96;
    const topY = 215;
    const bottomMargin = 36;
    const slots = MINIGAME_POOL.length + 1; // +1 на «← НА ГЛАВНУЮ»
    const totalH = HEIGHT - bottomMargin - topY;
    const rowH = totalH / slots;
    const firstY = topY + rowH / 2;

    // Все кнопки минок — единого зелёного цвета (COLORS.win), независимо
    // от сложности. Цвет-по-классу убран ради визуальной консистентности
    // меню.
    MINIGAME_POOL.forEach((meta, i) => {
      const y = firstY + i * rowH;
      const label = RU.minigame.names[meta.i18nKey] ?? meta.key;
      const btn = new Button(
        this,
        WIDTH / 2,
        y,
        label,
        () => this.launchMinigame(meta.key, meta.durationMs),
        {
          width: btnW,
          height: btnH,
          bgColor: COLORS.win,
          textColor: '#FAF7F0',
          fontSize: '22px',
          fontFamily: this.pixelFont,
          pixel: true,
          pixelStyle: { step: 6, border: 6, corner: 18 },
          textStroke: '#0A0A0A',
          textStrokeWidth: 6,
        }
      );
      btn.setDepth(DEPTH.ui);
      this.add.existing(btn);
    });

    // Назад на сплеш — последний слот, с тёмно-индиго фоном (cream + белый
    // текст давали нечитабельный контраст «белое на белом»).
    const backBtn = new Button(
      this,
      WIDTH / 2,
      firstY + MINIGAME_POOL.length * rowH,
      '← НА ГЛАВНУЮ',
      () => this.scene.start('SplashScene'),
      {
        width: btnW,
        height: btnH,
        bgColor: 0x3c3a8c,
        textColor: '#FAF7F0',
        fontSize: '22px',
        fontFamily: this.pixelFont,
        pixel: true,
        pixelStyle: { step: 6, border: 6, corner: 18 },
        textStroke: '#0A0A0A',
        textStrokeWidth: 6,
      }
    );
    backBtn.setDepth(DEPTH.ui);
    this.add.existing(backBtn);

    this.cameras.main.fadeIn(250, 90, 84, 249);
  }

  private drawTreeBackdrop(): void {
    const trees = [
      { key: 'splash-tree-grey', x: 48, y: 825, w: 180, h: 430, alpha: 0.9 },
      { key: 'splash-tree-grey', x: 622, y: 835, w: 190, h: 450, alpha: 0.9 },
      { key: 'splash-tree-blue', x: 258, y: 915, w: 180, h: 440, alpha: 0.92 },
      { key: 'splash-tree-blue', x: 520, y: 1005, w: 185, h: 455, alpha: 0.88 },
      { key: 'splash-tree-purple', x: 92, y: 1110, w: 220, h: 555, alpha: 0.95 },
      { key: 'splash-tree-purple', x: 365, y: 1150, w: 235, h: 590, alpha: 0.95 },
      { key: 'splash-tree-blue', x: 655, y: 1150, w: 215, h: 535, alpha: 0.92 },
    ];

    trees.forEach((tree) => {
      const img = this.add.image(tree.x, tree.y, tree.key);
      img.setOrigin(0.5, 1);
      img.setDisplaySize(tree.w, tree.h);
      img.setAlpha(tree.alpha);
      img.setDepth(DEPTH.background + 1);
    });
  }

  private setPixelTexture(key: string): void {
    if (this.textures.exists(key)) {
      this.textures.get(key).setFilter(Phaser.Textures.FilterMode.NEAREST);
    }
  }

  private launchMinigame(sceneKey: string, durationMs: number): void {
    // Полная замена сцены через scene.start (а не launch+sleep) — параллельные
    // сцены в Safari иногда оставляли пустой экран при возврате. С scene.start
    // сцена меню чисто останавливается, минка стартует одна. Возврат — тоже
    // scene.start обратно на меню (см. BaseMinigame.complete / handleExit).
    SessionState.setLives(DEV_LOCAL_LIVES);
    const initData: MinigameInitData = {
      level: 1,
      difficulty: getDifficultyForLevel(1),
      durationMs,
      infinite: true,
    };
    this.scene.start(sceneKey, initData);
  }
}
