import type { AppIconId } from './content.types';

export interface IconRuntime {
  id: string;
  appId: AppIconId;
  badge: number;
  col: number;
  row: number;
}

export type PhoneSystemRuntime = 'ios' | 'android';

export interface PhoneRuntime {
  id: string;
  system: PhoneSystemRuntime;
  icons: IconRuntime[];
  gridCols: number;
  gridRows: number;
  badgeTotal: number;
  incomingRateMult: number;
  incomingAccumulatorMs: number;
  adNotifications: number;
  notificationAccumulatorMs: number;
  junkMb: number;
  memoryLoad: number;
  backgroundApps: number;
  utilityAccumulatorMs: number;
  cleaned: boolean;
}

export type Mood = 'happy' | 'neutral' | 'annoyed' | 'angry';

export interface CustomerRuntime {
  id: string;
  defId: string;
  phone: PhoneRuntime;
  patience: number;
  maxPatience: number;
  mood: Mood;
  basePayout: number;
  arrivedAt: number;
  serviceStartedAt: number;
  clearedBadges: number;
  startedBadgeTotal: number;
}

export interface GameState {
  level: number;
  xp: number;
  xpToNext: number;
  points: number;
  totalCleared: number;

  activeCustomers: CustomerRuntime[];
  queue: CustomerRuntime[];
  activeSlots: number;
  queueCapacity: number;
  reputation: number;
  nextArrivalAt: number;

  upgrades: Record<string, number>;
  skills: Record<string, { unlocked: boolean; lastUsedAt: number }>;

  effects: {
    freezeIncomingUntil: number;
    tipBoostUntil: number;
    tipBoostMult: number;
    magnetUntil: number;
    extraHandsUntil: number;
    extraHands: number;
  };

  derived: {
    clearPerHit: number;
    xpPerBadge: number;
    payoutMult: number;
    swipeEnabled: boolean;
    botCount: number;
    botRatePerSec: number;
    arrivalIntervalMs: number;
    adClearPower: number;
    junkClearMb: number;
    memoryClearPower: number;
    backgroundClearPower: number;
  };

  botAccumulator: number;
  lastTickAt: number;
  startedAt: number;
}
