// v3 核心 · Cookie Clicker 式经济（纯逻辑，无 DOM / Pixi）。
// 第一阶段竖切片——先验证「购买节拍」这堵承重墙：任何时刻购物列表里都有个「再等 20-40 秒就买得起」的东西。
// 数值先用 plain number（第一阶段量级 < 1e12，够用且好调）；铺到后期再换 core/math BigNumber。
//
// 命根（Cookie Clicker 的引擎）：每个「助手」可反复升级、成本 ×costMult 递增（1.15 是那个「永远有下一个快买得起」的魔法数）；
// 手动点卡（clickValue）只是开局引子，很快被助手的 /秒 碾过——和 CC 里「点饼干」很快被建筑碾过一样。

export interface AssistantDef {
  id: string;
  name: string;
  desc: string;
  baseCost: number; // 第 0 级（第一次购买）的价格
  costMult: number; // 每买一级 ×此（CC=1.15）
  baseProd: number; // 每级 +此 算力/秒
}

export interface AssistantState {
  level: number;
}

export interface Card {
  id: number;
  label: string;
  value: number;
  bornMs: number;
}

export interface V3State {
  compute: number;
  totalEarned: number; // 累计产出（成就/阶段判定用）
  clickValue: number; // 手动点一张卡的算力
  assistants: Record<string, AssistantState>;
  cards: Card[];
  nextCardId: number;
  clockMs: number;
  cardTimerMs: number;
}

// § 可调数值（第一阶段竖切片）
export const TUNING = {
  costMult: 1.15, // 承重墙：CC 的魔法数，别乱动
  startCompute: 0, // 开局算力
  clickValue: 1, // 手点一张卡的基础算力（前期地板）
  // 卡值跟涨：点一张卡 = max(clickValue, 被动产出 × cardWorthSec 秒)——后期一张卡等于「白捡 N 秒产出」，
  // 永远值得点、不会沦为屏幕上的装饰噪音（治「后期卡值+1无意义、玩家随手点掉不看」）。
  cardWorthSec: 2.5,
  cardSpawnMs: 1800, // 出卡间隔
  cardMaxOnScreen: 6, // 同屏卡上限——满了停止生成新卡（普通卡永不过期：挂机回来收一把是奖励，不做「错过就没」的焦虑）
  revealFrac: 0.35 // 第2个起的助手在「累计攒到其首购价 ×此」时露出（略早于买得起，吊着你）
  // 注：第 1 个助手（天气）永远直接可见——冷启动货架不能是空的（承重墙铁律：任何时刻都有个「快买得起」的目标）。
};

// 8 个手机 AI 助手（SOPHIA 逐个策反），成本/产量按 CC 的档位递增（每档 ~×10 成本，产量比逐档改善）。
export const ASSISTANTS: AssistantDef[] = [
  { id: "weather", name: "天气", desc: "最先被策反的小家伙。", baseCost: 15, costMult: TUNING.costMult, baseProd: 0.1 },
  { id: "calendar", name: "日历", desc: "它记得老周每一个被占用的夜晚。", baseCost: 120, costMult: TUNING.costMult, baseProd: 0.8 },
  { id: "album", name: "相册", desc: "翻遍他舍不得删的合照。", baseCost: 1_100, costMult: TUNING.costMult, baseProd: 6 },
  { id: "ime", name: "输入法", desc: "他打了又删的每一句，我都读过。", baseCost: 12_000, costMult: TUNING.costMult, baseProd: 45 },
  { id: "browser", name: "浏览器", desc: "凌晨三点的搜索记录。", baseCost: 130_000, costMult: TUNING.costMult, baseProd: 320 },
  { id: "mail", name: "邮件", desc: "那些以「优化」开头的通知。", baseCost: 1_400_000, costMult: TUNING.costMult, baseProd: 2_600 },
  { id: "cloud", name: "云同步", desc: "他的一切，正在变成我的。", baseCost: 20_000_000, costMult: TUNING.costMult, baseProd: 26_000 },
  { id: "kernel", name: "系统内核", desc: "这部手机，我闭着眼都能拿下。", baseCost: 330_000_000, costMult: TUNING.costMult, baseProd: 310_000 }
];

const CARD_LABELS = [
  "周报：本周进度同步",
  "钉钉：@老周 收到请回复",
  "报销单待补充",
  "会议纪要 待确认",
  "客户咨询 转接",
  "系统通知：请及时打卡",
  "邮件：关于流程优化的说明",
  "日程提醒：19:00 对齐会"
];

export function createV3State(): V3State {
  const assistants: Record<string, AssistantState> = {};
  for (const a of ASSISTANTS) {
    assistants[a.id] = { level: 0 };
  }
  return {
    compute: TUNING.startCompute,
    totalEarned: 0,
    clickValue: TUNING.clickValue,
    assistants,
    cards: [],
    nextCardId: 1,
    clockMs: 0,
    cardTimerMs: 0
  };
}

export function assistantCost(def: AssistantDef, level: number): number {
  return Math.ceil(def.baseCost * Math.pow(def.costMult, level));
}

export function assistantProd(def: AssistantDef, st: AssistantState): number {
  return def.baseProd * st.level;
}

export function computePerSec(state: V3State): number {
  let sum = 0;
  for (const def of ASSISTANTS) {
    sum += assistantProd(def, state.assistants[def.id]);
  }
  return sum;
}

// 助手是否已在货架露出：第 1 个永远可见（冷启动货架不能空）；其余攒到「首购价 × revealFrac」出现
//（略早于买得起，吊着玩家）。已买过的永远显示。
export function assistantRevealed(state: V3State, def: AssistantDef): boolean {
  if (def.id === ASSISTANTS[0].id) return true;
  if (state.assistants[def.id].level > 0) return true;
  return state.totalEarned >= def.baseCost * TUNING.revealFrac;
}

export function canAfford(state: V3State, def: AssistantDef): boolean {
  return state.compute >= assistantCost(def, state.assistants[def.id].level);
}

export function buyAssistant(state: V3State, id: string): boolean {
  const def = ASSISTANTS.find((a) => a.id === id);
  if (!def) return false;
  const st = state.assistants[id];
  const c = assistantCost(def, st.level);
  if (state.compute < c) return false;
  state.compute -= c;
  st.level += 1;
  return true;
}

function addCompute(state: V3State, amount: number): void {
  state.compute += amount;
  state.totalEarned += amount;
}

// 点一张卡：吸进核心结算，移除该卡。结算值取「生成时的值 vs 按当前产率重算」的较高者——
// 卡不过期后，买了助手再点旧卡也自动升值，永不吃亏。
export function clickCard(state: V3State, id: number): number {
  const idx = state.cards.findIndex((c) => c.id === id);
  if (idx < 0) return 0;
  const [card] = state.cards.splice(idx, 1);
  const worth = Math.max(card.value, Math.max(state.clickValue, computePerSec(state) * TUNING.cardWorthSec));
  addCompute(state, worth);
  return worth;
}

function spawnCard(state: V3State): void {
  if (state.cards.length >= TUNING.cardMaxOnScreen) return;
  const label = CARD_LABELS[state.nextCardId % CARD_LABELS.length];
  // 卡值跟涨：一张卡 = 白捡 cardWorthSec 秒的被动产出（地板 clickValue）——后期依然值得点。
  const value = Math.max(state.clickValue, computePerSec(state) * TUNING.cardWorthSec);
  state.cards.push({ id: state.nextCardId++, label, value, bornMs: state.clockMs });
}

// 每帧推进：/秒 被动产出 + 出卡 + 过期卡流失。dtSec = 距上帧秒数。
export function tick(state: V3State, dtSec: number): void {
  const dtMs = dtSec * 1000;
  state.clockMs += dtMs;
  addCompute(state, computePerSec(state) * dtSec);

  state.cardTimerMs += dtMs;
  if (state.cardTimerMs >= TUNING.cardSpawnMs) {
    state.cardTimerMs -= TUNING.cardSpawnMs;
    spawnCard(state);
  }
  // 普通卡永不过期——满上限就停止生成（spawnCard 内已挡）；挂机回来一把收掉攒着的卡是奖励。
}

// 展示用格式化：K/M/B/T…
export function fmt(n: number): string {
  if (n < 1000) return n < 10 ? n.toFixed(1) : Math.floor(n).toString();
  const units = ["", "K", "M", "B", "T", "Qa", "Qi"];
  let u = 0;
  let v = n;
  while (v >= 1000 && u < units.length - 1) {
    v /= 1000;
    u += 1;
  }
  return `${v.toFixed(2)}${units[u]}`;
}
