import Phaser from 'phaser';
import { Haptics } from '@core/Haptics';
import { SoundManager } from '@core/SoundManager';
import { drawPixelButton } from '@utils/PixelButton';

const HITBOX_SIZE = 88;
const FRAME_SIZE = 72;
const ICON_SIZE = 50;

/**
 * Маленькая кнопка-иконка для включения/выключения звука.
 * Автоматически добавляется на все ключевые сцены через SceneHelpers.attachSoundButton().
 *
 * Дизайн: пиксельная иконка с рамкой 72x72 и тач-зоной 88x88.
 */
export class SoundButton extends Phaser.GameObjects.Container {
  private frame: Phaser.GameObjects.Graphics;
  private icon: Phaser.GameObjects.Image;

  constructor(scene: Phaser.Scene, x: number, y: number) {
    super(scene, x, y);

    this.frame = scene.add.graphics();
    this.frame.setPosition(-FRAME_SIZE / 2, -FRAME_SIZE / 2);
    this.redrawFrame();

    this.icon = scene.add.image(0, 0, this.getIconKey());
    scene.textures.get('sound-on-pixel').setFilter(Phaser.Textures.FilterMode.NEAREST);
    scene.textures.get('sound-off-pixel').setFilter(Phaser.Textures.FilterMode.NEAREST);
    this.icon.setOrigin(0.5);
    this.icon.setDisplaySize(ICON_SIZE, ICON_SIZE);
    this.icon.setTexture(this.getIconKey());

    this.add(this.frame);
    this.add(this.icon);

    this.setSize(HITBOX_SIZE, HITBOX_SIZE);
    this.setInteractive(
      new Phaser.Geom.Rectangle(-HITBOX_SIZE / 2, -HITBOX_SIZE / 2, HITBOX_SIZE, HITBOX_SIZE),
      Phaser.Geom.Rectangle.Contains
    );
    this.input!.cursor = 'pointer';
    this.on('pointerdown', (
      _pointer: Phaser.Input.Pointer,
      _localX: number,
      _localY: number,
      event: Phaser.Types.Input.EventData,
    ) => {
      event.stopPropagation();
      Haptics.trigger('tap');
      const willMute = !SoundManager.isMuted();
      SoundManager.setMuted(willMute);
      if (!SoundManager.isMuted()) {
        SoundManager.playSfx('muteToggle');
      }
      this.refreshIcon();
      this.redrawFrame();
      this.scene.tweens.add({
        targets: this,
        scale: 0.9,
        duration: 70,
        yoyo: true,
        ease: 'Sine.easeOut',
      });
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

  private redrawFrame(): void {
    this.frame.clear();
    drawPixelButton(this.frame, FRAME_SIZE, FRAME_SIZE, SoundManager.isMuted() ? 0x2b0f12 : 0x21160c, {
      step: 4,
      border: 4,
      corner: 12,
      outline: 0x0a0a0a,
    });

    const accent = SoundManager.isMuted() ? 0xff2e2e : 0xffe600;
    this.frame.fillStyle(accent, 1);
    this.frame.fillRect(18, 8, FRAME_SIZE - 36, 4);
    this.frame.fillRect(18, FRAME_SIZE - 12, FRAME_SIZE - 36, 4);
    this.frame.fillRect(8, 18, 4, FRAME_SIZE - 36);
    this.frame.fillRect(FRAME_SIZE - 12, 18, 4, FRAME_SIZE - 36);
  }
}
