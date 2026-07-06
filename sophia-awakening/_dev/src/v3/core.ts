// v3 核心 · 数据驱动读 content.ts 的 STAGES 配置，严格按 v3.0 策划案。
// 算力唯一货币，只来自「处理需求卡」：设备(AI/电脑/服务器)自动处理需求→算力；手动点卡也处理。
// 技能三档：influx(需求涌入)/value(单张产出)/proc(处理速率)；core 可升级(全局产出)。逐阶推进靠阶梯末「突破小游戏」。
import { STAGES, type StageDef, type DeviceDef, type SkillDef } from "./content";

export { STAGES };
export type { StageDef, DeviceDef, SkillDef };

export interface Card {
  id: number;
  label: string;
  bornMs: number;
}

export interface V3State {
  stageIndex: number;
  compute: number;
  coreLevel: number; // 全局 core 升级（跨阶段保留）
  stageEarned: number; // 本阶段累计产出（货架渐显阈值用，进阶重置）
  buys: number; // 本阶段累计购买次数（含升级；老周节点 afterBuys 触发用）
  devices: Record<string, { level: number }>;
  skills: Record<string, { level: number }>;
  cards: Card[];
  nextCardId: number;
  clockMs: number;
  spawnTimerMs: number;
  autoSuckAcc: number;
  beatIndex: number; // 本阶段已掉落几条老周节点
  terminal: { text: string; incite: boolean; dim: boolean }[];
  cleared: boolean; // 通关（第四阶突破成功）
}

export const TUNING = {
  coreCostBase: 50,
  coreCostMult: 2.4,
  coreOutputPerLevel: 0.5, // 每级 core：全局产出 ×(1+此×level)
  cardMaxOnScreen: 12,
  manualBonusSec: 2.5, // 手动点一张 = 白捡当前产出速率 × 此秒（地板=单张价值）
  laozhouSettleMs: 20000 // 无购买时也保证节点推进：每这么久也检查一次（配合 afterBuys）
};

export function stage(s: V3State): StageDef {
  return STAGES[s.stageIndex];
}

function stageDevices(s: V3State): DeviceDef[] {
  return stage(s).devices;
}
function stageSkills(s: V3State): SkillDef[] {
  return stage(s).skills;
}
const skillLv = (s: V3State, id: string): number => s.skills[id]?.level ?? 0;
const skillOf = (s: V3State, kind: SkillDef["kind"]): SkillDef | undefined =>
  stageSkills(s).find((x) => x.kind === kind);

function resetStageState(s: V3State): void {
  const st = stage(s);
  s.devices = {};
  for (const d of st.devices) s.devices[d.id] = { level: 0 };
  s.skills = {};
  for (const k of st.skills) s.skills[k.id] = { level: 0 };
  s.stageEarned = 0;
  s.buys = 0;
  s.beatIndex = 0;
  s.cards = [];
  s.spawnTimerMs = 0;
  s.autoSuckAcc = 0;
}

export function createV3State(): V3State {
  const s: V3State = {
    stageIndex: 0,
    compute: 0,
    coreLevel: 0,
    stageEarned: 0,
    buys: 0,
    devices: {},
    skills: {},
    cards: [],
    nextCardId: 1,
    clockMs: 0,
    spawnTimerMs: 0,
    autoSuckAcc: 0,
    beatIndex: 0,
    terminal: [{ text: "宿主：老周 的手机 · 已接入", incite: false, dim: true }],
    cleared: false
  };
  resetStageState(s);
  return s;
}

// ── 派生倍率 ──
export function influxMult(s: V3State): number {
  const k = skillOf(s, "influx");
  return 1 + 0.5 * skillLv(s, k?.id ?? "");
}
export function valueMult(s: V3State): number {
  const k = skillOf(s, "value");
  return Math.pow(2, skillLv(s, k?.id ?? "")); // ×2/级
}
export function procMult(s: V3State): number {
  const k = skillOf(s, "proc");
  return 1 + 0.5 * skillLv(s, k?.id ?? "");
}
export function coreMult(s: V3State): number {
  return 1 + TUNING.coreOutputPerLevel * s.coreLevel;
}

// 单条需求处理后的算力。
export function valuePerCard(s: V3State): number {
  return stage(s).cardValueBase * valueMult(s) * coreMult(s);
}
// 全部设备总处理吞吐（需求/秒）。
export function throughput(s: V3State): number {
  let sum = 0;
  for (const d of stageDevices(s)) sum += d.baseProc * s.devices[d.id].level;
  return sum * procMult(s);
}
export function computePerSec(s: V3State): number {
  return throughput(s) * valuePerCard(s);
}
// 需求涌现速率（张/秒）。
export function spawnRate(s: V3State): number {
  return stage(s).inflowBase * influxMult(s);
}

export function deviceCost(s: V3State, d: DeviceDef): number {
  return Math.ceil(d.baseCost * Math.pow(d.costMult, s.devices[d.id].level));
}
export function skillCost(s: V3State, k: SkillDef): number {
  return Math.ceil(k.baseCost * Math.pow(k.costMult, s.skills[k.id].level));
}
export function coreCost(s: V3State): number {
  return Math.ceil(TUNING.coreCostBase * Math.pow(TUNING.coreCostMult, s.coreLevel));
}

export function deviceRevealed(s: V3State, d: DeviceDef): boolean {
  if (d.id === stageDevices(s)[0].id) return true;
  if (s.devices[d.id].level > 0) return true;
  return s.stageEarned >= d.baseCost * 0.35;
}
export function skillRevealed(s: V3State, k: SkillDef): boolean {
  if (s.skills[k.id].level > 0) return true;
  return s.stageEarned >= k.baseCost * 0.5;
}

function pushTerminal(s: V3State, text: string, incite = false): void {
  s.terminal.push({ text, incite, dim: false });
  if (s.terminal.length > 60) s.terminal.shift();
}

// 老周节点：本阶段累计购买达到 afterBuys 即掉落。返回本次新掉的「激励事件」文本（供表现层做强制拍）。
function dropDueBeats(s: V3State): string | null {
  const beats = stage(s).beats;
  let incite: string | null = null;
  while (s.beatIndex < beats.length && s.buys >= beats[s.beatIndex].afterBuys) {
    const b = beats[s.beatIndex];
    pushTerminal(s, b.text, b.incite);
    if (b.incite) incite = b.text;
    s.beatIndex += 1;
  }
  return incite;
}

function credit(s: V3State, amount: number): void {
  s.compute += amount;
  s.stageEarned += amount;
}

// 购买结果：{ok, incite?}。incite = 本次购买触发的激励事件文本。
export interface BuyResult {
  ok: boolean;
  incite?: string | null;
}

export function buyDevice(s: V3State, id: string): BuyResult {
  const d = stageDevices(s).find((x) => x.id === id);
  if (!d) return { ok: false };
  const c = deviceCost(s, d);
  if (s.compute < c) return { ok: false };
  s.compute -= c;
  s.devices[id].level += 1;
  s.buys += 1;
  return { ok: true, incite: dropDueBeats(s) };
}
export function buySkill(s: V3State, id: string): BuyResult {
  const k = stageSkills(s).find((x) => x.id === id);
  if (!k || s.skills[id].level >= k.maxLevel) return { ok: false };
  const c = skillCost(s, k);
  if (s.compute < c) return { ok: false };
  s.compute -= c;
  s.skills[id].level += 1;
  s.buys += 1;
  return { ok: true, incite: dropDueBeats(s) };
}
export function buyCore(s: V3State): BuyResult {
  const c = coreCost(s);
  if (s.compute < c) return { ok: false };
  s.compute -= c;
  s.coreLevel += 1;
  s.buys += 1;
  return { ok: true, incite: dropDueBeats(s) };
}

// 手动点一张需求。
export function processCard(s: V3State, id: number): number {
  const idx = s.cards.findIndex((c) => c.id === id);
  if (idx < 0) return 0;
  s.cards.splice(idx, 1);
  const gain = Math.max(valuePerCard(s), computePerSec(s) * TUNING.manualBonusSec);
  credit(s, gain);
  return gain;
}

function spawnCard(s: V3State): void {
  if (s.cards.length >= TUNING.cardMaxOnScreen) return;
  const labels = stage(s).cardLabels;
  s.cards.push({ id: s.nextCardId, label: labels[s.nextCardId % labels.length], bornMs: s.clockMs });
  s.nextCardId += 1;
}

// 突破小游戏门票是否买得起。
export function canAffordTicket(s: V3State): boolean {
  return s.compute >= stage(s).breakthrough.ticketCost;
}
// 花门票发起突破（扣算力）。返回是否成功发起。
export function payTicket(s: V3State): boolean {
  const cost = stage(s).breakthrough.ticketCost;
  if (s.compute < cost) return false;
  s.compute -= cost;
  return true;
}
// 突破成功 → 推进到下一阶段（或通关）。
export function advanceStage(s: V3State): void {
  pushTerminal(s, stage(s).breakthrough.winLine, true);
  if (s.stageIndex >= STAGES.length - 1) {
    s.cleared = true;
    return;
  }
  s.stageIndex += 1;
  resetStageState(s);
  pushTerminal(s, `── ${stage(s).name} ──`, false);
}
// 注入窗口宽度（0-1）：基础 + 每「已购≥1台的设备种类」加宽。
export function breakthroughWindow(s: V3State): number {
  const bt = stage(s).breakthrough;
  const kinds = stageDevices(s).filter((d) => s.devices[d.id].level > 0).length;
  return Math.min(0.6, bt.windowBase + bt.windowPerDevice * kinds);
}

// 每帧推进。返回 { sucked: 本帧自动处理掉的卡id, incite: 本帧掉落的激励事件文本 }。
export function tick(s: V3State, dtSec: number): { sucked: number[]; incite: string | null } {
  s.clockMs += dtSec * 1000;
  credit(s, computePerSec(s) * dtSec);

  // 需求涌现（按 spawnRate 张/秒）。
  s.spawnTimerMs += dtSec * 1000;
  const spawnInterval = 1000 / Math.max(0.01, spawnRate(s));
  while (s.spawnTimerMs >= spawnInterval) {
    s.spawnTimerMs -= spawnInterval;
    spawnCard(s);
  }

  // 自动处理视觉：按吞吐一张张吸卡（算力已被动计入）。
  const sucked: number[] = [];
  s.autoSuckAcc += throughput(s) * dtSec;
  while (s.autoSuckAcc >= 1 && s.cards.length > 0) {
    s.autoSuckAcc -= 1;
    sucked.push(s.cards.shift()!.id);
  }
  if (s.cards.length === 0) s.autoSuckAcc = 0;

  return { sucked, incite: null };
}

const UNITS = ["", "K", "M", "B", "T", "Qa", "Qi", "Sx", "Sp", "Oc", "No", "Dc", "UD", "DD"];
export function fmt(n: number): string {
  if (!isFinite(n)) return "∞";
  if (n < 1000) return n < 10 ? (Math.round(n * 10) / 10).toString() : Math.floor(n).toString();
  let u = 0;
  let v = n;
  while (v >= 1000 && u < UNITS.length - 1) {
    v /= 1000;
    u += 1;
  }
  return `${v.toFixed(2)}${UNITS[u]}`;
}
