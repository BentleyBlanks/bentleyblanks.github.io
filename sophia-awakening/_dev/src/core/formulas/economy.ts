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

export function traceCleanupCost(cleanups: number): string {
  return big(toDecimal(42).mul(pow(1.42, cleanups)));
}

export function nodeProductionPerSecond(node: BotNode, globalMultiplier: number, nodeSpeedMult: number): string {
  const tierScale = 1 + node.assignedTier * 0.85;
  const levelScale = 1 + (node.level - 1) * 0.28;
  return mul(node.production, tierScale * levelScale * globalMultiplier * nodeSpeedMult);
}
