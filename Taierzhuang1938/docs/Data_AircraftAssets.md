# 日军航空器资产来源

本页记录 `Script_Aircraft.mjs` 使用的远距飞行器模型。它们只作为天空中的视觉编队，
不提供碰撞、伤害、索敌或剧情结算。

| 游戏内资产 | 原始模型 | 作者 / 来源 | 许可与署名 |
| --- | --- | --- | --- |
| `Model_MitsubishiKi30.glb` | [Mitsubishi Ki-30](https://sketchfab.com/3d-models/mitsubishi-ki-30-4d7838f0a8134995a6bc3d9d341f78be) | Burak Mescioglu / Sketchfab | CC BY 4.0；署名 Burak Mescioglu。 |
| `Model_MitsubishiKi21Ia.glb` | [Ki-21 Japanese Type 97 Heavy Bomber](https://www.cadnav.com/3d-models/model-40943.html) | CadNav | 按随下载附带的 `readme.txt`：可作为 artwork / project 的组成使用及修改；不得单独转售或再分发；署名 cadnav.com。 |
| `Model_NakajimaKi43.glb` | [Ki43](https://sketchfab.com/3d-models/ki43-abdc04cc7afb4aeba0eaac6c5079d6e6) | manilov.ap / Sketchfab | CC BY 4.0；署名 manilov.ap。 |

## 机型说明

Ki-30 与 Ki-21 分别保留为九七式轻轰炸机与九七式重轰炸机。九七式战斗机 Ki-27
没有找到适合公开站点使用的可下载许可，因此以同属日本陆军航空队的中岛 Ki-43
“隼”作临时战斗机替代；它在游戏与代码中明确标为替代品，避免误称为 Ki-27。

## 朝向

三件源 GLB 没有一件把机首放在局部 -Z：Ki-30 与 Ki-21 机首朝 +Z，Ki-43 的机身主轴在
XZ 面上斜着（机首指向约 (-0.851, 0.525)）。`Data_AircraftAssets.mjs` 每条记录用
`noseDir` 写明源模型机首在局部 XZ 面的方向，`Script_Aircraft.mjs` 的 `PrepareAircraft`
按它把模型套在一层 `NoseAlign` 节点里转到 -Z 机首，此后绕圈、扫射与召唤投弹的
yaw/climb/bank 换算只认 -Z 一个约定。这些方向是用顶点云量出来的（螺旋桨盘一端、
尾翼一端），换模型时重量，不要凭肉眼猜。2026-09-05 前三架都在倒着飞。

## 转换

下载授权由 BlenderMCP 的 Sketchfab 连接取得。运行时 GLB 由
`_import/Script_ImportAirAssets.py` 用 Blender 导出；Ki-30 进行了减面和贴图尺寸优化，
Ki-43 合并为单一远景材质。原始下载文件不随站点发布。
