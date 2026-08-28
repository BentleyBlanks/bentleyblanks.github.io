// Data_CutsceneCh5.mjs — 过场分镜（第五关｜城墙没有了）。规格：docs/Data_MissionRemake.md §6「过场动画」。
//
// **纯数据，不许 import three。** 被 Data_TengxianScript.mjs 汇总进 CUTSCENES，
// Script_Cutscene.mjs 是唯一消费者；字段说明见 Data_TengxianScript.mjs「过场」一节
// 与 docs/Data_CutsceneRedo.md §1。
//
// ---------------------------------------------------------------------------
// 本章过场的硬约束（§6「过场动画（不设独立开场；回机枪位与最后白刃战保持玩家控制）」）
//
//   · **不设独立开场。** 醒来、领命令、穿旧场景全在玩家手里，没有一秒是看的。
//   · 只有两段：
//       ①「转身」约 8 秒 —— 最后一副担架过后顺子走出数步，回头见担架员跌倒、
//         伤员滑落、日军逼近街口，摸到衣襟里的半封家书，转身返回。**关中播**。
//       ②「视角接替」约 12 秒 —— 顺子倒下不切黑 → 担架离开街道 → 补机枪位的
//         124 师伤兵 → 递报告的电话兵 → 中弹、听筒落地「东关？东关回话。」
//         声音直接衔接终章。**挂关末**（CHAPTER.cutsceneOut）。
//   · **返回机枪位与最终白刃战全程玩家控制。** 这两段一秒镜头都不许有 ——
//     顺子折返是他的选择，用镜头替玩家做这个选择，§0 验收结果第 5 条当场作废。
//
// 两场都是 standalone:false（城里的实景，坐标直接就是 Data_Tengxian 的世界坐标：
// 西门大街 z≈0 那条通视直街，西关城门在 x=-305，最后一个火力点在 x≈-230）。
// **两场都不给 sky**：本关是 dawn，过场再套一遍会重烘天空，开头闪一块黑盘
// （CS_WangMingzhang 踩过，注释还在那儿）。
//
// trigger 一律写 afterLevel:CH5_Chengqiang —— 这个字段只被 Script_CutsceneShot
// 用来决定「出图时脚下站的是哪一关的场」与编辑器时间线的显示，不是播放时机。
// 真正的播放时机：② 由 CHAPTER.cutsceneOut 挂在关末；① 是关中播，引擎还没有这个
// 钩子，登记在 Data_MissionCh5.mjs 头注的 ENGINE_REQUEST 第 5 条（cutsceneMid）。
// ---------------------------------------------------------------------------

/** 西门大街的通视轴（z≈0）。城门 x=-305，最后一个火力点 x≈-230，两者之间是长街。 */
const WEST = Math.PI / 2;    // 面朝西（−X）：ry = atan2(-dx, -dz) = atan2(1, 0)
const EAST = -Math.PI / 2;   // 面朝东（+X）

// ===========================================================================
// ①「转身」—— 8.5 s（§6 过场 1「约 8 秒」）
// ===========================================================================
//
// 三镜，一句一句都在预算里：
//   镜 1（3.9 s）背影往城门走两步，幺娃从城门那头喊「顺哥！最后一副都过了！」
//        （11 字，按每字 0.22 s + 1.2 s 的可读下限要 3.62 s，所以这一镜不能再短）
//   镜 2（1.4 s）回头 —— 一眼看完三件事：担架员跪倒、伤员从担架上滑下来、
//        街口那头日军正压过来。85 mm 把 30 m 与 55 m 压在同一画面里。
//   镜 3（3.2 s）胸口构图（50 mm / 2 m，头在画外）：手按住衣襟里那半封家书，
//        转过身，迈步往回走，说「我晓得。你们走。」→ 恢复完全控制。
//
// 半封家书目前只能用 state.reach（手往身前抬）表示：演员挂载（attachments/mounts）
// 的 mount 名没有公开口径，硬写一个名字会被 ValidateCutscene 判成「挂载指向不存在的
// 道具」。等挂点有了名字，这里该在胸前挂一张纸。
export const CS_Ch5_TurnBack = {
  id: "CS_Ch5_TurnBack",
  title: "转身",
  seconds: 8.5,
  trigger: "afterLevel:CH5_Chengqiang",
  standalone: false,
  setOrigin: [0, 0, 0],
  why: "军令给了、城门开着、路就在门外 —— 他已经走出去了。转身是他自己回的头，不是剧情把他拽回来的，所以这一场只演「他看见了什么」和「他说了什么」，八秒之内还回控制权。",
  presumed: [
    { id: "ch5TurnBackSpot", value: "折返地点取西门大街 x≈-268（城门内侧约 37 m）",
      note: "顺子这个人与这一折返都是虚构；地点为叙事需要的推定，不作史料" },
  ],
  people: {},
  props: [
    // 跌倒的那副门板担架：长边顺街（X），所以 size 直接把长度写在 X 上，ry 留 0。
    { kind: "box", size: [1.95, 0.09, 0.72], pos: [-238.6, 0.20, 1.45], ry: 0, mat: "WoodDoor", name: "门板担架" },
  ],
  cast: [
    // 顺子：往西走两步 → 站住 → 回头 → 手按衣襟 → 转向东、迈步往回走。
    // 轨道速度必须 = moveSpeed×4.2，否则滑步（2.8 m / 2.4 s = 1.17 ↔ 0.28×4.2 = 1.176）。
    { id: "shunzi", kind: "nra", weapon: "ZhongZheng", seed: "shunziTurn", track: [
      { t: 0.0, pos: [-266.0, 0, 0.6], ry: WEST, state: { moveSpeed: 0.28 } },
      { t: 2.4, pos: [-268.8, 0, 0.6], ry: WEST, state: { moveSpeed: 0 } },
      // 镜 1／镜 2 的切点在 3.9：身子从这里开始往回转，脸始终背着镜 1 的机位
      { t: 3.9, pos: [-268.8, 0, 0.6], ry: 1.90, state: { moveSpeed: 0 } },
      { t: 5.3, pos: [-268.8, 0, 0.6], ry: -1.20, state: { moveSpeed: 0 } },
      // 镜 3：手抬到胸前（半封家书），再放下
      { t: 6.4, pos: [-268.8, 0, 0.6], ry: EAST, state: { moveSpeed: 0, reach: 0.25 } },
      { t: 7.0, pos: [-268.8, 0, 0.6], ry: EAST, state: { moveSpeed: 0.28, reach: 0 } },
      { t: 8.5, pos: [-267.0, 0, 0.6], ry: EAST, state: { moveSpeed: 0.28 } },
    ] },
    // 幺娃：城门那头，面朝东冲他喊，喊完继续往门外退（0.09×4.2 = 0.38 m/s，一步一回头的速度）
    { id: "yaowa", kind: "nra", weapon: "HanYang", seed: "yaowaGate", track: [
      { t: 0.0, pos: [-291.0, 0, -1.4], ry: EAST, state: { moveSpeed: 0 } },
      { t: 4.2, pos: [-291.0, 0, -1.4], ry: EAST, state: { moveSpeed: 0.09 } },
      { t: 8.5, pos: [-292.6, 0, -1.6], ry: -2.00, state: { moveSpeed: 0.09 } },
    ] },
    // 担架员甲（前端，靠西）：抬到一半跪倒
    { id: "danjia_a", kind: "nra", weapon: null, seed: "danjiaA", track: [
      { t: 0.0, pos: [-236.6, 0, 1.20], ry: WEST, state: { moveSpeed: 0.24 } },
      { t: 3.0, pos: [-239.6, 0, 1.20], ry: WEST, state: { moveSpeed: 0 } },
      { t: 3.7, pos: [-239.68, 0, 1.26], ry: 1.40, state: { moveSpeed: 0, kneel: 1 } },
      { t: 8.5, pos: [-239.68, 0, 1.26], ry: 1.40, state: { moveSpeed: 0, kneel: 1, reach: 0.40 } },
    ] },
    // 担架员乙（后端，靠东）：蹲下去抓滑落的人
    { id: "danjia_b", kind: "nra", weapon: null, seed: "danjiaB", track: [
      { t: 0.0, pos: [-234.2, 0, 1.50], ry: WEST, state: { moveSpeed: 0.24 } },
      { t: 3.0, pos: [-237.2, 0, 1.50], ry: WEST, state: { moveSpeed: 0 } },
      { t: 3.9, pos: [-237.30, 0, 1.55], ry: 1.30, state: { moveSpeed: 0, crouch: 0.60 } },
      { t: 8.5, pos: [-237.30, 0, 1.55], ry: 1.30, state: { moveSpeed: 0, crouch: 0.70, reach: 0.50 } },
    ] },
    // 伤员：被抬着（prone + travelSpeed 报世界速度，moveSpeed 留 0 —— 他自己没在走），
    // 担架一歪就从上面滑下来
    { id: "shangbing", kind: "nra", weapon: null, seed: "litterA", track: [
      { t: 0.0, pos: [-235.4, 0, 1.35], ry: WEST, state: { moveSpeed: 0, prone: 1, travelSpeed: 1.00 } },
      { t: 3.0, pos: [-238.4, 0, 1.35], ry: WEST, state: { moveSpeed: 0, prone: 1, travelSpeed: 0.55 } },
      { t: 4.0, pos: [-238.85, 0, 1.68], ry: 1.35, state: { moveSpeed: 0, prone: 1, travelSpeed: 0 } },
      { t: 8.5, pos: [-238.85, 0, 1.68], ry: 1.35, state: { moveSpeed: 0, prone: 1, travelSpeed: 0 } },
    ] },
    // 街口那头压过来的两个日军：镜 2 里是 55 m 外的两个剪影（85 mm 压过来才读得出）
    { id: "ija_a", kind: "ija", weapon: "Type38", seed: "ijaStreetA", track: [
      { t: 0.0, pos: [-211.0, 0, -1.6], ry: WEST, state: { moveSpeed: 0.30 } },
      { t: 8.5, pos: [-221.7, 0, -1.6], ry: WEST, state: { moveSpeed: 0.30 } },
    ] },
    { id: "ija_b", kind: "ija", weapon: "Type38", seed: "ijaStreetB", track: [
      { t: 0.0, pos: [-208.4, 0, 2.4], ry: WEST, state: { moveSpeed: 0.30 } },
      { t: 4.2, pos: [-213.7, 0, 2.4], ry: WEST, state: { moveSpeed: 0.30 } },
      { t: 8.5, pos: [-219.1, 0, 2.0], ry: WEST, state: { moveSpeed: 0.30 } },
    ] },
  ],
  shots: [
    {
      n: 1, seconds: 3.9, focalMm: 35,
      note: "顺子背影（3 m，画左），越过他看西关城门与门外的亮：门开着、路在外面。幺娃在 23 m 外的门内侧回头喊。机位微微跟着他往西挪，不给脸",
      camera: { from: [-263.4, 1.78, 2.30], to: [-265.2, 1.74, 2.05],
        look: [-284.0, 1.50, -0.70], lookTo: [-286.0, 1.50, -0.80], ease: "easeOut" },
      lines: [
        { at: 0.15, seconds: 3.70, who: "yaowa", tier: "虚构", text: "顺哥！最后一副都过了！", voiceCue: "ch5_yaowa_05" },
      ],
      sfx: [
        { at: 0.10, name: "rifleIjaFar", volume: 0.30 },
        { at: 1.40, name: "explosionFar", volume: 0.35 },
        { at: 2.60, name: "rifleNraFar", volume: 0.28 },
      ],
    },
    {
      n: 2, seconds: 1.4, focalMm: 85,
      note: "回头所见（85 mm 把 30 m 的担架与 55 m 的日军压进同一画面）：担架员跪在地上、伤员从担架上滑下来、街口两个日军正压过来。一眼看完，不给第二眼。机位在他头侧偏北 1.7 m —— 正贴着他的后脑往东拍会被自己的背挡死，侧开这一点点，85 mm 的窄框里就只剩街",
      camera: { from: [-269.5, 1.68, 2.30], look: [-239.4, 1.05, 1.60] },
      sfx: [
        { at: 0.05, name: "bodyFall", volume: 0.50 },
        { at: 0.50, name: "rifleIjaFar", volume: 0.45 },
      ],
    },
    {
      n: 3, seconds: 3.2, focalMm: 50,
      note: "锚在他身上的胸口构图（2 m，头在画框外）：手按住衣襟里那半封家书，转过身，迈步往回走。说完立刻恢复完全控制 —— 这一场到此为止，返回与白刃战都是玩家自己走",
      camera: { fromActor: "shunzi", from: [1.75, 1.22, 1.25], lookActor: "shunzi", look: [0, 1.16, 0] },
      lines: [
        { at: 0.10, seconds: 3.00, who: "shunzi", tier: "虚构", text: "我晓得。你们走。", voiceCue: "ch5_shunzi_03" },
      ],
      sfx: [
        { at: 1.90, name: "footstepRubble", volume: 0.40 },
        { at: 2.60, name: "rifleIjaFar", volume: 0.32 },
      ],
    },
  ],
  skipCard: {
    title: "转身",
    lines: [
      { tier: "虚构", text: "最后一副担架过了西关。军令是「不用再回来」，城门开着，门外就是往临城的路。" },
      { tier: "虚构", text: "身后的长街上，担架员跪倒，伤员滑落，日军已经压进街口。他转身走了回去。" },
    ],
  },
};

// ===========================================================================
// ②「视角接替」—— 12.0 s（§6 过场 2「约 12 秒」）
// ===========================================================================
//
// 四镜，一镜一个人：
//   镜 1（2.6 s）贴地视角（顺子倒下**不切黑**）：远处最后一副担架拐出街道。
//   镜 2（2.4 s）补机枪位的 124 师伤兵 —— 他就是关末视角接替①里说「看过两回」的人。
//   镜 3（2.6 s）递伤亡报告的电话兵，背影穿过院落；画里同时有拿枪的炊事兵、搬弹的医护兵。
//   镜 4（4.4 s）接通线路后中弹，听筒落地，另一端还在叫「东关？东关回话。」——
//        **不切黑**，这条声音直接接进终章（玩家在终章里就是电话另一端的小秦）。
//
// 「岗位不断有人补上」这件事，是靠这四镜里四个不同番号的人做同一件事说出来的，
// 不靠旁白讲。所以整场只有一句台词，而且是从听筒里传出来的。
export const CS_Ch5_PovChain = {
  id: "CS_Ch5_PovChain",
  title: "视角接替",
  seconds: 12.0,
  trigger: "afterLevel:CH5_Chengqiang",
  standalone: false,
  setOrigin: [0, 0, 0],
  why: "顺子倒下之后这座城还在打 —— 机枪位、电话线、师部，一个岗位接一个岗位有人补上。最后那句「东关？东关回话。」把玩家交到终章的小秦手里，中间不切黑。",
  presumed: [
    { id: "ch5PovChain", value: "机枪副射手／前沿电话兵／小秦三段视角为叙事构造",
      note: "城内各部混编就地抵抗有回忆录支持，具体的这三个人与这条通信链是虚构" },
  ],
  people: {},
  props: [
    // 镜 2 的机枪位：一道沙袋 + 一具枪身（演员空手趴在后面，枪由道具给）
    { kind: "box", size: [1.80, 0.50, 0.60], pos: [-153.20, 0.25, 2.40], mat: "Sandbag", name: "机枪位沙袋" },
    { kind: "box", size: [0.90, 0.16, 0.16], pos: [-153.00, 0.62, 2.40], mat: "Steel", name: "机枪" },
    // 镜 4 的听筒与线盘。听筒的**声明位置就是镜 3 开头他手里那个位置**（与 CS_LastWire
    // 同一条约定：pos == 第一段 propMove 的 from）——否则它会在镜 3 里悬在他前头几米的
    // 空气中。镜 3 用一段 propMove 把它跟着他挪，镜 4 再从胸口摔到地上。
    { kind: "box", size: [0.09, 0.20, 0.09], pos: [-92.15, 1.12, -3.12], color: 0x2a2622, roughness: 0.85, name: "听筒" },
    { kind: "box", size: [0.34, 0.30, 0.34], pos: [-96.40, 0.15, -2.90], mat: "WoodStock", name: "线盘" },
  ],
  cast: [
    // ── 镜 1：最后一副担架拐出街道（三个人一起走，走完插 hidden 帧退场）──
    { id: "danjia_c", kind: "nra", weapon: null, seed: "danjiaC", track: [
      { t: 0.0, pos: [-297.0, 0, 0.40], ry: 0.918, state: { moveSpeed: 0.39 } },
      { t: 2.6, pos: [-300.4, 0, -2.20], ry: 0.918, state: { moveSpeed: 0.39 } },
      { t: 2.7, pos: [-300.4, 0, -2.20], ry: 0.918, state: { hidden: true } },
    ] },
    { id: "danjia_d", kind: "nra", weapon: null, seed: "danjiaD", track: [
      { t: 0.0, pos: [-295.4, 0, 1.00], ry: 0.918, state: { moveSpeed: 0.39 } },
      { t: 2.6, pos: [-298.8, 0, -1.60], ry: 0.918, state: { moveSpeed: 0.39 } },
      { t: 2.7, pos: [-298.8, 0, -1.60], ry: 0.918, state: { hidden: true } },
    ] },
    { id: "litter_b", kind: "nra", weapon: null, seed: "litterB", track: [
      { t: 0.0, pos: [-296.2, 0, 0.70], ry: 0.918, state: { moveSpeed: 0, prone: 1, travelSpeed: 1.646 } },
      { t: 2.6, pos: [-299.6, 0, -1.90], ry: 0.918, state: { moveSpeed: 0, prone: 1, travelSpeed: 0 } },
      { t: 2.7, pos: [-299.6, 0, -1.90], ry: 0.918, state: { hidden: true } },
    ] },
    // ── 镜 2：补机枪位的 124 师伤兵（第一帧之前引擎自动隐藏，镜末插 hidden 退场）──
    { id: "s124", kind: "nra", weapon: null, seed: "s124Gunner", track: [
      { t: 2.60, pos: [-152.0, 0, 2.40], ry: WEST, state: { moveSpeed: 0, prone: 1, firing: true } },
      { t: 5.00, pos: [-152.0, 0, 2.40], ry: WEST, state: { moveSpeed: 0, prone: 1, firing: true } },
      { t: 5.05, pos: [-152.0, 0, 2.40], ry: WEST, state: { hidden: true } },
    ] },
    // ── 镜 3／镜 4：电话兵。走 → 跪下接线 → 中弹 → 倒 ──
    { id: "lineman", kind: "nra", weapon: null, seed: "linemanCh5", track: [
      { t: 5.00, pos: [-92.00, 0, -3.20], ry: WEST, state: { moveSpeed: 0.31, reach: 0.30 } },
      { t: 7.60, pos: [-95.40, 0, -3.40], ry: WEST, state: { moveSpeed: 0.12, reach: 0.30 } },
      { t: 8.60, pos: [-95.90, 0, -3.50], ry: 1.30, state: { moveSpeed: 0, kneel: 0.80, reach: 0.60 } },
      { t: 9.40, pos: [-95.90, 0, -3.50], ry: 1.30, state: { moveSpeed: 0, kneel: 0.80, hurt: 0.80 } },
      { t: 10.10, pos: [-96.00, 0, -3.60], ry: 1.30, state: { moveSpeed: 0, dying: 0.90 } },
      { t: 12.00, pos: [-96.00, 0, -3.60], ry: 1.30, state: { moveSpeed: 0, dead: true } },
    ] },
    // 院子里另外两个岗位：炊事兵拿枪、医护兵搬弹（镜 3 的画面深处，不给脸）
    { id: "cook", kind: "nra", weapon: "HanYang", seed: "cookCh5", track: [
      { t: 5.0, pos: [-88.50, 0, -6.20], ry: WEST, state: { moveSpeed: 0.18 } },
      { t: 12.0, pos: [-93.80, 0, -6.20], ry: WEST, state: { moveSpeed: 0.18 } },
    ] },
    { id: "medic", kind: "nra", weapon: null, seed: "medicCh5", track: [
      { t: 5.0, pos: [-97.50, 0, -7.40], ry: EAST, state: { moveSpeed: 0.15, reach: 0.50 } },
      { t: 12.0, pos: [-93.10, 0, -7.40], ry: EAST, state: { moveSpeed: 0.15, reach: 0.50 } },
    ] },
  ],
  shots: [
    {
      n: 1, seconds: 2.6, focalMm: 85,
      note: "贴地机位（0.34 m，顺子倒下的高度，不切黑）：85 mm 顺着西门大街压过去，最后一副担架在城门那头拐出街道。画面里没有他自己 —— 这是他还睁着眼时看见的最后一件事",
      camera: { from: [-231.4, 0.34, 1.15], look: [-298.5, 1.00, -1.20] },
      sfx: [
        { at: 0.20, name: "rifleIjaFar", volume: 0.40 },
        { at: 1.30, name: "explosionFar", volume: 0.32 },
        { at: 2.10, name: "rifleNraFar", volume: 0.26 },
      ],
    },
    {
      n: 2, seconds: 2.4, focalMm: 50,
      note: "切到另一条街的机枪位：124 师那个伤兵趴在沙袋后面打点射（他就是「看过两回」的人）。机位在他右后方 4 m，只有背与右肩",
      camera: { from: [-148.6, 1.12, 4.30], look: [-152.4, 0.72, 2.50] },
      flash: [
        { at: 0.50, pos: [-153.70, 0.66, 2.40], seconds: 0.06, size: 1.10 },
        { at: 0.62, pos: [-153.70, 0.66, 2.40], seconds: 0.06, size: 1.05 },
        { at: 0.74, pos: [-153.70, 0.66, 2.40], seconds: 0.06, size: 1.10 },
        { at: 1.55, pos: [-153.70, 0.66, 2.40], seconds: 0.06, size: 1.05 },
        { at: 1.67, pos: [-153.70, 0.66, 2.40], seconds: 0.06, size: 1.10 },
        { at: 1.79, pos: [-153.70, 0.66, 2.40], seconds: 0.06, size: 1.05 },
      ],
      sfx: [
        { at: 0.50, name: "zb26", volume: 0.7 }, { at: 0.62, name: "zb26", volume: 0.7 },
        { at: 0.74, name: "zb26", volume: 0.7 }, { at: 1.55, name: "zb26", volume: 0.7 },
        { at: 1.67, name: "zb26", volume: 0.7 }, { at: 1.79, name: "zb26", volume: 0.7 },
      ],
    },
    {
      n: 3, seconds: 2.6, focalMm: 50,
      note: "锚在电话兵身上的跟拍背影：他抱着线往院里走，画面深处是拿枪的炊事兵与搬弹的医护兵 —— 番号早就混在一起了，谁在就谁上",
      camera: { fromActor: "lineman", from: [3.20, 1.62, 1.50], lookActor: "lineman", look: [0, 1.20, 0] },
      // 听筒跟着他走（速度与他的轨道一致：3.41 m / 2.6 s）
      propMoves: [
        { name: "听筒", from: [-92.15, 1.12, -3.12], to: [-95.55, 1.12, -3.32], startAt: 0.0, endAt: 2.6, ease: "linear" },
      ],
      sfx: [
        { at: 0.30, name: "footstepDirt", volume: 0.35 },
        { at: 0.95, name: "footstepDirt", volume: 0.35 },
        { at: 1.80, name: "rifleIjaFar", volume: 0.34 },
      ],
    },
    {
      n: 4, seconds: 4.4, focalMm: 50,
      note: "低机位对着地面：他跪下接通线路、中弹、听筒掉在土上。镜头不追人，只看着那只还在响的听筒 —— 另一端叫的「东关」没有人再答。**不黑场**，这条声音直接接终章",
      camera: { from: [-94.60, 0.62, -2.30], look: [-96.30, 0.14, -3.55] },
      // 两段：先随他跪下（胸口略降），中弹后脱手摔在土上（§1.7：已开始的最晚一段生效）
      propMoves: [
        { name: "听筒", from: [-95.55, 1.12, -3.32], to: [-95.85, 0.98, -3.42],
          startAt: 0.0, endAt: 1.00, ease: "easeOut" },
        { name: "听筒", from: [-95.85, 0.98, -3.42], to: [-96.32, 0.06, -3.58],
          startAt: 1.85, endAt: 2.35, ease: "easeIn", rotTo: [1.40, 0.30, 0.20] },
      ],
      lines: [
        { at: 1.30, seconds: 3.05, who: "xiaoqin", tier: "虚构", text: "东关？东关回话。", voiceCue: "ch5_xiaoqin_01", off: true },
      ],
      sfx: [
        { at: 1.75, name: "rifleIjaFar", volume: 0.55 },
        { at: 1.82, name: "impactFlesh", volume: 0.50 },
        { at: 2.30, name: "impactWood", volume: 0.32 },
        { at: 2.48, name: "bodyFall", volume: 0.45 },
      ],
    },
  ],
  skipCard: {
    title: "视角接替",
    lines: [
      { tier: "主流", text: "守城部队主力建制瓦解后，残余官兵仍在城内继续抵抗：炊事兵上机枪，医护兵搬弹药，参谋守街口。" },
      { tier: "虚构", text: "前沿的电话兵在接通线路时中弹，听筒落在地上。另一端还在叫：「东关？东关回话。」" },
    ],
  },
};

// ===========================================================================
// ③ 视角接替的三张**身份字卡**（各 3.6—4.9 s）
// ===========================================================================
//
// §6 阶段⑫ 的三段接替以前只换出生点、换任务文字，玩家不知道自己变成了谁
//（§10.7 施工单最后一条：「缺的是『换身份』的表现」）。这三张卡把那件事说出来：
// **一秒黑帧 + 一行身份**，随后落在新的位置与朝向上（摆点层的 SwitchPovWithCard）。
//
// 与关末那一场 CS_Ch5_PovChain 是两回事：那一场是**顺子倒下之后**的十二秒交接
//（贴地 → 机枪位 → 电话兵 → 听筒落地），一镜一个人，它自己**不切黑**。
// 这三张是**关内**每一次真的换人操作时的过门。
//
// ★ 与策划案「段与段之间不切黑，用声音衔接」的关系：这三张卡的黑帧是抛光批
//   点名要的（1 s 黑帧 + 身份字卡）。折中的做法是**声音不断** —— 每一张的黑帧上
//   都压着远处的枪炮，卡与卡之间听起来是连着的；黑的只有画面，只有一秒。
//   要退回「完全不切黑」，把三张的镜 1（black:true 那一镜）删掉即可，
//   摆点层那一侧一个字都不用改。
const PovCard = (id, name, text, seconds, cardSeconds) => ({
  id,
  title: name,
  seconds,
  trigger: "afterLevel:CH5_Chengqiang",
  standalone: false,
  setOrigin: [0, 0, 0],
  why: "换人是这一段唯一的事件。玩家在一秒黑帧里知道自己成了谁，睁眼就落在那个岗位上 —— 不用旁白解释「岗位不断有人补上」。",
  people: {},
  props: [],
  cast: [],
  shots: [
    // 镜 1：一秒黑。**声音不断**（远处的枪与炮照旧），所以断的只有画面。
    {
      n: 1, seconds: 1.0, focalMm: 35, black: true,
      note: "一秒黑帧。远处的枪炮压着不停 —— 城还在打，只是换了一双眼睛。",
      camera: { from: [-230.0, 1.60, 0.0], look: [-200.0, 1.50, 0.0] },
      sfx: [
        { at: 0.05, name: "rifleIjaFar", volume: 0.30 },
        { at: 0.60, name: "explosionFar", volume: 0.26 },
      ],
    },
    // 镜 2：身份字卡（与序章地点卡同一档版式：black + titleCard + sub.title）。
    {
      n: 2, seconds: cardSeconds, focalMm: 35, black: true, titleCard: true,
      note: "身份字卡。只有一行，不加注解 —— 这个人是谁，接下来那半分钟自己会说。",
      camera: { from: [-230.0, 1.60, 0.0], look: [-200.0, 1.50, 0.0] },
      sfx: [{ at: 0.20, name: "rifleNraFar", volume: 0.24 }],
      subs: [{ at: 0.1, seconds: cardSeconds - 0.2, title: true, text }],
    },
  ],
  skipCard: {
    title: name,
    lines: [
      { tier: "主流", text: "守城部队主力建制瓦解后，残余官兵仍在城内继续抵抗，岗位不断有人补上。" },
      { tier: "虚构", text: `这一段由${name}接手。` },
    ],
  },
});

/** ⑫① 补机枪位的 124 师伤兵（「你会不会打？」「看过两回。」）。 */
export const CS_Ch5_PovGunnerCard =
  PovCard("CS_Ch5_PovGunnerCard", "机枪副射手", "第124师 · 机枪副射手", 4.9, 3.9);

/** ⑫② 递伤亡报告的前沿电话兵。 */
export const CS_Ch5_PovLinemanCard =
  PovCard("CS_Ch5_PovLinemanCard", "前沿电话兵", "前沿电话兵", 3.6, 2.6);

/** ⑫③ 小秦 —— 电话另一端。他从这一拍起是玩家，一直演到终章。 */
export const CS_Ch5_PovXiaoqinCard =
  PovCard("CS_Ch5_PovXiaoqinCard", "通信兵小秦", "通信兵 · 小秦", 3.8, 2.8);

/** 本章过场（按播放顺序）。Data_TengxianScript 汇总时照这个数组展开。 */
export const CH5_CUTSCENES = [
  CS_Ch5_TurnBack,
  CS_Ch5_PovGunnerCard, CS_Ch5_PovLinemanCard, CS_Ch5_PovXiaoqinCard,
  CS_Ch5_PovChain,
];

export default CH5_CUTSCENES;
