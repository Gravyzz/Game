import Phaser from 'phaser';
import { COLORS } from '@config/colors';
import { SoundManager } from '@core/SoundManager';

/**
 * Маленькая кнопка-иконка для включения/выключения звука.
 * Автоматически добавляется на все ключевые сцены через SceneHelpers.attachSoundButton().
 *
 * Дизайн: круг 44x44 (минимальный тач-таргет по Apple HIG) в правом верхнем углу.
 * Иконка — эмодзи 🔊 / 🔇, чтобы не тащить SVG.
 */
export class SoundButton extends Phaser.GameObjects.Container {
  private bg: Phaser.GameObjects.Arc;
  private icon: Phaser.GameObjects.Text;

  constructor(scene: Phaser.Scene, x: number, y: number) {
    super(scene, x, y);

    this.bg = scene.add.circle(0, 0, 26, COLORS.black);
    this.bg.setStrokeStyle(2, COLORS.cream);

    this.icon = scene.add.text(0, 0, this.getIconChar(), {
      fontSize: '22px',
    });
    this.icon.setOrigin(0.5);

    this.add([this.bg, this.icon]);

    this.setSize(52, 52);
    this.setInteractive({ useHandCursor: true });
    this.on('pointerdown', () => {
      SoundManager.toggleMute();
      this.refreshIcon();
      // Если включили — стартуем фоновую музыку
      if (!SoundManager.isMuted()) {
        SoundManager.startMusic();
      } else {
        SoundManager.stopMusic();
      }
    });

    this.setAlpha(0.85);
  }

  private getIconChar(): string {
    return SoundManager.isMuted() ? '🔇' : '🔊';
  }

  private refreshIcon(): void {
    this.icon.setText(this.getIconChar());
  }
}
