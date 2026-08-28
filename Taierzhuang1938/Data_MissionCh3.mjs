// Data_MissionCh3.mjs — 第三关｜救护所。规格：docs/Data_MissionRemake.md §4（正文）与 §10（契约）。
// 本文件由基建批建骨架、章节内容批填实。不许 import three，不许 Math.random。
//
// ---------------------------------------------------------------------------
// 三个功能院落的坐标（§0「三个功能院落」的工程落点）
//
//   A 区 · 城内主救护所   (214, -30)   —— 第二区公所那一片大院（Data_Tengxian
//        的 CITY_FEATURES.EastDistrictOffice，50×74 m，城内东部最大的一组院落）
//        的北门一侧。三关、四关末、五关开头是**同一个院子**，三章共用这一个锚点，
//        谁都不许各写一份坐标。
//   B 区 · 东关临时集结院 (449, -140) —— 东关大街北段，见 Data_MissionCh4。
//   C 区 · 前沿救护点     (462, -19)  —— 东关失守街区里的小型战场救护点（本章主战场）。
//
// 之所以取第二区公所而不是书院小学/滕文中学（策划案原话是「学校/大药铺院落」）：
// 那两处在城西南 z≈220—238，第五关那条「A 区 → 西街长街 → 西关城门」的走线就要
// 把切片往南拉一百多米，而 A 区还得同时够得着东关（三关、四关都从东边回来）。
// 第二区公所在东门大街与十字街之间，三章的切片都装得下它。
// **这是可以改的选点**：内容批要换成学校，连同 CH4/CH5 的同名路标一起挪。
//
// 场景基底：城内 A 区院落 ＋ 东关失守街区（C 区）。切片横跨城墙东段与东关，
// spawn 沿用旧 L4 那个东门大街上的落脚点（BootTest 的 spawnRun 验过通行）。
// ---------------------------------------------------------------------------

export const CHAPTER = {
  id: "CH3_Jiuhusuo",
  title: "第三关 · 救护所",
  place: "城内 A 区主救护所 → 东关失守街区 · C 区前沿救护点",
  date: "一九三八年三月十六日 十七时 — 二十时",
  clock: "03-16 17:00 — 20:00",
  sky: "smokyDay",
  music: "streetDistress",
  minutes: 18,
  pool: { start: 168, end: 140, label: "城里还站着的人", presumed: true },
  brief: [
    "在持续有玩家任务的前提下，第一次真正谈家、死亡、为什么来。",
    "前沿救护点失联 —— 电话线还通，不是我们这边断的。",
    "日军突入前沿救护点后对失去战斗能力的伤兵与救护人员实施系统处决。这一段不许弱化。",
  ],
  objectives: [
    "在主救护所搬药箱、拆门板、接电话线",
    "从东门侧门出城，沿电话线前进",
    "穿过失守街区，绕开机枪",
    "确认前沿救护点里正在发生什么，然后开火",
    "撕开短褂止血，把传单投进炉火封路",
    "撤回主救护所",
  ],
  zones: [
    { id: "C3_AidStation", name: "A 区 · 主救护所", x: 214, z: -30, radius: 30 },
    { id: "C3_EastGateOut", name: "东门 · 侧门", x: 296, z: -65, radius: 24 },
    { id: "C3_LostBlock", name: "东关失守街区", x: 449, z: -110, radius: 24 },
    { id: "C3_ForwardAid", name: "C 区 · 前沿救护点", x: 462, z: -19, radius: 26 },
    { id: "C3_Firebreak", name: "炉火封路", x: 480, z: -65, radius: 20 },
    // 同一个院子的第二次出场（环境已变：伤员大增、绷带血水满地）。
    // 坐标与 C3_AidStation 相同、id 不同 —— 目标链要玩家真的走回去。
    { id: "C3_AidReturn", name: "撤回 A 区 · 主救护所", x: 214, z: -30, radius: 30 },
  ],
  tuning: {
    bounds: { minX: 140, maxX: 600, minZ: -260, maxZ: 220 },
    spawn: { x: 276, z: -65, ry: Math.PI / 2 },
    ijaPressure: 1.3, ijaSpawn: ["east"], ijaSupport: ["hmg", "launcher"],
    ijaForce: { lmgEvery: 13, hmgTeams: 2, engineers: true, armor: 0, motorTransport: "rearOnly" },
    ijaPool: 380,
    loadoutOverride: {
      primary: "HanYang", secondary: null, melee: "Dadao",
      throwables: { Grenade: 5 }, spareClips: 3,
      note: "从东关退下来补的：五枚手榴弹，三个桥夹。",
    },
  },
  beats: [
    { at: "start", type: "title", text: "救护所", sub: "一九三八年三月十六日 十七时　城内", tier: "主流" },
    { at: "delay:3.0", type: "objective", text: "在主救护所搬药箱、拆门板、接电话线" },
    { at: "zone:C3_EastGateOut", type: "objective", text: "从东门侧门出城，沿电话线前进" },
    { at: "zone:C3_LostBlock", type: "objective", text: "穿过失守街区，绕开机枪" },
    { at: "zone:C3_ForwardAid", type: "objective", text: "确认前沿救护点里正在发生什么，然后开火" },
    { at: "zone:C3_Firebreak", type: "objective", text: "撕开短褂止血，把传单投进炉火封路" },
    { at: "zone:C3_AidReturn", type: "objective", text: "撤回主救护所" },
    { at: "end", type: "narration", text: "开头还在打趣的那几个人，回来以后大多不说话了。", tier: "虚构" },
  ],
  cutsceneIn: null,
  cutsceneOut: "CS_Ch3_LeafletFire",
  mechanics: {
    executionScene: true,     // 破墙外确认系统处决（只演一次正在发生的，其余用尸体/声音）
    tearShirt: true,          // 【撕开背包中的民用短褂】长按 —— 逃跑衣服毁在这里
    leafletFire: true,        // 拾传单 → 投入炉火 → 火焰封住一条追击路线
    phoneLine: true,          // 沿电话线前进、保护小秦查断点、剪断无法回收的线路
    doorPlankStretcher: true, // 拆门板做担架
    carryWounded: true,       // 搜幸存者、能走的交给幺娃、为担架队开路
  },
};

export const VOICE_LINES = [];
