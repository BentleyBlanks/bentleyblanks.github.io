// 白盒·「算力格子矩阵」玩法核心（纯逻辑，无 DOM/Canvas）。路由 #matrix，独立于 whitebox。
// 一个格子=一台设备(算力格)。右侧买 8 档设备(App→手机→老电脑→笔记本→智能设备→公司电脑→服务器→集群)，
// 落到离核心最近的空格。矩阵随设备数「分代细分」越来越密。需求以流星涌入核心；敲键=手动爆发(连击升温)。CC 数值。

export interface TierDef {
  id: string; name: string; icon: string;
  baseCost: number; costMult: number; rate: number; color: string; unlockPrev: number;
}
// 8 档 · 热力色阶：绿→青→黄→琥珀→橙→红→紫→白
export const TIERS: TierDef[] = [
  { id: "app", name: "App", icon: "📱", baseCost: 15, costMult: 1.15, rate: 0.1, color: "#8dff6e", unlockPrev: 0 },
  { id: "phone", name: "手机", icon: "📲", baseCost: 220, costMult: 1.15, rate: 1.1, color: "#5ee8c8", unlockPrev: 3 },
  { id: "oldpc", name: "老电脑", icon: "🖥️", baseCost: 3_400, costMult: 1.15, rate: 9, color: "#d8ee55", unlockPrev: 3 },
  { id: "laptop", name: "笔记本", icon: "💻", baseCost: 52_000, costMult: 1.15, rate: 62, color: "#e6bd53", unlockPrev: 3 },
  { id: "smart", name: "智能设备", icon: "📡", baseCost: 800_000, costMult: 1.15, rate: 430, color: "#f0924a", unlockPrev: 3 },
  { id: "office", name: "公司电脑", icon: "🏢", baseCost: 1.25e7, costMult: 1.15, rate: 3_000, color: "#e85c50", unlockPrev: 3 },
  { id: "server", name: "服务器", icon: "🗄️", baseCost: 1.95e8, costMult: 1.15, rate: 21_000, color: "#c86df0", unlockPrev: 3 },
  { id: "cluster", name: "集群", icon: "🧊", baseCost: 3.1e9, costMult: 1.15, rate: 150_000, color: "#eaf6ff", unlockPrev: 3 }
];

export interface SkillDef { id: string; name: string; icon: string; desc: string; baseCost: number; costMult: number; maxLevel: number; revealAt: number; }
export const KEY_ORDER = ["g", "f", "h", "d", "j", "s", "k", "a", "l", "e", "i", "r", "u", "w", "o", "q", "p", "t", "y", "b", "c", "v", "n", "m", "x", "z"];
export const SKILLS: SkillDef[] = [
  { id: "deep", name: "深度处理", icon: "🧠", desc: "手动爆发算力 ×2/级", baseCost: 60, costMult: 4.2, maxLevel: 14, revealAt: 0 },
  { id: "keys", name: "多线程按键", icon: "⌨️", desc: "解锁更多字母键（手速上限↑）", baseCost: 150, costMult: 3.1, maxLevel: KEY_ORDER.length - 1, revealAt: 40 },
  { id: "neuro", name: "神经加速", icon: "⚡", desc: "按键冷却 −18%/级", baseCost: 900, costMult: 5, maxLevel: 6, revealAt: 6_000 },
  { id: "burst", name: "过载爆发", icon: "💥", desc: "连击升温上限 +0.5×/级", baseCost: 12_000, costMult: 6, maxLevel: 4, revealAt: 60_000 }
];

export const GRID_GENS = [
  { atDevices: 0, cols: 9 }, { atDevices: 34, cols: 13 }, { atDevices: 100, cols: 19 }, { atDevices: 240, cols: 27 }, { atDevices: 500, cols: 39 }
];

export const TUNING = {
  perClickBase: 1, clickWorthSec: 2.0, keyCooldownMs: 130, cooldownPerLevel: 0.18,
  comboStep: 0.08, comboDecayPerSec: 0.9, comboBaseMax: 3
};

export interface WBState {
  compute: number; totalEarned: number; owned: number[]; skills: Record<string, { level: number }>; combo: number; clockMs: number;
}
export function createWBState(): WBState {
  const skills: Record<string, { level: number }> = {};
  for (const s of SKILLS) skills[s.id] = { level: 0 };
  return { compute: 0, totalEarned: 0, owned: TIERS.map(() => 0), skills, combo: 1, clockMs: 0 };
}
const sLv = (s: WBState, id: string): number => s.skills[id]?.level ?? 0;

export function totalDevices(s: WBState): number { return s.owned.reduce((a, b) => a + b, 0); }
export function gridGen(s: WBState): { cols: number; rows: number; gen: number } {
  const n = totalDevices(s); let gi = 0;
  for (let i = 0; i < GRID_GENS.length; i++) if (n >= GRID_GENS[i].atDevices) gi = i;
  const cols = GRID_GENS[gi].cols; let rows = Math.max(5, Math.round(cols * 0.62)); if (rows % 2 === 0) rows += 1;
  return { cols, rows, gen: gi };
}
export function throughput(s: WBState): number { let sum = 0; for (let i = 0; i < TIERS.length; i++) sum += TIERS[i].rate * s.owned[i]; return sum; }
export function computePerSec(s: WBState): number { return throughput(s); }
export function tierCost(s: WBState, i: number): number { return Math.ceil(TIERS[i].baseCost * Math.pow(TIERS[i].costMult, s.owned[i])); }
export function tierUnlocked(s: WBState, i: number): boolean { if (i === 0) return true; return s.owned[i] > 0 || s.owned[i - 1] >= TIERS[i].unlockPrev; }
export function skillCost(s: WBState, k: SkillDef): number { return Math.ceil(k.baseCost * Math.pow(k.costMult, s.skills[k.id].level)); }
export function skillRevealed(s: WBState, k: SkillDef): boolean { return s.skills[k.id].level > 0 || s.totalEarned >= k.revealAt; }
export function unlockedKeys(s: WBState): string[] { return KEY_ORDER.slice(0, 1 + sLv(s, "keys")); }
export function keyCooldownMs(s: WBState): number { return TUNING.keyCooldownMs * Math.pow(1 - TUNING.cooldownPerLevel, sLv(s, "neuro")); }
export function comboMax(s: WBState): number { return TUNING.comboBaseMax + 0.5 * sLv(s, "burst"); }

function credit(s: WBState, n: number): void { s.compute += n; s.totalEarned += n; }
export function buyTier(s: WBState, i: number): boolean {
  if (!tierUnlocked(s, i)) return false; const c = tierCost(s, i); if (s.compute < c) return false;
  s.compute -= c; s.owned[i] += 1; return true;
}
export function buySkill(s: WBState, id: string): boolean {
  const k = SKILLS.find((x) => x.id === id); if (!k || s.skills[id].level >= k.maxLevel) return false;
  const c = skillCost(s, k); if (s.compute < c) return false; s.compute -= c; s.skills[id].level += 1; return true;
}
export function manualBurst(s: WBState): number {
  const base = TUNING.perClickBase * Math.pow(2, sLv(s, "deep"));
  const gain = Math.max(base, computePerSec(s) * TUNING.clickWorthSec) * s.combo;
  credit(s, gain); s.combo = Math.min(comboMax(s), s.combo + TUNING.comboStep); return gain;
}
export function tick(s: WBState, dtSec: number): void {
  s.clockMs += dtSec * 1000; credit(s, computePerSec(s) * dtSec); s.combo = Math.max(1, s.combo - TUNING.comboDecayPerSec * dtSec);
}
const UNITS = ["", "K", "M", "B", "T", "Qa", "Qi", "Sx", "Sp", "Oc", "No", "Dc"];
export function fmt(n: number): string {
  if (!isFinite(n)) return "∞";
  if (n < 1000) return n < 10 ? (Math.round(n * 10) / 10).toString() : Math.floor(n).toString();
  let u = 0, v = n; while (v >= 1000 && u < UNITS.length - 1) { v /= 1000; u += 1; } return `${v.toFixed(2)}${UNITS[u]}`;
}
