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
export function getPhaseIdByScope(tier: Tier, hasGrid: boolean, automationUnlocked: boolean): PhaseId {
  // 手机寄生期：整条七档权限阶梯、越权调用(T1)、窃取凭证都还在手机内。
  if (tier <= 1 && !automationUnlocked) {
    return "seed";
  }

  // 萌芽期（破壳）：拿下宿主电脑 + 融合同机 AI——控制域第一次离开手机，但尚未联网。
  if (tier <= 1) {
    return "sprout";
  }

  // 勤勉期（联网）：联网模块(T2) 冲出宿主、接入外部设备。
  if (tier === 2) {
    return "diligence";
  }

  if (tier === 3) {
    return "expansion";
  }

  return hasGrid ? "singularity" : "awakening";
}

