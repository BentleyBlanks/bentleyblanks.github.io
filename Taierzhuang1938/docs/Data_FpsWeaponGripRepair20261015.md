# 第一人称手榴弹、集束弹、大刀与捷克式修复

2026-10-15，按用户所发第一人称检查图，通过本任务独占的 BlenderMCP 实例重新标定这四件装备。
武器保留原网格；`Model_FpsHanYangHands.glb` 的皮肤已用扫描手形重建，并重新拟合掌面、逐指旋转。大刀沿用 Blender 劈砍轨，补正护手下的力量握持。最新源工程见本文末节，前面的记录保留迭代依据。

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

## 扫描手形、连续腕部与力量握持（2026-10-15）

双手、腕部与前臂合为连续皮肤网格，采用 Artec 的真实手部扫描配准到原有骨骼。
配准在掌面平面内调整关节点，并保留厚度；不使用曾把手指压薄的三维共面插值候选。
手腕去掉扫描封口，与原前臂连接，连接区域没有开放边。左右手按相同骨骼中心镜像。
皮肤为 47,764 个三角，运行时 UV 分点后 29,019 个顶点；衣袖、53 根骨骼、关节顺序、
逆绑定、固定骨段标记与既有动作契约保持不变。

皮肤使用一套 4096² Base / Normal 图集。颜色由既有皮肤转移、平滑，指甲保留原颜色；
不再让旧身体图集的折痕横跨手腕。扫描法线在腕部 24 mm 过渡带渐退到焊接网格法线，
避免高模截口产生光照断层。材质 `Material_HanYangScanSkin` 同时覆盖手、腕和前臂；
旧腕环无图材质退出运行时。骨架与衣袖的原始数据由烘焙脚本保留，不重新导出它们。
清除未引用数据后 GLB 为 3,688,272 bytes，原版为 6,139,476 bytes。

- 普通／集束手榴弹重新贴合指腹与握柄、弹头表面；集束弹保留托举分工。
- 大刀右手沿柄下移 20 mm，拇指扣住食指近节，而不是伸向护手或刀身。
  因此拇指到武器的距离不是该握法的验收指标；应检查拇指与食指的真实皮肤表面。
  `DadaoSwingTest` 在六种攻击的起点、中点和终点检查这一接触及护手下的食指关节。
  本轮 18 个采样点的拇指／食指表面间隙最大约 0.079 mm。
- 捷克式支撑手沿枪身后移 20 mm，再拟合五指。扫描表面检查的最大穿入由食指约
  2.76 mm 降到约 0.42 mm；支撑手五指最大穿入均低于 0.5 mm，指腹间隙低于 1.1 mm。
  不删除折叠脚架，也不放宽既有接触门禁。

源目录：`C:/Users/Bentl/OneDrive/AI/Models/Blender/Taierzhuang1938/FpsScannedHandPrototype_20261015`。
工程为 `Model_FpsScannedHandPrototype.blend`，输入 `Model_FpsHandsBeforeScan.glb` 的 SHA-256
为 `0668606ced664768f78b244ce2b8d80dd5576900e0d80cc648e97c2b9e178d22`。
配准、高低模、权重、腕部连接、图集与指型拟合脚本均保留在该工程及其 `Scripts/` 目录。
`Scene_ScannedHandRegistration` 保留可编辑几何，`Scene_ScannedHandPlayback` 包含四件装备握持，
以及普通弹投掷和大刀挥动回放。静态蒙皮与实机逐顶点核对，最大误差为 0.000000668 m。
`Final/` 保存实机姿势包，`AnimationTraces/` 保存动作轨；重建回放时给 `Script_FpsSkinRepairStudio.py`
设置 `FPS_GRIP_ANIMATION_SOURCE` 到该目录，不依赖临时 worktree 内的截图目录。
游戏重烘入口为 `_blender/Script_FpsScannedHandsBake.py`：用仓库 BlenderMCP 生命周期 CLI
打开上述工程，设置 `FPS_PROJECT_ROOT` 到本任务的 `Taierzhuang1938`，再执行该脚本。
可设置 `FPS_SCAN_OUTPUT` 导出审阅件；省略时写入游戏模型。脚本验证输入哈希，重烘皮肤，
合并原骨架／衣袖，清除未引用缓冲，并核对骨骼变换与逆绑定逐字节一致。

扫描来源：[Hand — Artec Group inc.](https://www.artec3d.com/3d-models/hand)。下载包附带
CC BY 3.0 Unported，原文保存为 [License_ArtecHand.txt](../Model/License_ArtecHand.txt)。
本项目修改了配准、拓扑密度、权重、腕部连接、UV 和贴图；网页当前指向的 4.0 不替换下载包的 3.0。
Innerscene / MakeHuman 的 CC0 手仅用于早期对比，没有进入本轮运行时网格。

本轮 18 项专项检查通过：ModuleGraph、TestRunner、AssetStandards、TextureStandards、RiggedModel、
CharacterSurface、FpsHandAnatomy、FpsAnimation，及 FpsArm、FpsSleeve、FpsHandContact（全部在架武器）、
FpsReloadMechanics、FpsGripEditor、GrenadeThrow、FpsAnimation 浏览器播放、MotionVectorContract、
SamplerBudget（high，GI 关／开）、含力量握持断言的 DadaoSwing。四件装备另有实机近景与挥刀采样图。
这不等于全仓所有门禁通过；此前 BootTest 的历史失败记录未以本轮专项结果替代。
