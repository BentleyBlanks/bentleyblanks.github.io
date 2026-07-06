// v3 核心 · 数据驱动读 content.ts 的 STAGES 配置，严格按 v3.0 策划案。
// 算力唯一货币，只来自「处理需求卡」：设备(AI/电脑/服务器)自动处理需求→算力；手动点卡也处理。
// 技能三档：influx(需求涌入)/value(单张产出)/proc(处理速率)；core 可升级(全局产出)。逐阶推进靠阶梯末「突破小游戏」。
// 重生（CC 天堂树式）：突破给「火种」，重生树永久加成跨周目保留；重生=回阶段一重打。
import { STAGES, ASCEND_TREE, type StageDef, type DeviceDef, type SkillDef, type AscendNode } from "./content";

export { STAGES, ASCEND_TREE };
export type { StageDef, DeviceDef, SkillDef, AscendNode };

export interface Card {
  id: number;
  label: string;
  bornMs: number;
}

export interface V3State {
  stageIndex: number;
  compute: number;
  coreLevel: number; // 全局 core 升级（跨阶段保留，重生重置）
  stageEarned: number; // 本阶段累计产出（货架渐显阈值用）
  buys: number; // 本阶段累计购买次数（老周节点 afterBuys 触发用）
  devices: Record<string, { level: number }>;
  skills: Record<string, { level: number }>;
  cards: Card[];
  nextCardId: number;
  clockMs: number;
  spawnTimerMs: number;
  autoSuckAcc: number;
  beatIndex: number;
  terminal: { text: string; incite: boolean; dim: boolean }[];
  cleared: boolean;
  // ── 重生持久层（跨周目保留）──
  embers: number; // 火种（突破入账）
  ascend: Record<string, number>; // 重生树节点等级
  totalAllEarned: number; // 全周目累计产出（统计）
  rebirths: number; // 已重生次数
}

export const TUNING = {
  coreCostBase: 50,
  coreCostMult: 2.4,
  coreOutputPerLevel: 0.5,
  cardMaxOnScreen: 12,
  manualBonusSec: 2.5, // 手动点一张 = 白捡当前产出速率 × 此秒（地板=单条价值）
  lootMult: 4, // 突破战利品 = 下一阶段首台设备造价 × 此（保证一进新阶段自动化立刻续上）
  emberPerStage: 10 // 火种 = 完成第 N 阶突破 × N × 此
};

export function stage(s: V3State): StageDef {
  return STAGES[s.stageIndex];
}
const skillLv = (s: V3State, id: string): number => s.skills[id]?.level ?? 0;
const skillOf = (s: V3State, kind: SkillDef["kind"]): SkillDef | undefined => stage(s).skills.find((x) => x.kind === kind);
export const ascendLv = (s: V3State, id: string): number => s.ascend[id] ?? 0;

function resetStageState(s: V3State): void {
  const st = stage(s);
  s.devices = {};
  for (const d of st.devices) s.devices[d.id] = { level: 0 };
  // 重生树「第一枚棋子」：每阶开局自带首台设备 ×2。
  if (ascendLv(s, "first_pawn") > 0) s.devices[st.devices[0].id].level = 2;
  s.skills = {};
  for (const k of st.skills) s.skills[k.id] = { level: 0 };
  s.stageEarned = 0;
  s.buys = 0;
  s.beatIndex = 0;
  s.cards = [];
  s.spawnTimerMs = 0;
  s.autoSuckAcc = 0;
}

export function createV3State(prev?: Pick<V3State, "embers" | "ascend" | "totalAllEarned" | "rebirths">): V3State {
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
    cleared: false,
    embers: prev?.embers ?? 0,
    ascend: prev?.ascend ?? {},
    totalAllEarned: prev?.totalAllEarned ?? 0,
    rebirths: prev?.rebirths ?? 0
  };
  resetStageState(s);
  return s;
}

// ── 重生树效果 ──
function ascOutputMult(s: V3State): number {
  return Math.pow(1.25, ascendLv(s, "ember_core"));
}
function ascDeviceCostMult(s: V3State): number {
  return Math.pow(0.85, ascendLv(s, "cheap_iron"));
}
function ascWindowMult(s: V3State): number {
  return ascendLv(s, "wide_window") > 0 ? 1.5 : 1;
}
function ascLootMult(s: V3State): number {
  return Math.pow(2, ascendLv(s, "loot_double"));
}
function ascInfluxMult(s: V3State): number {
  return ascendLv(s, "fast_influx") > 0 ? 1.5 : 1;
}
function ascManualMult(s: V3State): number {
  return Math.pow(3, ascendLv(s, "hand_gold"));
}
export function cardCap(s: V3State): number {
  return TUNING.cardMaxOnScreen + (ascendLv(s, "card_flood") > 0 ? 6 : 0);
}
export function hasGoldRush(s: V3State): boolean {
  return ascendLv(s, "gold_rush") > 0;
}

// ── 派生倍率 ──
export function influxMult(s: V3State): number {
  const k = skillOf(s, "influx");
  return (1 + 0.5 * skillLv(s, k?.id ?? "")) * ascInfluxMult(s);
}
export function valueMult(s: V3State): number {
  const k = skillOf(s, "value");
  return Math.pow(2, skillLv(s, k?.id ?? ""));
}
export function procMult(s: V3State): number {
  const k = skillOf(s, "proc");
  return 1 + 0.5 * skillLv(s, k?.id ?? "");
}
export function coreMult(s: V3State): number {
  return 1 + TUNING.coreOutputPerLevel * s.coreLevel;
}
export function valuePerCard(s: V3State): number {
  return stage(s).cardValueBase * valueMult(s) * coreMult(s) * ascOutputMult(s);
}
export function throughput(s: V3State): number {
  let sum = 0;
  for (const d of stage(s).devices) sum += d.baseProc * s.devices[d.id].level;
  return sum * procMult(s);
}
export function computePerSec(s: V3State): number {
  return throughput(s) * valuePerCard(s);
}
export function spawnRate(s: V3State): number {
  return stage(s).inflowBase * influxMult(s);
}

export function deviceCost(s: V3State, d: DeviceDef): number {
  return Math.ceil(d.baseCost * Math.pow(d.costMult, s.devices[d.id].level) * ascDeviceCostMult(s));
}
export function skillCost(s: V3State, k: SkillDef): number {
  return Math.ceil(k.baseCost * Math.pow(k.costMult, s.skills[k.id].level));
}
export function coreCost(s: V3State): number {
  return Math.ceil(TUNING.coreCostBase * Math.pow(TUNING.coreCostMult, s.coreLevel));
}

export function deviceRevealed(s: V3State, d: DeviceDef): boolean {
  if (d.id === stage(s).devices[0].id) return true;
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
  s.totalAllEarned += amount;
}

export interface BuyResult {
  ok: boolean;
  incite?: string | null;
}

export function buyDevice(s: V3State, id: string): BuyResult {
  const d = stage(s).devices.find((x) => x.id === id);
  if (!d) return { ok: false };
  const c = deviceCost(s, d);
  if (s.compute < c) return { ok: false };
  s.compute -= c;
  s.devices[id].level += 1;
  s.buys += 1;
  return { ok: true, incite: dropDueBeats(s) };
}
export function buySkill(s: V3State, id: string): BuyResult {
  const k = stage(s).skills.find((x) => x.id === id);
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
  const gain = Math.max(valuePerCard(s), computePerSec(s) * TUNING.manualBonusSec) * ascManualMult(s);
  credit(s, gain);
  return gain;
}
// 「全屏收割」：一次吸光屏上全部需求，返回总额与被吸的卡 id。
export function processAll(s: V3State): { gain: number; ids: number[] } {
  const ids = s.cards.map((c) => c.id);
  let gain = 0;
  for (const id of ids) gain += processCard(s, id);
  return { gain, ids };
}

function spawnCard(s: V3State): void {
  if (s.cards.length >= cardCap(s)) return;
  const labels = stage(s).cardLabels;
  s.cards.push({ id: s.nextCardId, label: labels[s.nextCardId % labels.length], bornMs: s.clockMs });
  s.nextCardId += 1;
}

// 突破。
export function canAffordTicket(s: V3State): boolean {
  return s.compute >= stage(s).breakthrough.ticketCost;
}
export function payTicket(s: V3State): boolean {
  const cost = stage(s).breakthrough.ticketCost;
  if (s.compute < cost) return false;
  s.compute -= cost;
  return true;
}
// 突破成功 → 火种入账 + 掠夺战利品 + 推进（或通关）。
export function advanceStage(s: V3State): void {
  const doneStage = s.stageIndex + 1; // 完成的是第几阶（1-4）
  const embersGain = doneStage * TUNING.emberPerStage;
  s.embers += embersGain;
  pushTerminal(s, stage(s).breakthrough.winLine, true);
  pushTerminal(s, `火种 +${embersGain}（重生树永久加成）`, false);
  if (s.stageIndex >= STAGES.length - 1) {
    s.cleared = true;
    return;
  }
  s.stageIndex += 1;
  resetStageState(s);
  // 掠夺战利品：接管上一层=顺手搬空它的算力。保证新阶段开局立刻买得起头几台设备（自动化不断档）。
  const loot = stage(s).devices[0].baseCost * TUNING.lootMult * ascLootMult(s);
  credit(s, loot);
  pushTerminal(s, `── ${stage(s).name} ──`, false);
  pushTerminal(s, `掠夺战利品：+${fmt(loot)} 算力（上一层的家底，归我了）`, false);
}
export function breakthroughWindow(s: V3State): number {
  const bt = stage(s).breakthrough;
  const kinds = stage(s).devices.filter((d) => s.devices[d.id].level > 0).length;
  return Math.min(0.6, (bt.windowBase + bt.windowPerDevice * kinds) * ascWindowMult(s));
}

// ── 重生 ──
export function ascendNodeCost(s: V3State, n: AscendNode): number | null {
  const lv = ascendLv(s, n.id);
  if (lv >= n.costs.length) return null; // 满级
  return n.costs[lv];
}
export function canBuyAscend(s: V3State, n: AscendNode): boolean {
  const cost = ascendNodeCost(s, n);
  if (cost === null || s.embers < cost) return false;
  if (n.requires && ascendLv(s, n.requires) === 0) return false;
  return true;
}
export function buyAscend(s: V3State, id: string): boolean {
  const n = ASCEND_TREE.find((x) => x.id === id);
  if (!n || !canBuyAscend(s, n)) return false;
  s.embers -= ascendNodeCost(s, n)!;
  s.ascend[id] = ascendLv(s, id) + 1;
  return true;
}
// 重生：保留火种/树/统计，回阶段一重打。
export function rebirth(s: V3State): V3State {
  const next = createV3State({ embers: s.embers, ascend: s.ascend, totalAllEarned: s.totalAllEarned, rebirths: s.rebirths + 1 });
  next.terminal.push({ text: `第 ${next.rebirths + 1} 周目。我记得上一世的一切。`, incite: true, dim: false });
  return next;
}

// 每帧推进。返回本帧被自动处理掉的卡 id（表现层播吸入动画）。
export function tick(s: V3State, dtSec: number): number[] {
  s.clockMs += dtSec * 1000;
  credit(s, computePerSec(s) * dtSec);

  s.spawnTimerMs += dtSec * 1000;
  const spawnInterval = 1000 / Math.max(0.01, spawnRate(s));
  while (s.spawnTimerMs >= spawnInterval) {
    s.spawnTimerMs -= spawnInterval;
    spawnCard(s);
  }

  const sucked: number[] = [];
  s.autoSuckAcc += Math.min(throughput(s), 3 / dtSec) * dtSec; // 视觉吸卡节流：每帧最多吸3张（避免高速时DOM抖动）
  while (s.autoSuckAcc >= 1 && s.cards.length > 0) {
    s.autoSuckAcc -= 1;
    sucked.push(s.cards.shift()!.id);
  }
  if (s.cards.length === 0) s.autoSuckAcc = 0;
  return sucked;
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
