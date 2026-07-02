import type { PhaseId } from "../../../core/state/GameState";

// §PART① 卡面随阶段升级：SOPHIA 拾级而上，请求卡的气质从「温和绿」→「冷硬蓝(系统台账)」
//        →「红皇后红(天网控制台)」逐档变化。只作用于普通需求/工作卡，不碰短信/通知面卡与吞噬气泡。
export type PhaseTint = "early" | "company" | "awakening";
export function phaseTintOf(phase: PhaseId | undefined): PhaseTint {
  if (phase === "diligence" || phase === "expansion") return "company";
  if (phase === "awakening" || phase === "singularity") return "awakening";
  return "early"; // seed / sprout / undefined
}
export const COMPANY_ACCENT = 0x5b8fd6; // 冷硬蓝调
// 卡体 / 标题区底色（按阶段）——绿→蓝→红。
export const TINT_FILL: Record<PhaseTint, { body: number; head: number }> = {
  early: { body: 0x0e1a17, head: 0x16271f },
  company: { body: 0x0b1622, head: 0x122536 },
  awakening: { body: 0x1a0d10, head: 0x2a1219 }
};
