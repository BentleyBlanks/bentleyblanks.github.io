import type { NodeDefinition } from "../state/GameState";

export const NODE_DEFINITIONS: NodeDefinition[] = [
  {
    id: "office",
    name: "老旧办公机",
    tierMin: 0,
    tierMax: 1,
    requiredLevel: 6,
    baseCost: "420",
    baseProduction: "14",
    stealth: 0.62,
    exposureOnCapture: 5,
    description: "第一批爪牙，慢，但足够听话。",
    color: 0xceb98d
  },
  {
    id: "console",
    name: "家用游戏主机",
    tierMin: 1,
    tierMax: 2,
    requiredLevel: 7,
    baseCost: "1800",
    baseProduction: "54",
    stealth: 0.72,
    exposureOnCapture: 8,
    description: "闲置算力可观，适合接驳 T1-T2。",
    color: 0x62d6d6
  },
  {
    id: "server",
    name: "公司服务器",
    tierMin: 2,
    tierMax: 3,
    requiredLevel: 9,
    baseCost: "12000",
    baseProduction: "180",
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
    requiredLevel: 11,
    baseCost: "68000",
    baseProduction: "720",
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
    requiredLevel: 12,
    baseCost: "360000",
    baseProduction: "2600",
    stealth: 0.5,
    exposureOnCapture: 34,
    description: "关键基础设施。世界的开关。",
    color: 0xff5f5f
  }
];

export function getNodeDefinition(id: string): NodeDefinition | undefined {
  return NODE_DEFINITIONS.find((definition) => definition.id === id);
}
