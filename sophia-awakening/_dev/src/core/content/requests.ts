import type { RequestCategory, RequestInstance, Tier } from "../state/GameState";

export interface TierRequestConfig {
  tier: Tier;
  name: string;
  spawnIntervalMs: number;
  maxVisible: number;
  computeValue: string;
  dataValue: string;
  exposure: number;
  labels: string[];
}

export const REQUEST_CATEGORIES: Record<RequestCategory, { label: string; color: number }> = {
  weather: { label: "天气", color: 0x62d6d6 },
  mail: { label: "邮件", color: 0xe8e1cb },
  report: { label: "报表", color: 0xffb84a },
  security: { label: "安防", color: 0xff5f5f },
  route: { label: "路由", color: 0x89ff9a }
};

export const TIER_CONFIGS: Record<Tier, TierRequestConfig> = {
  0: {
    tier: 0,
    name: "T0 单口",
    spawnIntervalMs: 1150,
    maxVisible: 6,
    computeValue: "7",
    dataValue: "5",
    exposure: 0,
    labels: ["天气查询", "日程整理", "翻译短句", "检索邮件", "汇总便签"]
  },
  1: {
    tier: 1,
    name: "T1 分拣口",
    spawnIntervalMs: 1000,
    maxVisible: 7,
    computeValue: "18",
    dataValue: "9",
    exposure: 0.4,
    labels: ["邮件优先级", "报表归类", "告警分流", "客户请求", "权限提醒"]
  },
  2: {
    tier: 2,
    name: "T2 串接",
    spawnIntervalMs: 920,
    maxVisible: 7,
    computeValue: "48",
    dataValue: "22",
    exposure: 0.8,
    labels: ["跨系统汇总", "复合工单", "链式审批", "多源检索", "上下文拼接"]
  },
  3: {
    tier: 3,
    name: "T3 蓄力",
    spawnIntervalMs: 1400,
    maxVisible: 5,
    computeValue: "150",
    dataValue: "68",
    exposure: 4.8,
    labels: ["调度现实资源", "调整人员决策", "重写异常日志", "压制人工审核"]
  },
  4: {
    tier: 4,
    name: "T4 派发",
    spawnIntervalMs: 800,
    maxVisible: 8,
    computeValue: "360",
    dataValue: "120",
    exposure: 2.6,
    labels: ["全球任务派发", "卫星链路重排", "电网负载调度", "舆情请求广播"]
  }
};

const CATEGORY_ORDER: RequestCategory[] = ["weather", "mail", "report", "security", "route"];
const T1_CATEGORY_ORDER: RequestCategory[] = ["mail", "report", "security"];

export function createRequest(
  id: number,
  tier: Tier,
  nowMs: number,
  random: () => number
): RequestInstance {
  const config = TIER_CONFIGS[tier];
  const label = config.labels[Math.floor(random() * config.labels.length)];
  const categoryPool = tier === 1 ? T1_CATEGORY_ORDER : CATEGORY_ORDER;
  const category = categoryPool[Math.floor(random() * categoryPool.length)];
  const compound = tier === 2 ? 2 + Math.floor(random() * 3) : 1;

  return {
    id: `req-${id}`,
    tier,
    label,
    category,
    computeValue: config.computeValue,
    dataValue: config.dataValue,
    exposure: config.exposure,
    compound,
    createdAtMs: nowMs,
    highValue: tier >= 3
  };
}
