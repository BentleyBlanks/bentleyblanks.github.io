// 《地道里的光》 —— 核心逻辑层（横版 2.5D，参考《勇敢的心：世界大战》）。
// 剧本来源：Notion《地道里的光》剧本大纲 + 关卡设计（八章结构）。
// 设计三原则：每关一个小人物目标；用行动而非台词表现成长；目标是保护群众、保存力量，而不是消灭敌人。
// 空间语法：x 为横向米数，level 为 surface（地表 y=0）/ under（地道 y=-3.6）。
// 地道场景是「剖面视角」：地表与地下同屏，烟、探杆、转移全部在一维横轴上展开。

export const GAME_VERSION = "0.3.0";

export const SURFACE_Y = 0;
export const UNDER_Y = -3.6;

// ---------------------------------------------------------------------------
// 交互提示的写法（勇敢的心式）
// ---------------------------------------------------------------------------
// 提示 = 一枚按钮徽章 + 一个短动词。**文案里不写键名**——手机上没有键盘，
// 「按 E」三个字在那儿就是句废话；键位写成前缀 `E · ` / `按住 E · `，
// 由 HUD 按当前输入设备翻成键帽或触屏图标（见 Script_Main.PromptChip）。
// 动词要短：一眼扫过去就懂，别写成一句话——为什么、怎么做，交给画面和手记条。
// 长按的百分比也别写进文案，promptFill 会画成徽章外圈那道进度环。
const PROMPT_ACTS = { E: "interact", F: "throw", C: "crouch", W: "up", S: "down" };

// 把 `按住 E · 接绳` 拆成 { act:"interact", hold:true, text:"接绳" }。
// 认不出前缀的当成没有按键的状态行（"跟上娘""手里拿着桶"），HUD 走另一条样式。
export function SplitPrompt(raw) {
  if (!raw) return null;
  const m = /^(按住\s*)?([EFCWS])\s*·\s*([\s\S]+)$/.exec(raw);
  if (!m) return { act: null, hold: false, text: raw };
  return { act: PROMPT_ACTS[m[2]], hold: !!m[1], text: m[3] };
}

// ---------------------------------------------------------------------------
// 章节元数据
// ---------------------------------------------------------------------------
// 章名取各章自己最硬的那个意象，不用"失去/陷阱/反击"这类空话：
// 灯停住了=娘的结局那一镜；半袋烟的工夫=换岗的空当，学会看的那一课；
// 最后一盏灯=熄灯后攥在手里的那盏；东口的铃=改造的回报；
// 没套的骡车=推理的破绽本身；第二道刻痕与第一章首尾成对。
export const CHAPTERS = [
  { id: "c1", num: "第一章", title: "门框上的刻痕", year: "1942 · 华北敌后 · 梁家村", scene: "village", light: "day" },
  { id: "c2", num: "第二章", title: "灯停住了", year: "1943 · 春 · 梁家村", scene: "village", light: "night" },
  { id: "c3", num: "第三章", title: "半袋烟的工夫", year: "1943 · 据点外的庄稼地", scene: "fields", light: "night" },
  { id: "c4", num: "第四章", title: "最后一盏灯", year: "1943 · 沙河庄地道", scene: "tunnelVillage", light: "tunnel" },
  { id: "c5", num: "第五章", title: "东口的铃", year: "1943 · 夏 · 沙河庄地道", scene: "tunnelVillage", light: "tunnel" },
  { id: "c6", num: "第六章", title: "没套的骡车", year: "1943 · 押送前夜", scene: "fields", light: "night" },
  { id: "c7", num: "第七章", title: "地道里的光", year: "1943 · 据点地道", scene: "tunnelFort", light: "dark" },
  { id: "c8", num: "第八章", title: "第二道刻痕", year: "一个月后 · 梁家村", scene: "village", light: "dawn" },
];

// ---------------------------------------------------------------------------
// 场景布局（横向条带；渲染层用这些数据生成剖面白盒与视差背景）
// zone: {x, w, level?}  cover: 可蹲藏的遮蔽物  shaft: 地表<->地下的爬梯口
// ---------------------------------------------------------------------------
export const SCENES = {
  village: {
    length: 190,
    walk: { surface: [4, 186], under: [21, 31] }, // under = 地窖
    shafts: [{ id: "cellarHatch", x: 27, name: "地窖口" }],
    props: [
      // interior：可走进去的家。门开在东墙（x≈34，正是刻身高线的那个门框——
      // 露天立一个门框不成话，线就该刻在自家门口的框上）
      { id: "homeHouse", kind: "house", x: 30, w: 9.5, h: 3.6, name: "柱子家", burnable: true, interior: true },
      { id: "houseB", kind: "house", x: 62, w: 8.5, h: 3.3 },
      { id: "houseC", kind: "house", x: 92, w: 9, h: 3.4, burnable: true },
      { id: "houseD", kind: "house", x: 148, w: 8, h: 3.2 },
      { id: "doorframe", kind: "doorframe", x: 34, name: "门框" },
      { id: "workbench", kind: "bench", x: 40.5, name: "工作台" },
      { id: "stool", kind: "stool", x: 32, name: "旧木凳" },
      // 路边那垛码好的劈柴：教「翻越」的第一课长在它身上。
      // **它必须离跑腿路线远远的**——手里提着水桶、肩上扛着木料的时候
      // 被半路要求翻个墙，是这一版最先被骂的地方。院子（31~70）是干活的地方，
      // 一块可翻越物都不放；这垛柴挪到去老槐树的路上，那趟路空着手来回。
      // 肩高、顶沿磨得发亮还缺了一角——可翻越物的轮廓语法从这垛柴定死
      { id: "roadStack", kind: "woodStack", x: 84, w: 1.7, h: 1.24, name: "码好的柴垛" },
      { id: "cellarMouth", kind: "hatch", x: 27, name: "地窖口" },
      { id: "well", kind: "well", x: 58, name: "水井" },
      { id: "millstone", kind: "millstone", x: 76, name: "磨盘" },
      { id: "woodpile", kind: "woodpile", x: 70, name: "木料堆" },
      { id: "bigTree", kind: "tree", x: 126, big: true, name: "老槐树" },
      { id: "gatePost", kind: "lamppost", x: 174, name: "村东口" },
      // 谜题道具：妹妹的花布头巾被风刮上老槐树（一章）；石碾上晾着窝头、
      // 王家的狗、巷口的马灯、两处石子堆（二章的潜行链）
      { id: "cloth", kind: "cloth", x: 127.6, name: "花布巾" },
      { id: "stonesTree", kind: "stonePile", x: 120, name: "石子堆" },
      { id: "grindstone", kind: "millstone", x: 118, name: "石碾" },
      { id: "yardDog", kind: "dog", x: 138, name: "王家的狗" },
      { id: "stonesEast", kind: "stonePile", x: 152, name: "石子堆" },
      { id: "hangLantern", kind: "hangLantern", x: 160, name: "巷口的马灯" },
      // 一章的家务道具：独轮车（运木料，兼教「推」）、木料上那只不肯挪窝的母鸡、
      // 去老槐树半道上的田埂（地形，跨得过去，不用翻）、院墙角那枚可选探索的顶针
      { id: "barrow", kind: "barrow", x: 50.5, name: "独轮车" },
      { id: "henProp", kind: "hen", x: 56.4, name: "母鸡", hideFlag: "henFlew" },
      // 娘的活计：屋西头一小片菜畦。柱子跑腿的时候，爹在锯木头、娘在地里——
      // 家里没有站着围观的人，人人手上都有活
      { id: "veggieWest", kind: "crops", x: 16.5, w: 5, name: "菜畦" },
      { id: "ridgeMid", kind: "ridge", x: 96, w: 3, name: "田埂" },
      { id: "thimbleProp", kind: "thimble", x: 48.8, name: "顶针", hideFlag: "thimbleFound" },
      // 扫荡后才出现：慌乱中撞塌的柴垛（压力下复用翻越）与院里的石子堆（软窗口）。
      // 柴垛必须压在撤退路线上（42→27）才叫「路线上的障碍」，搁在东边就白设了
      { id: "fallenWood", kind: "fallenWood", x: 38, name: "倒塌的柴垛", showFlag: "raidStarted" },
      { id: "stonesYard", kind: "stonePile", x: 43.5, name: "石子堆", showFlag: "raidStarted" },
    ],
    // 可翻越物（挡路；贴上去出提示，按互动键才翻——不是走过去就自动翻）。
    // 轮廓语法：肩高、顶沿磨亮/有缺口。
    //
    // **摆位铁律：可翻越物一律不许压在跑腿路线上**。院子那一段（x 31~70）是
    // 打水、扛木料、推车的地方，手里有东西的时候被要求翻越很别扭——这两处
    // 都放在空着手走的路上：
    //   · 路边的柴垛 84：去老槐树找妹妹那一趟（往返都空手），教学与复用同一垛；
    //   · 倒塌的柴垛 38：扫荡撤退（也是空手），压力下的考场。
    // top 必须与美术画出来的高度对齐——抬升弧是按它算的，写错了人会飞过头顶。
    vaults: [
      { x: 84, w: 1.7, top: 1.24 },
      { x: 38, w: 1.35, top: 1.08, flag: "raidStarted" },
    ],
    // 掩体链：这条村道是第二章的潜行场地，掩体的疏密就是关卡节奏本身。
    // tall（草垛、齐胸的断墙）站着就挡得住；矮的（柴堆、水瓮）得蹲下去。
    // 间距刻意不匀：贴着走的几处给喘息，88→107、107→132 两段长空地是难点，
    // 那里另有一辆推着走的板车当移动掩体。
    covers: [
      // 柴堆在院门边：屋子做成可进入的室内之后，柴堆搁在屋里不成话；
      // 挪到院门口，第一章"把刨子塞进柴堆"这场戏也才有处可塞
      { id: "firewood", kind: "firewood", x: 44.5, w: 2.2 },
      { id: "hayA", kind: "haystack", x: 52, w: 3.2, tall: true },
      { id: "vatA", kind: "wallSeg", x: 60, w: 2.4, h: 1.1 },
      { id: "hayB", kind: "haystack", x: 68, w: 3.2, tall: true },
      { id: "woodB", kind: "firewood", x: 78, w: 2.6 },
      { id: "hayC", kind: "haystack", x: 88, w: 3.2, tall: true },
      { id: "ruinWall", kind: "wallSeg", x: 107, w: 5, h: 1.5, tall: true },
      { id: "hayD", kind: "haystack", x: 132, w: 3.2, tall: true },
      { id: "wallB", kind: "wallSeg", x: 142, w: 4, h: 1.5, tall: true },
      { id: "hayE", kind: "haystack", x: 152, w: 3.2, tall: true },
      { id: "wallC", kind: "wallSeg", x: 163, w: 4, h: 1.4, tall: true },
    ],
    zones: {
      homeYard: { x: 37, w: 13, label: "家里的院子" },
      doorframe: { x: 34, w: 3, label: "门框" },
      workbench: { x: 40.5, w: 4, label: "工作台" },
      courtGate: { x: 47, w: 4, label: "院门口" },
      cellar: { x: 26, w: 7, level: "under", label: "地窖" },
      well: { x: 58, w: 5, label: "井台" },
      sisterTree: { x: 124, w: 6, label: "老槐树下" },
      eastExit: { x: 172, w: 7, label: "村东口" },
      woodpile: { x: 70, w: 6, label: "木料堆" },
      dogYard: { x: 138, w: 4, label: "王家院外" },
      treeShade: { x: 130, w: 5, label: "槐树影里" },
    },
  },

  fields: {
    length: 200,
    walk: { surface: [3, 176], under: null }, // 据点围墙在 x≈176，过不去
    shafts: [],
    props: [
      { id: "ditch", kind: "ditch", x: 8, w: 14, name: "交通沟" },
      { id: "northBank", kind: "ridge", x: 5, w: 3, name: "村北土坎" },
      // 歇脚点那扇卸下来的门板：第六章要往上钉情报，得看得见它
      { id: "mapBoard", kind: "mapBoard", x: 19, name: "门板" },
      { id: "cropsA", kind: "crops", x: 34, w: 28 },
      { id: "cropsB", kind: "crops", x: 106, w: 30 },
      { id: "fortWall", kind: "fortWall", x: 178, w: 5, h: 2.8, name: "据点围墙" },
      { id: "gate", kind: "fortGate", x: 172, name: "据点南门" },
      { id: "blockhouse", kind: "blockhouse", x: 184, name: "炮楼" },
      { id: "prisonShed", kind: "prison", x: 192, name: "牢房" },
    ],
    covers: [
      { id: "ditchCover", kind: "ditch", x: 8, w: 12 },
      { id: "bushA", kind: "bush", x: 64, w: 3 },
      { id: "hayS", kind: "haystack", x: 104, w: 3.2 },
      { id: "ridge", kind: "ridge", x: 142, w: 4 },
      { id: "cropCoverA", kind: "crops", x: 40, w: 16 },
      { id: "cropCoverB", kind: "crops", x: 112, w: 18 },
    ],
    zones: {
      campTable: { x: 19, w: 9, label: "民兵歇脚点" },
      ditchSouth: { x: 8, w: 12, label: "交通沟" },
      contactA: { x: 40, w: 6, label: "赶车的乡亲" },
      contactB: { x: 120, w: 6, label: "拾柴的大娘" },
      obsWest: { x: 64, w: 6, label: "灌木后" },
      obsSouth: { x: 104, w: 6, label: "草垛后" },
      obsEast: { x: 142, w: 6, label: "田埂下" },
      gate: { x: 168, w: 6, label: "据点南门" },
      auntSpot: { x: 120, w: 5, label: "拾柴的大娘" },
      cartSpot: { x: 108, w: 5, label: "陷住的驴车" },
      northBank: { x: 5, w: 4, label: "村北土坎" },
    },
  },

  // 沙河庄地道：剖面——地表在上，地道在下，东口进烟往西灌
  // tight：得爬过去的窄段。新掏的暗口那一截是赶工挖的，最窄
  tunnelVillage: {
    length: 170,
    walk: { surface: [6, 164], under: [12, 151] },
    shafts: [
      { id: "entE", x: 148, name: "东口（磨盘下）" },
      { id: "entW", x: 34, name: "西口（井台旁）" },
      { id: "hiddenExit", x: 18, name: "新暗口", builtFlag: "hiddenBuilt" },
    ],
    props: [
      { id: "surfMill", kind: "millstone", x: 148, name: "磨盘" },
      { id: "surfWell", kind: "well", x: 34, name: "井台" },
      { id: "surfHouseA", kind: "house", x: 70, w: 8.5, h: 3.2 },
      { id: "surfHouseB", kind: "house", x: 110, w: 8, h: 3.0 },
      { id: "surfHouseC", kind: "house", x: 24, w: 8.5, h: 3.1 },
      { id: "chamberA", kind: "chamber", x: 112, w: 12, name: "藏人洞·甲" },
      { id: "chamberB", kind: "chamber", x: 58, w: 12, name: "藏人洞·乙" },
      { id: "trapBend", kind: "waterTrap", x: 112, name: "翻口位", builtFlag: "trapBuilt" },
      { id: "bellWire", kind: "bell", x: 142, name: "预警铃位" },
      // 谜题道具：藏人洞里备着的水瓮（四章浸棉被）；西头第三家的猪圈狗（五章）
      { id: "waterVat", kind: "vat", x: 116, level: "under", name: "水瓮" },
      { id: "pigpenDog", kind: "dog", x: 22, name: "猪圈的狗" },
    ],
    covers: [],
    // 卡口与赶工掏出来的段：只能爬过去
    tight: [
      { x0: 19, x1: 29, mode: "crawl" },   // 新暗口那一截，天不亮才掏通的
      { x0: 68, x1: 73, mode: "crawl" },   // 卡口：敌人钻不过来，自己也得趴下
      { x0: 121, x1: 126, mode: "crawl" }, // 东段卡口：四章拿湿棉被堵烟的地方
    ],
    zones: {
      entE: { x: 148, w: 6, level: "under", label: "东口" },
      entW: { x: 34, w: 6, level: "under", label: "西口" },
      chamberA: { x: 112, w: 11, level: "under", label: "藏人洞·甲" },
      chamberB: { x: 58, w: 11, level: "under", label: "藏人洞·乙" },
      trapSpot: { x: 112, w: 5, level: "under", label: "翻口" },
      bellSpot: { x: 142, w: 5, level: "under", label: "预警铃" },
      hiddenSpot: { x: 18, w: 7, level: "under", label: "新暗口" },
      behindTrap: { x: 104, w: 7, level: "under", label: "翻口后面" },
      plugSpot: { x: 124, w: 4, level: "under", label: "东段卡口" },
      wellTop: { x: 34, w: 4, label: "井台" },
      millTop: { x: 148, w: 4, label: "磨盘" },
      dogPen: { x: 22, w: 4, label: "猪圈外" },
    },
  },

  // 据点外围地道（第七章）：从地里入口向东摸到牢房地沿
  tunnelFort: {
    length: 190,
    walk: { surface: null, under: [10, 166] },
    shafts: [
      { id: "fieldEnt", x: 14, name: "地里入口" },
      { id: "cellHatch", x: 162, name: "牢房地沿" },
    ],
    props: [
      { id: "fortSil", kind: "fortSilhouette", x: 150, w: 70 },
      { id: "pocketA", kind: "pocket", x: 44, name: "旁洞·甲" },
      { id: "pocketB", kind: "pocket", x: 92, name: "旁洞·乙" },
      { id: "pocketC", kind: "pocket", x: 122, name: "旁洞·丙" },
      { id: "collapse1", kind: "collapse", x: 66, name: "塌方·一" },
      { id: "collapse2", kind: "collapse", x: 118, name: "塌方·二" },
    ],
    covers: [],
    // 通到牢房地沿那最后几十步是这三天连夜掏的，最窄
    tight: [
      { x0: 132, x1: 150, mode: "crawl" },
      { x0: 150, x1: 166, mode: "squat" },
    ],
    zones: {
      fieldEnt: { x: 14, w: 7, level: "under", label: "地里入口" },
      collapse1: { x: 66, w: 5, level: "under", label: "塌方处" },
      collapse2: { x: 118, w: 5, level: "under", label: "塌方处" },
      pocketA: { x: 44, w: 7, level: "under", label: "旁洞·甲" },
      pocketB: { x: 92, w: 7, level: "under", label: "旁洞·乙" },
      pocketC: { x: 122, w: 7, level: "under", label: "旁洞·丙" },
      cellHatch: { x: 162, w: 6, level: "under", label: "牢房地沿" },
    },
  },
};

// ---------------------------------------------------------------------------
// 小工具
// ---------------------------------------------------------------------------
function InZone(px, level, zone) {
  const zoneLevel = zone.level || "surface";
  return level === zoneLevel && Math.abs(px - zone.x) <= zone.w / 2;
}

function SceneOf(state) { return SCENES[CHAPTERS[state.chapterIndex].scene]; }

// ---------------------------------------------------------------------------
// 剧本：八个章节的 beat 序列（叙事文本沿用三轮迭代验证过的版本）
// cam hint 语法（勇敢的心式）：只允许 横移/升降/推拉，镜头切换=硬切+慢推
//   {kind:"follow"} 跟随 | {kind:"wide", x} 全景 | {kind:"shot", x, y, dist, pan?} 固定构图
// ---------------------------------------------------------------------------
const V = SCENES.village.zones;
const F = SCENES.fields.zones;
const TV = SCENES.tunnelVillage.zones;
const TF = SCENES.tunnelFort.zones;

function FindActor(state, id) { return state.actors.find((a) => a.id === id); }

// 配音行 id：按"说话人 + 文本"取哈希。抽词脚本（Script_VoiceExtract）与
// 运行时查表都走这一个函数——两边各写一份迟早会对不上，音频就整批哑掉。
// 用文本而不是行序做键，改动剧本顺序不会让已烘的音频失效，重复的句子也
// 自然共用同一个文件。
// 地道净高：一段一段不一样。冀中地道干线净高多在 1.2–1.5 米，
// **猫腰是常态**；卡口、新掏的段更矮，得半蹲甚至爬过去；能直起腰的只有
// 藏人洞和洞室。四档姿态由这一个函数说了算——玩法（速度、姿势）、
// 美术（洞腔画多高）、光照（空气腔多高）都从这儿取，免得三边各说各的。
export const POSTURE_HEAD = { stand: 2.05, stoop: 1.45, squat: 1.05, crawl: 0.72 };
export const POSTURE_SPEED = { stand: 1.0, stoop: 0.72, squat: 0.5, crawl: 0.34 };

export function TunnelPosture(scene, x) {
  // 藏人洞与洞室：唯一直得起腰的地方
  for (const pr of scene.props) {
    if (pr.kind !== "chamber" && pr.kind !== "pocket") continue;
    if (Math.abs(x - pr.x) < (pr.w || 5.6) / 2 - 0.6) return "stand";
  }
  // 剧情指定的窄段（卡口 / 连夜掏出来的那几十步）：得爬
  for (const t of scene.tight || []) {
    if (x >= t.x0 && x <= t.x1) return t.mode || "crawl";
  }
  // 其余：猫腰打底，隔一段一处半蹲的矮腰。按位置取值，稳定可预期
  const n = Math.sin(x * 0.17) * 0.6 + Math.sin(x * 0.052 + 1.7) * 0.4;
  return n > 0.30 ? "squat" : "stoop";
}

export function VoiceLineId(who, text) {
  const src = (who || "") + "|" + text;
  let h = 2166136261;
  for (let i = 0; i < src.length; i += 1) {
    h ^= src.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h.toString(36).padStart(7, "0");
}

// 配音时长表：开了声音之后，一行字幕至少得停到旁白念完，否则每句都被
// 切在半截。剧本里手写的 d 仍然是下限——它定的是"这一拍该有多长"，
// 配音只负责把太短的那些撑开。静音时这张表是空的，节奏回到原样。
let VOICE_DUR = null;
export function SetVoiceDurations(map) { VOICE_DUR = map; }

// 旁白还在念的时候不许切下一行。
//
// 原先只靠 Script_VoiceEncode 算出来的时长去撑 d，但那有两个漏洞：清单是
// 异步 fetch 来的，开场头一两行往往在它到达之前就已经开始跑了；而 141 条
// 里有 111 条配音比剧本写的 d 长，最多的超 5 秒。于是"话没说完就切镜"。
// 直接问播放器有没有念完，这两个洞一起堵上。
let VOICE_BUSY = null;
export function SetVoiceGate(fn) { VOICE_BUSY = fn; }
// 万一 promise 卡住（文件 404、解码失败），最多多等这么久就往下走
const VOICE_WAIT_CAP = 14;
function LineHeld(line, t) {
  const d = LineDuration(line);
  if (t < d) return true;
  if (t > d + VOICE_WAIT_CAP) return false;
  return !!(VOICE_BUSY && VOICE_BUSY());
}
function LineDuration(line) {
  if (!VOICE_DUR) return line.d;
  const text = line.say || line.stage;
  if (!text) return line.d;
  const v = VOICE_DUR.get(VoiceLineId(line.say ? (line.who || "") : "", text));
  return v ? Math.max(line.d, v + 0.35) : line.d;
}

// ---------------------------------------------------------------------------
// 谜题动词层（v0.3 关卡重做）：单格物品栏 / 投掷 / 狗 / 灯光 / 声响引敌
// 《勇敢的心》的关卡语法：每个障碍缺一样东西，东西在别处；石子落地出声；
// 狗认吃不认人；灯有周期。动词凑齐了，关卡才有"想一下"的时刻。
// ---------------------------------------------------------------------------
const THROW_MIN = 3.0, THROW_MAX = 10.5, THROW_FLAT = 7.5, THROW_TIME = 0.55;
// 翻越：撑上顶沿 → 收腿荡过去 → 落地缓冲。比一步慢，慢到看得清是"手脚并用"，
// 又不至于打断走路的节奏。手里拎着东西得先把东西撂上顶沿，所以更慢一档。
const VAULT_DUR = 0.78;
const VAULT_DUR_BIG = 1.05;

// 翻越的抬升曲线：人真的离地，不是换个姿势平移过去。
// 峰值取障碍高度的七成左右——胯骨压过顶沿的那一下，脚正好在顶沿上方。
// 扛着东西那一档在顶上多待一会儿（撂下、跨过、再拎起），所以是带平台的弧。
function VaultArc(k, big) {
  const u = Math.max(0, Math.min(1, k));
  if (!big) return 0.74 * Math.sin(Math.PI * Math.pow(u, 0.92));
  if (u < 0.32) return 0.82 * Math.sin((u / 0.32) * (Math.PI / 2));
  if (u < 0.66) return 0.82;
  return 0.82 * Math.sin(((1 - u) / 0.34) * (Math.PI / 2));
}

function GiveItem(state, item) { state.player.item = { ...item }; }

// 一次性音效由这里排队，Script_Soundtrack 每帧取走去点名。
// Core 不认识合成器，只说"发生了什么"。
function Cue(state, name, opts) {
  if (state.cues) state.cues.push(opts ? { name, ...opts } : { name });
}

// 规范：每个玩法动词都要有对应的角色动画。瞬时动作（拾、投）打一个
// 带时限的姿势，持续动作（摇辘轳、划线）每帧续期——到时自动收回常态。
function FlashPose(state, name, dur = 0.5) {
  state.player.pose = name;
  state.player.poseT = dur;
}

// 投掷：面朝方向 3~10.5m 内有本步的目标就砸它（一维横轴上不做抛物线瞄准，
// 站位就是瞄准）；否则石子落在 7.5m 外，白出一声响
function StartThrow(state, st) {
  const p = state.player;
  let land = p.x + p.heading * THROW_FLAT;
  let hit = false;
  if (st?.target) {
    const dx = (st.target.x - p.x) * p.heading;
    if (dx >= THROW_MIN && dx <= THROW_MAX) { land = st.target.x; hit = true; }
  }
  state.thrown = { x0: p.x, x1: land, y1: hit ? (st.target.y ?? 1.6) : 0.15, t: 0, dur: THROW_TIME, hit };
  state.player.item = null;
}

function StepThrown(state, dt) {
  const th = state.thrown;
  if (!th) return null;
  th.t += dt;
  if (th.t < th.dur) return null;
  state.thrown = null;
  // 石子落地出声：附近的敌人会过来看——这一声玩家也必须听见，
  // 否则「声音会引人」这条规则永远只是文字说明
  Cue(state, "stoneLand");
  MakeNoise(state, th.x1, "surface");
  return th;
}

function MakeNoise(state, x, level) {
  state.noiseAt = { x, t: 0.6 };
  for (const a of state.actors) {
    if (!IsEnemy(a) || !a.visible || (a.level || "surface") !== level) continue;
    if (Math.abs(a.x - x) <= 15) a.investigate = { x: x + (a.x < x ? -1.2 : 1.2), until: state.time + 5.5 };
  }
}

// 拴着的狗：不咬人，会叫。叫声把巡逻招过来——不是立刻失败，是招来麻烦。
// 喂了就不叫了（认吃不认人）。
const DOG_SPOTS = {
  c2: [{ x: 138, flag: "dogFed" }],
  c5: [{ x: 22, flag: "dogFed2" }],
};

function StepDogs(state, dt) {
  state.dogBark = null;
  const dogs = DOG_SPOTS[CHAPTERS[state.chapterIndex].id];
  if (!dogs) return;
  const p = state.player;
  for (const d of dogs) {
    if (state.flags[d.flag]) continue;
    if (p.level !== "surface" || Math.abs(p.x - d.x) >= 5.5) continue;
    state.dogBark = { x: d.x };
    if (!state.beat.dogToastShown) {
      state.beat.dogToastShown = true;
      state.toast = { text: "狗叫起来了——这动静会把人招来。", t: 3.5 };
    }
    state.beat.dogNoiseT = (state.beat.dogNoiseT || 0) + dt;
    if (state.beat.dogNoiseT > 1.1) { state.beat.dogNoiseT = 0; MakeNoise(state, d.x, "surface"); }
  }
}

// 周期型灯光（探照灯 / 马灯的光池）：危险有周期，读懂周期就是解谜。
// def.light = { zone:[x0,x1], cycle, lit, offFlag?, src? } —— cycle=lit 即常亮
function StepLightHazard(state, def, dt) {
  const L = def?.light;
  if (!L || (L.offFlag && state.flags[L.offFlag])) { state.searchlight = null; return; }
  const phase = state.beat.t % L.cycle;
  const lit = phase < L.lit;
  state.searchlight = { x0: L.zone[0], x1: L.zone[1], lit, phase, cycle: L.cycle, litDur: L.lit, src: L.src || null };
  if (!lit) return;
  const p = state.player;
  if (p.level !== "surface" || p.hidden) return;
  if (p.x < L.zone[0] || p.x > L.zone[1]) return;
  if (state.cart && def.kind === "cartRide" && Math.abs(p.x - state.cart.x) <= (def.safeR ?? 2.6)) return; // 车影里
  state.detection.level = Math.min(1, state.detection.level + dt * 1.35);
  state.detection.spotter = "light";
}

// 链式谜题：有序的一串步骤——拾取 / 使用 / 投中 / 交谈 / 推。
// 单格物品栏：步骤自己管理手里那格；失败重置不清链、不清物品。
function StepChain(state, def, input, dt) {
  const b = state.beat;
  if (b.stepIndex === undefined) { b.stepIndex = 0; b.holdP = 0; def.onStart?.(state); }
  const st = def.steps[b.stepIndex];
  if (!st) { AdvanceBeat(state); return; }
  const p = state.player;
  const lvl = p.level || "surface";

  // 很久没动静：链卡在同一步超过 after 秒 → 后果小窗惦记一眼（负数=冷却期）
  if (def.pipIdle) {
    b.pipIdleT = (b.pipIdleT || 0) + dt;
    if (b.pipIdleT >= def.pipIdle.after) {
      b.pipIdleT = -(def.pipIdle.cooldown ?? 30);
      def.pipIdle.on?.(state);
    }
  }

  const finish = () => {
    if (st.note) state.toast = { text: st.note, t: 4.5 };
    if (st.noteAdd) state.flags.notesSeen.push(st.noteAdd);   // 口信也是情报，入账供第六章推理
    st.effect?.(state);
    b.stepIndex += 1;
    b.holdP = 0;
    b.pipIdleT = 0;                // 链动了一步，"没动静"从头计
    if (b.stepIndex >= def.steps.length) AdvanceBeat(state);
  };

  // 石子在空中：等它落地，砸中了才算过
  const th = StepThrown(state, dt);
  if (th) {
    if (st.type === "throwHit" && th.hit) { finish(); return; }
    if (st.type === "throwHit") {
      // 投空不白投：miss 回调让失败自己变成演示（惊飞麻雀=石子落地会出声）
      st.miss?.(state, th.x1);
      state.toast = { text: st.missNote || "石子擦着边飞过去了。再捡一颗。", t: 3 };
    }
  }

  switch (st.type) {
    case "pickup": {
      const near = Math.abs(p.x - st.x) < 1.7 && lvl === (st.level || "surface");
      if (!near) return;
      if (p.item) { state.prompt = "手里拿着" + p.item.label + "——一次只能拿一样"; return; }
      state.prompt = st.prompt || `E · 拿起${st.item.label}`;
      if (input.interact) { GiveItem(state, st.item); FlashPose(state, "bow", 0.5); Cue(state, "pickup"); finish(); }
      return;
    }
    // 放下换手：单格物品栏的另一半——「翻堆要双手」的地方，得先把手里的搁下。
    // 放在哪儿记进 flags，渲染层照着画，折回来还能捡
    case "drop": {
      if (!InZone(p.x, lvl, st.zone)) return;
      if (p.item?.id !== st.itemId) return;
      state.prompt = st.prompt || `E · 放下${p.item.label}`;
      if (input.interact) {
        state.flags[st.storeIn] = Math.round(p.x * 10) / 10;
        state.player.item = null;
        FlashPose(state, "bow", 0.5);
        Cue(state, "drop");
        finish();
      }
      return;
    }
    // 折回取：从 drop 记下的位置把东西捡回来
    case "pickupGround": {
      const gx = state.flags[st.flagX];
      if (typeof gx !== "number" || Math.abs(p.x - gx) > 1.7) return;
      if (p.item) { state.prompt = "手里拿着" + p.item.label + "——一次只能拿一样"; return; }
      state.prompt = st.prompt || `E · 拿回${st.item.label}`;
      if (input.interact) {
        GiveItem(state, st.item);
        state.flags[st.flagX] = null;
        FlashPose(state, "bow", 0.5);
        Cue(state, "pickup");
        finish();
      }
      return;
    }
    case "use": {
      if (!InZone(p.x, lvl, st.zone)) return;
      if (st.needs && p.item?.id !== st.needs) {
        state.prompt = st.missPrompt || `这儿缺${st.needsLabel || "样东西"}`;
        return;
      }
      if (st.hold) {
        state.prompt = st.prompt;          // 百分比不进文案，promptFill 画成进度环
        state.promptFill = b.holdP / st.hold;
        if (input.interactHeld) {
          b.holdP += dt;
          if (b.holdP >= st.hold) { ApplyUse(state, st); finish(); }
        } else b.holdP = Math.max(0, b.holdP - dt * 2);
      } else {
        state.prompt = st.prompt;
        if (input.interact) { ApplyUse(state, st); finish(); }
      }
      return;
    }
    case "throwHit": {
      if (state.thrown) return;
      const nearPile = Math.abs(p.x - st.pickupX) < 1.7 && lvl === "surface";
      if (!p.item) {
        if (nearPile) {
          state.prompt = "E · 捡石子";
          if (input.interact) { GiveItem(state, { id: "stone", label: "石子", throwable: true }); FlashPose(state, "bow", 0.45); }
        }
        return;
      }
      if (p.item.id !== "stone") return;
      // 弧线预览：站位不够是灰虚线，走进射程变实线——命中与否全归因于玩家
      const dxAim = (st.target.x - p.x) * p.heading;
      state.throwAim = {
        x0: p.x + p.heading * 0.4, y0: 1.35,
        x1: st.target.x, y1: st.target.y ?? 1.6,
        ok: dxAim >= THROW_MIN && dxAim <= THROW_MAX,
      };
      state.prompt = st.prompt || "F · 投";
      if (input.throw || (input.interact && !nearPile)) { StartThrow(state, st); FlashPose(state, "throwArm", 0.45); Cue(state, "whoosh"); }
      return;
    }
    case "talk": {
      const a = FindActor(state, st.actor);
      if (!a || !a.visible || Math.abs(a.x - p.x) > 2.4 || (a.level || "surface") !== lvl) return;
      state.prompt = st.prompt || `E · 跟${a.label || "他"}说话`;
      if (input.interact) {
        if (st.lines) StartMicroCine(state, st.lines);
        finish();
      }
      return;
    }
    case "push": {
      if (!state.cart) state.cart = { x: st.from, kind: st.obj || "cart" };
      const cart = state.cart;
      if (Math.abs(p.x - cart.x) > 2.6) return;
      state.prompt = st.prompt || "按住 E · 推车";
      state.promptFill = Math.abs(cart.x - st.from) / st.dist;
      if (input.interactHeld) {
        cart.x += st.dir * 0.85 * dt;
        p.x = cart.x - st.dir * 1.7;
        p.heading = st.dir;
        FlashPose(state, "push", 0.25);
        if ((cart.x - st.from) * st.dir >= st.dist) finish();
      }
      return;
    }
    case "goto": {
      if (InZone(p.x, lvl, st.zone)) finish();
      return;
    }
    case "winch": {
      // 辘轳打水：不是长按——S 放绳把桶送下去，触水灌满，W 一把一把摇上来。
      // 满桶沉，松手辘轳会倒转，桶又坐回水里。手上的分量就在这一下。
      const w = b.winch || (b.winch = { depth: 0, filled: false, hooked: !st.needs, slipT: 0 });
      if (!InZone(p.x, lvl, st.zone)) return;
      state.winchLock = true;   // 井口的竖推交给辘轳，不再当爬梯（c5 井台正压在竖井口上）
      if (!w.hooked) {
        if (p.item?.id === st.needs) {
          state.prompt = st.hookPrompt || "E · 挂上辘轳";
          if (input.interact) { w.hooked = true; p.item = null; FlashPose(state, "bow", 0.4); }
        } else {
          state.prompt = st.missPrompt || `得有${st.needsLabel || "桶"}才打得上水`;
        }
        state.winchView = { x: st.zone.x, depth: w.depth, filled: w.filled, hooked: w.hooked };
        return;
      }
      const climb = input.climb || 0;
      // 辘轳的木轴一圈一圈地叫：手在摇才响，摇得快叫得密
      const Creak = (rate) => {
        w.creakT = (w.creakT ?? 0) + dt;
        if (w.creakT > rate) { w.creakT = 0; Cue(state, "crank", { gain: 0.8 }); }
      };
      if (!w.filled) {
        if (climb > 0.05) {
          w.depth = Math.min(1, w.depth + dt * 0.62);
          FlashPose(state, "crank", 0.25);
          Creak(0.62);
        }
        state.prompt = "S · 放绳下去";
        state.promptFill = w.depth;
        if (w.depth >= 1) {
          w.filled = true;
          state.toast = { text: "桶触到水面，咕咚一声灌满了。", t: 2.6 };
          Cue(state, "waterSplash");
          st.onFilled?.(state);   // 咕咚声传出去：后果小窗等钩子在这儿挂
        }
      } else {
        if (climb < -0.05) {
          w.depth = Math.max(0, w.depth - dt * 0.34);
          w.slipT = 0.3;
          FlashPose(state, "crank", 0.25);
          Creak(0.5);
        } else {
          // 松手：辘轳倒转。留 0.3s 的棘齿宽限，换手不至于立刻坠
          w.slipT = Math.max(0, w.slipT - dt);
          if (w.slipT <= 0 && w.depth < 1) {
            w.depth = Math.min(1, w.depth + dt * 0.45);
            if (w.depth >= 1 && !w.slipShown) {
              w.slipShown = true;
              state.toast = { text: "手一松，辘轳呼噜噜倒转——桶又坐回了水里。", t: 3 };
            }
          }
        }
        state.prompt = "W · 摇上来";
        state.promptFill = 1 - w.depth;
        if (w.depth <= 0) {
          if (st.gives) GiveItem(state, st.gives);
          if (st.transform) state.player.item = { ...st.transform };
          state.winchView = null;
          finish();
          return;
        }
      }
      state.winchView = { x: st.zone.x, depth: w.depth, filled: w.filled, hooked: true };
      return;
    }
    default: return;
  }
}

function ApplyUse(state, st) {
  if (st.needs && st.consume !== false) state.player.item = null;
  if (st.transform) state.player.item = { ...st.transform };
  if (st.gives) GiveItem(state, st.gives);
}

// 跟车掩护：车把式赶着车走，人落远了他就吁住牲口等；灯扫过来时，
// 贴着车走才在影子里（危险判定在 StepLightHazard）
function StepCartRide(state, def, input, dt) {
  if (!state.cart) state.cart = { x: def.from };
  const cart = state.cart;
  const p = state.player;
  if (Math.abs(p.x - cart.x) < 6.5) cart.x = Math.min(def.to, cart.x + def.speed * dt);
  const driver = FindActor(state, def.driver);
  if (driver) { driver.x = cart.x + 1.7; driver.heading = 1; driver.level = "surface"; }
  if (cart.x >= def.to - 0.4 && Math.abs(p.x - cart.x) < 5.5) {
    if (def.note) state.toast = { text: def.note, t: 5 };
    AdvanceBeat(state);
  }
}

// 刨料：木匠的第一课，也是这一章唯一一次"手上真有活"的教学。
//
// 上一版是「站在工作台边按 E 敲三下木楔」——镜头在十几米外，木楔只有几个
// 像素，按键落下去画面上什么都没发生，玩家手上没有任何分量。刨不一样：
// 它是**长推**的活。一推到底，一条刨花打着卷落下来，木头亮一分；推到半道
// 松了手，刨刃啃住木头，出来的是一小截碎屑，那一趟就白费了大半。
// 「推得稳不稳」这件事，用不着一个字去说。
//
// 输入与划线同一套语汇（位移驱动）：桌面按住 E 往前推，触屏直接把刨子拖过去。
// 顺纹（+x）才吃木头，回程只是把刨子拖回来——木匠不会倒着刨。
function StepPlane(state, def, input, dt) {
  const b = state.beat;
  const father = FindActor(state, "father");
  const bx = def.zone.x;
  const span = def.span ?? 0.62;
  const workX = bx - 0.55;                 // 干活的站位（台子近端）
  const need = def.passes ?? 3;

  if (b.u === undefined) {
    b.u = 0; b.passes = 0; b.stalls = 0; b.idleT = 0; b.armed = true;
    b.pile = 0; b.everMoved = false; b.grainD = 0;
    b.demoT = def.demoTime ?? 3.0; b.demoU = 0; b.demoCurl = false;
    // 撂下锯：教刨料这一拍，爹手上不能还占着拉锯的活。他先站到工位上示范
    if (father) {
      father.track = null; father.carry = null;
      father.x = workX; father.heading = 1; father.cineTarget = null;
    }
    // 看爹示范的站位：往里收一点，不然在 4.1m 的画框里他半个人挂在边上
    state.player.x = workX - 0.92;
    state.player.heading = 1;
  }

  const Publish = (u, active) => {
    state.planing = {
      x: bx, y: def.boardY ?? 0.60, span,
      u, active,
      smooth: Math.min(1, b.passes / need),      // 木头被刨亮了多少
      pile: b.pile,                              // 地上那堆刨花
      returning: !b.armed,                       // 自动通关驱动器看这个掉头
    };
  };

  // ── 爹的示范：一趟到底，一条长刨花。没有字幕，看就是了 ──
  if (b.demoT > 0) {
    b.demoT -= dt;
    const k = Math.min(1, Math.max(0, (def.demoTime ?? 3.0) - b.demoT - 0.5) / 1.9);
    b.demoU = k;
    if (father) { father.pose = "planePush"; father.poseU = k; }
    // 推的过程里持续出刨花声（每推过 8cm 一粒），到头甩出一条长刨花
    b.grainD += Math.max(0, k - (b.prevDemoU ?? 0)) * span;
    b.prevDemoU = k;
    if (b.grainD > 0.08) { b.grainD = 0; Cue(state, "planeCut", { gain: 0.55 }); }
    if (k >= 1 && !b.demoCurl) {
      b.demoCurl = true;
      b.pile += 1;
      state.planeCurl = { x: bx + span / 2, y: (def.boardY ?? 0.60) + 0.16, len: 1, t: 0 };
      Cue(state, "planeCurl");
    }
    if (b.demoT <= 0) {
      // 让开工位，站到台子另一头看着
      if (father) { father.pose = null; father.poseU = undefined; father.x = bx + 1.05; father.heading = -1; }
      b.demoU = 0;
    }
    Publish(b.demoU, false);
    return;
  }

  const near = Math.abs(state.player.x - workX) < 0.85;
  if (!near) {
    state.player.pose = state.player.pose === "planePush" ? null : state.player.pose;
    Publish(b.u, false);
    state.prompt = "";
    return;
  }

  // 两种握法，同一件事（与划线同源）：按住 E 往前推 / 直接把刨子拖过去
  const held = input.interactHeld || input.interact;
  const push = Math.abs(input.moveX) > 0.05;
  let dv = 0;
  if (held && push) dv += Math.sign(input.moveX) * dt * (def.speed ?? 0.62);
  if (input.dragX) dv += input.dragX;
  // 按住 E 推的时候人不许跟着走——MovePlayer 排在节拍执行器前面，
  // 不钉住的话 A/D 会把柱子一路推出工位，刨到一半人就没了。
  // 松开 E 就还能走开（这一拍不锁死玩家）。身子往前送的观感由姿势的 hipX 给。
  if (held) { state.player.x = workX; state.player.heading = 1; }

  const prevU = b.u;
  b.u = Math.max(0, Math.min(1, b.u + dv));
  const forward = b.u - prevU;
  if (Math.abs(forward) > 0.0005) b.everMoved = true;

  if (forward > 0 && b.armed) {
    // 吃木头：每推过 8cm 出一粒刨花声，手上一直有东西在响
    b.idleT = 0;
    b.grainD += forward * span;
    if (b.grainD > 0.08) { b.grainD = 0; Cue(state, "planeCut", { gain: 0.5 + Math.random() * 0.2 }); }
  } else if (b.armed && b.u > 0.06 && b.u < 0.94) {
    // 停在半道：刨刃啃住木头。停一次扣一档，不是失败，是"这一趟不齐"
    b.idleT += dt;
    if (b.idleT > 0.26) { b.idleT = -1e9; b.stalls += 1; Cue(state, "planeStall", { gain: 0.8 }); }
  }
  if (forward > 0.0005 && b.idleT < 0) b.idleT = 0;   // 又推起来了，重新开始计停顿

  // 一趟推到头：刨花的长短就是这一趟的成绩
  if (b.armed && b.u >= 0.995) {
    const quality = b.stalls === 0 ? 1 : b.stalls === 1 ? 0.6 : 0.35;
    b.passes += quality;
    b.pile += 1;
    state.flags.planedOnce = true;
    state.planeCurl = { x: bx + span / 2, y: (def.boardY ?? 0.60) + 0.16, len: quality, t: 0 };
    Cue(state, "planeCurl", { gain: 0.6 + quality * 0.5, rate: 0.9 + quality * 0.25 });
    if (b.stalls === 0 && b.passes < need) state.toast = { text: "一整条刨花打着卷落下来。", t: 2.2 };
    else if (b.stalls > 0) state.toast = { text: "中间顿了一下——出来的是碎屑。一推到底才齐。", t: 3 };
    b.stalls = 0;
    b.armed = false;                     // 得把刨子拖回来才能再推一趟
  }
  if (!b.armed && b.u <= 0.05) b.armed = true;

  // 动词动画：姿势由推程直接驱动——玩家的手推多远，柱子的身子就送多远。
  // 这是"交互感"的根：不是播一段动画给他看，是他自己在带着这具身子干活。
  state.player.pose = "planePush";
  state.player.poseU = b.u;
  state.player.poseT = undefined;
  state.prompt = null;                   // 引导交给 QTE 轨道，不占中间那条
  state.dragTrack = {
    t: b.u, idle: !b.everMoved,
    tip: b.armed ? "顺着木纹，一推到底" : "把刨子拖回来",
    back: !b.armed,
  };
  Publish(b.u, true);

  if (b.passes >= need) {
    state.planing = null;
    state.dragTrack = null;
    state.player.pose = null;
    state.player.poseU = undefined;
    if (father) { father.pose = null; father.poseU = undefined; }
    if (def.note) state.toast = { text: def.note, t: 4.5 };
    AdvanceBeat(state);
  }
}

// ---------------------------------------------------------------------------
// 后果小窗（勇敢的心式画中画）：玩家的操作在画面外起了作用，就在角落里开一扇
// 照片小窗给他看一眼——桶灌满的咕咚声传到菜畦，娘直起腰；水摇上来了，娘往门口走。
// 渲染层照 who 的位置架第二台相机（Script_World.RenderPip），这里只管开与关。
// ---------------------------------------------------------------------------
function ShowPip(state, spec) {
  state.pip = { hw: 3.5, t: 3.2, ...spec };
  state.flags.pipShown = true;   // 冒烟测试盯这面旗：小窗机制断了不会有别的测试变红
}

// 干活的人（无文字引导的一部分：家里没人站着围观）。
// 爹在工作台前拉锯，娘在菜畦锄地——谁被叫去做别的事，谁再放下手里的活。
const V_PATCH_X = 16.8;   // 菜畦（veggieWest prop）里娘锄地的站位
function FatherSaw(state) {
  const father = FindActor(state, "father");
  if (!father) return;
  father.x = V.workbench.x + 0.9;
  father.heading = -1;              // 面朝工作台锯
  father.cineTarget = null;
  father.track = { name: "sawing", t: 0 };
  father.carry = "锯";
}
function MotherHoe(state) {
  const mother = FindActor(state, "mother");
  if (!mother) return;
  mother.cineTarget = null;
  mother.x = V_PATCH_X;
  mother.heading = -1;              // 面朝菜畦
  mother.track = { name: "hoeing", t: 0 };
  mother.carry = "锄头";
}

export const SCRIPTS = {
  c1: [
    {
      // 序章（对标《勇敢的心》两分钟新闻片）：从卢沟桥一路收拢到一道门框。
      // 节奏不是均速平推——1–5 段快切叠画，9 段推镜变速，10 段起骤然放慢，
      // 13 段是快慢之间的沉降拍（粮的铰链：c1_father 审问问的正是粮）。
      // 每段一幅专画的卡（渲染层做慢推的 Ken Burns，定格画片才不像幻灯片）。
      kind: "cinematic", id: "c1_prologue", prologue: true,
      lines: [
        { stage: "民国二十六年，七月。卢沟桥的枪声，把华北的夏天拦腰打断。", d: 4.6, cam: { kind: "insertVideo", clip: "Pro_01", card: "pro1" } },
        { stage: "北平陷落。天津陷落。铁路沿线的城池，一座接一座换了旗子。", d: 4.4, cam: { kind: "insertVideo", clip: "Pro_02", card: "pro2" } },
        { stage: "大军往南去了。可华北还在——几万万人的华北，留在了铁蹄底下。", d: 4.6, cam: { kind: "insertVideo", clip: "Pro_03", card: "pro3" } },
        { stage: "有人不肯走。他们钻进太行山，扎进冀中平原，在敌人背后扎下根来。", d: 4.8, cam: { kind: "insertVideo", clip: "Pro_04", card: "pro4" } },
        { stage: "据点、炮楼、封锁沟，把平原割成一块一块的棋盘。他们管这叫『治安区』。", d: 5.4, cam: { kind: "insertVideo", clip: "Pro_05", card: "pro5" } },
        { stage: "扫荡一年比一年狠。抢粮，烧屋，抓人。", d: 5.0, cam: { kind: "insertVideo", clip: "Pro_06", card: "pro6" } },
        { stage: "平原上无山可靠，无林可藏。庄稼人把命，藏进了他们唯一有的东西——脚下的土。", d: 6.0, cam: { kind: "insertVideo", clip: "Pro_07", card: "pro7" } },
        { stage: "先是一家的地窖，后来是两家相通的洞。再后来，村连着村——庄稼地底下，长出了另一个华北。", d: 6.4, cam: { kind: "insertVideo", clip: "Pro_08", card: "pro8" } },
        { stage: "这个故事，发生在冀中一个普通的村庄。", d: 5.2, cam: { kind: "insertVideo", clip: "Pro_09", card: "pro9" } },
        { stage: "梁家村。一百来户人家。一口井，一盘磨，一棵老槐树。", d: 7.6, cam: { kind: "insertVideo", clip: "Pro_10", card: "pro10" } },
        { stage: "村东头住着一个木匠，姓梁。斧凿一响，十里八乡都请他。", d: 7.8, cam: { kind: "insertVideo", clip: "Pro_11", card: "pro11" } },
        { stage: "他有个儿子，叫柱子——房梁的梁，柱子的柱。庄稼人给孩子起名，起的都是盼头。", d: 8.2, cam: { kind: "insertVideo", clip: "Pro_12", card: "pro12" } },
        { stage: "1942年，春。仗打了五年，粮比往年更金贵——地里的、囤里的，谁都在数。", d: 7.0, cam: { kind: "insertVideo", clip: "Pro_13", card: "pro13" } },
        { stage: "可在梁家村，日子还得往下过：鸡叫了，磨响了，柱子家的娘在院门口喊孩子回家吃饭。", d: 8.0, cam: { kind: "insertVideo", clip: "Pro_14", card: "pro14" } },
        { stage: "这天早上，梁木匠把儿子叫到了门框跟前。", d: 4.0, cam: { kind: "wide", x: 42 } },
      ],
    },
    {
      kind: "cinematic", id: "c1_open",
      lines: [
        { stage: "1942年，华北敌后。梁家村。", d: 3.2, cam: { kind: "wide", x: 60 },
          on: (state) => {
            // 开场这场戏原来全靠字幕：爹站着不动、柱子站着不动。现在让他们演——
            // 爹手上有刨子（放下才有"放下"可看），柱子正往外跑（叫得住才有"叫住"）
            const father = FindActor(state, "father");
            if (father) { father.carry = "刨子"; father.x = 41; father.heading = -1; }
            state.player.x = 44;
            state.player.cineWalk = { x: 49, speed: 2.6 };
          } },
        // 旁白铁律：画面内的动作不实况解说。这一拍是纯走位表演——
        // 爹放下刨子、往外跑的儿子收步回身，大动作在这个镜距下自己会说话
        { stage: "", d: 3.2, cam: { kind: "shot", x: 43, y: 1.8, dist: 11 },
          on: (state) => {
            const father = FindActor(state, "father");
            // 放下刨子：手里空出来，同时工作台上多一件东西
            if (father) { father.carry = null; father.heading = 1; }
            // 被叫住：跑出去的脚步收住，转身走回门框
            state.player.cineWalk = { x: 39.4, speed: 1.7 };
          } },
        { stage: "爹朝门框那边扬了扬下巴。", d: 2.8, cam: { kind: "shot", x: 38, y: 1.8, dist: 9 },
          on: (state) => {
            state.player.cineWalk = null;
            const father = FindActor(state, "father");
            if (father) { father.cineTarget = { x: 35.6 }; father.cineSpeed = 1.4; father.heading = -1; }
          } },
      ],
    },
    {
      // 门框上的刻痕是全篇的题眼，一头一尾却都由脚本代劳。这是第一次：
      // 他是被量的那个人，所以玩家要做的就是走过去、自己靠上去、站直。
      kind: "actSeq", id: "c1_doorframe",
      objective: "爹在门框那儿等着", hint: "走到门框边",
      steps: [
        { x: V.doorframe.x, r: 1.4, prompt: "E · 靠上门框",
          on: (state) => { state.player.heading = 1; } },
      ],
    },
    {
      // 镜头推到门框上：这一下要看得见木头的纹、孩子的头顶、和那支石笔。
      // 全景里划线只是一个像素在动，凑近了才是"爹在给我量身高"。
      kind: "scribe", id: "c1_carve", zone: V.doorframe, speed: 0.5, markY: 1.28,
      cam: { kind: "shot", x: 34.9, y: 1.42, dist: 2.9 },
      objective: "爹比着你的头顶，在门框上划一道", hint: "跟着爹的手，把石笔拖过去",
      note: "墨斗线弹在木头上，留下一道浅浅的印。",
      onStart: (state) => {
        // 爹得真的走过来伸手够门框，不能站在院子那头让字幕替他划
        const father = FindActor(state, "father");
        if (father) { father.x = V.doorframe.x + 1.1; father.heading = -1; father.pose = "mark"; }
        state.player.x = V.doorframe.x - 0.35;
        state.player.heading = 1;
      },
      onDone: (state) => {
        const father = FindActor(state, "father");
        if (father) father.pose = null;
      },
    },
    {
      kind: "cinematic", id: "c1_mark",
      lines: [
        { stage: "爹用凿子把那道印刻深了一点。", d: 4.0, cam: { kind: "insertCard", card: "carve" } },
        { who: "爹", say: "再过几年，这个家就靠你了。", d: 3.6, cam: { kind: "ots", subject: "father", other: "player", dist: 3.4 } },
        // 旁白铁律：「仰着头不太懂」改哑剧——歪头 + 头顶冒「？」，画面自己说
        { stage: "", d: 2.6, cam: { kind: "ots", subject: "player", other: "father", dist: 3.2 },
          on: (state) => {
            state.player.pose = "puzzled";
            // 气泡要陪满整行（收尾采样在 d-0.15），下一行的 on() 里由姿势归位带走
            state.bubbleFlash = { who: "player", icon: "q", t: 3.0 };
          } },
        { stage: "他惦记着村东头那堆没搬完的木料。", d: 3.8, cam: { kind: "shot", x: 40, y: 1.8, dist: 12 },
          on: (state) => {
            // 心思已经在村东头了：眼睛先往那边去
            state.player.pose = null;
            state.player.heading = 1;
            const father = FindActor(state, "father");
            if (father) { father.heading = -1; }
          } },
      ],
    },
    {
      // 独轮车运木料：一件家务同时教「扛放」与「推」（C3 推陷车/跟车的前置）。
      // 去木料堆的路上先翻院墙缺口——「翻越」的第一次，贴近自动手脚并用，
      // 可翻越物的轮廓语法（肩高、顶沿缺口）从这堵墙定死。
      kind: "chain", id: "c1_barrow",
      objective: "帮爹把木料运回来", hint: "村东头那两根木料，独轮车就在墙缺口外",
      bubbles: (state) => {
        // 爹缺木料：图形气泡挂在他头上，直到两根都上了车
        if ((state.flags.barrowPlanks || 0) < 2) state.bubbles.push({ who: "father", icon: "plank" });
      },
      onStart: (state) => {
        // 柱子跑腿，家里人不站着围观：爹在工作台前拉锯（他等的就是这批料），
        // 娘挎着锄头往屋西头的菜畦去——走着去，不凭空出现
        FatherSaw(state);
        const mother = FindActor(state, "mother");
        if (mother) {
          mother.carry = "锄头";
          mother.cineTarget = { x: V_PATCH_X };
          mother.cineSpeed = 1.45;
        }
      },
      tick: (state) => {
        // 娘走到菜畦就开始锄地（走位到点没有回调，这里每帧看一眼）
        const mother = FindActor(state, "mother");
        if (mother && !mother.cineTarget && !mother.track
          && Math.abs(mother.x - V_PATCH_X) < 1.2) MotherHoe(state);
      },
      steps: [
        // 木料别搁在草垛（52±1.6）里：捡的东西必须看得见（目标同屏原则的底线）
        { type: "pickup", x: 54.4, item: { id: "plankA", label: "木料", big: true }, prompt: "E · 扛起木料" },
        { type: "use", zone: { x: 50.5, w: 2.6 }, needs: "plankA", prompt: "E · 放上车",
          effect: (state) => { state.flags.barrowPlanks = 1; Cue(state, "drop"); } },
        { type: "pickup", x: 56.4, item: { id: "plankB", label: "木料", big: true },
          prompt: "E · 扛起木料",
          effect: (state) => {
            // 嗜头：母鸡扑棱着飞下去。也是「动静会惊动活物」的第一次暗示
            state.flags.henFlew = true;
            state.henFlee = { x: 56.4, t: 0 };
            Cue(state, "henSquawk");
          } },
        { type: "use", zone: { x: 50.5, w: 2.6 }, needs: "plankB", prompt: "E · 放上车",
          effect: (state) => { state.flags.barrowPlanks = 2; Cue(state, "drop"); } },
        { type: "push", from: 50.5, dist: 9.2, dir: -1, obj: "barrow",
          prompt: "按住 E · 推车",
          note: "木料到了。爹拍了拍车帮，转身拿家伙。",
          effect: (state) => { state.flags.barrowHome = true; state.cart = null; } },
      ],
    },
    {
      // 帮爹把料刨平（教「长推」）。镜头推到台面上——刨花、木纹、两双手，
      // 这一拍要看得见木头。爹先一趟示范，然后让开工位。
      // 这块刨平的料就是他接下来要合的榫；也是扫荡时他慌忙塞进柴堆的那把刨子
      // 唯一一次真正在玩家手里用过——藏的是刚才教会你的那件东西。
      kind: "plane", id: "c1_tenon", zone: V.workbench,
      // boardY = 料的**上沿**。台面在 0.54m（DrawBench 的板厚），料厚 0.17m，
      // 所以上沿落在 0.71——低了就陷进台子里，高了就浮在半空
      passes: 3, span: 0.62, boardY: 0.71, speed: 0.62, demoTime: 3.0,
      // 景别按"木头是主角"定：4.1m 画宽、2.3m 画高——柱子占画高六成，
      // 刨子在屏幕上有七十来个像素，刨花落下来看得清是一条卷。
      // （老版这一拍根本没写 cam，用的是 12.6m 的跟随景别，木楔只有几个像素。）
      cam: { kind: "shot", x: 40.35, y: 0.88, dist: 2.05 },
      objective: "帮爹把这块料刨平", hint: "顺着木纹一推到底，中间别停",
      note: "料平了。爹用手掌从头到尾抹了一遍，没说话，点了下头。",
    },
    {
      // 教「链＋单格换手」：两跳半——挂桶才知绳断；翻堆要双手，得先放下桶；
      // 接好绳还得折回来取桶。「大件占手、放下换手」在无压力下成为肌肉记忆
      //（C4 限时链的根在这里）。
      kind: "chain", id: "c1_water",
      objective: "帮娘打一桶水回来", hint: "水缸见了底。水桶在屋里",
      bubbles: (state) => {
        // 井台缺绳：断绳气泡挂在井上，直到接好
        if (state.flags.wellRopeBroken) state.bubbles.push({ x: V.well.x, y: 2.6, icon: "rope" });
      },
      onStart: (state) => {
        // 合完榫，各回各的活：爹接着拉锯，娘已经在菜畦里了
        FatherSaw(state);
        if (!state.flags.waterFilled) MotherHoe(state);
      },
      // 打水这一路磕磕绊绊（绳断、翻堆、接绳），玩家一旦停在半道太久，
      // 后果小窗开一眼菜畦：娘直起腰朝井台望——不打断，只惦记
      pipIdle: {
        after: 22, cooldown: 40,
        on: (state) => {
          if (state.flags.waterFilled) return;
          const mother = FindActor(state, "mother");
          if (mother) { mother.track = null; mother.heading = 1; }
          ShowPip(state, {
            who: "mother", t: 3.0,
            onEnd: (s) => {
              // 望完接着干活——水还没打上来，地不能撂着
              if (!s.flags.waterFilled) MotherHoe(s);
            },
          });
        },
      },
      steps: [
        { type: "pickup", x: 31, item: { id: "bucket", label: "空水桶" }, prompt: "E · 拎起桶" },
        { type: "use", zone: V.well, needs: "bucket", consume: false, prompt: "E · 挂上井绳",
          note: "井绳断了半截——桶放不下去。得找根麻绳。",
          effect: (state) => { state.flags.wellRopeBroken = true; } },
        { type: "drop", zone: V.woodpile, itemId: "bucket", storeIn: "bucketAt",
          prompt: "E · 放下桶腾手" },
        { type: "pickup", x: 70, item: { id: "rope", label: "麻绳" },
          prompt: "E · 抽出绳头",
          effect: (state) => {
            // 嗜头：翻堆惊出一只田鼠，贴着地皮蹿没影了
            state.mouseFlee = { x: 70, t: 0 };
            state.flags.ropeTaken = true;
          } },
        { type: "use", zone: V.well, needs: "rope", hold: 1.2, prompt: "按住 E · 接绳",
          note: "麻绳接上了。辘轳又能转了。",
          effect: (state) => { state.flags.wellRopeBroken = false; } },
        { type: "pickupGround", flagX: "bucketAt", item: { id: "bucket", label: "空水桶" },
          prompt: "E · 拎回桶" },
        { type: "winch", zone: V.well, needs: "bucket",
          gives: { id: "fullBucket", label: "一桶水", big: true },
          note: "水打上来了。桶沿一路往下滴。",
          // 桶触水灌满的咕咚声传到菜畦：娘直起腰、朝井台望——后果小窗给玩家看这一眼
          onFilled: (state) => {
            state.flags.waterFilled = true;
            const mother = FindActor(state, "mother");
            if (mother) { mother.track = null; mother.heading = 1; }
            ShowPip(state, { who: "mother", t: 3.0 });
          },
          effect: (state) => {
            // 娘出来接：满桶回家那一屏路的尽头是人，不是水缸。
            // 锄头搁在畦沿上，人往门口去——小窗再开一眼，玩家知道她动身了
            const mother = FindActor(state, "mother");
            if (mother) {
              mother.track = null;
              mother.carry = null;
              mother.cineTarget = { x: 36.4 };
              mother.cineSpeed = 2.0;
            }
            ShowPip(state, { who: "mother", t: 3.4 });
          } },
        { type: "use", zone: { x: 35.8, w: 2.6 }, needs: "fullBucket", prompt: "E · 交给娘",
          note: "娘接过桶，颠了颠分量，朝他笑了笑。",
          effect: (state) => {
            // 接过桶就进屋倒进水缸——水有去处，人有下一件事
            const mother = FindActor(state, "mother");
            if (mother) { mother.carry = "桶"; mother.cineTarget = { x: 32.4 }; mother.cineSpeed = 1.2; }
            Cue(state, "drop");
          } },
      ],
    },
    {
      // 教「投掷」＋「声音」的前一半：无压力的一投。妹妹在树下仰头跳着够——
      // 她的视线就是引导线；投空的石子惊飞一群麻雀，失败本身成为
      // 「石子落地会出声」的无压力演示（C2 声东击西的前置认知）。
      // 去的路上再翻一道田埂（翻越 30 秒内复用、换语境）。
      // （历史检查：不是风筝——1942 年敌后农村的孩子头上是花布巾。）
      kind: "chain", id: "c1_cloth",
      objective: "去老槐树下找妹妹回家吃饭", hint: "娘直起腰，朝老槐树的方向望了望",
      onStart: (state) => {
        // 妹妹仰头跳着够：动态显著性就是引导，不用文字
        const sister = FindActor(state, "sister");
        if (sister) { sister.track = { name: "reachJump", t: 0 }; sister.heading = 1; }
      },
      steps: [
        { type: "talk", actor: "sister", prompt: "E · 问妹妹",
          lines: [
            { who: "妹妹", say: "哥——风把我的头巾刮到树上去了！", d: 3.2, cam: { kind: "shot", x: 126, y: 2.6, dist: 6.5 } },
            { stage: "那块洗得发白的花布巾挂在树杈上，风一过就扑棱一下。", d: 3.6, cam: { kind: "insert", x: 127.6, y: 5.2, dist: 3.2 } },
          ] },
        { type: "throwHit", pickupX: 120, target: { x: 127.6, y: 5.2, r: 2 },
          prompt: "F · 投",
          missNote: "石子落了空——扑棱棱惊起一片麻雀。",
          miss: (state, land) => {
            // 投空不白投：麻雀炸窝，「石子落地会出声」这件事画面自己演了
            state.sparrowBurst = { x: land, t: 0 };
            Cue(state, "flutter");
          },
          note: "布巾打着旋儿飘下来了。",
          effect: (state) => {
            state.flags.clothDown = true;
            const sister = FindActor(state, "sister");
            if (sister) sister.track = null;
          } },
        { type: "pickup", x: 129, item: { id: "cloth", label: "花布巾" }, prompt: "E · 拾起头巾" },
        { type: "use", zone: { x: 124, w: 4 }, needs: "cloth", prompt: "E · 系上头巾",
          note: "妹妹把头巾系好，肯跟着回家了。" },
      ],
    },
    {
      kind: "escort", id: "c1_sisterHome", follower: "sister", dest: V.homeYard,
      objective: "带妹妹回家", hint: "妹妹会跟着你走",
      // J-cut：锣声先于切镜半拍响起——教学收尾的最后两秒，声音已经变了天
      onDone: (state) => { Cue(state, "gong"); },
    },
    {
      kind: "cinematic", id: "c1_raid",
      lines: [
        // 惊变时刻旁白闭嘴、同期声接管：村口是画外真人的喊声，不是叙事者的转述
        { who: "村口喊声", say: "鬼子进村了——", d: 3.0, far: true, cam: { kind: "wide", x: 140, pan: -6 },
          on: (state) => {
            // 和第二章一个规矩：说到谁，谁就得在画面里。原先兵是过场演完才生成的，
            // 于是"鬼子进村了"这一句对着的是一个空村口
            SpawnRaidSoldiers(state);
            const r1 = FindActor(state, "raid1");
            const r2 = FindActor(state, "raid2");
            // 从村口往里走：镜头横摇跟着他们推进
            if (r1) { r1.x = 152; r1.heading = -1; r1.cineTarget = { x: 132 }; r1.cineSpeed = 2.0; }
            if (r2) { r2.x = 160; r2.heading = -1; r2.cineTarget = { x: 143 }; r2.cineSpeed = 1.8; }
            // 镜头此刻在村东口，院子不在画框里——趁这三秒把娘和妹妹走位到位：
            // 护送收束时妹妹可能还落在半路，娘还站在门口。硬切回院子之前必须站定
            const p = state.player;
            const sister = FindActor(state, "sister");
            const mother = FindActor(state, "mother");
            if (sister) { sister.following = false; sister.cineTarget = { x: p.x + 1.6 }; sister.cineSpeed = 3.4; }
            if (mother) { mother.carry = null; mother.cineTarget = { x: p.x + 2.6 }; mother.cineSpeed = 3.4; }
          } },
        { stage: "爹把刨子塞进柴堆，转身走向院门。", d: 3.0, cam: { kind: "shot", x: 40, y: 1.8, dist: 10 },
          on: (state) => {
            // 塞柴堆得手里先有刨子：撂下锯，从工作台上抄起刨子，走向院门边的柴堆
            const father = FindActor(state, "father");
            if (father) { father.track = null; father.carry = "刨子"; father.cineTarget = { x: 44.5 }; father.cineSpeed = 2.6; }
          } },
        // 无声走位：娘把妹妹往柱子那边一推，自己转身朝院门——一个动作同时完成
        // 「交托」与「娘为何留在院里」。没有字幕，两秒的表演
        { stage: "", d: 2.2, cam: { kind: "shot", x: 39, y: 1.6, dist: 8 },
          on: (state) => {
            const p = state.player;
            const mother = FindActor(state, "mother");
            const sister = FindActor(state, "sister");
            // 推得着才叫推：娘就在妹妹身后半步（line0 已走位到位），弯腰一送
            if (sister) { sister.cineTarget = { x: p.x + 0.6 }; sister.cineSpeed = 2.4; sister.heading = -1; }
            if (mother) { mother.cineTarget = null; mother.heading = -1; mother.pose = "bow"; }
          } },
        { who: "爹", say: "带妹妹进地窖。别出声。", d: 3.0, cam: { kind: "ots", subject: "father", other: "player", dist: 3.6 },
          on: (state) => {
            // 刨子塞进了柴堆（手空了）；他站定回头叮嘱，柱子跑近两步——
            // 隔着半个院子打正反打，画面里根本凑不齐两个人
            const father = FindActor(state, "father");
            if (father) { father.carry = null; father.cineTarget = null; }
            if (father) state.player.cineWalk = { x: father.x - 2.2, speed: 2.6 };
            // 娘转身朝院门口去——她留在院里的原因，走位已经交代了。
            // 目标点要压过推妹妹时的落位（sister.x+1.0 最东 ≈46.1），不然一步就"到了"
            const mother = FindActor(state, "mother");
            if (mother) { mother.pose = null; mother.cineTarget = { x: 47.6 }; mother.cineSpeed = 1.7; }
          } },
      ],
      onDone: (state) => {
        // 考场布防。两条铁律定死了它的形状：
        //   ① 撤退方向必须是空的——地窖口在 27，柱子站在 42，这 15m 是活路，
        //      不能有人站在上面。兵全在东边（院门外的街上），朝东背着院子。
        //   ② 重置点不能落在任何人的视线里，否则一复位又被看见，就是死循环。
        // 兵在街上朝外，你从他们背后往西溜进自家屋——「背对路线站定」就是这个意思。
        state.flags.raidStarted = true;
        const r1 = FindActor(state, "raid1");
        const r2 = FindActor(state, "raid2");
        // 巡街的：来回走，走到西头（49）才够得着院子东半边
        if (r1) { r1.cineTarget = null; r1.x = 57; r1.heading = 1; r1.patrol = [49, 57]; r1.speed = 1.05; }
        // 站定的那个：搁在院门外，脸朝街——他就是石子那道软窗口的对象
        if (r2) { r2.cineTarget = null; r2.x = 51; r2.heading = 1; r2.patrol = null; }
        state.stealthActive = true;
      },
    },
    {
      kind: "escort", id: "c1_hide", follower: "sister", dest: V.cellar, stealth: true,
      objective: "带妹妹躲进地窖", hint: "地窖口在屋里西头，贴着影子走",
      resetHint: "被巡逻的鬼子看见了。再试一次——柱子还只是个孩子，跑不过刺刀。",
      // 这是教学关的考场，考的是「用过」不是「用熟」：白昼 15m 的视距会把整条
      // 撤退路线扣死，这一幕收到六成多。收的是同一个数——渲染层画的光带、
      // 判定用的视距都走 VisionScale，画出来的和判出来的永远是一条线。
      visionScale: 0.62,
      // 出发前可扒墙缝看一眼街上的刺刀（E 观察，预教第三章的「看」）——
      // 两个无字幕的插入镜头替代文字威胁说明。位置在院墙上，兵在墙外街上
      peek: {
        x: 45.6, prompt: "E · 看一眼",
        lines: [
          { stage: "", d: 2.6, cam: { kind: "insert", x: 51, y: 1.3, dist: 5 } },
          { stage: "", d: 2.2, cam: { kind: "insert", x: 55, y: 1.3, dist: 4.2 } },
        ],
      },
      // 软性窗口：院里的石子堆——朝街上扔一颗，把街上那两个引得更远（非必选）
      stonePile: { x: 43.5 },
    },
    {
      kind: "cinematic", id: "c1_father",
      lines: [
        { stage: "地窖板的缝里，能看见院子。", d: 3.0, cam: { kind: "shot", x: 33, y: 0.9, dist: 8, slit: true },
          on: (state) => {
            const father = FindActor(state, "father");
            // cineTarget 必须清：上一段过场让他往院门走，走没走到都可能悬着。
            // 不清的话这场戏他会一边"跪"一边往 47 滑——传送演员前先掐断走位
            if (father) { father.x = 38; father.heading = 1; father.cineTarget = null; }
            const r1 = FindActor(state, "raid1");
            const r2 = FindActor(state, "raid2");
            if (r1) { r1.patrol = null; r1.cineTarget = { x: 36 }; r1.cineSpeed = 3; }
            if (r2) { r2.patrol = null; r2.cineTarget = { x: 40.5 }; r2.cineSpeed = 3; }
          } },
        { stage: "爹被两个兵按着跪在地上。", d: 3.4, cam: { kind: "shot", x: 38, y: 0.9, dist: 7, slit: true },
          on: (state) => {
            // 跪不是一张定格：他在挣，兵在按。两条循环轨道错开半拍咬在一起
            const father = FindActor(state, "father");
            if (father) { father.track = { name: "pressedStruggle", t: 0 }; father.heading = 1; }
            const r1 = FindActor(state, "raid1");
            // 手要按在肩上：0.55m，再远就是按空气
            if (r1) { r1.x = 37.45; r1.heading = 1; r1.cineTarget = null; r1.track = { name: "pressHold", t: 0 }; }
            const r2 = FindActor(state, "raid2");
            if (r2) { r2.x = 39.3; r2.heading = -1; r2.cineTarget = null; }
            // 娘被推跪在一边——不能让她站在画面正中看戏
            const mother = FindActor(state, "mother");
            if (mother) { mother.x = 35.1; mother.heading = 1; mother.pose = "kneel"; }
          } },
        // 审问是日语原声、不加字幕：板缝后的孩子听不懂，玩家也不必懂
        //（《勇敢的心》咕噜拟声的历史化等价物）。旁白只补画面给不了的那一句。
        { who: "日军", say: "言え！八路の食糧はどこに隠した！", noSub: true, d: 3.0,
          cam: { kind: "shot", x: 38, y: 0.9, dist: 7, slit: true } },
        { stage: "他们在问粮。", d: 2.4, cam: { kind: "shot", x: 38, y: 0.9, dist: 7, slit: true } },
        { stage: "爹摇头。枪托砸下来。他又摇头。", d: 4.4, cam: { kind: "insert", x: 38, y: 1.0, dist: 3.2, slit: true },
          on: (state) => {
            // 抡的轨道在 0.95s 到达落点；挨砸的轨道用 -0.95 的起点等在那儿，
            // 两个人在同一帧接上——这就是照参考视频 K 的那一下
            const r2 = FindActor(state, "raid2");
            if (r2) r2.track = { name: "buttStrike", t: 0 };
            const father = FindActor(state, "father");
            if (father) father.track = { name: "struckFall", t: -0.95 };
            const r1 = FindActor(state, "raid1");
            if (r1) r1.track = null;      // 按人的松开手，退半步
            if (r1) { r1.cineTarget = { x: 36.4 }; r1.cineSpeed = 1.2; }
          } },
        // 「妹妹想哭」由憋泣的呼吸声演（压低、闷），旁白只说画面外那半句
        { stage: "柱子把她的脸按进自己肩膀。", d: 3.8, cam: { kind: "close", on: "player", dist: 3.4 },
          on: (state) => {
            Cue(state, "sobBreath");
            state.player.pose = "shelter";
            const sister = FindActor(state, "sister");
            if (sister) {
              sister.pose = "leanIn";
              sister.x = state.player.x + 0.42;
              sister.heading = -1;
              sister.visible = true;
            }
          } },
        { stage: "爹被拖出院门的时候，回头看了一眼门框。", d: 4.2, cam: { kind: "shot", x: 42, y: 1.2, dist: 11, pan: 1.5 },
          on: (state) => {
            const father = FindActor(state, "father");
            // 脸还朝着门框那边：cineKeepHeading 不让行走方向把头扳回去
            if (father) { father.pose = "hauled"; father.heading = -1; father.cineKeepHeading = true; }
            const r2 = FindActor(state, "raid2");
            if (r2) r2.pose = null;
            // "架着走"得真的架着：两个兵一左一右贴在肩上，同速同向，
            // 全程钳成一个三人组。原先三个人隔着几米各走各的，谁也没在拖谁
            const r1 = FindActor(state, "raid1");
            if (father && r1) { r1.x = father.x - 0.72; }
            if (father && r2) { r2.x = father.x + 0.72; }
            for (const id of ["father", "raid1", "raid2"]) {
              const a = FindActor(state, id);
              if (a) { a.cineTarget = { x: 62 }; a.cineSpeed = 1.5; a.cineVanish = true; }
            }
          } },
        { stage: "那道刚刻下的线，还露着新茬。", d: 3.4, cam: { kind: "shot", x: 34, y: 1.5, dist: 5.5 },
          // iris 收在情感物件上：圆心对准门框刻痕收拢落黑
          on: (state) => { state.irisFocus = { x: 34.05, y: 1.30 }; } },
      ],
    },
  ],

  c2: [
    {
      kind: "cinematic", id: "c2_open",
      lines: [
        { stage: "1943年。爹没有回来。", d: 3.0, cam: { kind: "wide", x: 37 } },
        { stage: "柱子十六岁了，学会了爹的手艺，也学会了听见狗叫就先看村口。", d: 4.2, cam: { kind: "shot", x: 40, y: 1.8, dist: 10 } },
        { stage: "这天夜里，狗叫得不一样。", d: 3.0, cam: { kind: "shot", x: 40, y: 1.8, dist: 10 } },
        // 说到谁，谁就得在画面里：巡逻队在这一行进场，不是等过场演完
        // 队伍从村东口进来，镜头往西横移跟着走：一条村道上排开十几个人和几盏灯，
        // "又来了"这三个字才有分量
        { stage: "鬼子又来了。这回他们拿着名单，挨家找帮过八路的人。", d: 5.0,
          cam: { kind: "wide", x: 154, y: 3.4, hw: 30, pan: -18 },
          on: (state) => { SpawnNightSweep(state); } },
        { stage: "前头挑灯笼带路的，是邻村据点里的翻译官。", d: 4.4, cam: { kind: "shot", x: 120, y: 1.6, dist: 9 },
          on: (state) => {
            const s1 = FindActor(state, "sweep1");
            if (s1) { s1.x = 124; s1.heading = -1; }
          } },
      ],
    },
    {
      // 潜行开打之前，规则必须先演一遍给玩家看：娘按着你蹲下、第一盏灯
      // 从草垛沿上扫过去、没事——这一遍是安全的。没有这一拍，玩家走到
      // 半路被灯照满就只会觉得"什么意思？"，不会觉得自己学会了什么。
      kind: "cinematic", id: "c2_teach",
      lines: [
        { stage: "娘把两个孩子拉到草垛后头，按着蹲下。", d: 3.2, cam: { kind: "shot", x: 52, y: 1.3, dist: 7 },
          on: (state) => {
            // 上一镜在据点方向（x≈120），这一镜硬切回草垛——切镜时把人预摆到
            // 画框边上再走进来。原先从 38 起步走 14 米，三秒根本到不了，
            // 于是"拉到草垛后头"的柱子一直站在画框外
            const mother = FindActor(state, "mother");
            if (mother) { mother.x = 46; mother.cineTarget = { x: 50.5 }; mother.cineSpeed = 2.2; }
            state.player.x = 47;
            state.player.cineWalk = { x: 52.5, speed: 2.4 };
            const sister = FindActor(state, "sister");
            if (sister) { sister.x = 53.5; sister.heading = -1; }
          } },
        { stage: "一盏灯笼从东边巡了过来。", d: 4.2, cam: { kind: "shot", x: 59, y: 1.4, dist: 10 },
          on: (state) => {
            state.player.cineWalk = null;
            state.player.crouch = true;
            const sister = FindActor(state, "sister");
            if (sister) sister.pose = "leanIn";
            // 按着孩子蹲下的娘不能自己站得笔直：弯腰压着两个孩子，贴在跟前
            const mother = FindActor(state, "mother");
            if (mother) { mother.pose = "bow"; mother.cineTarget = null; mother.x = 51.4; mother.heading = 1; }
            // 开场过场把这个兵留在了 x≈124（挑灯带路那一镜）——不先把他挪到
            // 画框右沿外一步，"巡了过来"就是一句空话：灯根本进不了画面。
            // 说到谁，谁就得在画面里。走得慢：教学不赶时间，灯压过来的
            // 每一步都是给玩家看的。
            const s1 = FindActor(state, "sweep1");
            if (s1) {
              s1.x = 71;
              s1.heading = -1;
              s1.lantern = true;
              s1.cineTarget = { x: 58.5 };
              s1.cineSpeed = 1.6;
            }
          } },
        // 这两行不切走：镜头停在草垛上，看着灯一寸一寸压过来——教学的正片是这一镜
        { who: "娘", say: "灯扫过来，就蹲进影子里，贴着草垛别动。", d: 4.4, cam: { kind: "shot", x: 57, y: 1.3, dist: 8 } },
        { stage: "灯影在草垛根下一寸一寸挪过来。谁也没出声。", d: 4.2, cam: { kind: "shot", x: 56.5, y: 1.1, dist: 6.5 } },
        { stage: "灯光从草垛沿上掠过去，顿了顿，又移开了。", d: 4.6, cam: { kind: "shot", x: 56, y: 1.2, dist: 7 },
          on: (state) => {
            const s1 = FindActor(state, "sweep1");
            if (s1) { s1.cineTarget = { x: 78 }; s1.cineSpeed = 1.8; }
          } },
        { who: "娘", say: "记住：被照到了别慌，缩回影子里就没事。灯走了，再走。", d: 4.6, cam: { kind: "ots", subject: "mother", other: "player", dist: 3.4 } },
      ],
      onDone: (state) => {
        state.player.crouch = false;
        const sister = FindActor(state, "sister");
        if (sister) sister.pose = null;
        const s1 = FindActor(state, "sweep1");
        if (s1) s1.cineTarget = null;   // 交还常规巡逻
      },
    },
    {
      // 一段掩体接一段掩体地往前挪。娘看准空当就冲，冲到就贴着掩体等你——
      // 你学的是"什么时候能动"。88→107、107→132 两段长空地没有掩体，
      // 那里有一辆被征去运粮的板车来回推着走，跟着车影过。
      kind: "coverRun", id: "c2_mother", leader: "mother", follower: "sister",
      covers: [52, 60, 68, 78, 88, 107, 118],
      movingCover: { from: 88, to: 118, speed: 1.5, r: 2.9 },
      cartDriver: "hauler",
      objective: "跟着娘，一段一段往村东挪",
      hint: "草垛和断墙站着就藏得住，柴堆水瓮得蹲下；空地上跟着板车的影子走",
      resetHint: "灯把人照满了。退回上一处掩体。",
      onEnter: (state) => {
        // 夜里被叫起来出夫的乡亲，一车草料往东送，来回推。
        // 对搜村的人来说他是自己人的差役，谁也不拦——所以那片车影是安全的
        if (!FindActor(state, "hauler")) {
          state.actors.push(MakeActor("hauler", "villager", 90, { label: "出夫的乡亲" }));
        }
      },
      onDone: (state) => { state.cart = null; state.cartCoverR = undefined; },
    },
    {
      kind: "cinematic", id: "c2_decoy",
      lines: [
        { stage: "前面巷口站着人。走不过去了。", d: 3.0, cam: { kind: "shot", x: 136, y: 1.4, dist: 9 },
          on: (state) => {
            // 巷口那个人得真站在巷口：他此刻可能巡到 150 开外，三秒走不进画。
            // 切镜时把他放到画框右沿内，一步步逼近堵死路口
            const s3 = FindActor(state, "sweep3");
            if (s3) { s3.x = 143; s3.heading = -1; s3.cineTarget = { x: 138 }; s3.cineSpeed = 1.6; }
          } },
        { stage: "娘把妹妹的手放进柱子手里，又把两个孩子往石碾后面按了按。", d: 4.4, cam: { kind: "insert", x: 118, y: 1.0, dist: 2.8 },
          on: (state) => {
            // 特写只有 ±2.8m：手递手的三个人必须真的凑在石碾跟前
            const mother = FindActor(state, "mother");
            if (mother) { mother.x = 118; mother.heading = 1; }
            state.player.x = 116.9;
            state.player.heading = 1;
            const sister = FindActor(state, "sister");
            if (sister) { sister.x = 118.7; sister.heading = -1; }
          } },
        { stage: "她没说话。只朝村东口努了努嘴。", d: 3.4, cam: { kind: "ots", subject: "mother", other: "player", dist: 3.4 } },
        { stage: "然后她站起来，朝反方向走去，故意踢翻了一只水瓮。", d: 4.2, cam: { kind: "shot", x: 112, y: 1.6, dist: 11, pan: -4 },
          on: (state) => {
            const mother = FindActor(state, "mother");
            if (mother) { mother.cineTarget = { x: 84 }; mother.cineSpeed = 2.3; }
          } },
        { stage: "灯笼、喊声、脚步，全都追着那声响去了。", d: 3.8, cam: { kind: "shot", x: 92, y: 1.8, dist: 15, pan: -3 },
          on: (state) => {
            // 追声响的两盏灯从画框东沿外一步赶进来——巡逻此刻散在哪儿都有可能，
            // 不显式摆位，这句话就对着空街说
            const s1 = FindActor(state, "sweep1");
            if (s1) { s1.x = 100; s1.cineTarget = { x: 78 }; s1.cineSpeed = 2.6; }
            const s2 = FindActor(state, "sweep2");
            if (s2) { s2.x = 109; s2.cineTarget = { x: 80 }; s2.cineSpeed = 2.6; }
          } },
        // 娘的结局不在台词里：镜头不动，只看几盏灯往一处汇、重叠、停住
        { stage: "", d: 4.4, cam: { kind: "shot", x: 76, y: 1.5, dist: 11, trans: "dip" },
          on: (state) => {
            // 这一镜带黑场闪断（dip）：黑场里把追灯的三个人重新排到汇拢的起点，
            // speed 取 2.4——正好在下一行"灯停住了"之前全部走到、站定
            const mother = FindActor(state, "mother");
            if (mother) { mother.x = 84; mother.cineTarget = { x: 66 }; mother.cineSpeed = 2.6; }
            for (const [id, sx, tx] of [["sweep1", 84, 70], ["sweep2", 87, 74], ["sweep3", 88, 78]]) {
              const s = FindActor(state, id);
              if (s) { s.visible = true; s.lantern = true; s.x = sx; s.cineTarget = { x: tx }; s.cineSpeed = 2.6; }
            }
          } },
        { stage: "灯停住了。", d: 3.0, cam: { kind: "shot", x: 72, y: 1.5, dist: 8 },
          on: (state) => {
            const mother = FindActor(state, "mother");
            if (mother) { mother.visible = false; mother.cineTarget = null; }
          } },
      ],
      onDone: (state) => { MotherDecoyDone(state); },
    },
    {
      kind: "escort", id: "c2_escape1", follower: "sister", dest: V.treeShade, stealth: true,
      objective: "带妹妹往村东口去", hint: "沿着草垛和断墙的影子走",
      resetHint: "妹妹跑不快。等巡逻走远了再动。",
    },
    {
      // C1 的窝头喂的是妹妹，这回喂的是狗：同一个村子，两种夜晚。
      // 狗叫不是立刻失败——它把巡逻招过来，麻烦是滚起来的。
      kind: "chain", id: "c2_dog",
      objective: "王家的狗拴在路边——不能让它叫", hint: "狗认吃不认人。石碾上晾着几个窝头",
      resetHint: "灯笼追着狗叫围过来了。退回槐树影里，等他们散开。",
      steps: [
        { type: "pickup", x: 118, item: { id: "bun", label: "窝头" }, prompt: "E · 拿个窝头" },
        { type: "use", zone: V.dogYard, needs: "bun", prompt: "E · 丢过去",
          note: "狗埋下头去啃。尾巴摇了摇，没再出声。",
          effect: (state) => { state.flags.dogFed = true; } },
      ],
    },
    {
      // C1 打的是树杈上的布巾，这回打的是灯：同一个动词，第二次用在命上。
      kind: "chain", id: "c2_lantern",
      objective: "巷口的马灯照住了必经的路", hint: "草垛边有石子堆。灯挂得高，够不着",
      light: { zone: [156, 164], cycle: 1, lit: 1, offFlag: "lanternOut", src: { x: 160, y: 2.4 } },
      resetHint: "灯光里晃过人影，巡逻的喝了一声。退回草垛后面，重新想辙。",
      steps: [
        { type: "throwHit", pickupX: 152, target: { x: 160, y: 2.3, r: 2 },
          prompt: "F · 把马灯打灭",
          missNote: "石子磕在墙上，弹进了黑影里。再捡一颗。",
          note: "灯罩一声脆响，火苗灭了。影子一直接到了村东口。",
          effect: (state) => { state.flags.lanternOut = true; } },
      ],
    },
    {
      kind: "escort", id: "c2_escape2", follower: "sister", dest: V.eastExit, stealth: true,
      objective: "带妹妹去村东口", hint: "灯灭了，影子是连着的",
      resetHint: "妹妹跑不快。等巡逻走远了再动。",
      midToast: { zone: { x: 165, w: 6 }, text: "路过的院里在拖人。柱子把妹妹的脸按在自己胸口，贴着墙根走了过去。" },
    },
    {
      kind: "cinematic", id: "c2_taken",
      lines: [
        { stage: "村东口就在眼前。", d: 2.6, cam: { kind: "shot", x: 166, y: 1.5, dist: 9 } },
        { stage: "两盏马灯突然从路两边亮起来。", d: 3.0, cam: { kind: "shot", x: 172, y: 1.5, dist: 10 },
          on: (state) => {
            state.actors.push(
              MakeActor("ambush1", "puppet", 178, { lantern: true, heading: -1 }),
              MakeActor("ambush2", "soldier", 167, { lantern: true, heading: 1 }),
            );
          } },
        { stage: "是等在这里的。", d: 2.6, cam: { kind: "shot", x: 172, y: 1.3, dist: 7 } },
      ],
    },
    {
      // 关卡设计写的是"带妹妹逃离失败——柱子第一次真正面对：自己保护不了家人"。
      // 这件事不能用过场演给玩家看，得让他自己按着不放、然后眼看着按不住。
      // 进度条永远到不了头：越用力掉得越快，这是设计，不是数值没调好。
      kind: "doomedHold", id: "c2_grip", duration: 4.6, cap: 0.72,
      objective: "别松手", hint: "手别抬起来",
      prompt: "按住 E · 别松手",
      pull: { actor: "sister", from: 174.2, to: 179 },
      onStart: (state) => {
        state.player.x = 173;
        state.player.heading = 1;
        const sister = FindActor(state, "sister");
        // 手拉着手才有"被拽走"可言——她原先站在几米开外，进度条就成了个抽象数字
        if (sister) { sister.x = 174.2; sister.following = false; sister.heading = -1; }
      },
      onFail: (state) => {
        const sister = FindActor(state, "sister");
        if (sister) { sister.following = false; sister.cineTarget = { x: 179 }; sister.cineSpeed = 2.4; }
        const a1 = FindActor(state, "ambush1");
        if (a1) { a1.cineTarget = { x: 184 }; a1.cineSpeed = 2.0; a1.cineVanish = true; }
      },
    },
    {
      kind: "cinematic", id: "c2_taken2",
      lines: [
        { stage: "妹妹的手从柱子手里被拽走。", d: 3.2, cam: { kind: "insertCard", card: "hands" } },
        { stage: "他扑上去。", d: 2.2, cam: { kind: "close", on: "player", dist: 3.6 },
          on: (state) => {
            state.player.pose = "lunge";
            state.player.cineWalk = { x: state.player.x + 1.4, speed: 2.2 };
          } },
        { stage: "枪托砸在背上。", d: 2.6, cam: { kind: "close", on: "player", dist: 3.0 },
          on: (state) => {
            state.player.cineWalk = null;
            state.player.pose = "struck";
            const a2 = FindActor(state, "ambush2");
            if (a2) { a2.pose = "swing"; a2.x = state.player.x + 1.3; a2.heading = -1; }
          } },
        { stage: "邻居七叔从沟里死死抱住他，捂着他的嘴，把他拖进高粱地。", d: 4.4, cam: { kind: "shot", x: 168, y: 1.0, dist: 8 },
          on: (state) => {
            state.player.pose = "dragged";
            // 七叔得在画面里：从沟里出来，抱住他往西拖
            state.actors.push(MakeActor("qishu", "villager", state.player.x - 0.7,
              { label: "七叔", heading: 1, pose: "lunge" }));
            const q = FindActor(state, "qishu");
            if (q) { q.cineTarget = { x: state.player.x - 9 }; q.cineSpeed = 1.6; }
            state.player.cineWalk = { x: state.player.x - 8.4, speed: 1.5 };
            const sister = FindActor(state, "sister");
            if (sister) sister.visible = false;
            const a2 = FindActor(state, "ambush2");
            if (a2) { a2.pose = null; a2.cineTarget = { x: 184 }; a2.cineVanish = true; }
          } },
        { stage: "", d: 1.8, cam: { kind: "shot", x: 160, y: 1.0, dist: 10, trans: "dip" },
          on: (state) => {
            state.player.pose = null;
            const q = FindActor(state, "qishu");
            if (q) { q.visible = false; q.cineTarget = null; }
          } },
        { stage: "那天夜里，娘没有回来。", d: 3.4, cam: { kind: "dark" } },
        { stage: "柱子在高粱地里蹲到天亮。他只剩一个念头了。", d: 4.0, cam: { kind: "dark" } },
        { stage: "救回妹妹。", d: 3.0, cam: { kind: "dark" } },
      ],
    },
  ],

  c3: [
    {
      kind: "cinematic", id: "c3_open",
      lines: [
        { stage: "乡亲们说，被抓的人关进了河东的据点。", d: 3.4, cam: { kind: "wide", x: 100 } },
        { stage: "柱子沿着运输队的车辙，摸到了据点外的庄稼地。", d: 3.8, cam: { kind: "wide", x: 150, pan: 6 } },
        { stage: "他不敢靠近。他先学会了看。", d: 3.2, cam: { kind: "shot", x: 20, y: 1.4, dist: 8 } },
      ],
      onDone: (state) => {
        SpawnFortPatrols(state, false);
        // 地里的乡亲：不是任务点，是要搭把手的人。帮了忙，话才敢说出口
        state.actors.push(
          MakeActor("aunt", "villager", F.auntSpot.x, { label: "拾柴的大娘" }),
          MakeActor("cartman", "villager", 107, { label: "赶车乡亲" }),
        );
      },
    },
    {
      kind: "observe", id: "c3_watch", spots: [F.obsWest, F.obsSouth, F.obsEast], watchTime: 5,
      objective: "在三处遮蔽点观察据点（每处停留一会儿）",
      hint: "蹲在遮蔽点里别动，柱子会把看到的记在心里",
      resetHint: "巡逻队走近了。柱子退回庄稼地，等风声过去。",
      notes: [
        "岗楼上两个人，换岗时背对南门，半袋烟的工夫。",
        "巡逻队沿墙根来回走，走到头会停下来抽袋烟。",
        "牢房在东边。白天押着人往围墙上搬土袋，天黑后送过一次饭。押送用的骡车拴在门里。",
      ],
      // 每看完一处，切到他正望着的那样东西上。第三章的功课是"学会看"，
      // 那就得让画面替他看，不是让字幕替他记。
      watchCine: [
        [{ stage: "岗楼上那两个人换班的时候，背是朝着南门的。", d: 3.6, cam: { kind: "insert", x: 184, y: 5.4, dist: 5.5 } },
         { stage: "从背过身到重新站定，大约半袋烟的工夫。", d: 3.2, cam: { kind: "insert", x: 184, y: 5.4, dist: 4.6 } }],
        [{ stage: "巡逻队沿着墙根来回走。走到头，会停下来抽袋烟。", d: 3.8, cam: { kind: "insert", x: 176, y: 1.4, dist: 6.5 } }],
        [{ stage: "牢房在东边。白天押着人往围墙上搬土袋。", d: 3.6, cam: { kind: "insert", x: 192, y: 1.6, dist: 6 } },
         { stage: "门里拴着一辆骡车。车辕上空着。", d: 3.6, cam: { kind: "insert", x: 190, y: 1.0, dist: 3.4 } }],
      ],
    },
    {
      // 帮了忙，话才敢说：柴刀换来的那句口信，是第六章推理的半边
      kind: "chain", id: "c3_aunt",
      objective: "拾柴的大娘朝这边招了招手", hint: "乡亲们敢说话，但只敢小声说",
      resetHint: "巡逻队走近了。柱子退回庄稼地，等风声过去。",
      steps: [
        { type: "talk", actor: "aunt", prompt: "E · 搭话",
          lines: [
            { who: "大娘", say: "孩子，帮我找找柴刀——手一抖，掉进田埂那头了。", d: 3.8, cam: { kind: "ots", subject: "aunt", other: "player", dist: 3.4 } },
          ] },
        { type: "pickup", x: 134, item: { id: "sickle", label: "柴刀" }, prompt: "E · 摸出柴刀" },
        { type: "use", zone: F.auntSpot, needs: "sickle", prompt: "E · 还给大娘",
          noteAdd: "拾柴的大娘：『过几天要往县里押人。孩子，你一个人不行。』",
          note: "大娘攥住他的手腕，压低了声：『过几天要往县里押人。孩子，你一个人不行。』" },
      ],
    },
    {
      // 教「推」。推出来的不是路——是一片会走路的影子
      kind: "chain", id: "c3_cart",
      objective: "赶车乡亲的驴车陷住了", hint: "车帮上还搭着半车干草",
      resetHint: "巡逻队回头了。退进庄稼地，等他们走远。",
      steps: [
        { type: "talk", actor: "cartman", prompt: "E · 上前搭话",
          lines: [
            { who: "赶车乡亲", say: "给据点支差送草——车陷在这儿了。搭把手；躲着点巡逻的。", d: 4.2, cam: { kind: "ots", subject: "cartman", other: "player", dist: 3.4 } },
          ],
          noteAdd: "赶车的乡亲：『里头新关了十几个，有女娃。别靠南门，狗鼻子灵。』" },
        { type: "push", from: 106, dir: 1, dist: 4, prompt: "按住 E · 推车",
          note: "车轮从辙里蹦出来了。乡亲把缰绳一抖。" },
      ],
    },
    {
      // 《勇敢的心》式移动掩体段：车影是探照灯下唯一的影子
      kind: "cartRide", id: "c3_ride", from: 110, to: 144, speed: 1.35, safeR: 2.8, driver: "cartman",
      light: { zone: [120, 142], cycle: 7.5, lit: 2.4, src: { x: 184, y: 6 } },
      objective: "贴着草车走——灯扫过来时，车影是唯一的影子",
      hint: "别掉队。掉出车影又赶上灯，就全完了",
      resetHint: "灯从车帮上扫过去——差一点。乡亲把车又吁回了辙口。",
      note: "到草垛这儿，乡亲一抬下巴：前头的路，你自己贴着黑走。",
      onReset: (state) => { if (state.cart) state.cart.x = 110; },
      onDone: (state) => {
        // 车把式赶着车进据点交差去了
        const cm = FindActor(state, "cartman");
        if (cm) { cm.cineTarget = { x: 174 }; cm.cineSpeed = 1.5; cm.cineVanish = true; }
      },
    },
    {
      kind: "goto", id: "c3_closer", zone: F.gate, stealth: true,
      objective: "趁灯的间隙摸近南门，看清牢房方向", hint: "蹲在田埂下，读准探照灯的节奏再动",
      light: { zone: [146, 170], cycle: 8, lit: 2.6, src: { x: 184, y: 6 } },
      resetHint: "岗楼上的灯扫了过来。退回田埂下，重新数灯的节奏。",
      interruptAt: 0.8,
    },
    {
      kind: "cinematic", id: "c3_rescue",
      lines: [
        { stage: "身后突然伸过来一只手，把柱子整个按进田埂下面。", d: 3.6, cam: { kind: "close", on: "player", dist: 3.8 } },
        { stage: "巡逻队的脚步声从头顶的田埂上过去了。", d: 3.6, cam: { kind: "shot", x: 158, y: 1.2, dist: 9 } },
        { stage: "沟里蹲着几个背枪的庄稼人。领头的把他上下打量了一遍。", d: 4.0, cam: { kind: "shot", x: 9, y: 1.2, dist: 9 },
          on: (state) => {
            state.player.x = 11;
            const gao = MakeActor("gao", "militia", 7, { label: "高传宝", heading: 1 });
            state.actors.push(gao, MakeActor("mil1", "militia", 4, { heading: 1 }));
          } },
        { who: "高传宝", say: "梁家村的柱子？", d: 2.8, cam: { kind: "ots", subject: "gao", other: "player", dist: 3.4 } },
        { stage: "柱子没敢答话。", d: 2.4, cam: { kind: "ots", subject: "player", other: "gao", dist: 3.2 } },
        { who: "高传宝", say: "你爹以前帮过乡亲。", d: 3.0, cam: { kind: "ots", subject: "gao", other: "player", dist: 3.4 } },
        { stage: "夜里，一个满身泥的交通员摸进沟来，鞋底磨穿了。", d: 4.0, cam: { kind: "shot", x: 12, y: 1.2, dist: 8 },
          on: (state) => {
            state.actors.push(MakeActor("runner", "villager", 20, {
              label: "交通员", cineTarget: { x: 13 }, cineSpeed: 2.6, heading: -1,
            }));
          } },
        { stage: "他的鞋底磨穿了。", d: 3.0, cam: { kind: "insertCard", card: "sole" } },
        { who: "交通员", say: "据点里又抓了几个人。柱子的妹妹，也在里面。", d: 4.2, cam: { kind: "ots", subject: "runner", other: "gao", dist: 3.6 } },
        { who: "高传宝", say: "先把人救出来。不能让乡亲们再被带走。", d: 4.0, cam: { kind: "ots", subject: "gao", other: "runner", dist: 3.6 } },
        { stage: "鬼子放出风来，要往县里押人，日子没说定。", d: 4.6, cam: { kind: "shot", x: 170, y: 2.2, dist: 16 } },
      ],
    },
  ],

  c4: [
    {
      kind: "cinematic", id: "c4_open",
      lines: [
        { stage: "沙河庄的地道，是乡亲们一锹一锹挖出来的。", d: 3.6, cam: { kind: "wide", x: 90, y: -1.2 },
          on: (state) => { SpawnTunnelVillagers(state); } },
        // 说"藏得住人"，洞里就得有人：把乡亲摆在这一镜的画框里
        { stage: "它不通向据点。它通向的是：藏得住人，转移得走，活得下去。", d: 4.4, cam: { kind: "wide", x: 90, y: -1.2, pan: -6 },
          on: (state) => {
            const spread = [58, 61, 84, 87, 112];
            state.actors.filter((a) => a.kind === "villager").forEach((a, i) => {
              a.x = spread[i % spread.length];
              a.heading = i % 2 ? -1 : 1;
            });
          } },
        { who: "高传宝", say: "想救人，先学会怎么把人藏好。", d: 3.4, cam: { kind: "ots", subject: "gao", other: "player", dist: 3.6 } },
      ],
    },
    {
      kind: "lead", id: "c4_hideA", group: "elders", dest: TV.chamberA,
      objective: "把两位老人带到藏人洞·甲", hint: "走到老人身边招呼一声，他们会跟着你",
    },
    {
      kind: "lead", id: "c4_hideB", group: "family", dest: TV.chamberB,
      objective: "把大嫂和孩子带到藏人洞·乙", hint: "孩子走得慢，别落下他们",
    },
    {
      // C1 的链搬进地道：猫腰＋扛大件双重降速，第一次体会地道里搬东西的分量
      kind: "chain", id: "c4_shore",
      objective: "西口的顶木松了", hint: "光用手是按不住的——藏人洞乙备着撑木",
      steps: [
        { type: "pickup", x: 61, level: "under", item: { id: "prop", label: "撑木", big: true }, prompt: "E · 扛起撑木" },
        { type: "use", zone: TV.entW, needs: "prop", hold: 2.2, prompt: "按住 E · 顶上撑木",
          note: "木头咬住了。他松开手，顶木没有再响。" },
      ],
    },
    {
      kind: "hold", id: "c4_listen", zone: TV.entE, holdTime: 4, holdPrompt: "按住 E · 听",
      objective: "贴在东口下面，听听上面的动静", hint: "贴住不动，柱子会把听到的记在心里",
      note: "探杆一下一下地戳。脚步散开，又聚拢。",
    },
    {
      kind: "cinematic", id: "c4_smokeStart",
      lines: [
        { stage: "头顶传来闷响。泥土簌簌往下掉。", d: 3.2, cam: { kind: "shot", x: 148, y: UNDER_Y + 1.4, dist: 8 },
          on: (state) => { SpawnSurfaceSearch(state, 148); } },
        { stage: "有人用本地口音在上面喊：地道口就在磨盘这一片，扒！", d: 3.8, cam: { kind: "shot", x: 148, y: 1.0, dist: 10 } },
        { who: "民兵", say: "鬼子发现东口了！", d: 2.6, cam: { kind: "shot", x: 146, y: UNDER_Y + 1.4, dist: 8 } },
        // 剖面招牌构图：地表在翻找，地下在屏息，同框
        { stage: "一股呛人的烟，顺着东口灌了进来。", d: 3.4, cam: { kind: "shot", x: 142, y: -1.2, dist: 12 } },
      ],
      onDone: (state) => { StartSmoke(state); },
    },
    {
      // 大纲原文：「村民立刻熄灭油灯」——地道里最要紧的一件事，也是标题本身
      kind: "douseLamps", id: "c4_douse",
      smokeFloor: 133,   // 熄灯期间烟被顶木和弯道拖着，最多压到东数第二盏灯外
      lamps: [148, 132, 116, 96, 74],
      objective: "把地道里的灯一盏盏吹灭",
      hint: "一盏一盏吹灭。留最后一盏在自己手里",
      note: "最后一盏灯攥在柱子手里。地道一下子只剩这一点光。",
    },
    {
      // 第一次限时物品链：烟一直在推进。历史正解——冀中地道用湿被褥堵烟。
      // 干被子堵不住，这一步「浸湿」就是链上多出来的那个心眼
      kind: "chain", id: "c4_quilt",
      smokeFloor: 127.5,   // 卡口窄，烟在这儿灌得慢——玩家要堵的位置不能先被吞掉
      objective: "烟还在往里灌——把它堵在东段卡口外", hint: "藏人洞里备着棉被和水瓮。干被子堵不住烟",
      steps: [
        { type: "pickup", x: 110, level: "under", item: { id: "quilt", label: "棉被", big: true }, prompt: "E · 抱起棉被" },
        { type: "use", zone: { x: 116, w: 3, level: "under" }, needs: "quilt", hold: 1.2, prompt: "按住 E · 浸湿棉被",
          transform: { id: "wetQuilt", label: "湿棉被", big: true },
          note: "棉被吃透了水，沉得坠手。" },
        { type: "use", zone: TV.plugSpot, needs: "wetQuilt", hold: 1.6, prompt: "按住 E · 堵住卡口",
          note: "烟撞在湿棉被上，打着旋儿退了回去。呛人的味道淡下来了。",
          effect: (state) => { state.flags.quiltPlugged = true; if (state.smoke) state.smoke.speed = 0.05; } },
      ],
    },
    {
      kind: "smokeEscape", id: "c4_smoke", dest: TV.entW, lossScript: true,
      objective: "赶在烟前头，把人从西口转移出去",
      hint: "烟往西灌，先带东边的人。招呼一群人跟上，到西口他们会自己爬出去",
      resetHint: "烟呛倒了人。民兵把大家拖回洞室，重新来。",
      onEnter: (state) => {
        // 鬼子加了风箱：被子挡得住一时，挡不住一夜
        if (state.smoke) state.smoke.speed = 0.42;
        state.toast = { text: "上面拉来了风箱。烟从被子边上一丝丝挤进来——得走了。", t: 4.5 };
      },
    },
    {
      kind: "cinematic", id: "c4_floodStart",
      lines: [
        { stage: "第二天，鬼子又拉来了水泵。", d: 3.2, cam: { kind: "shot", x: 144, y: 0.6, dist: 11 },
          on: (state) => { SpawnSurfaceSearch(state, 146); } },
        { stage: "浑浊的泥水顺着东口灌下来，先淹的是最低的那一段。", d: 4.2, cam: { kind: "wide", x: 120, y: -1.2, hw: 20, pan: -8 },
          on: (state) => { StartFlood(state); } },
      ],
    },
    {
      kind: "floodRescue", id: "c4_flood", dest: TV.entW,
      objective: "水在涨——把还困在里面的人捞出西口",
      hint: "水从东边漫过来，低处先没。招呼人跟上",
      resetHint: "水太深了，人被冲散。民兵把大家托回高处，再来一次。",
    },
    {
      kind: "cinematic", id: "c4_loss",
      lines: [
        { stage: "西口外，乡亲们趴在田里咳嗽。人数了两遍。", d: 3.8, cam: { kind: "shot", x: 30, y: 0.8, dist: 12 } },
        { stage: "顺子没出来。拴柱大爷也没有。", d: 4.2, cam: { kind: "shot", x: 34, y: 0.6, dist: 8 } },
        { stage: "柱子站在出口，看着被抬出来的乡亲，一句话也说不出。", d: 4.2, cam: { kind: "shot", x: 34, y: 0.6, dist: 9 } },
        { who: "高传宝", say: "准备下一次行动。", d: 3.0, cam: { kind: "ots", subject: "gao", other: "player", dist: 3.4 } },
        { stage: "柱子背起工具，跟着队伍再次下了地道。", d: 3.6, cam: { kind: "wide", x: 90, y: -1.2 } },
      ],
    },
  ],

  c5: [
    {
      kind: "cinematic", id: "c5_open",
      lines: [
        { stage: "东口封死了。第二天起，全村轮班下洞。", d: 3.6, cam: { kind: "wide", x: 90, y: -1.2 } },
        { stage: "高传宝在门板上画了三个记号：翻口，新暗口，预警铃。", d: 4.0, cam: { kind: "shot", x: 40, y: UNDER_Y + 1.4, dist: 8 } },
        { stage: "柱子的墨斗和刨子，成了地道里的家伙什。", d: 3.6, cam: { kind: "shot", x: 40, y: UNDER_Y + 1.4, dist: 6.5 } },
        // 双层潜行的题面：改造缺的东西全在地表，地表有人。
        // 剖面视角的独门好处在这一章兑现——从地下看地上，一清二楚
        { stage: "白天，两个伪军就在村里翻翻捡捡地转。头顶的脚步，地道里听得一清二楚。", d: 4.4, cam: { kind: "wide", x: 90, y: -1.2, pan: 5 },
          on: (state) => { SpawnC5Snoops(state); } },
        { who: "高传宝", say: "缺什么，上去拿。什么时候上去，你们自己看。", d: 3.8, cam: { kind: "ots", subject: "gao", other: "player", dist: 3.6 } },
      ],
    },
    {
      // 翻口是真实冀中地道的三防正解：把这一段挖成 U 形的弯，弯里存住水，
      // 就是一道水封，烟和水都过不去。人猫着腰从水里钻过去。
      kind: "chain", id: "c5_trap",
      objective: "改造一：挖翻口，灌上水", hint: "挖成下沉的弯，弯里存住水。水在地表的井里",
      resetHint: "上面的伪军看见了人影。柱子缩回洞里，等他转过身去。",
      steps: [
        // 挖翻口的位置，就是大爷和顺子没出来的位置。先把烟袋拾起来，再动土——
        // 两章之间的账，用一个弯腰接上，不用字幕
        { type: "use", zone: TV.trapSpot, prompt: "E · 拾起烟袋",
          note: "拴柱大爷的烟袋躺在土里，锅底烧穿了一个洞。柱子把它揣进怀里，抄起了锹。" },
        { type: "use", zone: TV.trapSpot, hold: 3, prompt: "按住 E · 挖翻口",
          note: "弯挖出来了。可干弯挡不住烟——得灌上水。" },
        { type: "pickup", x: 30, level: "under", item: { id: "bucket2", label: "空桶" }, prompt: "E · 拎起空桶" },
        { type: "winch", zone: TV.wellTop, needs: "bucket2", needsLabel: "空桶",
          transform: { id: "fullBucket2", label: "满桶水", big: true },
          note: "桶沉了。上面还有人在转——挑好下去的时候。" },
        { type: "use", zone: TV.trapSpot, needs: "fullBucket2", hold: 1, prompt: "按住 E · 灌水",
          note: "水面在弯底晃了晃，定住了。翻口成了。",
          effect: (state) => { state.flags.trapBuilt = true; } },
      ],
    },
    {
      // 门板＋狗：C2 的回call。这条道要真的「暗」，先得让狗闭嘴
      kind: "chain", id: "c5_hidden",
      objective: "改造二：新暗口", hint: "新口开在西头第三家的猪圈底下。口上得盖块门板",
      resetHint: "差点撞上翻查的伪军。退回地道，重新等空当。",
      steps: [
        { type: "use", zone: TV.hiddenSpot, hold: 3, prompt: "按住 E · 掏暗口",
          note: "口子掏通了，就差个盖。挖出来的土，天不亮就得摊进麦地。" },
        { type: "pickup", x: 62, level: "under", item: { id: "bun2", label: "窝头" }, prompt: "E · 拿个窝头" },
        { type: "use", zone: TV.dogPen, needs: "bun2", prompt: "E · 丢给狗",
          note: "猪圈的狗埋头去啃。它不叫，这条道才算真的暗。",
          effect: (state) => { state.flags.dogFed2 = true; } },
        { type: "pickup", x: 26, item: { id: "plank", label: "门板", big: true }, prompt: "E · 卸下门板" },
        { type: "use", zone: TV.hiddenSpot, needs: "plank", hold: 1.2, prompt: "按住 E · 盖上门板",
          note: "口子盖严了。上头是猪食槽，谁也不会去翻。",
          effect: (state) => { state.flags.hiddenBuilt = true; } },
      ],
    },
    {
      kind: "chain", id: "c5_bell",
      objective: "改造三：预警铃", hint: "铃铛挂在磨盘边的骡套上，麻绳在藏人洞乙",
      resetHint: "东头的伪军回过头来。柱子缩回了洞里。",
      steps: [
        { type: "pickup", x: 56, level: "under", item: { id: "rope2", label: "麻绳" }, prompt: "E · 取下麻绳" },
        { type: "use", zone: TV.bellSpot, needs: "rope2", hold: 1, prompt: "按住 E · 拴上梁",
          note: "绳头从东口的顶木上垂下来，就差铃了。" },
        { type: "pickup", x: 148, item: { id: "bell", label: "铃铛" }, prompt: "E · 摘下铃铛" },
        { type: "use", zone: TV.bellSpot, needs: "bell", hold: 1, prompt: "按住 E · 拴好铃",
          note: "指头一拨，铃舌轻轻一响。东口一动，全村先知道。",
          effect: (state) => { state.flags.bellBuilt = true; } },
      ],
    },
    {
      kind: "cinematic", id: "c5_alarm",
      lines: [
        { stage: "没过几天，鬼子又来了。还是老一套：堵口，灌烟。", d: 3.8, cam: { kind: "shot", x: 144, y: -0.6, dist: 13 },
          on: (state) => { SpawnSurfaceSearch(state, 146); } },
      ],
      onDone: (state) => { StartDrillSmoke(state); },
    },
    {
      kind: "smokeEscape", id: "c5_drill", dest: TV.behindTrap,
      objective: "铃响了——赶在烟到翻口之前，把人带到弯后面",
      hint: "把人带到翻口后面去。别走西口，鬼子早就盯上它了",
      resetHint: "烟追上了人。再来——这一回，地道听你们的。",
    },
    {
      kind: "cinematic", id: "c5_test",
      lines: [
        { stage: "烟堵在弯里，一夜没退。地面上，什么也看不出来。", d: 4.0, cam: { kind: "shot", x: 112, y: 0.4, dist: 11 } },
        { stage: "鬼子在村里翻到天黑，一个人也没找到。", d: 3.8, cam: { kind: "wide", x: 90 } },
        { stage: "撤下来的时候，一个年轻民兵被塌下的土石压住了腿。", d: 4.2, cam: { kind: "shot", x: 70, y: UNDER_Y + 1.4, dist: 7 },
          on: (state) => {
            // 这场戏原来一个人都没有——柱子和民兵全靠字幕存在。说到谁，谁就得在画面里
            if (!FindActor(state, "pinned")) {
              state.actors.push(MakeActor("pinned", "militia", 70, {
                level: "under", heading: -1, label: "年轻民兵",
              }));
            }
            state.player.level = "under";
            state.player.x = 72.4;
            state.player.heading = -1;
          } },
        { stage: "鬼子的探杆就在头顶上戳。谁也不敢出声。", d: 3.8, cam: { kind: "shot", x: 70, y: -1.0, dist: 9 } },
      ],
    },
    {
      // 大纲写的是"柱子第一次看见，这条通往妹妹的路，也有人在用命守着"。
      // 那句话不能由旁白说——得让玩家自己去刨那堆土，刨到时间用完为止。
      // 清不完不是手慢：探杆一次比一次密，你每次都得停手。
      kind: "doomedHold", id: "c5_pinned", duration: 11, cap: 0.8,
      probe: { from: 5.2, to: 2.6 },
      failToast: "土太深了。他的腿还在下面。",
      onStart: (state) => {
        state.player.level = "under";
        state.player.x = 72.2;
        state.player.heading = -1;
        const pinned = FindActor(state, "pinned");
        if (pinned) { pinned.x = 70.4; pinned.heading = 1; }
      },
      objective: "把压住他腿的土清开",
      hint: "一下一下清土。探杆到头顶上的时候必须停手",
      prompt: "按住 E · 清土",
      onFail: (state) => {
        const pinned = FindActor(state, "pinned");
        if (pinned) pinned.heading = 1;
      },
    },
    {
      kind: "cinematic", id: "c5_gun",
      lines: [
        { stage: "那只手从土里伸出来，把柱子推开了。", d: 3.6, cam: { kind: "insert", x: 70.6, y: UNDER_Y + 0.9, dist: 2.4 } },
        { stage: "他把手里的枪递出去，朝洞外摆了摆手。", d: 4.2, cam: { kind: "shot", x: 70, y: UNDER_Y + 1.3, dist: 5.5 } },
        { who: "年轻民兵", say: "带乡亲们走。", d: 3.0, cam: { kind: "ots", subject: "pinned", other: "player", dist: 3.4 } },
        // 柱子的反应镜头：这场戏此前完全没有他，看完像是别人的事
        { stage: "", d: 2.6, cam: { kind: "ots", subject: "player", other: "pinned", dist: 3.2 } },
        { d: 2.4, cam: { kind: "dark" } },
      ],
    },
  ],

  c6: [
    {
      kind: "cinematic", id: "c6_open",
      lines: [
        { stage: "押送定在后天。据点里外都加了岗。", d: 3.4, cam: { kind: "wide", x: 170 } },
        { stage: "高传宝的法子是两头一起动：地面上打出动静把人引开，地下从地道把乡亲接走。", d: 4.8, cam: { kind: "wide", x: 90, pan: -6 } },
        { stage: "高传宝把柱子叫住，让他先去看清楚。", d: 3.2, cam: { kind: "ots", subject: "gao", other: "player", dist: 3.4 } },
      ],
      onDone: (state) => { SpawnFortPatrols(state, true); },
    },
    {
      kind: "observe", id: "c6_scout", spots: [F.obsWest, F.obsEast], watchTime: 4,
      objective: "记下加岗后的巡逻路数（两处观察点）",
      hint: "换岗的空当很短，看准了再记",
      resetHint: "差一点被发现。柱子把心跳按下去，重新贴回土里。",
      notes: [
        "南门加了双岗，但换岗还是背对庄稼地。",
        "牢房外多了一个游动哨。门里那辆骡车还拴在原处，车辕上一直空着。",
      ],
      watchCine: [
        [{ stage: "南门加了双岗。换岗的时候，背还是朝着庄稼地。", d: 3.8, cam: { kind: "insert", x: 172, y: 2.2, dist: 5.5 } }],
        [{ stage: "牢房外多了一个游动哨，绕到北墙要一袋烟的工夫。", d: 3.8, cam: { kind: "insert", x: 192, y: 1.6, dist: 6 } },
         // 押送的日子一推再推，车却始终没套——第六章的推理就架在这两条上
         { stage: "那辆骡车还拴在原处。车辕上一直空着。", d: 3.8, cam: { kind: "insert", x: 190, y: 1.0, dist: 3.2 } }],
      ],
    },
    {
      // 原来这里是个走过去就过的 goto。可"这是个套"这个结论，此前是旁白直接
      // 说给玩家听的——玩家自己一次都没推出来过。材料其实早就在手里：第三章
      // 观察和问乡亲收集的 note 都存在 flags.notesSeen 里，只是弹了个 toast 就没了。
      // 现在把它们一条条钉上门板，让两条对不上的线自己现形。
      // 漏看观察点的玩家凑不齐这两条，也就推不出来——侦查这才有代价。
      kind: "mapBoard", id: "c6_report", zone: F.campTable,
      objective: "回歇脚点，把看到的钉在门板上",
      hint: "柱子用木匠画线的手，把据点画在了门板上。一条条钉上去",
      // 这两条互相矛盾：日子一天天往后推，车却从来没套过
      contradiction: ["骡车", "押人"],
      deduction: "要往县里押人的话传了一遍又一遍，可拴在门里的那辆骡车，一直没套。",
    },
    {
      // 推出来与没推出来，是两场不同的戏。玩家漏了观察点就凑不齐那两条，
      // 只能听高传宝把答案说出来——那一刻的失落，正是"侦查有代价"该有的样子。
      kind: "cinematic", id: "c6_brief", dynamicLines: (state) => (
        state.flags.deduced
          ? [
            { who: "高传宝", say: "你说说看。", d: 2.6, cam: { kind: "ots", subject: "gao", other: "player", dist: 3.4 } },
            { stage: "柱子指了指门板上钉在一起的那两条。", d: 3.4, cam: { kind: "ots", subject: "player", other: "gao", dist: 3.2 } },
            { stage: "屋里安静了一会儿。", d: 2.8, cam: { kind: "shot", x: 8, y: 1.2, dist: 6.5 } },
            { who: "高传宝", say: "套是套。人，也是真的人。", d: 3.4, cam: { kind: "ots", subject: "gao", other: "player", dist: 3.4 } },
          ]
          : [
            { who: "高传宝", say: "你说说看。", d: 2.6, cam: { kind: "ots", subject: "gao", other: "player", dist: 3.4 } },
            { stage: "柱子说不上来。", d: 2.6, cam: { kind: "ots", subject: "player", other: "gao", dist: 3.2 } },
            { stage: "高传宝在门板上把日子和那辆骡车圈到了一起。", d: 4.0, cam: { kind: "insert", x: 8, y: 1.3, dist: 2.6 } },
            { who: "高传宝", say: "他们要的不是这十几个乡亲。是来救乡亲的人。", d: 4.2, cam: { kind: "ots", subject: "gao", other: "player", dist: 3.4 } },
            { who: "高传宝", say: "套是套。人，也是真的人。", d: 3.4, cam: { kind: "ots", subject: "gao", other: "player", dist: 3.4 } },
          ]
      ),
    },
    {
      // 历史梗：一挂鞭炮在铁桶里炸，一里外听着就是机枪。
      // 单格物品栏的教学在这儿反着用一次——两样东西，得跑两趟
      kind: "chain", id: "c6_prep",
      objective: "给佯动组备家伙：铁桶里的鞭炮", hint: "鞭炮和铁桶都在歇脚点，村北土坎上会合",
      steps: [
        { type: "pickup", x: 16, item: { id: "firecracker", label: "一挂鞭炮" }, prompt: "E · 拿上鞭炮" },
        { type: "use", zone: F.northBank, needs: "firecracker", prompt: "E · 搁下鞭炮" },
        { type: "pickup", x: 26, item: { id: "tin", label: "铁皮桶", big: true }, prompt: "E · 扛起铁桶" },
        { type: "use", zone: F.northBank, needs: "tin", prompt: "E · 架好桶" },
        { type: "use", zone: F.northBank, hold: 2, prompt: "按住 E · 装引信",
          note: "鞭炮盘进桶底，引信探出来。夜里一点，就是一挺『机枪』。" },
      ],
    },
    {
      // 大纲写的是"地面制造声势 + 地下进人"同时发生，不是二选一。
      // 所以选的不是打法，是柱子站在哪一边。
      kind: "choice", id: "c6_plan",
      prompt: "两路都得有人。高传宝看着柱子：你跟哪一路？",
      options: [
        { key: "ground", label: "跟地面佯动组", detail: "在村北打枪、点火、把巡逻往外扯——动静大，撤下来的路全在明处。" },
        { key: "tunnel", label: "跟地下接应组", detail: "在地道里掏最后一段、接人、往回带——慢，土层不稳，但乡亲们能从地下走。" },
      ],
      objective: "定下自己跟哪一路",
    },
    {
      kind: "cinematic", id: "c6_eve",
      lines: [
        { stage: "行动前夜。油灯把门板图照得发黄。", d: 3.6, cam: { kind: "shot", x: 7, y: 1.2, dist: 6.5 } },
        { stage: "柱子站在图前，指着据点的方向。", d: 3.2, cam: { kind: "shot", x: 8, y: 1.2, dist: 5.5 } },
        { who: "柱子", say: "我去。", d: 2.4, cam: { kind: "ots", subject: "player", other: "gao", dist: 3.2 } },
        { stage: "高传宝看了他一眼。没有劝。", d: 3.0, cam: { kind: "shot", x: 6.5, y: 1.2, dist: 4.8 } },
        { who: "高传宝", say: "跟紧队伍。", d: 2.6, cam: { kind: "ots", subject: "gao", other: "player", dist: 3.4 } },
      ],
    },
  ],

  c7: [
    {
      kind: "cinematic", id: "c7_open", dynamicLines: (state) => (
        state.flags.route === "ground"
          ? [
            { stage: "二更天，村北先响了枪。柱子在那头。", d: 3.4, cam: { kind: "dark" } },
            { stage: "据点岗楼上的灯全甩向北面。巡逻队跑步出了南门。", d: 3.8, cam: { kind: "wide", x: 150, y: 1.5 } },
            { stage: "枪声把人引出去多远，地底下就多出多少工夫。", d: 3.8, cam: { kind: "wide", x: 150, y: 1.5, pan: -4 } },
            { stage: "打完那一阵，他才从北边退回来下的地道。接应组已经走在前头了。", d: 4.6, cam: { kind: "wide", x: 60, y: -1.4, hw: 18, pan: -5 },
              on: (state) => { SpawnRescueSquad(state); } },
          ]
          : [
            { stage: "区上武工队来了两个班。佯动组已经摸到村北去了——这边不动，人从地下走。", d: 4.4, cam: { kind: "dark" } },
            { stage: "二更天，地道里一盏灯也没点。", d: 3.2, cam: { kind: "dark" } },
            { stage: "队伍在黑暗里贴着墙根移动，谁也不说话。", d: 3.6, cam: { kind: "wide", x: 40, y: -1.4, hw: 18 },
              on: (state) => { SpawnRescueSquad(state); } },
            { stage: "这条道原本只到墙外的地里。最后那十几步，是这三天连夜掏出来的。", d: 4.6, cam: { kind: "wide", x: 90, y: -1.4, hw: 18, pan: 6 } },
            { stage: "柱子数着步子。掏到牢房地沿，还有两处虚土要清。", d: 4.0, cam: { kind: "wide", x: 120, y: -1.4, hw: 16 } },
          ]
      ),
      onDone: (state) => { SetupFortTunnel(state); },
    },
    {
      kind: "digSeq", id: "c7_dig", spots: [TF.collapse1, TF.collapse2], holdTime: 3.5,
      shore: { collapse1: { beamX: 44 }, collapse2: { beamX: 92 } },
      objective: "支起顶木，掏开虚土，把最后十几步挖通", hint: "顶木在旁洞里。头顶有动静时停一停",
      quakeInterval: 9,
    },
    {
      kind: "goto", id: "c7_reach", zone: TF.cellHatch, objective: "摸到牢房地沿",
    },
    {
      // 木匠的手艺最后一次替爹用上：地沿的木板是从上面钉死的
      kind: "hold", id: "c7_pry", zone: TF.cellHatch, holdTime: 3, holdPrompt: "按住 E · 撬",
      objective: "地沿的木板从上面钉死了", hint: "爹的凿子，他一直带在身上",
      note: "凿刃咬进钉缝，一下，一下。木板松了。",
    },
    {
      kind: "cinematic", id: "c7_sister",
      lines: [
        { stage: "地沿的木板被顶开一条缝。霉味和哭声一起漏下来。", d: 4.0, cam: { kind: "shot", x: 162, y: UNDER_Y + 1.8, dist: 7 } },
        { stage: "民兵一个个往下接人。柱子在人堆里看见了妹妹。", d: 4.0, cam: { kind: "shot", x: 160, y: UNDER_Y + 1.4, dist: 8 },
          on: (state) => {
            for (let i = 0; i < 3; i += 1) {
              state.actors.push(MakeActor(`freed${i}`, "villager", 160 - i * 1.2, {
                level: "under", scripted: true, cineTarget: { x: 14 }, cineSpeed: 1.7 + i * 0.25, cineVanish: true,
              }));
            }
          } },
        { stage: "妹妹瘦得脱了相。她抓住柱子的袖子。", d: 3.6, cam: { kind: "insert", x: 161, y: UNDER_Y + 1.0, dist: 2.2 },
          on: (state) => { AttachSister(state); } },
        // 正反打：问 → 不答 → 明白
        { who: "妹妹", say: "哥，娘呢？", d: 3.0, cam: { kind: "ots", subject: "sister", other: "player", dist: 3.2 } },
        { stage: "柱子没有说话。", d: 3.0, cam: { kind: "ots", subject: "player", other: "sister", dist: 3.2 } },
        { stage: "妹妹看着哥哥的眼睛，慢慢松开了手，又慢慢把额头抵在他肩上。", d: 5.0, cam: { kind: "ots", subject: "sister", other: "player", dist: 3.0 },
          on: (state) => {
            const sister = FindActor(state, "sister");
            if (sister) { sister.pose = "leanIn"; sister.x = state.player.x + 0.42; sister.heading = -1; }
            state.player.pose = "shelter";
          } },
        { stage: "她明白了。", d: 2.8, cam: { kind: "close", on: "sister", dist: 3.4 } },
      ],
      onDone: (state) => { AttachSister(state); },
    },
    {
      kind: "escort", id: "c7_out", follower: "sister", dest: TF.fieldEnt,
      objective: "带妹妹沿地道撤到地里入口", hint: "路已经打通了，往西走",
    },
    {
      kind: "cinematic", id: "c7_turn",
      lines: [
        { stage: "入口上面就是庄稼地，就是活路。", d: 3.2, cam: { kind: "shot", x: 14, y: -0.6, dist: 8 },
          on: (state) => {
            // 交灯这场戏的人得在画面里：高传宝、报信民兵、接妹妹的大娘
            state.actors.push(
              MakeActor("gao", "militia", 17, { level: "under", label: "高传宝", heading: -1 }),
              MakeActor("aunt2", "villager", 11, { level: "under", label: "大娘", heading: 1 }),
              MakeActor("msg", "militia", 30, {
                level: "under", cineTarget: { x: 20 }, cineSpeed: 3.4, heading: -1,
              }),
            );
          } },
        { stage: "一个民兵跌跌撞撞从地道里追出来。", d: 3.2, cam: { kind: "shot", x: 22, y: UNDER_Y + 1.4, dist: 8 } },
        { who: "民兵", say: "还有人没出来！东边旁洞里，还有几个乡亲！", d: 4.0, cam: { kind: "ots", subject: "msg", other: "player", dist: 3.6 } },
        { stage: "头顶上，搜查的脚步声越来越密。", d: 3.4, cam: { kind: "shot", x: 16, y: -0.4, dist: 9 } },
      ],
    },
    {
      // 全篇的顶点，原来是十行过场：松手、接灯、转身，都由脚本替他做了。
      // 那两句"妹妹就在眼前……可旁洞里那几个人也在等"更是把两难替玩家想完了。
      // 现在两句删掉，操作交还回去——出口就在头顶、完全通着、没有任何东西拦你，
      // 妹妹还牵在手里。要回去，得他自己先松开手。
      kind: "actSeq", id: "c7_turn2",
      objective: "该走了",
      hint: "妹妹还牵着你的手。上面就是庄稼地",
      steps: [
        {
          x: 12.6, level: "under", prompt: "E · 松开手",
          toast: "柱子把妹妹的手放进大娘手里。",
          on: (state) => {
            const sister = FindActor(state, "sister");
            if (sister) { sister.following = false; sister.cineTarget = { x: 11.4 }; sister.cineSpeed = 1.2; }
            const gao = FindActor(state, "gao");
            if (gao) { gao.cineTarget = { x: 15.4 }; gao.cineSpeed = 1.0; }
          },
        },
        {
          x: 15.4, level: "under", prompt: "E · 接过灯",
          on: (state) => { state.player.lamp = true; },
        },
        { x: 22, level: "under", walk: true },
      ],
      onDone: (state) => { StartRescueLoop(state); },
    },
    {
      kind: "rescueLoop", id: "c7_rescue",
      objective: "把旁洞里的乡亲全部带出去（3 处）",
      hint: "灯照多远，路就有多远。招呼乡亲跟上，送到地里入口再回去",
      resetHint: "土又塌了一截。民兵把人拉了回来，重新探路。",
    },
    {
      kind: "cinematic", id: "c7_done",
      lines: [
        { stage: "最后一个乡亲被推出洞口的时候，东边天已经泛白。", d: 4.2, cam: { kind: "shot", x: 14, y: 0.5, dist: 10 },
          on: (state) => {
            // 上到地表收尾：这几个镜头拍的是田埂上的天亮
            state.player.level = "surface";
            state.player.x = 13;
            state.player.cineWalk = { x: 16, speed: 0.9 };
            for (let i = 0; i < 4; i += 1) {
              state.actors.push(MakeActor(`dawn${i}`, "villager", 8 + i * 2.4, { heading: 1 }));
            }
            state.player.lamp = true;
          } },
        { stage: "人数了三遍。一个不少。", d: 3.4, cam: { kind: "shot", x: 12, y: 1.0, dist: 8 } },
        { stage: "柱子坐在田埂上，灯芯已经烧到了头。", d: 3.8, cam: { kind: "insert", x: 16.4, y: 1.0, dist: 2.2 } },
        { stage: "他把灯吹灭了。", d: 2.6, cam: { kind: "close", on: "player", dist: 3.4 },
          on: (state) => { state.player.lamp = false; } },
        { stage: "天亮了。", d: 4.6, cam: { kind: "wide", x: 40, y: 2.6, pan: 8 },
          on: (state) => { state.lightOverride = "dawn"; } },
      ],
    },
  ],

  c8: [
    {
      kind: "cinematic", id: "c8_open",
      lines: [
        { stage: "一个月后。", d: 2.6, cam: { kind: "dark" } },
        { stage: "沙河庄的地道重新修整。被发现的口子封死了，新口挖在另一片庄稼地旁。", d: 4.6, cam: { kind: "wide", x: 90 } },
        { stage: "乡亲们把废弃的旧口填平。那块地方，正是当年柱子第一次找到妹妹的地方。", d: 4.8, cam: { kind: "wide", x: 130, pan: 5 } },
        { stage: "柱子带着妹妹，回了一趟梁家村。", d: 3.4, cam: { kind: "wide", x: 100, pan: -8 } },
      ],
      onDone: (state) => { SetupRuinedVillage(state); },
    },
    {
      kind: "escort", id: "c8_walk", follower: "sister", dest: V.homeYard, slow: true,
      objective: "和妹妹一起，走回家看看",
    },
    {
      kind: "cinematic", id: "c8_wall",
      lines: [
        { stage: "院子烧毁了。只剩一堵残墙。", d: 3.6, cam: { kind: "shot", x: 37, y: 1.6, dist: 11 } },
        { stage: "门框还在。", d: 3.0, cam: { kind: "shot", x: 34, y: 1.5, dist: 6.5 } },
        { stage: "妹妹走过去，伸手摸了一下爹刻的那道线。", d: 4.0, cam: { kind: "shot", x: 34, y: 1.5, dist: 6.5 },
          on: (state) => {
            const sister = FindActor(state, "sister");
            if (sister) { sister.following = false; sister.cineTarget = { x: 33.2 }; sister.cineSpeed = 1.1; }
          } },
        { stage: "她的手停了一会儿。", d: 3.2, cam: { kind: "shot", x: 34, y: 1.5, dist: 6.5 } },
      ],
    },
    {
      // 第一章他被爹按在门框上量；这一回轮到他量妹妹。
      // 两道线差多少，画面自己会说——不要旁白替观众念出来。
      kind: "actSeq", id: "c8_measure",
      objective: "门框还在", hint: "妹妹站在门框边上",
      steps: [
        { x: V.doorframe.x, r: 1.6, prompt: "E · 让她靠上",
          toast: "妹妹后背贴上门框，站直了。",
          on: (state) => {
            const sister = FindActor(state, "sister");
            if (sister) { sister.x = V.doorframe.x - 0.5; sister.heading = 1; sister.cineTarget = null; }
            state.player.heading = -1;
          } },
      ],
    },
    {
      // 第一章是爹的手，这一回是他自己的手——同一个动作，同一个景别。
      // 两道线之间隔着的东西，画面自己会说。
      kind: "scribe", id: "c8_carve", zone: V.doorframe, speed: 0.42, markY: 1.08, selfMark: true,
      cam: { kind: "shot", x: 34.9, y: 1.30, dist: 2.9 },
      objective: "在旧刻痕旁，刻下一道新的线", hint: "在旧刻痕旁边，把石笔拖过去",
      note: "刻完，柱子用拇指抹平了木屑。",
      onDone: (state) => { state.flags.carved = true; },
    },
    {
      kind: "actSeq", id: "c8_stool",
      objective: "爹留下的旧木凳", hint: "凳腿松了",
      steps: [
        { x: 32, r: 1.8, prompt: "E · 敲紧凳腿",
          toast: "手艺是爹的，手是他自己的。" },
      ],
    },
    {
      kind: "cinematic", id: "c8_call",
      lines: [
        { stage: "院外传来民兵喊他的声音。", d: 3.0, cam: { kind: "shot", x: 40, y: 1.6, dist: 10 } },
        { who: "民兵", say: "柱子，地道那边还缺人。", d: 3.0, cam: { kind: "shot", x: 40, y: 1.6, dist: 10 } },
        { stage: "柱子放下工具，回头看了一眼妹妹。", d: 3.6, cam: { kind: "shot", x: 34, y: 1.4, dist: 7 } },
        { stage: "妹妹抱着爹留下的旧木凳，点了点头。", d: 3.8, cam: { kind: "shot", x: 32, y: 1.2, dist: 5 } },
      ],
    },
    {
      kind: "goto", id: "c8_leave", zone: V.courtGate, objective: "走到院门口去，民兵在村东头等",
    },
    {
      kind: "cinematic", id: "c8_end",
      lines: [
        { stage: "柱子走出院子。", d: 3.0, cam: { kind: "shot", x: 44, y: 1.6, dist: 9 },
          on: (state) => {
            // 柱子朝村东走远——镜头留在门框上
            state.player.cineWalk = { x: 70, speed: 1.6 };
          } },
        { stage: "门框上的两道刻痕，留在了身后。", d: 6.2, cam: { kind: "shot", x: 34, y: 1.4, dist: 6.5, pan: -0.5 } },
      ],
    },
  ],
};

// 序章过场短片的片单，顺序就是播放顺序——渲染层拿它做"下一段提前拉"。
// 从脚本里读而不是另抄一份：改了哪一行的 clip，这里自动跟着变。
export const PROLOGUE_CLIPS = SCRIPTS.c1
  .find((b) => b.id === "c1_prologue")
  .lines.map((l) => l.cam?.clip)
  .filter(Boolean);

// ---------------------------------------------------------------------------
// 角色与事件生成
// ---------------------------------------------------------------------------
function MakeActor(id, kind, x, extra = {}) {
  return { id, kind, x, level: "surface", heading: 1, visible: true, ...extra };
}

function SpawnRaidSoldiers(state) {
  state.actors = state.actors.filter((a) => !IsEnemy(a));
  state.actors.push(
    MakeActor("raid1", "soldier", 120, { patrol: [58, 120], speed: 1.5 }),
    MakeActor("raid2", "soldier", 88, { patrol: [50, 90], speed: 1.35 }),
  );
  state.stealthActive = true;
}

// 1943 年春的一次夜间"清剿"，来的是据点一个小队加上伪军：进村就分头堵路、
// 挨家踹门，前后能拉开大半个村子。原先只放三个人，"鬼子又来了"这句话在画面上
// 就落不到实处——一条村道上站着一个人，那不叫扫荡。
//
// 但真参与潜行判定的仍然只有 sweep1/2/3（十几个人一起看着，这段没法玩）。
// 其余标 decor：他们组成队形、举着灯、在院门口翻找，只负责让这一夜看着像那一夜。
function SpawnNightSweep(state) {
  state.actors = state.actors.filter((a) => !IsEnemy(a));
  state.actors.push(
    // 带路的翻译官挑着灯笼在前，两个兵在后
    MakeActor("sweep1", "puppet", 74, { patrol: [70, 108], speed: 1.5, lantern: true, lanternKind: "lantern" }),
    MakeActor("sweep2", "soldier", 100, { patrol: [92, 138], speed: 1.4, lantern: true }),
    MakeActor("sweep3", "soldier", 150, { patrol: [144, 158], speed: 1.15, lantern: true }),
  );
  // 进村的纵队：从村东口一路排下来，走走停停。间距故意不匀——
  // 队列走进村子会散，散开的样子比整齐的样子更像真的
  const column = [
    { x: 180, kind: "soldier", speed: 1.05, lantern: true },
    { x: 174, kind: "soldier", speed: 1.15 },
    { x: 169, kind: "puppet", speed: 1.3 },
    { x: 162, kind: "soldier", speed: 1.1 },
    { x: 156, kind: "soldier", speed: 1.35, lantern: true },
    { x: 147, kind: "puppet", speed: 0.9 },
    { x: 140, kind: "soldier", speed: 1.2 },
    { x: 132, kind: "soldier", speed: 1.4, lantern: true },
    { x: 124, kind: "soldier", speed: 1.05 },
    { x: 116, kind: "puppet", speed: 1.25 },
    { x: 106, kind: "soldier", speed: 1.15 },
    { x: 96, kind: "soldier", speed: 0.95, lantern: true },
  ];
  column.forEach((c, i) => {
    state.actors.push(MakeActor(`col${i}`, c.kind, c.x, {
      patrol: [c.x - 6.5, c.x + 6.5], speed: c.speed, heading: -1, decor: true,
      lantern: !!c.lantern, lanternKind: c.kind === "puppet" ? "lantern" : "hurricane",
    }));
  });
  state.stealthActive = true;
  const mother = FindActor(state, "mother");
  if (mother) { mother.x = 40; mother.visible = true; }
}

function MotherDecoyDone(state) {
  const mother = FindActor(state, "mother");
  if (mother) mother.visible = false;
  // 巡逻被引向村西：先走过去（cineTarget 落在新巡逻带内），到位后再交回 patrol，避免瞬移
  const s1 = FindActor(state, "sweep1");
  if (s1) { s1.patrol = [24, 62]; s1.cineTarget = { x: 60 }; s1.cineSpeed = 2.4; }
  const s2 = FindActor(state, "sweep2");
  if (s2) { s2.patrol = [56, 88]; s2.speed = 1.3; s2.cineTarget = { x: 86 }; s2.cineSpeed = 2.2; }
  const s3 = FindActor(state, "sweep3");
  if (s3) { s3.cineTarget = null; }
  // 娘踢翻水瓮那一声之后，整队都朝村西压过去：村东这一线松开，柱子才走得了。
  // 玩家往东走的一路上回头能看见——十几盏灯全挤在娘去的那个方向。
  state.actors = state.actors.filter((a) => !a.decor || a.x < 150);
  for (const a of state.actors) {
    if (!a.decor) continue;
    const nx = 56 + ((a.x * 7) % 24);
    a.x = nx;
    a.patrol = [nx - 5, nx + 5];
    a.heading = -1;
  }
}

function SpawnFortPatrols(state, reinforced) {
  state.actors = state.actors.filter((a) => !IsEnemy(a));
  state.actors.push(
    MakeActor("fortA", "soldier", 158, { patrol: [150, 174], speed: 1.4 }),
    MakeActor("gate1", "soldier", 170, { patrol: [168, 173], speed: 0.5 }),
  );
  if (reinforced) {
    state.actors.push(
      // 牢房外新添的游动哨：伪军（在围墙后侧走动，白盒里画在墙外一段）
      MakeActor("fortB", "puppet", 176, { patrol: [174, 186], speed: 1.1, lantern: true }),
      MakeActor("gate2", "soldier", 166, { patrol: [164, 170], speed: 0.55 }),
    );
  }
  state.stealthActive = true;
}

// 第五章白天的两个伪军：改造要的东西全在地表，他们就是「什么时候上去」的题面。
// 路线从剖面里一眼可见——读他们的脚程，就是读题。
function SpawnC5Snoops(state) {
  state.actors = state.actors.filter((a) => !IsEnemy(a));
  state.actors.push(
    MakeActor("snoopW", "puppet", 40, { patrol: [16, 62], speed: 0.95 }),
    MakeActor("snoopE", "puppet", 130, { patrol: [98, 158], speed: 1.05 }),
  );
  state.stealthActive = true;
}

// 地表搜查队：剖面视角里"头顶在翻找、脚下在屏息"的同框构图（纯演出，不参与潜行判定）
function SpawnSurfaceSearch(state, centerX) {
  state.actors.push(
    MakeActor("srch1", "puppet", centerX + 6, { patrol: [centerX - 6, centerX + 12], speed: 1.1, lantern: true }),
    MakeActor("srch2", "soldier", centerX - 4, { patrol: [centerX - 14, centerX + 4], speed: 1.25 }),
    MakeActor("srch3", "soldier", centerX + 16, { patrol: [centerX + 10, centerX + 24], speed: 1.0 }),
  );
}

function SpawnTunnelVillagers(state) {
  state.actors = state.actors.filter((a) => a.kind !== "villager");
  state.actors.push(
    MakeActor("elder1", "villager", 143, { level: "under", label: "拴柱大爷", group: "elders", slow: true }),
    MakeActor("elder2", "villager", 145, { level: "under", label: "六婶", group: "elders", slow: true }),
    MakeActor("aunt", "villager", 138, { level: "under", label: "大嫂", group: "family" }),
    MakeActor("kid", "villager", 139.5, { level: "under", label: "小石头", group: "family", slow: true }),
    MakeActor("shunzi", "villager", 116, { level: "under", label: "顺子", group: "none" }),
  );
}

function StartSmoke(state) {
  // 烟从东口（x=148）向西推进。压得慢：这一章要留出熄灯＋湿棉被两段链的工夫，
  // 真正的加速在 c4_smoke 的 onEnter（风箱到了）
  state.smoke = { frontX: 150, speed: 0.32, trapAt: null, trapHeld: false, active: true, sourceX: 148 };
  for (const a of state.actors) {
    if (a.kind !== "villager") continue;
    if (a.group === "elders") a.x = TV.chamberA.x + (a.id === "elder1" ? -1 : 1);
    if (a.group === "family") a.x = TV.chamberB.x + (a.id === "kid" ? 1.2 : 0);
    if (a.id === "shunzi") a.visible = false; // 顺子回身去背人——在失去脚本里出场
    a.following = false; a.evacuated = false; a.scripted = false;
  }
}

function StartDrillSmoke(state) {
  // 验收战：预警铃先响；烟推到翻口就过不来；西口被堵死，新暗口是活路
  state.actors = state.actors.filter((a) => a.kind !== "villager");
  // 三个人都在翻口以东——翻口挡得住烟，可他们还在烟这一侧。
  // 这一场的紧张就在这段路上：得赶在烟推到翻口之前，把人都带到弯的后面去。
  // （挖翻口那一下的回报也在这儿：过了弯就是安全的，不必一路跑到新暗口。）
  state.actors.push(
    MakeActor("d_elder", "villager", TV.trapSpot.x + 14, { level: "under", label: "六婶", slow: true }),
    MakeActor("d_aunt", "villager", TV.trapSpot.x + 8, { level: "under", label: "大嫂" }),
    MakeActor("d_kid", "villager", TV.trapSpot.x + 9.2, { level: "under", label: "小石头", slow: true }),
  );
  state.smoke = { frontX: 150, speed: 0.9, trapAt: SCENES.tunnelVillage.zones.trapSpot.x, trapHeld: false, active: true, sourceX: 148 };
  state.flags.hiddenBuilt = true;
  state.flags.entWBlocked = true;
  state.player.x = 148;
  state.player.level = "under";
  const gao = FindActor(state, "gao");
  if (gao) { gao.cineTarget = { x: 20 }; gao.cineSpeed = 2.4; }
  state.toast = { text: "东口的铃响成一串。人已经在往洞里下了。", t: 4 };
}

// 第七章的队伍：柱子不是一个人下的地道，画面里要看得见"跟紧队伍"
function SpawnRescueSquad(state) {
  if (FindActor(state, "squad0")) return;
  const base = state.player.x;
  // 跟地面佯动组的人是打完仗才退回来的，接应组早走在前头——手边就少两个人。
  // 这是那个选择在玩法上唯一的、也是够用的差别：地面把敌人引开了（塌方间隔更长、
  // 探杆更稀），代价是救人时没人搭手，一趟只能带一个。
  const n = state.flags.route === "ground" ? 2 : 4;
  for (let i = 0; i < n; i += 1) {
    state.actors.push(MakeActor(`squad${i}`, "militia", base + 4 + i * 3.2, {
      level: "under", heading: 1, squad: true,
    }));
  }
}

function SetupFortTunnel(state) {
  state.collapses = {
    collapse1: { cleared: false, progress: 0, shored: false },
    collapse2: { cleared: false, progress: 0, shored: false },
  };
  state.actors = state.actors.filter((a) => a.kind !== "villager" && !IsEnemy(a));
  state.player.x = 16;
  state.player.level = "under";
}

function AttachSister(state) {
  let sister = FindActor(state, "sister");
  if (!sister) {
    sister = MakeActor("sister", "sister", 0, { label: "妹妹" });
    state.actors.push(sister);
  }
  sister.visible = true;
  sister.level = state.player.level;
  sister.x = state.player.x + 1;
  sister.following = true;
}

function StartRescueLoop(state) {
  const sister = FindActor(state, "sister");
  if (sister) { sister.visible = false; sister.following = false; }
  state.player.lamp = true;
  state.actors.push(
    MakeActor("trapA1", "villager", TF.pocketA.x, { level: "under", label: "被困乡亲", pocket: "pocketA" }),
    MakeActor("trapA2", "villager", TF.pocketA.x + 1, { level: "under", label: "被困乡亲", pocket: "pocketA" }),
    MakeActor("trapB1", "villager", TF.pocketB.x, { level: "under", label: "受伤的老人", pocket: "pocketB", slow: true }),
    MakeActor("trapB2", "villager", TF.pocketB.x - 1, { level: "under", label: "搀扶的民兵", pocket: "pocketB" }),
    MakeActor("trapC1", "villager", TF.pocketC.x, { level: "under", label: "抱孩子的大嫂", pocket: "pocketC", slow: true }),
  );
  state.rescue = { delivered: new Set(), dialogueShown: new Set(), quakeT: 0 };
  if (state.flags.route === "ground") {
    state.toast = { text: "村北的枪声停了。敌人正在回防——头顶的动静密了起来。", t: 5 };
  }
}

function SetupRuinedVillage(state) {
  state.flags.ruined = true;
  state.player.x = 105;
  state.player.level = "surface";
  let sister = FindActor(state, "sister");
  if (!sister) { sister = MakeActor("sister", "sister", 107, { label: "妹妹" }); state.actors.push(sister); }
  sister.visible = true; sister.following = true; sister.level = "surface";
  sister.x = state.player.x + 1.5;
  state.actors = state.actors.filter((a) => !IsEnemy(a) && a.kind !== "villager");
}

// ---------------------------------------------------------------------------
// 状态机
// ---------------------------------------------------------------------------
export function CreateGame(chapterIndex = 0) {
  const state = {
    version: GAME_VERSION,
    phase: "chapterCard",
    chapterIndex,
    beatIndex: 0,
    time: 0,
    cardTimer: 0,
    player: { x: 0, level: "surface", heading: 1, crouch: false, carry: null, item: null, lamp: false, hidden: false, climbT: 0, vaultT: 0, vaultK: 0, lift: 0, cineWalk: null },
    actors: [],
    cart: null,
    thrown: null,
    noiseAt: null,
    searchlight: null,
    dogBark: null,
    cues: [],
    bubbles: [],
    bubbleFlash: null,
    throwAim: null,
    sparrowBurst: null,
    henFlee: null,
    mouseFlee: null,
    planing: null,
    planeCurl: null,
    dragTrack: null,
    spotFlash: null,
    irisFocus: null,
    pip: null,
    stealthActive: false,
    detection: { level: 0, spotter: null },
    smoke: null,
    collapses: null,
    rescue: null,
    beat: null,
    microCine: null,
    lamps: null,
    lightOverride: null,
    flood: null,
    floodDepth: 0,
    flags: {
      route: null, resets: 0, ruined: false, carved: false,
      hiddenBuilt: false, trapBuilt: false, entWBlocked: false, deduced: false, notesSeen: [],
      clothDown: false, dogFed: false, dogFed2: false, lanternOut: false, quiltPlugged: false, bellBuilt: false,
      barrowPlanks: 0, barrowHome: false, henFlew: false, wellRopeBroken: false, ropeTaken: false,
      bucketAt: null, raidStarted: false, thimbleFound: false,
    },
    caption: null,
    camHint: { kind: "follow" },
    fade: 0,
    toast: null,
    prompt: null,
    done: false,
  };
  StartChapter(state, chapterIndex);
  return state;
}

// 一次性戏剧姿势用完就得收：不清的话，被架走的爹会一路架着走完全场
function ClearPoses(state) {
  state.player.pose = null;
  state.player.track = null;
  for (const a of state.actors) { a.pose = null; a.track = null; }
}

export function StartChapter(state, index) {
  const ch = CHAPTERS[index];
  state.chapterIndex = index;
  state.beatIndex = 0;
  state.phase = "chapterCard";
  state.cardTimer = 0;
  state.actors = [];
  state.stealthActive = false;
  state.detection = { level: 0, spotter: null };
  state.smoke = null;
  state.collapses = null;
  state.rescue = null;
  state.microCine = null;
  state.lamps = null;
  state.lightOverride = null;
  state.flood = null;
  state.floodDepth = 0;
  state.caption = null;
  state.prompt = null;
  state.player.carry = null;
  state.player.item = null;
  state.player.lamp = false;
  state.player.crouch = false;
  state.player.climbT = 0;
  state.player.cineWalk = null;
  state.player.level = "surface";
  state.cart = null;
  state.thrown = null;
  state.noiseAt = null;
  state.searchlight = null;
  state.dogBark = null;
  if (index !== 7) state.flags.ruined = false;
  if (index < 4) { state.flags.hiddenBuilt = false; state.flags.entWBlocked = false; }
  state.player.vaultT = 0;
  state.player.vaultK = 0;
  state.player.lift = 0;
  state.player.vaultBig = false;
  state.vaultDust = null;
  state.vaultHint = "";
  state.cues = [];
  state.bubbles = [];
  state.bubbleFlash = null;
  state.throwAim = null;
  state.sparrowBurst = null;
  state.henFlee = null;
  state.mouseFlee = null;
  state.planing = null;
  state.planeCurl = null;
  state.dragTrack = null;
  state.spotFlash = null;
  state.irisFocus = null;
  state.pip = null;
  // 从章节菜单单独进某一章时，本章谜题的旗标要归零
  if (index === 0) {
    state.flags.clothDown = false;
    state.flags.barrowPlanks = 0;
    state.flags.barrowHome = false;
    state.flags.henFlew = false;
    state.flags.wellRopeBroken = false;
    state.flags.ropeTaken = false;
    state.flags.bucketAt = null;
    state.flags.raidStarted = false;
    state.flags.waterFilled = false;
    state.flags.planedOnce = false;
  }
  if (index === 1) { state.flags.dogFed = false; state.flags.lanternOut = false; }
  if (index <= 4) { state.flags.quiltPlugged = false; state.flags.trapBuilt = false; }
  if (index === 4) { state.flags.dogFed2 = false; state.flags.bellBuilt = false; }

  if (ch.id === "c1") {
    state.player.x = 38;
    state.actors.push(
      MakeActor("father", "father", 41, { label: "爹" }),
      MakeActor("mother", "family", 36, { label: "娘" }),
      MakeActor("sister", "sister", V.sisterTree.x + 1, { label: "妹妹" }),
    );
  } else if (ch.id === "c2") {
    state.player.x = 38;
    state.actors.push(
      MakeActor("mother", "family", 40, { label: "娘", visible: false }),
      MakeActor("sister", "sister", 36.5, { label: "妹妹", following: true }),
    );
  } else if (ch.id === "c3") {
    state.player.x = 10;
  } else if (ch.id === "c4") {
    state.player.x = 148;
    state.player.level = "under";
    state.actors.push(MakeActor("gao", "militia", 144, { level: "under", label: "高传宝" }));
  } else if (ch.id === "c5") {
    state.player.x = 40;
    state.player.level = "under";
    state.actors.push(MakeActor("gao", "militia", 44, { level: "under", label: "高传宝" }));
    state.flags.entWBlocked = false;
  } else if (ch.id === "c6") {
    state.player.x = 8;
    state.actors.push(MakeActor("gao", "militia", 6, { label: "高传宝" }));
  } else if (ch.id === "c7") {
    state.player.x = 16;
    state.player.level = "under";
  } else if (ch.id === "c8") {
    SetupRuinedVillage(state);
  }
  EnterBeat(state);
}

function CurrentScript(state) { return SCRIPTS[CHAPTERS[state.chapterIndex].id]; }
export function CurrentBeatDef(state) { return CurrentScript(state)[state.beatIndex] || null; }

function EnterBeat(state) {
  const def = CurrentBeatDef(state);
  if (!def) { EndChapter(state); return; }
  state.beat = {
    t: 0, lineIndex: 0, lineT: 0, lineFired: -1,
    itemStates: def.kind === "collect" ? def.items.map((p) => ({ x: p.x, carried: false, delivered: false })) : null,
    visited: new Set(),
    holdProgress: 0,
    spotIndex: 0,
    spotProgress: def.kind === "buildSpots" ? def.spots.map(() => 0) : null,
    spotDone: def.kind === "buildSpots" ? def.spots.map(() => false) : null,
    digIndex: 0,
    quakeT: 0, quakeActive: false, quakeWarn: false,
    graceT: 0, failN: 0,
    lossStage: 0, lossT: 0,
    snapshot: SnapshotPositions(state),
    choiceMade: null,
  };
  if (def.kind === "cinematic") {
    state.caption = null;
    state.beatLines = def.dynamicLines ? def.dynamicLines(state) : def.lines;
  }
  def.onEnter?.(state);
}

function SnapshotPositions(state) {
  return {
    player: { x: state.player.x, level: state.player.level },
    actors: state.actors.map((a) => ({ id: a.id, x: a.x, level: a.level, following: !!a.following })),
  };
}

function RestoreSnapshot(state) {
  const snap = state.beat.snapshot;
  state.player.x = snap.player.x;
  state.player.level = snap.player.level;
  for (const s of snap.actors) {
    const a = FindActor(state, s.id);
    if (a) { a.x = s.x; a.level = s.level; a.following = s.following; }
  }
  state.detection.level = 0;
}

function AdvanceBeat(state) {
  ClearPoses(state);
  const def = CurrentBeatDef(state);
  def?.onDone?.(state);
  state.beatIndex += 1;
  state.caption = null;
  state.prompt = null;
  state.planing = null;
  state.dragTrack = null;
  state.throwAim = null;
  if (state.beatIndex >= CurrentScript(state).length) EndChapter(state);
  else EnterBeat(state);
}

// 跳过序章：整段一次性结算掉（序章的行没有走位副作用，直接翻页即可）。
// 只对 c1_prologue 生效——正片的过场不给整段跳，逐行点按仍是唯一的快进。
export function SkipPrologue(state) {
  const def = CurrentBeatDef(state);
  if (!def || def.id !== "c1_prologue") return false;
  AdvanceBeat(state);
  return true;
}

function EndChapter(state) {
  if (state.chapterIndex >= CHAPTERS.length - 1) {
    state.phase = "gameEnd";
    state.done = true;
  } else {
    state.phase = "chapterEnd";
    state.cardTimer = 0;
  }
}

export function AdvanceCinematic(state) {
  const def = CurrentBeatDef(state);
  if (!def) return;
  if (def.kind === "cinematic") {
    state.beat.lineIndex += 1;
    state.beat.lineT = 0;
    if (state.beat.lineIndex >= state.beatLines.length) AdvanceBeat(state);
  }
}

export function MakeChoice(state, key) {
  const def = CurrentBeatDef(state);
  if (def?.kind !== "choice") return;
  state.flags.route = key;
  state.beat.choiceMade = key;
  AdvanceBeat(state);
}

export function ConfirmChapterCard(state) {
  if (state.phase === "chapterCard") state.phase = "playing";
  else if (state.phase === "chapterEnd") StartChapter(state, state.chapterIndex + 1);
}

// ---------------------------------------------------------------------------
// 过场走位与微过场
// ---------------------------------------------------------------------------
function StepCineActors(state, dt) {
  // 关键帧轨道的时钟。t 允许从负数起步：负的那一段是"等待"，
  // 用来把两个演员的轨道对齐到同一个落点（枪托砸到的那一帧）。
  if (state.player.track) state.player.track.t += dt;
  for (const a of state.actors) if (a.track) a.track.t += dt;
  for (const a of state.actors) {
    if (!a.cineTarget) continue;
    const d = Math.abs(a.x - a.cineTarget.x);
    if (d < 0.4) {
      if (a.cineVanish) a.visible = false;
      a.cineTarget = null;
      continue;
    }
    const speed = a.cineSpeed || 1.6;
    const dir = Math.sign(a.cineTarget.x - a.x);
    // cineKeepHeading：被拖走还回头望的人，脸不许被行走方向扳回去
    if (!a.cineKeepHeading) a.heading = dir;
    a.x += dir * Math.min(speed * dt, d);
  }
  // 玩家的过场走位（第八章结尾：走出画面）
  if (state.player.cineWalk) {
    const w = state.player.cineWalk;
    const d = Math.abs(state.player.x - w.x);
    if (d < 0.4) state.player.cineWalk = null;
    else {
      const dir = Math.sign(w.x - state.player.x);
      state.player.heading = dir;
      state.player.x += dir * Math.min(w.speed * dt, d);
    }
  }
}

export function StartMicroCine(state, lines) {
  state.microCine = { lines, i: 0, t: 0 };
}

function StepMicroCine(state, input, dt) {
  const mc = state.microCine;
  const line = mc.lines[mc.i];
  if (!line) { state.microCine = null; state.caption = null; return; }
  state.caption = line;
  state.camHint = line.cam || { kind: "close" };
  mc.t += dt;
  if (input.advance || !LineHeld(line, mc.t)) {
    mc.i += 1;
    mc.t = 0;
    if (mc.i >= mc.lines.length) { state.microCine = null; state.caption = null; }
  }
}

function StepCinematic(state, input, dt) {
  const lines = state.beatLines;
  const line = lines[state.beat.lineIndex];
  if (!line) { AdvanceBeat(state); return; }
  if (state.beat.lineFired !== state.beat.lineIndex) {
    state.beat.lineFired = state.beat.lineIndex;
    line.on?.(state);
  }
  state.caption = line;
  state.camHint = line.cam || { kind: "follow" };
  state.camLineT = state.beat.lineT;
  state.camLineD = LineDuration(line);
  // 正反打不能越轴：主体必须看着被越过的那个肩膀
  if (state.camHint.kind === "ots") {
    const subj = FindActor(state, state.camHint.subject)
      || (state.camHint.subject === "player" ? state.player : null);
    const other = FindActor(state, state.camHint.other)
      || (state.camHint.other === "player" ? state.player : null);
    if (subj && other) {
      subj.heading = other.x >= subj.x ? 1 : -1;
      other.heading = -subj.heading;
    }
  }
  StepCineActors(state, dt);
  state.beat.lineT += dt;
  if (input.advance || !LineHeld(line, state.beat.lineT)) {
    state.beat.lineIndex += 1;
    state.beat.lineT = 0;
    if (state.beat.lineIndex >= lines.length) AdvanceBeat(state);
  }
}

// ---------------------------------------------------------------------------
// 主步进
// input: {moveX(-1..1), climb(-1上/+1下…实际 W=-1 上), crouch, interact, interactHeld, advance}
// ---------------------------------------------------------------------------
export function StepGame(state, input, dt) {
  state.promptFill = 0;
  if (state.phase === "gameEnd") return;
  state.time += dt;
  if (state.toast && (state.toast.t -= dt) <= 0) state.toast = null;
  // 动词姿势到时收回（过场里由脚本设的 pose 没有 poseT，不受影响）
  if (state.player.poseT !== undefined && (state.player.poseT -= dt) <= 0) {
    state.player.pose = null;
    state.player.poseT = undefined;
  }
  // 引导气泡逐帧重算（节拍的 bubbles 回调往里推）；一次性气泡走计时
  state.bubbles = [];
  state.throwAim = null;
  if (state.bubbleFlash && (state.bubbleFlash.t -= dt) <= 0) state.bubbleFlash = null;
  if (state.spotFlash && (state.spotFlash.t -= dt) <= 0) state.spotFlash = null;
  // 飘落的刨花：渲染层拿它跑一段自由落体，落到地上就并进那堆里
  if (state.planeCurl && (state.planeCurl.t += dt) > 1.8) state.planeCurl = null;
  // 后果小窗到时收起；onEnd 给"看完这一眼之后"的收尾用（娘接着锄地）
  if (state.pip && (state.pip.t -= dt) <= 0) {
    const done = state.pip;
    state.pip = null;
    done.onEnd?.(state);
  }
  // 小活物的一次性动画：麻雀炸窝、母鸡扑棱、田鼠蹿走——各自跑完就清
  for (const key of ["sparrowBurst", "henFlee", "mouseFlee", "vaultDust"]) {
    const fx = state[key];
    if (fx && (fx.t += dt) > 2.2) state[key] = null;
  }

  if (state.phase === "chapterCard" || state.phase === "chapterEnd") {
    state.cardTimer += dt;
    if (input.advance && state.cardTimer > 0.8) ConfirmChapterCard(state);
    return;
  }

  const def = CurrentBeatDef(state);
  if (!def) return;
  state.beat.t += dt;
  state.prompt = null;

  if (state.microCine) { StepMicroCine(state, input, dt); StepCineActors(state, dt); return; }
  if (def.kind === "cinematic") { StepCinematic(state, input, dt); return; }
  if (def.kind === "choice") { state.caption = null; return; }

  // 有的节拍给烟锋设了下限（第四章熄灯/堵卡口那两段）：烟在卡口外打转，
  // 不会把玩家要去的位置先吞掉——手慢不该变成死局。放在 MovePlayer 之前，
  // 因为渲染层的流体解算会在两帧之间把 frontX 往低改。
  if (def.smokeFloor !== undefined && state.smoke?.active && state.smoke.frontX < def.smokeFloor) {
    state.smoke.frontX = def.smokeFloor;
  }
  MovePlayer(state, input, dt);
  StepFollowers(state, dt);
  StepSoldiers(state, dt);
  StepCineActors(state, dt);
  if (state.smoke?.active) StepSmoke(state, dt);
  StepDogs(state, dt);
  StepLightHazard(state, def, dt);
  if (state.noiseAt && (state.noiseAt.t -= dt) <= 0) state.noiseAt = null;

  // 辘轳锁在这里清、在 beat 执行器里立——MovePlayer 在前面用的是上一帧的值，
  // 这一帧的时序正好让"井口竖推当摇辘轳"不与"竖推当爬梯"打架
  state.winchLock = false;
  state.winchView = null;

  // 节拍声明的引导气泡（图形气泡=「我缺什么」，无文字引导三层配方之一）
  def.bubbles?.(state);
  // 节拍的每帧回调（走位到点接活计这类小状态机）
  def.tick?.(state, dt);

  // 链外的通用投掷：手里有能扔的就能扔（软性窗口靠它——石子落地出声引开人）。
  // 链内的投掷仍由 StepChain 自己管（要判命中）
  if (def.kind !== "chain") {
    StepThrown(state, dt);
    if (input.throw && state.player.item?.throwable && !state.thrown) {
      StartThrow(state, null);
      FlashPose(state, "throwArm", 0.45);
      Cue(state, "whoosh");
    }
  }
  // 路边的石子堆（潜行段的软性窗口）：捡一颗在手，第一次靠近给个一次性提示
  if (def.stonePile && !state.player.item && state.player.level === "surface"
    && Math.abs(state.player.x - def.stonePile.x) < 1.6) {
    if (!state.beat.stoneHinted) {
      state.beat.stoneHinted = true;
      state.bubbleFlash = { x: def.stonePile.x, y: 1.9, icon: "stone", t: 3.2 };
    }
    if (!state.prompt) {
      state.prompt = "E · 捡石子";
      if (input.interact) { GiveItem(state, { id: "stone", label: "石子", throwable: true }); FlashPose(state, "bow", 0.45); Cue(state, "pickup"); }
    }
  }
  // 扒墙缝看一眼（可选观察，预教第三章的「看」）：无字幕的插入镜头
  if (def.peek && !state.beat.peeked && !state.microCine
    && Math.abs(state.player.x - def.peek.x) < 1.5 && state.player.level === "surface") {
    if (!state.prompt) {
      state.prompt = def.peek.prompt;
      if (input.interact) { state.beat.peeked = true; StartMicroCine(state, def.peek.lines); }
    }
  }
  // 可选探索：院墙角那枚顶针（历史小卡的雏形——训练「离开主路径看一眼」）
  if (CHAPTERS[state.chapterIndex].id === "c1" && !state.flags.thimbleFound
    && !state.prompt && !state.player.item && state.player.level === "surface"
    && Math.abs(state.player.x - 48.8) < 1.2) {
    state.prompt = "E · 看看";
    if (input.interact) {
      state.flags.thimbleFound = true;
      Cue(state, "pickup");
      state.toast = { text: "一枚铜顶针。娘纳鞋底时顶针眼用的，不知什么时候滚到了墙根。", t: 5 };
    }
  }

  switch (def.kind) {
    case "goto": StepGoto(state, def, input); break;
    case "gotoSeq": StepGotoSeq(state, def, input); break;
    case "collect": StepCollect(state, def, input); break;
    case "escort": StepEscort(state, def, input); break;
    case "leadFollow": StepLeadFollow(state, def, dt); break;
    case "coverRun": StepCoverRun(state, def, input, dt); break;
    case "lead": StepLead(state, def, input); break;
    case "observe": StepObserve(state, def, dt); break;
    case "hold": StepHold(state, def, input, dt); break;
    case "doomedHold": StepDoomedHold(state, def, input, dt); break;
    case "mapBoard": StepMapBoard(state, def, input); break;
    case "actSeq": StepActSeq(state, def, input); break;
    case "scribe": StepScribe(state, def, input, dt); break;
    case "buildSpots": StepBuildSpots(state, def, input, dt); break;
    case "digSeq": StepDigSeq(state, def, input, dt); break;
    case "douseLamps": StepDouseLamps(state, def, input); break;
    case "floodRescue": StepFloodRescue(state, def, input); break;
    case "smokeEscape": StepSmokeEscape(state, def, input); break;
    case "rescueLoop": StepRescueLoop(state, def, input, dt); break;
    case "chain": StepChain(state, def, input, dt); break;
    case "cartRide": StepCartRide(state, def, input, dt); break;
    case "plane": StepPlane(state, def, input, dt); break;
    default: break;
  }

  if (state.stealthActive && !def.noDetect) StepDetection(state, def, dt);
}

// ---------------------------------------------------------------------------
// 移动 / 爬梯 / 躲藏
// ---------------------------------------------------------------------------
function MovePlayer(state, input, dt) {
  const def = CurrentBeatDef(state);
  const scene = SceneOf(state);
  const env = CHAPTERS[state.chapterIndex].scene;
  const p = state.player;
  if (p.climbT > 0) { p.climbT -= dt; return; } // 爬梯中锁操作
  // 翻越进行中：撑上顶沿 → 收腿荡过去 → 落地缓冲，全程锁操作。
  // 横向用 smoothstep（起手几乎不动，手在撑；过顶沿最快；落地收住），
  // 纵向走 VaultArc —— 人是真的抬离地面的，渲染层读 p.lift。
  if (p.vaultT > 0) {
    p.vaultT -= dt;
    const dur = p.vaultDur || VAULT_DUR;
    const k = Math.max(0, Math.min(1, 1 - Math.max(0, p.vaultT) / dur));
    p.vaultK = k;
    p.x = p.vaultFrom + (p.vaultTo - p.vaultFrom) * (k * k * (3 - 2 * k));
    p.lift = (p.vaultTop || 1.2) * VaultArc(k, p.vaultBig);
    p.pose = p.vaultBig ? "clamber" : "vault";
    // 垛顶上藏不住人：翻越是要露头的，这也是把它放进扫荡段的意义
    p.hidden = false;
    // 脚先落地，最后那一小段是屈膝卸力——落地声和尘土跟着脚走，不跟着动作结束走
    if (!p.vaultLanded && k >= 0.80) {
      p.vaultLanded = true;
      Cue(state, "vaultLand");
      state.vaultDust = { x: p.x, t: 0 };
    }
    if (p.vaultT <= 0) {
      p.pose = null; p.vaultT = 0; p.vaultK = 0; p.lift = 0; p.vaultBig = false;
    }
    return;
  }

  // 地道里的姿态由所在段的净高决定：猫腰是常态，半蹲是局部，
  // 直立（藏人洞）和爬行（卡口/新掏段）是少数。见 TunnelPosture。
  const inTunnel = (env === "tunnelVillage" || env === "tunnelFort") && p.level === "under";
  const posture = inTunnel ? TunnelPosture(scene, p.x) : (input.crouch ? "squat" : "stand");
  p.posture = posture;
  p.forcedCrouch = inTunnel && posture !== "stand";
  p.crouch = posture === "squat" || posture === "crawl" || (!inTunnel && !!input.crouch);
  let speed = 4.2 * (POSTURE_SPEED[posture] ?? 1);
  // 背着大爷：一个大活人在背上，快不起来
  if (state.beat?.carryElder) speed = Math.min(speed, 1.8);
  if (def?.slow) speed = 1.8;
  if (p.carry) speed = 3.0;
  if (p.item?.big) speed = Math.min(speed, 2.6);   // 扛大件（门板/顶木/满桶水）再慢一档

  const prevX = p.x;
  if (Math.abs(input.moveX) > 0.05) {
    p.x += Math.sign(input.moveX) * speed * dt;
    p.heading = Math.sign(input.moveX);
  }

  // 可翻越物：**挡路**。走到跟前顶住，头顶出一枚「翻过去」的徽章，
  // 按下互动键才翻——自动翻越是上一版的做法，玩家的原话是"居然是自动翻越"：
  // 一个会打断走路的动作必须由玩家自己按下去，否则那就不是他的动作。
  // 过场走位（cineWalk / microCine）与推着车走不参与。
  state.vaultHint = "";
  const pushingCart = !!state.cart && Math.abs(p.x - state.cart.x) < 2.6;
  if (p.level === "surface" && !state.microCine && !p.cineWalk && !pushingCart) {
    for (const v of scene.vaults || []) {
      if (v.flag && !state.flags[v.flag]) continue;
      const stop = (v.w || 1) / 2 + 0.2;                   // 顶住的位置：贴着近侧那一面
      const d = p.x - v.x;
      if (Math.abs(d) > stop + 0.55) continue;             // 还没走到跟前
      // 站在哪一侧：贴住之后 d 就不会再是 0，起步那一帧用上一帧的位置兜底
      const side = Math.sign(d) || Math.sign(prevX - v.x) || -(p.heading || 1);
      if (Math.abs(d) < stop) p.x = v.x + side * stop;     // 挡住，过不去
      // 提示只在**朝着它**的时候出。刚翻下来背对着它的那一秒也在范围内，
      // 那会儿再出一次提示，按键玩家会当场原路翻回去——来回弹个没完
      if (p.heading !== -side) break;
      state.vaultHint = "E · 翻过去";
      if (input.interact) {
        input.interact = false;                            // 吃掉这一下，别再被节拍拿去用
        const dir = -side;                                 // 往障碍的另一侧翻
        const big = !!(p.item?.big || p.carry);
        p.vaultDur = big ? VAULT_DUR_BIG : VAULT_DUR;
        p.vaultFrom = p.x;                                 // 从脚下起手，不往回弹
        p.vaultTo = v.x + dir * ((v.w || 1) / 2 + 0.52);
        p.vaultTop = v.top ?? 1.2;
        p.vaultBig = big;
        p.vaultT = p.vaultDur;
        p.vaultK = 0;
        p.vaultLanded = false;
        p.heading = dir;
        state.vaultHint = "";
        Cue(state, big ? "vaultHeavy" : "vault");
      }
      break;
    }
  }

  // 站在竖井口要给提示。原先这里一个字都没有，玩家根本不知道脚下能上能下——
  // 单独存一个字段，免得跟节拍自己的 prompt 抢。
  state.climbHint = "";
  for (const shaft of scene.shafts) {
    if (Math.abs(p.x - shaft.x) > 1.4) continue;
    if (shaft.builtFlag && !state.flags[shaft.builtFlag]) continue;
    if (p.level === "under" && scene.walk.surface) state.climbHint = "W · 上梯子";
    else if (p.level === "surface" && scene.walk.under) state.climbHint = "S · 下地道";
    break;
  }

  // 爬梯口：W 上 / S 下（辘轳接管竖推时不当爬梯——c5 井台正压在竖井口上）
  if (Math.abs(input.climb || 0) > 0.05 && !state.winchLock) {
    for (const shaft of scene.shafts) {
      if (Math.abs(p.x - shaft.x) > 1.4) continue;
      if (shaft.builtFlag && !state.flags[shaft.builtFlag]) continue;
      if (input.climb < 0 && p.level === "under") {
        if (state.flags.entWBlocked && shaft.id === "entW") {
          state.toast = { text: "西口上面有动静——不能走这儿！", t: 2.5 };
          break;
        }
        // 据点地道没有做地表：真让他爬上去会掉进一个空场景，提示全消失
        if (!scene.walk.surface) break;
        p.level = "surface"; p.climbT = 0.55; p.x = shaft.x;
      } else if (input.climb > 0 && p.level === "surface" && scene.walk.under) {
        p.level = "under"; p.climbT = 0.55; p.x = shaft.x;
      }
      break;
    }
  }

  // 行走范围（塌方未清开时挡路）
  const range = scene.walk[p.level];
  if (range) p.x = Math.max(range[0], Math.min(range[1], p.x));
  if (state.collapses && p.level === "under") {
    for (const key of Object.keys(state.collapses)) {
      const c = state.collapses[key];
      if (c.cleared) continue;
      const cx = TF[key].x;
      if (Math.abs(p.x - cx) < 1.2) p.x = cx + Math.sign(p.x - cx || -1) * 1.2;
    }
  }

  // 吸进烟里：呛咳、迈不动步
  if (state.smoke?.active && p.level === "under" && SmokeCovers(state, p.x)) {
    if (!state.beat.chokeT || state.time - state.beat.chokeT > 3) {
      state.beat.chokeT = state.time;
      state.toast = { text: "烟呛得睁不开眼。柱子弓着腰往回退。", t: 2.6 };
    }
    p.x -= Math.sign(input.moveX || 1) * speed * dt * 0.35;
  }

  // 躲藏：蹲在遮蔽物后
  // 躲掩体：高的（草垛、齐胸断墙）站着就挡得住，矮的（柴堆、水瓮）得蹲下去。
  // 找掩体本身才是玩法——不该再多按一个键才生效。
  p.hidden = false;
  for (const c of scene.covers) {
    if (Math.abs(p.x - c.x) >= c.w / 2 + 0.9) continue;
    if (c.tall || p.crouch) { p.hidden = true; break; }
  }
  // 移动掩体：贴着板车走，车影就是一段会自己往前挪的墙
  if (!p.hidden && state.cart && p.level === "surface"
    && Math.abs(p.x - state.cart.x) < (state.cartCoverR ?? 2.8)) p.hidden = true;
}

function StepFollowers(state, dt) {
  const p = state.player;
  const scene = SceneOf(state);
  for (const a of state.actors) {
    // 不跟着走的人一律落回地面：不清这一下，刚好在垛顶上停止跟随的人会一直悬着
    if (!a.following || !a.visible) { if (a.lift) a.lift = 0; continue; }
    a.level = p.level;
    const targetX = p.x - p.heading * 1.3;
    const d = Math.abs(a.x - targetX);
    if (d > 0.25) {
      const speed = Math.min((a.slow ? 2.6 : 3.8), d * 3);
      const dir = Math.sign(targetX - a.x);
      a.x += dir * speed * dt;
      a.heading = dir;
    }
    // 妹妹铁律的可见一半：镜像玩家的姿态（你蹲她蹲），过翻越物她也翻。
    // 她本就不参与任何暴露判定（探测只看玩家）——失败源只能是柱子本人
    a.crouch = p.crouch;
    // 她翻的是同一垛柴：抬升按到障碍中心的距离连续算——不用给她单独排一套
    // 计时器，跟着走就自然是一条弧（走到一半停下来，她就骑在顶沿上等你）
    let lift = 0, phase = 0.5;
    for (const v of scene.vaults || []) {
      if (v.flag && !state.flags[v.flag]) continue;
      const span = (v.w || 1) / 2 + 0.5;
      const d = Math.abs(a.x - v.x);
      if (d > span) continue;
      const up = (v.top ?? 1.2) * 0.68 * Math.sin((1 - d / span) * (Math.PI / 2));
      if (up <= lift) continue;
      lift = up;
      // 动作进度顺着她的行进方向算：还没过中线是撑上去，过了是落下来
      phase = Math.max(0, Math.min(1, 0.5 + ((a.x - v.x) * (a.heading || 1)) / (2 * span)));
    }
    a.lift = lift;
    a.vaultK = phase;
    if (lift > 0.02) { a.pose = "vault"; a.crouch = false; }
    else if (a.pose === "vault") a.pose = null;
  }
}

function StepSoldiers(state, dt) {
  for (const a of state.actors) {
    if (!IsEnemy(a) || !a.visible || a.cineTarget) continue;
    // 听见动静就过去看：压过巡逻，但不压过过场走位
    if (a.investigate) {
      if (state.time > a.investigate.until) { a.investigate = null; }
      else {
        const d = a.investigate.x - a.x;
        if (Math.abs(d) > 0.5) {
          a.x += Math.sign(d) * (a.speed || 1.2) * 1.5 * dt;
          a.heading = Math.sign(d);
        }
        continue;
      }
    }
    if (!a.patrol) continue;
    if (a.patrolDir === undefined) a.patrolDir = 1;
    a.x += a.patrolDir * a.speed * dt;
    if (a.x >= a.patrol[1]) { a.x = a.patrol[1]; a.patrolDir = -1; }
    if (a.x <= a.patrol[0]) { a.x = a.patrol[0]; a.patrolDir = 1; }
    a.heading = a.patrolDir;
  }
}

function IsEnemy(a) { return a.kind === "soldier" || a.kind === "puppet"; }

export const VISION_RANGE = 15;

// 夜里提着灯笼，人眼只够得着灯照亮的那一截——视距打七折。
// 渲染层画视线光带也用这一个数，画出来的和判出来的必须是同一条线：
// 三个调用点（探测判定、娘的"能不能冲"、渲染层的光带）都从这里取值，
// 所以节拍级的收缩（def.visionScale）也自动在画面上兑现。
export function VisionScale(state) {
  const L = CHAPTERS[state.chapterIndex].light;
  const night = (L === "night" || L === "dark") ? 0.72 : 1;
  return night * (CurrentBeatDef(state)?.visionScale ?? 1);
}

export function SoldierSeesPlayer(scene, soldier, player, rangeScale = 1) {
  if (player.hidden) return false;
  if ((soldier.level || "surface") !== player.level) return false;
  const dx = player.x - soldier.x;
  if (Math.sign(dx) !== Math.sign(soldier.heading || 1)) return Math.abs(dx) < 1.2;
  const range = (player.crouch ? VISION_RANGE * 0.65 : VISION_RANGE) * rangeScale;
  if (Math.abs(dx) > range) return false;
  // 高遮蔽物挡视线（房屋、高墙）
  for (const pr of scene.props) {
    if ((pr.kind === "house" || pr.kind === "fortWall") && pr.h >= 1.6) {
      const lo = Math.min(soldier.x, player.x), hi = Math.max(soldier.x, player.x);
      if (pr.x - (pr.w || 2) / 2 > lo && pr.x + (pr.w || 2) / 2 < hi) return false;
    }
  }
  return true;
}

function StepDetection(state, def, dt) {
  const scene = SceneOf(state);
  // 刚被退回来的那一秒半不判定。没有这道闸，只要重置点落进任何一个人的视线，
  // 玩家就会在原地被反复抓住——那不是难，是永远也跑不掉。
  // （布防本身要保证重置点是安全的；这道闸是兜底，防的是以后再改坏。）
  if (state.beat.graceT > 0) {
    state.beat.graceT -= dt;
    state.detection.level = 0;
    return;
  }
  let seen = false;
  for (const a of state.actors) {
    // decor 的兵只组队形、不看人：十几个人一起判视线，这段就没法玩了
    if (!IsEnemy(a) || !a.visible || a.decor) continue;
    if (SoldierSeesPlayer(scene, a, state.player, VisionScale(state))) { seen = true; state.detection.spotter = a.id; break; }
  }
  // 被照到不是立刻完蛋：红圈涨满要两秒多，来得及缩回影子里；
  // 缩回去消得也快——"差点被看见"该是心跳，不是重开
  if (seen) state.detection.level = Math.min(1, state.detection.level + dt * 0.45);
  else state.detection.level = Math.max(0, state.detection.level - dt * 0.8);
  if (state.detection.level >= 1) {
    state.flags.resets += 1;
    // 失败文案分级：首败无文字，只给视觉复盘（谁看见的，头顶亮一记「！」）；
    // 第二次起才出整句提示——玩家先自己读一遍失败，读不出来再给答案
    state.beat.failN = (state.beat.failN || 0) + 1;
    state.beat.graceT = 1.5;
    const spotterId = state.detection.spotter;
    RestoreSnapshot(state);
    def.onReset?.(state);
    const who = state.actors.find((a) => a.id === spotterId);
    if (who) state.spotFlash = { x: who.x, y: 2.3, t: 2.2 };
    state.toast = state.beat.failN >= 2
      ? { text: def.resetHint || "被发现了。退回来，重新等机会。", t: 4 }
      : null;
  }
}

// ---------------------------------------------------------------------------
// beat 执行器
// ---------------------------------------------------------------------------
function ZoneReached(state, zone) { return InZone(state.player.x, state.player.level, zone); }

function StepGoto(state, def, input) {
  if (def.interruptAt) {
    const start = state.beat.snapshot.player;
    const total = Math.abs(start.x - def.zone.x);
    const left = Math.abs(state.player.x - def.zone.x);
    if (total > 0 && left / total <= 1 - def.interruptAt) { AdvanceBeat(state); return; }
  }
  if (ZoneReached(state, def.zone)) AdvanceBeat(state);
}

function StepGotoSeq(state, def, input) {
  const i = state.beat.spotIndex;
  const spot = def.spots[i];
  if (!spot) { AdvanceBeat(state); return; }
  if (ZoneReached(state, spot)) {
    if (def.notes?.[i]) {
      state.toast = { text: def.notes[i], t: 5 };
      // 乡亲的口信也是情报。原来只弹个 toast 不入账，于是第六章门板上
      // 永远凑不齐互相矛盾的那两条，"自己推出来"那一支从来没上过场。
      state.flags.notesSeen.push(def.notes[i]);
    }
    state.beat.spotIndex += 1;
    if (state.beat.spotIndex >= def.spots.length) AdvanceBeat(state);
  }
}

function StepCollect(state, def, input) {
  const p = state.player;
  const items = state.beat.itemStates;
  if (p.carry === null) {
    for (const it of items) {
      if (it.carried || it.delivered) continue;
      if (Math.abs(p.x - it.x) < 1.6 && p.level === "surface") {
        state.prompt = `E · 扛${def.carryLabel}`;
        if (input.interact) { it.carried = true; p.carry = def.carryLabel; }
        break;
      }
    }
  } else if (ZoneReached(state, def.deliver)) {
    state.prompt = `E · 放下${def.carryLabel}`;
    if (input.interact) {
      const it = items.find((x) => x.carried && !x.delivered);
      if (it) { it.delivered = true; it.carried = false; }
      p.carry = null;
    }
  }
  if (items.every((x) => x.delivered)) AdvanceBeat(state);
}

function StepEscort(state, def, input) {
  if (def.midToast && !state.beat.visited.has("midToast")
    && Math.abs(state.player.x - def.midToast.zone.x) <= def.midToast.zone.w / 2) {
    state.beat.visited.add("midToast");
    state.toast = { text: def.midToast.text, t: 5 };
  }
  const f = FindActor(state, def.follower);
  if (f && !f.following && f.visible) {
    if (Math.abs(state.player.x - f.x) < 2.2 && f.level === state.player.level) {
      state.prompt = "E · 拉住她的手";
      if (input.interact) f.following = true;
    }
  }
  if (f?.following && ZoneReached(state, def.zone || def.dest)) {
    if (Math.abs(f.x - state.player.x) < 4) AdvanceBeat(state);
  }
}

// 某一段路此刻有没有被视线扫着——娘就是靠这个判断"能不能冲"的。
// 用的是探测逻辑同一个视距，所以她的判断和玩家看到的光带永远一致。
function PathLit(state, x0, x1) {
  const lo = Math.min(x0, x1) - 1.2, hi = Math.max(x0, x1) + 1.2;
  const range = VISION_RANGE * VisionScale(state);
  for (const a of state.actors) {
    if (!IsEnemy(a) || !a.visible || a.decor) continue;
    const end = a.x + (a.heading || 1) * range;
    if (Math.max(a.x, end) >= lo && Math.min(a.x, end) <= hi) return true;
  }
  return false;
}

// 掩体推进（勇敢的心式）：一串掩体连成的路，娘在掩体之间带路——
// 她看准空当就冲下一个，到了就贴着掩体等你跟上。玩家学的是"什么时候能动"，
// 而不是"蹲在原地等灯走远"：节奏由她演示，安全由掩体给。
// 最长的两段空地上有一辆推着走的板车，跟着车影就能过去。
function StepCoverRun(state, def, input, dt) {
  const b = state.beat;
  const leader = FindActor(state, def.leader);
  if (!leader) { AdvanceBeat(state); return; }
  const covers = def.covers;
  const p = state.player;
  if (b.coverIndex === undefined) {
    b.coverIndex = 0;
    leader.x = covers[0];
    if (def.movingCover) {
      state.cart = { x: def.movingCover.from };
      state.cartCoverR = def.movingCover.r ?? 2.8;
      b.cartDir = Math.sign(def.movingCover.to - def.movingCover.from) || 1;
    }
  }

  // 板车：一趟一趟地推。它不理会敌我，只是自顾自地走——
  // 玩家要做的是算准它什么时候路过自己这一段
  if (def.movingCover && state.cart) {
    const mc = def.movingCover;
    state.cart.x += b.cartDir * mc.speed * dt;
    if (state.cart.x > Math.max(mc.from, mc.to)) b.cartDir = -1;
    if (state.cart.x < Math.min(mc.from, mc.to)) b.cartDir = 1;
    // 推车的人在车后面顶着走，不是在前面拉——车往哪走，他就在哪一头的反侧
    const driver = FindActor(state, def.cartDriver);
    if (driver) { driver.x = state.cart.x - 2.0 * b.cartDir; driver.heading = b.cartDir; }
  }

  const hereX = covers[b.coverIndex];
  const nextX = covers[b.coverIndex + 1];

  if (nextX === undefined) {
    if (Math.abs(p.x - hereX) < 5.5) AdvanceBeat(state);
    else state.prompt = "跟上娘";
    return;
  }

  if (b.dashing) {
    const d = nextX - leader.x;
    if (Math.abs(d) < 0.5) {
      leader.x = nextX;
      b.dashing = false;
      b.coverIndex += 1;
      // 每到一个掩体存一次点：失败退回这儿，不是退回整段开头
      b.snapshot = SnapshotPositions(state);
    } else {
      leader.x += Math.sign(d) * 3.6 * dt;
      leader.heading = Math.sign(d);
    }
    return;
  }

  // 娘贴着掩体等你跟上来
  if (Math.abs(p.x - hereX) > 5.5) {
    state.prompt = "跟上娘——贴着草垛和断墙走";
    return;
  }
  if (!PathLit(state, leader.x, nextX)) {
    b.dashing = true;
    state.prompt = null;
  } else {
    state.prompt = "娘按住你——等这一段的光挪开";
  }
}

function StepLeadFollow(state, def, dt) {
  const leader = FindActor(state, def.leader);
  if (!leader) { AdvanceBeat(state); return; }
  const wps = def.waypoints;
  if (state.beat.spotIndex >= wps.length) { AdvanceBeat(state); return; }
  const wp = wps[state.beat.spotIndex];
  const near = Math.abs(leader.x - state.player.x) < 7;
  if (near) {
    const d = Math.abs(leader.x - wp.x);
    if (d < 1.2) {
      state.beat.spotIndex += 1;
      // 每过一个路口存一次点：走了大半段被灯照满，退回来的是最近的路口，
      // 不是整段开头——失败的代价是"这一步"，不是"这一路"
      state.beat.snapshot = SnapshotPositions(state);
      if (state.beat.spotIndex >= wps.length) { AdvanceBeat(state); return; }
    } else {
      const dir = Math.sign(wp.x - leader.x);
      leader.x += dir * 2.4 * dt;
      leader.heading = dir;
    }
  }
}

function StepLead(state, def, input) {
  const group = state.actors.filter((a) => a.group === def.group && a.visible);
  const anyLoose = group.some((a) => !a.following && !a.evacuated);
  if (anyLoose) {
    const near = group.find((a) => !a.following && Math.abs(a.x - state.player.x) < 2.4 && a.level === state.player.level);
    if (near) {
      state.prompt = "E · 招呼他们跟上";
      if (input.interact) for (const a of group) a.following = true;
    }
  }
  if (group.length && group.every((a) => a.following)) {
    const allNear = group.every((a) => InZone(a.x, a.level, def.dest));
    if (ZoneReached(state, def.dest) && allNear) {
      for (const a of group) { a.following = false; a.settled = true; }
      AdvanceBeat(state);
    }
  }
}

function StepObserve(state, def, dt) {
  const i = state.beat.spotIndex;
  const spot = def.spots[i];
  if (!spot) { AdvanceBeat(state); return; }
  if (ZoneReached(state, spot) && state.player.crouch) {
    state.beat.holdProgress += dt;
    state.prompt = "观察中…";
    state.promptFill = Math.min(1, state.beat.holdProgress / def.watchTime);
    if (state.beat.holdProgress >= def.watchTime) {
      if (def.notes?.[i]) state.flags.notesSeen.push(def.notes[i]);
      state.beat.holdProgress = 0;
      state.beat.spotIndex += 1;
      const done = state.beat.spotIndex >= def.spots.length;
      // "学会看"这件事得让玩家看见。原来是蹲够五秒弹一条 toast 把结论念出来，
      // 现在切一个插入镜头到他正望着的那个东西上——note 仍旧入账供第六章推理用。
      if (def.watchCine?.[i]) StartMicroCine(state, def.watchCine[i]);
      else if (def.notes?.[i]) state.toast = { text: "柱子记下：" + def.notes[i], t: 5.5 };
      if (done) AdvanceBeat(state);
    }
  } else if (ZoneReached(state, spot)) {
    state.prompt = "C · 蹲下";
  } else {
    state.beat.holdProgress = 0;
  }
}

function StepHold(state, def, input, dt) {
  if (ZoneReached(state, def.zone)) {
    state.prompt = def.holdPrompt || `按住 E · ${def.objective}`;
    state.promptFill = state.beat.holdProgress / def.holdTime;
    if (input.interactHeld) {
      state.beat.holdProgress += dt;
      if (state.beat.holdProgress >= def.holdTime) {
        if (def.note) state.toast = { text: def.note, t: 4.5 };
        AdvanceBeat(state);
      }
    } else if (state.beat.holdProgress > 0) {
      state.beat.holdProgress = Math.max(0, state.beat.holdProgress - dt * 2);
    }
  }
}

function StepBuildSpots(state, def, input, dt) {
  for (let i = 0; i < def.spots.length; i += 1) {
    const s = def.spots[i];
    if (state.beat.spotDone[i]) continue;
    if (ZoneReached(state, s.zone)) {
      // 有的工位上先躺着一样东西。挖翻口的位置就是大爷和顺子没出来的位置——
      // 先把烟袋拾起来，再动土。两章之间的账，用一个弯腰接上，不用字幕
      if (s.pickup && !state.beat.pickedUp?.[i]) {
        state.prompt = `E · ${s.pickup.prompt}`;
        if (input.interact) {
          if (!state.beat.pickedUp) state.beat.pickedUp = {};
          state.beat.pickedUp[i] = true;
          state.toast = { text: s.pickup.toast, t: 5 };
        }
        break;
      }
      state.prompt = `按住 E · ${s.label}`;
      state.promptFill = state.beat.spotProgress[i] / s.holdTime;
      if (input.interactHeld) {
        state.beat.spotProgress[i] += dt;
        if (state.beat.spotProgress[i] >= s.holdTime) {
          state.beat.spotDone[i] = true;
          state.toast = { text: s.note, t: 4.5 };
          if (s.zone === TV.hiddenSpot) state.flags.hiddenBuilt = true;
          if (s.zone === TV.trapSpot) state.flags.trapBuilt = true;
        }
      }
      break;
    }
  }
  if (state.beat.spotDone.every(Boolean)) AdvanceBeat(state);
}

function StepDigSeq(state, def, input, dt) {
  state.beat.quakeT += dt;
  const cycle = def.quakeInterval + (state.flags.route === "ground" ? 4 : 0);
  const phase = state.beat.quakeT % cycle;
  state.beat.quakeWarn = phase > cycle - 3.0;
  state.beat.quakeActive = phase > cycle - 2.5;

  const keys = ["collapse1", "collapse2"];
  const key = keys[state.beat.digIndex];
  if (!key) { AdvanceBeat(state); return; }
  const c = state.collapses[key];
  const zone = TF[key];

  // 连夜掏的段全是虚土：不先支根顶木，挖一下塌一下。
  // 顶木在旁洞里——扛着它爬过低段，是这条路收的过路钱。
  if (def.shore && !c.shored) {
    const sp = def.shore[key];
    const p = state.player;
    if (p.item?.id === "beam") {
      if (ZoneReached(state, zone)) {
        state.prompt = "E · 支上顶木";
        if (input.interact) {
          c.shored = true;
          p.item = null;
          state.toast = { text: "顶木咬住了虚土。可以动手了。", t: 3.5 };
        }
      }
      return;
    }
    if (Math.abs(p.x - sp.beamX) < 1.9 && p.level === "under") {
      state.prompt = "E · 扛起顶木";
      if (input.interact) GiveItem(state, { id: "beam", label: "顶木", big: true });
    } else if (ZoneReached(state, zone)) {
      state.prompt = "虚土会塌——得先从旁洞扛根顶木来支上";
    }
    return;
  }

  if (ZoneReached(state, zone)) {
    if (state.beat.quakeActive) {
      state.prompt = "！头顶有动静——停下，别出声";
      c.progress = Math.max(0, c.progress - dt * 0.3);
    } else {
      state.prompt = "按住 E · 清土";
      state.promptFill = c.progress / def.holdTime;
      if (input.interactHeld) {
        c.progress += dt;
        if (c.progress >= def.holdTime) {
          c.cleared = true;
          state.toast = { text: "土清开了。前面的路通了。", t: 3 };
          state.beat.digIndex += 1;
          if (state.beat.digIndex >= keys.length) AdvanceBeat(state);
        }
      }
    }
  }
}

// ---------------------------------------------------------------------------
// 烟（一维推进）：front 从东向西移动，x > frontX 的区域已被烟占据
// ---------------------------------------------------------------------------
function StepSmoke(state, dt) {
  const s = state.smoke;
  // 翻口是水封，不是缓冲：烟推到弯前就到头了。第四章没有翻口，所以人没救回来；
  // 第五章挖了，所以这一次守得住——这一章的改造在这里兑现。
  if (s.trapAt !== null && s.frontX <= s.trapAt) {
    s.frontX = s.trapAt;
    if (!s.trapHeld) {
      s.trapHeld = true;
      state.toast = { text: "烟撞在翻口的水面上，翻了几下，没能过来。", t: 4.5 };
    }
    return;
  }
  s.frontX -= s.speed * dt;
}

export function SmokeCovers(state, x) {
  return !!state.smoke?.active && x >= state.smoke.frontX;
}

// 熄灯：一盏盏吹灭，最后一盏留在自己手里
function StepDouseLamps(state, def, input) {
  if (!state.lamps) {
    state.lamps = def.lamps.map((x) => ({ x, lit: true }));
    state.toast = { text: "铃响了。头顶的脚步就在磨盘那一片。", t: 3.5 };
  }
  // 被烟吞掉的灯，烟自己会把它压灭——玩家手慢了不该因为够不着灯而卡死
  for (const l of state.lamps) {
    if (l.lit && SmokeCovers(state, l.x)) {
      l.lit = false;
      if (!state.beat.smokeDoused) {
        state.beat.smokeDoused = true;
        state.toast = { text: "烟漫过来，把东头那盏灯压灭了。", t: 3 };
      }
    }
  }
  const remaining = state.lamps.filter((l) => l.lit);
  if (remaining.length <= 1) {
    // 最后一盏在顺子手里。他把灯递给柱子——这是顺子在这个游戏里唯一一次
    // 和玩家交手；下一拍他回身进烟里，玩家手里提着的就是他给的灯。
    const shunzi = FindActor(state, "shunzi");
    const lampX = remaining[0]?.x ?? state.player.x;
    if (shunzi && !state.beat.lampHanded) {
      shunzi.visible = true;
      // 走位指令只下一次。每帧重设的话：他一到位指令被清、又立刻被设回去，
      // "已到位"永远不成立，递灯的提示一辈子出不来
      if (!state.beat.shunziSent) {
        state.beat.shunziSent = true;
        if (Math.abs(shunzi.x - lampX) > 0.9) { shunzi.cineTarget = { x: lampX + 0.7 }; shunzi.cineSpeed = 2.6; }
      }
      if (Math.abs(state.player.x - shunzi.x) < 1.7) {
        state.prompt = "E · 接过灯";
        if (input.interact) {
          state.beat.lampHanded = true;
          for (const l of state.lamps) l.lit = false;
          state.player.lamp = true;
          state.toast = { text: "顺子把灯柄塞进柱子手里：『你提着。你认路。』", t: 4.5 };
          AdvanceBeat(state);
        }
      }
      return;
    }
    for (const l of state.lamps) l.lit = false;
    state.player.lamp = true;
    if (def.note) state.toast = { text: def.note, t: 4.5 };
    AdvanceBeat(state);
    return;
  }
  const near = remaining.find((l) => Math.abs(l.x - state.player.x) < 1.8);
  if (near) {
    state.prompt = "E · 吹灭灯";
    if (input.interact) near.lit = false;
  }
}

function StartFlood(state) {
  state.smoke = null;
  state.flood = { active: true, sourceX: 148, t: 0 };
  const n = SCENES.tunnelVillage.zones;
  state.actors = state.actors.filter((a) => a.kind !== "villager");
  state.actors.push(
    MakeActor("fl1", "villager", n.chamberA.x, { level: "under", label: "困住的乡亲" }),
    MakeActor("fl2", "villager", n.chamberA.x + 2, { level: "under", label: "困住的乡亲", slow: true }),
    MakeActor("fl3", "villager", n.chamberB.x + 3, { level: "under", label: "抱孩子的大嫂", slow: true }),
  );
  state.player.x = 96;
  state.player.level = "under";
  state.player.lamp = true;
}

// 灌水：水深由流体解算回灌，站在深水里会被冲散
function StepFloodRescue(state, def, input) {
  const dest = def.dest || TV.entW;
  const villagers = state.actors.filter((a) => a.kind === "villager" && a.visible && !a.evacuated);
  const loose = villagers.find((a) => !a.following && Math.abs(a.x - state.player.x) < 2.8);
  if (loose) {
    state.prompt = "E · 招呼他们跟上";
    if (input.interact) {
      for (const a of villagers) {
        if (!a.following && Math.abs(a.x - state.player.x) < 3.6) a.following = true;
      }
    }
  }
  for (const a of villagers) {
    if (InZone(a.x, a.level, dest)) { a.evacuated = true; a.following = false; a.visible = false; }
  }
  // 水深超过腰就站不住（深度由渲染层的解算回灌）
  const depth = state.floodDepth || 0;
  if (depth > 1.15) {
    state.flags.resets += 1;
    RestoreSnapshot(state);
    for (const v of state.actors.filter((x) => x.kind === "villager")) {
      v.following = false; v.evacuated = false; v.visible = true;
    }
    if (state.flood) state.flood.t = 0;
    state.toast = { text: def.resetHint, t: 4 };
    return;
  }
  if (villagers.length === 0) AdvanceBeat(state);
}

function StepSmokeEscape(state, def, input) {
  const dest = def.dest || TV.entW;

  // 第四章的注定失去：拴柱大爷半路腿软。
  // 这里原来是纯脚本：大爷必死，玩家只能看——可前一分钟游戏才教过他
  // "烟碰到人=失手重来"，两套规则打架，失去读起来像自己手慢。
  // 现在把选择交到玩家手上：可以背起大爷，但背着他走不快、也腾不出手
  // 招呼别人——试过一次就会明白"救一个还是带三个"不是旁白说的，是手感。
  if (def.lossScript) {
    const elder1 = FindActor(state, "elder1");
    const shunzi = FindActor(state, "shunzi");
    if (!state.beat.lossStage && elder1?.following && elder1.x < 92) {
      state.beat.lossStage = 1;
      state.beat.lossT = state.beat.t;
      elder1.following = false;
      elder1.scripted = true;
      elder1.pose = "kneel";           // 坐在道口，就地
      state.toast = { text: "拴柱大爷腿一软，坐在了道口。", t: 4 };
    }
    // 坐着等：玩家可以背他
    if (state.beat.lossStage === 1 && elder1 && !state.beat.carryElder) {
      if (Math.abs(state.player.x - elder1.x) < 1.7) {
        state.prompt = "E · 背起大爷";
        if (input.interact) {
          state.beat.carryElder = true;
          elder1.pose = null;
          elder1.following = true;
          elder1.scripted = false;
          // 背上一个人，手就腾不出来了：跟着的其他人只能原地等
          for (const a of state.actors) {
            if (a.kind === "villager" && a.id !== "elder1") a.following = false;
          }
          state.toast = { text: "大爷伏在柱子背上，轻得吓人。", t: 3.5 };
        }
      }
      // 玩家往前走远了，或耗得太久：顺子回身去背——原来的时序从这儿接上
      const waited = state.beat.t - state.beat.lossT;
      if (state.player.x < elder1.x - 8 || waited > 12) {
        state.beat.lossStage = 1.5;
        elder1.cineTarget = { x: 112 };   // 退回藏人洞·甲；烟约 45s 追到，吞没时序才成立
        elder1.cineSpeed = 0.9;
        elder1.pose = null;
        if (shunzi) {
          shunzi.visible = true;
          shunzi.scripted = true;
          shunzi.x = Math.max(60, state.player.x - 6);
          shunzi.cineTarget = { x: 112 };
          shunzi.cineSpeed = 3.2;
        }
        state.toast = { text: "顺子从后面追了上去：『你们先走！』", t: 5 };
      }
    }
    if (state.beat.lossStage === 1.5) {
      // 烟追上他们时才隐去——两个人影消失在烟里
      const gone = [elder1, shunzi].every((a) => !a || !a.visible || SmokeCovers(state, a.x));
      if (gone || state.beat.t - state.beat.lossT > 50) {
        state.beat.lossStage = 2;
        if (elder1) { elder1.visible = false; elder1.cineTarget = null; }
        if (shunzi) { shunzi.visible = false; shunzi.cineTarget = null; }
      }
    }
  }

  const villagers = state.actors.filter((a) => a.kind === "villager" && a.visible && !a.evacuated && !a.scripted);
  // 大爷坐下之后就不再是"招呼跟上"的对象（他有自己的 E·背起提示）；
  // 坐下之前照常招呼——他得先跟上、走到半路，腿才会软
  const elderDown = (id) => id === "elder1" && state.beat.lossStage;
  const loose = villagers.find((a) => !a.following && !elderDown(a.id) && Math.abs(a.x - state.player.x) < 2.6);
  if (loose && !state.prompt) {
    if (state.beat.carryElder) {
      state.prompt = "背着大爷，腾不出手招呼人";
    } else {
      state.prompt = "E · 招呼他们跟上";
      if (input.interact) {
        for (const a of villagers) {
          if (!a.following && !elderDown(a.id) && Math.abs(a.x - state.player.x) < 3.4) a.following = true;
        }
      }
    }
  }
  // 到出口的人爬出去
  for (const a of villagers) {
    if (InZone(a.x, a.level, dest)) { a.evacuated = true; a.following = false; a.visible = false; }
  }
  // 烟追上未撤离的人 → 重置
  for (const a of villagers) {
    if (SmokeCovers(state, a.x)) {
      state.flags.resets += 1;
      state.smoke.frontX = 150;
      state.smoke.trapHeld = false;
      const carried = state.beat.carryElder;
      RestoreSnapshot(state);
      state.beat.lossStage = 0;
      state.beat.carryElder = false;
      for (const v of state.actors.filter((x) => x.kind === "villager")) {
        v.following = false; v.evacuated = false; v.scripted = false; v.cineTarget = null; v.pose = null;
        v.visible = v.id !== "shunzi" || !def.lossScript;
      }
      state.toast = {
        text: carried
          ? "背上大爷，就顾不上还能走的人。大爷推开了他的手——先把能走的带出去。"
          : def.resetHint,
        t: 5,
      };
      return;
    }
  }
  const remaining = state.actors.filter((a) => a.kind === "villager" && !a.scripted
    && !(def.lossScript && a.id === "shunzi") && !a.evacuated);
  if (remaining.length === 0) AdvanceBeat(state);
}

// 划线：一个很小的交互。按住 E，再左右推，石笔就沿着门框划过去；
// 松手或不推就停。线划满一道就算成。
//
// 叙事上是爹在划——所以爹必须真的走过来、伸手够到门框（pose="mark"）；
// 玩家手里控制的是那支石笔。让玩家亲手把这道线拉出来，比看一张插画卡重。
function StepScribe(state, def, input, dt) {
  const b = state.beat;
  if (b.drawn === undefined) {
    b.drawn = 0;
    def.onStart?.(state);
  }
  const inZone = Math.abs(state.player.x - def.zone.x) < (def.zone.w || 3) / 2 + 1.2;
  if (!inZone) {
    state.prompt = "";
    state.scribe = null;
    state.dragTrack = null;
    return;
  }
  // 两种握法，同一件事：桌面按住 E 往一边推，触屏直接把石笔拖过去。
  // 拖动是位移驱动的（拖多少走多少），手上有"蹭着木头走"的实感；
  // 按键那路仍按时间推进，不然键盘玩家没法控制快慢。
  //
  // 手（head）与线（drawn）是两回事：手可以往回蹭，划下的印子不会跟着退。
  // 线只在手走到过的最远处累积——这才是石笔，不是一根进度条。
  if (b.head === undefined) b.head = 0;
  const held = input.interactHeld || input.interact;
  const push = Math.abs(input.moveX) > 0.05;
  const before = b.head;
  if (held && push) b.head += Math.sign(input.moveX) * dt * (def.speed || 0.5);
  if (input.dragX) b.head += input.dragX;
  b.head = Math.max(0, Math.min(1, b.head));
  // 石笔蹭木头：手真的在动才出声，一段一段接上（划完再响一次就成了念白）
  if (Math.abs(b.head - before) > 0.001) {
    b.scribeT = (b.scribeT ?? 0) + dt;
    if (b.scribeT > 0.5) { b.scribeT = 0; Cue(state, "scribe", { gain: 0.7 }); }
  } else b.scribeT = 0.42;                       // 停手再动，几乎立刻续上
  b.drawn = Math.max(b.drawn, b.head);
  b.everMoved = b.everMoved || b.head > 0.02;
  // 第八章他自己刻：抬臂比着框（第一章是爹在划，玩家是被量的那个）
  if (def.selfMark) FlashPose(state, "mark", 0.3);
  state.prompt = null;   // 这一拍的引导由 QTE 轨道给，不占中间那条提示
  // 交给 HUD 画轨道、渲染层画线：x0→x1 是这道线的起止，head 是石笔尖在哪
  state.scribe = {
    x: def.zone.x, y: def.markY ?? 1.25,
    x0: def.markX0 ?? (def.zone.x - 0.52), x1: def.markX1 ?? (def.zone.x + 0.52),
    t: b.drawn, head: b.head, idle: !b.everMoved,
  };
  // 划线与刨料共用同一条 QTE 轨道（两件事都是"把它推过去"）
  state.dragTrack = { t: b.head, idle: !b.everMoved, tip: "拖着石笔划过去" };
  if (b.drawn >= 1) {
    if (def.note) state.toast = { text: def.note, t: 4.5 };
    state.scribe = null;
    state.dragTrack = null;
    AdvanceBeat(state);   // onDone 由它统一调，这里再调一次就成了两遍
  }
}

// 按顺序做完几个动作。用来把"该由玩家亲手做"的事从过场里拿回来——
// 第七章顶点处松开妹妹的手、接过灯，这两下由脚本代劳和由玩家按下去，
// 是完全不同的两件事。
function StepActSeq(state, def, input) {
  const b = state.beat;
  if (b.stepIndex === undefined) b.stepIndex = 0;
  const st = def.steps[b.stepIndex];
  if (!st) { AdvanceBeat(state); return; }
  const near = Math.abs(state.player.x - st.x) < (st.r || 1.6)
    && (state.player.level || "surface") === (st.level || "surface");
  if (!near) { state.prompt = ""; return; }
  if (st.walk) { st.on?.(state); b.stepIndex += 1; return; }
  state.prompt = st.prompt;
  if (input.interact) {
    st.on?.(state);
    if (st.toast) state.toast = { text: st.toast, t: 4.5 };
    b.stepIndex += 1;
  }
}

// 情报板：把收集到的 note 一条条钉上去。凑齐互相矛盾的两条之后，
// 才允许玩家把记号钉在它们中间——那一下就是"他自己看出来了"。
function StepMapBoard(state, def, input) {
  const b = state.beat;
  if (!b.pinned) { b.pinned = 0; b.deduced = false; }
  const notes = state.flags.notesSeen;
  const inZone = Math.abs(state.player.x - def.zone.x) < 1.6
    && (state.player.level || "surface") === (def.zone.level || "surface");
  if (!inZone) { state.prompt = ""; return; }

  if (b.pinned < notes.length) {
    state.prompt = `E · 钉上一条（${b.pinned}/${notes.length}）`;
    if (input.interact) {
      // 停留久一点：这是玩家唯一能读到这条情报内容的地方
      state.toast = { text: notes[b.pinned], t: 7 };
      b.pinned += 1;
    }
    return;
  }
  // 两条对不上的都在板上了，才给推理这一下
  const hasBoth = def.contradiction.every((k) => notes.some((n) => n.includes(k)));
  if (hasBoth && !b.deduced) {
    // 明说是哪两条：玩家读到的是几条一闪而过的 toast，不点名等于让他猜
    state.prompt = "E · 钉在一起";
    if (input.interact) {
      b.deduced = true;
      state.flags.deduced = true;
      state.toast = { text: def.deduction, t: 6 };
    }
    return;
  }
  state.prompt = "E · 交给高传宝";
  if (input.interact) AdvanceBeat(state);
}

// 注定失败的按住：进度只涨到 cap 就再也上不去，时间一到必然松脱。
// 手感上要让玩家真的在"使劲"——按住时涨，但涨到接近上限就开始往回掉，
// 松手掉得更快。玩家不会怀疑自己没按对，只会知道抓不住。
function StepDoomedHold(state, def, input, dt) {
  const b = state.beat;
  if (b.grip === undefined) {
    b.grip = 0; b.t = 0; b.drag = 0;
    state.toast = null;          // 上一拍的提示别赖在这一场上
    def.onStart?.(state);
  }
  b.t += dt;
  // 头顶的探杆：周期一次比一次密，逼你一次次停手。土清不完的真正原因是
  // 时间不在你这边，不是你手慢
  if (def.probe) {
    const k = Math.min(1, b.t / def.duration);
    const cycle = def.probe.from + (def.probe.to - def.probe.from) * k;
    b.quakeActive = (b.t % cycle) > cycle - 1.15;
  }
  const pressing = input.interactHeld || input.interact;
  const held = pressing && !b.quakeActive;
  if (b.quakeActive) {
    // 探杆下来还硬刨，声音会把人招来——不停手是要付代价的，
    // 否则"必须停手"就成了一句空话，玩家迟早会发现按着不放毫无区别
    if (pressing) {
      b.grip = Math.max(0, b.grip - 1.4 * dt);
      state.detection.level = Math.min(1, state.detection.level + 0.5 * dt);
    }
    b.grip = Math.max(0, b.grip - 0.5 * dt);
  } else if (held) {
    // 越接近上限，往回掉的分量越重
    const strain = Math.max(0, b.grip - def.cap * 0.55) * 1.35;
    b.grip = Math.min(def.cap, b.grip + (0.55 - strain) * dt);
  } else {
    b.grip = Math.max(0, b.grip - 0.75 * dt);
  }
  // 不给百分比：一个封了顶、永远到不了 100 的进度条，只会让玩家以为是自己手慢。
  // 用力到什么程度由画面说——妹妹被拽开的距离、土面刨下去又塌回来。
  state.prompt = b.quakeActive ? "…探杆就在头顶。停手，别出声" : def.prompt;
  state.promptFill = b.quakeActive ? 0 : b.grip / def.cap;

  // 让进度条不只是个数字：抓得越牢，她被拖走得越慢——但一直在走。
  // 手里那点距离就是进度条本身。
  if (def.pull) {
    const a = FindActor(state, def.pull.actor);
    if (a) {
      b.drag = Math.min(1, b.drag + (1 - b.grip * 0.75) * dt / def.duration);
      a.x = def.pull.from + (def.pull.to - def.pull.from) * b.drag;
      a.heading = def.pull.to >= def.pull.from ? 1 : -1;
    }
  }
  if (b.t >= def.duration) {
    def.onFail?.(state);
    state.toast = { text: def.failToast || "抓不住。", t: 3.5 };
    AdvanceBeat(state);
  }
}

function StepRescueLoop(state, def, input, dt) {
  const trapped = state.actors.filter((a) => a.pocket && a.visible && !a.evacuated);
  // 手边有几个人，一趟就能带几个
  const leadCap = state.flags.route === "ground" ? 1 : 3;

  // 探杆：预兆→落定→宽限
  // 代价只留一项：手边人少、一趟只能带一个（见 SpawnRescueSquad）。
  // 探杆周期不再跟着变——三项一起惩罚，选地面就纯粹是受罪。
  const cycle = 9.5;
  state.rescue.quakeT += dt;
  const phase = state.rescue.quakeT % cycle;
  state.beat.quakeWarn = phase > cycle - 2.9;
  state.beat.quakeActive = phase > cycle - 2.2;
  const graceOver = phase > cycle - 1.8;
  if (state.beat.quakeWarn && !state.beat.quakeActive) {
    state.prompt = "…头顶的土簌簌往下掉";
  }
  if (state.beat.quakeActive) {
    state.prompt = "！探杆就在头顶——站住，别出声";
    if (Math.abs(input.moveX) > 0.1 && graceOver) {
      const followers = trapped.filter((a) => a.following);
      if (followers.length) {
        for (const a of followers) {
          a.following = false;
          a.cineTarget = { x: TF[a.pocket].x };
          a.cineSpeed = 2.8;
        }
        state.toast = { text: "头顶的探杆停住了。乡亲们吓得缩回了旁洞。", t: 4 };
        state.rescue.quakeT = 0;
      }
    }
  }

  if (!state.rescue.dialogueShown.has("pocketB")) {
    const nearB = trapped.some((a) => a.pocket === "pocketB" && Math.abs(a.x - state.player.x) < 3);
    if (nearB) {
      state.rescue.dialogueShown.add("pocketB");
      StartMicroCine(state, [
        // 特意沿用第三章高传宝认出他时的景别（3.4 / 3.2）：同一个构图出现两次——
        // 头一回他是被认出来的孩子，这一回他是被指望的那个人
        { stage: "扶着民兵的老人抬起头，借着灯光认出了他。", d: 3.2, cam: { kind: "shot", x: 92, y: UNDER_Y + 1.3, dist: 5 } },
        { who: "老人", say: "梁家的柱子？你妹妹呢？", d: 3.0, cam: { kind: "ots", subject: "trapB1", other: "player", dist: 3.4 } },
        { who: "柱子", say: "送出去了。", d: 2.6, cam: { kind: "ots", subject: "player", other: "trapB1", dist: 3.2 } },
        { stage: "老人松了一口气。", d: 2.4, cam: { kind: "ots", subject: "trapB1", other: "player", dist: 3.4 } },
      ]);
      return;
    }
  }
  const followingNow = trapped.filter((a) => a.following).length;
  const room = leadCap - followingNow;
  const loose = trapped.find((a) => !a.following && !a.cineTarget && Math.abs(a.x - state.player.x) < 2.6);
  if (loose) {
    if (!state.beat.quakeActive && !state.beat.quakeWarn) {
      state.prompt = room > 0 ? "E · 带他们走" : "手上顾不过来了——先把这个送出去";
    }
    if (input.interact && room > 0) {
      let left = room;
      for (const a of trapped) {
        if (left <= 0) break;
        if (!a.following && Math.abs(a.x - state.player.x) < 3.4) {
          a.following = true; a.cineTarget = null; left -= 1;
        }
      }
    }
  }
  for (const a of trapped) {
    if (a.following && InZone(a.x, a.level, TF.fieldEnt)) {
      a.evacuated = true; a.following = false; a.visible = false;
      state.rescue.delivered.add(a.id);
    }
  }
  const left = state.actors.filter((a) => a.pocket && !a.evacuated);
  if (left.length === 0) AdvanceBeat(state);
}

// ---------------------------------------------------------------------------
// HUD / 测试辅助
// ---------------------------------------------------------------------------
export function GetObjective(state) {
  if (state.phase !== "playing") return null;
  return CurrentBeatDef(state)?.objective || null;
}

export function GetHint(state) {
  if (state.phase !== "playing") return null;
  return CurrentBeatDef(state)?.hint || null;
}

export function GetBeatTarget(state) {
  const def = CurrentBeatDef(state);
  if (!def) return null;
  const p = state.player;
  const withLevel = (zone, action = "walk") => ({ action, x: zone.x, level: zone.level || "surface" });
  switch (def.kind) {
    case "cinematic": return { action: "advance" };
    case "choice": return { action: "choice" };
    case "goto": return withLevel(def.zone);
    case "gotoSeq": {
      const s = def.spots[state.beat.spotIndex];
      return s ? withLevel(s) : null;
    }
    case "collect": {
      if (p.carry) return { action: "interactAt", x: def.deliver.x, level: def.deliver.level || "surface" };
      const it = state.beat.itemStates.find((x) => !x.carried && !x.delivered);
      return it ? { action: "interactAt", x: it.x, level: "surface" }
        : { action: "interactAt", x: def.deliver.x, level: def.deliver.level || "surface" };
    }
    case "escort": {
      const f = FindActor(state, def.follower);
      if (f && !f.following && f.visible) return { action: "interactAt", x: f.x, level: f.level };
      const dest = def.zone || def.dest;
      return withLevel(dest);
    }
    case "leadFollow": {
      const leader = FindActor(state, def.leader);
      return leader ? { action: "walk", x: leader.x, level: leader.level } : null;
    }
    case "coverRun": {
      // 跟着娘走到她所在的掩体；她不动的时候就贴着她站定
      const leader = FindActor(state, def.leader);
      const hereX = def.covers[state.beat.coverIndex ?? 0];
      return { action: "walk", x: leader ? leader.x : hereX, level: "surface" };
    }
    case "lead": {
      const group = state.actors.filter((a) => a.group === def.group && a.visible);
      const looseA = group.find((a) => !a.following);
      if (looseA) return { action: "interactAt", x: looseA.x, level: looseA.level };
      return withLevel(def.dest);
    }
    case "observe": {
      const s = def.spots[state.beat.spotIndex];
      return s ? { action: "crouchAt", x: s.x, level: s.level || "surface" } : null;
    }
    case "hold": return { action: "holdAt", x: def.zone.x, level: def.zone.level || "surface" };
    // 自动通关只要一直按住就行——反正按住也留不住她
    case "doomedHold": return { action: "holdAt", x: state.player.x, level: state.player.level };
    case "mapBoard": return { action: "interactAt", x: def.zone.x, level: def.zone.level || "surface" };
    // 自动通关：按住 E 同时往前推就行
    case "scribe": return { action: "scribeAt", x: def.zone.x, level: "surface" };
    case "actSeq": {
      const st = def.steps[state.beat.stepIndex || 0];
      if (!st) return null;
      return { action: st.walk ? "walk" : "interactAt", x: st.x, level: st.level || "surface" };
    }
    case "buildSpots": {
      const i = state.beat.spotDone.findIndex((d) => !d);
      // 工位上有没捡的东西：先按一下 E 拾起来，再按住施工
      if (i >= 0 && def.spots[i].pickup && !state.beat.pickedUp?.[i]) {
        return { action: "interactAt", x: def.spots[i].zone.x, level: def.spots[i].zone.level || "under" };
      }
      if (i < 0) return null;
      const z = def.spots[i].zone;
      return { action: "holdAt", x: z.x, level: z.level || "surface" };
    }
    case "digSeq": {
      const keys = ["collapse1", "collapse2"];
      const key = keys[state.beat.digIndex];
      if (!key) return null;
      const c = state.collapses[key];
      if (def.shore && !c.shored) {
        if (p.item?.id === "beam") return { action: "interactAt", x: TF[key].x, level: "under" };
        return { action: "interactAt", x: def.shore[key].beamX, level: "under" };
      }
      return { action: "holdAt", x: TF[key].x, level: "under", pauseOnQuake: true };
    }
    case "plane": {
      // 自动通关：站到工位上，按住 E 一趟一趟地推（到头了掉头拖回来）
      return {
        action: "planeAt", x: def.zone.x - 0.55, level: "surface",
        back: !!state.planing?.returning,
      };
    }
    case "chain": {
      const st = def.steps[state.beat.stepIndex || 0];
      if (!st) return null;
      switch (st.type) {
        case "pickup": return { action: "interactAt", x: st.x, level: st.level || "surface" };
        case "drop": return { action: "interactAt", x: st.zone.x, level: st.zone.level || "surface" };
        case "pickupGround": {
          const gx = state.flags[st.flagX];
          return typeof gx === "number" ? { action: "interactAt", x: gx, level: "surface" } : null;
        }
        case "use": return { action: st.hold ? "holdAt" : "interactAt", x: st.zone.x, level: st.zone.level || "surface" };
        case "throwHit":
          if (!p.item) return { action: "interactAt", x: st.pickupX, level: "surface" };
          return { action: "throwAt", x: st.target.x - 6, level: "surface", face: 1 };
        case "talk": {
          const a = FindActor(state, st.actor);
          return a ? { action: "interactAt", x: a.x, level: a.level || "surface" } : null;
        }
        case "push": return { action: "pushAt", x: state.cart ? state.cart.x : st.from, dir: st.dir };
        case "goto": return { action: "walk", x: st.zone.x, level: st.zone.level || "surface" };
        case "winch": {
          const w = state.beat.winch;
          if (w && !w.hooked) return { action: "interactAt", x: st.zone.x, level: st.zone.level || "surface" };
          return { action: "winchAt", x: st.zone.x, level: st.zone.level || "surface" };
        }
        default: return null;
      }
    }
    case "cartRide":
      return { action: "walk", x: state.cart ? state.cart.x : def.from, level: "surface" };
    case "floodRescue": {
      const pool = state.actors.filter((a) => a.kind === "villager" && a.visible && !a.evacuated);
      const loose = pool.find((a) => !a.following);
      if (loose) return { action: "interactAt", x: loose.x, level: "under" };
      if (pool.length) return { action: "walk", x: (def.dest || TV.entW).x, level: "under" };
      return null;
    }
    case "douseLamps": {
      const lit = (state.lamps || []).filter((l) => l.lit);
      if (lit.length <= 1) {
        // 最后一盏在顺子手里：走到他跟前接过来
        const shunzi = FindActor(state, "shunzi");
        if (shunzi && shunzi.visible) return { action: "interactAt", x: shunzi.x, level: "under" };
        return null;
      }
      return { action: "interactAt", x: lit[0].x, level: "under" };
    }
    case "smokeEscape": {
      const dest = def.dest || TV.entW;
      const pool = state.actors.filter((a) => a.kind === "villager" && a.visible && !a.evacuated && !a.scripted
        && !(def.lossScript && a.id === "shunzi"));
      const loose = pool.find((a) => !a.following);
      if (loose) return { action: "interactAt", x: loose.x, level: "under" };
      if (pool.some((a) => a.following)) return { action: "walk", x: dest.x, level: "under" };
      return null;
    }
    case "rescueLoop": {
      const anyFollowing = state.actors.some((a) => a.pocket && a.visible && !a.evacuated && a.following);
      if (anyFollowing) return { action: "walk", x: TF.fieldEnt.x, level: "under" };
      const loose = state.actors.find((a) => a.pocket && a.visible && !a.evacuated && !a.following);
      if (loose) return { action: "interactAt", x: loose.x, level: "under" };
      return null;
    }
    default: return null;
  }
}

// ---------------------------------------------------------------------------
// 调试跳转：直接落到任意一章的任意一幕
//
// 前序各幕不真跑，只把它们「结算」掉：过场逐行触发 on()（人该进场就进场），
// 走位一次落位，玩法段按 kind 补上它真正改过的那几个 flag。做不到与正常
// 流程逐帧一致，但目标幕开场时该在的人、该建好的工事、该选过的分支都在。
// ---------------------------------------------------------------------------
function BeatLabel(def) {
  if (def.objective) return def.objective;
  if (def.kind === "cinematic") {
    const first = (def.lines || []).find((l) => l.stage || l.say);
    if (first) return first.stage || `${first.who || ""}：${first.say}`;
    return "过场";
  }
  if (def.kind === "choice") return def.prompt || "抉择";
  return def.prompt || def.id;
}

/** 某一章的分幕清单（调试面板用） */
export function ChapterBeatList(chapterIndex) {
  const ch = CHAPTERS[chapterIndex];
  if (!ch) return [];
  return (SCRIPTS[ch.id] || []).map((def, index) => ({
    index, id: def.id, kind: def.kind, label: BeatLabel(def),
  }));
}

// 这一幕结束时玩家应该站在哪儿。跳幕时不把他挪过去的话，下一幕会用上一幕的
// 起点开场——最难看的一种是"目的地就在脚下"，escort 刚进就自动完成。
function SettleDest(def) {
  switch (def.kind) {
    case "goto": case "hold": case "mapBoard": case "scribe": case "plane": return def.zone;
    case "escort": case "lead": case "smokeEscape": case "floodRescue": return def.dest;
    case "leadFollow": return def.waypoints?.[def.waypoints.length - 1];
    case "coverRun": {
      const last = def.covers?.[def.covers.length - 1];
      return last === undefined ? null : { x: last, w: 5 };
    }
    case "gotoSeq": case "observe": return def.spots?.[def.spots.length - 1];
    case "buildSpots": return def.spots?.[def.spots.length - 1]?.zone;
    case "digSeq": return def.spots?.[def.spots.length - 1];
    case "actSeq": {
      const s = def.steps?.[def.steps.length - 1];
      return s ? { x: s.x, level: s.level } : null;
    }
    case "chain": {
      // 链的落点是最后一步动手的地方
      const s = def.steps?.[def.steps.length - 1];
      if (!s) return null;
      if (s.zone) return s.zone;
      if (s.x !== undefined) return { x: s.x, level: s.level };
      if (s.target) return { x: s.target.x, level: "surface" };
      return null;
    }
    case "cartRide": return { x: def.to, level: "surface" };
    default: return null;
  }
}

function SettleBeat(state, def) {
  const dest = SettleDest(def);
  if (dest && dest.x !== undefined) {
    state.player.x = dest.x;
    if (dest.level) state.player.level = dest.level;
  }
  switch (def.kind) {
    case "cinematic": {
      const lines = state.beatLines || def.lines || [];
      for (let i = Math.max(0, state.beat.lineIndex); i < lines.length; i += 1) lines[i].on?.(state);
      // 让 cineTarget 一次走到位（大步长空转，而不是把人瞬移过去——
      // cineVanish 这类到点才触发的效果还得照常发生）
      for (let i = 0; i < 300; i += 1) StepCineActors(state, 0.25);
      break;
    }
    case "buildSpots":
      for (const s of def.spots) {
        if (s.zone === TV.hiddenSpot) state.flags.hiddenBuilt = true;
        if (s.zone === TV.trapSpot) state.flags.trapBuilt = true;
      }
      break;
    case "choice":
      state.flags.route = def.options?.[0]?.key || "tunnel";
      state.beat.choiceMade = state.flags.route;
      break;
    case "observe":
    case "gotoSeq":
      for (const n of def.notes || []) if (n) state.flags.notesSeen.push(n);
      break;
    case "mapBoard":
      state.flags.deduced = true;
      break;
    // 跳过一条链，就等于这条链上每一步都做过了：旗标要落、口信要入账
    // （第六章的推理要用），手里那格清空——东西都已经用出去了。
    case "chain":
      for (const st of def.steps || []) {
        if (st.noteAdd) state.flags.notesSeen.push(st.noteAdd);
        st.effect?.(state);
      }
      // drop/pickupGround 这对步骤在结算里相互抵消：东西最后不在地上
      for (const st of def.steps || []) if (st.type === "drop") state.flags[st.storeIn] = null;
      state.player.item = null;
      break;
    case "cartRide":
      state.cart = { x: def.to };
      break;
    default:
      break;
  }
}

/**
 * 跳到 chapterIndex 章的 beatIndex 幕，直接进入 playing（不放章节卡）。
 * 返回落地的 beat id。
 */
export function DebugJump(state, chapterIndex, beatIndex = 0) {
  const ci = Math.max(0, Math.min(chapterIndex, CHAPTERS.length - 1));
  // 先把前面各章整章结算一遍。情报、旗标、抉择是跨章累积的——第六章门板上
  // 要对上的那两条，一条来自第三章问乡亲，一条来自第六章观察；只结算本章的话
  // 跳过去永远凑不齐，"自己推出来"那一支在调试里根本走不到。
  for (let c = 0; c < ci; c += 1) {
    StartChapter(state, c);
    state.phase = "playing";
    const past = SCRIPTS[CHAPTERS[c].id];
    let g = 0;
    while (state.beatIndex < past.length && g < 400) {
      g += 1;
      const def = CurrentBeatDef(state);
      if (!def) break;
      SettleBeat(state, def);
      AdvanceBeat(state);
    }
  }
  StartChapter(state, ci);
  state.phase = "playing";
  const script = CurrentScript(state);
  const target = Math.max(0, Math.min(beatIndex, script.length - 1));
  let guard = 0;
  while (state.beatIndex < target && guard < 400) {
    guard += 1;
    const def = CurrentBeatDef(state);
    if (!def) break;
    SettleBeat(state, def);
    AdvanceBeat(state);
  }
  state.caption = null;
  state.toast = null;
  state.prompt = null;
  state.promptFill = null;
  state.scribe = null;
  state.bubbleFlash = null;
  state.spotFlash = null;
  state.pip = null;
  state.detection = { level: 0, spotter: null };
  // 结算过程里可能留下没走完的走位指令与一次性姿势，别让它们接管玩家刚接手的这一幕
  for (const a of state.actors) { a.cineTarget = null; a.cineSpeed = undefined; }
  state.player.cineWalk = null;
  ClearPoses(state);
  return CurrentBeatDef(state)?.id || null;
}
