import Phaser from 'phaser';

/**
 * Обёртка вокруг standalone-игры «Серфёр Джеффри».
 * Создаёт полноэкранный iframe поверх Phaser-канваса.
 * Когда игра посылает postMessage({ type: 'jeffrey:exit' }),
 * оверлей убирается и мы возвращаемся в DevMinigameMenuScene.
 */
export class JeffreySurferScene extends Phaser.Scene {
  private overlay: HTMLDivElement | null = null;
  private msgHandler: ((e: MessageEvent) => void) | null = null;

  constructor() {
    super({ key: 'JeffreySurfer' });
  }

  create(): void {
    this.overlay = document.createElement('div');
    Object.assign(this.overlay.style, {
      position: 'fixed',
      inset: '0',
      zIndex: '9999',
      background: '#0a0604',
    });

    const iframe = document.createElement('iframe');
    iframe.src = '/jeffrey-surfer.html';
    Object.assign(iframe.style, {
      width: '100%',
      height: '100%',
      border: 'none',
      display: 'block',
    });
    this.overlay.appendChild(iframe);
    document.body.appendChild(this.overlay);

    this.msgHandler = (e: MessageEvent) => {
      if (e.data?.type === 'jeffrey:exit') this.closeGame();
    };
    window.addEventListener('message', this.msgHandler);
  }

  private closeGame(): void {
    this.cleanup();
    this.scene.start('DevMinigameMenuScene');
  }

  private cleanup(): void {
    if (this.msgHandler) {
      window.removeEventListener('message', this.msgHandler);
      this.msgHandler = null;
    }
    if (this.overlay && document.body.contains(this.overlay)) {
      document.body.removeChild(this.overlay);
      this.overlay = null;
    }
  }

  shutdown(): void {
    this.cleanup();
  }
}
