// 《烽火敌后》· 抗日根据地 × CookieClicker 核心逻辑（纯逻辑，无 DOM/Canvas）。
// v2 历史化重做：
// · 历史时间轴驱动——游戏时间=月份(1937.7卢沟桥→1945.8)，阶段按史实分期，不再按资源推进。
// · 日军压力随时期换形态：1937-38 小股讨伐(敌后空虚·大发展窗口) → 1939-40 囚笼蚕食(修据点/封锁沟/公路,扫荡两路合击)
//   → 1941-42 至暗(铁壁合围3-5路、三光政策、清乡、1942.5五一大扫荡脚本) → 1943-44 压力衰减·局部反攻(拔据点) → 1945 大反攻。
// · 多块根据地差异经营：地形(山地/丘陵/平原)、人口、动员、发展度、地道、蚕食据点各不相同；平原肥沃但挨最狠的打。
//   根据地=全局产出的乘法引擎(设施是 CC 指数底盘)；三光掉人口=永久伤乘数。
// · 大战役=历史窗口内的战役卡(平型关/黄土岭/百团大战/沁源围困/车桥)；百团大战招致更狠报复(史实)。
// · 1945.8 结局：逐阶段「你的敌后 vs 史实」对照 + 评级。
// 会战=兰彻斯特互耗(codex 版保留)；玩家应对：组织群众大范围转移 / 组织抗击投兵员。

// ══ 时间轴 ══════════════════════════════════════════════════════
export const MONTH_MS = 12_000; // 1 游戏月=12s → 全程 98 月 ≈ 20 分钟
export const END_MONTH = 97; // 1945.8
export function dateOf(mi: number): { y: number; m: number } {
  const t = 6 + mi; // 1937.7 起
  return { y: 1937 + Math.floor(t / 12), m: (t % 12) + 1 };
}
export function dateStr(mi: number): string { const d = dateOf(mi); return `${d.y}年${d.m}月`; }

// ══ 时期（日军压力形态）══════════════════════════════════════════
export interface EraDef {
  id: number; name: string; years: string; from: number; to: number;
  jp: string; // 日军态势描述
  sweepGapM: [number, number]; // 扫荡间隔(月)
  cols: number; // 合围路数(表现+强度)
  strengthMult: number;
  sanguang: boolean; // 三光政策(劫掠时烧杀:掉人口/毁设施加重)
  encroach: number; // 每月蚕食概率(在根据地周边修据点/封锁沟)
  canExpand: boolean; // 能否开辟新根据地
}
export const ERAS: EraDef[] = [
  { id: 0, name: "战略防御·敌后扎根", years: "1937-38", from: 0, to: 17, jp: "日军主力压向正面战场，敌后空虚——趁隙开辟根据地，大发展的窗口期。", sweepGapM: [4, 6], cols: 1, strengthMult: 0.55, sanguang: false, encroach: 0, canExpand: true },
  { id: 1, name: "囚笼与蚕食", years: "1939-40", from: 18, to: 41, jp: "多田骏「囚笼政策」：铁路为柱、公路为链、碉堡为锁——修据点挖封锁沟，一寸寸蚕食根据地。", sweepGapM: [2, 4], cols: 2, strengthMult: 1, sanguang: false, encroach: 0.5, canExpand: true },
  { id: 2, name: "至暗时刻", years: "1941-42", from: 42, to: 65, jp: "冈村宁次：铁壁合围、梳篦清剿、三光政策、清乡运动。根据地被压缩，这是黎明前最黑的夜。", sweepGapM: [1, 3], cols: 4, strengthMult: 1.9, sanguang: true, encroach: 0.8, canExpand: false },
  { id: 3, name: "恢复与局部反攻", years: "1943-44", from: 66, to: 89, jp: "太平洋战场吃紧，日军兵力被抽走——扫荡渐弱，拔据点、破封锁，一块块夺回来。", sweepGapM: [4, 6], cols: 2, strengthMult: 0.9, sanguang: false, encroach: 0.15, canExpand: true },
  { id: 4, name: "大反攻", years: "1945", from: 90, to: 97, jp: "全面反攻！收复县城、逼降据点——迎接最后的胜利。", sweepGapM: [99, 99], cols: 0, strengthMult: 0, sanguang: false, encroach: 0, canExpand: true }
];
export function eraOf(mi: number): EraDef {
  for (const e of ERAS) if (mi >= e.from && mi <= e.to) return e;
  return ERAS[ERAS.length - 1];
}

// ══ 尺度阶梯（视野从一个村逐级放大到整个华北）══════════════════════
// tier 由 max(资源阈值, 时间下限) 决定——发展快提前放大视野，时间到也强制推进（历史不等人）。
export interface TierDef { id: number; name: string; scope: string; atWuzi: number; atM: number; note: string; }
export const TIERS: TierDef[] = [
  { id: 0, name: "孤村星火", scope: "一个村", atWuzi: 0, atM: 0, note: "一个村的抵抗。对手：村口炮楼里的日军小分队——先端掉它。" },
  { id: 1, name: "鸡犬相闻", scope: "邻村", atWuzi: 300, atM: 1, note: "邻村联起手来。对手：下乡抢粮的巡逻小队。" },
  { id: 2, name: "连村成片", scope: "数村", atWuzi: 1_200, atM: 3, note: "村村相连、户户相通。对手：日军讨伐小队。" },
  { id: 3, name: "区乡动员", scope: "一个区乡", atWuzi: 5_000, atM: 5, note: "十里八乡组织起来。对手：日军警备中队。" },
  { id: 4, name: "重镇争夺", scope: "半个县", atWuzi: 15_000, atM: 8, note: "打到重镇外围——据点链和公路网出现了。对手：讨伐大队。" },
  { id: 5, name: "县域拉锯", scope: "一县", atWuzi: 45_000, atM: 11, note: "和县城日军反复拉锯。对手：守备大队+伪军。" },
  { id: 6, name: "专区经营", scope: "数县连片", atWuzi: 130_000, atM: 14, note: "几座县城连成专区。对手：日军支队。" },
  { id: 7, name: "边区格局", scope: "边区大板块", atWuzi: 350_000, atM: 17, note: "太行区立住了——可以开辟各大板块根据地。对手：联队。" },
  { id: 8, name: "华北大棋局", scope: "全华北", atWuzi: 8e5, atM: 20, note: "冀中、太行、山东……整个华北敌后。对手：师团级兵团。" }
];
export function tier(s: KRState): number {
  let byW = 0, byM = 0;
  for (const t of TIERS) { if (s.totalWuzi >= t.atWuzi) byW = t.id; if (s.monthIdx >= t.atM) byM = t.id; }
  return Math.max(byW, byM);
}
// 日军单位规模称谓（随兵力）
export function unitName(strength: number): string {
  if (strength < 20) return "小分队";
  if (strength < 60) return "讨伐小队";
  if (strength < 200) return "警备中队";
  if (strength < 600) return "大队";
  if (strength < 1500) return "支队";
  if (strength < 4000) return "联队";
  return "师团级兵团";
}

// ══ 根据地 ══════════════════════════════════════════════════════
export type Terrain = "mountain" | "hills" | "plain";
export interface BaseDef {
  id: string; name: string; short: string;
  terrain: Terrain;
  x: number; y: number; // 地图归一化坐标
  pop0: number; // 初始人口(万,抽象)
  unlockM: number; // 该月起地图揭雾(可开辟)
  hist: string; // 开辟台词(史实)
}
// 中心=太行总部(初始已开辟)。平原人口多产出肥但 41-42 挨最狠的打；山地安全。
export const BASES: BaseDef[] = [
  { id: "hq", name: "太行·八路军总部", short: "太行", terrain: "mountain", x: 0.50, y: 0.68, pop0: 20, unlockM: 0, hist: "八路军总部扎进太行山——华北敌后抗战的心脏。" },
  { id: "wutai", name: "晋察冀·五台山", short: "晋察冀", terrain: "mountain", x: 0.44, y: 0.30, pop0: 25, unlockM: 0, hist: "1937.11 聂荣臻率三千人留守五台山——第一块敌后抗日根据地。" },
  { id: "jinsui", name: "晋绥·大青山", short: "晋绥", terrain: "mountain", x: 0.30, y: 0.22, pop0: 12, unlockM: 5, hist: "120师挺进晋西北——屏障陕甘宁的东大门。" },
  { id: "jizhong", name: "冀中平原", short: "冀中", terrain: "plain", x: 0.58, y: 0.32, pop0: 40, unlockM: 8, hist: "吕正操举义留冀中——无险可守的大平原，人海就是靠山。" },
  { id: "taiyue", name: "太岳·沁源", short: "太岳", terrain: "mountain", x: 0.38, y: 0.50, pop0: 10, unlockM: 10, hist: "陈赓386旅开辟太岳区——『再敢集结就打你』。" },
  { id: "jiluyu", name: "冀鲁豫平原", short: "冀鲁豫", terrain: "plain", x: 0.60, y: 0.55, pop0: 35, unlockM: 14, hist: "跨三省的大平原根据地——回旋千里。" },
  { id: "shandong", name: "山东·沂蒙", short: "山东", terrain: "hills", x: 0.72, y: 0.48, pop0: 30, unlockM: 16, hist: "115师入鲁、山东纵队并肩——沂蒙山连成一片。" },
  { id: "jidong", name: "冀东·长城线", short: "冀东", terrain: "hills", x: 0.68, y: 0.14, pop0: 15, unlockM: 20, hist: "冀东大暴动二十万人起事——长城脚下燃起烽火。" },
  { id: "suzhong", name: "苏中(新四军)", short: "苏中", terrain: "plain", x: 0.80, y: 0.72, pop0: 28, unlockM: 30, hist: "新四军挺进苏中水网——鱼米之乡的敌后战场。" }
];
export interface BaseState {
  est: boolean; // 已开辟
  dev: number; // 发展度 0-5(动员/政权/生产)
  tunnels: number; // 地道 0-3(平原保命)
  pop: number; // 当前人口(三光会掉,永久)
  spots: number; // 周边日军蚕食据点 0-5(压产出;≥3=封锁沟合围)
}

// ══ 设施(中心兵工/后勤 CC 底盘)+政策 ══════════════════════════════
export interface BuildingDef {
  id: string; name: string; desc: string;
  costWuzi: number; costBing: number; costMult: number;
  bing: number; wuzi: number; defense: number; unlockEra: number;
}
export const BUILDINGS: BuildingDef[] = [
  { id: "militia", name: "民兵队", desc: "农民放下锄头拿起枪，村自卫队。", costWuzi: 15, costBing: 0, costMult: 1.15, bing: 0.2, wuzi: 0, defense: 0.01, unlockEra: 0 },
  { id: "farm", name: "开荒生产队", desc: "自己动手，丰衣足食——垦荒种粮。", costWuzi: 120, costBing: 0, costMult: 1.15, bing: 0, wuzi: 1.2, defense: 0, unlockEra: 0 },
  { id: "tunnel", name: "地道网", desc: "村村相连、户户相通，打了就钻。", costWuzi: 900, costBing: 5, costMult: 1.15, bing: 0, wuzi: 0, defense: 0.06, unlockEra: 0 },
  { id: "arsenal", name: "复装弹药所", desc: "复装子弹、造手榴弹、拉地雷。", costWuzi: 6_500, costBing: 8, costMult: 1.15, bing: 0, wuzi: 9, defense: 0, unlockEra: 1 },
  { id: "intel", name: "情报站", desc: "消息树、儿童团放哨——扫荡提前预警。", costWuzi: 42_000, costBing: 20, costMult: 1.15, bing: 0, wuzi: 4, defense: 0.03, unlockEra: 1 },
  { id: "supply", name: "被服医疗队", desc: "被服厂、战地医院，留住有生力量。", costWuzi: 260_000, costBing: 40, costMult: 1.15, bing: 1.6, wuzi: 20, defense: 0, unlockEra: 1 },
  { id: "raid", name: "破袭队", desc: "破袭铁路公路，缴获敌军物资。", costWuzi: 1.2e6, costBing: 120, costMult: 1.15, bing: 0, wuzi: 260, defense: 0.01, unlockEra: 2 },
  { id: "college", name: "抗大分校", desc: "抗日军政大学——整训干部、扩大骨干。", costWuzi: 5e6, costBing: 300, costMult: 1.15, bing: 20, wuzi: 120, defense: 0, unlockEra: 2 },
  { id: "mainforce", name: "主力团", desc: "脱产的正规主力，能打大仗。", costWuzi: 3.5e6, costBing: 800, costMult: 1.15, bing: 45, wuzi: 1200, defense: 0.02, unlockEra: 2 },
  { id: "arsenal2", name: "黄崖洞兵工厂", desc: "自造步枪掷弹筒——根据地的军工心脏。", costWuzi: 1.1e7, costBing: 2000, costMult: 1.15, bing: 0, wuzi: 9000, defense: 0, unlockEra: 3 }
];
export interface PolicyDef {
  id: string; name: string; desc: string; cost: number;
  kind: "wuzi" | "bing" | "all" | "defense" | "click";
  mult: number; revealM: number; hist: string;
}
// revealM 绑史实时点：大生产 1942.12+、精兵简政 1941.12+ 等。
export const POLICIES: PolicyDef[] = [
  { id: "rent", name: "减租减息", desc: "减轻农民负担，发动更广。", cost: 500, kind: "all", mult: 1.5, revealM: 4, hist: "1937 起各根据地推行" },
  { id: "sparrow", name: "麻雀战", desc: "分散袭扰、聚零为整——手更狠。", cost: 40_000, kind: "click", mult: 4, revealM: 16, hist: "1938 起游击战术成熟" },
  { id: "mine", name: "地雷战", desc: "家家户户造地雷，扫荡寸步难行。", cost: 120_000, kind: "defense", mult: 0.12, revealM: 30, hist: "1940 起冀中冀南推广" },
  { id: "streamline", name: "精兵简政", desc: "缩小机关、充实连队，度过难关。", cost: 900_000, kind: "all", mult: 1.6, revealM: 53, hist: "1941.12 中央号召" },
  { id: "produce", name: "大生产运动", desc: "南泥湾开荒——生产自救翻倍。", cost: 2.5e6, kind: "wuzi", mult: 2, revealM: 65, hist: "1942.12 『发展经济，保障供给』" },
  { id: "counter", name: "反攻练兵", desc: "大练兵运动，为反攻蓄力。", cost: 2e7, kind: "bing", mult: 2.5, revealM: 72, hist: "1943 起各区大练兵" }
];

// ══ 大战役（历史窗口战役卡）══════════════════════════════════════
export interface CampaignDef {
  id: string; name: string; window: [number, number]; // 可发动月份窗
  needBases: number; costBing: number; costWuzi: number;
  outputMult: number; // 战后全局产出×
  desc: string; hist: string; line: string;
  fx?: "baituan" | "qinyuan"; // 特殊效果
}
export const CAMPAIGNS: CampaignDef[] = [
  { id: "pingxingguan", name: "平型关大捷", window: [1, 4], needBases: 1, costBing: 80, costWuzi: 100, outputMult: 1.3, desc: "115师设伏平型关，打日军板垣师团辎重队。", hist: "1937.9.25 歼敌千余", line: "平型关一声炮响——打破『日军不可战胜』的神话！全国振奋，参军的青年排起长队。" },
  { id: "huangtuling", name: "黄土岭围歼战", window: [27, 31], needBases: 2, costBing: 600, costWuzi: 3000, outputMult: 1.25, desc: "雁宿崖再设伏，围住独立混成第二旅团。", hist: "1939.11 击毙『名将之花』阿部规秀中将", line: "黄土岭一炮，阿部规秀毙命——日军哀叹『名将之花凋谢在太行山上』。" },
  { id: "baituan", name: "百团大战", window: [37, 41], needBases: 4, costBing: 2500, costWuzi: 25_000, outputMult: 1.45, fx: "baituan", desc: "105个团同时破袭正太、同蒲、平汉铁路——砸碎囚笼！", hist: "1940.8-12 毙伤日伪军2.5万余，破路474公里", line: "百团大战！一夜之间华北铁路公路全线开花——囚笼被砸得粉碎。但要当心：日军的报复会更疯狂（史实如此）。" },
  { id: "qinyuan", name: "沁源围困战", window: [54, 78], needBases: 3, costBing: 2000, costWuzi: 120_000, outputMult: 1.3, fx: "qinyuan", desc: "全城空舍清野，把占城日军困成瓮中之鳖。", hist: "1942.11-1945.4 围困两年半迫敌撤退", line: "沁源——一座不屈的空城。两年半围困，日军在饥饿与冷枪中狼狈撤走。" },
  { id: "chejiao", name: "车桥战役", window: [78, 84], needBases: 5, costBing: 15_000, costWuzi: 8e5, outputMult: 1.4, desc: "新四军攻坚打援全歼守敌——反攻序幕。", hist: "1944.3 歼日伪军近千，苏中战局改观", line: "车桥一役攻坚打援双胜——局部反攻的号角吹响了！" }
];


// ══ 历史文献道具（关键道具：历史时点送达→研读→永久增益）══════════
// 《论持久战》为前章开端；其余按史实时间线跨越全程，对战役/根据地发展各有实际加成。
export interface DoctrineDef {
  id: string; name: string; m: number; // 送达月份
  hist: string; desc: string; line: string;
  fx: { prod?: number; bing?: number; wuzi?: number; kill?: number; devCost?: number; loot?: number };
  fxText: string;
}
export const DOCTRINES: DoctrineDef[] = [
  { id: "lunchijiu", name: "《论持久战》", m: 10, hist: "1938年5月，延安窑洞", desc: "战略总纲：战略防御→战略相持→战略反攻。看清了全局，就不会在黑夜里绝望。", line: "「抗日战争是持久战，最后胜利是中国的——这就是我们的结论。」", fx: { prod: 1.2 }, fxText: "全局产出 ×1.2" },
  { id: "youjizhan", name: "《抗日游击战争的战略问题》", m: 11, hist: "1938年5月", desc: "游击战不是小打小闹，是敌后战场的战略形态。十六字诀融进血脉。", line: "「敌进我退，敌驻我扰，敌疲我打，敌退我追。」", fx: { kill: 1.15 }, fxText: "会战杀伤 ×1.15" },
  { id: "celue", name: "《目前抗日统一战线中的策略问题》", m: 32, hist: "1940年3月", desc: "发展进步势力、争取中间势力——把最广大的人发动起来。", line: "减租减息落到实处，参军的青年在村口排起长队。", fx: { bing: 1.15 }, fxText: "兵员产出 ×1.15" },
  { id: "jingji", name: "《经济问题与财政问题》", m: 65, hist: "1942年12月", desc: "「发展经济，保障供给」——大生产运动的行动纲领。", line: "自己动手，丰衣足食。纺车吱呀，南泥湾开了荒。", fx: { wuzi: 1.25 }, fxText: "物资产出 ×1.25" },
  { id: "zuzhi", name: "《组织起来》", m: 76, hist: "1943年11月", desc: "变工队、互助组——把分散的个体组织成劳动大军。", line: "「群众是真正的英雄。」组织起来的力量，事半功倍。", fx: { devCost: 0.75 }, fxText: "根据地发展造价 ×0.75" },
  { id: "yugong", name: "《愚公移山》", m: 95, hist: "1945年6月，七大闭幕词", desc: "下定决心，不怕牺牲，排除万难，去争取胜利。", line: "「我们也会感动上帝的。这个上帝就是全中国的人民大众。」", fx: { kill: 1.2, loot: 1.5 }, fxText: "会战杀伤 ×1.2 · 缴获 ×1.5" }
];

// ══ 成就系统（Steam 预留：id 即将来的成就 API Name；unlockAch 处将来接 SteamUserStats.SetAchievement(id)）══
// check 有值=轮询判定；无 check 的在对应事件点手动 unlockAch。hidden=未解锁时显示为 ???。
export interface AchievementDef { id: string; name: string; desc: string; hidden?: boolean; check?: (s: KRState) => boolean; }
export const ACHIEVEMENTS: AchievementDef[] = [
  { id: "spark", name: "星星之火", desc: "第一次发动群众", check: (s) => s.clickN > 0 },
  { id: "first_facility", name: "白手起家", desc: "建起第一处设施", check: (s) => s.buildings.some((b) => b > 0) },
  { id: "militia10", name: "十里八乡", desc: "民兵队达到 10 支", check: (s) => s.buildings[0] >= 10 },
  { id: "first_tunnel", name: "深挖洞", desc: "挖出第一条地道", check: (s) => s.buildings[2] > 0 || BASES.some((b) => s.bases[b.id].tunnels > 0) },
  { id: "doctrine_lun", name: "黑夜里的灯", desc: "研读《论持久战》", check: (s) => !!s.doctrines["lunchijiu"] },
  { id: "doctrine_all", name: "真理之光", desc: "集齐全部六部文献", check: (s) => DOCTRINES.every((d) => s.doctrines[d.id]) },
  { id: "tier1", name: "连村成片", desc: "规模达到数村", check: (s) => tier(s) >= 2 },
  { id: "tier2", name: "县域拉锯", desc: "规模达到一县", check: (s) => tier(s) >= 5 },
  { id: "tier2x", name: "区乡动员", desc: "规模达到区乡", check: (s) => tier(s) >= 3 },
  { id: "tier3", name: "专区经营", desc: "数县连成专区", check: (s) => tier(s) >= 6 },
  { id: "tier5", name: "边区格局", desc: "撑起边区大板块", check: (s) => tier(s) >= 7 },
  { id: "tier4", name: "华北大棋局", desc: "视野展开到整个华北", check: (s) => tier(s) >= 8 },
  { id: "pingxingguan", name: "首战告捷", desc: "打出平型关大捷", check: (s) => !!s.campaigns["pingxingguan"] },
  { id: "huangtuling", name: "名将之花凋谢", desc: "黄土岭围歼战击毙阿部规秀", check: (s) => !!s.campaigns["huangtuling"] },
  { id: "baituan", name: "百团出击", desc: "发动百团大战", check: (s) => !!s.campaigns["baituan"] },
  { id: "qinyuan", name: "一座不屈的空城", desc: "沁源围困战", check: (s) => !!s.campaigns["qinyuan"] },
  { id: "chejiao", name: "反攻序幕", desc: "车桥战役", check: (s) => !!s.campaigns["chejiao"] },
  { id: "camp_all", name: "战史留名", desc: "打出全部五次大战役", check: (s) => CAMPAIGNS.every((c) => s.campaigns[c.id]) },
  { id: "first_win", name: "第一次反扫荡", desc: "扛过第一次日军扫荡", check: (s) => s.sweepsSurvived >= 1 },
  { id: "clean_win", name: "毫发无损", desc: "一场反扫荡大捷：一间房都没让烧" },
  { id: "repel_encircle", name: "撕开铁壁", desc: "全歼一次铁壁合围" },
  { id: "repel_raid", name: "反偷袭", desc: "挫败一次挺进队奔袭" },
  { id: "survive_wuyi", name: "冀中在地下", desc: "熬过 1942 五一大扫荡" },
  { id: "kill1k", name: "千人斩", desc: "累计击毙日军 1,000", check: (s) => s.stats.killed >= 1000 },
  { id: "kill10k", name: "歼敌一万", desc: "累计击毙日军 10,000", check: (s) => s.stats.killed >= 10000 },
  { id: "est3", name: "三足鼎立", desc: "开辟 3 块根据地", check: (s) => estCount(s) >= 3 },
  { id: "est6", name: "燎原", desc: "开辟 6 块根据地", check: (s) => estCount(s) >= 6 },
  { id: "est9", name: "满盘皆红", desc: "九块根据地全部开辟", check: (s) => estCount(s) >= 9 },
  { id: "dev_max", name: "模范根据地", desc: "一块根据地发展到 5 级", check: (s) => BASES.some((b) => s.bases[b.id].dev >= 5) },
  { id: "first_tower", name: "第一座炮楼", desc: "端掉村口的炮楼——十里八乡都传遍了", check: (s) => s.stats.spotsRemoved >= 1 },
  { id: "spots10", name: "拔钉子", desc: "累计拔除 10 座炮楼据点", check: (s) => s.stats.spotsRemoved >= 10 },
  { id: "migrate", name: "大转移", desc: "组织一次跨根据地的群众大转移" },
  { id: "policy_all", name: "新政齐备", desc: "推行全部政策", check: (s) => POLICIES.every((p) => s.policies[p.id]) },
  { id: "dark_through", name: "黎明前最黑的夜", desc: "熬过 1941-42，迎来恢复反攻", check: (s) => era(s).id >= 3 },
  { id: "victory", name: "1945.8.15", desc: "迎来胜利日", check: (s) => s.ended },
  { id: "legend", name: "中流砥柱", desc: "以最高评级迎来胜利", hidden: true },
  { id: "fog_gaze", name: "远望", desc: "在一切开始之前，拉远看过整个笼罩在黑暗里的华北", hidden: true }
];
export function unlockAch(s: KRState, id: string): void {
  if (s.achievements[id]) return;
  s.achievements[id] = true;
  s.achQueue.push(id);
}
export function doctrineMult(s: KRState, key: "prod" | "bing" | "wuzi" | "kill" | "devCost" | "loot"): number {
  let m = 1;
  for (const d of DOCTRINES) if (s.doctrines[d.id] && d.fx[key]) m *= d.fx[key]!;
  return m;
}
// 研读文献（pendingDoctrines 队首）
export function acquireDoctrine(s: KRState): DoctrineDef | null {
  const id = s.pendingDoctrines[0];
  if (!id) return null;
  s.pendingDoctrines.shift();
  s.doctrines[id] = true;
  const d = DOCTRINES.find((x) => x.id === id)!;
  pushT(s, `📜 研读${d.name}（${d.hist}）——${d.fxText}。${d.line}`, "win");
  return d;
}

// ══ 历史事件脚本（按月触发）══════════════════════════════════════
export interface EventDef { m: number; text: string; kind: "era" | "info" | "loss" | "win"; fx?: "wannan" | "wuyi" | "ichigo"; }
export const EVENTS: EventDef[] = [
  { m: 2, text: "【1937.9】平型关设伏时机已到——战役档可发动『平型关大捷』。", kind: "info" },
  { m: 4, text: "【1937.11】太原失守。华北正面战场结束——『在华北，以国民党为主体的正规战争已经结束，以共产党为主体的游击战争进入主要地位』。", kind: "era" },
  { m: 10, text: "【1938.5】毛泽东发表《论持久战》：战略防御→战略相持→战略反攻。熬，就是胜利。", kind: "info" },
  { m: 15, text: "【1938.10】武汉、广州失守，抗战进入相持阶段。日军回过头来，要对付敌后了。", kind: "era" },
  { m: 18, text: "【1939】日军华北方面军推行『治安肃正』：修据点、挖封锁沟、筑公路网——囚笼政策开始蚕食根据地。拔据点、破封锁！", kind: "loss" },
  { m: 42, text: "【1941.1】皖南事变。国民党停发八路军军饷、经济封锁——外援断绝，只能自力更生。", kind: "loss", fx: "wannan" },
  { m: 48, text: "【1941.7】冈村宁次接任华北方面军司令——『铁壁合围』『三光政策』来了。挖地道！存粮食！", kind: "loss" },
  { m: 57, text: "【1942.5】日军5万余人对冀中发动『五一大扫荡』——铁壁合围、梳篦清剿、十面出击！", kind: "loss", fx: "wuyi" },
  { m: 60, text: "【1942】华北大旱，蝗灾继起。根据地军民节衣缩食、生产自救。", kind: "loss" },
  { m: 66, text: "【1943】敌后军民熬过了最艰难的两年——根据地开始恢复、扩大。", kind: "era" },
  { m: 81, text: "【1944.4】日军发动『一号作战』(豫湘桂)，华北兵力大量南调——敌后压力骤减，反攻的机会来了！", kind: "win", fx: "ichigo" },
  { m: 90, text: "【1945】各根据地转入全面局部反攻——拔据点、围县城，解放区连成一片。", kind: "win" },
  { m: 96, text: "【1945.8】苏联对日宣战、广岛长崎原子弹——日本帝国主义的丧钟敲响了。", kind: "win" }
];

// 各档位对抗基准兵力(难度曲线: 村口炮楼小分队→巡逻队→讨伐队→中队→大队→守备队→支队→联队→师团)
export const TIER_ENEMY = [12, 25, 55, 130, 350, 750, 1800, 3800, 8000];

// ══ 扫荡（多路合围事件）══════════════════════════════════════════
export type SweepStage = "incoming" | "battle" | "pillage";
// 日军战略意图（历史原型）：
// punitive 讨伐(单路直扑) / encircle 铁壁合围·分进合击(多路同压,预警长但兵力大)
// raid 捕捉奔袭·挺进队偷袭(预警极短!史实如1942年偷袭八路总部) / comb 梳篦式清剿(拉网搜山,转移效果减半,拖得久)
export type SweepKind = "punitive" | "encircle" | "raid" | "comb";
export const SWEEP_KIND_NAME: Record<SweepKind, string> = {
  punitive: "讨伐", encircle: "铁壁合围·分进合击", raid: "捕捉奔袭·挺进队偷袭", comb: "梳篦式清剿"
};
export interface Sweep {
  stage: SweepStage;
  kind: SweepKind;
  strength: number; strength0: number;
  cols: number; // 合围路数(表现)
  sanguang: boolean;
  etaSec: number; etaSec0: number;
  committed: number; committed0: number;
  evacStarted: boolean; evacProgress: number;
  battleSec: number; battleMax: number; pillageSec: number; pillageFrac: number;
  killed: number; lostBing: number;
  targetBase: string; // BASES id
}
// 群众跨根据地大转移（平时经营动作;至暗期把平原人口迁进山保平安,反攻期迁回恢复产出）
export interface Migration { from: string; to: string; pop: number; t: number; dur: number; }

export interface KRState {
  bing: number; wuzi: number; totalWuzi: number; clickN: number;
  monthIdx: number; monthAcc: number; // ms 累积
  buildings: number[];
  policies: Record<string, boolean>;
  bases: Record<string, BaseState>;
  campaigns: Record<string, boolean>;
  campMult: number; // 战役累积产出乘数
  kmtCut: boolean; // 皖南事变后外援断绝
  pendingWuyi: boolean; // 五一大扫荡挂起(撞上进行中的扫荡时)
  sweep: Sweep | null;
  migration: Migration | null;
  doctrines: Record<string, boolean>;
  pendingDoctrines: string[]; // 已送达待研读
  achievements: Record<string, boolean>;
  achQueue: string[]; // 新解锁待弹出(表现层消费)
  achPoll: number;
  nextSweepM: number;
  sweepsSurvived: number;
  ended: boolean;
  terminal: { text: string; kind: "info" | "win" | "loss" | "era" }[];
  eraShown: number;
  eventsFired: Record<number, boolean>;
  stats: { killed: number; lost: number; popLost: number; spotsRemoved: number; campaignsWon: number; sweepsFought: number; estPeak: number; eraSnap: { bases: number; bing: number; pop: number }[] };
}

export const TUNING = {
  clickBing: 1, clickWuzi: 2,
  sweepEtaSec: 16, battleMaxSec: 45, pillageSec: 9, evacSec: 22, evacProdMult: 0.45,
  ourKillRate: 0.07, jpKillRate: 0.075, autoMilitiaFrac: 0.1,
  lootBase: 30, lootPerEra: 150,
  sweepBase: 8, // 基础兵团规模
  devCost0: 150, devCostMult: 3, // 根据地发展造价
  tunCost0: 400, tunCostMult: 2.5,
  estBing0: 60, estWuzi0: 50, estMult: 2.1, // 开辟造价(按已开辟数)
  spotBing: 150, spotWuzi: 1200, // 拔据点基础价(era3 半价)
  spotOutputMalus: 0.1, // 每个据点压该根据地产出
  baituanRetaliation: 1.25 // 百团大战后 era2 扫荡强度×
};

export function createKRState(): KRState {
  const bases: Record<string, BaseState> = {};
  for (const b of BASES) bases[b.id] = { est: b.id === "hq", dev: 0, tunnels: 0, pop: b.pop0, spots: b.id === "hq" ? 1 : 0 }; // 村口一座炮楼=第一个对手
  return {
    bing: 0, wuzi: 0, totalWuzi: 0, clickN: 0,
    monthIdx: 0, monthAcc: 0,
    buildings: BUILDINGS.map(() => 0), policies: {}, bases, campaigns: {}, campMult: 1, kmtCut: false, pendingWuyi: false,
    sweep: null, migration: null, doctrines: {}, pendingDoctrines: [], achievements: {}, achQueue: [], achPoll: 0,
    nextSweepM: 4, sweepsSurvived: 0, ended: false,
    terminal: [{ text: "【1937.7】卢沟桥的枪声响了。华北在沦陷——但敌后的缝隙里，根据地要在这里扎根。", kind: "era" }],
    eraShown: 0, eventsFired: {},
    stats: { killed: 0, lost: 0, popLost: 0, spotsRemoved: 0, campaignsWon: 0, sweepsFought: 0, estPeak: 1, eraSnap: [] }
  };
}

// ══ 查询 ══════════════════════════════════════════════════════════
export function era(s: KRState): EraDef { return eraOf(s.monthIdx); }
export function estCount(s: KRState): number { return BASES.filter((b) => s.bases[b.id].est).length; }
export function baseRevealed(s: KRState, id: string): boolean {
  const d = BASES.find((b) => b.id === id)!;
  return s.bases[id].est || s.monthIdx >= d.unlockM;
}
// 单根据地乘数：1 + (0.10+0.05*dev) × 人口保全率 × 据点压制。地形微调。
export function baseMult(s: KRState, id: string): number {
  const st = s.bases[id]; if (!st.est) return 1;
  const d = BASES.find((b) => b.id === id)!;
  const popFrac = Math.min(1.25, st.pop / d.pop0);
  const spotMalus = Math.max(0.3, 1 - TUNING.spotOutputMalus * st.spots);
  const terr = d.terrain === "plain" ? 1.25 : d.terrain === "hills" ? 1.05 : 0.95;
  return 1 + (0.10 + 0.05 * st.dev) * popFrac * spotMalus * terr;
}
export function networkMult(s: KRState): number {
  let m = s.campMult * doctrineMult(s, "prod");
  for (const b of BASES) m *= baseMult(s, b.id);
  return m;
}
function polMult(s: KRState, kind: PolicyDef["kind"]): number {
  let m = 1;
  for (const p of POLICIES) if (s.policies[p.id] && p.kind === kind) m *= p.mult;
  if (kind === "wuzi" || kind === "bing") for (const p of POLICIES) if (s.policies[p.id] && p.kind === "all") m *= p.mult;
  return m;
}
export function clickMult(s: KRState): number { return polMult(s, "click"); }
export function bingPerSec(s: KRState): number {
  let sum = 0;
  for (let i = 0; i < BUILDINGS.length; i++) sum += BUILDINGS[i].bing * s.buildings[i];
  for (const b of BASES) { const st = s.bases[b.id]; if (st.est) sum += st.pop * (0.25 + 0.12 * st.dev) * 0.004; }
  return sum * polMult(s, "bing") * networkMult(s) * doctrineMult(s, "bing");
}
export function wuziPerSec(s: KRState): number {
  let sum = 0;
  for (let i = 0; i < BUILDINGS.length; i++) sum += BUILDINGS[i].wuzi * s.buildings[i];
  for (const b of BASES) { const st = s.bases[b.id]; if (st.est) sum += st.pop * (0.25 + 0.12 * st.dev) * (b.terrain === "plain" ? 0.03 : 0.02) * Math.max(0.3, 1 - TUNING.spotOutputMalus * st.spots); }
  const kmt = s.kmtCut ? 0.9 : 1;
  return sum * polMult(s, "wuzi") * networkMult(s) * kmt * doctrineMult(s, "wuzi");
}
// 全局防御(设施/政策) + 目标根据地(地道/地形)
export function defense(s: KRState, baseId?: string): number {
  let d = 0;
  for (let i = 0; i < BUILDINGS.length; i++) d += BUILDINGS[i].defense * s.buildings[i];
  for (const p of POLICIES) if (s.policies[p.id] && p.kind === "defense") d += p.mult;
  if (baseId) {
    const st = s.bases[baseId]; const def = BASES.find((b) => b.id === baseId)!;
    d += st.tunnels * 0.07 + (def.terrain === "mountain" ? 0.12 : def.terrain === "hills" ? 0.06 : 0);
  }
  return Math.min(0.9, d);
}
export function buildCostWuzi(s: KRState, i: number): number { return Math.ceil(BUILDINGS[i].costWuzi * Math.pow(BUILDINGS[i].costMult, s.buildings[i])); }
export function buildCostBing(s: KRState, i: number): number { return Math.ceil(BUILDINGS[i].costBing * Math.pow(BUILDINGS[i].costMult, s.buildings[i])); }
export function buildingUnlocked(s: KRState, i: number): boolean { return s.buildings[i] > 0 || era(s).id >= BUILDINGS[i].unlockEra; }
export function policyRevealed(s: KRState, p: PolicyDef): boolean { return s.policies[p.id] || s.monthIdx >= p.revealM; }
// 根据地行动造价
export function estCost(s: KRState): { bing: number; wuzi: number } {
  const n = estCount(s) - 1;
  return { bing: Math.ceil(TUNING.estBing0 * Math.pow(TUNING.estMult, n)), wuzi: Math.ceil(TUNING.estWuzi0 * Math.pow(TUNING.estMult, n)) };
}
export function devCost(s: KRState, id: string): number { return Math.ceil(TUNING.devCost0 * Math.pow(TUNING.devCostMult, s.bases[id].dev) * (1 + estCount(s) * 0.25) * doctrineMult(s, "devCost")); }
export function tunCost(s: KRState, id: string): number { return Math.ceil(TUNING.tunCost0 * Math.pow(TUNING.tunCostMult, s.bases[id].tunnels) * (1 + estCount(s) * 0.25)); }
export function spotCost(s: KRState): { bing: number; wuzi: number } {
  const half = era(s).id >= 3 ? 0.5 : 1;
  const tb = TIER_ENEMY[tier(s)];
  return { bing: Math.ceil(tb * 2.2 * half), wuzi: Math.ceil(tb * 11 * half) };
}
export function campaignAvailable(s: KRState, c: CampaignDef): "ok" | "early" | "late" | "done" | "weak" {
  if (s.campaigns[c.id]) return "done";
  if (s.monthIdx < c.window[0]) return "early";
  if (s.monthIdx > c.window[1]) return "late";
  if (estCount(s) < c.needBases) return "weak";
  return "ok";
}

function pushT(s: KRState, text: string, kind: KRState["terminal"][number]["kind"]): void {
  s.terminal.push({ text, kind });
  if (s.terminal.length > 120) s.terminal.shift();
}

// ══ 玩家动作 ══════════════════════════════════════════════════════
export function rally(s: KRState): { bing: number; wuzi: number } {
  const b = TUNING.clickBing * clickMult(s) * networkMult(s);
  const w = TUNING.clickWuzi * clickMult(s) * networkMult(s);
  s.bing += b; s.wuzi += w; s.totalWuzi += w; s.clickN += 1;
  return { bing: b, wuzi: w };
}
export function buyBuilding(s: KRState, i: number): boolean {
  if (!buildingUnlocked(s, i)) return false;
  const cw = buildCostWuzi(s, i), cb = buildCostBing(s, i);
  if (s.wuzi < cw || s.bing < cb) return false;
  s.wuzi -= cw; s.bing -= cb; s.buildings[i] += 1; return true;
}
export function buyPolicy(s: KRState, id: string): boolean {
  const p = POLICIES.find((x) => x.id === id);
  if (!p || s.policies[id] || s.wuzi < p.cost || s.monthIdx < p.revealM) return false;
  s.wuzi -= p.cost; s.policies[id] = true;
  pushT(s, `【${p.name}】${p.desc}（${p.hist}）`, "info");
  return true;
}
// 开辟根据地
export function establishBase(s: KRState, id: string): boolean {
  const st = s.bases[id]; const d = BASES.find((b) => b.id === id);
  if (!d || st.est || !baseRevealed(s, id) || !era(s).canExpand || tier(s) < 7) return false;
  const c = estCost(s);
  if (s.bing < c.bing || s.wuzi < c.wuzi) return false;
  s.bing -= c.bing; s.wuzi -= c.wuzi; st.est = true;
  s.stats.estPeak = Math.max(s.stats.estPeak, estCount(s));
  pushT(s, `★ 开辟【${d.name}】！${d.hist}`, "win");
  return true;
}
export function raiseDev(s: KRState, id: string): boolean {
  const st = s.bases[id];
  if (!st.est || st.dev >= 5) return false;
  const c = devCost(s, id); if (s.wuzi < c) return false;
  s.wuzi -= c; st.dev += 1; return true;
}
export function digTunnel(s: KRState, id: string): boolean {
  const st = s.bases[id];
  if (!st.est || st.tunnels >= 3) return false;
  const c = tunCost(s, id); if (s.wuzi < c) return false;
  s.wuzi -= c; st.tunnels += 1;
  if (BASES.find((b) => b.id === id)!.terrain === "plain" && st.tunnels === 1) pushT(s, `【${BASES.find((b) => b.id === id)!.short}】开挖地道——平原上的地下长城，铁壁合围来了就钻。`, "info");
  return true;
}
// 拔据点(破蚕食)
export function removeSpot(s: KRState, id: string): boolean {
  const st = s.bases[id];
  if (!st.est || st.spots <= 0) return false;
  const c = spotCost(s);
  if (s.bing < c.bing || s.wuzi < c.wuzi) return false;
  s.bing -= c.bing; s.wuzi -= c.wuzi; st.spots -= 1; s.stats.spotsRemoved += 1;
  const loot = 50 * (1 + era(s).id) * networkMult(s);
  s.wuzi += loot; s.totalWuzi += loot;
  if (s.stats.spotsRemoved === 1) pushT(s, `★★ 村口的炮楼端掉了！枪一响，十里八乡都传遍——参军的青年多起来了。缴获 ${fmt(loot)} 物资。`, "win");
  else pushT(s, `★ 拔掉【${BASES.find((b) => b.id === id)!.short}】外围一座炮楼据点！缴获 ${fmt(loot)} 物资，封锁松动。`, "win");
  return true;
}

// ── 群众跨根据地大转移 ──
// 智能目标：至暗期(era≤2)找最安全的山地(人口空间最大)；反攻期(era≥3)迁回人口比率最低的平原恢复产出。
export function pickMigrationTarget(s: KRState, fromId: string): string | null {
  const e = era(s);
  const cands = BASES.filter((b) => b.id !== fromId && s.bases[b.id].est
    && (e.id <= 2 ? b.terrain === "mountain" : b.terrain !== "mountain"));
  if (cands.length === 0) return null;
  cands.sort((a, b) => s.bases[a.id].pop / a.pop0 - s.bases[b.id].pop / b.pop0);
  return cands[0].id;
}
export function migrationCost(s: KRState, fromId: string): number {
  return Math.ceil(s.bases[fromId].pop * 0.25 * 40 * (1 + era(s).id * 0.4));
}
export function transferPop(s: KRState, fromId: string, toId: string): boolean {
  const from = s.bases[fromId], to = s.bases[toId];
  if (!from?.est || !to?.est || fromId === toId || s.migration) return false;
  const fd = BASES.find((b) => b.id === fromId)!;
  if (from.pop <= fd.pop0 * 0.3) return false; // 底线人口留守
  const c = migrationCost(s, fromId);
  if (s.wuzi < c) return false;
  s.wuzi -= c;
  const amount = from.pop * 0.25;
  from.pop -= amount;
  const loss = era(s).id === 2 ? 0.12 : 0.05; // 至暗期路上损耗更大
  s.migration = { from: fromId, to: toId, pop: amount * (1 - loss), t: 0, dur: 8 };
  unlockAch(s, "migrate");
  pushT(s, `▶ 组织【${fd.short}】${amount.toFixed(1)}万群众向【${BASES.find((b) => b.id === toId)!.short}】大转移——拖家带口，路上小心。`, "info");
  return true;
}
function tickMigration(s: KRState, dt: number): void {
  const m = s.migration; if (!m) return;
  m.t += dt;
  if (m.t >= m.dur) {
    const to = s.bases[m.to];
    to.pop = Math.min(BASES.find((b) => b.id === m.to)!.pop0 * 1.5, to.pop + m.pop);
    pushT(s, `★ ${m.pop.toFixed(1)}万群众安全抵达【${BASES.find((b) => b.id === m.to)!.short}】，安顿下来了。`, "win");
    s.migration = null;
  }
}
// 发动大战役
export function launchCampaign(s: KRState, id: string): boolean {
  const c = CAMPAIGNS.find((x) => x.id === id);
  if (!c || campaignAvailable(s, c) !== "ok") return false;
  if (s.bing < c.costBing || s.wuzi < c.costWuzi) return false;
  s.bing -= c.costBing; s.wuzi -= c.costWuzi;
  s.campaigns[id] = true; s.campMult *= c.outputMult; s.stats.campaignsWon += 1;
  pushT(s, `★★ ${c.name}（${c.hist}）：${c.line}`, "win");
  if (c.fx === "baituan") {
    let removed = 0;
    for (const b of BASES) { const st = s.bases[b.id]; const r = Math.ceil(st.spots * 0.6); st.spots -= r; removed += r; }
    s.stats.spotsRemoved += removed;
    if (removed > 0) pushT(s, `百团破袭拆掉 ${removed} 座据点、破路千里——囚笼稀烂！`, "win");
  }
  if (c.fx === "qinyuan") {
    const st = s.bases["taiyue"]; if (st) { s.stats.spotsRemoved += st.spots; st.spots = 0; }
  }
  return true;
}

// ══ 扫荡 ══════════════════════════════════════════════════════════
// 强度=档位基准为主(每档对抗规模可预期)+玩家兵力推高(封顶基准2.4×,防碾压无聊)
function sweepStrength(s: KRState, mult = 1): number {
  const e = era(s);
  const retaliation = s.campaigns["baituan"] && e.id === 2 ? TUNING.baituanRetaliation : 1;
  const tb = TIER_ENEMY[tier(s)] * Math.max(0.5, e.strengthMult) * retaliation * mult;
  const scale = Math.pow(Math.max(1, s.bing), 0.85) * 0.9;
  return Math.max(6, Math.round((tb * 0.65 + Math.min(scale, tb * 2.4) * 0.5) * (0.85 + Math.random() * 0.3)));
}
function pickSweepTarget(s: KRState): string {
  const est = BASES.filter((b) => s.bases[b.id].est);
  if (est.length === 0) return "hq";
  const e = era(s);
  if (e.id === 2) { // 至暗期：优先打最肥的平原(史实:平原挨最狠)
    const plains = est.filter((b) => b.terrain === "plain");
    if (plains.length > 0 && Math.random() < 0.6) return plains.sort((a, b2) => s.bases[b2.id].pop - s.bases[a.id].pop)[0].id;
  }
  return est[Math.floor(Math.random() * est.length)].id;
}
// 按时期选战略意图（历史原型分布）
function pickSweepKind(e: EraDef): SweepKind {
  const r = Math.random();
  if (e.id === 0) return r < 0.85 ? "punitive" : "raid";
  if (e.id === 1) return r < 0.3 ? "punitive" : r < 0.75 ? "encircle" : "raid";
  if (e.id === 2) return r < 0.5 ? "encircle" : r < 0.8 ? "comb" : "raid";
  return r < 0.5 ? "punitive" : r < 0.8 ? "raid" : "encircle";
}
function triggerSweep(s: KRState, forceTarget?: string, strengthMult = 1, forceCols?: number): void {
  const e = era(s);
  const kind: SweepKind = forceCols ? "encircle" : pickSweepKind(e);
  // 意图参数：合围兵力大预警长；奔袭预警极短兵力小；梳篦拖得久、转移效果差
  const kMult = kind === "encircle" ? 1.2 : kind === "raid" ? 0.7 : kind === "comb" ? 1.1 : 1;
  const kEta = kind === "encircle" ? 1.3 : kind === "raid" ? 0.42 : kind === "comb" ? 1.2 : 1;
  const strength = sweepStrength(s, strengthMult * kMult);
  const target = forceTarget ?? pickSweepTarget(s);
  const cols = forceCols ?? (kind === "raid" ? 1 : kind === "encircle" ? Math.max(2, Math.min(5, e.cols + 1)) : Math.max(1, Math.min(5, e.cols)));
  const eta = TUNING.sweepEtaSec * kEta;
  s.sweep = {
    stage: "incoming", kind, strength, strength0: strength, cols, sanguang: e.sanguang,
    etaSec: eta, etaSec0: eta, committed: 0, committed0: 0, evacStarted: false, evacProgress: 0,
    battleSec: 0, battleMax: TUNING.battleMaxSec * (kind === "comb" ? 1.4 : 1), pillageSec: 0, pillageFrac: 0, killed: 0, lostBing: 0, targetBase: target
  };
  s.stats.sweepsFought += 1;
  const name = BASES.find((b) => b.id === target)!.name;
  const unit = unitName(strength);
  if (kind === "raid") pushT(s, `⚠⚠ 日军挺进队约 ${strength} 人化装奔袭【${name}】——预警极短，快应对！（捕捉奔袭）`, "loss");
  else if (kind === "comb") pushT(s, `⚠ 日军${unit}约 ${strength} 人对【${name}】拉网梳篦清剿——搜山搜地道，转移也难躲！`, "loss");
  else if (kind === "encircle" && e.sanguang) pushT(s, `⚠⚠ 日军${cols}路铁壁合围【${name}】！${unit}约 ${strength} 人，带着三光的命令——快转移群众、组织抗击！`, "loss");
  else if (kind === "encircle") pushT(s, `⚠ 日军${cols}路分进合击【${name}】，${unit}约 ${strength} 人——组织应对！`, "loss");
  else pushT(s, `⚠ 日军${unit}约 ${strength} 人讨伐【${name}】——组织群众转移，或集结兵员抗击！`, "loss");
}
export function startEvacuation(s: KRState): boolean {
  const sw = s.sweep;
  if (!sw || sw.stage === "pillage" || sw.evacStarted) return false;
  sw.evacStarted = true;
  pushT(s, "▶ 组织群众大范围转移！坚壁清野，向山里疏散——转移越完整，损失越小。", "info");
  return true;
}
export function commitTroops(s: KRState, n: number): number {
  const sw = s.sweep;
  if (!sw || sw.stage === "pillage") return 0;
  const c = Math.min(Math.floor(s.bing), Math.max(0, Math.floor(n)));
  if (c <= 0) return 0;
  s.bing -= c; sw.committed += c; sw.committed0 += c;
  pushT(s, sw.stage === "incoming" ? `▶ 组织抗击！${c} 名战士分路设伏，等鬼子进伏击圈。` : `▶ 增援 ${c} 名战士投入会战！`, "info");
  return c;
}
function pillageFracOf(s: KRState, sw: Sweep): number {
  const e = era(s);
  const strengthFrac = sw.strength / Math.max(1, sw.strength0);
  const base = 0.24 * (e.id === 2 ? 1.5 : 1);
  const evacEff = sw.kind === "comb" ? 0.45 : 0.8; // 梳篦清剿搜山搜地道——转移效果减半
  return Math.max(0, base * strengthFrac * (1 - defense(s, sw.targetBase)) * (1 - evacEff * sw.evacProgress));
}
function endBattle(s: KRState, sw: Sweep): void {
  const back = Math.floor(sw.committed);
  s.bing += back; sw.committed = 0;
  if (sw.strength <= 0.5) finishSweep(s, sw, true);
  else {
    sw.stage = "pillage"; sw.pillageSec = TUNING.pillageSec;
    sw.pillageFrac = pillageFracOf(s, sw);
    pushT(s, `日军 ${Math.round(sw.strength)} 人突进根据地烧抢${sw.sanguang ? "——三光暴行开始了" : ""}！${sw.evacStarted ? "掩护群众撤完最后一程！" : "群众没来得及转移！"}`, "loss");
  }
}
function finishSweep(s: KRState, sw: Sweep, cleanWin: boolean): void {
  const killed = Math.round(sw.killed);
  const loot = killed * (TUNING.lootBase + era(s).id * TUNING.lootPerEra) * networkMult(s) * doctrineMult(s, "loot");
  s.wuzi += loot; s.totalWuzi += loot;
  s.stats.killed += killed; s.stats.lost += Math.round(sw.lostBing);
  if (cleanWin) {
    pushT(s, `★ 反扫荡大捷！击毙日军 ${killed}（我方伤亡 ${Math.round(sw.lostBing)}），根据地毫发无损，缴获物资 ${fmt(loot)}！`, "win");
    unlockAch(s, "clean_win");
    if (sw.kind === "encircle") unlockAch(s, "repel_encircle");
    if (sw.kind === "raid") unlockAch(s, "repel_raid");
  }
  else {
    const lossPct = Math.round(sw.pillageFrac * 100);
    pushT(s, `反扫荡结束：击毙 ${killed}，我方伤亡 ${Math.round(sw.lostBing)}，被烧抢损失 ${lossPct}%${sw.evacProgress > 0.5 ? "（大转移保住了大半家底）" : ""}，缴获 ${fmt(loot)}。`, sw.pillageFrac > 0.12 ? "loss" : "info");
  }
  s.sweepsSurvived += 1;
  if (s.monthIdx >= 57 && s.monthIdx <= 59 && sw.strength0 > 100) unlockAch(s, "survive_wuyi");
  s.sweep = null;
}
function tickPillage(s: KRState, sw: Sweep, dt: number): void {
  const perSec = sw.pillageFrac / TUNING.pillageSec;
  s.wuzi -= s.wuzi * perSec * dt;
  s.bing -= s.bing * perSec * dt * 0.5;
  sw.pillageSec -= dt;
  if (sw.pillageSec <= 0) {
    let destroyed = 0;
    const sgMult = sw.sanguang ? 1.6 : 1;
    for (let i = 0; i < s.buildings.length; i++) {
      if (s.buildings[i] > 0 && Math.random() < sw.pillageFrac * 0.9 * sgMult) {
        const d = Math.max(1, Math.ceil(s.buildings[i] * sw.pillageFrac * 0.45 * sgMult));
        s.buildings[i] -= Math.min(s.buildings[i], d); destroyed += d;
      }
    }
    // 三光：目标根据地人口永久损失(压乘数) —— 无人区的伤疤
    const st = s.bases[sw.targetBase];
    if (sw.sanguang && st) {
      const lost = st.pop * sw.pillageFrac * 0.8;
      st.pop = Math.max(BASES.find((b) => b.id === sw.targetBase)!.pop0 * 0.25, st.pop - lost);
      s.stats.popLost += lost;
      if (lost > 0.5) pushT(s, `三光暴行：【${BASES.find((b) => b.id === sw.targetBase)!.short}】人口锐减 ${lost.toFixed(1)} 万——烧光、杀光、抢光。这笔血债，记下了。`, "loss");
    }
    if (destroyed > 0) pushT(s, `烧毁设施 ${destroyed} 处。留得青山在——重建！`, "loss");
    finishSweep(s, sw, false);
  }
}
function tickBattle(s: KRState, sw: Sweep, dt: number): void {
  sw.battleSec += dt;
  const d = defense(s, sw.targetBase);
  const ourRate = TUNING.ourKillRate * (1 + d * 1.6) * doctrineMult(s, "kill");
  const jpRate = TUNING.jpKillRate * (1 - d * 0.55);
  const jpLoss = Math.min(sw.strength, sw.committed * ourRate * dt, sw.strength0 * 0.18 * dt);
  const ourLoss = Math.min(sw.committed, sw.strength * jpRate * dt, sw.committed0 * 0.18 * dt);
  sw.strength -= jpLoss; sw.killed += jpLoss;
  sw.committed -= ourLoss; sw.lostBing += ourLoss;
  if (sw.strength <= 0.5 || sw.committed <= 0.5 || sw.battleSec >= sw.battleMax) {
    if (sw.battleSec >= sw.battleMax && sw.strength > 0.5) sw.strength *= 0.55;
    endBattle(s, sw);
  }
}
function tickSweep(s: KRState, dt: number): void {
  const sw = s.sweep; if (!sw) return;
  if (sw.evacStarted && sw.evacProgress < 1) sw.evacProgress = Math.min(1, sw.evacProgress + dt / TUNING.evacSec * (1 + defense(s) * 0.8));
  if (sw.stage === "incoming") {
    sw.etaSec -= dt;
    if (sw.etaSec <= 0) {
      if (sw.committed <= 0) {
        const auto = Math.floor(s.bing * TUNING.autoMilitiaFrac);
        if (auto > 0) { s.bing -= auto; sw.committed = auto; sw.committed0 = auto; pushT(s, `民兵 ${auto} 人自发阻击，掩护乡亲！`, "info"); }
      }
      if (sw.committed > 0) { sw.stage = "battle"; sw.battleSec = 0; pushT(s, `会战打响！我 ${Math.round(sw.committed)} × 敌 ${Math.round(sw.strength)}（${sw.cols}路）`, "info"); }
      else { sw.stage = "pillage"; sw.pillageSec = TUNING.pillageSec; sw.pillageFrac = pillageFracOf(s, sw); pushT(s, "无人设防——日军长驱直入，开始烧抢！", "loss"); }
    }
  } else if (sw.stage === "battle") tickBattle(s, sw, dt);
  else tickPillage(s, sw, dt);
}

// ══ 月推进（历史脚本/蚕食/扫荡排程）══════════════════════════════
function advanceMonth(s: KRState): void {
  s.monthIdx += 1;
  const e = era(s);
  // 时期播报
  if (e.id > s.eraShown) {
    s.eraShown = e.id;
    pushT(s, `━━ ${e.years} · ${e.name} ━━ ${e.jp}`, "era");
    s.stats.eraSnap.push({ bases: estCount(s), bing: Math.round(s.bing), pop: Math.round(BASES.reduce((a, b) => a + s.bases[b.id].pop, 0)) });
  }
  // 历史事件
  for (const ev of EVENTS) {
    if (ev.m === s.monthIdx && !s.eventsFired[ev.m]) {
      s.eventsFired[ev.m] = true;
      pushT(s, ev.text, ev.kind);
      if (ev.fx === "wannan") { s.kmtCut = true; s.wuzi *= 0.85; }
      if (ev.fx === "wuyi") { if (!s.sweep) triggerSweep(s, s.bases["jizhong"]?.est ? "jizhong" : undefined, 2.4, 5); else s.pendingWuyi = true; }
      if (ev.fx === "ichigo") { for (const b of BASES) s.bases[b.id].spots = Math.max(0, s.bases[b.id].spots - 1); }
    }
  }
  // 文献送达
  for (const d of DOCTRINES) {
    if (d.m === s.monthIdx && !s.doctrines[d.id] && !s.pendingDoctrines.includes(d.id)) {
      s.pendingDoctrines.push(d.id);
      pushT(s, `📜 一份油印小册子送到了根据地：${d.name}——点击研读。`, "era");
    }
  }
  // 蚕食：修据点/封锁沟(囚笼)
  if (Math.random() < e.encroach) {
    const est = BASES.filter((b) => s.bases[b.id].est && s.bases[b.id].spots < 5);
    if (est.length > 0) {
      const t = est[Math.floor(Math.random() * est.length)];
      const st = s.bases[t.id]; st.spots += 1;
      if (st.spots >= 3) pushT(s, `日军在【${t.short}】周边又筑一座炮楼——封锁沟已把根据地围了大半，产出被卡死。拔据点！`, "loss");
      else pushT(s, `蚕食：日军在【${t.short}】边上修起炮楼据点、挖封锁沟（${st.spots}/5）。`, "loss");
    }
  }
  // 挂起的五一大扫荡优先补发
  if (!s.sweep && s.pendingWuyi) { s.pendingWuyi = false; triggerSweep(s, s.bases["jizhong"]?.est ? "jizhong" : undefined, 2.4, 5); }
  // 扫荡排程
  if (!s.sweep && s.monthIdx >= s.nextSweepM && e.strengthMult > 0 && (bingPerSec(s) + wuziPerSec(s) > 0.5 || s.wuzi > 400)) {
    triggerSweep(s);
    s.nextSweepM = s.monthIdx + e.sweepGapM[0] + Math.floor(Math.random() * (e.sweepGapM[1] - e.sweepGapM[0] + 1));
  }
  // 终局
  if (s.monthIdx >= END_MONTH && !s.ended) {
    s.ended = true;
    pushT(s, "【1945.8.15】日本无条件投降！八年烽火，敌后的星火终成燎原——胜利了！", "win");
    if (endReport(s).grade === "中流砥柱") unlockAch(s, "legend");
  }
}

export function tick(s: KRState, dtSec: number): void {
  if (s.ended) return;
  const prodMult = s.sweep?.evacStarted ? TUNING.evacProdMult : 1;
  s.bing += bingPerSec(s) * prodMult * dtSec;
  s.wuzi += wuziPerSec(s) * prodMult * dtSec;
  s.totalWuzi += wuziPerSec(s) * prodMult * dtSec;
  if (s.sweep) tickSweep(s, dtSec);
  tickMigration(s, dtSec);
  s.achPoll += dtSec;
  if (s.achPoll >= 0.5) {
    s.achPoll = 0;
    for (const a of ACHIEVEMENTS) if (a.check && !s.achievements[a.id] && a.check(s)) unlockAch(s, a.id);
  }
  // 月推进（扫荡进行中时时间也走——历史不等人）
  s.monthAcc += dtSec * 1000;
  while (s.monthAcc >= MONTH_MS && !s.ended) { s.monthAcc -= MONTH_MS; advanceMonth(s); }
}

// ══ 结局：历史对照 ═══════════════════════════════════════════════
export interface EndReport {
  grade: string; gradeDesc: string; score: number;
  rows: { era: string; yours: string; hist: string }[];
}
export function endReport(s: KRState): EndReport {
  const popNow = BASES.reduce((a, b) => a + s.bases[b.id].pop, 0);
  const pop0 = BASES.reduce((a, b) => a + b.pop0, 0);
  const devSum = BASES.reduce((a, b) => a + s.bases[b.id].dev, 0);
  const score = estCount(s) * 10 + devSum * 4 + (popNow / pop0) * 40 + Math.min(30, s.stats.killed / 400) + s.stats.campaignsWon * 8 + Math.min(15, s.stats.spotsRemoved * 1.5);
  const grade = score >= 150 ? "中流砥柱" : score >= 110 ? "敌后劲旅" : score >= 70 ? "星火不熄" : "艰难求存";
  const gradeDesc = score >= 150 ? "你的根据地成了华北敌后的脊梁——像史实中的晋察冀、太行那样，撑起了持久战。"
    : score >= 110 ? "根据地在血火中站住了脚，为反攻积蓄了可观的力量。"
      : score >= 70 ? "尽管伤痕累累，敌后的火种始终没有熄灭——这本身就是胜利。"
        : "根据地在铁壁合围下几近凋零，但你坚持到了最后一天。留得青山在。";
  const sn = s.stats.eraSnap;
  const rows = [
    { era: "1937-38 战略防御", yours: `开辟根据地 ${sn[1]?.bases ?? estCount(s)} 块`, hist: "史实：八路军由4.5万发展到15万余，晋察冀等根据地相继创建" },
    { era: "1939-40 囚笼蚕食", yours: `兵员规模 ${fmt(sn[2]?.bing ?? s.bing)}${s.campaigns["baituan"] ? " · 打出百团大战" : " · 未发动百团大战"}`, hist: "史实：百团大战105个团破袭正太路，毙伤日伪军2.5万余" },
    { era: "1941-42 至暗时刻", yours: `人口保全 ${Math.round(popNow / pop0 * 100)}%（三光损失 ${s.stats.popLost.toFixed(1)} 万）`, hist: "史实：根据地人口由1亿锐减至5000万以下，八路军由40万减至30余万" },
    { era: "1943-44 恢复反攻", yours: `拔除据点 ${s.stats.spotsRemoved} 座 · 发动战役 ${s.stats.campaignsWon} 次`, hist: "史实：1944年局部反攻歼日伪军近20万，解放人口1700余万" },
    { era: "1945 大反攻", yours: `累计击毙 ${fmt(s.stats.killed)} · 我方伤亡 ${fmt(s.stats.lost)} · 反扫荡 ${s.sweepsSurvived} 次`, hist: "史实：敌后战场八年累计歼日伪军171万余人，敌后军民伤亡600余万" }
  ];
  return { grade, gradeDesc, score: Math.round(score), rows };
}

const UNITS = ["", "万", "亿", "兆"];
export function fmt(n: number): string {
  if (!isFinite(n)) return "∞";
  if (n < 10_000) return n < 10 ? (Math.round(n * 10) / 10).toString() : Math.floor(n).toLocaleString("en-US");
  let u = 0, v = n;
  while (v >= 10_000 && u < UNITS.length - 1) { v /= 10_000; u += 1; }
  return `${v.toFixed(2)}${UNITS[u]}`;
}
