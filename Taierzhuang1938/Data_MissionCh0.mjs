// Data_MissionCh0.mjs — 序章｜出川。规格：docs/Data_MissionRemake.md §1（正文）与 §10（契约）。
// 不许 import three，不许 Math.random。
//
// ---------------------------------------------------------------------------
// 2026-10-31：序章整章就是一场过场（CS_Chuchuan，车厢 → 兵站，166.5 s / 九镜 / 31 句），
// 那场过场连同播放它的 CutsceneDirector、这一章的 31 句台词与音频一起删除（git 历史里有）。
// 本章留在 CHAPTERS 里只是为了不挪动后面各章的序号（?phase=N、开机冒烟、出图都按序号取），
// 现在是一章暂时废弃场景（Data_TengxianScript.DEPRECATED_CHAPTER_IDS）：?phase=0 只建场。
//
// 本章没有自己的战场切片，借 CH1 的：tuning.fieldFrom = "CH1_NanLu"。
// BuildField 会用这个 id 去查 OUTFIELD_SCENES / 外部布设 / tzm 饰件三张表，
// 于是「序章那一片」与「第一关那一片」逐个网格相同。zones 只作 HUD 与 LOD 焦点用。
//
// 兵员池曲线（全七章，逐章递减，登记在 Data_TengxianScript.PRESUMED_STAGING）：
//   序章 240→240（**不耗**）→ 一 240→208 → 二 208→168 → 三 168→140
//   → 四 140→96 → 五 96→44 → 终 44→12
// ---------------------------------------------------------------------------

export const CHAPTER = {
  id: "CH0_Chuchuan",
  title: "序章 · 出川",
  place: "军列车厢 → 兵站月台",
  date: "一九三八年三月 · 军列南下",
  clock: "军列南下途中",
  sky: "chuchuanDay",
  // 车厢里没有音乐，只有车轮与人声（环境档见下面的 ambience）。
  music: null,
  // 天空档名与环境音档名不同名时用这一条显式指定（Script_Main 读 ambience ?? sky）。
  ambience: "trainInterior",
  minutes: 3,
  pool: { start: 240, end: 240, label: "城里还站着的人", presumed: true },
  brief: [
    "第二十二集团军是川军。军服式样不一，草鞋，步枪型号杂乱，三分之一以上没有枪。",
    "前头两个战区都不肯收；第五战区肯接，还给了枪弹。",
    "顺子背包底藏着一件民用短褂 —— 他打算借后送伤兵的差事走人。",
  ],
  objectives: [
    "在车厢里等命令",
    "透过车门看兵站补给",
    "枪上膛 —— 前头是滕县",
  ],
  zones: [
    // 三个路标只当 HUD 去向与 LOD 焦点用（本章不建切片、不走路），坐标取 CH1 那片
    // 原野上津浦路路基一线，保证它们落在借来的切片里、也落在可通行地面上。
    // 离出生点都在 40 m 以上：路标圈套住出生点的话，目标链会在开局第一帧
    // 自己推进（进而触发换关结算），出图与开机冒烟会莫名其妙地换到下一章。
    { id: "C0_Carriage", name: "军列车厢", x: -478, z: -140, radius: 24 },
    { id: "C0_Depot", name: "兵站月台", x: -466, z: -95, radius: 24 },
    { id: "C0_Door", name: "车门", x: -452, z: -55, radius: 24 },
  ],
  tuning: {
    // 借 CH1 的切片（见文件头）。bounds 必须与 CH1 一致，否则借来的内容会被裁掉半边。
    bounds: { minX: -620, maxX: -230, minZ: -250, maxZ: 210 },
    fieldFrom: "CH1_NanLu",
    spawn: { x: -480, z: -205, ry: Math.PI },
    // 车上没有仗打。这里写 0 是为了拿 ?phase=0 直跳进来调试时不会凭空冒出一条战线。
    ijaPressure: 0, ijaSpawn: [], ijaSupport: [],
    ijaForce: { lmgEvery: 13, hmgTeams: 0, engineers: false, armor: 0, motorTransport: "rearOnly" },
    ijaPool: 0,
    loadoutOverride: {
      primary: null, secondary: null, melee: null,
      throwables: {}, spareClips: 0,
      note: "枪弹要到兵站才发。车上只有一条布袋、一双草鞋，和背包底那件短褂。",
    },
  },
  // 骨架级 beats：title 卡 + 三条阶段提示 + 关末一条（本章废弃，不装剧本，留着只是章节校验要求 beats 齐）。
  beats: [
    { at: "start", type: "title", text: "出川", sub: "一九三八年三月　军列南下", tier: "主流" },
    { at: "delay:4.0", type: "objective", text: "在车厢里等命令" },
    { at: "delay:6.0", type: "objective", text: "透过车门看兵站补给" },
    { at: "delay:6.0", type: "objective", text: "枪上膛 —— 前头是滕县" },
    { at: "end", type: "narration", text: "军列到站。前头是滕县。", tier: "主流" },
  ],
  // 本章特有机制（声明式；引擎侧由后续系统批实现，这里只留接口）
  mechanics: {
    hiddenShirt: true,        // 背包底那件民用短褂（三关撕掉它）
  },
};

/**
 * 本章台词语音行。原来 31 句全在出川过场里，2026-10-31 随过场删除；只留下第一关 P012 白盒
 * 借去用的那一句（Data_FirstLevelP012Whitebox 的 ExistingPrologueVoice，罗班长递枪）。
 * 文件名由 Data_Voice.Normalize 按 key 推（AudioVoice_Ch0Luo_08.mp3），dur 是烘焙实测。
 */
export const VOICE_LINES = [
  { key: "ch0_luo_08", who: "luo", delivery: "normal", dur: 2.59, text: "枪发到你手头，就打个兵样出来。" },
];
