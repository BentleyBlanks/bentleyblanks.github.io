# 第一人称手榴弹、集束弹、大刀与捷克式修复

2026-10-15，按用户所发第一人称检查图，通过本任务独占的 BlenderMCP 实例重新标定这四件装备。
实际游戏继续使用原有武器网格与已校正的 `Model_FpsHanYangHands.glb`；本轮产物是掌面、逐指骨骼旋转和大刀运动轨。

## 握持与接线

- 普通手榴弹的 Blender GLB 已经是 Z 轴朝向；去掉 `BuildGrenadeProp` 再转四分之一圈的重复安装变换。
- 集束弹保留原尺寸木柄和七枚弹头，取消整体缩成 0.62 的视图模型特例；右手包柄，左手托弹头，重新安排三个持握状态。
- 捷克式与集束弹改用固定骨段的双臂，避免旧模型在运行时把前臂／腕部静止位移乘以 1.60。捷克式保留独立的扳机屈曲和工作手取匣手型。
- 三种非枪装备不再在开镜／冲刺时旋转手掌抵消肘部问题。掌面固定在实物上；状态变化移动整件装备。
- 四件装备的最终掌面和手指值统一在 `Data_FpsWeaponGrips.mjs`，由 `Data_FpsArmPoses` 组合；无需编辑已被覆盖的历史接触常量。

投弹的出手点在当帧骨骼求解后取真实掌心挂点。集束弹释放时双手张开，普通弹与集束弹各自使用其动作表的释放时刻；原伤害、库存和投掷规则继续由现有游戏逻辑负责。

## 大刀

仍为一条基础劈砍曲线，映射到既有轻斩、交替斩、重斩、贴身斩与蓄力；没有新增第三人称动作。
修正双掌相对刀柄的方向与闭合，肩部由数据表驱动；固定骨段的大刀不再走旧刀具的硬编码肩位覆盖。

`Script_FpsDadaoPhysicalStroke.py` 用 Blender 控制轨采样蓄势、加速、切入、随势与回架。
`Script_FpsDadaoElbowFit.py` 在真实双骨肘圆上选择连续轨迹，约束腕角与回架时的肘部高度，输出 `Data_FpsDadaoElbowPoles.json`。
运行时直接采样这条轨迹，跳帧和连续播放经过同一肘部支路。
第一人称检查器“挥刀”和 `TriggerMelee` 的大刀直接调用也复用同一曲线与战斗时钟，双手保持握柄；不再走旧的支撑手向右掌重叠的程序动作。

本轮 `DadaoSwingTest` 实测：轻斩有效刀尖路径约 2.03 m，向左约 0.62 m、下降约 1.15 m；刃向与切线平均点积约 0.973。
轻斩最大腕角约 63°；重斩、贴身斩、回架、转入防御与两种视口的可见性均通过原有判据。
这些是动画路径测量，不是伤害距离。

## Blender 源工程与重建

源目录：`C:\Users\Bentl\OneDrive\AI\Models\Blender\Taierzhuang1938\FpsWeaponGrips_20261015`。
源文件：`Animation_FpsWeaponGrips.blend`；贴图打包在工程内。
`Scene_FpsWeaponControls` 保留控制轨，`Scene_FpsRepairFinal` 保留实际蒙皮、四种握持和普通弹／大刀评估播放。
武器为实物三角网格检查件，最终材质在游戏高画质中验收。

1. 在任务 worktree 用 `node scripts/Script_BlenderMcp.mjs start --task FpsWeaponGrips_20261014` 启动独占实例。
2. `node Taierzhuang1938/Script_FpsWeaponGripExport.mjs <本地输出目录> --data-only` 导出实物三角形、原始顶点／UV、逆绑定矩阵、蒙皮权重、掌面和骨骼。省略 `--data-only` 另留玩家与检查视角截图。
3. 通过 MCP 的 `exec --file` 设置 `FPS_GRIP_PROJECT_ROOT`（本树的 Taierzhuang1938）、`FPS_GRIP_INPUT`（上一步目录）、`FPS_GRIP_SOURCE`（上述源目录），执行 `_blender/Script_FpsWeaponGripFit.py`。`FPS_GRIP_IDS` 可限制为一个已授权装备；不传时为这四件。
4. 执行 `Script_FpsDadaoPhysicalStroke.py` 导出已有控制轨，再运行 `Script_DadaoSwingTest.mjs --trace --export-source` 获取实机轨。需要重算肘轨时执行 `Script_FpsDadaoElbowFit.py`，再重烘与验证一次。
5. `Script_GrenadeThrowTest.mjs` 留下普通投掷的实机骨骼轨；`Script_FpsSkinRepairStudio.py` 用相同参数把实际回放保存进源工程，并逐顶点核对静态蒙皮。
6. 保存工程后 `node scripts/Script_BlenderMcp.mjs stop --save`；用 `status --scan` 核对本任务实例已退出。

不能把 glTF 关节世界矩阵直接抄到 Blender 自动校正骨轴的导入骨架上。
源回放按运行时逆绑定矩阵重建蒙皮，并显式补偿 Blender 骨轴与视图模型缩放；静态顶点核对不通过就拒绝保存最终工程。

## 本轮验证

`FpsArmTest`、`FpsGripEditorTest`、`FpsHandContactTest --only=Zb26`、`GrenadeThrowTest`、`DadaoSwingTest`、`SprintMeleeTest`、`MotionVectorContractTest`、`ModuleGraphTest` 通过。
高画质已查看四种装备的玩家与外部视角，并检查大刀关键帧。

全仓 quick 为 95／98：`SpeakerGestureTest`、`TextTest`、`IjaAlertGaitTest` 的三个失败已在未修改的主检出复现，分别属于说话手势、既有中文硬编码与日军进场步态；不计为本次武器修复通过。
