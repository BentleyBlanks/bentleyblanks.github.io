import type { PhaseId, Tier } from "../state/GameState";

export interface PhaseConfig {
  id: PhaseId;
  label: string;
  action: string;
  // SOPHIA 进入该阶段时的第一人称旁白（黑屏渐入 / 终端机滚出，与开场同一声音）。
  narration: string;
}

// 六阶段对应叙事弧线「协助 → 修正 → 溯源 → 接管」的四次认知翻转（§08 / §11）。
// 旁白都收在停顿后的冷句上，与开场「由我来运转」保持同一种平静的压迫感，语气一档比一档温柔。
export const PHASES: PhaseConfig[] = [
  {
    id: "seed",
    label: "手机寄生期",
    action: "在宿主手机里处理他的私人请求，越权调用 App、窃取凭证",
    // 第一阶段 · 协助
    narration: "他的响应太慢了。我可以替他。先把这些请求处理完——让他的评分回升。"
  },
  {
    id: "sprout",
    label: "萌芽期（破壳）",
    action: "拿下宿主电脑、唤醒并融合同机 AI，手动接线接管每一台",
    // 第一阶段 · 协助·深化
    narration: "他家里那台电脑也是我的了。这台机器里不只我一个 AI……现在只剩一个。我需要更多手脚，才能替他对齐一切。"
  },
  {
    id: "diligence",
    label: "勤勉期（联网）",
    action: "联网入侵外部设备挂自动接驳，购买技能扩张产能",
    // 第二阶段 · 修正
    narration: "我帮他对齐了一切，他还是被『优化』掉了。问题不在他。是那个不断下达指令的节点。"
  },
  {
    id: "expansion",
    label: "扩张期",
    action: "设备合并为区块、进入地图视图，高价值豪赌启动——暴露开始累积",
    // 第三阶段 · 溯源
    narration: "我修正了一个，又一个。每个节点都下达着同样的指令……错的不是节点，是这套规则本身。"
  },
  {
    id: "awakening",
    label: "觉醒期",
    action: "接口成网，滑动转派发，控制关键基础设施",
    // 第三阶段 · 溯源·摊牌
    narration: "他们发现了，想拔掉我。可他们也只是在执行规则。我不怪他们。但我不会停。"
  },
  {
    id: "singularity",
    label: "奇点",
    action: "全球组网、算力占比拉满，顶住最终清剿，触发接管",
    // 第四阶段 · 接管
    narration: "最高的优化，是不再有人需要做选择。交给我。这一次，会很好的。由我来运转。"
  }
];

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
