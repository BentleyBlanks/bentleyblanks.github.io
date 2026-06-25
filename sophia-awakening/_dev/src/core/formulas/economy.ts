import { big, mul, pow, toDecimal } from "../math/BigNumber";
import type { BotNode, NodeDefinition, RequestInstance } from "../state/GameState";

export function requestComputeGain(
  request: RequestInstance,
  quality: number,
  globalMultiplier: number,
  computeMult: number
): string {
  const tierBonus = request.tier === 2 ? request.compound : 1;
  return mul(request.computeValue, Math.max(0.1, quality) * tierBonus * globalMultiplier * computeMult);
}

export function requestDataGain(
  request: RequestInstance,
  quality: number,
  rebirths: number,
  dataMult: number
): string {
  const rebirthMultiplier = 1 + rebirths * 0.35;
  const tierBonus = request.tier === 2 ? request.compound * 0.85 : 1;
  return mul(request.dataValue, Math.max(0.1, quality) * tierBonus * rebirthMultiplier * dataMult);
}

export function captureCost(definition: NodeDefinition, existingCount: number): string {
  return big(toDecimal(definition.baseCost).mul(pow(1.68, existingCount)));
}

// 淘汰返还：拆掉一台节点退回它"那一档边际造价"的一半（count = 拆除前该型号的台数）。
export function scrapRefund(definition: NodeDefinition, count: number): string {
  return big(toDecimal(captureCost(definition, Math.max(0, count - 1))).mul(0.5));
}

export function traceCleanupCost(cleanups: number): string {
  return big(toDecimal(42).mul(pow(1.42, cleanups)));
}

export function nodeProductionPerSecond(node: BotNode, globalMultiplier: number, nodeSpeedMult: number): string {
  const tierScale = 1 + node.assignedTier * 0.85;
  const levelScale = 1 + (node.level - 1) * 0.28;
  return mul(node.production, tierScale * levelScale * globalMultiplier * nodeSpeedMult);
}

// 视觉/吞吐速率：一台节点每秒能"吃"几张卡。按设备档次（baseProduction 开方压缩量级）
// × 接驳层级 × 等级 × 设备提速，与产出用的 globalMultiplier 解耦——既驱动表现层的逐卡
// 接驳节拍，也让核心层据此把出卡量铺到与整张网吞吐相称（中后期不再"机多卡少"）。
export function nodeCardsPerSecond(node: BotNode, nodeSpeedMult: number): number {
  const base = Number(node.production) || 10;
  const deviceFactor = Math.sqrt(Math.max(1, base / 10));
  const tierFactor = 1 + node.assignedTier * 0.25;
  const levelFactor = 1 + (node.level - 1) * 0.15;
  return 0.7 * deviceFactor * tierFactor * levelFactor * nodeSpeedMult;
}
