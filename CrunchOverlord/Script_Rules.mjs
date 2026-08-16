// 《牛马指挥官》纯逻辑模块。禁止 window / document / Math.random()。
// 上帝视角：玩家是老板，指挥牛马做游戏。安抚有足浴/奶茶/奖状/团建；
// 老板出门牛马摸鱼。帝国层：目录分成、工作室扩张、AI 月租、基建。随机走 Rand(state)。

import {
  STUDIO_TIERS,
  MILESTONES,
  AI_PLANS,
  UPGRADES,
  EXTRA_DESKS,
  EXTRA_ROLES,
  EXTRA_IDLE,
} from "./Data_Empire.mjs";

export { STUDIO_TIERS, MILESTONES, AI_PLANS, UPGRADES };

export const WORLD = Object.freeze({
  width: 1280,
  height: 720,
  coreX: 640,
  coreY: 370,
  doorX: 1252,
  doorY: 560,
});

export const BOSS_HOME = Object.freeze({ x: 640, y: 178 });

export const MONTH_SECONDS = 20;
export const WORKER_SALARY = 5500;
export const START_CASH = 88888;
export const REVENUE_GOAL = 10000000000;
export const VISIBLE_STAFF_CAP = 16;
export const CATALOG_PER_SHIP = 0.28;
export const ROYALTY_RATE = 0.055;
export const FOOTBATH_COST = 1999;
export const PIE_DURATION = 8;
export const PIE_COOLDOWN = 26;
export const PIE_SPEED_MULT = 1.7;
export const PIE_HANGOVER_MORALE = 8;
export const BOSS_CODE_COOLDOWN = 7;
export const BOSS_CODE_PROGRESS = 10;
export const BOSS_CODE_HAIR_COST = 12;
export const FOOTBATH_SOAK_SECONDS = 6;
export const FOOTBATH_MORALE = 35;
export const SPRINT_SECONDS = 6;
export const MAX_TUMORS = 6;
export const SLACK_PROGRESS_MULT = 0.55;
export const SLACK_MORALE_REGEN = 0.8;
export const STOCK_STAKE = 20000;
export const CLUB_INVEST_GAIN = 66666;
export const MILK_TEA_COST = 888;
export const MILK_TEA_MORALE = 12;
export const MILK_TEA_COOLDOWN = 14;
export const AWARD_COOLDOWN = 10;
export const AWARD_BASE_MORALE = 18;
export const AWARD_DECAY = 7;
export const AWARD_MIN = -12;
export const TEAMBUILD_COST = 6666;
export const TEAMBUILD_SECONDS = 7;
export const TEAMBUILD_MORALE = 26;
export const TEAMBUILD_VICTIM_MORALE = -10;
export const HIRE_COST = 2000;
export const HIRE_ORDER = Object.freeze(["linKeke", "zhaoDagang", "chenChonggou", "taoShengdian"]);
export const COMPANY_NAMES = [
  "福报互娱",
  "梦想加一像素",
  "纳斯达克预备役",
  "周一就上市科技",
  "工位即战场文化",
];

export const BOSS_ACTIVITIES = Object.freeze({
  spa: {
    label: "老板去足疗",
    cost: 888,
    staySeconds: 6,
    departLine: "我去考察一下按摩行业，顺便长点头发。",
    blockedLine: "老板正在被按头皮，命令传不进包间。",
  },
  club: {
    label: "高端会所",
    cost: 8888,
    staySeconds: 8,
    departLine: "我去会所拉投资！这叫资源整合！",
    blockedLine: "老板正在会所听区块链，牛马获得了短暂的自由。",
  },
  stock: {
    label: "杀入股市",
    cost: STOCK_STAKE,
    staySeconds: 7,
    departLine: "游戏是副业，股市才是主战场！",
    blockedLine: "老板正盯着大盘发抖，没空理你。",
  },
});

export const PROJECT_NAMES = [
  "《赛博养猪场》",
  "《魂like记账软件》",
  "《恋与办公室：加班篇》",
  "《外卖骑士：饿速传说》",
  "《房贷幸存者》",
  "《开会大乱斗》",
  "《像素炼狱：需求评审》",
  "《周报英雄》",
  "《原地退休模拟器》",
];

export const REVIEW_TIERS = [
  { minQuality: 0.95, stars: 5, line: "「年度最佳！虽然我退款了。」" },
  { minQuality: 0.8, stars: 4, line: "「瑕不掩瑜。瑜也不多。」" },
  { minQuality: 0.6, stars: 3, line: "「能玩。像我的人生，能过。」" },
  { minQuality: 0.4, stars: 2, line: "「BUG 比内容有创意。」" },
  { minQuality: 0, stars: 1, line: "「建议改行。」——你妈妈的评论" },
];

// 发售后飘过的玩家弹幕（喷子含量拉满）
export const DANMAKU_BY_STARS = Object.freeze({
  5: [
    "好玩到忘记上班，现在我也失业了，同行你好",
    "给五星是怕你们老板再画饼",
    "通关了，比我的人生完整",
    "年度最佳！但我还是退款了，穷",
  ],
  4: [
    "四星，扣一星因为我老板也这样画饼",
    "挺好玩，加载图上的错别字看得我血压高",
    "不错，但我猫踩键盘也能做出这段剧情",
    "美术在线，策划在线，钱包已下线",
  ],
  3: [
    "三星观望，听说老板又亲自写代码了",
    "中规中矩，建议给牛马加鸡腿",
    "玩了三小时，退了，又买了，贱",
    "能玩。像我的婚姻，能过",
  ],
  2: [
    "我的存档消失了，像老板的承诺",
    "退款流程做得最流畅，好评",
    "BUG 多到我以为在玩找茬",
    "优化稀烂，我的手机现在是暖手宝",
  ],
  1: [
    "建议改行——你妈妈的评论",
    "这不是游戏，这是事故现场",
    "客服说这是特性。特性你个头",
    "主播都不敢播这个",
  ],
});

export const BOSS_LINES = Object.freeze({
  assign: ["你，去堵这个！", "带薪发呆到此为止！", "这条命令已计入 OKR！", "跑起来！鞋是公司发的！"],
  sprint: ["都让让，核心玩法冲一波！", "这周的版本就靠你了！", "冲！福报在前面！"],
  slash: ["这个需求，砍了！", "上线以后再说！", "砍！预算不同意它存在！", "我裁需求的速度比裁人快多了！"],
  pie: ["干完这票，人人都是合伙人！", "上市了给你们一人一层楼！", "这不是加班，这是财富自由预科班！", "明年今天，纳斯达克见！"],
  bossCode: ["让开！我当年用记事本写过引擎！", "看好了，这叫老板的肌肉记忆！", "报错就是编译器嫉妒我！"],
  footbath: ["去，把脚洗了，公司报销！", "泡完回来给我拿出上市公司的精神面貌！"],
  milkTea: ["全员奶茶！三分糖，甜多了你们会忘记工资！", "喝！喝完这杯还有三杯需求！", "这不是奶茶，这是液体股权！"],
  award: ["这张奖状，含金量比工资高！", "裱起来！挂工位上！让别人卷死！", "公司穷得只剩荣誉了，都给你！"],
  teambuild: ["全体收拾东西，团建！这是命令也是福利！", "不许带电脑！但把工作都记在脑子里！", "去团建！费用我出，快乐你们自己找！"],
  back: ["都给我回工位！！", "我听见 Switch 的声音了！！", "刚才谁在点外卖？！"],
});

// 老板亲自写代码时，随机一头牛马的吐槽
export const BOSS_CODE_ROASTS = [
  "老板又提交代码了，大家系好安全带。",
  "变量名叫 aaa2，我看到它的时候它已经在生产环境了。",
  "老板的注释写着：别问，问就是能跑。",
  "刚才那次提交把周五也删了。",
];

// 奶茶到货时牛马的反应
export const MILK_TEA_LINES = [
  "谢谢老板！这杯奶茶值三行代码。",
  "珍珠是加班的形状，但我不管，真香。",
  "喝完这杯，再干半小时，说好了啊。",
  "老板请奶茶，事出反常必有需求。",
];

// 收到奖状（还没穿帮时）
export const AWARD_LINES = [
  "谢谢老板！我先假装很感动。",
  "裱是不会裱的，垫泡面倒是正好。",
  "妈，我出息了，是纸做的那种。",
];

// 奖状发多了，牛马看穿了一切
export const AWARD_JADED_LINES = [
  "又是奖状？奖状能交房租吗？！",
  "第 N 张了，我工位快贴成灵堂了。",
  "把打印机墨钱折现给我都比这强。",
  "下次能不能直接发钱，纸我家有。",
];

// 团建出发时
export const TEAMBUILD_GO_LINES = [
  "团建？周末团建等于上六天班！",
  "只要不在工位，哪儿都是天堂。",
  "我赌五毛，到了还是聊需求。",
  "记得拍照发朋友圈，配文：感恩公司。",
];

// 团建回来（多数人真香）
export const TEAMBUILD_BACK_LINES = [
  "烤肉不错，明天继续为烤肉打工。",
  "唱了三小时，嗓子哑了，心情好了。",
  "团建一日游，感觉自己又能卷三个月。",
];

// 团建受害者（就是讨厌团建）
export const TEAMBUILD_HATE_LINES = [
  "果然，团建就是换个地方开会。",
  "全程在玩『真心话大冒险之你对公司的建议』。",
  "我的周末！还我周末！",
];

// 老板不在时的摸鱼台词
export const SLACK_LINES = [
  "谁带 Switch 了？连我一个。",
  "外卖点起来，老板的卡还绑在群里。",
  "我先睡十分钟，老板回来记得咳嗽。",
  "原来不加班的空气是甜的。",
  "快快快，把进度条截图存好，一会儿慢慢用。",
  "有人要开黑吗？就一把，真的就一把。",
];

export const WORKER_DEFS = [
  {
    id: "linKeke",
    name: "林可可",
    role: "art",
    roleLabel: "美术",
    roleGlyph: "美",
    color: "#ff6eae",
    desk: { x: 300, y: 225 },
    idleLines: [
      "这个角色只有十二万面，很克制了。",
      "参考图不是抄，叫视觉对齐。",
      "性能同学又想删我的粒子，他审美线程阻塞了。",
      "老板说要『高级感』，我加了个渐变，他说对，就是这个。",
      "甲方眼里的五彩斑斓的黑，我今天做出来了。",
    ],
    hireLine: "美术报道。先说好，修缺陷单要加钱。",
    assignedLines: ["美术修缺陷单？行吧，崩溃也要好看。", "收到，我给报错界面加个渐变。", "去了去了，画笔换扳手。"],
    fixedLines: ["修好了，顺手加了描边。", "好了。别问我怎么修的，问就是艺术。"],
    footbathLines: ["脚是新的了，灵感也是。", "泡完想给主角加第三层轮廓光。"],
    quitLine: "我去接商单了，时薪是这里三倍。",
  },
  {
    id: "zhaoDagang",
    name: "赵大纲",
    role: "design",
    roleLabel: "策划",
    roleGlyph: "策",
    color: "#ffd166",
    desk: { x: 300, y: 520 },
    idleLines: [
      "我又想了个很小的功能：动态生态文明。",
      "文档已经能玩了，游戏可以慢慢来。",
      "工期不是问题，把战斗复用到钓鱼就行。",
      "这不叫抄袭，这叫行业最佳实践对齐。",
      "我在文档里埋了个彩蛋：离职申请模板。",
    ],
    hireLine: "策划来了。文档我已经写了八十页，游戏可以慢慢做。",
    assignedLines: ["策划修缺陷单？我去把它改成特性。", "这张单逻辑自洽，我先给它写个背景故事。"],
    fixedLines: ["搞定，顺便把它写进了世界观。", "修完了，文档更新到第 48 页。"],
    slashLines: ["那是我写了三周的文档！！", "你砍的不是需求，是我的青春！", "行，砍吧，反正简历上我会写做完了。", "下次评审我要带律师来！"],
    footbathLines: ["泡的时候想到七个新系统，放心，只提一个。"],
    quitLine: "我要去做自己的游戏，不带老板。",
  },
  {
    id: "chenChonggou",
    name: "陈重构",
    role: "client",
    roleLabel: "客户端",
    roleGlyph: "码",
    color: "#66b8ff",
    desk: { x: 980, y: 225 },
    idleLines: [
      "我只改了一行，UI 去了火星。",
      "先别点，我本机是好的。",
      "不是 Bug，是状态机对现实的理解不同。",
      "这段代码是祖传的，动了要上香。",
      "重构完成度 99%，剩下 1% 是全部。",
    ],
    hireLine: "客户端到了。本机是好的，出了问题先重启。",
    assignedLines: ["收到，这张缺陷单我认识，是我写的。", "去了。修不好我就重构，重构不好我就转行。"],
    fixedLines: ["修好了，又欠了点技术债，先记账上。", "好了。提交信息我写的是『奇迹』。"],
    footbathLines: ["泡完突然看懂了自己上周写的代码。"],
    quitLine: "劳动仲裁见。",
  },
  {
    id: "taoShengdian",
    name: "陶省电",
    role: "performance",
    roleLabel: "性能",
    roleGlyph: "优",
    color: "#68e0a0",
    desk: { x: 980, y: 520 },
    idleLines: [
      "手机烫得能煎蛋，算不算联动玩法？",
      "我把粒子删了，美术还不知道。",
      "帧率就像工资，看着有，摸不着。",
      "内存泄漏不可怕，可怕的是它比我先转正。",
      "刚优化完启动速度，现在闪退得特别快。",
    ],
    hireLine: "性能到岗。先把帧率从『能煎蛋』救回『能点』。",
    assignedLines: ["性能问题交给我，画面问题交给命。", "收到，先关特效，再关美术的门。"],
    fixedLines: ["帧率回来了，特效没了。", "优化完成。现在它流畅地展示着没内容。"],
    footbathLines: ["泡脚水温 42 度，比我们的服务器凉快。"],
    quitLine: "我去大厂躺平了，那边加班有加班费。",
  },
];

export function CreateState(seed = 20260816) {
  return {
    seed,
    status: "title", // title | setup | playing | won | lost
    loseReason: "",
    companyName: "",
    setup: { step: "register", hireIndex: 0, allowOrders: false },
    time: 0,
    month: 1,
    monthTimer: 0,
    cash: START_CASH,
    revenue: 0,
    revenueGoal: REVENUE_GOAL,
    hair: 100,
    pie: { timer: 0, cooldown: 0 },
    bossCodeCooldown: 0,
    milkTeaCooldown: 0,
    awardCooldown: 0,
    awardsGiven: 0,
    spawnTimer: 3.5,
    ambientTimer: 6,
    slackTimer: 0,
    tumorSerial: 1,
    teachQueue: ["bug", "scope"], // 前两张工单固定：缺陷单 → 加塞便签
    boss: {
      x: BOSS_HOME.x,
      y: BOSS_HOME.y,
      tx: BOSS_HOME.x,
      ty: BOSS_HOME.y,
      phase: "office", // office | out | away | back
      activity: null,
      timer: 0,
    },
    project: {
      nameIndex: 0,
      name: PROJECT_NAMES[0],
      scale: 1,
      need: 100,
      progress: 0,
    },
    workers: WORKER_DEFS.map((def) => ({
      id: def.id,
      x: WORLD.doorX,
      y: WORLD.doorY,
      tx: WORLD.doorX,
      ty: WORLD.doorY,
      morale: 72,
      hired: false,
      state: "gone", // gone | desk | moving | working | sprint | soaking | teambuild | quitWalking
      mission: null,
      sprintTimer: 0,
      soakTimer: 0,
      teambuildGrump: false,
      targetTumorId: null,
    })),
    tumors: [],
    extraDefs: {},
    empire: {
      tier: 0,
      catalog: 0,
      fame: 1,
      extraHired: 0,
      ghostStaff: 0,
      ai: {},
      upgrades: {},
      nextShipMult: 1,
      surpriseTimer: 22,
      freezeTimer: 0,
      milestoneIndex: 0,
    },
    stats: {
      founded: 0,
      hired: 0,
      slashes: 0,
      pies: 0,
      bossCodes: 0,
      footbaths: 0,
      bugsFixed: 0,
      scopesNegotiated: 0,
      milkTeas: 0,
      awards: 0,
      teambuilds: 0,
      quits: 0,
      releases: 0,
      monthsSurvived: 0,
      spaTrips: 0,
      clubTrips: 0,
      stockPlays: 0,
      stockNet: 0,
      investGained: 0,
      royalties: 0,
      aiSpend: 0,
      extrasHired: 0,
      expands: 0,
      virals: 0,
    },
    events: [],
  };
}

export function Rand(state) {
  state.seed = (Math.imul(state.seed, 1664525) + 1013904223) >>> 0;
  return state.seed / 4294967296;
}

function Pick(state, list) {
  return list[Math.floor(Rand(state) * list.length) % list.length];
}

function Clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

function Emit(state, event) {
  state.events.push(event);
}

export function DrainEvents(state) {
  const events = state.events;
  state.events = [];
  return events;
}

export function FormatMoney(value) {
  const sign = value < 0 ? "-" : "";
  const abs = Math.abs(value);
  if (abs >= 1e8) {
    const yi = abs / 1e8;
    const digits = yi >= 100 ? 0 : yi >= 10 ? 1 : 2;
    return `${sign}¥${yi.toFixed(digits)}亿`;
  }
  if (abs >= 1e4) {
    const wan = abs / 1e4;
    const digits = wan >= 100 ? 0 : 1;
    return `${sign}¥${wan.toFixed(digits)}万`;
  }
  return `${sign}¥${Math.round(abs).toLocaleString("zh-CN")}`;
}

export function FindWorkerDef(workerId, state) {
  return WORKER_DEFS.find((def) => def.id === workerId) || state?.extraDefs?.[workerId] || null;
}

function FindWorker(state, workerId) {
  return state.workers.find((worker) => worker.id === workerId) || null;
}

export function ActiveWorkers(state) {
  return state.workers.filter((worker) => worker.state !== "gone" && worker.state !== "quitWalking");
}

export function BossAway(state) {
  return state.boss.phase !== "office";
}

export function GetSpeedMultiplier(state) {
  if (state.empire.freezeTimer > 0) return 0;
  const scopeCount = state.tumors.filter((tumor) => tumor.kind === "scope").length;
  let multiplier = Math.max(0.3, Math.pow(0.85, scopeCount));
  if (state.pie.timer > 0) multiplier *= PIE_SPEED_MULT;
  if (BossAway(state)) multiplier *= SLACK_PROGRESS_MULT;
  multiplier *= ProductOf(SubscribedPlans(state), "speed");
  multiplier *= ProductOf(OwnedUpgrades(state), "speed");
  return multiplier;
}

function SubscribedPlans(state) {
  return AI_PLANS.filter((plan) => state.empire.ai[plan.id]);
}

function OwnedUpgrades(state) {
  return UPGRADES.filter((item) => state.empire.upgrades[item.id]);
}

function ProductOf(list, key) {
  return list.reduce((total, item) => total * (item[key] || 1), 1);
}

export function StaffCount(state) {
  return ActiveWorkers(state).length + state.empire.ghostStaff;
}

export function StudioOf(state) {
  return STUDIO_TIERS[state.empire.tier] || STUDIO_TIERS[0];
}

export function NextHireCost(state) {
  return Math.round(HIRE_COST * Math.pow(1.35, state.empire.extraHired));
}

export function GetAiBurn(state) {
  return SubscribedPlans(state).reduce((total, plan) => total + plan.cost, 0);
}

export function GetRoyaltyPerMonth(state) {
  const studio = StudioOf(state);
  const upgradeRoyalty = ProductOf(OwnedUpgrades(state), "royalty");
  return Math.round(state.empire.catalog * ROYALTY_RATE * studio.royaltyMult * upgradeRoyalty);
}

export function GetRoyaltyPerSecond(state) {
  return GetRoyaltyPerMonth(state) / MONTH_SECONDS;
}

export function GetShipBreakdown(state, quality) {
  const project = state.project;
  const studio = StudioOf(state);
  const base = Math.round(((40000 + project.scale * 18000) * quality) / 100) * 100;
  const catalogMult = 1 + state.stats.releases * CATALOG_PER_SHIP;
  const studioMult = studio.shipMult;
  const aiShip = ProductOf(SubscribedPlans(state), "ship");
  const upShip = ProductOf(OwnedUpgrades(state), "ship");
  const fame = state.empire.fame;
  const viral = state.empire.nextShipMult;
  const revenue = Math.max(100, Math.round((base * catalogMult * studioMult * aiShip * upShip * fame * viral) / 100) * 100);
  return { base, catalogMult, studioMult, aiShip, upShip, fame, viral, quality, revenue };
}

function FormatShipStack(breakdown) {
  return `基础 ${FormatMoney(breakdown.base)} × 目录 ${breakdown.catalogMult.toFixed(1)} × 工作室 ${breakdown.studioMult} × AI ${breakdown.aiShip.toFixed(1)} × 基建 ${breakdown.upShip.toFixed(1)} × 热度 ${breakdown.fame.toFixed(1)} × 爆款 ${breakdown.viral.toFixed(1)} = ${FormatMoney(breakdown.revenue)}`;
}

function TumorCap(state) {
  return Clamp(4 + Math.floor(StaffCount(state) / 3), 4, 12);
}

function OffsetDesk(state, desk) {
  let x = desk.x;
  let y = desk.y;
  const taken = state.workers.filter((worker) => worker.state !== "gone");
  for (let n = 0; n < 6; n += 1) {
    const clash = taken.some((worker) => Math.hypot(worker.tx - x, worker.ty - y) < 28 || Math.hypot(worker.x - x, worker.y - y) < 28);
    if (!clash) return { x, y };
    x = desk.x + (n + 1) * 36;
    y = desk.y + ((n % 2) * 18 - 9);
  }
  return { x, y };
}

function MakeExtraDef(state) {
  const n = state.empire.extraHired;
  const role = EXTRA_ROLES[(n - 1) % EXTRA_ROLES.length];
  const name = `${role.namePool[(n - 1) % role.namePool.length]}${n > 4 ? `·${n}` : ""}`;
  const id = `extra${n}`;
  const def = {
    id,
    name,
    role: role.role,
    roleLabel: role.roleLabel,
    roleGlyph: role.roleGlyph,
    color: role.color,
    desk: OffsetDesk(state, EXTRA_DESKS[(n - 1) % EXTRA_DESKS.length]),
    idleLines: EXTRA_IDLE,
    hireLine: "工位在哪？我自己找。",
    assignedLines: ["收到，编制内的命也是命。", "去了。这单我背。"],
    fixedLines: ["修好了。下一张呢。", "好了。别问加班费。"],
    footbathLines: ["值了。还能再卷一轮。"],
    quitLine: "编制是假的，离职是真的。",
  };
  state.extraDefs[id] = def;
  return def;
}

function CheckMilestones(state) {
  while (state.empire.milestoneIndex < MILESTONES.length) {
    const milestone = MILESTONES[state.empire.milestoneIndex];
    if (state.revenue < milestone.at) break;
    state.empire.milestoneIndex += 1;
    if (milestone.at >= REVENUE_GOAL) break;
    Emit(state, { kind: "toast", tone: "good", text: `${milestone.title} ${milestone.text}` });
    Emit(state, { kind: "sfx", id: "cashIn" });
  }
}

export function GetEmpireView(state) {
  const studio = StudioOf(state);
  const next = STUDIO_TIERS[state.empire.tier + 1] || null;
  const staff = StaffCount(state);
  const hireCost = NextHireCost(state);
  const canHireMore = studio.id >= 4 || staff < studio.hireCap;
  return {
    tier: studio.id,
    tierName: studio.name,
    staff,
    staffCap: studio.hireCap,
    ghostStaff: state.empire.ghostStaff,
    fame: state.empire.fame,
    catalog: state.empire.catalog,
    royaltyPerMonth: GetRoyaltyPerMonth(state),
    royaltyPerSec: GetRoyaltyPerSecond(state),
    aiBurn: GetAiBurn(state),
    nextHireCost: hireCost,
    canHire: canHireMore && state.cash >= hireCost && state.status === "playing",
    hireLocked: !canHireMore,
    nextExpand: next
      ? {
        name: next.unlock ? studio.unlock : next.name,
        cost: studio.expandCost,
        needLifetime: next.needLifetime,
        can: state.cash >= studio.expandCost && state.revenue >= next.needLifetime,
      }
      : null,
    ais: AI_PLANS.map((plan) => ({
      ...plan,
      on: Boolean(state.empire.ai[plan.id]),
      locked: studio.id < plan.needTier,
    })),
    upgrades: UPGRADES.map((item) => ({
      ...item,
      owned: Boolean(state.empire.upgrades[item.id]),
      locked: studio.id < item.needTier,
    })),
  };
}

export function HireExtra(state) {
  const guard = RequireBoss(state);
  if (guard) return { ok: false, message: guard };
  const studio = StudioOf(state);
  const staff = StaffCount(state);
  if (studio.id < 4 && staff >= studio.hireCap) {
    return { ok: false, message: `编制满了（${staff}/${studio.hireCap}）。先扩张办公室。` };
  }
  const cost = NextHireCost(state);
  if (state.cash < cost) return { ok: false, message: `现金不足 ${FormatMoney(cost)}，这人连入职体检都做不起。` };
  state.cash -= cost;
  state.empire.extraHired += 1;
  state.stats.extrasHired += 1;
  state.stats.hired += 1;
  const visible = ActiveWorkers(state).length;
  if (visible < VISIBLE_STAFF_CAP && visible < studio.hireCap) {
    const def = MakeExtraDef(state);
    state.workers.push({
      id: def.id,
      x: WORLD.doorX,
      y: WORLD.doorY,
      tx: def.desk.x,
      ty: def.desk.y,
      morale: 72,
      hired: true,
      state: "moving",
      mission: { type: "desk" },
      sprintTimer: 0,
      soakTimer: 0,
      teambuildGrump: false,
      targetTumorId: null,
    });
    Emit(state, { kind: "quote", workerId: def.id, x: WORLD.doorX, y: WORLD.doorY - 46, text: def.hireLine });
    Emit(state, { kind: "toast", tone: "good", text: `${def.roleLabel} ${def.name} 入职。预付 ${FormatMoney(cost)}。工位自己找。` });
  } else {
    state.empire.ghostStaff += 1;
    Emit(state, { kind: "toast", tone: "good", text: `远程编制 +1。人不来工位，进度照样涨。预付 ${FormatMoney(cost)}。` });
  }
  Emit(state, { kind: "sfx", id: "order" });
  return { ok: true, message: "招到人了。" };
}

export function ToggleAi(state, planId) {
  const guard = RequireBoss(state);
  if (guard) return { ok: false, message: guard };
  const plan = AI_PLANS.find((item) => item.id === planId);
  if (!plan) return { ok: false, message: "没有这个套餐。" };
  if (StudioOf(state).id < plan.needTier) {
    return { ok: false, message: `${plan.name} 要等公司再大一档。销售说这叫成长型定价。` };
  }
  if (state.empire.ai[plan.id]) {
    delete state.empire.ai[plan.id];
    Emit(state, { kind: "toast", tone: "warning", text: `已退订 ${plan.name}。牛马重新手写。` });
    return { ok: true, message: `退订 ${plan.name}` };
  }
  if (state.cash < plan.cost) return { ok: false, message: `开通 ${plan.name} 要先付一个月 ${FormatMoney(plan.cost)}。` };
  state.cash -= plan.cost;
  state.stats.aiSpend += plan.cost;
  state.empire.ai[plan.id] = true;
  if (plan.id === "cursor") {
    state.project.need = Math.max(80, Math.round(state.project.need * 0.92));
  }
  Emit(state, { kind: "toast", tone: "good", text: `开通 ${plan.name}。本月 ${FormatMoney(plan.cost)}。${plan.desc}` });
  Emit(state, { kind: "sfx", id: "cashIn" });
  return { ok: true, message: `开通 ${plan.name}` };
}

export function BuyUpgrade(state, upgradeId) {
  const guard = RequireBoss(state);
  if (guard) return { ok: false, message: guard };
  const item = UPGRADES.find((entry) => entry.id === upgradeId);
  if (!item) return { ok: false, message: "没有这项基建。" };
  if (state.empire.upgrades[item.id]) return { ok: false, message: "已经装过了，再买就是重复建设。" };
  if (StudioOf(state).id < item.needTier) return { ok: false, message: `${item.name} 要等办公室再大一点才装得下。` };
  if (state.cash < item.cost) return { ok: false, message: `现金不足 ${FormatMoney(item.cost)}。` };
  state.cash -= item.cost;
  state.empire.upgrades[item.id] = true;
  Emit(state, { kind: "toast", tone: "good", text: `购入 ${item.name}。${item.desc}` });
  Emit(state, { kind: "sfx", id: "cashIn" });
  return { ok: true, message: `购入 ${item.name}` };
}

export function ExpandStudio(state) {
  const guard = RequireBoss(state);
  if (guard) return { ok: false, message: guard };
  const studio = StudioOf(state);
  const next = STUDIO_TIERS[state.empire.tier + 1];
  if (!next) return { ok: false, message: "已经是互娱帝国。再扩就是税务局的事了。" };
  if (state.revenue < next.needLifetime) {
    return { ok: false, message: `累计流水还没到 ${FormatMoney(next.needLifetime)}，银行不批装修贷。` };
  }
  if (state.cash < studio.expandCost) {
    return { ok: false, message: `扩张要 ${FormatMoney(studio.expandCost)}。先发几款把口袋填上。` };
  }
  state.cash -= studio.expandCost;
  state.empire.tier += 1;
  state.stats.expands += 1;
  const now = StudioOf(state);
  Emit(state, { kind: "toast", tone: "good", text: `办公室升级为「${now.name}」。编制 ${now.hireCap}，发售 ×${now.shipMult}。` });
  Emit(state, { kind: "boss", text: `${now.name} 揭牌了。工位多了，福报也多了。` });
  Emit(state, { kind: "sfx", id: "win" });
  return { ok: true, message: now.name };
}

function RequireBoss(state, allowSetup = false) {
  if (state.status === "setup") {
    if (!allowSetup || !state.setup.allowOrders) return "先把公司注册完、人招齐。工位上还没人听你喊。";
  } else if (state.status !== "playing") {
    return "游戏未开始。";
  }
  if (BossAway(state)) {
    const activity = BOSS_ACTIVITIES[state.boss.activity];
    return activity ? activity.blockedLine : "老板不在工位，命令没有签发人。";
  }
  return null;
}

function BossSay(state, lineGroup) {
  Emit(state, { kind: "boss", text: Pick(state, BOSS_LINES[lineGroup]) });
}

function WorkerQuote(state, worker, lines) {
  if (!lines || !lines.length) return;
  Emit(state, { kind: "quote", workerId: worker.id, x: worker.x, y: worker.y - 46, text: Pick(state, lines) });
}

function ChangeMorale(state, worker, delta) {
  if (worker.state === "gone" || worker.state === "quitWalking") return;
  worker.morale = Clamp(worker.morale + delta, 0, 100);
  if (worker.morale > 0) return;
  const def = FindWorkerDef(worker.id, state);
  worker.state = "quitWalking";
  worker.mission = { type: "door", then: "quit" };
  worker.tx = WORLD.doorX;
  worker.ty = WORLD.doorY;
  worker.targetTumorId = null;
  state.stats.quits += 1;
  Emit(state, { kind: "quote", workerId: worker.id, x: worker.x, y: worker.y - 46, text: def.quitLine });
  Emit(state, { kind: "toast", tone: "danger", text: `${def.name} 情绪归零，已离职。工位上只剩一杯凉咖啡。` });
  Emit(state, { kind: "sfx", id: "quit" });
  if (StaffCount(state) === 0) {
    Lose(state, "最后一头牛马已离职。你对着空工位喊了一句『复工』，没有回音。");
  }
}

function Lose(state, reason) {
  if (state.status !== "playing") return;
  state.status = "lost";
  state.loseReason = reason;
  state.stats.monthsSurvived = state.month;
  Emit(state, { kind: "sfx", id: "lose" });
}

function SetDesk(state, worker) {
  const def = FindWorkerDef(worker.id, state);
  worker.mission = { type: "desk" };
  worker.state = "moving";
  worker.tx = def.desk.x;
  worker.ty = def.desk.y;
  worker.targetTumorId = null;
}

function SpawnTumor(state, forcedKind = null, bossMade = false) {
  if (state.tumors.length >= TumorCap(state)) {
    Emit(state, { kind: "toast", tone: "warning", text: "墙上贴不下了。先清掉几张工单。" });
    return null;
  }
  let kind = forcedKind;
  if (!kind && state.teachQueue.length) kind = state.teachQueue.shift();
  if (!kind) kind = Rand(state) < 0.55 ? "scope" : "bug";
  const angle = Rand(state) * Math.PI * 2;
  const radius = 105 + Rand(state) * 55;
  const tumor = {
    id: `t${state.tumorSerial++}`,
    kind,
    x: WORLD.coreX + Math.cos(angle) * radius,
    y: WORLD.coreY + Math.sin(angle) * radius * 0.72,
    hp: kind === "scope" ? 40 : bossMade ? 36 : 30,
    maxHp: kind === "scope" ? 40 : bossMade ? 36 : 30,
    label: bossMade ? "老板亲笔" : kind === "scope" ? "加塞便签" : "缺陷单",
    bossMade,
  };
  state.tumors.push(tumor);
  if (kind === "scope" && !bossMade) {
    const designer = FindWorker(state, "zhaoDagang");
    if (designer && designer.state !== "gone" && designer.state !== "quitWalking" && Rand(state) < 0.7) {
      Emit(state, { kind: "quote", workerId: designer.id, x: designer.x, y: designer.y - 46, text: "我趁你不注意又贴了一张便签！" });
    }
  }
  Emit(state, { kind: "spawn", tumorId: tumor.id, tumorKind: kind });
  Emit(state, { kind: "sfx", id: kind === "scope" ? "scope" : "bug" });
  return tumor;
}

export function StartGame(state) {
  if (state.status === "playing") return { ok: false, message: "已经在压榨中。" };
  const seed = state.seed;
  const fresh = CreateState(seed);
  Object.keys(fresh).forEach((key) => { state[key] = fresh[key]; });
  state.status = "setup";
  state.setup = { step: "register", hireIndex: 0, allowOrders: false };
  state.spawnTimer = 999;
  Emit(state, { kind: "toast", tone: "good", text: `口袋里 ¥${START_CASH.toLocaleString("zh-CN")}。先注册公司，再招四头牛马。` });
  Emit(state, { kind: "boss", text: "空房间，四张空桌子。伟大的互娱帝国，从工商局开始。" });
  Emit(state, { kind: "setup" });
  return { ok: true, message: "开业筹备" };
}

function SeatWorker(state, worker) {
  const def = FindWorkerDef(worker.id, state);
  worker.hired = true;
  worker.state = "desk";
  worker.mission = null;
  worker.x = def.desk.x;
  worker.y = def.desk.y;
  worker.tx = def.desk.x;
  worker.ty = def.desk.y;
}

export function RegisterCompany(state) {
  if (state.status !== "setup" || state.setup.step !== "register") {
    return { ok: false, message: "执照已经下来了。" };
  }
  state.companyName = Pick(state, COMPANY_NAMES);
  state.setup.step = "hire";
  state.setup.hireIndex = 0;
  state.stats.founded = 1;
  Emit(state, { kind: "boss", text: `${state.companyName} 成立了！章是我盖的，责任是你们的。` });
  Emit(state, { kind: "toast", tone: "good", text: `营业执照：${state.companyName}。下一步：把四张空桌子坐满。` });
  Emit(state, { kind: "sfx", id: "cashIn" });
  Emit(state, { kind: "setup" });
  return { ok: true, message: state.companyName };
}

export function HireNext(state) {
  if (state.status !== "setup" || state.setup.step !== "hire") {
    return { ok: false, message: "现在不是招聘会。" };
  }
  const workerId = HIRE_ORDER[state.setup.hireIndex];
  const worker = FindWorker(state, workerId);
  const def = FindWorkerDef(workerId, state);
  if (!worker || !def) return { ok: false, message: "候选人跑了。" };
  if (state.cash < HIRE_COST) return { ok: false, message: `现金不足 ¥${HIRE_COST.toLocaleString("zh-CN")}，连 offer 都打不起。` };
  state.cash -= HIRE_COST;
  state.stats.hired += 1;
  worker.hired = true;
  worker.morale = 72;
  worker.state = "moving";
  worker.mission = { type: "desk" };
  worker.x = WORLD.doorX;
  worker.y = WORLD.doorY;
  worker.tx = def.desk.x;
  worker.ty = def.desk.y;
  state.setup.hireIndex += 1;
  Emit(state, { kind: "quote", workerId: worker.id, x: worker.x, y: worker.y - 46, text: def.hireLine });
  Emit(state, { kind: "sfx", id: "order" });
  if (state.setup.hireIndex >= HIRE_ORDER.length) {
    state.setup.step = "teachSelect";
    state.setup.allowOrders = true;
    Emit(state, { kind: "boss", text: "人齐了。点一头牛马——他们巴不得被老板注意。" });
    Emit(state, { kind: "toast", tone: "good", text: "编制满员。先点人，再点事。这是你在这间屋子里唯一要学的。" });
  } else {
    Emit(state, { kind: "boss", text: `${def.roleLabel} ${def.name} 入职。预付 ¥${HIRE_COST.toLocaleString("zh-CN")}，剩下的用福报补。` });
  }
  Emit(state, { kind: "setup" });
  return { ok: true, message: `${def.name} 入职` };
}

export function MarkSetupSelect(state) {
  if (state.status !== "setup" || state.setup.step !== "teachSelect") return { ok: false };
  state.setup.step = "teachAssign";
  if (!state.tumors.some((ticket) => ticket.kind === "bug")) SpawnTumor(state, "bug");
  Emit(state, { kind: "boss", text: "选中了。红色那张是缺陷单——点它，把人扔过去修。" });
  Emit(state, { kind: "setup" });
  return { ok: true };
}

function BeginCrunch(state) {
  state.status = "playing";
  state.setup.step = "done";
  state.setup.allowOrders = true;
  state.spawnTimer = 4;
  Emit(state, { kind: "boss", text: "你会了。进度环满了就发售。底下四排：压榨、安抚、堕落、扩张。" });
  Emit(state, { kind: "toast", tone: "good", text: `${state.companyName} 正式开工。目标 ${FormatMoney(REVENUE_GOAL)}。发一款，目录就厚一寸。` });
  Emit(state, { kind: "setup" });
}

export function SkipSetup(state) {
  if (state.status === "playing") return { ok: false, message: "已经在压榨中。" };
  if (state.status !== "setup") StartGame(state);
  if (!state.companyName) state.companyName = Pick(state, COMPANY_NAMES);
  state.stats.founded = 1;
  HIRE_ORDER.forEach((id) => {
    const worker = FindWorker(state, id);
    if (!worker.hired) {
      if (state.cash >= HIRE_COST) state.cash -= HIRE_COST;
      state.stats.hired += 1;
    }
    SeatWorker(state, worker);
  });
  state.setup.hireIndex = HIRE_ORDER.length;
  BeginCrunch(state);
  return { ok: true, message: "跳过开业" };
}

export function GetSetupCard(state) {
  if (state.status !== "setup") return null;
  const step = state.setup.step;
  if (step === "register") {
    return {
      title: "注册公司",
      body: "四张空桌子，启动资金还在口袋里。先去工商局盖个章——没有执照，牛马连五险都交不上。",
      action: "register",
      actionLabel: "去工商局盖章",
      skip: true,
    };
  }
  if (step === "hire") {
    const def = FindWorkerDef(HIRE_ORDER[state.setup.hireIndex], state);
    const left = HIRE_ORDER.length - state.setup.hireIndex;
    return {
      title: `招聘${def.roleLabel} · 还差 ${left} 人`,
      body: `${def.name}（${def.roleLabel}）在门口等 offer。预付 ¥${HIRE_COST.toLocaleString("zh-CN")}。招齐四个人，这间屋子才算公司。`,
      action: "hire",
      actionLabel: `录用 ${def.name} · ¥${HIRE_COST.toLocaleString("zh-CN")}`,
      skip: true,
    };
  }
  if (step === "teachSelect") {
    return {
      title: "点一头牛马",
      body: "编制满了。用鼠标点其中一个人——选中后才会听你的。数字键 1–4 也能点名。",
      action: null,
      skip: true,
    };
  }
  if (step === "teachAssign") {
    return {
      title: "派人修缺陷单",
      body: "红色卡片是测试开的缺陷单，不是什么活物。选中人之后再点那张单，他会走过去修。点中间的游戏则是冲进度。",
      action: null,
      skip: true,
    };
  }
  if (step === "teachSlash") {
    return {
      title: "把加塞便签撕掉",
      body: "黄色便签是策划偷加的需求。不用派人——直接点它，老板亲自撕。策划会心碎，其他人偷着乐。",
      action: null,
      skip: true,
    };
  }
  return null;
}

export function AdvanceSetup(state, action) {
  if (action === "register") return RegisterCompany(state);
  if (action === "hire") return HireNext(state);
  if (action === "skip") return SkipSetup(state);
  return { ok: false, message: "没有这一步。" };
}

export function AssignWorker(state, workerId, target) {
  const guard = RequireBoss(state, true);
  if (guard) return { ok: false, message: guard };
  const worker = FindWorker(state, workerId);
  if (!worker) return { ok: false, message: "查无此牛马。" };
  if (worker.state === "gone" || worker.state === "quitWalking") return { ok: false, message: "这位已经不吃这套了，人都走了。" };
  if (worker.state === "soaking") return { ok: false, message: "人在足浴店，命令传不进按摩房。" };
  if (worker.state === "teambuild" || worker.mission?.then === "teambuild") return { ok: false, message: "人在团建 KTV，麦克风声音比你大。" };
  const def = FindWorkerDef(worker.id, state);
  if (target === "core") {
    worker.mission = { type: "core" };
    worker.state = "moving";
    worker.tx = WORLD.coreX + (worker.x < WORLD.coreX ? -70 : 70);
    worker.ty = WORLD.coreY + 60;
    worker.targetTumorId = null;
    BossSay(state, "sprint");
    Emit(state, { kind: "point", x: WORLD.coreX, y: WORLD.coreY });
    Emit(state, { kind: "sfx", id: "order" });
    return { ok: true, message: `${def.name} 冲向核心玩法。` };
  }
  const tumor = state.tumors.find((candidate) => candidate.id === target);
  if (!tumor) return { ok: false, message: "目标已经不存在，可能被谁先砍了。" };
  worker.mission = { type: "tumor", id: tumor.id };
  worker.state = "moving";
  worker.tx = tumor.x;
  worker.ty = tumor.y + 34;
  worker.targetTumorId = tumor.id;
  BossSay(state, "assign");
  WorkerQuote(state, worker, def.assignedLines);
  Emit(state, { kind: "point", x: tumor.x, y: tumor.y });
  Emit(state, { kind: "sfx", id: "order" });
  if (state.status === "setup" && state.setup.step === "teachAssign") {
    state.setup.step = "teachSlash";
    if (!state.tumors.some((ticket) => ticket.kind === "scope")) SpawnTumor(state, "scope");
    Emit(state, { kind: "boss", text: "人走了。黄色那张是加塞便签——直接点掉，不用派人。" });
    Emit(state, { kind: "setup" });
  }
  return { ok: true, message: `${def.name} 领命。` };
}

export function SlashScope(state, tumorId) {
  const guard = RequireBoss(state, true);
  if (guard) return { ok: false, message: guard };
  const index = state.tumors.findIndex((tumor) => tumor.id === tumorId);
  if (index < 0) return { ok: false, message: "已经没了，你砍了个寂寞。" };
  const tumor = state.tumors[index];
  if (tumor.kind !== "scope") {
    return { ok: false, message: "缺陷单是技术问题，老板的威严撕不动，得派牛马修。" };
  }
  state.tumors.splice(index, 1);
  state.stats.slashes += 1;
  BossSay(state, "slash");
  Emit(state, { kind: "point", x: tumor.x, y: tumor.y });
  const designer = FindWorker(state, "zhaoDagang");
  if (designer && designer.state !== "gone" && designer.state !== "quitWalking") {
    const def = FindWorkerDef(designer.id, state);
    WorkerQuote(state, designer, def.slashLines);
    ChangeMorale(state, designer, -7);
    Emit(state, { kind: "effect", x: designer.x, y: designer.y - 64, text: "策划士气 -7", color: "#ff8a94" });
  }
  state.workers.forEach((worker) => {
    if (worker.id !== "zhaoDagang") ChangeMorale(state, worker, 1);
  });
  Emit(state, { kind: "slash", x: tumor.x, y: tumor.y });
  Emit(state, { kind: "sfx", id: "slash" });
  if (state.status === "setup" && state.setup.step === "teachSlash") BeginCrunch(state);
  return { ok: true, message: "撕掉了。墙上清净了一点。" };
}

export function PaintPie(state) {
  const guard = RequireBoss(state);
  if (guard) return { ok: false, message: guard };
  if (state.pie.cooldown > 0) return { ok: false, message: "饼炉还热着，牛马的血糖也还没回落。" };
  state.pie.timer = PIE_DURATION;
  state.pie.cooldown = PIE_COOLDOWN;
  state.stats.pies += 1;
  BossSay(state, "pie");
  Emit(state, { kind: "pie" });
  Emit(state, { kind: "effect", x: WORLD.coreX, y: WORLD.coreY - 120, text: `全员提速 ×${PIE_SPEED_MULT}（${PIE_DURATION}s）`, color: "#ffd166" });
  Emit(state, { kind: "sfx", id: "pie" });
  return { ok: true, message: "大饼出炉，全员短暂相信了未来。" };
}

export function BossCode(state) {
  const guard = RequireBoss(state);
  if (guard) return { ok: false, message: guard };
  if (state.bossCodeCooldown > 0) return { ok: false, message: "老板的手速也需要冷却。" };
  if (state.hair <= 0) return { ok: false, message: "没有头发可以掉了。要么去足疗养一养，要么认命。" };
  state.bossCodeCooldown = BOSS_CODE_COOLDOWN;
  state.hair = Clamp(state.hair - BOSS_CODE_HAIR_COST, 0, 100);
  const gain = BOSS_CODE_PROGRESS + (state.empire.ai.copilot ? 6 : 0);
  state.project.progress = Math.min(state.project.need, state.project.progress + gain);
  state.stats.bossCodes += 1;
  BossSay(state, "bossCode");
  SpawnTumor(state, "bug", true);
  if (Rand(state) < 0.35) SpawnTumor(state, "bug", true);
  const roaster = Pick(state, ActiveWorkers(state));
  if (roaster) {
    Emit(state, { kind: "quote", workerId: roaster.id, x: roaster.x, y: roaster.y - 46, text: Pick(state, BOSS_CODE_ROASTS) });
  }
  Emit(state, { kind: "bossCode" });
  Emit(state, { kind: "sfx", id: "bossCode" });
  Emit(state, { kind: "toast", tone: "warning", text: `老板亲自写代码：进度 +${gain}，头发 -${BOSS_CODE_HAIR_COST}%，随赠 BUG 若干。` });
  return { ok: true, message: "代码已提交，责任已模糊。" };
}

export function Footbath(state, workerId) {
  const guard = RequireBoss(state);
  if (guard) return { ok: false, message: guard };
  const worker = FindWorker(state, workerId);
  if (!worker) return { ok: false, message: "先选中一头牛马再报销。" };
  if (worker.state === "gone" || worker.state === "quitWalking") return { ok: false, message: "人都走了，足浴留不住离职的心。" };
  if (worker.state === "soaking" || worker.mission?.then === "footbath") return { ok: false, message: "这位已经泡上了。" };
  if (worker.state === "teambuild" || worker.mission?.then === "teambuild") return { ok: false, message: "人在团建，脚已经在别处泡着了。" };
  if (state.cash < FOOTBATH_COST) return { ok: false, message: `现金不足 ¥${FOOTBATH_COST.toLocaleString("zh-CN")}，老板的关怀是要钱的。` };
  state.cash -= FOOTBATH_COST;
  state.stats.footbaths += 1;
  worker.mission = { type: "door", then: "footbath" };
  worker.state = "moving";
  worker.tx = WORLD.doorX;
  worker.ty = WORLD.doorY;
  worker.targetTumorId = null;
  BossSay(state, "footbath");
  Emit(state, { kind: "sfx", id: "cashOut" });
  const def = FindWorkerDef(worker.id, state);
  return { ok: true, message: `${def.name} 拿着报销单出门了。` };
}

// 当前这张奖状值多少士气：越发越不值钱，发多了直接伤人
export function AwardValue(state) {
  return Math.max(AWARD_MIN, AWARD_BASE_MORALE - state.awardsGiven * AWARD_DECAY);
}

export function MilkTea(state) {
  const guard = RequireBoss(state);
  if (guard) return { ok: false, message: guard };
  if (state.milkTeaCooldown > 0) return { ok: false, message: "奶茶店说骑手还在路上，别催了。" };
  if (state.cash < MILK_TEA_COST) return { ok: false, message: `现金不足 ¥${MILK_TEA_COST.toLocaleString("zh-CN")}，连奶茶都请不起了？` };
  const targets = state.workers.filter((worker) =>
    worker.state !== "gone" && worker.state !== "quitWalking" && worker.state !== "soaking" && worker.state !== "teambuild");
  if (!targets.length) return { ok: false, message: "办公室没人在，奶茶送给谁喝？" };
  state.cash -= MILK_TEA_COST;
  state.milkTeaCooldown = MILK_TEA_COOLDOWN;
  state.stats.milkTeas += 1;
  BossSay(state, "milkTea");
  targets.forEach((worker) => {
    ChangeMorale(state, worker, MILK_TEA_MORALE);
    Emit(state, { kind: "effect", x: worker.x, y: worker.y - 58, text: `+${MILK_TEA_MORALE} 🧋`, color: "#8df0b0" });
  });
  const drinker = Pick(state, targets);
  if (drinker) WorkerQuote(state, drinker, MILK_TEA_LINES);
  Emit(state, { kind: "sfx", id: "cashOut" });
  Emit(state, { kind: "toast", tone: "good", text: `奶茶到了：现金 -¥${MILK_TEA_COST.toLocaleString("zh-CN")}，全员士气 +${MILK_TEA_MORALE}。液体股权，实惠。` });
  return { ok: true, message: "奶茶已送达。" };
}

export function GiveAward(state, workerId) {
  const guard = RequireBoss(state);
  if (guard) return { ok: false, message: guard };
  const worker = FindWorker(state, workerId);
  if (!worker) return { ok: false, message: "先选中一头牛马，再颁发荣誉。" };
  if (worker.state === "gone" || worker.state === "quitWalking") return { ok: false, message: "人都走了，奖状只能寄到前东家。" };
  if (worker.state === "soaking" || worker.state === "teambuild") return { ok: false, message: "人不在工位，荣誉无处安放。" };
  if (state.awardCooldown > 0) return { ok: false, message: "打印机还在吐上一张奖状。" };
  const value = AwardValue(state);
  state.awardsGiven += 1;
  state.awardCooldown = AWARD_COOLDOWN;
  state.stats.awards += 1;
  const def = FindWorkerDef(worker.id, state);
  BossSay(state, "award");
  ChangeMorale(state, worker, value);
  Emit(state, { kind: "effect", x: worker.x, y: worker.y - 58, text: `士气 ${value >= 0 ? "+" : ""}${value} 🏆`, color: value >= 0 ? "#ffd166" : "#ff8a94" });
  Emit(state, { kind: "sfx", id: value >= 0 ? "pie" : "payday" });
  if (worker.state !== "gone" && worker.state !== "quitWalking") {
    WorkerQuote(state, worker, value > 0 ? AWARD_LINES : AWARD_JADED_LINES);
  }
  if (value <= 0) {
    Emit(state, { kind: "toast", tone: "danger", text: `第 ${state.awardsGiven} 张『优秀员工』：${def.name} 已经看穿了一切。零成本安抚宣告破产。` });
    return { ok: true, message: "奖状发多了，穿帮了。" };
  }
  Emit(state, { kind: "toast", tone: "good", text: `『优秀员工』颁给 ${def.name}：士气 +${value}。成本：一张 A4 纸。注意——每发一张，下一张就更不值钱。` });
  return { ok: true, message: "荣誉已送达。" };
}

export function TeamBuild(state) {
  const guard = RequireBoss(state);
  if (guard) return { ok: false, message: guard };
  if (state.workers.some((worker) => worker.state === "teambuild" || worker.mission?.then === "teambuild")) {
    return { ok: false, message: "上一场团建还没散场，KTV 的麦还没抢完。" };
  }
  if (state.cash < TEAMBUILD_COST) return { ok: false, message: `现金不足 ¥${TEAMBUILD_COST.toLocaleString("zh-CN")}，团建团不起。` };
  const targets = state.workers.filter((worker) =>
    worker.state !== "gone" && worker.state !== "quitWalking" && worker.state !== "soaking" && worker.mission?.then !== "footbath");
  if (!targets.length) return { ok: false, message: "一个能拉去团建的人都没有。" };
  state.cash -= TEAMBUILD_COST;
  state.stats.teambuilds += 1;
  const grump = Pick(state, targets);
  targets.forEach((worker) => {
    worker.mission = { type: "door", then: "teambuild" };
    worker.state = "moving";
    worker.tx = WORLD.doorX;
    worker.ty = WORLD.doorY;
    worker.targetTumorId = null;
    worker.sprintTimer = 0;
    worker.teambuildGrump = worker === grump;
  });
  BossSay(state, "teambuild");
  const talker = Pick(state, targets);
  if (talker) WorkerQuote(state, talker, TEAMBUILD_GO_LINES);
  Emit(state, { kind: "sfx", id: "cashOut" });
  Emit(state, { kind: "toast", tone: "warning", text: `强制团建：现金 -¥${TEAMBUILD_COST.toLocaleString("zh-CN")}，全员离岗 ${TEAMBUILD_SECONDS} 秒（进度停摆），回来大补士气。总有一个人讨厌团建。` });
  return { ok: true, message: "全员团建去了。" };
}

export function BossGoOut(state, activityId) {
  const guard = RequireBoss(state);
  if (guard) return { ok: false, message: guard };
  const activity = BOSS_ACTIVITIES[activityId];
  if (!activity) return { ok: false, message: "没有这种消遣。" };
  if (state.cash < activity.cost) {
    return { ok: false, message: `现金不足 ¥${activity.cost.toLocaleString("zh-CN")}。穷老板连堕落都堕落不起。` };
  }
  state.cash -= activity.cost;
  const boss = state.boss;
  boss.phase = "out";
  boss.activity = activityId;
  boss.tx = WORLD.doorX - 20;
  boss.ty = WORLD.doorY;
  Emit(state, { kind: "boss", text: activity.departLine });
  Emit(state, { kind: "toast", tone: "warning", text: `${activity.label}：现金 -¥${activity.cost.toLocaleString("zh-CN")}。老板离岗期间牛马会摸鱼（效率减半，士气回升）。` });
  Emit(state, { kind: "sfx", id: "cashOut" });
  return { ok: true, message: activity.label };
}

function ResolveBossActivity(state) {
  const activityId = state.boss.activity;
  if (activityId === "spa") {
    state.stats.spaTrips += 1;
    const before = state.hair;
    state.hair = Clamp(state.hair + 18, 0, 100);
    Emit(state, { kind: "toast", tone: "good", text: `技师说你的头皮很有潜力。头发 ${before}% → ${state.hair}%。` });
    Emit(state, { kind: "sfx", id: "return" });
    return;
  }
  if (activityId === "club") {
    state.stats.clubTrips += 1;
    if (Rand(state) < 0.3) {
      state.cash += CLUB_INVEST_GAIN;
      state.stats.investGained += CLUB_INVEST_GAIN;
      Emit(state, { kind: "toast", tone: "good", text: `一位穿冲锋衣的大哥听完你的元宇宙 PPT，当场投了 ¥${CLUB_INVEST_GAIN.toLocaleString("zh-CN")}。他可能喝多了。` });
      Emit(state, { kind: "sfx", id: "cashIn" });
    } else {
      Emit(state, { kind: "toast", tone: "warning", text: "四个小时，你听懂了三个词：赛道、闭环、抓手。钱花了，饼没吃着。" });
    }
    state.workers.forEach((worker) => ChangeMorale(state, worker, -4));
    Emit(state, { kind: "toast", tone: "danger", text: "牛马们刷到了你在会所的定位朋友圈。全员士气 -4。" });
    return;
  }
  if (activityId === "stock") {
    state.stats.stockPlays += 1;
    const roll = Rand(state);
    let mult;
    let tone;
    let line;
    if (roll < 0.25) {
      mult = 0; tone = "danger";
      line = "股票归零。App 弹窗：『投资者教育：您已毕业。』";
    } else if (roll < 0.55) {
      mult = 0.5; tone = "warning";
      line = "割肉离场。你安慰自己：钱没有消失，只是去了别人的账户。";
    } else if (roll < 0.85) {
      mult = 1.8; tone = "good";
      line = "小赚一笔。你已经开始构思《炒股模拟器》立项书了。";
    } else {
      mult = 3.2; tone = "good";
      line = "涨停！你激动地在全员群发了红包，共 ¥8.88。";
    }
    const gain = Math.round(STOCK_STAKE * mult);
    state.cash += gain;
    state.stats.stockNet += gain - STOCK_STAKE;
    Emit(state, { kind: "toast", tone, text: `${line}（本金 ¥${STOCK_STAKE.toLocaleString("zh-CN")} → ¥${gain.toLocaleString("zh-CN")}）` });
    Emit(state, { kind: "sfx", id: mult >= 1 ? "cashIn" : "payday" });
  }
}

export function Release(state) {
  const guard = RequireBoss(state);
  if (guard) return { ok: false, message: guard };
  const project = state.project;
  if (project.progress < project.need) {
    return { ok: false, message: `进度 ${Math.floor(project.progress)}/${project.need}，半成品发出去会被玩家做成鬼畜。` };
  }
  const bugCount = state.tumors.filter((tumor) => tumor.kind === "bug").length;
  const active = ActiveWorkers(state);
  const averageMorale = active.length
    ? active.reduce((total, worker) => total + worker.morale, 0) / active.length
    : 20;
  const aiQuality = SubscribedPlans(state).reduce((total, plan) => total + (plan.quality || 0), 0);
  const upQuality = OwnedUpgrades(state).reduce((total, item) => total + (item.quality || 0), 0);
  const quality = Clamp((1 - bugCount * 0.12) * (0.7 + averageMorale / 250) + (aiQuality + upQuality) / 100, 0.2, 1.35);
  const review = REVIEW_TIERS.find((candidate) => quality >= candidate.minQuality) || REVIEW_TIERS.at(-1);
  const breakdown = GetShipBreakdown(state, quality);
  const revenue = breakdown.revenue;
  state.cash += revenue;
  state.revenue += revenue;
  state.empire.catalog += revenue * CATALOG_PER_SHIP;
  state.empire.fame = Clamp(state.empire.fame + 0.04, 1, 20);
  state.empire.nextShipMult = 1;
  state.stats.releases += 1;
  const releasedName = project.name;
  const pool = DANMAKU_BY_STARS[review.stars];
  const danmaku = [Pick(state, pool), Pick(state, pool), Pick(state, pool)];
  Emit(state, {
    kind: "release",
    name: releasedName,
    stars: review.stars,
    review: review.line,
    revenue,
    stack: FormatShipStack(breakdown),
    bugsShipped: bugCount,
    danmaku,
  });
  Emit(state, { kind: "sfx", id: "cashIn" });
  CheckMilestones(state);
  if (state.revenue >= state.revenueGoal) {
    state.status = "won";
    state.stats.monthsSurvived = state.month;
    Emit(state, { kind: "sfx", id: "win" });
    return { ok: true, message: "百亿老板。", revenue, stars: review.stars, breakdown };
  }
  project.nameIndex = (project.nameIndex + 1) % PROJECT_NAMES.length;
  project.name = PROJECT_NAMES[project.nameIndex];
  project.scale += 1;
  const needGrow = state.empire.ai.cursor ? 38 : 45;
  project.need += needGrow;
  project.progress = 0;
  state.tumors = [];
  Emit(state, { kind: "toast", tone: "good", text: `${releasedName} 已发售：${"★".repeat(review.stars)}${"☆".repeat(5 - review.stars)}。${FormatShipStack(breakdown)}。目录 +${FormatMoney(revenue * CATALOG_PER_SHIP)}。下一款：${project.name}。` });
  return { ok: true, message: "已发售。", revenue, stars: review.stars, breakdown };
}

function RollSurprise(state) {
  const roll = Rand(state);
  const plans = SubscribedPlans(state);
  const autoFix = plans.reduce((total, plan) => total + (plan.autoFix || 0), 0);
  const hallucination = plans.reduce((total, plan) => total + (plan.hallucination || 0), 0);
  const fameChance = plans.reduce((total, plan) => total + (plan.fame || 0), 0);

  if (roll < 0.16) {
    const boom = 3 + Rand(state) * 2;
    state.empire.nextShipMult *= boom;
    state.stats.virals += 1;
    Emit(state, { kind: "toast", tone: "good", text: `热搜了。下一款发售 ×${boom.toFixed(1)}。别问是谁买的热搜。` });
    Emit(state, { kind: "sfx", id: "cashIn" });
    return;
  }
  if (roll < 0.28 && autoFix > 0) {
    const bug = state.tumors.find((tumor) => tumor.kind === "bug");
    if (bug) {
      state.tumors = state.tumors.filter((tumor) => tumor.id !== bug.id);
      state.stats.bugsFixed += 1;
      Emit(state, { kind: "fixed", x: bug.x, y: bug.y, tumorKind: "bug" });
      Emit(state, { kind: "toast", tone: "good", text: "月租 AI 自动撕掉一张缺陷单。它没要你 review。" });
      return;
    }
  }
  if (roll < 0.4 && hallucination > 0) {
    SpawnTumor(state, "bug", true);
    Emit(state, { kind: "toast", tone: "warning", text: "大模型幻觉：墙上多了一张老板亲笔缺陷单。谁也没写过这句需求。" });
    return;
  }
  if (roll < 0.5) {
    const gift = Math.round((12000 + StudioOf(state).id * 48000) * (0.7 + Rand(state) * 0.8));
    state.cash += gift;
    state.stats.investGained += gift;
    Emit(state, { kind: "toast", tone: "good", text: `投资人路过工位，随手打了 ${FormatMoney(gift)}。他说这叫看好赛道。` });
    Emit(state, { kind: "sfx", id: "cashIn" });
    return;
  }
  if (roll < 0.6) {
    state.empire.freezeTimer = 3.6 + Rand(state) * 1.4;
    Emit(state, { kind: "toast", tone: "warning", text: "版号卡住了。进度冻住几秒。策划开始写情况说明。" });
    return;
  }
  if (roll < 0.72 && state.empire.catalog > 0) {
    const spike = Math.round(GetRoyaltyPerMonth(state) * (0.35 + Rand(state) * 0.7));
    state.cash += spike;
    state.revenue += spike;
    state.stats.royalties += spike;
    Emit(state, { kind: "toast", tone: "good", text: `长尾分成到账 ${FormatMoney(spike)}。有人半夜又打开了你的旧作。` });
    CheckMilestones(state);
    return;
  }
  if (roll < 0.82) {
    state.workers.forEach((worker) => ChangeMorale(state, worker, 6));
    Emit(state, { kind: "toast", tone: "good", text: "加班餐到了。士气小补。发票回头让财务想办法。" });
    return;
  }
  if (roll < 0.9) {
    state.empire.nextShipMult *= 0.7;
    Emit(state, { kind: "toast", tone: "warning", text: "竞品抄了你的核心玩法。下一款发售打七折。律师还在电梯里。" });
    return;
  }
  if (fameChance > 0 || roll >= 0.9) {
    state.empire.fame = Clamp(state.empire.fame + 0.18, 1, 20);
    Emit(state, { kind: "toast", tone: "good", text: `热度涨到 ×${state.empire.fame.toFixed(1)}。有人在饭局上提起了你们。` });
  }
}

function TickBoss(state, dt) {
  const boss = state.boss;
  if (boss.phase === "office") return;

  if (boss.phase === "out" || boss.phase === "back") {
    const speed = 215 * dt;
    const dx = boss.tx - boss.x;
    const dy = boss.ty - boss.y;
    const distance = Math.hypot(dx, dy);
    if (distance > 6) {
      boss.x += (dx / distance) * Math.min(speed, distance);
      boss.y += (dy / distance) * Math.min(speed, distance);
      return;
    }
    boss.x = boss.tx;
    boss.y = boss.ty;
    if (boss.phase === "out") {
      boss.phase = "away";
      boss.timer = BOSS_ACTIVITIES[boss.activity].staySeconds;
      Emit(state, { kind: "toast", tone: "normal", text: "老板出门了。办公室音量瞬间上升了 300%。" });
      const slacker = Pick(state, ActiveWorkers(state));
      if (slacker) {
        Emit(state, { kind: "quote", workerId: slacker.id, x: slacker.x, y: slacker.y - 46, text: Pick(state, SLACK_LINES) });
      }
      state.slackTimer = 3;
    } else {
      boss.phase = "office";
      boss.activity = null;
      Emit(state, { kind: "boss", text: Pick(state, BOSS_LINES.back) });
      Emit(state, { kind: "bossBack" });
      Emit(state, { kind: "sfx", id: "order" });
    }
    return;
  }

  if (boss.phase === "away") {
    boss.timer -= dt;
    state.slackTimer -= dt;
    if (state.slackTimer <= 0) {
      const slacker = Pick(state, ActiveWorkers(state));
      if (slacker) {
        Emit(state, { kind: "quote", workerId: slacker.id, x: slacker.x, y: slacker.y - 46, text: Pick(state, SLACK_LINES) });
      }
      state.slackTimer = 3 + Rand(state) * 2.5;
    }
    if (boss.timer <= 0) {
      ResolveBossActivity(state);
      boss.phase = "back";
      boss.tx = BOSS_HOME.x;
      boss.ty = BOSS_HOME.y;
    }
  }
}

function TickWorker(state, worker, dt, speedMultiplier) {
  const def = FindWorkerDef(worker.id, state);
  if (!def || worker.state === "gone") return;

  if (worker.state === "soaking") {
    worker.soakTimer -= dt;
    if (worker.soakTimer <= 0) {
      ChangeMorale(state, worker, FOOTBATH_MORALE);
      worker.x = WORLD.doorX;
      worker.y = WORLD.doorY;
      SetDesk(state, worker);
      WorkerQuote(state, worker, def.footbathLines);
      Emit(state, { kind: "effect", x: worker.x - 60, y: worker.y - 40, text: `士气 +${FOOTBATH_MORALE}`, color: "#8df0b0" });
      Emit(state, { kind: "sfx", id: "return" });
    }
    return;
  }

  if (worker.state === "teambuild") {
    worker.soakTimer -= dt;
    if (worker.soakTimer <= 0) {
      const grump = worker.teambuildGrump;
      worker.teambuildGrump = false;
      const delta = grump ? TEAMBUILD_VICTIM_MORALE : TEAMBUILD_MORALE;
      ChangeMorale(state, worker, delta);
      worker.x = WORLD.doorX;
      worker.y = WORLD.doorY;
      if (worker.state !== "gone" && worker.state !== "quitWalking") {
        SetDesk(state, worker);
        WorkerQuote(state, worker, grump ? TEAMBUILD_HATE_LINES : TEAMBUILD_BACK_LINES);
      }
      Emit(state, { kind: "effect", x: worker.x - 60, y: worker.y - 40, text: `士气 ${delta >= 0 ? "+" : ""}${delta}`, color: delta >= 0 ? "#8df0b0" : "#ff8a94" });
      Emit(state, { kind: "sfx", id: "return" });
    }
    return;
  }

  if (worker.state === "moving" || worker.state === "quitWalking") {
    const speed = 170 * (0.55 + worker.morale / 220) * dt;
    const dx = worker.tx - worker.x;
    const dy = worker.ty - worker.y;
    const distance = Math.hypot(dx, dy);
    if (distance > 6) {
      worker.x += (dx / distance) * Math.min(speed, distance);
      worker.y += (dy / distance) * Math.min(speed, distance);
      return;
    }
    worker.x = worker.tx;
    worker.y = worker.ty;
    const mission = worker.mission;
    if (worker.state === "quitWalking" || mission?.then === "quit") {
      worker.state = "gone";
      worker.mission = null;
      return;
    }
    if (mission?.type === "door" && mission.then === "footbath") {
      worker.state = "soaking";
      worker.soakTimer = FOOTBATH_SOAK_SECONDS;
      worker.mission = null;
      return;
    }
    if (mission?.type === "door" && mission.then === "teambuild") {
      worker.state = "teambuild";
      worker.soakTimer = TEAMBUILD_SECONDS;
      worker.mission = null;
      return;
    }
    if (mission?.type === "tumor") {
      const tumor = state.tumors.find((candidate) => candidate.id === mission.id);
      if (!tumor) { SetDesk(state, worker); return; }
      worker.state = "working";
      return;
    }
    if (mission?.type === "core") {
      worker.state = "sprint";
      worker.sprintTimer = SPRINT_SECONDS;
      worker.mission = null;
      return;
    }
    worker.state = "desk";
    worker.mission = null;
    return;
  }

  if (worker.state === "working") {
    const tumor = state.tumors.find((candidate) => candidate.id === worker.targetTumorId);
    if (!tumor) { SetDesk(state, worker); return; }
    let dps = tumor.kind === "bug" ? 12 : 10;
    if (tumor.kind === "bug" && (def.role === "client" || def.role === "performance")) dps *= 1.6;
    if (tumor.kind === "scope" && def.role === "design") dps *= 1.8;
    if (BossAway(state)) dps *= 0.6;
    tumor.hp -= dps * dt;
    if (tumor.hp <= 0) {
      state.tumors = state.tumors.filter((candidate) => candidate.id !== tumor.id);
      if (tumor.kind === "bug") state.stats.bugsFixed += 1;
      else state.stats.scopesNegotiated += 1;
      Emit(state, { kind: "fixed", x: tumor.x, y: tumor.y, tumorKind: tumor.kind });
      Emit(state, { kind: "sfx", id: "fixed" });
      WorkerQuote(state, worker, def.fixedLines);
      ChangeMorale(state, worker, -3);
      if (worker.state !== "gone" && worker.state !== "quitWalking") SetDesk(state, worker);
    }
    return;
  }

  if (worker.state === "sprint") {
    worker.sprintTimer -= dt;
    state.project.progress = Math.min(state.project.need, state.project.progress + 2.4 * speedMultiplier * dt);
    if (worker.sprintTimer <= 0) {
      ChangeMorale(state, worker, -5);
      if (worker.state !== "gone" && worker.state !== "quitWalking") SetDesk(state, worker);
    }
    return;
  }

  if (worker.state === "desk") {
    const rate = 1.1 * (0.5 + worker.morale / 200) * speedMultiplier;
    state.project.progress = Math.min(state.project.need, state.project.progress + rate * dt);
    if (BossAway(state)) ChangeMorale(state, worker, SLACK_MORALE_REGEN * dt);
  }
}

export function Tick(state, dt) {
  if (state.status === "setup") {
    state.time += dt;
    TickBoss(state, dt);
    const speedMultiplier = GetSpeedMultiplier(state);
    state.workers.forEach((worker) => TickWorker(state, worker, dt, speedMultiplier));
    return;
  }
  if (state.status !== "playing") return;
  state.time += dt;

  if (state.pie.timer > 0) {
    state.pie.timer -= dt;
    if (state.pie.timer <= 0) {
      state.workers.forEach((worker) => ChangeMorale(state, worker, -PIE_HANGOVER_MORALE));
      Emit(state, { kind: "toast", tone: "warning", text: `饼在胃里凉了。全员士气 -${PIE_HANGOVER_MORALE}。` });
      if (state.status !== "playing") return;
    }
  }
  if (state.pie.cooldown > 0) state.pie.cooldown -= dt;
  if (state.bossCodeCooldown > 0) state.bossCodeCooldown -= dt;
  if (state.milkTeaCooldown > 0) state.milkTeaCooldown -= dt;
  if (state.awardCooldown > 0) state.awardCooldown -= dt;

  if (state.empire.freezeTimer > 0) state.empire.freezeTimer = Math.max(0, state.empire.freezeTimer - dt);

  const royaltyTick = GetRoyaltyPerSecond(state) * dt;
  if (royaltyTick > 0) {
    state.cash += royaltyTick;
    state.revenue += royaltyTick;
    state.stats.royalties += royaltyTick;
  }

  state.monthTimer += dt;
  if (state.monthTimer >= MONTH_SECONDS) {
    state.monthTimer -= MONTH_SECONDS;
    state.month += 1;
    const payroll = ActiveWorkers(state).length * WORKER_SALARY + Math.round(state.empire.ghostStaff * WORKER_SALARY * 0.7);
    const aiBurn = GetAiBurn(state);
    const royalty = GetRoyaltyPerMonth(state);
    state.cash -= payroll + aiBurn;
    state.stats.aiSpend += aiBurn;
    const mood = payroll + aiBurn > royalty ? "warning" : "good";
    Emit(state, {
      kind: "toast",
      tone: mood,
      text: `M${String(state.month).padStart(2, "0")} 发薪：工资 -${FormatMoney(payroll)}${aiBurn ? ` · AI月租 -${FormatMoney(aiBurn)}` : ""}。分成已按秒进账 ${FormatMoney(royalty)}/月。`,
    });
    Emit(state, { kind: "sfx", id: "payday" });
    const moraleHit = state.empire.upgrades.coffee ? -2 : -4;
    state.workers.forEach((worker) => ChangeMorale(state, worker, moraleHit));
    CheckMilestones(state);
    if (state.status !== "playing") return;
    if (state.cash < 0) {
      Lose(state, "现金归负。牛马们抱走了显示器抵工资，最后关灯的是电表。");
      return;
    }
    if (state.revenue >= state.revenueGoal) {
      state.status = "won";
      state.stats.monthsSurvived = state.month;
      Emit(state, { kind: "sfx", id: "win" });
      return;
    }
  }

  state.empire.surpriseTimer -= dt;
  if (state.empire.surpriseTimer <= 0) {
    RollSurprise(state);
    state.empire.surpriseTimer = 12 + Rand(state) * 10;
  }

  const passive = SubscribedPlans(state).reduce((total, plan) => total + (plan.passive || 0), 0) + state.empire.ghostStaff * 0.55;
  if (passive > 0 && state.empire.freezeTimer <= 0) {
    state.project.progress = Math.min(state.project.need, state.project.progress + passive * GetSpeedMultiplier(state) * dt);
  }

  state.spawnTimer -= dt;
  if (state.spawnTimer <= 0) {
    SpawnTumor(state);
    const interval = Clamp(8 - state.month * 0.25 - state.project.scale * 0.4, 3.2, 8);
    state.spawnTimer = interval * (0.75 + Rand(state) * 0.5);
  }

  state.ambientTimer -= dt;
  if (state.ambientTimer <= 0) {
    const candidates = ActiveWorkers(state).filter((worker) => worker.state === "desk");
    if (candidates.length && !BossAway(state)) {
      const worker = Pick(state, candidates);
      WorkerQuote(state, worker, FindWorkerDef(worker.id, state).idleLines);
    }
    state.ambientTimer = 7 + Rand(state) * 5;
  }

  TickBoss(state, dt);

  const speedMultiplier = GetSpeedMultiplier(state);
  state.workers.forEach((worker) => TickWorker(state, worker, dt, speedMultiplier));
}
