// 《烽火敌后》· 抗日根据地 × CookieClicker 核心逻辑（纯逻辑，无 DOM/WebGL）。
// 玩家=敌后抗日根据地的组织者。双资源：兵员(人) + 物资(粮弹药)。点击「发动群众」起手，
// 建设施自动产出，搞政策运动加成，攒够就「发动战役/收复失地」点亮地图。日军「扫荡/封锁」定期造成真实损失。
// 历史内核=《论持久战》三阶段：战略防御(极难) → 相持发展(百团大战) → 1941-42 最艰难期(大扫荡/三光/囚笼) → 局部反攻·收复失地。
// 数值 CookieClicker 式（成本 ×1.15），经 sim 验证核心循环可跑通全弧线。

// ── 建设施：用物资(部分含兵员)购买，自动产出 兵员/物资。热力/年代色 ──
export interface BuildingDef {
  id: string;
  name: string;
  desc: string;
  costWuzi: number; // 物资基础价
  costBing: number; // 兵员基础价（多数为 0）
  costMult: number;
  bing: number; // 每台 +兵员/秒
  wuzi: number; // 每台 +物资/秒
  defense: number; // 每台减免扫荡损失比例的贡献
  unlockPhase: number; // 第几阶段解锁(0-3)
}
export const BUILDINGS: BuildingDef[] = [
  { id: "militia", name: "民兵队", desc: "农民放下锄头拿起枪，村自卫队。", costWuzi: 15, costBing: 0, costMult: 1.15, bing: 0.2, wuzi: 0, defense: 0.01, unlockPhase: 0 },
  { id: "farm", name: "开荒生产队", desc: "自己动手，丰衣足食——垦荒种粮。", costWuzi: 120, costBing: 0, costMult: 1.15, bing: 0, wuzi: 1.2, defense: 0, unlockPhase: 0 },
  { id: "tunnel", name: "地道网", desc: "村村相连、户户相通，打了就钻。", costWuzi: 900, costBing: 5, costMult: 1.15, bing: 0, wuzi: 0, defense: 0.06, unlockPhase: 0 },
  { id: "arsenal", name: "复装弹药所", desc: "复装子弹、造手榴弹、拉地雷。", costWuzi: 6_500, costBing: 8, costMult: 1.15, bing: 0, wuzi: 9, defense: 0, unlockPhase: 1 },
  { id: "intel", name: "情报站", desc: "消息树、儿童团放哨——扫荡提前预警。", costWuzi: 42_000, costBing: 20, costMult: 1.15, bing: 0, wuzi: 4, defense: 0.03, unlockPhase: 1 },
  { id: "supply", name: "被服医疗队", desc: "被服厂、战地医院，留住有生力量。", costWuzi: 260_000, costBing: 40, costMult: 1.15, bing: 1.6, wuzi: 20, defense: 0, unlockPhase: 1 },
  { id: "raid", name: "破袭队", desc: "破袭铁路公路，缴获敌军物资。", costWuzi: 1.2e6, costBing: 120, costMult: 1.15, bing: 0, wuzi: 260, defense: 0.01, unlockPhase: 2 },
  { id: "college", name: "抗大分校", desc: "抗日军政大学——整训干部、扩大骨干。", costWuzi: 5e6, costBing: 300, costMult: 1.15, bing: 20, wuzi: 120, defense: 0, unlockPhase: 2 },
  { id: "mainforce", name: "主力团", desc: "脱产的正规主力，能打大仗。", costWuzi: 3.5e6, costBing: 800, costMult: 1.15, bing: 45, wuzi: 1200, defense: 0.02, unlockPhase: 2 },
  { id: "arsenal2", name: "黄崖洞兵工厂", desc: "自造步枪掷弹筒——根据地的军工心脏。", costWuzi: 1.1e7, costBing: 2000, costMult: 1.15, bing: 0, wuzi: 9000, defense: 0, unlockPhase: 3 }
];

// ── 政策/运动：一次性倍率，真实历史政策名。 ──
export interface PolicyDef {
  id: string;
  name: string;
  desc: string;
  cost: number; // 物资
  kind: "wuzi" | "bing" | "all" | "defense" | "click";
  mult: number; // 该类产出 ×mult（defense=+mult 减免；click=×mult 点击）
  revealAt: number; // 累计物资达到显形
}
export const POLICIES: PolicyDef[] = [
  { id: "rent", name: "减租减息", desc: "减轻农民负担，发动更广。", cost: 500, kind: "all", mult: 1.5, revealAt: 200 },
  { id: "produce", name: "大生产运动", desc: "南泥湾开荒——生产翻倍。", cost: 30_000, kind: "wuzi", mult: 2, revealAt: 8_000 },
  { id: "mine", name: "地雷战", desc: "家家户户造地雷，扫荡寸步难行。", cost: 120_000, kind: "defense", mult: 0.12, revealAt: 40_000 },
  { id: "streamline", name: "精兵简政", desc: "缩小机关、充实连队，度过难关。", cost: 900_000, kind: "all", mult: 1.6, revealAt: 300_000 },
  { id: "sparrow", name: "麻雀战", desc: "分散袭扰、聚零为整——手更狠。", cost: 6e6, kind: "click", mult: 4, revealAt: 2e6 },
  { id: "counter", name: "反攻练兵", desc: "大练兵，为局部反攻蓄力。", cost: 5e7, kind: "bing", mult: 2.5, revealAt: 2e7 }
];

// ── 战役/收复失地：花 兵员+物资 发动，占领区域点亮地图 + 永久产出加成。真实战役里程碑。 ──
export interface RegionDef {
  id: string;
  name: string; // 根据地/区域名
  battle: string; // 代表战役/事件
  x: number; y: number; // 地图归一化坐标(0-1)
  costBing: number;
  costWuzi: number;
  outputMult: number; // 收复后 全局产出 ×此
  requiresPhase: number;
  line: string; // 收复时终端台词
}
// 战役造价：兵员=主要代价(攒军队发动战役)，物资=辅助(~几分钟产出，别当墙)。
export const REGIONS: RegionDef[] = [
  { id: "wutai", name: "晋察冀·五台山", battle: "平型关大捷", x: 0.44, y: 0.30, costBing: 30, costWuzi: 300, outputMult: 1.25, requiresPhase: 0, line: "平型关一战，打破『日军不可战胜』的神话。晋察冀，第一块敌后根据地立住了。" },
  { id: "taihang", name: "晋冀鲁豫·太行", battle: "长乐村急袭", x: 0.40, y: 0.45, costBing: 90, costWuzi: 1_200, outputMult: 1.25, requiresPhase: 0, line: "太行山成了华北的脊梁。八路军总部就扎在这里。" },
  { id: "jinsui", name: "晋绥·大青山", battle: "雁门关伏击", x: 0.33, y: 0.24, costBing: 240, costWuzi: 5_000, outputMult: 1.28, requiresPhase: 1, line: "雁门关伏击、破袭同蒲路——晋绥连成一片，护住陕甘宁的东大门。" },
  { id: "jizhong", name: "冀中平原", battle: "地道战", x: 0.55, y: 0.34, costBing: 650, costWuzi: 1.8e4, outputMult: 1.3, requiresPhase: 1, line: "无险可守的大平原，硬是用地道织成了地下长城。" },
  { id: "huangyai", name: "黄土岭", battle: "击毙阿部规秀", x: 0.47, y: 0.26, costBing: 1_600, costWuzi: 4e4, outputMult: 1.32, requiresPhase: 1, line: "黄土岭一炮，击毙『名将之花』阿部规秀中将——日军哀嚎。" },
  { id: "baituan", name: "正太·同蒲铁路线", battle: "百团大战", x: 0.42, y: 0.38, costBing: 5_000, costWuzi: 9e4, outputMult: 1.42, requiresPhase: 1, line: "百团大战！一夜之间，华北的铁路公路被同时破袭——全国振奋，这是相持阶段最响亮的反击。" },
  { id: "shandong", name: "山东·沂蒙", battle: "梁山歼灭战", x: 0.63, y: 0.42, costBing: 1.4e4, costWuzi: 2e5, outputMult: 1.35, requiresPhase: 2, line: "沂蒙山下，人民用小推车推出了根据地。山东连成一片。" },
  { id: "qinyuan", name: "太岳·沁源", battle: "沁源围困战", x: 0.38, y: 0.52, costBing: 4e4, costWuzi: 5e5, outputMult: 1.38, requiresPhase: 2, line: "两年半围困，把占城的日军活活困走——一座不屈的空城。" },
  { id: "chejiao", name: "苏中·车桥", battle: "车桥战役", x: 0.70, y: 0.55, costBing: 1.1e5, costWuzi: 1.2e6, outputMult: 1.42, requiresPhase: 3, line: "车桥战役，攻坚打援全歼——局部反攻的序幕拉开了。" },
  { id: "counter45", name: "华北大反攻", battle: "1945 大反攻", x: 0.52, y: 0.44, costBing: 3.5e5, costWuzi: 5e6, outputMult: 1.6, requiresPhase: 3, line: "反攻的号角吹响！收复一座座县城——敌后的星火，终于燎原成燎天大火。" }
];

// ── 阶段（《论持久战》三阶段 + 反攻），按累计物资/已收复推进 ──
export interface PhaseDef { id: number; name: string; year: string; note: string; atTotalWuzi: number; }
export const PHASES: PhaseDef[] = [
  { id: 0, name: "战略防御", year: "1937-38", note: "敌强我弱。在敌后的缝隙里，一点点扎下根据地。", atTotalWuzi: 0 },
  { id: 1, name: "战略相持·发展", year: "1939-40", note: "站稳了。扩军、生产、破袭——直到打出百团大战。", atTotalWuzi: 5_000 },
  { id: 2, name: "最艰难的岁月", year: "1941-42", note: "日军疯狂大扫荡、三光政策、囚笼封锁。根据地缩水、人口锐减——这是黎明前最黑的夜。多建地道、搞地雷战，才能扛过去。", atTotalWuzi: 6e5 },
  { id: 3, name: "局部反攻", year: "1943-45", note: "熬过来了。生产恢复、主力壮大，开始一座座收复失地。", atTotalWuzi: 3e7 }
];

export interface KRState {
  bing: number; // 兵员
  wuzi: number; // 物资
  totalWuzi: number; // 累计物资（阶段/解锁判定）
  clickN: number; // 点击次数
  buildings: number[];
  policies: Record<string, boolean>;
  regions: Record<string, boolean>; // 已收复
  clockMs: number;
  sweepTimerMs: number; // 距下次扫荡
  lastSweepMs: number;
  pendingSweep: number | null; // 待发起的扫荡：日军数量（由表现层拉起 3D 战斗，战斗结果回填损失/缴获）
  terminal: { text: string; kind: "info" | "win" | "loss" | "era" }[];
  phaseShown: number;
}

export const TUNING = {
  clickBing: 1, // 点击基础 +兵员
  clickWuzi: 2, // 点击基础 +物资
  sweepBaseMs: 110_000, // 扫荡基础间隔
  sweepMinMs: 72_000,
  sweepLossFrac: 0.24, // 扫荡基础损失比例（资源+建筑）——疼但能扛（配合地道/地雷可压很低）
  hardPhase: 2, // 最艰难期
  hardSweepMult: 1.5, // 最艰难期扫荡更频更狠（但非灭顶）
  garrisonPerRegion: 0 // 预留
};

export function createKRState(): KRState {
  return {
    bing: 0, wuzi: 0, totalWuzi: 0, clickN: 0,
    buildings: BUILDINGS.map(() => 0), policies: {}, regions: {},
    clockMs: 0, sweepTimerMs: TUNING.sweepBaseMs, lastSweepMs: 0, pendingSweep: null,
    terminal: [{ text: "1937 · 卢沟桥的枪声响了。华北沦陷，但敌后的缝隙里——根据地要在这里扎根。", kind: "era" }],
    phaseShown: 0
  };
}

export function phase(s: KRState): number {
  let p = 0;
  for (const ph of PHASES) if (s.totalWuzi >= ph.atTotalWuzi) p = ph.id;
  return p;
}
export function regionsReclaimed(s: KRState): number {
  return Object.values(s.regions).filter(Boolean).length;
}

// 政策倍率
function polMult(s: KRState, kind: PolicyDef["kind"]): number {
  let m = 1;
  for (const p of POLICIES) if (s.policies[p.id] && p.kind === kind) m *= p.mult;
  // "all" 影响 wuzi/bing
  if (kind === "wuzi" || kind === "bing") for (const p of POLICIES) if (s.policies[p.id] && p.kind === "all") m *= p.mult;
  return m;
}
// 收复失地的全局产出加成
export function regionMult(s: KRState): number {
  let m = 1;
  for (const r of REGIONS) if (s.regions[r.id]) m *= r.outputMult;
  return m;
}
export function clickMult(s: KRState): number {
  return polMult(s, "click");
}

// 每秒产出
export function bingPerSec(s: KRState): number {
  let sum = 0;
  for (let i = 0; i < BUILDINGS.length; i++) sum += BUILDINGS[i].bing * s.buildings[i];
  return sum * polMult(s, "bing") * regionMult(s);
}
export function wuziPerSec(s: KRState): number {
  let sum = 0;
  for (let i = 0; i < BUILDINGS.length; i++) sum += BUILDINGS[i].wuzi * s.buildings[i];
  return sum * polMult(s, "wuzi") * regionMult(s);
}
// 扫荡损失减免（地道/地雷/情报）：返回 0-0.85
export function defense(s: KRState): number {
  let d = 0;
  for (let i = 0; i < BUILDINGS.length; i++) d += BUILDINGS[i].defense * s.buildings[i];
  for (const p of POLICIES) if (s.policies[p.id] && p.kind === "defense") d += p.mult;
  return Math.min(0.85, d);
}

// 成本
export function buildCostWuzi(s: KRState, i: number): number {
  return Math.ceil(BUILDINGS[i].costWuzi * Math.pow(BUILDINGS[i].costMult, s.buildings[i]));
}
export function buildCostBing(s: KRState, i: number): number {
  return Math.ceil(BUILDINGS[i].costBing * Math.pow(BUILDINGS[i].costMult, s.buildings[i]));
}
export function buildingUnlocked(s: KRState, i: number): boolean {
  return s.buildings[i] > 0 || phase(s) >= BUILDINGS[i].unlockPhase;
}
export function policyRevealed(s: KRState, p: PolicyDef): boolean {
  return s.policies[p.id] || s.totalWuzi >= p.revealAt;
}
export function regionAvailable(s: KRState, r: RegionDef): boolean {
  return !s.regions[r.id] && phase(s) >= r.requiresPhase;
}

function pushT(s: KRState, text: string, kind: KRState["terminal"][number]["kind"]): void {
  s.terminal.push({ text, kind });
  if (s.terminal.length > 80) s.terminal.shift();
}

// 点击：发动群众
export function rally(s: KRState): { bing: number; wuzi: number } {
  const b = TUNING.clickBing * clickMult(s) * regionMult(s);
  const w = TUNING.clickWuzi * clickMult(s) * regionMult(s);
  s.bing += b; s.wuzi += w; s.totalWuzi += w; s.clickN += 1;
  return { bing: b, wuzi: w };
}

export function buyBuilding(s: KRState, i: number): boolean {
  if (!buildingUnlocked(s, i)) return false;
  const cw = buildCostWuzi(s, i), cb = buildCostBing(s, i);
  if (s.wuzi < cw || s.bing < cb) return false;
  s.wuzi -= cw; s.bing -= cb; s.buildings[i] += 1;
  return true;
}
export function buyPolicy(s: KRState, id: string): boolean {
  const p = POLICIES.find((x) => x.id === id);
  if (!p || s.policies[id] || s.wuzi < p.cost) return false;
  s.wuzi -= p.cost; s.policies[id] = true;
  pushT(s, `【${p.name}】${p.desc}`, "info");
  return true;
}
// 发动战役·收复失地
export function launchOp(s: KRState, id: string): boolean {
  const r = REGIONS.find((x) => x.id === id);
  if (!r || s.regions[id] || phase(s) < r.requiresPhase) return false;
  if (s.bing < r.costBing || s.wuzi < r.costWuzi) return false;
  s.bing -= r.costBing; s.wuzi -= r.costWuzi; s.regions[id] = true;
  pushT(s, `★ ${r.battle}：${r.line}`, "win");
  return true;
}

// 扫荡日军数量：随阶段增多，被地道/地雷/情报(defense)拦下一批 → 减少压进村的敌人。
export function sweepCount(s: KRState): number {
  const p = phase(s);
  const base = 4 + p * 3, hard = p === TUNING.hardPhase ? TUNING.hardSweepMult : 1;
  return Math.max(3, Math.round(base * hard * (1 - defense(s) * 0.7)));
}
// 触发扫荡：只标记 pendingSweep（表现层据此拉起 3D 战斗）。
function triggerSweep(s: KRState): void {
  s.pendingSweep = sweepCount(s);
  const hard = phase(s) === TUNING.hardPhase;
  if (hard) pushT(s, `⚠ 日军大扫荡·三光政策！${s.pendingSweep} 股敌人压进根据地——组织反扫荡！`, "loss");
  else pushT(s, `⚠ 日军扫荡！${s.pendingSweep} 个鬼子进村——打退它们，别让它们烧房抢粮！`, "loss");
  s.lastSweepMs = s.clockMs;
}
// 3D 战斗结算：烧了几间房 → 损失多少资源+毁设施；击毙几个日军 → 缴获物资。sim 无表现层时也可直接调（burned 近似）。
export function applySweepResult(s: KRState, burned: number, total: number, killed: number): void {
  const hard = phase(s) === TUNING.hardPhase;
  const frac = TUNING.sweepLossFrac * (hard ? TUNING.hardSweepMult : 1);
  const loss = Math.max(0, frac * (total > 0 ? burned / total : 0.4));
  s.wuzi -= s.wuzi * loss; s.bing -= s.bing * loss;
  let destroyed = 0;
  for (let i = 0; i < s.buildings.length; i++) {
    if (s.buildings[i] > 0 && Math.random() < loss * 0.6) { const d = Math.ceil(s.buildings[i] * loss * 0.5); s.buildings[i] -= d; destroyed += d; }
  }
  const loot = killed * (30 + phase(s) * 200) * regionMult(s);
  s.wuzi += loot; s.totalWuzi += loot;
  if (burned === 0) pushT(s, `★ 反扫荡大捷！击毙日军 ${killed}，一间房没让它烧着，缴获物资 ${fmt(loot)}！`, "win");
  else pushT(s, `反扫荡结束：击毙 ${killed}，烧毁民房 ${burned}/${total}，损失 ${Math.round(loss * 100)}% 资源、设施 ${destroyed}，缴获 ${fmt(loot)}。`, burned > total / 2 ? "loss" : "info");
  s.pendingSweep = null;
}

// 每帧推进：产出 + 扫荡计时 + 阶段播报。
export function tick(s: KRState, dtSec: number): void {
  s.clockMs += dtSec * 1000;
  s.bing += bingPerSec(s) * dtSec;
  s.wuzi += wuziPerSec(s) * dtSec;
  s.totalWuzi += wuziPerSec(s) * dtSec;

  // 扫荡计时（有产出才会被盯上；最艰难期更频繁）
  if (bingPerSec(s) + wuziPerSec(s) > 0.5 || s.wuzi > 500) {
    s.sweepTimerMs -= dtSec * 1000;
    if (s.sweepTimerMs <= 0) {
      triggerSweep(s);
      const hard = phase(s) === TUNING.hardPhase;
      const base = hard ? TUNING.sweepBaseMs / TUNING.hardSweepMult : TUNING.sweepBaseMs;
      s.sweepTimerMs = Math.max(TUNING.sweepMinMs, base) * (0.8 + Math.random() * 0.4);
    }
  }

  // 阶段播报
  const p = phase(s);
  if (p > s.phaseShown) {
    s.phaseShown = p;
    const ph = PHASES[p];
    pushT(s, `── ${ph.year} · ${ph.name} ──　${ph.note}`, "era");
  }
}

const UNITS = ["", "万", "亿", "兆"];
export function fmt(n: number): string {
  if (!isFinite(n)) return "∞";
  if (n < 10_000) return n < 10 ? (Math.round(n * 10) / 10).toString() : Math.floor(n).toLocaleString("en-US");
  let u = 0, v = n;
  while (v >= 10_000 && u < UNITS.length - 1) { v /= 10_000; u += 1; }
  return `${v.toFixed(2)}${UNITS[u]}`;
}
