# 第一人称手榴弹、集束弹、大刀与捷克式修复

2026-10-15，用户确认普通手榴弹可保留，并要求继续修正集束弹、大刀与捷克式。
下节记录这次返修；后面的初次握持、袖口、体积及扫描配准记录是历史依据，其中的旧接触数值和旧验收结论不代表当前版本。

## 实体贴合与左下劈砍返修（2026-10-15）

普通手榴弹的握姿数据保持原值。三件返修装备使用同一份扫描皮肤 Basis，
重新标定手掌、逐指骨骼与接触区，局部受压皮面在 Blender 中保存为独立形态键。
运行时只在对应装备、对应手仍握持时启用，脱手时随接触权重归零；其他装备的 Basis 不变。

- 捷克式左掌托在后机匣，避开折叠脚架。小指自然回收，支撑由掌面及真实指节承担；
  不再把五个合成指尖都强拉到枪体。右手保留扳机屈曲相对握持姿态的增量。
- 大刀两掌转到刀柄约 20 × 40 mm 截面的窄侧，食指均朝刀刃。
  修正环指、小指的握柄弧线，食／中指局部用小范围指腹修形；不把远侧皮肤整体拖进刀柄。
- 集束弹右手恢复食指靠弹头、小指靠柄尾的轴向顺序，拇指指腹与掌面在木柄两侧对握。
  左手自然托住凸出的两条实物绑带；掌面、拇指和小指构成分布支撑。
  平展的食指与中指没有贴住钢制弹头，不能据此声称所有指腹都接触弹头。

每个局部修形均独立检查闭合装备实体的 winding、完整皮肤三角与装备三角关系、
新增自交、翻面、UV 分点一致性、原始蒙皮反解及对侧隔离。
形态键的最大原握姿位移分别为捷克式左手 3.42 mm、大刀双手各不超过 3 mm、
集束弹右手 0.44 mm、左手 3.6642 mm。左手只在三个掌边点超过最初的 3.5 mm 预算，
最终明确采用 3.7 mm 局部预算；完整几何门没有放宽。
受压掌边的真实闭合皮肤截面仍约 26–32 mm，拇指约 12–18 mm；这是表面间跨度，
不是骨皮厚度，也不代表进行了软组织力学模拟。

游戏模型含五个形态键，默认权重均为零；完整名单、通道哈希和形变范围在
`Model/Data_FpsGripCorrectives.json`。原模型的 3,667,368 个二进制字节逐字节保留，
包括 Basis、权重、骨架、衣袖、UV 与内嵌贴图。
`Script_FpsGripCorrectiveAssetTest.mjs` 独立检查这些原始字节、描述符、形态通道及手侧范围。

运行时按握持权重变化在 CPU 求值同一组 P/N/T，普通持握帧不重复更新；
模板与各武器实例的 GPU morph 通道清空，原始 Basis／形态数据和逻辑权重保留。
这是为消除新增 `morphTargetsTexture` 导致的高画质第 17 个采样器，
保留原有材质、GI、阴影与细节贴图，不提高 16 个采样器的门槛。
各池有独立动态顶点缓冲，脱手与 Detach 恢复原 Basis；导出器读取已求值属性一次，
`morphState.evaluation='cpu-attributes'` 明确采用单次 Float32 写回。
检查器的形态滑块继续支持 Basis／部分压形／当前实际皮面。
`Zb26@mounted` 与普通捷克式的真实掌面及逐指四元数相同，明确复用左手修形；
架设检查同时验证该修形启用、其它修形关闭，以及真实托枪区和末节指腹接触。

捷克式的接触门在 `Script_FpsZbContactGeometry.mjs` 中由手持／架设测试共用。
左手检查真实承载面积、对向法线及闭合枪体穿入；右手只取真实扳机上下两杆，
排除护圈，检查末节指腹完整三角的有限接触面积、物理点数、最近间隙和完整末节的实体深度。
旧末端标记到下扳机约 20 mm 不能代表实际指腹贴上扳机的接触。
本次真实 JS 几何复核的静态／扣动面积约 6.34／8.11 mm²，
完整末节的外部深度见证约 0.408／0.869 mm（包含 1 µm 余量）；
这仍是允许 1 mm 浅接触的几何近似，不声称右手全表面零穿入。

大刀重新在 Blender 编排蓄势、切入、左下随势与回架；一条基础控制轨映射既有攻击时钟。
肩带成对平滑转动，最大肩位移动约右 35.2／左 54.3 mm，保留双骨长度。
`Data_FpsDadaoShoulderBelt.json` 保存肩带计划，`Data_FpsDadaoElbowPoles.json` 保存连续肘轨。
腕弯上限仍为 65°；不能以“肘永远低于腕”的画面 Y 轴代理替代实际袖／刀几何。
短斩幅度在导出的 `compactPositionScale`／`compactRotationScale` 中配置，避免短斩收在画面正下方。

当前源工程：
`C:/Users/Bentl/OneDrive/AI/Models/Blender/Taierzhuang1938/FpsGripConformity_20261015/Animation_FpsGripConformity.blend`。
`Scene_ScannedHandRegistration` 保留原扫描网格与可逆形态键；
`Scene_FpsDadaoConformityStroke` 保留刀、肩带与肘部控制轨。
最终 CPU 动态回放已实际重做并通过，共 121 帧，每帧 32,935 个顶点；
`maximumAnimatedSkinErrorMm` 与 `maximumKeyframedSkinErrorMm` 均为 0.0007468396 mm，
与 CPU 切换前批次的误差量级一致。本次动态回放报告中的静态蒙皮误差为
0.0005440839 mm，武器矩阵元素最大绝对误差为 3.5762787 × 10⁻⁷。
输入为 `FrozenCpuFinal` 的四个 CPU 包与 SourceBake，捕获时间为
`2026-10-15T14:34:20.215Z`，`captureRole='ProductionDadaoSwingTest'`，包含完整 `runtimeStroke`。
控制签名为 `55d0bf2afe394614b60c32d512040949907867ae60a218c1b0879ebde1fccf9f`。
`FinalInspection/Runtime` 及 `Data_DadaoReplaySkin.json`／`Frames.json`／`Validation.json`
均已刷新为这批最终输入／结果。工程实际保存关闭后重新打开复验，
中性网格与五个形态键仍完整，坐标和默认值保持；游戏 GLB 的 SHA-256 仍为下述完整重烘值。
`FinalCpuSkinExport` 已通过，耗时 72.5 秒：四个导出包均标记 `cpu-attributes`，
五键库存正确，GLB 形态求值后的 `rest` 与导出值的误差均为零。
`FinalInspection/Runtime` 已刷新为这批 CPU 输入，
`Scene_FpsGripConformityFinalInspection` 的四套静态 Blender 蒙皮检查实际通过；
中性网格与五个形态键的 preservation gate 同时通过。
下表为 `maximumSkinReplayErrorM × 10⁶`，单位为 µm：

| 装备 | 最大静态回放误差（µm） |
| --- | ---: |
| 普通手榴弹 | 0.570432 |
| 集束弹 | 0.572484 |
| 大刀 | 0.593246 |
| 捷克式 | 0.578848 |

四套最大值为 0.593246 µm。静态检查与上述动态回放分别量测，误差字段不互相替代。
重开复验后再次关闭本任务 Blender，`status --scan` 确认本任务无实例；其他任务实例未触碰。
`BakeCorrective/<形态键名>/` 保存增量作业及审阅 GLB；最初捷克式审阅件位于 `BakeCorrective/` 根目录。
原 Basis 可从清单内的 Git 对象恢复，也已归档为源目录内的
`Model_FpsHandsBeforeGripCompression.glb`，SHA-256 为
`15b1587cfbe4ee0522d15e71baf32eec5a5a99102fb62eed46b99ab1ed32ae01`。

重建使用仓库的 `Script_BlenderMcp.mjs start/exec/stop` 生命周期，任务名为
`FpsGripConformity_20261015`：

1. 打开上述源工程。`Script_FpsGripCorrectiveBake.py` 接受 `FPS_PROJECT_ROOT`、
   `FPS_CORRECTIVE_BASIS_ASSET` 和有序 `FPS_CORRECTIVE_JOBS`（每项含 `input`，可选 `output`／`outputDir`）；
   每个作业必须已有独立有效审计。完整重建从原 Basis 起步，按清单次序烘焙
   Zb26Left、DadaoLeft、DadaoRight、GrenadeBundleRight、GrenadeBundleLeft。
   增量烘焙才把 `FPS_CORRECTIVE_BASE_ASSET` 设为上一份审阅 GLB；脚本逐字节保留其已有形态键和原 Basis。
   审阅件位于源目录，不直接写生产资产。
   `FinalRebuild/Script_RebuildFinalGripCorrectives.py` 已保存完整五作业入口，
   后续优先读同目录各形态键的冻结作业／运行时包／独审；`FPS_REBUILD_PROJECT_ROOT` 可指向新检出。
   本次从原 Basis 完整重烘后的 GLB 与游戏文件 SHA-256 均为
   `419f2df589cbaa566863059aa6a055a22c0686b12338eec6eecfcf726f46f962`，
   原始二进制前缀、全部 15 个形态通道及源网格／五键坐标完全一致；
   报告为 `FinalRebuild/Data_FinalGripRebuildValidation.json`。
2. `Script_FpsDadaoPhysicalStroke.py` 导出刀与肩带控制轨；
   `Script_DadaoSwingTest.mjs --trace --export-source` 导出签名对应的真实骨骼／相机轨。
   用 `Script_FpsDadaoElbowFit.py` 拟合后再次重烘；bootstrap 状态不能作为最终验收。
3. `Script_FpsWeaponGripExport.mjs` 的 `rest` 是当前形态求值后的蒙皮前位置，
   有活动形态时另写 `baseRest`，因此原始位置读取为 `baseRest ?? rest`。
   `morphState`、`wristBend`、`contactWeight` 一同输出；求值后的 `rest` 只使用一次，不能再叠加形态位移。
4. 四装备静态检查执行 `Script_FpsSkinRepairStudio.py`：设置 `FPS_GRIP_PROJECT_ROOT`、
   `FPS_GRIP_SOURCE`、`FPS_GRIP_TASK`，`FPS_GRIP_INPUT` 指向 `FinalInspection/Runtime`，
   `FPS_GRIP_STATIC_ONLY=True`，`FPS_GRIP_SCULPT_SCENE` 选本任务作者场景，
   `FPS_GRIP_REPLAY_SCENE='Scene_FpsGripConformityFinalInspection'`，
   `FPS_GRIP_BLEND_NAME='Animation_FpsGripConformity.blend'`。静态模式不读取历史动画轨，也不重命名作者场景。
5. 大刀精确动态回放执行 tracked `Script_FpsDadaoConformityReplay.py`，同样设置项目、源目录和任务变量，
   首次显式传 `FPS_DADAO_SKIN_INPUT`（最终实机 Dadao 皮肤包）与 `FPS_DADAO_REPLAY_INPUT`
   （本次 `Data_DadaoSourceBake.json`）。输入必须有 `captureRole='ProductionDadaoSwingTest'`、
   `capturedAt` 及相符控制签名；脚本还检查当前 GLB 的形态求值、UV、索引、权重和逆绑定。
   依赖当前 `Model_Dadao.tzm.json` 及 `Script_MeleeWeaponMaterials.py`。
   成功后源目录保留 `Data_DadaoReplaySkin.json`／`Frames.json`／`Validation.json`，后续默认优先读这些副本；
   `FPS_DADAO_REPLAY_SCRIPT` 可省略，默认嵌入 tracked 自身。
6. 保存后执行 `stop --save` 和 `status --scan`，只停止本任务实例。

本次大刀方向专项在 1280×720／1440×900 的五种攻击均通过，
实际屏幕斜劈约 47.5–48.5°，贴身短斩同样达到左下随势区域。

### 本次验收进度（CPU 最终批次）

最终 CPU 后端已通过以下八项：完整 `FpsArmTest`、完整 `FpsHandContactTest`、
`EmplacementViewBrowserTest`、`FpsGripEditorTest`、`GrenadeThrowTest`、
`DadaoSwingTest`、`MotionVectorContractTest` 和 `SamplerBudgetTest`。
其中手臂门禁检查原始 P/N/T 通道保留、实际 CPU 皮面、释放后同骨 Basis、
重新握持及装备池隔离；接触与架设门禁共用捷克式真实皮肤／枪体几何检查。
这组通过结果属于 CPU 最终批次，不沿用此前 GPU 形态求值批次的结论。

`SamplerBudgetTest` 的完整 12 个画质／场景组合通过，耗时 1052.2 秒；
16 个采样器的门槛保持原值。此批 runner 汇总为通过 8、基线通过 0、失败 0，
总耗时 1589.5 秒；未启用 verbose，未取得每组合的实际最大采样器数，故不记录推测值。

原 194 项扩大回归在 `FirstLevelWhiteboxBrowserTest` 等待共享浏览器槽超过 60 分钟后中止，
退出码为 1。该批没有最终 194 项统计，不能推算总通过数，也不再记为正在运行。
固定 HEAD `da80d642dd4c710a46a08ffb8466ff4e67d774ab` 的六项浏览器基线和两项预热基线已实际执行完毕，
与原批次的问题逐项区分如下：

- `FirstPersonEmbodimentTest`、`AiCloseRangeTest`、`ExposureTest`、`TestSceneLightingTest` 的相同问题已在 HEAD 复现。
- `MeleeAnimationTest` 的 HEAD 还有约 65.43° 的旧 Parry 腕角问题；当前版本这一项已改善，
  但 `BayonetLight` 约 22.36 mm 的握点问题在 HEAD 也存在，不能把整份测试都当作本次已通过。
- `FrameDebuggerTest` 的 HEAD 在进入游戏后运行 477.1 秒，报编辑器切换未释放资源；
  当前 CPU 定向重试在 521.5 秒报相同资源释放断言。
  原 194 项批次中这一项是等待超时，单独保留，不把该超时说成已复现相同断言。
- `SavedGraphicsWarmTest` 在 HEAD 用时 143.0 秒复现原失败：未出手，炸死 0／3。
  `WhiteboxShaderWarmTest` 用时 96.5 秒复现进城后程序数 91 → 94 的原失败。

当前 CPU 的三项渲染定向重试已全部结束：`FrameDebuggerTest` 521.5 秒、
`SavedGraphicsWarmTest` 129.8 秒、`WhiteboxShaderWarmTest` 73.7 秒，
各自与 HEAD 的原断言失败相同；runner 统计为通过 0、历史基线 0、失败 3，共 725.0 秒。
这些仍是失败结果，独立 HEAD 对照不把它们计为通过。

已独立执行 `BackRifleRunTest` 与 `BulletDecalPbrTest` 原有的浏览器前静态断言，
当前输入和上述固定 HEAD 均在相同断言失败。
文本输入仅在 CRLF／LF 换行上有差异，不能声称原始字节完全相同；
运行时画面与浏览器失败不能据此一并归为历史问题。
合入上游 `f5a47d7d` 后，10 项交叉验证与原批次未完成的尾部 18 项组成独立的 28 项补充批次，
已执行完毕：通过 24、历史基线 0、失败 4，共 1576.4 秒；不倒算成原 194 项的最终统计。
其中交叉验证的模块图、测试入口、枪械动作、资产字节、运动矢量、手臂、真实接触、
换弹机构、实际输入响应及真实材质模型管线 10 项全部通过。
合入前后四件装备的最终握姿与骨姿逐值相同，六项最终源代码／资产及冻结输入也重新通过严格哈希核对。

- `FirstLevelP012DebugTest`：53.8 秒失败于烟雾数值颜色被数组展开。
  用 `f5a47d7d` 与当前原生产方法、真实 ShellShot 颜色输入逐步执行，两边均在第 17 帧抛出
  `TypeError: input.colorA is not iterable`；默认 palette 对照均正常运行 240 帧。
  这是原代码的 Node 因果复现，不冒称完整 HEAD 浏览器测试结果。
- `MenuTest`：383.8 秒，指挥室纹理计数与切大刀步骤失败。
  原 HEAD／当前的实际加载前缀与原 Check 在 Node 中均得到 20 张纹理，旧断言要求 19。
  原测试在启动投弹后未推进时间就切刀；两边原动作方法均处于 throw 忙状态，拒绝切槽，
  四帧后仍为 `primary/Grenade`。几何／渲染被隔离，这不等于完整复跑后续八条菜单 UI 断言。
- `BootInteractionTest`：146.4 秒；worker、UI 心跳、恢复和拖拽夹具通过，随后等待首页旧阶段文字超时。
  原 HEAD 与当前的原路由函数均将无参数首页交给菜单，实际文案为“正在夯地……→搭布景……→就绪”，
  均不匹配原测试的烘贴图／城内／着色器等待谓词；正控逐项匹配。
  两边菜单加载图的 186 个模块源码相同，未包含游戏主程序和手模控制器。
  这是 Node 原函数／谓词核验，不冒称原 HEAD 的完整拖动浏览器测试结果。
- `BootTest`：240.8 秒总时限超时；phase 0 等健康数据 30 秒超时，phase 1 的日军远景材质计数为 0。
  独立固定 `f5a47d7d` 的原测试也在 240.3 秒总时限超时，保持原画质、全部等待与断言。
  HEAD 的 phase 0 同样在爆炸图集等待处 30 秒超时，phase 1 同样报远景材质计数为 0；
  HEAD 的 phase 2／3 也报相同计数，随后在 phase 4 导航后被原总时限终止。
  这是相同失败的独立浏览器对照，不代表七个阶段已全部完成或通过。

本节不代表全套回归全绿，也不以历史章节的“通过”替代此次验收。
交付目标为仓库 `master` 对应的 GitHub Pages；实际交付版本以 Pages 部署的提交为准。

## 历史迭代记录

### 握持与接线

- 普通手榴弹的 Blender GLB 已经是 Z 轴朝向；去掉 `BuildGrenadeProp` 再转四分之一圈的重复安装变换。
- 集束弹保留原尺寸木柄和七枚弹头，取消整体缩成 0.62 的视图模型特例；右手包柄，左手托弹头，重新安排三个持握状态。
- 捷克式与集束弹改用固定骨段的双臂，避免旧模型在运行时把前臂／腕部静止位移乘以 1.60。捷克式保留独立的扳机屈曲和工作手取匣手型。
- 三种非枪装备不再在开镜／冲刺时旋转手掌抵消肘部问题。掌面固定在实物上；状态变化移动整件装备。
- 四件装备的最终掌面和手指值统一在 `Data_FpsWeaponGrips.mjs`，由 `Data_FpsArmPoses` 组合；无需编辑已被覆盖的历史接触常量。

投弹的出手点在当帧骨骼求解后取真实掌心挂点。集束弹释放时双手张开，普通弹与集束弹各自使用其动作表的释放时刻；原伤害、库存和投掷规则继续由现有游戏逻辑负责。
（2026-10-21：集束弹改走自己的 Blender 投掷轨迹，左手在托起时先松开、右手出手时张开，见 [第一人称化身「集束弹过肩投掷」](Data_FirstPersonEmbodiment.md)。）

### 大刀

仍为一条基础劈砍曲线，映射到既有轻斩、交替斩、重斩、贴身斩与蓄力；没有新增第三人称动作。
修正双掌相对刀柄的方向与闭合，肩部由数据表驱动；固定骨段的大刀不再走旧刀具的硬编码肩位覆盖。

`Script_FpsDadaoPhysicalStroke.py` 用 Blender 控制轨采样蓄势、加速、切入、随势与回架。
`Script_FpsDadaoElbowFit.py` 在真实双骨肘圆上选择连续轨迹，约束腕角与回架时的肘部高度，输出 `Data_FpsDadaoElbowPoles.json`。
运行时直接采样这条轨迹，跳帧和连续播放经过同一肘部支路。
第一人称检查器“挥刀”和 `TriggerMelee` 的大刀直接调用也复用同一曲线与战斗时钟，双手保持握柄；不再走旧的支撑手向右掌重叠的程序动作。

历史批次 `DadaoSwingTest` 实测：轻斩有效刀尖路径约 2.03 m，向左约 0.62 m、下降约 1.15 m；刃向与切线平均点积约 0.973。
轻斩最大腕角约 63°；重斩、贴身斩、回架、转入防御与两种视口的可见性均通过原有判据。
这些是动画路径测量，不是伤害距离。

### Blender 源工程与重建

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

### 历史批次验证

`FpsArmTest`、`FpsGripEditorTest`、`FpsHandContactTest --only=Zb26`、`GrenadeThrowTest`、`DadaoSwingTest`、`SprintMeleeTest`、`MotionVectorContractTest`、`ModuleGraphTest` 通过。
高画质已查看四种装备的玩家与外部视角，并检查大刀关键帧。

全仓 quick 为 95／98：`SpeakerGestureTest`、`TextTest`、`IjaAlertGaitTest` 的三个失败已在未修改的主检出复现，分别属于说话手势、既有中文硬编码与日军进场步态；不计为本次武器修复通过。

### 袖口与近景布料（2026-10-15，后续修整）

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
历史批次未把现有手部外观评为 3A：去掉贴图的 Blender 检查显示左掌旧有放大量造成厚度比右掌约大 22%，
指关节和腕部表面也需继续修形；涉及指腹接触面的调整必须重新验收握持，不能只整体缩小。

历史袖口版本通过 `FpsSleeveTest`、`FpsArmTest`、完整 `FpsHandContactTest`、
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

### 手部体积、掌面与近景皮肤（2026-10-15）

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

### 扫描手形、连续腕部与力量握持（2026-10-15）

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
  历史批次 18 个采样点的拇指／食指表面间隙最大约 0.079 mm。
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
Innerscene / MakeHuman 的 CC0 手仅用于早期对比，没有进入历史批次运行时网格。

历史批次 18 项专项检查通过：ModuleGraph、TestRunner、AssetStandards、TextureStandards、RiggedModel、
CharacterSurface、FpsHandAnatomy、FpsAnimation，及 FpsArm、FpsSleeve、FpsHandContact（全部在架武器）、
FpsReloadMechanics、FpsGripEditor、GrenadeThrow、FpsAnimation 浏览器播放、MotionVectorContract、
SamplerBudget（high，GI 关／开）、含力量握持断言的 DadaoSwing。四件装备另有实机近景与挥刀采样图。
这不等于全仓所有门禁通过；此前 BootTest 的历史失败记录未以历史批次专项结果替代。
