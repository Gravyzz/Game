import {
  CORE_PRELOAD_SFX,
  MUSIC_CATALOG,
  SFX_CATALOG,
  type AudioCategory,
  type MusicTrackName,
  type SfxConfig,
  type SfxName,
  type SfxVariant,
} from '@core/AudioCatalog';

type AudioContextCtor = typeof AudioContext;

interface AnalysedBuffer {
  buffer: AudioBuffer;
  normalGain: number;
}

const CATEGORY_GAIN: Record<Exclude<AudioCategory, 'music'>, number> = {
  ui: 0.62,
  gameplay: 0.86,
  wheel: 0.82,
  rhythm: 0.78,
  ambience: 0.5,
};

const EPSILON_GAIN = 0.0001;

class SoundManagerImpl {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private musicGain: GainNode | null = null;
  private categoryGains: Partial<Record<Exclude<AudioCategory, 'music'>, GainNode>> = {};

  private muted = false;
  private musicStarted = false;
  private currentMusic: MusicTrackName | null = null;
  private musicSources: Array<AudioBufferSourceNode | OscillatorNode> = [];
  private musicTimers: number[] = [];
  private musicToken = 0;
  private musicBaseGain = 0.24;

  private readonly bufferCache = new Map<string, Promise<AudioBuffer>>();
  private readonly analysedSfxCache = new Map<string, Promise<AnalysedBuffer>>();
  private readonly lastPlayedAt = new Map<SfxName, number>();
  private readonly lastVariantByName = new Map<SfxName, string>();
  private readonly STORAGE_KEY = 'mla:muted';

  constructor() {
    try {
      const saved = localStorage.getItem(this.STORAGE_KEY);
      this.muted = saved === '1';
    } catch {
      this.muted = false;
    }
  }

  playSfx(name: SfxName): void {
    void this.playSfxAsync(name);
  }

  preloadCore(): void {
    if (!this.ensureContext()) return;
    for (const name of CORE_PRELOAD_SFX) {
      const config = SFX_CATALOG[name];
      for (const item of config.variants) {
        void this.getAnalysedSfx(item.path);
      }
    }
    void this.getBuffer(MUSIC_CATALOG.menu.path);
    void this.getBuffer(MUSIC_CATALOG.gameplay.path);
  }

  startMusic(track: MusicTrackName = 'menu'): void {
    if (this.muted) return;
    if (!this.ensureContext() || !this.ctx || !this.musicGain) return;
    if (this.musicStarted && this.currentMusic === track) return;

    this.stopMusic();
    this.musicStarted = true;
    this.currentMusic = track;

    const token = ++this.musicToken;
    const config = MUSIC_CATALOG[track];
    this.musicBaseGain = config.volume;
    this.rampGain(this.musicGain, config.volume, 0.35);

    void this.getBuffer(config.path)
      .then((buffer) => {
        if (!this.ctx || !this.musicGain || !this.musicStarted || this.musicToken !== token) return;
        this.scheduleMusic(buffer, config, token);
      })
      .catch((err) => {
        console.warn('[SoundManager] Music failed, using fallback synth', err);
        if (this.musicToken === token) this.startFallbackPad();
      });
  }

  stopMusic(): void {
    this.musicToken++;
    for (const timer of this.musicTimers) {
      window.clearTimeout(timer);
    }
    this.musicTimers = [];

    for (const source of this.musicSources) {
      try {
        source.stop();
      } catch {
        // Already stopped.
      }
      source.disconnect();
    }
    this.musicSources = [];
    this.musicStarted = false;
    this.currentMusic = null;
  }

  toggleMute(): boolean {
    this.muted = !this.muted;
    if (this.masterGain) {
      this.rampGain(this.masterGain, this.muted ? 0 : 0.8, 0.08);
    }
    if (this.muted) {
      this.stopMusic();
    } else {
      this.startMusic(this.currentMusic ?? 'menu');
    }

    try {
      localStorage.setItem(this.STORAGE_KEY, this.muted ? '1' : '0');
    } catch {
      // Ignore storage failures.
    }

    return this.muted;
  }

  isMuted(): boolean {
    return this.muted;
  }

  duckMusic(amount = 0.2, durationMs = 650): void {
    if (!this.ctx || !this.musicGain || !this.musicStarted || this.muted) return;
    const now = this.ctx.currentTime;
    const ducked = Math.max(0.05, this.musicBaseGain * (1 - amount));
    this.musicGain.gain.cancelScheduledValues(now);
    this.musicGain.gain.setValueAtTime(this.musicGain.gain.value, now);
    this.musicGain.gain.linearRampToValueAtTime(ducked, now + 0.05);
    this.musicGain.gain.linearRampToValueAtTime(this.musicBaseGain, now + durationMs / 1000);
  }

  private async playSfxAsync(name: SfxName): Promise<void> {
    if (this.muted) return;
    if (!this.ensureContext() || !this.ctx) return;

    const config: SfxConfig = SFX_CATALOG[name];
    if (!config) return;

    const nowMs = performance.now();
    const lastAt = this.lastPlayedAt.get(name) ?? -Infinity;
    if (config.cooldownMs && nowMs - lastAt < config.cooldownMs) return;
    this.lastPlayedAt.set(name, nowMs);

    const variant = this.pickVariant(name, config);
    try {
      const analysed = await this.getAnalysedSfx(variant.path);
      if (this.muted || !this.ctx) return;
      this.playBuffer(name, config, variant, analysed);
      if (config.duckMusic) this.duckMusic(config.duckMusic);
    } catch (err) {
      console.warn(`[SoundManager] SFX failed: ${name}`, err);
      this.playFallbackTone(name);
    }
  }

  private ensureContext(): boolean {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') {
        void this.ctx.resume();
      }
      return this.ctx.state !== 'closed';
    }

    try {
      const win = window as unknown as { AudioContext?: AudioContextCtor; webkitAudioContext?: AudioContextCtor };
      const Ctor = win.AudioContext ?? win.webkitAudioContext;
      if (!Ctor) return false;

      this.ctx = new Ctor();
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.value = this.muted ? 0 : 0.8;
      this.masterGain.connect(this.ctx.destination);

      this.musicGain = this.ctx.createGain();
      this.musicGain.gain.value = 0;
      this.musicGain.connect(this.masterGain);

      for (const category of Object.keys(CATEGORY_GAIN) as Exclude<AudioCategory, 'music'>[]) {
        const gain = this.ctx.createGain();
        gain.gain.value = CATEGORY_GAIN[category];
        gain.connect(this.masterGain);
        this.categoryGains[category] = gain;
      }

      queueMicrotask(() => this.preloadCore());
      return true;
    } catch (err) {
      console.warn('[SoundManager] AudioContext init failed', err);
      return false;
    }
  }

  private pickVariant(name: SfxName, config: SfxConfig): SfxVariant {
    if (config.variants.length === 1) return config.variants[0];

    const lastPath = this.lastVariantByName.get(name);
    const pool = config.variants.filter((item) => item.path !== lastPath);
    const chosen = pool[Math.floor(Math.random() * pool.length)] ?? config.variants[0];
    this.lastVariantByName.set(name, chosen.path);
    return chosen;
  }

  private playBuffer(
    _name: SfxName,
    config: SfxConfig,
    variant: SfxVariant,
    analysed: AnalysedBuffer,
  ): void {
    if (!this.ctx) return;
    const output = this.categoryGains[config.category];
    if (!output) return;

    const source = this.ctx.createBufferSource();
    source.buffer = analysed.buffer;
    const pitchJitter = this.randomRange(config.randomPitch ?? 0);
    source.playbackRate.value = Math.max(0.25, (variant.pitch ?? 1) * (1 + pitchJitter));

    const gain = this.ctx.createGain();
    const volumeJitter = 1 + this.randomRange(config.randomVolume ?? 0);
    gain.gain.value = Math.max(0, config.volume * (variant.volume ?? 1) * volumeJitter * analysed.normalGain);

    source.connect(gain);
    gain.connect(output);
    source.start();
  }

  private getBuffer(path: string): Promise<AudioBuffer> {
    const cached = this.bufferCache.get(path);
    if (cached) return cached;

    const promise = fetch(path)
      .then((res) => {
        if (!res.ok) throw new Error(`${res.status} ${res.statusText}: ${path}`);
        return res.arrayBuffer();
      })
      .then((data) => {
        if (!this.ctx) throw new Error('AudioContext is not ready');
        return this.ctx.decodeAudioData(data);
      });

    this.bufferCache.set(path, promise);
    return promise;
  }

  private getAnalysedSfx(path: string): Promise<AnalysedBuffer> {
    const cached = this.analysedSfxCache.get(path);
    if (cached) return cached;

    const promise = this.getBuffer(path).then((buffer) => {
      const trimmed = this.trimSilence(buffer);
      return {
        buffer: trimmed,
        normalGain: this.getNormalGain(trimmed),
      };
    });
    this.analysedSfxCache.set(path, promise);
    return promise;
  }

  private trimSilence(buffer: AudioBuffer): AudioBuffer {
    if (!this.ctx || buffer.duration > 8) return buffer;

    const threshold = 0.003;
    const paddingFrames = Math.floor(buffer.sampleRate * 0.008);
    let first = 0;
    let last = buffer.length - 1;

    outerFirst:
    for (let i = 0; i < buffer.length; i++) {
      for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
        if (Math.abs(buffer.getChannelData(ch)[i]) > threshold) {
          first = Math.max(0, i - paddingFrames);
          break outerFirst;
        }
      }
    }

    outerLast:
    for (let i = buffer.length - 1; i >= 0; i--) {
      for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
        if (Math.abs(buffer.getChannelData(ch)[i]) > threshold) {
          last = Math.min(buffer.length - 1, i + paddingFrames);
          break outerLast;
        }
      }
    }

    if (last <= first || first === 0 && last === buffer.length - 1) return buffer;

    const length = last - first + 1;
    const trimmed = this.ctx.createBuffer(buffer.numberOfChannels, length, buffer.sampleRate);
    for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
      trimmed.copyToChannel(buffer.getChannelData(ch).slice(first, last + 1), ch);
    }
    return trimmed;
  }

  private getNormalGain(buffer: AudioBuffer): number {
    let peak = 0;
    for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
      const data = buffer.getChannelData(ch);
      for (let i = 0; i < data.length; i += 32) {
        peak = Math.max(peak, Math.abs(data[i]));
      }
    }
    if (peak <= 0.01) return 1;
    return Math.min(1.6, Math.max(0.55, 0.85 / peak));
  }

  private scheduleMusic(buffer: AudioBuffer, config: (typeof MUSIC_CATALOG)[MusicTrackName], token: number): void {
    if (!this.ctx) return;

    const loopStart = this.clamp(buffer.duration * config.loopStartRatio, 0, Math.max(0, buffer.duration - 0.2));
    const loopEnd = this.clamp(buffer.duration * config.loopEndRatio, loopStart + 0.2, buffer.duration);
    const crossfade = Math.min(config.crossfadeSec, Math.max(0.03, (loopEnd - loopStart) * 0.25));
    const firstDuration = loopEnd;
    const loopDuration = loopEnd - loopStart;
    const now = this.ctx.currentTime + 0.04;

    this.scheduleMusicSource(buffer, 0, firstDuration, now, 0.2, crossfade);

    const scheduleNext = (startAt: number): void => {
      if (!this.ctx || !this.musicStarted || this.musicToken !== token) return;
      this.scheduleMusicSource(buffer, loopStart, loopDuration, startAt, crossfade, crossfade);

      const nextAt = startAt + loopDuration - crossfade;
      const msUntilNext = Math.max(20, (nextAt - this.ctx.currentTime - 0.05) * 1000);
      const timer = window.setTimeout(() => scheduleNext(nextAt), msUntilNext);
      this.musicTimers.push(timer);
    };

    const firstLoopAt = now + firstDuration - crossfade;
    const firstTimer = window.setTimeout(
      () => scheduleNext(firstLoopAt),
      Math.max(20, (firstLoopAt - this.ctx.currentTime - 0.05) * 1000),
    );
    this.musicTimers.push(firstTimer);
  }

  private scheduleMusicSource(
    buffer: AudioBuffer,
    offset: number,
    duration: number,
    startAt: number,
    fadeInSec: number,
    fadeOutSec: number,
  ): void {
    if (!this.ctx || !this.musicGain) return;

    const source = this.ctx.createBufferSource();
    const gain = this.ctx.createGain();
    source.buffer = buffer;
    source.connect(gain);
    gain.connect(this.musicGain);

    const fadeIn = Math.min(fadeInSec, duration * 0.4);
    const fadeOut = Math.min(fadeOutSec, duration * 0.4);
    gain.gain.setValueAtTime(fadeIn > 0 ? EPSILON_GAIN : 1, startAt);
    if (fadeIn > 0) {
      gain.gain.setValueCurveAtTime(this.fadeCurve('in'), startAt, fadeIn);
    }
    const fadeOutAt = startAt + duration - fadeOut;
    if (fadeOut > 0) {
      gain.gain.setValueAtTime(1, Math.max(startAt, fadeOutAt - 0.001));
      gain.gain.setValueCurveAtTime(this.fadeCurve('out'), fadeOutAt, fadeOut);
    }

    source.start(startAt, offset, duration);
    source.stop(startAt + duration + 0.02);
    source.onended = () => {
      const index = this.musicSources.indexOf(source);
      if (index >= 0) this.musicSources.splice(index, 1);
      source.disconnect();
      gain.disconnect();
    };
    this.musicSources.push(source);
  }

  private fadeCurve(direction: 'in' | 'out'): Float32Array {
    const steps = 32;
    const curve = new Float32Array(steps);
    for (let i = 0; i < steps; i++) {
      const t = i / (steps - 1);
      const value = direction === 'in'
        ? Math.sin(t * Math.PI * 0.5)
        : Math.cos(t * Math.PI * 0.5);
      curve[i] = Math.max(EPSILON_GAIN, value);
    }
    return curve;
  }

  private startFallbackPad(): void {
    if (!this.ctx || !this.musicGain) return;
    this.rampGain(this.musicGain, 0.18, 0.25);
    for (const freq of [110, 165, 220]) {
      const osc = this.ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.value = freq;
      const filter = this.ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 750;
      const gain = this.ctx.createGain();
      gain.gain.value = 0.12;
      osc.connect(filter);
      filter.connect(gain);
      gain.connect(this.musicGain);
      osc.start();
      this.musicSources.push(osc);
    }
  }

  private playFallbackTone(name: SfxName): void {
    if (!this.ctx) return;
    const output = this.categoryGains.ui;
    if (!output) return;

    const frequencies: Partial<Record<SfxName, number[]>> = {
      tap: [920],
      choice: [620, 820],
      select: [820, 1040],
      miss: [180, 90],
      win: [523, 659, 784],
      lose: [400, 320, 240],
      wheelTick: [1200],
    };
    const notes = frequencies[name] ?? [600];
    notes.forEach((freq, i) => {
      if (!this.ctx) return;
      const startAt = this.ctx.currentTime + i * 0.055;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'square';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0, startAt);
      gain.gain.linearRampToValueAtTime(0.14, startAt + 0.005);
      gain.gain.exponentialRampToValueAtTime(EPSILON_GAIN, startAt + 0.08);
      osc.connect(gain);
      gain.connect(output);
      osc.start(startAt);
      osc.stop(startAt + 0.1);
    });
  }

  private rampGain(gain: GainNode, value: number, durationSec: number): void {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    gain.gain.cancelScheduledValues(now);
    gain.gain.setValueAtTime(Math.max(EPSILON_GAIN, gain.gain.value), now);
    gain.gain.linearRampToValueAtTime(value, now + durationSec);
  }

  private randomRange(amount: number): number {
    if (amount <= 0) return 0;
    return (Math.random() * 2 - 1) * amount;
  }

  private clamp(value: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, value));
  }
}

export const SoundManager = new SoundManagerImpl();
export type { MusicTrackName, SfxName };
