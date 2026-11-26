# 八九式中战车乙型（馆藏外形复原）

**GeometryV55 / SurfaceV15** 以土浦保存车的 2007 年状态为外观基准。可编辑高模有 1,465,474 三角面。游戏 GLB 有 **79,821 三角面**，按默认场景里的实际实例计数，包含两侧各 81 节履带、15 个轮组和其他可见部件。硬上限为 80,000 三角面。

炮盾外框、炮塔下缘、车首板、侧裙和后翼子板按多视角复核，后甲板补做弧形把手并校正百叶边沿。低模保留主要履带开孔、中央减料槽、轮盘轮廓、罩板边缘和可见关节。小销眼和细铸纹由高模投射。实体排气罩的孔阵在游戏中由双面遮罩表现。9 个材质共用 9 张贴图，车体图集为 4K，履带和护网各为 1K。底色、OpenGL 切线法线和 ORM 分通道烘焙。ORM 红通道合并到位高模遮蔽与新计算的局部接触遮蔽。

2007 年的圆筒护套和开盖姿态用该年主照复核。2025 年照片用于核形，闭盖和不同保存状态的附件按各张照片分别理解。光照和机位为对照拟合，取不到的内构、精确倒角半径、漆膜微观粗糙度和止挡速度属于复原参数。照片与取舍见 [图证档案](Data_ReferenceArchive.json)、[图证与复原边界](Data_References.md)及[本版导出验收](Data_ExportAudit.json)。

## 源工程与重建

版本目录为 `C:/Users/Bentl/OneDrive/AI/Models/Blender/Taierzhuang1938/Type89MediumTank/GeometryV55SurfaceV15`。根下 `Scene_Type89MediumTankHighPbr.blend` 是可编辑高源，`Maps/High` 保留高源材质贴图。`Game/Scene_Type89MediumTankGamePbr.blend` 是派生源，`Game/Runtime/Model_Type89MediumTank.glb` 是无损打包的交付件。`Review/` 保存同机位、两套光照、材质近景和运动验证。原照和冻结 G54 源分别仍可由 `References/` 与 `History/` 查阅。

从仓库根运行以下命令。默认先用冻结的 SurfaceV14 高工程重建高源，再打开新保存的高源派生、烘焙和导出游戏件。用 `--stage=high` 或 `--stage=game` 可单独重跑一段。

```powershell
node Taierzhuang1938/_blender/Script_RebuildType89Restoration.mjs
```

## 运行与验收

构件库和控制中心的武器检视沿用 `Type89MediumTank` 可选模型。米制 Y-up，车头朝 -Z，`Data_VehicleAssets.mjs` 登记的 GLB 与 `Data_TrackPath.json` 成套使用。

```javascript
import { Type89Motion } from './Script_Type89Motion.mjs';
const track = await fetch('./Data_TrackPath.json').then(response => response.json());
const motion = new Type89Motion(gltf.scene, track);
motion.Update(deltaSeconds, leftMetersPerSecond, rightMetersPerSecond);
motion.SetPose({ turretYaw: .5, mainGunPitch: .1, bowMachineGunYaw: .1 });
motion.Reset();
```

左右履带与轮组、整周炮塔、主炮俯仰与后坐、两挺机枪以及舱盖沿用现有独立轴心。车首门与机枪的避让是展示联动。运动审计在 1 毫米门槛下复核导出件。

```powershell
node Taierzhuang1938/Script_TestRunner.mjs --domain-only=type89MediumTank --profile=prepush
node Taierzhuang1938/Script_PropLibraryBrowserTest.mjs
```
