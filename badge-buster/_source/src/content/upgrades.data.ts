import type { UpgradeDef } from '../types/content.types';

// 9 个升级，造价增长统一 1.15。effect(level) 返回"该级对应的派生量"，由 economy/shop 消费。
export const UPGRADES: UpgradeDef[] = [
  {
    id: 'up_clear', name: '粗暴戳', desc: '每次戳多清 1 个角标', category: 'clear',
    artId: 'up_clear', baseCost: 25, costGrowth: 1.15, maxLevel: 0,
    effect: (level) => level, // clearPerHit = 1 + level
  },
  {
    id: 'up_swipe', name: '顺滑手感', desc: '解锁滑动连清', category: 'swipe',
    artId: 'up_swipe', baseCost: 100, costGrowth: 1.15, maxLevel: 1,
    effect: (level) => level, // swipeEnabled = level > 0
  },
  {
    id: 'up_value', name: '经验书', desc: '每个角标经验 ×1.15', category: 'value',
    artId: 'up_value', baseCost: 40, costGrowth: 1.15, maxLevel: 0,
    effect: (level) => Math.pow(1.15, level), // xpPerBadge 乘数
  },
  {
    id: 'up_slot', name: '多功能工作台', desc: '同时多修一台手机', category: 'slot',
    artId: 'up_slot', baseCost: 500, costGrowth: 1.15, maxLevel: 5,
    effect: (level) => level, // activeSlots = 1 + level
  },
  {
    id: 'up_queue', name: '候客厅扩容', desc: '候客厅多排一位', category: 'queue',
    artId: 'up_queue', baseCost: 120, costGrowth: 1.15, maxLevel: 7,
    effect: (level) => level, // queueCapacity = 3 + level
  },
  {
    id: 'up_patience', name: '舒适座椅', desc: '顾客耐心 +10s', category: 'patience',
    artId: 'up_patience', baseCost: 90, costGrowth: 1.15, maxLevel: 0,
    effect: (level) => level * 10000, // maxPatience 加成(ms)
  },
  {
    id: 'up_botcount', name: '招个学徒', desc: '多一个自动清角标的学徒', category: 'auto',
    artId: 'up_botcount', baseCost: 200, costGrowth: 1.15, maxLevel: 0,
    effect: (level) => level, // botCount
  },
  {
    id: 'up_botspeed', name: '学徒加速', desc: '学徒清除速率 ×1.2', category: 'auto',
    artId: 'up_botspeed', baseCost: 150, costGrowth: 1.15, maxLevel: 0,
    effect: (level) => Math.pow(1.2, level), // botRate 乘数
  },
  {
    id: 'up_payout', name: '金牌服务', desc: '酬金 ×1.2', category: 'payout',
    artId: 'up_payout', baseCost: 300, costGrowth: 1.15, maxLevel: 0,
    effect: (level) => Math.pow(1.2, level), // payoutMult 乘数
  },
];
