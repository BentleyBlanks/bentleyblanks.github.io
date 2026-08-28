// Data_CutsceneCh4.mjs — 过场占位（第四关｜东关之夜）。规格：docs/Data_MissionRemake.md §10.1。
//
// **纯数据，不许 import three。** 被 Data_TengxianScript.mjs 汇总进 CUTSCENES，
// Script_Cutscene.mjs 是唯一消费者；字段说明见 Data_TengxianScript.mjs「过场」一节。
//
// 这一份是**基建批留的最小占位**：一镜黑场 + 一条字幕，只保证
//   ① ValidateCutscene 过（shots 秒数之和 === seconds、每镜有机位与焦距）；
//   ② LintCutscene 无软错（字幕时长按字数够读、独立布景原点离城心 ≥1800 m）；
//   ③ 章节流程能真的在关卡边界上把它播出来。
// 分镜、人物轨、道具与台词由本章内容批填 —— 施工单在 docs/Data_MissionRemake.md。
// 秒数是占位值，内容批按策划案给的总时长重写（改 seconds 时记得同步 shots）。

export const CS_Ch4_UnfinishedLetter = {
  id: "CS_Ch4_UnfinishedLetter",
  title: "未写完的回信",
  seconds: 6.4,
  trigger: "beforeLevel:CH4_DongguanYe",
  sky: "night",
  standalone: true,
  // 独立布景：离城心 ≥1800 m（切比雪夫距离），1700 m 内铺着真地形会和自己的地面打架。
  setOrigin: [-2800, 0, 2800],
  why: "罗班长口述四句家书→炮火加密→「先收到，打完再写」。约 25 秒（§5 过场 1）。",
  presumed: [],
  people: {},
  props: [],
  cast: [],
  shots: [
    {
      n: 1, seconds: 6.4, focalMm: 35, black: true,
      camera: { from: [0, 1.7, 0], look: [0, 1.6, -4] },
      subs: [{ at: 0.6, seconds: 3.6, text: "先收到。打完再写。" }],
    },
  ],
};

export const CS_Ch4_AidStation = {
  id: "CS_Ch4_AidStation",
  title: "没得脉了",
  seconds: 6.4,
  trigger: "afterLevel:CH4_DongguanYe",
  sky: "night",
  standalone: true,
  // 独立布景：离城心 ≥1800 m（切比雪夫距离），1700 m 内铺着真地形会和自己的地面打架。
  setOrigin: [-2800, 0, 2800],
  why: "抬回救护所、军医剪开军服抢救、顺子递纱布；军医「没得脉了」，顺子取信停在「等我回来……」。约 30 秒（§5 过场 2）。",
  presumed: [],
  people: {},
  props: [],
  cast: [],
  shots: [
    {
      n: 1, seconds: 6.4, focalMm: 35, black: true,
      camera: { from: [0, 1.7, 0], look: [0, 1.6, -4] },
      subs: [{ at: 0.6, seconds: 3.0, text: "等我回来……" }],
    },
  ],
};

/** 本章过场（按播放顺序）。Data_TengxianScript 汇总时照这个数组展开。 */
export const CH4_CUTSCENES = [CS_Ch4_UnfinishedLetter, CS_Ch4_AidStation];

export default CH4_CUTSCENES;
