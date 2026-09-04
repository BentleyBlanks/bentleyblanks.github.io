// Independent explosives whitebox; inventory and vehicle lineup follow the
// game's own catalogue rather than maintaining a second incomplete list.
import { WEAPONS } from "./Data_Weapons.mjs";
import { RANGE_PHASE } from "./Data_Range.mjs";
import { VEHICLE_EXPLOSIVES } from "./Data_Explosives.mjs";

export const EXPLOSION_RANGE_ID = "ExplosionRange";
export const EXPLOSION_GRENADES = Object.values(WEAPONS).filter((w) => w.kind === "throwable").map((weapon, index) => ({
  id: weapon.id, name: weapon.name, x: 2588 + index * 6, y: 1.18, z: 2681,
}));
export const EXPLOSION_VEHICLES = Object.values(WEAPONS).filter((w) => w.kind === "vehicle" && w.side === "ija").map((weapon, index) => ({
  id: weapon.id, name: weapon.name, x: 2578 + index * 22, y: 0, z: 2655,
  explosive: VEHICLE_EXPLOSIVES[weapon.id], targetZ: 2626,
}));
export const EXPLOSION_CONTROLS = {
  barrage: { id: "ExplosionBarrage", x: 2610, y: 1.2, z: 2681, label: "呼叫远程炮击", color: 0xffb12e },
  return: { id: "ExplosionReturn", x: 2578, y: 1.2, z: 2681, label: "练习拾雷返掷", color: 0x48d9b1 },
  reset: { id: "ExplosionReset", x: 2624, y: 1.2, z: 2681, label: "清空炮坑与在途弹", color: 0x70bfff },
  airstrike: { id: "ExplosionAirstrike", x: 2638, y: 1.2, z: 2681, label: "召唤飞机投弹", color: 0xc6a0ff },
};
export const EXPLOSION_BARRAGE = { radiusM: 16, count: 6, intervalS: 0.72, flightS: 2.8, distanceM: 145 };
export const EXPLOSION_AIRSTRIKE = { aircraftId: "MitsubishiKi30", radiusM: 16, count: 4,
  intervalS: 0.2, approachS: 3.5, egressS: 10.5, altitudeM: 36, speedMps: 32 };
export const EXPLOSION_PATROL = { minX: 2564, maxX: 2636, z: 2614, count: 3 };
export const EXPLOSION_RANGE_PHASE = {
  ...RANGE_PHASE, id: EXPLOSION_RANGE_ID, sandboxKey: "explosions", glyph: "爆",
  date: "爆炸测试", label: "爆炸测试场", place: "爆炸 · 返掷 · 地形形变",
  story: EXPLOSION_RANGE_ID, sky: "p012WhiteboxDay", ambience: "overcast", cameraFar: 360, ambientAircraft: false,
  bounds: { minX: 2545, maxX: 2655, minZ: 2495, maxZ: 2700 },
  spawn: { x: 2600, z: 2692, ry: 0 },
  zones: [{ id: "ExplosionTest", name: "爆炸测试场", x: 2600, z: 2668, radius: 5 }],
  objectives: ["F 交互 · G/H 投弹 · 橙色台炮击 · 紫色台召唤飞机"],
  brief: ["桌上备齐木柄与集束手榴弹。按 F 领取，G/H 按住蓄力、松开投出；靠近活手雷按 F 返掷，引信继续倒计时。",
    "三辆战车依次为八九式、九五式、九七式。走到车尾按 F 向前开一炮。橙色台呼叫远程炮击，紫色台召唤飞机投弹；蓝色台恢复地形并结束空袭。"],
  loadoutOverride: { primary: "HanYang", secondary: "Mauser96", melee: "Dadao", throwables: { Grenade: 0, GrenadeBundle: 0 }, spareClips: 12 },
};
