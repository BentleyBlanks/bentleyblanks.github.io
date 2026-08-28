// Data_CutsceneCh2.mjs — 过场（第二关｜手榴弹雨）。规格：docs/Data_MissionRemake.md §3、§10.1。
//
// **纯数据，不许 import three。** 被 Data_TengxianScript.mjs 汇总进 CUTSCENES，
// Script_Cutscene.mjs 是唯一消费者；字段说明见 Data_TengxianScript.mjs「过场」一节
// 与 docs/Data_CutsceneRedo.md §1。
//
// ── 这一场为什么只有一镜黑场 ────────────────────────────────────────────────
// §3 给本关的过场口径是：**不设传统开场；核心演出嵌入可控战斗**，关末
// 「撤入后街后旧阵地遭炮击坍塌，罗班长清点确认小队仍在，直接结束」。
//
// 那句话里的两件事已经分掉了：
//   · **清点**（罗班长连喊两个名字无人应 → 短暂沉默 → 何有田抱铁锅出来
//     「老子还活起！」→ 刘文财「锅比命还要紧嗦？」→ 没人笑很久）
//     写成了 Data_MissionCh2.beats 的最后一簇 —— 让玩家**站在人堆里**听那两声
//     没有人答应的点名，比切成第三人称镜头有用得多（§0 关卡连续性原则：
//     所有低强度段落必须包含玩家动作，同一关内不切黑）。
//   · 剩下的只有**旧阵地在身后塌掉**这一下，和「班还在、名字少了两个」这个事实。
//     它发生在玩家已经退到后街之后、看不见的地方，本来就是听觉事件。
//
// 所以这一场取「一镜切黑」而不是搭一个只为拍一堵墙倒下去的独立布景：
// 一镜 9 s、两条字幕、三声炮，用声音把第二关接到第三关（§0：章节之间的切黑
// 必须用声音衔接）。**不做**日军受挫的胜利镜头，不把局部击退包装成守住东关 ——
// 字幕里连「守住」两个字都不出现。
//
// 要是后续有人想把它做成看得见的一镜（塌墙实拍），口径记在这里：
// 拍旧阵地方向的寨墙与院墙、无人、无台词，长度仍压在 10 s 内，出图必须逐张
// 用 Read 看过（docs/Data_CutsceneRedo.md §1.6），别只跑数据自检就算过。
// ---------------------------------------------------------------------------

export const CS_Ch2_AfterBayonet = {
  id: "CS_Ch2_AfterBayonet",
  title: "清点",
  seconds: 9.0,
  trigger: "afterLevel:CH2_Shouliudan",
  sky: "smokyDay",
  standalone: true,
  // 独立布景：离城心 ≥1800 m（切比雪夫距离），1700 m 内铺着真地形会和自己的地面打架。
  // 这一场整镜黑场，其实什么都不建；原点照规矩摆远，免得将来加了道具才发现要搬家。
  setOrigin: [2600, 0, -2600],
  why: "撤入后街之后，旧阵地被炮击塌掉。班还在，点到的名字少了两个。直接结束，不做日军受挫的胜利镜头。",
  presumed: [],
  people: {},
  props: [],
  cast: [],
  shots: [
    {
      n: 1, seconds: 9.0, focalMm: 35, black: true,
      note: "全黑。三声炮把第二关的声音接到第三关；字幕只陈述两件事，不作总结。",
      camera: { from: [0, 1.7, 0], look: [0, 1.6, -4] },
      sfx: [
        { at: 0.15, name: "shellIncoming", volume: 0.42 },
        { at: 1.30, name: "explosionFar", volume: 0.52 },
        { at: 2.10, name: "impactBrick", volume: 0.34 },
        { at: 6.40, name: "explosionFar", volume: 0.26 },
      ],
      subs: [
        // 11 字 → 按字数至少 3.62 s
        { at: 0.6, seconds: 3.7, text: "刚才守的那道墙，塌了。" },
        // 11 字 → 按字数至少 3.62 s；到 8.5 s 结束，留半秒黑场收口
        { at: 4.8, seconds: 3.7, text: "班还在。名字少了两个。" },
      ],
    },
  ],
};

/** 本章过场（按播放顺序）。Data_TengxianScript 汇总时照这个数组展开。 */
export const CH2_CUTSCENES = [CS_Ch2_AfterBayonet];

export default CH2_CUTSCENES;
