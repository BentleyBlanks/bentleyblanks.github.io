/**
 * Script_Survival.mjs — 资源 / 合成 / 体温 / 失血 / 背包
 * Owner: AgentSystems
 *
 * ⚠ 本文件目前是 **AgentBoot 铺设的签名占位**：API 齐全，数值走 Config + Rules 的纯函数，
 *   但搜刮表 / 使用效果只做最小实现。AgentSystems 接管后整体替换。
 *
 * 红线：弹药受 Config.Combat.AmmoBudget 约束，超预算必须拒绝；搜刮尸体只取弹药，无任何视觉展示。
 */

import { Config } from './Script_Config.mjs';
import { EventNames } from './Script_Event.mjs';
import {
  ComputeWarmthDelta, ComputeStaminaDelta, ComputeBleedDelta, ResolveCraft,
} from './Script_Rules.mjs';

export const ItemIds = Object.freeze({
  Bandage: 'Bandage', Cloth: 'Cloth', Liquor: 'Liquor', Match: 'Match', PineBranch: 'PineBranch',
  Firewood: 'Firewood', Ration: 'Ration', Herb: 'Herb', RifleAmmo: 'RifleAmmo', PistolAmmo: 'PistolAmmo',
  Grenade: 'Grenade', Stone: 'Stone', Knife: 'Knife', Crowbar: 'Crowbar', RadioPart: 'RadioPart',
  Letter: 'Letter', PaddedCoat: 'PaddedCoat', Rope: 'Rope', Lantern: 'Lantern',
});

export function CreateSurvival(ctx, options) {
  const settings = options || {};
  const config = Config.Survival;

  const stats = {
    health: config.maxHealth, maxHealth: config.maxHealth,
    bleeding: false, bleedSeconds: 0,
    stamina: config.maxStamina, maxStamina: config.maxStamina,
    warmth: config.maxWarmth, maxWarmth: config.maxWarmth,
    hunger: config.maxHunger, maxHunger: config.maxHunger,
    wet: 0, clothing: 0.6,
  };
  const ammo = { rifle: 2, pistol: 0 };
  const inventory = [
    { id: ItemIds.RadioPart, count: 1 },
    { id: ItemIds.Match, count: 7 },
    { id: ItemIds.Cloth, count: 1 },
    { id: ItemIds.Crowbar, count: 1 },
  ];
  const recipes = settings.recipes || {};
  let ammoGranted = ammo.rifle;
  let nearFire = false;
  let exposure = 0.5;
  let idleSeconds = 0;
  /* 上一次真正广播出去的体温/体力，用来做变化阈值节流 */
  let lastWarmthSent = stats.warmth;
  let lastWarmthLow = false;
  let lastStaminaSent = stats.stamina;

  function Find(itemId) {
    for (let i = 0; i < inventory.length; i += 1) if (inventory[i].id === itemId) return inventory[i];
    return null;
  }

  const survival = {
    stats: stats,
    ammo: ammo,
    inventory: inventory,

    Has(itemId, count) { const entry = Find(itemId); return !!entry && entry.count >= (count || 1); },
    Count(itemId) { const entry = Find(itemId); return entry ? entry.count : 0; },
    Add(itemId, count, source) {
      const amount = count === undefined ? 1 : count;
      const entry = Find(itemId);
      if (!entry && inventory.length >= config.inventorySlots) {
        return { ok: false, added: 0, reason: 'Full' };
      }
      if (entry) entry.count += amount;
      else inventory.push({ id: itemId, count: amount });
      ctx.bus.Emit(EventNames.ItemPicked, {
        itemId: itemId, count: amount, source: source || 'Unknown', total: survival.Count(itemId),
      });
      return { ok: true, added: amount, reason: 'Ok' };
    },
    Remove(itemId, count) {
      const amount = count === undefined ? 1 : count;
      const entry = Find(itemId);
      if (!entry || entry.count < amount) return false;
      entry.count -= amount;
      if (entry.count <= 0) inventory.splice(inventory.indexOf(entry), 1);
      return true;
    },
    GetCapacity() { return { used: inventory.length, max: config.inventorySlots }; },
    ListInventory() {
      return inventory.map((entry) => ({
        id: entry.id, count: entry.count, name: entry.id, description: '', kind: 'Material',
      }));
    },

    Use(itemId) {
      if (!survival.Has(itemId)) return { ok: false, reason: 'Missing' };
      if (itemId === ItemIds.Bandage) { survival.Remove(itemId, 1); survival.StopBleeding(); survival.Heal(12); return { ok: true, reason: 'Ok' }; }
      if (itemId === ItemIds.Ration) { survival.Remove(itemId, 1); stats.hunger = Math.min(stats.maxHunger, stats.hunger + 30); return { ok: true, reason: 'Ok' }; }
      return { ok: false, reason: 'NotUsable' };
    },
    GetRecipes() { return Object.keys(recipes).map((key) => recipes[key]); },
    CanCraft(recipeId) {
      const result = ResolveCraft(recipeId, inventory, recipes, { nearFire: nearFire });
      return { ok: result.ok, reason: result.reason, missing: result.ok ? [] : result.consumed };
    },
    Craft(recipeId) {
      const result = ResolveCraft(recipeId, inventory, recipes, { nearFire: nearFire });
      if (!result.ok) return { ok: false, reason: result.reason };
      for (let i = 0; i < result.consumed.length; i += 1) survival.Remove(result.consumed[i].id, result.consumed[i].count);
      if (result.produced) survival.Add(result.produced.id, result.produced.count, 'Craft');
      ctx.bus.Emit(EventNames.ItemCrafted, {
        recipeId: recipeId, outputId: result.produced ? result.produced.id : null,
        count: result.produced ? result.produced.count : 0,
      });
      return { ok: true, reason: 'Ok' };
    },

    ApplyDamage(amount, params) {
      if (amount <= 0 || stats.health <= 0) return;
      stats.health = Math.max(0, stats.health - amount);
      const causedBleed = !!(params && params.causesBleed);
      if (causedBleed) survival.StartBleeding();
      ctx.bus.Emit(EventNames.PlayerDamaged, {
        amount: amount, part: params ? params.part : 'Torso', source: params ? params.source : 'Unknown',
        position: params ? params.position || null : null, health: stats.health, causedBleed: causedBleed,
      });
      ctx.bus.Emit(EventNames.HealthChanged, {
        health: stats.health, maxHealth: stats.maxHealth, delta: -amount, bleeding: stats.bleeding,
      });
      if (stats.health <= 0) ctx.bus.Emit(EventNames.PlayerDowned, { reason: params && params.source === 'Cold' ? 'Cold' : 'Shot' });
    },
    Heal(amount) {
      if (amount <= 0) return;
      stats.health = Math.min(stats.maxHealth, stats.health + amount);
      ctx.bus.Emit(EventNames.HealthChanged, {
        health: stats.health, maxHealth: stats.maxHealth, delta: amount, bleeding: stats.bleeding,
      });
    },
    StartBleeding() { stats.bleeding = true; },
    StopBleeding() { stats.bleeding = false; stats.bleedSeconds = 0; },
    SpendStamina(amount) {
      if (stats.stamina < amount) return false;
      stats.stamina -= amount;
      ctx.bus.Emit(EventNames.StaminaChanged, { stamina: stats.stamina, maxStamina: stats.maxStamina, delta: -amount });
      return true;
    },
    RestoreStamina(amount) { stats.stamina = Math.min(stats.maxStamina, stats.stamina + amount); },
    AddWarmth(amount) { stats.warmth = Math.min(stats.maxWarmth, stats.warmth + amount); },
    SetNearFire(value) { nearFire = !!value; },
    SetExposure(value) { exposure = value; },
    SetClothing(level) { stats.clothing = level; },

    GetAmmo(type) { return ammo[type] || 0; },
    AddAmmo(type, count, source) {
      const budget = Config.Combat.AmmoBudget.total;
      const room = Math.max(0, budget - ammoGranted);
      const added = Math.min(room, count);
      if (added <= 0) return 0;
      ammo[type] = (ammo[type] || 0) + added;
      ammoGranted += added;
      ctx.bus.Emit(EventNames.AmmoChanged, { type: type, reserve: ammo[type], loaded: 0, delta: added });
      return added;
    },
    ConsumeAmmo(type, count) {
      const amount = count === undefined ? 1 : count;
      if ((ammo[type] || 0) < amount) return false;
      ammo[type] -= amount;
      ctx.bus.Emit(EventNames.AmmoChanged, { type: type, reserve: ammo[type], loaded: 0, delta: -amount });
      return true;
    },
    GetTotalAmmoGranted() { return ammoGranted; },

    RollLoot() { return []; },
    /** 红线二：只返回弹药，不产生任何视觉展示、不写任何描述性文本。 */
    LootBody() { return [{ id: ItemIds.RifleAmmo, count: 1 }]; },

    Snapshot() {
      return {
        health: stats.health, stamina: stats.stamina, warmth: stats.warmth, hunger: stats.hunger,
        bleeding: stats.bleeding, ammoTotal: ammo.rifle + ammo.pistol,
        itemCount: inventory.length, alive: stats.health > 0,
      };
    },
    IsAlive() { return stats.health > 0; },
    Reset() {
      stats.health = config.maxHealth;
      stats.stamina = config.maxStamina;
      stats.warmth = config.maxWarmth;
      stats.hunger = config.maxHunger;
      stats.bleeding = false;
    },

    Update(dt) {
      if (dt <= 0) return;
      const player = ctx.player;
      const moving = player ? player.state.moving : false;
      const sprinting = player ? player.state.sprinting : false;
      idleSeconds = moving ? 0 : idleSeconds + dt;

      stats.warmth = Math.max(0, Math.min(stats.maxWarmth, stats.warmth + ComputeWarmthDelta({
        exposure: exposure, nearFire: nearFire, indoors: player ? player.state.indoors : false,
        moving: moving, wet: stats.wet > 0.4, clothing: stats.clothing, dt: dt,
      })));
      stats.stamina = Math.max(0, Math.min(stats.maxStamina, stats.stamina + ComputeStaminaDelta({
        sprinting: sprinting, aiming: ctx.combat ? ctx.combat.IsAiming() : false,
        warmth: stats.warmth, health: stats.health, idleSeconds: idleSeconds, dt: dt,
      })));
      if (stats.bleeding) {
        stats.bleedSeconds += dt;
        const delta = ComputeBleedDelta({ bleeding: true, bandaged: false, moving: moving, dt: dt });
        if (delta < 0) survival.ApplyDamage(-delta, { source: 'Bleed' });
      }
      stats.hunger = Math.max(0, stats.hunger - config.hungerDrainPerSecond * dt);

      /* 契约第六节：WarmthChanged / StaminaChanged 的发布者是 Survival。
         逐帧广播会把 HUD 打爆，所以只在跨过 0.5 点或越过"低温"门槛时才发。 */
      const warmthLow = stats.warmth <= stats.maxWarmth * 0.3;
      if (Math.abs(stats.warmth - lastWarmthSent) >= 0.5 || warmthLow !== lastWarmthLow) {
        ctx.bus.Emit(EventNames.WarmthChanged, {
          warmth: stats.warmth, maxWarmth: stats.maxWarmth,
          delta: stats.warmth - lastWarmthSent, low: warmthLow,
        });
        lastWarmthSent = stats.warmth;
        lastWarmthLow = warmthLow;
      }
      if (Math.abs(stats.stamina - lastStaminaSent) >= 0.5) {
        ctx.bus.Emit(EventNames.StaminaChanged, {
          stamina: stats.stamina, maxStamina: stats.maxStamina, delta: stats.stamina - lastStaminaSent,
        });
        lastStaminaSent = stats.stamina;
      }
    },

    Dispose() { inventory.length = 0; },
  };

  return survival;
}

export default CreateSurvival;
