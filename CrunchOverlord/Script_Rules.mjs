// 《牛马指挥官》纯逻辑模块。禁止 window / document / Math.random()。
// 上帝视角：玩家是老板，指挥四头牛马做游戏；老板本人会出门足疗/会所/炒股，
// 人一走，牛马就摸鱼。一切随机走 Rand(state)，同种子同操作逐字节一致。

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
export const REVENUE_GOAL = 500000;
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
  back: ["都给我回工位！！", "我听见 Switch 的声音了！！", "刚才谁在点外卖？！"],
});

// 老板亲自写代码时，随机一头牛马的吐槽
export const BOSS_CODE_ROASTS = [
  "老板又提交代码了，大家系好安全带。",
  "变量名叫 aaa2，我看到它的时候它已经在生产环境了。",
  "老板的注释写着：别问，问就是能跑。",
  "刚才那次提交把周五也删了。",
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
    assignedLines: ["美术修 BUG？行吧，BUG 也要好看。", "收到，我给崩溃界面加个渐变。", "去了去了，画笔换扳手。"],
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
    assignedLines: ["策划修 BUG？我去把它改成特性。", "这个 BUG 逻辑自洽，我先给它写个背景故事。"],
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
    assignedLines: ["收到，这个 BUG 我认识，是我写的。", "去了。修不好我就重构，重构不好我就转行。"],
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
    assignedLines: ["性能问题交给我，画面问题交给命。", "收到，先关特效，再关美术的门。"],
    fixedLines: ["帧率回来了，特效没了。", "优化完成。现在它流畅地展示着没内容。"],
    footbathLines: ["泡脚水温 42 度，比我们的服务器凉快。"],
    quitLine: "我去大厂躺平了，那边加班有加班费。",
  },
];

export function CreateState(seed = 20260816) {
  return {
    seed,
    status: "title", // title | playing | won | lost
    loseReason: "",
    time: 0,
    month: 1,
    monthTimer: 0,
    cash: START_CASH,
    revenue: 0,
    revenueGoal: REVENUE_GOAL,
    hair: 100,
    pie: { timer: 0, cooldown: 0 },
    bossCodeCooldown: 0,
    spawnTimer: 3.5,
    ambientTimer: 6,
    slackTimer: 0,
    tumorSerial: 1,
    teachQueue: ["bug", "scope"], // 前两个瘤固定顺序，配合新手引导
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
      x: def.desk.x,
      y: def.desk.y,
      tx: def.desk.x,
      ty: def.desk.y,
      morale: 72,
      state: "desk", // desk | moving | working | sprint | soaking | quitWalking | gone
      mission: null,
      sprintTimer: 0,
      soakTimer: 0,
      targetTumorId: null,
    })),
    tumors: [],
    stats: {
      slashes: 0,
      pies: 0,
      bossCodes: 0,
      footbaths: 0,
      bugsFixed: 0,
      scopesNegotiated: 0,
      quits: 0,
      releases: 0,
      monthsSurvived: 0,
      spaTrips: 0,
      clubTrips: 0,
      stockPlays: 0,
      stockNet: 0,
      investGained: 0,
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

export function FindWorkerDef(workerId) {
  return WORKER_DEFS.find((def) => def.id === workerId) || null;
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
  const scopeCount = state.tumors.filter((tumor) => tumor.kind === "scope").length;
  let multiplier = Math.max(0.3, Math.pow(0.85, scopeCount));
  if (state.pie.timer > 0) multiplier *= PIE_SPEED_MULT;
  if (BossAway(state)) multiplier *= SLACK_PROGRESS_MULT;
  return multiplier;
}

function RequireBoss(state) {
  if (state.status !== "playing") return "游戏未开始。";
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
  const def = FindWorkerDef(worker.id);
  worker.state = "quitWalking";
  worker.mission = { type: "door", then: "quit" };
  worker.tx = WORLD.doorX;
  worker.ty = WORLD.doorY;
  worker.targetTumorId = null;
  state.stats.quits += 1;
  Emit(state, { kind: "quote", workerId: worker.id, x: worker.x, y: worker.y - 46, text: def.quitLine });
  Emit(state, { kind: "toast", tone: "danger", text: `${def.name} 情绪归零，已离职。工位上只剩一杯凉咖啡。` });
  Emit(state, { kind: "sfx", id: "quit" });
  if (ActiveWorkers(state).length === 0) {
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
  const def = FindWorkerDef(worker.id);
  worker.mission = { type: "desk" };
  worker.state = "moving";
  worker.tx = def.desk.x;
  worker.ty = def.desk.y;
  worker.targetTumorId = null;
}

function SpawnTumor(state, forcedKind = null, bossMade = false) {
  if (state.tumors.length >= MAX_TUMORS) {
    Emit(state, { kind: "toast", tone: "warning", text: "需求池已满，新的想法溢出到了梦里。" });
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
    label: bossMade ? "老板亲笔BUG" : kind === "scope" ? "需求++" : "BUG",
    bossMade,
  };
  state.tumors.push(tumor);
  if (kind === "scope" && !bossMade) {
    const designer = FindWorker(state, "zhaoDagang");
    if (designer && designer.state !== "gone" && designer.state !== "quitWalking" && Rand(state) < 0.7) {
      Emit(state, { kind: "quote", workerId: designer.id, x: designer.x, y: designer.y - 46, text: "我趁老板不注意加了个小需求！" });
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
  state.status = "playing";
  Emit(state, { kind: "toast", tone: "good", text: `启动资金 ¥${START_CASH.toLocaleString("zh-CN")}。目标流水 ¥${REVENUE_GOAL.toLocaleString("zh-CN")}（100 亿进度 0.005%）。` });
  Emit(state, { kind: "boss", text: "都醒醒！从今天起，这间屋子里只有一个想法：我的想法！" });
  return { ok: true, message: "开始压榨" };
}

export function AssignWorker(state, workerId, target) {
  const guard = RequireBoss(state);
  if (guard) return { ok: false, message: guard };
  const worker = FindWorker(state, workerId);
  if (!worker) return { ok: false, message: "查无此牛马。" };
  if (worker.state === "gone" || worker.state === "quitWalking") return { ok: false, message: "这位已经不吃这套了，人都走了。" };
  if (worker.state === "soaking") return { ok: false, message: "人在足浴店，命令传不进按摩房。" };
  const def = FindWorkerDef(worker.id);
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
  return { ok: true, message: `${def.name} 领命。` };
}

export function SlashScope(state, tumorId) {
  const guard = RequireBoss(state);
  if (guard) return { ok: false, message: guard };
  const index = state.tumors.findIndex((tumor) => tumor.id === tumorId);
  if (index < 0) return { ok: false, message: "已经没了，你砍了个寂寞。" };
  const tumor = state.tumors[index];
  if (tumor.kind !== "scope") {
    return { ok: false, message: "BUG 是技术问题，老板的威严砍不动，得派牛马修。" };
  }
  state.tumors.splice(index, 1);
  state.stats.slashes += 1;
  BossSay(state, "slash");
  Emit(state, { kind: "point", x: tumor.x, y: tumor.y });
  const designer = FindWorker(state, "zhaoDagang");
  if (designer && designer.state !== "gone" && designer.state !== "quitWalking") {
    const def = FindWorkerDef(designer.id);
    WorkerQuote(state, designer, def.slashLines);
    ChangeMorale(state, designer, -7);
    Emit(state, { kind: "effect", x: designer.x, y: designer.y - 64, text: "策划士气 -7", color: "#ff8a94" });
  }
  state.workers.forEach((worker) => {
    if (worker.id !== "zhaoDagang") ChangeMorale(state, worker, 1);
  });
  Emit(state, { kind: "slash", x: tumor.x, y: tumor.y });
  Emit(state, { kind: "sfx", id: "slash" });
  return { ok: true, message: "咔嚓。世界清净了一点。" };
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
  state.project.progress = Math.min(state.project.need, state.project.progress + BOSS_CODE_PROGRESS);
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
  Emit(state, { kind: "toast", tone: "warning", text: `老板亲自写代码：进度 +${BOSS_CODE_PROGRESS}，头发 -${BOSS_CODE_HAIR_COST}%，随赠 BUG 若干。` });
  return { ok: true, message: "代码已提交，责任已模糊。" };
}

export function Footbath(state, workerId) {
  const guard = RequireBoss(state);
  if (guard) return { ok: false, message: guard };
  const worker = FindWorker(state, workerId);
  if (!worker) return { ok: false, message: "先选中一头牛马再报销。" };
  if (worker.state === "gone" || worker.state === "quitWalking") return { ok: false, message: "人都走了，足浴留不住离职的心。" };
  if (worker.state === "soaking" || worker.mission?.then === "footbath") return { ok: false, message: "这位已经泡上了。" };
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
  const def = FindWorkerDef(worker.id);
  return { ok: true, message: `${def.name} 拿着报销单出门了。` };
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
  const quality = Clamp((1 - bugCount * 0.12) * (0.7 + averageMorale / 250), 0.2, 1.2);
  const tier = REVIEW_TIERS.find((candidate) => quality >= candidate.minQuality) || REVIEW_TIERS.at(-1);
  const revenue = Math.round(((30000 + project.scale * 25000) * quality) / 100) * 100;
  state.cash += revenue;
  state.revenue += revenue;
  state.stats.releases += 1;
  const releasedName = project.name;
  const pool = DANMAKU_BY_STARS[tier.stars];
  const danmaku = [Pick(state, pool), Pick(state, pool), Pick(state, pool)];
  Emit(state, {
    kind: "release",
    name: releasedName,
    stars: tier.stars,
    review: tier.line,
    revenue,
    bugsShipped: bugCount,
    danmaku,
  });
  Emit(state, { kind: "sfx", id: "cashIn" });
  if (state.revenue >= state.revenueGoal) {
    state.status = "won";
    state.stats.monthsSurvived = state.month;
    Emit(state, { kind: "sfx", id: "win" });
    return { ok: true, message: "小目标达成。", revenue, stars: tier.stars };
  }
  project.nameIndex = (project.nameIndex + 1) % PROJECT_NAMES.length;
  project.name = PROJECT_NAMES[project.nameIndex];
  project.scale += 1;
  project.need += 45;
  project.progress = 0;
  state.tumors = [];
  Emit(state, { kind: "toast", tone: "good", text: `${releasedName} 已发售：${"★".repeat(tier.stars)}${"☆".repeat(5 - tier.stars)}，进账 ¥${revenue.toLocaleString("zh-CN")}。下一款：${project.name}。` });
  return { ok: true, message: "已发售。", revenue, stars: tier.stars };
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
  const def = FindWorkerDef(worker.id);
  if (worker.state === "gone") return;

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

  state.monthTimer += dt;
  if (state.monthTimer >= MONTH_SECONDS) {
    state.monthTimer -= MONTH_SECONDS;
    state.month += 1;
    const payroll = ActiveWorkers(state).length * WORKER_SALARY;
    state.cash -= payroll;
    Emit(state, { kind: "toast", tone: payroll > 0 ? "warning" : "normal", text: `M${String(state.month).padStart(2, "0")} 发薪日：现金 -¥${payroll.toLocaleString("zh-CN")}。梦想余额同步减少。` });
    Emit(state, { kind: "sfx", id: "payday" });
    state.workers.forEach((worker) => ChangeMorale(state, worker, -4));
    if (state.status !== "playing") return;
    if (state.cash < 0) {
      Lose(state, "现金归负。牛马们抱走了显示器抵工资，最后关灯的是电表。");
      return;
    }
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
      WorkerQuote(state, worker, FindWorkerDef(worker.id).idleLines);
    }
    state.ambientTimer = 7 + Rand(state) * 5;
  }

  TickBoss(state, dt);

  const speedMultiplier = GetSpeedMultiplier(state);
  state.workers.forEach((worker) => TickWorker(state, worker, dt, speedMultiplier));
}
