// core —— 状态与清除内核（Agent 1）
// 拥有：activeCustomers[].phone.*（icons/badge/badgeTotal）、角标生成、totalCleared、
//       customer.clearedThisPhone、lastTickAt/startedAt、存读档。
// 唯一改 badge 者：所有清除经 BADGE_CLEARED 由本模块兜底落地。
import type { GameContext, GameModule } from '../types/module.types';
import type { GameState, CustomerRuntime, IconRuntime } from '../types/state.types';
import { computeLayout, hitTestCell } from '../types/layout';
import { Balance, SKILLS } from '../content';
import { clamp } from '../util';

interface SaveData {
  level: number; xp: number; xpToNext: number; points: number; totalCleared: number;
  upgrades: Record<string, number>;
  skillsUnlocked: Record<string, boolean>;
  reputation: number;
}

function loadSave(): SaveData | null {
  try {
    const raw = localStorage.getItem(Balance.SAVE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as SaveData;
  } catch { return null; }
}

/** 由 main 在装配前调用 */
export function createInitialState(now: number): GameState {
  const skills: GameState['skills'] = {};
  for (const s of SKILLS) skills[s.id] = { unlocked: false, lastUsedAt: 0 };

  const state: GameState = {
    level: 1, xp: 0, xpToNext: Balance.xpToNext(1), points: 0, totalCleared: 0,
    activeCustomers: [], queue: [],
    activeSlots: Balance.INITIAL_ACTIVE_SLOTS,
    queueCapacity: Balance.INITIAL_QUEUE_CAPACITY,
    reputation: Balance.INITIAL_REPUTATION,
    nextArrivalAt: now,
    upgrades: {},
    skills,
    effects: {
      freezeIncomingUntil: 0, tipBoostUntil: 0, tipBoostMult: 1,
      magnetUntil: 0, extraHandsUntil: 0, extraHands: 0,
    },
    derived: {
      clearPerHit: 1, xpPerBadge: 1, payoutMult: 1, swipeEnabled: false,
      botCount: 0, botRatePerSec: 0,
      arrivalIntervalMs: Balance.arrivalIntervalMs(Balance.INITIAL_REPUTATION, 1),
    },
    botAccumulator: 0,
    lastTickAt: now, startedAt: now,
  };

  const save = loadSave();
  if (save) {
    // localStorage 不可信：逐项做有限值/范围清洗，防止被篡改的存档污染下游数学
    const num = (v: unknown, def: number, min = -Infinity): number => {
      const n = typeof v === 'number' ? v : Number(v);
      return Number.isFinite(n) ? Math.max(min, n) : def;
    };
    state.level = Math.max(1, Math.floor(num(save.level, 1, 1)));
    state.xp = num(save.xp, 0, 0);
    state.points = num(save.points, 0, 0);
    state.totalCleared = Math.floor(num(save.totalCleared, 0, 0));
    const savedNext = num(save.xpToNext, NaN);
    state.xpToNext = savedNext > 0 ? Math.floor(savedNext) : Balance.xpToNext(state.level);
    if (save.upgrades && typeof save.upgrades === 'object') {
      const cleaned: Record<string, number> = {};
      for (const [k, v] of Object.entries(save.upgrades)) {
        const lv = Math.floor(num(v, 0, 0));
        if (lv > 0) cleaned[k] = lv;
      }
      state.upgrades = cleaned;
    }
    state.reputation = clamp(num(save.reputation, Balance.INITIAL_REPUTATION), Balance.REPUTATION_MIN, Balance.REPUTATION_MAX);
    for (const id of Object.keys(state.skills)) {
      if (save.skillsUnlocked?.[id]) state.skills[id].unlocked = true;
    }
  }
  return state;
}

export function createCoreModule(): GameModule {
  let ctx!: GameContext;
  const incomeAcc = new Map<string, number>(); // customerId -> 已累积 ms
  let magnetAcc = 0;
  let saveAcc = 0;
  let dirty = false; // 有"关键变化"待落盘；延到下一帧 update 保存，
  //                    确保 economy 在同一次派发里改完 points/level 后才序列化

  function emitClear(c: CustomerRuntime, icon: IconRuntime, amount: number, x: number, y: number) {
    if (amount <= 0) return;
    ctx.bus.emit({ type: 'BADGE_CLEARED', customerId: c.id, iconId: icon.id, amount, x, y });
  }

  function findActive(id: string): CustomerRuntime | undefined {
    return ctx.state.activeCustomers.find((c) => c.id === id);
  }

  // 兜底落地：唯一真正改 badge 的地方
  function applyCleared(customerId: string, iconId: string, amount: number) {
    const c = findActive(customerId);
    if (!c) return;
    const icon = c.phone.icons.find((i) => i.id === iconId);
    if (!icon) return;
    const dec = Math.min(amount, icon.badge);
    if (dec <= 0) return;
    icon.badge -= dec;
    c.phone.badgeTotal = Math.max(0, c.phone.badgeTotal - dec);
    c.clearedThisPhone += dec;
    ctx.state.totalCleared += dec;
    if (c.phone.badgeTotal <= 0) {
      ctx.bus.emit({ type: 'PHONE_CLEANED', customerId: c.id });
    }
  }

  function handleTap(x: number, y: number) {
    const layout = computeLayout(ctx.state);
    const hit = hitTestCell(layout, x, y);
    if (!hit) return;
    const c = ctx.state.activeCustomers[hit.stationIndex];
    if (!c) return;
    const icon = c.phone.icons.find((i) => i.col === hit.col && i.row === hit.row && i.badge > 0);
    if (!icon) return;
    const amount = Math.min(ctx.state.derived.clearPerHit, icon.badge);
    emitClear(c, icon, amount, x, y);
  }

  function handleSwipe(path: { x: number; y: number }[]) {
    if (path.length === 0) return;
    const layout = computeLayout(ctx.state);
    const seen = new Set<string>();
    for (const p of path) {
      const hit = hitTestCell(layout, p.x, p.y);
      if (!hit) continue;
      const key = `${hit.stationIndex}:${hit.col}:${hit.row}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const c = ctx.state.activeCustomers[hit.stationIndex];
      if (!c) continue;
      const icon = c.phone.icons.find((i) => i.col === hit.col && i.row === hit.row && i.badge > 0);
      if (!icon) continue;
      const amount = Math.min(ctx.state.derived.clearPerHit, icon.badge);
      emitClear(c, icon, amount, p.x, p.y);
    }
  }

  function incomeTick(dt: number) {
    const now = ctx.now();
    const frozen = now < ctx.state.effects.freezeIncomingUntil;
    const active = ctx.state.activeCustomers;
    const liveIds = new Set<string>();
    for (const c of active) {
      liveIds.add(c.id);
      if (frozen) continue;
      const threshold = Balance.BADGE_INCOME_BASE_MS / Math.max(0.01, c.phone.incomingRateMult);
      let acc = (incomeAcc.get(c.id) ?? 0) + dt;
      while (acc >= threshold) {
        acc -= threshold;
        addIncomingBadge(c);
      }
      incomeAcc.set(c.id, acc);
    }
    // 清理离场顾客的累积
    for (const id of [...incomeAcc.keys()]) if (!liveIds.has(id)) incomeAcc.delete(id);
  }

  function addIncomingBadge(c: CustomerRuntime) {
    // 在已有图标里挑一个未满的 +1
    const candidates = c.phone.icons.filter((i) => {
      const def = ctx.content.icons.find((d) => d.id === i.id);
      return def ? i.badge < def.maxBadge : i.badge < 99;
    });
    if (candidates.length === 0) return;
    const icon = candidates[Math.floor(Math.random() * candidates.length)];
    icon.badge += 1;
    c.phone.badgeTotal += 1;
  }

  function magnetTick(dt: number) {
    const now = ctx.now();
    if (now >= ctx.state.effects.magnetUntil) { magnetAcc = 0; return; }
    const layout = computeLayout(ctx.state);
    magnetAcc += (12 * dt) / 1000; // 12 角标/秒
    while (magnetAcc >= 1) {
      magnetAcc -= 1;
      // 找任一还有角标的工位/图标
      let done = true;
      for (let si = 0; si < ctx.state.activeCustomers.length; si++) {
        const c = ctx.state.activeCustomers[si];
        const icon = c.phone.icons.find((i) => i.badge > 0);
        if (!icon) continue;
        const cell = layout.stations[si]?.cells.find((cc) => cc.col === icon.col && cc.row === icon.row);
        const cx = cell ? cell.rect.x + cell.rect.w / 2 : 0;
        const cy = cell ? cell.rect.y + cell.rect.h / 2 : 0;
        emitClear(c, icon, Math.min(2, icon.badge), cx, cy);
        done = false;
        break;
      }
      if (done) { magnetAcc = 0; break; }
    }
  }

  function save() {
    const s = ctx.state;
    const skillsUnlocked: Record<string, boolean> = {};
    for (const id of Object.keys(s.skills)) skillsUnlocked[id] = s.skills[id].unlocked;
    const data: SaveData = {
      level: s.level, xp: s.xp, xpToNext: s.xpToNext, points: s.points,
      totalCleared: s.totalCleared, upgrades: s.upgrades, skillsUnlocked,
      reputation: s.reputation,
    };
    try { localStorage.setItem(Balance.SAVE_KEY, JSON.stringify(data)); } catch { /* ignore quota */ }
  }

  return {
    name: 'core',
    init(c) {
      ctx = c;
      ctx.bus.on('TAP', (e) => handleTap(e.x, e.y));
      ctx.bus.on('SWIPE', (e) => handleSwipe(e.path));
      ctx.bus.on('BADGE_CLEARED', (e) => applyCleared(e.customerId, e.iconId, e.amount));
      // 关键存档点：仅打脏标记，真正落盘延到下一帧（此时 economy 已结算完 points/level）
      ctx.bus.on('PHONE_RETURNED', () => { dirty = true; });
      ctx.bus.on('UPGRADE_PURCHASED', () => { dirty = true; });
      ctx.bus.on('LEVEL_UP', () => { dirty = true; });
    },
    update(dt) {
      ctx.state.lastTickAt = ctx.now();
      incomeTick(dt);
      magnetTick(dt);
      saveAcc += dt;
      if (dirty || saveAcc >= 8000) { saveAcc = 0; dirty = false; save(); }
    },
  };
}
