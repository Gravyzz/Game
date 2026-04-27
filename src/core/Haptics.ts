/**
 * Тактильный фидбэк через Vibration API.
 *
 * Поддержка:
 * - Android Chrome: ✅ работает
 * - iOS Safari:     ❌ Apple запретили navigator.vibrate (молча игнорируется)
 *   На iOS позже можно добавить Web Haptics через AudioContext + специальный
 *   паттерн, но это пострелизный апдейт.
 *
 * Все паттерны короткие — длинные вибрации раздражают.
 */

type HapticName = 'tap' | 'perfect' | 'good' | 'miss' | 'win' | 'lose' | 'wheelTick';

const PATTERNS: Record<HapticName, number | number[]> = {
  tap:        15,
  perfect:    [10, 30, 20],
  good:       20,
  miss:       [40, 30, 40],
  win:        [40, 50, 40, 50, 80],
  lose:       [60, 40, 60],
  wheelTick:  8,
};

class HapticsImpl {
  private enabled = true;
  private supported: boolean;
  private readonly STORAGE_KEY = 'mla:hapticsOff';

  constructor() {
    this.supported = typeof navigator !== 'undefined' && 'vibrate' in navigator;
    try {
      const saved = localStorage.getItem(this.STORAGE_KEY);
      if (saved === '1') this.enabled = false;
    } catch {
      // ignore
    }
  }

  trigger(name: HapticName): void {
    if (!this.enabled || !this.supported) return;
    try {
      navigator.vibrate(PATTERNS[name]);
    } catch {
      // Некоторые мобильные браузеры режут vibrate в фоне — молча
    }
  }

  toggle(): boolean {
    this.enabled = !this.enabled;
    try {
      localStorage.setItem(this.STORAGE_KEY, this.enabled ? '0' : '1');
    } catch {
      // ignore
    }
    return this.enabled;
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  isSupported(): boolean {
    return this.supported;
  }
}

export const Haptics = new HapticsImpl();
