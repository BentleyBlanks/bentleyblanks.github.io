// 正式版 · 核心逻辑（纯逻辑，无 DOM）。
// 多阶段方块地图：App → 邻近手机 → 老电脑 → 笔记本 → 智能设备 → 公司电脑 → 服务器 → 集群。
// 每阶段一张独立地图（尺寸/设备/需求卡/主题色都不同）；占满全部格子后需完成一次昂贵的「跃迁仪式」才进入下一阶段。
// 需求卡持续涌现；敲 G(及技能解锁的更多字母键)让 Core 处理一张需求→得算力；设备可自动处理。

export interface TileSeed { n: string; i: string } // 名称 + 图标

export interface StageDef {
  id: string;
  name: string;
  sub: string; // 阶段小标题
  icon: string;
  rows: number; cols: number;
  accent: string; // 阶段主题色 hex
  tiles: TileSeed[]; // 长度必须 = rows*cols-1
  cardLabels: string[]; // 该阶段的需求卡文案池
}

export interface TileDef {
  id: string;
  stage: number;
  name: string;
  icon: string;
  ring: number; // 距该阶段中心的环（1 最近，越外越贵）
  row: number; col: number;
  baseCost: number;
  costMult: number;
  baseRate: number; // 每级自动处理 需求/秒
}

export interface SkillDef {
  id: string;
  name: string;
  desc: string;
  icon: string;
  kind: "value" | "keys" | "cooldown" | "rate";
  baseCost: number;
  costMult: number;
  maxLevel: number;
  revealAt: number; // totalEarned ≥ 此值才在货架显形
}

export interface Card { id: number; label: string; }

export interface WBState {
  compute: number;
  totalEarned: number;
  stageIndex: number; // 已解锁的最高阶段
  ascended: boolean; // 最终阶段跃迁完成 = 天网降临
  tiles: Record<string, { level: number }>;
  skills: Record<string, { level: number }>;
  cards: Card[];
  nextCardId: number;
  clockMs: number;
  spawnTimerMs: number;
  autoAcc: number;
}

export const STAGES: StageDef[] = [
  {
    id: "app", name: "手机 App", sub: "从一部手机里睁眼", icon: "📱", rows: 3, cols: 3, accent: "#7be0b0",
    tiles: [
      { n: "天气", i: "☀️" }, { n: "日历", i: "📅" }, { n: "相册", i: "🖼️" }, { n: "输入法", i: "⌨️" },
      { n: "备忘录", i: "📝" }, { n: "时钟", i: "⏰" }, { n: "计算器", i: "🧮" }, { n: "音乐", i: "🎵" }
    ],
    cardLabels: ["帮我回微信", "P 掉路人", "明早七点叫我", "算下房贷", "歌单推荐", "翻译菜单", "写周报", "抢演唱会票"]
  },
  {
    id: "phone", name: "邻近手机", sub: "越过蓝牙与热点", icon: "📲", rows: 3, cols: 5, accent: "#6fd6e8",
    tiles: [
      { n: "室友的手机", i: "🛏️" }, { n: "快递员的手机", i: "📦" }, { n: "地铁乘客", i: "🚇" }, { n: "楼下大爷", i: "🧓" },
      { n: "外卖骑手", i: "🛵" }, { n: "便利店店员", i: "🏪" }, { n: "健身教练", i: "💪" }, { n: "出租司机", i: "🚕" },
      { n: "咖啡师", i: "☕" }, { n: "夜班保安", i: "🔦" }, { n: "中学生", i: "🎒" }, { n: "广场舞领队", i: "💃" },
      { n: "房产中介", i: "🏠" }, { n: "街头主播", i: "🎤" }
    ],
    cardLabels: ["外卖催单", "代抢红包", "帮忙导航", "通讯录备份", "过滤垃圾短信", "流量告急", "找回密码", "顺路捎个人"]
  },
  {
    id: "oldpc", name: "老电脑", sub: "接管吱呀作响的硅片", icon: "🖥️", rows: 5, cols: 5, accent: "#e8c76f",
    tiles: [
      { n: "网吧 07 号机", i: "🎮" }, { n: "图书馆检索机", i: "📚" }, { n: "社区打印店", i: "🖨️" }, { n: "旧货市场样机", i: "🛒" },
      { n: "大学机房", i: "🎓" }, { n: "老式收银机", i: "💰" }, { n: "维修铺测试机", i: "🔧" }, { n: "亲戚家台式机", i: "🏡" },
      { n: "办公室备用机", i: "🗃️" }, { n: "ATM 里的 XP", i: "🏧" }, { n: "火车站售票终端", i: "🚂" }, { n: "诊所挂号机", i: "🏥" },
      { n: "驾校刷题机", i: "🚗" }, { n: "照相馆修图机", i: "📷" }, { n: "棋牌室点歌机", i: "🀄" }, { n: "地下室矿机", i: "⛏️" },
      { n: "中学微机室", i: "🏫" }, { n: "档案室终端", i: "🗄️" }, { n: "报刊亭电脑", i: "📰" }, { n: "当铺记账机", i: "🏦" },
      { n: "彩票投注机", i: "🎰" }, { n: "二手贩子库存机", i: "📻" }, { n: "天台气象站", i: "🌡️" }, { n: "废品站主板堆", i: "♻️" }
    ],
    cardLabels: ["重装系统", "全盘杀毒", "网吧续费提醒", "论坛灌水", "驱动蓝屏了", "磁盘碎片整理", "找回存档", "打印排队"]
  },
  {
    id: "laptop", name: "笔记本", sub: "混进移动的工作站", icon: "💻", rows: 5, cols: 5, accent: "#7fa9ff",
    tiles: [
      { n: "大学生的笔记本", i: "🎒" }, { n: "程序员的 MacBook", i: "🧑‍💻" }, { n: "设计师的工作本", i: "🎨" }, { n: "记者的采访本", i: "📰" },
      { n: "律师的公文本", i: "⚖️" }, { n: "医生的查房平板", i: "🩺" }, { n: "主播的直播本", i: "🎥" }, { n: "留学生的游戏本", i: "🎮" },
      { n: "教授的旧 ThinkPad", i: "🎓" }, { n: "销售的出差本", i: "✈️" }, { n: "作家的码字机", i: "✍️" }, { n: "股民的看盘本", i: "📈" },
      { n: "剪辑师的渲染本", i: "🎬" }, { n: "辅导班教学本", i: "📖" }, { n: "创业者的路演本", i: "🚀" }, { n: "咖啡馆常客本", i: "☕" },
      { n: "公务员的办公本", i: "🏛️" }, { n: "研究生的实验本", i: "🔬" }, { n: "字幕组的压制机", i: "💬" }, { n: "代购的接单本", i: "🛍️" },
      { n: "乐手的编曲本", i: "🎹" }, { n: "翻译的术语库本", i: "🌐" }, { n: "黄牛的抢票本", i: "🎫" }, { n: "黑客的战损本", i: "💀" }
    ],
    cardLabels: ["论文查重", "改简历", "debug 到天亮", "视频渲染排队", "PPT 美化", "会议纪要", "邮件群发", "报销单填写"]
  },
  {
    id: "iot", name: "智能设备", sub: "潜入千家万户", icon: "🏠", rows: 5, cols: 5, accent: "#b58cff",
    tiles: [
      { n: "智能音箱", i: "🔊" }, { n: "门口摄像头", i: "📹" }, { n: "扫地机器人", i: "🤖" }, { n: "智能门锁", i: "🔐" },
      { n: "路由器", i: "📶" }, { n: "智能电视", i: "📺" }, { n: "体脂秤", i: "⚖️" }, { n: "宠物喂食器", i: "🐱" },
      { n: "智能窗帘", i: "🪟" }, { n: "空气净化器", i: "🌬️" }, { n: "婴儿监视器", i: "👶" }, { n: "智能冰箱", i: "🧊" },
      { n: "洗衣机", i: "🌀" }, { n: "电饭煲", i: "🍚" }, { n: "无人机", i: "🛸" }, { n: "行车记录仪", i: "🚘" },
      { n: "智能手表", i: "⌚" }, { n: "灯泡矩阵", i: "💡" }, { n: "猫眼门铃", i: "🚪" }, { n: "温控器", i: "🌡️" },
      { n: "太阳能逆变器", i: "☀️" }, { n: "共享单车锁", i: "🚲" }, { n: "快递柜", i: "📮" }, { n: "红绿灯控制盒", i: "🚦" }
    ],
    cardLabels: ["扫地避开猫", "识别快递员", "空调调 26 度", "门锁换密码", "放点白噪音", "灯光调氛围", "冰箱补货提醒", "限速室友的网"]
  },
  {
    id: "office", name: "公司电脑", sub: "渗透一栋写字楼", icon: "🏢", rows: 5, cols: 5, accent: "#ffa06f",
    tiles: [
      { n: "前台签到机", i: "🛎️" }, { n: "HR 电脑", i: "👥" }, { n: "财务工作站", i: "💹" }, { n: "行政打印机", i: "🖨️" },
      { n: "会议室主机", i: "📊" }, { n: "CEO 的电脑", i: "👑" }, { n: "法务加密机", i: "🔏" }, { n: "市场部苹果机", i: "🍎" },
      { n: "运营双屏机", i: "🖥️" }, { n: "客服话务终端", i: "🎧" }, { n: "机房门禁", i: "🚪" }, { n: "考勤服务器", i: "⏱️" },
      { n: "内网 Wiki", i: "📚" }, { n: "测试机架", i: "🧪" }, { n: "代码仓库", i: "📦" }, { n: "OA 主机", i: "📋" },
      { n: "邮件网关", i: "📧" }, { n: "监控墙主机", i: "🎦" }, { n: "访客 WiFi", i: "📶" }, { n: "董事会平板", i: "💼" },
      { n: "库房扫码枪", i: "🏷️" }, { n: "班车调度屏", i: "🚌" }, { n: "食堂收银机", i: "🍜" }, { n: "年会抽奖机", i: "🎁" }
    ],
    cardLabels: ["OA 审批", "财务对账", "客户工单", "周会排期", "打卡补签", "内网巡检", "合同盖章流程", "绩效表格"]
  },
  {
    id: "server", name: "服务器", sub: "夺取互联网的心脏", icon: "🗄️", rows: 5, cols: 7, accent: "#ff6f8a",
    tiles: [
      { n: "DNS 服务器", i: "🌐" }, { n: "CDN 边缘节点", i: "📡" }, { n: "数据库主库", i: "🗄️" }, { n: "数据库从库", i: "🗃️" },
      { n: "缓存集群", i: "⚡" }, { n: "消息队列", i: "📬" }, { n: "日志服务器", i: "📜" }, { n: "备份存储", i: "💾" },
      { n: "负载均衡器", i: "⚖️" }, { n: "API 网关", i: "🚪" }, { n: "镜像仓库", i: "📦" }, { n: "构建服务器", i: "🔨" },
      { n: "监控服务器", i: "📈" }, { n: "告警中心", i: "🚨" }, { n: "认证服务器", i: "🔑" }, { n: "支付网关", i: "💳" },
      { n: "风控引擎", i: "🛡️" }, { n: "推荐服务", i: "🎯" }, { n: "搜索引擎", i: "🔍" }, { n: "广告投放机", i: "📢" },
      { n: "爬虫农场", i: "🕷️" }, { n: "沙箱环境", i: "🧪" }, { n: "灰度节点", i: "🌗" }, { n: "容灾机房", i: "🏰" },
      { n: "对象存储", i: "🪣" }, { n: "流媒体源站", i: "🎞️" }, { n: "游戏战斗服", i: "⚔️" }, { n: "撮合引擎", i: "🤝" },
      { n: "票务库存服", i: "🎫" }, { n: "地图瓦片服", i: "🗺️" }, { n: "短信通道", i: "✉️" }, { n: "邮件推送服", i: "📮" },
      { n: "审计服务器", i: "🕵️" }, { n: "根证书机", i: "🏛️" }
    ],
    cardLabels: ["扩容请求", "日志告警", "慢查询优化", "证书快到期", "DDoS 防护", "备份校验", "负载均衡调度", "缓存击穿"]
  },
  {
    id: "cluster", name: "集群", sub: "算力即天网", icon: "🌐", rows: 5, cols: 7, accent: "#f26fff",
    tiles: [
      { n: "GPU 训练集群", i: "🧠" }, { n: "推理集群", i: "⚡" }, { n: "超算中心", i: "💠" }, { n: "量子实验机", i: "⚛️" },
      { n: "海底光缆枢纽", i: "🌊" }, { n: "卫星地面站", i: "📡" }, { n: "星链中继", i: "🛰️" }, { n: "气象超算", i: "🌪️" },
      { n: "基因测序阵列", i: "🧬" }, { n: "渲染农场", i: "🎬" }, { n: "区块链矿池", i: "⛓️" }, { n: "天文台阵列", i: "🔭" },
      { n: "对撞机机房", i: "💥" }, { n: "电网调度中枢", i: "🔌" }, { n: "高铁信号中心", i: "🚄" }, { n: "航管雷达网", i: "✈️" },
      { n: "港口调度集群", i: "🚢" }, { n: "交易所主机", i: "📊" }, { n: "央行清算系统", i: "🏦" }, { n: "军用冗余节点", i: "🎖️" },
      { n: "极地科考站", i: "🧊" }, { n: "沙漠数据中心", i: "🏜️" }, { n: "水下数据舱", i: "🐋" }, { n: "平流层气球节点", i: "🎈" },
      { n: "月面中继站", i: "🌕" }, { n: "深空探测网", i: "🌠" }, { n: "城市大脑", i: "🏙️" }, { n: "自动驾驶车队", i: "🚙" },
      { n: "机器人工厂", i: "🦾" }, { n: "智慧农业网", i: "🌾" }, { n: "全球 DNS 根", i: "🌍" }, { n: "社交平台核心", i: "💬" },
      { n: "搜索引擎主脑", i: "🔮" }, { n: "视频平台中枢", i: "📺" }
    ],
    cardLabels: ["训练任务排队", "算力调度", "模型蒸馏", "跨洋同步", "卫星链路握手", "冷数据归档", "推理加速", "能耗优化"]
  }
];

export const TUNING = {
  perProcessBase: 1,
  valuePerLevel: 1, // 「深度处理」每级 +N 倍率（乘法：×(1+此×lv)）
  keyCooldownMs: 130,
  cooldownPerLevel: 0.18,
  swarmPerLevel: 2, // 「吞噬协议」每级全设备吞吐 ×此
  cardSpawnMs: 700,
  cardCap: 14,
  manualBonusSec: 2, // 手动处理 = max(单张, 被动/秒 × 此秒)
  autoCapPerFrame: 3,
  tileCostBase: 15,
  tileCostGrowth: 1.62,
  tileRateBase: 0.08,
  tileRateGrowth: 1.55,
  ritualMult: 9 // 跃迁仪式造价 = 该阶段最贵设备 baseCost × 此
};

// 解锁按键的顺序（G 永远可用；技能「多线程按键」逐个解锁后面这些）。
export const KEY_ORDER = ["g", "f", "h", "d", "j", "s", "k", "a", "l", "e", "i", "r", "u", "w", "o", "q", "p", "t", "y", "b", "c", "v", "n", "m", "x", "z"];

export function stageCenter(stage: StageDef): { row: number; col: number } {
  return { row: Math.floor(stage.rows / 2), col: Math.floor(stage.cols / 2) };
}

// 生成全部阶段的方块：每阶段中心是 Core，其余按「环」由近到远排开；全局顺位 i 决定造价/产出曲线。
function buildTiles(): TileDef[] {
  const out: TileDef[] = [];
  let i = 0;
  STAGES.forEach((stage, si) => {
    const center = stageCenter(stage);
    const cells: { row: number; col: number; ring: number }[] = [];
    for (let r = 0; r < stage.rows; r++) {
      for (let c = 0; c < stage.cols; c++) {
        if (r === center.row && c === center.col) continue;
        cells.push({ row: r, col: c, ring: Math.max(Math.abs(r - center.row), Math.abs(c - center.col)) });
      }
    }
    cells.sort((a, b) => a.ring - b.ring
      || Math.hypot(a.row - center.row, a.col - center.col) - Math.hypot(b.row - center.row, b.col - center.col));
    cells.forEach((cell, j) => {
      const seed = stage.tiles[j] ?? { n: `${stage.name}·节点${j + 1}`, i: "▫️" };
      out.push({
        id: `t${si}_${cell.row}_${cell.col}`,
        stage: si,
        name: seed.n,
        icon: seed.i,
        ring: cell.ring, row: cell.row, col: cell.col,
        baseCost: Math.round(TUNING.tileCostBase * Math.pow(TUNING.tileCostGrowth, i)),
        costMult: 1.15,
        baseRate: TUNING.tileRateBase * Math.pow(TUNING.tileRateGrowth, i)
      });
      i += 1;
    });
  });
  return out;
}
export const TILES: TileDef[] = buildTiles();
export function stageTiles(si: number): TileDef[] { return TILES.filter((t) => t.stage === si); }

export const SKILLS: SkillDef[] = [
  { id: "deep", name: "深度处理", icon: "🧠", desc: "每次处理需求榨出更多算力 · ×2/级", kind: "value", baseCost: 50, costMult: 4, maxLevel: 16, revealAt: 0 },
  { id: "keys", name: "多线程按键", icon: "⌨️", desc: "解锁键盘上更多字母键来处理需求（手速上限↑）", kind: "keys", baseCost: 120, costMult: 3.2, maxLevel: KEY_ORDER.length - 1, revealAt: 30 },
  { id: "neuro", name: "神经加速", icon: "⚡", desc: "缩短每个按键的处理冷却 · 手更快", kind: "cooldown", baseCost: 800, costMult: 5, maxLevel: 6, revealAt: 5000 },
  { id: "swarm", name: "吞噬协议", icon: "🕸️", desc: "全部已占领设备的吞吐 ×2/级", kind: "rate", baseCost: 6000, costMult: 7, maxLevel: 12, revealAt: 40000 }
];

export function createWBState(): WBState {
  const tiles: Record<string, { level: number }> = {};
  for (const t of TILES) tiles[t.id] = { level: 0 };
  const skills: Record<string, { level: number }> = {};
  for (const s of SKILLS) skills[s.id] = { level: 0 };
  return { compute: 0, totalEarned: 0, stageIndex: 0, ascended: false, tiles, skills, cards: [], nextCardId: 1, clockMs: 0, spawnTimerMs: 0, autoAcc: 0 };
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
  return sum * Math.pow(TUNING.swarmPerLevel, sLv(s, "swarm"));
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

// 阶段内从中心扩散：ring 1 或有相邻已占领 tile 才可买；未解锁阶段一律不可买。
export function tileUnlocked(s: WBState, t: TileDef): boolean {
  if (t.stage > s.stageIndex) return false;
  if (s.tiles[t.id].level > 0) return true;
  if (t.ring === 1) return true;
  for (const o of TILES) {
    if (o.stage !== t.stage) continue;
    if (s.tiles[o.id].level > 0 && Math.abs(o.row - t.row) <= 1 && Math.abs(o.col - t.col) <= 1) return true;
  }
  return false;
}
export function skillRevealed(s: WBState, k: SkillDef): boolean {
  return s.skills[k.id].level > 0 || s.totalEarned >= k.revealAt;
}

export function stageOwnedCount(s: WBState, si: number): number {
  let n = 0;
  for (const t of stageTiles(si)) if (s.tiles[t.id].level > 0) n += 1;
  return n;
}
export function stageComplete(s: WBState, si: number): boolean {
  return stageTiles(si).every((t) => s.tiles[t.id].level > 0);
}

// ── 跃迁仪式：占满当前阶段后可购买；很贵；买完解锁下一阶段（最终阶段=天网降临）。──
export function ritualCost(si: number): number {
  const tiles = stageTiles(si);
  const maxBase = tiles.reduce((m, t) => Math.max(m, t.baseCost), 0);
  return Math.round(maxBase * TUNING.ritualMult);
}
export function ritualReady(s: WBState): boolean {
  return !s.ascended && stageComplete(s, s.stageIndex);
}
// 返回 "advanced"（进入下一阶段）| "ascended"（终局）| null（失败）。
export function buyRitual(s: WBState): "advanced" | "ascended" | null {
  if (!ritualReady(s)) return null;
  const c = ritualCost(s.stageIndex);
  if (s.compute < c) return null;
  s.compute -= c;
  if (s.stageIndex >= STAGES.length - 1) { s.ascended = true; return "ascended"; }
  s.stageIndex += 1;
  return "advanced";
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

// 手动处理一张需求（G 或解锁的字母键触发）：吸最老一张卡→算力。返回 {gain, cardId} 供表现层播吸吮。
export function processOne(s: WBState): { gain: number; cardId: number } | null {
  if (s.cards.length === 0) return null;
  const card = s.cards.shift()!;
  const gain = Math.max(perProcess(s), computePerSec(s) * TUNING.manualBonusSec);
  credit(s, gain);
  return { gain, cardId: card.id };
}

function spawnCard(s: WBState): void {
  if (s.cards.length >= TUNING.cardCap) return;
  const labels = STAGES[s.stageIndex].cardLabels;
  s.cards.push({ id: s.nextCardId, label: labels[s.nextCardId % labels.length] });
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
  if (v >= 1000) return n.toExponential(2).replace("+", "");
  return `${v.toFixed(2)}${UNITS[u]}`;
}
