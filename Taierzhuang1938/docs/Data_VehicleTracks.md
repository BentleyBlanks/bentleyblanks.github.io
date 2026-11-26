# 通用车辆车辙印系统（战车 / 坦克 / 驴车）

## 1. 架构定位（混合双层真几何凹陷）

本系统将**稀疏世界锁定高密真 3D 凹陷瓦片**与**2 cm/纹素 GPU 微观细节靶**融合在同一套数据与规则层下，支持**动态车辆实时碾压**与**场景 JSON `vehicleTracks` 静态预置样条**双模式：

1. **宏观真 3D 凹陷层**（`Script_VehicleTrackField.mjs` + `Script_VehicleTrackView.mjs`）
   - 瓦片边长 `3.0 m`（精确整除 0.75 / 0.5 / 0.25 / 0.2 m 场景地形格距），`high` 档 `48×48`（6.25 cm 格距），`ultra` 档 `60×60`（5 cm 格距），`medium` 档 `36×36`，`low` 档 `24×24`。
   - 仅在车辙经过的瓦片按需分配内存与网格，使用 `CutTerrainRectangles` 从粗底地形裁孔并替换为高密网格；未激活相邻边界顶点偏移严格锁零（0 mm 接缝）。
   - 每格点独立记录 `depth`（下凹深度）与 `rim`（两侧挤泥棱高），合成高度 `rim * (1 - smoothstep(lo, hi, depth)) - depth`：交叉碾压以 MAX 为主、柔和加深并封顶（`maxDepthM = 0.20 m`），泥棱永不填平旧槽，彻底消除交错贴花 Z-fighting。
   - 局部 `DirtyBox` 脏矩形按帧增量子区域上传（`addUpdateRange`），复用原地形材质自动接入 Prepass（真实下陷深度与槽壁法线 → GTAO & 接触阴影）、CSM 太阳投射/接收阴影与分层地形着色。
2. **微观高精纹素层**（复用 `Script_TerrainTrails.mjs` 的 `uTrailMap` RGBA8，**+0 片元采样器**）
   - 12 格印章图集（`0..7` 保留人物与八九式，`8..11` 新增 `tanketteTread`、`ironWheel`、`hoof`、`tire`）。
   - 启用 `A` 通道存储宏观深车辙深度：不新增任何片元采样器（守住 ANGLE-D3D11 16 采样器上限），驱动槽底腔体 AO、碎石反照率压平与深槽优先积水（`gTerrainPrint`）。
   - 静态预置车辙写入 `TrailHistory.persistent`，不随时间衰减，不被动态脚印挤出环形历史。

## 2. 通用车型配置（`Data_VehicleTracks.mjs`）

| 车型 ID | 对应资产 | 接触单元 | 单次槽深 / 泥棱 | 特征 |
| --- | --- | --- | --- | --- |
| `type89Tank` | `Model_Type89MediumTank.glb` | 双履带（宽 34 cm，长 3.6 m） | 11.5 cm / 4.4 cm | 平底梯形槽 + 中央导齿微隆 + 14 cm 履齿 |
| `type94Tankette` | `Model_Type94Tankette.glb` | 双履带（宽 21 cm，长 1.92 m） | 8.2 cm / 3.2 cm | 窄履带 + 9.5 cm 履齿 + 转向翻泥增益 |
| `donkeyCart` | `Model_DonkeyCart.glb` | 双铁箍木轮（宽 6.8 cm）+ 4 驴蹄 | 9.4 cm / 3.5 cm | 锐利深窄 V/U 切槽 + 步幅 0.68 m 四蹄坑 |
| `oxCart` | `Model_WoodenEvacCart.glb` + 牛/马 | 双铁箍木轮（宽 7.8 cm）+ 4 蹄（独立 `animalRoot`） | 10.0 cm / 3.8 cm | 兼容 `DraftCartModels` 轴高偏移 |
| `type94Truck` | 扩展预留（6×4 卡车） | 前转向单胎 + 后双胎并排 | 6.2–7.2 cm / 2.2–2.6 cm | 弯道内轮差 + 人字胶胎纹 |

## 3. 场景静态预置（`Scene_*.json`）

在场景 JSON 顶层可选添加 `vehicleTracks` 数组（由 `Script_SceneDoc.ValidateScene` 校验）：

```json
"vehicleTracks": [
  { "id": "EastRoad_Type94", "profile": "type94Tankette", "passes": 2, "depthScale": 1.1, "points": [[2.5, -26], [2.6, -12], [2.1, 2]] },
  { "id": "Village_Donkey", "profile": "donkeyCart", "hooves": true, "points": [[-8, 10], [0, 4], [10, 2]] }
]
```

## 4. 独立测试场与验收入口

- **独立车辙测试场**：`Taierzhuang1938/?tracks=1`（场景 `Scenes/TestVehicleTracks/Scene_TestVehicleTracks.json`，三辆实车并排实时压痕 + 静态交叉车辙 + 擦地特写 + 真 3D 凹陷 A/B 实时开关 + 积水湿度调节）。
- **调试接口**：`window.Taierzhuang.Debug.VehicleTracks`（测试场内）与 `window.Taierzhuang.Debug.TerrainTrails`（全局：`SetDisplacement` / `ReadRgba` / `AddStaticTrack` / `OffsetAt`）。
- **自动化门禁**：
  - 纯 Node 规则与几何门禁：`node Taierzhuang1938/Script_VehicleTracksTest.mjs`
  - 真浏览器 GPU 验收：`node Taierzhuang1938/Script_VehicleTracksBrowserTest.mjs`
  - 既有痕迹系统回归：`node Taierzhuang1938/Script_TerrainTrailRulesTest.mjs` 与 `node Taierzhuang1938/Script_TerrainTrailsTest.mjs`
