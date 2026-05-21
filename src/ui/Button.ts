import Phaser from 'phaser';
import { COLORS } from '@config/colors';
import { TEXT_STYLES } from '@config/fonts';
import { drawPixelButton, type PixelButtonStyle } from '@utils/PixelButton';

/**
 * Универсальная кнопка в постерном стиле Make Love.
 * Прямоугольник с лёгким наклоном (как стикер на сайте), текст внутри.
 *
 * В режиме `pixel: true` рисуется 8-битная плашка (ступенчатый октагон,
 * объёмная верхняя/нижняя грань), без наклона и без сильного press-scale.
 *
 * Использование:
 *   const btn = new Button(this, x, y, 'ЙОУ, ПОГНАЛИ', () => this.start());
 *   this.add.existing(btn);
 */
export class Button extends Phaser.GameObjects.Container {
  private bg: Phaser.GameObjects.Rectangle | Phaser.GameObjects.Graphics;
  private label: Phaser.GameObjects.Text;
  private onPress: () => void;
  private isPressed = false;
  private readonly isPixel: boolean;

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    text: string,
    onPress: () => void,
    options: {
      width?:           number;
      height?:          number;
      bgColor?:         number;
      textColor?:       string;
      fontSize?:        string;
      fontFamily?:      string;
      pixel?:           boolean;
      pixelStyle?:      PixelButtonStyle;
      /** Цвет пиксельной обводки текста. По умолчанию — без обводки. */
      textStroke?:      string;
      /** Толщина обводки текста в px. По умолчанию 4. */
      textStrokeWidth?: number;
    } = {}
  ) {
    super(scene, x, y);
    this.onPress = onPress;
    this.isPixel = options.pixel === true;

    const width  = options.width  ?? 360;
    const height = options.height ?? 80;
    const bgColor = options.bgColor ?? COLORS.yellow;
    const textColor = options.textColor ?? '#0A0A0A';
    const fontSize  = options.fontSize  ?? '24px';
    const fontFamily = options.fontFamily ?? TEXT_STYLES.button.fontFamily;

    if (this.isPixel) {
      // 8-битная плашка: Graphics в верхнем-левом углу контейнера.
      const g = scene.add.graphics();
      g.setPosition(-width / 2, -height / 2);
      drawPixelButton(g, width, height, bgColor, options.pixelStyle);
      this.bg = g;
    } else {
      // Постерный режим — прямоугольник с обводкой и лёгким наклоном.
      this.bg = scene.add.rectangle(0, 0, width, height, bgColor);
      this.bg.setStrokeStyle(4, COLORS.black);
    }

    // Текст
    this.label = scene.add.text(0, 0, text, {
      ...TEXT_STYLES.button,
      fontFamily,
      fontSize,
      color: textColor,
      ...(options.textStroke
        ? { stroke: options.textStroke, strokeThickness: options.textStrokeWidth ?? 4 }
        : {}),
    });
    this.label.setOrigin(0.5);

    this.add([this.bg, this.label]);

    // Постерный наклон — только для не-пиксельных кнопок (наклонённые пиксели мажет).
    if (!this.isPixel) this.setRotation(-0.02);

    // Размер контейнера для interactive
    this.setSize(width, height);
    this.setInteractive({ useHandCursor: true });

    // Pointer events.
    // `pointerupoutside` вместо `pointerout` — иначе на тач-устройствах
    // микро-движение пальца внутри кнопки моментально отменяло нажатие
    // (pointerout срабатывает на любое смещение, а pointerupoutside —
    // только при реальном отпускании за пределами хитбокса).
    this.on('pointerdown',      this.handleDown, this);
    this.on('pointerup',        this.handleUp,   this);
    this.on('pointerupoutside', this.handleOut,  this);
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
