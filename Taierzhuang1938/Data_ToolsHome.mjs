// 高级工具首页（?editor=tools，不带 phase）的空场地。纯数据，零 three。
//
// 从主菜单打开高级工具时不建任何关卡：引擎只要一块地站着就能跑，
// 画面整张被工具首页盖住，等人自己选工具。摄影棚类工具（人物、枪械、特效……）
// 自带布景直接开；要关卡的场景类工具由首页先问「载入哪一关」再整页换过去。
// 口径见 docs/Data_EditorSuite.md「入口」。
//
// 选址：x 4900–4940 / z 4900–4940，与各测试场的 *_WORLD 都不重叠（见 Data_GoreRange 文件头）。

export const TOOLS_HOME_ID = "ToolsHome";

export const TOOLS_HOME_WORLD = Object.freeze({
  minX: 4900, maxX: 4940, minZ: 4900, maxZ: 4940, groundLimit: 5100,
});

export const TOOLS_HOME_PHASE = Object.freeze({
  id: TOOLS_HOME_ID, sandbox: true, sandboxKey: "tools",
  date: "开发工具", label: "高级工具", place: "工具首页",
  sky: "testSceneDay", ambience: "overcast", music: null, minutes: 600,
  story: TOOLS_HOME_ID,
  brief: [], objectives: [], mechanic: "",
  nraPool: 9999, poolGain: 0, ijaPool: 0, ijaPressure: 0, ijaSpawn: [], ijaSupport: [],
  ijaForce: { lmgEvery: 13, hmgTeams: 0, engineers: false, armor: 0, motorTransport: "rearOnly" },
  bounds: { minX: TOOLS_HOME_WORLD.minX, maxX: TOOLS_HOME_WORLD.maxX, minZ: TOOLS_HOME_WORLD.minZ, maxZ: TOOLS_HOME_WORLD.maxZ },
  cameraFar: 120, ambientAircraft: false,
  zones: [{ id: "ToolsHome", name: "工具首页", x: 4920, z: 4920, radius: 4 }],
  spawn: { x: 4920, z: 4930, ry: 0 }, hud: { objectiveMarkers: false },
});
