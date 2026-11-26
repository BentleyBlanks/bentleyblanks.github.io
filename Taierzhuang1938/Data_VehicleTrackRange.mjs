// 通用车辆车辙测试场纯数据配置（?tracks=1，零 three，可原样 JSON 化）。
// 展示八九式中战车、九四式轻装甲车、灰驴两轮木车并排行驶 + 静态预设交叉车辙，
// 配合低角度擦地机位与真 3D 几何凹陷 A/B 实时对照。

export const VEHICLE_TRACK_RANGE_ID = "VehicleTrackRange";

export const VEHICLE_TRACK_RANGE_WORLD = Object.freeze({
  minX: -36,
  maxX: 36,
  minZ: -36,
  maxZ: 36,
  groundLimit: 48,
});

export const VEHICLE_TRACK_RANGE_CAMERA_FAR = 260;

/** 地面测试分区：中段湿泥带（最深凹陷与积水）+ 东侧压实车道（硬地浅槽对照）+ 北侧缓坡。 */
export const VEHICLE_TRACK_RANGE_ZONES = Object.freeze({
  mudStrip: Object.freeze({ minX: -24, maxX: 12, minZ: -2, maxZ: 12, featherM: 2.2 }),
  hardRoad: Object.freeze({ minX: 10, maxX: 26, minZ: -26, maxZ: 26, featherM: 1.8 }),
  slopeStartZ: -12,
  slopeEndZ: -28,
  slopeHeightM: 1.5,
});

/** 三辆实车行驶轨迹（闭合平滑缓弯，起跑即斜穿静态预置车辙并进入中段湿泥带）。 */
export const VEHICLE_TRACK_RANGE_VEHICLES = Object.freeze([
  Object.freeze({
    id: "type89",
    profile: "type89Tank",
    labelKey: "tracks.vehicle.type89",
    speedMps: 2.55,
    startDistanceM: 14.5,
    waypoints: Object.freeze([
      Object.freeze([-9.5, 22]),
      Object.freeze([-9.2, 12]),
      Object.freeze([-7.8, 3]),
      Object.freeze([-6.2, -5]),
      Object.freeze([-7.5, -16]),
      Object.freeze([-13.5, -21]),
      Object.freeze([-20.5, -15]),
      Object.freeze([-21.5, 4]),
      Object.freeze([-18.5, 19]),
    ]),
  }),
  Object.freeze({
    id: "type94",
    profile: "type94Tankette",
    labelKey: "tracks.vehicle.type94",
    speedMps: 2.85,
    startDistanceM: 15.0,
    waypoints: Object.freeze([
      Object.freeze([0.0, 22]),
      Object.freeze([0.2, 12]),
      Object.freeze([-0.8, 3]),
      Object.freeze([1.4, -5]),
      Object.freeze([0.6, -15]),
      Object.freeze([-3.5, -22]),
      Object.freeze([-14.0, -24]),
      Object.freeze([-17.0, -8]),
      Object.freeze([-14.5, 18]),
      Object.freeze([-6.0, 24]),
    ]),
  }),
  Object.freeze({
    id: "donkeyCart",
    profile: "donkeyCart",
    labelKey: "tracks.vehicle.donkeyCart",
    speedMps: 2.05,
    startDistanceM: 13.5,
    waypoints: Object.freeze([
      Object.freeze([8.5, 21]),
      Object.freeze([8.8, 12]),
      Object.freeze([9.8, 3]),
      Object.freeze([12.2, -5]),
      Object.freeze([12.6, -15]),
      Object.freeze([17.5, -20]),
      Object.freeze([22.5, -12]),
      Object.freeze([22.0, 8]),
      Object.freeze([17.5, 20]),
    ]),
  }),
]);

/** 机位预设（擦地低视角可直观看见真 3D 凹陷、挤泥棱轮廓、GTAO 与 CSM 投射阴影）。 */
export const VEHICLE_TRACK_RANGE_CAMERAS = Object.freeze([
  Object.freeze({
    id: "overview",
    labelKey: "tracks.cam.overview",
    target: Object.freeze([0.2, 0.35, 6.2]),
    radius: 21.0,
    azimuth: 0.34,
    elevation: 0.34,
  }),
  Object.freeze({
    id: "grazing",
    labelKey: "tracks.cam.grazing",
    target: Object.freeze([-1.5, 0.08, 6.2]),
    radius: 7.4,
    azimuth: 0.54,
    elevation: 0.145,
  }),
  Object.freeze({
    id: "tank89",
    labelKey: "tracks.cam.tank89",
    target: Object.freeze([-8.4, 0.25, 9.2]),
    radius: 7.0,
    azimuth: 0.46,
    elevation: 0.24,
  }),
  Object.freeze({
    id: "tankette94",
    labelKey: "tracks.cam.tankette94",
    target: Object.freeze([-0.2, 0.2, 7.8]),
    radius: 6.2,
    azimuth: 0.42,
    elevation: 0.22,
  }),
  Object.freeze({
    id: "donkeyCart",
    labelKey: "tracks.cam.donkeyCart",
    target: Object.freeze([8.9, 0.28, 12.2]),
    radius: 6.4,
    azimuth: 0.36,
    elevation: 0.24,
  }),
  Object.freeze({
    id: "crossing",
    labelKey: "tracks.cam.crossing",
    target: Object.freeze([-0.5, 0.02, 5.4]),
    radius: 5.2,
    azimuth: -0.78,
    elevation: 0.26,
  }),
]);

export const VEHICLE_TRACK_RANGE_STATIONS = Object.freeze([
  Object.freeze({ id: "Type89Lane", name: "八九式中战车车道", x: -8.5, z: 6, radius: 3 }),
  Object.freeze({ id: "Type94Lane", name: "九四式轻装甲车车道", x: 0, z: 6, radius: 3 }),
  Object.freeze({ id: "DonkeyCartLane", name: "灰驴木车车道", x: 9.2, z: 6, radius: 3 }),
  Object.freeze({ id: "CrossingPad", name: "静态交叉车辙区", x: -0.5, z: 5.4, radius: 4 }),
]);

export const VEHICLE_TRACK_RANGE_PHASE = Object.freeze({
  id: VEHICLE_TRACK_RANGE_ID,
  sandbox: true,
  sandboxKey: "tracks",
  sandboxGlyph: "痕",
  date: "轮痕实验",
  label: "车辆轮痕测试场",
  place: "八九式 · 九四式 · 驴车 真 3D 凹陷与交叉碾压",
  sky: "firstLevelBattleDay",
  ambience: "overcast",
  music: null,
  minutes: 600,
  story: VEHICLE_TRACK_RANGE_ID,
  brief: Object.freeze([
    "八九式中战车、九四式轻装甲车与灰驴两轮木车并排驶过松软田土、湿泥带与压实车道，实时压出真 3D 凹陷与两侧挤泥边。",
    "场地中段预置了对角静态交叉压痕；左侧面板可切换低角特写机位、实时开关 3D 几何凹陷 A/B 对照、调节积水湿度或暂停单步。",
  ]),
  objectives: Object.freeze(["对比战车、坦克、驴车的真 3D 凹陷轮痕与交叉碾压"]),
  mechanic: "测试场：独立观察相机，玩家无敌，无敌军与武器。",
  nraPool: 9999,
  poolGain: 0,
  ijaPool: 9999,
  ijaPressure: 0,
  ijaSpawn: Object.freeze([]),
  ijaSupport: Object.freeze([]),
  ijaForce: Object.freeze({ lmgEvery: 13, hmgTeams: 0, engineers: false, armor: 0, motorTransport: "rearOnly" }),
  ambientAircraft: false,
  disarmed: true,
  bounds: VEHICLE_TRACK_RANGE_WORLD,
  cameraFar: VEHICLE_TRACK_RANGE_CAMERA_FAR,
  zones: VEHICLE_TRACK_RANGE_STATIONS,
  spawn: Object.freeze({ x: 0, z: 24, ry: 0 }),
  hud: Object.freeze({ objectiveMarkers: false }),
  externalPlacements: Object.freeze([]),
  loadoutOverride: Object.freeze({
    primary: null,
    secondary: null,
    melee: null,
    throwables: Object.freeze({ Grenade: 0, GrenadeBundle: 0 }),
    spareClips: 0,
    note: "只观察车辙系统，不携带武器。",
  }),
});
