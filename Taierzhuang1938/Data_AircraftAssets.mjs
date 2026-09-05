// 日军航空器资产表。来源、作者与许可的完整记录见 docs/Data_AircraftAssets.md。
// 这里是纯数据层：不得 import three.js，也不参与碰撞、AI 或玩法结算。
//
// noseDir：源 GLB 里机首指向的局部 XZ 方向（用顶点云量出来的，不是猜的）。
// 三件源模型没有一件把机首放在 -Z：两架轰炸机机首朝 +Z，Ki-43 还斜着 58°。
// Script_Aircraft 的 PrepareAircraft 按这个向量把模型转到局部 -Z 机首，
// 航线换算（绕圈 / 扫射 / 召唤投弹）只认 -Z 一个约定。漏写＝倒着飞。

export const AIRCRAFT_ASSETS = Object.freeze([
  {
    id: "MitsubishiKi30",
    label: "三菱 Ki-30 九七式轻轰炸机",
    url: "./Model/Model_MitsubishiKi30.glb?v=1",
    noseDir: { x: 0, z: 1 },
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
    noseDir: { x: 0, z: 1 },
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
    // 机身主轴在 XZ 面上斜着：螺旋桨盘在 (-0.851, 0.525) 那一端，尾翼在另一端。
    noseDir: { x: -0.851, z: 0.525 },
    scale: 1,
    altitude: 205,
    orbitRadius: 220,
    speed: 0.31,
    bank: 0.14,
    phaseOffset: 4.3,
  },
]);
