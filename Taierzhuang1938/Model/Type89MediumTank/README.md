# 八九式中战车乙型（馆藏外形复原）

**GeometryV55 / SurfaceV16** 以土浦保存车的 2007 年状态为外观基准。可编辑高模有 1,465,474 三角面。游戏 GLB 有 **79,821 三角面**，按默认场景里的实际实例计数，包含两侧各 81 节履带、15 个轮组和其他可见部件。硬上限为 80,000 三角面。

炮盾外框、炮塔下缘、车首板、侧裙和后翼子板按多视角复核，后甲板补做弧形把手并校正百叶边沿。低模保留主要履带开孔、中央减料槽、轮盘轮廓、罩板边缘和可见关节。小销眼和细铸纹由高模投射。实体排气罩的孔阵在游戏中由双面遮罩表现。9 个材质共用 9 张贴图，车体图集为 4K，履带和护网各为 1K。底色、OpenGL 切线法线和 ORM 分通道烘焙。ORM 红通道沿用 V15 的高模到位遮蔽与局部接触遮蔽。

2007 年的圆筒护套和开盖姿态用该年主照复核。2025 年照片用于核形，闭盖和不同保存状态的附件按各张照片分别理解。光照和机位为对照拟合，取不到的内构、精确倒角半径、漆膜微观粗糙度和止挡速度属于复原参数。照片与取舍见 [图证档案](Data_ReferenceArchive.json)、[图证与复原边界](Data_References.md)及[本版导出验收](Data_ExportAudit.json)。

SurfaceV16 对标 2007 主照和同车细节照，校正了暖橄榄漆、较粗糙的铸面、炮塔座圈的深色油垢钢，以及履带外缘擦亮带与凹槽内的氧化表面。高模按零件和表面位置着色，再把底色、法线和反光参数投射到已发布的 UV。装甲保留介电表面效果，履带擦亮带保持金属反射。原 AO、排气罩透明遮罩和圆盖徽记按像素保留。摄影光照拟合、七处颜色与四处履带横带的比较见[材质复核](Data_MetalFinishReview.json)。

## 源工程与重建

版本目录为 `C:/Users/Bentl/OneDrive/AI/Models/Blender/Taierzhuang1938/Type89MediumTank/GeometryV55SurfaceV16`。根下 `Scene_Type89MediumTankHighPbr.blend` 是可编辑高源，`Maps/High` 保留高源贴图。形状验证过的派生源和发布件分别为 `Game/Scene_Type89MediumTankGamePbr.blend` 和 `Game/Runtime/Model_Type89MediumTank.glb`。`Review/` 保存同机位与独立中性光对照、运行入口截图和审计数据。上一版可从 `GeometryV55SurfaceV15` 查阅，原照片在 `References/`。

在仓库根运行材质重建命令。它先打开 V15 高源重建材质，再把高模表面投射到 V15 游戏源的 UV。输出新源文件、贴图和无损打包版 GLB。系统 Python 使用 Pillow、NumPy 与 OpenCV。可用 `--stage=high`、`--stage=bake` 或 `--stage=package` 单独重跑一段。

```powershell
node Taierzhuang1938/_blender/Script_RebuildType89MetalFinish.mjs
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
