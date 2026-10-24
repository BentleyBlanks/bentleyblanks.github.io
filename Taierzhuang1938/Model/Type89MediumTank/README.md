# 八九式中战车乙型 · Type89MediumTank

独立馆藏外形复原资产。主版本为土浦可行驶保存车的乙型外观，主材质状态参照 2007 年照片，2025 年同车多机位照片用于核对结构。来源、尺寸冲突和推定边界见 [参考契约](Data_ReferenceContract.json) 与 [图证记录](Data_References.md)。

**当前交付：GeometryV32 / SurfaceV5。** 用户否决 V31 的漏面、细节不足、塑料感和颜色插值后，已重开全部外观验收。本次补闭炮盾上下的真实漏面，重做铆钉、轮辋、履带铸件和舱盖连接，再完整重烘 PBR；实际文件身份与验收见 [形态复核清单](Data_GeometryReviewV3.json) 和 [导出记录](Data_ExportAudit.json)，旧版通过结论不用于认证当前候选。

`Model_Type89MediumTank.glb` 为米制、Y 向上、车头 -Z 的游戏派生版，地面轴心在车体中心下方。高灰源 **1,130,810 三角**，游戏灰源 **240,278 三角**；实际游戏导出 **240,278 三角**，高模导出 **1,123,316 三角**，都计入全部履带实例。游戏导出移除 0 个零面积三角，保留可见表面、关节和作者切线。为满足这轮近景细节要求，本独立资产由原 80k 目标调整为 **240k 目标 / 252k 上限**，仍执行既有 5% 拓扑保留规则；不改变旧 `Type89Tank` 或其他车型预算。实际浏览器成本单独记录。

当前管线为七组 Base / Normal / ORM 共 21 张图，装甲为 4K；AO 共用 ORM 红通道，玻璃保留透射。排气罩使用独立 2K Base/Normal 和 1K ORM，游戏版 Base 的 alpha 以 MASK 保留真实孔洞。内部暗腔使用常量 PBR。

可动件包括左右独立履带、每侧 15 个轮组、炮塔、主炮俯仰及后坐、两挺可见机枪、前后指挥塔盖、驾驶及侧观察盖、车首检修门和动力舱盖。部件独立，不把履带或炮塔合成静态壳。

## 源与构建

可编辑工程、原始通道图与照片档案位于：

`C:/Users/Bentl/OneDrive/AI/Models/Blender/Taierzhuang1938/Type89MediumTank`

完整复建依次执行：

```powershell
node Taierzhuang1938/_blender/Script_BuildType89MediumTank.mjs --quality=High --no-render
node Taierzhuang1938/_blender/Script_BuildType89MediumTank.mjs --quality=Game --no-render
node Taierzhuang1938/_blender/Script_BuildType89MediumTank.mjs --stage=Pbr --revision=SurfaceV5GeometryV32 --no-render
node Taierzhuang1938/_blender/Script_Type89Package.mjs
```

入口在本 worktree 自己的 BlenderMCP 实例内执行，保存后关闭；原始工程与备份均留在上述目录。`--probe --probe-size=1024 --revision=SurfaceV5GeometryV32` 为本地试烘，只降低游戏预览尺寸，高源仍保留完整采样分辨率。PBR 只合并临时副本，交付节点保持独立。游戏版颜色和标量通道投射已烘好的高源图，保持材质通道一致；低模轮缘实际对应的高模接触带也纳入投射。法线独立投射真实几何与细表面。漏点从有效高源三角取样并转换法线切线基，35 mm 修补距离门槛不变。高低灰源必须带相同版本与配方指纹；烘焙前后输入哈希不一致时不推广候选。零面积导出三角单独清理，不改顶点、贴图或关节。

旧版源与 GLB 留在源目录 `History/`，V31 拒绝时的工程、模型和记录独立保留。V32 沿用按原片比例采用的 70 mm 托带轮外圈与 320 mm 履带铸件宽度，尺寸仍属照片复原值。游戏轮盘保留 32 段外圈、压制肩部与浅凹轮辋；履带保留真实铸件倒角、小销孔和销耳内壁。前检修门与侧观察盖使用共轴的固定/活动铰节；盖板背面与边框保留实际间隙，裙板前端按同车近景补折弯搭接。

SurfaceV5 在着色点采样装配遮蔽和小凹腔，避免把少量顶点的遮蔽值插到整块大钢板。翻转舱盖保留局部自身遮蔽，防止闭合状态的阴影污染打开后的内面。漆膜细孔、压制方向纹理、铸钢凹点、磨亮面、氧化与积尘分别控制；精确微观旧损和漆膜起伏未作实测声明。只有实际露钢区域使用金属响应，漆层保持电介质。高低模全通道重烘，完整构建输入指纹与修补距离门槛保持可核对。实际图证与材质状态见 [材质复核记录](Data_MaterialReview.json)。`Script_Type89PbrRecoat.py` 是旧六套 SurfaceV2 的历史工具，不用于当前七套材质。

高低两版都保存自包含 `.blend` 与完整 PBR GLB。高源保留物理表面作者材质，游戏版使用独立 UV 和高源法线投射。运行时打包对不透明图逐像素核对 RGB，对排气罩 Base 逐像素核对 RGBA，再选无损 WebP/PNG；原图仍保存在源目录。

全烘流程保留装甲 3 mm cage / 12 mm 射线，避免薄盖之间串面。`Script_Type89ArmorProjection.py` 仅保留 V25 的历史定向修补配方，不用于 V32；修改后运行上面的完整构建即可。Type89 Python 作者脚本以 LF 固定换行，保证 Windows 与 CI 的配方指纹一致。

文件哈希、源重开、实际 GLB 重导、运动与浏览器验收记在 [导出验收记录](Data_ExportAudit.json)。其中旧版记录已作废，不能用于认证当前候选。高源为 `Scene_Type89MediumTankHighPbr.blend`，游戏源为 `Scene_Type89MediumTankGamePbr.blend`；源重开脚本为 `_blender/Script_Type89SourceAudit.py`，通过根目录受控 Blender 的 `start --batch` 运行。每次重建都须重新验收。

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

指挥塔前后盖各支持 0–180°；驾驶半圆挡片为 `driverPortShutter`，车首圆口盖为 `bowRoundPortCover`（0–π，2007 主图打开后露出内侧星徽）。零行程的一侧保持导入变换，避免另一侧运动时发生浮点重算位移。

```powershell
node Taierzhuang1938/Script_Type89MediumTankTest.mjs
node Taierzhuang1938/Script_Type89MediumTankBrowserTest.mjs
```

实际 GLB 重导与轮面检查使用 `_blender/Script_Type89ImportAudit.py`，经受控 Blender 后台入口运行。比较页、截图与源重开检查只留本地 `_shots/Type89MediumTank/`；预览用根目录 LocalPreview 静默启动。该资产作为独立外形库保留，不替换现有游戏 `Type89Tank`，也不改变任务中的参战认定。

V32 最终文件经过实际打包重载、532项原文件检查、17项浏览器检查、36阶段轮轨/固定罩板净空、64组舱盖连接检查与高低源重开；制作者对照记录不代表用户已确认。完整重烘之后的缺射修补、切线奇点修正和轮盘法线通道复烘按顺序单列在导出记录中，原始整烘输入指纹保留。
