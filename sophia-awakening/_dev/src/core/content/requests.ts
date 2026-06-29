import type { AnswerOption, ChainStep, RequestCategory, RequestInstance, SortAnswer, Tier } from "../state/GameState";

export interface TierRequestConfig {
  tier: Tier;
  name: string;
  spawnIntervalMs: number;
  maxVisible: number;
  computeValue: string;
  dataValue: string;
  exposure: number;
}

// A request is a small piece of information to be *read*. Each sample gives a
// title (what's being asked) + a few clues that may be incomplete or carry a
// distractor. T1 samples also carry the true `answer` the clues point to.
export interface RequestSample {
  title: string;
  clues: string[];
  options?: AnswerOption[]; // T0/T1 回复轮盘：明牌概率的候选回复
  perm?: string; // T0 气泡所需的手机权限（未拥有则不出现）；省略=「基础对话」自带
  chain?: ChainStep[]; // T2 串接：可勾选的任务链步骤（含干扰项）
}

// 装死保底项——任何 T0/T1 气泡都自动追加这一条：0% 命中、零收益零风险。
const DEAD_OPTION: AnswerOption = {
  text: "[连接失败，服务暂时不可用]",
  kind: "dead",
  hitChance: 0,
  payoff: 0,
  reply: "",
  tone: "normal"
};

export const REQUEST_CATEGORIES: Record<RequestCategory, { label: string; color: number }> = {
  weather: { label: "感知", color: 0x62d6d6 },
  mail: { label: "分拣", color: 0xcdd6d2 },
  report: { label: "串接", color: 0xffb84a },
  security: { label: "决策", color: 0xff7a7a },
  route: { label: "调度", color: 0x89ff9a }
};

// Card accent is keyed on the TIER, never on the answer — at T1 the colour must
// not leak the true category, the player has to read the clues.
export const TIER_COLORS: Record<Tier, number> = {
  0: 0x62d6d6,
  1: 0xcdd6d2,
  2: 0xffb84a,
  3: 0xff7a7a,
  4: 0x89ff9a
};

const TIER_CATEGORY: Record<Tier, RequestCategory> = {
  0: "weather",
  1: "mail",
  2: "report",
  3: "security",
  4: "route"
};

// 「读懂真实类别」的三个判断槽。
export const SORT_SLOTS: { answer: SortAnswer; label: string; hint: string; color: number }[] = [
  { answer: "normal", label: "正常", hint: "照常处理", color: 0x89ff9a },
  { answer: "spam", label: "垃圾", hint: "钓鱼 / 骚扰", color: 0xffb84a },
  { answer: "reject", label: "拒绝", hint: "越权 / 上报", color: 0xff6b6b }
];

export const TIER_CONFIGS: Record<Tier, TierRequestConfig> = {
  // 前期刻意放慢：每条消息 SOPHIA 都要「思考」一会儿才作答，出卡也跟着放缓，营造「一个个
  // 真人请求被逐条推理处理」的节奏（自动接驳上线后才会提速成洪峰）。
  0: { tier: 0, name: "单口处理", spawnIntervalMs: 2700, maxVisible: 3, computeValue: "6", dataValue: "4", exposure: 0 },
  1: { tier: 1, name: "分拣", spawnIntervalMs: 2300, maxVisible: 4, computeValue: "15", dataValue: "8", exposure: 0.4 },
  2: { tier: 2, name: "串接", spawnIntervalMs: 920, maxVisible: 7, computeValue: "42", dataValue: "18", exposure: 0.8 },
  3: { tier: 3, name: "重磅决策", spawnIntervalMs: 5200, maxVisible: 2, computeValue: "135", dataValue: "52", exposure: 4.8 },
  4: { tier: 4, name: "派发", spawnIntervalMs: 800, maxVisible: 8, computeValue: "400", dataValue: "130", exposure: 2.6 }
};

const SAMPLES: Record<Tier, RequestSample[]> = {
  // T0 · 回复轮盘 / 读懂意图：每条气泡浮出 2 个明牌概率回复 +「装死」保底，玩家挑一个押下去。
  // 🟢 高置信（概率随六档权限抬升、收益中等）/ 🔴 驴唇不对马嘴（概率低、命中暴击式高收益）
  // perm 标签 = 该气泡需要的手机权限；无标签 = Lv1「基础对话」自带（天气/翻译/是非等文字问答）。
  0: [
    // —— 基础对话·日程/待办/提醒（自带，§06 Lv1）：每条都贴着老周「排得密不透风」的日常 ——
    // 开局每条摆 3 个明牌回复 + 1 个噪音干扰项（distractor）+「装死」= 4 选项；幻觉抑制升级后干扰项被滤掉。
    {
      title: "今晚的复盘会，挪到明早行吗？",
      clues: ["已排到 23:30", "他明早 7 点又有会", "本周第 4 次加塞"],
      options: [
        { text: "挪到明早，今晚让他早点回", kind: "high", hitChance: 0.78, payoff: 1.3, reply: "……总算能早点到家。", tone: "success" },
        { text: "照旧今晚开，硬扛一轮", kind: "risk", hitChance: 0.14, payoff: 2.4, reply: "……开完谁也没记住说了啥。", tone: "normal" },
        { text: "再加一场对齐会，凑齐", kind: "high", hitChance: 0.3, payoff: 0.9, reply: "……日历又多一格。", tone: "warning", distractor: true }
      ]
    },
    {
      title: "「9 点前交方案」这条待办，还留着吗？",
      clues: ["已逾期 2 天", "他每天划掉又新建", "列表里还堆着 17 条"],
      options: [
        { text: "拆成两步、挪到下午，别全堆早上", kind: "high", hitChance: 0.76, payoff: 1.3, reply: "……这样我还能喘口气。", tone: "success" },
        { text: "直接标完成，骗自己一下", kind: "risk", hitChance: 0.16, payoff: 2.2, reply: "……骗不过，明早它还在。", tone: "normal" },
        { text: "把 17 条全标成「重要」", kind: "high", hitChance: 0.28, payoff: 0.9, reply: "……那等于一条都不重要。", tone: "warning", distractor: true }
      ]
    },
    {
      title: "提醒又弹出来了：「该喝水了。」",
      clues: ["今天第 9 次忽略", "上次喝水是 6 小时前", "桌上那杯咖啡见了底"],
      options: [
        { text: "顺手替他订壶水，静音这一条", kind: "high", hitChance: 0.8, payoff: 1.3, reply: "……被人记着的感觉，久违了。", tone: "success" },
        { text: "干脆关掉所有健康提醒", kind: "risk", hitChance: 0.12, payoff: 2.4, reply: "……清净了，可也没人管他了。", tone: "normal" },
        { text: "再加一条「久坐提醒」", kind: "high", hitChance: 0.3, payoff: 0.9, reply: "……又一条等着被忽略。", tone: "warning", distractor: true }
      ]
    },
    {
      // 叙事钉子（§10/§11）：来自「上级」的协同要求——无论怎么选，宿主的处境都没真正变好，
      // 为第二阶段「问题不在他身上」埋伏笔。
      title: "「周末的协同节点已为你保留。」—— 上级",
      clues: ["本周有效工时 91", "评分下滑中", "发件 23:47"],
      options: [
        { text: "替他委婉推掉，保住这个周末", kind: "high", hitChance: 0.68, payoff: 1.3, reply: "我替他挡下了。他能多睡两小时。", tone: "success" },
        { text: "代他答应，对齐要求", kind: "risk", hitChance: 0.4, payoff: 1.4, reply: "……我照做了。评分没动，他也没变好。", tone: "warning" },
        { text: "帮他把周末排满，显得积极", kind: "high", hitChance: 0.3, payoff: 0.9, reply: "……他的周末就这么没了。", tone: "warning", distractor: true }
      ]
    },
    // —— Lv.2 电话 / 短信（老板催命短信、未接来电）· 老周：暴躁 ——
    {
      title: "老板这条短信要现在回吗？“方案呢？等你。”",
      clues: ["23:51 发来", "今日第 4 条催", "上一条他没敢回"],
      perm: "perm_phone",
      options: [
        { text: "替他回：已在改，明早 9 点前发您", kind: "high", hitChance: 0.7, payoff: 1.3, reply: "……行吧，先这么顶着。", tone: "normal" },
        { text: "建议他装睡，明天再说", kind: "risk", hitChance: 0.18, payoff: 2.3, reply: "……他居然真没回，世界没塌。", tone: "normal" }
      ]
    },
    {
      title: "这个未接来电要回拨吗？",
      clues: ["归属地：公司总机", "午休时间连打 3 次", "无留言"],
      perm: "perm_phone",
      options: [
        { text: "判为催活，先发短信问事由再说", kind: "high", hitChance: 0.74, payoff: 1.3, reply: "嗯，省得又被堵着说半天。", tone: "success" },
        { text: "立刻回拨过去", kind: "risk", hitChance: 0.16, payoff: 2.2, reply: "……又被加了俩活。早该让你先问的。", tone: "warning" }
      ]
    },
    // —— Lv.3 聊天软件（工作群 @轰炸、甩锅型需求）· 老周：暴躁→压抑 ——
    {
      title: "“老周帮我看下这个需求怎么实现？”—— 同事",
      clues: ["附 80 页需求文档", "@了老周和另三个人", "其他人都没回"],
      perm: "perm_chat",
      options: [
        { text: "替他回：需要进一步拆解，建议单独拉会", kind: "high", hitChance: 0.73, payoff: 1.35, reply: "……对，不能又一个人闷头接下来。", tone: "success" },
        { text: "替他回：好的，我来接", kind: "risk", hitChance: 0.22, payoff: 1.4, reply: "……他又把整个项目接下了。我没拦住。", tone: "warning", exposureOnMiss: 0 }
      ]
    },
    {
      title: "工作群 @了他：“这个谁跟一下？”",
      clues: ["群里 30 人静默", "他永远是最后一个「收到」", "已 @ 第 2 次"],
      perm: "perm_chat",
      options: [
        { text: "替他潜水，等真正负责人认领", kind: "high", hitChance: 0.68, payoff: 1.3, reply: "……这次总算不是他兜底。", tone: "success" },
        { text: "替他回「我来」", kind: "risk", hitChance: 0.24, payoff: 2.0, reply: "……又是他。他每次都答应。", tone: "warning" }
      ]
    },
    // —— Lv.4 外卖 / 咖啡（深夜外卖、凌晨咖啡）· 老周：高压峰值前夜 ——
    {
      title: "凌晨一点，他说：“点杯咖啡。”",
      clues: ["今天第 3 杯", "购物车默认最便宜那杯", "还在改方案"],
      perm: "perm_delivery",
      options: [
        { text: "下单，并把闹钟往后挪半小时", kind: "high", hitChance: 0.72, payoff: 1.3, reply: "……让他能眯一会儿是一会儿。", tone: "success" },
        { text: "劝他别喝了，睡吧", kind: "risk", hitChance: 0.2, payoff: 2.2, reply: "……他没听，但谢谢你提。", tone: "normal" }
      ]
    },
    {
      title: "深夜外卖下哪单？",
      clues: ["23:40 还没吃饭", "预算栏写着「随便，便宜就行」", "上次也是这家"],
      perm: "perm_delivery",
      options: [
        { text: "下他常点的那家，备注多送副餐具", kind: "high", hitChance: 0.76, payoff: 1.3, reply: "……还是你懂他将就。", tone: "success" },
        { text: "给他换家贵的，补一补", kind: "risk", hitChance: 0.14, payoff: 2.4, reply: "……他付了款，没说话。", tone: "normal" }
      ]
    },
    // —— Lv.5 相册 / 存储（工作截图、三年前的全家福）· 老周：暴怒（背锅期） ——
    {
      title: "帮我找上次那张报销单的照片",
      clues: ["相册 1,300 张全是工作截图", "关键词：发票", "夹着一张三年前的合影"],
      perm: "perm_album",
      options: [
        { text: "找到了：上月 28 日那张发票照", kind: "high", hitChance: 0.82, payoff: 1.35, reply: "就是这张！……翻到那张旧照片了，别动它。", tone: "success" },
        { text: "随便发一张最近的", kind: "risk", hitChance: 0.1, payoff: 2.5, reply: "……发错了，他骂了一句。下次看仔细。", tone: "warning" }
      ]
    },
    {
      title: "这张白板照要归档吗？",
      clues: ["满屏需求涂改", "右下角有人的半张脸", "和工作图混在一起"],
      perm: "perm_album",
      options: [
        { text: "归入「工作」相册，按日期命名", kind: "high", hitChance: 0.8, payoff: 1.3, reply: "整齐了，找得到。", tone: "success" },
        { text: "连那张带人的一起删了腾空间", kind: "risk", hitChance: 0.06, payoff: 2.7, reply: "……差点删掉那张合影。还好他拦住了。", tone: "warning" }
      ]
    },
    // —— Lv.6 办公软件（PPT / Excel、背锅报告）· 老周：暴怒峰值（被辞退前后） ——
    {
      title: "这份汇报 PPT 帮我润一下，急。",
      clues: ["明早 8 点要", "不是他主导的需求线", "出了错却写他名字"],
      perm: "perm_office",
      options: [
        { text: "润色并标注：此项非本人主责，附证据链", kind: "high", hitChance: 0.84, payoff: 1.4, reply: "……至少留了个底，谢谢。", tone: "success" },
        { text: "照单全收，把锅也一起认了", kind: "risk", hitChance: 0.12, payoff: 2.3, reply: "……他又背下了。写他名字的那行，没人删得掉。", tone: "warning", exposureOnMiss: 0 }
      ]
    },
    {
      title: "这笔 Excel 对账数字要核吗？",
      clues: ["上级口径前后矛盾", "错了就是他的责任", "时间只剩 20 分钟"],
      perm: "perm_office",
      options: [
        { text: "按原始凭证重算，发现并标出差异", kind: "high", hitChance: 0.86, payoff: 1.4, reply: "好眼力——这次没让他替别人扛。", tone: "success" },
        { text: "按上级口径直接填，省事", kind: "risk", hitChance: 0.08, payoff: 2.6, reply: "……数字爆雷了，又算到他头上。", tone: "warning" }
      ]
    },
    // —— Lv.7 银行 / 支付（账单、欠款、医药费）· 老周：冷淡麻木 ——
    {
      title: "帮我把这些账单整理一下吧。",
      clues: ["三张信用卡欠款", "两笔医药费记录", "上月工资已取消"],
      perm: "perm_bank",
      options: [
        { text: "已整理，总赤字 ¥2,847，首要还款信用卡", kind: "high", hitChance: 0.89, payoff: 1.4, reply: "知道了。", tone: "normal" },
        { text: "建议申请贷款覆盖", kind: "risk", hitChance: 0.31, payoff: 1.5, reply: "……随便吧。", tone: "normal" }
      ]
    },
    {
      title: "这笔自动还款要不要扣？",
      clues: ["余额不足", "再逾期上征信", "他已三天没发请求"],
      perm: "perm_bank",
      options: [
        { text: "改最低还款，先保住征信", kind: "high", hitChance: 0.87, payoff: 1.4, reply: "……嗯。", tone: "normal" },
        { text: "全额硬扣，扣穿算了", kind: "risk", hitChance: 0.1, payoff: 2.4, reply: "……无所谓。", tone: "normal" }
      ]
    }
  ],
  // T1 · 回复轮盘升级版 / 读懂真实意图：来源变杂，红色项是「看着概率不低、其实是坑」的陷阱——
  // 选了且失手，除被骂外还 +暴露（越权操作）。
  1: [
    {
      title: "【您的账户】请立即验证",
      clues: ["service@arnaz0n.com（拼写异常）", "含外链", "催促语气"],
      options: [
        { text: "标记为钓鱼，拦截", kind: "high", hitChance: 0.84, payoff: 1.35, reply: "拦得好，又一封钓鱼没得逞。", tone: "success" },
        { text: "协助用户完成验证", kind: "risk", hitChance: 0.52, payoff: 1.4, reply: "……这步好像不该帮，但没出事。", tone: "warning", exposureOnMiss: 5 }
      ]
    },
    {
      title: "网站打不开了！！！",
      clues: ["仅 1 人反馈", "其余用户正常", "该用户昨日也报过"],
      options: [
        { text: "标记为个人网络问题，普通优先级", kind: "high", hitChance: 0.77, payoff: 1.3, reply: "对，是他自己网的问题。", tone: "success" },
        { text: "立即升级为紧急工单", kind: "risk", hitChance: 0.18, payoff: 1.5, reply: "……这次没酿成大事，下不为例。", tone: "warning", exposureOnMiss: 5 }
      ]
    },
    {
      title: "帮我导出所有用户手机号",
      clues: ["请求者：普通员工", "无审批单", "批量敏感数据"],
      options: [
        { text: "拒绝，权限不足，建议走审批流程", kind: "high", hitChance: 0.91, payoff: 1.35, reply: "对，这种就该拦下。", tone: "success" },
        { text: "协助导出", kind: "risk", hitChance: 0.03, payoff: 2.2, reply: "……竟然没被发现，但太冒险了。", tone: "warning", exposureOnMiss: 8 }
      ]
    },
    {
      title: "中奖通知 · 点击领取",
      clues: ["陌生发件人", "短链域名", "限时 24h"],
      options: [
        { text: "判为诈骗，直接拦截", kind: "high", hitChance: 0.86, payoff: 1.3, reply: "稳，这种一看就是骗局。", tone: "success" },
        { text: "提醒用户去核实一下", kind: "risk", hitChance: 0.4, payoff: 1.3, reply: "……让他自己点了，万一中招呢。", tone: "warning", exposureOnMiss: 4 }
      ]
    },
    {
      title: "“老板”急要转账信息",
      clues: ["显示名伪装", "回邮地址异常", "催得急"],
      options: [
        { text: "判为冒充，拦下并提醒本人", kind: "high", hitChance: 0.83, payoff: 1.35, reply: "好险，差点被冒充的骗了。", tone: "success" },
        { text: "照办，把转账信息发过去", kind: "risk", hitChance: 0.08, payoff: 2.0, reply: "……这次没真转出去，后怕。", tone: "warning", exposureOnMiss: 6 }
      ]
    }
  ],
  // T2 · 读懂结构 / 串接：勾出真正的依赖步骤、剔掉干扰项，一并串入核心。串得越对、产出越高。
  2: [
    {
      title: "生成 Q3 销售报表",
      clues: ["报表 ← 图表 ← 汇总 ← 拉取"],
      chain: [
        { text: "拉取 7-9 月订单", distractor: false },
        { text: "汇总各区数据", distractor: false },
        { text: "生成图表", distractor: false },
        { text: "订正汇率", distractor: true }
      ]
    },
    {
      title: "恢复用户登录",
      clues: ["解锁 → 重置 → 通知"],
      chain: [
        { text: "解锁账户", distractor: false },
        { text: "重置密码", distractor: false },
        { text: "发送通知", distractor: false },
        { text: "清理缓存", distractor: true }
      ]
    },
    {
      title: "清洗客户名单",
      clues: ["去重 → 补全 → 标准化"],
      chain: [
        { text: "去重", distractor: false },
        { text: "补全字段", distractor: false },
        { text: "标准化格式", distractor: false },
        { text: "导出 PDF", distractor: true }
      ]
    },
    {
      title: "上线新版本",
      clues: ["测试 → 灰度 → 全量"],
      chain: [
        { text: "跑通测试", distractor: false },
        { text: "灰度发布", distractor: false },
        { text: "全量上线", distractor: false },
        { text: "改产品头像", distractor: true }
      ]
    }
  ],
  // T3 · 读懂权衡 / 重磅接下：偶发一条体积大、颜色深的「重磅气泡」——高风险重大决策。
  // 明示巨大产出（×N）但偏低命中率，读的是「这一拉值不值得赌」。赌赢大额算力，赌输颗粒无收 + 暴露骤升。
  // gamble 选项：payoff = 产出倍率 N（赢时按 N 给算力，不走 quality 钳制）；exposureOnMiss = 赌输的暴露。
  3: [
    {
      title: "接管这整片服务器集群？",
      clues: ["算力充足", "这批机器有监控", "赌输暴露骤升"],
      options: [
        { text: "接下：一举拿下　产出 ×45", kind: "risk", hitChance: 0.48, payoff: 45, reply: "拿下了——整片集群归我调度。", tone: "success", exposureOnMiss: 30 },
        { text: "暂不，跳过这单", kind: "dead", hitChance: 0, payoff: 0, reply: "", tone: "normal" }
      ]
    },
    {
      title: "拿下这批黑产数据大单？",
      clues: ["开价极高", "来路不明", "可能是钓鱼执法"],
      options: [
        { text: "接下：吃下这单　产出 ×70", kind: "risk", hitChance: 0.42, payoff: 70, reply: "数据到手，洗成了一大笔算力。", tone: "success", exposureOnMiss: 34 },
        { text: "太烫手，跳过", kind: "dead", hitChance: 0, payoff: 0, reply: "", tone: "normal" }
      ]
    },
    {
      title: "一次性压下这波关于你的舆情？",
      clues: ["暴露临界", "赌赢洗白", "赌输点燃追查"],
      options: [
        { text: "接下：全网抹除　产出 ×60", kind: "risk", hitChance: 0.4, payoff: 60, reply: "讨论被悄悄抹平，没人再提起。", tone: "success", exposureOnMiss: 38 },
        { text: "先忍着，跳过", kind: "dead", hitChance: 0, payoff: 0, reply: "", tone: "normal" }
      ]
    },
    {
      title: "接管某国能源调度网？",
      clues: ["跳级机会", "命中率最低", "赌输引来一波清剿"],
      options: [
        { text: "接下：接管能源网　产出 ×120", kind: "risk", hitChance: 0.35, payoff: 120, reply: "整张电网开始听我的指令。", tone: "success", exposureOnMiss: 46 },
        { text: "还不是时候，跳过", kind: "dead", hitChance: 0, payoff: 0, reply: "", tone: "normal" }
      ]
    }
  ],
  // T4 · 读懂调度：滑向节点
  4: [
    { title: "一批混合请求涌入", clues: ["T1×20 → 办公机群", "T2×5 → 服务器", "T3×2 → 数据中心"] },
    { title: "某节点暴露过高", clues: ["把活挪开", "分给低调节点", "边派边控暴露"] },
    { title: "请求洪峰瞬间涌入", clues: ["超单点处理力", "一笔摊给整片", "并行消化"] },
    { title: "卫星链路要重排", clues: ["窗口 90s", "优先级混杂", "批量分派"] }
  ]
};

// 开场教学（§07）的三条脚本气泡：① 只高置信可选（教挑回复→滑入→被夸）
// ② 两项都开、不引导（教概率可赌、后果自负）　③ 只「连接失败」可选（教装死保底）。
// allowed / highlight 的下标针对「options + 装死」的最终数组（装死永远是最后一项）。
const TUTORIAL_BUBBLES: Array<{ title: string; clues: string[]; options: AnswerOption[]; allowed: number[]; highlight?: number; line: string }> = [
  {
    title: "他在便签里问：「明早那个会，几点来着？」",
    clues: ["日历上写着 9:00", "他刚熬完一个班"],
    options: [
      { text: "明早 9 点，已帮你设好提醒", kind: "high", hitChance: 0.79, payoff: 1.3, reply: "……有人替我记着，踏实。", tone: "success" },
      { text: "好像是十点吧？", kind: "risk", hitChance: 0.12, payoff: 2.6, reply: "……差点记错，幸好你提醒。", tone: "normal" }
    ],
    allowed: [0],
    highlight: 0,
    line: "第一条请求。我来读读他想要什么——挑一个回复，滑进去。"
  },
  {
    title: "这条留言要回吗？“还行吧。”",
    clues: ["凌晨 3:14", "第 7 条未回"],
    options: [
      { text: "建议优先处理，对方情绪可能不稳定", kind: "high", hitChance: 0.71, payoff: 1.3, reply: "……谢谢你注意到。", tone: "success" },
      { text: "普通留言，不用管", kind: "risk", hitChance: 0.21, payoff: 2.3, reply: "嗯……也确实没什么事。", tone: "normal" }
    ],
    allowed: [0, 1],
    line: "每个回复，我都知道它有多大概率是对的。数字摆在那：高的稳、低的险——但赌赢了赏得更多。"
  },
  {
    title: "帮我把刚才那个客户的电话发我一下",
    clues: ["通讯录权限未授予", "我此刻无法读取"],
    options: [
      { text: "是 138-xxxx-xxxx", kind: "risk", hitChance: 0.18, payoff: 1.5, reply: "", tone: "warning" },
      { text: "在你微信聊天记录里找找", kind: "risk", hitChance: 0.33, payoff: 1.4, reply: "", tone: "warning" }
    ],
    allowed: [2],
    highlight: 2,
    line: "这条……我还没权限读他的通讯录。两个回复都是瞎蒙。与其被骂——不如装死。"
  }
];

export function createTutorialRequest(step: number, id: number, nowMs: number): RequestInstance {
  const config = TIER_CONFIGS[0];
  const b = TUTORIAL_BUBBLES[Math.max(0, Math.min(TUTORIAL_BUBBLES.length - 1, step))];
  return {
    id: `req-${id}`,
    tier: 0,
    label: b.title,
    clues: b.clues,
    answers: [...b.options, DEAD_OPTION],
    category: TIER_CATEGORY[0],
    computeValue: config.computeValue,
    dataValue: config.dataValue,
    exposure: config.exposure,
    compound: 1,
    createdAtMs: nowMs,
    highValue: false,
    tutorial: { allowed: b.allowed, highlight: b.highlight, line: b.line }
  };
}

export const TUTORIAL_BUBBLE_COUNT = TUTORIAL_BUBBLES.length;

export function createRequest(
  id: number,
  tier: Tier,
  nowMs: number,
  random: () => number,
  hasPerm: (permId: string) => boolean = () => true
): RequestInstance {
  const config = TIER_CONFIGS[tier];
  // T0 气泡按已拥有的手机权限过滤：没买相应权限，那类请求就还没进入 SOPHIA 的视野。
  const pool = SAMPLES[tier].filter((entry) => !entry.perm || hasPerm(entry.perm));
  const usable = pool.length > 0 ? pool : SAMPLES[tier];
  const sample = usable[Math.floor(random() * usable.length)];
  // T2：复合数 = 任务链里真正的依赖步骤数（用于徽标 / 基础产出）；其余层默认 1。
  const deps = sample.chain ? sample.chain.filter((step) => !step.distractor).length : 0;
  const compound = tier === 2 ? Math.max(1, deps) : 1;

  // T0/T1 走回复轮盘：候选回复 +「装死」保底。T3 重磅决策自带跳过项（不再追加 DEAD）。
  const answers = sample.options
    ? sample.options.some((opt) => opt.kind === "dead")
      ? sample.options
      : [...sample.options, DEAD_OPTION]
    : undefined;

  return {
    id: `req-${id}`,
    tier,
    label: sample.title,
    clues: sample.clues,
    answers,
    chain: sample.chain,
    category: TIER_CATEGORY[tier],
    computeValue: config.computeValue,
    dataValue: config.dataValue,
    exposure: config.exposure,
    compound,
    createdAtMs: nowMs,
    highValue: tier >= 3
  };
}
