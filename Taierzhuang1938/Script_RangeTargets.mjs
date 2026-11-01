// 玩法测试靶场（?range=1）的木桩兵与取证口 Debug.Range（docs/Data_TestRange.md）。
//
// 木桩兵是**整具正式的 ija Actor**（骨骼、命中箱、倒地、准心识别全走原链路），
// 只是 s.dummy = true 让 AiDirector 跳过 Think —— 不索敌、不开火、不自行走位。
// 「打倒 → 停 RANGE_RESPAWN_S 秒 → 原位复立」由补兵那个 3 秒节拍（测试场插件的 Maintain）顺带驱动。
// 2026-11-01 从 Script_Main 与调试口装配处搬来；注册表与计数跟页面走（换关重建只重撒、不清计数），与搬家前一致。

import { RANGE_PHASE, RANGE_RESPAWN_S, RANGE_STATIONS, RANGE_TARGETS } from "./Data_Range.mjs";
import { WEAPONS } from "./Data_Weapons.mjs";

/** 主文件的工具箱（Script_Main 的 ctx），建测试场时交进来。 */
let ctx = null;

/** 注册表：spec 是 Data_Range.RANGE_TARGETS 里那一条，soldier 是场上这一具。 */
const rangeTargets = [];
const rangeStats = { killed: 0, respawned: 0, resets: 0 };

function SpawnRangeTarget(spec) {
  const s = ctx.ai.Spawn("ija", spec.x, spec.z, {
    weapon: spec.weapon || "Type38", squadId: `Range_${spec.id}`,
  });
  if (!s) return null;
  s.dummy = true;
  s.order = "hold";
  s.holdZone = { id: `Range_${spec.id}`, x: spec.x, z: spec.z, radius: 2 };
  s.goal.set(spec.x, 0, spec.z);
  s.yaw = spec.yaw ?? Math.PI;          // 面朝工位（+Z）；朝向契约见 Data_Tengxian 头注
  s.lookYaw = s.yaw;
  return s;
}

function SeedRangeTargets() {
  rangeTargets.length = 0;
  for (const spec of RANGE_TARGETS) {
    rangeTargets.push({ spec, soldier: SpawnRangeTarget(spec), deadCounted: false });
  }
}

/** 每 3 秒被补兵节拍调一次：清点倒下的、到点的原位复立。 */
function MaintainRangeTargets() {
  for (const entry of rangeTargets) {
    const s = entry.soldier;
    if (s && s.alive) { entry.deadCounted = false; continue; }
    if (s && !s.alive && !entry.deadCounted) { entry.deadCounted = true; rangeStats.killed += 1; }
    if (s && !s.alive && s.deadTime < RANGE_RESPAWN_S) continue;
    if (s) ctx.ai.Remove(s);
    entry.soldier = SpawnRangeTarget(entry.spec);
    entry.deadCounted = false;
    if (entry.soldier) rangeStats.respawned += 1;
  }
}

function RangeTargetSnapshot(entry) {
  const s = entry.soldier;
  return {
    id: entry.spec.id, station: entry.spec.station,
    x: entry.spec.x, z: entry.spec.z,
    alive: !!(s && s.alive),
    health: s ? s.health : 0,
    deadTime: s && !s.alive ? s.deadTime : 0,
    distance: s ? Math.hypot(s.position.x - ctx.player.position.x,
      s.position.z - ctx.player.position.z) : null,
  };
}

/** 取证口 Debug.Range（名字与签名与搬家前一致）。 */
const api = {
    /** 一眼总览：工位、靶况、击倒/复位计数、玩家武器与弹药 —— 验收的唯一入口。 */
    State: () => ({
      stations: RANGE_STATIONS.map((z) => ({ id: z.id, name: z.name, x: z.x, z: z.z })),
      targets: rangeTargets.map(RangeTargetSnapshot),
      stats: { ...rangeStats },
      player: {
        x: ctx.player.position.x, z: ctx.player.position.z, yaw: ctx.player.yaw, pitch: ctx.player.pitch,
        health: ctx.player.health, alive: ctx.player.alive,
        ads: ctx.player.ads, fov: ctx.camera.fov,
        slot: ctx.state.activeSlot, weapon: ctx.currentWeapon,
        ammo: ctx.state.ammo, clips: ctx.state.clips, grenades: ctx.state.grenades,
        bayonetFixed: ctx.state.bayonetFixed,
      },
      pinned: ctx.state.pinned,
      respawnS: RANGE_RESPAWN_S,
    }),
    Targets: () => rangeTargets.map(RangeTargetSnapshot),
    /** 瞬移到某个工位（RangeRifle / RangeGrenade / RangeMelee），面朝各自靶道。 */
    GoTo: (stationId) => {
      const zone = RANGE_STATIONS.find((z) => z.id === stationId);
      if (!zone) return null;
      ctx.player.Spawn(zone.x, zone.z, zone.ry ?? 0);
      return { id: zone.id, x: zone.x, z: zone.z, yaw: ctx.player.yaw };
    },
    /**
     * 把视线摆到某个靶子身上。只摆 yaw/pitch，开火仍走 Debug.Fire ——
     * 散布、后坐、开镜収束照旧全在链路里。
     *
     * offsetY 默认 = **躯干判定中心** COMBAT.hitbox.centerY（与 MarchBullet 读的
     * 是同一份数，判定球半径 COMBAT.hitbox.radius）。两条要知道的账：
     *   · TryFire 是先施加本发的枪口上跳再采样弹道（「顶上去 100%」的设计），
     *     所以首发会比瞄点高出 kick × 距离 —— ADS 下约 0.9°，25 m 处 ≈ 0.4 m。
     *     远靶验命中要么瞄低、要么用近靶（RangeTest 用的 R10）。
     *   · 命中几何只有那一个球（爆头是 TryFire 里按概率抽的，不是几何），
     *     所以别瞄头 —— 那条线从球上方擦过去就是脱靶。
     */
    AimAt: (targetId, offsetY = ctx.HITBOX.centerY) => {
      const entry = rangeTargets.find((e) => e.spec.id === targetId);
      const s = entry ? entry.soldier : null;
      if (!s) return null;
      const from = ctx.player.EyePosition;
      const dx = s.position.x - from.x;
      const dy = (s.position.y + offsetY) - from.y;
      const dz = s.position.z - from.z;
      const horiz = Math.hypot(dx, dz) || 1;
      ctx.player.yaw = Math.atan2(-dx, -dz);
      ctx.player.pitch = Math.atan2(dy, horiz);
      ctx.player.aimYaw = 0;
      ctx.player.aimPitch = 0;
      return { yaw: ctx.player.yaw, pitch: ctx.player.pitch, distance: Math.hypot(dx, dy, dz) };
    },
    /** 整场复位：靶子全部立即重立，玩家满血满弹，击倒/复位计数清零。 */
    Reset: () => {
      for (const entry of rangeTargets) {
        if (entry.soldier) ctx.ai.Remove(entry.soldier);
        entry.soldier = SpawnRangeTarget(entry.spec);
        entry.deadCounted = false;
      }
      rangeStats.killed = 0;
      rangeStats.respawned = 0;
      rangeStats.resets += 1;
      ctx.player.health = 100;
      ctx.player.bleeding = false;
      const loadout = RANGE_PHASE.loadoutOverride;
      ctx.state.mags.primary = { ammo: WEAPONS[loadout.primary].magazine, clips: loadout.spareClips };
      // 副武器是捡来的那支（靶场携行表里没有）：身上有就给它也补满。
      const secondary = ctx.state.slots.secondary;
      ctx.state.mags.secondary = secondary
        ? { ammo: WEAPONS[secondary].magazine, clips: 2 }
        : { ammo: 0, clips: 0 };
      const mag = ctx.state.mags[ctx.state.activeSlot];
      if (mag) { ctx.state.ammo = mag.ammo; ctx.state.clips = mag.clips; }
      ctx.state.grenades = loadout.throwables.Grenade;
      return api.State();
    },
};

/** 测试场插件（Script_SandboxRanges 的 range）用：撒一遍木桩兵，交回补兵节拍与取证口。 */
export function CreateRangeTargets(host) {
  ctx = host.ctx;
  SeedRangeTargets();
  return { debugName: "Range", api, Maintain: MaintainRangeTargets };
}
