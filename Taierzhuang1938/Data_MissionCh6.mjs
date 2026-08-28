// Data_MissionCh6.mjs — 终章｜最后一封。规格：docs/Data_MissionRemake.md §7（正文）与 §10（契约）。
// 本文件由基建批建骨架、章节内容批填实。不许 import three，不许 Math.random。
//
// ---------------------------------------------------------------------------
// 场景基底：城内临时师部 → 西关电灯厂
//
//   城内临时师部 (-58, -55) —— 王铭章师部原设城外电灯厂，接死守命令后迁入城内；
//        **城内具体哪一处无载**（Data_CutsceneLastWire 的 presumed 里已登记过一次）。
//        这里取城中那组最大的院落（Data_Tengxian.CITY_FEATURES.CentralCompound124，
//        94×54 m）作为临时师部的锚点，是推定，不是史实。内容批可以改选点。
//   西关电灯厂 (-410, 69) —— Data_Tengxian.WEST_SUBURB.powerPlant，二十二米烟囱那一处。
//        王铭章在西关电灯厂附近殉国。
//
// 玩家在本章是**小秦**（通信兵）：报告东关、亲手发最后一封电报、随通信组转移。
// 编剧红线照旧：**不演王铭章举枪自尽**（理由见 Data_CutsceneWangMingzhang 的长注释）。
//
// spawn 沿用旧 L5 那个十字街口东侧的落脚点（BootTest 的 spawnRun 验过通行），
// 朝西正对师部与西门方向。
// ---------------------------------------------------------------------------

export const CHAPTER = {
  id: "CH6_Zuihou",
  title: "终章 · 最后一封",
  place: "城内临时师部 → 西门大街 → 西关电灯厂",
  date: "一九三八年三月十七日 午后 — 黄昏",
  clock: "03-17 15:00 — 18:00",
  sky: "burningStreet",
  music: "exodus",
  minutes: 10,
  pool: { start: 44, end: 12, label: "城里还站着的人", presumed: true },
  brief: [
    "普通人的故事通过通信链汇入王铭章最后电报。玩家＝小秦。",
    "前两封都发出去了，援军还是没有消息。",
    "结算不打歼敌数：只打守住时长、阵地易手次数、随你活着出城的人数。",
  ],
  objectives: [
    "进临时师部，报告东关，亲手发出最后一封电报",
    "处理密码材料，随通信组沿西门大街转移",
    "穿过西门里",
    "出西门瓮城",
    "沿西关大街向电灯厂",
    "到电灯厂附近 —— 侧面机枪突然开火",
  ],
  zones: [
    { id: "C6_DivisionHq", name: "城内临时师部", x: -58, z: -55, radius: 30 },
    { id: "C6_WestStreet", name: "西门里大街", x: -160, z: 0, radius: 24 },
    { id: "C6_GateInner", name: "西门里", x: -278, z: 0, radius: 20 },
    { id: "C6_Barbican", name: "西门瓮城", x: -322, z: 0, radius: 16 },
    { id: "C6_WestOuter", name: "西关大街", x: -380, z: 0, radius: 24 },
    { id: "C6_PowerPlant", name: "西关电灯厂", x: -410, z: 69, radius: 34 },
  ],
  tuning: {
    bounds: { minX: -480, maxX: 100, minZ: -190, maxZ: 150 },
    cameraFar: 460,
    spawn: { x: 62, z: 0, ry: Math.PI / 2 },
    ijaPressure: 1.2, ijaSpawn: ["west", "south"], ijaSupport: ["hmg", "artillery"],
    ijaForce: { lmgEvery: 13, hmgTeams: 1, engineers: false, armor: 0, motorTransport: "rearOnly" },
    ijaPool: 320,
    loadoutOverride: {
      primary: "HanYang", secondary: null, melee: "Dadao",
      throwables: { Grenade: 2 }, spareClips: 1,
      note: "通信兵的枪。两枚手榴弹，一个桥夹 —— 城里能发的电报比子弹多。",
    },
  },
  beats: [
    { at: "start", type: "title", text: "最后一封", sub: "一九三八年三月十七日 午后　城内临时师部", tier: "主流" },
    { at: "delay:3.0", type: "objective", text: "进临时师部，报告东关，亲手发出最后一封电报" },
    { at: "zone:C6_WestStreet", type: "objective", text: "处理密码材料，随通信组沿西门大街转移" },
    { at: "zone:C6_GateInner", type: "objective", text: "穿过西门里" },
    { at: "zone:C6_Barbican", type: "objective", text: "出西门瓮城" },
    { at: "zone:C6_WestOuter", type: "objective", text: "沿西关大街向电灯厂" },
    { at: "zone:C6_PowerPlant", type: "objective", text: "到电灯厂附近 —— 侧面机枪突然开火" },
    { at: "end", type: "narration", text: "一九三八年三月十七日，王铭章在滕县殉国。最后一封电报已经发出去了。", tier: "主流" },
  ],
  cutsceneIn: null,
  cutsceneOut: "CS_Ch6_Epilogue",
  mechanics: {
    telegraph: true,          // 亲手发报：电键发码组、报码纸确认、接头松脱后重新连接
    draftReading: true,       // 前两封电报的底稿可靠近查看（完整内容进历史档案）
    cipherDisposal: true,     // 师部遭炮击：处理密码材料/重要文件/无法带走的设备
    groundPov: true,          // 西关殉国：小秦被击倒后的地面视角，不用慢动作、不虚构遗言
    epilogueMap: true,        // 尾声极简地图＋三行字幕，电流声渐变序章火车车轮声
  },
};

export const VOICE_LINES = [];
