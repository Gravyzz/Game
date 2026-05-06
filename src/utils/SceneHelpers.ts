import Phaser from 'phaser';
import { GAME, DEPTH } from '@config/game';
import { SoundButton } from '@ui/SoundButton';

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
