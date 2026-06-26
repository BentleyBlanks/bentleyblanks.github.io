import { big, mul, pow, toDecimal } from "../math/BigNumber";
import type { BotNode, NodeDefinition, RequestInstance } from "../state/GameState";
import { TUNING } from "../tuning";

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
  const rebirthMultiplier = 1 + rebirths * TUNING.rebirthMultiplier;
  const tierBonus = request.tier === 2 ? request.compound * 0.85 : 1;
  return mul(request.dataValue, Math.max(0.1, quality) * tierBonus * rebirthMultiplier * dataMult);
}

export function captureCost(definition: NodeDefinition, existingCount: number): string {
  return big(toDecimal(definition.baseCost).mul(pow(TUNING.nodeCostExponent, existingCount)));
}

// 淘汰返还：拆掉一台节点退回它"那一档边际造价"的一半（count = 拆除前该型号的台数）。
export function scrapRefund(definition: NodeDefinition, count: number): string {
  return big(toDecimal(captureCost(definition, Math.max(0, count - 1))).mul(0.5));
}

// 组装费用：按"现价造一台目标档设备"计价，再扣除被吃掉的旧机折价。
// 这样组装费始终跟随【目标档】的成本曲线，杜绝"狂买便宜底层机再合上去"比直接买高档机
// 还省的漏洞——便宜机折价低，省不下目标档的钱；贵机折价高，折抵也公道。
export function mergeComputeCost(
  baseDef: NodeDefinition,
  baseCount: number, // 当前该型号台数（被吃前）
  resultDef: NodeDefinition,
  resultCount: number, // 目标档现有台数
  mergeCount: number
): string {
  let credit = toDecimal(0);
  for (let k = 0; k < mergeCount; k += 1) {
    credit = credit.add(toDecimal(scrapRefund(baseDef, baseCount - k)));
  }
  const full = toDecimal(captureCost(resultDef, resultCount));
  return full.gt(credit) ? big(full.sub(credit)) : "0";
}

export function traceCleanupCost(cleanups: number): string {
  return big(toDecimal(TUNING.traceCleanupBase).mul(pow(TUNING.traceCleanupExponent, cleanups)));
}

export function nodeProductionPerSecond(node: BotNode, globalMultiplier: number, nodeSpeedMult: number): string {
  const tierScale = 1 + node.assignedTier * TUNING.tierScalePerTier;
  const levelScale = 1 + (node.level - 1) * TUNING.levelScalePerLevel;
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
  return TUNING.cardsPerSecBase * deviceFactor * tierFactor * levelFactor * nodeSpeedMult;
}
