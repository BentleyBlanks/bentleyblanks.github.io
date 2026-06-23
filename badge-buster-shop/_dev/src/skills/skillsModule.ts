import { computeGameLayout } from '../shared/layout';
import type { SkillDef } from '../types/content.types';
import type { GameContext, GameModule } from '../types/module.types';

function getSkill(ctx: GameContext, id: string): SkillDef | undefined {
  return ctx.content.skills.find((skill) => skill.id === id);
}

export function createSkillsModule(): GameModule {
  let ctx: GameContext;

  function ensureSkillRecords(): void {
    for (const skill of ctx.content.skills) {
      ctx.state.skills[skill.id] ??= { unlocked: false, lastUsedAt: -Infinity };
      if (ctx.state.level >= skill.unlockLevel && !ctx.state.skills[skill.id].unlocked) {
        ctx.state.skills[skill.id].unlocked = true;
        ctx.bus.emit({ type: 'SKILL_UNLOCKED', id: skill.id });
      }
    }
  }

  function clearActivePhone(): void {
    const layout = computeGameLayout(ctx.state, ctx.canvas.clientWidth, ctx.canvas.clientHeight);
    const phone = layout.phoneLayouts.find((item) => item.customer.phone.badgeTotal > 0);
    if (!phone) {
      return;
    }
    for (const icon of phone.icons.filter((item) => item.icon.badge > 0)) {
      ctx.bus.emit({
        type: 'BADGE_CLEARED',
        customerId: icon.customerId,
        iconId: icon.icon.id,
        amount: icon.icon.badge,
        x: icon.badgeX,
        y: icon.badgeY,
      });
    }
  }

  function useSkill(id: string): void {
    const skill = getSkill(ctx, id);
    const runtime = ctx.state.skills[id];
    const now = performance.now();
    if (!skill || !runtime?.unlocked || now - runtime.lastUsedAt < skill.cooldownMs) {
      return;
    }

    runtime.lastUsedAt = now;
    switch (skill.effect.kind) {
      case 'clearActivePhone':
        clearActivePhone();
        break;
      case 'freezeIncoming':
        ctx.state.effects.freezeIncomingUntil = now + skill.effect.durationMs;
        break;
      case 'sootheQueue':
        break;
      case 'extraHands':
        ctx.state.effects.extraHandsUntil = now + skill.effect.durationMs;
        ctx.state.effects.extraHands = skill.effect.hands;
        break;
      case 'tipBoost':
        ctx.state.effects.tipBoostUntil = now + skill.effect.durationMs;
        ctx.state.effects.tipBoostMult = skill.effect.mult;
        break;
      case 'magnet':
        ctx.state.effects.magnetUntil = now + skill.effect.durationMs;
        break;
    }
    ctx.bus.emit({ type: 'SKILL_USED', id });
  }

  return {
    name: 'skills',
    init(context) {
      ctx = context;
      ensureSkillRecords();
      ctx.bus.on('LEVEL_UP', ensureSkillRecords);
      ctx.bus.on('USE_SKILL', (event) => useSkill(event.id));
    },
    update() {
      const now = performance.now();
      if (now >= ctx.state.effects.extraHandsUntil) {
        ctx.state.effects.extraHands = 0;
      }
      if (now >= ctx.state.effects.tipBoostUntil) {
        ctx.state.effects.tipBoostMult = 1;
      }
    },
  };
}
