import Phaser from 'phaser';
import { Haptics } from '@core/Haptics';
import { SoundManager } from '@core/SoundManager';

/**
 * Маленькая кнопка-иконка для включения/выключения звука.
 * Автоматически добавляется на все ключевые сцены через SceneHelpers.attachSoundButton().
 *
 * Дизайн: пиксельная иконка 52x52 с тач-зоной 64x64.
 */
export class SoundButton extends Phaser.GameObjects.Container {
  private icon: Phaser.GameObjects.Image;

  constructor(scene: Phaser.Scene, x: number, y: number) {
    super(scene, x, y);

    this.icon = scene.add.image(0, 0, this.getIconKey());
    scene.textures.get('sound-on-pixel').setFilter(Phaser.Textures.FilterMode.NEAREST);
    scene.textures.get('sound-off-pixel').setFilter(Phaser.Textures.FilterMode.NEAREST);
    this.icon.setOrigin(0.5);
    this.icon.setDisplaySize(52, 52);
    this.icon.setTexture(this.getIconKey());

    this.add(this.icon);

    this.setSize(64, 64);
    this.setInteractive(
      new Phaser.Geom.Rectangle(-32, -32, 64, 64),
      Phaser.Geom.Rectangle.Contains
    );
    this.input!.cursor = 'pointer';
    this.on('pointerdown', () => {
      Haptics.trigger('tap');
      SoundManager.playSfx('muteToggle');
      SoundManager.toggleMute();
      this.refreshIcon();
      this.scene.tweens.add({
        targets: this,
        scale: 0.9,
        duration: 70,
        yoyo: true,
        ease: 'Sine.easeOut',
      });
      // Если включили — стартуем фоновую музыку
      if (!SoundManager.isMuted()) {
        SoundManager.startMusic();
      } else {
        SoundManager.stopMusic();
      }
    });

    this.on('pointerover', () => this.setScale(1.08));
    this.on('pointerout', () => this.setScale(1));
  }

  private getIconKey(): string {
    return SoundManager.isMuted() ? 'sound-off-pixel' : 'sound-on-pixel';
  }

  private refreshIcon(): void {
    this.icon.setTexture(this.getIconKey());
  }
}
