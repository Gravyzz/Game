import Phaser from 'phaser';
import { COLORS } from '@config/colors';
import { TEXT_STYLES } from '@config/fonts';

/**
 * Универсальная кнопка в постерном стиле Make Love.
 * Прямоугольник с лёгким наклоном (как стикер на сайте), текст внутри.
 *
 * Использование:
 *   const btn = new Button(this, x, y, 'ЙОУ, ПОГНАЛИ', () => this.start());
 *   this.add.existing(btn);
 */
export class Button extends Phaser.GameObjects.Container {
  private bg: Phaser.GameObjects.Rectangle;
  private label: Phaser.GameObjects.Text;
  private onPress: () => void;
  private isPressed = false;

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    text: string,
    onPress: () => void,
    options: {
      width?: number;
      height?: number;
      bgColor?: number;
      textColor?: string;
      fontSize?: string;
      fontFamily?: string;
    } = {}
  ) {
    super(scene, x, y);
    this.onPress = onPress;

    const width  = options.width  ?? 360;
    const height = options.height ?? 80;
    const bgColor = options.bgColor ?? COLORS.yellow;
    const textColor = options.textColor ?? '#0A0A0A';
    const fontSize  = options.fontSize  ?? '24px';
    const fontFamily = options.fontFamily ?? TEXT_STYLES.button.fontFamily;

    // Фон — прямоугольник с лёгким наклоном для постерности
    this.bg = scene.add.rectangle(0, 0, width, height, bgColor);
    this.bg.setStrokeStyle(4, COLORS.black);

    // Текст
    this.label = scene.add.text(0, 0, text, {
      ...TEXT_STYLES.button,
      fontFamily,
      fontSize,
      color: textColor,
    });
    this.label.setOrigin(0.5);

    this.add([this.bg, this.label]);

    // Чуть наклонён — фирменный «стикерный» вайб
    this.setRotation(-0.02);

    // Размер контейнера для interactive
    this.setSize(width, height);
    this.setInteractive({ useHandCursor: true });

    // Pointer events
    this.on('pointerdown', this.handleDown, this);
    this.on('pointerup',   this.handleUp,   this);
    this.on('pointerout',  this.handleOut,  this);
  }

  private handleDown(): void {
    this.isPressed = true;
    this.scene.tweens.add({
      targets: this,
      scale: 0.94,
      duration: 80,
      ease: 'Power1',
    });
  }

  private handleUp(): void {
    if (!this.isPressed) return;
    this.isPressed = false;

    this.scene.tweens.add({
      targets: this,
      scale: 1,
      duration: 120,
      ease: 'Back.easeOut',
      onComplete: () => this.onPress(),
    });
  }

  private handleOut(): void {
    if (!this.isPressed) return;
    this.isPressed = false;
    this.scene.tweens.add({
      targets: this,
      scale: 1,
      duration: 120,
    });
  }

  /** Обновить текст на кнопке */
  setText(text: string): this {
    this.label.setText(text);
    return this;
  }

  /** Включить/выключить кнопку */
  setEnabled(enabled: boolean): this {
    this.setAlpha(enabled ? 1 : 0.4);
    if (enabled) this.setInteractive();
    else this.disableInteractive();
    return this;
  }
}
