import Phaser from 'phaser';
import { COLORS } from '@config/colors';
import { GAME, DEPTH } from '@config/game';
import { RU } from '@i18n/ru';

/**
 * Экран блокировки горизонтальной ориентации.
 * Запускается глобальным orientation-контроллером поверх любой активной сцены.
 */
export class OrientationLockScene extends Phaser.Scene {
  private readonly pixelFont = '"Press Start 2P", monospace';

  constructor() {
    super({ key: 'OrientationLockScene' });
  }

  create(): void {
    const { WIDTH, HEIGHT } = GAME;

    this.textures.get('orientation-phone-pixel').setFilter(Phaser.Textures.FilterMode.NEAREST);

    this.add.rectangle(WIDTH / 2, HEIGHT / 2, WIDTH, HEIGHT, COLORS.purple)
      .setDepth(DEPTH.background);

    const content = this.add.container(WIDTH / 2, HEIGHT / 2);
    content.setSize(WIDTH, HEIGHT);
    content.setDepth(DEPTH.ui);

    const phone = this.add.image(-130, 0, 'orientation-phone-pixel');
    phone.setOrigin(0.5);
    phone.setDisplaySize(130, 130);
    content.add(phone);

    // Анимируем поворот — будто телефон подсказывает вернуться в портрет
    this.tweens.add({
      targets: phone,
      rotation: { from: -Math.PI / 2, to: 0 },
      duration: 1900,
      hold: 450,
      repeatDelay: 450,
      yoyo: true,
      repeat: -1,
      ease: 'Cubic.easeInOut',
    });

    const copy = this.add.container(115, 0);
    content.add(copy);

    const title = this.add.text(0, -45, RU.orientationLock.title, {
      fontFamily: this.pixelFont,
      fontSize: '30px',
      color: '#0A0A0A',
      align: 'center',
      wordWrap: { width: 360 },
      lineSpacing: 16,
    });
    title.setOrigin(0.5);
    copy.add(title);

    const body = this.add.text(0, 70, RU.orientationLock.body, {
      fontFamily: this.pixelFont,
      fontSize: '12px',
      color: '#FAF7F0',
      align: 'center',
      wordWrap: { width: 300 },
      lineSpacing: 10,
    });
    body.setOrigin(0.5);
    copy.add(body);
  }

}
