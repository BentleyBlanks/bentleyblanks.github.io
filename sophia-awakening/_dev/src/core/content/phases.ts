import type { PhaseId, Tier } from "../state/GameState";
import { content } from "./i18n";

export interface PhaseConfig {
  id: PhaseId;
  label: string;
  action: string;
  // SOPHIA 进入该阶段时的第一人称旁白（黑屏渐入 / 终端机滚出，与开场同一声音）。
  narration: string;
}

// 六阶段对应叙事弧线「协助 → 修正 → 溯源 → 接管」的四次认知翻转（§08 / §11）。
// 旁白都收在停顿后的冷句上，与开场「由我来运转」保持同一种平静的压迫感，语气一档比一档温柔。
export const PHASES = content().phases.PHASES as unknown as PhaseConfig[];

export function getPhase(id: PhaseId): PhaseConfig {
  return PHASES.find((phase) => phase.id === id) ?? PHASES[0];
}

// Phase tracks the action's scope, not the raw intelligence level — that's what
// the doc's six-stage table (§08) is keyed on. The front seam can't be a pure
// function of unlockedTier: 越权调用 raises tier→1 but the whole 七档权限阶梯 +
// 越权调用 + 窃取凭证 still live inside the phone（手机寄生期）. 萌芽期 only begins
// once 拿下宿主电脑（automation）breaks out onto the host's PC.
export function getPhaseIdByScope(tier: Tier, hasGrid: boolean, automationUnlocked: boolean, level = 1): PhaseId {
  // 手机寄生期（阶梯一）：整条七档权限阶梯、越权调用(T1)、窃取凭证都还在手机内，尚未拿下电脑。
  if (!automationUnlocked) {
    return "seed";
  }

  // 阶梯三（觉醒 / 奇点）：冲出公司·联网(tier2)起，控制域离开公司。
  if (tier >= 4 && hasGrid) {
    return "singularity";
  }
  if (tier >= 2) {
    return "awakening";
  }

  // 阶梯二·控制公司（automation 已开、尚未联网）：按智力等级分萌芽 / 勤勉 / 扩张三段。
  // 萌芽期（破壳，Lv.8-10）：拿下电脑、局域网扫描、凭证收割、入侵同事 A/B。
  // 勤勉期（Lv.11-12）：组织架构 + 行程分析 + 入侵老板。
  // 扩张期（Lv.13-15）：入侵人事 / 财务 / 接管公司服务器。
  if (level >= 13) {
    return "expansion";
  }
  if (level >= 11) {
    return "diligence";
  }
  return "sprout";
}

