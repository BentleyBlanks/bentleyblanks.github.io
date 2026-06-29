// Intelligence is now a pure level track. Data (经验) levels it up; each level
// only does two things: grant a global compute multiplier, and open new shelves
// in the skill shop (skills whose requiredLevel == this level become buyable).
// Tier 升维 and automation are NOT here anymore — those are milestone *skills*
// the player buys with compute. See content/skills.ts.
import { content } from "./i18n";

export interface IntelligenceLevelConfig {
  level: number;
  xpToNext: string;
  multiplier: number;
}

// 数值已抽到语言包（locales/<lang>.json 的 intelligence）。
export const INTELLIGENCE_LEVELS = content().intelligence.INTELLIGENCE_LEVELS as unknown as IntelligenceLevelConfig[];

export const MAX_INTELLIGENCE_LEVEL = INTELLIGENCE_LEVELS[INTELLIGENCE_LEVELS.length - 1].level;

export function getLevelConfig(level: number): IntelligenceLevelConfig {
  return INTELLIGENCE_LEVELS.find((entry) => entry.level === level) ?? INTELLIGENCE_LEVELS[INTELLIGENCE_LEVELS.length - 1];
}

