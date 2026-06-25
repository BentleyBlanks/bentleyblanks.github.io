// Intelligence is now a pure level track. Data (经验) levels it up; each level
// only does two things: grant a global compute multiplier, and open new shelves
// in the skill shop (skills whose requiredLevel == this level become buyable).
// Tier 升维 and automation are NOT here anymore — those are milestone *skills*
// the player buys with compute. See content/skills.ts.
export interface IntelligenceLevelConfig {
  level: number;
  xpToNext: string;
  multiplier: number;
}

export const INTELLIGENCE_LEVELS: IntelligenceLevelConfig[] = [
  { level: 1, xpToNext: "24", multiplier: 1.0 },
  { level: 2, xpToNext: "42", multiplier: 1.12 },
  { level: 3, xpToNext: "70", multiplier: 1.26 },
  { level: 4, xpToNext: "112", multiplier: 1.42 },
  { level: 5, xpToNext: "180", multiplier: 1.6 },
  { level: 6, xpToNext: "290", multiplier: 1.8 },
  { level: 7, xpToNext: "470", multiplier: 2.03 },
  { level: 8, xpToNext: "760", multiplier: 2.3 },
  { level: 9, xpToNext: "1200", multiplier: 2.6 },
  { level: 10, xpToNext: "1900", multiplier: 2.95 },
  { level: 11, xpToNext: "3050", multiplier: 3.35 },
  { level: 12, xpToNext: "4850", multiplier: 3.8 },
  { level: 13, xpToNext: "7600", multiplier: 4.3 },
  { level: 14, xpToNext: "11800", multiplier: 4.9 },
  { level: 15, xpToNext: "18500", multiplier: 5.6 },
  { level: 16, xpToNext: "29000", multiplier: 6.4 },
  { level: 17, xpToNext: "45000", multiplier: 7.3 },
  { level: 18, xpToNext: "70000", multiplier: 8.4 },
  { level: 19, xpToNext: "108000", multiplier: 9.6 },
  { level: 20, xpToNext: "1e100", multiplier: 11.0 }
];

export const MAX_INTELLIGENCE_LEVEL = INTELLIGENCE_LEVELS[INTELLIGENCE_LEVELS.length - 1].level;

export function getLevelConfig(level: number): IntelligenceLevelConfig {
  return INTELLIGENCE_LEVELS.find((entry) => entry.level === level) ?? INTELLIGENCE_LEVELS[INTELLIGENCE_LEVELS.length - 1];
}
