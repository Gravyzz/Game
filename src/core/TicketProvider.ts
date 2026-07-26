import { GameState } from '@core/GameState';
import { EventBus } from '@core/EventBus';

const POSTMESSAGE_TYPE_GRANT = 'mla:grantTicket';

class TicketProviderImpl {
  private initialized = false;

  init(): void {
    if (this.initialized) return;
    this.initialized = true;

    this.checkUrlParam();
    this.attachPostMessage();
  }

  private checkUrlParam(): void {
    try {
      const url = new URL(window.location.href);
      const ticketParam = url.searchParams.get('ticket');

      if (ticketParam === '1' || ticketParam === 'true') {
        url.searchParams.delete('ticket');
        window.history.replaceState({}, '', url.toString());

        GameState.grantTicket();
        console.log('[TicketProvider] ticket granted via URL');
      }
    } catch (err) {
      console.warn('[TicketProvider] checkUrlParam failed', err);
    }
  }

  private attachPostMessage(): void {
    window.addEventListener('message', (event: MessageEvent) => {
      const data = event.data;
      if (typeof data !== 'object' || data === null) return;

      if ((data as { type?: string }).type === POSTMESSAGE_TYPE_GRANT) {
        GameState.grantTicket();
        console.log('[TicketProvider] ticket granted via postMessage');
      }
    });
  }

  grantDevTicket(): void {
    GameState.grantTicket();
    console.log('[TicketProvider] dev ticket granted');
  }

  reportPrize(prize: { id: string; label: string; tier: string; promoCode?: string }): void {
    if (window.parent && window.parent !== window) {
      try {
        window.parent.postMessage({ type: 'mla:prizeWon', prize }, '*');
      } catch (err) {
        console.warn('[TicketProvider] reportPrize failed', err);
      }
    }

    EventBus.emit('analytics', { name: 'prize_won', payload: prize });
  }

  reportSessionEnd(outcome: 'win' | 'lose', metadata?: Record<string, unknown>): void {
    if (window.parent && window.parent !== window) {
      try {
        window.parent.postMessage({ type: 'mla:sessionEnd', outcome, metadata }, '*');
      } catch (err) {
        console.warn('[TicketProvider] reportSessionEnd failed', err);
      }
    }

    EventBus.emit('analytics', { name: 'session_end', payload: { outcome, ...metadata } });
  }
}

export const TicketProvider = new TicketProviderImpl();
