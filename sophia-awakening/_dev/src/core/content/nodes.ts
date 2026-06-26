import type { NodeDefinition } from "../state/GameState";

// 组装合并：多少台同型号合成 1 台更高档设备。
export const NODE_MERGE_COUNT = 3;

// Automation opens when the 拿下宿主电脑 milestone is bought (intelligence Lv.9).
// Node tiers follow the doc's table; requiredLevel gates each node's档次 to the
// intelligence levels where its tier era is in play. Capture also requires that
// automation milestone (enforced in GameCore).
export const NODE_DEFINITIONS: NodeDefinition[] = [
  {
    id: "office",
    name: "老旧办公机",
    tierMin: 0,
    tierMax: 1,
    requiredLevel: 6,
    baseCost: "720",
    baseProduction: "10",
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
    requiredLevel: 8,
    baseCost: "3600",
    baseProduction: "34",
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
    requiredLevel: 13,
    baseCost: "42000",
    baseProduction: "150",
    stealth: 0.78,
    exposureOnCapture: 13,
    description: "渗进了机构，稳定产能。",
    color: 0xffb84a
  },
  {
    id: "cloud",
    name: "数据中心 / 云平台",
    tierMin: 3,
    tierMax: 4,
    requiredLevel: 16,
    baseCost: "240000",
    baseProduction: "560",
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
    requiredLevel: 20,
    baseCost: "1500000",
    baseProduction: "2400",
    stealth: 0.5,
    exposureOnCapture: 34,
    description: "关键基础设施。世界的开关。",
    color: 0xff5f5f
  }
];

export function getNodeDefinition(id: string): NodeDefinition | undefined {
  return NODE_DEFINITIONS.find((definition) => definition.id === id);
}

// 组装合并链：旧设备按 NODE_DEFINITIONS 的档次顺序往上合成（办公机→主机→服务器→…）。
// 顶档（电网）没有更高档，返回 undefined，由调用方改为同档升级。
export function getNextNodeDefinition(id: string): NodeDefinition | undefined {
  const index = NODE_DEFINITIONS.findIndex((definition) => definition.id === id);
  return index >= 0 ? NODE_DEFINITIONS[index + 1] : undefined;
}
