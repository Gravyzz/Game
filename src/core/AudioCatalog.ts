export type AudioCategory =
  | 'ui'
  | 'gameplay'
  | 'music'
  | 'wheel'
  | 'rhythm'
  | 'ambience';

export interface SfxVariant {
  path: string;
  volume?: number;
  pitch?: number;
}

export interface SfxConfig {
  category: Exclude<AudioCategory, 'music'>;
  variants: readonly SfxVariant[];
  volume: number;
  cooldownMs?: number;
  maxDurationMs?: number;
  fadeOutMs?: number;
  randomPitch?: number;
  randomVolume?: number;
  duckMusic?: number;
}

export interface MusicConfig {
  path: string;
  volume: number;
  loopStartRatio: number;
  loopEndRatio: number;
  crossfadeSec: number;
}

const audio = (path: string): string => `assets/audio/${path}`;
const variant = (path: string, volume = 1, pitch = 1): SfxVariant => ({
  path: audio(path),
  volume,
  pitch,
});

export const SFX_CATALOG = {
  tap: {
    category: 'ui',
    volume: 0.42,
    cooldownMs: 28,
    randomPitch: 0.018,
    randomVolume: 0.06,
    variants: [
      variant('ui/mixkit-video-game-retro-click-237.wav', 1),
      variant('ui/kenney-interface/click_001.ogg', 0.92),
      variant('ui/kenney-interface/click_002.ogg', 0.92),
      variant('ui/kenney-interface/click_003.ogg', 0.92),
      variant('ui/kenney-interface/click_004.ogg', 0.92),
    ],
  },
  select: {
    category: 'ui',
    volume: 0.48,
    cooldownMs: 45,
    randomPitch: 0.015,
    randomVolume: 0.05,
    variants: [
      variant('ui/mixkit-hard-pop-click-2364.wav', 1),
      variant('ui/kenney-interface/confirmation_001.ogg', 0.9),
      variant('ui/kenney-interface/confirmation_002.ogg', 0.86),
      variant('ui/kenney-interface/confirmation_003.ogg', 0.88),
      variant('ui/kenney-interface/confirmation_004.ogg', 0.88),
    ],
  },
  choice: {
    category: 'ui',
    volume: 0.5,
    cooldownMs: 60,
    randomPitch: 0.015,
    randomVolume: 0.05,
    variants: [
      variant('ui/mixkit-hard-pop-click-2364.wav', 1),
      variant('ui/mixkit-positive-interface-beep-221.wav', 0.95),
      variant('ui/kenney-interface/confirmation_001.ogg', 0.9),
      variant('ui/kenney-interface/confirmation_003.ogg', 0.9),
    ],
  },
  backCancel: {
    category: 'ui',
    volume: 0.48,
    cooldownMs: 60,
    randomPitch: 0.015,
    randomVolume: 0.05,
    variants: [
      variant('ui/kenney-interface/back_001.ogg'),
      variant('ui/kenney-interface/back_002.ogg'),
      variant('ui/kenney-interface/back_003.ogg'),
      variant('ui/kenney-interface/back_004.ogg'),
    ],
  },
  modalOpen: {
    category: 'ui',
    volume: 0.52,
    cooldownMs: 80,
    randomPitch: 0.01,
    randomVolume: 0.04,
    variants: [
      variant('ui/kenney-interface/open_001.ogg'),
      variant('ui/kenney-interface/open_002.ogg'),
      variant('ui/kenney-interface/open_003.ogg'),
      variant('transitions/mixkit-explainer-video-pops-whoosh-light-pop-3005.wav', 0.7),
    ],
  },
  modalClose: {
    category: 'ui',
    volume: 0.5,
    cooldownMs: 80,
    randomPitch: 0.01,
    randomVolume: 0.04,
    variants: [
      variant('ui/kenney-interface/close_001.ogg'),
      variant('ui/kenney-interface/close_002.ogg'),
      variant('ui/kenney-interface/close_003.ogg'),
      variant('ui/kenney-interface/close_004.ogg'),
    ],
  },
  muteToggle: {
    category: 'ui',
    volume: 0.45,
    cooldownMs: 120,
    randomPitch: 0.02,
    randomVolume: 0.05,
    variants: [
      variant('ui/switches/click1.wav', 0.8),
      variant('ui/switches/click2.wav', 0.8),
      variant('ui/switches/click3.wav', 0.8),
      variant('ui/switches/click4.wav', 0.8),
    ],
  },
  sessionStart: {
    category: 'ui',
    volume: 0.62,
    cooldownMs: 300,
    randomPitch: 0.008,
    randomVolume: 0.04,
    variants: [
      variant('ui/mixkit-unlock-game-notification-253.wav', 1),
      variant('rewards/mixkit-bonus-earned-in-video-game-2058.wav', 0.72),
    ],
  },
  good: {
    category: 'rhythm',
    volume: 0.64,
    cooldownMs: 35,
    randomPitch: 0.025,
    randomVolume: 0.08,
    variants: [
      variant('rhythm/mixkit-correct-positive-answer-949.wav', 1),
      variant('rhythm/mixkit-correct-positive-notification-957.wav', 0.92),
      variant('transitions/mixkit-electric-pop-2365.wav', 0.74),
    ],
  },
  perfect: {
    category: 'rhythm',
    volume: 0.72,
    cooldownMs: 40,
    randomPitch: 0.02,
    randomVolume: 0.08,
    variants: [
      variant('rhythm/mixkit-correct-answer-reward-952.wav', 1),
      variant('rhythm/mixkit-correct-answer-tone-2870.wav', 0.96),
      variant('rewards/mixkit-game-bonus-reached-2065.wav', 0.72),
    ],
  },
  miss: {
    category: 'gameplay',
    volume: 0.58,
    cooldownMs: 120,
    randomPitch: 0.018,
    randomVolume: 0.07,
    variants: [
      variant('rewards/mixkit-player-losing-or-failing-2042.wav', 1),
      variant('rewards/mixkit-long-game-over-notification-276.wav', 0.52),
    ],
  },
  win: {
    category: 'gameplay',
    volume: 0.66,
    cooldownMs: 220,
    randomPitch: 0.006,
    randomVolume: 0.04,
    duckMusic: 0.22,
    variants: [
      variant('rewards/mixkit-final-level-bonus-2061.wav', 1),
      variant('rewards/mixkit-completion-of-a-level-2063.wav', 0.92),
      variant('rewards/mixkit-game-bonus-reached-2065.wav', 0.86),
    ],
  },
  lose: {
    category: 'gameplay',
    volume: 0.62,
    cooldownMs: 250,
    randomPitch: 0.006,
    randomVolume: 0.04,
    duckMusic: 0.16,
    variants: [
      variant('rewards/mixkit-long-game-over-notification-276.wav', 1),
      variant('rewards/mixkit-player-losing-or-failing-2042.wav', 0.84),
    ],
  },
  wheelSpin: {
    category: 'wheel',
    volume: 0.52,
    cooldownMs: 700,
    maxDurationMs: 1050,
    fadeOutMs: 120,
    randomPitch: 0.012,
    randomVolume: 0.04,
    variants: [
      variant('wheel/victorabdo-spin-232536.mp3', 1),
    ],
  },
  wheelTick: {
    category: 'wheel',
    volume: 0.34,
    cooldownMs: 42,
    maxDurationMs: 48,
    fadeOutMs: 14,
    randomPitch: 0.032,
    randomVolume: 0.06,
    variants: [
      variant('wheel/freesound_community-wheel-spin-click-slow-down-101152.mp3', 1),
    ],
  },
  commonPrize: {
    category: 'wheel',
    volume: 0.8,
    cooldownMs: 250,
    randomPitch: 0.01,
    randomVolume: 0.04,
    variants: [variant('rewards/mixkit-winning-a-coin-video-game-2069.wav', 1)],
  },
  rarePrize: {
    category: 'wheel',
    volume: 0.88,
    cooldownMs: 250,
    randomPitch: 0.008,
    randomVolume: 0.04,
    duckMusic: 0.18,
    variants: [variant('rewards/mixkit-casino-bling-achievement-2067.wav', 1)],
  },
  epicPrize: {
    category: 'wheel',
    volume: 0.92,
    cooldownMs: 250,
    randomPitch: 0.006,
    randomVolume: 0.035,
    duckMusic: 0.22,
    variants: [variant('rewards/mixkit-winning-an-extra-bonus-2060.wav', 1)],
  },
  legendaryPrize: {
    category: 'wheel',
    volume: 1,
    cooldownMs: 350,
    randomPitch: 0.004,
    randomVolume: 0.02,
    duckMusic: 0.35,
    variants: [variant('rewards/High_Roller_s_Grin.mp3', 1)],
  },
  impact: {
    category: 'gameplay',
    volume: 0.44,
    cooldownMs: 105,
    maxDurationMs: 170,
    fadeOutMs: 34,
    randomPitch: 0.015,
    randomVolume: 0.06,
    variants: [variant('gameplay/mixkit-body-cutting-impact-2199.wav', 1)],
  },
  knifeSlice: {
    category: 'gameplay',
    volume: 0.36,
    cooldownMs: 105,
    maxDurationMs: 145,
    fadeOutMs: 26,
    randomPitch: 0.018,
    randomVolume: 0.06,
    variants: [
      variant('gameplay/mixkit-quick-knife-slice-cutting-2152.mp3', 1),
      variant('gameplay/mixkit-quick-knife-slice-cutting-2152(1).mp3', 0.96),
      variant('gameplay/mixkit-quick-saber-cut-2158.mp3', 0.9),
    ],
  },
  saberCut: {
    category: 'gameplay',
    volume: 0.36,
    cooldownMs: 115,
    maxDurationMs: 165,
    fadeOutMs: 30,
    randomPitch: 0.02,
    randomVolume: 0.06,
    variants: [
      variant('gameplay/mixkit-quick-saber-cut-2158.mp3', 1),
      variant('gameplay/mixkit-fast-sword-whoosh-2792.wav', 0.78),
    ],
  },
  heavyImpact: {
    category: 'gameplay',
    volume: 0.5,
    cooldownMs: 160,
    maxDurationMs: 260,
    fadeOutMs: 45,
    randomPitch: 0.015,
    randomVolume: 0.05,
    variants: [
      variant('gameplay/mixkit-strong-punches-to-the-body-2198.wav', 1),
      variant('gameplay/mixkit-metal-hit-woosh-1485.wav', 0.88),
    ],
  },
  transition: {
    category: 'ui',
    volume: 0.52,
    cooldownMs: 140,
    randomPitch: 0.012,
    randomVolume: 0.04,
    variants: [
      variant('transitions/mixkit-air-woosh-1489.wav', 1),
      variant('transitions/mixkit-explainer-video-pops-whoosh-light-pop-3005.wav', 0.72),
    ],
  },
  airHit: {
    category: 'gameplay',
    volume: 0.34,
    cooldownMs: 78,
    maxDurationMs: 125,
    fadeOutMs: 24,
    randomPitch: 0.02,
    randomVolume: 0.06,
    variants: [
      variant('transitions/mixkit-air-woosh-1489.wav', 0.9),
      variant('gameplay/mixkit-metal-hit-woosh-1485.wav', 0.42, 0.92),
    ],
  },
  bigTransition: {
    category: 'gameplay',
    volume: 0.78,
    cooldownMs: 250,
    randomPitch: 0.008,
    randomVolume: 0.04,
    duckMusic: 0.12,
    variants: [variant('transitions/mixkit-cinematic-whoosh-deep-impact-1143.mp3', 1)],
  },
  bubblePop: {
    category: 'gameplay',
    volume: 0.68,
    cooldownMs: 35,
    randomPitch: 0.035,
    randomVolume: 0.1,
    variants: [variant('transitions/mixkit-bubble-pop-up-alert-notification-2357.wav', 1)],
  },
  electricPop: {
    category: 'rhythm',
    volume: 0.68,
    cooldownMs: 35,
    randomPitch: 0.035,
    randomVolume: 0.1,
    variants: [variant('transitions/mixkit-electric-pop-2365.wav', 1)],
  },
  jump: {
    category: 'gameplay',
    volume: 0.52,
    cooldownMs: 85,
    randomPitch: 0.025,
    randomVolume: 0.08,
    variants: [
      variant('movement/mixkit-player-jumping-in-a-video-game-2043.wav', 1),
      variant('movement/mixkit-arcade-retro-jump-223.wav', 0.9),
    ],
  },
  bounce: {
    category: 'gameplay',
    volume: 0.62,
    cooldownMs: 35,
    randomPitch: 0.03,
    randomVolume: 0.1,
    variants: [variant('movement/mixkit-game-ball-tap-2073.wav', 1)],
  },
  danceStinger: {
    category: 'rhythm',
    volume: 0.72,
    cooldownMs: 400,
    randomPitch: 0.006,
    randomVolume: 0.04,
    variants: [variant('rhythm/mixkit-dancing-fit-45.mp3', 1)],
  },
} as const satisfies Record<string, SfxConfig>;

export const MUSIC_CATALOG = {
  menu: {
    path: audio('music/Pocket_Full_of_Tokens.mp3'),
    volume: 0.24,
    loopStartRatio: 0.12,
    loopEndRatio: 0.88,
    crossfadeSec: 0.12,
  },
  gameplay: {
    path: audio('music/Street_Racer_Hustle.mp3'),
    volume: 0.26,
    loopStartRatio: 0.1,
    loopEndRatio: 0.86,
    crossfadeSec: 0.1,
  },
  gameplayFallback: {
    path: audio('music/mixkit-game-level-music-689.wav'),
    volume: 0.22,
    loopStartRatio: 0.08,
    loopEndRatio: 0.88,
    crossfadeSec: 0.1,
  },
  relaxed: {
    path: audio('music/mixkit-karma-1183.mp3'),
    volume: 0.2,
    loopStartRatio: 0.12,
    loopEndRatio: 0.9,
    crossfadeSec: 0.14,
  },
  results: {
    path: audio('music/mixkit-love-787.mp3'),
    volume: 0.2,
    loopStartRatio: 0.1,
    loopEndRatio: 0.9,
    crossfadeSec: 0.14,
  },
  danger: {
    path: audio('music/Twelve_Ticks_Left.mp3'),
    volume: 0.3,
    loopStartRatio: 0.18,
    loopEndRatio: 0.84,
    crossfadeSec: 0.08,
  },
} as const satisfies Record<string, MusicConfig>;

export type SfxName = keyof typeof SFX_CATALOG;
export type MusicTrackName = keyof typeof MUSIC_CATALOG;

export const ALL_AUDIO_PATHS: string[] = (() => {
  const set = new Set<string>();
  for (const cfg of Object.values(SFX_CATALOG)) {
    for (const v of cfg.variants) set.add(v.path);
  }
  for (const cfg of Object.values(MUSIC_CATALOG)) {
    set.add(cfg.path);
  }
  return [...set];
})();

export const CORE_PRELOAD_SFX: SfxName[] = [
  'tap',
  'choice',
  'select',
  'backCancel',
  'modalOpen',
  'modalClose',
  'muteToggle',
  'good',
  'perfect',
  'miss',
  'win',
  'lose',
  'airHit',
  'wheelTick',
  'wheelSpin',
];
