// Data_CutsceneCh1.mjs — 第一关｜往南的路 的过场。规格：docs/Data_MissionRemake.md §2「过场动画」与 §10.1。
//
// **纯数据，不许 import three。** 被 Data_TengxianScript.mjs 汇总进 CUTSCENES，
// Script_Cutscene.mjs 是唯一消费者；字段说明见 Data_TengxianScript.mjs「过场」一节
// 与 docs/Data_CutsceneRedo.md §1。
//
// ---------------------------------------------------------------------------
// 取舍：策划案那段「沟内短演出」**不做成过场，写进了 beats**
//
// §2 的「过场动画」一节只留一段短演出：南路截断后沟内，枪声远去，顺子看向担架与
// 百姓说「他们连这个也打？」，罗班长查完路说「路断了。把能走的带回城。」
// 三条理由让它必须是 in-level beats 而不是一场过场：
//
//   1. **策划案自己写着「立即恢复控制，不停留在尸体上煽情」。**
//      做成过场就是把镜头拿走再还回来 —— 拿走的那三秒正好是它要求不要有的那三秒。
//   2. **§0 关卡连续性原则：同一关内不切黑。** 这一段发生在关卡中段（阶段九），
//      不是章节边界。
//   3. **工程上也插不进去。** 过场的 trigger 只有 beforeLevel / afterLevel 两种
//      （docs/Data_CutsceneRedo.md §1.1），没有「关内第 N 拍」这一档；要加就得改
//      Script_Main 与 Script_Cutscene，那是别人的文件（契约 §10.4：内容批不许动共享模块）。
//
// 落点：Data_MissionCh1.beats 里 `event:SouthCut` 那一簇之后的三条
//   env「枪声退远了。沟里只剩喘气声 —— 担架、药箱、几个抱娃的婆娘。」
//   line shunzi ch1_shunzi_06「他们连这个也打？」
//   line luo    ch1_luo_25   「路断了。把能走的带回城。」
// 玩家全程持枪、可自由转视角看那几副担架和抱娃的婆娘 —— 这比一个导演机位更接近
// 策划案要的东西（「日机扫射必须在自由视角中亲眼看见」是同一条道理）。
//
// ---------------------------------------------------------------------------
// 那这一场过场留下来做什么：**关末那 2—4 秒的切黑**
//
// §0：「章节之间才允许 2—4 秒切黑（时间跨度、昼夜转换、区块加载、视角切换角色），
// 切黑必须用声音衔接（炮声延续、电话铃延续、火车声变炮声、电流声变车轮声）。」
// 第一关末（三月十四日午后，城外）到第二关首（三月十六日十时三十分，东关）跨了两天，
// 正是那一档。阶段十一的最后一个动作就是「抬进掩蔽部，切黑」。
//
// 所以这一场是**一场纯黑场**：没有机位可拍的东西、没有演员、没有道具。
//   · 声音衔接：担架木杆落地 → 脚步进掩蔽部 → 远处炮声压上来，一路盖到第二关；
//   · 两条字幕交代时间跨度，都按「每字 0.22 s + 1.2 s」给足了读的时间；
//   · 11 秒里没有一帧停在尸体上 —— 策划案的原话是「不停留在尸体上煽情」。
//
// standalone + setOrigin 仍然保留：黑场不渲染布景，但 LintCutscene 会查
// 「独立布景原点离城心 ≥1800 m」，[-2600,0,-2600] 的切比雪夫距离是 2600，过。
// ---------------------------------------------------------------------------

export const CS_Ch1_RoadCut = {
  id: "CS_Ch1_RoadCut",
  title: "路断了",
  seconds: 11.0,
  trigger: "afterLevel:CH1_NanLu",
  sky: "smokyDay",
  standalone: true,
  setOrigin: [-2600, 0, -2600],
  why: "第一关（3/14 午后·城外）到第二关（3/16 10:30·东关）之间那 2—4 秒档的章节切黑："
    + "担架抬进掩蔽部之后落黑，用担架落地→脚步→远处炮声把两天的时间跨度接过去。"
    + "沟内那段短演出**不在这里**，见文件头：它是 Data_MissionCh1.beats 的 in-level 段落。",
  presumed: [],
  people: {},
  props: [],
  cast: [],
  shots: [
    {
      // 镜 1：担架进掩蔽部。看不见东西，只听得见 —— 木杆落地、几双脚踩进土洞。
      n: 1, seconds: 5.4, focalMm: 35, black: true,
      note: "关末落黑第一段：担架落地 + 脚步。字幕交代这一趟的结果。",
      camera: { from: [0, 1.7, 0], look: [0, 1.6, -4] },
      sfx: [
        { at: 0.15, name: "stretcherWood", volume: 0.55 },
        { at: 0.75, name: "footstepDirt", volume: 0.40 },
        { at: 1.15, name: "footstepDirt", volume: 0.36 },
        { at: 2.60, name: "explosionFar", volume: 0.30 },
      ],
      subs: [{ at: 0.5, seconds: 4.7, tier: "虚构", text: "往南的路断了。伤员抬回了城里。" }],
    },
    {
      // 镜 2：两天。炮声从远处压上来，直接盖进第二关的开场。
      n: 2, seconds: 5.6, focalMm: 35, black: true,
      note: "关末落黑第二段：炮声接管，把 3/14 午后接到 3/16 十时三十分的东关。",
      camera: { from: [0, 1.7, 0], look: [0, 1.6, -4] },
      sfx: [
        { at: 0.20, name: "explosionFar", volume: 0.42 },
        { at: 2.40, name: "shellIncoming", volume: 0.34 },
        { at: 3.60, name: "explosionFar", volume: 0.58 },
      ],
      subs: [{ at: 0.5, seconds: 4.9, tier: "主流", text: "十六日十时三十分，日军打到东关。" }],
    },
  ],
};

/** 本章过场（按播放顺序）。Data_TengxianScript 汇总时照这个数组展开。 */
export const CH1_CUTSCENES = [CS_Ch1_RoadCut];

export default CH1_CUTSCENES;
