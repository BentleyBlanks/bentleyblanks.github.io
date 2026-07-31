// 《地道战 · 钟声》—— 三幕关卡布局数据。
//
// 只 import Data_Contract.mjs，绝不 import three.js：必须能在纯 Node 里跑。
// 字段名与取值枚举严格遵守 AGENTS.md 第 3 节。
//
// —— 几何约定（玩法层可以依赖）——
//  * floors 沿 X 展开，相邻段要么 x 区间相接，要么高差 ≤ 0.45（可直接迈上去），
//    要么由某个 shaft 竖向连通。不存在走到就卡死的断头路。
//  * shaft.yTop / yBottom 一定精确落在某段 floor 的 y 上。
//  * ceils 覆盖全部地道段。净空 = ceil.y - floor.y：
//      ≥ 1.78 站立（HEADROOM.standNeeds）
//      1.05 ~ 1.78 必须猫腰（HEADROOM.crouchNeeds）
//      0.62 ~ 1.05 必须爬行（HEADROOM.crawlNeeds）
//  * 所有位于 LAYER_Z.PLAY 的 prop / enemy / npc 的 y 都站在某段 floor 上。
//    z 不是 PLAY 的 prop 是纯背景/前景构图件，不受此限（远景剪影、通气孔等）。
//  * 互动 prop 一律把互动点放在脚下高度，保证 INTERACT.reachY 一定够得着
//    （例如"老槐树上的钟"的互动点是树下那根绳，y = 地面）。

import { LAYER_Z } from "./Data_Contract.mjs";

const FAR = LAYER_Z.FAR;
const BACK = LAYER_Z.BACK;
const MID = LAYER_Z.MID;
const PLAY = LAYER_Z.PLAY;
const FORE = LAYER_Z.FORE;

// ===========================================================================
// 第 1 幕 「钟声」 —— 高老忠 / 纯地表 / 约 128 米 / 3–4 分钟
// ---------------------------------------------------------------------------
// 教学靠布局：
//   x 0–24    走。无威胁直路，尽头（远景层）就是老槐树和钟——第一个"看得见的目标"。
//   x 24–50   猫腰。矮土墙 33–41（净空 1.35）压在唯一通路上，站着必被 a1_e_search1 看见。
//   x 50–78   用。院门（lever gateOpen）+ 柴垛（hide）；两个兵交叉视线。
//   x 78–106  综合。长矮墙 84–100（净空 1.30）+ 军犬（hearing 10.5），全程猫腰。
//   x 106–128 钟 → 追逐 → 出不去。
// 结局不是玩家失误：敲钟后 a1_t_chase 生成 a1_e_blocker（山田）站死地道口，
// 这是叙事必然，Rules 层不要把它当成惩罚。
// ===========================================================================
const act1 = {
  id: "act1",
  chapterId: "act1",
  title: "钟声",
  actor: "laozhong",
  bounds: { x0: 0, x1: 128, yTop: 8, yBottom: -6 },
  startX: 4,
  startY: 0,
  exit: { x: 125, y: 0, radius: 2.2, needAllVillagers: false, label: "碾盘下的地道口" },
  timeOfDay: "night",

  floors: [
    { id: "a1_f_road", x0: 0, x1: 24, y: 0, kind: "dirt" },
    { id: "a1_f_yard1", x0: 24, x1: 50, y: 0, kind: "dirt" },
    { id: "a1_f_yard2", x0: 50, x1: 78, y: 0.35, kind: "stone" },
    { id: "a1_f_yard3", x0: 78, x1: 106, y: 0, kind: "dirt" },
    { id: "a1_f_tree", x0: 106, x1: 128, y: 0, kind: "dirt" },
    // 出口地道口下面的一小段地道，让 a1_s_exit 的两端都贴在真实地板上。
    { id: "a1_f_stub", x0: 121, x1: 128, y: -4.5, kind: "tunnel" },
  ],

  ceils: [
    // 矮土墙一：教猫腰。净空 1.35 → 站不进去，蹲得过。
    { x0: 33, x1: 41, y: 1.35 },
    // 二道院的草棚：地板 y=0.35，净空 1.40。
    { x0: 68, x1: 74, y: 1.75 },
    // 三道院的长矮墙：军犬段全程猫腰。净空 1.30。
    { x0: 84, x1: 100, y: 1.30 },
    // 出口下的地道存根：净空 1.35。
    { x0: 121, x1: 128, y: -3.15 },
  ],

  shafts: [
    { id: "a1_s_exit", x: 125, yTop: 0, yBottom: -4.5, kind: "ladder", requiresHatch: "a1_h_exit" },
  ],

  hatches: [
    {
      id: "a1_h_exit",
      x: 125,
      shaftId: "a1_s_exit",
      hidden: false,
      opened: false,
      revealBy: null,
      label: "碾盘下的地道口",
      propId: "a1_pr_millstone",
    },
  ],

  props: [
    // —— 起点：无威胁直路，远景是钟 ——
    { id: "a1_pr_sign", x: 6, y: 0, z: PLAY, kind: "sign", facing: 1, interact: "read", data: { codexId: "codex_zhuanyi" }, label: "村口木牌" },
    { id: "a1_pr_lamp1", x: 11, y: 0, z: PLAY, kind: "lamp", facing: 1, interact: "none", data: null, label: null },
    { id: "a1_pr_house1", x: 15, y: 0, z: MID, kind: "house", facing: 1, interact: "none", data: null, label: null },
    { id: "a1_pr_trough1", x: 19.5, y: 0, z: PLAY, kind: "trough", facing: 1, interact: "none", data: null, label: null },
    // 远景层的老槐树 + 钟：开场就在画面里，这是第一个"看得见的目标"。
    { id: "a1_pr_treeFar", x: 21, y: 0, z: FAR, kind: "tree", facing: 1, interact: "none", data: null, label: null },
    { id: "a1_pr_bellFar", x: 21.6, y: 4.2, z: FAR, kind: "bell", facing: 1, interact: "none", data: null, label: null },
    { id: "a1_pr_houseFar1", x: 33, y: 0, z: BACK, kind: "house", facing: 1, interact: "none", data: null, label: null },
    { id: "a1_pr_houseFar2", x: 57, y: 0, z: BACK, kind: "house", facing: -1, interact: "none", data: null, label: null },

    // —— 一道院：发现敌人已经摸进村；矮墙教猫腰 ——
    { id: "a1_pr_corpse", x: 26, y: 0, z: PLAY, kind: "corpse", facing: 1, interact: "none", data: null, label: null },
    { id: "a1_pr_haystack1", x: 30, y: 0, z: PLAY, kind: "haystack", facing: 1, interact: "hide", data: { capacity: 1 }, label: "柴垛" },
    { id: "a1_pr_vat0", x: 34, y: 0, z: PLAY, kind: "vat", facing: 1, interact: "hide", data: { capacity: 1 }, label: "水缸" },
    { id: "a1_pr_cart0", x: 42, y: 0, z: PLAY, kind: "cart", facing: 1, interact: "hide", data: { capacity: 1 }, label: "马车" },
    { id: "a1_pr_haystack1b", x: 48, y: 0, z: PLAY, kind: "haystack", facing: 1, interact: "hide", data: { capacity: 1 }, label: "柴垛" },
    { id: "a1_pr_wall1", x: 37, y: 0, z: PLAY, kind: "wall", facing: 1, interact: "none", data: null, label: null },
    { id: "a1_pr_house2", x: 44, y: 0, z: MID, kind: "house", facing: -1, interact: "none", data: null, label: null },
    { id: "a1_pr_treeFore1", x: 46, y: 0, z: FORE, kind: "tree", facing: 1, interact: "none", data: null, label: null },

    // —— 二道院：院门 + 柴垛 + 交叉视线 ——
    { id: "a1_pr_gate1", x: 50.6, y: 0.35, z: PLAY, kind: "gate", facing: 1, interact: "lever", data: { channel: "gateOpen", needItem: null }, label: "院门" },
    { id: "a1_pr_vat1", x: 55, y: 0.35, z: PLAY, kind: "vat", facing: 1, interact: "hide", data: { capacity: 1 }, label: "水缸" },
    { id: "a1_pr_house3", x: 60, y: 0.35, z: MID, kind: "house", facing: 1, interact: "none", data: null, label: null },
    { id: "a1_pr_haystack2", x: 62, y: 0.35, z: PLAY, kind: "haystack", facing: 1, interact: "hide", data: { capacity: 1 }, label: "柴垛" },
    { id: "a1_pr_cart1", x: 67, y: 0.35, z: FORE, kind: "cart", facing: 1, interact: "none", data: null, label: null },
    { id: "a1_pr_wall2", x: 71, y: 0.35, z: PLAY, kind: "wall", facing: 1, interact: "none", data: null, label: null },
    { id: "a1_pr_haystack2b", x: 70, y: 0.35, z: PLAY, kind: "haystack", facing: 1, interact: "hide", data: { capacity: 1 }, label: "柴垛" },
    { id: "a1_pr_fence1", x: 76.5, y: 0.35, z: PLAY, kind: "fence", facing: 1, interact: "none", data: null, label: null },

    // —— 三道院：兵 + 军犬，长矮墙 ——
    { id: "a1_pr_trough2", x: 81, y: 0, z: PLAY, kind: "trough", facing: 1, interact: "hide", data: { capacity: 1 }, label: "驴槽" },
    { id: "a1_pr_stove1", x: 87, y: 0, z: PLAY, kind: "stove", facing: 1, interact: "none", data: null, label: null },
    { id: "a1_pr_house4", x: 90, y: 0, z: MID, kind: "house", facing: -1, interact: "none", data: null, label: null },
    { id: "a1_pr_wall3", x: 92, y: 0, z: PLAY, kind: "wall", facing: 1, interact: "none", data: null, label: null },
    { id: "a1_pr_haystack3", x: 97, y: 0, z: PLAY, kind: "haystack", facing: 1, interact: "hide", data: { capacity: 1 }, label: "柴垛" },
    { id: "a1_pr_haystack3b", x: 91, y: 0, z: PLAY, kind: "haystack", facing: 1, interact: "hide", data: { capacity: 1 }, label: "柴垛" },
    { id: "a1_pr_vat3", x: 102, y: 0, z: PLAY, kind: "vat", facing: 1, interact: "hide", data: { capacity: 1 }, label: "水缸" },
    { id: "a1_pr_fence2", x: 103, y: 0, z: FORE, kind: "fence", facing: 1, interact: "none", data: null, label: null },

    // —— 老槐树：钟 ——
    { id: "a1_pr_sign2", x: 107, y: 0, z: PLAY, kind: "sign", facing: 1, interact: "read", data: { codexId: "codex_tonghuo" }, label: "祠堂告示" },
    { id: "a1_pr_tree", x: 112, y: 0, z: PLAY, kind: "tree", facing: 1, interact: "none", data: null, label: null },
    // 钟挂在树上，互动点是树下垂到地面的绳，所以 y = 0。
    { id: "a1_pr_bell", x: 112.5, y: 0, z: PLAY, kind: "bell", facing: 1, interact: "bell", data: { rings: 3 }, label: "老槐树上的钟" },

    // —— 追逐段终点：碾盘下的地道口（他没能进去）——
    { id: "a1_pr_haystack4", x: 122, y: 0, z: PLAY, kind: "haystack", facing: 1, interact: "hide", data: { capacity: 1 }, label: "柴垛" },
    { id: "a1_pr_millstone", x: 125, y: 0, z: PLAY, kind: "millstone", facing: 1, interact: "hatch", data: { hatchId: "a1_h_exit" }, label: "碾盘下的地道口" },
  ],

  enemies: [
    // 一道院：背对着来回巡逻，矮墙是他的盲区。patrol 不覆盖出生点 x=4。
    {
      id: "a1_e_search1", x: 43, y: 0, kind: "search", facing: -1,
      patrol: { x0: 37, x1: 45, speed: 1.2, pauseSec: 1.4 },
      vision: { range: 10, halfAngleDeg: 34, height: 1.6 },
      hearing: 6.0, probeAt: null,
    },
    // 二道院：两个兵交叉视线。
    {
      id: "a1_e_search2", x: 58, y: 0.35, kind: "search", facing: 1,
      patrol: { x0: 53, x1: 66, speed: 1.35, pauseSec: 1.0 },
      vision: { range: 11, halfAngleDeg: 32, height: 1.6 },
      hearing: 6.0, probeAt: null,
    },
    {
      id: "a1_e_guard1", x: 74, y: 0.35, kind: "guard", facing: -1,
      patrol: { x0: 73, x1: 76, speed: 1.1, pauseSec: 2.2 },
      vision: { range: 12, halfAngleDeg: 28, height: 1.6 },
      hearing: 5.5, probeAt: null,
    },
    // 三道院：兵 + 军犬。狗的听觉 10.5，站起来走路（noise 0.42）必被听见。
    {
      id: "a1_e_search3", x: 92, y: 0, kind: "search", facing: 1,
      patrol: { x0: 88, x1: 98, speed: 1.45, pauseSec: 0.9 },
      vision: { range: 11, halfAngleDeg: 34, height: 1.6 },
      hearing: 6.5, probeAt: null,
    },
    {
      id: "a1_e_dog1", x: 98, y: 0, kind: "dog", facing: -1,
      patrol: { x0: 90, x1: 101, speed: 2.0, pauseSec: 0.6 },
      vision: { range: 8, halfAngleDeg: 44, height: 0.7 },
      hearing: 10.5, probeAt: null,
    },
    // —— 以下两个由 a1_t_chase 的 emit.spawn 唤出，之前应视为不存在 ——
    {
      id: "a1_e_chase1", x: 108, y: 0, kind: "search", facing: 1,
      patrol: { x0: 106, x1: 113, speed: 2.2, pauseSec: 0.3 },
      vision: { range: 12, halfAngleDeg: 36, height: 1.6 },
      hearing: 7.0, probeAt: null,
    },
    // 山田：敲钟后堵死碾盘那个口。玩家做对一切也过不去——这是叙事必然。
    {
      id: "a1_e_blocker", x: 117, y: 0, kind: "officer", facing: -1,
      patrol: { x0: 115, x1: 119, speed: 1.6, pauseSec: 0.9 },
      vision: { range: 14, halfAngleDeg: 40, height: 1.65 },
      hearing: 7.0, probeAt: null,
    },
  ],

  npcs: [],
  hazards: [],

  triggers: [
    { id: "a1_t_open", x0: 0, x1: 7, yMin: -1, yMax: 4, once: true,
      emit: { panels: ["a1_open", "a1_p1"], reveal: [], arm: [], spawn: [], objective: "进村看看", checkpoint: false, win: false } },
    { id: "a1_t_corpse", x0: 24, x1: 27.5, yMin: -1, yMax: 4, once: true,
      emit: { panels: ["a1_p2"], reveal: [], arm: [], spawn: [], objective: "鬼子摸进村了 —— 别出声", checkpoint: true, win: false } },
    { id: "a1_t_wall1", x0: 30.5, x1: 33.5, yMin: -1, yMax: 4, once: true,
      emit: { panels: ["a1_p3"], reveal: [], arm: [], spawn: [], objective: "猫腰，从墙根过去", checkpoint: false, win: false } },
    { id: "a1_t_yard1clear", x0: 48, x1: 51.5, yMin: -1, yMax: 4, once: true,
      emit: { panels: ["a1_p4"], reveal: [], arm: [], spawn: [], objective: "开院门，穿过二道院", checkpoint: true, win: false } },
    { id: "a1_t_gate", x0: 63, x1: 66, yMin: -1, yMax: 4, once: true,
      emit: { panels: ["a1_p5"], reveal: [], arm: [], spawn: [], objective: "两个人的眼睛是交叉的", checkpoint: false, win: false } },
    { id: "a1_t_yard2clear", x0: 76, x1: 79.5, yMin: -1, yMax: 4, once: true,
      emit: { panels: ["a1_p6"], reveal: [], arm: [], spawn: [], objective: "有狗 —— 全程猫腰", checkpoint: true, win: false } },
    { id: "a1_t_dog", x0: 83, x1: 86, yMin: -1, yMax: 4, once: true,
      emit: { panels: ["a1_p7"], reveal: [], arm: [], spawn: [], objective: "贴着墙根走完这条街", checkpoint: false, win: false } },
    { id: "a1_t_tree", x0: 104, x1: 107.5, yMin: -1, yMax: 4, once: true,
      emit: { panels: ["a1_p8"], reveal: [], arm: [], spawn: [], objective: "敲响老槐树上的钟", checkpoint: true, win: false } },
    // 过了钟才触发。敲钟的巨响把所有人引过来，同时唤出堵口的山田。
    { id: "a1_t_chase", x0: 114, x1: 118, yMin: -1, yMax: 4, once: true,
      emit: { panels: ["a1_p9", "a1_p10"], reveal: ["a1_h_exit"], arm: [], spawn: ["a1_e_chase1", "a1_e_blocker"], objective: "跑，碾盘下有地道口", checkpoint: true, win: false } },
    { id: "a1_t_end", x0: 123, x1: 128, yMin: -1, yMax: 4, once: true,
      emit: { panels: ["a1_p11", "a1_p12", "a1_close"], reveal: [], arm: [], spawn: [], objective: "", checkpoint: false, win: true } },
  ],

  checkpoints: [
    { id: "a1_cp1", x: 26, y: 0, label: "村口" },
    { id: "a1_cp2", x: 50.5, y: 0.35, label: "头道院" },
    { id: "a1_cp3", x: 78.5, y: 0, label: "二道院" },
    { id: "a1_cp4", x: 106.5, y: 0, label: "老槐树下" },
    { id: "a1_cp5", x: 115, y: 0, label: "钟声之后" },
  ],

  objectives: [
    { id: "a1_o1", text: "进村看看", doneWhen: { trigger: "a1_t_corpse" } },
    { id: "a1_o2", text: "绕过搜村的鬼子", doneWhen: { trigger: "a1_t_yard2clear" } },
    { id: "a1_o3", text: "到老槐树下", doneWhen: { trigger: "a1_t_tree" } },
    { id: "a1_o4", text: "敲响钟", doneWhen: { propUsed: "a1_pr_bell" } },
    { id: "a1_o5", text: "跑向碾盘下的地道口", doneWhen: { atExit: true } },
  ],
};

// ===========================================================================
// 第 2 幕 「翻口」 —— 高传宝 / 纯地下 / 约 148 米 / 4–5 分钟
// ---------------------------------------------------------------------------
// 「三通」在几何上落实：
//   高低相通 —— 干线 y=-8.0（可站立）与藏身洞 y=-3.8（永远只能猫腰/爬行）之间
//               共 8 处竖井，4 组"上去 + 下来"的回路，没有一条支线是断头路。
//   内外相通 —— 干线一路通到 x=148 的村外枯井底，本幕出口就在那儿。
//   街道相通 —— s4 (x 116–134) 横穿两个院子的地下，正上方是 a2_f_top2 的街面，
//               x 116–126 净空只有 0.85（必须爬行），头顶三个 vent 漏下靴声。
// 教学顺序：x6–11 矮段猫腰 → x12 捡马灯 → x30 竖井 → x50 翻口（单向，从下往上顶）
//           → x46–62 头顶刺刀（躲开 probeAt 那几个 x）→ 四位乡亲 → 枯井。
// a2_f_top1 / a2_f_top2 是地表街面，只给 probeAt 敌人站，玩家到不了（无竖井相连），
// 这是有意的：它们不参与玩家通行图。
// ===========================================================================
const act2 = {
  id: "act2",
  chapterId: "act2",
  title: "翻口",
  actor: "chuanbao",
  bounds: { x0: 0, x1: 152, yTop: 3, yBottom: -11 },
  startX: 4,
  startY: -8.0,
  exit: { x: 145, y: -8.0, radius: 2.4, needAllVillagers: true, label: "村外枯井底" },
  timeOfDay: "night",

  floors: [
    // 深层干线 y = -8.0，四段首尾相接。
    { id: "a2_f_d1", x0: 0, x1: 44, y: -8.0, kind: "tunnel" },
    { id: "a2_f_d2", x0: 44, x1: 76, y: -8.0, kind: "tunnel" },
    { id: "a2_f_d3", x0: 76, x1: 112, y: -8.0, kind: "tunnel" },
    { id: "a2_f_d4", x0: 112, x1: 148, y: -8.0, kind: "tunnel" },
    // 浅层藏身洞 y = -3.8，四个互不相连的支线，各自靠两口竖井接回干线。
    { id: "a2_f_s1", x0: 26, x1: 40, y: -3.8, kind: "tunnel" },
    { id: "a2_f_s2", x0: 46, x1: 66, y: -3.8, kind: "tunnel" },
    { id: "a2_f_s3", x0: 84, x1: 100, y: -3.8, kind: "tunnel" },
    { id: "a2_f_s4", x0: 116, x1: 134, y: -3.8, kind: "tunnel" },
    // 地表街面：只承载头顶捅刺刀的敌人，玩家无法抵达（有意为之）。
    { id: "a2_f_top1", x0: 40, x1: 66, y: 0, kind: "dirt" },
    { id: "a2_f_top2", x0: 110, x1: 138, y: 0, kind: "dirt" },
    // 村外井台。枯井绳梯的上端落在这儿。
    { id: "a2_f_out", x0: 141, x1: 152, y: 0, kind: "dirt" },
  ],

  ceils: [
    // —— 干线 d1：站立 → 矮段（猫腰教学）→ 站立 ——
    { x0: 0, x1: 6, y: -6.22 },
    { x0: 6, x1: 11, y: -6.65 },
    { x0: 11, x1: 44, y: -6.22 },
    // —— 干线 d2 ——
    { x0: 44, x1: 76, y: -6.22 },
    // —— 干线 d3：中间一段窄，必须猫腰 ——
    { x0: 76, x1: 92, y: -6.22 },
    { x0: 92, x1: 100, y: -6.90 },
    { x0: 100, x1: 112, y: -6.22 },
    // —— 干线 d4 ——
    { x0: 112, x1: 148, y: -6.22 },
    // —— 藏身洞：净空 1.20，全程猫腰 ——
    { x0: 26, x1: 40, y: -2.60 },
    { x0: 46, x1: 66, y: -2.60 },
    { x0: 84, x1: 100, y: -2.60 },
    // 街道正下方：净空 0.85，必须爬行。
    { x0: 116, x1: 126, y: -2.95 },
    { x0: 126, x1: 134, y: -2.60 },
  ],

  shafts: [
    { id: "a2_sh_a", x: 30, yTop: -3.8, yBottom: -8.0, kind: "ladder", requiresHatch: null },
    { id: "a2_sh_b", x: 38, yTop: -3.8, yBottom: -8.0, kind: "dirt", requiresHatch: null },
    // 翻口：从下往上顶开的那口。
    { id: "a2_sh_c", x: 50, yTop: -3.8, yBottom: -8.0, kind: "ladder", requiresHatch: "a2_h_fanko" },
    { id: "a2_sh_d", x: 65, yTop: -3.8, yBottom: -8.0, kind: "dirt", requiresHatch: null },
    { id: "a2_sh_e", x: 88, yTop: -3.8, yBottom: -8.0, kind: "ladder", requiresHatch: null },
    { id: "a2_sh_f", x: 98, yTop: -3.8, yBottom: -8.0, kind: "rope", requiresHatch: null },
    { id: "a2_sh_g", x: 120, yTop: -3.8, yBottom: -8.0, kind: "ladder", requiresHatch: null },
    { id: "a2_sh_h", x: 132, yTop: -3.8, yBottom: -8.0, kind: "dirt", requiresHatch: null },
    // 枯井：井底就是本幕出口，绳子通到村外井台。
    { id: "a2_sh_well", x: 145, yTop: 0, yBottom: -8.0, kind: "rope", requiresHatch: "a2_h_well" },
  ],

  hatches: [
    { id: "a2_h_fanko", x: 50, shaftId: "a2_sh_c", hidden: false, opened: false, revealBy: null, label: "翻口", propId: "a2_pr_fanko" },
    { id: "a2_h_well", x: 145, shaftId: "a2_sh_well", hidden: true, opened: false, revealBy: "a2_t_wellnear", label: "枯井口", propId: "a2_pr_well" },
  ],

  props: [
    // —— 干线 d1：开场。点着的马灯就是"看得见的目标" ——
    { id: "a2_pr_beam1", x: 7, y: -8.0, z: PLAY, kind: "prop_beam", facing: 1, interact: "none", data: null, label: null },
    { id: "a2_pr_lantern", x: 12, y: -8.0, z: PLAY, kind: "lantern", facing: 1, interact: "pickup", data: { item: "lantern" }, label: "马灯" },
    { id: "a2_pr_crock1", x: 17, y: -8.0, z: PLAY, kind: "crock", facing: 1, interact: "none", data: null, label: null },
    { id: "a2_pr_vent1", x: 20, y: -6.22, z: PLAY, kind: "vent", facing: 1, interact: "none", data: null, label: null },
    { id: "a2_pr_sign1", x: 21.5, y: -8.0, z: PLAY, kind: "sign", facing: 1, interact: "read", data: { codexId: "codex_santong" }, label: "土墙上刻的字" },
    { id: "a2_pr_beam2", x: 25, y: -8.0, z: PLAY, kind: "prop_beam", facing: 1, interact: "none", data: null, label: null },
    { id: "a2_pr_beam3", x: 33, y: -8.0, z: PLAY, kind: "prop_beam", facing: 1, interact: "none", data: null, label: null },
    { id: "a2_pr_trough_d1", x: 41, y: -8.0, z: PLAY, kind: "trough", facing: 1, interact: "none", data: null, label: null },

    // —— 藏身洞 s1：教"上下两层"。有生活痕迹。 ——
    { id: "a2_pr_beam4", x: 28, y: -3.8, z: PLAY, kind: "prop_beam", facing: 1, interact: "none", data: null, label: null },
    { id: "a2_pr_kang1", x: 32, y: -3.8, z: PLAY, kind: "kang", facing: 1, interact: "hide", data: { capacity: 1 }, label: "被褥堆" },
    { id: "a2_pr_vent2", x: 33.5, y: -2.60, z: PLAY, kind: "vent", facing: 1, interact: "none", data: null, label: null },
    { id: "a2_pr_crock2", x: 35, y: -3.8, z: PLAY, kind: "crock", facing: 1, interact: "none", data: null, label: null },
    { id: "a2_pr_stove_s1", x: 37, y: -3.8, z: PLAY, kind: "stove", facing: 1, interact: "none", data: null, label: null },

    // —— 干线 d2：翻口在这儿，互动点在竖井下端（单向，只能从下往上顶）——
    { id: "a2_pr_beam5", x: 46, y: -8.0, z: PLAY, kind: "prop_beam", facing: 1, interact: "none", data: null, label: null },
    { id: "a2_pr_fanko", x: 50, y: -8.0, z: PLAY, kind: "trapdoor", facing: 1, interact: "hatch", data: { hatchId: "a2_h_fanko" }, label: "翻口" },
    { id: "a2_pr_crock3", x: 66, y: -8.0, z: PLAY, kind: "crock", facing: 1, interact: "none", data: null, label: null },
    { id: "a2_pr_loophole1", x: 70, y: -8.0, z: PLAY, kind: "loophole", facing: 1, interact: "none", data: null, label: null },
    { id: "a2_pr_beam6", x: 73, y: -8.0, z: PLAY, kind: "prop_beam", facing: 1, interact: "none", data: null, label: null },

    // —— 藏身洞 s2：头顶刺刀。通气孔标出危险的 x，炕洞是安全格。 ——
    { id: "a2_pr_crock4", x: 47, y: -3.8, z: PLAY, kind: "crock", facing: 1, interact: "none", data: null, label: null },
    { id: "a2_pr_vent3", x: 48, y: -2.60, z: PLAY, kind: "vent", facing: 1, interact: "none", data: null, label: null },
    { id: "a2_pr_kang2", x: 51, y: -3.8, z: PLAY, kind: "kang", facing: 1, interact: "hide", data: { capacity: 1 }, label: "藏身洞" },
    { id: "a2_pr_vent4", x: 53, y: -2.60, z: PLAY, kind: "vent", facing: 1, interact: "none", data: null, label: null },
    { id: "a2_pr_kang2b", x: 55, y: -3.8, z: PLAY, kind: "kang", facing: 1, interact: "hide", data: { capacity: 1 }, label: "被褥堆" },
    { id: "a2_pr_vent5", x: 57, y: -2.60, z: PLAY, kind: "vent", facing: 1, interact: "none", data: null, label: null },
    { id: "a2_pr_vent5b", x: 60, y: -2.60, z: PLAY, kind: "vent", facing: 1, interact: "none", data: null, label: null },
    { id: "a2_pr_vent5c", x: 63, y: -2.60, z: PLAY, kind: "vent", facing: 1, interact: "none", data: null, label: null },
    { id: "a2_pr_beam7", x: 64, y: -3.8, z: PLAY, kind: "prop_beam", facing: 1, interact: "none", data: null, label: null },

    // —— 干线 d3 ——
    { id: "a2_pr_beam8", x: 80, y: -8.0, z: PLAY, kind: "prop_beam", facing: 1, interact: "none", data: null, label: null },
    { id: "a2_pr_sign2", x: 83, y: -8.0, z: PLAY, kind: "sign", facing: 1, interact: "read", data: { codexId: "codex_fanko" }, label: "支撑木上的刻痕" },
    { id: "a2_pr_beam9", x: 95, y: -8.0, z: PLAY, kind: "prop_beam", facing: 1, interact: "none", data: null, label: null },
    { id: "a2_pr_waterpipe1", x: 102, y: -8.0, z: PLAY, kind: "waterpipe", facing: 1, interact: "none", data: null, label: null },
    { id: "a2_pr_crock5", x: 108, y: -8.0, z: PLAY, kind: "crock", facing: 1, interact: "none", data: null, label: null },

    // —— 藏身洞 s3：粮窖 + 备用马灯（万一玩家把灯放下了）——
    { id: "a2_pr_lantern2", x: 86, y: -3.8, z: PLAY, kind: "lantern", facing: 1, interact: "pickup", data: { item: "lantern" }, label: "马灯" },
    { id: "a2_pr_vent6", x: 90, y: -2.60, z: PLAY, kind: "vent", facing: 1, interact: "none", data: null, label: null },
    { id: "a2_pr_crock6", x: 91, y: -3.8, z: PLAY, kind: "crock", facing: 1, interact: "none", data: null, label: null },
    { id: "a2_pr_kang3", x: 96, y: -3.8, z: PLAY, kind: "kang", facing: 1, interact: "hide", data: { capacity: 1 }, label: "被褥堆" },
    { id: "a2_pr_beam10", x: 99, y: -3.8, z: PLAY, kind: "prop_beam", facing: 1, interact: "none", data: null, label: null },

    // —— 干线 d4 + 枯井 ——
    { id: "a2_pr_beam11", x: 116, y: -8.0, z: PLAY, kind: "prop_beam", facing: 1, interact: "none", data: null, label: null },
    { id: "a2_pr_crock7", x: 135, y: -8.0, z: PLAY, kind: "crock", facing: 1, interact: "none", data: null, label: null },
    { id: "a2_pr_chokepoint1", x: 137, y: -8.0, z: PLAY, kind: "chokepoint", facing: 1, interact: "none", data: null, label: "卡口" },
    { id: "a2_pr_beam12", x: 141, y: -8.0, z: PLAY, kind: "prop_beam", facing: 1, interact: "none", data: null, label: null },
    { id: "a2_pr_well", x: 145, y: -8.0, z: PLAY, kind: "well", facing: 1, interact: "hatch", data: { hatchId: "a2_h_well" }, label: "枯井口" },

    // —— 藏身洞 s4：街道底下，爬行段，靴声从三个通气孔漏下来 ——
    { id: "a2_pr_vent7", x: 118, y: -2.95, z: PLAY, kind: "vent", facing: 1, interact: "none", data: null, label: null },
    { id: "a2_pr_vent8", x: 122, y: -2.95, z: PLAY, kind: "vent", facing: 1, interact: "none", data: null, label: null },
    { id: "a2_pr_beam13", x: 125, y: -3.8, z: PLAY, kind: "prop_beam", facing: 1, interact: "none", data: null, label: null },
    { id: "a2_pr_kang4b", x: 124, y: -3.8, z: PLAY, kind: "kang", facing: 1, interact: "hide", data: { capacity: 1 }, label: "被褥堆" },
    { id: "a2_pr_vent9", x: 126, y: -2.95, z: PLAY, kind: "vent", facing: 1, interact: "none", data: null, label: null },
    { id: "a2_pr_vent10", x: 130, y: -2.60, z: PLAY, kind: "vent", facing: 1, interact: "none", data: null, label: null },
    { id: "a2_pr_kang4", x: 133, y: -3.8, z: PLAY, kind: "kang", facing: 1, interact: "hide", data: { capacity: 1 }, label: "被褥堆" },

    // —— 地表街面（构图 + 敌人站位）——
    { id: "a2_pr_house_t1", x: 50, y: 0, z: MID, kind: "house", facing: 1, interact: "none", data: null, label: null },
    { id: "a2_pr_millstone_t1", x: 62, y: 0, z: PLAY, kind: "millstone", facing: 1, interact: "none", data: null, label: null },
    { id: "a2_pr_wall_t1", x: 116, y: 0, z: PLAY, kind: "wall", facing: 1, interact: "none", data: null, label: null },
    { id: "a2_pr_house_t2", x: 124, y: 0, z: MID, kind: "house", facing: -1, interact: "none", data: null, label: null },
    { id: "a2_pr_lamp_out", x: 146, y: 0, z: BACK, kind: "lamp", facing: 1, interact: "none", data: null, label: null },
    { id: "a2_pr_treeOut", x: 149, y: 0, z: BACK, kind: "tree", facing: 1, interact: "none", data: null, label: null },
  ],

  enemies: [
    // 头顶捅刺刀的两个：probeAt 的 x 就是藏身洞 s2 里的死亡格。
    {
      id: "a2_e_probe1", x: 48, y: 0, kind: "search", facing: 1,
      patrol: { x0: 42, x1: 58, speed: 1.3, pauseSec: 1.6 },
      vision: { range: 9, halfAngleDeg: 30, height: 1.6 },
      hearing: 6.0, probeAt: [48, 53, 57],
    },
    {
      id: "a2_e_probe2", x: 62, y: 0, kind: "guard", facing: -1,
      patrol: { x0: 58, x1: 65, speed: 1.1, pauseSec: 2.1 },
      vision: { range: 8, halfAngleDeg: 28, height: 1.6 },
      hearing: 5.5, probeAt: [60, 63],
    },
    // 街道段：一个兵一路捅过去，一条狗来回跑。
    {
      id: "a2_e_probe3", x: 120, y: 0, kind: "search", facing: 1,
      patrol: { x0: 113, x1: 135, speed: 1.5, pauseSec: 1.0 },
      vision: { range: 9, halfAngleDeg: 32, height: 1.6 },
      hearing: 6.5, probeAt: [118, 122, 126, 130],
    },
    {
      id: "a2_e_dog2", x: 128, y: 0, kind: "dog", facing: -1,
      patrol: { x0: 112, x1: 136, speed: 1.9, pauseSec: 0.5 },
      vision: { range: 8, halfAngleDeg: 44, height: 0.7 },
      hearing: 9.5, probeAt: null,
    },
  ],

  npcs: [
    { id: "a2_n_child", x: 58.5, y: -3.8, name: "小豆子", role: "child", follow: false, rescued: false },
    { id: "a2_n_elder", x: 94, y: -3.8, name: "王大爷", role: "elder", follow: false, rescued: false },
    { id: "a2_n_v1", x: 105, y: -8.0, name: "秀兰", role: "villager", follow: false, rescued: false },
    { id: "a2_n_v2", x: 128, y: -3.8, name: "老栓", role: "villager", follow: false, rescued: false },
  ],

  hazards: [],

  triggers: [
    { id: "a2_t_open", x0: 0, x1: 5, yMin: -9.5, yMax: -6.0, once: true,
      emit: { panels: ["a2_open", "a2_p1"], reveal: [], arm: [], spawn: [], objective: "跟着那盏马灯的光走", checkpoint: false, win: false } },
    { id: "a2_t_low", x0: 5.5, x1: 8, yMin: -9.5, yMax: -6.0, once: true,
      emit: { panels: ["a2_p2"], reveal: [], arm: [], spawn: [], objective: "猫腰过去", checkpoint: false, win: false } },
    { id: "a2_t_lantern", x0: 11, x1: 14, yMin: -9.5, yMax: -6.0, once: true,
      emit: { panels: ["a2_p3"], reveal: [], arm: [], spawn: [], objective: "拿上马灯", checkpoint: true, win: false } },
    { id: "a2_t_shaft", x0: 28, x1: 32, yMin: -9.5, yMax: -6.0, once: true,
      emit: { panels: ["a2_p4"], reveal: [], arm: [], spawn: [], objective: "上竖井，看看藏身洞", checkpoint: false, win: false } },
    { id: "a2_t_hide1", x0: 30, x1: 34, yMin: -5.0, yMax: -2.4, once: true,
      emit: { panels: ["a2_p5"], reveal: [], arm: [], spawn: [], objective: "上下两层都得记住", checkpoint: true, win: false } },
    { id: "a2_t_fanko", x0: 47, x1: 52, yMin: -9.5, yMax: -6.0, once: true,
      emit: { panels: ["a2_p6"], reveal: ["a2_h_fanko"], arm: [], spawn: [], objective: "从下头顶开翻口", checkpoint: false, win: false } },
    { id: "a2_t_probe", x0: 48, x1: 52, yMin: -5.0, yMax: -2.4, once: true,
      emit: { panels: ["a2_p7"], reveal: [], arm: [], spawn: [], objective: "刺刀在头顶 —— 别停在通气孔底下", checkpoint: true, win: false } },
    { id: "a2_t_elder", x0: 84, x1: 88, yMin: -5.0, yMax: -2.4, once: true,
      emit: { panels: ["a2_p8"], reveal: [], arm: [], spawn: [], objective: "王大爷在西院底下", checkpoint: true, win: false } },
    { id: "a2_t_mid", x0: 104, x1: 108, yMin: -9.5, yMax: -6.0, once: true,
      emit: { panels: ["a2_p9"], reveal: [], arm: [], spawn: [], objective: "人还不齐 —— 别落下谁", checkpoint: true, win: false } },
    { id: "a2_t_street", x0: 116, x1: 120, yMin: -5.0, yMax: -2.4, once: true,
      emit: { panels: ["a2_p10"], reveal: [], arm: [], spawn: [], objective: "头顶就是街 —— 爬过去", checkpoint: true, win: false } },
    { id: "a2_t_wellnear", x0: 138, x1: 142, yMin: -9.5, yMax: -6.0, once: true,
      emit: { panels: ["a2_p11"], reveal: ["a2_h_well"], arm: [], spawn: [], objective: "到枯井底，人齐了就上去", checkpoint: true, win: false } },
    { id: "a2_t_end", x0: 143, x1: 148, yMin: -9.5, yMax: -6.0, once: true,
      emit: { panels: ["a2_p12", "a2_close"], reveal: [], arm: [], spawn: [], objective: "", checkpoint: false, win: true } },
  ],

  checkpoints: [
    { id: "a2_cp1", x: 13, y: -8.0, label: "马灯" },
    { id: "a2_cp2", x: 32, y: -3.8, label: "头一个藏身洞" },
    { id: "a2_cp3", x: 50, y: -3.8, label: "翻口上头" },
    { id: "a2_cp4", x: 86, y: -3.8, label: "西院支道" },
    { id: "a2_cp5", x: 106, y: -8.0, label: "干线中段" },
    { id: "a2_cp6", x: 118, y: -3.8, label: "街道底下" },
    { id: "a2_cp7", x: 140, y: -8.0, label: "枯井前" },
  ],

  objectives: [
    { id: "a2_o1", text: "拿上马灯", doneWhen: { propUsed: "a2_pr_lantern" } },
    { id: "a2_o2", text: "摸清上下两层", doneWhen: { trigger: "a2_t_hide1" } },
    { id: "a2_o3", text: "顶开翻口", doneWhen: { propUsed: "a2_pr_fanko" } },
    { id: "a2_o4", text: "找齐四位乡亲", doneWhen: { npcRescued: "all" } },
    { id: "a2_o5", text: "带他们到村外枯井", doneWhen: { atExit: true } },
  ],
};

// ===========================================================================
// 第 3 幕 「转移」 —— 高传宝 / 地表 ⇄ 地下 / 约 180 米 / 5–6 分钟
// ---------------------------------------------------------------------------
// 四次层间切换（几何上强制，不是可选）：
//   地下 d1/d2 (x 0–70) --a3_sh_mill x63--> 地表 su1/su2 (x 60–106)
//   地表 su2 --a3_sh_m1 x90--> 短地道 dm (x 88–100) --a3_sh_m2 x99--> 地表 su2
//   地表 su3 --a3_sh_kang x116--> 地下 d3/d4 (x 110–178)
//   干线在 x=70 就断了（塌方），d3 从 x=110 才开始 —— 地表那一段绕不过去。
// 剧本落点：
//   x 0    毒烟从背后 armAt=a3_t_open
//   x 24–40 粮窖支线，木塞 a3_pr_plug 在 x=35
//   x 52   卡口 lever gasSeal（needItem "plug"）
//   x 63   碾盘下的口 → 上地表
//   x 90/99 驴槽/水缸的口，钻过哨兵底下
//   x 112  水井辘轳 lever waterDivert（反灌敌人的烟洞 + 冲开塌方）
//   x 116  炕下的口 → 回地下，跟三位乡亲汇合
//   x 148–172 干线畅通但山田在头顶搜；要放下马灯摸黑走，靠 vent 漏下的月光辨路
//   x 174  黑风口，needAllVillagers
// a3_f_top3 是最后那段的地表街面，只给山田一伙站，玩家到不了。
// ===========================================================================
const act3 = {
  id: "act3",
  chapterId: "act3",
  title: "转移",
  actor: "chuanbao",
  bounds: { x0: 0, x1: 180, yTop: 8, yBottom: -11 },
  startX: 4,
  startY: -8.0,
  exit: { x: 174, y: -8.0, radius: 2.6, needAllVillagers: true, label: "黑风口" },
  timeOfDay: "dawn",

  floors: [
    // 地下：西段干线（毒烟从这头灌进来）
    { id: "a3_f_d1", x0: 0, x1: 44, y: -8.0, kind: "tunnel" },
    { id: "a3_f_d2", x0: 44, x1: 70, y: -8.0, kind: "tunnel" },
    // 粮窖支线（木塞在这儿），两口竖井接回干线，不是断头路。
    { id: "a3_f_g1", x0: 24, x1: 40, y: -4.2, kind: "tunnel" },
    // 地表
    { id: "a3_f_su1", x0: 60, x1: 88, y: 0, kind: "dirt" },
    { id: "a3_f_su2", x0: 88, x1: 106, y: 0.4, kind: "stone" },
    { id: "a3_f_su3", x0: 106, x1: 124, y: 0, kind: "dirt" },
    // 街道底下的短地道：绕开两个哨兵和一条狗
    { id: "a3_f_dm", x0: 88, x1: 100, y: -4.5, kind: "tunnel" },
    // 地下：东段干线（塌方之后的那一半）
    { id: "a3_f_d3", x0: 110, x1: 148, y: -8.0, kind: "tunnel" },
    { id: "a3_f_d4", x0: 148, x1: 178, y: -8.0, kind: "tunnel" },
    // 最后一段的地表街面：只承载山田一伙，玩家到不了（有意为之）。
    { id: "a3_f_top3", x0: 146, x1: 168, y: 0, kind: "dirt" },
    // 黑风口外的坡顶
    { id: "a3_f_out", x0: 170, x1: 180, y: 0, kind: "dirt" },
  ],

  ceils: [
    // 西段干线
    { x0: 0, x1: 18, y: -6.22 },
    { x0: 18, x1: 24, y: -6.70 },
    { x0: 24, x1: 44, y: -6.22 },
    { x0: 44, x1: 56, y: -6.22 },
    { x0: 56, x1: 62, y: -6.75 },
    { x0: 62, x1: 70, y: -6.22 },
    // 粮窖：净空 1.20，猫腰
    { x0: 24, x1: 40, y: -3.00 },
    // 街道底下的短地道：净空 1.20，猫腰
    { x0: 88, x1: 100, y: -3.30 },
    // 东段干线
    { x0: 110, x1: 130, y: -6.22 },
    { x0: 130, x1: 138, y: -6.90 },
    { x0: 138, x1: 148, y: -6.22 },
    // 摸黑段：干线畅通，净空足，压力全来自头顶的人
    { x0: 148, x1: 178, y: -6.22 },
  ],

  shafts: [
    { id: "a3_sh_grain_a", x: 30, yTop: -4.2, yBottom: -8.0, kind: "ladder", requiresHatch: null },
    { id: "a3_sh_grain_b", x: 38, yTop: -4.2, yBottom: -8.0, kind: "dirt", requiresHatch: null },
    { id: "a3_sh_mill", x: 63, yTop: 0, yBottom: -8.0, kind: "ladder", requiresHatch: "a3_h_mill" },
    { id: "a3_sh_m1", x: 90, yTop: 0.4, yBottom: -4.5, kind: "ladder", requiresHatch: "a3_h_street1" },
    { id: "a3_sh_m2", x: 99, yTop: 0.4, yBottom: -4.5, kind: "ladder", requiresHatch: "a3_h_street2" },
    { id: "a3_sh_kang", x: 116, yTop: 0, yBottom: -8.0, kind: "ladder", requiresHatch: "a3_h_kang" },
    { id: "a3_sh_wind", x: 175, yTop: 0, yBottom: -8.0, kind: "dirt", requiresHatch: null },
  ],

  hatches: [
    { id: "a3_h_mill", x: 63, shaftId: "a3_sh_mill", hidden: true, opened: false, revealBy: "a3_t_choke", label: "碾盘下的地道口", propId: "a3_pr_mill_hatch" },
    { id: "a3_h_street1", x: 90, shaftId: "a3_sh_m1", hidden: true, opened: false, revealBy: "a3_t_street", label: "驴槽底下的口", propId: "a3_pr_trough_hatch" },
    { id: "a3_h_street2", x: 99, shaftId: "a3_sh_m2", hidden: true, opened: false, revealBy: "a3_t_dip", label: "水缸底下的翻口", propId: "a3_pr_dip_out" },
    { id: "a3_h_kang", x: 116, shaftId: "a3_sh_kang", hidden: true, opened: false, revealBy: "a3_t_flood", label: "炕下的地道口", propId: "a3_pr_kang3" },
  ],

  props: [
    // —— 开场：亮着的马灯就在脚边，这是"看得见的目标" ——
    { id: "a3_pr_lantern", x: 6, y: -8.0, z: PLAY, kind: "lantern", facing: 1, interact: "pickup", data: { item: "lantern" }, label: "马灯" },
    { id: "a3_pr_beam1", x: 9, y: -8.0, z: PLAY, kind: "prop_beam", facing: 1, interact: "none", data: null, label: null },
    { id: "a3_pr_vent1", x: 14, y: -6.22, z: PLAY, kind: "vent", facing: 1, interact: "none", data: null, label: null },
    { id: "a3_pr_crock1", x: 17, y: -8.0, z: PLAY, kind: "crock", facing: 1, interact: "none", data: null, label: null },
    { id: "a3_pr_sign1", x: 21, y: -8.0, z: PLAY, kind: "sign", facing: 1, interact: "read", data: { codexId: "codex_shuidao" }, label: "墙上画的水道图" },
    { id: "a3_pr_beam2", x: 27, y: -8.0, z: PLAY, kind: "prop_beam", facing: 1, interact: "none", data: null, label: null },
    { id: "a3_pr_beam3", x: 42, y: -8.0, z: PLAY, kind: "prop_beam", facing: 1, interact: "none", data: null, label: null },

    // —— 粮窖支线：木塞在这儿 ——
    { id: "a3_pr_crock2", x: 27, y: -4.2, z: PLAY, kind: "crock", facing: 1, interact: "none", data: null, label: null },
    { id: "a3_pr_vent_g", x: 31, y: -3.00, z: PLAY, kind: "vent", facing: 1, interact: "none", data: null, label: null },
    { id: "a3_pr_crock3", x: 32, y: -4.2, z: PLAY, kind: "crock", facing: 1, interact: "none", data: null, label: null },
    // 木塞：一截锯短的支撑木。捡起来会放下马灯——这是有意的取舍。
    { id: "a3_pr_plug", x: 35, y: -4.2, z: PLAY, kind: "prop_beam", facing: 1, interact: "pickup", data: { item: "plug" }, label: "木塞" },
    { id: "a3_pr_kang_g", x: 38.5, y: -4.2, z: PLAY, kind: "kang", facing: 1, interact: "hide", data: { capacity: 1 }, label: "被褥堆" },

    // —— 卡口 + 塌方 + 碾盘下的口 ——
    { id: "a3_pr_beam4", x: 47, y: -8.0, z: PLAY, kind: "prop_beam", facing: 1, interact: "none", data: null, label: null },
    { id: "a3_pr_choke", x: 52, y: -8.0, z: PLAY, kind: "chokepoint", facing: 1, interact: "lever", data: { channel: "gasSeal", needItem: "plug" }, label: "卡口闸" },
    { id: "a3_pr_crock4", x: 57, y: -8.0, z: PLAY, kind: "crock", facing: 1, interact: "none", data: null, label: null },
    { id: "a3_pr_loophole_a3", x: 60, y: -8.0, z: PLAY, kind: "loophole", facing: 1, interact: "none", data: null, label: null },
    { id: "a3_pr_mill_hatch", x: 63, y: -8.0, z: PLAY, kind: "trapdoor", facing: 1, interact: "hatch", data: { hatchId: "a3_h_mill" }, label: "碾盘下的地道口" },
    { id: "a3_pr_collapse", x: 68, y: -8.0, z: PLAY, kind: "prop_beam", facing: 1, interact: "none", data: null, label: "塌方" },

    // —— 地表 su1：碾盘院。天快亮了 ——
    { id: "a3_pr_millstone_top", x: 63, y: 0, z: PLAY, kind: "millstone", facing: 1, interact: "none", data: null, label: null },
    { id: "a3_pr_corpse_s1", x: 67, y: 0, z: PLAY, kind: "corpse", facing: 1, interact: "none", data: null, label: null },
    { id: "a3_pr_wall_s1", x: 70, y: 0, z: PLAY, kind: "wall", facing: 1, interact: "none", data: null, label: null },
    { id: "a3_pr_cart_s1", x: 72, y: 0, z: FORE, kind: "cart", facing: 1, interact: "none", data: null, label: null },
    { id: "a3_pr_haystack_s1", x: 74, y: 0, z: PLAY, kind: "haystack", facing: 1, interact: "hide", data: { capacity: 1 }, label: "柴垛" },
    { id: "a3_pr_house_s1", x: 78, y: 0, z: MID, kind: "house", facing: 1, interact: "none", data: null, label: null },
    { id: "a3_pr_vat_s1", x: 82, y: 0, z: PLAY, kind: "vat", facing: 1, interact: "hide", data: { capacity: 1 }, label: "水缸" },
    { id: "a3_pr_gate_s1", x: 86.5, y: 0, z: PLAY, kind: "gate", facing: 1, interact: "lever", data: { channel: "gateOpen", needItem: null }, label: "院门" },

    // —— 地表 su2：街道，两个哨兵 + 一条狗。驴槽底下有口 ——
    { id: "a3_pr_trough_hatch", x: 90, y: 0.4, z: PLAY, kind: "trough", facing: 1, interact: "hatch", data: { hatchId: "a3_h_street1" }, label: "驴槽底下的口" },
    { id: "a3_pr_trough_s2", x: 93, y: 0.4, z: PLAY, kind: "trough", facing: 1, interact: "none", data: null, label: null },
    { id: "a3_pr_house_s2", x: 95, y: 0.4, z: MID, kind: "house", facing: -1, interact: "none", data: null, label: null },
    { id: "a3_pr_haystack_s2", x: 97, y: 0.4, z: PLAY, kind: "haystack", facing: 1, interact: "hide", data: { capacity: 1 }, label: "柴垛" },
    { id: "a3_pr_vat_s2", x: 99, y: 0.4, z: PLAY, kind: "vat", facing: 1, interact: "none", data: null, label: null },
    { id: "a3_pr_fence_s2", x: 103, y: 0.4, z: FORE, kind: "fence", facing: 1, interact: "none", data: null, label: null },

    // —— 街道底下的短地道 ——
    { id: "a3_pr_beam_m1", x: 92, y: -4.5, z: PLAY, kind: "prop_beam", facing: 1, interact: "none", data: null, label: null },
    { id: "a3_pr_vent_m1", x: 94, y: -3.30, z: PLAY, kind: "vent", facing: 1, interact: "none", data: null, label: null },
    { id: "a3_pr_crock_m", x: 96, y: -4.5, z: PLAY, kind: "crock", facing: 1, interact: "none", data: null, label: null },
    { id: "a3_pr_dip_out", x: 99, y: -4.5, z: PLAY, kind: "trapdoor", facing: 1, interact: "hatch", data: { hatchId: "a3_h_street2" }, label: "水缸底下的翻口" },

    // —— 地表 su3：水井 + 炕屋 ——
    { id: "a3_pr_sign3", x: 107, y: 0, z: PLAY, kind: "sign", facing: 1, interact: "read", data: { codexId: "codex_qiangyan" }, label: "墙根的枪眼" },
    { id: "a3_pr_waterpipe_s3", x: 109.5, y: 0, z: PLAY, kind: "waterpipe", facing: 1, interact: "none", data: null, label: null },
    { id: "a3_pr_haystack_s3", x: 108.5, y: 0, z: PLAY, kind: "haystack", facing: 1, interact: "hide", data: { capacity: 1 }, label: "柴垛" },
    { id: "a3_pr_well3", x: 112, y: 0, z: PLAY, kind: "well", facing: 1, interact: "lever", data: { channel: "waterDivert", needItem: null }, label: "水井辘轳" },
    { id: "a3_pr_kang3", x: 116, y: 0, z: PLAY, kind: "kang", facing: 1, interact: "hatch", data: { hatchId: "a3_h_kang" }, label: "炕下的地道口" },
    { id: "a3_pr_vat_s3", x: 114, y: 0, z: PLAY, kind: "vat", facing: 1, interact: "hide", data: { capacity: 1 }, label: "水缸" },
    { id: "a3_pr_house_s3", x: 118, y: 0, z: MID, kind: "house", facing: -1, interact: "none", data: null, label: null },
    { id: "a3_pr_loophole_s3", x: 121, y: 0, z: PLAY, kind: "loophole", facing: 1, interact: "none", data: null, label: null },
    { id: "a3_pr_lamp_s3", x: 123, y: 0, z: BACK, kind: "lamp", facing: 1, interact: "none", data: null, label: null },

    // —— 地下 d3：汇合段 ——
    { id: "a3_pr_beam5", x: 120, y: -8.0, z: PLAY, kind: "prop_beam", facing: 1, interact: "none", data: null, label: null },
    { id: "a3_pr_crock5", x: 124, y: -8.0, z: PLAY, kind: "crock", facing: 1, interact: "none", data: null, label: null },
    { id: "a3_pr_kang4", x: 128, y: -8.0, z: PLAY, kind: "kang", facing: 1, interact: "hide", data: { capacity: 1 }, label: "被褥堆" },
    { id: "a3_pr_lantern_spare", x: 131, y: -8.0, z: PLAY, kind: "lantern", facing: 1, interact: "pickup", data: { item: "lantern" }, label: "马灯" },
    { id: "a3_pr_vent2", x: 134, y: -6.22, z: PLAY, kind: "vent", facing: 1, interact: "none", data: null, label: null },
    { id: "a3_pr_beam6", x: 140, y: -8.0, z: PLAY, kind: "prop_beam", facing: 1, interact: "none", data: null, label: null },

    // —— 地下 d4：摸黑段。四个通气孔就是这一段唯一的光源和唯一的路标 ——
    { id: "a3_pr_trough_d4", x: 150, y: -8.0, z: PLAY, kind: "trough", facing: 1, interact: "none", data: null, label: null },
    { id: "a3_pr_vent3", x: 152, y: -6.22, z: PLAY, kind: "vent", facing: 1, interact: "none", data: null, label: null },
    { id: "a3_pr_beam7", x: 155, y: -8.0, z: PLAY, kind: "prop_beam", facing: 1, interact: "none", data: null, label: null },
    { id: "a3_pr_vent4", x: 157, y: -6.22, z: PLAY, kind: "vent", facing: 1, interact: "none", data: null, label: null },
    { id: "a3_pr_vent5", x: 162, y: -6.22, z: PLAY, kind: "vent", facing: 1, interact: "none", data: null, label: null },
    { id: "a3_pr_beam8", x: 165, y: -8.0, z: PLAY, kind: "prop_beam", facing: 1, interact: "none", data: null, label: null },
    { id: "a3_pr_vent6", x: 167, y: -6.22, z: PLAY, kind: "vent", facing: 1, interact: "none", data: null, label: null },
    { id: "a3_pr_crock6", x: 170, y: -8.0, z: PLAY, kind: "crock", facing: 1, interact: "none", data: null, label: null },
    { id: "a3_pr_wind", x: 174, y: -8.0, z: PLAY, kind: "sign", facing: 1, interact: "none", data: null, label: "黑风口" },

    // —— 构图件 ——
    { id: "a3_pr_house_t3", x: 156, y: 0, z: MID, kind: "house", facing: 1, interact: "none", data: null, label: null },
    { id: "a3_pr_wall_t3", x: 164, y: 0, z: PLAY, kind: "wall", facing: 1, interact: "none", data: null, label: null },
    { id: "a3_pr_treeOut3", x: 177, y: 0, z: BACK, kind: "tree", facing: 1, interact: "none", data: null, label: null },
    { id: "a3_pr_lampOut3", x: 174, y: 0, z: BACK, kind: "lamp", facing: 1, interact: "none", data: null, label: null },
  ],

  enemies: [
    // 碾盘院：一个哨兵站桩
    {
      id: "a3_e_g1", x: 76, y: 0, kind: "guard", facing: -1,
      patrol: { x0: 75, x1: 78, speed: 1.1, pauseSec: 2.0 },
      vision: { range: 12, halfAngleDeg: 30, height: 1.6 },
      hearing: 5.8, probeAt: null,
    },
    // 街道：两个哨兵交叉 + 一条军犬。正经走过去几乎必被发现，
    // 正解是从 x=90 的驴槽下去、x=99 的水缸上来。
    {
      id: "a3_e_g2", x: 91, y: 0.4, kind: "guard", facing: 1,
      patrol: { x0: 89, x1: 94, speed: 1.15, pauseSec: 2.4 },
      vision: { range: 13, halfAngleDeg: 28, height: 1.6 },
      hearing: 6.0, probeAt: null,
    },
    {
      id: "a3_e_g3", x: 103, y: 0.4, kind: "guard", facing: -1,
      patrol: { x0: 101, x1: 105, speed: 1.2, pauseSec: 2.2 },
      vision: { range: 13, halfAngleDeg: 28, height: 1.6 },
      hearing: 6.0, probeAt: null,
    },
    {
      id: "a3_e_dog3", x: 97, y: 0.4, kind: "dog", facing: 1,
      patrol: { x0: 89, x1: 105, speed: 2.1, pauseSec: 0.5 },
      vision: { range: 9, halfAngleDeg: 46, height: 0.7 },
      hearing: 11.0, probeAt: null,
    },
    // 水井那条街：一个来回搜的兵。水井 x=112 和炕洞 x=116 都在他的巡逻里。
    {
      id: "a3_e_s4", x: 114, y: 0, kind: "search", facing: 1,
      patrol: { x0: 110, x1: 120, speed: 1.5, pauseSec: 1.0 },
      vision: { range: 12, halfAngleDeg: 34, height: 1.6 },
      hearing: 6.5, probeAt: null,
    },
    // —— 以下两个由 a3_t_dark 的 emit.spawn 唤出。他们在 x=148–168 的街面上，
    //     正对着 d4 的四个通气孔。玩家手里的马灯会从通气孔漏上去 ——
    //     这一段的解法是把马灯放下、摸黑走。
    {
      id: "a3_e_yamada", x: 158, y: 0, kind: "officer", facing: 1,
      patrol: { x0: 149, x1: 166, speed: 1.35, pauseSec: 1.8 },
      vision: { range: 15, halfAngleDeg: 36, height: 1.65 },
      hearing: 7.5, probeAt: null,
    },
    {
      id: "a3_e_s5", x: 165, y: 0, kind: "search", facing: -1,
      patrol: { x0: 155, x1: 167, speed: 1.4, pauseSec: 1.2 },
      vision: { range: 12, halfAngleDeg: 32, height: 1.6 },
      hearing: 6.5, probeAt: null,
    },
  ],

  npcs: [
    // 开场就在身边的三位，跟着往前跑
    { id: "a3_n_v1", x: 9, y: -8.0, name: "秀兰", role: "villager", follow: false, rescued: false },
    { id: "a3_n_child", x: 12, y: -8.0, name: "小豆子", role: "child", follow: false, rescued: false },
    { id: "a3_n_elder", x: 15, y: -8.0, name: "王大爷", role: "elder", follow: false, rescued: false },
    // 塌方那头等着的三位，从炕洞下来才碰得上
    { id: "a3_n_v2", x: 118, y: -8.0, name: "老栓", role: "villager", follow: false, rescued: false },
    { id: "a3_n_v3", x: 122, y: -8.0, name: "二嫂", role: "villager", follow: false, rescued: false },
    { id: "a3_n_militia", x: 126, y: -8.0, name: "林霞", role: "militia", follow: false, rescued: false },
  ],

  hazards: [
    // 毒烟：开场就从西头灌进来，往东追。封住 x=52 的卡口才停。
    { id: "a3_hz_gas", kind: "gas", x0: 0, x1: 52, y: -8.0, armAt: "a3_t_open", speed: 2.2, sealedBy: "gasSeal" },
    // 引水反灌：拉了辘轳之后，水从水道倒回敌人灌烟的那个洞口。
    // 只淹 x 44–62，碾盘竖井底 x=63 之外，不会堵玩家的回头路。
    { id: "a3_hz_water", kind: "water", x0: 44, x1: 62, y: -8.0, armAt: "a3_t_flood", speed: 1.9, sealedBy: null },
    // 塌方：干线在这儿断了（d2 到 x=70 为止，d3 从 x=110 才开始）。
    // 引水之后被冲开——那是给乡亲走的，玩家自己已经从地表绕过去了。
    { id: "a3_hz_collapse", kind: "collapse", x0: 66, x1: 70, y: -8.0, armAt: null, speed: 0, sealedBy: "waterDivert" },
  ],

  triggers: [
    { id: "a3_t_open", x0: 0, x1: 6, yMin: -9.5, yMax: -6.0, once: true,
      emit: { panels: ["a3_open", "a3_p1"], reveal: [], arm: ["a3_hz_gas"], spawn: [], objective: "烟从后头灌进来了 —— 往前跑", checkpoint: false, win: false } },
    { id: "a3_t_grain", x0: 22, x1: 26, yMin: -9.5, yMax: -6.0, once: true,
      emit: { panels: ["a3_p2"], reveal: [], arm: [], spawn: [], objective: "上粮窖，找块木塞", checkpoint: true, win: false } },
    { id: "a3_t_plug", x0: 33, x1: 37, yMin: -5.6, yMax: -3.0, once: true,
      emit: { panels: ["a3_p3"], reveal: [], arm: [], spawn: [], objective: "拿上木塞", checkpoint: true, win: false } },
    { id: "a3_t_choke", x0: 49, x1: 54, yMin: -9.5, yMax: -6.0, once: true,
      emit: { panels: ["a3_p4"], reveal: ["a3_h_mill"], arm: [], spawn: [], objective: "拿木塞封死卡口", checkpoint: true, win: false } },
    { id: "a3_t_blocked", x0: 64.5, x1: 68, yMin: -9.5, yMax: -6.0, once: true,
      emit: { panels: ["a3_p5"], reveal: [], arm: [], spawn: [], objective: "干线塌了 —— 从碾盘下头上去", checkpoint: false, win: false } },
    { id: "a3_t_surface", x0: 61, x1: 66, yMin: -1.0, yMax: 3.0, once: true,
      emit: { panels: ["a3_p6"], reveal: [], arm: [], spawn: [], objective: "天快亮了 —— 摸到街那头的水井", checkpoint: true, win: false } },
    { id: "a3_t_street", x0: 86, x1: 90.5, yMin: -1.0, yMax: 3.4, once: true,
      emit: { panels: ["a3_p7"], reveal: ["a3_h_street1"], arm: [], spawn: [], objective: "街上有岗 —— 驴槽底下有口", checkpoint: true, win: false } },
    { id: "a3_t_dip", x0: 91, x1: 96, yMin: -6.0, yMax: -3.2, once: true,
      emit: { panels: ["a3_p8"], reveal: ["a3_h_street2"], arm: [], spawn: [], objective: "从水缸底下钻出去", checkpoint: true, win: false } },
    { id: "a3_t_water", x0: 108, x1: 112.5, yMin: -1.0, yMax: 3.0, once: true,
      emit: { panels: ["a3_p9"], reveal: [], arm: [], spawn: [], objective: "扳辘轳，把水引进他们灌烟的那个洞", checkpoint: true, win: false } },
    { id: "a3_t_flood", x0: 113.5, x1: 117, yMin: -1.0, yMax: 3.0, once: true,
      emit: { panels: ["a3_p10"], reveal: ["a3_h_kang"], arm: ["a3_hz_water"], spawn: [], objective: "下炕洞，跟乡亲汇合", checkpoint: true, win: false } },
    { id: "a3_t_meet", x0: 117, x1: 122, yMin: -9.5, yMax: -6.0, once: true,
      emit: { panels: ["a3_p11"], reveal: [], arm: [], spawn: [], objective: "人齐了 —— 往黑风口走", checkpoint: true, win: false } },
    { id: "a3_t_dark", x0: 145, x1: 150, yMin: -9.5, yMax: -6.0, once: true,
      emit: { panels: ["a3_p12"], reveal: [], arm: [], spawn: ["a3_e_yamada", "a3_e_s5"], objective: "把马灯放下 —— 摸黑走，认通气孔漏下来的光", checkpoint: true, win: false } },
    { id: "a3_t_end", x0: 172, x1: 178, yMin: -9.5, yMax: -6.0, once: true,
      emit: { panels: ["a3_close"], reveal: [], arm: [], spawn: [], objective: "", checkpoint: false, win: true } },
  ],

  checkpoints: [
    { id: "a3_cp1", x: 24, y: -8.0, label: "粮窖口" },
    { id: "a3_cp2", x: 35, y: -4.2, label: "粮窖" },
    { id: "a3_cp3", x: 51, y: -8.0, label: "卡口" },
    { id: "a3_cp4", x: 63, y: 0, label: "碾盘院" },
    { id: "a3_cp5", x: 89, y: 0.4, label: "街口" },
    { id: "a3_cp6", x: 112, y: 0, label: "水井" },
    { id: "a3_cp7", x: 118, y: -8.0, label: "汇合点" },
    { id: "a3_cp8", x: 148, y: -8.0, label: "摸黑段前" },
  ],

  objectives: [
    { id: "a3_o1", text: "找块木塞", doneWhen: { propUsed: "a3_pr_plug" } },
    { id: "a3_o2", text: "封住卡口，把烟挡回去", doneWhen: { propUsed: "a3_pr_choke" } },
    { id: "a3_o3", text: "上地表，摸到水井", doneWhen: { trigger: "a3_t_water" } },
    { id: "a3_o4", text: "引水冲开塌方", doneWhen: { propUsed: "a3_pr_well3" } },
    { id: "a3_o5", text: "跟乡亲汇合，一个都不能少", doneWhen: { npcRescued: "all" } },
    { id: "a3_o6", text: "带全村爬出黑风口", doneWhen: { atExit: true } },
  ],
};

export const LEVELS = [act1, act2, act3];

/** 返回深拷贝，运行时可安全改写。 */
export function GetLevel(index) {
  const level = LEVELS[index];
  if (!level) return null;
  return DeepCopy(level);
}

function DeepCopy(value) {
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) {
    const out = new Array(value.length);
    for (let i = 0; i < value.length; i++) out[i] = DeepCopy(value[i]);
    return out;
  }
  const out = {};
  for (const key in value) {
    if (Object.prototype.hasOwnProperty.call(value, key)) out[key] = DeepCopy(value[key]);
  }
  return out;
}
