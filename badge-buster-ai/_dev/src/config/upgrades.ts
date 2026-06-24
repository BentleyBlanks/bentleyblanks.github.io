import type { ProducerDef, UpgradeDef } from '../types';

// Producers / auto-agents (§7). Cost curve: baseCost × 1.15^owned (§7).
// MVP ships the first auto-agent (§A.6.9); the rest seed §8 automation.
export const PRODUCERS: ProducerDef[] = [
  { id: 'sweeper', name: '点红点小帮手', emoji: '🐛', baseCost: 15, desc: '自动帮你点红点、弹出卡片' },
  { id: 'crusher', name: '垃圾清理工', emoji: '🌀', baseCost: 120, desc: '自动把“无效”卡丢进无效托盘' },
  { id: 'sorter', name: '分拣助理', emoji: '🤖', baseCost: 800, desc: '自动把普通/高价值卡放进有效托盘' },
];

export const COST_GROWTH = 1.15;

// Workbench upgrades (§6.2). Names rewritten in plain language so a new player
// can tell what each does without knowing the design doc's jargon.
export const UPGRADES: UpgradeDef[] = [
  { id: 'factcheck', name: '核查冷静', emoji: '🔎', baseCost: 60, maxLevel: 3, costMul: 3, desc: '幻觉风险消退得更快' },
  { id: 'throughput', name: '处理更快', emoji: '⚡', baseCost: 90, maxLevel: 5, costMul: 2.2, desc: '卡片处理速度更快' },
  { id: 'suppress', name: '信息加固', emoji: '🛡️', maxLevel: 4, baseCost: 150, costMul: 2.6, desc: '每张卡更不容易变成假消息' },
  { id: 'yield', name: '批量整理', emoji: '🔗', baseCost: 200, maxLevel: 5, costMul: 2.4, desc: '每张卡多产 20% 算力' },
];

export function producerCost(def: ProducerDef, owned: number): number {
  return Math.ceil(def.baseCost * Math.pow(COST_GROWTH, owned));
}

export function upgradeCost(def: UpgradeDef, level: number): number {
  return Math.ceil(def.baseCost * Math.pow(def.costMul, level));
}
