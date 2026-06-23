import { INITIAL_ACTIVE_SLOTS, INITIAL_QUEUE_CAPACITY, INITIAL_REPUTATION, SAVE_KEY, xpToNextLevel } from '../content/balance';
import type { CustomerRuntime, GameState, PhoneRuntime } from '../types/state.types';

export function createInitialState(now = performance.now()): GameState {
  return {
    level: 1,
    xp: 0,
    xpToNext: xpToNextLevel(1),
    points: 0,
    bankedFloor: 0,
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
      notificationClearPower: 1,
      malwareClearPower: 16,
      malwareAutoPerSec: 0,
    },
    ui: { modal: 'none', focusedSlot: 0, cursor: { x: -100, y: -100, pressed: false, visible: false } },
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
  phone.notifications ??= 0;
  phone.notificationAccumulatorMs ??= 0;
  phone.malware ??= 0;
  phone.malwareAccumulatorMs ??= 0;
  phone.tier ??= 1;
  phone.variant ??= 'normal';
  phone.transformMs ??= Number.POSITIVE_INFINITY; // JSON 里 Infinity 会变 null，这里复原
  phone.offerAccumulatorMs ??= 0;
  for (const popup of phone.popups) {
    popup.motion ??= 'none';
    popup.vx ??= 0;
    popup.vy ??= 0;
  }
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
    parsed.bankedFloor = parsed.bankedFloor ?? Math.floor((parsed.points ?? 0) * 0.6); // 旧存档：按当前现金给出保底线
    parsed.lastTickAt = performance.now();
    parsed.nextArrivalAt = Math.min(parsed.nextArrivalAt || performance.now() + 1000, performance.now() + 4000);
    parsed.activeCustomers = parsed.activeCustomers ?? [];
    parsed.queue = parsed.queue ?? [];
    parsed.effects = { ...fresh.effects, ...(parsed.effects ?? {}) };
    parsed.derived = { ...fresh.derived, ...(parsed.derived ?? {}) };
    parsed.ui = { modal: 'none', focusedSlot: 0, cursor: { x: -100, y: -100, pressed: false, visible: false } }; // 瞬时，不沿用
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
  try {
    // 清掉本游戏的所有本地存储键（存档 + 静音偏好 + 任何历史遗留键），确保"重置"彻底，
    // 而不仅是当前 SAVE_KEY —— 避免遗留键让进度看起来"没被清掉"。
    const keys: string[] = [];
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i);
      if (key && key.startsWith('badge-buster')) {
        keys.push(key);
      }
    }
    for (const key of keys) {
      localStorage.removeItem(key);
    }
  } catch {
    // 私密模式等可能禁用存储；忽略，gameplay 不应中断。
  }
}
