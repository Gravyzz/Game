/**
 * Менеджер звука Make Love Adventures.
 *
 * Принципы:
 * - Web Audio API напрямую (без Phaser sound, чтобы не тащить декодер аудиофайлов)
 * - SFX генерируются на лету (синтез через осцилляторы) — НИКАКИХ mp3/wav в бандле
 * - AudioContext создаётся лениво при первом пользовательском жесте
 *   (требование Safari/Chrome — без жеста контекст в suspended state)
 * - Глобальный mute через флаг + LocalStorage
 * - Фоновый трек — пока заглушка (бесконечный chord pad)
 *
 * В Phase 4.5 — все звуки синтетические. Когда заказчик даст реальный трек,
 * заменяем только метод playMusic() на загрузку и луп MP3.
 */

type SfxName =
  | 'tap'
  | 'perfect'
  | 'good'
  | 'miss'
  | 'win'
  | 'lose'
  | 'wheelTick'
  | 'wheelSpin'
  | 'choice'
  | 'sessionStart';

class SoundManagerImpl {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private musicGain: GainNode | null = null;
  private sfxGain: GainNode | null = null;

  private muted = false;
  private musicNodes: OscillatorNode[] = [];
  private musicStarted = false;

  private readonly STORAGE_KEY = 'mla:muted';

  constructor() {
    // Восстанавливаем mute-состояние
    try {
      const saved = localStorage.getItem(this.STORAGE_KEY);
      if (saved === '1') this.muted = true;
    } catch {
      // localStorage может быть недоступен в приватном режиме Safari — игнорируем
    }
  }

  /**
   * Лениво создаёт AudioContext. Вызывается из любого пользовательского жеста.
   * Возвращает true, если контекст готов к работе.
   */
  private ensureContext(): boolean {
    if (this.ctx) {
      // Если контекст suspended (Safari) — будим его
      if (this.ctx.state === 'suspended') {
        this.ctx.resume().catch(() => {/* ничего не делаем */});
      }
      return this.ctx.state === 'running';
    }

    try {
      const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return false;
      this.ctx = new Ctor();

      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.value = this.muted ? 0 : 0.8;
      this.masterGain.connect(this.ctx.destination);

      this.musicGain = this.ctx.createGain();
      this.musicGain.gain.value = 0.25; // музыка тише SFX
      this.musicGain.connect(this.masterGain);

      this.sfxGain = this.ctx.createGain();
      this.sfxGain.gain.value = 0.6;
      this.sfxGain.connect(this.masterGain);

      return true;
    } catch (err) {
      console.warn('[SoundManager] AudioContext init failed', err);
      return false;
    }
  }

  /** Один SFX — короткий синтезированный звук */
  playSfx(name: SfxName): void {
    if (this.muted) return;
    if (!this.ensureContext() || !this.ctx || !this.sfxGain) return;

    const now = this.ctx.currentTime;

    switch (name) {
      case 'tap':         this.playTone({ freq: 720, dur: 0.05, type: 'square',   gain: 0.18, attack: 0.005, decay: 0.04 }); break;
      case 'perfect':     this.playChord([880, 1320, 1760],          0.18, 'triangle', 0.22); break;
      case 'good':        this.playChord([660, 990],                 0.14, 'triangle', 0.18); break;
      case 'miss':        this.playTone({ freq: 180, dur: 0.18, type: 'sawtooth', gain: 0.14, attack: 0.005, decay: 0.16, sweepTo: 90 }); break;
      case 'win':         this.playSequence([523, 659, 784, 1046],   0.12, 'triangle', 0.22); break;
      case 'lose':        this.playSequence([400, 320, 240],         0.18, 'sawtooth', 0.18); break;
      case 'wheelTick':   this.playTone({ freq: 1200, dur: 0.025, type: 'square',  gain: 0.12, attack: 0.001, decay: 0.022 }); break;
      case 'wheelSpin':   this.playTone({ freq: 600, dur: 0.6, type: 'sawtooth',  gain: 0.12, attack: 0.05, decay: 0.55, sweepTo: 200 }); break;
      case 'choice':      this.playChord([523, 659], 0.1, 'sine', 0.16); break;
      case 'sessionStart':this.playSequence([440, 554, 659, 880], 0.1, 'square', 0.2); break;
      default:
        // По дефолту — мягкий клик
        this.playTone({ freq: 600, dur: 0.05, type: 'sine', gain: 0.15, attack: 0.005, decay: 0.045 });
    }
    void now; // unused-warning suppressor
  }

  /** Простой тон — основной строительный блок SFX */
  private playTone(opts: {
    freq: number;
    dur: number;
    type: OscillatorType;
    gain: number;
    attack: number;
    decay: number;
    sweepTo?: number;
  }): void {
    if (!this.ctx || !this.sfxGain) return;
    const now = this.ctx.currentTime;

    const osc = this.ctx.createOscillator();
    osc.type = opts.type;
    osc.frequency.setValueAtTime(opts.freq, now);
    if (opts.sweepTo !== undefined) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(opts.sweepTo, 1), now + opts.dur);
    }

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(opts.gain, now + opts.attack);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + opts.attack + opts.decay);

    osc.connect(gain);
    gain.connect(this.sfxGain);

    osc.start(now);
    osc.stop(now + opts.attack + opts.decay + 0.05);
  }

  /** Аккорд — несколько частот одновременно */
  private playChord(freqs: number[], dur: number, type: OscillatorType, gain: number): void {
    for (const f of freqs) {
      this.playTone({ freq: f, dur, type, gain: gain / freqs.length, attack: 0.005, decay: dur });
    }
  }

  /** Последовательность нот */
  private playSequence(freqs: number[], stepDur: number, type: OscillatorType, gain: number): void {
    if (!this.ctx) return;
    const startNow = this.ctx.currentTime;
    freqs.forEach((f, i) => {
      const playAt = i * stepDur;
      // Используем setTimeout для простоты — для коротких SFX точность приемлемая
      setTimeout(() => {
        if (!this.ctx) return;
        this.playTone({ freq: f, dur: stepDur, type, gain, attack: 0.005, decay: stepDur * 0.9 });
      }, playAt * 1000);
    });
    void startNow;
  }

  /**
   * Запускаем фоновую «музыку».
   * В Phase 4.5 — это синтезированный пад из 3 нот, медленно пульсирующих.
   * Когда придёт реальный трек, заменяем на decodeAudioData → BufferSource с loop=true.
   */
  startMusic(): void {
    if (this.muted) return;
    if (this.musicStarted) return;
    if (!this.ensureContext() || !this.ctx || !this.musicGain) return;

    this.musicStarted = true;

    // Пад: A2 + E3 + A3 (мажорный пятый интервал). Плюс лёгкий sub-bass.
    const freqs = [110, 165, 220];
    for (const f of freqs) {
      const osc = this.ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.value = f;

      const filter = this.ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 800;
      filter.Q.value = 1;

      const gain = this.ctx.createGain();
      gain.gain.value = 0.15;

      osc.connect(filter);
      filter.connect(gain);
      gain.connect(this.musicGain);

      osc.start();
      this.musicNodes.push(osc);

      // Лёгкое LFO на громкости — дышащий эффект
      const lfo = this.ctx.createOscillator();
      lfo.frequency.value = 0.15 + Math.random() * 0.1;
      const lfoGain = this.ctx.createGain();
      lfoGain.gain.value = 0.04;
      lfo.connect(lfoGain);
      lfoGain.connect(gain.gain);
      lfo.start();
      this.musicNodes.push(lfo);
    }
  }

  stopMusic(): void {
    if (!this.musicStarted) return;
    for (const node of this.musicNodes) {
      try {
        node.stop();
        node.disconnect();
      } catch {
        // Уже остановлен — игнорируем
      }
    }
    this.musicNodes = [];
    this.musicStarted = false;
  }

  toggleMute(): boolean {
    this.muted = !this.muted;
    if (this.masterGain) {
      this.masterGain.gain.value = this.muted ? 0 : 0.8;
    }
    try {
      localStorage.setItem(this.STORAGE_KEY, this.muted ? '1' : '0');
    } catch {
      // ignore
    }
    return this.muted;
  }

  isMuted(): boolean {
    return this.muted;
  }
}

export const SoundManager = new SoundManagerImpl();
