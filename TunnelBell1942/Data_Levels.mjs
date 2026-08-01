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
// 结局不是玩家失误，也不是秒杀：
//   敲钟（a1_pr_bell.data.spawn）当场唤出三个人，把 x90–125 连成一条不断线的封锁：
//     a1_e_chase2  90–106   从西边压过来，断掉往村里退的路
//     a1_e_chase1  103–116  贴着老槐树扫，逼他往东
//     a1_e_blocker 117–125  山田站死碾盘那个口（出口 125 在他巡逻区间正中）
//   钟在 x112.5。三个人的视距都是 11，钟响那一刻谁也看不见他（山田从 125 只看到 114）。
//   猫腰后山田的有效视距约 6.72 米 —— 玩家最多摸到 x≈118 就再也过不去，
//   离那个口还差 7 米，而猫腰 1.75 m/s 追不过巡逻 1.6 m/s 的正面。
//   钟响的同时村西门也进来一路（a1_e_chase3, 2–32），所以往回跑不是活路。
//   老槐树（x104）往东一个藏身点都没有——有意清空的：
//   这一段的"喘息"只能靠退出视线让警觉衰减，而不是钻进柴垛无限等，
//   所以玩家可以反复试探、反复被顶回来，十几秒后西边合拢，谁也躲不掉。
//   敲钟后不再放检查点——这一段没有"重来"。
// ===========================================================================
const act1 = {
  id: "act1",
  chapterId: "act1",
  title: "钟声",
  actor: "laozhong",
  // 本幕的结局是"被抓"，不是"到达出口"。exit 只是他想去、也确实没去成的那个口，
  // 玩法层看见 endKind:"captured" 就不要再把 atExit 当通关条件——
  // 钟已敲响 + 玩家被抓 → 发 { kind:"won" } 并播 a1_close。
  endKind: "captured",
  bounds: { x0: 3, x1: 128, yTop: 8, yBottom: -6 },
  startX: 4,
  startY: 0,
  exit: { x: 125, y: 0, radius: 2.2, needAllVillagers: false, label: "碾盘下的地道口" },
  timeOfDay: "night",

  floors: [
    { id: "a1_f_road", x0: 3, x1: 24, y: 0, kind: "dirt" },
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
    { x0: 84, x1: 96, y: 1.30 },
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
    { id: "a1_pr_vat0", x: 79, y: 0, z: PLAY, kind: "vat", facing: 1, interact: "hide", data: { capacity: 1 }, label: "水缸" },
    { id: "a1_pr_haystack1c", x: 33, y: 0, z: PLAY, kind: "haystack", facing: 1, interact: "hide", data: { capacity: 1 }, label: "柴垛" },
    { id: "a1_pr_trough_h1", x: 38, y: 0, z: PLAY, kind: "trough", facing: 1, interact: "hide", data: { capacity: 1 }, label: "驴槽" },
    { id: "a1_pr_cart0", x: 42.5, y: 0, z: PLAY, kind: "cart", facing: 1, interact: "hide", data: { capacity: 1 }, label: "马车" },
    { id: "a1_pr_vat_y1", x: 46, y: 0, z: PLAY, kind: "vat", facing: 1, interact: "hide", data: { capacity: 1 }, label: "水缸" },
    { id: "a1_pr_haystack1b", x: 48, y: 0, z: PLAY, kind: "haystack", facing: 1, interact: "hide", data: { capacity: 1 }, label: "柴垛" },
    { id: "a1_pr_wall1", x: 37, y: 0, z: PLAY, kind: "wall", facing: 1, interact: "none", data: null, label: null },
    { id: "a1_pr_house2", x: 44, y: 0, z: MID, kind: "house", facing: -1, interact: "none", data: null, label: null },
    { id: "a1_pr_treeFore1", x: 46, y: 0, z: FORE, kind: "tree", facing: 1, interact: "none", data: null, label: null },

    // —— 二道院：院门 + 柴垛 + 交叉视线 ——
    { id: "a1_pr_gate1", x: 50.6, y: 0.35, z: PLAY, kind: "gate", facing: 1, interact: "lever", data: { channel: "gateOpen", needItem: null }, label: "院门" },
    { id: "a1_pr_haystack_g1", x: 53.5, y: 0.35, z: PLAY, kind: "haystack", facing: 1, interact: "hide", data: { capacity: 1 }, label: "柴垛" },
    { id: "a1_pr_vat1", x: 59, y: 0.35, z: PLAY, kind: "vat", facing: 1, interact: "hide", data: { capacity: 1 }, label: "水缸" },
    { id: "a1_pr_house3", x: 60, y: 0.35, z: MID, kind: "house", facing: 1, interact: "none", data: null, label: null },
    { id: "a1_pr_haystack2", x: 62, y: 0.35, z: PLAY, kind: "haystack", facing: 1, interact: "hide", data: { capacity: 1 }, label: "柴垛" },
    { id: "a1_pr_cart1", x: 67, y: 0.35, z: FORE, kind: "cart", facing: 1, interact: "none", data: null, label: null },
    // 铺垫：全作第一次"传口令"。他敲的是窗根的暗号，不是喊。
    { id: "a1_pr_sig_yard", x: 69.2, y: 0.35, z: PLAY, kind: "gate", facing: 1, interact: "signal",
      data: { squadId: "squad_village", panels: ["a1_call1", "a1_call2", "a1_call3", "a1_call4"] }, label: "窗根 —— 敲暗号" },
    { id: "a1_pr_wall2", x: 71, y: 0.35, z: PLAY, kind: "wall", facing: 1, interact: "none", data: null, label: null },
    { id: "a1_pr_haystack2b", x: 68, y: 0.35, z: PLAY, kind: "haystack", facing: 1, interact: "hide", data: { capacity: 1 }, label: "柴垛" },
    { id: "a1_pr_vat_y2", x: 67, y: 0.35, z: PLAY, kind: "vat", facing: 1, interact: "hide", data: { capacity: 1 }, label: "水缸" },
    { id: "a1_pr_cart_g1", x: 73.5, y: 0.35, z: PLAY, kind: "cart", facing: 1, interact: "hide", data: { capacity: 1 }, label: "马车" },
    { id: "a1_pr_haystack_y2", x: 78, y: 0.35, z: PLAY, kind: "haystack", facing: 1, interact: "hide", data: { capacity: 1 }, label: "柴垛" },
    { id: "a1_pr_trough_y2", x: 75.5, y: 0.35, z: PLAY, kind: "trough", facing: 1, interact: "hide", data: { capacity: 1 }, label: "驴槽" },
    { id: "a1_pr_fence1", x: 76.5, y: 0.35, z: PLAY, kind: "fence", facing: 1, interact: "none", data: null, label: null },

    // —— 三道院：兵 + 军犬，长矮墙 ——
    { id: "a1_pr_trough2", x: 81, y: 0, z: PLAY, kind: "trough", facing: 1, interact: "hide", data: { capacity: 1 }, label: "驴槽" },
    { id: "a1_pr_haystack_y3a", x: 84, y: 0, z: PLAY, kind: "haystack", facing: 1, interact: "hide", data: { capacity: 1 }, label: "柴垛" },
    { id: "a1_pr_stove1", x: 87, y: 0, z: PLAY, kind: "stove", facing: 1, interact: "none", data: null, label: null },
    { id: "a1_pr_vat_y3", x: 87.5, y: 0, z: PLAY, kind: "vat", facing: 1, interact: "hide", data: { capacity: 1 }, label: "水缸" },
    { id: "a1_pr_millstone_y3", x: 90, y: 0, z: PLAY, kind: "millstone", facing: 1, interact: "hide", data: { capacity: 1 }, label: "碾盘" },
    { id: "a1_pr_cart_y3", x: 92.5, y: 0, z: PLAY, kind: "cart", facing: 1, interact: "hide", data: { capacity: 1 }, label: "马车" },
    { id: "a1_pr_house4", x: 90, y: 0, z: MID, kind: "house", facing: -1, interact: "none", data: null, label: null },
    { id: "a1_pr_wall3", x: 92, y: 0, z: PLAY, kind: "wall", facing: 1, interact: "none", data: null, label: null },
    { id: "a1_pr_trough_y3", x: 99, y: 0, z: PLAY, kind: "trough", facing: 1, interact: "hide", data: { capacity: 1 }, label: "驴槽" },
    { id: "a1_pr_haystack3", x: 97, y: 0, z: PLAY, kind: "haystack", facing: 1, interact: "hide", data: { capacity: 1 }, label: "柴垛" },
    { id: "a1_pr_haystack3b", x: 94.5, y: 0, z: PLAY, kind: "haystack", facing: 1, interact: "hide", data: { capacity: 1 }, label: "柴垛" },
    { id: "a1_pr_cart_y3b", x: 101.3, y: 0, z: PLAY, kind: "cart", facing: 1, interact: "hide", data: { capacity: 1 }, label: "马车" },
    { id: "a1_pr_vat3", x: 103.5, y: 0, z: PLAY, kind: "vat", facing: 1, interact: "hide", data: { capacity: 1 }, label: "水缸" },
    { id: "a1_pr_fence2", x: 103, y: 0, z: FORE, kind: "fence", facing: 1, interact: "none", data: null, label: null },

    // —— 老槐树：钟 ——
    { id: "a1_pr_sign2", x: 107, y: 0, z: PLAY, kind: "sign", facing: 1, interact: "read", data: { codexId: "codex_tonghuo" }, label: "祠堂告示" },
    { id: "a1_pr_tree", x: 112, y: 0, z: PLAY, kind: "tree", facing: 1, interact: "none", data: null, label: null },
    // 钟挂在树上，互动点是树下垂到地面的绳，所以 y = 0。
    { id: "a1_pr_bell", x: 112.5, y: 0, z: PLAY, kind: "bell", facing: 1, interact: "bell",
      data: { rings: 3, cutscene: "a1_cs_bell", panels: ["a1_p11"],
              spawn: ["a1_e_chase1", "a1_e_chase2", "a1_e_chase3", "a1_e_tang", "a1_e_blocker"], objective: "往回跑" },
      label: "老槐树上的钟" },

    // —— 追逐段终点：碾盘下的地道口（他没能进去）——
    { id: "a1_pr_trough_h2", x: 116, y: 0, z: PLAY, kind: "trough", facing: 1, interact: "hide", data: { capacity: 1 }, label: "驴槽" },
    { id: "a1_pr_millstone", x: 125, y: 0, z: PLAY, kind: "millstone", facing: 1, interact: "hatch", data: { hatchId: "a1_h_exit" }, label: "碾盘下的地道口" },
  ],

  enemies: [
    // 一道院：背对着来回巡逻，矮墙是他的盲区。patrol 不覆盖出生点 x=4。
    {
      id: "a1_e_search1", x: 43, y: 0, kind: "search", facing: -1,
      patrol: { x0: 38, x1: 45, speed: 1.2, pauseSec: 1.8 },
      vision: { range: 9, halfAngleDeg: 34, height: 1.6 },
      hearing: 6.0, probeAt: null,
    },
    // 二道院：两个兵交叉视线。
    {
      id: "a1_e_search2", x: 58, y: 0.35, kind: "search", facing: 1,
      patrol: { x0: 54, x1: 66, speed: 1.35, pauseSec: 1.0 },
      vision: { range: 11, halfAngleDeg: 32, height: 1.6 },
      hearing: 6.0, probeAt: null,
    },
    {
      id: "a1_e_guard1", x: 74, y: 0.35, kind: "guard", facing: -1,
      patrol: { x0: 71, x1: 77, speed: 1.2, pauseSec: 1.2 },
      vision: { range: 11, halfAngleDeg: 28, height: 1.6 },
      hearing: 5.5, probeAt: null,
    },
    // 三道院（军犬段）——这几个数字是量出来的，别随手改：
    //   矮墙净空 1.30 只盖到 x=96。墙根这一截强制猫腰（1.75 m/s），
    //     搜索兵 1.45 m/s 追不上，所以贴着墙一垛一垛挪就能过去。
    //   军犬搜索时跑 2.9 m/s，猫腰的人绝对跑不掉，所以它的巡逻线 [98,103]
    //     放在矮墙外头：出了墙玩家能自己选——站起来冲（快但有声），还是继续猫腰（慢但安静）。
    //     "军犬教的是自己选安静"，不是"被按在地上跑不动"。
    //   两条巡逻线之间留了 7 米无人区（91→98），窗口不用对齐；
    //     掩体 92.5 / 94.5 是这段的落脚点，99 / 101.3 / 103.5 连着盖住军犬整条线。
    {
      id: "a1_e_search3", x: 88, y: 0, kind: "search", facing: 1,
      patrol: { x0: 86, x1: 91, speed: 1.45, pauseSec: 0.9 },
      vision: { range: 11, halfAngleDeg: 34, height: 1.6 },
      hearing: 6.5, probeAt: null,
    },
    {
      id: "a1_e_dog1", x: 100, y: 0, kind: "dog", facing: -1,
      patrol: { x0: 98, x1: 103, speed: 1.8, pauseSec: 0.6 },
      vision: { range: 8, halfAngleDeg: 44, height: 0.7 },
      hearing: 9.5, probeAt: null,
    },
    // —— 以下三个由 a1_pr_bell.data.spawn 唤出（敲钟那一下才有），之前应视为不存在 ——
    // 钟响之前它们不存在，所以玩家不可能"先引出追兵再回头敲钟"。
    {
      id: "a1_e_chase1", x: 85, y: 0, kind: "search", facing: 1,
      patrol: { x0: 85, x1: 116, speed: 1.8, pauseSec: 0.3 },
      vision: { range: 11, halfAngleDeg: 36, height: 1.6 },
      hearing: 7.5, probeAt: null,
    },
    {
      id: "a1_e_chase2", x: 78, y: 0, kind: "search", facing: 1,
      patrol: { x0: 78, x1: 108, speed: 1.7, pauseSec: 0.3 },
      vision: { range: 11, halfAngleDeg: 36, height: 1.6 },
      hearing: 7.0, probeAt: null,
    },
    // 从村西门推进来的那一路。西端 7（不能再往西，会压到出生点 x=4），东到 32；
    // 和 search1(38–45, 视距 9 → 看到 29) 的视野接上，
    // 往西 0–54 这一整段就没有死角了：往回跑不是活路，只是换个人抓。
    {
      id: "a1_e_chase3", x: 7, y: 0, kind: "search", facing: 1,
      patrol: { x0: 7, x1: 32, speed: 1.5, pauseSec: 1.8 },
      vision: { range: 13, halfAngleDeg: 36, height: 1.6 },
      hearing: 7.0, probeAt: null,
    },
    // 汤丙会：开场过场里带路进村的本村人。正片里跟山田一起，钟响之后才现身。
    {
      id: "a1_e_tang", x: 121, y: 0, kind: "puppet", facing: -1,
      patrol: { x0: 119, x1: 123, speed: 1.3, pauseSec: 1.2 },
      vision: { range: 10, halfAngleDeg: 32, height: 1.6 },
      hearing: 6.0, probeAt: null,
    },
    // 山田：出口 x125 就在他巡逻区间里。玩家做对一切也过不去——这是叙事必然。
    {
      id: "a1_e_blocker", x: 125, y: 0, kind: "officer", facing: 1,
      patrol: { x0: 117, x1: 125, speed: 1.6, pauseSec: 0.9 },
      vision: { range: 11, halfAngleDeg: 40, height: 1.65 },
      hearing: 7.5, probeAt: null,
    },
  ],

  npcs: [],
  hazards: [],

  triggers: [
    { id: "a1_t_open", x0: 0, x1: 7, yMin: -1, yMax: 4, once: true,
      emit: { panels: ["a1_p1"], reveal: [], arm: [], spawn: [], cutscene: "a1_cs_open", objective: "进村看看", checkpoint: false, win: false } },
    { id: "a1_t_corpse", x0: 24, x1: 27.5, yMin: -1, yMax: 4, once: true,
      emit: { panels: ["a1_p2"], reveal: [], arm: [], spawn: [], objective: "鬼子摸进村了 —— 别出声", checkpoint: true, win: false } },
    { id: "a1_t_wall1", x0: 30.5, x1: 33.5, yMin: -1, yMax: 4, once: true,
      emit: { panels: ["a1_p3"], reveal: [], arm: [], spawn: [], objective: "猫腰，从墙根过去", checkpoint: false, win: false } },
    { id: "a1_t_yard1clear", x0: 48, x1: 51.5, yMin: -1, yMax: 4, once: true,
      emit: { panels: ["a1_p4"], reveal: [], arm: [], spawn: [], objective: "开院门，穿过二道院", checkpoint: true, win: false } },
    // 一路上听得见村子在往地底下钻——这是钟响之前就该有的集体感。
    { id: "a1_t_cellar", x0: 43, x1: 46, yMin: -1, yMax: 4, once: true,
      emit: { panels: ["a1_beat1", "a1_beat2"], reveal: [], arm: [], spawn: [], objective: "挨家挨户叫人下窖", checkpoint: false, win: false } },
    { id: "a1_t_trace", x0: 51, x1: 54, yMin: -1, yMax: 4, once: true,
      emit: { panels: ["a1_brief3"], reveal: [], arm: [], spawn: [], objective: "别留下热灶和露头的粮", checkpoint: false, win: false } },
    { id: "a1_t_tang", x0: 56, x1: 59, yMin: -1, yMax: 4, once: true,
      emit: { panels: ["a1_tang1", "a1_tang2"], reveal: [], arm: [], spawn: [], objective: "叫门的是本村人", checkpoint: false, win: false } },
    { id: "a1_t_child", x0: 65, x1: 68, yMin: -1, yMax: 4, once: true,
      emit: { panels: ["a1_beat3"], reveal: [], arm: [], spawn: [], objective: "", checkpoint: false, win: false } },
    { id: "a1_t_occupy", x0: 99, x1: 102, yMin: -1, yMax: 4, once: true,
      emit: { panels: ["a1_brief2"], reveal: [], arm: [], spawn: [], objective: "他们也在往老槐树底下去", checkpoint: false, win: false } },
    { id: "a1_t_gate", x0: 63, x1: 66, yMin: -1, yMax: 4, once: true,
      emit: { panels: ["a1_p5"], reveal: [], arm: [], spawn: [], objective: "两个人的眼睛是交叉的", checkpoint: false, win: false } },
    { id: "a1_t_yard2clear", x0: 76, x1: 79.5, yMin: -1, yMax: 4, once: true,
      emit: { panels: ["a1_p6"], reveal: [], arm: [], spawn: [], objective: "有狗 —— 全程猫腰", checkpoint: true, win: false } },
    { id: "a1_t_dog", x0: 83, x1: 86, yMin: -1, yMax: 4, once: true,
      emit: { panels: ["a1_p7", "a1_p10"], reveal: [], arm: [], spawn: [], objective: "贴着墙根走完这条街", checkpoint: false, win: false } },
    { id: "a1_t_tree", x0: 104, x1: 107.5, yMin: -1, yMax: 4, once: true,
      emit: { panels: ["a1_p8", "a1_p9"], reveal: [], arm: [], spawn: [], objective: "敲响老槐树上的钟", checkpoint: true, win: false } },
    // 敲钟之后没有触发器、没有检查点、也没有 win:true。
    // 这一幕怎么收由 endKind:"captured" 决定，a1_close 由玩法层在被抓时播。
  ],

  // ═══════════ 机位区：玩的过程里镜头就在说话 ═══════════
  // 定镜头（anchorX）= 镜头钉死，人走进构图。每一段都写了为什么换机位。
  shots: [
    { id: "a1_sh_open", x0: 3, x1: 22, viewHeight: 12.6, lift: 2.4, anchorX: null, ease: 1.4,
      reason: "村子还睡着：拉开留出天和远处那棵老槐树的剪影，让玩家先看见目标再走路" },
    { id: "a1_sh_wall", x0: 33, x1: 41, viewHeight: 8.0, lift: 1.2, anchorX: null, ease: 1.0,
      reason: "矮墙猫腰段：推近压低，画面跟着人一起蹲下去" },
    { id: "a1_sh_yard2", x0: 50, x1: 78, viewHeight: 13.2, lift: 2.6, anchorX: null, ease: 1.2,
      reason: "两个哨兵的视线是交叉的：拉开，让玩家一眼看清两个人的位置关系再动" },
    { id: "a1_sh_dog", x0: 84, x1: 96, viewHeight: 8.8, lift: 1.4, anchorX: null, ease: 1.0,
      reason: "军犬就在墙那头：收紧画面，这一段该靠听的，不该靠看的" },
    { id: "a1_sh_bell", x0: 106, x1: 110, viewHeight: 12.0, lift: 2.2, anchorX: 108, ease: 1.6,
      reason: "第一次真正看见钟：镜头钉住不动，高老忠从左边走进画面，钟在右边等着他" },
    { id: "a1_sh_sealed", x0: 112, x1: 128, viewHeight: 14.6, lift: 2.8, anchorX: null, ease: 1.2,
      reason: "钟响之后：拉到最远，让玩家自己看见前后都是人、那个地道口就在够不着的地方" },
  ],

  cutscenes: {
    // 山田带队夜里摸进村。那句台词在原片里是一道要命的命令，不是梗：
    // 夜、压低的声音、队列无声散开。镜头全程慢，没有一个滑稽的节拍。
    a1_cs_open: {
      id: "a1_cs_open", letterbox: "full", skippable: true,
      steps: [
        { kind: "camera", to: { x: 6, y: 2.2, viewHeight: 9.0 }, sec: 0.01, ease: "inOut" },
        { kind: "fade", to: 0, sec: 1.6 },
        { kind: "wait", sec: 0.8 },
        { kind: "sfx", id: "boot" },
        { kind: "actor", id: "a1_e_tang", to: { x: 9 }, sec: 3.2, anim: "sneak", facing: 1 },
        { kind: "actor", id: "a1_e_blocker", to: { x: 6.6 }, sec: 3.4, anim: "sneak", facing: 1 },
        { kind: "camera", to: { x: 11, y: 2.0, viewHeight: 8.4 }, sec: 3.2, ease: "inOut" },
        { kind: "panel", id: "a1_cs_open_p1" },
        { kind: "panel", id: "a1_brief1" },
        { kind: "actor", id: "a1_e_tang", to: { x: 12 }, sec: 1.6, anim: "walk", facing: 1 },
        { kind: "wait", sec: 0.6 },
        { kind: "camera", to: { x: 8.2, y: 1.8, viewHeight: 6.0 }, sec: 2.0, ease: "inOut" },
        { kind: "panel", id: "a1_cs_open_p2" },
        { kind: "panel", id: "a1_cs_open_p3" },
        { kind: "wait", sec: 0.6 },
        { kind: "camera", to: { x: 10.5, y: 1.8, viewHeight: 6.6 }, sec: 1.4, ease: "inOut" },
        { kind: "panel", id: "a1_tang3" },
        { kind: "actor", id: "a1_e_tang", to: { x: 13.6 }, sec: 1.4, anim: "walk", facing: 1 },
        { kind: "panel", id: "a1_tang4" },
        { kind: "wait", sec: 0.9 },
        { kind: "sfx", id: "cloth" },
        { kind: "actor", id: "a1_e_chase1", to: { x: 17 }, sec: 2.6, anim: "sneak", facing: 1 },
        { kind: "actor", id: "a1_e_chase3", to: { x: 14 }, sec: 2.6, anim: "sneak", facing: 1 },
        { kind: "camera", to: { x: 20, y: 3.0, viewHeight: 13.0 }, sec: 3.6, ease: "inOut" },
        { kind: "panel", id: "a1_cs_open_p4" },
        { kind: "wait", sec: 1.2 },
        { kind: "fade", to: 1, sec: 1.4 },
        { kind: "actor", id: "a1_e_tang", to: { x: 121 }, sec: 0.01, anim: "idle", facing: -1 },
        { kind: "actor", id: "a1_e_blocker", to: { x: 125 }, sec: 0.01, anim: "idle", facing: 1 },
        { kind: "actor", id: "a1_e_chase1", to: { x: 85 }, sec: 0.01, anim: "idle", facing: 1 },
        { kind: "actor", id: "a1_e_chase3", to: { x: 7 }, sec: 0.01, anim: "idle", facing: 1 },
        { kind: "camera", to: { x: 4, y: 1.6, viewHeight: 11.5 }, sec: 0.01, ease: "inOut" },
        { kind: "fade", to: 0, sec: 1.2 },
      ],
    },
    // 全作最重的仪式点。上树、三下钟、镜头拉开看见全村醒过来。
    a1_cs_bell: {
      id: "a1_cs_bell", letterbox: "full", skippable: true,
      steps: [
        { kind: "camera", to: { x: 112.4, y: 1.6, viewHeight: 7.2 }, sec: 1.4, ease: "inOut" },
        { kind: "actor", id: "player", to: { x: 112.2 }, sec: 0.9, anim: "walk", facing: 1 },
        { kind: "panel", id: "a1_cs_bell_p1" },
        { kind: "sfx", id: "cloth" },
        { kind: "actor", id: "player", to: { x: 112.5, y: 2.6 }, sec: 2.4, anim: "climb", facing: 1 },
        { kind: "camera", to: { x: 112.5, y: 3.8, viewHeight: 6.2 }, sec: 2.4, ease: "inOut" },
        { kind: "wait", sec: 0.6 },
        { kind: "bell", rings: 3 },
        { kind: "camera", to: { x: 104, y: 4.4, viewHeight: 17.0 }, sec: 3.6, ease: "inOut" },
        { kind: "sfx", id: "shout" },
        { kind: "panel", id: "a1_cs_bell_p2" },
        { kind: "panel", id: "a1_p12" },
        { kind: "actor", id: "player", to: { x: 112.5, y: 0 }, sec: 1.1, anim: "fall", facing: -1 },
        { kind: "wait", sec: 0.5 },
      ],
    },
  },

  checkpoints: [
    { id: "a1_cp1", x: 26, y: 0, label: "村口" },
    { id: "a1_cp2", x: 50.5, y: 0.35, label: "头道院" },
    { id: "a1_cp3", x: 78.5, y: 0, label: "二道院" },
    { id: "a1_cp4", x: 106.5, y: 0, label: "老槐树下" },
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
    { id: "a2_pr_loophole1", x: 55, y: -8.0, z: PLAY, kind: "loophole", facing: 1, interact: "none", data: null, label: "枪眼" },
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
    // 铺垫：把口令传给暗室里的人。对着通气孔说，不是喊。
    { id: "a2_pr_sig_hideout", x: 92, y: -3.8, z: PLAY, kind: "vent", facing: 1, interact: "signal",
      data: { squadId: "squad_hideout", panels: ["a2_call1", "a2_call2", "a2_call3", "a2_call4"] }, label: "对着通气孔传话" },
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
    { id: "a2_n_wangdaniang", x: 35, y: -3.8, name: "王大娘", role: "elder", follow: false, rescued: false },
    { id: "a2_n_shuanzhu", x: 58.5, y: -3.8, name: "栓柱", role: "child", follow: false, rescued: false },
    { id: "a2_n_ersao", x: 61.5, y: -3.8, name: "二嫂", role: "villager", follow: false, rescued: false },
    { id: "a2_n_siye", x: 94, y: -3.8, name: "四爷", role: "elder", follow: false, rescued: false },
    { id: "a2_n_qiulan", x: 105, y: -8.0, name: "秋兰", role: "villager", follow: false, rescued: false },
    { id: "a2_n_laoshuan", x: 128, y: -3.8, name: "老栓", role: "villager", follow: false, rescued: false },
  ],

  hazards: [],

  triggers: [
    { id: "a2_t_open", x0: 0, x1: 5, yMin: -9.5, yMax: -6.0, once: true,
      emit: { panels: ["a2_p1"], reveal: [], arm: [], spawn: [], cutscene: "a2_cs_open", objective: "跟着那盏马灯的光走", checkpoint: false, win: false } },
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
    { id: "a2_t_bellcode", x0: 16, x1: 19, yMin: -9.5, yMax: -6.0, once: true,
      emit: { panels: ["a2_brief2"], reveal: [], arm: [], spawn: [], objective: "记住钟点：三慢两快是集合", checkpoint: false, win: false } },
    { id: "a2_t_shuanzhu", x0: 57, x1: 60, yMin: -5.0, yMax: -2.4, once: true,
      emit: { panels: ["a2_beat1", "a2_beat2"], reveal: [], arm: [], spawn: [], objective: "", checkpoint: false, win: false } },
    { id: "a2_t_three", x0: 46, x1: 49, yMin: -5.0, yMax: -2.4, once: true,
      emit: { panels: ["a2_beat5"], reveal: [], arm: [], spawn: [], objective: "", checkpoint: false, win: false } },
    // 汤丙会在通气孔上头喊四爷的名字。他爹跟四爷一块打过井——最难受的不是敌人，是这个。
    { id: "a2_t_tang", x0: 91, x1: 95, yMin: -5.0, yMax: -2.4, once: true,
      emit: { panels: ["a2_tang1", "a2_tang2", "a2_tang3", "a2_tang4"], reveal: [], arm: [], spawn: [], objective: "别应声", checkpoint: true, win: false } },
    { id: "a2_t_carry", x0: 96, x1: 99, yMin: -5.0, yMax: -2.4, once: true,
      emit: { panels: ["a2_beat3"], reveal: [], arm: [], spawn: [], objective: "", checkpoint: false, win: false } },
    { id: "a2_t_newdirt", x0: 120, x1: 124, yMin: -5.0, yMax: -2.4, once: true,
      emit: { panels: ["a2_beat4"], reveal: [], arm: [], spawn: [], objective: "头顶的土是新翻的 —— 别停", checkpoint: false, win: false } },
    { id: "a2_t_choke", x0: 135, x1: 139, yMin: -9.5, yMax: -6.0, once: true,
      emit: { panels: ["a2_brief1"], reveal: [], arm: [], spawn: [], objective: "", checkpoint: false, win: false } },
    { id: "a2_t_elder", x0: 84, x1: 88, yMin: -5.0, yMax: -2.4, once: true,
      emit: { panels: ["a2_p8"], reveal: [], arm: [], spawn: [], objective: "四爷在西院底下", checkpoint: true, win: false } },
    { id: "a2_t_mid", x0: 104, x1: 108, yMin: -9.5, yMax: -6.0, once: true,
      emit: { panels: ["a2_p9"], reveal: [], arm: [], spawn: [], objective: "人还不齐 —— 别落下谁", checkpoint: true, win: false } },
    { id: "a2_t_street", x0: 116, x1: 120, yMin: -5.0, yMax: -2.4, once: true,
      emit: { panels: ["a2_p10"], reveal: [], arm: [], spawn: [], objective: "头顶就是街 —— 爬过去", checkpoint: true, win: false } },
    { id: "a2_t_wellnear", x0: 138, x1: 142, yMin: -9.5, yMax: -6.0, once: true,
      emit: { panels: ["a2_p11", "a2_beat6"], reveal: ["a2_h_well"], arm: [], spawn: [], cutscene: "a2_cs_meet", objective: "到枯井底，人齐了就上去", checkpoint: true, win: false } },
    { id: "a2_t_end", x0: 143, x1: 148, yMin: -9.5, yMax: -6.0, once: true,
      emit: { panels: [], reveal: [], arm: [], spawn: [], objective: "", checkpoint: false, win: true } },
  ],

  shots: [
    { id: "a2_sh_low", x0: 3, x1: 11.5, viewHeight: 6.8, lift: 0.35, anchorX: null, ease: 1.2,
      reason: "开场第一段矮道：推到最近，先让玩家憋一下，再给他灯" },
    { id: "a2_sh_lantern", x0: 12.4, x1: 15.0, viewHeight: 9.0, lift: 0.6, anchorX: 13.7, ease: 1.4,
      reason: "捡马灯：镜头停住，让那点光在原地亮起来，而不是跟着人晃" },
    { id: "a2_sh_fork", x0: 26, x1: 40, viewHeight: 11.2, lift: 1.4, anchorX: null, ease: 1.2,
      reason: "地道网第一个分岔口：拉开，让玩家看见上下两层是怎么接上的（三通里的高低相通）" },
    { id: "a2_sh_probe", x0: 46, x1: 66, viewHeight: 7.2, lift: 0.4, anchorX: null, ease: 1.0,
      reason: "头顶就是刺刀：收紧到只看得见眼前两三米，逼玩家去听而不是去看" },
    { id: "a2_sh_street", x0: 116, x1: 134, viewHeight: 6.2, lift: 0.25, anchorX: null, ease: 1.0,
      reason: "净空 0.85 的爬行段：推到最紧，画面被土压扁——街就在头顶上" },
    { id: "a2_sh_count", x0: 142.5, x1: 146.5, viewHeight: 11.5, lift: 0.8, anchorX: 144.5, ease: 1.6,
      reason: "枯井底点人头：镜头钉住，六个人一个一个走进画面，玩家自己数" },
  ],

  cutscenes: {
    // 地道里第一次听见地面的钟。震下来的土、抬头、然后是那三下。
    a2_cs_open: {
      id: "a2_cs_open", letterbox: "wide", skippable: true,
      steps: [
        { kind: "camera", to: { x: 5, y: -7.2, viewHeight: 7.6 }, sec: 0.01, ease: "inOut" },
        { kind: "fade", to: 0, sec: 1.4 },
        { kind: "wait", sec: 0.7 },
        { kind: "camera", to: { x: 6.5, y: -6.4, viewHeight: 6.4 }, sec: 2.4, ease: "inOut" },
        { kind: "sfx", id: "bell_ring" },
        { kind: "panel", id: "a2_cs_open_p1" },
        { kind: "wait", sec: 0.8 },
        { kind: "actor", id: "player", to: { x: 5.4 }, sec: 1.0, anim: "idle", facing: 1 },
        { kind: "camera", to: { x: 9, y: -7.0, viewHeight: 8.4 }, sec: 2.6, ease: "inOut" },
        { kind: "panel", id: "a2_cs_open_p2" },
        { kind: "panel", id: "a2_cs_open_p3" },
        { kind: "wait", sec: 0.6 },
      ],
    },
    // 暗室点人头。这一段的重量全在"数"这个动作上。
    a2_cs_meet: {
      id: "a2_cs_meet", letterbox: "full", skippable: true,
      steps: [
        { kind: "camera", to: { x: 144, y: -7.0, viewHeight: 9.6 }, sec: 1.6, ease: "inOut" },
        { kind: "actor", id: "player", to: { x: 142.5 }, sec: 1.2, anim: "walk", facing: 1 },
        { kind: "panel", id: "a2_cs_meet_p1" },
        { kind: "actor", id: "a2_n_shuanzhu", to: { x: 143.6 }, sec: 1.0, anim: "walk", facing: 1 },
        { kind: "actor", id: "a2_n_wangdaniang", to: { x: 144.6 }, sec: 1.4, anim: "walk", facing: 1 },
        { kind: "actor", id: "a2_n_siye", to: { x: 145.6 }, sec: 1.6, anim: "walk", facing: 1 },
        { kind: "actor", id: "a2_n_qiulan", to: { x: 146.4 }, sec: 1.8, anim: "walk", facing: 1 },
        { kind: "actor", id: "a2_n_ersao", to: { x: 147.2 }, sec: 2.0, anim: "walk", facing: 1 },
        { kind: "actor", id: "a2_n_laoshuan", to: { x: 148 }, sec: 2.2, anim: "walk", facing: 1 },
        { kind: "wait", sec: 0.6 },
        { kind: "camera", to: { x: 145.6, y: -7.2, viewHeight: 7.4 }, sec: 2.0, ease: "inOut" },
        { kind: "panel", id: "a2_cs_meet_p2" },
        { kind: "wait", sec: 0.7 },
        { kind: "panel", id: "a2_cs_meet_p3" },
        { kind: "wait", sec: 0.5 },
        { kind: "panel", id: "a2_p12" },
        { kind: "wait", sec: 0.8 },
      ],
    },
  },

  checkpoints: [
    { id: "a2_cp1", x: 13, y: -8.0, label: "马灯" },
    { id: "a2_cp2", x: 32, y: -3.8, label: "头一个藏身洞" },
    { id: "a2_cp3", x: 50, y: -3.8, label: "翻口上头" },
    { id: "a2_cp4", x: 86, y: -3.8, label: "西院支道" },
    { id: "a2_cp5", x: 106, y: -8.0, label: "干线中段" },
    { id: "a2_cp6", x: 116.5, y: -3.8, label: "街道底下" },
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
    { id: "a3_f_su3", x0: 106, x1: 142, y: 0, kind: "dirt" },
    // 街道底下的短地道：绕开两个哨兵和一条狗
    { id: "a3_f_dm", x0: 88, x1: 106, y: -4.5, kind: "tunnel" },
    // 地下：东段干线（塌方之后的那一半）
    { id: "a3_f_d3", x0: 110, x1: 148, y: -8.0, kind: "tunnel" },
    { id: "a3_f_d4", x0: 148, x1: 178, y: -8.0, kind: "tunnel" },
    // 反击段的两条民兵支线：干线在下，民兵蹲在上头的射击位。
    // 各有两口竖井接回干线，都不是断头路。
    { id: "a3_f_s5", x0: 126, x1: 142, y: -3.8, kind: "tunnel" },
    { id: "a3_f_s6", x0: 152, x1: 166, y: -3.8, kind: "tunnel" },
    // 最后一段的地表街面：只承载山田一伙，玩家到不了（有意为之）。
    { id: "a3_f_top3", x0: 146, x1: 168, y: 0, kind: "dirt" },
    // 灌烟那个洞口的地面：开场过场里山田和汤丙会站这儿，玩家到不了。
    { id: "a3_f_top0", x0: 2, x1: 26, y: 0, kind: "dirt" },
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
    { x0: 88, x1: 106, y: -3.30 },
    // 东段干线
    { x0: 110, x1: 130, y: -6.22 },
    { x0: 130, x1: 138, y: -6.90 },
    { x0: 138, x1: 148, y: -6.22 },
    // 摸黑段：干线畅通，净空足，压力全来自头顶的人
    { x0: 148, x1: 178, y: -6.22 },
    // 民兵支线：净空 1.20，一路猫腰——射击位本来就是蹲着打的
    { x0: 126, x1: 142, y: -2.60 },
    { x0: 152, x1: 166, y: -2.60 },
  ],

  shafts: [
    { id: "a3_sh_grain_a", x: 30, yTop: -4.2, yBottom: -8.0, kind: "ladder", requiresHatch: null },
    { id: "a3_sh_grain_b", x: 38, yTop: -4.2, yBottom: -8.0, kind: "dirt", requiresHatch: null },
    { id: "a3_sh_mill", x: 63, yTop: 0, yBottom: -8.0, kind: "ladder", requiresHatch: "a3_h_mill" },
    { id: "a3_sh_m1", x: 88.5, yTop: 0.4, yBottom: -4.5, kind: "ladder", requiresHatch: "a3_h_street1" },
    { id: "a3_sh_m2", x: 105.5, yTop: 0.4, yBottom: -4.5, kind: "ladder", requiresHatch: "a3_h_street2" },
    { id: "a3_sh_kang", x: 116, yTop: 0, yBottom: -8.0, kind: "ladder", requiresHatch: "a3_h_kang" },
    { id: "a3_sh_e1", x: 128, yTop: -3.8, yBottom: -8.0, kind: "ladder", requiresHatch: null },
    { id: "a3_sh_e2", x: 140, yTop: -3.8, yBottom: -8.0, kind: "dirt", requiresHatch: null },
    { id: "a3_sh_e3", x: 154, yTop: -3.8, yBottom: -8.0, kind: "ladder", requiresHatch: null },
    { id: "a3_sh_e4", x: 164, yTop: -3.8, yBottom: -8.0, kind: "dirt", requiresHatch: null },
    { id: "a3_sh_wind", x: 175, yTop: 0, yBottom: -8.0, kind: "dirt", requiresHatch: null },
  ],

  hatches: [
    { id: "a3_h_mill", x: 63, shaftId: "a3_sh_mill", hidden: true, opened: false, revealBy: "a3_t_choke", label: "碾盘下的地道口", propId: "a3_pr_mill_hatch" },
    { id: "a3_h_street1", x: 88.5, shaftId: "a3_sh_m1", hidden: true, opened: false, revealBy: "a3_t_street", label: "驴槽底下的口", propId: "a3_pr_trough_hatch" },
    { id: "a3_h_street2", x: 105.5, shaftId: "a3_sh_m2", hidden: true, opened: false, revealBy: "a3_t_dip", label: "水缸底下的翻口", propId: "a3_pr_dip_out" },
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
    { id: "a3_pr_loophole_a3", x: 69, y: -8.0, z: PLAY, kind: "loophole", facing: 1, interact: "none", data: null, label: "枪眼" },
    { id: "a3_pr_mill_hatch", x: 63, y: -8.0, z: PLAY, kind: "trapdoor", facing: 1, interact: "hatch", data: { hatchId: "a3_h_mill" }, label: "碾盘下的地道口" },
    { id: "a3_pr_collapse", x: 68, y: -8.0, z: PLAY, kind: "prop_beam", facing: 1, interact: "none", data: null, label: "塌方" },

    // —— 地表 su1：碾盘院。天快亮了 ——
    { id: "a3_pr_millstone_top", x: 63, y: 0, z: PLAY, kind: "millstone", facing: 1, interact: "none", data: null, label: null },
    { id: "a3_pr_corpse_s1", x: 67, y: 0, z: PLAY, kind: "corpse", facing: 1, interact: "none", data: null, label: null },
    { id: "a3_pr_wall_s1", x: 70, y: 0, z: PLAY, kind: "wall", facing: 1, interact: "none", data: null, label: null },
    { id: "a3_pr_cart_s1", x: 72, y: 0, z: FORE, kind: "cart", facing: 1, interact: "none", data: null, label: null },
    { id: "a3_pr_haystack_s1", x: 70.5, y: 0, z: PLAY, kind: "haystack", facing: 1, interact: "hide", data: { capacity: 1 }, label: "柴垛" },
    { id: "a3_pr_house_s1", x: 78, y: 0, z: MID, kind: "house", facing: 1, interact: "none", data: null, label: null },
    { id: "a3_pr_cart_g1", x: 76.5, y: 0, z: PLAY, kind: "cart", facing: 1, interact: "hide", data: { capacity: 1 }, label: "马车" },
    { id: "a3_pr_haystack_g1b", x: 80, y: 0, z: PLAY, kind: "haystack", facing: 1, interact: "hide", data: { capacity: 1 }, label: "柴垛" },
    { id: "a3_pr_vat_s1", x: 82, y: 0, z: PLAY, kind: "vat", facing: 1, interact: "hide", data: { capacity: 1 }, label: "水缸" },
    { id: "a3_pr_gate_s1", x: 86.5, y: 0, z: PLAY, kind: "gate", facing: 1, interact: "lever", data: { channel: "gateOpen", needItem: null }, label: "院门" },

    // —— 地表 su2：街道，两个哨兵 + 一条狗。驴槽底下有口 ——
    { id: "a3_pr_trough_hatch", x: 88.5, y: 0.4, z: PLAY, kind: "trough", facing: 1, interact: "hatch", data: { hatchId: "a3_h_street1" }, label: "驴槽底下的口" },
    { id: "a3_pr_haystack_gate", x: 89.5, y: 0.4, z: PLAY, kind: "haystack", facing: 1, interact: "hide", data: { capacity: 1 }, label: "柴垛" },
    { id: "a3_pr_trough_s2", x: 92, y: 0.4, z: PLAY, kind: "trough", facing: 1, interact: "hide", data: { capacity: 1 }, label: "驴槽" },
    { id: "a3_pr_house_s2", x: 95, y: 0.4, z: MID, kind: "house", facing: -1, interact: "none", data: null, label: null },
    { id: "a3_pr_vat_g2", x: 94.5, y: 0.4, z: PLAY, kind: "vat", facing: 1, interact: "hide", data: { capacity: 1 }, label: "水缸" },
    { id: "a3_pr_trough_g2", x: 98, y: 0.4, z: PLAY, kind: "trough", facing: 1, interact: "hide", data: { capacity: 1 }, label: "驴槽" },
    { id: "a3_pr_haystack_s2", x: 100.5, y: 0.4, z: PLAY, kind: "haystack", facing: 1, interact: "hide", data: { capacity: 1 }, label: "柴垛" },
    { id: "a3_pr_vat_s2", x: 105.5, y: 0.4, z: PLAY, kind: "vat", facing: 1, interact: "none", data: null, label: null },
    { id: "a3_pr_cart_g3", x: 105, y: 0.4, z: PLAY, kind: "cart", facing: 1, interact: "hide", data: { capacity: 1 }, label: "马车" },
    { id: "a3_pr_haystack_g3", x: 102.5, y: 0.4, z: PLAY, kind: "haystack", facing: 1, interact: "hide", data: { capacity: 1 }, label: "柴垛" },
    { id: "a3_pr_fence_s2", x: 103, y: 0.4, z: FORE, kind: "fence", facing: 1, interact: "none", data: null, label: null },

    // —— 街道底下的短地道 ——
    { id: "a3_pr_beam_m1", x: 92, y: -4.5, z: PLAY, kind: "prop_beam", facing: 1, interact: "none", data: null, label: null },
    { id: "a3_pr_vent_m1", x: 94, y: -3.30, z: PLAY, kind: "vent", facing: 1, interact: "none", data: null, label: null },
    { id: "a3_pr_crock_m", x: 101, y: -4.5, z: PLAY, kind: "crock", facing: 1, interact: "none", data: null, label: null },
    { id: "a3_pr_dip_out", x: 105.5, y: -4.5, z: PLAY, kind: "trapdoor", facing: 1, interact: "hatch", data: { hatchId: "a3_h_street2" }, label: "水缸底下的翻口" },

    // —— 地表 su3：水井 + 炕屋 ——
    { id: "a3_pr_sign3", x: 107, y: 0, z: PLAY, kind: "sign", facing: 1, interact: "read", data: { codexId: "codex_qiangyan" }, label: "墙根的枪眼" },
    { id: "a3_pr_waterpipe_s3", x: 109.5, y: 0, z: PLAY, kind: "waterpipe", facing: 1, interact: "none", data: null, label: null },
    { id: "a3_pr_haystack_s3", x: 108.5, y: 0, z: PLAY, kind: "haystack", facing: 1, interact: "hide", data: { capacity: 1 }, label: "柴垛" },
    { id: "a3_pr_well3", x: 112, y: 0, z: PLAY, kind: "well", facing: 1, interact: "lever", data: { channel: "waterDivert", needItem: null }, label: "水井辘轳" },
    { id: "a3_pr_haystack_kang", x: 116.8, y: 0, z: PLAY, kind: "haystack", facing: 1, interact: "hide", data: { capacity: 1 }, label: "柴垛" },
    { id: "a3_pr_kang3", x: 116, y: 0, z: PLAY, kind: "kang", facing: 1, interact: "hatch", data: { hatchId: "a3_h_kang" }, label: "炕下的地道口" },
    { id: "a3_pr_haystack_s3b", x: 114, y: 0, z: PLAY, kind: "haystack", facing: 1, interact: "hide", data: { capacity: 1 }, label: "柴垛" },
    { id: "a3_pr_vat_s3", x: 118, y: 0, z: PLAY, kind: "vat", facing: 1, interact: "hide", data: { capacity: 1 }, label: "水缸" },
    { id: "a3_pr_house_s3", x: 118, y: 0, z: MID, kind: "house", facing: -1, interact: "none", data: null, label: null },
    { id: "a3_pr_vat_s4", x: 122, y: 0, z: PLAY, kind: "vat", facing: 1, interact: "hide", data: { capacity: 1 }, label: "水缸" },
    { id: "a3_pr_cart_s3", x: 123.2, y: 0, z: PLAY, kind: "cart", facing: 1, interact: "hide", data: { capacity: 1 }, label: "马车" },
    { id: "a3_pr_loophole_s3", x: 121, y: -8.0, z: PLAY, kind: "loophole", facing: 1, interact: "none", data: null, label: "枪眼" },
    { id: "a3_pr_lamp_s3", x: 123, y: 0, z: BACK, kind: "lamp", facing: 1, interact: "none", data: null, label: null },

    // —— 地下 d3：汇合段 ——
    // —— 反击：地道里挂的那截钢轨，就是第三次钟声（反击的信号）——
    { id: "a3_pr_bell3", x: 119, y: -8.0, z: PLAY, kind: "bell", facing: 1, interact: "bell",
      data: { rings: 3, cutscene: "a3_cs_bell", panels: ["a3_call1"], objective: "西头枪眼，把他们往东赶" }, label: "地道里挂的钢轨" },
    // —— 反击：传令点。三个组分散在两条支线上，玩家得爬上爬下跑腿 ——
    { id: "a3_pr_sig_west", x: 131, y: -3.8, z: PLAY, kind: "vent", facing: 1, interact: "signal",
      data: { squadId: "squad_west", panels: ["a3_call4"] }, label: "传口令：西头组" },
    { id: "a3_pr_sig_mill", x: 141, y: -3.8, z: PLAY, kind: "vent", facing: 1, interact: "signal",
      data: { squadId: "squad_mill", panels: ["a3_call6", "a3_call7"] }, label: "传口令：碾道组" },
    { id: "a3_pr_sig_east", x: 157, y: -3.8, z: PLAY, kind: "vent", facing: 1, interact: "signal",
      data: { squadId: "squad_east", panels: ["a3_call2", "a3_call3"] }, label: "传口令：东头组" },
    // —— 反击：枪眼。两个头顶都真的有人在走 ——
    // 136 上头是汤丙会 [134,140]：枪眼一开，他在土上头喊高传宝的名字。高传宝不出声。
    { id: "a3_pr_lh_west", x: 136, y: -3.8, z: PLAY, kind: "loophole", facing: 1, interact: "loophole",
      data: { squadId: "squad_west", panels: ["a3_call5", "a3_tang4", "a3_tang5"] }, label: "西头枪眼" },
    // 161 上头是山田 [149,166]：挨了冷枪才知道街心有雷。
    { id: "a3_pr_lh_east", x: 161, y: -3.8, z: PLAY, kind: "loophole", facing: 1, interact: "loophole",
      data: { squadId: "squad_east", panels: ["a3_beat2"] }, label: "东头枪眼" },
    // —— 反击：地雷。碾道那颗断他退路，东头那颗合围 ——
    { id: "a3_pr_mine_mill", x: 145, y: -8.0, z: PLAY, kind: "chokepoint", facing: 1, interact: "mine",
      data: { channel: "mineMill", needSquad: "squad_mill", panels: [] }, label: "碾道翻口的雷" },
    { id: "a3_pr_mine_east", x: 168, y: -8.0, z: PLAY, kind: "chokepoint", facing: 1, interact: "mine",
      data: { channel: "mineEast", needSquad: "squad_east", panels: [] }, label: "东头地雷" },
    // —— 民兵支线里的生活/工事痕迹 ——
    { id: "a3_pr_beam_s5a", x: 127, y: -3.8, z: PLAY, kind: "prop_beam", facing: 1, interact: "none", data: null, label: null },
    { id: "a3_pr_crock_s5", x: 134, y: -3.8, z: PLAY, kind: "crock", facing: 1, interact: "none", data: null, label: null },
    { id: "a3_pr_kang_s5", x: 139, y: -3.8, z: PLAY, kind: "kang", facing: 1, interact: "hide", data: { capacity: 1 }, label: "被褥堆" },
    { id: "a3_pr_beam_s6a", x: 153, y: -3.8, z: PLAY, kind: "prop_beam", facing: 1, interact: "none", data: null, label: null },
    { id: "a3_pr_crock_s6", x: 159, y: -3.8, z: PLAY, kind: "crock", facing: 1, interact: "none", data: null, label: null },
    { id: "a3_pr_kang_s6", x: 165, y: -3.8, z: PLAY, kind: "kang", facing: 1, interact: "hide", data: { capacity: 1 }, label: "被褥堆" },
    // 灌烟那个洞口（开场过场用），地表 a3_f_top0 上
    { id: "a3_pr_smokehole", x: 12, y: 0, z: PLAY, kind: "trapdoor", facing: 1, interact: "none", data: null, label: "他们正在往里灌烟的洞口" },
    { id: "a3_pr_house_t0", x: 18, y: 0, z: MID, kind: "house", facing: -1, interact: "none", data: null, label: null },

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
      patrol: { x0: 69, x1: 79, speed: 1.15, pauseSec: 1.4 },
      vision: { range: 10, halfAngleDeg: 30, height: 1.6 },
      hearing: 5.8, probeAt: null,
    },
    // 街道：两个哨兵交叉 + 一条军犬。正经走过去几乎必被发现，
    // 正解是从 x=90 的驴槽下去、x=99 的水缸上来。
    {
      id: "a3_e_g2", x: 98, y: 0.4, kind: "guard", facing: 1,
      patrol: { x0: 96, x1: 100, speed: 1.15, pauseSec: 1.6 },
      vision: { range: 11, halfAngleDeg: 28, height: 1.6 },
      hearing: 6.0, probeAt: null,
    },
    {
      id: "a3_e_g3", x: 102, y: 0.4, kind: "guard", facing: -1,
      patrol: { x0: 101, x1: 104, speed: 1.2, pauseSec: 1.4 },
      vision: { range: 9, halfAngleDeg: 28, height: 1.6 },
      hearing: 6.0, probeAt: null,
    },
    {
      id: "a3_e_dog3", x: 93, y: 0.4, kind: "dog", facing: 1,
      patrol: { x0: 91, x1: 95, speed: 1.5, pauseSec: 0.6 },
      vision: { range: 8, halfAngleDeg: 46, height: 0.7 },
      hearing: 9.5, probeAt: null,
    },
    // 水井那条街：一个来回搜的兵。水井 x=112 和炕洞 x=116 都在他的巡逻里。
    {
      id: "a3_e_s4", x: 120, y: 0, kind: "search", facing: 1,
      patrol: { x0: 118, x1: 123, speed: 1.5, pauseSec: 1.0 },
      vision: { range: 12, halfAngleDeg: 34, height: 1.6 },
      hearing: 6.5, probeAt: null,
    },
    // 汤丙会（伪军队长）：本村人，认得每一个院子。他不是脸谱化的走狗——
    // 危险恰恰在于"他知道哪儿有口"。巡逻线只有六米、视距 11，
    // 跟山田那条十七米的线摆在一起，谁在指挥一眼看得出来。
    {
      id: "a3_e_tang", x: 137, y: 0, kind: "puppet", facing: -1,
      patrol: { x0: 134, x1: 140, speed: 1.25, pauseSec: 1.6 },
      vision: { range: 11, halfAngleDeg: 30, height: 1.6 },
      hearing: 6.0, probeAt: null,
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
    { id: "a3_n_qiulan", x: 9, y: -8.0, name: "秋兰", role: "villager", follow: false, rescued: false },
    { id: "a3_n_shuanzhu", x: 12, y: -8.0, name: "栓柱", role: "child", follow: false, rescued: false },
    { id: "a3_n_wangdaniang", x: 15, y: -8.0, name: "王大娘", role: "elder", follow: false, rescued: false },
    // 塌方那头等着的三位，从炕洞下来才碰得上
    { id: "a3_n_laoshuan", x: 118, y: -8.0, name: "老栓", role: "villager", follow: false, rescued: false },
    { id: "a3_n_ersao", x: 123.5, y: -8.0, name: "二嫂", role: "villager", follow: false, rescued: false },
    { id: "a3_n_siye", x: 127, y: -8.0, name: "四爷", role: "elder", follow: false, rescued: false },
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
      emit: { panels: ["a3_p1"], reveal: [], arm: ["a3_hz_gas"], spawn: [], cutscene: "a3_cs_open", objective: "烟从后头灌进来了 —— 往前跑", checkpoint: false, win: false } },
    { id: "a3_t_gasbrief", x0: 12, x1: 16, yMin: -9.5, yMax: -6.0, once: true,
      emit: { panels: ["a3_brief3"], reveal: [], arm: [], spawn: [], objective: "湿布捂住口鼻 —— 干布不顶用", checkpoint: false, win: false } },
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
      emit: { panels: [], reveal: [], arm: [], spawn: [], objective: "扳辘轳，把水引进他们灌烟的那个洞", checkpoint: true, win: false } },
    { id: "a3_t_flood", x0: 113.5, x1: 117, yMin: -1.0, yMax: 3.0, once: true,
      emit: { panels: ["a3_p10"], reveal: ["a3_h_kang"], arm: ["a3_hz_water"], spawn: [], objective: "下炕洞，跟乡亲汇合", checkpoint: true, win: false } },
    { id: "a3_t_meet", x0: 116.5, x1: 119.5, yMin: -9.5, yMax: -6.0, once: true,
      emit: { panels: ["a3_p11"], reveal: [], arm: [], spawn: [], objective: "跟乡亲汇合，一个都不能少", checkpoint: true, win: false } },
    // 枪眼在 x=121，正上方是 a3_e_s4 的巡逻区（118–123）。
    // 他来回走，总有背对着枪眼的那几秒——那几秒就是这一幕真正的转折点。
    { id: "a3_t_loophole", x0: 120, x1: 122.5, yMin: -9.5, yMax: -6.0, once: true,
      emit: { panels: ["a3_p9"], reveal: [], arm: [], spawn: [], objective: "人齐了 —— 往黑风口走", checkpoint: true, win: false } },
    // 汇合到摸黑段之间有二十多米一句话没有，林霞在这儿说去处。
    { id: "a3_t_quiet", x0: 133, x1: 137, yMin: -9.5, yMax: -6.0, once: true,
      emit: { panels: ["a3_p13"], reveal: [], arm: [], spawn: [], objective: "人齐了 —— 往黑风口走", checkpoint: true, win: false } },
    // 反击从这儿开始：先把口令传到西头，把他们的退路封掉。
    { id: "a3_t_counter", x0: 117, x1: 120, yMin: -9.5, yMax: -6.0, once: true,
      emit: { panels: ["a3_beat1", "a3_brief1"], reveal: [], arm: [], spawn: [], objective: "敲钢轨 —— 三快一慢", checkpoint: true, win: false } },
    { id: "a3_t_squad_west", x0: 129, x1: 133, yMin: -5.0, yMax: -2.4, once: true,
      emit: { panels: [], reveal: [], arm: [], spawn: [], objective: "西头组：开枪眼，把他们往东赶", checkpoint: true, win: false } },
    { id: "a3_t_squad_east", x0: 155, x1: 159, yMin: -5.0, yMax: -2.4, once: true,
      emit: { panels: [], reveal: [], arm: [], spawn: [], objective: "东头组：地雷合围", checkpoint: true, win: false } },
    // 汤丙会在通气孔上头喊话劝降。栓柱认得他，林霞按住所有人：钟没响就不动。
    { id: "a3_t_tang_call", x0: 125, x1: 129, yMin: -9.5, yMax: -6.0, once: true,
      emit: { panels: ["a3_tang1", "a3_tang2", "a3_tang3"], reveal: [], arm: [], spawn: [], objective: "别应声 —— 钟没响就不动", checkpoint: true, win: false } },
    { id: "a3_t_dark", x0: 145, x1: 150, yMin: -9.5, yMax: -6.0, once: true,
      emit: { panels: ["a3_p12"], reveal: [], arm: [], spawn: ["a3_e_yamada", "a3_e_s5"], objective: "把马灯放下 —— 摸黑走，认通气孔漏下来的光", checkpoint: true, win: false } },
    // 摸黑段的尽头。这一格没有台词，只有一个抬头往上看的画面。
    { id: "a3_t_reeds", x0: 166, x1: 170, yMin: -9.5, yMax: -6.0, once: true,
      emit: { panels: ["a3_p14"], reveal: [], arm: [], spawn: [], objective: "到了 —— 一个一个上去", checkpoint: true, win: false } },
    // 反击得手：东头地雷响过之后，镜头交给过场。
    { id: "a3_t_strike", x0: 169, x1: 172, yMin: -9.5, yMax: -6.0, once: true,
      emit: { panels: [], reveal: [], arm: [], spawn: [], cutscene: "a3_cs_strike", objective: "带全村爬出黑风口", checkpoint: true, win: false } },
    { id: "a3_t_end", x0: 172, x1: 178, yMin: -9.5, yMax: -6.0, once: true,
      emit: { panels: [], reveal: [], arm: [], spawn: [], objective: "", checkpoint: false, win: true } },
  ],

  shots: [
    { id: "a3_sh_gas", x0: 2, x1: 20, viewHeight: 11.6, lift: 1.0, anchorX: null, ease: 1.2,
      reason: "毒烟从背后压过来：拉开，让玩家自己看见烟已经吃掉了多少路" },
    { id: "a3_sh_choke", x0: 48, x1: 56, viewHeight: 7.0, lift: 0.4, anchorX: null, ease: 1.0,
      reason: "封卡口：推到最近，木塞塞进去那一下要占满画面" },
    { id: "a3_sh_up", x0: 60, x1: 72, viewHeight: 15.0, lift: 3.0, anchorX: null, ease: 1.6,
      reason: "从碾盘底下钻出来，天正在亮：拉到最远，一眼看清整条街和街上的人" },
    { id: "a3_sh_boots", x0: 92.6, x1: 96.4, viewHeight: 11.0, lift: 0.5, anchorX: 94.5, ease: 1.6,
      reason: "从驴槽底下探头：镜头钉住，让街上的靴子从画面上沿走过去，人不动镜头也不动" },
    { id: "a3_sh_well", x0: 108, x1: 118, viewHeight: 8.6, lift: 1.6, anchorX: null, ease: 1.0,
      reason: "扳辘轳引水：推近到看得见绳子在动——水要倒灌进他们灌烟的那个洞" },
    { id: "a3_sh_net", x0: 118, x1: 145, viewHeight: 12.6, lift: 1.4, anchorX: null, ease: 1.4,
      reason: "反击开始：拉开，让玩家看清干线和上头两条民兵支线是怎么串成一张网的" },
    { id: "a3_sh_dark", x0: 148, x1: 166, viewHeight: 7.4, lift: 0.3, anchorX: null, ease: 1.2,
      reason: "熄了灯摸黑走：推近压低，只剩通气孔漏下来的那几道光" },
    { id: "a3_sh_out", x0: 168, x1: 172, viewHeight: 12.0, lift: 1.2, anchorX: 170, ease: 1.8,
      reason: "反击得手、黑风口就在眼前：镜头钉住，六个人一个一个走出画面——收尾不追着人跑" },
  ],

  cutscenes: {
    // 山田下令灌烟 / 汤丙会指认地道口。层级关系全在走位上：
    // 汤丙会走过去指，山田站着不动，只把头转过来。
    a3_cs_open: {
      id: "a3_cs_open", letterbox: "full", skippable: true,
      steps: [
        { kind: "camera", to: { x: 14, y: 2.4, viewHeight: 10.0 }, sec: 0.01, ease: "inOut" },
        { kind: "fade", to: 0, sec: 1.4 },
        { kind: "actor", id: "a3_e_yamada", to: { x: 16 }, sec: 0.01, anim: "idle", facing: -1 },
        { kind: "actor", id: "a3_e_tang", to: { x: 18 }, sec: 0.01, anim: "idle", facing: -1 },
        { kind: "wait", sec: 0.7 },
        { kind: "actor", id: "a3_e_tang", to: { x: 12.8 }, sec: 2.4, anim: "walk", facing: -1 },
        { kind: "camera", to: { x: 13, y: 1.8, viewHeight: 7.0 }, sec: 2.4, ease: "inOut" },
        { kind: "panel", id: "a3_cs_open_p1" },
        { kind: "wait", sec: 0.6 },
        { kind: "camera", to: { x: 15, y: 1.8, viewHeight: 6.2 }, sec: 1.8, ease: "inOut" },
        { kind: "actor", id: "a3_e_yamada", to: { x: 15.4 }, sec: 1.4, anim: "walk", facing: -1 },
        { kind: "panel", id: "a3_cs_open_p2" },
        { kind: "sfx", id: "gas" },
        { kind: "wait", sec: 0.9 },
        { kind: "camera", to: { x: 12, y: -3.0, viewHeight: 15.0 }, sec: 3.4, ease: "inOut" },
        { kind: "panel", id: "a3_cs_open_p3" },
        { kind: "wait", sec: 0.8 },
        { kind: "fade", to: 1, sec: 1.2 },
        { kind: "actor", id: "a3_e_yamada", to: { x: 158 }, sec: 0.01, anim: "idle", facing: 1 },
        { kind: "actor", id: "a3_e_tang", to: { x: 137 }, sec: 0.01, anim: "idle", facing: -1 },
        { kind: "camera", to: { x: 4, y: -7.4, viewHeight: 9.0 }, sec: 0.01, ease: "inOut" },
        { kind: "panel", id: "a3_open" },
        { kind: "fade", to: 0, sec: 1.2 },
      ],
    },
    // 第三次钟声：示警（一幕）→ 集合（二幕）→ 动手（这里）。
    // 敲的是地道里挂的那截钢轨，三快一慢。玩家没有攻击键，他敲的是信号。
    a3_cs_bell: {
      id: "a3_cs_bell", letterbox: "full", skippable: true,
      steps: [
        { kind: "camera", to: { x: 119, y: -6.8, viewHeight: 7.6 }, sec: 1.4, ease: "inOut" },
        { kind: "actor", id: "player", to: { x: 118.8 }, sec: 0.9, anim: "walk", facing: 1 },
        { kind: "panel", id: "a3_cs_strike_p1" },
        { kind: "wait", sec: 0.5 },
        { kind: "camera", to: { x: 126, y: -5.4, viewHeight: 13.0 }, sec: 3.2, ease: "inOut" },
        { kind: "panel", id: "a3_bell1" },
        { kind: "sfx", id: "shout" },
        { kind: "wait", sec: 0.8 },
      ],
    },
    // 反击得手。玩家一直没有攻击键——扣扳机的是全村。
    // 所以这一段镜头不跟玩家，它去看那些他传过口令的地方。
    a3_cs_strike: {
      id: "a3_cs_strike", letterbox: "full", skippable: true,
      steps: [
        { kind: "camera", to: { x: 168, y: -6.8, viewHeight: 8.0 }, sec: 1.2, ease: "inOut" },
        { kind: "sfx", id: "alarm" },
        { kind: "panel", id: "a3_tang4" },
        { kind: "camera", to: { x: 160, y: -1.6, viewHeight: 16.0 }, sec: 3.2, ease: "inOut" },
        { kind: "sfx", id: "shout" },
        { kind: "wait", sec: 0.6 },
        { kind: "panel", id: "a3_tang5" },
        { kind: "wait", sec: 0.8 },
        { kind: "camera", to: { x: 174, y: -6.6, viewHeight: 9.0 }, sec: 3.0, ease: "inOut" },
        { kind: "actor", id: "player", to: { x: 172 }, sec: 2.0, anim: "walk", facing: 1 },
        { kind: "panel", id: "a3_cs_strike_p2" },
        { kind: "wait", sec: 0.7 },
      ],
    },
  },

  checkpoints: [
    { id: "a3_cp1", x: 24, y: -8.0, label: "粮窖口" },
    { id: "a3_cp2", x: 35, y: -4.2, label: "粮窖" },
    { id: "a3_cp3", x: 51, y: -8.0, label: "卡口" },
    { id: "a3_cp4", x: 63, y: 0, label: "碾盘院" },
    { id: "a3_cp5", x: 89, y: 0.4, label: "街口" },
    { id: "a3_cp6", x: 112, y: 0, label: "水井" },
    { id: "a3_cp7", x: 126.5, y: -8.0, label: "汇合点" },
    { id: "a3_cp8", x: 135, y: -8.0, label: "干线东段" },
    { id: "a3_cp9", x: 148, y: -8.0, label: "摸黑段前" },
    { id: "a3_cp10", x: 131, y: -3.8, label: "西头组" },
    { id: "a3_cp11", x: 157, y: -3.8, label: "东头组" },
    { id: "a3_cp12", x: 163, y: -8.0, label: "黑风口前" },
  ],

  objectives: [
    { id: "a3_o1", text: "找块木塞", doneWhen: { propUsed: "a3_pr_plug" } },
    { id: "a3_o2", text: "封住卡口，把烟挡回去", doneWhen: { propUsed: "a3_pr_choke" } },
    { id: "a3_o3", text: "上地表，摸到水井", doneWhen: { trigger: "a3_t_water" } },
    { id: "a3_o4", text: "引水冲开塌方", doneWhen: { propUsed: "a3_pr_well3" } },
    { id: "a3_o5", text: "跟乡亲汇合，一个都不能少", doneWhen: { npcRescued: "all" } },
    { id: "a3_o6", text: "敲钢轨，把口令传遍地道网", doneWhen: { trigger: "a3_t_squad_east" } },
    { id: "a3_o7", text: "东头合围", doneWhen: { trigger: "a3_t_strike" } },
    { id: "a3_o8", text: "带全村爬出黑风口", doneWhen: { atExit: true } },
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
