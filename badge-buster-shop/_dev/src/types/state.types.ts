import type { AppIconId } from './content.types';

export interface IconRuntime {
  id: string;
  appId: AppIconId;
  badge: number;
  col: number;
  row: number;
}

export type PhoneSystemRuntime = 'ios' | 'android';

export type PopupKind = 'ad' | 'scam';

/** 手机屏幕上的弹窗。位置以屏幕矩形的比例(0..1)存储，渲染/命中均按比例换算，跟随布局缩放。 */
export interface PhonePopup {
  id: string;
  kind: PopupKind;
  fx: number; // 左上角 x（占屏幕宽比例）
  fy: number;
  fw: number; // 宽（占屏幕宽比例）
  fh: number;
  closeFx: number; // ✕ 关闭键左上角（占弹窗自身比例）
  closeFy: number;
  closeFw: number;
  closeFh: number;
  bornAt: number;
  installAt: number; // scam：到点自动安装并罚款；ad：Infinity
  title: string;
  body: string;
  accent: string;
}

export interface PhoneRuntime {
  id: string;
  system: PhoneSystemRuntime;
  icons: IconRuntime[];
  gridCols: number;
  gridRows: number;
  badgeTotal: number;
  incomingRateMult: number;
  incomingAccumulatorMs: number;
  popups: PhonePopup[];
  popupAccumulatorMs: number;
  scamAccumulatorMs: number;
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

export type ModalKind = 'none' | 'shop' | 'skills' | 'settings';

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
    adSpawnIntervalMs: number;
    scamSpawnIntervalMs: number;
    scamGraceMs: number;
  };

  /** 瞬时 UI 状态（不持久化）：当前打开的画布弹窗面板。 */
  ui: { modal: ModalKind };

  botAccumulator: number;
  lastTickAt: number;
  startedAt: number;
}
