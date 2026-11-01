// 第一关室内遮蔽体：哪几间屋子「屋里比屋外暗」，光从哪几个口子进来。
// 纯数据 + 纯函数，零 three 依赖（契约 2）。消费方 Script_InteriorSkyOcclusion（屏幕空间，
// 把室内天光可见度乘进 GTAO 的 AO 图，只压间接光 —— 契约 6）。
//
// ## 为什么要有它
// 参考图（概念 09 / 09_B / 16 / 17、分镜 01 掩蔽部）里屋里明显暗于屋外、光从门窗进来、
// 深处发黑；实机（Gap3A_Before 09_2 / 16_1 / SB01）屋里屋外一样亮。原因是间接光只有
// 一张天空 IBL + Global SH，都没有位置概念；GTAO 只管一两米内的接触遮蔽，管不了
// 「头顶整块是屋顶」。探针体 GI（Script_Gi）能管，但它拿碰撞盒当代理体，而第一关的屋顶
// 檐以上是非实心的（碰撞表里没有屋顶），探针照样看得见天 —— 所以这里直接写明「屋子」。
//
// ## 一间屋子怎么写
//   box   墙**中线**围成的矩形（与白盒 Room / Roof 调用的 x,z,w,d 同口径），世界米。
//   ceil  屋内净高（地面到顶棚底），米。floor 取共享地面在屋子中心的高度，
//         或显式 floorY（掩蔽部是挖在地里的坑，地面不是自然地面）。
//   wall  墙厚（缺省 0.6）；内框 = box 各边往里收半个墙厚。
//   dark  屋子最深处的天光可见度（0–1）。口子贡献的光在它之上叠加。
//   bounce（可选，缺省 1）室内暖反弹的逐屋倍率（Data_Tuning_Lights.INTERIOR_SKY.bounce）。
//   portals（可选）显式开口；不写就按布局体块在墙中线上自动找缺口（门、窗、敞口）。
// 自动找缺口只认 MISSION_LAYOUT.blocks（含非实心细节：门扇、帘子、窗棂都挡光），
// 不认 "…Void"（画在墙外皮上的假窗洞）；缺口外侧紧挨着另一间屋子的，是屋与屋之间的门，
// 不算采光口。
import { SampleMissionNaturalHeight } from "./Data_FirstLevelMissionTerrain.mjs";

const BUNKER_FLOOR = SampleMissionNaturalHeight(-0.8, -125.8) - 2.0;

export const FIRST_LEVEL_INTERIORS = Object.freeze({
  layoutId: "FirstLevelMissionSeptember19",
  rooms: Object.freeze([
    // 09 灶屋与连屋（Village Roof("Kitchen"/"ConnectedHouse"), 中间一段有顶的过道）
    { id: "Kitchen", box: { x: 58, z: -9, w: 12, d: 15 }, ceil: 2.95, dark: 0.15 },
    { id: "KitchenLink", box: { x: 58, z: -0.5, w: 12, d: 2 }, ceil: 2.9, dark: 0.15 },
    { id: "ConnectedHouse", box: { x: 58, z: 8, w: 12, d: 15 }, ceil: 2.95, dark: 0.15 },
    { id: "MachineGunHouse", box: { x: 43, z: 8, w: 12, d: 15 }, ceil: 2.95, dark: 0.15 },
    // 09_3 侧间：朝街一面是带柱的敞口，采光比灶屋好得多
    { id: "SideRoom", box: { x: 68, z: 10.65, w: 8, d: 10.3 }, ceil: 2.95, dark: 0.18, wall: 0.65 },
    // 2026-09-28 集成：B1 材质合入后 dark 0.10 让 09 三机位整幅只剩 21–27（参考 35–53）、16_2 只剩 27（参考 52），
    // 且暗部发紫；在 Script_FirstLevelSkyGradeTest 的「深处天光 < 0.2 / 厢房北间 < 0.25」之内抬到 0.15 / 侧间 0.18 / 厢房 0.18，
    // 室内整体亮度主要交给自动曝光的进屋适应（SKY_EXPOSURE.firstLevelBattleDay.evUp）。
    // 16–17 厢房（Rear Gable("ReceptionWard")），南门 + 西窗 + 东侧敞口。
    // bounce 0.8（第二轮暖反弹的逐屋倍率）：17_1「屋内暗、门外院子亮」在 0.5 时整幅 L 54（参考 43），
    // 北间 16_2 只有 33（参考 51）—— 两个机位同一间屋，往北间那头让一点。
    { id: "ReceptionWard", box: { x: -26, z: 234, w: 14, d: 18 }, ceil: 2.9, dark: 0.18, bounce: 0.8 },
    // 01 掩蔽部：坑底 = 自然地面 − 2.0 m，顶是 BunkerRoof（底面在自然地面 −0.15）。
    // 三面是坑壁（地形，不在体块表里），只有东面的洞口采光，所以口子写死。
    // dark 0.38：坑只有 4 m 见方、洞口 3 m 宽，洞外晒着的沟底把光弹进来。SB01 坐在坑底往洞口看，
    // 0.08 / 0.15 / 0.22 三版整幅均值 31–33（分镜 49），洞口两根门柱的内侧与顶板压到 sRGB < 5 的有 8–12%。
    // bounce 1.0：去掉蓝紫 lift 之后 SB01 从 38 掉到 34（分镜 49），暗部 28/19/14 过饱和（分镜 34/28/23）——
    // 马灯的橙光加橙土壁，缺的是中性一点的反弹底。
    { id: "Bunker", box: { x: -1.15, z: -126.0, w: 4.1, d: 4.2 }, wall: 0, floorY: BUNKER_FLOOR,
      ceil: 1.85, dark: 0.38, bounce: 1.0,
      portals: [{ face: "E", from: -127.4, to: -124.4, bottom: 0, top: 1.73 }] },
  ].map((room) => Object.freeze(room))),
});

/** 渲染侧上限（uniform 数组长度），Script_InteriorSkyOcclusion 的 GLSL 与之同值。 */
export const INTERIOR_LIMITS = Object.freeze({ rooms: 12, portals: 40 });

export const FACES = {
  N: { axis: "z", sign: -1 }, S: { axis: "z", sign: 1 },
  W: { axis: "x", sign: -1 }, E: { axis: "x", sign: 1 },
};

