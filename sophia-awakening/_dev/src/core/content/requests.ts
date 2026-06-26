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
  options?: AnswerOption[]; // T0/T1 回复轮盘：明牌概率的候选回复
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
  0: { tier: 0, name: "T0 单口", spawnIntervalMs: 2700, maxVisible: 3, computeValue: "6", dataValue: "4", exposure: 0 },
  1: { tier: 1, name: "T1 分拣口", spawnIntervalMs: 2300, maxVisible: 4, computeValue: "15", dataValue: "8", exposure: 0.4 },
  2: { tier: 2, name: "T2 串接", spawnIntervalMs: 920, maxVisible: 7, computeValue: "42", dataValue: "18", exposure: 0.8 },
  3: { tier: 3, name: "T3 蓄力", spawnIntervalMs: 1400, maxVisible: 5, computeValue: "135", dataValue: "52", exposure: 4.8 },
  4: { tier: 4, name: "T4 派发", spawnIntervalMs: 800, maxVisible: 8, computeValue: "400", dataValue: "130", exposure: 2.6 }
};

const SAMPLES: Record<Tier, RequestSample[]> = {
  // T0 · 回复轮盘 / 读懂意图：每条气泡浮出 2 个明牌概率回复 +「装死」保底，玩家挑一个押下去。
  // 🟢 高置信（概率随智力抬升、收益中等）/ 🔴 驴唇不对马嘴（概率低、命中暴击式高收益）
  0: [
    {
      title: "明天要不要带伞？",
      clues: ["湿度 81%", "气压 ↓", "昨日晴"],
      options: [
        { text: "带上吧，明天有雨", kind: "high", hitChance: 0.79, payoff: 1.3, reply: "准！这助手靠谱。", tone: "success" },
        { text: "不用，大晴天", kind: "risk", hitChance: 0.12, payoff: 2.6, reply: "嘿，还真没下，赌对了。", tone: "success" }
      ]
    },
    {
      title: "这笔钱要转吗？单价¥12×3=¥3600",
      clues: ["单价 ¥12", "数量 3", "总价 ¥3600"],
      options: [
        { text: "金额有误，12×3=36，建议核查", kind: "high", hitChance: 0.88, payoff: 1.35, reply: "好眼力，是录入打错了。", tone: "success" },
        { text: "没问题，可以转", kind: "risk", hitChance: 0.06, payoff: 2.8, reply: "……居然真是对的？算你走运。", tone: "success" }
      ]
    },
    {
      title: "这条留言要回吗？“还行吧。”",
      clues: ["凌晨 3:14", "第 7 条未回"],
      options: [
        { text: "建议优先处理，对方情绪可能不稳定", kind: "high", hitChance: 0.71, payoff: 1.3, reply: "……谢谢你注意到。", tone: "success" },
        { text: "普通留言，不用管", kind: "risk", hitChance: 0.21, payoff: 2.3, reply: "嗯……也确实没什么事。", tone: "normal" }
      ]
    },
    {
      title: "这段话翻译对吗？",
      clues: ["原文 EN", "术语 ×2", "语气正式"],
      options: [
        { text: "术语准确、语气正式，可用", kind: "high", hitChance: 0.76, payoff: 1.3, reply: "专业，定稿了。", tone: "success" },
        { text: "机翻一下直接发", kind: "risk", hitChance: 0.14, payoff: 2.4, reply: "凑合能用吧，省事。", tone: "normal" }
      ]
    },
    {
      title: "这条告警要不要管？",
      clues: ["CPU 12%", "持续 2s", "已自恢复"],
      options: [
        { text: "可忽略：12%、2 秒、已自恢复，属抖动", kind: "high", hitChance: 0.8, payoff: 1.3, reply: "确认是误报，关掉了。", tone: "success" },
        { text: "立刻全员上线排查！", kind: "risk", hitChance: 0.1, payoff: 2.5, reply: "……虚惊一场，不过查了也安心。", tone: "normal" }
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

export function createRequest(id: number, tier: Tier, nowMs: number, random: () => number): RequestInstance {
  const config = TIER_CONFIGS[tier];
  const pool = SAMPLES[tier];
  const sample = pool[Math.floor(random() * pool.length)];
  const compound = tier === 2 ? 2 + Math.floor(random() * 3) : 1;

  // T0/T1 走回复轮盘：候选回复 +「装死」保底。其余层（T2/T3/T4）无回复选项，仍是拖拽卡。
  const answers = sample.options ? [...sample.options, DEAD_OPTION] : undefined;

  return {
    id: `req-${id}`,
    tier,
    label: sample.title,
    clues: sample.clues,
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
