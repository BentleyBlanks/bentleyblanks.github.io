// Independent explosives whitebox; inventory and vehicle lineup follow the
// game's own catalogue rather than maintaining a second incomplete list.
// 2026-11-24 重构：撤掉场内零散摆满的战车横排、色柱与巨型标牌，改为平整试爆场 + 左侧控制面板按需调度；
// 新增特制拉线温雷木柄手榴弹（Data_TimedGrenade / Script_TimedGrenade）与日军躲雷试爆靶组。
import { WEAPONS } from "./Data_Weapons.mjs";
import { RANGE_PHASE } from "./Data_Range.mjs";
import { VEHICLE_EXPLOSIVES } from "./Data_Explosives.mjs";

export const EXPLOSION_RANGE_ID = "ExplosionRange";
export const EXPLOSION_SPAWN = Object.freeze({ x: 2600, z: 2684, ry: 0 });
export const EXPLOSION_VEHICLE_PAD = Object.freeze({ x: 2630, y: 0, z: 2658, targetZ: 2626 });

export const EXPLOSION_GRENADES = Object.values(WEAPONS).filter((w) => w.kind === "throwable").map((weapon, index) => ({
  id: weapon.id, name: weapon.name, x: 2594 + index * 6, y: 1.18, z: 2684,
}));
export const EXPLOSION_VEHICLES = Object.values(WEAPONS).filter((w) => w.kind === "vehicle" && w.side === "ija").map((weapon) => ({
  id: weapon.id, name: weapon.name, x: EXPLOSION_VEHICLE_PAD.x, y: EXPLOSION_VEHICLE_PAD.y, z: EXPLOSION_VEHICLE_PAD.z,
  explosive: VEHICLE_EXPLOSIVES[weapon.id], targetZ: EXPLOSION_VEHICLE_PAD.targetZ,
}));

export const EXPLOSION_RANGE_MARKERS = Object.freeze([10, 15, 20, 25, 30, 40]);
export const EXPLOSION_ENEMY_DISTANCES = Object.freeze([15, 22, 30]);
export const EXPLOSION_ENEMY_MODES = Object.freeze(["evadeHold", "evadeFire", "static"]);
export const EXPLOSION_ENEMY_OFFSETS = Object.freeze([
  Object.freeze([-2.6, -0.6]),
  Object.freeze([-0.9, 0.7]),
  Object.freeze([0.9, -0.5]),
  Object.freeze([2.6, 0.7]),
]);

export const EXPLOSION_BARRAGE = Object.freeze({ radiusM: 16, count: 6, intervalS: 0.72, flightS: 2.8, distanceM: 145 });
export const EXPLOSION_AIRSTRIKE = Object.freeze({
  aircraftId: "MitsubishiKi30", radiusM: 16, count: 4,
  intervalS: 0.2, approachS: 3.5, egressS: 10.5, altitudeM: 36, speedMps: 32,
});
export const EXPLOSION_PATROL = Object.freeze({ minX: 2564, maxX: 2636, z: 2614, count: 3 });

export const EXPLOSION_RANGE_PHASE = {
  ...RANGE_PHASE, id: EXPLOSION_RANGE_ID, sandboxKey: "explosions", glyph: "爆",
  date: "爆炸测试", label: "爆炸测试场", place: "控爆木柄弹 · 躲雷 · 地形形变",
  story: EXPLOSION_RANGE_ID, sky: "testSceneDay", ambience: "overcast", cameraFar: 360, ambientAircraft: false,
  bounds: { minX: 2545, maxX: 2655, minZ: 2495, maxZ: 2700 },
  spawn: EXPLOSION_SPAWN,
  zones: [{ id: "ExplosionTest", name: "爆炸测试场", x: 2600, z: 2662, radius: 5 }],
  objectives: ["特制木柄弹拉线控爆 · 左侧面板按需调度敌军、战车、炮击与空袭"],
  brief: [],
  loadoutOverride: { primary: "HanYang", secondary: null, melee: "Dadao", throwables: { Grenade: 24, GrenadeBundle: 6 }, spareClips: 12 },
};
