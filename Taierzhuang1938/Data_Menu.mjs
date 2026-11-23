// 《台儿庄：血战滕县》主菜单 —— 场景机位表 + 两片非正片切片。纯数据，**不许 import three**。
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
import { CAMPAIGN_ENTRIES, MENU_SCENE, MENU_SHOTS } from "./Data_MenuCampaign.mjs";
export { CAMPAIGN_ENTRIES, MENU_SCENE, MENU_SHOTS };

// ---------------------------------------------------------------------------
// 两片**不进 PHASES** 的切片（2026-08-29 抛光批 P2）
//
// 任务流程重制之后，七章里没有哪一章会把整座城连同东西关一起建出来，也没有哪一章
// 走到界河。于是两批已经做好的东西同时失去了入口：
//   · 旧采样点表（2026-10-31 已删）89 个机位里 74 个、Script_ShotTest 的 Z 系列约二十张 —— 它们当年
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
    "Script_ShotTest 的 Z 系列都站在这一片上。",
  ]),
  story: OVERVIEW_LEVEL_ID,          // 没有剧本，Story 会打一条 warn，属预期
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

/**
 * 完整县城边界（`?phase=fullscene`；原完整场景预览工具 2026-10-31 已删，这条开发入口保留）。
 *
 * `OVERVIEW_BOUNDS` 是既有出图基线，不能为了巡场擅自扩张：它只到北关以南、
 * 善国门以北。这里另开一片，把四门外需要巡场的最远锚点全部包进来：
 * 北关坝墙 z=-560、城西津浦路、东郊农田 maxX=756、城南善国门 z=900。
 */
export const FULL_SCENE_BOUNDS = Object.freeze({
  minX: -520, maxX: 780, minZ: -590, maxZ: 940,
});

export const FULL_SCENE_LEVEL_ID = "FullScene";

/**
 * 完整县城只读预览切片。它不进 PHASES、不进选章，也不承担任务编辑语义。
 * `fieldFrom: Overview` 只让已有的全城手摆件/饰件并集继续生效；真正的生成范围
 * 仍只认上面的 FULL_SCENE_BOUNDS。
 */
export const FULL_SCENE_PHASE = Object.freeze({
  id: FULL_SCENE_LEVEL_ID,
  fieldFrom: OVERVIEW_LEVEL_ID,
  date: "完整县城",
  label: "完整县城（开发入口）",
  place: "开发专用 · 城内与四门外",
  // 完整巡场需要读到一公里外的四门外轮廓；smokyDay 在这个尺度上会把整城吃成灰片。
  // 使用编辑器专属长视距白昼，用户仍可在环境面板一键切回硝烟、夜间等全部预设。
  sky: "editorClear",
  music: null,
  minutes: 600,
  brief: Object.freeze([
    "完整生成滕县城、东西南北四门外关厢，以及北关坝墙、东郊农田和南关善国门。",
    "开发专用：只用来巡场、Spline 与环境取证；章节仍按各自切片工作。",
  ]),
  story: FULL_SCENE_LEVEL_ID,
  objectives: Object.freeze(["无 —— 只读巡场，不编辑任务关卡"]),
  mechanic: "完整县城切片：不撒兵、不结算、不换关。",
  nraPool: 9999,
  poolGain: 0,
  ijaPool: 0,
  ijaPressure: 0,
  ijaSpawn: Object.freeze([]),
  ijaSupport: Object.freeze([]),
  ijaForce: Object.freeze({ lmgEvery: 13, hmgTeams: 0, engineers: false, armor: 0, motorTransport: "rearOnly" }),
  bounds: FULL_SCENE_BOUNDS,
  cameraFar: 3600,
  detailRadius: 130,
  midRadius: 260,
  zones: Object.freeze([
    { id: "FS_City", name: "县城", x: 0, z: 0, radius: 40 },
    { id: "FS_East", name: "东门外", x: 620, z: -65, radius: 40 },
    { id: "FS_West", name: "西门外", x: -430, z: 0, radius: 40 },
    { id: "FS_North", name: "北门外", x: -80, z: -520, radius: 40 },
    { id: "FS_South", name: "南门外", x: 0, z: 420, radius: 40 },
    { id: "FS_Shanguo", name: "善国门", x: 0, z: 900, radius: 32 },
  ]),
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
  // 玩家在选章「测试场景」组里点得到这一条，所以这三样是**界面文本**：
  // 字段保留（`label` 同时被 MissionName / aria-label 当 id 用），
  // 显示走 `<字段>Key`（Script_Menu 优先读它，没有才回落到原字段）。
  sandboxGlyphKey: "menu.slice.jiehe.glyph",
  dateKey: "menu.slice.jiehe.date",
  labelKey: "menu.slice.jiehe.label",
  placeKey: "menu.slice.jiehe.place",
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

// ---------------------------------------------------------------------------
// 选章「正式章节」组（2026-09-06）
//
// 旧七章（序章 + 第一关到终章）整体退出了选章：序章要并进第一关，第一关到终章是
// 已废弃的旧稿（Data_TengxianScript.DEPRECATED_CHAPTER_IDS）。它们的切片与资产一件
// 没删 —— `?phase=N`、BootTest 七片冒烟、ShotTest 与编辑器仍按 PHASES 的序号取 ——
// 只是玩家再也点不到。玩家在选章里看到的是这张表：
//   · 第一关 = P0/P1/P2 场景白盒（重载进 ?whitebox=p012，与靶场同一条整表替换的路子），
//     也是主菜单「开始」的落点；
//   · 第二关到终章只是**占位**（placeholder）：只列关号、标「未完成」，
//     点了只在简报上提示「敬请期待」，不进任何场景。
// 占位条目按 PHASES 里带 deprecated 标的那几章生成（去掉第一关：它被白盒顶替了），
// 章数、关号、关名与日期地点都跟着章节表走，不在这里再抄一份（关卡名字保持原来的：
// 「第二关 · 手榴弹雨」照样列，只是点不进去）。
// ---------------------------------------------------------------------------
// CAMPAIGN_ENTRIES / MENU_SCENE / MENU_SHOTS 已抽至 Data_MenuCampaign.mjs 并在顶部重导出，
// 避免主菜单启动包牵连 Data_Battle（旧七章战场表）。

/** 兜底机位：某一关还没配机位时，按它第一个路标现算一个四十五度俯视。 */
export function FallbackShot(zone) {
  const x = zone?.x ?? 0;
  const z = zone?.z ?? 0;
  return {
    id: "Fallback", note: "兜底机位：按本关第一个路标现算",   // note 不上屏
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
