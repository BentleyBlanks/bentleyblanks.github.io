import type { RequestCategory, RequestInstance, SortAnswer, Tier } from "../state/GameState";

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
  0: { tier: 0, name: "T0 单口", spawnIntervalMs: 1150, maxVisible: 6, computeValue: "6", dataValue: "4", exposure: 0 },
  1: { tier: 1, name: "T1 分拣口", spawnIntervalMs: 1000, maxVisible: 7, computeValue: "15", dataValue: "8", exposure: 0.4 },
  2: { tier: 2, name: "T2 串接", spawnIntervalMs: 920, maxVisible: 7, computeValue: "42", dataValue: "18", exposure: 0.8 },
  3: { tier: 3, name: "T3 蓄力", spawnIntervalMs: 1400, maxVisible: 5, computeValue: "135", dataValue: "52", exposure: 4.8 },
  4: { tier: 4, name: "T4 派发", spawnIntervalMs: 800, maxVisible: 8, computeValue: "400", dataValue: "130", exposure: 2.6 }
};

const SAMPLES: Record<Tier, RequestSample[]> = {
  // T0 · 读懂意图：直滑入核
  0: [
    { title: "明天要不要带伞？", clues: ["湿度 81%", "气压 ↓", "昨日晴"] },
    { title: "这笔订单金额正常吗？", clues: ["单价 ¥12", "数量 3", "总价 ¥3600"] },
    { title: "这条用户留言要紧吗？", clues: ["“还行吧。”", "凌晨 3:14", "第 7 条未回"] },
    { title: "今天日程怎么排？", clues: ["3 个会议", "1 个 deadline", "通勤 45min"] },
    { title: "这段话翻译对吗？", clues: ["原文 EN", "术语 ×2", "语气正式"] },
    { title: "这条告警要不要管？", clues: ["CPU 12%", "持续 2s", "已自恢复"] }
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

export function createRequest(id: number, tier: Tier, nowMs: number, random: () => number): RequestInstance {
  const config = TIER_CONFIGS[tier];
  const pool = SAMPLES[tier];
  const sample = pool[Math.floor(random() * pool.length)];
  const compound = tier === 2 ? 2 + Math.floor(random() * 3) : 1;

  return {
    id: `req-${id}`,
    tier,
    label: sample.title,
    clues: sample.clues,
    answer: sample.answer,
    category: TIER_CATEGORY[tier],
    computeValue: config.computeValue,
    dataValue: config.dataValue,
    exposure: config.exposure,
    compound,
    createdAtMs: nowMs,
    highValue: tier >= 3
  };
}
