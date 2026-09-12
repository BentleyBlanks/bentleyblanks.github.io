# MountainEmber1941 Blender 源工程

## 路径与输入

路径唯一配置为 [Data_SourceProject.json](Data_SourceProject.json)。默认源工程：

`C:/Users/Bentl/OneDrive/AI/Models/Blender/MountainEmber1941/ArtPass/Model_SourceMountainEmberArtPass.blend`

其他电脑通过 `MOUNTAIN_EMBER_BLENDER_ROOT` 指定绝对 Blender 根目录，工程仍位于其 `MountainEmber1941/ArtPass/` 子目录。源目录不得指向本仓库。`.blend`、备份和迁移报告留本地；站点保留 `Models/*.glb`、`Textures/` 与重建脚本。

[Script_BuildBlenderAssets.py](Tools/Script_BuildBlenderAssets.py) 的 `ProjectRoot` 仍由脚本位置决定；GLB、贴图、地形 helper 的输入输出继续使用本任务 worktree。仅 `WriteSourceBlend` 使用外部源目录，写出前内嵌图片，避免工程依赖随后清理的 worktree。源文件沿用 Blender 数据库库文件格式，实际场景为 `Scene_MountainEmberArtPass`；加载时可能提示 library file，场景与 `MountainEmber1941_ArtPass` 集合应保留。

只有本次任务明确包含相应范围的资产重建时才运行 builder；完整构建会生成多件资产，不把路径验证变成一次全量生成。

## 2026-09-12 迁移证据

原工程由提交 `0e863e2c2` 保全到源目录下 `Archive/20260912/`，原始文件为 2,254,648 字节，SHA-256 为 `ebcb0d7e1a0a24c01a6bd351b909fd757baf3b345cc6d2b0356c41eb4ceab91c`。迁移先逐字节复制备份，再用 Blender 5.1.2 读取原库、写出新路径并重新打开；63 个对象的名称、类型与网格顶点数量一致，4 张图片均内嵌，无需从旧 worktree 读取贴图。详细本地报告为 `Archive/20260912/Data_Migration.json`。没有重新生成 GLB 或贴图。

## 验证

从本任务 worktree 根执行，Blender 使用独立后台进程：

```powershell
& 'C:/Program Files/Blender Foundation/Blender 5.1/blender.exe' --background --factory-startup --python-exit-code 1 --python MountainEmber1941/Tools/Script_VerifyBlenderSource.py
node MountainEmber1941/Script_ArtTerrainContractTest.mjs
```

第一项实际打开外部源工程，保留原有 >1 MB 完整性要求，并检查三个环境、可编辑集合、贴图内嵌与外部库依赖。路径缺失或工程不完整会失败，不静默跳过。它在维护源工程的电脑执行；只有 Git 的检出无需获取私有源工程即可运行第二项，第二项继续检查实际 GLB 地形、锚点、贴地和渲染契约。

源工程或 builder 变化运行两项；纯运行时 GLB 消费改动按项目 AGENTS 选测。源目录可通过 OneDrive 或已验证的备份恢复，移除仓库副本不改写 Git 历史，也不删除其他 worktree 中的文件。
