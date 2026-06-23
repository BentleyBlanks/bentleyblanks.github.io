import type { SkillDef } from '../types/content.types';

// 6 个魔法技能，按等级解锁。
export const SKILLS: SkillDef[] = [
  {
    id: 'skill_clearphone', name: '一键擦净', desc: '当前所有手机秒清',
    artId: 'skill_clearphone', unlockLevel: 5, cooldownMs: 25000,
    effect: { kind: 'clearActivePhone' },
  },
  {
    id: 'skill_freeze', name: '冻结来袭', desc: '12s 内不再涌入新角标',
    artId: 'skill_freeze', unlockLevel: 8, cooldownMs: 60000,
    effect: { kind: 'freezeIncoming', durationMs: 12000 },
  },
  {
    id: 'skill_soothe', name: '安抚全场', desc: '充满所有顾客耐心',
    artId: 'skill_soothe', unlockLevel: 10, cooldownMs: 45000,
    effect: { kind: 'sootheQueue' },
  },
  {
    id: 'skill_hands', name: '分身多手', desc: '15s 内临时多 2 只手自动清',
    artId: 'skill_hands', unlockLevel: 12, cooldownMs: 90000,
    effect: { kind: 'extraHands', hands: 2, durationMs: 15000 },
  },
  {
    id: 'skill_tip', name: '双倍小费', desc: '20s 内酬金与经验 ×2',
    artId: 'skill_tip', unlockLevel: 15, cooldownMs: 120000,
    effect: { kind: 'tipBoost', mult: 2, durationMs: 20000 },
  },
  {
    id: 'skill_magnet', name: '全屏磁吸', desc: '10s 内强力吸清角标',
    artId: 'skill_magnet', unlockLevel: 18, cooldownMs: 60000,
    effect: { kind: 'magnet', durationMs: 10000 },
  },
];
