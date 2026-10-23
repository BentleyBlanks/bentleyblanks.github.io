# 八九式中战车乙型 · Type89MediumTank

独立馆藏外形复原资产。主版本为土浦可行驶保存车的乙型外观，主材质状态参照 2007 年照片，2025 年同车多机位照片用于核对结构。来源、尺寸冲突和推定边界见 [参考契约](Data_ReferenceContract.json) 与 [图证记录](Data_References.md)。

`Model_Type89MediumTank.glb` 为米制、Y 向上、车头 -Z 的游戏派生版，地面轴心在车体中心下方。实际渲染面数包含每节履带实例，共 **79,921 三角**；高源独立保留。六组 Base / Normal / ORM 共 18 张图，装甲为 4K；AO 共用 ORM 红通道，玻璃保留透射。内部暗腔使用常量 PBR。

可动件包括左右独立履带、每侧 15 个轮组、炮塔、主炮俯仰及后坐、两挺可见机枪、前后指挥塔盖、驾驶及侧观察盖、车首检修门和动力舱盖。部件独立，不把履带或炮塔合成静态壳。

## 源与构建

可编辑工程、原始通道图与照片档案位于：

`C:/Users/Bentl/OneDrive/AI/Models/Blender/Taierzhuang1938/Type89MediumTank`

完整复建依次执行：

```powershell
node Taierzhuang1938/_blender/Script_BuildType89MediumTank.mjs --quality=High --no-render
node Taierzhuang1938/_blender/Script_BuildType89MediumTank.mjs --quality=Game --no-render
node Taierzhuang1938/_blender/Script_BuildType89MediumTank.mjs --stage=Pbr --revision=SurfaceV2 --no-render
node Taierzhuang1938/_blender/Script_Type89Package.mjs
```

入口在本 worktree 自己的 BlenderMCP 实例内执行，保存后关闭；原始工程与备份均留在上述目录。`--probe --probe-size=1024 --revision=SurfaceV2` 为本地材质试烘，不发布试烘文件。PBR 烘焙只合并临时副本，交付节点保持独立；投射漏点从最近的有效高源表面取样，法线同时转换高低模切线基，记录修补数量与距离。零面积导出三角单独清理，不改顶点、贴图或关节。

SurfaceV2 已按用户意见重做漆膜、下部污膜、履带磨蚀与排气氧化层，首版源与 GLB 留在源目录 `History/MaterialV1/`。参考原片、近景来源及实际复核证据见 [材质复核记录](Data_MaterialReview.json)。完整烘焙之后，`Script_Type89PbrRecoat.py` 可通过受控 Blender `start --batch` 只调整 Base；它验证全部 UV/几何及 24 张高低模 Normal/ORM 原图保持一致，不沿用旧 Base 冒充新表面。

高低两版都保存自包含 `.blend` 与完整 PBR GLB。高源保留物理表面作者材质，游戏版使用独立 UV 和高源法线投射。运行时打包只规范未被材质使用的诊断 alpha，并逐像素核对 RGB，再选无损 WebP/PNG；原 RGBA 图仍保存在源目录。

本次最终文件哈希、源重开、实际 GLB 重导、运动与浏览器验收见 [导出验收记录](Data_ExportAudit.json)。高源为 `Scene_Type89MediumTankHighPbr.blend`，游戏源为 `Scene_Type89MediumTankGamePbr.blend`；源重开脚本为 `_blender/Script_Type89SourceAudit.py`，通过根目录受控 Blender 的 `start --batch` 运行。新重建输出会恢复待复核状态，须重新验收，不能沿用旧文件的通过记录。

## 驱动与验收

```javascript
import {Type89Motion} from './Script_Type89Motion.mjs';
const path = await fetch('./Data_TrackPath.json').then(r => r.json());
const motion = new Type89Motion(gltf.scene, path);
motion.Update(deltaSeconds, leftMetersPerSecond, rightMetersPerSecond);
motion.SetPose({turretYaw: 0.5, mainGunPitch: 0.1, recoilM: 0.05});
```

角度用弧度、距离用米。左右行程独立；轮速从各轮有效半径取值，主动轮的齿数与链节节距一致。链节按两端连线定位，运动中不拉伸。前后指挥塔盖可分别驱动；动力舱检修姿态先将炮塔转开。

左右动力舱盖用 `engineHatchLeft` / `engineHatchRight` 单独驱动，或用 `engineHatches` 同开；两侧观察盖、两挺机枪也保留各自输入。输入范围是展示资产的机械活动范围，不是战术性能或工厂规格。

```powershell
node Taierzhuang1938/Script_Type89MediumTankTest.mjs
node Taierzhuang1938/Script_Type89MediumTankBrowserTest.mjs
```

实际 GLB 重导与轮面检查使用 `_blender/Script_Type89ImportAudit.py`，经受控 Blender 后台入口运行。比较页、截图与源重开检查只留本地 `_shots/Type89MediumTank/`；预览用根目录 LocalPreview 静默启动。该资产作为独立外形库保留，不替换现有游戏 `Type89Tank`，也不改变任务中的参战认定。
