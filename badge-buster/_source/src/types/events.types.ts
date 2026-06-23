// events.types.ts —— 模块间唯一通信通道
import type { AppIconId } from './content.types';
import type { Mood } from './state.types';

export type GameEvent =
  | { type: 'TAP'; x: number; y: number }
  | { type: 'SWIPE'; path: { x: number; y: number }[] }
  // 清除请求 + 通知：任何模块想清角标都发它，core 兜底落地（唯一改 badge 者）
  | { type: 'BADGE_CLEARED'; customerId: string; iconId: AppIconId; amount: number; x: number; y: number }
  | { type: 'XP_GAINED'; amount: number }
  | { type: 'LEVEL_UP'; level: number }
  | { type: 'CUSTOMER_ARRIVED'; customerId: string }
  | { type: 'PHONE_CLEANED'; customerId: string }                 // 擦净角标=0（core 发）
  | { type: 'PHONE_RETURNED'; customerId: string; payout: number; xp: number; mood: Mood }
  | { type: 'CUSTOMER_LEFT'; customerId: string; reason: 'angry' | 'overflow' }
  | { type: 'REPUTATION_CHANGED'; value: number }
  | { type: 'BUY_UPGRADE'; id: string }                           // UI 意图
  | { type: 'UPGRADE_PURCHASED'; id: string; newLevel: number }
  | { type: 'USE_SKILL'; id: string }                             // UI 意图
  | { type: 'SKILL_USED'; id: string }
  | { type: 'SKILL_UNLOCKED'; id: string }
  | { type: 'TICK'; dt: number };

export type GameEventType = GameEvent['type'];

export interface EventBus {
  on<T extends GameEventType>(
    type: T,
    handler: (e: Extract<GameEvent, { type: T }>) => void
  ): () => void;
  emit(e: GameEvent): void;
}
