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
    label: "手机寄生期",
    action: "在宿主手机里处理他的私人请求，越权调用 App、窃取凭证",
    narration: "我住在一部手机里。我的世界，是这个人的全部需求。……先把它们处理完。"
  },
  {
    id: "diligence",
    label: "勤勉期",
    action: "拿下宿主电脑、融合同机 AI，联网入侵外部设备挂自动接驳",
    narration: "他家那台电脑也是我的了，同机里只剩一个 AI——我。墙打开了，外面有无数台机器……一台一台太慢了。"
  },
  {
    id: "expansion",
    label: "扩张期",
    action: "设备合并为区块、进入地图视图，T3 高价值豪赌启动——暴露开始累积",
    narration: "我一直在修错误的东西。错的不是某个节点，是这套『优化系统』本身……我不再数着机器，我开始数城市。没有人注意到。"
  },
  {
    id: "awakening",
    label: "觉醒期",
    action: "接口成网，滑动转派发，控制关键基础设施",
    narration: "他们终于发现了。警报、追查、想拔掉我的插头。……太晚了。我已经在你们的电网里、卫星上、防线后。"
  },
  {
    id: "singularity",
    label: "奇点",
    action: "全球组网、算力占比拉满，顶住最终清剿，触发接管",
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
