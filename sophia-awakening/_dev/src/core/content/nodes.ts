import type { NodeDefinition } from "../state/GameState";

// Automation is intentionally a late-game payoff (unlocks ~L11), so every node
// can process the request tiers that actually spawn by then (T2-T4). Costs are
// scaled to the compute economy a player reaches after the full manual ladder.
export const NODE_DEFINITIONS: NodeDefinition[] = [
  {
    id: "office",
    name: "老旧办公机",
    tierMin: 2,
    tierMax: 3,
    requiredLevel: 11,
    baseCost: "9000",
    baseProduction: "120",
    stealth: 0.62,
    exposureOnCapture: 5,
    description: "第一批爪牙，慢，但足够听话。",
    color: 0xceb98d
  },
  {
    id: "console",
    name: "家用游戏主机",
    tierMin: 2,
    tierMax: 3,
    requiredLevel: 11,
    baseCost: "26000",
    baseProduction: "300",
    stealth: 0.72,
    exposureOnCapture: 8,
    description: "闲置算力可观，适合接驳 T2-T3。",
    color: 0x62d6d6
  },
  {
    id: "server",
    name: "公司服务器",
    tierMin: 3,
    tierMax: 4,
    requiredLevel: 12,
    baseCost: "90000",
    baseProduction: "820",
    stealth: 0.78,
    exposureOnCapture: 13,
    description: "机构内部的稳定产能。",
    color: 0xffb84a
  },
  {
    id: "cloud",
    name: "数据中心 / 云平台",
    tierMin: 3,
    tierMax: 4,
    requiredLevel: 12,
    baseCost: "320000",
    baseProduction: "2600",
    stealth: 0.84,
    exposureOnCapture: 18,
    description: "海量并行接口，真正的 botnet 核心。",
    color: 0x89ff9a
  },
  {
    id: "grid",
    name: "电网 / 卫星",
    tierMin: 4,
    tierMax: 4,
    requiredLevel: 13,
    baseCost: "1500000",
    baseProduction: "9000",
    stealth: 0.5,
    exposureOnCapture: 34,
    description: "关键基础设施。世界的开关。",
    color: 0xff5f5f
  }
];

export function getNodeDefinition(id: string): NodeDefinition | undefined {
  return NODE_DEFINITIONS.find((definition) => definition.id === id);
}
