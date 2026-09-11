# EarSpa3D 沉浸资产

当前资产为本任务通过 BlenderMCP 在 Blender 5.1 中建模导出。未使用外部模型库。
游戏文件：`Models/Model_ImmersiveEar.glb`。坐标保持 1 世界单位 = 1 毫米。

源工程：
`C:/Users/Bentl/OneDrive/AI/Models/Blender/EarSpa3D/ImmersiveEar/Model_ImmersiveEar.blend`。
.blend 和备份均不进站点仓库。

模型包括：有厚度的耳廓、完整管腔、鼓膜、头部与枕垫、竹耳勺、双镊臂与握柄、滴管、
三类整块琥珀原型、实体陶瓷收集盘。浏览器克隆原型后按毫米尺寸摆放，工具以尖端为轴装配。

## 重建

在属于本任务的独立 Blender 工程中运行 `Script_BuildImmersiveEar.py` 的函数。
先确认工程路径，再清理该工程的旧模型，依次执行：

`BuildEar() → SculptEar() → BuildTools() → BuildWax() → BuildTray() → Export()`。

脚本用 `Data_CanalProfile.json` 重建与游戏 canal API 相同的管腔。
原始法线指向管腔内部，所以 CanalThickness 的 Solidify offset 必须为 -1。
UV、灯光与摄像机不作为额外外部依赖；GLB 材质与几何自包含。
原型在运行时用 world matrix 烘焙进 geometry，再恢复游戏 Y-up 坐标。

## 运行时接触

`Script_PeelPhysics.mjs` 处理五点粘附、抓点弹簧、偏心转动、内壁支撑和工具角向支撑。
收集盘、块体、工具均在同一个毫米世界，落盘时不缩小、不关闭深度测试。
镜头和手的托送辅助是动画约束；落盘垂直运动采用重力与低恢复系数。

## 音频

保留当前 SeedAudio 采耳素材，新增 `Audio/Sfx/AudioSfx_ChunkLand.mp3`。
来源见 `Data_AudioSources.mjs` 与 `Audio/Data_AudioManifest.json`。
模型为火山 `seed-audio-1.0`，密钥仅由环境变量读取。
播放端去掉前置空白，断裂与落盘按实际事件发声。
本次可证明音频文件、解码、起音与静音输出；自动信号检查不能代替人的主观试听。
