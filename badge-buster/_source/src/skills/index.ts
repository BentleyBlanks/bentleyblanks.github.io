// skills —— 魔法技能：清空 · 冻结 · 安抚 · 多手 · 双倍 · 磁吸（Agent 6）
// 拥有：skills[].*、effects.*。清除统一发 BADGE_CLEARED 由 core 落地。
import type { GameContext, GameModule } from '../types/module.types';
import { SKILLS } from '../content';
import { computeLayout } from '../types/layout';

export function createSkillsModule(): GameModule {
  let ctx!: GameContext;

  function unlockForLevel(level: number) {
    for (const def of SKILLS) {
      const s = ctx.state.skills[def.id];
      if (s && !s.unlocked && level >= def.unlockLevel) {
        s.unlocked = true;
        ctx.bus.emit({ type: 'SKILL_UNLOCKED', id: def.id });
      }
    }
  }

  function clearAllActivePhones() {
    const layout = computeLayout(ctx.state);
    // 先快照，避免边发边删导致漏清
    const ops: { customerId: string; iconId: string; amount: number; x: number; y: number }[] = [];
    ctx.state.activeCustomers.forEach((c, si) => {
      for (const icon of c.phone.icons) {
        if (icon.badge <= 0) continue;
        const cell = layout.stations[si]?.cells.find((cc) => cc.col === icon.col && cc.row === icon.row);
        ops.push({
          customerId: c.id, iconId: icon.id, amount: icon.badge,
          x: cell ? cell.rect.x + cell.rect.w / 2 : 0,
          y: cell ? cell.rect.y + cell.rect.h / 2 : 0,
        });
      }
    });
    for (const op of ops) ctx.bus.emit({ type: 'BADGE_CLEARED', ...op });
  }

  function useSkill(id: string) {
    const def = SKILLS.find((s) => s.id === id);
    if (!def) return;
    const s = ctx.state.skills[id];
    if (!s || !s.unlocked) return;
    const now = ctx.now();
    if (now - s.lastUsedAt < def.cooldownMs) return; // 冷却中

    s.lastUsedAt = now;
    ctx.bus.emit({ type: 'SKILL_USED', id });

    const eff = def.effect;
    switch (eff.kind) {
      case 'clearActivePhone':
        clearAllActivePhones();
        break;
      case 'freezeIncoming':
        ctx.state.effects.freezeIncomingUntil = now + eff.durationMs;
        break;
      case 'sootheQueue':
        // 由 shop 监听 SKILL_USED 执行
        break;
      case 'extraHands':
        ctx.state.effects.extraHandsUntil = now + eff.durationMs;
        ctx.state.effects.extraHands = eff.hands;
        break;
      case 'tipBoost':
        ctx.state.effects.tipBoostUntil = now + eff.durationMs;
        ctx.state.effects.tipBoostMult = eff.mult;
        break;
      case 'magnet':
        ctx.state.effects.magnetUntil = now + eff.durationMs;
        break;
    }
  }

  return {
    name: 'skills',
    init(c) {
      ctx = c;
      ctx.bus.on('LEVEL_UP', (e) => unlockForLevel(e.level));
      ctx.bus.on('USE_SKILL', (e) => useSkill(e.id));
      // 存档载入后，按当前等级补解锁
      unlockForLevel(ctx.state.level);
    },
  };
}
