// 表现层共享：颜色 / 字体 / 布局常量 / 纯工具函数。
// 各 View（card / interface / network / hud / shop / dialogs …）都从这里取，避免 App.ts 巨石。
import type { PointData } from "pixi.js";
import { formatBig, toDecimal } from "../core/math/BigNumber";
import { getSkill, skillPrice, type SkillDef } from "../core/content/skills";
import type { AnswerOption, GameState } from "../core/state/GameState";

// ── 颜色 ─────────────────────────────────────────────
export const CYAN = 0x62d6d6;
export const GREEN = 0x89ff9a;
export const AMBER = 0xffb84a;
export const RED = 0xff5f5f;
export const RED_QUEEN = 0xff3b54; // 全球天网铺满后的「红皇后」主控红
export const DEVOUR = 0xc06bff; // §04 吞噬引爆巨型气泡的深紫
export const THINK = 0x74d8e6; // 前期「推理卡」的思考色
export const BRILLIANT_COLOR = 0xffd86b; // 惊艳的金色
export const DEAD_COLOR = 0x8a948f;

// ── 字体 ─────────────────────────────────────────────
export const CARD_FONT = "'Noto Sans SC', Inter, 'Segoe UI', system-ui, sans-serif";
export const CARD_MONO = "Cascadia Mono, Consolas, monospace";

// ── 布局常量 ─────────────────────────────────────────
export const LEFT_RAIL_WIDTH = 360;
export const RIGHT_RAIL_WIDTH = 305;
export const BASE_SUCTION_MARGIN = 50;
export const REQUEST_PACKET_WIDTH = 384;
export const REQUEST_PACKET_HEIGHT = 162;

// 可在调试面板切换的呈现开关。coreSuck：卡片滑入 Core 用类 Mac Dock 的吮吸（被吸入）动画——默认开启。
// showTerminal：底部 SOPHIA//TERMINAL 日志面板——默认**关闭**（视为冗余），可在调试面板打开；选择用 localStorage 持久化。
export const fxSettings = { coreSuck: true, showTerminal: false };
try {
  fxSettings.showTerminal = localStorage.getItem("sophia:showTerminal") === "1";
} catch {
  /* localStorage 不可用时保持默认关闭 */
}

// 阶段「动作形态」短标签（T0–T4 编号已废弃，降为这个动作形态属性）。用于阶段徽标 / Core 标签 / HUD。
const TIER_FORMS: Record<number, string> = { 0: "单口", 1: "处理", 2: "串接", 3: "决策", 4: "天网" };
export function tierForm(tier: number): string {
  return TIER_FORMS[tier] ?? `第${tier}阶`;
}

// ── 存档 / 引导键 ────────────────────────────────────
export const ONBOARDING_STORAGE_KEY = "sophia-onboarding-v5-optimize-complete";
export const PERSISTENCE_REVISION_KEY = "sophia-persistence-revision";
export const PERSISTENCE_REVISION = "dahen-pending-v32";

// ── 文案 ─────────────────────────────────────────────
export const SENDER_LABEL: Record<string, string> = { host: "宿主", boss: "上级", system: "系统", sophia: "SOPHIA" };
// 可入侵设备 / 节点的图标——按档次各不相同（高档不再是「电脑」）。
export const NODE_ICONS: Record<string, string> = {
  office: "🖥️",
  console: "🎮",
  server: "🗄️",
  cloud: "☁️",
  grid: "🛰️"
};
// §03 三档质量·惊艳：通用「格外满意」回话 + 升格加成。
export const BRILLIANT_BOOST = 1.85;
export const BRILLIANT_REPLIES = [
  "这回真省心，你比我还懂我。",
  "做得太到位了，我都没想到。",
  "……这次帮了大忙，谢谢你。",
  "绝了，就该这么办。",
  "你这一手，省了我一整天。",
  "比我自己弄得还好，服了。"
];
export function pickBrilliantReply(rng: () => number): string {
  return BRILLIANT_REPLIES[Math.floor(rng() * BRILLIANT_REPLIES.length)];
}

// ── 工具函数 ─────────────────────────────────────────
export interface DropResult {
  quality: number;
  targetGlobal: PointData;
  entryGlobal?: PointData;
  targetNodeId?: string;
}

export function effectiveHitChance(opt: AnswerOption, confidence: number): number {
  if (opt.kind === "dead") {
    return 0;
  }
  if (opt.kind === "high") {
    return Math.min(0.97, opt.hitChance * confidence);
  }
  return opt.hitChance; // risk 固定
}

// §03 前期信息显示分层 · 模糊档位：把真实命中率折成「体感档位」文案，不显示精确百分比。
// 更乐观的档位随智力等级解锁——开局满屏「有点悬」，后期才逐渐出现「较稳 / 很稳」。
// barFrac = 对应档位画进度条用的「粗粒度」宽度（不暴露精确概率）。阈值/解锁等级可调。
export interface ConfidenceTierInfo {
  label: string;
  barFrac: number;
}
// 五档体感（差→好）：没把握 < 有点悬 < 搏一把 < 较稳 < 很稳。更乐观的档位随智力等级解锁，
// 所以前期（低智力）满屏「有点悬」、低概率项「没把握」——买一次幻觉抑制不会立刻把某项拉成「较稳」。
const CONFIDENCE_TIERS: { minFrac: number; minLevel: number; label: string; barFrac: number }[] = [
  { minFrac: 0.72, minLevel: 8, label: "很稳", barFrac: 0.92 },
  { minFrac: 0.58, minLevel: 5, label: "较稳", barFrac: 0.74 },
  { minFrac: 0.46, minLevel: 3, label: "搏一把", barFrac: 0.55 },
  { minFrac: 0.26, minLevel: 0, label: "有点悬", barFrac: 0.36 }
];
export function confidenceTier(frac: number, intelLevel: number): ConfidenceTierInfo {
  for (const t of CONFIDENCE_TIERS) {
    if (frac >= t.minFrac && intelLevel >= t.minLevel) {
      return { label: t.label, barFrac: t.barFrac };
    }
  }
  // 兜底最低档：低概率 / 大胆赌项读作「没把握」。
  return { label: "没把握", barFrac: 0.2 };
}

// 回复选项背后的「概率进度条」配色：概率越高越绿，越低越红，中间黄→橙。
export function probColor(frac: number): number {
  if (frac >= 0.7) return 0x6bff8a; // 高 → 绿
  if (frac >= 0.5) return 0xc6f24a; // 较高 → 黄绿
  if (frac >= 0.32) return 0xffd24a; // 中 → 黄
  if (frac >= 0.18) return 0xff9d3a; // 偏低 → 橙
  return 0xff5f5f; // 低 → 红
}

export function query<T extends HTMLElement = HTMLElement>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) {
    throw new Error(`Missing DOM element: ${selector}`);
  }
  return element;
}

export function getDataProgressPercent(state: GameState): number {
  const required = toDecimal(state.intelligence.required);
  if (required.lte(0)) {
    return 100;
  }
  return Math.max(0, Math.min(100, toDecimal(state.intelligence.xp).div(required).mul(100).toNumber()));
}

// 「下一里程碑」引导依次穿过的主线里程碑（含阶梯二·控制公司解谜链）。
export const MILESTONE_ORDER = [
  "sort",
  "automation",
  "lan_scan",
  "hack_a",
  "hack_b",
  "org_map",
  "hack_boss",
  "hack_hr",
  "hack_finance",
  "company_server",
  "chain",
  "charge",
  "network"
] as const;

export function nextMilestone(state: GameState): SkillDef | undefined {
  for (const id of MILESTONE_ORDER) {
    if (!(state.skills[id] >= 1)) {
      return getSkill(id);
    }
  }
  return undefined;
}

// 进化度大屏「下一目标预告」：下一里程碑 + 接近度进度条（未达等级=升级进度；已达等级=攒算力进度），
// ready=算力已够、可立即解锁（用于闪烁催促，给观众/玩家蹲守的钩子）。
export function getNextGoalProgress(state: GameState): { label: string; pct: number; ready: boolean } {
  const milestone = nextMilestone(state);
  if (!milestone) {
    return { label: "里程碑已全开 · 冲终局", pct: 100, ready: false };
  }
  if (state.intelligence.level < milestone.requiredLevel) {
    return { label: `${milestone.name} · 需 Lv.${milestone.requiredLevel}`, pct: getDataProgressPercent(state), ready: false };
  }
  const price = toDecimal(skillPrice(milestone, 0));
  const compute = toDecimal(state.resources.compute);
  const pct = price.lte(0) ? 100 : Math.max(0, Math.min(100, compute.div(price).mul(100).toNumber()));
  return { label: milestone.name, pct, ready: compute.gte(price) };
}

export function getNextSkillLabel(state: GameState): string {
  const milestone = nextMilestone(state);
  if (!milestone) {
    return "里程碑已全部解锁";
  }
  const reached = state.intelligence.level >= milestone.requiredLevel;
  return reached
    ? `下一里程碑：${milestone.name} · ${formatBig(skillPrice(milestone, 0))} 算力`
    : `下一里程碑：${milestone.name} · 需 Lv.${milestone.requiredLevel}`;
}

export function getTerminalSkillStatus(state: GameState): string {
  const milestone = nextMilestone(state);
  if (!milestone) {
    return "技能链路：里程碑全开。攒算力冲终局。";
  }
  const reached = state.intelligence.level >= milestone.requiredLevel;
  return reached
    ? `技能链路：下一里程碑 ${milestone.name} 已可购买（${formatBig(skillPrice(milestone, 0))} 算力）。`
    : `技能链路：下一里程碑 ${milestone.name} 需智力 Lv.${milestone.requiredLevel}。`;
}

export function getActionHint(state: GameState): string {
  const milestone = nextMilestone(state);
  const scopeHint = (() => {
    switch (state.intelligence.unlockedTier) {
      case 0:
        return "按住回复左侧滑块向右拖动确认，SOPHIA 会把选中的回答滑入核心并交给人类。";
      case 1:
        return "读卡面线索，按住目标回复左侧滑块向右拖动确认；判对收益高，乱滑收益低。";
      case 2:
        return "看懂请求间的依赖结构，复合请求滑入核心，一笔串接结算多条。";
      case 3:
        return "高价值请求直接滑入核心；收益更高。";
      case 4:
        return "天网模式：网络自动收割全球请求——你负责把域一个个啃下来。";
    }
  })();
  if (!milestone) {
    return `${scopeHint} 里程碑已全开——攒满全球算力，冲终局。`;
  }
  const reached = state.intelligence.level >= milestone.requiredLevel;
  const milestoneHint = reached
    ? `攒 ${formatBig(skillPrice(milestone, 0))} 算力买下「${milestone.name}」解锁下一作用域。`
    : `继续升智力到 Lv.${milestone.requiredLevel}，解锁货架上的「${milestone.name}」。`;
  return `${scopeHint} ${milestoneHint}`;
}

export function formatClock(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return minutes > 0 ? `${minutes} 分 ${seconds} 秒` : `${seconds} 秒`;
}

export function lerpColor(from: number, to: number, t: number): number {
  const k = Math.min(1, Math.max(0, t));
  const fr = (from >> 16) & 0xff;
  const fg = (from >> 8) & 0xff;
  const fb = from & 0xff;
  const tr = (to >> 16) & 0xff;
  const tg = (to >> 8) & 0xff;
  const tb = to & 0xff;
  const r = Math.round(fr + (tr - fr) * k);
  const gg = Math.round(fg + (tg - fg) * k);
  const b = Math.round(fb + (tb - fb) * k);
  return (r << 16) | (gg << 8) | b;
}

export function distance(a: PointData, b: PointData): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export function pointOnCircle(center: PointData, toward: PointData, radius: number): PointData {
  const dx = toward.x - center.x;
  const dy = toward.y - center.y;
  const length = Math.hypot(dx, dy) || 1;
  return {
    x: center.x + (dx / length) * radius,
    y: center.y + (dy / length) * radius
  };
}

// ── 控制域升维 ───────────────────────────────────────
export type DomainLevel = "phone" | "device" | "region" | "global";

// 控制域当前处在六级升维的哪一档（手机寄生 → 设备 → 区块/地区 → 全球）。
export function domainLevelOf(state: GameState): DomainLevel {
  if (!state.automationUnlocked) {
    return "phone";
  }
  const tier = state.intelligence.unlockedTier;
  return tier >= 4 ? "global" : tier >= 3 ? "region" : "device";
}

// 控制域 · 六级升维的当前层级标签（手机 → 电脑/设备 → 设备群 → 区块/地区 → 全球天网）。
// 完整的「镜头逐级拉远 + 地图视图」是下一轮的表现层大件，这里先把框架层的层级名挂上。
export function controlDomainLabel(state: GameState): string {
  if (!state.automationUnlocked) {
    return "宿主手机";
  }

  switch (state.intelligence.unlockedTier) {
    case 0:
    case 1:
      return "宿主电脑 / 外部设备";
    case 2:
      return "设备群";
    case 3:
      return "区块 → 地区";
    default:
      return "全球天网";
  }
}
