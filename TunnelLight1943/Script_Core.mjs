// 《地道里的光》 —— 核心逻辑层（横版 2.5D，参考《勇敢的心：世界大战》）。
// 剧本来源：Notion《地道里的光》剧本大纲 + 关卡设计（八章结构）。
// 设计三原则：每关一个小人物目标；用行动而非台词表现成长；目标是保护群众、保存力量，而不是消灭敌人。
// 空间语法：x 为横向米数，level 为 surface（地表 y=0）/ under（地道 y=-3.6）。
// 地道场景是「剖面视角」：地表与地下同屏，烟、探杆、转移全部在一维横轴上展开。

export const GAME_VERSION = "0.2.0";

export const SURFACE_Y = 0;
export const UNDER_Y = -3.6;

// ---------------------------------------------------------------------------
// 章节元数据
// ---------------------------------------------------------------------------
export const CHAPTERS = [
  { id: "c1", num: "第一章", title: "门框上的刻痕", year: "1942 · 华北敌后 · 梁家村", scene: "village", light: "day" },
  { id: "c2", num: "第二章", title: "第一次失去", year: "1943 · 春 · 梁家村", scene: "village", light: "night" },
  { id: "c3", num: "第三章", title: "寻找妹妹", year: "1943 · 据点外的庄稼地", scene: "fields", light: "night" },
  { id: "c4", num: "第四章", title: "地道里的第一次光", year: "1943 · 高家庄地道", scene: "tunnelVillage", light: "tunnel" },
  { id: "c5", num: "第五章", title: "反击地道", year: "1943 · 夏 · 高家庄地道", scene: "tunnelVillage", light: "tunnel" },
  { id: "c6", num: "第六章", title: "敌人的陷阱", year: "1943 · 押送前夜", scene: "fields", light: "night" },
  { id: "c7", num: "第七章", title: "地道里的光", year: "1943 · 据点地道", scene: "tunnelFort", light: "dark" },
  { id: "c8", num: "第八章", title: "回家的路", year: "一个月后 · 梁家村", scene: "village", light: "dawn" },
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
      { id: "homeHouse", kind: "house", x: 30, w: 9.5, h: 3.6, name: "柱子家", burnable: true },
      { id: "houseB", kind: "house", x: 62, w: 8.5, h: 3.3 },
      { id: "houseC", kind: "house", x: 92, w: 9, h: 3.4, burnable: true },
      { id: "houseD", kind: "house", x: 148, w: 8, h: 3.2 },
      { id: "doorframe", kind: "doorframe", x: 34, name: "门框" },
      { id: "workbench", kind: "bench", x: 40.5, name: "工作台" },
      { id: "stool", kind: "stool", x: 32, name: "旧木凳" },
      { id: "yardWallE", kind: "wallSeg", x: 47, w: 1, h: 1.8 },
      { id: "cellarMouth", kind: "hatch", x: 27, name: "地窖口" },
      { id: "well", kind: "well", x: 58, name: "水井" },
      { id: "millstone", kind: "millstone", x: 76, name: "磨盘" },
      { id: "woodpile", kind: "woodpile", x: 70, name: "木料堆" },
      { id: "bigTree", kind: "tree", x: 126, big: true, name: "老槐树" },
      { id: "gatePost", kind: "lamppost", x: 174, name: "村东口" },
    ],
    covers: [
      { id: "firewood", kind: "firewood", x: 30, w: 2.2 },
      { id: "hayA", kind: "haystack", x: 52, w: 3.2 },
      { id: "hayB", kind: "haystack", x: 68, w: 3.2 },
      { id: "hayC", kind: "haystack", x: 88, w: 3.2 },
      { id: "ruinWall", kind: "wallSeg", x: 107, w: 5, h: 1.5 },
      { id: "hayD", kind: "haystack", x: 132, w: 3.2 },
      { id: "hayE", kind: "haystack", x: 152, w: 3.2 },
    ],
    zones: {
      homeYard: { x: 37, w: 13, label: "家里的院子" },
      doorframe: { x: 34, w: 3, label: "门框" },
      workbench: { x: 40.5, w: 4, label: "工作台" },
      courtGate: { x: 47, w: 4, label: "院门口" },
      cellar: { x: 26, w: 7, level: "under", label: "地窖" },
      well: { x: 58, w: 5, label: "井台" },
      sisterTree: { x: 126, w: 6, label: "老槐树下" },
      eastExit: { x: 172, w: 7, label: "村东口" },
      woodpile: { x: 70, w: 6, label: "木料堆" },
    },
  },

  fields: {
    length: 200,
    walk: { surface: [3, 176], under: null }, // 据点围墙在 x≈176，过不去
    shafts: [],
    props: [
      { id: "ditch", kind: "ditch", x: 8, w: 14, name: "交通沟" },
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
    },
  },

  // 高家庄地道：剖面——地表在上，地道在下，东口进烟往西灌
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
    ],
    covers: [],
    zones: {
      entE: { x: 148, w: 6, level: "under", label: "东口" },
      entW: { x: 34, w: 6, level: "under", label: "西口" },
      chamberA: { x: 112, w: 11, level: "under", label: "藏人洞·甲" },
      chamberB: { x: 58, w: 11, level: "under", label: "藏人洞·乙" },
      trapSpot: { x: 112, w: 5, level: "under", label: "翻口" },
      bellSpot: { x: 142, w: 5, level: "under", label: "预警铃" },
      hiddenSpot: { x: 18, w: 7, level: "under", label: "新暗口" },
      behindTrap: { x: 104, w: 7, level: "under", label: "翻口后面" },
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
function LineDuration(line) {
  if (!VOICE_DUR) return line.d;
  const text = line.say || line.stage;
  if (!text) return line.d;
  const v = VOICE_DUR.get(VoiceLineId(line.say ? (line.who || "") : "", text));
  return v ? Math.max(line.d, v + 0.35) : line.d;
}

export const SCRIPTS = {
  c1: [
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
        { stage: "梁木匠把刨子放下，叫住了往外跑的儿子。", d: 3.4, cam: { kind: "shot", x: 43, y: 1.8, dist: 11 },
          on: (state) => {
            const father = FindActor(state, "father");
            // 放下刨子：手里空出来，同时工作台上多一件东西
            if (father) { father.carry = null; father.heading = 1; }
            // 被叫住：跑出去的脚步收住，转身走回门框
            state.player.cineWalk = { x: 39.4, speed: 1.7 };
          } },
        { stage: "他让柱子靠着门框站直，用墨斗线在门框上刻下一道线。", d: 4.0, cam: { kind: "insertCard", card: "carve" },
          on: (state) => {
            state.player.x = 39.2;
            state.player.cineWalk = null;
            state.player.heading = 1;
            const father = FindActor(state, "father");
            if (father) { father.cineTarget = { x: 40.4 }; father.cineSpeed = 1.2; father.heading = -1; }
          } },
        { who: "爹", say: "再过几年，这个家就靠你了。", d: 3.6, cam: { kind: "ots", subject: "father", other: "player", dist: 3.4 } },
        { stage: "柱子仰着头，不太懂。", d: 2.8, cam: { kind: "ots", subject: "player", other: "father", dist: 3.2 } },
        { stage: "他惦记着村东头那堆没搬完的木料。", d: 3.8, cam: { kind: "shot", x: 40, y: 1.8, dist: 12 },
          on: (state) => {
            // 心思已经在村东头了：眼睛先往那边去
            state.player.heading = 1;
            const father = FindActor(state, "father");
            if (father) { father.heading = -1; }
          } },
      ],
    },
    {
      kind: "collect", id: "c1_planks", objective: "帮爹把三根木料搬回工作台",
      items: [{ x: 69 }, { x: 71.5 }, { x: 73.5 }],
      deliver: V.workbench, carryLabel: "木料",
      hint: "走到木料旁按 E 扛起，送回院里工作台再按 E 放下",
    },
    {
      kind: "collect", id: "c1_water", objective: "帮娘从井台提一桶水回来",
      items: [{ x: 59 }],
      deliver: V.homeYard, carryLabel: "水桶",
      hint: "娘在灶间忙，水缸见了底",
    },
    {
      kind: "goto", id: "c1_findSister", zone: V.sisterTree, objective: "去老槐树下找妹妹回家吃饭",
      hint: "娘直起腰，朝老槐树的方向望了望",
    },
    {
      kind: "escort", id: "c1_sisterHome", follower: "sister", dest: V.homeYard,
      objective: "带妹妹回家", hint: "妹妹会跟着你走",
    },
    {
      kind: "cinematic", id: "c1_raid",
      lines: [
        { stage: "锣声。有人在村口喊：鬼子进村了——", d: 3.0, cam: { kind: "wide", x: 140, pan: -6 },
          on: (state) => {
            // 和第二章一个规矩：说到谁，谁就得在画面里。原先兵是过场演完才生成的，
            // 于是"鬼子进村了"这一句对着的是一个空村口
            SpawnRaidSoldiers(state);
            const r1 = FindActor(state, "raid1");
            const r2 = FindActor(state, "raid2");
            // 从村口往里走：镜头横摇跟着他们推进
            if (r1) { r1.x = 152; r1.heading = -1; r1.cineTarget = { x: 132 }; r1.cineSpeed = 2.0; }
            if (r2) { r2.x = 160; r2.heading = -1; r2.cineTarget = { x: 143 }; r2.cineSpeed = 1.8; }
          } },
        { stage: "爹把刨子塞进柴堆，转身走向院门。", d: 3.0, cam: { kind: "shot", x: 40, y: 1.8, dist: 10 },
          on: (state) => {
            const father = FindActor(state, "father");
            if (father) { father.cineTarget = { x: 47 }; father.cineSpeed = 1.5; }
          } },
        { who: "爹", say: "带妹妹进地窖。别出声。", d: 3.0, cam: { kind: "ots", subject: "father", other: "player", dist: 3.6 } },
      ],
      onDone: (state) => {
        // 兵在第一行就已经进场了，这里只把巡逻交还给常规逻辑
        for (const a of state.actors) if (IsEnemy(a)) a.cineTarget = null;
        state.stealthActive = true;
      },
    },
    {
      kind: "escort", id: "c1_hide", follower: "sister", dest: V.cellar, stealth: true,
      objective: "带妹妹躲进地窖", hint: "地窖口在屋西边，走到口上按 S 下去",
      resetHint: "被巡逻的鬼子看见了。再试一次——柱子还只是个孩子，跑不过刺刀。",
    },
    {
      kind: "cinematic", id: "c1_father",
      lines: [
        { stage: "地窖板的缝里，能看见院子。", d: 3.0, cam: { kind: "shot", x: 33, y: 0.9, dist: 8, slit: true },
          on: (state) => {
            const father = FindActor(state, "father");
            if (father) { father.x = 38; father.heading = 1; }
            const r1 = FindActor(state, "raid1");
            const r2 = FindActor(state, "raid2");
            if (r1) { r1.patrol = null; r1.cineTarget = { x: 36 }; r1.cineSpeed = 3; }
            if (r2) { r2.patrol = null; r2.cineTarget = { x: 40.5 }; r2.cineSpeed = 3; }
          } },
        { stage: "爹被两个兵按着跪在地上。他们问他八路把粮藏在哪。", d: 4.2, cam: { kind: "shot", x: 38, y: 0.9, dist: 7, slit: true } },
        { stage: "爹摇头。枪托砸下来。他又摇头。", d: 4.0, cam: { kind: "insert", x: 38, y: 1.0, dist: 3.2, slit: true } },
        { stage: "妹妹想哭。柱子把她的脸按进自己肩膀。", d: 3.8, cam: { kind: "close", on: "player", dist: 3.4 } },
        { stage: "爹被拖出院门的时候，回头看了一眼门框。", d: 4.2, cam: { kind: "shot", x: 42, y: 1.2, dist: 11, pan: 1.5 },
          on: (state) => {
            for (const id of ["father", "raid1", "raid2"]) {
              const a = FindActor(state, id);
              if (a) { a.cineTarget = { x: 62 }; a.cineSpeed = 1.5; a.cineVanish = true; }
            }
          } },
        { stage: "那道刚刻下的线，还露着新茬。", d: 3.4, cam: { kind: "shot", x: 34, y: 1.5, dist: 5.5 } },
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
        { stage: "鬼子又来了。这回他们拿着名单，挨家找帮过八路的人。", d: 4.2, cam: { kind: "wide", x: 130, pan: -8 },
          on: (state) => { SpawnNightSweep(state); } },
        { stage: "前头挑灯笼带路的，是邻村据点里的翻译官。", d: 4.4, cam: { kind: "shot", x: 120, y: 1.6, dist: 9 },
          on: (state) => {
            const s1 = FindActor(state, "sweep1");
            if (s1) { s1.x = 124; s1.heading = -1; }
          } },
      ],
    },
    {
      kind: "leadFollow", id: "c2_mother", leader: "mother", follower: "sister",
      waypoints: [{ x: 60, w: 4 }, { x: 88, w: 4 }, { x: 118, w: 4 }],
      objective: "跟紧娘，别出声", hint: "娘走你就走，娘停你就蹲下（C 蹲低）",
      resetHint: "灯笼扫过来的时候要蹲进影子里。",
    },
    {
      kind: "cinematic", id: "c2_decoy",
      lines: [
        { stage: "前面巷口站着人。走不过去了。", d: 3.0, cam: { kind: "shot", x: 136, y: 1.4, dist: 9 },
          on: (state) => {
            const s3 = FindActor(state, "sweep3");
            if (s3) { s3.cineTarget = { x: 138 }; s3.cineSpeed = 1.4; }
          } },
        { stage: "娘把妹妹的手放进柱子手里，又把两个孩子往磨盘后面按了按。", d: 4.4, cam: { kind: "insert", x: 118, y: 1.0, dist: 2.8 } },
        { stage: "她没说话。只朝村东口努了努嘴。", d: 3.4, cam: { kind: "ots", subject: "mother", other: "player", dist: 3.4 } },
        { stage: "然后她站起来，朝反方向走去，故意踢翻了一只水瓮。", d: 4.2, cam: { kind: "shot", x: 112, y: 1.6, dist: 11, pan: -4 },
          on: (state) => {
            const mother = FindActor(state, "mother");
            if (mother) { mother.cineTarget = { x: 84 }; mother.cineSpeed = 2.3; }
          } },
        { stage: "灯笼、喊声、脚步，全都追着那声响去了。", d: 3.8, cam: { kind: "shot", x: 92, y: 1.8, dist: 15, pan: -3 },
          on: (state) => {
            for (const id of ["sweep1", "sweep2"]) {
              const s = FindActor(state, id);
              if (s) { s.cineTarget = { x: 78 }; s.cineSpeed = 2.6; }
            }
          } },
        // 娘的结局不在台词里：镜头不动，只看几盏灯往一处汇、重叠、停住
        { stage: "", d: 4.4, cam: { kind: "shot", x: 76, y: 1.5, dist: 11, trans: "dip" },
          on: (state) => {
            const mother = FindActor(state, "mother");
            if (mother) { mother.cineTarget = { x: 66 }; mother.cineSpeed = 1.9; }
            for (const [id, tx] of [["sweep1", 70], ["sweep2", 74], ["sweep3", 78]]) {
              const s = FindActor(state, id);
              if (s) { s.visible = true; s.lantern = true; s.cineTarget = { x: tx }; s.cineSpeed = 2.2; }
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
      kind: "escort", id: "c2_escape", follower: "sister", dest: V.eastExit, stealth: true,
      objective: "带妹妹去村东口", hint: "沿着草垛和断墙的影子走",
      resetHint: "妹妹跑不快。等巡逻走远了再动。",
      midToast: { zone: { x: 140, w: 10 }, text: "路过的院里在拖人。柱子把妹妹的脸按在自己胸口，贴着墙根走了过去。" },
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
      objective: "别松手", hint: "按住 E",
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
        { stage: "他扑上去，被枪托砸在背上。", d: 3.4, cam: { kind: "close", on: "player", dist: 3.6 },
          on: (state) => { state.player.cineWalk = { x: state.player.x + 1.4, speed: 2.2 }; } },
        { stage: "邻居七叔从沟里死死抱住他，捂着他的嘴，把他拖进高粱地。", d: 4.4, cam: { kind: "shot", x: 168, y: 1.0, dist: 8 },
          on: (state) => {
            const sister = FindActor(state, "sister");
            if (sister) sister.visible = false;
            const a2 = FindActor(state, "ambush2");
            if (a2) { a2.cineTarget = { x: 184 }; a2.cineVanish = true; }
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
      onDone: (state) => { SpawnFortPatrols(state, false); },
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
    },
    {
      kind: "gotoSeq", id: "c3_contacts", spots: [F.contactA, F.contactB],
      objective: "去问问地里的乡亲", hint: "乡亲们敢说话，但只敢小声说",
      notes: [
        "赶车的乡亲：『里头新关了十几个，有女娃。别靠南门，狗鼻子灵。』",
        "拾柴的大娘：『过几天要往县里押人。孩子，你一个人不行。』",
      ],
    },
    {
      kind: "goto", id: "c3_closer", zone: F.gate, stealth: true,
      objective: "趁换岗摸近南门，看清牢房方向", hint: "贴着墙根走，别进灯光",
      resetHint: "岗楼上的灯扫了过来。退回沟里，重新等换岗。",
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
        { stage: "高家庄的地道，是乡亲们一锹一锹挖出来的。", d: 3.6, cam: { kind: "wide", x: 90, y: -1.2 },
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
      objective: "把两位老人带到藏人洞·甲", hint: "走到老人身边按 E，他们会跟着你",
    },
    {
      kind: "lead", id: "c4_hideB", group: "family", dest: TV.chamberB,
      objective: "把大嫂和孩子带到藏人洞·乙", hint: "孩子走得慢，别落下他们",
    },
    {
      kind: "hold", id: "c4_shore", zone: TV.entW, holdTime: 3,
      objective: "西口的顶木松了，把它撑牢", hint: "在西口按住 E，柱子会用上木匠的手艺",
      note: "木头咬住了。他松开手，顶木没有再响。",
    },
    {
      kind: "hold", id: "c4_listen", zone: TV.entE, holdTime: 4,
      objective: "贴在东口下面，听听上面的动静", hint: "按住 E，柱子会把听到的记在心里",
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
      lamps: [148, 128, 112, 92, 74, 58, 40],
      objective: "把地道里的灯一盏盏吹灭",
      hint: "走到灯边按 E。留最后一盏在自己手里",
      note: "最后一盏灯攥在柱子手里。地道一下子只剩这一点光。",
    },
    {
      kind: "smokeEscape", id: "c4_smoke", dest: TV.entW, lossScript: true,
      objective: "赶在烟前头，把人从西口转移出去",
      hint: "烟往西灌，先带东边的人。E 让一群人跟上，到西口他们会自己爬出去",
      resetHint: "烟呛倒了人。民兵把大家拖回洞室，重新来。",
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
      hint: "水从东边漫过来，低处先没。E 招呼人跟上",
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
      ],
    },
    {
      kind: "buildSpots", id: "c5_build",
      spots: [
        // 翻口是真实冀中地道的三防正解：把这一段挖成 U 形的弯，弯里存住水，
        // 就是一道水封，烟和水都过不去。人猫着腰从水里钻过去。
        { zone: TV.trapSpot, label: "挖翻口", holdTime: 3, note: "这一段挖成个下沉的弯，弯里存住水。烟推到这儿，过不去。" },
        { zone: TV.hiddenSpot, label: "挖新暗口", holdTime: 3, note: "新口开在西头第三家的猪圈底下。挖出来的土，天不亮就摊进了麦地。" },
        { zone: TV.bellSpot, label: "拴预警铃", holdTime: 3, note: "东口一响，全村先知道。" },
      ],
      objective: "完成三处改造：翻口、新暗口、预警铃",
      hint: "到标记处按住 E 施工",
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
      hint: "按住 E 清土。探杆到头顶上的时候必须停手",
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
        "牢房外多了一个游动哨，绕到北墙要一袋烟的工夫。",
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
      hint: "柱子用木匠画线的手，把据点画在了门板上。按 E 一条条钉上去",
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
      objective: "掏开虚土，把最后十几步挖通到牢房地沿", hint: "按住 E 清土。头顶有动静时停一停（提示会变红）",
      quakeInterval: 9,
    },
    {
      kind: "goto", id: "c7_reach", zone: TF.cellHatch, objective: "摸到牢房地沿",
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
        { stage: "妹妹看着哥哥的眼睛，慢慢松开了手，又慢慢把额头抵在他肩上。", d: 5.0, cam: { kind: "ots", subject: "sister", other: "player", dist: 3.0 } },
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
      hint: "灯照多远，路就有多远。E 让乡亲跟上，送到地里入口再回去",
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
        { stage: "高家庄的地道重新修整。被发现的口子封死了，新口挖在另一片庄稼地旁。", d: 4.6, cam: { kind: "wide", x: 90 } },
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
        { stage: "妹妹走过去，伸手摸了一下爹刻的那道线。", d: 4.0, cam: { kind: "shot", x: 34, y: 1.4, dist: 5.5 },
          on: (state) => {
            const sister = FindActor(state, "sister");
            if (sister) { sister.following = false; sister.cineTarget = { x: 33.2 }; sister.cineSpeed = 1.1; }
          } },
        { stage: "她的手停了一会儿。", d: 3.2, cam: { kind: "shot", x: 34, y: 1.4, dist: 4.8 } },
        { stage: "那道线，比她记忆里高了许多。", d: 3.8, cam: { kind: "shot", x: 34, y: 1.4, dist: 4.4 } },
      ],
    },
    {
      kind: "hold", id: "c8_carve", zone: V.doorframe, holdTime: 2.5,
      objective: "在旧刻痕旁，刻下一道新的线", hint: "按住 E",
      note: "刻完，柱子用拇指抹平了木屑。",
      onDone: (state) => { state.flags.carved = true; },
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

function SpawnNightSweep(state) {
  state.actors = state.actors.filter((a) => !IsEnemy(a));
  state.actors.push(
    // 带路的翻译官挑着灯笼在前，两个兵在后
    MakeActor("sweep1", "puppet", 74, { patrol: [70, 108], speed: 1.5, lantern: true }),
    MakeActor("sweep2", "soldier", 100, { patrol: [92, 138], speed: 1.4, lantern: true }),
    MakeActor("sweep3", "soldier", 150, { patrol: [144, 158], speed: 1.15, lantern: true }),
  );
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
  // 烟从东口（x=148）向西推进
  state.smoke = { frontX: 150, speed: 0.85, trapAt: null, trapHeld: false, active: true, sourceX: 148 };
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
    collapse1: { cleared: false, progress: 0 },
    collapse2: { cleared: false, progress: 0 },
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
    player: { x: 0, level: "surface", heading: 1, crouch: false, carry: null, lamp: false, hidden: false, climbT: 0, cineWalk: null },
    actors: [],
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
    flags: { route: null, resets: 0, ruined: false, carved: false, hiddenBuilt: false, trapBuilt: false, entWBlocked: false, deduced: false, notesSeen: [] },
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
  state.player.lamp = false;
  state.player.crouch = false;
  state.player.climbT = 0;
  state.player.cineWalk = null;
  state.player.level = "surface";
  if (index !== 7) state.flags.ruined = false;
  if (index < 4) { state.flags.hiddenBuilt = false; state.flags.entWBlocked = false; }

  if (ch.id === "c1") {
    state.player.x = 38;
    state.actors.push(
      MakeActor("father", "father", 41, { label: "爹" }),
      MakeActor("mother", "family", 36, { label: "娘" }),
      MakeActor("sister", "sister", 126, { label: "妹妹" }),
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
  const def = CurrentBeatDef(state);
  def?.onDone?.(state);
  state.beatIndex += 1;
  state.caption = null;
  state.prompt = null;
  if (state.beatIndex >= CurrentScript(state).length) EndChapter(state);
  else EnterBeat(state);
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
    a.heading = dir;
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
  if (input.advance || mc.t >= LineDuration(line)) {
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
  if (input.advance || state.beat.lineT >= LineDuration(line)) {
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
  if (state.phase === "gameEnd") return;
  state.time += dt;
  if (state.toast && (state.toast.t -= dt) <= 0) state.toast = null;

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

  MovePlayer(state, input, dt);
  StepFollowers(state, dt);
  StepSoldiers(state, dt);
  StepCineActors(state, dt);
  if (state.smoke?.active) StepSmoke(state, dt);

  switch (def.kind) {
    case "goto": StepGoto(state, def, input); break;
    case "gotoSeq": StepGotoSeq(state, def, input); break;
    case "collect": StepCollect(state, def, input); break;
    case "escort": StepEscort(state, def, input); break;
    case "leadFollow": StepLeadFollow(state, def, dt); break;
    case "lead": StepLead(state, def, input); break;
    case "observe": StepObserve(state, def, dt); break;
    case "hold": StepHold(state, def, input, dt); break;
    case "doomedHold": StepDoomedHold(state, def, input, dt); break;
    case "mapBoard": StepMapBoard(state, def, input); break;
    case "actSeq": StepActSeq(state, def, input); break;
    case "buildSpots": StepBuildSpots(state, def, input, dt); break;
    case "digSeq": StepDigSeq(state, def, input, dt); break;
    case "douseLamps": StepDouseLamps(state, def, input); break;
    case "floodRescue": StepFloodRescue(state, def, input); break;
    case "smokeEscape": StepSmokeEscape(state, def, input); break;
    case "rescueLoop": StepRescueLoop(state, def, input, dt); break;
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

  // 地道走廊净高只有一米五，人必须猫着腰；藏人洞与旁洞才直得起腰
  const inTunnel = (env === "tunnelVillage" || env === "tunnelFort") && p.level === "under";
  let forcedCrouch = false;
  if (inTunnel) {
    // 坑道大体能直腰；只有隔一段的"矮腰"处要猫着过（按位置周期，稳定可预期）
    const roomy = scene.props.some((pr) => (pr.kind === "chamber" || pr.kind === "pocket")
      && Math.abs(p.x - pr.x) < ((pr.w || 5.6) / 2 + 1.5));
    const lowSpot = !roomy && (Math.sin(p.x * 0.21) > 0.55);
    forcedCrouch = lowSpot;
  }
  p.crouch = forcedCrouch || !!input.crouch;
  p.forcedCrouch = forcedCrouch;
  let speed = p.crouch ? 2.1 : 4.2;
  if (def?.slow) speed = 1.8;
  if (p.carry) speed = 3.0;

  if (Math.abs(input.moveX) > 0.05) {
    p.x += Math.sign(input.moveX) * speed * dt;
    p.heading = Math.sign(input.moveX);
  }

  // 爬梯口：W 上 / S 下
  if (Math.abs(input.climb || 0) > 0.05) {
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
  p.hidden = false;
  if (p.crouch) {
    for (const c of scene.covers) {
      if (Math.abs(p.x - c.x) < c.w / 2 + 0.9) { p.hidden = true; break; }
    }
  }
}

function StepFollowers(state, dt) {
  const p = state.player;
  for (const a of state.actors) {
    if (!a.following || !a.visible) continue;
    a.level = p.level;
    const targetX = p.x - p.heading * 1.3;
    const d = Math.abs(a.x - targetX);
    if (d > 0.25) {
      const speed = Math.min((a.slow ? 2.6 : 3.8), d * 3);
      const dir = Math.sign(targetX - a.x);
      a.x += dir * speed * dt;
      a.heading = dir;
    }
  }
}

function StepSoldiers(state, dt) {
  for (const a of state.actors) {
    if (!IsEnemy(a) || !a.visible || !a.patrol || a.cineTarget) continue;
    if (a.patrolDir === undefined) a.patrolDir = 1;
    a.x += a.patrolDir * a.speed * dt;
    if (a.x >= a.patrol[1]) { a.x = a.patrol[1]; a.patrolDir = -1; }
    if (a.x <= a.patrol[0]) { a.x = a.patrol[0]; a.patrolDir = 1; }
    a.heading = a.patrolDir;
  }
}

function IsEnemy(a) { return a.kind === "soldier" || a.kind === "puppet"; }

const VISION_RANGE = 15;

export function SoldierSeesPlayer(scene, soldier, player) {
  if (player.hidden) return false;
  if ((soldier.level || "surface") !== player.level) return false;
  const dx = player.x - soldier.x;
  if (Math.sign(dx) !== Math.sign(soldier.heading || 1)) return Math.abs(dx) < 1.2;
  const range = player.crouch ? VISION_RANGE * 0.65 : VISION_RANGE;
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
  let seen = false;
  for (const a of state.actors) {
    if (!IsEnemy(a) || !a.visible) continue;
    if (SoldierSeesPlayer(scene, a, state.player)) { seen = true; state.detection.spotter = a.id; break; }
  }
  if (seen) state.detection.level = Math.min(1, state.detection.level + dt * 0.9);
  else state.detection.level = Math.max(0, state.detection.level - dt * 0.5);
  if (state.detection.level >= 1) {
    state.flags.resets += 1;
    RestoreSnapshot(state);
    state.toast = { text: def.resetHint || "被发现了。退回来，重新等机会。", t: 4 };
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
        state.prompt = `E · 扛起${def.carryLabel}`;
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
    state.prompt = `观察中… ${Math.min(100, Math.round(state.beat.holdProgress / def.watchTime * 100))}%`;
    if (state.beat.holdProgress >= def.watchTime) {
      if (def.notes?.[i]) { state.toast = { text: "柱子记下：" + def.notes[i], t: 5.5 }; state.flags.notesSeen.push(def.notes[i]); }
      state.beat.holdProgress = 0;
      state.beat.spotIndex += 1;
      if (state.beat.spotIndex >= def.spots.length) AdvanceBeat(state);
    }
  } else if (ZoneReached(state, spot)) {
    state.prompt = "C · 蹲下才能安心观察";
  } else {
    state.beat.holdProgress = 0;
  }
}

function StepHold(state, def, input, dt) {
  if (ZoneReached(state, def.zone)) {
    state.prompt = state.beat.holdProgress > 0
      ? `${def.objective}… ${Math.round(state.beat.holdProgress / def.holdTime * 100)}%`
      : (def.hint || "按住 E");
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
      state.prompt = `按住 E · ${s.label} ${Math.round(state.beat.spotProgress[i] / s.holdTime * 100)}%`;
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
  if (ZoneReached(state, zone)) {
    if (state.beat.quakeActive) {
      state.prompt = "！头顶有动静——停下，别出声";
      c.progress = Math.max(0, c.progress - dt * 0.3);
    } else {
      state.prompt = `按住 E · 清土 ${Math.round(c.progress / def.holdTime * 100)}%`;
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
  const remaining = state.lamps.filter((l) => l.lit);
  if (remaining.length <= 1) {
    // 留最后一盏：柱子把它提在手里
    for (const l of state.lamps) l.lit = false;
    state.player.lamp = true;
    if (def.note) state.toast = { text: def.note, t: 4.5 };
    AdvanceBeat(state);
    return;
  }
  const near = remaining.find((l) => Math.abs(l.x - state.player.x) < 1.8);
  if (near) {
    state.prompt = "E · 吹灭这盏灯";
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

  // 第四章的注定失去：拴柱大爷半路腿软，顺子回身去背他
  if (def.lossScript) {
    const elder1 = FindActor(state, "elder1");
    const shunzi = FindActor(state, "shunzi");
    if (!state.beat.lossStage && elder1?.following && elder1.x < 92) {
      state.beat.lossStage = 1;
      state.beat.lossT = state.beat.t;
      elder1.following = false;
      elder1.scripted = true;
      elder1.cineTarget = { x: 112 };   // 退回藏人洞·甲；烟约 45s 追到，吞没时序才成立
      elder1.cineSpeed = 0.9;
      if (shunzi) {
        shunzi.visible = true;
        shunzi.scripted = true;
        shunzi.x = 78;
        shunzi.cineTarget = { x: 112 };
        shunzi.cineSpeed = 3.2;
      }
      state.toast = { text: "拴柱大爷腿一软，坐在了道口。顺子从后面追了上去：『你们先走！』", t: 5 };
    }
    if (state.beat.lossStage === 1) {
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
  const loose = villagers.find((a) => !a.following && Math.abs(a.x - state.player.x) < 2.6);
  if (loose) {
    state.prompt = "E · 招呼他们跟上";
    if (input.interact) {
      for (const a of villagers) {
        if (!a.following && Math.abs(a.x - state.player.x) < 3.4) a.following = true;
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
      RestoreSnapshot(state);
      state.beat.lossStage = 0;
      for (const v of state.actors.filter((x) => x.kind === "villager")) {
        v.following = false; v.evacuated = false; v.scripted = false; v.cineTarget = null;
        v.visible = v.id !== "shunzi" || !def.lossScript;
      }
      state.toast = { text: def.resetHint, t: 4 };
      return;
    }
  }
  const remaining = state.actors.filter((a) => a.kind === "villager" && !a.scripted
    && !(def.lossScript && a.id === "shunzi") && !a.evacuated);
  if (remaining.length === 0) AdvanceBeat(state);
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
    state.prompt = "E · 把「骡车」和「押人」那两条钉在一起";
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
  const bars = Math.round(b.grip / def.cap * 6);
  state.prompt = b.quakeActive
    ? "…探杆就在头顶。停手，别出声"
    : `${def.prompt}  ${"▮".repeat(bars)}${"▯".repeat(6 - bars)}`;

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
    case "actSeq": {
      const st = def.steps[state.beat.stepIndex || 0];
      if (!st) return null;
      return { action: st.walk ? "walk" : "interactAt", x: st.x, level: st.level || "surface" };
    }
    case "buildSpots": {
      const i = state.beat.spotDone.findIndex((d) => !d);
      if (i < 0) return null;
      const z = def.spots[i].zone;
      return { action: "holdAt", x: z.x, level: z.level || "surface" };
    }
    case "digSeq": {
      const keys = ["collapse1", "collapse2"];
      const key = keys[state.beat.digIndex];
      if (!key) return null;
      return { action: "holdAt", x: TF[key].x, level: "under", pauseOnQuake: true };
    }
    case "floodRescue": {
      const pool = state.actors.filter((a) => a.kind === "villager" && a.visible && !a.evacuated);
      const loose = pool.find((a) => !a.following);
      if (loose) return { action: "interactAt", x: loose.x, level: "under" };
      if (pool.length) return { action: "walk", x: (def.dest || TV.entW).x, level: "under" };
      return null;
    }
    case "douseLamps": {
      const lit = (state.lamps || []).filter((l) => l.lit);
      if (lit.length <= 1) return null;
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
