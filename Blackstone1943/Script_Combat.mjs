/**
 * Script_Combat.mjs — 武器 / 近战 / 投掷 / 伤害 / 潜行处决
 * Owner: AgentSystems
 *
 * ⚠ 本文件目前是 **AgentBoot 铺设的签名占位**：API 齐全、形状正确、不抛错，
 *   但只做最小行为。AgentSystems 接管后整体替换。
 *
 * 红线：全流程弹药 ≤ 12 发；栓动步枪每发要拉栓；命中要 hitstop；处决无炫技、无血腥展示。
 */

import * as THREE from 'three';
import { Config } from './Script_Config.mjs';
import * as MathUtil from './Script_Math.mjs';
import { EventNames } from './Script_Event.mjs';

const WeaponDefs = {
  None: { id: 'None', kind: 'Melee', damage: 0, magazine: 0, boltAction: false, fireCooldown: 0.4, reloadSeconds: 0, boltSeconds: 0, noiseRadius: 0, recoil: 0, spreadBase: 0, falloffStart: 0, falloffEnd: 1, ammoType: 'none', label: '空手' },
  RifleZhongzheng: { id: 'RifleZhongzheng', kind: 'Rifle', damage: 78, magazine: 5, boltAction: true, fireCooldown: 0.35, reloadSeconds: 3.4, boltSeconds: 1.05, noiseRadius: Config.Stealth.Noise.gunshotRifle, recoil: 1.0, spreadBase: 0.004, falloffStart: 40, falloffEnd: 140, ammoType: 'rifle', label: '中正式' },
  PistolMauser: { id: 'PistolMauser', kind: 'Pistol', damage: 46, magazine: 10, boltAction: false, fireCooldown: 0.22, reloadSeconds: 2.6, boltSeconds: 0, noiseRadius: Config.Stealth.Noise.gunshotPistol, recoil: 0.7, spreadBase: 0.012, falloffStart: 14, falloffEnd: 45, ammoType: 'pistol', label: '盒子炮' },
  KnifeBayonet: { id: 'KnifeBayonet', kind: 'Melee', damage: Config.Combat.meleeLightDamage, magazine: 0, boltAction: false, fireCooldown: 0.5, reloadSeconds: 0, boltSeconds: 0, noiseRadius: Config.Stealth.Noise.meleeHit, recoil: 0, spreadBase: 0, falloffStart: 0, falloffEnd: 2, ammoType: 'none', label: '刺刀' },
  Shovel: { id: 'Shovel', kind: 'Melee', damage: Config.Combat.meleeHeavyDamage, magazine: 0, boltAction: false, fireCooldown: 0.8, reloadSeconds: 0, boltSeconds: 0, noiseRadius: Config.Stealth.Noise.meleeHit, recoil: 0, spreadBase: 0, falloffStart: 0, falloffEnd: 2, ammoType: 'none', label: '铁锹' },
};

export function CreateCombat(ctx, options) {
  const THREEns = ctx.THREE || THREE;
  const hittables = new Map();
  const equipped = { id: 'None', loaded: 0, reserve: 0, chambered: false, ready: true, cooldown: 0 };
  const aimState = { spread: 0, swayX: 0, swayY: 0, braced: false, holdSeconds: 0 };
  let aiming = false;
  let blocking = false;
  let invulnerableSeconds = 0;
  let throwItem = null;

  const combat = {
    hitstop: 0,

    GetWeaponDef(weaponId) { return WeaponDefs[weaponId] || null; },
    ListWeapons() { return Object.keys(WeaponDefs); },
    EquipPlayerWeapon(weaponId) {
      if (!WeaponDefs[weaponId]) return false;
      equipped.id = weaponId;
      equipped.loaded = 0;
      equipped.chambered = false;
      equipped.cooldown = 0;
      if (ctx.player) ctx.player.SetWeaponDrawn(weaponId);
      return true;
    },
    GetEquipped() { return equipped; },

    BeginAim() { aiming = true; if (ctx.art) ctx.art.SetAimMode(true); },
    EndAim() { aiming = false; aimState.holdSeconds = 0; if (ctx.art) ctx.art.SetAimMode(false); },
    IsAiming() { return aiming; },
    GetAimState() { return aimState; },
    TryFire() { return { ok: false, reason: 'NoWeapon', hit: null }; },
    TryCycleBolt() { return false; },
    TryReload() { return false; },

    TryMelee() { return false; },
    SetBlocking(value) { blocking = !!value; },
    TryDodge() { return false; },
    IsInvulnerable() { return invulnerableSeconds > 0; },

    BeginThrow(itemId) { throwItem = itemId; return true; },
    GetThrowPreview(charge, out) {
      const points = out || [];
      points.length = 0;
      if (!ctx.player) return points;
      const ray = ctx.player.GetAimRay();
      const speed = MathUtil.Lerp(6, 16, MathUtil.Clamp01(charge));
      for (let i = 0; i < 18; i += 1) {
        const t = i * 0.08;
        points.push(new THREEns.Vector3(
          ray.origin.x + ray.direction.x * speed * t,
          ray.origin.y + ray.direction.y * speed * t - 4.9 * t * t,
          ray.origin.z + ray.direction.z * speed * t,
        ));
      }
      return points;
    },
    ReleaseThrow(charge) {
      if (!throwItem || !ctx.player) return false;
      const points = combat.GetThrowPreview(charge);
      const landing = points.length > 0 ? points[points.length - 1] : ctx.player.position;
      ctx.bus.Emit(EventNames.ThrowLanded, {
        itemId: throwItem, position: landing,
        radius: throwItem === 'Grenade' ? Config.Stealth.Noise.grenade : Config.Stealth.Noise.stone,
        sourceId: 'Player',
      });
      throwItem = null;
      return true;
    },
    CancelThrow() { throwItem = null; },

    CanStealthKill() { return { ok: false, target: null, reason: 'NotImplemented' }; },
    TryStealthKill() { return false; },

    ResolveShot() { return null; },
    ApplyExplosion() { /* 占位 */ },
    ApplyDamageToPlayer(amount, params) {
      if (ctx.survival) ctx.survival.ApplyDamage(amount, params);
    },
    RegisterHittable(handle) {
      hittables.set(handle.id, handle);
      return () => hittables.delete(handle.id);
    },

    Update(dt) {
      if (dt <= 0) return;
      if (equipped.cooldown > 0) equipped.cooldown = Math.max(0, equipped.cooldown - dt);
      if (invulnerableSeconds > 0) invulnerableSeconds = Math.max(0, invulnerableSeconds - dt);
      if (combat.hitstop > 0) combat.hitstop = Math.max(0, combat.hitstop - dt);
      if (aiming) {
        aimState.holdSeconds += dt;
        const survival = ctx.survival ? ctx.survival.stats : null;
        const sway = ctx.rules.ComputeAimSway({
          holdSeconds: aimState.holdSeconds,
          stamina: survival ? survival.stamina : Config.Survival.maxStamina,
          health: survival ? survival.health : Config.Survival.maxHealth,
          braced: aimState.braced,
          crouched: ctx.player ? ctx.player.state.stance === 'Crouch' : false,
          prone: ctx.player ? ctx.player.state.stance === 'Prone' : false,
          moving: ctx.player ? ctx.player.state.moving : false,
          warmth: survival ? survival.warmth : Config.Survival.maxWarmth,
          time: ctx.elapsed,
        });
        aimState.spread = sway.spread;
        aimState.swayX = sway.swayX;
        aimState.swayY = sway.swayY;
      }
    },

    Dispose() { hittables.clear(); },
  };

  combat.IsBlocking = function IsBlocking() { return blocking; };
  if (options && options.startingWeapon) combat.EquipPlayerWeapon(options.startingWeapon);
  return combat;
}

export default CreateCombat;
