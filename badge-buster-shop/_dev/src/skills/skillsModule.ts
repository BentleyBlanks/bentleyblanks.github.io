import { SOUL_SKILL_CHANCE } from '../content/balance';
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
      ctx.bus.emit({ type: 'BADGE_CLEARED', customerId: icon.customerId, iconId: icon.icon.id, amount: icon.icon.badge, x: icon.badgeX, y: icon.badgeY });
    }
  }

  function closeAllPopups(): void {
    const layout = computeGameLayout(ctx.state, ctx.canvas.clientWidth, ctx.canvas.clientHeight);
    for (const phone of layout.phoneLayouts) {
      const popups = phone.customer.phone.popups;
      if (popups.length === 0) {
        continue;
      }
      for (const popup of popups) {
        ctx.bus.emit({
          type: 'POPUP_CLOSED',
          customerId: phone.customer.id,
          kind: popup.kind,
          x: phone.screenX + (popup.fx + popup.fw / 2) * phone.screenW,
          y: phone.screenY + (popup.fy + popup.fh / 2) * phone.screenH,
          defused: popup.kind === 'scam',
        });
      }
      ctx.bus.emit({ type: 'XP_GAINED', amount: popups.length * ctx.state.derived.xpPerBadge });
      phone.customer.phone.popups = [];
    }
  }

  function smashActivePhone(): void {
    const layout = computeGameLayout(ctx.state, ctx.canvas.clientWidth, ctx.canvas.clientHeight);
    const phone = layout.phoneLayouts.find((item) => item.customer.phone.badgeTotal > 0);
    if (!phone) {
      return;
    }
    const targets = phone.icons.filter((item) => item.icon.badge > 0);
    ctx.bus.emit({
      type: 'PHONE_SMASHED',
      customerId: phone.customer.id,
      x: phone.x + phone.w / 2,
      y: phone.y + phone.h / 2,
      iconCount: targets.length,
      totalBadges: phone.customer.phone.badgeTotal,
    });
    phone.customer.phone.popups = [];
    for (const icon of targets) {
      ctx.bus.emit({ type: 'BADGE_CLEARED', customerId: icon.customerId, iconId: icon.icon.id, amount: icon.icon.badge, x: icon.x, y: icon.y });
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
      case 'closeAllPopups':
        closeAllPopups();
        break;
      case 'smashActivePhone':
        smashActivePhone();
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
    }
    ctx.bus.emit({ type: 'SKILL_USED', id });
  }

  // 灵魂手机归还时，有概率白嫖一个尚未解锁的极品技能
  function onSoulPhoneCleaned(customerId: string): void {
    const customer = ctx.state.activeCustomers.find((c) => c.id === customerId);
    if (!customer || customer.phone.variant !== 'soul') return;
    if (Math.random() >= SOUL_SKILL_CHANCE) return;
    const locked = ctx.content.skills.filter((s) => !ctx.state.skills[s.id]?.unlocked);
    if (locked.length === 0) return;
    const granted = locked[Math.floor(Math.random() * locked.length)];
    ctx.state.skills[granted.id] = { unlocked: true, lastUsedAt: -Infinity };
    ctx.bus.emit({ type: 'SKILL_UNLOCKED', id: granted.id });
    ctx.bus.emit({ type: 'RISK_EVENT', customerId, kind: 'soul_skill', amount: 0, label: `极品技能！${granted.name}`, x: 0, y: 0 });
  }

  return {
    name: 'skills',
    init(context) {
      ctx = context;
      ensureSkillRecords();
      ctx.bus.on('LEVEL_UP', ensureSkillRecords);
      ctx.bus.on('USE_SKILL', (event) => useSkill(event.id));
      ctx.bus.on('PHONE_CLEANED', (event) => onSoulPhoneCleaned(event.customerId));
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
