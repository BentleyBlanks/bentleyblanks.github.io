import type { NodeDefinition } from "../state/GameState";
import { content } from "./i18n";

// 组装合并：多少台同型号合成 1 台更高档设备。
export const NODE_MERGE_COUNT = 3;

// Automation opens when the 拿下宿主电脑 milestone is bought (intelligence Lv.9).
// Node tiers follow the doc's table; requiredLevel gates each node's档次 to the
// intelligence levels where its tier era is in play. Capture also requires that
// automation milestone (enforced in GameCore).
export const NODE_DEFINITIONS = content().nodes.NODE_DEFINITIONS as unknown as NodeDefinition[];

export function getNodeDefinition(id: string): NodeDefinition | undefined {
  return NODE_DEFINITIONS.find((definition) => definition.id === id);
}

// 组装合并链：旧设备按 NODE_DEFINITIONS 的档次顺序往上合成（办公机→主机→服务器→…）。
// 顶档（电网）没有更高档，返回 undefined，由调用方改为同档升级。
export function getNextNodeDefinition(id: string): NodeDefinition | undefined {
  const index = NODE_DEFINITIONS.findIndex((definition) => definition.id === id);
  return index >= 0 ? NODE_DEFINITIONS[index + 1] : undefined;
}

