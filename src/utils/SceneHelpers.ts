import Phaser from 'phaser';
import { COLORS } from '@config/colors';
import { GAME, DEPTH } from '@config/game';
import { SoundButton } from '@ui/SoundButton';
import { EventBus } from '@core/EventBus';
import { SessionState } from '@core/SessionState';
import { TicketProvider } from '@core/TicketProvider';
import type { BaseMinigame } from '@minigames/BaseMinigame';

/**
 * Добавляет иконку mute в правый верхний угол сцены.
 * Обычно вызывается одной строкой в конце create():
 *   attachSoundButton(this);
 */
export function attachSoundButton(scene: Phaser.Scene): SoundButton {
  const btn = new SoundButton(scene, GAME.WIDTH - 50, 50);
  btn.setDepth(DEPTH.modal);
  scene.add.existing(btn);
  return btn;
}

/**
 * Печёт точечный «шум» в текстуру **один раз** (по textureKey) и возвращает Image,
 * которую можно повесить как фон. В отличие от прямого Graphics с N×fillCircle,
 * это 1 draw-call на кадр вместо N — критично для FPS, особенно на слабых GPU.
 *
 * Использование:
 *   attachNoiseBackdrop(this, `noise-${this.scene.key}`, 500);
 */
/**
 * Кнопка-домик с подтверждением выхода.
 *
 * Реализация максимально простая, чтобы не ломать минки:
 * - Кнопка на углу
 * - На клик: создаются объекты модалки В ТОЙ ЖЕ сцене (без `scene.pause`,
 *   без отдельной модальной сцены — они дают непредсказуемые баги
 *   с Phaser scene-менеджером).
 * - Модалка-overlay перехватывает клики (interactive rectangle на DEPTH.modal)
 * - На «Да» в Play делаем прямые scene-переходы как в оригинальной FireStarter
 *   (она работала). В дев-меню эмитим minigame:complete с aborted.
 * - На «Нет» уничтожаем объекты модалки.
 *
 * Минка продолжает тикать в фоне пока модалка открыта — это компромисс ради
 * стабильности (а не паузим сцену через Phaser API).
 */
export function attachHomeButton(scene: BaseMinigame): Phaser.GameObjects.Image {
  const btn = scene.add.image(54, 80, 'home-pixel');
  btn.setOrigin(0.5);
  btn.setDisplaySize(96, 96);
  btn.setDepth(DEPTH.ui + 5);
  btn.setScrollFactor(0);
  btn.setInteractive({ useHandCursor: true });

  let modalOpen = false;
  const openModal = () => {
    if (modalOpen) return;
    modalOpen = true;
    showHomeModal(scene, () => { modalOpen = false; });
  };

  btn.on('pointerdown', (
    _pointer: Phaser.Input.Pointer,
    _localX: number,
    _localY: number,
    event: Phaser.Types.Input.EventData,
  ) => {
    event.stopPropagation();
    openModal();
  });

  // ESC на клавиатуре = клик по домику
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      openModal();
    }
  };
  window.addEventListener('keydown', onKey);
  scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
    window.removeEventListener('keydown', onKey);
  });

  return btn;
}

export interface GlobalLivesDisplay {
  update: (livesLeft?: number) => void;
  destroy: () => void;
}

interface GlobalLivesDisplayOptions {
  x?: number;
  countX?: number;
  stackFirstX?: number;
  y?: number;
  heartSize?: number;
  heartGap?: number;
  stackGap?: number;
  fontSize?: string;
  color?: string;
  depth?: number;
}

/**
 * Единый HUD глобальных жизней:
 * - 0..3 жизни: столько же сердечек на экране
 * - 4+ жизни: число + стопка из трёх сердечек
 */
export function createGlobalLivesDisplay(
  scene: Phaser.Scene,
  options: GlobalLivesDisplayOptions = {},
): GlobalLivesDisplay {
  const x = options.x ?? 150;
  const countX = options.countX ?? x;
  const stackFirstX = options.stackFirstX ?? countX + 64;
  const y = options.y ?? 80;
  const heartSize = options.heartSize ?? 62;
  const heartGap = options.heartGap ?? 82;
  const stackGap = options.stackGap ?? 32;
  const depth = options.depth ?? DEPTH.ui;

  const countText = scene.add.text(countX, y, '', {
    fontFamily: '"Press Start 2P", monospace',
    fontSize: options.fontSize ?? '42px',
    color: options.color ?? '#0A0A0A',
  });
  countText.setOrigin(0.5);
  countText.setDepth(depth);
  countText.setScrollFactor(0);

  const hearts: Phaser.GameObjects.Image[] = [];
  for (let i = 0; i < 3; i++) {
    const heart = scene.add.image(x + i * heartGap, y, 'heart-pixel');
    heart.setOrigin(0.5);
    heart.setDisplaySize(heartSize, heartSize);
    heart.setDepth(depth);
    heart.setScrollFactor(0);
    hearts.push(heart);
  }

  const update = (lives = SessionState.getLivesLeft()) => {
    const livesLeft = Math.max(0, lives);
    if (livesLeft > 3) {
      countText.setText(`${livesLeft}`);
      countText.setVisible(true);
      hearts.forEach((heart, i) => {
        heart.setVisible(true);
        heart.setPosition(stackFirstX + i * stackGap, y);
        heart.setDepth(depth + i);
      });
      return;
    }

    countText.setVisible(false);
    hearts.forEach((heart, i) => {
      heart.setVisible(i < livesLeft);
      heart.setPosition(x + i * heartGap, y);
      heart.setDepth(depth);
    });
  };

  const onLivesChanged = ({ livesLeft }: { livesLeft: number }) => update(livesLeft);
  EventBus.on('session:lives:changed', onLivesChanged);

  const destroy = () => {
    EventBus.off('session:lives:changed', onLivesChanged);
    countText.destroy();
    hearts.forEach((heart) => heart.destroy());
  };

  scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
    EventBus.off('session:lives:changed', onLivesChanged);
  });

  update();
  return { update, destroy };
}

/**
 * Создаёт модалку «выйти?» прямо в сцене минки.
 * `onClose` зовётся когда модалка закрывается без выхода (Нет / уже не нужна).
 */
function showHomeModal(scene: BaseMinigame, onClose: () => void): void {
  const { WIDTH, HEIGHT } = GAME;
  const pixel = '"Press Start 2P", monospace';

  // === ПАУЗА ===
  // 1) Флаг — update-driven минки (Jeffrey/DontWork/Surfer) проверяют его в update()
  // 2) Tweens — стопаем все анимации (FireStarter маркер, бары и т.п.)
  // 3) TimerEvents — стопаем счётчики (countdown в RecipeMemo, didi-tick в ChopChop)
  scene.gamePaused = true;
  scene.tweens.pauseAll();
  scene.time.paused = true;

  const resumeGameplay = () => {
    scene.gamePaused = false;
    scene.tweens.resumeAll();
    scene.time.paused = false;
  };

  const overlay = scene.add.rectangle(WIDTH / 2, HEIGHT / 2, WIDTH, HEIGHT, COLORS.black, 0.92);
  overlay.setDepth(DEPTH.toast + 10);
  overlay.setInteractive();
  overlay.setScrollFactor(0);
  // Поглощаем тапы по подложке — иначе клик мимо кнопок утечёт в минку и
  // зарегается как игровой ход (промах в FireStarter, шаг в Jeffrey и т.п.).
  overlay.on('pointerdown', (
    _p: Phaser.Input.Pointer,
    _x: number,
    _y: number,
    event: Phaser.Types.Input.EventData,
  ) => {
    event.stopPropagation();
  });

  // Глубина модалки выше DEPTH.toast — иначе Surfer-овский showStageBanner
  // (на toast=60) пробивается поверх и портит UX.
  const TOP = DEPTH.toast + 10;

  const panel = scene.add.rectangle(WIDTH / 2, HEIGHT / 2, 500, 320, 0x5a54f9);
  panel.setStrokeStyle(6, COLORS.black);
  panel.setDepth(TOP + 1);
  panel.setScrollFactor(0);

  const titleText = scene.add.text(WIDTH / 2, HEIGHT / 2 - 100, 'Вы уверены,\nчто хотите выйти?', {
    fontFamily: pixel, fontSize: '22px', color: '#FAF7F0',
    align: 'center', lineSpacing: 8,
  });
  titleText.setOrigin(0.5);
  titleText.setDepth(TOP + 2);
  titleText.setScrollFactor(0);

  const bodyText = scene.add.text(
    WIDTH / 2, HEIGHT / 2 + 5,
    scene.isInfinite ? 'Текущий заход прервётся\nи ты вернёшься в меню.' : 'Билет сгорит\nи прогресс сбросится!',
    {
      fontFamily: pixel, fontSize: '14px', color: '#FFE600',
      align: 'center', lineSpacing: 12,
    },
  );
  bodyText.setOrigin(0.5);
  bodyText.setDepth(TOP + 2);
  bodyText.setScrollFactor(0);

  const yes = scene.add.rectangle(WIDTH / 2 - 105, HEIGHT / 2 + 95, 105, 56, COLORS.win);
  yes.setStrokeStyle(4, COLORS.black);
  yes.setDepth(TOP + 2);
  yes.setInteractive({ useHandCursor: true });
  yes.setScrollFactor(0);
  const yesText = scene.add.text(yes.x, yes.y, 'Да', { fontFamily: pixel, fontSize: '20px', color: '#FAF7F0' });
  yesText.setOrigin(0.5);
  yesText.setDepth(TOP + 3);
  yesText.setScrollFactor(0);

  const no = scene.add.rectangle(WIDTH / 2 + 105, HEIGHT / 2 + 95, 105, 56, 0xff4e25);
  no.setStrokeStyle(4, COLORS.black);
  no.setDepth(TOP + 2);
  no.setInteractive({ useHandCursor: true });
  no.setScrollFactor(0);
  const noText = scene.add.text(no.x, no.y, 'Нет', { fontFamily: pixel, fontSize: '20px', color: '#FAF7F0' });
  noText.setOrigin(0.5);
  noText.setDepth(TOP + 3);
  noText.setScrollFactor(0);

  const modalObjects = [overlay, panel, titleText, bodyText, yes, yesText, no, noText];
  const destroyModal = () => modalObjects.forEach((o) => o.destroy());

  let consumed = false;
  yes.on('pointerdown', (
    _p: Phaser.Input.Pointer,
    _x: number,
    _y: number,
    event: Phaser.Types.Input.EventData,
  ) => {
    event.stopPropagation();
    if (consumed) return;
    consumed = true;
    destroyModal();
    // Сцена сейчас будет stop/start — резумить смысла нет, но на всякий случай
    // (вдруг handleExit не выполнит scene.stop) выставляем флаг.
    resumeGameplay();
    handleExit(scene);
  });
  no.on('pointerdown', (
    _p: Phaser.Input.Pointer,
    _x: number,
    _y: number,
    event: Phaser.Types.Input.EventData,
  ) => {
    event.stopPropagation();
    if (consumed) return;
    consumed = true;
    destroyModal();
    resumeGameplay();
    onClose();
  });
}

/** Выполняет фактический выход — для Play закрывает сессию, для дев-меню возвращает в меню */
function handleExit(scene: BaseMinigame): void {
  if (scene.isInfinite) {
    // Дев-меню: чистый scene.start обратно в меню. Раньше эмитили событие
    // и делали scene.stop, а дев-меню сидело в sleep — это давало пустой
    // экран в Safari при возврате. Теперь scene.start полностью пересоздаёт
    // меню, никаких параллельных сцен.
    scene.scene.start('DevMinigameMenuScene');
    return;
  }

  // Play-режим: оригинальный паттерн FireStarter. Работал стабильно.
  SessionState.endSession('lose');
  TicketProvider.reportSessionEnd('lose', { aborted: true });
  scene.scene.stop('MinigameRunnerScene');
  scene.scene.start('SplashScene');
}

/**
 * Полноэкранный туториал перед началом минки.
 * Показывает имя минки + текст гайда + кнопку «Погнали».
 * Пока юзер не нажмёт кнопку — `onStart()` не вызывается, и минка не стартует.
 *
 * Минка должна вызывать в конце `create()`:
 *   attachIntro(this, RU.minigame.names[key], RU.minigame.guides[key], () => this.startRound());
 */
export function attachIntro(
  scene: BaseMinigame,
  title: string,
  guide: string,
  onStart: () => void,
): void {
  const { WIDTH, HEIGHT } = GAME;
  const pixel = '"Press Start 2P", monospace';
  const TOP = DEPTH.toast + 20;

  const overlay = scene.add.rectangle(WIDTH / 2, HEIGHT / 2, WIDTH, HEIGHT, COLORS.black, 0.88);
  overlay.setDepth(TOP);
  overlay.setInteractive();
  overlay.setScrollFactor(0);
  overlay.on('pointerdown', (
    _p: Phaser.Input.Pointer,
    _x: number,
    _y: number,
    e: Phaser.Types.Input.EventData,
  ) => e.stopPropagation());

  const panel = scene.add.rectangle(WIDTH / 2, HEIGHT / 2 - 30, WIDTH - 100, 660, 0x5a54f9);
  panel.setStrokeStyle(8, COLORS.black);
  panel.setDepth(TOP + 1);
  panel.setScrollFactor(0);

  const titleText = scene.add.text(WIDTH / 2, HEIGHT / 2 - 280, title, {
    fontFamily: pixel, fontSize: '28px', color: '#FFE600',
    align: 'center', lineSpacing: 8, wordWrap: { width: WIDTH - 160 },
  });
  titleText.setOrigin(0.5);
  titleText.setDepth(TOP + 2);
  titleText.setScrollFactor(0);

  const bodyText = scene.add.text(WIDTH / 2, HEIGHT / 2 - 30, guide, {
    fontFamily: pixel, fontSize: '21px', color: '#FAF7F0',
    align: 'center', lineSpacing: 16, wordWrap: { width: WIDTH - 180 },
  });
  bodyText.setOrigin(0.5);
  bodyText.setDepth(TOP + 2);
  bodyText.setScrollFactor(0);

  const btn = scene.add.rectangle(WIDTH / 2, HEIGHT / 2 + 230, 380, 96, COLORS.win);
  btn.setStrokeStyle(6, COLORS.black);
  btn.setDepth(TOP + 1);
  btn.setInteractive({ useHandCursor: true });
  btn.setScrollFactor(0);

  const btnText = scene.add.text(WIDTH / 2, HEIGHT / 2 + 230, 'ПОГНАЛИ!', {
    fontFamily: pixel, fontSize: '28px', color: '#0A0A0A',
  });
  btnText.setOrigin(0.5);
  btnText.setDepth(TOP + 2);
  btnText.setScrollFactor(0);

  const all = [overlay, panel, titleText, bodyText, btn, btnText];
  let clicked = false;
  btn.on('pointerdown', (
    _p: Phaser.Input.Pointer,
    _x: number,
    _y: number,
    e: Phaser.Types.Input.EventData,
  ) => {
    e.stopPropagation();
    if (clicked) return;
    clicked = true;
    all.forEach((o) => o.destroy());
    onStart();
  });
}

/**
 * Заливает страницу за пределами канваса в цвет минки на время её жизни.
 * Это решает letterbox — когда canvas 9:16 не покрывает весь viewport, вокруг
 * него виден дефолтный фон сайта (#5a54f9 + звёзды). С этой утилитой:
 *   - body окрашивается в цвет минки
 *   - декоративные слои (звёзды, пульс-градиент) прячутся через CSS-класс
 *   - на shutdown сцены всё откатывается
 *
 * Использование в create():
 *   paintPageBackdrop(this, 0x2a4d3e);
 */
export function paintPageBackdrop(scene: Phaser.Scene, color: number): void {
  const hex = '#' + color.toString(16).padStart(6, '0');
  const app = document.getElementById('app');
  const prevBody = document.body.style.background;
  const prevHtml = document.documentElement.style.background;
  const prevApp = app?.style.background ?? '';
  document.body.style.background = hex;
  document.documentElement.style.background = hex;
  if (app) app.style.background = hex;
  document.body.classList.add('scene-backdrop');

  scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
    document.body.style.background = prevBody;
    document.documentElement.style.background = prevHtml;
    if (app) app.style.background = prevApp;
    document.body.classList.remove('scene-backdrop');
  });
}

export function attachNoiseBackdrop(
  scene: Phaser.Scene,
  textureKey: string,
  count = 500,
  alpha = 0.06,
  color = 0x000000,
): Phaser.GameObjects.Image {
  const { WIDTH, HEIGHT } = GAME;
  if (!scene.textures.exists(textureKey)) {
    const g = scene.make.graphics({ x: 0, y: 0 }, false);
    g.fillStyle(color, alpha);
    for (let i = 0; i < count; i++) {
      g.fillCircle(Math.random() * WIDTH, Math.random() * HEIGHT, Math.random() * 1.5);
    }
    g.generateTexture(textureKey, WIDTH, HEIGHT);
    g.destroy();
  }
  const img = scene.add.image(WIDTH / 2, HEIGHT / 2, textureKey);
  img.setDepth(DEPTH.background);
  return img;
}
