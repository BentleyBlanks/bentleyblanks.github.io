// 通用车辆车辙印系统数据表（战车 / 坦克 / 驴车 / 牛马车 / 卡车）。纯数据、零 three、可原样 JSON 化。
//
// 口径与实现见 docs/Data_VehicleTracks.md：
//   · 宏观真 3D 凹陷：稀疏世界锁定高密瓦片（3 m 瓦片，high 档 6.25 cm 格距），真实压低槽底、挤起泥棱，
//     同步进入 Prepass（深度/法线 → GTAO & 接触阴影）、CSM 阴影与地形融合；
//   · 微观高精纹素：复用 GPU 痕迹靶（uTrailMap，2 cm/纹素，+0 片元采样器），叠加履齿、导齿槽、
//     铁箍木轮刮纹、驴蹄印、碎石压平与坑底积水；
//   · 动静同源：运行时动态载具追踪与场景 JSON `vehicleTracks` 静态样条共用同一套底盘接触单元描述。
//
// 所有长度单位米，重量单位吨。局部坐标遵循项目契约 4（−Z 车头、+X 车右、+Y 向上）。

/**
 * 真几何稀疏高密瓦片参数（按画质分档）。
 * tileSizeM = 3.0 m：同时整除常见场景格距 0.75 m（4 格）、0.5 m（6 格）、0.25 m（12 格）、0.2 m（15 格），
 * 与原地形裁切边界严格对齐，零接缝。
 */
export const VEHICLE_TRACK_GEOMETRY = Object.freeze({
  tileSizeM: 3.0,
  maxDepthM: 0.20,
  maxRimM: 0.06,
  /** 重复碾压加深比例：在已有深槽上再压一次叠加 min(old, new) * passDeepenFactor（受 maxDepthM 封顶）。 */
  passDeepenFactor: 0.28,
  /** 槽底与泥棱互斥阈值（米）：槽深超过 hi 时泥棱贡献归零，确保交叉碾压时泥棱不填平旧槽。 */
  rimSuppressDepthM: Object.freeze([0.005, 0.025]),
  /** 泥棱噪声扰动幅度与空间频率（1/米），打破机械直线边。 */
  rimNoiseAmp: 0.28,
  rimNoiseFreq: 3.4,
  /** 槽底微观起伏噪声幅度（极小，保持车辙连续感）。 */
  floorNoiseAmp: 0.08,
  floorNoiseFreq: 4.7,
  /** 单场最多保留的活跃高密瓦片数（3 m 瓦片 × 224 ≈ 2016 m² 活跃车辙面积）。 */
  maxActiveTiles: 224,
  /** 逐地形层软硬倍率：[0 底土 FieldSoil, 1 压实车道 CartTrack, 2 枯草茬 DryStubble, 3 翻土/湿泥 SpoilEarth]。 */
  soilSoftness: Object.freeze([0.95, 0.65, 0.85, 1.12]),
  /** 湿泥区额外软化倍率。 */
  mudZoneMultiplier: 1.24,
  /** 几何法线 y 低于此范围时不压深槽（陡壁/沟崖）。 */
  slopeRange: Object.freeze([0.62, 0.82]),
  /** 各画质档对应的单瓦片格数与活跃距离半径。cellM = tileSizeM / cells。 */
  tiers: Object.freeze({
    low: Object.freeze({ cells: 24, maxDistanceM: 22, maxTiles: 64, enabled: true }),
    medium: Object.freeze({ cells: 36, maxDistanceM: 30, maxTiles: 128, enabled: true }),
    high: Object.freeze({ cells: 48, maxDistanceM: 38, maxTiles: 224, enabled: true }),
    ultra: Object.freeze({ cells: 60, maxDistanceM: 46, maxTiles: 288, enabled: true }),
  }),
});

/**
 * 着色层车辙加强参数（配合 Script_TerrainTrails 的 A 通道宏观车辙深度，零额外片元采样器）。
 *   rutDepthM        A 通道满值对应的宏观深度标尺（米），供积水灌槽、腔体 AO 与太阳方向自阴影使用
 *   cavityAo         深车辙底部的额外间接光腔体遮蔽
 *   waterGain        宏观车辙深度折进地形积水判据的倍率（深槽先积泥水）
 *   selfShadowSteps  高/极致档在地形片元里沿太阳方向做微视差自阴影的步数
 *   selfShadowStrength 视差自阴影压暗强度（仅压直射侧光反差）
 */
export const VEHICLE_TRACK_SURFACE = Object.freeze({
  rutDepthM: 0.16,
  cavityAo: 0.42,
  waterGain: 5.5,
  selfShadowStrength: 0.45,
  selfShadowReachM: 0.28,
});

/**
 * 通用车辆底盘轨道配置表。
 *
 * 每个车型由若干接触单元（contactors）组成：
 *   type: "track" | "wheel" | "hoof"
 *   side: -1（左）| +1（右）| 0（中线）
 *   offsetX / offsetZ: 相对车体局部原点（−Z 前、+X 右）的安装位（米）；
 *     track 设 measureGauge:true 且模型无显式覆写时按局部包围盒半宽 − 半履带宽自动量测。
 *   widthM: 接地带宽（米）；铁箍木轮 0.06–0.08 m，九四式 0.21 m，八九式 0.34 m。
 *   contactLengthM: 接地段长度（米）；履带为整段着地长，车轮为单轮接地印长。
 *   depthM / rimM: 标准松软底土上单次压过的真几何凹槽深 / 两侧挤泥棱高（米）。
 *   rimWidthM: 单侧挤泥棱带宽度（米）。
 *   crossSection: "tankTread" | "tanketteTread" | "ironWheel" | "tire" | "hoof"
 *   stampKind: 对应 TERRAIN_TRAIL_STAMPS 印章名（写入 GPU 痕迹靶 2 cm/纹素微观细节）。
 *   segmentStepM: 连续条带采样步长（米）；越小弯道越顺滑。
 *   pitchM: 履齿 / 胎纹节距（米），仅周期花纹使用。
 *   strength: [R 细部深, G 泥边, B 踩乱, A 宏观车辙深度归一化 0..1]。
 *   steerable: 转向轮标记（前轮转向时自然沿曲线切线产生内轮差）。
 *   strideM / phase: 牲口四蹄步幅（米）与步态相位（0..1）。
 */
export const VEHICLE_TRACK_PROFILES = Object.freeze({
  // 八九式中战车乙型（约 12.8 吨）：全宽 2.18 m、宽履带 0.34 m、着地长 3.6 m、履齿节距 0.14 m。
  type89Tank: Object.freeze({
    id: "type89Tank",
    label: "Type89MediumTank",
    category: "tank",
    weightTons: 12.8,
    onGroundM: 0.75,
    recordWithinM: 400,
    sinkFactor: 0.55,
    skidChurnBoost: 1.45,
    contactors: Object.freeze([
      Object.freeze({
        id: "trackL", type: "track", side: -1, offsetX: -0.92, offsetZ: 0, measureGauge: true,
        widthM: 0.34, contactLengthM: 3.6, depthM: 0.115, rimM: 0.044, rimWidthM: 0.24,
        wallSharpness: 3.6, guideRidge: 0.14, crossSection: "tankTread",
        stampKind: "tread", segmentStepM: 0.28, pitchM: 0.14,
        strength: Object.freeze([1.0, 1.0, 1.0, 0.74]),
      }),
      Object.freeze({
        id: "trackR", type: "track", side: 1, offsetX: 0.92, offsetZ: 0, measureGauge: true,
        widthM: 0.34, contactLengthM: 3.6, depthM: 0.115, rimM: 0.044, rimWidthM: 0.24,
        wallSharpness: 3.6, guideRidge: 0.14, crossSection: "tankTread",
        stampKind: "tread", segmentStepM: 0.28, pitchM: 0.14,
        strength: Object.freeze([1.0, 1.0, 1.0, 0.74]),
      }),
    ]),
  }),

  // 九四式轻装甲车（约 3.4 吨）：实测全宽 1.62 m、长 3.08 m，窄履带 0.21 m、着地长 1.92 m。
  type94Tankette: Object.freeze({
    id: "type94Tankette",
    label: "Type94Tankette",
    category: "tankette",
    weightTons: 3.4,
    onGroundM: 0.65,
    recordWithinM: 400,
    sinkFactor: 0.48,
    skidChurnBoost: 1.35,
    contactors: Object.freeze([
      Object.freeze({
        id: "trackL", type: "track", side: -1, offsetX: -0.66, offsetZ: 0.04, measureGauge: true,
        widthM: 0.21, contactLengthM: 1.92, depthM: 0.082, rimM: 0.032, rimWidthM: 0.17,
        wallSharpness: 3.4, guideRidge: 0.12, crossSection: "tanketteTread",
        stampKind: "tanketteTread", segmentStepM: 0.20, pitchM: 0.095,
        strength: Object.freeze([0.96, 0.92, 0.95, 0.54]),
      }),
      Object.freeze({
        id: "trackR", type: "track", side: 1, offsetX: 0.66, offsetZ: 0.04, measureGauge: true,
        widthM: 0.21, contactLengthM: 1.92, depthM: 0.082, rimM: 0.032, rimWidthM: 0.17,
        wallSharpness: 3.4, guideRidge: 0.12, crossSection: "tanketteTread",
        stampKind: "tanketteTread", segmentStepM: 0.20, pitchM: 0.095,
        strength: Object.freeze([0.96, 0.92, 0.95, 0.54]),
      }),
    ]),
  }),

  // 老耿驴车（Model_DonkeyCart.glb 实测宽 1.652 m、车板宽 1.075 m、轮半径 0.40 m、步幅 0.68 m）：
  // 超窄铁箍木轮（接地宽 6.8 cm）压强高，切出深窄锐利 V/U 槽 + 尖锐挤泥脊，车前四蹄在双轮间踩出蹄印。
  donkeyCart: Object.freeze({
    id: "donkeyCart",
    label: "DonkeyCart",
    category: "cart",
    weightTons: 0.65,
    onGroundM: 0.65,
    recordWithinM: 400,
    sinkFactor: 0.45,
    skidChurnBoost: 1.15,
    contactors: Object.freeze([
      Object.freeze({
        id: "wheelL", type: "wheel", side: -1, offsetX: -0.68, offsetZ: 1.28, nodeName: "WheelLeft",
        widthM: 0.068, contactLengthM: 0.20, depthM: 0.094, rimM: 0.035, rimWidthM: 0.12,
        wallSharpness: 3.4, guideRidge: 0, crossSection: "ironWheel",
        stampKind: "ironWheel", segmentStepM: 0.16,
        strength: Object.freeze([0.98, 0.95, 0.9, 0.62]),
      }),
      Object.freeze({
        id: "wheelR", type: "wheel", side: 1, offsetX: 0.68, offsetZ: 1.28, nodeName: "WheelRight",
        widthM: 0.068, contactLengthM: 0.20, depthM: 0.094, rimM: 0.035, rimWidthM: 0.12,
        wallSharpness: 3.4, guideRidge: 0, crossSection: "ironWheel",
        stampKind: "ironWheel", segmentStepM: 0.16,
        strength: Object.freeze([0.98, 0.95, 0.9, 0.62]),
      }),
      Object.freeze({
        id: "hoofFL", type: "hoof", side: -1, offsetX: -0.13, offsetZ: -0.58,
        widthM: 0.078, contactLengthM: 0.092, depthM: 0.044, rimM: 0.017, rimWidthM: 0.055,
        wallSharpness: 2.2, guideRidge: 0, crossSection: "hoof",
        stampKind: "hoof", strideM: 0.68, phase: 0.0,
        strength: Object.freeze([0.9, 0.78, 0.85, 0.28]),
      }),
      Object.freeze({
        id: "hoofFR", type: "hoof", side: 1, offsetX: 0.13, offsetZ: -0.58,
        widthM: 0.078, contactLengthM: 0.092, depthM: 0.044, rimM: 0.017, rimWidthM: 0.055,
        wallSharpness: 2.2, guideRidge: 0, crossSection: "hoof",
        stampKind: "hoof", strideM: 0.68, phase: 0.5,
        strength: Object.freeze([0.9, 0.78, 0.85, 0.28]),
      }),
      Object.freeze({
        id: "hoofRL", type: "hoof", side: -1, offsetX: -0.14, offsetZ: 0.08,
        widthM: 0.072, contactLengthM: 0.092, depthM: 0.042, rimM: 0.016, rimWidthM: 0.055,
        wallSharpness: 2.2, guideRidge: 0, crossSection: "hoof",
        stampKind: "hoof", strideM: 0.68, phase: 0.25,
        strength: Object.freeze([0.88, 0.75, 0.82, 0.26]),
      }),
      Object.freeze({
        id: "hoofRR", type: "hoof", side: 1, offsetX: 0.14, offsetZ: 0.08,
        widthM: 0.072, contactLengthM: 0.092, depthM: 0.042, rimM: 0.016, rimWidthM: 0.055,
        wallSharpness: 2.2, guideRidge: 0, crossSection: "hoof",
        stampKind: "hoof", strideM: 0.68, phase: 0.75,
        strength: Object.freeze([0.88, 0.75, 0.82, 0.26]),
      }),
    ]),
  }),

  // 撤运牛马车（Script_DraftCartModel：双轮木大车 + 独立挂接的牛/马）：
  oxCart: Object.freeze({
    id: "oxCart",
    label: "WoodenEvacCart",
    category: "cart",
    weightTons: 1.1,
    onGroundM: 0.7,
    recordWithinM: 400,
    sinkFactor: 0.45,
    skidChurnBoost: 1.15,
    contactors: Object.freeze([
      Object.freeze({
        id: "wheelL", type: "wheel", side: -1, offsetX: -0.82, offsetZ: 0, nodeName: "WheelLeft",
        widthM: 0.078, contactLengthM: 0.22, depthM: 0.068, rimM: 0.024, rimWidthM: 0.12,
        wallSharpness: 3.0, guideRidge: 0, crossSection: "ironWheel",
        stampKind: "ironWheel", segmentStepM: 0.18,
        strength: Object.freeze([0.72, 0.62, 0.35, 0.25]),
      }),
      Object.freeze({
        id: "wheelR", type: "wheel", side: 1, offsetX: 0.82, offsetZ: 0, nodeName: "WheelRight",
        widthM: 0.078, contactLengthM: 0.22, depthM: 0.068, rimM: 0.024, rimWidthM: 0.12,
        wallSharpness: 3.0, guideRidge: 0, crossSection: "ironWheel",
        stampKind: "ironWheel", segmentStepM: 0.18,
        strength: Object.freeze([0.72, 0.62, 0.35, 0.25]),
      }),
      Object.freeze({
        id: "hoofFL", type: "hoof", side: -1, offsetX: -0.18, offsetZ: -2.4, animalSpace: true,
        widthM: 0.105, contactLengthM: 0.115, depthM: 0.052, rimM: 0.02, rimWidthM: 0.065,
        wallSharpness: 2.1, guideRidge: 0, crossSection: "hoof",
        stampKind: "hoof", strideM: 1.05, phase: 0.0,
        strength: Object.freeze([0.92, 0.82, 0.88, 0.34]),
      }),
      Object.freeze({
        id: "hoofFR", type: "hoof", side: 1, offsetX: 0.18, offsetZ: -2.4, animalSpace: true,
        widthM: 0.105, contactLengthM: 0.115, depthM: 0.052, rimM: 0.02, rimWidthM: 0.065,
        wallSharpness: 2.1, guideRidge: 0, crossSection: "hoof",
        stampKind: "hoof", strideM: 1.05, phase: 0.5,
        strength: Object.freeze([0.92, 0.82, 0.88, 0.34]),
      }),
      Object.freeze({
        id: "hoofRL", type: "hoof", side: -1, offsetX: -0.18, offsetZ: -1.65, animalSpace: true,
        widthM: 0.10, contactLengthM: 0.115, depthM: 0.05, rimM: 0.019, rimWidthM: 0.065,
        wallSharpness: 2.1, guideRidge: 0, crossSection: "hoof",
        stampKind: "hoof", strideM: 1.05, phase: 0.25,
        strength: Object.freeze([0.9, 0.8, 0.86, 0.32]),
      }),
      Object.freeze({
        id: "hoofRR", type: "hoof", side: 1, offsetX: 0.18, offsetZ: -1.65, animalSpace: true,
        widthM: 0.10, contactLengthM: 0.115, depthM: 0.05, rimM: 0.019, rimWidthM: 0.065,
        wallSharpness: 2.1, guideRidge: 0, crossSection: "hoof",
        stampKind: "hoof", strideM: 1.05, phase: 0.75,
        strength: Object.freeze([0.9, 0.8, 0.86, 0.32]),
      }),
    ]),
  }),

  // 九四式六轮货车（6x4 三轴充气胶胎，预留扩展：前单轮转向产生内轮差，中后双胎并排压宽辙）。
  type94Truck: Object.freeze({
    id: "type94Truck",
    label: "IsuzuType94Truck",
    category: "truck",
    weightTons: 4.5,
    onGroundM: 0.75,
    recordWithinM: 400,
    sinkFactor: 0.42,
    skidChurnBoost: 1.25,
    contactors: Object.freeze([
      Object.freeze({
        id: "wheelFL", type: "wheel", side: -1, offsetX: -0.78, offsetZ: -1.75, steerable: true,
        widthM: 0.19, contactLengthM: 0.26, depthM: 0.062, rimM: 0.022, rimWidthM: 0.14,
        wallSharpness: 2.0, guideRidge: 0, crossSection: "tire",
        stampKind: "tire", segmentStepM: 0.22,
        strength: Object.freeze([0.9, 0.82, 0.9, 0.42]),
      }),
      Object.freeze({
        id: "wheelFR", type: "wheel", side: 1, offsetX: 0.78, offsetZ: -1.75, steerable: true,
        widthM: 0.19, contactLengthM: 0.26, depthM: 0.062, rimM: 0.022, rimWidthM: 0.14,
        wallSharpness: 2.0, guideRidge: 0, crossSection: "tire",
        stampKind: "tire", segmentStepM: 0.22,
        strength: Object.freeze([0.9, 0.82, 0.9, 0.42]),
      }),
      Object.freeze({
        id: "wheelRL", type: "wheel", side: -1, offsetX: -0.78, offsetZ: 1.55,
        widthM: 0.34, contactLengthM: 0.32, depthM: 0.072, rimM: 0.026, rimWidthM: 0.18,
        wallSharpness: 2.1, guideRidge: 0.22, crossSection: "tire",
        stampKind: "tire", segmentStepM: 0.22,
        strength: Object.freeze([0.94, 0.88, 0.94, 0.48]),
      }),
      Object.freeze({
        id: "wheelRR", type: "wheel", side: 1, offsetX: 0.78, offsetZ: 1.55,
        widthM: 0.34, contactLengthM: 0.32, depthM: 0.072, rimM: 0.026, rimWidthM: 0.18,
        wallSharpness: 2.1, guideRidge: 0.22, crossSection: "tire",
        stampKind: "tire", segmentStepM: 0.22,
        strength: Object.freeze([0.94, 0.88, 0.94, 0.48]),
      }),
    ]),
  }),
});

/** 兼容旧名与外部资产 ID 的别名映射（纯数据）。 */
export const VEHICLE_TRACK_ALIASES = Object.freeze({
  type89: "type89Tank",
  Type89Tank: "type89Tank",
  Type89MediumTank: "type89Tank",
  type89MediumTank: "type89Tank",
  type94: "type94Tankette",
  Type94Tankette: "type94Tankette",
  tankette: "type94Tankette",
  DonkeyCart: "donkeyCart",
  ditchDonkeyCart: "donkeyCart",
  OxCart: "oxCart",
  woodenEvacCart: "oxCart",
  IsuzuType94Truck: "type94Truck",
});
