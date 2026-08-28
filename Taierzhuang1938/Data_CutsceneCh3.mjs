// Data_CutsceneCh3.mjs — 过场占位（第三关｜救护所）。规格：docs/Data_MissionRemake.md §10.1。
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

export const CS_Ch3_LeafletFire = {
  id: "CS_Ch3_LeafletFire",
  title: "传单入火",
  seconds: 6.2,
  trigger: "afterLevel:CH3_Jiuhusuo",
  sky: "smokyDay",
  standalone: true,
  // 独立布景：离城心 ≥1800 m（切比雪夫距离），1700 m 内铺着真地形会和自己的地面打架。
  setOrigin: [2600, 0, 2600],
  why: "顺子拾「放下武器可保生命」传单，看一眼院内尸体，投入炉火。全程无台词，5 秒内。",
  presumed: [],
  people: {},
  props: [],
  cast: [],
  shots: [
    {
      n: 1, seconds: 6.2, focalMm: 35, black: true,
      camera: { from: [0, 1.7, 0], look: [0, 1.6, -4] },
      subs: [{ at: 0.6, seconds: 3.8, text: "保命。保个鸭儿的命。" }],
    },
  ],
};

/** 本章过场（按播放顺序）。Data_TengxianScript 汇总时照这个数组展开。 */
export const CH3_CUTSCENES = [CS_Ch3_LeafletFire];

export default CH3_CUTSCENES;
