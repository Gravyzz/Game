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
