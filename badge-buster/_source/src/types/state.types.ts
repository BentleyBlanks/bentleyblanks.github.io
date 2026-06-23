// state.types.ts —— 运行时唯一数据源
import type { AppIconId } from './content.types';

export interface IconRuntime {
  id: AppIconId;
  badge: number;
  col: number;
  row: number;
}

export interface PhoneRuntime {
  icons: IconRuntime[];
  gridCols: number;
  gridRows: number;
  badgeTotal: number;        // 缓存总和；0 = 干净
  incomingRateMult: number;  // 该机被持续收新角标收入速率的系数
}

export type Mood = 'happy' | 'neutral' | 'annoyed' | 'angry';

export interface CustomerRuntime {
  id: string;
  defId: string;
  phone: PhoneRuntime;
  patience: number;          // 剩余耐心 ms
  maxPatience: number;
  mood: Mood;
  basePayout: number;
  arrivedAt: number;        // 进店时刻（耐心从此连续倒计时，不重置）
  serviceStartedAt: number; // 进入工作台开始服务的时刻（结算速度奖励用）
  // —— core 兜底写入（清除统计），shop 在结算时只读 ——
  clearedThisPhone: number;  // 本台累计被清掉的角标数
  startBadgeTotal: number;   // 进门时初始角标总数（用于参考）
}

export interface GameState {
  // 进度
  level: number;
  xp: number;
  xpToNext: number;
  points: number;
  totalCleared: number;

  // 店铺
  activeCustomers: CustomerRuntime[]; // 正在服务（长度 ≤ activeSlots）
  queue: CustomerRuntime[];           // 候客厅排队
  activeSlots: number;                // 同时可修台数
  queueCapacity: number;
  reputation: number;                 // 0..5 星
  nextArrivalAt: number;              // 下一位到店时间戳

  // 升级 / 技能
  upgrades: Record<string, number>;
  skills: Record<string, { unlocked: boolean; lastUsedAt: number }>;

  // 临时增益（skills 写）
  effects: {
    freezeIncomingUntil: number;
    tipBoostUntil: number;
    tipBoostMult: number;
    magnetUntil: number;
    extraHandsUntil: number;
    extraHands: number;
  };

  // 派生缓存（economy 唯一来源，余者只读）
  derived: {
    clearPerHit: number;
    xpPerBadge: number;
    payoutMult: number;
    swipeEnabled: boolean;
    botCount: number;
    botRatePerSec: number;
    arrivalIntervalMs: number;
  };

  botAccumulator: number;             // automation 写
  lastTickAt: number;                 // core 写
  startedAt: number;                  // core 写
}
