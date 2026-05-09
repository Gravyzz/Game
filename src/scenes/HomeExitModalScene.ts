import Phaser from 'phaser';
import { COLORS } from '@config/colors';
import { GAME, DEPTH } from '@config/game';

/**
 * Полупрозрачная overlay-сцена с подтверждением «выйти из игры?».
 * Используется кнопкой-домиком в каждой минке. Запускается через
 * `scene.scene.launch('HomeExitModalScene', { ownerKey, onYes, onNo })`,
 * пока вызывающая сцена paused-ит сама себя.
 */
interface ExitModalData {
  /** scene key минки, которая запустила модалку — будем её резумить/абортить */
  ownerKey: string;
  onYes: () => void;
  onNo:  () => void;
}

export class HomeExitModalScene extends Phaser.Scene {
  // Имя `data` зарезервировано Phaser-сценой под DataManager — называем иначе.
  private modalData!: ExitModalData;

  constructor() {
    super({ key: 'HomeExitModalScene' });
  }

  init(modalData: ExitModalData): void {
    this.modalData = modalData;
  }

  create(): void {
    const { WIDTH, HEIGHT } = GAME;
    const pixel = '"Press Start 2P", monospace';

    // Подложка
    const overlay = this.add.rectangle(WIDTH / 2, HEIGHT / 2, WIDTH, HEIGHT, COLORS.black, 0.68);
    overlay.setDepth(DEPTH.modal);
    overlay.setInteractive();

    // Панель
    const panel = this.add.rectangle(WIDTH / 2, HEIGHT / 2, 500, 320, 0x5a54f9);
    panel.setStrokeStyle(6, COLORS.black);
    panel.setDepth(DEPTH.modal + 1);

    const title = this.add.text(WIDTH / 2, HEIGHT / 2 - 95, 'Вы уверены,\nчто хотите выйти?', {
      fontFamily: pixel,
      fontSize: '22px',
      color: '#FAF7F0',
      align: 'center',
      lineSpacing: 8,
    });
    title.setOrigin(0.5);
    title.setDepth(DEPTH.modal + 2);

    const body = this.add.text(WIDTH / 2, HEIGHT / 2 - 10, 'При выходе из игры\nу Вас сгорает 1 жизнь!', {
      fontFamily: pixel,
      fontSize: '14px',
      color: '#0A0A0A',
      align: 'center',
      lineSpacing: 10,
    });
    body.setOrigin(0.5);
    body.setDepth(DEPTH.modal + 2);

    // Кнопка ДА — закрывает модалку, дёргает onYes
    const yes = this.add.rectangle(WIDTH / 2 - 105, HEIGHT / 2 + 95, 105, 56, COLORS.win);
    yes.setStrokeStyle(4, COLORS.black);
    yes.setDepth(DEPTH.modal + 2);
    yes.setInteractive({ useHandCursor: true });
    const yesText = this.add.text(yes.x, yes.y, 'Да', {
      fontFamily: pixel, fontSize: '20px', color: '#FAF7F0',
    });
    yesText.setOrigin(0.5);
    yesText.setDepth(DEPTH.modal + 3);

    // Кнопка НЕТ — резумит и закрывает
    const no = this.add.rectangle(WIDTH / 2 + 105, HEIGHT / 2 + 95, 105, 56, 0xff4e25);
    no.setStrokeStyle(4, COLORS.black);
    no.setDepth(DEPTH.modal + 2);
    no.setInteractive({ useHandCursor: true });
    const noText = this.add.text(no.x, no.y, 'Нет', {
      fontFamily: pixel, fontSize: '20px', color: '#FAF7F0',
    });
    noText.setOrigin(0.5);
    noText.setDepth(DEPTH.modal + 3);

    yes.on('pointerdown', () => {
      // Сначала остановим себя, чтобы не было двойного вызова, потом — onYes
      this.scene.stop();
      this.modalData.onYes();
    });
    no.on('pointerdown', () => {
      this.scene.stop();
      this.modalData.onNo();
    });
  }
}
