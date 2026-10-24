# 八九式中战车乙型 · Type89MediumTank

独立馆藏外形复原资产。主版本为土浦可行驶保存车的乙型外观，主材质状态参照 2007 年照片，2025 年同车多机位照片用于核对结构。来源、尺寸冲突和推定边界见 [参考契约](Data_ReferenceContract.json) 与 [图证记录](Data_References.md)。

**当前本地候选：GeometryV31 / SurfaceV4。** 用户指出 V26 的尺寸、形态和金属质感仍有明显差距，旧版制作者的视觉通过结论已撤回。当前修订覆盖轮组、履带与全车表面响应，实际验收状态见 [形态复核清单](Data_GeometryReviewV3.json) 和 [导出记录](Data_ExportAudit.json)，不把旧版通过记录沿用到新候选。

`Model_Type89MediumTank.glb` 为米制、Y 向上、车头 -Z 的游戏派生版，地面轴心在车体中心下方。当前高灰源为 **1,119,346 三角**，选定游戏灰源及实际游戏导出均为 **83,992 三角**，计入全部履带实例。显式三角化与作者切线一起导出；本次游戏版没有零面积三角需要清理，高模导出为 **1,111,852 三角**。实际文件身份见导出记录。80k 仍为目标；对选定游戏源再减至目标约需 4.75%，按既有不超过 5% 时保留拓扑的规则保留可见细节，84k 上限不变。

当前管线为七组 Base / Normal / ORM 共 21 张图，装甲为 4K；AO 共用 ORM 红通道，玻璃保留透射。排气罩使用独立 2K Base/Normal 和 1K ORM，游戏版 Base 的 alpha 以 MASK 保留真实孔洞。内部暗腔使用常量 PBR。

可动件包括左右独立履带、每侧 15 个轮组、炮塔、主炮俯仰及后坐、两挺可见机枪、前后指挥塔盖、驾驶及侧观察盖、车首检修门和动力舱盖。部件独立，不把履带或炮塔合成静态壳。

## 源与构建

可编辑工程、原始通道图与照片档案位于：

`C:/Users/Bentl/OneDrive/AI/Models/Blender/Taierzhuang1938/Type89MediumTank`

完整复建依次执行：

```powershell
node Taierzhuang1938/_blender/Script_BuildType89MediumTank.mjs --quality=High --no-render
node Taierzhuang1938/_blender/Script_BuildType89MediumTank.mjs --quality=Game --no-render
node Taierzhuang1938/_blender/Script_BuildType89MediumTank.mjs --stage=Pbr --revision=SurfaceV4GeometryV31 --no-render
node Taierzhuang1938/_blender/Script_Type89Package.mjs
```

入口在本 worktree 自己的 BlenderMCP 实例内执行，保存后关闭；原始工程与备份均留在上述目录。`--probe --probe-size=1024 --revision=SurfaceV4GeometryV31` 为本地试烘，只降低游戏预览尺寸，高源仍保留完整采样分辨率。PBR 只合并临时副本，交付节点保持独立。游戏版颜色和标量通道投射已烘好的高源图，保持材质通道一致；低模轮缘实际对应的高模接触带也纳入投射。法线独立投射真实几何与细表面。漏点从有效高源三角取样并转换法线切线基，35 mm 修补距离门槛不变。高低灰源必须带相同版本与配方指纹；烘焙前后输入哈希不一致时不推广候选。零面积导出三角单独清理，不改顶点、贴图或关节。

旧版源与 GLB 留在源目录 `History/`。V31 沿用按原片比例采用的 70 mm 托带轮外圈与 320 mm 履带铸件宽度；这些是照片复原值。轮盘采用平面压边和浅凹面，低模用原有环数还原高模中央凸台，前导轮支臂置于双轮盘之间，销耳与轮缘保留运行间隙。侧罩只调整内侧上沿，外侧折线与裙板下沿保留。SurfaceV4 分开控制细漆层、裸露铸钢、磨亮接触面和积尘，起伏参数不当作实测漆膜厚度。实际图证与材质状态见 [材质复核记录](Data_MaterialReview.json)。`Script_Type89PbrRecoat.py` 是旧六套 SurfaceV2 的历史工具，不用于当前七套材质。

高低两版都保存自包含 `.blend` 与完整 PBR GLB。高源保留物理表面作者材质，游戏版使用独立 UV 和高源法线投射。运行时打包对不透明图逐像素核对 RGB，对排气罩 Base 逐像素核对 RGBA，再选无损 WebP/PNG；原图仍保存在源目录。

全烘流程保留装甲 3 mm cage / 12 mm 射线，避免薄盖之间串面。`Script_Type89ArmorProjection.py` 仅保留 V25 的历史定向修补配方，不用于 V31；修改后运行上面的完整构建即可。Type89 Python 作者脚本以 LF 固定换行，保证 Windows 与 CI 的配方指纹一致。

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
