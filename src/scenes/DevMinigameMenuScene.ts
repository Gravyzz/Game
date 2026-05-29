// === DEV: minigame test menu — REMOVE BEFORE PROD ===
import Phaser from 'phaser';
import { GAME, DEPTH } from '@config/game';
import { RU } from '@i18n/ru';
import { Button } from '@ui/Button';
import { SessionState } from '@core/SessionState';
import { SoundManager } from '@core/SoundManager';
import { MINIGAME_DIFFICULTY, MINIGAME_POOL } from '@core/MinigameRegistry';
import type { MinigameInitData } from '@minigames/BaseMinigame';
import { attachSceneBackButton, paintPageBackdrop } from '@utils/SceneHelpers';

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
    SoundManager.playMusic('menu');

    this.setPixelTexture('minigames-screen-bg-new');
    paintPageBackdrop(this, 0x130709, 'minigames-screen-bg-new');
    this.drawTreeBackdrop();
    attachSceneBackButton(this, () => this.scene.start('SplashScene'));

    const title = this.add.text(WIDTH / 2, 125, 'МИНИ ИГРЫ', {
      fontFamily: this.pixelFont,
      fontSize: '54px',
      color: '#FFF0BF',
      stroke: '#0A0A0A',
      strokeThickness: 10,
      align: 'center',
    });
    title.setOrigin(0.5);
    title.setDepth(DEPTH.ui);

    const sub = this.add.text(WIDTH / 2, 190, '• — выбери игру — •', {
      fontFamily: this.pixelFont,
      fontSize: '20px',
      color: '#FFF0BF',
      stroke: '#0A0A0A',
      strokeThickness: 6,
      align: 'center',
    });
    sub.setOrigin(0.5);
    sub.setAlpha(0.6);
    sub.setDepth(DEPTH.ui);

    // Кнопки в одну колонку во всю ширину — длинные названия (типа
    // «ПЕРЕПУТАННЫЕ РЕЦЕПТЫ») спокойно помещаются без вылета за рамку.
    // 8 минок + 1 «назад» равномерно делят свободную высоту между sub
    // и нижним краем экрана.
    const btnW = 610;
    const btnH = 78;
    const topY = 240;
    const bottomMargin = 78;
    const slots = MINIGAME_POOL.length + 1; // +1 на «← НА ГЛАВНУЮ»
    const totalH = HEIGHT - bottomMargin - topY;
    const rowH = totalH / slots;
    const firstY = topY + rowH / 2;

    // Все кнопки минок — единого зелёного цвета (COLORS.win).
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
          bgColor: 0xffb21a,
          textColor: '#FFF4C7',
          fontSize: '22px',
          fontFamily: this.pixelFont,
          pixel: true,
          pixelStyle: { step: 6, border: 6, corner: 14 },
          textStroke: '#0A0A0A',
          textStrokeWidth: 7,
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
      'НАЗАД',
      () => this.scene.start('SplashScene'),
      {
        width: btnW,
        height: btnH,
        bgColor: 0x1d1712,
        textColor: '#FFF4C7',
        fontSize: '22px',
        fontFamily: this.pixelFont,
        pixel: true,
        pixelStyle: { step: 6, border: 6, corner: 14 },
        textStroke: '#0A0A0A',
        textStrokeWidth: 7,
      }
    );
    backBtn.setDepth(DEPTH.ui);
    this.add.existing(backBtn);

    this.cameras.main.fadeIn(250, 0, 0, 0);
  }

  private drawTreeBackdrop(): void {
    const bg = this.add.image(GAME.WIDTH / 2, GAME.HEIGHT / 2, 'minigames-screen-bg-new')
      .setOrigin(0.5)
      .setDepth(DEPTH.background);
    const source = bg.texture.getSourceImage() as HTMLImageElement | HTMLCanvasElement;
    const scale = Math.max(GAME.WIDTH / source.width, GAME.HEIGHT / source.height);
    bg.setDisplaySize(source.width * scale, source.height * scale);
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
      difficulty: MINIGAME_DIFFICULTY,
      durationMs,
      infinite: true,
    };
    this.scene.start(sceneKey, initData);
  }
}
