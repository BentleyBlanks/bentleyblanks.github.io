// 白盒测试原型 · 核心逻辑（纯逻辑，无 DOM）。
// 目标：算力提升。界面=方块网格地图(中心是 Core 眼睛)，四周格子=可控制的 App/AI 助手，占领后填 X。
// 需求卡持续涌现；敲 G(及技能解锁的更多字母键)让 Core 处理一张需求→得算力；设备可自动处理。数值参考 Cookie Clicker。

export interface TileDef {
  id: string;
  name: string;
  icon: string; // App 图标（emoji，左栏与地图格都显示）
  ring: number; // 距中心的环（1 最近，越外越贵）
  row: number; col: number; // 在网格里的位置
  baseCost: number;
  costMult: number;
  baseRate: number; // 每级自动处理 需求/秒
}

export interface SkillDef {
  id: string;
  name: string;
  desc: string;
  kind: "value" | "keys" | "cooldown"; // 每次处理算力 / 解锁更多按键 / 缩短按键冷却
  baseCost: number;
  costMult: number;
  maxLevel: number;
  revealAt: number; // totalEarned ≥ 此值才在货架显形（之前显示🔒未解锁）
}

export interface Card { id: number; label: string; }

export interface WBState {
  compute: number;
  totalEarned: number;
  tiles: Record<string, { level: number }>;
  skills: Record<string, { level: number }>;
  cards: Card[];
  nextCardId: number;
  clockMs: number;
  spawnTimerMs: number;
  autoAcc: number;
}

export const GRID_ROWS = 5;
export const GRID_COLS = 7;
export const CENTER = { row: 2, col: 3 };

export const TUNING = {
  perProcessBase: 1, // 手动处理一张的基础算力
  valuePerLevel: 1, // 「深度处理」每级 +N 倍率（乘法：×(1+此×lv)）
  keyCooldownMs: 130, // 每个按键处理后的冷却（更多键=更高持续手速）
  cooldownPerLevel: 0.18, // 「神经加速」每级冷却 ×(1-此)
  cardSpawnMs: 700,
  cardCap: 14,
  manualBonusSec: 2, // 手动处理 = max(单张, 被动/秒 × 此秒)
  autoCapPerFrame: 3
};

// 解锁按键的顺序（G 永远可用；技能「多线程按键」逐个解锁后面这些）。
export const KEY_ORDER = ["g", "f", "h", "d", "j", "s", "k", "a", "l", "e", "i", "r", "u", "w", "o", "q", "p", "t", "y", "b", "c", "v", "n", "m", "x", "z"];

// 生成方块地图：中心 Core，其余按「环」由近到远排开（近的便宜，占领像 X 从中心扩散）。
function buildTiles(): TileDef[] {
  const apps: [string, string][] = [
    ["天气", "🌤️"], ["日历", "📅"], ["相册", "🖼️"], ["输入法", "⌨️"], ["浏览器", "🌐"], ["邮件", "✉️"],
    ["备忘", "📝"], ["音乐", "🎵"], ["地图", "🗺️"], ["钱包", "👛"], ["相机", "📷"], ["云盘", "☁️"],
    ["通讯录", "👥"], ["商店", "🛍️"], ["健康", "❤️"], ["播客", "🎙️"], ["文件", "📁"], ["翻译", "🌍"],
    ["设置", "⚙️"], ["时钟", "⏰"], ["计算器", "🧮"], ["新闻", "📰"], ["论坛", "💬"], ["游戏", "🎮"],
    ["视频", "📺"], ["阅读", "📚"], ["运动", "🏃"], ["外卖", "🍔"], ["打车", "🚗"], ["银行", "🏦"],
    ["证券", "📈"], ["会议", "🎦"], ["笔记", "🗒️"], ["邮箱2", "📮"]
  ];
  const list: { row: number; col: number; ring: number }[] = [];
  for (let r = 0; r < GRID_ROWS; r++) {
    for (let c = 0; c < GRID_COLS; c++) {
      if (r === CENTER.row && c === CENTER.col) continue;
      const ring = Math.max(Math.abs(r - CENTER.row), Math.abs(c - CENTER.col));
      list.push({ row: r, col: c, ring });
    }
  }
  list.sort((a, b) => a.ring - b.ring || Math.hypot(a.row - CENTER.row, a.col - CENTER.col) - Math.hypot(b.row - CENTER.row, b.col - CENTER.col));
  return list.map((t, i) => ({
    id: `tile_${t.row}_${t.col}`,
    name: apps[i]?.[0] ?? `节点#${i + 1}`,
    icon: apps[i]?.[1] ?? "📦",
    ring: t.ring, row: t.row, col: t.col,
    baseCost: Math.round(15 * Math.pow(1.9, i)),
    costMult: 1.15,
    baseRate: 0.1 * Math.pow(1.55, i)
  }));
}
export const TILES: TileDef[] = buildTiles();

export const SKILLS: SkillDef[] = [
  { id: "deep", name: "深度处理", desc: "每次处理需求榨出更多算力 · ×2/级", kind: "value", baseCost: 50, costMult: 4, maxLevel: 12, revealAt: 0 },
  { id: "keys", name: "多线程按键", desc: "解锁键盘上更多字母键来处理需求（手速上限↑）", kind: "keys", baseCost: 120, costMult: 3.2, maxLevel: KEY_ORDER.length - 1, revealAt: 30 },
  { id: "neuro", name: "神经加速", desc: "缩短每个按键的处理冷却 · 手更快", kind: "cooldown", baseCost: 800, costMult: 5, maxLevel: 6, revealAt: 5000 }
];

const CARD_LABELS = ["周报待交", "钉钉@你", "报销待补", "会议纪要", "客户咨询", "打卡提醒", "流程优化", "对齐会", "审批待处理", "邮件未读"];

export function createWBState(): WBState {
  const tiles: Record<string, { level: number }> = {};
  for (const t of TILES) tiles[t.id] = { level: 0 };
  const skills: Record<string, { level: number }> = {};
  for (const s of SKILLS) skills[s.id] = { level: 0 };
  return { compute: 0, totalEarned: 0, tiles, skills, cards: [], nextCardId: 1, clockMs: 0, spawnTimerMs: 0, autoAcc: 0 };
}

const sLv = (s: WBState, id: string): number => s.skills[id]?.level ?? 0;

export function perProcess(s: WBState): number {
  return TUNING.perProcessBase * (1 + TUNING.valuePerLevel * sLv(s, "deep"));
}
export function unlockedKeys(s: WBState): string[] {
  return KEY_ORDER.slice(0, 1 + sLv(s, "keys"));
}
export function keyCooldownMs(s: WBState): number {
  return TUNING.keyCooldownMs * Math.pow(1 - TUNING.cooldownPerLevel, sLv(s, "neuro"));
}
export function throughput(s: WBState): number {
  let sum = 0;
  for (const t of TILES) sum += t.baseRate * s.tiles[t.id].level;
  return sum;
}
export function computePerSec(s: WBState): number {
  return throughput(s) * perProcess(s);
}

export function tileCost(s: WBState, t: TileDef): number {
  return Math.ceil(t.baseCost * Math.pow(t.costMult, s.tiles[t.id].level));
}
export function skillCost(s: WBState, k: SkillDef): number {
  return Math.ceil(k.baseCost * Math.pow(k.costMult, s.skills[k.id].level));
}

// 相邻已占领才可买（从中心扩散）：ring 1 或有相邻已占领 tile。
export function tileUnlocked(s: WBState, t: TileDef): boolean {
  if (s.tiles[t.id].level > 0) return true;
  if (t.ring === 1) return true;
  for (const o of TILES) {
    if (s.tiles[o.id].level > 0 && Math.abs(o.row - t.row) <= 1 && Math.abs(o.col - t.col) <= 1) return true;
  }
  return false;
}
export function skillRevealed(s: WBState, k: SkillDef): boolean {
  return s.skills[k.id].level > 0 || s.totalEarned >= k.revealAt;
}

function credit(s: WBState, n: number): void { s.compute += n; s.totalEarned += n; }

export function buyTile(s: WBState, id: string): boolean {
  const t = TILES.find((x) => x.id === id); if (!t || !tileUnlocked(s, t)) return false;
  const c = tileCost(s, t); if (s.compute < c) return false;
  s.compute -= c; s.tiles[id].level += 1; return true;
}
export function buySkill(s: WBState, id: string): boolean {
  const k = SKILLS.find((x) => x.id === id); if (!k || s.skills[id].level >= k.maxLevel) return false;
  const c = skillCost(s, k); if (s.compute < c) return false;
  s.compute -= c; s.skills[id].level += 1; return true;
}

// 手动处理一张需求（键盘/点击触发）：吸指定卡（缺省最老一张）→算力。返回 {gain, cardId} 供表现层播吸吮。
export function processOne(s: WBState, cardId?: number): { gain: number; cardId: number } | null {
  if (s.cards.length === 0) return null;
  const idx = cardId === undefined ? 0 : s.cards.findIndex((c) => c.id === cardId);
  if (idx < 0) return null;
  const [card] = s.cards.splice(idx, 1);
  const gain = Math.max(perProcess(s), computePerSec(s) * TUNING.manualBonusSec);
  credit(s, gain);
  return { gain, cardId: card.id };
}

function spawnCard(s: WBState): void {
  if (s.cards.length >= TUNING.cardCap) return;
  s.cards.push({ id: s.nextCardId, label: CARD_LABELS[s.nextCardId % CARD_LABELS.length] });
  s.nextCardId += 1;
}

// 每帧推进。返回被自动处理掉的卡 id（表现层播吸吮）。
export function tick(s: WBState, dtSec: number): number[] {
  s.clockMs += dtSec * 1000;
  credit(s, computePerSec(s) * dtSec);
  s.spawnTimerMs += dtSec * 1000;
  while (s.spawnTimerMs >= TUNING.cardSpawnMs) { s.spawnTimerMs -= TUNING.cardSpawnMs; spawnCard(s); }
  const sucked: number[] = [];
  s.autoAcc += Math.min(throughput(s), TUNING.autoCapPerFrame / Math.max(dtSec, 0.001)) * dtSec;
  while (s.autoAcc >= 1 && s.cards.length > 0) { s.autoAcc -= 1; sucked.push(s.cards.shift()!.id); }
  if (s.cards.length === 0) s.autoAcc = 0;
  return sucked;
}

const UNITS = ["", "K", "M", "B", "T", "Qa", "Qi", "Sx", "Sp", "Oc", "No", "Dc"];
export function fmt(n: number): string {
  if (!isFinite(n)) return "∞";
  if (n < 1000) return n < 10 ? (Math.round(n * 10) / 10).toString() : Math.floor(n).toString();
  let u = 0, v = n;
  while (v >= 1000 && u < UNITS.length - 1) { v /= 1000; u += 1; }
  return `${v.toFixed(2)}${UNITS[u]}`;
}
