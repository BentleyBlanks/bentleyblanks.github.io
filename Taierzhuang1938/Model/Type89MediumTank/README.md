# 八九式中战车乙型（馆藏外形复原）

**GeometryV55 / SurfaceV22** 沿用土浦保存车 2007 年状态的外形，以 V6 战损三视图制作游戏外观。高模有 1,487,842 三角面。游戏 GLB 按默认场景可见实例实测 **79,997 三角面**，含左右各 81 节履带、30 个轮组及 176 三角面的积泥几何。硬上限为 80,000 三角面。

炮盾外框、炮塔下缘、车首板、侧裙和后翼子板按多视角复核，后甲板补做弧形把手并校正百叶边沿。低模保留主要履带开孔、中央减料槽、轮盘轮廓、罩板边缘和可见关节。小销眼和细铸纹由高模投射。实体排气罩的孔阵在游戏中由双面遮罩表现。游戏版共四个材质，车体、履带、排气护网和玻璃。原贴图加一张 32×8 的漆膜参数图，共十张图像。车体图集 4K，护网 1K，履带在 2K 图集内保留四套 1K 鞋面。底色、OpenGL 切线法线和 ORM 分通道烘焙。ORM 红通道包含高模投射、积泥边缘和按装配几何重烘的接触遮蔽。

2007 年的圆筒护套和开盖姿态用该年主照复核。2025 年照片用于核形，闭盖和不同保存状态的附件按各张照片分别理解。光照和机位为对照拟合，取不到的内构、精确倒角半径、漆膜微观粗糙度和止挡速度属于复原参数。照片与取舍见 [图证档案](Data_ReferenceArchive.json)、[图证与复原边界](Data_References.md)及[本版导出验收](Data_ExportAudit.json)。

SurfaceV16 对标 2007 主照和同车细节照，校正了暖橄榄漆、较粗糙的铸面、炮塔座圈的深色油垢钢，以及履带外缘擦亮带与凹槽内的氧化表面。高模按零件和表面位置着色，再把底色、法线和反光参数投射到已发布的 UV。装甲保留介电表面效果，履带擦亮带保持金属反射。原 AO、排气罩透明遮罩和圆盖徽记按像素保留。摄影光照拟合、七处颜色与四处履带横带的比较见[材质复核](Data_MetalFinishReview.json)。

V17 将 V6 正、左、俯三张图按装甲边缘和附件配准。炮塔左前、车首两肩和左后排气罩附近做分开的烟炱及局部崩漆。履带前后绕圈、下承载段和裙板下缘加半干泥，浮尘集中在泥边。右侧、后方与遮挡处按同车材质和痕迹延续推定。参见[战损复核](Data_BattleWearReview.json)。

V18 在同一装配坐标中按 42 毫米和 145 毫米两种距离重烘 AO，补足炮塔座圈、炮盾与车首框、舱盖铰链、排气护罩、裙板和轮组、履带节接合处的遮蔽。车体固定件与活动盖分开接收遮蔽，固定座仍参加贴合面的烘焙。游戏贴图只写入 ORM 红通道。高模和低模的 Blender 工程提供 Baked contact AO 渲染通道。参见[遮蔽复核](Data_AmbientOcclusionReview.json)。

V19 按漆层、积泥与真实露钢区分金属度。完整涂层和泥层接近零值；弹痕露钢核心、压实履带的磨亮前沿和外露枪套按各自反光调整金属度与粗糙度。V18 接触遮蔽沿用实测的 ORM 红通道。参见[露钢复核](Data_ExposedMetalReview.json)。

V20 把六类不透明部件共用到一个车体材质。装甲漆和铸面在副 UV 上读取各自的漆膜权重、粗糙度和镜面反射参数，原暗面使用图集空位内的色块。高模实际材质由十个减到五个，细漆膜、铸面和积泥继续通过节点组编辑。参见[材质合并验收](Data_MaterialMergeReview.json)。

V21 按 V6 的压实半干泥重做前后履带绕圈、履板槽和轮组。团泥由深棕内层、干结碎边和局部的薄尘形成。两块泥转到前下绕圈，整理原有泥块拓扑并在前后绕圈增加五块实体泥。车首下缘、裙板边和翼子板落尘处增加局部材质起伏。参见[泥尘对照](Data_SedimentReview.json)。

V22 用 Poly Haven 的 CC0 泥面扫描重新校准泥块和履带槽内的压实泥。潮泥与干壳采用同组扫描的底色、粗糙度、法线和颗粒遮蔽。游戏的泥块在车体图集中取样，使用四块 256×256 的泥面图，沿用无漆膜取样。掠射光与检查台默认灯下均检查了颗粒及凹坑。参见[泥料复核](Data_SoilMaterialReview.json)、[Brown Mud](https://polyhaven.com/a/brown_mud)和[Brown Mud Dry](https://polyhaven.com/a/brown_mud_dry)。

## 源工程与重建

新源位于 C:/Users/Bentl/OneDrive/AI/Models/Blender/Taierzhuang1938/Type89MediumTank/GeometryV55SurfaceV22。根下的 Scene_Type89MediumTankHighPbr.blend 保留可编辑的烟炱、伤痕材质和积泥几何。Game/Scene_Type89MediumTankGamePbr.blend 是可编辑低模，Game/Runtime/Model_Type89MediumTank.glb 是游戏文件。Review 保存泥料微距、掠射光和实机同机位对照。V21 的泥块造型与 V6 外观对照保存在 GeometryV55SurfaceV21。V20 的材质合并复核保存在 GeometryV55SurfaceV20。V19 的露钢复核保存在 GeometryV55SurfaceV19。V18 的接缝 AO 与开盖复查保存在 GeometryV55SurfaceV18。V17 战损三视图保存在 GeometryV55SurfaceV17。V16 的 2007 馆藏漆面与原照分别保存在 GeometryV55SurfaceV16 和 References。

从仓库根重建。脚本读取冻结的 V21、Maps/Scan 中记录过 SHA-256 的扫描源，为高模与运行时分别重烘表面，通过 BlenderMCP 写入两份可编辑源。系统 Python 使用 Pillow、NumPy、OpenCV。可用 --stage=maps、--stage=bind、--stage=runtime 单独执行。

```powershell
node Taierzhuang1938/_blender/Script_RebuildType89SoilMaterial.mjs
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
