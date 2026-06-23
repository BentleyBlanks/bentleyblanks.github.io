export type AppIconId = string;

export interface AppIconDef {
  id: AppIconId;
  name: string;
  artId: string;
  fallbackColor: string;
  fallbackGlyph: string;
  spawnWeight: number;
  maxBadge: number;
}

export type UpgradeCategory =
  | 'clear'
  | 'value'
  | 'auto'
  | 'slot'
  | 'queue'
  | 'patience'
  | 'swipe'
  | 'payout';

export interface UpgradeDef {
  id: string;
  name: string;
  desc: string;
  category: UpgradeCategory;
  artId: string;
  baseCost: number;
  costGrowth: number;
  maxLevel: number;
  effect: (level: number) => number;
}

export type SkillEffect =
  | { kind: 'clearActivePhone' }
  | { kind: 'freezeIncoming'; durationMs: number }
  | { kind: 'sootheQueue' }
  | { kind: 'extraHands'; hands: number; durationMs: number }
  | { kind: 'tipBoost'; mult: number; durationMs: number }
  | { kind: 'magnet'; durationMs: number };

export interface SkillDef {
  id: string;
  name: string;
  desc: string;
  artId: string;
  unlockLevel: number;
  cooldownMs: number;
  effect: SkillEffect;
}

export interface CustomerDef {
  id: string;
  name: string;
  artId: string;
  patienceMs: number;
  basePayout: number;
  startBadgeRange: [number, number];
}
