# 八九式中战车乙型（馆藏外形复原）

**GeometryV55 / SurfaceV17** 沿用土浦保存车 2007 年状态的外形，以 V6 战损三视图制作游戏外观。高模有 1,487,422 三角面。游戏 GLB 按默认场景可见实例实测 **79,997 三角面**，含左右各 81 节履带、30 个轮组及 176 三角面的积泥几何。硬上限为 80,000 三角面。

炮盾外框、炮塔下缘、车首板、侧裙和后翼子板按多视角复核，后甲板补做弧形把手并校正百叶边沿。低模保留主要履带开孔、中央减料槽、轮盘轮廓、罩板边缘和可见关节。小销眼和细铸纹由高模投射。实体排气罩的孔阵在游戏中由双面遮罩表现。9 个材质共用 9 张贴图。车体图集 4K，护网 1K，履带在 2K 图集内保留四套 1K 鞋面。底色、OpenGL 切线法线和 ORM 分通道烘焙。ORM 在既有高模投射与接触遮蔽上叠加弹凹和泥边的局部遮蔽。

2007 年的圆筒护套和开盖姿态用该年主照复核。2025 年照片用于核形，闭盖和不同保存状态的附件按各张照片分别理解。光照和机位为对照拟合，取不到的内构、精确倒角半径、漆膜微观粗糙度和止挡速度属于复原参数。照片与取舍见 [图证档案](Data_ReferenceArchive.json)、[图证与复原边界](Data_References.md)及[本版导出验收](Data_ExportAudit.json)。

SurfaceV16 对标 2007 主照和同车细节照，校正了暖橄榄漆、较粗糙的铸面、炮塔座圈的深色油垢钢，以及履带外缘擦亮带与凹槽内的氧化表面。高模按零件和表面位置着色，再把底色、法线和反光参数投射到已发布的 UV。装甲保留介电表面效果，履带擦亮带保持金属反射。原 AO、排气罩透明遮罩和圆盖徽记按像素保留。摄影光照拟合、七处颜色与四处履带横带的比较见[材质复核](Data_MetalFinishReview.json)。

V17 将 V6 正、左、俯三张图按装甲边缘和附件配准。炮塔左前、车首两肩和左后排气罩附近做分开的烟炱及局部崩漆。履带前后绕圈、下承载段和裙板下缘加半干泥，浮尘集中在泥边。右侧、后方与遮挡处按同车材质和痕迹延续推定。参见[战损复核](Data_BattleWearReview.json)。

## 源工程与重建

新源位于 C:/Users/Bentl/OneDrive/AI/Models/Blender/Taierzhuang1938/Type89MediumTank/GeometryV55SurfaceV17。根下的 Scene_Type89MediumTankHighPbr.blend 保留可编辑的烟炱、伤痕材质和积泥几何。Game/Scene_Type89MediumTankGamePbr.blend 是可编辑低模，Game/Runtime/Model_Type89MediumTank.glb 是游戏文件。Review 保存配准三视图、中性光近景、回导及浏览器验证。V16 的 2007 馆藏漆面与原照分别保存在 GeometryV55SurfaceV16 和 References。

从仓库根重建。脚本以 G55 的 V16 资产为底稿，通过 BlenderMCP 写高源，再生成低模贴图与交付件。系统 Python 使用 Pillow、NumPy、OpenCV。可用 --stage=controls、--stage=high、--stage=game 单独执行。

```powershell
node Taierzhuang1938/_blender/Script_RebuildType89BattleWear.mjs
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
