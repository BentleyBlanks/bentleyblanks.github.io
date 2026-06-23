import type { AppIconId } from './content.types';

export interface IconRuntime {
  id: string;
  appId: AppIconId;
  badge: number;
  col: number;
  row: number;
}

export type PhoneSystemRuntime = 'ios' | 'android';

export type PopupKind = 'ad' | 'scam' | 'offer' | 'bait' | 'timed';

/** 特殊手机类型：普通 / 黄金(高收益易碎) / 灵魂(掉声誉但可白嫖技能) / 宇宙魔方(会变形砸店) */
export type PhoneVariant = 'normal' | 'golden' | 'soul' | 'cosmic';

/** 弹窗运动：静止 / 躲避光标 / 像泡泡乱滚 */
export type PopupMotion = 'none' | 'dodge' | 'bubble';

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
  motion: PopupMotion; // 恶心移动：躲避光标 / 泡泡乱滚
  vx: number;          // bubble 速度（屏幕比例/秒）
  vy: number;
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
  // 屏幕中央的遮挡弹窗（广告/诈骗）：只要存在就整机禁清，必须先关掉
  popups: PhonePopup[];
  popupAccumulatorMs: number;
  scamAccumulatorMs: number;
  // 顶部通知栏广告：下拉通知栏逐条清理
  notifications: number;
  notificationAccumulatorMs: number;
  // 后台恶意软件 0..100：堆高会让手机卡顿，到阈值后无法清角标，需点"清理后台"
  malware: number;
  malwareAccumulatorMs: number;
  // —— 肉鸽/盲盒层 ——
  tier: number;                  // 手机档次（随玩家等级升高），影响身价与赔款
  variant: PhoneVariant;
  transformMs: number;           // cosmic 变形倒计时（剩余 ms），非 cosmic = Infinity
  offerAccumulatorMs: number;    // 盲盒"帮清理垃圾"邀约节奏
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
  bankedFloor: number; // 已入账本金保底线（现金峰值的 60%）：罚款永不把现金压到此线以下
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
    notificationClearPower: number; // 每次下拉清理的通知数
    malwareClearPower: number;      // 每次点"清理后台"降低的恶意软件值
    malwareAutoPerSec: number;      // 安全卫士被动每秒自动清理
  };

  /** 瞬时 UI 状态（不持久化）：当前画布弹窗面板 + 手指光标位置。 */
  ui: {
    modal: ModalKind;
    focusedSlot: number; // 移动端单机聚焦：当前正在大屏操作的工位下标
    cursor: { x: number; y: number; pressed: boolean; visible: boolean };
  };

  botAccumulator: number;
  lastTickAt: number;
  startedAt: number;
}
