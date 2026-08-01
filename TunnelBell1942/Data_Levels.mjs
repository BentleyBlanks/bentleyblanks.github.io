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
    // 村底下的地道网。地板从 -3.8 沉到 -4.5，净空因此从 1.20 变成 1.90：**站得直**。
    // 改过一次，理由是量出来的：原来第一幕机器人有 47 秒是被几何逼着猫腰走的，
    // 其中 35 秒发生在这三条支道里——地表的矮墙只占 12 秒。
    // 猫腰 1.75 m/s，站着走 3.3 m/s；地道原来又矮又慢，"钻地道绕过去"就是纯亏，
    // 于是玩家只会硬着头皮走地面矮墙，两边都在挨罚。
    // 现在反过来：矮墙（33–41 / 68–74 / 84–96）仍然逼你猫腰，但每一段的正下方
    // 都有一条站得直的地道——**猫腰从惩罚变成了选项，地道从走廊变成了收益**。
    { id: "a1_f_t1", x0: 30, x1: 48, y: -4.5, kind: "tunnel" },   // 绕开头道院的搜索兵
    { id: "a1_f_t2", x0: 52, x1: 78, y: -4.5, kind: "tunnel" },   // 绕开二道院的兵和哨兵
    { id: "a1_f_t3", x0: 82, x1: 105, y: -4.5, kind: "tunnel" },  // 绕开三道院的兵和军犬
    { id: "a1_f_stub", x0: 121, x1: 128, y: -4.5, kind: "tunnel" },
  ],

  ceils: [
    // 矮土墙一：教猫腰。净空 1.35 → 站不进去，蹲得过。
    { x0: 33, x1: 41, y: 1.35 },
    // 二道院的草棚：地板 y=0.35，净空 1.40。
    { x0: 68, x1: 74, y: 1.75 },
    // 三道院的长矮墙：军犬段全程猫腰。净空 1.30。
    { x0: 84, x1: 96, y: 1.30 },
    // 三条支道的净空：-2.60 - (-4.5) = 1.90，站得直（HEADROOM.standNeeds = 1.78）。
    { x0: 30, x1: 48, y: -2.60 },
    { x0: 52, x1: 78, y: -2.60 },
    { x0: 82, x1: 105, y: -2.60 },
    // 出口下的地道存根：同样 1.90。
    { x0: 121, x1: 128, y: -2.60 },
  ],

  shafts: [
    { id: "a1_s_t1w", x: 31.5, yTop: 0,    yBottom: -4.5, kind: "ladder", requiresHatch: "a1_h_t1w" },
    { id: "a1_s_t1e", x: 47.2, yTop: 0,    yBottom: -4.5, kind: "ladder", requiresHatch: "a1_h_t1e" },
    { id: "a1_s_t2w", x: 52.5, yTop: 0.35, yBottom: -4.5, kind: "ladder", requiresHatch: "a1_h_t2w" },
    { id: "a1_s_t2e", x: 76.5, yTop: 0.35, yBottom: -4.5, kind: "ladder", requiresHatch: "a1_h_t2e" },
    { id: "a1_s_t3w", x: 82.5, yTop: 0,    yBottom: -4.5, kind: "ladder", requiresHatch: "a1_h_t3w" },
    { id: "a1_s_t3e", x: 104.5, yTop: 0,   yBottom: -4.5, kind: "ladder", requiresHatch: "a1_h_t3e" },
    { id: "a1_s_exit", x: 125, yTop: 0, yBottom: -4.5, kind: "ladder", requiresHatch: "a1_h_exit" },
  ],

  hatches: [
    { id: "a1_h_t1w", x: 31.5, shaftId: "a1_s_t1w", hidden: false, opened: false, revealBy: null, label: "炕底下的口", propId: "a1_pr_h_t1w" },
    { id: "a1_h_t1e", x: 47.2, shaftId: "a1_s_t1e", hidden: false, opened: false, revealBy: null, label: "灶台底下的口", propId: "a1_pr_h_t1e" },
    { id: "a1_h_t2w", x: 52.5, shaftId: "a1_s_t2w", hidden: false, opened: false, revealBy: null, label: "灶台底下的口", propId: "a1_pr_h_t2w" },
    { id: "a1_h_t2e", x: 76.5, shaftId: "a1_s_t2e", hidden: false, opened: false, revealBy: null, label: "炕底下的口", propId: "a1_pr_h_t2e" },
    { id: "a1_h_t3w", x: 82.5, shaftId: "a1_s_t3w", hidden: false, opened: false, revealBy: null, label: "炕底下的口", propId: "a1_pr_h_t3w" },
    { id: "a1_h_t3e", x: 104.5, shaftId: "a1_s_t3e", hidden: false, opened: false, revealBy: null, label: "碾盘底下的口", propId: "a1_pr_h_t3e" },
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

  // —— 挖掘（契约 0.0.2）——
  // 地道不是本来就有的，是一锨一锨挖出来的，而且是边打边挖、现挖现连。
  // 第一幕只教两件事，一正一反：
  //   a1_dig_yard12 —— 头道院的支道（30–48）和二道院的支道（52–78）之间隔着 4 米土。
  //     刨开它，两个院子底下就连成一条，往后走这一段再不用上地面。
  //     这是全作第一次让玩家明白：地道的形状是可以自己改的。
  //   a1_dig_yard23 —— 紧接着的下一处（78–82）长得一模一样，却是三道院的砖基。
  //     刨不动。「哪儿能挖」本身就是一种知识，不是随便哪面土墙都行。
  //     所以 78→82 仍然只能从地面绕（水缸 79 / 驴槽 81 那条掩体链），难度不掉。
  // 代价的第三层是土：挖出来的土堆在原地就是证据，得背到二道院的场院上摊掉。
  // 本幕只给一个倒土点，从挖点爬上去、过 50.6 的院门、走到 56.5 —— 那段路就是这一课的另一半。
  // 封锁段（x > 104）一处挖点都没有：钟响之后的合围是叙事必然，不许被绕过。
  digSpots: [
    {
      id: "a1_dig_yard12", x: 48.0, y: -4.5, dir: "right",
      toX: 52.3, toY: -4.5, sec: 3.2, spoil: 1, soft: true,
      label: "往东掏 —— 那头就是二道院的支道",
    },
    {
      id: "a1_dig_yard23", x: 77.6, y: -4.5, dir: "right",
      toX: 82.3, toY: -4.5, sec: 5.0, spoil: 2, soft: false,
      label: "三道院的砖基 —— 刨不动",
    },
  ],
  spoilSinks: [
    { id: "a1_sink_yard2", x: 56.5, y: 0.35, capacity: 4, label: "二道院的场院 —— 把新土摊开" },
    // ★ 改过一次，理由是量出来的：原来这一幕只有场院（56.5，**地表**）一个倒土点，
    //   而 a1_dig_yard12 的全部价值恰恰是"不用上地表那一趟"。
    //   于是挖完为了倒土还得爬上去、走过两个哨兵的院子、再爬下来 ——
    //   挖的收益被倒土的代价整个吃掉，玩法 Agent 实测三幕八个软挖点机器人一次都没走过。
    //   把倒土点摆进地道里（就在挖点和铁锨中间），这一处才第一次变成"挖比绕划算"。
    { id: "a1_sink_t1", x: 45, y: -4.5, capacity: 4, label: "塌了的旧窖 —— 土填进去" },
  ],

  props: [
    // —— 起点：无威胁直路，远景是钟 ——
    { id: "a1_pr_sign", x: 6, y: 0, z: PLAY, kind: "sign", facing: 1, interact: "read", data: { codexId: "codex_zhuanyi" }, label: "村口木牌" },
    { id: "a1_pr_gate0", x: 9.4, y: 0, z: PLAY, kind: "gate", facing: 1, interact: "none", data: null, label: "院门" },
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
    // —— 地道口。不藏、不需要解锁：这是高老忠的知识，不是他的战利品 ——
    { id: "a1_pr_h_t1w", x: 31.5, y: 0, z: PLAY, kind: "kang", facing: 1, interact: "hatch", data: { hatchId: "a1_h_t1w" }, label: "炕底下的口" },
    { id: "a1_pr_h_t1e", x: 47.2, y: -4.5, z: PLAY, kind: "trapdoor", facing: 1, interact: "hatch", data: { hatchId: "a1_h_t1e" }, label: "翻口 —— 顶出去是灶台底下" },
    { id: "a1_pr_h_t2w", x: 52.5, y: 0.35, z: PLAY, kind: "stove", facing: 1, interact: "hatch", data: { hatchId: "a1_h_t2w" }, label: "灶台底下的口" },
    { id: "a1_pr_h_t2e", x: 76.5, y: -4.5, z: PLAY, kind: "trapdoor", facing: 1, interact: "hatch", data: { hatchId: "a1_h_t2e" }, label: "翻口 —— 顶出去是炕底下" },
    { id: "a1_pr_h_t3w", x: 82.5, y: 0, z: PLAY, kind: "kang", facing: 1, interact: "hatch", data: { hatchId: "a1_h_t3w" }, label: "炕底下的口" },
    { id: "a1_pr_h_t3e", x: 104.5, y: -4.5, z: PLAY, kind: "trapdoor", facing: 1, interact: "hatch", data: { hatchId: "a1_h_t3e" }, label: "翻口 —— 顶出去是碾盘底下" },
    // —— 引：在地道里敲通气孔，声音从街面出去，把巡逻调到西头，
    //    玩家从东头的口冒出来。这就是"从敌人脚底下过、从他背后出来" ——
    { id: "a1_pr_lure_t1", x: 33, y: -4.5, z: PLAY, kind: "vent", facing: 1, interact: "lure", data: { radius: 11, panels: [] }, label: "敲通气孔 —— 把人引到这头" },
    { id: "a1_pr_lure_t2", x: 55, y: -4.5, z: PLAY, kind: "vent", facing: 1, interact: "lure", data: { radius: 12, panels: [] }, label: "敲通气孔 —— 把人引到这头" },
    { id: "a1_pr_lure_t3", x: 85, y: -4.5, z: PLAY, kind: "vent", facing: 1, interact: "lure", data: { radius: 12, panels: [] }, label: "敲通气孔 —— 把人引到这头" },
    { id: "a1_pr_v_t1", x: 33, y: -2.6, z: PLAY, kind: "vent", facing: 1, interact: "none", data: null, label: null },
    { id: "a1_pr_v_t2", x: 55, y: -2.6, z: PLAY, kind: "vent", facing: 1, interact: "none", data: null, label: null },
    { id: "a1_pr_v_t3", x: 85, y: -2.6, z: PLAY, kind: "vent", facing: 1, interact: "none", data: null, label: null },
    { id: "a1_pr_v_t1b", x: 44, y: -2.6, z: PLAY, kind: "vent", facing: 1, interact: "none", data: null, label: null },
    { id: "a1_pr_v_t2b", x: 70, y: -2.6, z: PLAY, kind: "vent", facing: 1, interact: "none", data: null, label: null },
    { id: "a1_pr_v_t3b", x: 99, y: -2.6, z: PLAY, kind: "vent", facing: 1, interact: "none", data: null, label: null },
    // —— 地道里的生活痕迹：这不是空管子，是全村藏东西的地方 ——
    { id: "a1_pr_crock_t1", x: 40, y: -4.5, z: PLAY, kind: "crock", facing: 1, interact: "none", data: null, label: null },
    { id: "a1_pr_beam_t1", x: 36, y: -4.5, z: PLAY, kind: "prop_beam", facing: 1, interact: "none", data: null, label: null },
    { id: "a1_pr_crock_t2", x: 62, y: -4.5, z: PLAY, kind: "crock", facing: 1, interact: "none", data: null, label: null },
    { id: "a1_pr_beam_t2", x: 68, y: -4.5, z: PLAY, kind: "prop_beam", facing: 1, interact: "none", data: null, label: null },
    { id: "a1_pr_crock_t3", x: 92, y: -4.5, z: PLAY, kind: "crock", facing: 1, interact: "none", data: null, label: null },
    { id: "a1_pr_beam_t3", x: 97, y: -4.5, z: PLAY, kind: "prop_beam", facing: 1, interact: "none", data: null, label: null },
    // —— 封：放倒院墙，把巡逻线掐断。切的是敌人的路——玩家脚底下永远还有地道 ——
    { id: "a1_pr_block_y2", x: 64, y: 0.35, z: PLAY, kind: "wall", facing: 1, interact: "block", data: { channel: "blockYard2", panels: [] }, label: "推倒这堵院墙" },
    { id: "a1_pr_block_y3", x: 100, y: 0, z: PLAY, kind: "wall", facing: 1, interact: "block", data: { channel: "blockYard3", panels: [] }, label: "推倒这堵院墙" },
    { id: "a1_pr_millstone", x: 125, y: 0, z: PLAY, kind: "millstone", facing: 1, interact: "hatch", data: { hatchId: "a1_h_exit" }, label: "碾盘下的地道口" },
    // —— 挖：铁锨靠在土壁上（民兵挖地道的家伙，本来就该在地道里）。
    //    没锨也能用手刨，慢一倍、更响 —— 这是取舍，不是关卡门槛。
    { id: "a1_pr_shovel", x: 43, y: -4.5, z: PLAY, kind: "crock", facing: 1, interact: "pickup", data: { item: "shovel" }, label: "靠在土壁上的铁锨" },
    // 软土面（能刨开）用 chokepoint 的形，硬面（砖基/石头）用 wall 的形 ——
    // 玩家必须一眼看得出哪面能动，这是"哪儿能挖"这条知识的载体。
    { id: "a1_pr_dig_yard12", x: 48.0, y: -4.5, z: PLAY, kind: "chokepoint", facing: 1, interact: "dig",
      data: { digSpotId: "a1_dig_yard12", panels: [] }, label: "往东掏 —— 那头就是二道院的支道" },
    { id: "a1_pr_dig_yard23", x: 77.6, y: -4.5, z: PLAY, kind: "wall", facing: 1, interact: "dig",
      data: { digSpotId: "a1_dig_yard23", panels: [] }, label: "三道院的砖基 —— 刨不动" },
    { id: "a1_pr_sink_yard2", x: 56.5, y: 0.35, z: PLAY, kind: "millstone", facing: 1, interact: "dumpSpoil",
      data: { sinkId: "a1_sink_yard2", panels: [] }, label: "把土摊到场院上" },
    { id: "a1_pr_sink_t1", x: 45, y: -4.5, z: PLAY, kind: "crock", facing: 1, interact: "dumpSpoil",
      data: { sinkId: "a1_sink_t1", panels: [] }, label: "把土填进旧窖" },
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
      emit: { panels: [], reveal: [], arm: [], spawn: [], objective: "照例查一遍各家的门", checkpoint: false, win: false } },
    // 狗不叫了。目标在这儿换档，把玩家从"例行公事"推向"出事了"。
    { id: "a1_t_quiet", x0: 11, x1: 14, yMin: -1, yMax: 4, once: true,
      emit: { panels: [], reveal: [], arm: [], spawn: [], objective: "狗不叫了 —— 到村口看看", checkpoint: false, win: false } },
    { id: "a1_t_intrude", x0: 20, x1: 23, yMin: -1, yMax: 4, once: true,
      emit: { panels: [], reveal: [], arm: [], spawn: [], cutscene: "a1_cs_intrude", objective: "鬼子摸进村了 —— 去敲老槐树上的钟", checkpoint: true, win: false } },
    { id: "a1_t_corpse", x0: 24, x1: 27.5, yMin: -1, yMax: 4, once: true,
      emit: { panels: [], reveal: [], arm: [], spawn: [], objective: "别出声。贴着墙根走", checkpoint: true, win: false } },
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
    { id: "a1_sh_open", x0: 3, x1: 16, viewHeight: 12.6, lift: 2.4, anchorX: null, ease: 1.4,
      reason: "村子还睡着：拉开留出天和各家的门，先让玩家认这条他走了半辈子的路" },
    { id: "a1_sh_bellfar", x0: 16, x1: 20, viewHeight: 13.0, lift: 2.6, anchorX: 18, ease: 1.6,
      reason: "序幕之后再看一眼那口钟：镜头钉住，他走进画面，远景层的老槐树在另一头等着 —— 这一眼是后面敲钟的全部意义" },
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
    // 序幕。顺序是电影式的：地方与时间 → 你是谁 → 规矩 → 不对劲。
    // 敌人一个都不出现——那句"悄悄地进村"要留到玩家已经知道钟意味着什么之后，
    // 它才是转折，而不是开场。身份不用旁白介绍，用动作立：查院门、听动静、
    // 走一条他闭着眼都认得的路，最后照例抬头看一眼那口钟。
    a1_cs_open: {
      id: "a1_cs_open", letterbox: "full", skippable: true,
      steps: [
        // 1) 地方与时间：拉到最开，先让村子睡着
        { kind: "camera", to: { x: 10, y: 3.4, viewHeight: 15.0 }, sec: 0.01, ease: "inOut" },
        { kind: "fade", to: 0, sec: 1.8 },
        { kind: "wait", sec: 0.6 },
        { kind: "panel", id: "a1_cs_open_p1" },
        { kind: "camera", to: { x: 15, y: 3.2, viewHeight: 14.0 }, sec: 3.2, ease: "inOut" },
        // 2) 你是谁：推到他身上，看他查院门——身份是动作立起来的
        { kind: "camera", to: { x: 7.5, y: 1.8, viewHeight: 7.4 }, sec: 2.4, ease: "inOut" },
        { kind: "actor", id: "player", to: { x: 7.6 }, sec: 1.8, anim: "walk", facing: 1 },
        { kind: "sfx", id: "cloth" },
        { kind: "actor", id: "player", to: { x: 9.2 }, sec: 1.6, anim: "walk", facing: 1 },
        { kind: "sfx", id: "hatch_open" },
        { kind: "panel", id: "a1_p1" },
        // 3) 规矩：定镜头。镜头钉住不动，他从左边走进画面，
        //    远景层那棵老槐树和树上的钟在画面另一头等着——他每夜都要看这一眼。
        { kind: "camera", to: { x: 19, y: 2.6, viewHeight: 13.0 }, sec: 2.2, ease: "inOut" },
        { kind: "actor", id: "player", to: { x: 16.8 }, sec: 3.0, anim: "walk", facing: 1 },
        { kind: "panel", id: "a1_p2" },
        { kind: "wait", sec: 0.6 },
        // 4) 不对劲：狗不叫了。转折点，但威胁还没露面。
        { kind: "sfx", id: "dog" },
        { kind: "wait", sec: 0.5 },
        { kind: "camera", to: { x: 17.5, y: 1.9, viewHeight: 8.6 }, sec: 1.6, ease: "inOut" },
        { kind: "wait", sec: 0.9 },
        // 交还镜头，玩家接手走这段熟路
        { kind: "actor", id: "player", to: { x: 6 }, sec: 0.01, anim: "idle", facing: 1 },
        { kind: "camera", to: { x: 6, y: 1.6, viewHeight: 11.5 }, sec: 1.2, ease: "inOut" },
      ],
    },
    // 威胁。玩家已经走过一段熟路、已经知道钟是干什么的——
    // 现在才切回村西门：他们是**从他背后**摸进来的。
    // 镜头调度原样保留（摇 → 推到 vh 6.0 → 拉到 vh 13.0），只是位置往后挪。
    a1_cs_intrude: {
      id: "a1_cs_intrude", letterbox: "full", skippable: true,
      steps: [
        { kind: "camera", to: { x: 6, y: 2.2, viewHeight: 9.0 }, sec: 0.01, ease: "inOut" },
        { kind: "fade", to: 0, sec: 1.6 },
        { kind: "wait", sec: 0.4 },
        { kind: "sfx", id: "boot" },
        { kind: "actor", id: "a1_e_tang", to: { x: 9 }, sec: 1.9, anim: "sneak", facing: 1 },
        { kind: "actor", id: "a1_e_blocker", to: { x: 6.6 }, sec: 2.1, anim: "sneak", facing: 1 },
        { kind: "camera", to: { x: 11, y: 2.0, viewHeight: 8.4 }, sec: 2.6, ease: "inOut" },
        { kind: "panel", id: "a1_brief1" },
        { kind: "actor", id: "a1_e_tang", to: { x: 12 }, sec: 1.2, anim: "walk", facing: 1 },
        { kind: "wait", sec: 0.4 },
        { kind: "camera", to: { x: 8.2, y: 1.8, viewHeight: 6.0 }, sec: 2.0, ease: "inOut" },
        // 镜头停死在这个近景上，先空一秒再让他开口——
        // 那句话的杀伤力有一半来自两边的空白，只留一边就成了段子。
        { kind: "wait", sec: 1.0 },
        { kind: "panel", id: "a1_cs_open_p2" },
        { kind: "panel", id: "a1_cs_open_p3" },
        { kind: "wait", sec: 0.4 },
        { kind: "camera", to: { x: 10.5, y: 1.8, viewHeight: 6.6 }, sec: 1.4, ease: "inOut" },
        { kind: "panel", id: "a1_tang3" },
        { kind: "actor", id: "a1_e_tang", to: { x: 13.6 }, sec: 1.4, anim: "walk", facing: 1 },
        { kind: "panel", id: "a1_tang4" },
        { kind: "wait", sec: 0.3 },
        { kind: "sfx", id: "cloth" },
        { kind: "actor", id: "a1_e_chase1", to: { x: 17 }, sec: 1.5, anim: "sneak", facing: 1 },
        { kind: "actor", id: "a1_e_chase3", to: { x: 14 }, sec: 1.5, anim: "sneak", facing: 1 },
        { kind: "camera", to: { x: 20, y: 3.0, viewHeight: 13.0 }, sec: 3.0, ease: "inOut" },
        // 命令之后的那片静：队列无声散开。这是那句台词的另一半。
        { kind: "panel", id: "a1_cs_open_p4" },
        { kind: "wait", sec: 0.4 },
        { kind: "fade", to: 1, sec: 1.0 },
        { kind: "actor", id: "a1_e_tang", to: { x: 121 }, sec: 0.01, anim: "idle", facing: -1 },
        { kind: "actor", id: "a1_e_blocker", to: { x: 125 }, sec: 0.01, anim: "idle", facing: 1 },
        { kind: "actor", id: "a1_e_chase1", to: { x: 85 }, sec: 0.01, anim: "idle", facing: 1 },
        { kind: "actor", id: "a1_e_chase3", to: { x: 7 }, sec: 0.01, anim: "idle", facing: 1 },
        { kind: "camera", to: { x: 4, y: 1.6, viewHeight: 11.5 }, sec: 0.01, ease: "inOut" },
        { kind: "fade", to: 0, sec: 1.0 },
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
    { id: "a1_o1", text: "照例查一遍各家的门", doneWhen: { trigger: "a1_t_quiet" } },
    { id: "a1_o1b", text: "狗不叫了 —— 到村口看看", doneWhen: { trigger: "a1_t_intrude" } },
    { id: "a1_o2", text: "绕过搜村的鬼子", doneWhen: { trigger: "a1_t_yard2clear" } },
    { id: "a1_o3", text: "到老槐树下", doneWhen: { trigger: "a1_t_tree" } },
    { id: "a1_o4", text: "敲响钟", doneWhen: { propUsed: "a1_pr_bell" } },
    { id: "a1_o5", text: "跑向碾盘下的地道口", doneWhen: { atExit: true } },
  ],
};

// ===========================================================================
// 第 2 幕 「翻口」 —— 高传宝 / 纯地下 / 约 148 米 / 4–5 分钟
// ---------------------------------------------------------------------------
// 改过一次，理由是量出来的。旧版本的第二幕：4 个敌人全在地表 y=0，
// 而这一幕 216 米是地道、只有 65 米是地表。机器人跑完 10693 帧、583 米，
// **零次敌人接触，最高警觉 0.07** —— 玩起来就是「走路 + 偶尔按一下 E」。
// 三条根因，全部修掉：
//   1) 敌人不下地道。第三幕早就把兵放到 y=-8 了，第二幕缺的正是这个过渡。
//      现在有三个：a2_e_inside（浅层 s2）、a2_e_pit（干线 d3）、a2_e_deep（干线 d4）。
//      三个都由触发区 spawn —— 他们是**后来摸下来的**，不是一开场就在。
//      「地道原来是安全的，现在不是了」这条弧线要玩家亲眼看见才成立。
//   2) 两个 lure 点在数学上是死的。radius 12 摆在 y=-8，敌人在 y=0：
//      跨层穿土衰减 ×1.9 → dy=15.2，15.2² = 231 > 12² = 144，永远不进半径。
//      引点从此一律摆在「离目标那一层 ≤ 4.2 米」的地方（4.2×1.9 = 7.98，够得着）。
//   3) 危害武装点离得太远。a2_hz_water 原来挂在 a2_t_lantern（x 11–14），
//      玩家刚捡起马灯，96 米外的水就武装了，叙事上完全脱节。改挂 a2_t_flood（x 76–80）。
//
// 「三通」在几何上落实：
//   高低相通 —— 干线 y=-8.0（净空 1.82，站得直）与藏身洞 y=-3.8（净空 1.20，猫腰）
//               之间 8 处竖井，4 组"上去 + 下来"的回路，没有一条支线是断头路。
//   内外相通 —— 干线一路通到 x=148 的村外枯井底，本幕出口就在那儿。
//   街道相通 —— s4 (x 114–138) 横穿两个院子的地下，正上方是 a2_f_top2 的街面，
//               x 116–126 净空只有 0.85（必须爬行，兵跟不进来）。
//
// ★ 干线天花板为什么是 -6.18 而不是 -6.22：
//   -6.22 - (-8.0) 在 IEEE754 下等于 1.7800000000000002，而 standNeeds = 1.78，
//   判定是 `clearance < standNeeds` → 恰好 false。**整条 148 米干线能站着走，
//   靠的是 2.2e-16 的浮点余量。** 谁把它写成 -6.2200000000000005，全线立刻猫腰。
//   -6.18 给出 1.82（余量 0.04），这是一个有意的安全边距，别调回去。
//
// ★ 通气孔的规则（跨层刺刀只在有孔的地方能捅下来）：
//   每一个 probeAt 的 x 上必须有 kind:"vent" 的道具，而且**每一层受害的地板上方
//   都要有一个**（浅层看 -2.60/-2.95，干线看 -6.18）。玩家看得见那个孔，
//   才谈得上"别停在通气孔底下"。同一批孔也是 NearVent 的听觉通路：
//   通气孔 = 他听得见你 + 刺刀下得来，一条规则两头用。
//
// 教学顺序：x6–11 矮段猫腰 → x12 捡马灯 → x20/33.5 认通气孔（头顶没人，安全）
//           → x30 竖井 → x50 翻口 → 三段解谜 → 枯井。
// a2_f_top1 / a2_f_top2 是地表街面，只给 probeAt 敌人站，玩家到不了（无竖井相连）。
//
// ─────────────── 三段解谜链（每段至少两条解法，且都不是"走过去按 E"）───────────────
//
// 链一「s2 里下来了一个」 x 44–68 —— **lure + knockout，必须组合**
//   障碍：二嫂在 x=58.5 的藏身洞里，a2_e_inside 的巡逻线 53–62 正压在她身上。
//         s2 净空 1.20，玩家只能猫腰 1.75 m/s，他搜索时 1.67 m/s —— 正面撞上跑不掉。
//   解法 A（藏）：从翻口上来，钻 x=48 或 x=55 的被褥堆，等他走到东端转身。
//   解法 B（引 + 敲晕）：在**干线** x=47 的通气孔敲一下（r=13，跨 4.2 米土够到浅层 ±10.2 米）
//         → 他离开巡逻区走到浅层 47，停在略偏东处、**面朝西**
//           （EnemySearch 停在 |goal-e.x| ≤ 0.35，从东边过来就停在点东侧，脸朝行进方向）
//         → 玩家在井底等他过去，再从 x=50 的翻口爬上来 —— 落点在他背后 3 米
//         → 走到 48.4（|dx|=1.4 ≤ KO_REACH_X 1.55）→ 从背后制服。
//         地表两个兵隔着 3.8 米土，KnockoutWitness 对 |Δy| > 2.6 的人直接跳过，不算目击者。
//         **单独引只换来 5.6 秒；单独摸够不着（他一直在走，BOT_STALK_RANGE 只有 4.2 米）。
//         必须先用引把他钉住，再用翻口绕到他背后 —— 这就是契约 0.0.1 那条闭环。**
//   解法 C（封）：等他走到东端，在 x=60 放倒支撑木，把他关在 60–62 那三米里。
//   代价：头顶 45 / 56 / 62 三个刺刀落点，停在通气孔底下就是死。
//
// 链二「西院把水放下来了」 x 76–114 —— **拉闸 vs 掏洞，选择有后果**
//   障碍：走到干线 76–80 触发 a2_t_flood，水从水道灌进来，干线 100–112 淹掉；
//         同时 a2_t_elder 唤出 a2_e_pit（干线 89–97 的哨兵），水道闸 94.5 就在他巡逻区正中。
//   解法 A（等窗口 + 拉闸）：上 s3 拿铁锨（93.5）→ 下到 94.5 拉闸。要自己找空窗。
//   解法 B（引 → 拉闸，或者引 → 敲晕 → 拉闸）：在 s3 x=89.5 敲通气孔（r=12，够到干线 80.5–98.5）
//         → 他走到干线 89.5 面朝西 → 玩家从 x=98 的绳降到干线，落在他背后 8 米
//         → 要么直接摸到 94.5 拉闸（他背对着，看不见），要么走到 90.9 把他制服。
//   解法 C（挖 + 倒土）：掏开 s3 东头老砖窑的窑壁（99.8 → 114.2），
//         上层从 84 直通 138，整段灌水段和 a2_e_pit 都不用碰。
//         代价见 digSpots 里那条注释 —— 8 秒、4 筐土、必然跑两趟。
//   **但王大娘(20)、栓柱(82)、四爷(84) 三个人 canClimb:false，上不了 s3。
//     exit.needAllVillagers = true，所以要带他们走，闸**必须**拉。
//     C 是玩家自己的捷径（先过去把渗水口堵上），不是通关的替代路线。**
//
// 链三「东头的卡口」 x 112–148 —— **藏 / 引+敲晕 / 挖竖井绕**
//   障碍：a2_e_deep（干线 120–130）挡在乡亲和枯井中间。干线是三个不会爬的人唯一的路。
//   解法 A（藏 + 等）：钻 x=118.5 的炕洞，等他走到东端 130 再动。带着全队也走得通。
//   解法 B（引 + 藏 + 敲晕）：在干线 x=116 敲通气孔（同层，r=12 → 够到 104–128）
//         → **立刻钻进 2.5 米外 118.5 的炕洞** → 听着靴子从脸前面走过去
//         → 他停在 116 略偏东、面朝西 → 玩家从炕洞出来，走到 117.4 → 从背后制服。
//         （这条链的引点和藏点是配对设计的：s4 的爬行段 116–126 要 7.7 秒，
//           任何绕上层的回路都超过 lureHold 的 5.6 秒窗口 —— 实测过，走不通。
//           所以链三的循环整个压在干线上，用"藏"代替"绕"。）
//   解法 C（竖井型挖点，玩法 Agent 确认安全）：从 x=114 的梯子上 s4，爬过 116–126 的街道底下，
//         走到 s4 东头 x=135 往下掏一口新井 → 落在干线 135，他巡逻区外 5 米。
//         只对玩家自己有效（老小爬不了新井），是"先过去堵渗水口、再回来接人"的路。
//   收尾（封）：x=133 的支撑木放倒，把他关在西边，枯井底点人头的时候他摸不过来。
//         a2_brief1 那句「卡口就是把道掐细……堵上一块石头，后头的就跟不上来」
//         到这儿第一次有玩法支撑。
// ===========================================================================
const act2 = {
  id: "act2",
  chapterId: "act2",
  title: "翻口",
  actor: "chuanbao",
  bounds: { x0: 0, x1: 152, yTop: 3, yBottom: -11 },
  startX: 4,
  startY: -8.0,
  exit: { x: 145, y: -8.0, radius: 4.5, needAllVillagers: true, label: "村外枯井底" },
  timeOfDay: "night",

  floors: [
    // 深层干线 y = -8.0，四段首尾相接，一路通到村外枯井底。
    { id: "a2_f_d1", x0: 0, x1: 44, y: -8.0, kind: "tunnel" },
    { id: "a2_f_d2", x0: 44, x1: 76, y: -8.0, kind: "tunnel" },
    { id: "a2_f_d3", x0: 76, x1: 112, y: -8.0, kind: "tunnel" },
    { id: "a2_f_d4", x0: 112, x1: 148, y: -8.0, kind: "tunnel" },
    // 浅层藏身洞 y = -3.8，四条互不相连的支线，各自靠两口竖井接回干线。
    { id: "a2_f_s1", x0: 26, x1: 40, y: -3.8, kind: "tunnel" },
    { id: "a2_f_s2", x0: 46, x1: 68, y: -3.8, kind: "tunnel" },
    { id: "a2_f_s3", x0: 84, x1: 100, y: -3.8, kind: "tunnel" },
    { id: "a2_f_s4", x0: 114, x1: 138, y: -3.8, kind: "tunnel" },
    // 老砖窑的窑膛：一个**封死的**砖窑内腔，两头都不通，得掏进去。
    // 它的存在是为了让"两头对挖"的两条挖点各自有个真实的落脚点 ——
    // 挖点的落点如果悬在半空，寻路根本不会认这条边（实测：s3e 和 s4w 原来在 x=107 会合，
    // 而 107 在两条都挖通之前没有地板，于是两条边谁也进不了导航图）。
    { id: "a2_f_kiln", x0: 104.5, x1: 109.5, y: -3.8, kind: "tunnel" },
    // 地表街面：只承载头顶捅刺刀的敌人，玩家无法抵达（有意为之）。
    { id: "a2_f_top1", x0: 40, x1: 66, y: 0, kind: "dirt" },
    { id: "a2_f_top2", x0: 110, x1: 138, y: 0, kind: "dirt" },
    // 村外井台。枯井绳梯的上端落在这儿。
    { id: "a2_f_out", x0: 141, x1: 152, y: 0, kind: "dirt" },
  ],

  ceils: [
    // —— 干线：净空 1.82（见文件头 ★ 那条浮点说明，别改回 -6.22）——
    { x0: 0, x1: 6, y: -6.18 },
    { x0: 6, x1: 11, y: -6.65 },      // 1.35 —— 开场那段矮道，教猫腰
    { x0: 11, x1: 44, y: -6.18 },
    { x0: 44, x1: 76, y: -6.18 },
    { x0: 76, x1: 92, y: -6.18 },
    { x0: 92, x1: 100, y: -6.75 },    // 1.25 —— 中间一段窄，必须猫腰。
                                      //   原来是 -6.90（净空 1.10），离 crouchNeeds 1.05
                                      //   只差 0.05：王大娘/四爷 canCrawl:false，
                                      //   谁把这个数再动一点点，两位老人就永久卡在这儿。
    { x0: 100, x1: 112, y: -6.18 },
    { x0: 112, x1: 148, y: -6.18 },
    // —— 藏身洞：净空 1.20，全程猫腰 ——
    { x0: 26, x1: 40, y: -2.60 },
    { x0: 46, x1: 68, y: -2.60 },
    { x0: 84, x1: 100, y: -2.60 },
    { x0: 104.5, x1: 109.5, y: -2.60 },   // 窑膛：净空 1.20
    { x0: 114, x1: 116, y: -2.60 },
    // 街道正下方：净空 0.85，必须爬行。**兵跟不进来**——
    // MoveEnemy 按 "crouch" 判定，crouchNeeds 是 1.05。这是玩家身板小带来的地形优势，
    // 也是「地道是武器」最朴素的一条：同一个洞，他过不去，你过得去。
    { x0: 116, x1: 126, y: -2.95 },
    { x0: 126, x1: 138, y: -2.60 },
  ],

  shafts: [
    { id: "a2_sh_a", x: 30, yTop: -3.8, yBottom: -8.0, kind: "ladder", requiresHatch: null },
    { id: "a2_sh_b", x: 38, yTop: -3.8, yBottom: -8.0, kind: "dirt", requiresHatch: null },
    // 翻口：从下往上顶开的那口。链一的解法 B 全靠它——从他脚底下冒出来。
    { id: "a2_sh_c", x: 50, yTop: -3.8, yBottom: -8.0, kind: "ladder", requiresHatch: "a2_h_fanko" },
    { id: "a2_sh_d", x: 65, yTop: -3.8, yBottom: -8.0, kind: "dirt", requiresHatch: null },
    { id: "a2_sh_e", x: 88, yTop: -3.8, yBottom: -8.0, kind: "ladder", requiresHatch: null },
    { id: "a2_sh_f", x: 98, yTop: -3.8, yBottom: -8.0, kind: "rope", requiresHatch: null },
    // g 挪到 114（原来 120）：要让玩家能在 a2_e_deep 的巡逻区（120–130）**西边**上下，
    // 否则每次进出 s4 都得从他头顶正上方钻，那不是潜行是掷骰子。
    { id: "a2_sh_g", x: 114, yTop: -3.8, yBottom: -8.0, kind: "ladder", requiresHatch: null },
    { id: "a2_sh_h", x: 128, yTop: -3.8, yBottom: -8.0, kind: "ladder", requiresHatch: null },
    // 枯井：井底就是本幕出口，绳子通到村外井台。
    { id: "a2_sh_well", x: 145, yTop: 0, yBottom: -8.0, kind: "rope", requiresHatch: "a2_h_well" },
  ],

  hatches: [
    { id: "a2_h_fanko", x: 50, shaftId: "a2_sh_c", hidden: false, opened: false, revealBy: null, label: "翻口", propId: "a2_pr_fanko" },
    { id: "a2_h_well", x: 145, shaftId: "a2_sh_well", hidden: true, opened: false, revealBy: "a2_t_wellnear", label: "枯井口", propId: "a2_pr_well" },
  ],

  // —— 挖掘（契约 0.0.2）——
  // 上层四条支道互不相连，这是关卡的骨架，不是缺陷：「高低相通」就是靠它逼出来的。
  // 每一处能挖的地方都是真的拿代价换来的：
  //   a2_dig_s2s1（软，6 米）—— 从 s2 往西掏通 s1。掏通之后 26–68 是一条完整的上层长廊，
  //     秋兰（35）和二嫂（58.5）不用再各自爬一趟竖井。土有近处可倒的地方（s1 的炕洞 36）。
  //   a2_dig_s2s3（软，16 米）—— 从 s2 东头掏到西院支道 s3，换来"街道相通"。
  //   a2_dig_s3e（软，14.4 米）—— 老砖窑的窑壁。**改过一次，这里说清楚为什么。**
  //     原来它是硬的（soft:false），注释写着"这条路必须堵死，否则水道闸这个中心谜题就没有了"。
  //     那条判断是错的，理由有两条：
  //       (1) 只有唯一解的谜题是锁，不是谜题。契约 §0.0 要求"每一段路至少两条走法"。
  //       (2) 水道闸根本没作废：王大娘(20)/栓柱(82)/四爷(84) 三个人 canClimb:false，
  //           上不了 s3，而 exit.needAllVillagers = true —— **要带人走，闸必须拉**。
  //           掏窑壁只是玩家自己的捷径（绕过灌水段和 a2_e_pit 先去堵渗水口），
  //           不是通关的替代路线。
  //     代价加重到 sec 8.0 / spoil 4，三条一起咬：
  //       · SPOIL_CARRY_MAX = 3，4 筐**必然跑两趟**；
  //       · 背土占手（p.carrying = "spoil"），铁锨会被放下 —— 而没锨挖掘 ×2.0 时长、×1.15 音量；
  //       · 背满了照样能挖，土直接堆在洞口，敌人走到 2.6 米内就进搜索并喊人。
  //     也就是说"挖到一半去倒土"本身就是个真实的抉择，不需要再加机制。
  //   a2_dig_s4drop（软，竖井型）—— s4 东头往下掏一口新井，落在干线 135，
  //     a2_e_deep 的巡逻区（120–130）外五米。链三的解法 C。
  //   a2_dig_s4e（硬）—— 枯井的井壁，砖砌的。「哪儿能挖」本身就是一种知识，
  //     不是随便哪面土墙都行；这一幕留这一处反例。
  digSpots: [
    {
      id: "a2_dig_s2s1", x: 46.2, y: -3.8, dir: "left",
      toX: 39.8, toY: -3.8, sec: 4.2, spoil: 2, soft: true,
      label: "往西掏 —— 通秋兰那条支道",
    },
    {
      id: "a2_dig_s2s3", x: 67.8, y: -3.8, dir: "right",
      toX: 84.2, toY: -3.8, sec: 6.0, spoil: 3, soft: true,
      label: "往东掏 —— 通西院支道（头顶就是刺刀）",
    },
    // ★ 为什么是两段而不是一段：关卡侧要不到"更贵的一锨"。
    //   Script_Rules.mjs:421-422 把 sec 夹在 [2.5, 6.0]、spoil 夹在 [1, 3]，
    //   而且是**静默**夹紧 —— 写 sec:8.0 / spoil:4 会被悄悄改成 6.0 / 3，
    //   注释和实际行为当场分家。所以"这一段特别贵"只能靠**段数**表达：
    //   两段各 6.0 秒 3 筐，合计 12 秒 6 筐；SPOIL_CARRY_MAX = 3，六筐必然跑两趟。
    //   而且这样反而更对：真实的地道就是**两头对着挖**的，中间碰头。
    {
      id: "a2_dig_s3e", x: 99.8, y: -3.8, dir: "right",
      toX: 105.0, toY: -3.8, sec: 6.0, spoil: 3, soft: true,
      label: "老砖窑的窑壁 —— 从西头掏进窑膛",
    },
    {
      id: "a2_dig_s4w", x: 118, y: -3.8, dir: "left",
      toX: 109.0, toY: -3.8, sec: 6.0, spoil: 3, soft: true,
      label: "从东头掏进窑膛 —— 两头都掏开就通了",
    },
    {
      id: "a2_dig_s4drop", x: 135, y: -3.8, dir: "down",
      toX: 135, toY: -8.0, sec: 4.0, spoil: 2, soft: true,
      label: "往下掏一口井 —— 落到干线上，绕开他",
    },
    {
      id: "a2_dig_s4e", x: 137.5, y: -3.8, dir: "right",
      toX: 145, toY: -3.8, sec: 6.0, spoil: 3, soft: false,
      label: "枯井的井壁 —— 砖砌的，刨不动",
    },
  ],
  spoilSinks: [
    // 「垫在炕下」是契约 0.0.2 点名的历史做法，也是 s2→s1 那条挖点的近处出口。
    { id: "a2_sink_kang", x: 36, y: -3.8, capacity: 4, label: "炕洞 —— 新土垫到炕底下" },
    { id: "a2_sink_grain", x: 95, y: -3.8, capacity: 6, label: "粮窖 —— 倒进空粮坑" },
    // ★ 倒土点就摆在挖点旁边，这是有意的。实测（玩法 Agent 的米当量）：
    //   挖一段的总代价里，**倒土的一来一回常常是大头（20–55 米）**，
    //   所以"能挖"和"值得挖"是两件事。窑膛里就有地方填土（砖窑本来就是个坑），
    //   两条对挖各 3 筐、走七米就倒掉 —— 这一处是全作第一个"挖比绕划算"的地方。
    { id: "a2_sink_kiln", x: 107, y: -3.8, capacity: 6, label: "窑膛 —— 新土填回窑坑" },
    // s2 的灶膛：a2_dig_s2s1 挖出来的两筐土有个七米内的去处，
    //   否则最近的倒土点在 95（s3），一来一回要过翻口、下干线、再爬一趟竖井。
    { id: "a2_sink_s2", x: 53.5, y: -3.8, capacity: 4, label: "灶膛 —— 土填进灶坑" },
    { id: "a2_sink_well", x: 142, y: -8.0, capacity: 6, label: "枯井底 —— 土往井里倒，谁也看不出来" },
  ],

  props: [
    // —— 干线 d1：开场。点着的马灯就是"看得见的目标" ——
    { id: "a2_pr_beam1", x: 7, y: -8.0, z: PLAY, kind: "prop_beam", facing: 1, interact: "none", data: null, label: null },
    { id: "a2_pr_lantern", x: 12, y: -8.0, z: PLAY, kind: "lantern", facing: 1, interact: "pickup", data: { item: "lantern" }, label: "马灯" },
    { id: "a2_pr_crock1", x: 17, y: -8.0, z: PLAY, kind: "crock", facing: 1, interact: "none", data: null, label: null },
    // 头两个通气孔在没人的地方：先让玩家认清这个形状，再让它变成刺刀落点。
    { id: "a2_pr_vent1", x: 20, y: -6.18, z: PLAY, kind: "vent", facing: 1, interact: "none", data: null, label: null },
    { id: "a2_pr_sign1", x: 21.5, y: -8.0, z: PLAY, kind: "sign", facing: 1, interact: "read", data: { codexId: "codex_santong" }, label: "土墙上刻的字" },
    { id: "a2_pr_beam2", x: 25, y: -8.0, z: PLAY, kind: "prop_beam", facing: 1, interact: "none", data: null, label: null },
    { id: "a2_pr_beam3", x: 33, y: -8.0, z: PLAY, kind: "prop_beam", facing: 1, interact: "none", data: null, label: null },
    { id: "a2_pr_trough_d1", x: 41, y: -8.0, z: PLAY, kind: "trough", facing: 1, interact: "none", data: null, label: null },

    // —— 藏身洞 s1：教"上下两层"。有生活痕迹。 ——
    { id: "a2_pr_beam4", x: 28, y: -3.8, z: PLAY, kind: "prop_beam", facing: 1, interact: "none", data: null, label: null },
    { id: "a2_pr_kang1", x: 32, y: -3.8, z: PLAY, kind: "kang", facing: 1, interact: "hide", data: { capacity: 1 }, label: "被褥堆" },
    { id: "a2_pr_vent2", x: 33.5, y: -2.60, z: PLAY, kind: "vent", facing: 1, interact: "none", data: null, label: null },
    { id: "a2_pr_crock2", x: 34.5, y: -3.8, z: PLAY, kind: "crock", facing: 1, interact: "none", data: null, label: null },
    { id: "a2_pr_sink_kang", x: 36, y: -3.8, z: PLAY, kind: "kang", facing: 1, interact: "dumpSpoil",
      data: { sinkId: "a2_sink_kang", panels: [] }, label: "把土垫到炕底下" },
    { id: "a2_pr_stove_s1", x: 38.5, y: -3.8, z: PLAY, kind: "stove", facing: 1, interact: "none", data: null, label: null },

    // —— 干线 d2：头顶就是街。三个通气孔分别是刺刀落点和引点 ——
    // 45 / 56 / 62 是 probeAt，孔画在干线天花板上（-6.18）和藏身洞天花板上（-2.60），
    // 两层各一个：玩家在哪一层都看得见"这儿有个洞"。
    { id: "a2_pr_beam5", x: 41.5, y: -8.0, z: PLAY, kind: "prop_beam", facing: 1, interact: "none", data: null, label: null },
    { id: "a2_pr_ventp1", x: 43, y: -6.18, z: PLAY, kind: "vent", facing: 1, interact: "none", data: null, label: null },
    // 链一的引点。同层（都在 -8.0）→ 不打折，半径 14 覆盖 32–60，
    // 罩住 a2_e_inside 巡逻区（55–61）除了最东头一米以外的全部。
    // 而往上到街面是 8 米土：8 × 1.9 = 15.2，15.2² = 231 > 14² = 196 ——
    // **叫不动地表的兵**。同一下敲击，本层听得见、上一层听不见，
    // 这正是"穿土衰减 ×1.9"该有的样子（旧版本把引点摆在 -8 却指望叫动 y=0 的人，
    // 数学上一个也叫不动，那两个引点是死的）。
    { id: "a2_pr_lure_s2", x: 46, y: -8.0, z: PLAY, kind: "vent", facing: 1, interact: "lure",
      data: { radius: 14, panels: ["a2_brief3"] }, label: "敲通气孔 —— 把他叫到西头来" },
    // 这个炕洞是给**巡逻状态**的他用的：掩体挡得住路过的一眼，正常等窗口照样管用。
    // 但它**不能跟上面那个引点配着用** —— 这是实测撞出来的，写死在这儿免得下次再踩：
    //   `Script_Rules.mjs:4077` `else if (e.lured) next = "search"` —— 被引的人进的是 search；
    //   而 `UpdateHiding` 对 search 状态的兵在 FLUSH_OUT_REACH = 1.5 米内**直接把人揪出来**，
    //   并把他的警觉抬到 0.92。
    // a2_e_inside 从 55–61 走到引点 46，路上正好从 48.5 这个炕洞和 52.5 的被褥堆身上碾过去。
    // 所以「引」和「藏」在这一幕是**互斥**的两手：**引要配换层**（敲完从 50 的翻口上 s2 避开
    // 他走过来的那一段，等他停在 46 面朝西，再下来落在他背后四米），**藏要配等窗口**。
    // a2_brief3 就挂在那个引点上，当场把这条规矩讲给玩家。
    { id: "a2_pr_kang_d2", x: 48.5, y: -8.0, z: PLAY, kind: "kang", facing: 1, interact: "hide", data: { capacity: 1 }, label: "炕洞" },
    { id: "a2_pr_fanko", x: 50, y: -8.0, z: PLAY, kind: "trapdoor", facing: 1, interact: "hatch", data: { hatchId: "a2_h_fanko" }, label: "翻口" },
    { id: "a2_pr_kang_d2b", x: 52.5, y: -8.0, z: PLAY, kind: "kang", facing: 1, interact: "hide", data: { capacity: 1 }, label: "被褥堆" },
    { id: "a2_pr_kang_d2c", x: 59.5, y: -8.0, z: PLAY, kind: "kang", facing: 1, interact: "hide", data: { capacity: 1 }, label: "炕洞" },
    { id: "a2_pr_kang_d2d", x: 64.5, y: -8.0, z: PLAY, kind: "kang", facing: 1, interact: "hide", data: { capacity: 1 }, label: "被褥堆" },
    { id: "a2_pr_loophole1", x: 58, y: -8.0, z: PLAY, kind: "loophole", facing: 1, interact: "none", data: null, label: "枪眼" },
    { id: "a2_pr_ventp3", x: 55, y: -6.18, z: PLAY, kind: "vent", facing: 1, interact: "none", data: null, label: null },
    { id: "a2_pr_crock3", x: 68, y: -8.0, z: PLAY, kind: "crock", facing: 1, interact: "none", data: null, label: null },
    { id: "a2_pr_stone", x: 70, y: -8.0, z: PLAY, kind: "chokepoint", facing: 1, interact: "push",
      data: { toX: 73.5 }, label: "把这块石头推进卡口" },
    // 从 65 的土井下来之后把这道支撑木放倒，他就跟不到东边来。
    { id: "a2_pr_block_d2", x: 67, y: -8.0, z: PLAY, kind: "chokepoint", facing: 1, interact: "block",
      data: { channel: "blockD2", panels: [] }, label: "放倒支撑木 —— 把他关在西头" },
    { id: "a2_pr_beam6", x: 74, y: -8.0, z: PLAY, kind: "prop_beam", facing: 1, interact: "none", data: null, label: null },

    // —— 藏身洞 s2（链一）：两个被褥堆是掩体，两个通气孔是死亡格，60 的支撑木是"封" ——
    { id: "a2_pr_crock4", x: 46.8, y: -3.8, z: PLAY, kind: "crock", facing: 1, interact: "none", data: null, label: null },
    { id: "a2_pr_kang2", x: 48, y: -3.8, z: PLAY, kind: "kang", facing: 1, interact: "hide", data: { capacity: 1 }, label: "藏身洞" },
    { id: "a2_pr_kang2c", x: 51.5, y: -3.8, z: PLAY, kind: "kang", facing: 1, interact: "hide", data: { capacity: 1 }, label: "被褥堆" },
    { id: "a2_pr_ventp2", x: 55, y: -2.60, z: PLAY, kind: "vent", facing: 1, interact: "none", data: null, label: null },
    { id: "a2_pr_sink_s2", x: 53.5, y: -3.8, z: PLAY, kind: "stove", facing: 1, interact: "dumpSpoil",
      data: { sinkId: "a2_sink_s2", panels: [] }, label: "把土填进灶坑" },
    { id: "a2_pr_kang2b", x: 56.5, y: -3.8, z: PLAY, kind: "kang", facing: 1, interact: "hide", data: { capacity: 1 }, label: "被褥堆" },
    { id: "a2_pr_beam7", x: 62.5, y: -3.8, z: PLAY, kind: "prop_beam", facing: 1, interact: "none", data: null, label: null },
    { id: "a2_pr_kang2d", x: 64, y: -3.8, z: PLAY, kind: "kang", facing: 1, interact: "hide", data: { capacity: 1 }, label: "被褥堆" },

    // —— 干线 d3（链二）——
    { id: "a2_pr_beam8", x: 78, y: -8.0, z: PLAY, kind: "prop_beam", facing: 1, interact: "none", data: null, label: null },
    { id: "a2_pr_sign2", x: 80, y: -8.0, z: PLAY, kind: "sign", facing: 1, interact: "read", data: { codexId: "codex_fanko" }, label: "支撑木上的刻痕" },
    { id: "a2_pr_kang_d3", x: 86.5, y: -8.0, z: PLAY, kind: "kang", facing: 1, interact: "hide", data: { capacity: 1 }, label: "炕洞" },
    { id: "a2_pr_sluice", x: 94.5, y: -8.0, z: PLAY, kind: "waterpipe", facing: 1, interact: "lever",
      data: { channel: "waterDivert", needItem: "shovel" }, label: "水道闸 —— 闸把子锈死了" },
    { id: "a2_pr_beam9", x: 96.5, y: -8.0, z: PLAY, kind: "prop_beam", facing: 1, interact: "none", data: null, label: null },
    { id: "a2_pr_waterpipe1", x: 104, y: -8.0, z: PLAY, kind: "waterpipe", facing: 1, interact: "none", data: null, label: null },
    { id: "a2_pr_crock5", x: 108, y: -8.0, z: PLAY, kind: "crock", facing: 1, interact: "none", data: null, label: null },

    // —— 藏身洞 s3：铁锨、粮窖、传令口，还有链二的引点 ——
    { id: "a2_pr_lantern2", x: 85, y: -3.8, z: PLAY, kind: "lantern", facing: 1, interact: "pickup", data: { item: "lantern" }, label: "马灯" },
    // 引点摆在 89.5：够到干线 80.5–98.5，把 a2_e_pit（89–97）整条巡逻线都罩住；
    // 而且离 x=98 的绳子只有 8.5 米 —— 敲完跑过去、降下去、落在他背后，
    // 实测 8.7 秒，卡在 lureHold 5.6 秒的窗口里（他还要走 5.9 秒才到）。
    // 半径 14 而不是 12：a2_e_pit 是 guard，hearing 5.5 → RaiseLure 按耳朵折算
    // clamp(5.5/6, 0.7, 1.6) = 0.917，12 实际只值 11.0 米，隔着 4.2 米土
    // （×1.9 = 7.98）水平只够到 7.6 米 —— 差 1.1 米就叫不动他巡逻区的东端。实测撞出来的。
    { id: "a2_pr_lure_s3", x: 89.5, y: -3.8, z: PLAY, kind: "vent", facing: 1, interact: "lure",
      data: { radius: 14, panels: [] }, label: "敲通气孔 —— 把守闸的叫过来" },
    { id: "a2_pr_crock6", x: 91, y: -3.8, z: PLAY, kind: "crock", facing: 1, interact: "none", data: null, label: null },
    { id: "a2_pr_sig_hideout", x: 92, y: -3.8, z: PLAY, kind: "vent", facing: 1, interact: "signal",
      data: { squadId: "squad_hideout", panels: ["a2_call1", "a2_call2", "a2_call3", "a2_call4"] }, label: "对着通气孔传话" },
    { id: "a2_pr_shovel", x: 93.5, y: -3.8, z: PLAY, kind: "crock", facing: 1, interact: "pickup",
      data: { item: "shovel" }, label: "铁锨" },
    { id: "a2_pr_sink_grain", x: 95, y: -3.8, z: PLAY, kind: "crock", facing: 1, interact: "dumpSpoil",
      data: { sinkId: "a2_sink_grain", panels: [] }, label: "把土倒进空粮坑" },
    { id: "a2_pr_kang3", x: 96.5, y: -3.8, z: PLAY, kind: "kang", facing: 1, interact: "hide", data: { capacity: 1 }, label: "被褥堆" },
    { id: "a2_pr_dig_s3e", x: 99.8, y: -3.8, z: PLAY, kind: "chokepoint", facing: 1, interact: "dig",
      data: { digSpotId: "a2_dig_s3e", panels: ["a2_brief4"] }, label: "老砖窑的窑壁 —— 从西头掏进窑膛" },
    // 窑膛里的两件东西：一个倒土的坑，一盏民兵撂下的马灯（挖进来是有回报的，
    // 不是纯粹的过路）。
    { id: "a2_pr_sink_kiln", x: 107, y: -3.8, z: PLAY, kind: "stove", facing: 1, interact: "dumpSpoil",
      data: { sinkId: "a2_sink_kiln", panels: [] }, label: "把土填回窑坑" },
    { id: "a2_pr_lantern3", x: 105.5, y: -3.8, z: PLAY, kind: "lantern", facing: 1, interact: "pickup",
      data: { item: "lantern" }, label: "马灯" },

    // —— 干线 d4（链三）+ 枯井 ——
    // 干线上的炕洞：对**巡逻状态**的他有效（掩体挡得住路过的一眼）。
    // 但注意 —— 被引过来的人处在 search 状态，而 search 状态的兵会把人从掩体里揪出来
    // （Script_Rules 的"搜村的兵会挨个挑柴垛"）。所以「引」和「藏」在这一幕是**互斥**的两手，
    // 不是可以叠在一起用的。引要配换层，藏要配等窗口。
    { id: "a2_pr_kang_d4", x: 118.5, y: -8.0, z: PLAY, kind: "kang", facing: 1, interact: "hide", data: { capacity: 1 }, label: "炕洞" },
    { id: "a2_pr_beam11", x: 121, y: -8.0, z: PLAY, kind: "prop_beam", facing: 1, interact: "none", data: null, label: null },
    // 粮袋从 s4(130.5) 挪到干线 124。实测（active 策略，400 秒超时）：
    // 粮袋在 s4、渗水口在干线，而 s4 的入口是竖井、中段是净空 0.85 的爬行段 ——
    // 王大娘/四爷/栓柱 三个都进不去。于是「上去拿粮袋 → 她卡在井底 →
    // BotGoal 的 rejoin 规则把人叫回井底 → 再上去」变成死循环，
    // 机器人在 115–132 之间来回爬了三轮共 113 秒。
    // 这不是机器人的毛病，是关卡的：**护送任务里的必需品不许放在护送对象进不去的地方。**
    // 摆在 a2_e_deep 的巡逻区（120–130）正中反而更有戏：要拿粮袋就得先处理他，
    // 这跟链三本来的障碍是同一件事。
    // probeAt 的每个 x 上，**每一层受害地板的上方都要有孔**。
    // 118 两层都有（ventp6 在 -2.95、ventp7 在 -6.18），126 原来只有 -2.95 那一个，
    // 干线（-8.0）上方是实心土 —— 于是 a2_e_probe3 在 126 捅不到干线上的人。
    // 那是漏摆不是设计：同一个兵的两个落点行为必须一致。
    { id: "a2_pr_ventp9", x: 126, y: -6.18, z: PLAY, kind: "vent", facing: 1, interact: "none", data: null, label: null },
    { id: "a2_pr_grainbag", x: 126, y: -8.0, z: PLAY, kind: "crock", facing: 1, interact: "pickup",
      data: { item: "grain" }, label: "粮袋" },
    { id: "a2_pr_block_choke", x: 133, y: -8.0, z: PLAY, kind: "chokepoint", facing: 1, interact: "block",
      data: { channel: "blockDeep", panels: [] }, label: "放倒卡口的支撑木 —— 关上这条道" },
    { id: "a2_pr_seep", x: 136.5, y: -8.0, z: PLAY, kind: "waterpipe", facing: 1, interact: "lever",
      data: { channel: "gasSeal", needItem: "grain" }, label: "渗水口 —— 拿粮袋垫住" },
    { id: "a2_pr_crock7", x: 139, y: -8.0, z: PLAY, kind: "crock", facing: 1, interact: "none", data: null, label: null },
    { id: "a2_pr_beam12", x: 140.5, y: -8.0, z: PLAY, kind: "prop_beam", facing: 1, interact: "none", data: null, label: null },
    { id: "a2_pr_sink_well", x: 142, y: -8.0, z: PLAY, kind: "well", facing: 1, interact: "dumpSpoil",
      data: { sinkId: "a2_sink_well", panels: [] }, label: "把土倒进枯井" },
    { id: "a2_pr_well", x: 145, y: -8.0, z: PLAY, kind: "well", facing: 1, interact: "hatch", data: { hatchId: "a2_h_well" }, label: "枯井口" },

    // —— 藏身洞 s4：街道底下，116–126 是爬行段（兵跟不进来）——
    { id: "a2_pr_ventp6", x: 118, y: -2.95, z: PLAY, kind: "vent", facing: 1, interact: "none", data: null, label: null },
    { id: "a2_pr_dig_s4w", x: 118, y: -3.8, z: PLAY, kind: "chokepoint", facing: 1, interact: "dig",
      data: { digSpotId: "a2_dig_s4w", panels: [] }, label: "从东头对着掏 —— 跟西头那段碰上就通了" },
    // 链三的引点。摆在 s4（-3.8）而不是干线：**引点必须跟玩家要去的地方不同层**，
    // 否则他会朝着你站的地方走过来，你哪儿也去不了。
    // 隔 4.2 米土（×1.9 = 7.98），半径 12 水平够到 ±8.96 → 覆盖干线 112–130，
    // 罩住 a2_e_deep 的整条巡逻线。敲完往东爬到 128 的梯子下去，落在他背后。
    // 实测这一趟 7.4 秒，他从东端走过来 4.6 秒、原地蹲 5.6 秒 —— 余量 2.8 秒。
    { id: "a2_pr_ventp7", x: 118, y: -6.18, z: PLAY, kind: "vent", facing: 1, interact: "none", data: null, label: null },
    { id: "a2_pr_lure_d4", x: 121, y: -3.8, z: PLAY, kind: "vent", facing: 1, interact: "lure",
      data: { radius: 12, panels: [] }, label: "敲通气孔 —— 把干线上那个叫到西头" },
    { id: "a2_pr_kang4b", x: 124, y: -3.8, z: PLAY, kind: "kang", facing: 1, interact: "hide", data: { capacity: 1 }, label: "被褥堆" },
    { id: "a2_pr_ventp8", x: 126, y: -2.95, z: PLAY, kind: "vent", facing: 1, interact: "none", data: null, label: null },
    { id: "a2_pr_kang4", x: 131, y: -3.8, z: PLAY, kind: "kang", facing: 1, interact: "hide", data: { capacity: 1 }, label: "被褥堆" },
    { id: "a2_pr_beam13", x: 133, y: -3.8, z: PLAY, kind: "prop_beam", facing: 1, interact: "none", data: null, label: null },
    { id: "a2_pr_dig_s4drop", x: 135, y: -3.8, z: PLAY, kind: "chokepoint", facing: 1, interact: "dig",
      data: { digSpotId: "a2_dig_s4drop", panels: [] }, label: "往下掏一口井 —— 绕开他" },
    { id: "a2_pr_dig_s4e", x: 137.5, y: -3.8, z: PLAY, kind: "wall", facing: 1, interact: "dig",
      data: { digSpotId: "a2_dig_s4e", panels: [] }, label: "枯井的井壁 —— 刨不动" },

    // —— 挖点（上层西段）——
    { id: "a2_pr_dig_s2s1", x: 46.2, y: -3.8, z: PLAY, kind: "chokepoint", facing: 1, interact: "dig",
      data: { digSpotId: "a2_dig_s2s1", panels: [] }, label: "往西掏 —— 通秋兰那条支道" },
    { id: "a2_pr_dig_s2s3", x: 67.8, y: -3.8, z: PLAY, kind: "chokepoint", facing: 1, interact: "dig",
      data: { digSpotId: "a2_dig_s2s3", panels: [] }, label: "往东掏 —— 通西院支道" },

    // —— 地表街面（构图 + 敌人站位）——
    { id: "a2_pr_house_t1", x: 50, y: 0, z: MID, kind: "house", facing: 1, interact: "none", data: null, label: null },
    { id: "a2_pr_millstone_t1", x: 62, y: 0, z: PLAY, kind: "millstone", facing: 1, interact: "none", data: null, label: null },
    { id: "a2_pr_wall_t1", x: 116, y: 0, z: PLAY, kind: "wall", facing: 1, interact: "none", data: null, label: null },
    { id: "a2_pr_house_t2", x: 124, y: 0, z: MID, kind: "house", facing: -1, interact: "none", data: null, label: null },
    { id: "a2_pr_lamp_out", x: 146, y: 0, z: BACK, kind: "lamp", facing: 1, interact: "none", data: null, label: null },
    { id: "a2_pr_treeOut", x: 149, y: 0, z: BACK, kind: "tree", facing: 1, interact: "none", data: null, label: null },
  ],

  enemies: [
    // ── 地表：头顶捅刺刀的三个。probeAt 从九个砍到五个，每个 x 上都有通气孔 ──
    {
      id: "a2_e_probe1", x: 48, y: 0, kind: "search", facing: 1,
      patrol: { x0: 42, x1: 58, speed: 1.3, pauseSec: 1.6 },
      vision: { range: 9, halfAngleDeg: 30, height: 1.6 },
      hearing: 6.0, probeAt: [43, 55],
    },
    {
      id: "a2_e_probe2", x: 62, y: 0, kind: "guard", facing: -1,
      patrol: { x0: 58, x1: 65, speed: 1.1, pauseSec: 2.1 },
      vision: { range: 8, halfAngleDeg: 28, height: 1.6 },
      hearing: 5.5, probeAt: null,
    },
    {
      id: "a2_e_probe3", x: 120, y: 0, kind: "search", facing: 1,
      patrol: { x0: 113, x1: 133, speed: 1.5, pauseSec: 1.0 },
      vision: { range: 9, halfAngleDeg: 32, height: 1.6 },
      hearing: 6.5, probeAt: [118, 126],
    },
    {
      id: "a2_e_dog2", x: 128, y: 0, kind: "dog", facing: -1,
      patrol: { x0: 112, x1: 136, speed: 1.9, pauseSec: 0.5 },
      vision: { range: 8, halfAngleDeg: 44, height: 0.7 },
      hearing: 9.5, probeAt: null,
    },

    // ── 地道里的三个。全部 spawn 门控：他们是后来摸下来的 ──
    // 链一。**干线 d2**，不是浅层。位置是实测逼出来的：
    // BotThink 的收人闸门是 `!(threat && threat.dist < 12)`，而 BotThreat 只认同层
    // （|Δy| > 2.5 直接跳过）。把他和二嫂放在同一条支道里，他离她永远不到 12 米，
    // 于是那个乡亲**永远招不上来**（实测 300 秒卡死在她身边，0 死亡、纯卡）。
    // 放到她脚底下的干线上，两件事同时解决：二嫂可以被招呼，而他挡住的是真正的必经路。
    // 而且这样才对得上「三通」——绕过他的办法是**从他头顶上走**：
    // 50 的翻口上去、s2 走到东头、65 的土井下来，落在他巡逻区外。
    {
      // 视距 8 是按**高原判据**定的，不是单点试出来的（机器人基线对参数是混沌的，
      // 一个数字过了不算过）。实测四档：7→sneak 148s / 8→192s / 9→241s / 10→220s，
      // 四档全过，所以 8 站在一块真高原上，不是运气。变坏的方向是往上，
      // 9 已经把 sneak 推到 241 秒（断言上限 300），谁要往上调先重跑这一列。
      id: "a2_e_inside", x: 58, y: -8.0, kind: "search", facing: -1,
      patrol: { x0: 55, x1: 61, speed: 1.10, pauseSec: 2.6 },
      vision: { range: 8, halfAngleDeg: 30, height: 1.6 },
      hearing: 6.0, probeAt: null,
    },
    // 链二。干线 d3，水道闸（94.5）就在他巡逻区正中。
    // 走得慢（guard 1.05）是有意的：他不是来抓你的，是来守着那个闸的。
    {
      id: "a2_e_pit", x: 95, y: -8.0, kind: "guard", facing: -1,
      patrol: { x0: 91, x1: 99, speed: 1.05, pauseSec: 2.2 },
      vision: { range: 9, halfAngleDeg: 28, height: 1.6 },
      hearing: 5.5, probeAt: null,
    },
    // 链三。干线 d4，挡在乡亲和枯井中间。
    // 巡逻区 120–130 是量出来的：西端离 x=114 的梯子 6 米（够玩家上下），
    // 东端离 x=132 的土井 2 米、离 133 的封口 3 米、离挖出来的新井（135）5 米 ——
    // 三条绕法各留一点余量，但没有一条是白送的。
    {
      // 视距 9：8 / 9 / 10 三档都过，**11 当场悬崖**（active 300 秒不过、死 13 次）。
      // 他守的是三位不会爬的乡亲通往枯井的唯一一条平路，视距一大整队就过不去了。
      id: "a2_e_deep", x: 126, y: -8.0, kind: "search", facing: -1,
      patrol: { x0: 120, x1: 130, speed: 1.35, pauseSec: 1.2 },
      vision: { range: 9, halfAngleDeg: 34, height: 1.6 },
      hearing: 6.5, probeAt: null,
    },
  ],

  npcs: [
    // canCrawl: 钻得过净空 <1.05 的矮口。canClimb: 爬得了竖井。
    // 老人两样都不行（拄棍、腿脚不便），孩子钻得过但够不着梯子，壮年都行。
    // canClimb:false 是**恢复**的：之前因为 Rules 的 InShaft 误判被临时放开过，
    // Rules 已经改成「只有真的换层才要求 canClimb」，所以这三个人拿回原本的限制。
    // 站位据此排：三个不会爬的全在**干线**上（0–148 平直贯通，不用爬也不用钻，
    // 唯一要过的矮段是 92–100，净空 1.25 > crouchNeeds 1.05）；
    // 三个壮年在支道里，玩家得爬上去接、再带下来。
    { id: "a2_n_wangdaniang", x: 20, y: -8.0, name: "王大娘", role: "elder", follow: false, rescued: false, canCrawl: false, canClimb: false },
    { id: "a2_n_qiulan", x: 35, y: -3.8, name: "秋兰", role: "villager", follow: false, rescued: false, canCrawl: true, canClimb: true },
    { id: "a2_n_ersao", x: 58.5, y: -3.8, name: "二嫂", role: "villager", follow: false, rescued: false, canCrawl: true, canClimb: true },
    { id: "a2_n_shuanzhu", x: 82, y: -8.0, name: "栓柱", role: "child", follow: false, rescued: false, canCrawl: true, canClimb: false },
    { id: "a2_n_siye", x: 84, y: -8.0, name: "四爷", role: "elder", follow: false, rescued: false, canCrawl: false, canClimb: false },
    // 老栓从 s4(128) 挪到 s3(86.5)：六个人这样沿 x 单调铺开（20→35→58.5→82→84→86.5），
    // 收人不用横跨半张图。s4 仍然是必经的（粮袋在 130.5），只是不再藏着一个人。
    { id: "a2_n_laoshuan", x: 86.5, y: -3.8, name: "老栓", role: "villager", follow: false, rescued: false, canCrawl: true, canClimb: true },
  ],

  hazards: [
    // 水从水道灌进来，淹掉干线 100–112。armAt 从 a2_t_lantern(x11–14) 挪到
    // a2_t_flood(x76–80)：让水在玩家真的走进那一段时才来，而不是他刚捡起马灯
    // 96 米外就武装。（旧的挂法还有一个副作用：机器人的"有武装危害就去封"规则
    // 会立刻把他从村西头拽到 x=94.5，一局多走 330 米。）
    { id: "a2_hz_water", kind: "water", x0: 100, x1: 112, y: -8.0, armAt: "a2_t_flood", speed: 1.9, sealedBy: "waterDivert" },
    { id: "a2_hz_seep", kind: "water", x0: 138, x1: 146, y: -8.0, armAt: "a2_t_street", speed: 1.6, sealedBy: "gasSeal" },
  ],

  triggers: [
    { id: "a2_t_open", x0: 0, x1: 5, yMin: -9.5, yMax: -6.0, once: true,
      emit: { panels: ["a2_p1"], reveal: [], arm: [], spawn: [], objective: "跟着那盏马灯的光走", checkpoint: false, win: false } },
    { id: "a2_t_low", x0: 5.5, x1: 8, yMin: -9.5, yMax: -6.0, once: true,
      emit: { panels: ["a2_p2"], reveal: [], arm: [], spawn: [], objective: "猫腰过去", checkpoint: false, win: false } },
    { id: "a2_t_lantern", x0: 11, x1: 14, yMin: -9.5, yMax: -6.0, once: true,
      emit: { panels: ["a2_p3"], reveal: [], arm: [], spawn: [], objective: "拿上马灯", checkpoint: true, win: false } },
    { id: "a2_t_bellcode", x0: 16, x1: 19, yMin: -9.5, yMax: -6.0, once: true,
      emit: { panels: ["a2_brief2"], reveal: [], arm: [], spawn: [], objective: "记住钟点：三慢两快是集合", checkpoint: false, win: false } },
    { id: "a2_t_shaft", x0: 28, x1: 32, yMin: -9.5, yMax: -6.0, once: true,
      emit: { panels: ["a2_p4"], reveal: [], arm: [], spawn: [], objective: "上竖井，看看藏身洞", checkpoint: false, win: false } },
    { id: "a2_t_hide1", x0: 30, x1: 34, yMin: -5.0, yMax: -2.4, once: true,
      emit: { panels: ["a2_p5"], reveal: [], arm: [], spawn: [], objective: "老人上不了竖井，孩子够不着梯子 —— 得分批带", checkpoint: true, win: false } },
    { id: "a2_t_three", x0: 46, x1: 49, yMin: -5.0, yMax: -2.4, once: true,
      emit: { panels: ["a2_beat5"], reveal: [], arm: [], spawn: [], objective: "", checkpoint: false, win: false } },
    // 顶开翻口的同时，上头的人也摸下来了。这一幕的转折点。
    { id: "a2_t_fanko", x0: 47, x1: 52, yMin: -9.5, yMax: -6.0, once: true,
      emit: { panels: ["a2_p6", "a2_boot1"], reveal: ["a2_h_fanko"], arm: [], spawn: ["a2_e_inside"], objective: "从下头顶开翻口", checkpoint: false, win: false } },
    { id: "a2_t_probe", x0: 48, x1: 52, yMin: -5.0, yMax: -2.4, once: true,
      emit: { panels: ["a2_p7"], reveal: [], arm: [], spawn: [], objective: "刺刀在头顶 —— 别停在通气孔底下", checkpoint: true, win: false } },
    // 水从西院灌下来。走进干线这一段才发生，不是刚捡马灯就发生。
    // x0/x1 是按"高原判据"定的，不是单点试出来的：80–84 / 84–88 / 86–90 三档都过，
    // 而 90–94 当场悬崖（sneak 300 秒不过、死 13 次）—— 水一旦晚到，玩家已经越过
    // a2_e_pit 的巡逻区，回头拉闸要穿一次他的视线。取 84–88，离悬崖留两档。
    { id: "a2_t_flood", x0: 84, x1: 88, yMin: -9.5, yMax: -6.0, once: true,
      emit: { panels: ["a2_call5"], reveal: [], arm: ["a2_hz_water"], spawn: [], objective: "水灌进干线了 —— 闸把子在东头，得先找把锨", checkpoint: false, win: false } },
    { id: "a2_t_shuanzhu", x0: 80, x1: 84, yMin: -9.5, yMax: -6.0, once: true,
      emit: { panels: ["a2_beat1", "a2_beat2"], reveal: [], arm: [], spawn: [], objective: "", checkpoint: false, win: false } },
    { id: "a2_t_elder", x0: 84, x1: 88, yMin: -5.0, yMax: -2.4, once: true,
      emit: { panels: ["a2_p8", "a2_boot2"], reveal: [], arm: [], spawn: ["a2_e_pit"], objective: "四爷在西院底下", checkpoint: true, win: false } },
    // 汤丙会在通气孔上头喊四爷的名字。他爹跟四爷一块打过井——最难受的不是敌人，是这个。
    { id: "a2_t_tang", x0: 91, x1: 95, yMin: -5.0, yMax: -2.4, once: true,
      emit: { panels: ["a2_tang1", "a2_tang2", "a2_tang3", "a2_tang4"], reveal: [], arm: [], spawn: [], objective: "别应声", checkpoint: true, win: false } },
    { id: "a2_t_carry", x0: 96, x1: 99, yMin: -5.0, yMax: -2.4, once: true,
      emit: { panels: ["a2_beat3"], reveal: [], arm: [], spawn: [], objective: "", checkpoint: false, win: false } },
    { id: "a2_t_mid", x0: 104, x1: 108, yMin: -9.5, yMax: -6.0, once: true,
      emit: { panels: ["a2_p9", "a2_boot3"], reveal: [], arm: [], spawn: ["a2_e_deep"], objective: "人还不齐 —— 别落下谁", checkpoint: true, win: false } },
    { id: "a2_t_street", x0: 114, x1: 118, yMin: -5.0, yMax: -2.4, once: true,
      emit: { panels: ["a2_p10"], reveal: [], arm: [], spawn: [], objective: "头顶就是街 —— 爬过去", checkpoint: true, win: false } },
    { id: "a2_t_newdirt", x0: 120, x1: 124, yMin: -5.0, yMax: -2.4, once: true,
      emit: { panels: ["a2_beat4"], reveal: [], arm: [], spawn: [], objective: "头顶的土是新翻的 —— 别停", checkpoint: false, win: false } },
    { id: "a2_t_choke", x0: 129, x1: 133, yMin: -9.5, yMax: -6.0, once: true,
      emit: { panels: ["a2_brief1"], reveal: [], arm: ["a2_hz_seep"], spawn: [], objective: "渗水口在东头 —— 拿粮袋垫住", checkpoint: true, win: false } },
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
    { id: "a2_sh_probe", x0: 44, x1: 68, viewHeight: 7.2, lift: 0.4, anchorX: null, ease: 1.0,
      reason: "翻口这一段：收紧到只看得见眼前两三米，逼玩家去听而不是去看——上头有人下来了" },
    { id: "a2_sh_pit", x0: 88, x1: 100, viewHeight: 9.6, lift: 0.9, anchorX: null, ease: 1.2,
      reason: "水道闸：拉开一点，让守闸的人、闸把子、和正在涨的水同框——玩家自己算这笔账" },
    { id: "a2_sh_street", x0: 114, x1: 138, viewHeight: 6.2, lift: 0.25, anchorX: null, ease: 1.0,
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
    // 原来在 (50,-3.8)：正落在 a2_e_inside 巡逻区西端三米内，死一次就重生在他脸前，
    // 实测滚出 46 次连环被抓。检查点必须落在**安全侧**，这是硬规矩。
    { id: "a2_cp3", x: 50, y: -8.0, label: "翻口底下" },
    { id: "a2_cp4", x: 86, y: -3.8, label: "西院支道" },
    { id: "a2_cp5", x: 106, y: -8.0, label: "干线中段" },
    { id: "a2_cp6", x: 115, y: -3.8, label: "街道底下" },
    { id: "a2_cp7", x: 140, y: -8.0, label: "枯井前" },
  ],

  objectives: [
    { id: "a2_o1", text: "拿上马灯", doneWhen: { propUsed: "a2_pr_lantern" } },
    { id: "a2_o2", text: "摸清上下两层", doneWhen: { trigger: "a2_t_hide1" } },
    { id: "a2_o3", text: "顶开翻口", doneWhen: { propUsed: "a2_pr_fanko" } },
    // 有意不给水道闸加一条目标：PendingObjectives 会把 propUsed 变成通关硬条件，
    // 加了就等于把"掏窑壁绕过去"这条解法判死。闸该不该拉由局面说了算，不由 HUD 说了算。
    { id: "a2_o4", text: "找齐六位乡亲", doneWhen: { npcRescued: "all" } },
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
  exit: { x: 176, y: -8.0, radius: 4.5, needAllVillagers: true, label: "黑风口" },
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
    { id: "a3_f_dg", x0: 64, x1: 88, y: -4.5, kind: "tunnel" },   // 绕开碾盘院的哨兵
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
    { x0: 0, x1: 18, y: -6.18 },
    { x0: 18, x1: 24, y: -6.70 },
    { x0: 24, x1: 44, y: -6.18 },
    { x0: 44, x1: 56, y: -6.18 },
    { x0: 56, x1: 62, y: -6.75 },
    { x0: 62, x1: 70, y: -6.18 },
    // 粮窖：净空 1.20，猫腰
    { x0: 24, x1: 40, y: -3.00 },
    // 街道底下的短地道：净空 1.20，猫腰
    { x0: 64, x1: 88, y: -2.65 },
    { x0: 88, x1: 106, y: -2.65 },
    // 东段干线
    { x0: 110, x1: 130, y: -6.18 },
    { x0: 130, x1: 138, y: -6.75 },
    { x0: 138, x1: 148, y: -6.18 },
    // 摸黑段：干线畅通，净空足，压力全来自头顶的人
    { x0: 148, x1: 178, y: -6.18 },
    // 民兵支线：净空 1.20，一路猫腰——射击位本来就是蹲着打的
    { x0: 126, x1: 142, y: -2.60 },
    { x0: 152, x1: 166, y: -2.60 },
  ],

  shafts: [
    { id: "a3_sh_grain_a", x: 30, yTop: -4.2, yBottom: -8.0, kind: "ladder", requiresHatch: null },
    { id: "a3_sh_grain_b", x: 38, yTop: -4.2, yBottom: -8.0, kind: "dirt", requiresHatch: null },
    { id: "a3_sh_mill", x: 63, yTop: 0, yBottom: -8.0, kind: "ladder", requiresHatch: "a3_h_mill" },
    { id: "a3_sh_dg_w", x: 64.5, yTop: 0, yBottom: -4.5, kind: "ladder", requiresHatch: "a3_h_dg_w" },
    { id: "a3_sh_dg_e", x: 85, yTop: 0, yBottom: -4.5, kind: "ladder", requiresHatch: "a3_h_dg_e" },
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
    { id: "a3_h_dg_w", x: 64.5, shaftId: "a3_sh_dg_w", hidden: false, opened: false, revealBy: null, label: "灶台底下的口", propId: "a3_pr_h_dg_w" },
    { id: "a3_h_dg_e", x: 85, shaftId: "a3_sh_dg_e", hidden: false, opened: false, revealBy: null, label: "炕底下的口", propId: "a3_pr_h_dg_e" },
    { id: "a3_h_street1", x: 88.5, shaftId: "a3_sh_m1", hidden: true, opened: false, revealBy: "a3_t_street", label: "驴槽底下的口", propId: "a3_pr_trough_hatch" },
    { id: "a3_h_street2", x: 105.5, shaftId: "a3_sh_m2", hidden: true, opened: false, revealBy: "a3_t_dip", label: "水缸底下的翻口", propId: "a3_pr_dip_out" },
    { id: "a3_h_kang", x: 116, shaftId: "a3_sh_kang", hidden: true, opened: false, revealBy: "a3_t_flood", label: "炕下的地道口", propId: "a3_pr_kang3" },
  ],

  // —— 挖掘（契约 0.0.2）——
  // 第三幕的挖是**应急**：土是湿的、时间是被烟和天光追着的，两处能挖的都在压力最大的地方。
  //   a3_dig_millside（软，一米二，全作最便宜的一段）—— 从街底下短地道的西头掏进碾盘那口竖井的井壁。
  //     掏通之后，干线 ⇄ 街底下短地道不用再上地面那一趟（x 63→64.5 正好在哨兵 a3_e_g1
  //     视距 10 的边上）。挖点只布在短地道这头：要挖它必须先从碾盘下头钻出来过一次，
  //     所以"天快亮了"那个地表节拍和 a3_t_surface 的检查点一定会发生 —— 这是回程/复线，不是跳票。
  //   a3_dig_militia（软，10 米，本作最响的一锨）—— 把西头组的支道 s5（126–142）
  //     和东头组的支道 s6（152–166）横向掏通。掏通之后跑腿传令不必再下到干线，
  //     也就绕开了 a3_e_blockM（干线 151.2，视距 12）和头顶那两个捅刺刀的。
  //     代价：正上方西边是汤丙会（134–140，听觉 6.0），东边是山田（149–166，听觉 7.5）。
  //     这是"绕开一条巡逻线"的最高级形态，也是全幕唯一一条不靠地雷推进的路。
  //   a3_dig_collapse（硬）—— 玩家一定会问"干线塌了，我刨开不就完了？"。
  //     答案写在土里：塌方上头压着房梁，一动就是第二次塌。所以只能从碾盘下头上地表绕。
  //   a3_dig_wellwall（硬）—— 街底下短地道的东头再往东是水井的井壁，青砖砌的。
  //     这条堵死了两件事：不许跳过街上那段岗哨，也不许摸到一口还没现形的炕下竖井（死胡同）。
  //   a3_dig_wind（硬，也是全作最想挖的一处）—— 从 s6 东头到黑风口的竖井只隔九米，
  //     刨过去就能绕开堵在干线上的三个人。可那九米是整块青石。
  //     合围的最后一下必须是全村的反击，不是一个人的铁锨 —— 这条红线用地质写死。
  // 倒土两处，都不在挖点跟前：
  //   a3_sink_yard（83.5，地表）—— 碾盘院东头的场院。从 85 那口炕洞钻出来就是，
  //     但那是地面：a3_e_g1 的巡逻线（69–79，视距 10）刚好够得着，倒土得挑他背过身。
  //   a3_sink_kang（129.5，s5 西头）—— 炕洞。从 142 挖完往西背十二米半，
  //     一路都在汤丙会（134–140）脚底下。这段路本身就是代价。
  // 铁锨也是两把（59.5 / 126.5），一把管西半场一把管东半场。
  digSpots: [
    {
      // 改过一次：原来是 64.2 → 63 的水平一米二，想接的是碾盘竖井的**井壁中段**。
      // 那个落点在寻路里根本不存在（BuildNav 只认竖井的两个端点），
      // 而且两头落在同一块地板上 —— 等于一条零收益的边。
      // 改成往下掏一口井：短地道 dg(-4.5) 直接接到干线 d2(-8.0)，
      // 这才是它本来想给的东西（"干线 ⇄ 街底下短地道不用再上地面那一趟"），
      // 而且 CarveDig 的竖直分支会真的往 level.shafts 里塞一口井，寻路认得。
      id: "a3_dig_millside", x: 66, y: -4.5, dir: "down",
      toX: 66, toY: -8.0, sec: 3.0, spoil: 1, soft: true,
      label: "往下掏一口井 —— 直接落到干线上",
    },
    {
      id: "a3_dig_collapse", x: 69.6, y: -8.0, dir: "right",
      toX: 110.2, toY: -8.0, sec: 6.0, spoil: 3, soft: false,
      label: "塌方 —— 上头压着房梁，刨不动",
    },
    {
      id: "a3_dig_wellwall", x: 103, y: -4.5, dir: "right",
      toX: 116, toY: -4.5, sec: 6.0, spoil: 3, soft: false,
      label: "再往东是水井的井壁 —— 青砖砌的",
    },
    {
      id: "a3_dig_militia", x: 142, y: -3.8, dir: "right",
      toX: 152.2, toY: -3.8, sec: 6.0, spoil: 3, soft: true,
      label: "往东掏 —— 接东头组那条支道",
    },
    {
      id: "a3_dig_wind", x: 166, y: -3.8, dir: "right",
      toX: 175, toY: -3.8, sec: 6.0, spoil: 3, soft: false,
      label: "黑风口这头是整块青石 —— 刨不动",
    },
  ],
  spoilSinks: [
    { id: "a3_sink_yard", x: 83.5, y: 0, capacity: 7, label: "碾盘院的场院 —— 把新土摊开" },
    { id: "a3_sink_kang", x: 129.5, y: -3.8, capacity: 7, label: "炕洞 —— 把土垫到炕底下" },
  ],

  props: [
    // —— 开场：亮着的马灯就在脚边，这是"看得见的目标" ——
    { id: "a3_pr_lantern", x: 6, y: -8.0, z: PLAY, kind: "lantern", facing: 1, interact: "pickup", data: { item: "lantern" }, label: "马灯" },
    { id: "a3_pr_beam1", x: 9, y: -8.0, z: PLAY, kind: "prop_beam", facing: 1, interact: "none", data: null, label: null },
    { id: "a3_pr_vent1", x: 14, y: -6.18, z: PLAY, kind: "vent", facing: 1, interact: "none", data: null, label: null },
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
    { id: "a3_pr_h_dg_w", x: 64.5, y: 0, z: PLAY, kind: "stove", facing: 1, interact: "hatch", data: { hatchId: "a3_h_dg_w" }, label: "灶台底下的口" },
    { id: "a3_pr_h_dg_e", x: 85, y: -4.5, z: PLAY, kind: "trapdoor", facing: 1, interact: "hatch", data: { hatchId: "a3_h_dg_e" }, label: "翻口 —— 顶出去是炕底下" },
    { id: "a3_pr_lure_dg", x: 70, y: -4.5, z: PLAY, kind: "vent", facing: 1, interact: "lure", data: { radius: 12, panels: [] }, label: "敲通气孔 —— 把哨兵引到这头" },
    { id: "a3_pr_v_dg", x: 70, y: -2.65, z: PLAY, kind: "vent", facing: 1, interact: "none", data: null, label: null },
    { id: "a3_pr_beam_dg", x: 78, y: -4.5, z: PLAY, kind: "prop_beam", facing: 1, interact: "none", data: null, label: null },
    { id: "a3_pr_crock_dg", x: 81, y: -4.5, z: PLAY, kind: "crock", facing: 1, interact: "none", data: null, label: null },
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
    { id: "a3_pr_kang_s5", x: 133, y: -3.8, z: PLAY, kind: "kang", facing: 1, interact: "hide", data: { capacity: 1 }, label: "被褥堆" },
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
    { id: "a3_pr_vent2", x: 134, y: -6.18, z: PLAY, kind: "vent", facing: 1, interact: "none", data: null, label: null },
    // —— 刺刀落点的预警孔（不许有看不见就会死的陷阱）——
    { id: "a3_pr_ventp1", x: 137.4, y: -2.60, z: PLAY, kind: "vent", facing: 1, interact: "none", data: null, label: null },
    { id: "a3_pr_ventp2", x: 138.6, y: -2.60, z: PLAY, kind: "vent", facing: 1, interact: "none", data: null, label: null },
    { id: "a3_pr_ventp3", x: 137.4, y: -6.18, z: PLAY, kind: "vent", facing: 1, interact: "none", data: null, label: null },
    { id: "a3_pr_ventp4", x: 138.6, y: -6.18, z: PLAY, kind: "vent", facing: 1, interact: "none", data: null, label: null },
    { id: "a3_pr_ventp5", x: 148, y: -6.18, z: PLAY, kind: "vent", facing: 1, interact: "none", data: null, label: null },
    { id: "a3_pr_ventp6", x: 150.2, y: -6.18, z: PLAY, kind: "vent", facing: 1, interact: "none", data: null, label: null },
    { id: "a3_pr_ventp7", x: 149.2, y: -6.18, z: PLAY, kind: "vent", facing: 1, interact: "none", data: null, label: null },
    { id: "a3_pr_ventp8", x: 151.2, y: -6.18, z: PLAY, kind: "vent", facing: 1, interact: "none", data: null, label: null },
    { id: "a3_pr_beam6", x: 140, y: -8.0, z: PLAY, kind: "prop_beam", facing: 1, interact: "none", data: null, label: null },

    // —— 地下 d4：摸黑段。四个通气孔就是这一段唯一的光源和唯一的路标 ——
    { id: "a3_pr_trough_d4", x: 150, y: -8.0, z: PLAY, kind: "trough", facing: 1, interact: "none", data: null, label: null },
    { id: "a3_pr_vent3", x: 152, y: -6.18, z: PLAY, kind: "vent", facing: 1, interact: "none", data: null, label: null },
    { id: "a3_pr_beam7", x: 155, y: -8.0, z: PLAY, kind: "prop_beam", facing: 1, interact: "none", data: null, label: null },
    { id: "a3_pr_vent4", x: 157, y: -6.18, z: PLAY, kind: "vent", facing: 1, interact: "none", data: null, label: null },
    { id: "a3_pr_vent5", x: 162, y: -6.18, z: PLAY, kind: "vent", facing: 1, interact: "none", data: null, label: null },
    { id: "a3_pr_beam8", x: 165, y: -8.0, z: PLAY, kind: "prop_beam", facing: 1, interact: "none", data: null, label: null },
    { id: "a3_pr_vent6", x: 167, y: -6.18, z: PLAY, kind: "vent", facing: 1, interact: "none", data: null, label: null },
    // ┌─────────────────────────────────────────────────────────────────────┐
    // │ 这个 1 米是**故意的**，不是没调好的数值，别把它"修"成安全距离。      │
    // │ 被褥堆在 167，东头那颗雷在 168。从掩体冲出去 0.57 秒 + 拉雷 0.55 秒 │
    // │ = 1.12 秒；SENSE.alertRiseSec 是 1.25 秒。也就是说：                │
    // │ **拉这颗雷的时候你一定会被看见，你只有一次呼吸的时间。**            │
    // │ 地雷杀伤半径 6.5 米只比"猫腰潜行时被看见的半径"(视距×0.4836) 大一点，│
    // │ 所以"能安全摸到雷"和"雷炸得到所有堵口的"本来就不可能同时成立——      │
    // │ 与其把它当成矛盾去调参，不如把它变成这一幕最后一下的心跳。          │
    // │ 碾道那颗雷（x=145）反过来是安全的：那是"推进"，不是"最后一下"。      │
    // └─────────────────────────────────────────────────────────────────────┘
    { id: "a3_pr_kang_d4", x: 167, y: -8.0, z: PLAY, kind: "kang", facing: 1, interact: "hide", data: { capacity: 1 }, label: "被褥堆" },
    { id: "a3_pr_crock6", x: 170, y: -8.0, z: PLAY, kind: "crock", facing: 1, interact: "none", data: null, label: null },
    { id: "a3_pr_wind", x: 176, y: -8.0, z: PLAY, kind: "sign", facing: 1, interact: "none", data: null, label: "黑风口" },

    // —— 构图件 ——
    { id: "a3_pr_house_t3", x: 156, y: 0, z: MID, kind: "house", facing: 1, interact: "none", data: null, label: null },
    { id: "a3_pr_wall_t3", x: 164, y: 0, z: PLAY, kind: "wall", facing: 1, interact: "none", data: null, label: null },
    { id: "a3_pr_treeOut3", x: 177, y: 0, z: BACK, kind: "tree", facing: 1, interact: "none", data: null, label: null },
    { id: "a3_pr_lampOut3", x: 174, y: 0, z: BACK, kind: "lamp", facing: 1, interact: "none", data: null, label: null },

    // —— 挖 / 倒土（契约 0.0.2）——
    // 两把铁锨，一把在卡口东边的干线上（59.5，过了木塞那一关才够得着，
    // 所以不会跟"拿木塞封卡口"抢手），一把在西头组的支道口（126.5）。
    // 一次只能拿一件东西：想挖就得先把马灯放下 —— 摸黑刨土，这是取舍。
    { id: "a3_pr_shovel", x: 59.5, y: -8.0, z: PLAY, kind: "crock", facing: 1, interact: "pickup",
      data: { item: "shovel" }, label: "撂在土墙根的铁锨" },
    { id: "a3_pr_shovel2", x: 126.5, y: -3.8, z: PLAY, kind: "crock", facing: 1, interact: "pickup",
      data: { item: "shovel" }, label: "民兵撂下的铁锨" },
    { id: "a3_pr_dig_millside", x: 66, y: -4.5, z: PLAY, kind: "chokepoint", facing: 1, interact: "dig",
      data: { digSpotId: "a3_dig_millside", panels: [] }, label: "往下掏一口井 —— 直接落到干线上" },
    { id: "a3_pr_dig_collapse", x: 69.6, y: -8.0, z: PLAY, kind: "prop_beam", facing: 1, interact: "dig",
      data: { digSpotId: "a3_dig_collapse", panels: [] }, label: "塌方 —— 房梁压着，刨不动" },
    { id: "a3_pr_dig_wellwall", x: 103, y: -4.5, z: PLAY, kind: "wall", facing: 1, interact: "dig",
      data: { digSpotId: "a3_dig_wellwall", panels: [] }, label: "水井的井壁 —— 刨不动" },
    { id: "a3_pr_dig_militia", x: 142, y: -3.8, z: PLAY, kind: "chokepoint", facing: 1, interact: "dig",
      data: { digSpotId: "a3_dig_militia", panels: [] }, label: "往东掏 —— 接东头组那条支道" },
    { id: "a3_pr_dig_wind", x: 166, y: -3.8, z: PLAY, kind: "wall", facing: 1, interact: "dig",
      data: { digSpotId: "a3_dig_wind", panels: [] }, label: "整块青石 —— 刨不动" },
    { id: "a3_pr_sink_yard", x: 83.5, y: 0, z: PLAY, kind: "millstone", facing: 1, interact: "dumpSpoil",
      data: { sinkId: "a3_sink_yard", panels: [] }, label: "把土摊到场院上" },
    { id: "a3_pr_sink_kang", x: 129.5, y: -3.8, z: PLAY, kind: "kang", facing: 1, interact: "dumpSpoil",
      data: { sinkId: "a3_sink_kang", panels: [] }, label: "把土垫到炕底下" },
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
      patrol: { x0: 134, x1: 140, speed: 1.25, pauseSec: 1.2 },
      vision: { range: 11, halfAngleDeg: 30, height: 1.6 },
      hearing: 6.0, probeAt: [137.4, 138.6],
    },
    // 街面上捅刺刀的那队（a3_t_counter 唤出）：他们把干线 148/150.2 两处钉死，
    // 玩家过不去。碾道那颗雷（x=145，向上够 9 米）连人带街面一起掀掉。
    {
      id: "a3_e_probeM", x: 149, y: 0, kind: "search", facing: -1,
      patrol: { x0: 147, x1: 150.8, speed: 1.2, pauseSec: 1.1 },
      vision: { range: 9, halfAngleDeg: 32, height: 1.6 },
      hearing: 6.0, probeAt: [148, 150.2],
    },
    {
      id: "a3_e_probeM2", x: 150, y: 0, kind: "search", facing: 1,
      patrol: { x0: 148.5, x1: 151.5, speed: 1.35, pauseSec: 1.0 },
      vision: { range: 9, halfAngleDeg: 32, height: 1.6 },
      hearing: 6.0, probeAt: [149.2, 151.2],
    },
    {
      id: "a3_e_blockM", x: 151.2, y: -8.0, kind: "guard", facing: -1,
      patrol: { x0: 151, x1: 151.4, speed: 1.1, pauseSec: 1.4 },
      vision: { range: 12, halfAngleDeg: 32, height: 1.6 },
      hearing: 6.0, probeAt: null,
    },
    // 堵在黑风口前的两个。他们背朝西（刚从出口那头摸进来，正往里搜），
    // 所以玩家能贴着墙根摸到 x=168 那颗雷跟前——但只要往出口挪一步就必被看见。
    {
      id: "a3_e_blockA", x: 171.6, y: -8.0, kind: "search", facing: -1,
      patrol: { x0: 171, x1: 172.4, speed: 1.3, pauseSec: 1.6 },
      vision: { range: 16, halfAngleDeg: 38, height: 1.6 },
      hearing: 6.5, probeAt: null,
    },
    {
      id: "a3_e_blockB", x: 173, y: -8.0, kind: "guard", facing: -1,
      patrol: { x0: 172.4, x1: 173.6, speed: 1.1, pauseSec: 1.6 },
      vision: { range: 16, halfAngleDeg: 34, height: 1.6 },
      hearing: 6.0, probeAt: null,
    },
    {
      id: "a3_e_blockC", x: 174.2, y: -8.0, kind: "search", facing: -1,
      patrol: { x0: 173.6, x1: 174.5, speed: 1.45, pauseSec: 1.1 },
      vision: { range: 16, halfAngleDeg: 38, height: 1.6 },
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
    // ★ 这一幕的三位老小是 canClimb: **true**，跟第二幕不一样。改过一次，理由是实测出来的：
    //   第三幕的反击跑腿全在支道上 —— a3_pr_sig_west(131,-3.8) / sig_mill(141,-3.8) /
    //   sig_east(157,-3.8) / lh_west(136,-3.8) / lh_east(161,-3.8) / shovel2(126.5,-3.8)，
    //   六件事一件都在干线上都没有，只能爬竖井上去。而三位老小是在 x=118–127 接上的，
    //   **接完才轮到这些跑腿**。给他们 canClimb:false，玩家一爬 128 的竖井，
    //   四爷就卡在半空（实测 stuckReason="climb"，y 从 -7.8 停到 -6.0），
    //   BotGoal 的 rejoin 规则把玩家叫回井底、玩家又得再上去 —— 400 秒卡死，no_route。
    //   要在这一幕也做出"不是所有人都能走同一条路"，得先把反击跑腿挪到干线上，
    //   或者把三位老小挪到最后一件跑腿的东边 —— 那是第三幕的结构改动，不在这次范围里。
    //   「按人分路线」这一课由第二幕承担（那儿三个人都是 canClimb:false，且干线全程平直）。
    // 开场就在身边的三位，跟着往前跑
    // 跟着往外跑的三个壮年（爬得了竖井，走得了地表那一段）
    { id: "a3_n_qiulan", x: 9, y: -8.0, name: "秋兰", role: "villager", follow: false, rescued: false, canCrawl: true, canClimb: true },
    { id: "a3_n_ersao", x: 12, y: -8.0, name: "二嫂", role: "villager", follow: false, rescued: false, canCrawl: true, canClimb: true },
    { id: "a3_n_laoshuan", x: 15, y: -8.0, name: "老栓", role: "villager", follow: false, rescued: false, canCrawl: true, canClimb: true },
    // 塌方那头等着的三位，从炕洞下来才碰得上
    // 老人孩子先走一步，在汇合点等着 —— 从这儿到黑风口全程干线，不用爬也不用钻
    { id: "a3_n_wangdaniang", x: 118, y: -8.0, name: "王大娘", role: "elder", follow: false, rescued: false, canCrawl: false, canClimb: true },
    { id: "a3_n_shuanzhu", x: 123.5, y: -8.0, name: "栓柱", role: "child", follow: false, rescued: false, canCrawl: true, canClimb: true },
    { id: "a3_n_siye", x: 127, y: -8.0, name: "四爷", role: "elder", follow: false, rescued: false, canCrawl: false, canClimb: true },
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
      emit: { panels: ["a3_p1"], reveal: [], arm: ["a3_hz_gas"], spawn: [], objective: "烟从后头灌进来了 —— 往前跑", checkpoint: false, win: false } },
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
    // 区间原本被迫西移到 113–116.5，是为了避开「过场落点压在触发框里 →
    // 跳过与放完的世界状态不一致」。那条已经在 EndCutscene 里从源头修好
    // （过场交还控制权后统一跑一次 UpdateTriggers），所以放回钢轨跟前。
    { id: "a3_t_counter", x0: 117, x1: 120, yMin: -9.5, yMax: -6.0, once: true,
      emit: { panels: ["a3_beat1", "a3_brief1"], reveal: [], arm: [], spawn: ["a3_e_probeM", "a3_e_probeM2", "a3_e_blockM"], objective: "敲钢轨 —— 三快一慢", checkpoint: true, win: false } },
    { id: "a3_t_squad_west", x0: 129, x1: 133, yMin: -5.0, yMax: -2.4, once: true,
      emit: { panels: [], reveal: [], arm: [], spawn: [], objective: "西头组：开枪眼，把他们往东赶", checkpoint: true, win: false } },
    { id: "a3_t_squad_east", x0: 155, x1: 159, yMin: -5.0, yMax: -2.4, once: true,
      emit: { panels: [], reveal: [], arm: [], spawn: ["a3_e_blockA", "a3_e_blockB", "a3_e_blockC"], objective: "东头组：地雷合围 —— 黑风口被堵上了", checkpoint: true, win: false } },
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
    { id: "a3_t_end", x0: 174.5, x1: 178, yMin: -9.5, yMax: -6.0, once: true,
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
        { kind: "camera", to: { x: 160, y: -1.6, viewHeight: 16.0 }, sec: 3.2, ease: "inOut" },
        { kind: "sfx", id: "shout" },
        { kind: "wait", sec: 1.0 },
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
    { id: "a3_cp7", x: 118, y: -8.0, label: "汇合点" },
    { id: "a3_cp8", x: 135, y: -8.0, label: "干线东段" },
    { id: "a3_cp9", x: 143, y: -8.0, label: "碾道口" },
    { id: "a3_cp10", x: 131, y: -3.8, label: "西头组" },
    { id: "a3_cp11", x: 157, y: -3.8, label: "东头组" },
    { id: "a3_cp12", x: 164, y: -8.0, label: "黑风口前" },
  ],

  objectives: [
    { id: "a3_o1", text: "找块木塞", doneWhen: { propUsed: "a3_pr_plug" } },
    { id: "a3_o2", text: "封住卡口，把烟挡回去", doneWhen: { propUsed: "a3_pr_choke" } },
    { id: "a3_o3", text: "上地表，摸到水井", doneWhen: { trigger: "a3_t_water" } },
    { id: "a3_o4", text: "引水冲开塌方", doneWhen: { propUsed: "a3_pr_well3" } },
    { id: "a3_o5", text: "跟乡亲汇合，一个都不能少", doneWhen: { trigger: "a3_t_meet" } },
    // signal / mine / loophole 三个动词已经实现，完成条件从"走到那条支线"
    // 收回"真的用了那个道具"——判定更严格，也才对得上目标文本。
    { id: "a3_o6",  text: "传口令：西头组",                 doneWhen: { propUsed: "a3_pr_sig_west" } },
    { id: "a3_o7",  text: "西头枪眼 —— 把头顶捅刺刀的压下去", doneWhen: { propUsed: "a3_pr_lh_west" } },
    { id: "a3_o8",  text: "传口令：碾道组",                 doneWhen: { propUsed: "a3_pr_sig_mill" } },
    { id: "a3_o9",  text: "碾道地雷 —— 炸开去黑风口的路",     doneWhen: { propUsed: "a3_pr_mine_mill" } },
    { id: "a3_o10", text: "传口令：东头组",                 doneWhen: { propUsed: "a3_pr_sig_east" } },
    { id: "a3_o11", text: "东头枪眼",                       doneWhen: { propUsed: "a3_pr_lh_east" } },
    { id: "a3_o12", text: "东头地雷 —— 合围",               doneWhen: { propUsed: "a3_pr_mine_east" } },
    { id: "a3_o13", text: "带全村爬出黑风口", doneWhen: { atExit: true } },
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
