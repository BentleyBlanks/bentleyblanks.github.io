// 《滕县 一九三八》主菜单 —— 场景机位表 + 两片非正片切片。纯数据，**不许 import three**。
//
// 对标 Easy Red 2 的主菜单。ER2 那一屏之所以立得住，靠的是三件事，不是排版：
//   1. 背后是**活的战场**，不是一张背景图 —— 同一套渲染管线、同一片地形、
//      同一份天光，雾与浮尘在动，远处有烟柱；
//   2. 机位是**运镜**而不是静止：一个缓慢的推轨 + 极轻的手持漂移；
//   3. 每隔十几秒**切一次机位**，切换是短促的黑场，不是横向滑动。
// 菜单文字反倒极克制：一列字、一条竖线、角上一个版本号。
//
// 我们抄的就是这三条。抄不了也不打算抄的是 ER2 的多人/编辑器入口 ——
// 这是单人线性关卡的原型，菜单只有四项（见 Data_TengxianScript.MENU）。
//
// 机位坐标系与全案一致：X 向东，Z 向南，城心为原点，城墙中心线 ±305。
// 城内地坪 y=0、濠外原野 y=-1.2、墙顶 y=11.5、女墙顶 y=13.1。
//
// **机位必须落在本关切片（Data_Battle.TUNING[*].bounds）能看见东西的地方。**
// 切片以外只有地皮没有建筑（Script_TengxianCity 按 bounds 生成），
// 镜头架到切片外朝外看 = 一片空地，这是最容易犯的错。

import { OVERVIEW_BOUNDS } from "./Data_Battle.mjs";

// ---------------------------------------------------------------------------
// 两片**不进 PHASES** 的切片（2026-08-29 抛光批 P2）
//
// 任务流程重制之后，七章里没有哪一章会把整座城连同东西关一起建出来，也没有哪一章
// 走到界河。于是两批已经做好的东西同时失去了入口：
//   · 采样点表 89 个机位里 74 个、Script_ShotTest 的 Z 系列约二十张 —— 它们当年
//     靠的是「城墙关」那片全城切片（bounds 与 Data_Battle.OVERVIEW_BOUNDS 逐字相同）；
//   · Script_JieheField / Script_JieheHeight / OUTFIELD_SCENES.L0_Jiehe /
//     Data_Dressing_JieheVillages 那一整套界河资产（Script_JieheTerrainTest 整份红）。
//
// 两片都按靶场那条**整表替换**的路子接（Script_Main 的 PHASE_TABLE）：
// 正片的 PHASES 一个字都不知道它们存在，`Script_Main` 里也没有多一个 `if (章 id)`。
// 差别只有一处 —— 界河是玩家在选章「测试场景」组里点得到的沙盒，
// 全城俯瞰只是出图/自检的 URL 入口（`?phase=overview`），不进选章列表：
// 它没有玩法，摆进列表只会让人以为那是一关。
// ---------------------------------------------------------------------------

/** 全城俯瞰切片的 id。世界类仍是 TengxianField（城的生成器只认 bounds）。 */
export const OVERVIEW_LEVEL_ID = "Overview";

/**
 * 全城俯瞰：**照 Data_Battle.OVERVIEW_BOUNDS 建一次整座城**。
 *
 * 它就是旧「城墙关」那片切片去掉打仗的部分 —— bounds 逐字相同，所以
 * 车站、通信队、电灯厂、交易所、西关大街、东关关厢与东郊远端农院同时在场。
 * 天光钉死 `smokyDay`：这一片是**样式基线**，两批图之间的差别里不许混进天光差。
 *
 * `nraPool` 给 9999 而不是 0：0 会让 `state.nraPool <= 0 && !player.Alive` 那条
 * 收场判据在玩家一摔死时弹出结局卡。这一片没有敌人（ijaPressure 0、ijaSpawn 空），
 * 所以池子永远不会掉。
 */
export const OVERVIEW_PHASE = Object.freeze({
  id: OVERVIEW_LEVEL_ID,
  date: "全城俯瞰",
  label: "全城俯瞰（出图/自检）",
  place: "开发专用 · 不属于正片",
  sky: "smokyDay",
  music: null,
  minutes: 600,
  brief: Object.freeze([
    "照 Data_Battle.OVERVIEW_BOUNDS 建整座城：四门、城墙、主次街、城内院落与东西关同时在场。",
    "采样点表（Data_SamplePoints，phase: \"overview\"）与 Script_ShotTest 的 Z 系列都站在这一片上。",
  ]),
  story: OVERVIEW_LEVEL_ID,          // 没有剧本，Story 会打一条 warn，属预期
  cutsceneIn: null,
  cutsceneOut: null,
  objectives: Object.freeze(["无 —— 这一片不打仗"]),
  mechanic: "出图/自检切片：不撒日军、不结算、不换关。",
  nraPool: 9999,
  poolGain: 0,
  ijaPool: 0,
  ijaPressure: 0,
  ijaSpawn: Object.freeze([]),
  ijaSupport: Object.freeze([]),
  ijaForce: Object.freeze({ lmgEvery: 13, hmgTeams: 0, engineers: false, armor: 0, motorTransport: "rearOnly" }),
  bounds: OVERVIEW_BOUNDS,
  // 俯瞰要看到对面那道墙：620 的默认远平面在 (0,430,430) 那个机位上会把北墙切掉。
  cameraFar: 1800,
  /**
   * LOD 焦点。**不是路标**（这一片没有目标链），只是「哪几处要出全院落」：
   * 十字街口 + 四门 + 东关 + 西关，默认 detail 100 / mid 210 之下正好铺满城圈。
   */
  zones: Object.freeze([
    { id: "OV_Crossroad", name: "十字街口", x: 0, z: 0, radius: 30 },
    { id: "OV_EastGate", name: "东门", x: 305, z: -65, radius: 30 },
    { id: "OV_WestGate", name: "西门", x: -305, z: 0, radius: 30 },
    { id: "OV_SouthGate", name: "南门", x: 70, z: 305, radius: 30 },
    { id: "OV_NorthGate", name: "北门", x: -145, z: -305, radius: 30 },
    { id: "OV_EastSuburb", name: "东关", x: 452, z: -65, radius: 30 },
    { id: "OV_WestSuburb", name: "西关", x: -410, z: 0, radius: 30 },
  ]),
  // 十字街口正中：规则 4 保证这块 ±21 m 是净空的，站得下人也走得动。
  spawn: Object.freeze({ x: 0, z: 0, ry: Math.PI / 2 }),
});

/** 界河白盒的 id。**沿用旧关号 `L0_Jiehe`**（见 JIEHE_SANDBOX_PHASE 的注释）。 */
export const JIEHE_LEVEL_ID = "L0_Jiehe";

/**
 * 序 · 界河（白盒）：退出正片、但资产完整的那片城北原野。
 *
 * **id 必须还叫 `L0_Jiehe`**，这不是偷懒：`OUTFIELD_SCENES`、`Script_ExternalProps.PLACEMENTS`、
 * `Script_TrimProps.TRIM_PLACEMENTS` 三张表都按这个 levelId 分组，`Script_JieheField`
 * 自己的默认 levelId 也是它。换个新 id 等于把那一整套布景从表里摘掉，
 * 建出来是一张空地 —— 而这个入口存在的全部理由就是那套布景。
 *
 * bounds / spawn / zones 与重制前的 L0 关逐字相同（git bd4bdd90^ 的 Data_Battle），
 * 所以 `Script_JieheTerrainTest` 量到的是同一片地形，九条断言不用改判据。
 * 只有打法字段被抽干：这是白盒，不是关卡 —— 没有日军、没有结算、没有下一关。
 */
export const JIEHE_SANDBOX_PHASE = Object.freeze({
  id: JIEHE_LEVEL_ID,
  sandbox: true,
  sandboxKey: "jiehe",
  sandboxGlyph: "河",
  date: "白盒场地",
  label: "界河 · 白盒",
  place: "开发专用 · 不属于正片",
  sky: "smokyDay",
  music: null,
  minutes: 600,
  brief: Object.freeze([
    "城北二十公里的界河原野：河槽、河堤、土坎、散兵胸墙、麦田田埂、津浦路路基与两侧村落。",
    "这片地退出了正片流程，资产一件没删。走两步就能看出高差读不读得出来、下切通道挡不挡得住弹。",
  ]),
  story: JIEHE_LEVEL_ID,             // 没有剧本，Story 会打一条 warn，属预期
  cutsceneIn: null,
  cutsceneOut: null,
  objectives: Object.freeze(["南岸一线", "土坎", "北沙河"]),
  mechanic: "地形白盒：不撒日军、不结算、不换关。",
  // 简报那三句：靶场那套默认词（工位 / 木桩兵）在这儿一句都不成立。
  metaText: Object.freeze(["不计时 · 不计进度", "路标 3", "地形白盒 · 无日军"]),
  nraPool: 9999,
  poolGain: 0,
  ijaPool: 0,
  ijaPressure: 0,
  ijaSpawn: Object.freeze([]),
  ijaSupport: Object.freeze([]),
  ijaForce: Object.freeze({ lmgEvery: 13, hmgTeams: 0, engineers: false, armor: 0, motorTransport: "rearOnly" }),
  bounds: Object.freeze({ minX: -620, maxX: 620, minZ: -1620, maxZ: -900 }),
  // **不写 cameraFar**：装配层的取值是 `phase.cameraFar ?? battlefield.cameraFar ?? 620`，
  // 而 JieheField 自己带着 JIEHE_CAMERA_FAR = 460。在这儿抄一个 460 只会多一处
  // 「改了那边忘了改这边」。
  zones: Object.freeze([
    { id: "JH_Approach", name: "界河南岸", x: 0, z: -1420, radius: 34 },
    { id: "JH_Kan", name: "土坎", x: 0, z: -1255, radius: 30 },
    { id: "JH_Beishahe", name: "北沙河", x: 0, z: -1000, radius: 34 },
  ]),
  spawn: Object.freeze({ x: 0, z: -1470, ry: Math.PI }),
  loadoutOverride: Object.freeze({
    primary: "HanYang",
    secondary: null,
    melee: "Dadao",
    throwables: Object.freeze({ Grenade: 6 }),
    spareClips: 3,
    note: "白盒携行：汉阳造、大刀、木柄手榴弹六枚 —— 够验弹道与投掷落点，不复刻原关的「无枪」开局。",
  }),
});

/** 焦距语汇沿用分镜表（Script_Cutscene.FovFromFocalMm，35 mm 全画幅等效）。 */
export const MENU_SCENE = {
  /**
   * 菜单默认建哪一片切片。没给 ?phase= 时用它。
   * 取第二章（东关）：重制之后没有城墙关了，而东关是这场仗真正的主战场 ——
   * 寨墙、外壕与那一片密集院落是滕县最认得出来的一张脸。
   */
  slice: "CH2_Shouliudan",
  /** 一个机位停多久（秒）。ER2 大约十几秒换一次。 */
  holdSeconds: 16,
  /** 切机位的黑场时长（秒）。半黑半亮各一半。 */
  fadeSeconds: 0.9,
  /**
   * 手持漂移的幅度。**不许 Math.random** —— 用 ValueNoise2，
   * 同一时刻永远同一个值，出图才可复现（与过场那条规矩同源）。
   */
  drift: 0.55,
  /**
   * 菜单场景里摆几个守军。**只摆守军，一个日军都不放** ——
   * 菜单里不许开打：打起来就会死人，而兵员池是关卡状态，
   * 玩家还没按「开始」就被消耗掉是说不通的。摆 0 就是空景。
   */
  garrison: 5,
  /**
   * 人落在机位与被摄物连线的哪一段（比例区间）。
   * 太近会挡住地标，太远小到看不出是人；这一段里由装配层逐个挑
   * 「站得下 **且** 相机看得见」的点（见 Script_Main.PlaceMenuGarrison）。
   */
  garrisonAt: [0.30, 0.62],
  /** 横向撒开的半径（米）。 */
  garrisonSpread: 20,
};

/**
 * 机位表：关卡 id -> 机位数组。
 *
 * 每条机位：
 *   from/to     推轨的起讫（世界坐标）。to 省略 = 定机位。
 *   look/lookTo 注视点的起讫。lookTo 省略 = 一直看着 look。
 *   focalMm     焦距。24≈53°、35≈37.8°、50≈27°、85≈16°。
 *   title       角上那行小字（给玩家看的地名）。
 *   note        这一机位在拍什么 —— 给后来改坐标的人看的，别删。
 *   crowd       false = 这一机位不摆人。**镜头在墙顶时必须给 false**：
 *               撒兵按地皮高度落点（Script_Ai.Spawn 用 GroundHeight），
 *               人会摆到十一米五的墙底下去，画面上就是「一个人都没有」。
 */
export const MENU_SHOTS = {
  // =========================================================================
  // 序 · 出川：序章借第一关那一片切片（Data_MissionCh0 的 tuning.fieldFrom），
  // 所以机位与第一关同一组 —— 玩家在选章里点序章时看见的就是那片原野。
  CH0_Chuchuan: [
    {
      id: "Railbed", title: "津浦路 · 路基", note: "路基侧后方：军列停下来的地方，也是第一关接敌的那道土坎",
      from: [-540, 12, -232], to: [-522, 11, -206],
      look: [-478, 4.0, -172], focalMm: 40,
    },
    {
      id: "Depot", title: "兵站月台", note: "车站货场方向：第五战区补的那批枪弹是从这儿发下去的",
      from: [-504, 15, -136], to: [-488, 14, -114],
      look: [-458, 6.5, -82], focalMm: 35,
    },
  ],

  // =========================================================================
  // 一 · 往南的路：城外原野。电灯厂那根二十二米的烟囱是西关天际线的关键剪影。
  CH1_NanLu: [
    {
      id: "PowerPlant", title: "西关 · 电灯厂", note: "电灯厂：师部原设于此，十五日迁入城内。烟囱在西城门楼直瞄射程内",
      from: [-504, 15, 142], to: [-486, 14, 108],
      look: [-408, 11, 62], focalMm: 40,
    },
    {
      id: "WestGate", title: "西门 · 怀古门", note: "西门外的护城河边看怀古门 —— 第一关末尾把人带回城走的就是这个门",
      from: [-426, 19, -66], to: [-408, 17.5, -24],
      look: [-318, 8.5, 0], focalMm: 35,
    },
  ],

  // =========================================================================
  // 二 · 手榴弹雨：本战真正的主战场，打了整整二十四小时。菜单默认切片。
  CH2_Shouliudan: [
    {
      id: "ZhaiWall", title: "东关 · 东寨墙", note: "东寨墙外：高两米、顶宽四十公分，一炮一个口",
      from: [594, 13, -56], to: [576, 12, 2],
      look: [452, 5.5, -6], focalMm: 40,
    },
    {
      id: "Courtyard", title: "东关 · 关厢院落", note: "关厢院落上方：日方检讨说要命的不是城墙，是这片密集民房",
      from: [470, 24, 122], to: [452, 21, 84],
      look: [378, 6, 34], lookTo: [356, 6.5, 18], focalMm: 35,
    },
  ],

  // =========================================================================
  // 三 · 救护所：城内 A 区 → 东门 → 东关失守街区。
  CH3_Jiuhusuo: [
    {
      id: "EastGate", title: "东门 · 宗鲁门", note: "东门外一百米，关厢屋顶之上望宗鲁门与瓮城 —— 救护队来回走的那道门",
      from: [432, 17.5, -52], to: [424, 16.5, -22],
      look: [316, 8.5, -65], lookTo: [316, 8.5, -57], focalMm: 35,
    },
    {
      id: "LostBlock", title: "东关 · 失守街区", note: "东关大街上方：前沿救护点就在这一片院落里",
      from: [470, 24, 122], to: [452, 21, 84],
      look: [452, 6, -20], lookTo: [449, 6.5, -60], focalMm: 35,
    },
  ],

  // =========================================================================
  // 四 · 东关之夜：白毛巾、刺刀、火光。
  CH4_DongguanYe: [
    {
      id: "Lane", title: "东关 · 黑巷", note: "巷道低机位：夜里那一队人要走的那条巷子",
      from: [556, 6.5, -72], to: [538, 6.0, -44],
      look: [470, 2.6, -6], focalMm: 40,
    },
    {
      id: "AssemblyYard", title: "东关 · 集结院", note: "B 区集结院方向：分弹药、喝稀粥、写回信的那个院子",
      from: [492, 18, -230], to: [476, 16.5, -206],
      look: [449, 5.5, -175], focalMm: 35,
    },
  ],

  // =========================================================================
  // 五 · 城墙没有了：那条通视的西门大街就是这一章的机制。
  CH5_Chengqiang: [
    {
      // 机位必须**站在街上**（眼高 1.8 m）。第一版架在 6.2 m，实拍出来是一片屋顶 ——
      // 那条走廊是贴地的一条直街，抬到屋檐以上就什么都不是了。
      id: "Corridor", title: "西街长街 · 通视走廊", note: "十字街口沿西门大街往西推：西城门楼一眼望穿",
      from: [64, 1.85, 0], to: [22, 1.80, 0],
      look: [-180, 2.2, 0], lookTo: [-288, 5.0, 0], focalMm: 50,
    },
    {
      id: "Yamen", title: "县衙", note: "县衙：城内唯一有实物可参照的建筑，明代大堂",
      from: [88, 23, -72], to: [106, 21, -62],
      look: [128, 6, -118], focalMm: 40,
    },
  ],

  // =========================================================================
  // 终 · 最后一封：城内临时师部 → 西关电灯厂。
  CH6_Zuihou: [
    {
      id: "WestGateInner", title: "西门 · 怀古门（城里）", note: "西门里往城门看：通信组带着密码材料从这儿出城",
      from: [-176, 14, -58], to: [-198, 13, -34],
      look: [-300, 7.5, 0], focalMm: 40,
    },
    {
      id: "PowerPlant", title: "西关 · 电灯厂", note: "电灯厂：王铭章在这附近殉国。二十二米的烟囱是西关天际线",
      from: [-462, 15, 128], to: [-450, 14, 106],
      look: [-410, 9, 69], focalMm: 40,
    },
  ],

  // =========================================================================
  // 全城俯瞰（OVERVIEW_PHASE）—— **不是给玩家看的**，是出图脚本的机架。
  //
  // 三条机位原样搬自重制前的「城墙关」（git bd4bdd90^ 的 Data_Menu.L4_Chengqiang），
  // Yamen 搬自 CH5：`Script_ShotTest` 的 Z 系列拿 `menuShot: <id>` 当**基座**
  // 再用 `cam:` 覆盖具体位姿 —— 名字对不上就直接抛「找不到菜单机位」。
  // 所以这四个 id（EastGate / SouthEastTower / Rampart / Yamen）改名之前
  // 先去 Script_ShotTest 里搜一遍。
  Overview: [
    {
      id: "EastGate", title: "东门 · 宗鲁门", note: "东门外一百米，关厢屋顶之上望宗鲁门与瓮城 —— 城的正脸",
      from: [432, 17.5, -52], to: [424, 16.5, -22],
      look: [316, 8.5, -65], lookTo: [316, 8.5, -57], focalMm: 35,
    },
    {
      id: "SouthEastTower", title: "东南角望楼", note: "东南角望楼：日方战详报点名的那一座，突破口在它西侧二十米",
      from: [408, 16, 372], to: [382, 14, 344],
      look: [306, 8, 300], focalMm: 40,
    },
    {
      id: "Rampart", title: "东城墙 · 墙顶回廊", note: "墙顶回廊：站在女墙后沿东墙往北推，尽头是东门城楼",
      from: [305, 13.3, 244], to: [305, 13.2, 150],
      look: [305, 12.2, 60], lookTo: [307, 12.0, 10], focalMm: 50, crowd: false,
    },
    {
      id: "Yamen", title: "县衙", note: "县衙：城内唯一有实物可参照的建筑，明代大堂",
      from: [88, 23, -72], to: [106, 21, -62],
      look: [128, 6, -118], focalMm: 40,
    },
  ],
};

/** 兜底机位：某一关还没配机位时，按它第一个路标现算一个四十五度俯视。 */
export function FallbackShot(zone) {
  const x = zone?.x ?? 0;
  const z = zone?.z ?? 0;
  return {
    id: "Fallback", note: "兜底机位：按本关第一个路标现算",
    from: [x + 88, 26, z + 88], to: [x + 70, 22, z + 70],
    look: [x, 3, z], focalMm: 35,
  };
}

/** 取某一关的机位表（没配就给一条兜底）。 */
export function ShotsFor(levelId, firstZone = null) {
  const list = MENU_SHOTS[levelId];
  if (list && list.length) return list;
  return [FallbackShot(firstZone)];
}

export default MENU_SHOTS;
