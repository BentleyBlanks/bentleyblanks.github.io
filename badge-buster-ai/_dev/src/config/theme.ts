// Visual constants. Logical design canvas is 1280×800; the world container is
// scaled to fit the viewport with letterboxing (see GameRoot).
export const WORLD_W = 1280;
export const WORLD_H = 800;

export const COLORS = {
  bg0: 0x0b1120,
  bg1: 0x16223f,
  desk0: 0x141d33,
  desk1: 0x0d1426,
  panel: 0x16213a,
  panel2: 0x1d2b48,
  line: 0x27375c,
  ink: 0xe8eefc,
  muted: 0x8ea0c4,
  dim: 0x5f7099,
  acc: 0x5ad0ff,
  acc2: 0x8a7bff,
  good: 0x46d39a,
  warn: 0xffcf5a,
  bad: 0xff6b6b,
  // tier tints
  invalid: 0x7c89a8,
  normal: 0x5ad0ff,
  high: 0xffcf5a,
  risk: 0xff6b6b,
  polluted: 0xc082ff,
} as const;

// Slot accent colors (§2 four mouths).
export const SLOT_COLOR = {
  valid: COLORS.good,
  invalid: COLORS.dim,
  risk: COLORS.bad,
  quarantine: COLORS.polluted,
} as const;

// Hand-feel parameters (§A.7) — first-pass tuning baseline.
export const FEEL = {
  badgeBounceMin: 1.2,
  badgeBounceMax: 1.8,
  burstParticleMin: 12,
  burstParticleMax: 24,
  cardFlyMin: 0.35,
  cardFlyMax: 0.6,
  dragLiftScale: 1.06,
  snapDist: 70, // §A.7 40–80 px
  furnaceEat: 0.35,
  floatTextHold: 0.35,
  glitchFlash: 0.45,
} as const;

// Performance budget (§A.8).
export const BUDGET = {
  maxCards: 30,
  maxBadges: 20,
  settleParticles: 80,
  maxFloatText: 30,
} as const;
