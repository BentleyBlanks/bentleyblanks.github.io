import { INITIAL_ACTIVE_SLOTS, INITIAL_QUEUE_CAPACITY, INITIAL_REPUTATION, SAVE_KEY, xpToNextLevel } from '../content/balance';
import type { GameState } from '../types/state.types';

export function createInitialState(now = performance.now()): GameState {
  return {
    level: 1,
    xp: 0,
    xpToNext: xpToNextLevel(1),
    points: 0,
    totalCleared: 0,
    activeCustomers: [],
    queue: [],
    activeSlots: INITIAL_ACTIVE_SLOTS,
    queueCapacity: INITIAL_QUEUE_CAPACITY,
    reputation: INITIAL_REPUTATION,
    nextArrivalAt: now + 600,
    upgrades: {},
    skills: {},
    effects: {
      freezeIncomingUntil: 0,
      tipBoostUntil: 0,
      tipBoostMult: 1,
      magnetUntil: 0,
      extraHandsUntil: 0,
      extraHands: 0,
    },
    derived: {
      clearPerHit: 1,
      xpPerBadge: 1,
      payoutMult: 1,
      swipeEnabled: false,
      botCount: 0,
      botRatePerSec: 0,
      arrivalIntervalMs: 8_000,
    },
    botAccumulator: 0,
    lastTickAt: now,
    startedAt: now,
  };
}

export function loadState(): GameState | null {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw) as GameState;
    if (!parsed || typeof parsed.level !== 'number' || !Array.isArray(parsed.queue)) {
      return null;
    }
    parsed.lastTickAt = performance.now();
    parsed.nextArrivalAt = Math.min(parsed.nextArrivalAt || performance.now() + 1000, performance.now() + 4000);
    parsed.activeCustomers = parsed.activeCustomers ?? [];
    parsed.queue = parsed.queue ?? [];
    parsed.effects = parsed.effects ?? createInitialState().effects;
    return parsed;
  } catch {
    return null;
  }
}

export function saveState(state: GameState): void {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(state));
  } catch {
    // Storage can be disabled in private browsing; gameplay should continue.
  }
}

export function clearState(): void {
  localStorage.removeItem(SAVE_KEY);
}
