// content.types.ts —— 静态配置形状（冻结，只读）
export type AppIconId = string;

export interface AppIconDef {
  id: AppIconId;
  name: string;
  artId: string;         // 引用资产 ID（见 manifest）
  fallbackColor: string; // 资产未就绪时的占位底色
  fallbackGlyph: string; // 占位字符，如 "💬"
  spawnWeight: number;   // 该 App 长角标的相对频率（社交类调高更折磨）
  maxBadge: number;
}

export type UpgradeCategory =
  | 'clear' | 'value' | 'auto' | 'slot'
  | 'queue' | 'patience' | 'swipe' | 'payout';

export interface UpgradeDef {
  id: string;
  name: string;
  desc: string;
  category: UpgradeCategory;
  artId: string;
  baseCost: number;
  costGrowth: number;
  maxLevel: number; // 0 = 无限
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
  artId: string;                      // 角色立绘 ID（含情绪四态）
  patienceMs: number;                 // 最长耐心
  basePayout: number;                 // 基础酬金权重（每角标硬币系数）
  startBadgeRange: [number, number];  // 进门时手机初始角标总数范围
}
