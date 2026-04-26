import Phaser from 'phaser';
import { COLORS } from '@config/colors';
import { TEXT_STYLES } from '@config/fonts';

/**
 * Постерный текст в стиле баннеров с сайта Make Love.
 * Жирный италик, наклонная цветная плашка-подложка.
 *
 * Пример: «ДОНТВОРК», «ПИЦЦАМОНСТРЫ», «САМОВЫВОЗ» — всё это PosterText.
 */
export class PosterText extends Phaser.GameObjects.Container {
  private bg: Phaser.GameObjects.Rectangle;
  private text: Phaser.GameObjects.Text;

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    text: string,
    options: {
      bgColor?: number;
      textColor?: string;
      fontSize?: string;
      rotation?: number;
      paddingX?: number;
      paddingY?: number;
    } = {}
  ) {
    super(scene, x, y);

    const bgColor    = options.bgColor    ?? COLORS.red;
    const textColor  = options.textColor  ?? '#FAF7F0';
    const fontSize   = options.fontSize   ?? '40px';
    const rotation   = options.rotation   ?? -0.04;
    const paddingX   = options.paddingX   ?? 24;
    const paddingY   = options.paddingY   ?? 12;

    // Сначала текст — чтобы измерить его размер
    this.text = scene.add.text(0, 0, text, {
      ...TEXT_STYLES.title,
      fontSize,
      color: textColor,
    });
    this.text.setOrigin(0.5);

    const w = this.text.width + paddingX * 2;
    const h = this.text.height + paddingY * 2;

    // Плашка под текстом
    this.bg = scene.add.rectangle(0, 0, w, h, bgColor);

    this.add([this.bg, this.text]);
    this.setRotation(rotation);
  }

  /** Обновить текст и пересчитать плашку */
  setText(newText: string): this {
    this.text.setText(newText);
    const paddingX = 24;
    const paddingY = 12;
    this.bg.setSize(this.text.width + paddingX * 2, this.text.height + paddingY * 2);
    return this;
  }
}
