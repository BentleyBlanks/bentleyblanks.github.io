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

## 袖口与近景布料（2026-10-15，后续修整）

第一人称近看时，旧袖口覆盖腕关节和部分手背；第三人称布料细节在此距离又显得过粗。
本次用 Blender 的 `FpsTailoredSleeves` 形态键收窄袖口、退回袖边，并沿原边界加入轻微卷边。
原拓扑保持 3,916 顶点／7,608 三角形，修改其中 739 个顶点；游戏 GLB 仍为 6,139,476 字节。
右袖末端向前臂退约 3.5 cm，左袖约 1.35 cm（游戏骨架缩放 0.7 后）。
袖口近端截面的 95 分位半径由右 6.48 cm／左 7.68 cm 收为右 4.67 cm／左 5.53 cm。

`FPS_CLOTH_DETAIL` 沿用同一张纹理、同一着色程序，细化布纹频率并减弱凹凸与明暗。
通过材质上的模型标签选择第一人称参数；场景军装仍用原参数。
异步加载的纹理 uniform 保持共享，数值 uniform 独立，不新增采样器。

原始工程在 `C:\Users\Bentl\OneDrive\AI\Models\Blender\Taierzhuang1938\FpsHandRealism_20261015\Model_FpsHandRealism.blend`。
同目录的 `Model_FpsHandsBeforeTailoring.glb` 是未修袖口的原始输入；SHA-256 为
`201385ad575a48ab0e003bdd77fcde2ba76d9f94a070e48d8dfe6233722f3d63`，也可从提交 `b6a87898` 的游戏模型恢复。

重建时用生命周期脚本打开此工程，任务名 `FpsHandRealism_20261015`；
MCP Python 设置 `FPS_PROJECT_ROOT` 为本 worktree 的 `Taierzhuang1938` 路径，再执行
`_blender/Script_FpsSleeveTailoring.py`。输入哈希不符会拒绝重烘，防止反复缩窄。
脚本只重写原 GLB 的衣料 POSITION／NORMAL，写入前逐字节检查其他二进制数据不变；
骨架、逆绑定、皮肤、手指、权重、UV 和内嵌图都保留，避免重新导出骨轴破坏握持。
工程含贴图和可逆形态键；完成后仍需 `stop --save` 与 `status --scan`。

`FpsSleeveTest` 检查真实 GLB 袖口边界、四件装备固定骨段与握点残差、实机近景材质参数，
并在 high 画质输出玩家／右后方检查图，原图在 `_shots/FpsSleeves`。
本轮未把现有手部外观评为 3A：去掉贴图的 Blender 检查显示左掌旧有放大量造成厚度比右掌约大 22%，
指关节和腕部表面也需继续修形；涉及指腹接触面的调整必须重新验收握持，不能只整体缩小。

本次袖口版本通过 `FpsSleeveTest`、`FpsArmTest`、完整 `FpsHandContactTest`、
`GrenadeThrowTest`、`DadaoSwingTest`、`MotionVectorContractTest`；
材质门禁的 12 个画质／场景组合通过。另有资产、骨架、人物表面、模块图与测试注册检查通过。
合入主线 `beebbd8d` 的新版捷克式及逐指适配后，再次通过袖口／画面、指腹接触、资产规范、
模块图、场景几何和运动矢量检查。大刀截图脚本补上窗口尺寸同步与静止帧预热，
复测首帧正常，避免把窗口改尺寸后的空缓冲当成动作画面。

`BootTest` 未通过，不能报告全部门禁全绿。本树在 phase 0 报爆炸点光包络／旧爆炸贴图实例断言，
phase 1 报日军远景辨识材质为 0，随后达到 240 秒上限。
用同一测试的 `--baseline-root` 只读检查未修改的主线 `beebbd8d`：
phase 0 等待资源 30 秒超时，phase 1／2 同样报日军远景辨识材质为 0，并达到同一 240 秒总上限。
两次启动结果分别保留，不把不同的 phase 0 表现说成已逐条复现，也未削弱或删除原断言。

## 手部体积、掌面与近景皮肤（2026-10-15）

后续检查找到旧修形的不对称倍率：左掌法向放大 1.60／右掌 1.30，
左指横截面放大 1.48／右指 1.12（拇指为 1.42／1.15）。
`Script_FpsHandAnatomy.py` 在 Blender 中按原关节权重反解旧体积场，再施加与右手一致的倍率；
采用可逆 `FpsBalancedHandVolume` 形态键，法线按同一变换修正，保留原有平滑表面。
三处掌厚左右比由约 1.23 回到 1.0000–1.0003，指节半径差异小于 2%。
独立 `FpsHandAnatomyTest` 直接测 GLB 截面，旧资产会明确失败。
本次只改皮肤 POSITION／NORMAL；骨骼、逆绑定、权重、UV、内嵌图及已修好的袖口逐字节保留。

肤质采用独立 `FPS_SKIN_DETAIL`：减轻远景手部的双倍积泥与粗大毛孔，保留皱褶和局部污渍。
实际使用这份手模的第一人称装备统一采用近景参数；场景人物仍用原参数，纹理与着色程序继续共享。

握持按真实网格重新校正。大刀原左手的食指位于小指靠柄尾的一侧，拇指容易靠到尾环；
现在改为常规双手下劈握法，两手食指均朝刀刃，左拇指在刀柄另一侧对握。
`DadaoSwingTest` 从真实骨骼检查每一帧的食指／小指顺序，避免反向握姿再次混入。
集束弹支撑中指、捷克式拇指／食指／小指也按实体表面调整。
拟合采用各骨骼的逆绑定与原始顶点重新蒙皮，核对与运行时的顶点重放误差后再写数据；
指腹目标与完整指节的穿入分别计量，握点残差为零不能代替表面检查。

共享手模收回体积后，汉阳造支撑拇指／食指曾出现约 4.8 mm 间隙，现已重新贴合。
还修正了静止呼吸片段覆盖新指型的问题：仅重烘既有 Idle 中九条恒定手指旋转轨道，
原有呼吸、臂部、所有位置、武器控制轨与时长保持原值。
`FpsAnimationTest` 增加恒定握持轨与当前握姿一致性的断言。

源目录为 `C:/Users/Bentl/OneDrive/AI/Models/Blender/Taierzhuang1938/FpsHandAnatomy_20261015`。
几何工程 `Model_FpsHandAnatomy.blend` 保留旧形与新形；输入 GLB 为
`Model_FpsHandsBeforeAnatomy.glb`，哈希 `6df171a4ceee91d06023f8c53ab95b33ec13e9085d1cf82644fd4853e23e701b`。
通过本任务独占 MCP 执行 `Script_FpsHandAnatomy.py`（设置 `FPS_PROJECT_ROOT` 与
`FPS_HAND_EXPORT=True`）；`Script_FpsWeaponGripExport.mjs --clean` 导出真实蒙皮和检查图，
`Script_FpsAnatomyGripFit.py` 负责握持校正，`Script_FpsIdleGripRefresh.py` 同步既有呼吸片段。
源目录保留输入与拟合报告，原始 `.blend` 和截图均不进入网站仓库。
这一节记录手部迭代，整体 3A 真实感目标仍需继续视觉审查。

合入主线 `c5e4439c` 的新装填机构后，12 项专项检查通过：模块图、测试注册、资产规范、
手形截面、全武器手臂、真实指腹接触、新装填机构、投弹、大刀动作、呼吸片段浏览器播放、
运动矢量，以及 high 画质 GI 关／开的采样器检查。此结果不等于全仓所有门禁通过。
大刀两侧食指相对小指的刀柄轴距离均约 −7.18 cm，整条挥刀逐帧保持朝向刀刃；
轻斩的腕角上限仍约 63°，刀尖路径与刃向沿用已验证的轨迹。

最终 `Animation_FpsHandAnatomy.blend` 同时保留 `Scene_FpsHandAnatomySculpt` 与
`Scene_FpsHandAnatomyPlayback`。后者包含四种握持及普通弹／大刀的采样回放。
四种静态蒙皮均逐顶点与运行时核对，最大误差小于 0.000001 m；
检查件材质不替代游戏内高画质验收。用新工程重建时给 `Script_FpsSkinRepairStudio.py`
传入任务名 `FpsHandAnatomy_20261015` 及对应 sculpt／replay 场景名，可保留可逆形态键。
