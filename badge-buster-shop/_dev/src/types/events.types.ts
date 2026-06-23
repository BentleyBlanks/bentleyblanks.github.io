import type { AppIconId } from './content.types';
import type { Mood } from './state.types';

export type GameEvent =
  | { type: 'TAP'; x: number; y: number }
  | { type: 'SWIPE'; path: { x: number; y: number }[] }
  | { type: 'BADGE_CLEARED'; customerId: string; iconId: AppIconId; amount: number; x: number; y: number }
  | { type: 'XP_GAINED'; amount: number }
  | { type: 'LEVEL_UP'; level: number }
  | { type: 'CUSTOMER_ARRIVED'; customerId: string }
  | { type: 'PHONE_CLEANED'; customerId: string }
  | { type: 'PHONE_SMASHED'; customerId: string; x: number; y: number; iconCount: number; totalBadges: number }
  | { type: 'PHONE_RETURNED'; customerId: string; payout: number; xp: number; mood: Mood }
  | { type: 'CUSTOMER_LEFT'; customerId: string; reason: 'angry' | 'overflow' }
  | { type: 'REPUTATION_CHANGED'; value: number }
  | { type: 'BUY_UPGRADE'; id: string }
  | { type: 'UPGRADE_PURCHASED'; id: string; newLevel: number }
  | { type: 'USE_SKILL'; id: string }
  | { type: 'SKILL_USED'; id: string }
  | { type: 'SKILL_UNLOCKED'; id: string }
  | { type: 'TICK'; dt: number };

export interface EventBus {
  on<T extends GameEvent['type']>(type: T, handler: (e: Extract<GameEvent, { type: T }>) => void): () => void;
  emit(e: GameEvent): void;
}
