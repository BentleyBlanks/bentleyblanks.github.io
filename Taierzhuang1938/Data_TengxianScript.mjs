// 《滕县 1938》剧本 —— 七章的目标链、节拍、台词、人物表，与全部过场的分镜。
//
// **纯数据，不许 import three**（Node 里要能直接 import：自检、导词表、
// 考据比对都读这一份；一旦沾上 three，命令行工具就得拖起整个渲染库）。
//
// ---------------------------------------------------------------------------
// 2026-08-28 任务流程重制：这一份不再自己写关表，改成**组装层**。
//
//   七章各自一个文件：Data_MissionCh0.mjs … Data_MissionCh6.mjs，
//   每份导出 CHAPTER（史料字段 + zones + beats + tuning 打法字段）与 VOICE_LINES。
//   这里只做三件事：
//     1. 把七份 CHAPTER 的**史料层**摊成 LEVELS（打法字段一个都不带过来 ——
//        它们由 Data_Battle.mjs 从同一份 CHAPTER.tuning 取，两边不重叠，
//        「改了剧本忘了改关卡表」这类错在结构上就发生不了）；
//     2. 汇总过场（旧五场保留但从正片流程脱钩，新六章各自一份占位）；
//     3. 汇总人物表与推定值登记表。
//   施工口径：docs/Data_MissionRemake.md（唯一口径，§10 是工程契约）。
//
//   旧七关（L0_Jiehe … L6_Beimen）的关表与台词整份删除，git 历史里有。
// ---------------------------------------------------------------------------
//
// 施工底本：docs/Data_MissionRemake.md（本轮）、docs/Data_TengxianDesign.md（上一轮，留档）
// 考据底本：docs/Data_TengxianTimeline.md（逐日过程与指挥链，三档可信度）
// 世界坐标：Data_Tengxian.mjs（X 向东，Z 向南，Y 向上，原点 = 城中心十字街口）
//
// ---------------------------------------------------------------------------
// 编剧红线（违反任何一条都是史实事故，不是风格问题）
//
//   1. 时间线锁死：3/14 拂晓外围攻击 → 3/15 收缩入城 → 3/16 东关拉锯、夜间夺回
//      东关门 → 3/17 南城墙被轰开、西门楼失守、王铭章殉国 → 3/17 21 时北门突围
//      → 3/18 午前后枪声停止。**不许为关卡节奏挪动任何一天。**
//   2. 必败。玩家是二等兵，能改变的只有「这一小时守不守得住」。
//      不设翻盘分支、不设隐藏结局、不设「守住滕县」的成就。
//   3. **不演王铭章举枪自尽**（理由见 CUTSCENES.CS_WangMingzhang 的长注释，
//      那段注释是写给以后想「纠正」回去的人看的，别删）。
//   4. 汤恩伯那一场只呈现命令与时间，不下判决。全场无角色开口。
//   5. 称谓：官对兵「弟兄们」；兵对官按职务（师长／团长／营长／连长）。
//      **禁「师座」「军座」，禁「同志们」。** 日军不把「八格牙路」当口头禅，
//      日方文书与口语称中国军队「支那兵」。
//   6. 结算不打精确歼敌数。只打三个可验证量：守住时长、阵地易手次数、
//      随你活着出城的人数。
//   7. 台儿庄那一套（四米寨墙、六门、运河、浮桥、清真寺）整个作废，不许复用。
//
//   另有三条滕县专属：守军无钢盔（竹斗笠／布军帽、草鞋、绑腿，三分之一以上无步枪）；
//   攻城战里没有坦克没有装甲车（濑谷支队攻城未配属战车部队）；
//   没有机群轰炸（合理表现是几架侦察机盘旋，偶尔丢轻型炸弹）。
// ---------------------------------------------------------------------------
//
// tier 字段是**可信度分档**，不是装饰：
//   "信史"     档案原件／1938 年当时报刊电文／中日双方战斗详报可对勘
//   "主流"     回忆录、口述、文史资料，链条清楚但无同时代文件背书
//   "转述"     角色转述上面两档的内容（措辞是虚构的，事实是有据的）
//   "虚构"     史料没写、但不与史料冲突的承接句。**不得承载事实断言。**
//   "提示"／"系统"／"环境"  非台词的 UI 文本
// 凡 tier==="虚构" 的行都不许被引用为史料；凡带 presumed:true 的数值都不许
// 在游戏内任何文本里说成史实（登记表见文件末尾 PRESUMED_STAGING）。

// ===========================================================================
// 人物表
// ===========================================================================

/**
 * real:true 的人只做史料里有的事。
 * real:false 的人用来承担「无名者」的分量 —— 城内约三千人里绝大多数没有留下名字。
 *
 * 班长邱茂才与连长杨守成两个名字由设计书写死（docs/Data_TengxianDesign.md 关卡表），
 * 这里照抄，不许改名，改了下游按名字对台词的自检会漏。
 */
export const CAST = {
  // --- 任务流程重制的班组（docs/Data_MissionRemake.md §8 人物速查）---------
  // 配音与 beats 的 who 一律用这些 id（契约 §10.2）。
  shunzi: {
    name: "谢长顺", short: "顺子", real: false,
    note: "玩家。第 122 师 364 旅 727 团 3 营 9 连二等兵，赶场路上被绳子捆来的壮丁。籍贯与连别为推定",
  },
  luo: {
    name: "罗茂才", short: "罗班长", real: false,
    note: "9 连 3 班班长，四川人。老兵，出川那一趟从头走到尾。四关夜战救顺子时腹部中弹牺牲",
  },
  yaowa: {
    name: "", short: "幺娃", real: false,
    note: "班里最年轻的一个。前期模仿老兵骂人，日机扫射后第一个失控大骂；最怕黑、最想家",
  },
  heyoutian: {
    name: "何有田", short: "何有田", real: false,
    note: "最爱吹牛说笑（三个婆娘）。二关白刃战后呕吐；后期脏话越重、话越少。只有姐姐给他写过信",
  },
  liuwencai: {
    name: "刘文财", short: "刘文财", real: false,
    note: "斤斤计较、什么都数。后期数数变成控制恐惧的方式：机枪还剩多少、还有几副担架",
  },
  xiaoqin: {
    name: "", short: "小秦", real: false,
    note: "通信兵。护线、接电话、骂踩线的。五关末视角③、终章的玩家角色，随王铭章殉难倒下",
  },
  zhaodegui: {
    name: "赵德贵", short: "赵德贵", real: false,
    note: "老成持重。管弹药纪律，接想家的话头",
  },
  paizhang: {
    name: "", short: "排长", real: false,
    note: "负伤排长。五关下达「出了西关不用再回来」的军令",
  },
  junyi: {
    name: "", short: "军医", real: false,
    note: "军医／卫生兵。只处理战伤（刘文财牙痛没人理）",
  },
  s124: {
    name: "", short: "伤兵", real: false,
    note: "第 124 师伤兵，三七二旅的。五关视角①的机枪副射手",
  },
  danjiayuan: { name: "", short: "担架员", real: false, note: "虚构，无名" },
  shangbing: { name: "", short: "伤员", real: false, note: "虚构，无名" },
  junguan: { name: "", short: "军官", real: false, note: "兵站军官。序章「第五战区肯接，还给了枪弹」" },
  canmou: { name: "", short: "参谋", real: false, note: "通信参谋。终章复诵最后电文" },
  ija_gunso: { name: "", short: "军曹", real: false, note: "日军军曹。台词走日语分支（VoiceBake 的假名支）" },
  // --- 上一轮的班组（旧关表已删，条目保留：旧过场的 who 仍指着它们）--------
  player: {
    name: "谢长顺", short: "长顺", real: false,
    note: "第 122 师 364 旅 727 团 3 营 9 连 二等兵，四川三台人，十八岁。籍贯为推定",
  },
  qiu: {
    name: "邱茂才", short: "班长", real: false,
    note: "9 连 3 班班长，四川人。老兵，出川那一趟从头走到尾",
  },
  yang: {
    name: "杨守成", short: "连长", real: false,
    note: "9 连连长，四川人",
  },
  // --- 真实历史人物 ---------------------------------------------------------
  // 契约 §10.2 的 id（新章一律用这个）；旧过场仍用 wang，两条指同一个人。
  wangmingzhang: {
    name: "王铭章", short: "师长", real: true,
    note: "第 122 师师长／第 41 军前方总指挥。3 月 17 日殉国。终章：追问战况、「那就发」「收起」，西关电灯厂殉国",
  },
  wang: {
    name: "王铭章", short: "师长", real: true,
    note: "第 122 师师长／第 41 军前方总指挥（职务三说并列：代军长／前方总指挥／第二线指挥官）。3 月 17 日殉国",
  },
  zhao: {
    name: "赵渭滨", short: "参谋长", real: true,
    note: "第 122 师参谋长，少将，时年 44 岁。3 月 17 日殉国（有绝笔家书传世，信史）",
  },
  zhang: {
    name: "张宣武", short: "团长", real: true,
    note: "第 727 团团长，被王铭章任命为滕县城防司令。1983 年起的文史回忆是本役中方骨架史料",
  },
  yan: {
    name: "严翊", short: "营长", real: true,
    note: "第 731 团 1 营营长。东关缺口密集投弹堵口就是这个营干的",
  },
  hou: {
    name: "侯子平", short: "副营长", real: true,
    note: "第 727 团 3 营副营长。3 月 17 日 21 时指挥扒开北城门突围",
  },
  // --- 只出声不出场 ---------------------------------------------------------
  adjutant: { name: "", short: "副官", real: false, note: "虚构，无名。只在 CS_WangMingzhang 画外喊一句" },
  runner: { name: "", short: "传令兵", real: false, note: "虚构，无名" },
  crowd: { name: "", short: "", real: false, note: "西门瓮城里挤着的人，无名无脸" },
  narrator: { name: "", short: "", real: false },
};

// ===========================================================================
// 章表（七章）—— 组装层
// ===========================================================================

// 七章一律用**命名空间导入**：不是所有章都导出 EVENTS（序章没有事件线、
// 第二关那一条写在文件头注释里），而具名 import 一个不存在的导出是**链接期
// SyntaxError** —— 整个页面起不来，而且报错指向这一行，不指向缺导出的那一章。
import * as M0 from "./Data_MissionCh0.mjs";
import * as M1 from "./Data_MissionCh1.mjs";
import * as M2 from "./Data_MissionCh2.mjs";
import * as M3 from "./Data_MissionCh3.mjs";
import * as M4 from "./Data_MissionCh4.mjs";
import * as M5 from "./Data_MissionCh5.mjs";
import * as M6 from "./Data_MissionCh6.mjs";

const CHAPTER_MODULES = [M0, M1, M2, M3, M4, M5, M6];

/**
 * 七章，**按正片顺序**。数组顺序就是选章顺序、就是 AdvanceLevel 的顺序，
 * 也是 ?phase=N 的 N。改顺序等于改流程，别当成排版。
 */
export const CHAPTERS = CHAPTER_MODULES.map((m) => m.CHAPTER);

/** 契约 §10.1 写死的章节 id 与顺序。对不上就抛 —— 下游一整排表都按这个 id 取。 */
const CHAPTER_IDS = [
  "CH0_Chuchuan", "CH1_NanLu", "CH2_Shouliudan", "CH3_Jiuhusuo",
  "CH4_DongguanYe", "CH5_Chengqiang", "CH6_Zuihou",
];

/**
 * 组装前的硬校验。**史料层与打法层的分层规则在这里执行**：
 *   · 史料字段（title/date/sky/minutes/pool/objectives/beats…）必须齐；
 *   · 打法字段（bounds/spawn/ijaPressure…）**只许出现在 chapter.tuning 里**，
 *     摊在 chapter 顶层就是把两层混起来了，直接抛；
 *   · zones 与 objectives 数量必须一致 —— 旧关表里两者对不上是历史债，
 *     objectiveIndex 与 HUD 文案会错位，这一轮修掉并用断言钉住；
 *   · zone id 全局唯一（Data_Battle 的 ZONES 是一张扁平表，重名会互相顶掉）。
 */
const TUNING_ONLY_KEYS = [
  "bounds", "spawn", "ijaPressure", "ijaSpawn", "ijaSupport", "ijaForce", "ijaPool",
  "loadout", "loadoutOverride", "cameraFar", "detailRadius", "midRadius",
  "nightRaid", "disarmed", "spotter", "corridorGun", "scavengeRifle", "fieldFrom", "cutsceneOnly",
];

const seenZoneIds = new Set();
for (let i = 0; i < CHAPTERS.length; i += 1) {
  const c = CHAPTERS[i];
  const where = `Data_MissionCh${i}`;
  if (!c || c.id !== CHAPTER_IDS[i]) {
    throw new Error(`${where}: 章节 id 应为 ${CHAPTER_IDS[i]}，实际是 ${c && c.id}`);
  }
  for (const key of ["title", "place", "date", "sky", "objectives", "zones", "beats", "brief", "pool", "tuning"]) {
    if (c[key] === undefined || c[key] === null) throw new Error(`${where}: 缺字段 ${key}`);
  }
  if (!(c.minutes > 0)) throw new Error(`${where}: minutes 必须是正数`);
  for (const key of TUNING_ONLY_KEYS) {
    if (key in c) throw new Error(`${where}: 打法字段 ${key} 不许写在 CHAPTER 顶层，搬进 CHAPTER.tuning`);
  }
  if (!c.tuning.bounds || !c.tuning.spawn) throw new Error(`${where}: tuning 缺 bounds 或 spawn`);
  if (!c.zones.length) throw new Error(`${where}: 至少要有一个路标`);
  if (c.zones.length !== c.objectives.length) {
    throw new Error(`${where}: zones(${c.zones.length}) 与 objectives(${c.objectives.length}) 数量必须一致`);
  }
  for (const zone of c.zones) {
    if (!zone.id || !zone.name || !Number.isFinite(zone.x) || !Number.isFinite(zone.z) || !(zone.radius > 0)) {
      throw new Error(`${where}: 路标 ${zone && zone.id} 字段不全`);
    }
    if (seenZoneIds.has(zone.id)) throw new Error(`${where}: 路标 id ${zone.id} 与别处重名（ZONES 是全局扁平表）`);
    seenZoneIds.add(zone.id);
    const b = c.tuning.bounds;
    if (zone.x < b.minX || zone.x > b.maxX || zone.z < b.minZ || zone.z > b.maxZ) {
      throw new Error(`${where}: 路标 ${zone.id} (${zone.x}, ${zone.z}) 落在本章切片外`);
    }
  }
}

/**
 * beats 的 at 触发式（Script_Story 那层的翻译表能直接吃）：
 *   start / end
 *   wave:N            第 N 波攻击开始
 *   waveClear:N       第 N 波被打退
 *   zone:路标id        进入触发区（**必须是本章 zones 里的 id**）
 *   event:名字         规则层派发的事件（判定表在 Script_Story.LEVEL_CUES）
 *   delay:秒           上一条之后过多久
 * type：title / line / shout / narration / objective / note / hint / system / env
 *   ／ cutscene（关中过场：`{ at, type:"cutscene", id:"CS_x" }`，id 必须已注册）
 *
 * pool（城里还站着的人）是**推定**的关卡数值，登记在 PRESUMED_STAGING.poolCurve。
 */
export const LEVELS = CHAPTERS.map((c) => ({
  id: c.id,
  title: c.title,
  place: c.place,
  date: c.date,
  clock: c.clock,
  sky: c.sky,
  // 环境音档与天空档不同名时由章自己指定（序章的车厢就是这种情形）。
  ambience: c.ambience || null,
  music: c.music || null,
  minutes: c.minutes,
  pool: c.pool,
  // HUD 开局那一条；Script_Story 读 level.objective 当初始任务文本。
  objective: c.objectives[0],
  objectives: c.objectives,
  mechanic: c.mechanic || MechanicSummary(c),
  mechanics: c.mechanics || {},
  brief: c.brief,
  cutsceneIn: c.cutsceneIn || null,
  cutsceneOut: c.cutsceneOut || null,
  // 关**中**过场（2026-08-28 集成批 INT1）。两种写法：
  //   "CS_x"                        挂在默认信号 ChapterMidCutscene 上
  //   { id:"CS_x", signal:"名字" }   挂在指定信号上（CH5 的转身该挂 TurnedBack）
  // 判定与派发在 Script_Story（SIGNAL_CUTSCENES）；这一层只负责传下去与查注册。
  cutsceneMid: c.cutsceneMid || null,
  // 这一章玩家演的是谁（CAST id）。六章是顺子，终章 §7 明写「玩家＝小秦」。
  // 装配层把它传给 CompanionDirector.BeginLevel —— **玩家自己不进名册**，
  // 否则终章场上会有两个小秦（一个是你，一个站你旁边）。
  // 不写就是 Script_Companion.DEFAULT_PLAYER_CAST（顺子）。
  playerCast: c.playerCast || null,
  // 本章在场的具名同伴（CAST id 数组，上限 Script_Companion.MAX_COMPANIONS）。
  // 不写就由 beats 的 who 推（RosterFromBeats）—— 推导只收「该章说过话的战斗员」，
  // 军医、参谋、师长这些 combatant:false 的人一律推不出来，
  // 终章更是会推出一张空表。所以七章都显式点了名，理由逐章写在章节数据里。
  roster: Array.isArray(c.roster) ? c.roster : null,
  beats: c.beats,
}));

/**
 * 菜单「本关机制」那一行。章自己给了 mechanic 字符串就用它；没给就把
 * mechanics 的旗标列出来 —— 旗标名本身就是给后续系统批看的接口清单，
 * 摆在选章里也顺带提醒「这一章还欠哪几个动词」。
 */
function MechanicSummary(chapter) {
  const flags = Object.entries(chapter.mechanics || {})
    .filter(([, on]) => on).map(([name]) => name);
  return flags.length ? `本章机制：${flags.join(" / ")}` : "";
}

/** 各章新增的语音行（Data_Voice 拼接用；F2 批负责接线）。 */
export const CHAPTER_VOICE_LINES = CHAPTER_MODULES.flatMap((m) => m.VOICE_LINES || []);

/**
 * 各章的关内事件线登记表，**原样**摊给 Script_Story 去建 LEVEL_CUES。
 *
 * 这里不做字段归一：七章的 EVENTS 是三批人分别写的，名字字段有 name/event/id
 * 三种、判据字段有 fallback/predicate/cue 三种（还有一章一条都没写）。
 * 归一化的规矩属于叙事层（Script_Story.BuildLevelCues），
 * 这一层只负责**把它们凑齐**并带上 cutsceneMid —— 数据层不猜语义。
 *
 * 没有导出 EVENTS 的章给空数组：那不是错误（序章整章是过场，没有事件线）。
 */
export const CHAPTER_EVENTS = CHAPTERS.map((chapter, index) => ({
  levelId: chapter.id,
  events: Array.isArray(CHAPTER_MODULES[index].EVENTS) ? CHAPTER_MODULES[index].EVENTS : [],
  cutsceneMid: chapter.cutsceneMid || null,
}));

// ===========================================================================
// 过场
// ===========================================================================
//
// 两组：
//   · **正片七章**用的 CS_Chuchuan（序章车厢）与 CS_Ch1_* … CS_Ch6_*
//     （各章一个文件，基建批留占位、内容批填实）；
//   · **旧战役五场**（CS_ChuchuanLegacy / CS_LiZongrenTang / CS_LastWire /
//     CS_WangMingzhang / CS_BeimenBreakout）——从正片流程脱钩，但文件与注册保留：
//     它们里面的分镜手法、史实注记与「不演王铭章举枪自尽」那段长注释是资产，
//     删掉等于把账一起删掉。选章的「测试场景」组留了预览入口。
//
// 分镜数据结构（Script_Cutscene.mjs 是唯一消费者）：
//
//   setOrigin  [x,y,z]  这一场布景的世界原点。standalone 的场自带布景，
//                       坐标写局部值；发生在滕县城里的场把 setOrigin 设为
//                       [0,0,0]，坐标直接就是 Data_Tengxian 的世界坐标。
//   props      [{ kind, size, pos, ry, rx, mat|color, emissive, track }]
//              过场专用的一次性道具（桌子、电台、土袋、烟囱……）。
//              静态场景里已经有的东西不要在这里重复建。
//   cast       [{ id, kind, weapon, seed, track:[{t,pos,ry,state}] }]
//              t 是**过场全局时间**（秒），不是镜内时间 —— 跨镜连贯的动作
//              （一行人一直在走）写一条轨就行，不用按镜切碎。
//   shots      [{ n, seconds, focalMm, camera, subs, lines, sfx, flash, black }]
//              camera.from/to 是机位，look/lookTo 是被摄物；只给 from/look
//              就是固定机位。ease 见 Script_Cutscene 的 EASINGS。
//              **focalMm 是 35 mm 等效焦距**，Script_Cutscene 换算成垂直 FOV，
//              分镜表上写多少这里就写多少，不许直接写 fov 度数。
//
// 时长是硬约束：设计书给了每场的总秒数与每镜秒数，shots 的 seconds 之和
// 必须等于 seconds。Script_Cutscene 的 ValidateCutscene() 会核对，对不上就抛。

import { CS_Chuchuan, CS_ChuchuanLegacy } from "./Data_CutsceneChuchuan.mjs";
import { CS_LiZongrenTang } from "./Data_CutsceneLiZongrenTang.mjs";
import { CS_LastWire } from "./Data_CutsceneLastWire.mjs";
import { CS_WangMingzhang } from "./Data_CutsceneWangMingzhang.mjs";
import { CS_BeimenBreakout } from "./Data_CutsceneBeimenBreakout.mjs";
import { CH1_CUTSCENES } from "./Data_CutsceneCh1.mjs";
import { CH2_CUTSCENES } from "./Data_CutsceneCh2.mjs";
import { CH3_CUTSCENES } from "./Data_CutsceneCh3.mjs";
import { CH4_CUTSCENES } from "./Data_CutsceneCh4.mjs";
import { CH5_CUTSCENES } from "./Data_CutsceneCh5.mjs";
import { CH6_CUTSCENES } from "./Data_CutsceneCh6.mjs";

/** 正片七章的过场，按章序摊平。序章复用 CS_Chuchuan（Data_CutsceneChuchuan.mjs）。 */
export const CHAPTER_CUTSCENES = [
  CS_Chuchuan,
  ...CH1_CUTSCENES, ...CH2_CUTSCENES, ...CH3_CUTSCENES,
  ...CH4_CUTSCENES, ...CH5_CUTSCENES, ...CH6_CUTSCENES,
];

/** 旧战役五场：从正片流程脱钩，仅留预览入口与留档。 */
export const LEGACY_CUTSCENES = [
  CS_ChuchuanLegacy, CS_LiZongrenTang, CS_LastWire, CS_WangMingzhang, CS_BeimenBreakout,
];

export const CUTSCENES = Object.fromEntries(
  [...CHAPTER_CUTSCENES, ...LEGACY_CUTSCENES].map((cut) => [cut.id, cut]));

// 章表引用的过场必须真的注册过 —— 打错一个字的后果是「关末什么都不播」，
// 静默且只在真跑到那一关时才看得见。
//
// 三个入口一起查：关首（cutsceneIn）、关末（cutsceneOut）、关中（cutsceneMid
// 与 beats 里的 `{type:"cutscene"}`）。关中那两条尤其要查 —— 它们在关卡中段
// 才派发，打错字要玩到一半才发现，而那时画面上什么都不会发生。
for (const level of LEVELS) {
  const midId = typeof level.cutsceneMid === "string" ? level.cutsceneMid
    : (level.cutsceneMid && level.cutsceneMid.id) || null;
  if (level.cutsceneMid && !midId) {
    throw new Error(`Data_TengxianScript: ${level.id} 的 cutsceneMid 既不是过场 id 也没有 id 字段`);
  }
  for (const id of [level.cutsceneIn, level.cutsceneOut, midId]) {
    if (id && !CUTSCENES[id]) throw new Error(`Data_TengxianScript: ${level.id} 引用了没注册的过场 ${id}`);
  }
  for (const beat of level.beats || []) {
    if (beat.type !== "cutscene") continue;
    const id = beat.id || beat.cutscene || null;
    if (!id) throw new Error(`Data_TengxianScript: ${level.id} 有一条 type:"cutscene" 的 beat 没写 id（at=${beat.at}）`);
    if (!CUTSCENES[id]) throw new Error(`Data_TengxianScript: ${level.id} 的 beat（at=${beat.at}）引用了没注册的过场 ${id}`);
  }
}

// 各场自带的人物表条目并进 CAST（过场文件不许反过来 import CAST，会成环）。
for (const cut of Object.values(CUTSCENES)) {
  for (const [id, person] of Object.entries(cut.people || {})) {
    if (!CAST[id]) CAST[id] = person;
  }
}

/** 按 id 取一场过场。 */
export function FindCutscene(id) {
  return CUTSCENES[id] || null;
}

/** 按 id 取一关。 */
export function FindLevel(id) {
  return LEVELS.find((l) => l.id === id) || null;
}

/** 过场的播放顺序（给预览页与选章的「测试场景」组用）：先正片七章，后旧五场。 */
export const CUTSCENE_ORDER = [
  ...CHAPTER_CUTSCENES.map((cut) => cut.id),
  ...LEGACY_CUTSCENES.map((cut) => cut.id),
];

// ===========================================================================
// 菜单与关于页
// ===========================================================================

export const MENU = {
  title: "滕县 一九三八",
  subtitle: "一九三八年三月十四日 — 十八日 · 山东滕县",
  lines: [
    "守城的是川军，没有钢盔，三分之一以上没有步枪。",
    "城是必然陷落的。",
    "你能改变的只有：这一小时守不守得住。",
  ],
  start: "开始",
  chapters: "选章",
  codex: "史实注记",
  credits: "关于",
};

export const CREDITS = [
  "《滕县 一九三八》 —— 浏览器 FPS 原型",
  "",
  "剧情依据公开史料写成，可信度分三档：信史 / 主流记载 / 流传待考。",
  "游戏台词只建立在前两档上；第三档的材料一律不采用，",
  "或以旁白「另有记载」的语气与相反的一说同屏并列。",
  "",
  "真实历史人物：王铭章、赵渭滨、张宣武、严翊、侯子平、王麟、孙震、李宗仁、汤恩伯。",
  "他们在本作中只做史料里有的事。",
  "谢长顺（顺子）、罗班长、幺娃、何有田、刘文财、小秦、赵德贵为虚构人物 ——",
  "城内约三千人里，绝大多数没有留下名字。",
  "",
  "两处必须并列摆出、不许只说一半的地方：",
  "· 王铭章的殉国方式（1938 年电讯的自戕说 ／ 墓志与回忆的中弹说），本作采后者；",
  "· 滕县之守与台儿庄之捷的因果（《李宗仁回忆录》口径 ／ 档案研究的反面意见）。",
  "",
  "凡「推定」的数值（街巷宽度、瓮城尺寸、兵员池数字……）都不是史实，",
  "登记表见 Data_Tengxian.mjs 的 PRESUMED 与本文件的 PRESUMED_STAGING。",
  "",
  "场景美术由程序生成；枪炮、环境与音乐包含外部录音 / 曲目，来源与授权随音频清单登记。",
  "新增 CC0 音乐：Cethiel《Laments of the War》、Spring Spring《War Theme》、",
  "allen yatsura《tension and distress》、isaiah658《Village Ruins》（经剪辑、配平后使用）。",
];

// ===========================================================================
// 推定值登记表（演出侧）
// ===========================================================================

/**
 * 这张表是史实纪律的执行机制：凡在这里登记的数，
 * **游戏内任何文本（字幕、图鉴、UI）都不许说成史实**。
 *
 * 城的几何推定登记在 Data_Tengxian.mjs 的 PRESUMED；这里只登记「演出层」
 * 新引入的推定 —— 关卡数值、过场机位、人物设定。
 */
export const PRESUMED_STAGING = [
  { id: "playerIdentity", value: "谢长顺 / 四川三台 / 十八岁 / 727 团 3 营 9 连二等兵",
    note: "玩家是虚构人物。所属番号（122 师 364 旅 727 团 3 营）为史料，连别与籍贯为推定" },
  { id: "squadNames", value: ["罗班长", "幺娃", "何有田", "刘文财", "小秦", "赵德贵"],
    note: "顺子那一班的名字由任务流程规格写死（docs/Data_MissionRemake.md §8），均为虚构人物，不对应任何真实军官" },
  { id: "poolCurve", value: CHAPTERS.flatMap((c, i) => (i === 0 ? [c.pool.start, c.pool.end] : [c.pool.end])),
    note: "「城里还站着的人」逐章数值全为推定：序章不耗（240→240），一章起逐章递减到终章 12。史料只给三个锚点：城内约 3000 人、能打的不足 2000、突围约 500 人。关卡池是一个班排级切片，不是全城人数，不许拿来当伤亡统计" },
  { id: "levelMinutes", value: CHAPTERS.map((c) => c.minutes),
    note: "各章时长为设计值，与史实时段的长短无关（策划案给的是 18—22 分钟量级）" },
  { id: "aidStationSite", value: "A 区主救护所 = 城内第二区公所大院 (214, -30)",
    note: "策划案只说「学校/大药铺院落」，城内哪一处无载。选点是本实现推定，三关/四关末/五关开头共用同一个锚点" },
  { id: "divisionHqSite", value: "城内临时师部 = 城中第 124 师师部那组院落 (-58, -55)",
    note: "王铭章师部原设城外电灯厂，16 日接死守命令后迁入城内；**城内具体位置无载**，选点为推定" },
  { id: "cutsceneCameras", value: "全部过场的机位世界坐标",
    note: "分镜表给的是机位高度、俯仰角、焦距与被摄物，**世界坐标全部是本实现推定的**。改机位不算改史实，但改「谁在画面里、他在做什么」算" },
  // 过场侧的推定（机位坐标、随行人数、布景位置……）各场自己登记在
  // Data_Cutscene*.mjs 的 presumed 数组里，这里汇总 —— 一场一个文件，并行改不互踩。
  ...Object.values(CUTSCENES).flatMap((cut) => cut.presumed || []),
];

/** 按 id 查推定条目，给 UI 的「这是推定值」角标用。 */
export function FindPresumedStaging(id) {
  return PRESUMED_STAGING.find((p) => p.id === id) || null;
}
