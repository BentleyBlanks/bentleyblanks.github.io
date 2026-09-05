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
闸门：`node Taierzhuang1938/Script_ModelFacingTest.mjs`（快速 Tier 0，纯 Node）用顶点云
复量每架的机首方向，与 `noseDir` 对不上或对齐后不在 -Z 就红；新增机型必须先过它。

## 转换

下载授权由 BlenderMCP 的 Sketchfab 连接取得。运行时 GLB 由
`_import/Script_ImportAirAssets.py` 用 Blender 导出；Ki-30 进行了减面和贴图尺寸优化，
Ki-43 合并为单一远景材质。原始下载文件不随站点发布。

## Ki-30 运行时尺寸与朝向

2026-09-05 真实 GLB 顶视检查发现 Ki-30 机首朝局部 +Z，源翼展仅 4.933 米。
`Script_Aircraft.mjs` 在独立适配组内转向 -Z，并按 `wingspanM: 14.55` 等比缩放、重新居中。
该数值是当前白盒的尺寸校准参数，不作为已由原厂图纸核实的精确机型尺寸；网格原比例保留，
实际包围盒为 14.550 × 3.303 × 10.140 米。其余机型保持原缩放。
模型变换不修改航迹、速度、扫射阶段或伤害。螺旋桨实际位置另与带爬升、滚转的航向核对，
避免只检查根节点旋转就把尾部向前的模型算作通过。

`Script_FirstLevelP012BrowserTest.mjs --air-model --air-route=open` 提供明确局部检查：
模型近景只用于尺度／朝向，B16 初始化后的实际输入和玩家相机用于转弯画面；两者都不是整关验收。
