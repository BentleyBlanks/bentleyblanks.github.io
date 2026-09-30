// ===========================================================================
// Data_PontoonBridgeDemolition.mjs —— 北沙河浮桥模型与「奉令毁桥」演出的数据表（零 three）
//
// 口径：docs/Data_PontoonBridge.md。模型与坍塌关键帧由 _blender/Script_BuildPontoonBridge.py
// 烘成 Model/Model_PontoonBridge.glb + Model/Data_PontoonBridge.json；这里只放运行时要的
// 地址、材质映射、替换哪些白盒件，以及起爆之后那几秒的特效分量。
// 判定（等人走净、看着桥、按下起爆器）在 Script_FirstLevelBridge，数值在 Data_Tuning_FirstLevelEnd。
// （2026-09-30 浮桥取代钢桁架铁路桥；旧的 Data_RailBridgeDemolition 只留给退役的 Model_RailBridge 自检。）
// ===========================================================================
import { MISSION_PONTOON_BRIDGE } from "./Data_FirstLevelMissionTopology.mjs";

export const PONTOON_BRIDGE_MODEL = Object.freeze({
  // 模型与件表各自一个戳：重烘之后两边一起 +1（Script_PontoonBridgeTest 核对两者出自同一次烘焙）。
  url: "./Model/Model_PontoonBridge.glb?v=20261001a",
  dataUrl: "./Model/Data_PontoonBridge.json?v=20261001a",
  origin: Object.freeze({ x: MISSION_PONTOON_BRIDGE.x, z: MISSION_PONTOON_BRIDGE.z }),
  // GLB 里的材质名（PontoonBridge<Key>）→ 材质库配方 + 线性色调（乘在配方底图上，可以大于 1）。
  // 船板取风化的手推车木（HandcartWood）：深一点是船体（焦油刷过的旧木），浅一点是桥面板；麻绳取沙袋布（Sandbag，土黄粗纹），
  // 芦苇束取藤编围篱（WattleFence，枯黄细条）；铁件取车厢地板钢（CarriageFloorSteel，别用发蓝的 Steel：在这条管线里一片黑）。
  // 纯 three 材质在这条管线里同样出黑（没过材质补丁），所以兜底也只在材质库里找。
  materials: Object.freeze({
    Timber: Object.freeze({ recipe: "HandcartWood", roughness: 1, metalness: 0, tint: Object.freeze([0.98, 0.9, 0.78]) }),
    Hull: Object.freeze({ recipe: "HandcartWood", roughness: 1, metalness: 0, tint: Object.freeze([0.5, 0.44, 0.37]) }),
    Rope: Object.freeze({ recipe: "Sandbag", roughness: 1, metalness: 0, tint: Object.freeze([0.95, 0.82, 0.58]) }),
    Reed: Object.freeze({ recipe: "WattleFence", roughness: 1, metalness: 0, tint: Object.freeze([1.35, 1.2, 0.85]) }),
    Iron: Object.freeze({ recipe: "CarriageFloorSteel", roughness: 1, metalness: 0.12, tint: Object.freeze([0.85, 0.83, 0.78]) }),
    Crate: Object.freeze({ recipe: "WoodCrate", roughness: 1, metalness: 0, tint: Object.freeze([1.05, 0.95, 0.72]) }),
    Charge: Object.freeze({ recipe: "WoodCrate", roughness: 1, metalness: 0, tint: Object.freeze([1.05, 0.95, 0.72]) }),
    Cable: Object.freeze({ recipe: "CarriageFloorSteel", roughness: 1, metalness: 0.1, tint: Object.freeze([0.4, 0.39, 0.37]) }),
  }),
  fallbackRecipe: "Timber",
  // 模型接管外观的白盒闸门件：网格从场景里摘掉，碰撞与信号生命周期一概不动
  //（炸前的桥面可走面、炸后断口两端的空气墙仍由 RailBridgeDestroyed 翻）。
  replacesGates: Object.freeze([
    "PontoonBridgeDeck", "PontoonBridgeRailWest", "PontoonBridgeRailEast", "PontoonBridgeCutWallSouth", "PontoonBridgeCutWallNorth",
  ]),
  // 炸药包与桥上的导爆索只在 18 的前三步露面；地面导线与起爆器从 18 接令起一直在。
  chargeSteps: Object.freeze(["BridgeOrders", "BridgeCover", "BridgeWithdraw"]),
  exploderSteps: Object.freeze(["BridgeOrders", "BridgeCover", "BridgeWithdraw", "NightMarch"]),
});

/**
 * 起爆之后的特效分量（t 以起爆那一刻为 0，单位秒 / 米）。粒子数一律再乘 vfx.spawnScale：
 * 低画质的烟池只有高画质的三分之一，这里的总量按高画质 880 片烟池的一半留余量。
 */
export const PONTOON_BRIDGE_BLAST = Object.freeze({
  // 药包：中间三包（main）按炮弹档、两侧两包小一点 —— 浮桥的木头不该炸出满屏黑烟（黑烟只给半空那一团火球）。
  mainKind: "shell", mainRadiusM: 8.5,
  // rise 是绝对高度（桥局部 y = 世界 y）：水面 −1.12，桥面 −0.28，半空火球在桥面上 4.5 m。
  airburst: Object.freeze({ t: 0.06, rise: 4.2, radiusM: 10, kind: "tank" }),
  secondaryKind: "shell", secondaryRadiusScale: 0.7,
  // 药包下面的河面被冲击波掀起的水柱：每个药包一根（数据里 5 个药包），每根 count 片烟。
  waterColumn: Object.freeze({ t: 0.03, count: 13, speed: [9, 20], spread: 2.2, life: [1.8, 3.0],
    size: [1.2, 3.8], ring: 9 }),
  // 木船断裂那一下的火星与碎木屑（streak 池：火星色，落到水面前就熄）。
  sparks: Object.freeze({ count: 46, speed: [7, 20], life: [0.6, 1.5], halfLengthM: 5 }),
  // 起爆后那两三秒的烟：走烟源（有湍流、会翻卷）。一个黑的从桥心往上冲，一个土黄的贴着河面铺开。
  bursts: Object.freeze([
    Object.freeze({ t: 0.1, untilS: 1.8, at: Object.freeze([0, 1.8, 0]), kind: "black", rate: 18, radius: 3.6, rise: 3.6,
      sizeStart: 2.0, sizeEnd: 8.5, life: 8, opacity: 0.5 }),
    Object.freeze({ t: 0.05, untilS: 2.0, at: Object.freeze([0, -0.7, 0]), kind: "dust", rate: 14, radius: 6, rise: 1.8,
      sizeStart: 2, sizeEnd: 7.5, life: 6, opacity: 0.4 }),
  ]),
  // 起爆后玩家正看着桥的那几秒，视野收到 scale（像目光被钉住），转开头或 holdS 过了就放回来。
  // 只乘在任务 FOV 上（Script_FirstLevelMissionRuntime.NarrowFovDeg），开镜、望远镜照旧优先。
  focus: Object.freeze({ scale: 0.76, holdS: 5.0, halfAngleDeg: 40, inRate: 3.2, outRate: 1.2 }),
  // 冲击波沿河面推出去的水雾环（浮桥两头离药包都在 20 m 以外，岸上不吃冲击波，不推岸边尘环）。
  groundRing: Object.freeze({ t: 0.05, radiusM: 16 }),
  // 入水 / 落地（件表 events）：size 是那一块的包围盒对角线。
  splash: Object.freeze({ perSize: 2.0, min: 3, max: 12, bigSize: 4.5 }),
  splashAudio: Object.freeze({ cue: "debrisFall", minSize: 1.8, maxPlays: 7, maxDistanceM: 90, volume: 1.1 }),
  landPuff: Object.freeze({ count: 4 }),
  // 一记闷震（可选：件表里有 slam 事件才演；浮桥的木件没有砸底，这一项留给下沉的船一头扎下去时用）。
  slam: Object.freeze({ shakeReachM: 15, dustSize: 6, audio: Object.freeze([
    Object.freeze({ cue: "debrisFall", volume: 2.0, pitch: 0.7 }),
    Object.freeze({ cue: "impactWood", volume: 1.8, pitch: 0.6 }),
  ]) }),
  // 木船折断的吱嘎与木板崩裂：药包响之后 0.15 / 0.5 / 1.1 s 各一下（位置在被炸段的南 / 中 / 北）。
  woodBreak: Object.freeze([
    Object.freeze({ t: 0.15, z: 0, cue: "impactWood", volume: 2.4, pitch: 0.6, sizeM: 10 }),
    Object.freeze({ t: 0.5, z: 5, cue: "impactWood", volume: 1.6, pitch: 0.75, sizeM: 8 }),
    Object.freeze({ t: 1.1, z: -5, cue: "impactWood", volume: 1.4, pitch: 0.7, sizeM: 8 }),
  ]),
  landAudio: Object.freeze({ Iron: "impactMetal", Timber: "impactWood", Hull: "impactWood", Crate: "impactWood", maxDistanceM: 70 }),
  // 坍塌之后一直留着的：南北断口处烧着的船板黑烟、河面上的水汽、漂在河面的木件上的小火。
  persistent: Object.freeze({
    t: 1.2,
    // 断口两端（局部 z：南截北端 ≈ +13.5，北截南端 ≈ −13.5）：船帮烧着，一缕细黑烟。
    ends: Object.freeze([
      Object.freeze({ at: Object.freeze([0, -0.3, 13.6]), kind: "black", rate: 5, radius: 1.6, rise: 2.2, sizeStart: 1.2, sizeEnd: 7, life: 9, opacity: 0.46, fire: 0.8 }),
      Object.freeze({ at: Object.freeze([0, -0.3, -13.6]), kind: "black", rate: 5, radius: 1.6, rise: 2.2, sizeStart: 1.2, sizeEnd: 7, life: 9, opacity: 0.46, fire: 0.8 }),
    ]),
    haze: Object.freeze({ at: Object.freeze([0, -0.9, 0]), kind: "dust", rate: 4, radius: 5, rise: 1.0,
      sizeStart: 2, sizeEnd: 7, life: 8, opacity: 0.28, untilS: 24 }),
    debrisFires: 3,
    debrisFire: Object.freeze({ kind: "black", rate: 2, radius: 0.5, rise: 1.2, sizeStart: 0.5, sizeEnd: 2.6,
      life: 4.5, opacity: 0.4, fire: 0.35, light: false }),
  }),
});
