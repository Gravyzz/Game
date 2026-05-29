import Phaser from 'phaser';
import { GAME, DEPTH } from '@config/game';
import { GameState } from '@core/GameState';
import { SessionState } from '@core/SessionState';
import { SoundManager } from '@core/SoundManager';
import { Haptics } from '@core/Haptics';

const PIXEL_FONT = '"Press Start 2P", monospace';
const PANEL_DELAY_MS = 3000;
const MOUTH_FRAME_DELAY_MS = 1050;
const MOUTH_TOGGLE_LIMIT = 2;
const MOUTH_SETTLE_DELAY_MS = 180;

interface ComicPanel {
  x: number;
  y: number;
  w: number;
  h: number;
  closeKey?: string;
  openKey: string;
}

export class ComicsScene extends Phaser.Scene {
  private panels: ComicPanel[] = [];
  private activePanel: Phaser.GameObjects.Image | null = null;
  private activeTimer: Phaser.Time.TimerEvent | null = null;
  private skipButton: Phaser.GameObjects.Image | null = null;
  private revealTimers: Phaser.Time.TimerEvent[] = [];
  private started = false;

  constructor() {
    super({ key: 'ComicsScene' });
  }

  create(): void {
    const { WIDTH, HEIGHT } = GAME;
    this.cameras.main.setBackgroundColor('#000000');
    this.add.rectangle(WIDTH / 2, HEIGHT / 2, WIDTH, HEIGHT, 0x000000, 1)
      .setDepth(DEPTH.background);

    this.prepareTextures();
    this.createLayout();
    this.drawTitle();
    this.drawSkipButton();
    this.schedulePanels();
    this.cameras.main.fadeIn(250, 0, 0, 0);
  }

  private prepareTextures(): void {
    [
      ...Array.from({ length: 4 }, (_, i) => `comics-${i + 1}-close`),
      ...Array.from({ length: 4 }, (_, i) => `comics-${i + 1}-open`),
      'comics-5',
      'comics-button',
      'comics-skip-button',
    ].forEach((key) => this.textures.get(key).setFilter(Phaser.Textures.FilterMode.NEAREST));
  }

  private createLayout(): void {
    const panelW = 328;
    const gap = 16;
    const leftX = GAME.WIDTH / 2 - panelW / 2 - gap / 2;
    const rightX = GAME.WIDTH / 2 + panelW / 2 + gap / 2;

    this.panels = [
      { x: leftX, y: 303, w: panelW, h: 374, closeKey: 'comics-1-close', openKey: 'comics-1-open' },
      { x: rightX, y: 303, w: panelW, h: 374, closeKey: 'comics-2-close', openKey: 'comics-2-open' },
      { x: leftX, y: 674, w: panelW, h: 350, closeKey: 'comics-3-close', openKey: 'comics-3-open' },
      { x: rightX, y: 674, w: panelW, h: 350, closeKey: 'comics-4-close', openKey: 'comics-4-open' },
      { x: GAME.WIDTH / 2, y: 1022, w: 680, h: 278, openKey: 'comics-5' },
    ];
  }

  private drawTitle(): void {
    this.add.text(GAME.WIDTH / 2, 64, 'MLP adventures', {
      fontFamily: PIXEL_FONT,
      fontSize: '28px',
      color: '#FFFFFF',
      align: 'center',
    })
      .setOrigin(0.5)
      .setDepth(DEPTH.ui);
  }

  private drawSkipButton(): void {
    const button = this.add.image(GAME.WIDTH / 2, GAME.HEIGHT - 72, 'comics-skip-button')
      .setOrigin(0.5)
      .setDisplaySize(310, 87)
      .setDepth(DEPTH.ui + 10)
      .setInteractive({ useHandCursor: true });
    this.skipButton = button;

    button.on('pointerdown', () => this.startPlay());
  }

  private schedulePanels(): void {
    this.panels.forEach((panel, index) => {
      const timer = this.time.delayedCall(index * PANEL_DELAY_MS, () => {
        this.revealPanel(panel, index);
      });
      this.revealTimers.push(timer);
    });
  }

  private revealPanel(panel: ComicPanel, index: number): void {
    this.stopActiveMouthAnimation();

    const image = this.add.image(panel.x, panel.y, panel.closeKey ?? panel.openKey)
      .setOrigin(0.5)
      .setDisplaySize(panel.w, panel.h)
      .setDepth(DEPTH.ui + index)
      .setAlpha(0)
      .setRotation(Phaser.Math.FloatBetween(-0.035, 0.035));
    const finalScaleX = image.scaleX;
    const finalScaleY = image.scaleY;
    image.setScale(finalScaleX * 0.78, finalScaleY * 0.78);

    this.tweens.add({
      targets: image,
      alpha: 1,
      scaleX: finalScaleX,
      scaleY: finalScaleY,
      rotation: 0,
      duration: 360,
      ease: 'Back.easeOut',
    });

    this.flashComicPop(panel.x, panel.y, panel.w, panel.h);

    if (panel.closeKey) {
      this.startBriefMouthAnimation(panel, image);
    } else {
      this.hideSkipButton();
      this.showStartButton();
    }
  }

  private startBriefMouthAnimation(panel: ComicPanel, image: Phaser.GameObjects.Image): void {
    if (!panel.closeKey) return;

    const closeKey = panel.closeKey;
    this.activePanel = image;

    let togglesDone = 0;
    const toggleFrame = () => {
      if (!this.activePanel) return;

      const nextKey = this.activePanel.texture.key === panel.openKey ? closeKey : panel.openKey;
      this.activePanel.setTexture(nextKey);
      this.activePanel.setDisplaySize(panel.w, panel.h);
      togglesDone++;

      if (togglesDone < MOUTH_TOGGLE_LIMIT) {
        this.activeTimer = this.time.delayedCall(MOUTH_FRAME_DELAY_MS, toggleFrame);
        return;
      }

      this.activeTimer = this.time.delayedCall(MOUTH_SETTLE_DELAY_MS, () => {
        if (!this.activePanel) return;
        this.activePanel.setTexture(panel.openKey);
        this.activePanel.setDisplaySize(panel.w, panel.h);
        this.activeTimer = null;
      });
    };

    this.activeTimer = this.time.delayedCall(MOUTH_FRAME_DELAY_MS, toggleFrame);
  }

  private flashComicPop(x: number, y: number, w: number, h: number): void {
    const frame = this.add.rectangle(x, y, w + 10, h + 10, 0xffffff, 0)
      .setStrokeStyle(5, 0xffffff, 0.85)
      .setDepth(DEPTH.ui + 30)
      .setScale(0.92);

    this.tweens.add({
      targets: frame,
      alpha: 0,
      scaleX: 1.08,
      scaleY: 1.08,
      duration: 300,
      ease: 'Cubic.easeOut',
      onComplete: () => frame.destroy(),
    });
  }

  private stopActiveMouthAnimation(): void {
    this.activeTimer?.remove();
    this.activeTimer = null;
    if (this.activePanel) {
      const currentKey = this.activePanel.texture.key;
      const match = /^comics-(\d)-/.exec(currentKey);
      if (match) {
        this.activePanel.setTexture(`comics-${match[1]}-open`);
      }
    }
    this.activePanel = null;
  }

  private showStartButton(): void {
    const button = this.add.image(GAME.WIDTH / 2, 944, 'comics-button')
      .setOrigin(0.5)
      .setDisplaySize(390, 109)
      .setDepth(DEPTH.ui + 20)
      .setInteractive({ useHandCursor: true });

    this.tweens.add({
      targets: button,
      displayWidth: 395,
      displayHeight: 110.4,
      yoyo: true,
      repeat: -1,
      duration: 620,
      ease: 'Sine.easeInOut',
    });

    button.on('pointerdown', () => this.startPlay());
  }

  private hideSkipButton(): void {
    if (!this.skipButton) return;
    const button = this.skipButton;
    this.skipButton = null;
    button.disableInteractive();
    this.tweens.add({
      targets: button,
      alpha: 0,
      scale: 0.92,
      duration: 220,
      ease: 'Sine.easeIn',
      onComplete: () => button.destroy(),
    });
  }

  private startPlay(): void {
    if (this.started) return;
    if (SessionState.getLivesLeft() <= 0) {
      this.showNoLivesHint();
      return;
    }

    this.started = true;
    this.stopComicAnimation();
    if (!GameState.hasTicket()) {
      GameState.grantTicket();
    }

    SoundManager.playMusic();
    SoundManager.playSfx('sessionStart');
    Haptics.trigger('tap');

    this.cameras.main.fadeOut(220, 0, 0, 0);
    this.cameras.main.once('camerafadeoutcomplete', () => {
      this.scene.start('MinigameRunnerScene');
    });
  }

  private showNoLivesHint(): void {
    const toast = this.add.text(GAME.WIDTH / 2, GAME.HEIGHT - 170, 'НЕТ ЖИЗНЕЙ', {
      fontFamily: PIXEL_FONT,
      fontSize: '24px',
      color: '#FF2E2E',
      stroke: '#0A0A0A',
      strokeThickness: 6,
    })
      .setOrigin(0.5)
      .setDepth(DEPTH.toast);

    this.tweens.add({
      targets: toast,
      y: toast.y - 34,
      alpha: 0,
      duration: 900,
      ease: 'Sine.easeOut',
      onComplete: () => toast.destroy(),
    });
  }

  private stopComicAnimation(): void {
    this.stopActiveMouthAnimation();
    this.skipButton?.destroy();
    this.skipButton = null;
    this.revealTimers.forEach((timer) => timer.remove());
    this.revealTimers = [];
  }

  shutdown(): void {
    this.stopComicAnimation();
    this.tweens.killAll();
  }
}
