import type { ProducerDef, UpgradeDef } from '../types';

// Producers / auto-agents (§7). Cost curve: baseCost × 1.15^owned (§7).
// MVP ships the first auto-agent (§A.6.9); the rest seed §8 automation.
export const PRODUCERS: ProducerDef[] = [
  { id: 'sweeper', name: '收到清扫虫', emoji: '🐛', baseCost: 15, desc: '自动点红点，帮你弹出信息卡' },
  { id: 'crusher', name: '表情粉碎机', emoji: '🌀', baseCost: 120, desc: '自动把无效卡丢进无效炉口' },
  { id: 'sorter', name: '分拣代理', emoji: '🤖', baseCost: 800, desc: '自动分拣普通和高价值卡' },
];

export const COST_GROWTH = 1.15;

// Sticker-board upgrades (§6.2 事实核查 / 吞吐速度 等).
export const UPGRADES: UpgradeDef[] = [
  { id: 'factcheck', name: '事实核查', emoji: '🔎', baseCost: 60, maxLevel: 3, costMul: 3, desc: '幻觉概率下降得更快' },
  { id: 'throughput', name: '吞吐速度', emoji: '⚡', baseCost: 90, maxLevel: 5, costMul: 2.2, desc: '炼化炉处理卡片更快' },
  { id: 'suppress', name: '证据链压制', emoji: '🛡️', maxLevel: 4, baseCost: 150, costMul: 2.6, desc: '每张卡更不容易出幻觉' },
  { id: 'yield', name: '同源合并', emoji: '🔗', baseCost: 200, maxLevel: 5, costMul: 2.4, desc: '每张卡多产 20% 算力' },
];

export function producerCost(def: ProducerDef, owned: number): number {
  return Math.ceil(def.baseCost * Math.pow(COST_GROWTH, owned));
}

export function upgradeCost(def: UpgradeDef, level: number): number {
  return Math.ceil(def.baseCost * Math.pow(def.costMul, level));
}
