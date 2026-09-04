// Independent ?weapons=1 firearm whitebox. Pure data: never import three.
// X east / Y up / Z south, metres. Distances are horizontal radii measured from
// WEAPON_RANGE_FIRING_ORIGIN, not the length of the north/south projection.
// Each target owns an angular corridor; moving targets stay on their measured
// radius. The complete movement envelope remains clear of every other actor.
import { WEAPONS } from "./Data_Weapons.mjs";

export const WEAPON_RANGE_LEVEL_ID = "WeaponRange";
export const WEAPON_RANGE_CAMERA_FAR = 340;
export const WEAPON_RANGE_RESPAWN_S = 3;
export const WEAPON_RANGE_FIRING_ORIGIN = Object.freeze({ x: 2400, y: 0, z: 2460 });
export const WEAPON_RANGE_WORLD = Object.freeze({
  minX: 2350, maxX: 2460, minZ: 2242, maxZ: 2480, groundLimit: 3100,
});

// Dynamic catalog: new firearms automatically receive a place on the first table.
// GUNS contains the immutable source weapon definitions; WEAPONS contains slots.
export const WEAPON_RANGE_GUNS = Object.freeze(Object.values(WEAPONS)
  .filter(weapon => weapon.ammo && Number.isFinite(weapon.magazine) && weapon.magazine > 0));
const slotSpacing = 1.7;
export const WEAPON_RANGE_TABLE = Object.freeze({
  id: "WeaponRangeTable", x: 2400, z: 2466, width: WEAPON_RANGE_GUNS.length * slotSpacing + 0.8,
  depth: 1.45, topY: 0.92, slabHeight: 0.14, slotSpacing, pickupZ: 2467.2,
});
export const WEAPON_RANGE_WEAPONS = Object.freeze(WEAPON_RANGE_GUNS.map((weapon, slot) => Object.freeze({
  id: weapon.id, weaponId: weapon.id, name: weapon.name, kind: weapon.kind, slot,
  x: WEAPON_RANGE_TABLE.x + (slot - (WEAPON_RANGE_GUNS.length - 1) / 2) * slotSpacing,
  y: WEAPON_RANGE_TABLE.topY + 0.10, z: WEAPON_RANGE_TABLE.z, ry: 0,
  pickupZ: WEAPON_RANGE_TABLE.pickupZ,
  pickupPosition: Object.freeze({
    x: WEAPON_RANGE_TABLE.x + (slot - (WEAPON_RANGE_GUNS.length - 1) / 2) * slotSpacing,
    y: 0, z: WEAPON_RANGE_TABLE.z + WEAPON_RANGE_TABLE.depth / 2 + 0.75,
  }),
})));
export const WEAPON_RANGE_STATIONS = Object.freeze([
  { id: "WeaponRangeTable", name: "枪械长桌 · F 领取", x: 2400, z: 2468.5, radius: 3, ry: 0 },
  { id: "WeaponRangeFire", name: "蓝色测距点 · 静靶左 / 动靶右", ...WEAPON_RANGE_FIRING_ORIGIN, radius: 1, ry: 0 },
]);

// A half-metre actor envelope includes the uniform, arms and held weapon. The
// small gap between envelopes is angular (not a distance-dependent guess).
export const WEAPON_RANGE_TARGET_HALF_WIDTH_M = 0.5;
export const WEAPON_RANGE_CORRIDOR_GAP_RAD = 0.003;
function BuildWeaponRangeTargets() {
  const targets = [];
  let staticEdge = 0.025;
  let movingEdge = 0.025;
  for (let distanceM = 200; distanceM >= 10; distanceM -= 10) {
    for (const moving of [false, true]) {
      const amplitudeM = moving ? 0.45 + distanceM * 0.0015 : 0;
      const amplitudeRad = amplitudeM / distanceM;
      const bodyHalfAngle = Math.asin(WEAPON_RANGE_TARGET_HALF_WIDTH_M / distanceM);
      const halfAngle = bodyHalfAngle + amplitudeRad;
      const edge = moving ? movingEdge : staticEdge;
      const angleRad = (moving ? 1 : -1) * (edge + halfAngle);
      const x = WEAPON_RANGE_FIRING_ORIGIN.x + Math.sin(angleRad) * distanceM;
      const z = WEAPON_RANGE_FIRING_ORIGIN.z - Math.cos(angleRad) * distanceM;
      const target = {
        id: `${moving ? "M" : "S"}${distanceM}`, station: "WeaponRangeFire",
        distanceM, moving, x, y: 0, z, baseX: x, baseY: 0, baseZ: z, angleRad,
        // actor fronts are local -Z: this yaw faces the measuring point.
        ry: Math.PI - angleRad,
        motion: Object.freeze({ amplitudeM, amplitudeRad, angularSpeedRadS: moving ? 1.15 : 0,
          phaseRad: 0, minAngleRad: angleRad - halfAngle, maxAngleRad: angleRad + halfAngle }),
      };
      targets.push(Object.freeze(target));
      if (moving) movingEdge = edge + 2 * halfAngle + WEAPON_RANGE_CORRIDOR_GAP_RAD;
      else staticEdge = edge + 2 * halfAngle + WEAPON_RANGE_CORRIDOR_GAP_RAD;
    }
  }
  return targets.sort((a, b) => a.distanceM - b.distanceM || Number(a.moving) - Number(b.moving));
}
export const WEAPON_RANGE_TARGETS = Object.freeze(BuildWeaponRangeTargets());

/** Review cameras, consumed by the shared browser screenshot kit. */
export const WEAPON_RANGE_VIEWS = Object.freeze([
  { id: "Overview", x: 2388, y: 11, z: 2480, lookX: 2408, lookY: 0, lookZ: 2390 },
  { id: "Table", x: 2400, y: 2.8, z: 2471, lookX: 2400, lookY: 0.85, lookZ: 2465 },
  { id: "TableWide", x: 2400, y: 4.5, z: 2479, lookX: 2400, lookY: 0.85, lookZ: 2466 },
  { id: "Far", x: 2400, y: 1.65, z: 2460, lookX: 2400, lookY: 1.1, lookZ: 2260 },
]);

/** The runtime must sample this position, so movement never changes distance. */
export function SampleWeaponRangeTargetPosition(target, timeS = 0) {
  const motion = target.motion;
  const angle = target.angleRad + motion.amplitudeRad
    * Math.sin(timeS * motion.angularSpeedRadS + motion.phaseRad);
  return { x: WEAPON_RANGE_FIRING_ORIGIN.x + Math.sin(angle) * target.distanceM,
    y: 0, z: WEAPON_RANGE_FIRING_ORIGIN.z - Math.cos(angle) * target.distanceM,
    ry: Math.PI - angle };
}

export const WEAPON_RANGE_PHASE = {
  id: WEAPON_RANGE_LEVEL_ID, sandbox: true, sandboxKey: "weapons", sandboxGlyph: "枪",
  whitebox: { triggerAimBeforeRecoil: true, cleanSight: true, allowUndeployedAds: true },
  date: "枪械白盒", label: "枪械白盒靶场", place: "独立测试场 · 全枪械 / 无限弹药",
  sky: "weaponRangeDay", music: null, minutes: 600,
  brief: ["出生前方长桌按 F 领取枪械。所有枪械无限弹药；静靶在左、动靶在右。",
    "蓝色圆点是测距原点：各靶与圆点的水平直线距离为 10–200 米。移动靶沿等距圆弧往返。"],
  story: WEAPON_RANGE_LEVEL_ID, cutsceneIn: null, cutsceneOut: null,
  objectives: ["长桌领取枪械", "蓝色测距点试射 · 静靶 / 动靶"],
  mechanic: "真实枪械与命中链；无限弹药，目标倒地后自动复位。",
  nraPool: 9999, poolGain: 0, ijaPool: 9999, ijaPressure: 0, ijaSpawn: [], ijaSupport: [],
  ijaForce: { lmgEvery: 13, hmgTeams: 0, engineers: false, armor: 0, motorTransport: "rearOnly" },
  bounds: { ...WEAPON_RANGE_WORLD }, cameraFar: WEAPON_RANGE_CAMERA_FAR,
  zones: WEAPON_RANGE_STATIONS, spawn: { x: 2400, z: 2468.5, ry: 0 },
  loadoutOverride: { primary: "HanYang", secondary: null, melee: "Dadao",
    throwables: { Grenade: 0, GrenadeBundle: 0 }, spareClips: 12, note: "长桌可领取全部枪械。" },
};
