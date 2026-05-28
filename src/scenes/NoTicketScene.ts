import Phaser from 'phaser';
import { COLORS } from '@config/colors';
import { TEXT_STYLES } from '@config/fonts';
import { GAME, DEPTH } from '@config/game';
import { RU } from '@i18n/ru';
import { Button } from '@ui/Button';
import { PosterText } from '@ui/PosterText';
import { TicketProvider } from '@core/TicketProvider';
import { GameState } from '@core/GameState';
import { SoundManager } from '@core/SoundManager';
import { Haptics } from '@core/Haptics';
import { attachSoundButton, attachNoiseBackdrop, paintPageBackdrop } from '@utils/SceneHelpers';

/**
 * Экран «Нет билета».
 *
 * Показывается, когда игрок зашёл на Splash и тапнул «Йоу, погнали»,
 * но GameState.hasTicket() === false.
 *
 * Что делает:
 *  - сообщает о ситуации брендовым тоном
 *  - даёт CTA «Заказать пиццулю» — открывает makelovepizza.ru в новой вкладке
 *  - в dev-режиме: дополнительная кнопка «Получить тестовый билет»
 *  - если у игрока есть незавершённый прогресс — показывает «продолжишь с минки N»
 *  - показывает таймер до сброса прогресса (если он активен)
 */

const ORDER_URL = 'https://makelovepizza.ru/tomsk';

export class NoTicketScene extends Phaser.Scene {
  constructor() {
    super({ key: 'NoTicketScene' });
  }

  create(): void {
    const { WIDTH, HEIGHT } = GAME;
    paintPageBackdrop(this, COLORS.greyDark);

    // ===== Фон: тёмный =====
    this.add.rectangle(WIDTH / 2, HEIGHT / 2, WIDTH, HEIGHT, COLORS.greyDark);
    this.drawNoise();

    // ===== Декоративные стикеры =====
    const sticker1 = new PosterText(this, 110, 130, 'НЕТ БИЛЕТА', {
      bgColor: COLORS.red,
      textColor: '#FAF7F0',
      fontSize: '14px',
      rotation: -0.18,
      paddingX: 10,
      paddingY: 5,
    });
    sticker1.setDepth(DEPTH.midground);
    sticker1.setAlpha(0.85);
    this.add.existing(sticker1);

    const sticker2 = new PosterText(this, WIDTH - 110, 200, ':(', {
      bgColor: COLORS.cream,
      textColor: '#0A0A0A',
      fontSize: '20px',
      rotation: 0.16,
      paddingX: 14,
      paddingY: 6,
    });
    sticker2.setDepth(DEPTH.midground);
    sticker2.setAlpha(0.85);
    this.add.existing(sticker2);

    // ===== Заголовок =====
    const title = new PosterText(this, WIDTH / 2, 240, RU.noTicket.title, {
      bgColor: COLORS.red,
      textColor: '#FAF7F0',
      fontSize: '48px',
      rotation: -0.025,
      paddingX: 26,
      paddingY: 14,
    });
    title.setDepth(DEPTH.ui);
    this.add.existing(title);

    // ===== Большая пицца-эмодзи =====
    const emoji = this.add.text(WIDTH / 2, HEIGHT / 2 - 60, '🍕', { fontSize: '180px' });
    emoji.setOrigin(0.5);
    emoji.setAlpha(0.6);
    emoji.setDepth(DEPTH.midground);
    this.tweens.add({
      targets: emoji,
      angle: { from: -8, to: 8 },
      duration: 1800,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });

    // ===== Body-текст =====
    const body = this.add.text(WIDTH / 2, HEIGHT / 2 + 90, RU.noTicket.body, {
      ...TEXT_STYLES.body,
      fontSize: '18px',
      color: '#FAF7F0',
      wordWrap: { width: WIDTH - 100 },
      lineSpacing: 4,
    });
    body.setOrigin(0.5);
    body.setDepth(DEPTH.ui);

    // ===== Если есть незавершённый прогресс — мотивируем =====
    const progress = GameState.getProgressLevel();
    if (progress > 1) {
      const progressNote = this.add.text(
        WIDTH / 2,
        HEIGHT / 2 + 175,
        `Прогресс: уровень ${progress} / 4 — вернёшься с этой минки 🎸`,
        {
          ...TEXT_STYLES.label,
          fontSize: '14px',
          color: '#FFE600',
        }
      );
      progressNote.setOrigin(0.5);
      progressNote.setDepth(DEPTH.ui);

      // Если запущен 14-дневный таймер — показываем, сколько осталось
      const left = GameState.getTimeUntilReset();
      if (left !== null && left > 0) {
        const days = Math.ceil(left / (24 * 60 * 60 * 1000));
        const timerText = this.add.text(
          WIDTH / 2,
          HEIGHT / 2 + 200,
          `⏳ прогресс сохранится ещё ${days} дн.`,
          {
            ...TEXT_STYLES.label,
            fontSize: '12px',
            color: '#9A9A9A',
          }
        );
        timerText.setOrigin(0.5);
        timerText.setDepth(DEPTH.ui);
      }
    }

    // ===== Главная CTA — заказать пиццу =====
    const orderBtn = new Button(
      this,
      WIDTH / 2,
      HEIGHT - 220,
      RU.noTicket.ctaOrder,
      () => this.openOrder(),
      {
        width: 460,
        height: 100,
        bgColor: COLORS.red,
        textColor: '#FAF7F0',
        fontSize: '24px',
      }
    );
    orderBtn.setDepth(DEPTH.ui);
    this.add.existing(orderBtn);

    this.tweens.add({
      targets: orderBtn,
      scale: 1.04,
      duration: 800,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });

    // ===== Dev-кнопка (только в dev-режиме) =====
    if (import.meta.env.DEV) {
      const devBtn = new Button(
        this,
        WIDTH / 2,
        HEIGHT - 100,
        RU.noTicket.ctaDevHint,
        () => this.grantDevTicket(),
        {
          width: 460,
          height: 70,
          bgColor: COLORS.greyMid,
          textColor: '#FAF7F0',
          fontSize: '16px',
        }
      );
      devBtn.setDepth(DEPTH.ui);
      this.add.existing(devBtn);
    }

    attachSoundButton(this);

    this.cameras.main.fadeIn(300, 26, 26, 26);
  }

  private openOrder(): void {
    SoundManager.playSfx('tap');
    Haptics.trigger('tap');
    // window.open в новой вкладке; внутри webview приложения это может быть
    // обработано как глубокая ссылка
    try {
      window.open(ORDER_URL, '_blank', 'noopener,noreferrer');
    } catch (err) {
      console.warn('[NoTicketScene] openOrder failed', err);
    }
  }

  private grantDevTicket(): void {
    SoundManager.playSfx('perfect');
    Haptics.trigger('good');
    TicketProvider.grantDevTicket();
    // Возвращаемся на Splash — теперь там игра запустится
    this.cameras.main.fadeOut(300, 10, 10, 10);
    this.cameras.main.once('camerafadeoutcomplete', () => {
      this.scene.start('SplashScene');
    });
  }

  private drawNoise(): void {
    attachNoiseBackdrop(this, 'noise-noticket', 600);
  }
}
