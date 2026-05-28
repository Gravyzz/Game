import Phaser from 'phaser';
import { COLORS } from '@config/colors';
import { GAME, DEPTH } from '@config/game';
import { SoundManager } from '@core/SoundManager';
import { Haptics } from '@core/Haptics';
import { GameState } from '@core/GameState';
import { SessionState } from '@core/SessionState';
import { attachSoundButton } from '@utils/SceneHelpers';
import { drawPixelButton } from '@utils/PixelButton';

/**
 * Splash — стартовый экран.
 * Лого Make Love + tagline + кнопка «ЙОУ, ПОГНАЛИ».
 *
 * Стиль: красный фон в духе их сайтовых баннеров,
 * наклонные плашки, постерная типографика.
 *
 * В Phase 4.6 здесь добавится проверка билета: при отсутствии — переход в NoTicketScene.
 * Кнопка PLAY ведёт сразу в MinigameRunner.
 */
export class SplashScene extends Phaser.Scene {
  private readonly pixelFont = '"Press Start 2P", monospace';
  private passwordBuffer = '';

  constructor() {
    super({ key: 'SplashScene' });
  }

  create(): void {
    const { WIDTH, HEIGHT } = GAME;
    SoundManager.playMusic('menu');

    this.setPixelTexture('heart-pixel');
    this.setPixelTexture('pizza-pixel');
    this.setPixelTexture('pizza-slice-new');
    this.setPixelTexture('gamepad-pixel');
    this.setPixelTexture('gamepad-new');
    this.setPixelTexture('make-love-pizza-logo-pixel');
    this.setPixelTexture('main-screen-bg-new');
    this.setPixelTexture('plus-pixel');
    this.setPixelTexture('minus-pixel');
    this.setPixelTexture('cancel-pixel');

    const screenContent = this.add.container(WIDTH / 2, HEIGHT / 2);
    screenContent.setSize(WIDTH, HEIGHT);
    screenContent.setDepth(DEPTH.ui);

    const bg = this.add.image(WIDTH / 2, HEIGHT / 2, 'main-screen-bg-new')
      .setOrigin(0.5)
      .setDepth(DEPTH.background + 1);
    this.fitCover(bg);

    // ===== Сердца: количество жизней/доступа к сессии =====
    this.drawHearts();

    // ===== Главная кнопка =====
    const startBtn = this.createPixelButton(
      0,
      965 - HEIGHT / 2,
      560,
      106,
      'ИГРАТЬ\nСЛУЧАЙНО',
      0xffc21a,
      () => this.startPlayScenario()
    );
    screenContent.add(startBtn);

    const miniGamesBtn = this.createPixelButton(
      0,
      1095 - HEIGHT / 2,
      560,
      106,
      'МИНИ-ИГРЫ',
      0xe53522,
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

    const passwordInput = document.createElement('input');
    passwordInput.type = 'text';
    passwordInput.maxLength = 24;
    passwordInput.autocomplete = 'off';
    passwordInput.autocapitalize = 'words';
    passwordInput.spellcheck = false;
    passwordInput.setAttribute('aria-label', 'Пароль для изменения числа жизней');
    passwordInput.style.position = 'fixed';
    passwordInput.style.zIndex = '10000';
    passwordInput.style.border = '0';
    passwordInput.style.outline = '0';
    passwordInput.style.padding = '0';
    passwordInput.style.margin = '0';
    passwordInput.style.background = 'transparent';
    passwordInput.style.color = 'transparent';
    passwordInput.style.caretColor = 'transparent';
    passwordInput.style.opacity = '0.01';
    passwordInput.style.pointerEvents = 'auto';
    document.body.appendChild(passwordInput);

    const syncInputPosition = () => {
      const bounds = this.game.canvas.getBoundingClientRect();
      const scaleX = bounds.width / WIDTH;
      const scaleY = bounds.height / HEIGHT;
      passwordInput.style.left = `${bounds.left + (WIDTH / 2 - 220) * scaleX}px`;
      passwordInput.style.top = `${bounds.top + (545 - 32) * scaleY}px`;
      passwordInput.style.width = `${440 * scaleX}px`;
      passwordInput.style.height = `${64 * scaleY}px`;
      passwordInput.style.fontSize = `${20 * scaleY}px`;
    };

    const modalObjects = [overlay, panel, closeBtn, title, inputBg, inputText];
    const close = () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('resize', syncInputPosition);
      passwordInput.removeEventListener('input', onInput);
      passwordInput.removeEventListener('keydown', onInputKeyDown);
      passwordInput.remove();
      modalObjects.forEach((obj) => obj.destroy());
    };
    const showValue = (value: string, color = '#0A0A0A') => {
      inputText.setText(value || 'Пароль:');
      inputText.setColor(value ? color : '#8A8A8A');
    };
    const isPasswordCorrect = () => (
      this.passwordBuffer.trim().toLocaleLowerCase('ru-RU') === 'денис змеев'
    );
    const trySubmitPassword = () => {
      if (isPasswordCorrect()) {
        close();
        this.openLivesEditModal();
      } else {
        this.passwordBuffer = '';
        passwordInput.value = '';
        showValue('Неверный пароль!', '#B84646');
      }
    };
    const onInput = () => {
      this.passwordBuffer = passwordInput.value.slice(0, 24);
      showValue(this.passwordBuffer);
    };
    const onInputKeyDown = (event: KeyboardEvent) => {
      event.stopPropagation();
      if (event.key === 'Enter') {
        event.preventDefault();
        trySubmitPassword();
      }
      if (event.key === 'Escape') {
        event.preventDefault();
        close();
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      event.preventDefault();
      if (event.key === 'Escape') {
        close();
        return;
      }
      if (event.key === 'Backspace') {
        this.passwordBuffer = this.passwordBuffer.slice(0, -1);
        passwordInput.value = this.passwordBuffer;
        showValue(this.passwordBuffer);
        return;
      }
      if (event.key === 'Enter') {
        trySubmitPassword();
        return;
      }
      if (event.key.length === 1 && this.passwordBuffer.length < 24) {
        this.passwordBuffer += event.key;
        passwordInput.value = this.passwordBuffer;
        showValue(this.passwordBuffer);
      }
    };

    syncInputPosition();
    window.addEventListener('resize', syncInputPosition);
    passwordInput.addEventListener('input', onInput);
    passwordInput.addEventListener('keydown', onInputKeyDown);
    closeBtn.on('pointerdown', close);
    window.addEventListener('keydown', onKeyDown);
    passwordInput.focus({ preventScroll: true });
    passwordInput.click();
    // Если сцена шатдаунится с открытой модалкой — снимаем глобальный listener.
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('resize', syncInputPosition);
      passwordInput.remove();
    });
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
    onClick: () => void
  ): Phaser.GameObjects.Container {
    const button = this.add.container(x, y);
    button.setSize(width, height);
    button.setDepth(DEPTH.ui);

    // Жирная пиксельная плашка: STEP=8, BORDER=8 → грубее и крупнее,
    // как чанковые NES-шные кнопки в референсе.
    const g = this.add.graphics();
    g.setPosition(-width / 2, -height / 2);
    drawPixelButton(g, width, height, bgColor, { step: 8, border: 8, corner: 24 });

    const isTwoLine = label.includes('\n');
    const text = this.add.text(0, isTwoLine ? 2 : 4, label, {
      fontFamily: this.pixelFont,
      fontSize: isTwoLine ? '30px' : '36px',
      color: '#FAF7F0',
      stroke: '#0A0A0A',
      strokeThickness: isTwoLine ? 6 : 8,
      align: 'center',
      lineSpacing: 8,
    });
    text.setOrigin(0.5);

    // Прозрачный хит-прямоугольник во всю кнопку — иконка и текст не
    // интерактивны, тап ловится здесь и проходит через них без проблем.
    const hit = this.add.rectangle(0, 0, width, height, 0xffffff, 0);
    hit.setInteractive({ useHandCursor: true });

    button.add([g, text, hit]);

    hit.on('pointerdown', () => {
      Haptics.trigger('tap');
      SoundManager.playSfx('tap');
      onClick();
    });
    hit.on('pointerover', () => button.setScale(1.03));
    hit.on('pointerout', () => button.setScale(1));

    return button;
  }

  private setPixelTexture(key: string): void {
    this.textures.get(key).setFilter(Phaser.Textures.FilterMode.NEAREST);
  }

  private fitCover(image: Phaser.GameObjects.Image): void {
    const source = image.texture.getSourceImage() as HTMLImageElement | HTMLCanvasElement;
    const scale = Math.max(GAME.WIDTH / source.width, GAME.HEIGHT / source.height);
    image.setDisplaySize(source.width * scale, source.height * scale);
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
    SoundManager.playMusic('menu');
    SoundManager.playSfx('sessionStart');
    Haptics.trigger('tap');

    // Куда идём дальше — зависит от наличия билета и прогресса:
    //  - нет билета → NoTicketScene
    //  - билет есть, туториал не виден → Tutorial → Runner
    //  - билет есть, туториал виден    → Runner (с minigame.progressLevel)
    let nextScene: string;
    if (!GameState.hasTicket()) {
      nextScene = 'NoTicketScene';
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
