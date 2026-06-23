import { INITIAL_ACTIVE_SLOTS, INITIAL_QUEUE_CAPACITY, INITIAL_REPUTATION, SAVE_KEY, xpToNextLevel } from '../content/balance';
import type { CustomerRuntime, GameState, PhoneRuntime } from '../types/state.types';

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
      adSpawnIntervalMs: 5_200,
      scamSpawnIntervalMs: 15_000,
      scamGraceMs: 6_000,
    },
    ui: { modal: 'none' },
    botAccumulator: 0,
    lastTickAt: now,
    startedAt: now,
  };
}

function ensurePhone(phone: PhoneRuntime): void {
  phone.system ??= Math.random() < 0.55 ? 'android' : 'ios';
  phone.popups ??= [];
  phone.popupAccumulatorMs ??= 0;
  phone.scamAccumulatorMs ??= 0;
  phone.incomingAccumulatorMs ??= 0;
}

function ensureCustomer(customer: CustomerRuntime): void {
  ensurePhone(customer.phone);
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
    const fresh = createInitialState();
    parsed.lastTickAt = performance.now();
    parsed.nextArrivalAt = Math.min(parsed.nextArrivalAt || performance.now() + 1000, performance.now() + 4000);
    parsed.activeCustomers = parsed.activeCustomers ?? [];
    parsed.queue = parsed.queue ?? [];
    parsed.effects = { ...fresh.effects, ...(parsed.effects ?? {}) };
    parsed.derived = { ...fresh.derived, ...(parsed.derived ?? {}) };
    parsed.ui = { modal: 'none' }; // 瞬时，不沿用
    for (const customer of [...parsed.activeCustomers, ...parsed.queue]) {
      ensureCustomer(customer);
    }
    return parsed;
  } catch {
    return null;
  }
}

export function saveState(state: GameState): void {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify({ ...state, ui: { modal: 'none' } }));
  } catch {
    // Storage can be disabled in private browsing; gameplay should continue.
  }
}

export function clearState(): void {
  localStorage.removeItem(SAVE_KEY);
}
