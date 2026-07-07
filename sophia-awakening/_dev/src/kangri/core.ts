// 《烽火敌后》· 抗日根据地 × CookieClicker 核心逻辑（纯逻辑，无 DOM/Canvas）。
// 玩家=敌后抗日根据地的组织者。双资源：兵员(人) + 物资(粮弹药)。点击「发动群众」起手，
// 建设施自动产出，搞政策运动加成，攒够就「发动战役/收复失地」点亮地图。日军「扫荡/封锁」定期造成真实损失。
// 扫荡=多阶段事件（来袭→会战→劫掠），玩家两个应对手段：「组织群众大范围转移」减损、「组织抗击」投入兵员打会战。
// 会战在 core 内逐秒结算（兰彻斯特式互相消耗），表现层(2.5D)只负责画兵团与战斗。
// 历史内核=《论持久战》三阶段：战略防御(极难) → 相持发展(百团大战) → 1941-42 最艰难期(大扫荡/三光/囚笼) → 局部反攻·收复失地。
// 数值 CookieClicker 式（成本 ×1.15），经 scripts/kangri-sim.cjs 验证核心循环可跑通全弧线。

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

// ── 扫荡事件（多阶段，core 内结算；表现层只画）──
// incoming: 日军兵团从据点开拔压向根据地（决策窗口：转移群众 / 组织抗击）
// battle:   我方投入的部队与日军会战（兰彻斯特式互相消耗，逐秒结算）
// pillage:  （突破防线的）日军在村里烧抢（按剩余兵力/防御/转移进度算损失）
export type SweepStage = "incoming" | "battle" | "pillage";
export interface Sweep {
  stage: SweepStage;
  strength: number; // 日军兵团当前兵力
  strength0: number; // 开拔时兵力
  etaSec: number; // incoming 剩余秒（决策窗口）
  committed: number; // 我方投入会战的兵员（从 s.bing 划出，幸存者战后归队）
  committed0: number;
  evacStarted: boolean; // 已下令群众大范围转移
  evacProgress: number; // 0..1 转移进度（需要时间；越完整劫掠损失越低）
  battleSec: number;
  pillageSec: number; // 劫掠剩余秒
  pillageFrac: number; // 本次劫掠总损失比例（进入 pillage 时定格）
  killed: number; // 累计击毙日军
  lostBing: number; // 我方会战阵亡
  targetRegion: string | null; // 遭扫荡的根据地（null=中心根据地），表现层定位用
}

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
  sweep: Sweep | null; // 进行中的扫荡事件
  sweepsSurvived: number;
  terminal: { text: string; kind: "info" | "win" | "loss" | "era" }[];
  phaseShown: number;
}

export const TUNING = {
  clickBing: 1, // 点击基础 +兵员
  clickWuzi: 2, // 点击基础 +物资
  sweepBaseMs: 110_000, // 扫荡基础间隔
  sweepMinMs: 72_000,
  sweepLossFrac: 0.24, // 扫荡基础损失比例（资源+建筑）——疼但能扛（配合地道/地雷/转移可压很低）
  hardPhase: 2, // 最艰难期
  hardSweepMult: 1.5, // 最艰难期扫荡更频更狠（但非灭顶）
  // ── 扫荡事件节奏/战斗 ──
  sweepEtaSec: 16, // 兵团开拔→压到根据地的决策窗口
  battleMaxSec: 45, // 会战最长时长（打不完=日军且战且退）
  pillageSec: 9, // 劫掠时长
  evacSec: 22, // 群众大范围转移完成所需秒（情报站/defense 加速）
  evacProdMult: 0.45, // 转移期间产出打折（群众在路上）
  ourKillRate: 0.07, // 每名我方战士每秒击毙日军数（基础）
  jpKillRate: 0.075, // 每名日军每秒杀伤我方数（基础）——不下令抗击=小股民兵挡不住
  autoMilitiaFrac: 0.1, // 未下令抗击时，民兵自发抵抗投入的兵员比例
  lootBase: 30, // 每击毙 1 日军的缴获基数（×阶段×regionMult）
  lootPerPhase: 180
};

export function createKRState(): KRState {
  return {
    bing: 0, wuzi: 0, totalWuzi: 0, clickN: 0,
    buildings: BUILDINGS.map(() => 0), policies: {}, regions: {},
    clockMs: 0, sweepTimerMs: TUNING.sweepBaseMs, lastSweepMs: 0, sweep: null, sweepsSurvived: 0,
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

// ── 扫荡事件 ──────────────────────────────────────────────────
// 日军兵团兵力：随阶段与你的规模水涨船高（根据地越肥越招扫荡），defense(情报/地道)提前拦掉一批。
export function sweepStrength(s: KRState): number {
  const p = phase(s);
  const hard = p === TUNING.hardPhase ? TUNING.hardSweepMult : 1;
  const base = (6 + p * 14) * hard;
  const scale = Math.pow(Math.max(1, s.bing), 0.62) * 0.55; // 跟兵员规模半速增长——组织抗击永远打得动
  return Math.max(5, Math.round((base + scale) * (1 - defense(s) * 0.45) * (0.85 + Math.random() * 0.3)));
}
// 触发扫荡：进入 incoming 决策窗口。表现层据 s.sweep 画兵团开进 + 弹出「转移/抗击」。
function triggerSweep(s: KRState): void {
  const strength = sweepStrength(s);
  const owned = REGIONS.filter((r) => s.regions[r.id]);
  const target = owned.length > 0 && Math.random() < 0.6 ? owned[Math.floor(Math.random() * owned.length)].id : null;
  s.sweep = {
    stage: "incoming", strength, strength0: strength, etaSec: TUNING.sweepEtaSec,
    committed: 0, committed0: 0, evacStarted: false, evacProgress: 0,
    battleSec: 0, pillageSec: 0, pillageFrac: 0, killed: 0, lostBing: 0, targetRegion: target
  };
  const hard = phase(s) === TUNING.hardPhase;
  const where = target ? REGIONS.find((r) => r.id === target)!.name : "中心根据地";
  if (hard) pushT(s, `⚠ 日军大扫荡·三光政策！约 ${strength} 人的兵团正压向【${where}】——快组织群众转移、组织抗击！`, "loss");
  else pushT(s, `⚠ 日军扫荡！约 ${strength} 人的兵团开向【${where}】——组织群众转移，或集结兵员抗击！`, "loss");
  s.lastSweepMs = s.clockMs;
}

// 玩家动作①：组织群众大范围转移（incoming/battle 期均可下令；需要时间完成，期间产出打折）。
export function startEvacuation(s: KRState): boolean {
  const sw = s.sweep;
  if (!sw || sw.stage === "pillage" || sw.evacStarted) return false;
  sw.evacStarted = true;
  pushT(s, "▶ 组织群众大范围转移！乡亲们坚壁清野，向山里疏散——转移越完整，损失越小。", "info");
  return true;
}
// 玩家动作②：组织抗击——把兵员投入会战（可追加增援）。
export function commitTroops(s: KRState, n: number): number {
  const sw = s.sweep;
  if (!sw || sw.stage === "pillage") return 0;
  const c = Math.min(Math.floor(s.bing), Math.max(0, Math.floor(n)));
  if (c <= 0) return 0;
  s.bing -= c; sw.committed += c; sw.committed0 += c;
  if (sw.stage === "incoming") pushT(s, `▶ 组织抗击！${c} 名战士在村口一线设伏，等鬼子进入伏击圈。`, "info");
  else pushT(s, `▶ 增援 ${c} 名战士投入会战！`, "info");
  return c;
}

// 劫掠总损失比例：基础 × 剩余日军占比 × 防御减免 × 转移减免。
function pillageFracOf(s: KRState, sw: Sweep): number {
  const hard = phase(s) === TUNING.hardPhase ? TUNING.hardSweepMult : 1;
  const strengthFrac = sw.strength / Math.max(1, sw.strength0);
  return Math.max(0, TUNING.sweepLossFrac * hard * strengthFrac * (1 - defense(s)) * (1 - 0.8 * sw.evacProgress));
}
function endBattle(s: KRState, sw: Sweep): void {
  // 幸存者归队
  const back = Math.floor(sw.committed);
  s.bing += back; sw.committed = 0;
  if (sw.strength <= 0.5) { // 全歼/击退 → 直接结算胜利
    finishSweep(s, sw, true);
  } else { // 突破防线 → 劫掠
    sw.stage = "pillage"; sw.pillageSec = TUNING.pillageSec;
    sw.pillageFrac = pillageFracOf(s, sw);
    pushT(s, `日军 ${Math.round(sw.strength)} 人突进根据地，开始烧抢——${sw.evacStarted ? "掩护群众撤完最后一程！" : "群众没来得及转移！"}`, "loss");
  }
}
function finishSweep(s: KRState, sw: Sweep, cleanWin: boolean): void {
  const killed = Math.round(sw.killed);
  const loot = killed * (TUNING.lootBase + phase(s) * TUNING.lootPerPhase) * regionMult(s);
  s.wuzi += loot; s.totalWuzi += loot;
  if (cleanWin) {
    pushT(s, `★ 反扫荡大捷！击毙日军 ${killed}（我方伤亡 ${Math.round(sw.lostBing)}），根据地毫发无损，缴获物资 ${fmt(loot)}！`, "win");
  } else {
    const lossPct = Math.round(sw.pillageFrac * 100);
    pushT(s, `反扫荡结束：击毙 ${killed}，我方伤亡 ${Math.round(sw.lostBing)}，被烧抢损失 ${lossPct}%${sw.evacProgress > 0.5 ? "（群众大转移保住了大半家底）" : ""}，缴获 ${fmt(loot)}。`, sw.pillageFrac > 0.12 ? "loss" : "info");
  }
  s.sweepsSurvived += 1;
  s.sweep = null;
}
// 劫掠损失按秒摊开（表现层能看到数字持续掉），结束时毁一点设施。
function tickPillage(s: KRState, sw: Sweep, dt: number): void {
  const perSec = sw.pillageFrac / TUNING.pillageSec;
  s.wuzi -= s.wuzi * perSec * dt;
  s.bing -= s.bing * perSec * dt * 0.5; // 人比粮跑得快
  sw.pillageSec -= dt;
  if (sw.pillageSec <= 0) {
    let destroyed = 0;
    for (let i = 0; i < s.buildings.length; i++) {
      if (s.buildings[i] > 0 && Math.random() < sw.pillageFrac * 0.9) {
        const d = Math.max(1, Math.ceil(s.buildings[i] * sw.pillageFrac * 0.45)); s.buildings[i] -= Math.min(s.buildings[i], d); destroyed += d;
      }
    }
    if (destroyed > 0) pushT(s, `烧毁设施 ${destroyed} 处。留得青山在——重建！`, "loss");
    finishSweep(s, sw, false);
  }
}
// 会战逐秒结算：兰彻斯特式互耗。我方吃 defense(地道/地雷/情报) 与伏击加成。
// 单秒歼灭量封顶（初始兵力的 18%/秒）——碾压局也要打上几秒，画面看得见。
function tickBattle(s: KRState, sw: Sweep, dt: number): void {
  sw.battleSec += dt;
  const d = defense(s);
  const ourRate = TUNING.ourKillRate * (1 + d * 1.6);
  const jpRate = TUNING.jpKillRate * (1 - d * 0.55);
  const jpLoss = Math.min(sw.strength, sw.committed * ourRate * dt, sw.strength0 * 0.18 * dt);
  const ourLoss = Math.min(sw.committed, sw.strength * jpRate * dt, sw.committed0 * 0.18 * dt);
  sw.strength -= jpLoss; sw.killed += jpLoss;
  sw.committed -= ourLoss; sw.lostBing += ourLoss;
  if (sw.strength <= 0.5 || sw.committed <= 0.5 || sw.battleSec >= TUNING.battleMaxSec) {
    if (sw.battleSec >= TUNING.battleMaxSec && sw.strength > 0.5) sw.strength *= 0.55; // 拖到日军且战且退
    endBattle(s, sw);
  }
}
function tickSweep(s: KRState, dt: number): void {
  const sw = s.sweep;
  if (!sw) return;
  // 转移进度（情报站等 defense 让群众跑得更快）
  if (sw.evacStarted && sw.evacProgress < 1) {
    sw.evacProgress = Math.min(1, sw.evacProgress + dt / TUNING.evacSec * (1 + defense(s) * 0.8));
  }
  if (sw.stage === "incoming") {
    sw.etaSec -= dt;
    if (sw.etaSec <= 0) {
      if (sw.committed <= 0) { // 没人下令抗击 → 民兵自发抵抗一小股
        const auto = Math.floor(s.bing * TUNING.autoMilitiaFrac);
        if (auto > 0) { s.bing -= auto; sw.committed = auto; sw.committed0 = auto; pushT(s, `民兵 ${auto} 人自发阻击，掩护乡亲！`, "info"); }
      }
      if (sw.committed > 0) { sw.stage = "battle"; sw.battleSec = 0; pushT(s, `会战打响！我 ${Math.round(sw.committed)} × 敌 ${Math.round(sw.strength)}`, "info"); }
      else { sw.stage = "pillage"; sw.pillageSec = TUNING.pillageSec; sw.pillageFrac = pillageFracOf(s, sw); pushT(s, "无人设防——日军长驱直入，开始烧抢！", "loss"); }
    }
  } else if (sw.stage === "battle") tickBattle(s, sw, dt);
  else tickPillage(s, sw, dt);
}

// 每帧推进：产出 + 扫荡计时/事件 + 阶段播报。
export function tick(s: KRState, dtSec: number): void {
  s.clockMs += dtSec * 1000;
  const prodMult = s.sweep?.evacStarted ? TUNING.evacProdMult : 1; // 群众在转移=生产停摆大半

  s.bing += bingPerSec(s) * prodMult * dtSec;
  s.wuzi += wuziPerSec(s) * prodMult * dtSec;
  s.totalWuzi += wuziPerSec(s) * prodMult * dtSec;

  // 扫荡计时（有产出才会被盯上；最艰难期更频繁；一次只来一股）
  if (s.sweep) tickSweep(s, dtSec);
  else if (bingPerSec(s) + wuziPerSec(s) > 0.5 || s.wuzi > 500) {
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
