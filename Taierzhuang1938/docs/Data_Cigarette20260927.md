# 老周卷烟（2026-09-27）

06 借火场景的 `MissionZhouCigarette` 使用用户提供的 `Smoke.fbx`，替换原 2 cm 白盒。原始文件在 `C:/Users/Bentl/OneDrive/Sync/饮河/FPS/建模/卷烟/Smoke.fbx`；源文件授权由用户保留。

- 原始 50,000 三角面，Blender Decimate 后 1,798，保留源 UV、卷纸拧口与烟灰；内嵌 4K PBR 缩到 1K。游戏资产为 `Model/Model_Cigarette.glb`，审计数值在 `Model/Data_Cigarette.json`。
- 顶点测得源最长轴为 +Z（1.194877 源单位）；源灰端在高 Z，嘴端在低 Z。导出为米制 9 cm，灰端朝游戏 -Z，嘴端原点后留 5 mm 咬入量。`Script_ModelFacingTest.mjs` 用真实点云复量尺寸、两端半径与三角数。
- `Script_Main` 等待 `LoadCigaretteAsset`，`FirstLevelCollection` 私有材质走 `ConfigureExternalPbr`，几何与贴图缓存复用；`Leave` 隐藏，`Dispose` 释放本实例材质，保留缓存。嘴部中点来自两片唇骨，水平朝向随头转动，不改借火台词或节奏。
- 原模带灰端，保留源外观；本次没有新增燃烧、烟雾效果。

Blender 工程：`C:/Users/Bentl/OneDrive/AI/Models/Blender/Taierzhuang1938/Cigarette/Model_Cigarette.blend`。重建脚本为 `_blender/Script_CigaretteBake.py`，输出仍由脚本生成，验收图片留忽略目录 `tmp/Cigarette`。

重建时在本任务独占 worktree 启动 BlenderMCP，先用 `exec --code` 设置 `bpy.context.scene['CigaretteProject']` 为该 worktree 的 `Taierzhuang1938` 绝对路径，再运行 `exec --file Taierzhuang1938/_blender/Script_CigaretteBake.py`；结束后 `stop`、`status --scan`。可用 `CIGARETTE_SOURCE` 环境变量指定另一份同源 FBX。

验证入口：`Script_ModelFacingTest`、`Script_AssetStandardsTest`、`Script_ModuleGraphTest`、TestRunner prepush；06 连续流程 `Script_FirstLevelMissionBrowserTest.mjs --campaign --stage-from=6 --stage-to=6`；近景运动门禁 `Script_CarriagePropVelocityTest`。

本次验证：ModelFacing / AssetStandards / ModuleGraph / TestRunner / FirstLevelMission / MotionVectorContract / CarriagePropVelocity 均通过；高画质两侧近景与嘴部转头跟随专项通过，页面错误 0，部署 bundle 构建成功。CarriagePropVelocity 首次加载超时，单独复跑通过（187.9 s，未改超时或断言）。

完整 prepush 在通过 49 项后停于既有 `WorldInfoEditorTest`（按钮 27，旧断言 26），未修改的 `e11dcdf7` 页面也复现。发布前合入上游 `5cf395e6` 枯树远景优化后，06 连续流程通过：真实输入走到借火位置、七个借火姿态、抬老周上担架并起行进入 07；页面错误 0、检查点重试 0，借火前全帧 6,947,628 三角。没有修改预算或测试断言。完整 prepush 仍不声称全绿。
