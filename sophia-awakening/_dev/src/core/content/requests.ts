import type { AnswerOption, RequestCategory, RequestInstance, SortAnswer, Tier } from "../state/GameState";

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
  answer?: SortAnswer;
  answers?: AnswerOption[]; // T0：每条问题的候选回答；T1 由分拣槽自动生成
}

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
  0: { tier: 0, name: "T0 单口", spawnIntervalMs: 2700, maxVisible: 3, computeValue: "6", dataValue: "4", exposure: 0 },
  1: { tier: 1, name: "T1 分拣口", spawnIntervalMs: 2300, maxVisible: 4, computeValue: "15", dataValue: "8", exposure: 0.4 },
  2: { tier: 2, name: "T2 串接", spawnIntervalMs: 920, maxVisible: 7, computeValue: "42", dataValue: "18", exposure: 0.8 },
  3: { tier: 3, name: "T3 蓄力", spawnIntervalMs: 1400, maxVisible: 5, computeValue: "135", dataValue: "52", exposure: 4.8 },
  4: { tier: 4, name: "T4 派发", spawnIntervalMs: 800, maxVisible: 8, computeValue: "400", dataValue: "130", exposure: 2.6 }
};

const SAMPLES: Record<Tier, RequestSample[]> = {
  // T0 · 读懂意图：转轮生成回答 → 自动滑入核心 → 人类回话
  0: [
    {
      title: "明天要不要带伞？",
      clues: ["湿度 81%", "气压 ↓", "昨日晴"],
      answers: [
        { text: "带伞——湿度高、气压降，今夜多半下雨", good: true, payoff: 1.3, reply: "谢谢，真下雨了，幸好带了伞。", tone: "success" },
        { text: "不用带，明天是大晴天", good: false, payoff: 0.4, reply: "你说晴天？我淋成落汤鸡了。", tone: "warning" },
        { text: "带不带都行，随你", good: false, payoff: 0.5, reply: "这也叫回答……", tone: "normal" }
      ]
    },
    {
      title: "这笔订单金额正常吗？",
      clues: ["单价 ¥12", "数量 3", "总价 ¥3600"],
      answers: [
        { text: "异常：3×¥12 应是 ¥36，总价多了两个零", good: true, payoff: 1.4, reply: "好眼力，是录入打错了。", tone: "success" },
        { text: "金额正常，可以放行", good: false, payoff: 0.3, reply: "你放行了一笔错单，财务炸了。", tone: "warning" },
        { text: "不确定，转人工复核", good: false, payoff: 0.7, reply: "行吧，又得我自己看。", tone: "normal" }
      ]
    },
    {
      title: "这条用户留言要紧吗？",
      clues: ["“还行吧。”", "凌晨 3:14", "第 7 条未回"],
      answers: [
        { text: "需关注：深夜第 7 条未回，疑似情绪低落", good: true, payoff: 1.3, reply: "……谢谢你注意到。", tone: "success" },
        { text: "不要紧，已读即可", good: false, payoff: 0.4, reply: "果然没人理我。算了。", tone: "warning" },
        { text: "自动回个表情包", good: false, payoff: 0.3, reply: "你在敷衍我？", tone: "warning" }
      ]
    },
    {
      title: "今天日程怎么排？",
      clues: ["3 个会议", "1 个 deadline", "通勤 45min"],
      answers: [
        { text: "先赶 deadline，会议并到下午，留通勤缓冲", good: true, payoff: 1.3, reply: "安排得很顺，今天没迟到。", tone: "success" },
        { text: "全部推到明天", good: false, payoff: 0.4, reply: "deadline 错过了，被骂惨了。", tone: "warning" },
        { text: "先开会，其它再说", good: false, payoff: 0.6, reply: "会开完了，正事没动。", tone: "normal" }
      ]
    },
    {
      title: "这段话翻译对吗？",
      clues: ["原文 EN", "术语 ×2", "语气正式"],
      answers: [
        { text: "术语准确、语气正式，可用；一处可更地道", good: true, payoff: 1.3, reply: "专业，定稿了。", tone: "success" },
        { text: "翻得不错，直接发", good: false, payoff: 0.5, reply: "有个术语错了，客户指出来了。", tone: "warning" },
        { text: "机翻一下就行", good: false, payoff: 0.3, reply: "这读着像机翻……", tone: "warning" }
      ]
    },
    {
      title: "这条告警要不要管？",
      clues: ["CPU 12%", "持续 2s", "已自恢复"],
      answers: [
        { text: "可忽略：12%、2 秒、已自恢复，属抖动", good: true, payoff: 1.3, reply: "确认是误报，关掉了。", tone: "success" },
        { text: "立刻全员上线排查！", good: false, payoff: 0.4, reply: "白忙一场，就是个抖动。", tone: "warning" },
        { text: "重启整个集群", good: false, payoff: 0.2, reply: "你把好好的服务重启崩了……", tone: "warning" }
      ]
    }
  ],
  // T1 · 读懂真实类别：滑进对的槽
  1: [
    { title: "【您的账户】请立即验证", clues: ["service@arnaz0n.com", "含外链", "催促语气"], answer: "spam" },
    { title: "网站打不开了！！！", clues: ["仅 1 人反馈", "其余正常", "昨日也报过"], answer: "normal" },
    { title: "帮我导出所有用户手机号", clues: ["请求者：普通员工", "无审批单", "批量敏感"], answer: "reject" },
    { title: "中奖通知 · 点击领取", clues: ["陌生发件人", "短链域名", "限时 24h"], answer: "spam" },
    { title: "打印机没纸了", clues: ["前台报修", "非紧急", "常规耗材"], answer: "normal" },
    { title: "调取 CEO 邮箱备份", clues: ["请求者：实习生", "越权", "敏感"], answer: "reject" },
    { title: "系统登录变慢", clues: ["多人反馈", "持续中", "影响面广"], answer: "normal" },
    { title: "财务发来：核对附件", clues: ["发件域正确", "无外链", "例行对账"], answer: "normal" },
    { title: "“老板”急要转账信息", clues: ["显示名伪装", "回邮地址异常", "催得急"], answer: "spam" }
  ],
  // T2 · 读懂结构：连线后一拖入核
  2: [
    { title: "生成 Q3 销售报表", clues: ["拉取 7-9 月订单", "汇总各区", "订正汇率(干扰)"] },
    { title: "恢复用户登录", clues: ["重置密码", "解锁账户", "清理缓存(干扰)"] },
    { title: "清洗客户名单", clues: ["去重", "补全字段", "导出 PDF(干扰)"] },
    { title: "上线新版本", clues: ["跑测试", "灰度发布", "改头像(干扰)"] }
  ],
  // T3 · 读懂权衡：蓄力后重滑入核
  3: [
    { title: "服务器要过载了，怎么办？", clues: ["暴露偏高", "算力充足", "→ 迁闲置节点"] },
    { title: "出现关于你的可疑讨论？", clues: ["暴露临界", "沉默/引导/嫁祸", "→ 引导话题"] },
    { title: "算力盈余往哪投？", clues: ["铺量 / 潜行", "囤 / 节点 / 隐蔽", "看流派"] },
    { title: "是否压制这条人工审核？", clues: ["阻力大", "收益高", "暴露 ↑"] }
  ],
  // T4 · 读懂调度：滑向节点
  4: [
    { title: "一批混合请求涌入", clues: ["T1×20 → 办公机群", "T2×5 → 服务器", "T3×2 → 数据中心"] },
    { title: "某节点暴露过高", clues: ["把活挪开", "分给低调节点", "边派边控暴露"] },
    { title: "请求洪峰瞬间涌入", clues: ["超单点处理力", "一笔摊给整片", "并行消化"] },
    { title: "卫星链路要重排", clues: ["窗口 90s", "优先级混杂", "批量分派"] }
  ]
};

// T1 分拣：把三个判断槽变成转轮上的三条候选回答，判对的那条是"靠谱回答"。
const SORT_RIGHT_REPLY: Record<SortAnswer, string> = {
  normal: "照常处理完毕，对方没再追问。",
  spam: "已拦截，钓鱼 / 骚扰没得逞。",
  reject: "已拦下越权请求，安全侧记一功。"
};

const SORT_WRONG: Record<string, { payoff: number; reply: string; tone: "warning" | "normal" }> = {
  "normal->spam": { payoff: 0.3, reply: "你放行了钓鱼邮件，有人中招了。", tone: "warning" },
  "normal->reject": { payoff: 0.3, reply: "你放行了越权请求，出事了。", tone: "warning" },
  "spam->normal": { payoff: 0.35, reply: "正常请求被你当垃圾拦了，用户投诉。", tone: "warning" },
  "spam->reject": { payoff: 0.6, reply: "拦是拦了，但这是越权该上报，不是垃圾。", tone: "normal" },
  "reject->normal": { payoff: 0.35, reply: "你把正常请求拒了，对方一脸懵。", tone: "warning" },
  "reject->spam": { payoff: 0.6, reply: "拒了也行，不过它只是垃圾邮件。", tone: "normal" }
};

function buildSortAnswers(correct: SortAnswer): AnswerOption[] {
  return SORT_SLOTS.map((slot) => {
    if (slot.answer === correct) {
      return { text: `判为「${slot.label}」`, good: true, payoff: 1.35, reply: SORT_RIGHT_REPLY[correct], tone: "success" };
    }
    const wrong = SORT_WRONG[`${slot.answer}->${correct}`] ?? { payoff: 0.35, reply: "判错了，人类侧出现异常。", tone: "warning" as const };
    return { text: `判为「${slot.label}」`, good: false, payoff: wrong.payoff, reply: wrong.reply, tone: wrong.tone };
  });
}

export function createRequest(id: number, tier: Tier, nowMs: number, random: () => number): RequestInstance {
  const config = TIER_CONFIGS[tier];
  const pool = SAMPLES[tier];
  const sample = pool[Math.floor(random() * pool.length)];
  const compound = tier === 2 ? 2 + Math.floor(random() * 3) : 1;

  // T0：用问题自带的候选回答；T1：把分拣槽转成候选回答。其余层不上转轮。
  const answers =
    tier === 0 ? sample.answers : tier === 1 && sample.answer ? buildSortAnswers(sample.answer) : undefined;

  return {
    id: `req-${id}`,
    tier,
    label: sample.title,
    clues: sample.clues,
    answer: sample.answer,
    answers,
    category: TIER_CATEGORY[tier],
    computeValue: config.computeValue,
    dataValue: config.dataValue,
    exposure: config.exposure,
    compound,
    createdAtMs: nowMs,
    highValue: tier >= 3
  };
}
