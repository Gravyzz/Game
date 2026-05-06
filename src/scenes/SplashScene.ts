import Phaser from 'phaser';
import { COLORS } from '@config/colors';
import { GAME, DEPTH } from '@config/game';
import { RU } from '@i18n/ru';
import { SoundManager } from '@core/SoundManager';
import { Haptics } from '@core/Haptics';
import { GameState } from '@core/GameState';
import { SessionState } from '@core/SessionState';
import { attachSoundButton } from '@utils/SceneHelpers';

/**
 * Splash — стартовый экран.
 * Лого Make Love + tagline + кнопка «ЙОУ, ПОГНАЛИ».
 *
 * Стиль: красный фон в духе их сайтовых баннеров,
 * наклонные плашки, постерная типографика.
 *
 * В Phase 4.6 здесь добавится проверка билета: при отсутствии — переход в NoTicketScene.
 * Пока кнопка ведёт в TutorialScene → MinigameRunner.
 */
export class SplashScene extends Phaser.Scene {
  private readonly pixelFont = '"Press Start 2P", monospace';
  private passwordBuffer = '';

  constructor() {
    super({ key: 'SplashScene' });
  }

  create(): void {
    const { WIDTH, HEIGHT } = GAME;

    this.setPixelTexture('heart-pixel');
    this.setPixelTexture('pizza-pixel');
    this.setPixelTexture('gamepad-pixel');
    this.setPixelTexture('make-love-pizza-logo-pixel');
    this.setPixelTexture('plus-pixel');
    this.setPixelTexture('minus-pixel');
    this.setPixelTexture('cancel-pixel');

    const screenContent = this.add.container(WIDTH / 2, HEIGHT / 2);
    screenContent.setSize(WIDTH, HEIGHT);
    screenContent.setDepth(DEPTH.ui);

    // ===== Сердца: количество жизней/доступа к сессии =====
    this.drawHearts();

    // ===== Главное лого Make Love Pizza =====
    const logoBrand = this.add.image(0, 305 - HEIGHT / 2, 'make-love-pizza-logo-pixel');
    logoBrand.setOrigin(0.5);
    logoBrand.setDisplaySize(500, 333);
    logoBrand.setDepth(DEPTH.ui);
    screenContent.add(logoBrand);

    const adventures = this.add.text(0, 485 - HEIGHT / 2, RU.splash.tagline, {
      fontFamily: this.pixelFont,
      fontSize: '42px',
      color: '#0A0A0A',
      align: 'center',
    });
    adventures.setOrigin(0.5);
    adventures.setDepth(DEPTH.ui);
    screenContent.add(adventures);

    // ===== Главная кнопка =====
    const startBtn = this.createPixelButton(
      0,
      735 - HEIGHT / 2,
      510,
      120,
      'PLAY',
      0x69bd45,
      'pizza-pixel',
      () => this.startPlayScenario()
    );
    screenContent.add(startBtn);

    const miniGamesBtn = this.createPixelButton(
      0,
      895 - HEIGHT / 2,
      510,
      120,
      'MINI\nGAMES',
      COLORS.red,
      'gamepad-pixel',
      () => this.openMiniGames()
    );
    screenContent.add(miniGamesBtn);

    // ===== Кнопка mute в углу =====
    attachSoundButton(this);

    this.cameras.main.fadeIn(400, 90, 84, 249);
  }

  private drawHearts(): void {
    const lives = this.getMainScreenLives();
    let rightEdge = 48;

    if (lives > 3) {
      const count = this.add.text(54, 78, `${lives}`, {
        fontFamily: this.pixelFont,
        fontSize: '48px',
        color: '#0A0A0A',
      });
      count.setOrigin(0.5);
      count.setDepth(DEPTH.ui);

      for (let i = 0; i < 3; i++) {
        const heart = this.add.image(118 + i * 32, 78, 'heart-pixel');
        heart.setOrigin(0.5);
        heart.setDisplaySize(62, 62);
        heart.setDepth(DEPTH.ui + i);
      }
      rightEdge = 118 + 64;
    } else {
      for (let i = 0; i < lives; i++) {
        const heart = this.add.image(78 + i * 82, 78, 'heart-pixel');
        heart.setOrigin(0.5);
        heart.setDisplaySize(62, 62);
        heart.setDepth(DEPTH.ui);
      }
      rightEdge = lives > 0 ? 78 + (lives - 1) * 82 + 31 : 48;
    }

    const plus = this.add.image(rightEdge + 46, 78, 'plus-pixel');
    plus.setOrigin(0.5);
    plus.setDisplaySize(44, 44);
    plus.setDepth(DEPTH.ui + 5);
    plus.setInteractive({ useHandCursor: true });
    plus.on('pointerdown', () => this.openLivesPasswordModal());
  }

  private getMainScreenLives(): number {
    return SessionState.getLivesLeft();
  }

  private openLivesPasswordModal(): void {
    this.passwordBuffer = '';
    const { WIDTH, HEIGHT } = GAME;
    const overlay = this.add.rectangle(WIDTH / 2, HEIGHT / 2, WIDTH, HEIGHT, COLORS.black, 0.62);
    overlay.setDepth(DEPTH.modal);
    overlay.setInteractive();

    const panel = this.add.rectangle(WIDTH / 2, 520, 540, 250, 0xb8d4f0);
    panel.setStrokeStyle(6, COLORS.black);
    panel.setDepth(DEPTH.modal + 1);

    const closeBtn = this.add.image(WIDTH / 2 + 248, 420, 'cancel-pixel');
    closeBtn.setDisplaySize(42, 42);
    closeBtn.setDepth(DEPTH.modal + 3);
    closeBtn.setInteractive({ useHandCursor: true });

    const title = this.add.text(WIDTH / 2, 455, 'Для изменения числа\nжизней введите пароль', {
      fontFamily: this.pixelFont,
      fontSize: '18px',
      color: '#0A0A0A',
      align: 'center',
      lineSpacing: 8,
    });
    title.setOrigin(0.5);
    title.setDepth(DEPTH.modal + 2);

    const inputBg = this.add.rectangle(WIDTH / 2, 545, 440, 64, COLORS.cream);
    inputBg.setStrokeStyle(4, COLORS.black);
    inputBg.setDepth(DEPTH.modal + 2);

    const inputText = this.add.text(WIDTH / 2 - 195, 545, 'Пароль:', {
      fontFamily: this.pixelFont,
      fontSize: '20px',
      color: '#8A8A8A',
    });
    inputText.setOrigin(0, 0.5);
    inputText.setDepth(DEPTH.modal + 3);

    const modalObjects = [overlay, panel, closeBtn, title, inputBg, inputText];
    const close = () => {
      window.removeEventListener('keydown', onKeyDown);
      modalObjects.forEach((obj) => obj.destroy());
    };
    const showValue = (value: string, color = '#0A0A0A') => {
      inputText.setText(value || 'Пароль:');
      inputText.setColor(value ? color : '#8A8A8A');
    };
    const onKeyDown = (event: KeyboardEvent) => {
      event.preventDefault();
      if (event.key === 'Escape') {
        close();
        return;
      }
      if (event.key === 'Backspace') {
        this.passwordBuffer = this.passwordBuffer.slice(0, -1);
        showValue(this.passwordBuffer);
        return;
      }
      if (event.key === 'Enter') {
        if (this.passwordBuffer.trim() === 'Денис Змеев') {
          close();
          this.openLivesEditModal();
        } else {
          this.passwordBuffer = '';
          showValue('Неверный пароль!', '#B84646');
        }
        return;
      }
      if (event.key.length === 1 && this.passwordBuffer.length < 24) {
        this.passwordBuffer += event.key;
        showValue(this.passwordBuffer);
      }
    };

    closeBtn.on('pointerdown', close);
    window.addEventListener('keydown', onKeyDown);
  }

  private openLivesEditModal(): void {
    const { WIDTH, HEIGHT } = GAME;
    let value = SessionState.getLivesLeft();
    const overlay = this.add.rectangle(WIDTH / 2, HEIGHT / 2, WIDTH, HEIGHT, COLORS.black, 0.62);
    overlay.setDepth(DEPTH.modal);
    overlay.setInteractive();

    const panel = this.add.rectangle(WIDTH / 2, 540, 540, 330, 0xb8d4f0);
    panel.setStrokeStyle(6, COLORS.black);
    panel.setDepth(DEPTH.modal + 1);

    const title = this.add.text(WIDTH / 2, 440, 'Установите число\nжизней:', {
      fontFamily: this.pixelFont,
      fontSize: '20px',
      color: '#0A0A0A',
      align: 'center',
      lineSpacing: 8,
    });
    title.setOrigin(0.5);
    title.setDepth(DEPTH.modal + 2);

    const heart = this.add.image(WIDTH / 2 - 130, 535, 'heart-pixel');
    heart.setDisplaySize(70, 70);
    heart.setDepth(DEPTH.modal + 2);

    const minus = this.add.image(WIDTH / 2 - 55, 535, 'minus-pixel');
    minus.setDisplaySize(58, 58);
    minus.setDepth(DEPTH.modal + 2);
    minus.setInteractive({ useHandCursor: true });

    const valueBg = this.add.rectangle(WIDTH / 2 + 25, 535, 92, 62, COLORS.cream);
    valueBg.setStrokeStyle(4, COLORS.black);
    valueBg.setDepth(DEPTH.modal + 2);

    const valueText = this.add.text(WIDTH / 2 + 25, 535, `${value}`, {
      fontFamily: this.pixelFont,
      fontSize: '30px',
      color: '#0A0A0A',
    });
    valueText.setOrigin(0.5);
    valueText.setDepth(DEPTH.modal + 3);

    const plus = this.add.image(WIDTH / 2 + 115, 535, 'plus-pixel');
    plus.setDisplaySize(58, 58);
    plus.setDepth(DEPTH.modal + 2);
    plus.setInteractive({ useHandCursor: true });

    const confirm = this.add.rectangle(WIDTH / 2 - 110, 640, 190, 62, COLORS.win);
    confirm.setStrokeStyle(4, COLORS.black);
    confirm.setDepth(DEPTH.modal + 2);
    confirm.setInteractive({ useHandCursor: true });
    const confirmText = this.add.text(confirm.x, confirm.y, 'Подтвердить', {
      fontFamily: this.pixelFont,
      fontSize: '13px',
      color: '#FAF7F0',
    });
    confirmText.setOrigin(0.5);
    confirmText.setDepth(DEPTH.modal + 3);

    const cancel = this.add.rectangle(WIDTH / 2 + 125, 640, 170, 62, 0xff4e25);
    cancel.setStrokeStyle(4, COLORS.black);
    cancel.setDepth(DEPTH.modal + 2);
    cancel.setInteractive({ useHandCursor: true });
    const cancelText = this.add.text(cancel.x, cancel.y, 'Отмена', {
      fontFamily: this.pixelFont,
      fontSize: '16px',
      color: '#FAF7F0',
    });
    cancelText.setOrigin(0.5);
    cancelText.setDepth(DEPTH.modal + 3);

    const modalObjects = [overlay, panel, title, heart, minus, valueBg, valueText, plus, confirm, confirmText, cancel, cancelText];
    const close = () => modalObjects.forEach((obj) => obj.destroy());
    const refresh = () => valueText.setText(`${value}`);

    minus.on('pointerdown', () => {
      value = Math.max(0, value - 1);
      refresh();
    });
    plus.on('pointerdown', () => {
      value = Math.min(99, value + 1);
      refresh();
    });
    cancel.on('pointerdown', close);
    confirm.on('pointerdown', () => {
      SessionState.setLives(value);
      close();
      this.scene.restart();
    });
  }

  private createPixelButton(
    x: number,
    y: number,
    width: number,
    height: number,
    label: string,
    bgColor: number,
    iconKey: string,
    onClick: () => void
  ): Phaser.GameObjects.Container {
    const button = this.add.container(x, y);
    button.setSize(width, height);
    button.setDepth(DEPTH.ui);

    const bg = this.add.rectangle(0, 0, width, height, bgColor);
    bg.setStrokeStyle(6, COLORS.black);

    const icon = this.add.image(-width / 2 + 85, 0, iconKey);
    icon.setDisplaySize(86, 86);

    const text = this.add.text(70, 4, label, {
      fontFamily: this.pixelFont,
      fontSize: label.includes('\n') ? '37px' : '42px',
      color: '#0A0A0A',
      align: 'center',
      lineSpacing: 10,
    });
    text.setOrigin(0.5);

    button.add([bg, icon, text]);

    // Делаем интерактивным сам bg-прямоугольник: его собственный hitArea
    // совпадает с видимой площадью — тап ловится по всей кнопке, включая
    // области, перекрытые иконкой и текстом (они не интерактивны и пропускают
    // событие к bg).
    bg.setInteractive({ useHandCursor: true });
    bg.on('pointerdown', () => {
      Haptics.trigger('tap');
      SoundManager.playSfx('tap');
      onClick();
    });
    bg.on('pointerover', () => button.setScale(1.03));
    bg.on('pointerout', () => button.setScale(1));

    return button;
  }

  private setPixelTexture(key: string): void {
    this.textures.get(key).setFilter(Phaser.Textures.FilterMode.NEAREST);
  }

  private startPlayScenario(): void {
    if (SessionState.getLivesLeft() <= 0) {
      this.showNoLivesHint();
      return;
    }
    if (!GameState.hasTicket()) {
      GameState.grantTicket();
    }
    this.startGame();
  }

  private openMiniGames(): void {
    this.cameras.main.fadeOut(200, 90, 84, 249);
    this.cameras.main.once('camerafadeoutcomplete', () => {
      this.scene.start('DevMinigameMenuScene');
    });
  }

  private startGame(): void {
    if (SessionState.getLivesLeft() <= 0) {
      this.showNoLivesHint();
      return;
    }

    // Первый пользовательский жест — самое время поднять AudioContext и запустить музыку.
    SoundManager.startMusic();
    SoundManager.playSfx('sessionStart');
    Haptics.trigger('tap');

    // Куда идём дальше — зависит от наличия билета и прогресса:
    //  - нет билета → NoTicketScene
    //  - билет есть, туториал не виден → Tutorial → Runner
    //  - билет есть, туториал виден    → Runner (с minigame.progressLevel)
    let nextScene: string;
    if (!GameState.hasTicket()) {
      nextScene = 'NoTicketScene';
    } else if (!GameState.hasSeenTutorial()) {
      nextScene = 'TutorialScene';
    } else {
      nextScene = 'MinigameRunnerScene';
    }

    this.cameras.main.fadeOut(300, 90, 84, 249);
    this.cameras.main.once('camerafadeoutcomplete', () => {
      this.scene.start(nextScene);
    });
  }

  private showNoLivesHint(): void {
    const toast = this.add.text(GAME.WIDTH / 2, 210, 'НЕТ ЖИЗНЕЙ', {
      fontFamily: this.pixelFont,
      fontSize: '26px',
      color: '#FF2E2E',
    });
    toast.setOrigin(0.5);
    toast.setDepth(DEPTH.toast);
    this.tweens.add({
      targets: toast,
      y: 170,
      alpha: 0,
      duration: 900,
      onComplete: () => toast.destroy(),
    });
  }
}
