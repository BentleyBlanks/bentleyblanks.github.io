// 白刃实验场入口数据：一对一的独立战斗专项（2026-11-23 起六组遭遇撤了，只留一个对手）。
export const MELEE_QTE_LEVEL_ID = "MeleeQte";
export const MELEE_QTE_PHASE = Object.freeze({
  id: MELEE_QTE_LEVEL_ID, sandbox: true, sandboxKey: "melee", sandboxGlyph: "刃",
  date: "机制实验场", label: "白刃战 · 大刀与刺刀", place: "独立战斗测试", sky: "meleeLabDay", ambience: "overcast", music: null, minutes: 600,
  brief: ["左键轻点攻击，长按松开重击；右键瞬时拨挡；贴身 F 推架。", "僵持与倒地压制时连续按 F。成功后自行移动和攻击。"],
  story: MELEE_QTE_LEVEL_ID,
  objectives: ["面板选项目，开始／重开", "一个对手，大刀或刺刀"],
  mechanic: "白刃战一对一：大刀、刺刀对刺刀、F推架、站立与倒地抵抗。",
  nraPool: 9999, poolGain: 0, ijaPool: 9999, ijaPressure: 0, ijaSpawn: [], ijaSupport: [],
  ijaForce: { lmgEvery: 13, hmgTeams: 0, engineers: false, armor: 0, motorTransport: "rearOnly" },
  bounds: { minX: 1387, maxX: 1413, minZ: 1442, maxZ: 1480 }, cameraFar: 100,
  // 环境机队在 165–250 m 高空绕 220–355 m 的圈，这片场地相机只看 100 m：
  // 飞机永远画不进画面，却每帧更新 200 多个节点，白刃场不要它。
  ambientAircraft: false,
  zones: [{ id: "MeleeArena", name: "白刃实验场", x: 1400, z: 1460, radius: 18 }],
  spawn: { x: 1400, z: 1476, ry: 0 },
  loadoutOverride: { primary: "HanYang", secondary: null, melee: "Dadao", throwables: { Grenade: 0 }, spareClips: 6, note: "1 步枪 / 2 大刀；V 射击／白刃架势，X 装卸刺刀" },
});
