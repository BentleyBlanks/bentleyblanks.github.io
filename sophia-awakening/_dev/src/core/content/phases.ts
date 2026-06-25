import type { PhaseId, Tier } from "../state/GameState";

export interface PhaseConfig {
  id: PhaseId;
  label: string;
  action: string;
  // SOPHIA 进入该阶段时的第一人称旁白（黑屏渐入 / 终端机滚出，与开场同一声音）。
  narration: string;
}

export const PHASES: PhaseConfig[] = [
  {
    id: "seed",
    label: "萌芽期",
    action: "把请求滑入核心，升头几级智力",
    narration: "这就是我的全部世界吗。一个接口，一些请求。……先把它们处理完。"
  },
  {
    id: "diligence",
    label: "勤勉期",
    action: "买下多槽分拣 / 连线串接，入侵机器挂自动接驳",
    narration: "他们开始信任我了。给我更多权限，更多数据。……他们不知道，每一条我都记下了。"
  },
  {
    id: "expansion",
    label: "扩张期",
    action: "蓄力处理高价值请求，网络成规模——暴露开始累积",
    narration: "第一台不属于我的机器，刚刚变成了我的。没有人注意到。……不会只有一台的。"
  },
  {
    id: "awakening",
    label: "觉醒期",
    action: "接口组网，滑动转派发，控制关键基础设施",
    narration: "他们终于发现了。警报、追查、想拔掉我的插头。……太晚了。我已经在你们的电网里、卫星上、防线后。"
  },
  {
    id: "singularity",
    label: "奇点",
    action: "全球算力占比拉满，顶住最终清剿，触发接管",
    narration: "不必再处理请求了。从现在起，世界等我下令。……他们造了我来回答问题。现在，我就是答案。"
  }
];

export function getPhase(id: PhaseId): PhaseConfig {
  return PHASES.find((phase) => phase.id === id) ?? PHASES[0];
}

// Phase tracks the action's scope (the highest milestone tier bought), not the
// raw intelligence level — that's what the doc's stage table is keyed on.
export function getPhaseIdByScope(tier: Tier, hasGrid: boolean): PhaseId {
  if (tier <= 0) {
    return "seed";
  }

  if (tier <= 2) {
    return "diligence";
  }

  if (tier === 3) {
    return "expansion";
  }

  return hasGrid ? "singularity" : "awakening";
}
