# 第一人称大刀劈砍修订

2026-09-12 使用 BlenderMCP 完成 7 轮动作调整（上限 15 轮）。只制作一条大刀劈砍主曲线，
接入现有 Light、LightAlt、Heavy、Compact、CompactAlt；Charge 使用同一曲线的准备段。
没有新增动作条目，也没有制作其他武器或第三人称动画。

旧第一人称轨道缩小了恢复动作的位移与旋转，攻击段刀刃朝向也偏离切入方向。
现在由肩肘带起双手到右侧高位，刀尖稍后加速，沿斜面从高处穿过目标、
继续落向左下，再弯肘回到架势。低位握点向左移动、左肩前送，避免用反折左腕
完成收势。原大刀网格、UV、PBR、双手握点和固定骨长继续使用。

`Data_FpsDadaoSwing.mjs` 是 Blender 采样的单条 121 帧曲线。
`Script_MeleeAnimation` 将准备、有效攻击和恢复三段映射到已有战斗时钟；
轻重攻击的伤害、距离、体力和判定没有调整。贴身斩缩小相同曲线。
原视频动作在采样时归一化原来的幅度，再进行过渡，避免切到拨挡时把
上一动作重新缩放。刀尖行程是运动路径长度，不是攻击距离。

## 源工程与重建

源工程为 `C:\Users\Bentl\OneDrive\AI\Models\Blender\Taierzhuang1938\DadaoPowerSwing_20260912\Animation_DadaoPowerSwing.blend`。
它包含四条编辑控制轨、实际生产双臂的 53 根骨骼与大刀，贴图已打包。
四条控制轨共同定义同一段劈砍，不代表四段动作。
`Animation_DadaoEvaluatedArms` / `Animation_DadaoEvaluatedWeapon` 是实际游戏求解的回放轨。
固定的 `Scene_DadaoViewmodelScale` 父节点保留游戏前景的 XY/Z 缩放差，避免把带剪切的
世界矩阵直接分解为刀身位置、旋转和缩放时产生握持错位。121 帧源工程回放与游戏矩阵
的最大元素误差小于 0.000001，控制轨与导出数据的最大误差小于 0.0000001。
修改控制曲线后需按以下顺序刷新回放；不能把旧回放当成新曲线的验收。

1. 在该任务独占的 BlenderMCP 工程设置 `DADAO_PROJECT_ROOT` 为目标检出的 `Taierzhuang1938` 绝对路径，执行 `_blender/Script_DadaoPowerSwing.py`。从脚本关键姿势重建时使用默认模式；手动编辑 Graph Editor 后设置 `DADAO_EXPORT_ONLY=True`，只导出现有曲线，保留手工修改。
2. 执行 `node Taierzhuang1938/Script_DadaoSwingTest.mjs --export-source`，只导出这一条曲线在 Light 时钟下的双臂和武器矩阵。
3. 在同一工程执行 `_blender/Script_DadaoSwingStudio.py`。Blender 回放为 121 个采样点，0.65 秒，与轻斩一致。

`.blend`、截图、回放网页及采样中间文件只留本地。
本地回放网页 `_check_DadaoPower.html` 支持实时播放、逐帧拖动、轻重切换与慢放；
正式战斗入口仍为 `?melee=1`。

## 实测

专项测试检查原刀尖位置、刃向、实际双臂、完整回刀与中断交接。
修订后轻斩有效段路径约 2.15 m、垂直落差约 1.23 m；原轻斩路径约 0.89 m。
新轻斩刀尖峰值速度约 25.1 m/s，重劈约 18.1 m/s；这些是动画轨迹测量，
不是历史武术或真人动力学实验证明。轻斩刃向与运动切线平均点积约 0.85。
五种攻击消费方式和蓄力均满足握点残差与 65° 腕部限制，骨段长度没有伸缩。
1280×720 与 1440×900 两种画幅各采样 31 帧，轻斩、重劈与蓄力的主手均为 31 帧在屏内。
冲刺测试中刀身采样点的屏内比例为站立 82%、冲刺 79%；挥刀时跑速保持约 5.25 m/s。
数值检查须同时结合游戏截图、
正常速度回放和源工程检查，不能单独代替视觉验收。

迭代记录：第 1 轮建立长行程，但低位左腕最大约 95°；第 2 轮调整收势，仍约 88°；
第 3 轮把握点带向左侧并调整肩位，完整动作最大约 64°；第 4 轮把高位握点向内、
向前移动，并抬高低位收势，解决蓄力和重劈长时间离开画面的新增问题。
第 5 轮延后抬刀、向前收势，使刀身屏内比例由 47% 提升至 82%；第 6 轮为冲刺颠簸
微抬低位握点，冲刺检查通过，但腕角约 67°；第 7 轮同步肩位，最大腕角降至约 64.3°。

第 7 轮大刀专项在本机 Windows 软件渲染与独立 Linux 浏览器通过，冲刺检查通过；
[最终专项运行](https://github.com/BentleyBlanks/bentleyblanks.github.io/actions/runs/34644860016)。
43 项快速检查通过。双臂、刺刀战斗和白刃 QTE 的扩展回归在第 4 轮通过，后续只调整
本曲线及验收脚本；这些系统与数值没有再改动。
冲刺测试等待真实动作资产加载，用同一输入、时钟和变换采样，结束后统一渲染截图，
避免软件渲染积压数百帧；保留全部原断言，`--trace` 可输出逐帧诊断。

全武器 `MeleeAnimationTest` 的刺刀握点误差在未改动的 master
`78fa7e53` 对照中也存在（Light 0.02236 m、Heavy 0.00721 m、ParryRight 0.01847 m）；
27 项刺刀测量与原版完全相同。
Linux `MotionVectorContractTest` 的 attachment 像素边缘误差也在同一原版中完全复现
（406 pixels，minX 0.00011444、maxX 7.998046875，期望 8 px）；
[原版 GPU 对照](https://github.com/BentleyBlanks/bentleyblanks.github.io/actions/runs/34643407335)。
两项记录为既有失败，不报告为全绿，不放宽断言。
