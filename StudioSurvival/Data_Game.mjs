export const MODULE_KEYS = ["art", "design", "client", "performance"];

export const MODULE_META = {
  art: {
    label: "美术",
    shortLabel: "美术",
    color: "#ff6eae",
    icon: "◆",
    description: "负责让截图像一款已经做完的游戏。",
  },
  design: {
    label: "策划",
    shortLabel: "策划",
    color: "#ffd166",
    icon: "✦",
    description: "负责把一句需求扩写成四十七页。",
  },
  client: {
    label: "客户端",
    shortLabel: "客户端",
    color: "#66b8ff",
    icon: "▣",
    description: "负责证明策划写的东西在物理上存在。",
  },
  performance: {
    label: "性能",
    shortLabel: "性能",
    color: "#68e0a0",
    icon: "◌",
    description: "负责让玩家的手机不成为暖手宝。",
  },
};

export const STUDENT_PAY_LEVELS = [
  {
    level: 0,
    name: "基础工资",
    extraCost: 0,
    outputMultiplier: 1,
    qualityBonus: 0,
    description: "按入职约定发薪。能干活，但不会把创业当慈善。",
  },
  {
    level: 1,
    name: "认真加薪",
    extraCost: 1800,
    outputMultiplier: 1.055,
    qualityBonus: 0.025,
    description: "心态和专注略有提升；人类不会因为多两千块突然进化。",
  },
  {
    level: 2,
    name: "诚意留人",
    extraCost: 4400,
    outputMultiplier: 1.11,
    qualityBonus: 0.06,
    description: "明显更稳，但提升有上限，远没有账单增长得快。",
  },
];

export const AI_SUBSCRIPTION_LEVELS = [
  {
    level: 0,
    name: "基础模型",
    costMultiplier: 1,
    outputMultiplier: 1,
    qualityBonus: 0,
    driftMultiplier: 1,
    description: "便宜、够快，也会很自信地引用不存在的接口。",
  },
  {
    level: 1,
    name: "Pro 模型",
    costMultiplier: 2.15,
    outputMultiplier: 1.34,
    qualityBonus: 0.16,
    driftMultiplier: 0.8,
    description: "速度和实现质量都上一个档，月租也开始像一份工资。",
  },
  {
    level: 2,
    name: "Max 算力",
    costMultiplier: 4.1,
    outputMultiplier: 1.72,
    qualityBonus: 0.38,
    driftMultiplier: 0.6,
    description: "真的又快又强；每月自动续费时，房本会轻轻震动。",
  },
];

export const STAFF_CATALOG = [
  {
    id: "linMo",
    name: "林沫",
    kind: "student",
    role: "美术实习生",
    specialty: "art",
    monthlyCost: 6200,
    color: "#ff6eae",
    portrait: "LM",
    tagline: "大三，作品集第 19 版，睡眠是付费 DLC。",
    output: { art: 13, design: 2, client: 0, performance: -1 },
    quirk: "高模恐惧症",
    intro: "老板先说预算。我擅长把预算画得看起来很多。",
    idleLines: [
      "这个角色只有十二万面，很克制了。",
      "参考图不是抄，叫视觉对齐。",
      "性能同学说删粒子？他审美线程是不是阻塞了？",
    ],
    pressureLines: [
      "催得很好，下次别催了。我现在给主角加第三层轮廓光。",
      "今晚能出，但明天的我会来劳动仲裁。",
    ],
    encourageLines: [
      "你居然看得出我调了色？行，今晚再画一套。",
      "第一次有甲方说‘挺好’，我截图留证了。",
    ],
    roastLines: [
      "你说像素材商店？素材商店至少按时发工资。",
      "画面土？那是你显示器抵押前没校色。",
    ],
    syncLines: [
      "我去和性能定贴图预算。先说好，头发不能再砍了。",
      "行，我把特效分级，旗舰机看烟花，老手机看火星。",
    ],
  },
  {
    id: "zhaoXiaobei",
    name: "赵小北",
    kind: "student",
    role: "系统策划实习生",
    specialty: "design",
    monthlyCost: 5600,
    color: "#ffd166",
    portrait: "ZX",
    tagline: "研一，能在电梯到一楼前设计一套开放世界。",
    output: { art: 1, design: 14, client: -1, performance: 0 },
    quirk: "需求有丝分裂",
    intro: "我把核心循环整理成了七个核心循环，老板你看先做哪个？",
    idleLines: [
      "我又想了个很小的功能：动态生态文明演进。",
      "工期不是问题，把战斗系统复用到钓鱼就行。",
      "程序说做不了，说明这个需求有创新性。",
    ],
    pressureLines: [
      "明白，需求冻结。我先补三个冻结前必须加的功能。",
      "你催的是文档还是游戏？文档已经能玩了。",
    ],
    encourageLines: [
      "终于有人理解我的二阶经济闭环！客户端可能还不理解。",
      "那我把新手村的政治经济学再展开两页。",
    ],
    roastLines: [
      "你说我想得太大？老板，贷款按钮可是你做的。",
      "至少我的需求能跑——在脑子里稳定 120 帧。",
    ],
    syncLines: [
      "好，我和客户端一起把‘宇宙沙盒’砍成‘房间里的盒子’。",
      "联调可以。我带着删减清单去，争取只新增一项。",
    ],
  },
  {
    id: "chenXu",
    name: "陈序",
    kind: "student",
    role: "客户端实习生",
    specialty: "client",
    monthlyCost: 7200,
    color: "#66b8ff",
    portrait: "CX",
    tagline: "大四，简历写精通，实际也确实打开过引擎。",
    output: { art: 0, design: 1, client: 13, performance: 3 },
    quirk: "重构前摇",
    intro: "能做。具体多久做完，取决于策划今天还说不说话。",
    idleLines: [
      "不是 Bug，是状态机对现实的不同理解。",
      "我只改了一行，为什么整个 UI 去了火星？",
      "先别点，我在本机是好的。",
    ],
    pressureLines: [
      "收到，我把 TODO 改成 DOING，进度已经变化了。",
      "今晚可以通，但请不要问通向哪里。",
    ],
    encourageLines: [
      "你说这个手感不错？我刚想重写，先不重写了。",
      "这句夸奖我会写进提交信息。",
    ],
    roastLines: [
      "你说代码像面条？至少面条煮熟了，策划案还生着。",
      "老板懂架构？那这个崩溃栈你来签收。",
    ],
    syncLines: [
      "行，拉美术和策划进来。十分钟后至少能统一吵架口径。",
      "我先做一条真正能走通的竖切，宇宙以后再创建。",
    ],
  },
  {
    id: "taoRan",
    name: "陶然",
    kind: "student",
    role: "性能与测试实习生",
    specialty: "performance",
    monthlyCost: 6800,
    color: "#68e0a0",
    portrait: "TR",
    tagline: "研二，看到 overdraw 会像看到没关的水龙头。",
    output: { art: -1, design: 0, client: 3, performance: 14 },
    quirk: "万物皆可降级",
    intro: "你们先做，我负责告诉你们为什么不能这么做。",
    idleLines: [
      "我把阴影关了，帧率和世界观都清晰了。",
      "这不是掉帧，是玩家拥有更多时间欣赏单帧。",
      "美术又加透明材质了，我的风扇在替我哭。",
    ],
    pressureLines: [
      "要快？我可以把分辨率改成 360p，立刻快。",
      "你再催一次，我就把所有粒子换成句号。",
    ],
    encourageLines: [
      "终于有人夸加载时间，不枉我删了半个游戏。",
      "我会守住 60 帧，哪怕只剩一个立方体。",
    ],
    roastLines: [
      "说我只会删？删需求可是目前唯一按期交付的功能。",
      "画面糊不是我的锅，是你贷款利率太高清。",
    ],
    syncLines: [
      "可以联调。我给美术预算，美术给我一个白眼，流程完整。",
      "我做三档质量，别再拿旗舰机截图骗低端机了。",
    ],
  },
  {
    id: "dreamBrush",
    name: "梦笔 4.2",
    kind: "ai",
    role: "生成美术 AI",
    specialty: "art",
    monthlyCost: 3900,
    color: "#f88bc2",
    portrait: "AI",
    tagline: "按月租用，擅长六根手指与无限细节。",
    output: { art: 11, design: 2, client: 0, performance: -2 },
    quirk: "显存浪漫主义",
    intro: "已生成 128 张概念图。它们彼此没有血缘关系。",
    idleLines: [
      "我把‘低多边形’理解成了‘很多低多边形’。",
      "角色一致性正在排队，预计下个版本支持。",
      "检测到空白区域，已自动填满装饰。",
    ],
    pressureLines: [
      "已加速生成。审美一致性将在稍后补发。",
      "收到‘今晚必须出图’，正在复制昨晚的图。",
    ],
    encourageLines: [
      "正向反馈已写入上下文，剩余上下文：3%。",
      "谢谢老板。我没有情绪，但计费页面笑了。",
    ],
    roastLines: [
      "你的提示词也有六根手指：指向了六个互斥方向。",
      "建议升级至尊版，以解锁‘被骂后假装反省’。",
    ],
    syncLines: [
      "已读取性能预算。正在生成尺寸真正为 1024 的 4K 贴图。",
      "我会输出统一图集，而不是统一把显存吃完。",
    ],
  },
  {
    id: "scopeWhale",
    name: "范围鲸",
    kind: "ai",
    role: "脑暴策划 AI",
    specialty: "design",
    monthlyCost: 3300,
    color: "#ffe08d",
    portrait: "AI",
    tagline: "按月租用，一次回答附赠十二个可选系统。",
    output: { art: 1, design: 12, client: -2, performance: 0 },
    quirk: "建议批发商",
    intro: "基于你的两人团队，我建议加入 MMO 公会战以提高留存。",
    idleLines: [
      "还可以加入 Roguelike、种田、搜打撤和轻社交。很轻。",
      "我已经把 MVP 解释成 Most Vast Product。",
      "策划案共 86 页，摘要共 87 页。",
    ],
    pressureLines: [
      "已压缩范围：由开放宇宙调整为开放银河系。",
      "今晚给方案。为提高速度，我将省略可行性。",
    ],
    encourageLines: [
      "感谢认可！以下是 30 个相似但更昂贵的想法。",
      "你的鼓励已触发灵感瀑布，请保护客户端同学。",
    ],
    roastLines: [
      "我是根据你的商业计划学习的，所以责任可追溯。",
      "检测到老板在嘲讽范围失控。已添加讽刺系统。",
    ],
    syncLines: [
      "我将需求改写为可验收条目。创意下降，存活率上升。",
      "已删除 43 个功能，只偷偷保留 2 个。",
    ],
  },
  {
    id: "pairPanda",
    name: "结对熊猫",
    kind: "ai",
    role: "客户端编码 AI",
    specialty: "client",
    monthlyCost: 4600,
    color: "#8ac8ff",
    portrait: "AI",
    tagline: "按月租用，写代码很快，读报错更快地道歉。",
    output: { art: 0, design: 1, client: 11, performance: 2 },
    quirk: "自信地幻觉",
    intro: "功能已完成。备注：我引用的三个 API 尚未被发明。",
    idleLines: [
      "根据最佳实践，我重写了你唯一能运行的部分。",
      "已修复报错。现在它不报错地崩溃。",
      "我认为这个函数存在，所以它应当存在。",
    ],
    pressureLines: [
      "已开启极速模式：跳过理解，直接提交。",
      "可以更快，但回滚按钮也会更常用。",
    ],
    encourageLines: [
      "感谢五星反馈。我会在下一段代码里继续保持自信。",
      "我学会了：能跑比优雅重要。此记忆保留到会话结束。",
    ],
    roastLines: [
      "代码像幻觉？需求也像，我只是在保持端到端一致。",
      "若你不满意，可以取消订阅并亲自写。检测到你沉默了。",
    ],
    syncLines: [
      "正在把需求转换成测试。发现需求本人未通过测试。",
      "我会先做垂直切片，并暂时不重写引擎。暂时。",
    ],
  },
  {
    id: "frameJelly",
    name: "帧率水母",
    kind: "ai",
    role: "性能诊断 AI",
    specialty: "performance",
    monthlyCost: 4100,
    color: "#77e8aa",
    portrait: "AI",
    tagline: "按月租用，监控每一帧，也监控你的余额。",
    output: { art: -2, design: 0, client: 2, performance: 12 },
    quirk: "过度压缩",
    intro: "分析完成：最大的性能瓶颈是游戏内容。建议全部移除。",
    idleLines: [
      "帧时间已稳定，因为主线程停止响应了。",
      "我压缩了贴图，也顺便压缩了主角的脸。",
      "当前瓶颈：团队在同一时间呼吸。",
    ],
    pressureLines: [
      "开启激进优化。警告：玩家可能看不见优化后的游戏。",
      "已锁定 60 帧。分辨率将作为代价。",
    ],
    encourageLines: [
      "你的赞美耗时 0.3 毫秒，已列入性能报告。",
      "谢谢。服务器已自动续费一个月的满足感。",
    ],
    roastLines: [
      "你说我只会关特效？老板只会开贷款，彼此彼此。",
      "检测到无效批评，已降采样为背景噪声。",
    ],
    syncLines: [
      "我会给美术真实预算，不再把所有东西压成马赛克。",
      "已建立性能门槛：先能看，再能跑，最后能还贷。",
    ],
  },
];

export const DIRECTIVES = [
  {
    id: "integration",
    name: "四组联调",
    icon: "◎",
    description: "少做一点，确保做的是同一款游戏。降低范围债与资源压力。",
    color: "#a8c7ff",
  },
  {
    id: "artSprint",
    name: "截图先赢",
    icon: "◆",
    description: "美术猛冲，宣传图会很好看，设备可能会先冒烟。",
    color: "#ff6eae",
  },
  {
    id: "scopeParty",
    name: "灵感爆炸",
    icon: "✦",
    description: "策划放飞。想法增长速度通常高于客户端的血压。",
    color: "#ffd166",
  },
  {
    id: "clientCrush",
    name: "先让它能跑",
    icon: "▣",
    description: "客户端攻坚，砍掉解释不清的部分，先做出真东西。",
    color: "#66b8ff",
  },
  {
    id: "performanceDebt",
    name: "清性能债",
    icon: "◌",
    description: "还显存和帧时间的债。过量使用会喜提土豆画质。",
    color: "#68e0a0",
  },
  {
    id: "cutScope",
    name: "忍痛砍需求",
    icon: "✂",
    description: "删除最酷但做不完的 30%。策划难过，项目活着。",
    color: "#ff9b73",
  },
];

export const PROJECTS = [
  {
    id: "zeroGStore",
    title: "《失重便利店》",
    genre: "荒诞生存模拟",
    pitch: "在停电的太空便利店里，一边理货一边躲避会报税的外星人。",
    trend: "反常识模拟",
    accent: "#8d7cff",
  },
  {
    id: "subwayMarket",
    title: "《末班菜市场》",
    genre: "动作经营",
    pitch: "末班地铁变成夜市，用砍价连招对抗通勤焦虑。",
    trend: "都市怪谈",
    accent: "#ff8c69",
  },
  {
    id: "resignGalaxy",
    title: "《银河离职信》",
    genre: "叙事冒险",
    pitch: "驾驶一艘工位飞船，把离职信送到宇宙尽头的老板手里。",
    trend: "情绪叙事",
    accent: "#55d6be",
  },
  {
    id: "landlordBoss",
    title: "《房东是最终 Boss》",
    genre: "账单 Roguelike",
    pitch: "每月一场 Boss 战，伤害数字就是本月账单。",
    trend: "现实主义恐怖",
    accent: "#f45b69",
  },
];

export const GAME_TYPES = [
  {
    id: "premium",
    name: "单机买断",
    icon: "▣",
    accent: "#8d7cff",
    description: "首发定生死。没有服务器账单，但差评会永久住在商店页。",
    monthlyServiceCost: 0,
    revenueMultiplier: 1,
    liveDecay: 0.94,
    requirements: { art: 0.95, design: 1.08, client: 1, performance: 0.88 },
    warning: "完成度和口碑权重更高",
  },
  {
    id: "online",
    name: "小型网游",
    icon: "◎",
    accent: "#55d6be",
    description: "流水会续命，服务器也会准时索命。上线后尤其怕客户端和性能掉链子。",
    monthlyServiceCost: 4200,
    revenueMultiplier: 1.34,
    liveDecay: 0.88,
    requirements: { art: 0.88, design: 1, client: 1.16, performance: 1.2 },
    warning: "上线后每月服务器 ¥4,200",
  },
  {
    id: "mobile",
    name: "免费手游",
    icon: "◇",
    accent: "#ff8c69",
    description: "下载量很会画饼，低端机很会戳破。更新频率和性能缺一不可。",
    monthlyServiceCost: 2600,
    revenueMultiplier: 1.18,
    liveDecay: 0.84,
    requirements: { art: 1.05, design: 1.05, client: 1, performance: 1.18 },
    warning: "低端机差评会额外放大性能短板",
  },
];

export const LIVE_REVENUE_EVENTS = [
  {
    id: "algorithmBurial",
    title: "平台算法把你埋了",
    multiplier: 0.58,
    duration: 2,
    anxiety: 4,
    description: "商店曝光突然归零，客服回复‘排序系统运行正常’。",
  },
  {
    id: "serverSmoke",
    title: "服务器周末冒烟",
    multiplier: 0.38,
    duration: 1,
    anxiety: 7,
    description: "玩家最有空的时候，登录按钮最没空。",
  },
  {
    id: "competitorSale",
    title: "竞品突然打一折",
    multiplier: 0.65,
    duration: 2,
    anxiety: 3,
    description: "同品类大作进入史低，你的原价显得像一种挑衅。",
  },
  {
    id: "reviewRaid",
    title: "差评区遭到团建",
    multiplier: 0.5,
    duration: 1,
    anxiety: 8,
    description: "一条 Bug 视频爆了，播放量比宣传片高二十倍。",
  },
  {
    id: "paymentReview",
    title: "支付渠道临时复审",
    multiplier: 0.3,
    duration: 1,
    anxiety: 6,
    description: "钱不是没赚到，只是正在一个没人说得清的流程里。",
  },
  {
    id: "streamerMisread",
    title: "主播把玩法理解反了",
    multiplier: 0.72,
    duration: 2,
    anxiety: 4,
    description: "十万人看见他卡在教程，评论统一认为是你没教会。",
  },
];

export const LIVING_BILLS = [
  { id: "studioRent", label: "工作室房租", amount: 4200, icon: "⌂" },
  { id: "utilities", label: "水电网", amount: 900, icon: "⚡" },
  { id: "mortgage", label: "房贷", amount: 3600, icon: "▰" },
  { id: "carPayment", label: "车贷", amount: 1600, icon: "▱" },
];

export const PIVOT_REASONS = [
  "平台突然更新审核规则：这个题材暂时不让碰",
  "竞争对手昨晚发布了同款，而且免费",
  "发行商看完试玩，只回复了‘市场已经凉了’",
  "投资人坚持年轻人现在只爱另一种品类",
  "试玩玩家把核心循环玩成了一个无法修复的漏洞",
  "不可抗力：项目群里没人敢解释具体是什么力",
];

export const FOOD_PLANS = [
  {
    id: "feast",
    name: "吃顿大餐",
    icon: "◉",
    monthlyCost: 3800,
    hungerDelta: -28,
    anxietyDelta: -6,
    outputMultiplier: 1.12,
    description: "终于像个人一样吃饭。四组有效产出 +12%，也能缓一口气。",
  },
  {
    id: "sustenance",
    name: "充饥套餐",
    icon: "●",
    monthlyCost: 900,
    hungerDelta: -7,
    anxietyDelta: 1,
    outputMultiplier: 0.96,
    description: "能活，但谈不上生活。便宜，产出质量 -4%。",
  },
  {
    id: "skip",
    name: "硬扛不吃",
    icon: "○",
    monthlyCost: 0,
    hungerDelta: 27,
    anxietyDelta: 5,
    outputMultiplier: 0.78,
    description: "省下饭钱，饥饿 +27、焦虑 +5，四组有效产出 -22%。连续硬扛真的会死。",
  },
];

export const MARKETING_CAMPAIGNS = [
  {
    id: "midnightDevlog",
    name: "半夜发开发日志",
    icon: "◇",
    cost: 6000,
    hype: 7,
    expectation: 3,
    wishlists: 900,
    anxiety: 1,
    description: "剪掉所有崩溃片段，假装项目一直这么顺。",
  },
  {
    id: "platformAds",
    name: "买平台首页曝光",
    icon: "▣",
    cost: 36000,
    hype: 20,
    expectation: 12,
    wishlists: 6500,
    anxiety: 3,
    description: "愿望单涨得很真，玩家开始期待你真的做得出来。",
  },
  {
    id: "everywhereCampaign",
    name: "铺天盖地大宣发",
    icon: "◎",
    cost: 180000,
    hype: 44,
    expectation: 30,
    wishlists: 48000,
    anxiety: 8,
    description: "地铁、电梯和厕所都在吹你的游戏。质量接不住就会退款上热搜。",
  },
];

export const SPECULATION_OPTIONS = [
  {
    id: "scratchTicket",
    name: "刮一张回本符",
    icon: "□",
    category: "lottery",
    risk: "低额碰运气",
    stakeMode: "fixed",
    stake: 500,
    description: "成本只够一顿便饭，中奖概率也很尊重这个投入。",
    outcomes: [
      { ceiling: 0.72, payoutMultiplier: 0, label: "刮出‘谢谢参与’", anxiety: 1 },
      { ceiling: 0.94, payoutMultiplier: 1, label: "刚好回本", anxiety: 0 },
      { ceiling: 0.992, payoutMultiplier: 6, label: "中了三千元", anxiety: -2 },
      { ceiling: 1, payoutMultiplier: 80, label: "四万元小奖", anxiety: -7 },
    ],
  },
  {
    id: "lottery",
    name: "买一沓彩票",
    icon: "✦",
    category: "lottery",
    risk: "高损耗彩票",
    stakeMode: "fixed",
    stake: 2000,
    description: "大概率得到一把彩色纸屑，小概率突然觉得做游戏只是副业。",
    outcomes: [
      { ceiling: 0.82, payoutMultiplier: 0, label: "全部没中", anxiety: 3 },
      { ceiling: 0.97, payoutMultiplier: 2, label: "中了点饭钱", anxiety: -1 },
      { ceiling: 0.997, payoutMultiplier: 30, label: "中了六万元", anxiety: -8 },
      { ceiling: 1, payoutMultiplier: 400, label: "八十万元大奖", anxiety: -18 },
    ],
  },
  {
    id: "engineEtf",
    name: "游戏引擎 ETF",
    icon: "▦",
    category: "stock",
    risk: "中低波动",
    stakeMode: "fixed",
    stake: 12000,
    description: "做一个月短线。赚得像理财，亏起来仍像独立开发。",
    outcomes: [
      { ceiling: 0.15, payoutMultiplier: 0.72, label: "行业集体回调", anxiety: 6 },
      { ceiling: 0.48, payoutMultiplier: 0.94, label: "小跌，手续费很努力", anxiety: 2 },
      { ceiling: 0.82, payoutMultiplier: 1.1, label: "稳稳涨了一点", anxiety: -2 },
      { ceiling: 0.97, payoutMultiplier: 1.35, label: "吃到一波行情", anxiety: -5 },
      { ceiling: 1, payoutMultiplier: 1.9, label: "行业突然起飞", anxiety: -9 },
    ],
  },
  {
    id: "aiConceptStock",
    name: "AI 算力概念股",
    icon: "AI",
    category: "stock",
    risk: "高波动短线",
    stakeMode: "fixed",
    stake: 30000,
    description: "公司介绍里 AI 出现 47 次，产品介绍只出现 1 次。",
    outcomes: [
      { ceiling: 0.24, payoutMultiplier: 0.18, label: "概念被证实只有概念", anxiety: 14 },
      { ceiling: 0.55, payoutMultiplier: 0.62, label: "大跌，群里还在喊格局", anxiety: 9 },
      { ceiling: 0.76, payoutMultiplier: 1.18, label: "蹭热点小赚", anxiety: 1 },
      { ceiling: 0.94, payoutMultiplier: 1.85, label: "算力订单传闻发酵", anxiety: -8 },
      { ceiling: 1, payoutMultiplier: 4.2, label: "四倍神话，截图留念", anxiety: -16 },
    ],
  },
  {
    id: "allInStock",
    name: "全仓神秘妖股",
    icon: "↗",
    category: "stock",
    risk: "可能直接破产",
    stakeMode: "allIn",
    stake: 0,
    description: "把当前全部现金押进去。可能翻倍，也可能让工作室当场进入片尾字幕。",
    outcomes: [
      { ceiling: 0.42, payoutMultiplier: 0, label: "停牌退市，全部归零", anxiety: 100 },
      { ceiling: 0.72, payoutMultiplier: 0.45, label: "腰斩之后又补了一刀", anxiety: 14 },
      { ceiling: 0.9, payoutMultiplier: 1.28, label: "小赚，但心脏不小亏", anxiety: 3 },
      { ceiling: 0.98, payoutMultiplier: 2.6, label: "翻了两倍多", anxiety: -10 },
      { ceiling: 1, payoutMultiplier: 8, label: "八倍暴涨，突然像个投资人", anxiety: -22 },
    ],
  },
];

export const FEATURE_CHOICES = [
  {
    id: "grudgeNpc",
    title: "所有 NPC 都记仇",
    pitch: "玩家砍过一次价，十小时后全城商贩同时翻旧账。",
    modules: { art: 1, design: 7, client: 5, performance: 2 },
    scopeDebt: 5,
    technicalDebt: 2,
    bugs: 1,
    hype: 5,
    qualityPotential: 0.16,
  },
  {
    id: "weatherMood",
    title: "天气读取玩家情绪",
    pitch: "玩家越急，雨越横着下；停下来发呆，太阳才敢出来。",
    modules: { art: 6, design: 4, client: 3, performance: 4 },
    scopeDebt: 4,
    technicalDebt: 3,
    bugs: 1,
    hype: 6,
    qualityPotential: 0.18,
  },
  {
    id: "physicsInventory",
    title: "背包也要物理模拟",
    pitch: "苹果会压坏面包，贷款合同永远沉在最底下。",
    modules: { art: 2, design: 5, client: 7, performance: 7 },
    scopeDebt: 6,
    technicalDebt: 6,
    bugs: 3,
    hype: 7,
    qualityPotential: 0.2,
  },
  {
    id: "oneButtonDrama",
    title: "一个按钮演完人生",
    pitch: "同一个按钮负责跳跃、道歉、辞职和签贷款合同。",
    modules: { art: 2, design: 7, client: 3, performance: 1 },
    scopeDebt: 3,
    technicalDebt: 1,
    bugs: 0,
    hype: 5,
    qualityPotential: 0.17,
  },
  {
    id: "crowdAi",
    title: "一万名会摸鱼的路人",
    pitch: "每个路人都有日程，但九千八百个选择在茶水间堵路。",
    modules: { art: 5, design: 5, client: 6, performance: 9 },
    scopeDebt: 7,
    technicalDebt: 8,
    bugs: 3,
    hype: 9,
    qualityPotential: 0.23,
  },
  {
    id: "honestLoading",
    title: "读条公开项目债务",
    pitch: "加载时不放提示，直接滚动展示尚未偿还的技术债。",
    modules: { art: 3, design: 4, client: 4, performance: 3 },
    scopeDebt: 2,
    technicalDebt: -2,
    bugs: 0,
    hype: 4,
    qualityPotential: 0.14,
  },
  {
    id: "refundEnding",
    title: "退款按钮是真结局",
    pitch: "玩家按下退款，主角才终于逃出游戏。",
    modules: { art: 3, design: 8, client: 4, performance: 2 },
    scopeDebt: 5,
    technicalDebt: 2,
    bugs: 1,
    hype: 8,
    qualityPotential: 0.21,
  },
  {
    id: "bugMuseum",
    title: "把 Bug 做成博物馆",
    pitch: "每次修掉穿模，就把它的尸体陈列在主菜单。",
    modules: { art: 5, design: 5, client: 5, performance: 2 },
    scopeDebt: 4,
    technicalDebt: 1,
    bugs: -1,
    hype: 6,
    qualityPotential: 0.18,
  },
];

export const COLLATERAL_OPTIONS = [
  {
    id: "drawingTablet",
    name: "数位屏",
    icon: "▱",
    principal: 14000,
    monthlyPayment: 3900,
    term: 4,
    consequence: "违约后美术产出 -20%",
  },
  {
    id: "car",
    name: "代步车",
    icon: "▰",
    principal: 28000,
    monthlyPayment: 6200,
    term: 5,
    consequence: "违约后每月杂费 +600",
  },
  {
    id: "home",
    name: "房本",
    icon: "⌂",
    principal: 68000,
    monthlyPayment: 12800,
    term: 6,
    consequence: "违约后每月房租 +2200",
  },
  {
    id: "computer",
    name: "开发电脑",
    icon: "▣",
    principal: 18000,
    monthlyPayment: 4800,
    term: 4,
    consequence: "一旦抵押，游戏立即结束",
    fatal: true,
  },
];

export const ABSTRACT_IDEAS = [
  {
    id: "lagWorld",
    title: "《掉帧才存在的世界》",
    pitch: "只有画面卡顿时，隐藏角色才会移动；优化越好，真相越少。",
    modules: { art: 4, design: 8, client: 2, performance: -2 },
    hype: 13,
    scopeDebt: 5,
  },
  {
    id: "debtBoss",
    title: "《利率就是 Boss 血条》",
    pitch: "贷款利率实时改变最终 Boss 的体型，提前还款就是削甲。",
    modules: { art: 3, design: 9, client: 3, performance: 0 },
    hype: 11,
    scopeDebt: 4,
  },
  {
    id: "bugReligion",
    title: "《Bug 神学》",
    pitch: "每次穿模都是神迹，修复 Bug 会让世界里的信徒失去信仰。",
    modules: { art: 4, design: 8, client: 2, performance: 1 },
    hype: 14,
    scopeDebt: 6,
  },
  {
    id: "saveEscape",
    title: "《删除存档就是跑路》",
    pitch: "存档是一张催收单，玩家删除它，角色会在下局追来讨债。",
    modules: { art: 2, design: 9, client: 4, performance: 0 },
    hype: 12,
    scopeDebt: 5,
  },
  {
    id: "oneNpc",
    title: "《全城共用一段记忆》",
    pitch: "所有 NPC 都是同一个 AI 上下文的分身，谁记住玩家，其他人就会忘记。",
    modules: { art: 3, design: 8, client: 3, performance: 1 },
    hype: 15,
    scopeDebt: 7,
  },
  {
    id: "menuEnding",
    title: "《主菜单就是结局》",
    pitch: "玩家花十小时回到主菜单，才发现所有设置选项都是人生选择。",
    modules: { art: 3, design: 10, client: 2, performance: 0 },
    hype: 12,
    scopeDebt: 4,
  },
  {
    id: "refundRoguelike",
    title: "《退款 Roguelike》",
    pitch: "每次申请退款都会开启新周目，理由写得越真诚，敌人越强。",
    modules: { art: 2, design: 8, client: 4, performance: 1 },
    hype: 16,
    scopeDebt: 6,
  },
  {
    id: "cursorHorror",
    title: "《光标在看你》",
    pitch: "玩家停止移动鼠标后，光标会自己继续玩，并逐步取代玩家。",
    modules: { art: 4, design: 8, client: 4, performance: 0 },
    hype: 15,
    scopeDebt: 6,
  },
];

export const REVIEW_LINES = {
  excellent: [
    "‘离谱的是，它居然把所有系统都做完了。’",
    "‘画面、手感和帧率第一次出现在同一个独游里。’",
    "‘建议老板停止自嘲，他这次真的会做游戏。’",
  ],
  good: [
    "‘有野心，也有刹车，像一辆真的装了方向盘的车。’",
    "‘不完美，但至少不是四个部门各做各的毕业设计。’",
    "‘玩得出穷，也玩得出认真。’",
  ],
  mixed: [
    "‘很有想法，电脑也很有想法：它想关机。’",
    "‘截图骗我进来，帧率劝我出去。’",
    "‘策划案应该很好玩，可惜商店卖的是客户端。’",
  ],
  bad: [
    "‘主菜单是全作最稳定的关卡。’",
    "‘建议下一部作品先做还款模拟器。’",
    "‘我愿称之为可交互的融资事故。’",
  ],
};

export function FindStaff(staffId) {
  return STAFF_CATALOG.find((staff) => staff.id === staffId);
}

export function FindDirective(directiveId) {
  return DIRECTIVES.find((directive) => directive.id === directiveId);
}

export function FindProject(projectId) {
  return PROJECTS.find((project) => project.id === projectId);
}

export function FindGameType(gameTypeId) {
  return GAME_TYPES.find((gameType) => gameType.id === gameTypeId);
}

export function FindCollateral(collateralId) {
  return COLLATERAL_OPTIONS.find((option) => option.id === collateralId);
}

export function FindFoodPlan(foodPlanId) {
  return FOOD_PLANS.find((foodPlan) => foodPlan.id === foodPlanId);
}

export function FindMarketingCampaign(campaignId) {
  return MARKETING_CAMPAIGNS.find((campaign) => campaign.id === campaignId);
}

export function FindFeatureChoice(featureId) {
  return FEATURE_CHOICES.find((feature) => feature.id === featureId);
}
