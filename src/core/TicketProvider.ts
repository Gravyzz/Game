import { GameState } from '@core/GameState';
import { EventBus } from '@core/EventBus';

/**
 * Источник билетов. Игра не знает, ОТКУДА приходит билет — только что он пришёл.
 *
 * В MVP реализованы три источника одновременно (любой может выдать билет):
 *
 *  1. URL-параметр ?ticket=1 — для тестов и прямой ссылки
 *     Пример: https://game.makelovepizza.ru/?ticket=1
 *
 *  2. window.postMessage от родительского окна — для интеграции в webview приложения
 *     Пример: window.parent.postMessage({ type: 'mla:grantTicket' }, '*')
 *
 *  3. Dev-кнопка на NoTicketScene — только в dev-режиме
 *
 * Когда заказчик подключит JS-bridge или Native API — добавим четвёртую реализацию,
 * остальной код не тронем.
 *
 * Безопасность postMessage:
 *   В production стоит проверять event.origin против белого списка.
 *   Для MVP оставляем '*' с TODO в README — заказчик решит, какой origin разрешить.
 */

const POSTMESSAGE_TYPE_GRANT = 'mla:grantTicket';

class TicketProviderImpl {
  private initialized = false;

  /** Запускаем все источники. Вызывается один раз при старте игры. */
  init(): void {
    if (this.initialized) return;
    this.initialized = true;

    this.checkUrlParam();
    this.attachPostMessage();
  }

  // ============================================================
  // Источник 1: URL-параметр
  // ============================================================
  private checkUrlParam(): void {
    try {
      const url = new URL(window.location.href);
      const ticketParam = url.searchParams.get('ticket');
      if (ticketParam === '1' || ticketParam === 'true') {
        // Чистим URL, чтобы перезагрузка не выдала ещё один билет
        url.searchParams.delete('ticket');
        window.history.replaceState({}, '', url.toString());

        GameState.grantTicket();
        console.log('[TicketProvider] билет выдан через ?ticket=');
      }
    } catch (err) {
      console.warn('[TicketProvider] checkUrlParam failed', err);
    }
  }

  // ============================================================
  // Источник 2: postMessage от родителя
  // ============================================================
  private attachPostMessage(): void {
    window.addEventListener('message', (event: MessageEvent) => {
      // ВАЖНО: в production здесь должна быть проверка event.origin.
      // Заказчик задаст список разрешённых origins. Пока — принимаем от всех.
      const data = event.data;
      if (typeof data !== 'object' || data === null) return;
      if ((data as { type?: string }).type === POSTMESSAGE_TYPE_GRANT) {
        GameState.grantTicket();
        console.log('[TicketProvider] билет выдан через postMessage');
      }
    });
  }

  // ============================================================
  // Источник 3: dev-mock (вызывается с NoTicketScene в dev-режиме)
  // ============================================================
  grantDevTicket(): void {
    GameState.grantTicket();
    console.log('[TicketProvider] выдан DEV-билет');
  }

  // ============================================================
  // Возврат данных в родительское окно (приз/итог сессии)
  // ============================================================

  /**
   * Сообщает родительскому приложению, что игрок выиграл приз.
   * Используется на ResultScene при отображении промокода.
   *
   * Принимающая сторона может слушать window.message и выдавать промокод
   * в свою БД, начислять бонусы и т.д.
   */
  reportPrize(prize: { id: string; label: string; tier: string; promoCode?: string }): void {
    if (window.parent && window.parent !== window) {
      try {
        window.parent.postMessage(
          { type: 'mla:prizeWon', prize },
          '*' // см. примечание про origin выше
        );
      } catch (err) {
        console.warn('[TicketProvider] reportPrize failed', err);
      }
    }
    EventBus.emit('analytics', { name: 'prize_won', payload: prize });
  }

  /** Сообщает родителю, что игрок проиграл и сессия закрыта */
  reportSessionEnd(outcome: 'win' | 'lose', metadata?: Record<string, unknown>): void {
    if (window.parent && window.parent !== window) {
      try {
        window.parent.postMessage(
          { type: 'mla:sessionEnd', outcome, metadata },
          '*'
        );
      } catch (err) {
        console.warn('[TicketProvider] reportSessionEnd failed', err);
      }
    }
    EventBus.emit('analytics', { name: 'session_end', payload: { outcome, ...metadata } });
  }
}

export const TicketProvider = new TicketProviderImpl();
