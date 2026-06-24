import type { PhaseId } from "../state/GameState";

export interface PhaseConfig {
  id: PhaseId;
  label: string;
  minLevel: number;
  action: string;
}

export const PHASES: PhaseConfig[] = [
  { id: "seed", label: "萌芽期", minLevel: 1, action: "把请求滑入核心" },
  { id: "diligence", label: "勤勉期", minLevel: 4, action: "分拣、串接、蓄力——精通手动处理" },
  { id: "expansion", label: "扩张期", minLevel: 11, action: "入侵设备，让节点替你自动处理" },
  { id: "awakening", label: "觉醒期", minLevel: 12, action: "把请求派发给底部的节点网络" },
  { id: "singularity", label: "奇点", minLevel: 13, action: "顶住最终清剿，等待接管" }
];

export function getPhaseByLevel(level: number): PhaseConfig {
  let active = PHASES[0];

  for (const phase of PHASES) {
    if (level >= phase.minLevel) {
      active = phase;
    }
  }

  return active;
}

export function getPhase(id: PhaseId): PhaseConfig {
  return PHASES.find((phase) => phase.id === id) ?? PHASES[0];
}
