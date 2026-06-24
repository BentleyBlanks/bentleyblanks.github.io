// Visual constants. Logical design canvas is 1280×800; the world container is
// scaled to fit the viewport with letterboxing (see GameRoot).
//
// Art direction (2026-06): warm skeuomorphic desk. A walnut desk with a green
// leather blotter; information arrives as cream paper notes; the player sorts
// them on a brass sorting rack and hands the good ones to a living 宿主.
export const WORLD_W = 1280;
export const WORLD_H = 800;

export const COLORS = {
  // --- legacy keys, repurposed to warm tones so existing consumers re-tint ---
  bg0: 0x2a1d12, // deepest vignette
  bg1: 0x3d2a1a,
  desk0: 0x6f4e34, // walnut base
  desk1: 0x573c26, // walnut shadow
  panel: 0xe9dcbf, // parchment panel
  panel2: 0xdecfa6, // darker parchment
  line: 0xb89b6a, // brass-ish hairline
  ink: 0x33271a, // dark brown ink
  muted: 0x6f5b3f,
  dim: 0x9a855f,
  acc: 0xe8932f, // amber — the 算力 accent
  acc2: 0x2f8f86, // teal — secondary accent
  good: 0x4f9d6a,
  warn: 0xdca33a,
  bad: 0xd14b42,
  // tier tints (read on cream paper)
  invalid: 0x9a8f7a,
  normal: 0x3d7ea6,
  high: 0xcf8a2b,
  risk: 0xc0473e,
  polluted: 0x8a5cc0,

  // --- new warm-desk keys ---
  wood0: 0x6f4e34,
  wood1: 0x573c26,
  woodGrain: 0x7d5a3c,
  woodEdge: 0x412c1b,
  mat: 0x2f5249, // green leather blotter where cards land
  matEdge: 0x24403a,
  matHi: 0x3a6258,
  stitch: 0xc9a05f, // gold stitching on the blotter
  paper0: 0xf4e8cb, // card face cream
  paper1: 0xe9d8b2, // card lower / fold
  paperLine: 0xdcc89c,
  inkSoft: 0x7a6648,
  brass: 0xc69a4c,
  brassDark: 0x8a6a2f,
  brassHi: 0xe6c684,
  felt: 0x35615a,
  amber: 0xe8932f,
  amberHi: 0xf6c66a,
} as const;

// Slot accent colors (§2 four trays).
export const SLOT_COLOR = {
  valid: COLORS.good,
  invalid: COLORS.invalid,
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
