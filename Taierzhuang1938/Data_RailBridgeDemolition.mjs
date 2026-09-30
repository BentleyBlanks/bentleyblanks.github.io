// ===========================================================================
// Data_RailBridgeDemolition.mjs —— 北沙河铁路桥模型与「奉令毁桥」演出的数据表（零 three）
//
// 口径：docs/Data_RailBridge.md。模型与坍塌关键帧由 _blender/Script_BuildRailBridge.py
// 烘成 Model/Model_RailBridge.glb + Model/Data_RailBridge.json；这里只放运行时要的
// 地址、材质映射、替换哪些白盒件，以及起爆之后那几秒的特效分量。
// 判定（等人走净、看着桥、按下起爆器）在 Script_FirstLevelBridge，数值在 Data_Tuning_FirstLevelEnd。
// ===========================================================================
import { MISSION_RAIL_BRIDGE } from "./Data_FirstLevelMissionTopology.mjs";

export const RAIL_BRIDGE_MODEL = Object.freeze({
  // 模型与件表各自一个戳：重烘之后两边一起 +1（Script_RailBridgeTest 核对两者出自同一次烘焙）。
  url: "./Model/Model_RailBridge.glb?v=20260930d",
  dataUrl: "./Model/Data_RailBridge.json?v=20260930d",
  origin: Object.freeze({ x: MISSION_RAIL_BRIDGE.x, z: MISSION_RAIL_BRIDGE.z }),
  // GLB 里的材质名（RailBridge<Key>）→ 材质库配方 + 线性色调（乘在配方底图上，可以大于 1）。
  // **别用 "Steel"**：那是枪械的发蓝钢（底图均值 45/255、满金属度），挂到桥上在这条管线里是一片黑。
  // 桥钢取车厢地板那张涂装钢（均值 72/255、锈 0.12），金属度压到 0.12 —— 漆面本来就不是金属反射，
  // 再乘 1.8 抬成一九一〇年代津浦线常见的旧灰漆。料石取城墙石，枕木与桥面板取风化的手推车木。
  // 纯 three 材质在这条管线里同样出黑（没过材质补丁），所以兜底也只在材质库里找。
  materials: Object.freeze({
    Steel: Object.freeze({ recipe: "CarriageFloorSteel", roughness: 1, metalness: 0.12, tint: Object.freeze([1.8, 1.78, 1.66]) }),
    Stone: Object.freeze({ recipe: "CityWallStonePbr", roughness: 1, metalness: 0, tint: Object.freeze([0.86, 0.84, 0.8]) }),
    Timber: Object.freeze({ recipe: "HandcartWood", roughness: 1, metalness: 0, tint: Object.freeze([0.9, 0.84, 0.76]) }),
    Charge: Object.freeze({ recipe: "WoodCrate", roughness: 1, metalness: 0, tint: Object.freeze([1.05, 0.95, 0.72]) }),
    Cable: Object.freeze({ recipe: "CarriageFloorSteel", roughness: 1, metalness: 0.1, tint: Object.freeze([0.4, 0.39, 0.37]) }),
  }),
  fallbackRecipe: "Stone",
  // 模型接管外观的白盒闸门件：网格从场景里摘掉，碰撞与信号生命周期一概不动
  //（炸前的桥面可走面、炸后的残骸挡板仍由 RailBridgeDestroyed 翻）。
  replacesGates: Object.freeze([
    "RailBridgeDeck", "RailBridgeTrussWest", "RailBridgeTrussEast", "RailBridgeRailWest", "RailBridgeRailEast",
    "RailBridgeWreckSpan", "RailBridgeWreckTruss", "RailBridgeWreckStub",
  ]),
  // 炸药包与桥上的导爆索只在 18 的前三步露面；地面导线与起爆器从 18 接令起一直在。
  chargeSteps: Object.freeze(["BridgeOrders", "BridgeCover", "BridgeWithdraw"]),
  exploderSteps: Object.freeze(["BridgeOrders", "BridgeCover", "BridgeWithdraw", "NightMarch"]),
});

/**
 * 起爆之后的特效分量（t 以起爆那一刻为 0，单位秒 / 米）。粒子数一律再乘 vfx.spawnScale：
 * 低画质的烟池只有高画质的三分之一，这里的总量按高画质 880 片烟池的一半留余量。
 */
export const RAIL_BRIDGE_BLAST = Object.freeze({
  // 跨中主药包：两团（东西两片桁架各一），按炮弹档（土黄烟为主）—— 用战车档的话满屏黑烟，
  // 恰好把 1–2 s 桥身折进河里那一段整个盖住（2026-09-28 实拍）。黑的那一团只给半空火球，
  // 而且抬到桁架顶上面去（桁高 6.2 m），让它往上翻、别压在桥身上。
  mainKind: "shell", mainRadiusM: 9.5,
  // rise 是绝对高度（桥局部 y = 世界 y）：R1c 桥面抬高 0.84 m，7.5 → 8.4。
  airburst: Object.freeze({ t: 0.06, rise: 8.4, radiusM: 13, kind: "tank" }),
  secondaryKind: "shell", secondaryRadiusScale: 0.8,
  // 药包下面的河面被冲击波掀起的两根水柱。
  waterColumn: Object.freeze({ t: 0.03, count: 32, speed: [14, 30], spread: 3.4, life: [2.2, 3.4],
    size: [1.4, 5.2], ring: 18 }),
  // 钢件切断那一下的火星雨。
  sparks: Object.freeze({ count: 70, speed: [9, 27], life: [0.7, 1.9] }),
  // 起爆后那两三秒的烟：走烟源（有湍流、会翻卷），不是一次撒一把大烟团
  // （那样拍出来是半空一个糊的土球）。一个黑的从桥心往上冲，一个土黄的贴着河面铺开。
  bursts: Object.freeze([
    // 上升慢一点、喷得久一点：1.5 s 就停、每秒 5 m 往上冲的话，三四秒后是半空一个脱开的黑球。
    Object.freeze({ t: 0.1, untilS: 2.2, at: Object.freeze([0, 2.84, 0]), kind: "black", rate: 22, radius: 4.5, rise: 4.0,
      sizeStart: 2.4, sizeEnd: 10.5, life: 9, opacity: 0.5 }),
    Object.freeze({ t: 0.05, untilS: 2.4, at: Object.freeze([0, -2.4, 0]), kind: "dust", rate: 16, radius: 7, rise: 2.0,
      sizeStart: 2, sizeEnd: 8.5, life: 6.5, opacity: 0.42 }),
  ]),
  // 起爆后玩家正看着桥的那几秒，视野收到 scale（像目光被钉住），转开头或 holdS 过了就放回来。
  // 只乘在任务 FOV 上（Script_FirstLevelMissionRuntime.NarrowFovDeg），开镜、望远镜照旧优先。
  focus: Object.freeze({ scale: 0.76, holdS: 5.0, halfAngleDeg: 40, inRate: 3.2, outRate: 1.2 }),
  // 冲击波沿两岸地面推出去的尘环。
  // banks：受冲击波的岸边（桥局部 z 与地面高度）。三孔之后只剩 1 号墩这边的南岸沙滩（局部 z 16.5 = 世界 164.5）。
  groundRing: Object.freeze({ t: 0.05, radiusM: 20, banks: Object.freeze([Object.freeze({ z: 16.5, y: -0.15 })]) }),
  // 入水 / 落地（件表 events）：size 是那一块的包围盒对角线。
  splash: Object.freeze({ perSize: 2.0, min: 3, max: 14, bigSize: 5 }),
  landPuff: Object.freeze({ count: 4 }),
  // 半孔砸到河底 / 南端砸到河滩：一记闷震（CameraShake.Explosion 的伤害外沿，48 m 外约 0.15 创伤）
  // 与钢件轰响；落在水里是一堵水墙，落在干滩上是一团土。
  slam: Object.freeze({ shakeReachM: 17, dustSize: 7, audio: Object.freeze([
    Object.freeze({ cue: "impactMetal", volume: 3.2, pitch: 0.42 }),
    Object.freeze({ cue: "debrisFall", volume: 2.4, pitch: 0.8 }),
    Object.freeze({ cue: "impactStone", volume: 1.6, pitch: 0.55 }),
  ]) }),
  // 半孔开始下折时钢梁扭弯的尖啸（合成回落的履带摩擦音压低八度用）。
  groan: Object.freeze({ t: 0.5, cue: "tankTrackSqueal", volume: 1.1, pitch: 0.5 }),
  landAudio: Object.freeze({ Steel: "impactMetal", Stone: "impactStone", Timber: "impactWood", maxDistanceM: 70 }),
  // 坍塌之后一直留着的：断口处烧着的枕木黑烟、河面上的扬尘、落在岸上的木件小火。
  persistent: Object.freeze({
    t: 1.5,
    wreck: Object.freeze({ at: Object.freeze([0, -1.2, -0.8]), kind: "black", rate: 7, radius: 2.4, rise: 2.4,
      sizeStart: 1.6, sizeEnd: 9.5, life: 11, opacity: 0.5, fire: 0.9 }),
    haze: Object.freeze({ at: Object.freeze([0, -2.4, 2.4]), kind: "dust", rate: 4, radius: 3.2, rise: 1.2,
      sizeStart: 2, sizeEnd: 7.5, life: 9, opacity: 0.32, untilS: 26 }),
    debrisFires: 2,
    debrisFire: Object.freeze({ kind: "black", rate: 2.2, radius: 0.5, rise: 1.3, sizeStart: 0.5, sizeEnd: 3,
      life: 5, opacity: 0.42, fire: 0.35, light: false }),
  }),
});
