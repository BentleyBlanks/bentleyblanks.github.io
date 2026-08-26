// 《滕县 一九三八》战场数据 —— 纯数据，**不许 import three**。
//
// 台儿庄那套（开放战场 + 占领点 + 战役阶段）整个作废。
// 这一份是**七关线性关卡**：一关一片切片、一条目标链、一段史料时段。
// 玩法迁就场景，不是场景迁就玩法 —— 关卡的边界、路标坐标全部落在
// Data_Tengxian.mjs 那座按志载与日方战详报建起来的城上。
//
// 史料 vs 推定的分工（这一条是纪律，不是风格）：
//   · 关名、日期、时刻、brief、pool 的曲线 —— 全部从 Data_TengxianScript.LEVELS 取，
//     那份是考据过的底本，这里一个字都不复制、不改写；
//   · 本文件只新增**打法层**的数字（敌军压力、支援种类、携行、切片范围、路标坐标），
//     这些**全部是推定**，逐条登记在下面的 PRESUMED_TUNING。
//
// 世界坐标：X 向东，Z 向南，城心为原点。城墙中心线 ±305；四门位置按城防示意图略作错位。

import { LEVELS } from "./Data_TengxianScript.mjs";
import {
  CITY, GATES, EAST_SUBURB, EAST_FIELD, WEST_SUBURB, LANDMARKS, CROSSROAD,
} from "./Data_Tengxian.mjs";

const GATE = (id) => GATES.find((gate) => gate.id === id);

/**
 * 城的骨架摘要 —— 只是把 Data_Tengxian 里规则层用得到的那几个数搬过来，
 * **不是第二份真相**。要改城的尺寸去改 Data_Tengxian，这里会跟着变。
 */
export const TOWN = {
  wallCenter: CITY.wallCenter,          // 305
  wallHeight: CITY.wallHeight,          // 11.5
  wallTopWidth: CITY.wallTopWidth,      // 5.0
  platformEdge: CITY.platformEdge,      // 318
  gates: GATES.map((g) => ({ id: g.id, name: g.name, x: g.x, z: g.z, blocked: g.blocked })),
  // 全城只有四条上城道，都在城门旁边 —— 这条空间规则是第四、五关的关卡设计前提
  rampCount: 4,
};

/**
 * 世界范围：整座城 + 城外原野。Script_TengxianCity 的城外地面铺到 1700 m，
 * 超出这个圈就没有地皮了，所以任何关卡切片都不许越过它。
 *
 * **这是「滕县城」那张图的范围，不是全游戏的。** 序·界河是另一张图
 *（Script_JieheField，地皮 ±1250 / groundLimit 1250），它自己带一份
 * JIEHE_WORLD。运行时想知道"现在这张图铺到哪儿"要读 battlefield.worldLimits，
 * 别直接拿这一份当全局真相 —— 那正是「L0 是一张空地皮」那一版的思路。
 */
export const WORLD = {
  minX: -1650, maxX: 1650, minZ: -1650, maxZ: 1650,
  groundLimit: 1700,
};

/**
 * 目标链上的路标（zone）。
 *
 * **线性关卡里这不是占领点**：没有占领条、不会被反夺，owner 恒为 nra。
 * 它同时是三样东西 ——
 *   1. HUD 上的下一处去向；
 *   2. Data_TengxianScript 的 beats 里 `zone:名字` 的触发区；
 *   3. 撒兵与出生点的锚。
 * id 必须与剧本里的 `zone:` 名字**逐字一致**，对不上就是那句台词永远不播。
 *
 * 坐标除注明外**全部是推定**：史料给的是「东寨门」「十字街口」「县衙」这类地名，
 * 具体到米的位置来自 Data_Tengxian 的图纸，而那份图纸自己也标了哪些是推定。
 */
export const ZONES = {
  // --- 序 · 界河（城北二十公里外的开阔地；本作只取「南岸土坎」那一小片） ---
  Approach: { id: "Approach", name: "界河南岸", x: 0, z: -1420, radius: 34 },
  Kan: { id: "Kan", name: "土坎", x: 0, z: -1255, radius: 30 },
  Beishahe: { id: "Beishahe", name: "北沙河", x: 0, z: -1000, radius: 34 },

  // --- 一 · 北沙河 → 津浦路 → 西关 → 西门 ---
  SecondLine: { id: "SecondLine", name: "第二线阵地", x: -480, z: -180, radius: 34 },
  Dawn: { id: "Dawn", name: "天亮前的路口", x: -480, z: -130, radius: 30 },
  XiguanStation: {
    id: "XiguanStation", name: "滕县车站", radius: 42,
    x: WEST_SUBURB.station.x, z: WEST_SUBURB.station.z,
  },
  PowerPlant: {
    id: "PowerPlant", name: "电灯厂", radius: 34,
    x: WEST_SUBURB.powerPlant.x, z: WEST_SUBURB.powerPlant.z,
  },
  WestGate: { id: "WestGate", name: "西门 · 怀古门", x: -330, z: GATE("West").z, radius: 26 },

  // --- 二 · 东关（本战真正的主战场，打了整整二十四小时） ---
  ZhaiGate: {
    id: "ZhaiGate", name: "东关街口", radius: 20,
    x: 480, z: EAST_SUBURB.roadZ,
  },
  Courtyard: { id: "Courtyard", name: "关厢院落", x: 462, z: -19, radius: 26 },
  Temple: {
    id: "Temple", name: "寺院地", radius: 26,
    x: EAST_SUBURB.temple.x, z: EAST_SUBURB.temple.z,
  },
  Breach: { id: "Breach", name: "缺口", x: 500, z: EAST_SUBURB.roadZ, radius: 22 },

  // --- 三 · 夺回东关门（夜） ---
  Lane: { id: "Lane", name: "巷道", x: 478, z: -89, radius: 22 },
  GateRetake: { id: "GateRetake", name: "东关门", x: 516, z: EAST_SUBURB.roadZ, radius: 20 },
  EastGateIn: { id: "EastGateIn", name: "东门 · 宗鲁门", x: 296, z: GATE("East").z, radius: 24 },

  // --- 四 · 城墙 ---
  // 上城道：RAMPS 里东门旁那一条，沿墙内侧爬。坐标是墙内侧顺城街上的落脚点。
  // -20：上城道脚已沿爬升方向让开门洞 20 m（RAMPS v2.1），路标跟着脚走
  Rampway: { id: "Rampway", name: "东门旁上城道", x: 288, z: GATE("East").z - 20, radius: 16 },
  Rampart: { id: "Rampart", name: "东南角望楼", x: 294, z: 288, radius: 22 },
  SouthWall: { id: "SouthWall", name: "南城墙", x: 150, z: 296, radius: 26 },
  SouthBreach: { id: "SouthBreach", name: "南墙缺口", x: 285, z: 296, radius: 18 },

  // --- 五 · 十字街 ---
  Crossroad: { id: "Crossroad", name: "十字街口", x: CROSSROAD.x, z: CROSSROAD.z, radius: 20 },
  Yamen: {
    id: "Yamen", name: "县衙", radius: 32,
    x: LANDMARKS.find((l) => l.id === "Yamen").x,
    z: LANDMARKS.find((l) => l.id === "Yamen").z,
  },
  WestStreet: { id: "WestStreet", name: "西门大街", x: -160, z: GATE("West").z, radius: 24 },
  WestGateInner: { id: "WestGateInner", name: "西门里", x: -278, z: GATE("West").z, radius: 20 },

  // --- 六 · 北门突围 ---
  WestBarbican: { id: "WestBarbican", name: "西门瓮城", x: -322, z: GATE("West").z, radius: 16 },
  NorthStreet: { id: "NorthStreet", name: "北关大街", x: GATE("North").x, z: -160, radius: 24 },
  NorthGate: { id: "NorthGate", name: "北门 · 望阙门", x: GATE("North").x, z: -296, radius: 20 },
  WheatField: { id: "WheatField", name: "城北麦地", x: 0, z: -520, radius: 46 },
};

/**
 * 打法层的每关配置。**这一整张表都是推定**，与史料无关。
 *
 * bounds  本关生成哪一片。切片越小 draw call 越低，但也别把玩家要去的地方切掉。
 *         性能红线是 drawCalls ≤ 5000 / triangles ≤ 600 万，这张表是主要的旋钮。
 * zones   目标链，按顺序走。id 见 ZONES。
 * spawn   开局站位。**线性关卡里玩家开局是在阵地上跟着自己的班**，
 *         不是空地中央 —— 所以出生点写死在第一个路标的后方，不再随机找空地。
 * cameraFar
 *         相机远平面（米）。不写就用 620。
 *         这是**唯一一个不会动场景内容**的 draw call 旋钮：雾在两三百米外
 *         已经把东西吃干净了（fog.max 0.94），远平面收进去只是让视锥剔除
 *         把那些看不见的网格提前扔掉。收之前先确认本关最远的一处路标还在里头。
 * detailRadius / midRadius
 *         LOD 三档的分界（米）。**这是 draw call 的主要旋钮之一。**
 *         不写就用默认 100 / 210。城里那几关目标链拉得开（四个焦点撒在全城），
 *         默认值会让四片全细节院落同时在场，实测把 calls 顶到 1451。
 */
const TUNING = {
  L0_Jiehe: {
    // 界河在城北约二十公里，与滕县城不共景。切片取城北开阔原野，
    // **不让城墙入画** —— 真在界河看得见滕县城墙是史实错误。
    bounds: { minX: -620, maxX: 620, minZ: -1620, maxZ: -900 },
    zones: ["Approach", "Kan", "Beishahe"],
    spawn: { x: 0, z: -1470, ry: Math.PI },
    ijaPressure: 1.0, ijaSpawn: ["north"], ijaSupport: ["artillery", "hmg"],
    // 滕县方向的日军不是一排散兵：步兵分队的轻机枪、沿河架设的重机枪与后方
    // 炮兵共同推进。装甲栏明确为零——34 辆九四式在临城方向，不进本关。
    ijaForce: { lmgEvery: 13, hmgTeams: 1, engineers: false, armor: 0, motorTransport: "rearOnly" },
    ijaPool: 260,
    // 手榴弹经济：手榴弹是主武器，步枪是奢侈品。**「无枪」是合法初始状态。**
    // 日方记川军三分之一以上没有步枪，各自带手榴弹约六发。
    loadoutOverride: {
      primary: null, secondary: null, melee: "Dadao",
      throwables: { Grenade: 6 }, spareClips: 0,
      note: "出川时领的：一条布袋，六颗手榴弹。枪要从倒下的人身上捡。",
    },
    scavengeRifle: true,
  },
  L1_Beishahe: {
    bounds: { minX: -620, maxX: -230, minZ: -250, maxZ: 210 },
    zones: ["SecondLine", "Dawn", "XiguanStation", "PowerPlant", "WestGate"],
    // 朝南：西关沿贴城津浦路一路南撤，车站与通信队就在西门外。
    spawn: { x: -480, z: -205, ry: Math.PI },
    ijaPressure: 1.15, ijaSpawn: ["north"], ijaSupport: ["artillery", "hmg"],
    ijaForce: { lmgEvery: 13, hmgTeams: 1, engineers: false, armor: 0, motorTransport: "rearOnly" },
    ijaPool: 300,
    loadoutOverride: {
      primary: "HanYang", secondary: null, melee: "Dadao",
      throwables: { Grenade: 5 }, spareClips: 3,
      note: "捡来的汉阳造。桥夹三个，打完就没有了。",
    },
  },
  L2_Dongguan: {
    // 寺院地按布防图位于东北延伸框；切片必须把完整东侧 13 框一起纳入，
    // 否则 Temple 路标会在关卡外、北部五框也只在总览里存在。
    bounds: { minX: 250, maxX: 620, minZ: -520, maxZ: 420 },
    zones: ["ZhaiGate", "Courtyard", "Temple", "Breach"],
    // 东门大街的清路中央，避开两侧门前家什；朝东正对东关门与缺口。
    // 【2026-08-27】原来在 x=432：城防图东侧重建（Data_Tengxian 的
    // FirstDistrictNorthEastA/B 两排）把第一区公所那两块院区一直铺到 x=434，
    // 于是这个出生点落进了院子里 —— 人贴着院墙东面 1.8 m，开局满屏是砖，
    // 按 W 走不出一米。和 L3 那次「站在寺院檐下」是同一类事故（见下一关注释）。
    // 挪到院区东墙外 12 m 的东门大街上，仍在东关大街路口以西、路标圈外。
    spawn: { x: 446, z: EAST_SUBURB.roadZ, ry: -Math.PI / 2 },
    ijaPressure: 1.5, ijaSpawn: ["east"], ijaSupport: ["launcher", "hmg", "artillery"],
    // 日军战详报：工兵逐间爆破民房打通墙体；联队炮四门在土城子西侧，
    // 重机枪沿河西岸配置。没有战车或装甲车参加滕县攻城。
    ijaForce: { lmgEvery: 13, hmgTeams: 2, engineers: true, armor: 0, motorTransport: "rearOnly" },
    ijaPool: 420,
    loadoutOverride: {
      primary: "HanYang", secondary: null, melee: "Dadao",
      throwables: { Grenade: 6 }, spareClips: 4,
      note: "木柄手榴弹六枚；东关靠密集投弹和院墙，不靠并不存在的反坦克集束弹。",
    },
  },
  L3_Fanji: {
    // 比 L2 只裁掉南部延伸：保留布防图东北寺院地至东门的完整北段巷网。
    // **调 draw call 优先调 bounds，不是调 detailRadius** ——
    // 实测把 detailRadius 从 100 压到 62，三角形掉了 24% 而 calls 反而涨了：
    // 院落从 detail 掉到 silhouette 之后进的是**按扇区分批**的远景 sink，
    // 扇区多一个就多一批。少生成才是少 draw call，降细节不是。
    bounds: { minX: 250, maxX: 600, minZ: -520, maxZ: 170 },
    zones: ["Temple", "Lane", "GateRetake", "EastGateIn"],
    // 出生点要**出**寺院的屋檐：原来站在 (414,-76)，正压在寺院地那座
    // 26×22 m 房子的檐下，出图上是一条横贯全屏的黑带（屋顶的背面）。
    // 第二区纵向巷（生成器 x≈456 m 的明确车道）上，离寺院院墙留出 30 m 以上；朝寺院集合。
    spawn: { x: 456.6, z: -128, ry: Math.atan2(-48, -42.6) },
    // 夜里日军火力优势削掉一半 —— 全局唯一一次玩家在交换比上占便宜的时段
    ijaPressure: 0.85, ijaSpawn: ["east"], ijaSupport: ["hmg"],
    ijaForce: { lmgEvery: 13, hmgTeams: 1, engineers: true, armor: 0, motorTransport: "rearOnly" },
    ijaPool: 300, nightRaid: true,
    loadoutOverride: {
      primary: "HanYang", secondary: "Mauser96", melee: "Dadao",
      throwables: { Grenade: 6 }, spareClips: 3,
      note: "夜袭携行仍按约六枚木柄手榴弹；白刃是近距补充，不是无限火力。",
    },
  },
  L4_Chengqiang: {
    // 城墙关卡要能验证四条上城道和完整的城防图外轮廓，因此生成四面墙；
    // 东南主战区仍由 spawn 与 zones 控制，不靠裁掉北墙来省几百个三角形。
    // 西界必须越过津浦路与西关全部生活布设（最西一件 x=-502.6）：这一关也是
    // 编辑器核对整座城防外轮廓的总览切片，旧 minX=-360 只剩西城门外一小截空地，
    // 车站、通信队、电灯厂、交易所和西关大街因此在俯视验收里整片消失。
    // 俯瞰验收要把「城内 → 东门 → 东关 → 农田/远端农院」一次收全；
    // 额外 24 m 留给 EastFarmFar 的屋檐、院墙和生活道具，不让边缘件被裁半。
    bounds: { minX: -520, maxX: EAST_FIELD.bounds.maxX + 24, minZ: -360, maxZ: 400 },
    zones: ["Rampway", "Rampart", "SouthWall", "SouthBreach"],
    spawn: { x: 276, z: GATE("East").z, ry: Math.PI / 2 },
    ijaPressure: 1.7, ijaSpawn: ["east", "south"], ijaSupport: ["artillery", "launcher", "hmg"],
    ijaForce: { lmgEvery: 13, hmgTeams: 2, engineers: true, armor: 0, motorTransport: "rearOnly" },
    ijaPool: 480,
    // 龙泉塔上的观测班：十时之后落弹从随机变成「跟着你走」。塔打不掉，只能拖。
    spotter: { fromLevelSeconds: 240, at: [620, 210], note: "3/17 10 时日军观测班占领城东龙泉塔" },
    loadoutOverride: {
      primary: "HanYang", secondary: null, melee: "Dadao",
      throwables: { Grenade: 4 }, spareClips: 3,
      note: "守了两昼夜，木柄手榴弹只剩四枚；没有集束弹，也没有可打的战车。",
    },
  },
  L5_Shizijie: {
    // 西门、十字街口与西门大街共用 z=0 的直瞄轴；县署前街与其余门位仍保留错位。
    bounds: { minX: -325, maxX: 285, minZ: -190, maxZ: 140 },
    // 出生点站在原点十字街口，正对西城门楼的贴地火力走廊。
    cameraFar: 400,
    zones: ["Crossroad", "Yamen", "WestStreet", "WestGateInner"],
    spawn: { x: 62, z: CROSSROAD.z, ry: Math.PI / 2 },
    ijaPressure: 1.9, ijaSpawn: ["west", "south"], ijaSupport: ["hmg", "launcher"],
    ijaForce: { lmgEvery: 13, hmgTeams: 2, engineers: true, armor: 0, motorTransport: "rearOnly" },
    ijaPool: 460,
    corridorGun: { x: -300, z: CROSSROAD.z, y: 13.0, note: "3/17 17 时日军夺西城门楼后沿西门大街向十字街口扫射" },
    loadout: "L4_LastFiveMinutes",
  },
  L6_Beimen: {
    bounds: { minX: -360, maxX: 340, minZ: -640, maxZ: 200 },
    zones: ["WestBarbican", "NorthStreet", "NorthGate", "WheatField"],
    detailRadius: 70, midRadius: 170,
    // 朝西：第一个目标是「跟着人流去西门」（挤不出去）
    spawn: { x: -286, z: GATE("West").z, ry: Math.PI / 2 },
    ijaPressure: 0.6, ijaSpawn: ["west"], ijaSupport: [],
    ijaForce: { lmgEvery: 13, hmgTeams: 0, engineers: false, armor: 0, motorTransport: "rearOnly" },
    ijaPool: 240,
    // 脱离战斗：武器栏清空、瞄准失效，唯一的动作是走和拽人。
    disarmed: true,
    loadoutOverride: {
      primary: null, secondary: null, melee: null, throwables: {}, spareClips: 0,
      note: "弹药：无。",
    },
  },
};

/**
 * 七关。史料字段一律从 LEVELS 取，打法字段从 TUNING 取 —— 两边不重叠，
 * 所以「改了剧本忘了改关卡表」这类错在结构上就发生不了。
 */
export const PHASES = LEVELS.map((level) => {
  const t = TUNING[level.id];
  if (!t) throw new Error(`Data_Battle: 关卡 ${level.id} 没有打法配置`);
  return {
    id: level.id,
    level,
    date: level.date,
    label: level.title,
    place: level.place,
    sky: level.sky,
    music: level.music || null,
    minutes: level.minutes,
    brief: level.brief,
    story: level.id,                 // 叙事层直接按关卡 id 装载，不再有翻译表
    cutsceneIn: level.cutsceneIn || null,
    cutsceneOut: level.cutsceneOut || null,
    objectives: level.objectives,
    mechanic: level.mechanic,
    // 「城里还站着的人」：史料只给三个锚点，逐关数值是推定，
    // 登记在 Data_TengxianScript.PRESUMED_STAGING 的 poolCurve
    nraPool: level.pool.start,
    poolGain: level.pool.gain || 0,
    ...t,
    zones: t.zones.map((id) => {
      const zone = ZONES[id];
      if (!zone) throw new Error(`Data_Battle: ${level.id} 引用了不存在的路标 ${id}`);
      return zone;
    }),
  };
});

/**
 * 收场文本。**不打歼敌数** —— 中日双方口径至今没有定论，那是宣传数字不是史实。
 *
 * 两条并列的地方（见 Data_TengxianScript.CREDITS）不在这里展开，这里只说事实：
 * 城陷了，突围出去约五百人，而这几天里第五战区把台儿庄的部署摆完了。
 * 「滕县之守与台儿庄之捷的因果」有两种口径，收场文本不选边 ——
 * 只说时间上的先后，不说因果。
 */
export const EPILOGUE = {
  breakout: [
    "一九三八年三月十七日夜，幸存守城部队自行突围。",
    "第 727 团 3 营副营长侯子平指挥扒开已屯闭的北城门。",
    "日军未追击。",
    "",
    "十八日午前，日军肃清城内。",
    "第 122 师师长王铭章、参谋长赵渭滨于十七日殉国。",
    "",
    "城内约三千人，能打的不足两千，走出去的约五百。",
    "绝大多数没有留下名字。",
  ],
  wipedOut: [
    "城里没有人可以填上去了。",
    "",
    "史实里这一天还没有结束 —— 十七日夜，还有约五百人从北门走了出去。",
    "",
    "第 22 集团军是川军。出川时没有钢盔，三分之一以上没有步枪。",
  ],
};

/** 按 id 取一关（调试口与测试用）。 */
export function FindPhase(id) {
  return PHASES.find((p) => p.id === id) || null;
}

/**
 * 打法层推定值登记表 —— 与 Data_Tengxian.PRESUMED 同一套纪律：
 * **凡在这里登记的数，游戏内任何文本都不许说成史实。**
 */
export const PRESUMED_TUNING = [
  { id: "zoneCoordinates", value: "ZONES 全表",
    note: "路标坐标。地名来自史料，具体到米的位置来自 Data_Tengxian 的图纸，而图纸本身已标注哪些是推定" },
  { id: "levelBounds", value: "TUNING[*].bounds",
    note: "每关生成哪一片。纯工程量（draw call 预算），与史实无关" },
  { id: "lodRadius", value: "TUNING[*].detailRadius / midRadius",
    note: "LOD 分界。纯工程量，与史实无关" },
  { id: "ijaPool", value: [260, 300, 420, 300, 480, 460, 240],
    note: "日方兵员池。史料给的是「一个不满员的步兵联队 + 师团级炮兵群」，没有逐时段兵力数" },
  { id: "ijaPressure", value: [1.0, 1.15, 1.5, 0.85, 1.7, 1.9, 0.6],
    note: "压力系数，纯难度曲线。唯一有史料支撑的形状是 L3 那一档低于两边——「夜里日军火力优势削掉一半」见张宣武回忆" },
  { id: "ijaForce", value: "TUNING[*].ijaForce",
    note: "日军合成攻击编组。步兵分队约十三人配一挺十一年式轻机枪是编制参照；每关可见重机枪组数、出现位置与后方运输呈现为玩法推定。装甲数为零是滕县攻城战的史实约束：34 辆九四式配属临城方向，战车队 3 月 26 日后才用于台儿庄" },
  { id: "loadout", value: "TUNING[*].loadoutOverride",
    note: "携行。「三分之一以上没有步枪、各带手榴弹约六发」为日方记载，具体到每关发几颗、几个桥夹是推定" },
  { id: "spawn", value: "TUNING[*].spawn",
    note: "玩家开局站位。史料不记二等兵站在哪儿" },
  { id: "spotterDelay", value: 240, unit: "s",
    note: "L4 落弹变准的时刻。史料只说 3/17 10 时观测班占领龙泉塔，折算成关内秒数是设计值" },
];

/**
 * 兵员池：「死了换一个人接着打」。
 *
 * 这不是无代价复活 —— 每换一个人，池子少一个。池子的名字叫**「城里还站着的人」**，
 * 而这座城的结局是必然陷落的：数字只会往下走，全局唯一一次上涨是第一关末尾
 * 收容第 127 师 757 团残部（史料只说「数百人」，加多少是推定）。
 *
 * 逐关数值见 Data_TengxianScript.LEVELS[*].pool，全部登记为推定。
 * **不许拿它当伤亡统计**：它是一个班排级切片，不是全城三千人。
 */
export const REINFORCE = {
  poolLabel: "城里还站着的人",
  respawnDelayS: 4.5,
  // 线性关卡里换关不做橡皮筋补给：池子按剧本给的曲线走，
  // 打得好也不会多出人来 —— 这座城里没有后方。
  intelRequiresZone: false,
  // 阵亡卡片：全屏黑底白字两秒半，然后接管另一个人。
  deathCardSeconds: 2.6,
  // 池子见底时的那一句。三月十七日下午城里真的到过这一步。
  lastDitchAt: 0.12,
  lastDitchLine: "伙夫、马夫、担架兵，能拿枪的都编上来了。城里没有后方了。",
};

/**
 * 姓名池：籍贯按第 22 集团军的实际构成 —— **这是一支川军**。
 *
 * 第 41 军、第 45 军皆出四川，一九三七年秋徒步出川，娘子关下来之后一直没补充过。
 * 玩家所属的第 122 师 364 旅 727 团 3 营是这支部队的骨架番号（史料）。
 * 具体县名的分布是推定：只保证「都是四川人」这一条是史实。
 */
export const NAME_POOL = {
  surnames: ["李", "刘", "王", "张", "陈", "杨", "黄", "周", "何", "罗",
    "郑", "谢", "邱", "唐", "彭", "廖", "曾", "蒋", "冯", "邓"],
  given: ["长顺", "茂才", "守成", "三娃", "幺弟", "德全", "永富", "开元", "洪福", "金山",
    "老幺", "满仓", "元清", "怀安", "国章", "有德", "定坤", "少云", "秉章", "光武",
    "顺清", "跟娃", "四海", "石头", "青山", "云飞", "长庚", "汉卿", "禄生", "举人"],
  origins: [
    { place: "四川三台", weight: 3 }, { place: "四川射洪", weight: 2 }, { place: "四川安岳", weight: 2 },
    { place: "四川资中", weight: 2 }, { place: "四川内江", weight: 2 }, { place: "四川简阳", weight: 2 },
    { place: "四川遂宁", weight: 2 }, { place: "四川南充", weight: 2 }, { place: "四川蓬溪", weight: 1 },
    { place: "四川广安", weight: 1 }, { place: "四川渠县", weight: 1 }, { place: "四川营山", weight: 1 },
  ],
  // 川军的枪：汉阳造最多，中正式极少，捷克式是全连的宝贝。
  // 「三分之一以上没有步枪」是日方记载 —— 这个比例本身就是史实，
  // 所以第一关的携行里 primary 是 null，不是难度设计。
  weapons: [
    { id: "HanYang", weight: 7 },
    { id: "ZhongZheng", weight: 2 },
    { id: "Zb26", weight: 1 },
  ],
};

/** 战场规模三档。开局跑一次性能探针自动推荐。 */
export const SCALE_PRESETS = {
  small: { label: "小（40 人）", maxAlive: 40, vfxBudget: 2200, shadow: 2048 },
  medium: { label: "中（70 人）", maxAlive: 70, vfxBudget: 3400, shadow: 2048 },
  large: { label: "大（110 人）", maxAlive: 110, vfxBudget: 4200, shadow: 4096, warn: "需要较好的设备" },
};

/**
 * 玩家能下的命令。按住 Tab 出**径向轮盘**（Script_Wheel，纯 Canvas 2D，零 3D 开销），
 * 推鼠标指方向、松手下令；轮盘打开期间按 Digit1-8 直选，作为兜底与可访问性通道。
 *
 * 八条对齐 ER2 的十二条指令表里我们够得着的那些。key 字段既是数字键，
 * 也是轮盘上那一格右下角印的数字 —— 两者必须是同一个数，别各写一份。
 */
export const ORDERS = [
  { id: "follow", key: "1", label: "跟我来", hint: "跟在你身后，不主动脱离" },
  { id: "advance", key: "2", label: "向前", hint: "向你瞄的方向逐段跃进" },
  { id: "hold", key: "3", label: "固守", hint: "就地找掩体，不再前进" },
  { id: "spread", key: "4", label: "散开", hint: "拉开间距，防掷弹筒" },
  { id: "flank", key: "5", label: "绕过去", hint: "从侧面兜过去，别正面顶" },
  { id: "charge", key: "6", label: "上刺刀", hint: "白刃冲锋，最后一手" },
  // 潜行 = ER2 的 Covert Movements：全班照班长的姿态走，而且不开枪。
  // 你趴他们也趴 —— 加上"卧倒的人四十五米外看不见"，夜袭那一关才真的是夜袭。
  { id: "covert", key: "7", label: "潜行", hint: "照你的姿态走，不许开枪" },
  // 要炮不走 IssueOrder（那是给弟兄下令的通道），装配层单独分流到 CallMortar。
  // F 键腾给通用交互之后，这是叫炮唯一的入口。
  { id: "callFire", key: "8", label: "要炮", hint: "往你瞄的地方打一发迫击炮" },
];

/**
 * 支援。**不对称是史实，而且在滕县比在任何一处都更极端**：
 * 第 22 集团军是川军，出川时轻装、娘子关下来之后未获补充，
 * 全师几乎没有炮；对面是一个不满员的步兵联队**背后拖着一个师团级的炮兵群**，
 * 外加掷弹筒、九二式重机与侦察机。这里不能写成战车火力：滕县攻城时
 * 濑谷支队未配属战车或装甲车，汽车运输只在后方，不作为城区突击单位。
 * 迫击炮这一条留着，但只有两发 —— 有比没有更说明问题。
 */
export const SUPPORT = {
  nra: [
    {
      id: "mortar", name: "迫击炮", weapon: "八二迫击炮",
      uses: 2, cooldownS: 150, delayS: 9, radius: 14, damage: 95,
      note: "全师的炮弹是数得过来的。打完这两发就没有了。",
    },
    {
      id: "runner", name: "传令兵", weapon: "两条腿",
      uses: 3, cooldownS: 70, delayS: 14, radius: 0, damage: 0,
      effect: "reinforceSquad",
      note: "没有无线电。要人只能派人跑回去要。",
    },
  ],
  ija: [
    { id: "launcher", name: "掷弹筒", intervalS: 14, radius: 5, damage: 110, warnS: 1.6 },
    { id: "artillery", name: "联队炮与师团炮兵", intervalS: 42, radius: 11, damage: 160, warnS: 2.6,
      note: "日军战详报记联队炮四门架于土城子西侧；口径与每发间隔不据此断言。" },
  ],
};

/**
 * 压制与伤口的数值。
 * 这里**没有士气**：屏幕上出现一条「中国守军士气条」在立场上是灾难。
 * 原来的 moraleBreakAt 定义了却全仓库一行没读，已删；班组密度那个量改叫
 * Soldier.cohesion，留在 AI 内部，永不出 UI。
 */
export const COMBAT = {
  suppressPerNearMiss: 0.16,
  suppressRadius: 2.6,
  suppressDecayPerS: 0.55,
  suppressAccuracyPenalty: 1.3,       // 散布乘数上限
  bleedPerWound: { head: 6, torso: 2.6, arm: 1.4, leg: 1.4 },
  bandages: 2,
  aiReactionS: [0.45, 1.2],
  // 0.55 是"一枪一个"的量级。1938 年的三八式配机械瞄具、打一个会动会卧倒的目标，
  // 这个数字站不住；实测出生点 27 m 上九个人同时开火，玩家三秒就没了。
  aiAccuracyBase: 0.26,
  aiAccuracySuppressed: 0.08,
  // 同时把玩家当目标的敌人上限。ER2 的 AI 会分散目标，不会九个人焊死一个人。
  // 这一条比调命中率更管用：它把"每秒挨四发"变成"每秒挨一发多一点"。
  maxShootersOnPlayer: 3,
  // 出生保护（秒）。ER2 有这条，防出生点秒杀。
  spawnGraceS: 3.2,

  /**
   * 「打玩家」这一侧的口径。**以前不存在**：三处魔法数各写各的 ——
   * Script_Ai 的枪伤 ×0.55、白刃 ×0.5，Script_Combat 的爆炸 ×0.7，
   * 而部位倍率（爆头 ×3.4）躺在 Script_Player.TakeHit 里。三处没有一处
   * 知道合起来是多少，于是实算出来是这样的：
   *
   *   · 三八式命中躯干 72×0.55 = 39.6，三发一条命；
   *   · 爆头 8% 概率 × 3.4 = 134.6 —— **满血一枪直接毙**，
   *     也就是说任何一次交火，第一发就可能是结局；
   *   · 三个射手（maxShootersOnPlayer）在 25 m 上合计 ≈ 14.8 HP/s，
   *     加上伤口流血（三个躯干伤口就是 7.8 HP/s、且几乎不自愈），
   *     从满血到死 5—6 秒，其中大半时间屏幕上什么都没发生 ——
   *     暗角是 health<70 才开始亮的，而 70 到 0 只隔两发。
   *
   * 所以这一条不是"调低难度"，是把三件坏事分开修：
   *   ① 单发不许致死（maxBulletDamage + 压低爆头倍率与爆头概率）——
   *      玩家至少要有一次"我中弹了"的知觉，才谈得上做决定；
   *   ② 每发轻一点、流血封顶，把靶场 TTK 从 5—6 s 拉到 9—13 s；
   *   ③ firstShotGraceS：刚锁上玩家的那一发必偏 —— 老兵从冷瞄具到第一发
   *      本来就不准，而对玩家这一发是"子弹先从耳边过"的预警。
   * 三条都在数据层，改这里就够，别再往逻辑里写第四个魔法数。
   */
  player: {
    /**
     * 命中率单独给玩家一档。
     *
     * 不去动 aiAccuracyBase 是有原因的：那个数同时决定**日军和中国兵互相怎么打**，
     * 全场七十个人的消耗速度、阵地什么时候被啃穿、票池掉多快，全挂在它上面。
     * 为了让玩家好受一点去调它，等于把整场仗的强度一起改了。
     * 玩家这一侧另有理由：他是一个人对一条战线，而且没有"被打中就趴下"的
     * AI 行为兜底 —— 同样的命中率落在他身上就是纯粹的秒表。
     */
    accuracyScale: 0.70,
    bulletScale: 0.33,          // AI 枪伤 → 玩家（三八式 72 → 23.8 躯干，四发多一条命）
    meleeScale: 0.42,           // 刺刀 110 → 46.2：重，但不是读盘
    blastScale: 0.55,           // 爆炸威力 → 玩家
    headChance: 0.035,          // AI 打玩家爆头的概率（AI 打 AI 仍是 0.08）
    headMultiplier: 2.0,        // 爆头倍率（对 AI 仍是 3.4）
    torsoMultiplier: 1.0,
    limbMultiplier: 0.50,
    // 单发对玩家的硬上限。这是**安全网**不是活动约束：现在最重的一发是
    // 九二式重机爆头 92×0.33×2.0 = 60.7，刚好在它下面。留着是为了将来谁往
    // Data_Weapons 里加一支更重的枪时，"满血挨一枪必活"这条不会被悄悄推翻。
    maxBulletDamage: 62,
    bleedScale: 0.50,           // 伤口出血速率 → 玩家
    maxBleedPerS: 5.5,          // 流血封顶：伤口叠加不许变成必死的秒表
    firstShotGraceS: 1.1,       // 刚锁上玩家的这段时间内开的枪一律打偏
  },
};

/**
 * 难度。**一个对象被所有系统读取，绝不把难度硬编码进各处逻辑。**
 *
 * 这一批只接了跟"枪的手感三件套"直接相关的几项（弹道重力、瞄准、
 * 过热），其余字段先立在这里占位，等做难度面板那一批再逐条接上去 ——
 * 立在这里是为了让后人往同一个地方加，而不是又在七处写死一个魔法数。
 *
 * 两条写死的：
 *  · autoSurrender 恒 false 且不给用户开。ER2 写实档下玩家会被系统判定投降，
 *    我们不做 —— 这座城里的人是打到最后一批才从北门扒开土袋走出去的，
 *    让系统替玩家决定「他投降了」会直接摧毁这件事。
 *    （ER2 自己也提供了关掉这条的开关。）
 *  · 标准 FPS 的屏幕中心是唯一瞄准基准：默认预设全部关闭自由瞄准与铁瞄偏心。
 *    枪体可以做表现性摆动，但弹道、HUD 准心与满开镜机械瞄具必须共轴。
 *
 * hitMarker（2026-08-20 接上）：屏幕中央那一记命中/击杀记号。
 * docs/Data_GunFeelReview.md 的裁决表原来写「默认关，做成难度选项」——
 * 实跑之后这条判错了：写实档没有准心，远距离目标反馈仍然很弱，
 * 于是「我这一枪到底打没打中」在四十米以外没有任何一条通道能回答。
 * 血雾在一百米上是两三个像素，impactFlesh 走 inverse 衰减（refDistance 3.5、
 * rolloff 0.9）到八十米只剩出厂音量的 4.8%，在几十条枪的底噪里等于没有。
 * 所以改成：体验/标准两档默认**开**，写实档关（那一档只留听觉确认）。
 * 听觉确认（hitConfirm / killConfirm）不挂难度，三档都给 —— 它是这条通道的底线。
 *
 * targetInfo（2026-08-25 接上）：准心指着谁（Script_Identify）——
 * 敌人给番号/兵种 + 枪 + 距离，自己人给姓名 + 岁数 + 距离（枪对自己人是没用的信息）。
 * 同一条理由的另一半：七十米外敌我只有一个剪影，而步枪打得到五百米。
 *   · "full"  体验档：连血条一起给；
 *   · "basic" 标准档：两行字，伤情只给"负伤"两个字，不给数字；
 *   · false   写实档：整条链短路，不扫不投射 —— 那一档本来就没有准心。
 */
export const FREE_AIM_STEPS = [0, 1.2, 2.0, 3.5];

export const DIFFICULTY_PRESETS = {
  experience: {
    id: "experience", label: "体验",
    aiAccuracy: 0.70, playerDamage: 0.80, suppressionScale: 0.6,
    bulletGravity: 0.5, freeAimDeg: 0, ironSightOffset: 0,
    staminaSeconds: 12, overheat: true, autoSurrender: false,
    showCrosshair: true, enemyMarkers: true, hitMarker: true, targetInfo: "full",
  },
  standard: {
    id: "standard", label: "标准",
    aiAccuracy: 1.0, playerDamage: 1.0, suppressionScale: 1.0,
    bulletGravity: 1.0, freeAimDeg: 0, ironSightOffset: 0,
    staminaSeconds: 8, overheat: true, autoSurrender: false,
    showCrosshair: true, enemyMarkers: false, hitMarker: true, targetInfo: "basic",
  },
  realistic: {
    id: "realistic", label: "写实",
    aiAccuracy: 1.15, playerDamage: 1.25, suppressionScale: 1.3,
    bulletGravity: 1.0, freeAimDeg: 0, ironSightOffset: 0,
    staminaSeconds: 5, overheat: true, autoSurrender: false,
    showCrosshair: false, enemyMarkers: false, hitMarker: false, targetInfo: false,
  },
};

/** 运行时那一份（可被难度面板改写）。默认标准档。 */
export const DIFFICULTY = { ...DIFFICULTY_PRESETS.standard };

/** 换档。autoSurrender 永远被强按回 false —— 不接受任何预设把它打开。 */
export function ApplyDifficulty(presetId) {
  const preset = DIFFICULTY_PRESETS[presetId];
  if (!preset) return DIFFICULTY;
  Object.assign(DIFFICULTY, preset);
  DIFFICULTY.autoSurrender = false;
  return DIFFICULTY;
}
