// 日军航空器资产表。来源、作者与许可的完整记录见 docs/Data_AircraftAssets.md。
// 这里是纯数据层：不得 import three.js，也不参与碰撞、AI 或玩法结算。

export const AIRCRAFT_ASSETS = Object.freeze([
  {
    id: "MitsubishiKi30",
    label: "三菱 Ki-30 九七式轻轰炸机",
    url: "./Model/Model_MitsubishiKi30.glb?v=1",
    scale: 1,
    altitude: 165,
    orbitRadius: 260,
    speed: 0.18,
    bank: 0.08,
    phaseOffset: 0.2,
  },
  {
    id: "MitsubishiKi21Ia",
    label: "三菱 Ki-21 甲型 九七式重轰炸机",
    url: "./Model/Model_MitsubishiKi21Ia.glb?v=1",
    scale: 1,
    altitude: 250,
    orbitRadius: 355,
    speed: 0.11,
    bank: 0.035,
    phaseOffset: 2.35,
  },
  {
    // Ki-27 的可公开下载模型未找到可用于本站的许可；按需求使用同为陆航战斗机的 Ki-43 代替。
    id: "NakajimaKi43",
    label: "中岛 Ki-43 隼式战斗机（Ki-27 替代）",
    url: "./Model/Model_NakajimaKi43.glb?v=1",
    scale: 1,
    altitude: 205,
    orbitRadius: 220,
    speed: 0.31,
    bank: 0.14,
    phaseOffset: 4.3,
  },
]);
