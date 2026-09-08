# 第一关动画接力状态（2026-09-08）

当前用户要求为**48 项继续制作，只用已有视频，不重新生成或补拍**；复用恢复缓存、原游戏动作，后期补姿态、接触和协作装配，再做游戏接入。尚未完成全部动作；本轮接入侧凳支撑与扶腿起身子集。逐项字段、来源哈希和运行时文件快照见 [状态 JSON](Data_FirstLevelMissionAnimationStatus.json)。需求仍以 [完整需求](Data_FirstLevelMissionAnimationRequirements.md) 和 [视频转骨骼标准](Data_VideoToSkeletonStandard.md) 为准。

## 最新：停止补拍，扩展现有来源恢复与原骨架候选

用户最新指令“有什么就用什么”已落实到 `Data_FirstLevelSourcePolicy.json`；首轮单条生成和批量脚本会拒绝新视频提交，既有请求仍可单独查询。历史 17 条初筛建议补拍、失败医生片与数弹缺片，共 19 条已登记可见选段／既有动作／后期制作方案，旧 3400 积分预算不再是当前任务前置条件。本轮最后实查余额 60，数弹原 ID 仍 querying；没有新视频提交。

已同步最新上游 `2569928d3`：新增靠墙侧身功能，第一关任务、人数和对白表未变。仍为 41 列车 NPC、20 架、36 轻伤、14 医护、8 百姓、8 守军，老周 Litter11。来源覆盖历史仍为 47/48；FL16 复用坐姿另制数弹候选，不冒称已有数弹视频。

担架 V17／HoldV2 分别对应 FitV33／FitV34，复用 V10／BaseV12 和原 raw。每组五套人物 × 三档身高 × 前后位共 30 clip，20 GLB、五个可编辑 `.blend`。按原 bind 肘弯平面对齐上臂，减少袖子裂口；两个组各经 7230 个 120 fps 重载样本，最大腕角 9.1334°／4.4504°、掌误差 0.1696／0.00084 mm、最低鞋底 1.7604／1.9999 mm、材料点漂移 0.3239／0.000199 mm。工程重开与掌指近景已完成，冻结为需修正、未接入。肩部折痕和完整掌指表面接触仍未接受。握高／床面 0.98／0.86 m、握点 ±1.24 m 与杆长 2.63 m 只用于试制，游戏消费方仍未改尺寸。

持稳作者动画使用 `review.sourcePoseSeconds=5.0666667`：原视频和 raw 停在该源姿态，模型独立播放 2 秒呼吸。其他动作仍按选段时间三栏线性同步。旧播放器、V16／HoldV1 失败证据及冻结工程保留。

本轮完成 33 条来源的二维密集抽样页审阅，并在既有观察缓存上首次恢复与原骨架导出；加上此前 10 条，首轮 60 条已落盘视频中已有 **43 条 raw 恢复**。原始关节 JSON、可编辑 raw rig、目标人物 GLB 与 `.blend` 均保留。四组是身体候选，均未新增游戏接入：

| 私有批次 | 条目 | 本轮证据与状态 |
| --- | --- | --- |
| FirstLevelLifePatientV1 | 站姿扶稳、取食、卧姿喘气、患者躺回、找布，共 5 条 | 2515 个 60 fps 保真样本，40 三栏截图、实际看 12 图；口部／床面／道具接触与深度待修，已冻结。 |
| FirstLevelRescueLocomotionV1 | 空手转向／走停、吊臂走、拖救者、失握倒地、松手扑倒、补位、指挥，共 8 条 | 4072 个 60 fps 样本，64 三栏截图、实际看 16 图；倒地末态悬空、伤臂手位、脚部和协作接触待修，已冻结。 |
| FirstLevelRemainingBodyV1 | 背枪走停、收取枪、低姿转向、取放、交谈、护头、患者失衡、后端装车、推车、持架松手、百姓与日军，共 12 条 | 11 NRA＋1 IJA，6468 个 60 fps 样本，96 三栏截图、实际看 24 图；枪／车／包裹／担架尚未装配，深度与手部接触待修，已冻结。 |
| FirstLevelSourceLimitedV1 | 压布、患者滑移、医护检查／转救、拉栓取弹、机枪入离位、推架上台、放箱，共 8 条 | 4672 个 60 fps 保真样本，64 三栏截图、实际看 16 图；源帧遮挡／出画另有带哈希的复用决定，已冻结为受限实验，接触和缺失姿态须后期补做。 |

新救援、其余身体与受限组的模型取景按实际 GLB 全程所有网格顶点（15 fps，含首尾）量测，额外留边；只改预览相机，不改原 raw 或模型。救援组旧取景失败及预览服务退出记录保留，修复后 8 模型／40 姿态均入镜，最大投影 0.69951；源同步误差约 0.000001 秒。数值保真不等于接触或自然度通过。

其余身体组 12 模型／60 姿态的最大投影为 0.68470，受限组 8 模型／40 姿态为 0.71909，均通过入镜验证。12 条保真结果按 NRA／IJA 分开保全并合并，防止筛选报告覆盖另一阵营证据。

全库原数据验证通过：83 份 raw 数组、60 份可编辑 raw rig、736 个链接；全库浏览器检查 140 个当前阵营版本，其中 108 个带 raw 引用，播放、暂停、逐帧、拖动、历史切换、原片固定帧与模型独立播放均通过，错误为零。这个口径不包含随后新增的数弹动作，不能与历史 variants 总数混用。

FL16 新增 `FirstLevelAmmoAuthorV2`：四套原人物各一个 10 秒作者动作与可编辑工程，复用 `FirstLevelTrainSupportV2` 的 0 秒坐姿；原片与 raw 固定在坐姿源帧，模型独立播放点数、停顿、搜索与抬头回应。保留 V1 道具悬空失败记录；V2 修了指尖轨迹和道具高度，四模型共 4804 个 120 fps 导出采样检查通过，骨架层级、bind、骨长和腿脚支撑保持。40 个三栏取景实际查看 8 图，已冻结为需修正：左手托袋、拇指包裹、真实拨弹及对白绑定未完成，五个静态弹药标记只是道具试制，未接入游戏。

最新数弹为 `FirstLevelAmmoAuthorV3`：同样四模型、四工程、4804 个 120 fps 独立重载样本；袋底按各型号实际腿面定位，五个弹药道具依次移动 32 mm，左手稳袋沿，右手非食指收拢，进出动作抬手避袋。另以 30 fps 共 1204 个姿态量测蒙皮：袋底离最高支撑顶点约 1 mm，手部顶点穿袋深度最大 0.03572 mm。已实际查看八张全身三栏与四张 NRA01 手部近景；第一张近景的原片尚在加载，仅作为手部细节证据。已冻结为接触改善候选：袋和弹药仍为几何试制，右手收拢自然度、真实弹药表面接触与刘文财／VoiceEvent 绑定仍待验，未接入。数值只覆盖袋体内部顶点，不等于全三角形无穿插或握持已验收。

本轮未改运行时。32 个侧凳身体支撑／扶腿起身仍沿用 GameV2 已接范围；FirstLevelTrainR13 是此前专项兼容证据。最新 `FirstLevelTrainR13Cover` 原骨架采样器检查四型号 × 九身高，共 36 个组合，实际采样器与独立 AnimationMixer、skin／bind、还原与 hitbox 位置均通过；完整关卡结果另行记录。相关 quick 检查 34 项通过、历史基线 0、失败 0，不替代新版完整浏览器通关。

本次随后完成当前构建的 `Script_FirstLevelMissionTest.mjs --audio` 及完整浏览器 `--campaign --audio` 回归，均退出 0。浏览器入口只改输出目录以保留旧证据，驱动与断言逐字核对一致。25 阶段正常走至 Complete（任务时间 1377.9833 秒），41 NPC 真实下车集合，41 条原录音全部经实际音频引擎解码播放；FinalExit 播完后才完成，玩家生命 76.8，老周仍为 Litter11 且死亡后生命 0。South 为 75.0167 秒、TransferApproach 为 45.0167 秒、Transfer 为 181.4167 秒；Death 阶段含等待共 16.0167 秒，实际死亡接管 11.9833 秒。证据独立冻结于 `FirstLevelTrainR13Campaign`，未覆盖 GameV2／Cover。已查看车厢、救护、老周死亡和完成四张截图；救护与死亡仍使用旧持枪／占位姿态，此次通过只证明现有流程及已接侧凳子集兼容，新数弹、33 条身体候选和担架 V17／HoldV2 均未接入。

48 行看板、60 个链接及 FL16／FL26／FL38／FL43 已核验；数弹与担架持稳的固定原片／raw、独立模型播放及 1/60 秒逐帧检查通过。修复无片时的空播放器；页面与截图仅保存在私有预览目录。

加入数弹 V1–V3 后，当前原数据／链接检查为 83 份 raw 数组、60 份可编辑 raw rig、760 个链接、94 个动作，全部通过。上面的 140／108 浏览器全库统计仍对应加入数弹前；数弹四模型与当前控件使用本轮专项记录。

- [最新担架](http://127.0.0.1:8136/Preview/index.html?action=StretcherPair)／[双脚持稳](http://127.0.0.1:8136/Preview/index.html?action=StretcherPairHold)
- [48 项看板](http://127.0.0.1:8136/Preview/FirstLevelSourceBatchV1/index.html)，区分原片、恢复、修正计划和已接范围。
- [数弹作者动作](http://127.0.0.1:8136/Preview/index.html?action=TrainAmmoCountAuthored)，四套模型在效果历史中查看；原始数弹请求不再补交。

## 历史：担架 V15 腕部与床面避让，同步上游 r13

本轮独占 worktree 已快进到 `d3fe8deea`。上游新增日军跳线跃进／分批增援、708 具背景遗体与渲染优化；动画需求文档在该次上游提交中未变。`MISSION_VERSION` 仍为 `first-level-20260907-r12`，本轮状态按实际提交和哈希区分构建。41 列车 NPC、20 架、36 轻伤、14 医护、8 百姓、8 守军与老周 Litter11 保持；任务及对白事件未被本轮动画脚本修改。

素材仍覆盖 **47/48**：首轮 60 条落盘、1 医生片失败、1 数弹原 ID 待对账，17 条初筛需补拍。本轮实查即梦余额 **60**，旧数弹请求仍 `querying`；已知 18 条补拍／医生重做约 **3400**，缺 **3340**，不含后续新发现的返修。本轮没有新增付费视频或 GVHMR 推理。

V15 对应 `FirstLevelCarryFitV26`，复用 V10／BaseV12 与原 raw。五套原骨架 × 三档身高 × 前后位共 30 clip，另有 10 个单人 GLB、5 个双人 GLB 与 5 个可编辑 `.blend`。人体留在床端之外，手掌同时滚转／前后倾，再按原关节层级包握手指；未启用实验躯干倾角修正。试制握高／床面为 **0.98／0.86 m**，作者参考速度 **0.40 m/s**；游戏仍 **0.88／0.76 m**。

独立重载 7230 个 120 fps 样本通过：最大腕部折角 **12.595°**（V13 为 **95.471°**），掌点误差 **0.0886 mm**，跨接触阶段鞋底材料点漂移 **0.1317 mm**，最低鞋底 **1.9446 mm**，臂腿骨长变化 **0.0332 mm**；30 个原手指关节的局部位置换算世界误差最大 **0.00438 mm**。实际蒙皮顶点未进入床盒超过 1 mm；床面穿模现为失败断言，不再只列指标。手部插值旋转连续门槛仍为 5°／120 fps，未放宽。

真正重开五个 Blender 工程、重载双人 GLB，并完成 36 个三栏取景、36 个原掌指近景和 36 个改进视角近景。实际看 14 图后冻结为**需修正、未接入**：腕部改善，步态仍比原片屈膝；完整掌指表面接触未逐型号接受。部分原近景被身体挡住，另存 `ContactsClearView`，不覆盖原图。患者、双脚支撑待机、抬放／松手、起停、转弯、坡道、门槛与装卸仍待制作。

V14 腕角曾降至 28.94°，但人体向床内移后出现最大约 **7 cm** 床面穿模，已另写拒收报告，15 个 GLB 和当时脚本保留，未装配或登记预览。FitV19–26 的路径、哈希与诊断分支见 V15 私有迭代记录。**纠正旧描述**：V13 肩中心—骨盆轴量测为向游戏 -Z 前倾 **3.897–7.071°**，此前“后仰”属目测误判；新增纠正记录，旧冻结报告不覆盖。

当前上游构建已重跑原骨架采样器、真实车厢起身／队列衔接、任务纯规则与原音频、模块图和测试入口。起身骨盆速度最大 **0.7353 m/s**、静止脚漂 **0.0893 mm**、原 mixer 骨盆局部误差 **0**。独立保存为 `Models/FirstLevelTrainR13/Data_CompatibilityValidation.json`；**本轮未重跑完整关卡**，GameV2 旧完整通关证据继续按历史展示。

- [V15 三栏同步预览](http://127.0.0.1:8136/Preview/index.html?action=StretcherPair)
- [48 项素材看板](http://127.0.0.1:8136/Preview/FirstLevelSourceBatchV1/index.html)
- 本地工程：`Blender/FirstLevelCarryV15`；模型与证据：`Models/FirstLevelCarryV15`，均位于专用私有库。

## 历史：担架 V13 五套原人物，脚底滚动通过，手腕与姿态待修

从最新 `5f7c51ed9` 继续，远端没有新增任务版本。素材覆盖仍为 **47/48**；本轮实查即梦余额 **60**，数弹原请求仍 `querying`。18 条已知补拍／医生重做预计 **3400**，缺 **3340**，不是全部后续返修的封顶价。本轮新增视频与推理均为 0。

原视频、V2 raw 和 V10 保留。新增 `FirstLevelCarryBaseV12` 将同一 V10 来源适配到 NRA01–05，补齐运行时实际使用的第五型号；没有覆盖 V10 的四份原候选。`FirstLevelCarryV13` 对应 FitV18，五套原模型、前后位与三档身高共 30 clip，另有十个单人 GLB、五个双人共用担架 GLB 和五个可编辑 `.blend`。

鞋底中立方向与材料点从原 inverse bind、POSITION 和 skin weights 标定，不再取旧待机脚姿。脚跟落地、全掌支撑、脚尖离地的后期步态保留同一材料枢轴，身体采用周期高度修正；手肘改为下垂方向。试制握高 **1.04 m**、床面 **0.92 m**、参考速度 **0.40 m/s**，均为本地制作提案。游戏仍为原 **0.88／0.76 m**，患者、第一人称握持、装卸与路线消费方未变，不能直接用新尺寸替换。

V12 的独立检查发现材料点上下漂移超过 1 mm：逐帧拉低到新的最低鞋底会移动滚动支撑枢轴。失败的模型、报告与原因保留；V13 只补实际穿地的间隙，不再向下拉。独立重新加载 30 组共 **7230 个 120 fps 样本**，最大支撑材料点漂移 **0.106 mm**、掌点误差 **0.218 mm**、最小鞋底间隙 **1.925 mm**、原肢段长度变化 **0.0332 mm**；门槛未放宽。另以同一导出模型连续跟踪跨脚跟／全掌／脚尖阶段的材料锚点，不在阶段切换时重置，最大漂移 **0.129 mm**，补充门禁通过。五个工程实际重新打开并对照，最大关节点差异 **0.024 mm**。

三栏新增 36 个取景和 36 个掌指近景，原片选段 4.566667–6.566667 秒保持同步。实际查看 NRA01 组合的多个时刻、四掌近景以及 NRA05 诊断图后，V13 冻结为**需修正、未接入**：抬肘改善，但前位仍后仰屈膝，掌指接触虽保留，手腕折角偏大；部分俯视近景被袖口遮挡。仍缺患者、持架待机、起停、转弯、坡道、门槛和装卸。首轮三栏取景遇本地 8136 服务中断，部分截图保留；恢复服务后完整复验通过。

本轮原缓存验证通过：50 份关节数组逐值对应原 NPZ、27 个可编辑 raw rig、518 个链接。任务纯规则及原音频检查通过，r12 的 25 阶段、41 NPC、20 架、36 轻伤、14 医护、8 百姓、8 守军及老周 Litter11 不变；没有重跑或冒称已重跑上一轮完整浏览器流程。GameV2 运行时哈希继续核验一致。

- [最新担架三栏](http://127.0.0.1:8136/Preview/index.html?action=StretcherPair)
- [48 项逐项状态](http://127.0.0.1:8136/Preview/FirstLevelSourceBatchV1/index.html)

复现到**新的版本目录**：先用 `Script_FirstLevelCarryRuntimeBake.mjs --revision 10 --output-group <新基础组> --models 1,2,3,4,5`，再用 `Script_FirstLevelCarryFitInspect.mjs --fit --group <新Fit组> --library-group <新基础组> --models 1,2,3,4,5 --grip-height 1.04 --body-offset .1 --speed .4 --export-group <新Carry组>`。随后执行 FitVerify（指定 `--fit-group`）、FitProject 及其 `--verify`、索引器、FitReview 和 ContactInspect；均传 `--root <库>`。V13 的脚本快照、哈希与接力记录保存在私有 Models 目录，冻结模型和审阅禁止覆写。

## 历史：担架 V11 游戏尺寸接触试制，仍需姿态修正

本轮继续使用最新 `7e5efc471` 的独占 worktree。新增视频和推理次数均为 0；实查余额仍为 60，数弹原 ID 仍 querying，来源覆盖仍为 47/48。已知 18 条补拍／重做预计 3400、缺 3340，未重复提交数弹，也未提交补拍。

`FirstLevelCarryFitV2` 首次按真实 `LugouCharacterRig` 的身高归一化、Actor 父变换与 0.96／1.00／1.04 身高量测 V10：四型号前后位共 24 组，正常抬运握点离掌面约 0.24–0.37 m，仅用手臂无法接触当前 0.88 m 握高。原 V1 鞋底筛选漏认下划线骨名，空样本已明确作废，未作为鞋底证据。

新 `FirstLevelCarryV11` 保留原视频、raw、V10 和游戏原 bind／层级／骨长。按当前床高 0.76 m、握高 0.88 m、杆距 0.58 m 试制接触；骨盆位置、下肢支撑步态与手臂是后期重建，不能称为全身恢复保真。四份无网格候选各有前后位与三档身高，共 24 clip；另有四个可编辑双人 Blender 工程、八个原人物单人模型和四个共用刚性担架的组合模型，均留私有库。

独立重新加载并检查 5784 个 120 fps 样本（含烘焙帧间插值）：最小鞋底间隙 1.906 mm，最大掌点误差 0.237 mm，参考速度 0.55 m/s 下支撑脚漂移 0.102 mm，循环矩阵误差小于 0.000001；原解剖肢段长度变化最大 0.034 mm。0.55 m/s 是制作参考速度，不能当作单目实测地速，也未写入任务。四个 Blender 工程实际重新打开验证，四个组合 GLB 逐帧与生产试算对照，最大位置误差 0.024 mm。数值验证的范围只是候选导出与平地接触。

三栏新增 36 个同步取景和 36 个掌指近景。实际查看组合的四个正／侧／斜视时刻与四掌近景后，V11 冻结为**需姿态与步态修正，未接受接入**：掌指包握有改善，但侧视仍明显深蹲、肘部抬高，与原片直立负重步态不一致；还缺持架待机、起停、转弯、坡道、门槛和装卸。患者未在该候选中装配，不能当 FL27 完成。继续检查握高与原人物比例的适配，不能仅靠大幅下压骨盆满足握点。

r12 的原骨架担架员仍使用上游片段；本次未改运行时、任务人数、对白事件或 GameV2 冻结证据。旧 FitV3 深蹲试算、FitV4 可达性计算试验和 FitV5 个别短身高穿地记录均保留，最终 V11 对应 FitV6；没有把早期试算算作通过。

- [前后抬担架三栏预览](http://127.0.0.1:8136/Preview/index.html?action=StretcherPair)
- [48 项状态看板](http://127.0.0.1:8136/Preview/FirstLevelSourceBatchV1/index.html)

复现入口依次为 `_import/Script_FirstLevelCarryFitInspect.mjs --fit --group FirstLevelCarryFitV6 --export-group FirstLevelCarryV11`、`Script_FirstLevelCarryFitVerify.mjs`、Blender 的 `Script_FirstLevelCarryFitProject.py`（生成后另传 `--verify`）、`Script_FirstLevelCarryFitReview.mjs`；均传 `--root <库>`。冻结版本禁止覆盖，返修必须使用新版本目录。具体原片、候选、工程和审阅哈希保存在私有 V11 目录。

## 已交付：同步 r12，重新验证侧凳支撑与起身

已将上游 `5ba0a4b59`／r12 合入本任务独占 worktree。25 阶段、41 NPC 与 20 架规模保留；新增步枪掩护／实际机枪点炮击／撤回接令的事实门、6 m/s 军列、原骨架担架员和分散候场均保留。r11 GameV1 的冻结报告及首次物理检查失败不覆盖，新版接入报告使用 GameV2。r12 的 12 项相关检查全部通过：车厢动画、任务、完整浏览器流程与原音频、呈现、第一关演员、ActorPose、模块图、测试入口、文本、资产标准、发布包及开机。旧 117 项记录仍是历史，没有声称本次重跑全部项目。

r12 首次车厢门禁检测到一名乘客在释放末段的骨盆速度为 1.986 m/s。独立原 mixer 探针确认骨盆局部轨道未改；混合鞋底最低点切换会突然撤去临时身体抬高。直接平滑相对抬高量会叠加原动作自身的接地跳变，试验达到 3.477 m/s，已否决并保留。最终只在释放期间和短暂收尾中让实际身体高度的向下回落按 0.12 秒时间常数衰减，继续保证鞋底不穿地；物理根和全部骨骼轨道不改。原 1.6 m/s 门槛未放宽，最终最大 0.735 m/s，16 名实际角色有连续样本，静止脚漂最大 0.0892 mm，独立 mixer 局部骨盆误差 0。释放后的渲染高度仍有短暂接地收尾，不把该世界高度速度当作原 GLB 自身速度。

2026-09-08 最新查询：即梦余额 60 积分，数弹原 ID 仍为 querying；18 条已知补拍／重做计划预计 3400，缺约 3340，未提交。

完整 r12 浏览器首跑在院落等待阶段触及本机 600 秒宿主执行上限。原日志与截图保留在 GameV2 的 Attempts/CampaignHostTimeout；私有 runner 将这一个测试的本机上限设为 1800 秒复跑，未改游戏计时、事实、人数、断言或跳关。复跑 1688.2 秒通过，最新 Complete 明确为 r12、任务时间 1439.98 秒；41 名原 NPC 实际下车。实际查看新版车厢与起身截图后，已冻结 `Models/FirstLevelTrainGameV2/Data_GameIntegration.json` 和独立 `Data_VisualAssessment.json`，只接受 FL13／FL17／FL21 的已列子集。

私有三栏页修复了内置浏览器对条件缓存响应的加载停滞：HTML、模块与 JSON 返回完整文件，MP4 仍支持 Range；已查看标准本地地址的原片、原始骨骼和最新模型。模型栏现在直接显示当前“需修正”等审阅状态，旧播放器与服务脚本留在本地历史目录。

新增 `FirstLevelMedicalV1`：复用已审阅二维缓存，托腿首次恢复 300 帧、老周卧姿衰弱首次恢复 360 帧；原 raw／PT 各自登记哈希。两条均导出独立可编辑原恢复工程和国军原骨架 V1 候选。导出检查共 1318 个 60 fps 样本，最大源骨段方向误差 0.000320°、独立关节位置误差 0.0021 mm；24 个自动三栏取景的源片同步误差为 0。这里只说明导出保真，不代表单目深度或临床协作正确。

实际查看两条各四个正／侧视时刻：托腿的起落和侧移可见，尚无患者腿部与手掌接触，脚部支撑待修；老周卧姿倾斜、没有担架与枕部支撑，松手和死亡保持待验。两条均冻结为“需修正”，没有接入游戏。托腿初次末段侧视裁到手部，已按全部导出关节轨迹另设查看中心与距离，模型与源片不变。

- [医护托腿三栏候选](http://127.0.0.1:8136/Preview/index.html?action=MedicSupportLegs)
- [老周卧姿衰弱三栏候选](http://127.0.0.1:8136/Preview/index.html?action=ZhouWeakeningDeath)

新增 `FirstLevelTrainReactionV1`：炮击惊缩／抬臂与保护左伤臂／坐下各首次恢复 240 帧，二维观察缓存未变。两条原恢复工程与国军原骨架候选已导出；958 个 60 fps 样本的最大源骨段方向误差 0.000121°、独立位置误差 0.0016 mm，24 个自动三栏取景同步误差不超过 0.000001 秒。首次检查因漏传 V1 参数而等待不存在的 V7 后超时，日志保留；正确参数复验通过，模型与门槛未改。

实际查看每条四个正／侧视时刻后，两条均冻结为“需修正”：惊缩的护头手掌高于帽顶、门柱接触未装配，身体后仰与脚部支撑待修；伤臂片保留左伤侧，但掌指包覆和木凳支撑未匹配，不能当成坐地或医护检查完成。两条未接入游戏，本次没有新付费视频生成。

- [炮击惊缩三栏候选](http://127.0.0.1:8136/Preview/index.html?action=TrainShellStartleBlock)
- [保护伤臂坐下三栏候选](http://127.0.0.1:8136/Preview/index.html?action=TrainWoundedArm)

## 历史：r11 侧凳支撑与扶腿起身接入原角色和真实队列

复用冻结的 TrainSupport V2／审阅 V4，四份原骨架动画库进入 `Animation/FirstLevelTrain`。32 个侧凳坐席按原角色型号与真实身高采样，保留 8 名站立新兵、罗班长和玩家。角色物理根在初次摆位时以站稳双脚中心为锚点，坐姿身体留在身后凳面；起身结束维持直立等待，只有原物理队列开始移动后才渐交回原行走动作。没有在起身结束传送角色，也没有重写任务事实或对白事件。

实际车板仍来自共享地形／结构高度。渲染支撑抵消 Rapier 的接触余量；站姿到原行走的旋转混合检查实际鞋底，只向上补偿穿地，保留原行走片段自身的离地高度。交回原动作后，这批角色的站立接地仍消费共享 GroundHeight；死亡、卧姿、近战和真实离地不套用。检查使用实际原蒙皮，不以脚踝当鞋底；CPU 取样刷新 SkinnedMesh 的 bindMatrixInverse，避免把屏外旧矩阵误判为穿地。

原骨名、层级、inverse bind 与命中骨架保留。四型号 × 九身高的生产采样与冻结动画库比较通过，position／quaternion／scale 逐帧还原。实际车厢中的谈话、休息、装备、进食、观察等活动和背枪挂接保留；这些上身手势仍是程序化过渡方案，不能声称专用视频表演、掌指和食物／数弹道具已经完成。

验收读取真实板凳蒙皮接触、41 人实际下车、起身期间暂停、站立等队列、进入行走及结束后的连续帧。完全释放后，另用独立 mixer 对照原动作的骨盆轨道，分别记录过渡速度与原行走循环的接缝；原跑步／占位行走仍有自身跳变，专用走路和步态接缝继续列为未完成，不能把本次接入算作步行自然度验收。第一关完整流程和原 41 段语音由现有 `--campaign --audio` 门禁验收。逐次指标、运行时哈希及证据位置登记到状态 JSON 的 `gameIntegration`；该记录只对本次脚本与资产哈希有效。专用逐阶下车、担架和老周救护仍未接入。

本批实测 144 个坐姿样本的凳面间隙为 0.933–2.228 mm；14 名实际角色连续起身，四型号全覆盖，静止脚漂最大 0.0892 mm，过渡骨盆垂直速度最大 1.141 m/s。完全交回原 mixer 后骨盆 local 变换误差为 0；原动作自身的速度跳变另记 3.708 m/s，仍待专用步态修正。完整第一关与原音频门禁通过。

prepush 共选 117 项：首次 75 项通过，PhysicsTest 的普通 phase=5 出现 3/40 人与实体重叠后停止；后续 41 项及原 PhysicsTest 复测通过。当前版与精确 HEAD 基线的默认运行均通过；导航按真实耗时分帧会使两次轨迹不同，另用相同导航推进节奏对照，两版从初始到 AI 验收的物理状态逐项相同，均 0/40 重叠。没有放宽断言、修改 AI 或抹掉首次失败；原日志、续跑、默认与受控对照的字节哈希随 `Data_GameIntegration.json` 留私有库。该结果为复测后通过，不能描述成首次全绿或默认基线失败。

- [本地游戏接入预览](http://127.0.0.1:8137/Taierzhuang1938/?whitebox=p012)
- [原视频／原恢复／起身 V4 三栏](http://127.0.0.1:8136/Preview/index.html?action=TrainBenchRise)
- [48 项素材与状态看板](http://127.0.0.1:8136/Preview/FirstLevelSourceBatchV1/index.html)

原素材仍覆盖 **47/48** 项；数弹原 ID 实查仍为 `querying`，余额 **30 积分**。17 条已知补拍与医生重做缺约 **3,370 积分**，未估计成全部返修的封顶预算。本轮无新付费生成或 GVHMR 推理，未覆盖原片、raw、原工程与已冻结审阅。

已按原片初筛缺陷准备 18 条补拍／重做方案，逐条绑定原任务 ID、回执与原视频哈希；[修正提示词](../_import/Data_FirstLevelSourceRetakeChanges.json)针对裁头、角色缺头、前后位错误、遮挡、踩台和错误内容修改构图与单人练习动作。用 `Script_FirstLevelRetakePlan.py --root <库> --observed-balance 30` 可重建私有 `Models/FirstLevelSourceRetakeV2/Data_RetakePlan.json`。该脚本只生成计划，**尚未提交、扣费为零**；18 条按原模型／时长一次成功预计 3,400，数弹原 ID 排除在本计划外，继续对账。

新增查看“托伤腿”和“老周衰弱”的 0.25 秒密集原片抽帧（41／49 个时刻），并完成 0.5 秒二维覆盖审阅（20／24 个时刻）。托腿片的台面遮挡膝踝，老周卧姿片的远侧手臂有遮挡；两条只允许制作首次三维候选，卧姿深度、死亡保持、鞋底和协作接触均未接受。观察准备走 CPU，未与浏览器回归争用三维推理 GPU；原片与既有恢复不变。

“炮击惊缩抬臂”和“护左伤臂坐下”各查看 33 个 0.25 秒源时刻和 16 个二维覆盖时刻。炮击片右手护头、左臂伸向门柱与屈膝追踪连续，进入首次三维候选准备；手与门柱的深度及掌面接触仍待复核。伤臂片坐到的是木凳，不能登记成坐地；右手护左上臂的伤侧须保持，二维覆盖中未见双腿或交叉手臂明显换位，三维深度与接触仍未接受。四条新观察记录均绑定原片、输入视频与关节点 SHA，尚未产生新三维恢复。看板区分只有源片审阅、已看二维覆盖、三维候选和游戏接入。

逐阶下车旧实测保留在 `Models/FirstLevelStairFitV1/Data_StairFitInspection.json`，r12 重测另存 `Models/FirstLevelStairFitV2/Data_StairFitInspection.json`，几何结果相同，由 [StairFitInspect](../_import/Script_FirstLevelStairFitInspect.mjs)直接读取最新布局与原候选 GLB：三车各有四级踏面，车板高 1.17 m，四级顶面分别为 1.02／0.77／0.52／0.27 m；没有独立车梯扶栏。当前审阅 GLB 的最低蒙皮点下降约 0.384 m（尚未施加游戏角色身高缩放），原片也只有台顶、两级低踏面再到地面。另保存 599 个时刻的双踝／脚趾及骨盆轨迹到 `Data_StairFootTrajectories.json`，左／右踝总下降约 0.400／0.379 m；这些关节测量不代表鞋底接触或已认定支撑区间。不能直接把整段根位移套入真实队列；后续须分别适配支撑脚、步幅、级数和扶手动作，原片／raw／V1 保留。

```text
node Taierzhuang1938/_import/Script_FirstLevelTrainGamePrepare.mjs --root <库>
node Taierzhuang1938/Script_FirstLevelTrainAnimationTest.mjs
node Taierzhuang1938/Script_FirstLevelMissionTest.mjs --audio
node Taierzhuang1938/Script_FirstLevelMissionBrowserTest.mjs --campaign --audio
python Taierzhuang1938/_import/Script_FirstLevelTrainGameRegister.py --root <库>
```

GamePrepare 只在私有库导出候选和清单；实际游戏资产在独占 worktree 中复制并验证。GameRegister 核验通过报告、运行时哈希、原模型哈希和完整通关记录后登记子集。验收网页、截图、视频、报告及 Blender 工程均留私有库／忽略目录。

## 历史：四型号起身 V4 支撑验证通过，新增两条车厢恢复

本轮没有新生成视频或扣费；数弹原任务和余额实查仍为 `querying`／30 积分。首轮 60 成功、1 失败、1 待对账及 17 条明确补拍保持，已知补拍费用缺约 3,370 积分；这不是全部后续修正的封顶费用。

`Models/FirstLevelTrainSupportV2` 登记为起身审阅 **V4**：复用原片、raw 和 V3，四套原游戏模型每套五档身高、479 帧。修正稳定支撑区间与膝弯求解基线；较高人物允许坐姿下调，起身时平滑释放。凳板顶 .48 m、厚 .14 m、深 .68 m；试制身体朝过道偏移为 01/02/04 号 .24 m、03 号 .28 m，尚未写入真实车厢。旧 V1 失败和既有 V2/V3 审阅保留，新组已冻结。

- 原网格 **4 型号 × 9 身高 × 957 时刻（120 fps）**通过：零顶点穿凳，坐姿间隙 **1.037–3.911 mm**，最低鞋底 **1.723 mm**，最大脚漂 **0.294 mm**，掌面间隙 **0.670–1.321 mm**，最大骨盆速度 **0.636 m/s**。原 bind、层级和骨长保持，骨段误差最高约 .02281 mm。这些有限采样不是任意时间／身高的数学证明。
- 完整人物／动画／凳板 GLB 与“原游戏 GLB＋独立动画库”在每型号 81 个时间／身高组合逐骨、逐顶点一致，外层缩放未重复施加。四个 `.blend` 重新打开，20 条 NLA 与 120 个关键帧接触通过。
- [起身最新三栏](http://127.0.0.1:8136/Preview/index.html?action=TrainBenchRise)默认 NRA01 V4，其余型号在效果历史选取。四型号实际播放完整 1 倍速，源片／模型时钟差最大约 **11 ms**，48 张正侧视事件图留本地。已看四型号坐姿侧视、03 号起身／掌面近景，以及三栏松手、正面和站稳末态。根、腿、腕和掌指是后期支撑修正，不能称全身／手腕恢复保真。
- **V4 未接入任务**：真实车厢座位、命中骨架、装备、坐姿循环和生活分层、起身到物理行走的衔接、暂停中断及游戏验收仍待完成。41 人队列及 r11 实际 VoiceEvent 保持，未修改任务、人数、对白或运行时代码。

新恢复 [长凳休息](http://127.0.0.1:8136/Preview/index.html?action=TrainBenchRest)和[整理背包](http://127.0.0.1:8136/Preview/index.html?action=TrainGearStow)：复用首轮原片，先查看 .25 秒源帧与 .5 秒二维关节点，再实际执行本机三维恢复。每条保留 240 帧原数组和独立 raw 工程，导出国军原骨架 V1 各 479 帧。958 帧导出保真通过，方向误差最大约 .000138°，关节点偏差最大约 .00155 mm；10 个三栏取景姿势通过。两条均未加凳子：休息缺掌腿／双足接触，整理背包的单目腿部深度偏直，另缺背包／包带／手指。已据起始与中段截图标为需修正，未启用。

另密集查看“接食进食”：实际为从地面盘中取食，只能复用进食段；接食仍缺合格配对，待审查其他可复用来源，未冒充完成。当前库核验为 **46 份原数组、23 个 raw 工程、486 条文件链接、53 个目录动作**。全库 100 个最新阵营条目的三栏控件／播放检查通过；历史、逐帧、拖动、缺源提示和多人输入链接均保留，浏览器无脚本错误。交付清单核验 5,008 个私有文件，原历史归档哈希不变。

新增复现入口（产物与图只留私有库）：

```text
node Taierzhuang1938/_import/Script_FirstLevelTrainSupportPackageVerify.mjs --root <库> --group FirstLevelTrainSupportV2
python Taierzhuang1938/_import/Script_FirstLevelTrainSupportRegister.py --root <库>
node Taierzhuang1938/_import/Script_FirstLevelTrainSupportReview.mjs --root <库>
python Taierzhuang1938/_import/Script_FirstLevelRecoveryPrepare.py --root <库> --group FirstLevelTrainLifeV1 --ids TrainBenchRest,TrainGearStow
node Taierzhuang1938/_import/Script_MotionFidelityVerify.mjs --root <库> --group FirstLevelTrainLifeV1 --revision 1 --factions Nra --ids TrainBenchRest,TrainGearStow
```

## 历史：正式人物尺度试制 TrainSupport V1 未通过

2026-09-07 再次 fetch 后，需求仍为 r11 的 25 阶段。本轮没有修改任务、人数、对白时机或正式动画。即梦原 ID 查询仍返回 `querying`，实查余额仍为 **30 积分**；首轮保持 60 成功、1 失败、1 待对账，覆盖 47 个需求，FL16 缺成功来源。17 条补拍与医生重做合计预计 3,400 积分，现余额缺约 **3,370**；不含再次失败余量，未假设数弹退款，也未重新提交。

已把扶腿起身 V3 绑定空间转换到四套原游戏模型，并制作各自的 .96/.98/1/1.02/1.04 五档支撑曲线，每档 479 帧、60 fps。原骨名、层级、inverse bind 与 NRA03 额外骨保留。正式凳板为深 .68 m、厚 .14 m、顶 .48 m；本地候选把身体朝过道前移 .24 m，**这个试制座位尚未写入游戏**。

关键帧全部零穿凳、鞋底 2 mm，但独立浏览器对原网格的 **4 型号 × 9 身高 × 957 时刻（120 fps）**检查失败：最多 16 个蒙皮顶点穿凳，最大脚漂移约 5.682 mm，最低鞋底 −1.947 mm，掌面最低 −3.213 mm。02 号模型的骨盆瞬时速度达约 6.318 m/s，说明高度求解在不同可行区间之间跳变。不能以关键帧成功、工程能打开或静态近景代替插值连续性验收，也不能将这些曲线接入队列。

四个 `.blend` 已重新打开；20 条 NLA 轨道保留完整 0–478 帧，五档身高共 120 个关键帧样本的凳面与鞋底接触通过。Blender 转换的鞋底偏差最大约 0.0202 mm，单独记录；此项不抵消上述插值失败。全身、掌面和松手近景已查看，报告、完整原模型 GLB、工程与截图保存在私有 `Models/FirstLevelTrainSupportV1`、`Blender/FirstLevelTrainSupportV1`、`Preview/FirstLevelTrainSupportV1`。

该试制已标记 `needs_correction` 并冻结；后续用新版本目录修正曲线连续性。主三栏仍保留已审阅的起身 V3／递食 V2。尚缺坐姿循环与起身边界、生活活动分层、起身前移到物理队列的衔接、暂停／中断及实际游戏验收。生成和重定向过程均未改写原恢复数组。

```text
node Taierzhuang1938/_import/Script_FirstLevelTrainRuntimeBake.mjs --root <库>
node Taierzhuang1938/_import/Script_FirstLevelTrainSupportBake.mjs --root <库> --group <新的版本目录>
node Taierzhuang1938/_import/Script_FirstLevelTrainSupportVerify.mjs --root <库> --group FirstLevelTrainSupportV1
blender --background --python-exit-code 1 --python Taierzhuang1938/_import/Script_FirstLevelTrainSupportProject.py -- --root <库> --group FirstLevelTrainSupportV1 --verify
```

V1 的浏览器命令应仍报告上述失败。不能覆盖其审阅文件来让重建入口通过；新组名形如 `FirstLevelTrainSupportV2`。本轮只交付重建、验收脚本和真实状态，没有发布试制资产，也未因这些私有试制重跑无变化的整关流程。

## 已交付审阅：座凳支撑 V2 与双掌扶腿 V3

- 本轮复用上述原视频和原恢复缓存，无新增视频费用或三维推理。切片递食与长凳起身的 `FirstLevelSeatedV2` 从明确的 V1 工程制作；原始数组、V1 工程与旧审阅记录保留。
- 两条 V2 共 **1,078 帧**的实际 GLB 已验：完整凳板体积中无蒙皮顶点，鞋底最小点稳定在地面上方约 **2 mm**，棕色凳材质导出正确，inverse bind 矩阵与 V1 完全相同，原骨名、顺序、层级和骨长保持。原片时钟未改变。最大 root 修正为递食约 0.123 m、起身约 0.101 m，最大膝点修正约 0.151／0.176 m；这是明确的后期支撑修正，不是全身恢复保真。
- 已查看两条坐姿的侧视，以及起身／站稳、7.5 秒递食。座面按原角色实际衣摆蒙皮求解，不能把审阅骨盆高度强行当作游戏历史占位的 0.60 m；运行时 `seatTopM=.48`、`pelvisAboveSeatM=.12` 本轮保持，接入时还须测实际模型尺度。
- [长凳起身最新 V3 三栏](http://127.0.0.1:8136/Preview/index.html?action=TrainBenchRise)在 V2 上增加双掌扶腿、放松手指及起身松手。原人物手臂比例限制使扶点移近髋部，腕点最大改动约 **0.340 m**；原骨长不拉伸。0–5.2 秒扶持，5.2–5.7 秒渐放，按原片 0.25 秒抽帧对照选取，仅为源动作窗口，不写任务或对白事件。
- V3 实际导出 **479 帧**的 V2 躯干与下肢矩阵差约 0.00000060，骨段长度误差小于 0.00024 mm；接触期每 0.1 秒共 **53 个采样时刻**核对实际手部／裤面三角形，最近距离为 **0.959–1.053 mm**。原 bind、骨名与层级保持。已看 0 秒正侧视与手部正面／斜侧近景，5.2 秒扶腿侧视近景及5.5秒松手；尚未完成游戏尺度、转场和完整速度播放验收，未启用。
- V1／V2／V3 的视觉记录分别绑定对应 GLB SHA-256。状态生成和素材看板按模型哈希匹配历史，避免把 V1 缺凳记录套在 V2 或误报最新版本已接受。已审阅版本禁止原地重烘焙，后续修改须另建版本。
- 私有产物：`Models/FirstLevelSeatedV2`、`Blender/FirstLevelSeatedV2`、`Models/FirstLevelBenchV3`、`Blender/FirstLevelBenchV3`；截图与导出验证位于对应 `Preview` 目录。切片仍缺食物／刀／包布与指握；逐阶下车及老周支撑仍待后续修正。48 项源片缺口和上次余额 30 保持不变。

相关验证与制作入口（已审阅输出受防覆盖检查保护；继续修正时另建版本）：

```text
blender --background --python-exit-code 1 --python Taierzhuang1938/_import/Script_FirstLevelSeatedContactBake.py -- --root <库> --clip TrainMealCutOffer
blender --background --python-exit-code 1 --python Taierzhuang1938/_import/Script_FirstLevelSeatedContactBake.py -- --root <库> --clip TrainBenchRise
node Taierzhuang1938/_import/Script_FirstLevelSeatedContactVerify.mjs --root <库>
blender --background --python-exit-code 1 --python Taierzhuang1938/_import/Script_FirstLevelBenchPalmBake.py -- --root <库>
node Taierzhuang1938/_import/Script_FirstLevelBenchPalmVerify.mjs --root <库>
```

## 首轮 60 条视频与四条新增单人恢复

- [48 项实时制作看板](http://127.0.0.1:8136/Preview/FirstLevelSourceBatchV1/index.html)读取私有库的真实回执，按 FL ID 展示已生成、生成中、待提交、复用来源及积分。该页不提交任务或扣费，视频与页面只留本地。
- 逐片解码、哈希和带源秒数的九帧初筛分开记录。初筛已发现部分片源裁头、遮挡双腿、把前抬手拍成后位、踩上转运台等问题；看板明确列“需补拍”及具体证据。已生成数包含这些原件，不等于合格片源数；先跑完首轮，再集中补拍。解码采用两遍流式读取，避免批量持有全分辨率帧而挤占生成 CLI 内存。
- `TrainAmmoCount` 曾在提交时遇到 Windows VirtualAlloc 内存错误。已按完全相同提示词从本地任务库找回原 `submit_id` 并继续查询；服务完成和扣费尚未确认，保守预留 200，不重复提交。原错误日志和对账证据保留在对应来源目录。
- [补片计划](../_import/Data_FirstLevelSourcePlan.json)覆盖 FL01–FL48，拆为 62 条新单人参考片；每项可含多个角色轨道，并复用现有步态、卧起、近战、受击和 BIP/FBX。**覆盖计划不等于效果验收通过**。协作源片使用各自单人角色练习，道具和相对站位在后期装配，不声称单目恢复取得可靠多人世界坐标。
- 全部 62 条首轮请求已有记录：**60 条成功落盘、1 条医生确认死亡片服务失败、1 条数弹请求待对账**，没有待提交项。连同旧库，47 个 FL 需求已有至少一个来源；FL16 暂无成功片源。来源覆盖不代表该需求的所有片段已经合格。
- 60 条已完整解码并检查文件哈希，均完成九帧初筛；**17 条列为需补拍**，其余 43 条尚须密集动作、接触与恢复审阅。`FatigueShoulderCough` 返回了有切镜、字幕的现代室内交谈，已核实保存的实际提交提示词与计划一致，拒绝作为恢复输入。
- 全批请求预计／保守预留合计 11,360 积分，含 200 失败与 200 待对账，不等于实际净扣费。最初按 10,960 上限运行；最后实查余额 430，已用其中 400 补齐原计划最后两条，现余额 **30**。没有充值、重复提交失败片或重提数弹。若 17 条按原时长重拍需 3,200，再补医生失败片需 200，按现余额还缺 **3,370**；假设均一次成功，数弹对账及后续深度审阅发现的新补拍另计。
- 批控制器已正常结束；新增同库进程锁，异常提交始终保守计费并单独等待对账。源视频和服务回执保留不变；查询回执校验原任务编号并原子落盘，避免错配、重复支付和观察到半写文件。
- [长凳坐姿与起身三栏](http://127.0.0.1:8136/Preview/index.html?action=TrainBenchRise)：新生成 8 秒单人片，真实恢复为 240 帧／30 fps，重定向到 NRA 原人物为 479 帧／60 fps，含完整坐→起→站过程；raw 数组、PT／NPZ 哈希和可编辑原骨骼工程已保存。逐帧原恢复骨段方向误差小于 0.000127°，GLB 关节与 Blender 报告误差小于 0.002 mm。生成视角偏正前方，座凳、掌部与膝盖深度仍需修正／审阅；没有用它冒充全部下车动作。
- [担架最新 V10 三栏](http://127.0.0.1:8136/Preview/index.html?action=StretcherPair)：修正 V9 将杆中心放进掌部的问题，按真实 65 mm 方杆外表面设置掌距并调整相对包握的拇指和四指。保留 V7 躯干与下肢；V9 留在历史。36 张四手近景在 `Preview/FirstLevelCarryV10/Contacts`，仍需最终自然度验收。
- V10 四套原游戏网格／八个片段重新加载，968 帧逐顶点验鞋底、骨架 bind／层级和循环。用前后位、全部原模型及共同道具一致的 **5.5034 mm 常量升降**适配鞋底厚度，不改逐帧脚步。NRA02/03 最低点约 1–1.4 mm，NRA01/04 约 9.5 mm，足底支撑与滑动尚未验收。共享道具接入时必须使用同一偏移。
- V10 三个审阅 GLB 共 363 帧通过真实蒙皮、原骨长、选段同步、循环及完整入镜验证。掌点误差约 0.0011 mm，不能替代手指、袖口或负重自然度。V10 腕点最大修正约 0.384 m、肘点约 0.126 m，身体矩阵误差为零，仍是有明显接触修正的实验版。
- 原库新增长凳原恢复后：41 份原数组逐值匹配、18 个可编辑原骨骼工程、442 条登记链接通过。其他新片先验源片，再恢复；视频生成成功不会自动标成已接受或已接入。

- 首轮结束后新增三条重点恢复：[逐阶下车](http://127.0.0.1:8136/Preview/index.html?action=TrainStairDisembark)、[幺娃切片递食](http://127.0.0.1:8136/Preview/index.html?action=TrainMealCutOffer)、[老周撑起失败](http://127.0.0.1:8136/Preview/index.html?action=ZhouSeatedAttempt)。每条先看 0.25 秒间隔源帧及 0.5 秒间隔二维追踪，再复用这些观察缓存做首次三维推理；没有新增付费请求。各为 300 帧／30 fps 原恢复和 599 帧／60 fps 国军原骨架候选，完整序列保持非循环。工程与 GLB 位于私有库 `FirstLevelPriorityV1`，原始数组、推理缓存和可编辑 raw rig 分开保留。
- 三条共 1,797 帧真实 GLB 导出保真通过：原恢复骨段方向最大误差约 0.001253°，GLB 与 Blender 关节位置最大误差约 0.00172 mm。15 个取景姿势与 26 个源动作事件／正侧视同步截图已生成；实际查看了每条起、中、末帧及下车 4.5 秒、切片 3 秒、递食 7.5 秒、老周 0／3.25／8.75 秒侧视。首轮下车越出预览画面的失败已通过相机中心与距离修正，未改动作位移。
- **三条均需接触修正，尚未接入游戏。** 下车未匹配三处车梯／扶栏；切片未装配座凳、包布、刀与食物，手指仍是通用张开姿态；老周屈膝侧足部、臀部和双掌支撑不足。侧别和动作存在不等于接触合格，V1 保留这些问题供三栏审阅。对应 `Data_RetargetAssessment.json` 按原片、原恢复与模型哈希绑定。
- 本地库目前 44 份 raw 数组逐值匹配、21 个可编辑原骨骼工程、460 条文件链接通过，目录含 51 个动作。48 项看板已增加新三栏链接与密集／重定向审阅记录；首轮仍为 60 成功／1 失败／1 待对账、17 条补拍，积分余额沿用上次实查的 30。

最新 master 已有 `Data_FirstLevelMissionVoiceAlignment.mjs`、`Data_FirstLevelMissionVoiceTiming.mjs` 与 Runtime VoiceEvent。后续动作读实际 cue／segment／源秒数和真实事件；本轮没有改对白录音、人数、任务状态或原演员身份。

任务快照已同步另一台电脑的 `d9d373f35`／r11：25 阶段含新增 `TransferApproach`，村后接近至少 45 秒且等待实际抵达与 `TransferHope` 完成。开场保留自由转头，`TrainFoodReceived` 在 TrainMeal 第二句实际录音结束时释放走位；受袭后紧急制动，停稳并听到下车命令后才下车。最新 TrainShelling 原录音为 **20.036 秒**：2.12 秒进入 BrakeAndCover 并发出 TrainProneOrder，17–20.036 秒 EmergencyUnload 受 trainStopped 事实门约束。动作不得沿用旧 22.544 秒时间表。

本次在 r11 上实跑 `Script_FirstLevelMissionTest.mjs --audio` 通过，保留 41 NPC、20 担架、36 轻伤、14 医护、8 百姓、8 守军及 Litter11 老周身份；消费上游新增的实际行军、装车、补位、撤离与战术演员。此版尚未重跑全关浏览器流程；下方 V9 的浏览器结果属于历史基线。

新增入口（仍从本任务 worktree 根执行）：

```text
python Taierzhuang1938/_import/Script_FirstLevelSourcePlan.py --root <库>
python Taierzhuang1938/_import/Script_FirstLevelSourceBatch.py --root <库> --max-credits 11360 --concurrency 3
python Taierzhuang1938/_import/Script_FirstLevelSourceDashboard.py --root <库>
python Taierzhuang1938/_import/Script_FirstLevelSourceInspect.py --root <库>
python Taierzhuang1938/_import/Script_FirstLevelSourceDenseInspect.py --root <库> --ids TrainStairDisembark,TrainMealCutOffer,ZhouSeatedAttempt
python Taierzhuang1938/_import/Script_FirstLevelSourceDenseInspect.py --root <库> --ids TrainStairDisembark,TrainMealCutOffer,ZhouSeatedAttempt --observations --interval .5
python Taierzhuang1938/_import/Script_FirstLevelRecoveryPrepare.py --root <库> --ids TrainStairDisembark,TrainMealCutOffer,ZhouSeatedAttempt
node Taierzhuang1938/_import/Script_FirstLevelPriorityInspect.mjs --root <库>
python Taierzhuang1938/_import/Script_FirstLevelBenchPrepare.py --root <库>
python Taierzhuang1938/_import/Script_MotionFidelityPrepare.py --root <库> --group FirstLevelTrainV1
blender --background --python-exit-code 1 --python Taierzhuang1938/_import/Script_MotionFidelityBake.py -- --root <库> --group FirstLevelTrainV1 --revision 1 --faction Nra --clip TrainBenchRise
node Taierzhuang1938/_import/Script_MotionFidelityVerify.mjs --root <库> --group FirstLevelTrainV1 --revision 1 --factions Nra --ids TrainBenchRise
blender --background --python-exit-code 1 --python Taierzhuang1938/_import/Script_FirstLevelCarryBake.py -- --root <库> --group FirstLevelCarryV10 --revision 10
node Taierzhuang1938/_import/Script_FirstLevelCarryVerify.mjs --root <库> --revision 10
node Taierzhuang1938/_import/Script_FirstLevelCarryRuntimeBake.mjs --root <库> --revision 10
node Taierzhuang1938/_import/Script_FirstLevelCarryIntegrationVerify.mjs --root <库> --revision 10
```

批处理已有进程时继续观察原进程，不重启副本；消费记录与实时状态分别位于 `Video/Sources/FirstLevelV1/<SourceId>` 与 `Models/FirstLevelSourceBatchV1/Data_BatchStatus.json`。暂停观察、窗口无输出或查询超时不能当成服务任务已失败。下面保留首轮 V9 的历史证据，不代表当前补片仍全部缺源。

新源的观察准备可用 `Script_MotionRecover.py --preprocess-only`，只生成二维检测／特征，不跑三维预测；查看实际输入与关节点后再进入恢复。已存在 `Data_GvhmrMotion.npz` 的动作复用原缓存，不能为刷新登记重跑推理。密集抽帧脚本仅出图，人工审阅记录独立保存，不自动判定合格。

## 首轮 V9 历史成果

资产根：`C:\Users\Bentl\OneDrive\Sync\饮河\FPS\视频转骨骼`。

- [前后抬架三栏实时预览](http://127.0.0.1:8136/Preview/index.html?action=StretcherPair)：原片、未经修正的原恢复、V9 原人物实时蒙皮。前位 `CarryStretcherFront`、后位 `CarryStretcherRear` 分别可选；旧 V7 保留在效果历史。
- 可编辑装配：`Blender/FirstLevelCarryV9/Scene_Nra_StretcherPair_V9.blend`，前后两位原骨架独立轨道和一个刚性担架。
- 审阅 GLB：`Models/FirstLevelCarryV9/Animation_Nra_{CarryStretcherFront,CarryStretcherRear,StretcherPair}_V9.glb`。
- 四套原游戏模型的无网格曲线候选：`Models/FirstLevelCarryV9/GameIntegration/Animation_LugouNra01FirstLevelCarry.glb` 至 `04`。**仅留本地，未成为运行时消费资产。**

复用 `Video/Sources/EarlyMocap/Video_StretcherWalk.mp4` 的 4.566667–6.566667 秒，以及 `Models/_Cache/ReviewV2/CarryStretcherFront` / `CarryStretcherRear` 原始 NPZ；没有重新生成视频、重新推理或重写原恢复。原片与两份裁剪输入保持不变，仍属多人拆分实验，不能称严格单人动作。

V9 保留 V7 躯干与下肢，按游戏 `CreateP012StretcherGeometry` 的 0.58 m 杆距、2.15 m 杆长、纵向 ±1 m 握点调整双臂与手指。独立恢复不能提供可靠的相对站位，本次身体间距是后期装配。为避免衣摆进入床端并保留手臂可达余量，试制床面高度为约 1.1001 m（审阅原模型尺度），**不写回游戏的床高、玩家握持或路线参数**。腕部最大修正 0.369 m、肘部 0.111 m；这是明显的后期适配，不能标成双腕保真。

## 首批逐项状态

| 需求 | 状态 | 尚缺内容 |
| --- | --- | --- |
| FL13–17 车厢坐站、分食、接食、数弹、生活 | 未找到专用片源／恢复；保留现有程序化占位 | 长凳接触、刀／食物／弹药、成对交接及真实录音分段事件 |
| FL18–20 炮击反应、查伤臂、过道让路 | 未找到专用片源／恢复 | 炮击事件后的反应、匿名伤兵固定伤侧、同伴接触 |
| FL21 起身、队列挪步、逐阶下车 | 未找到专用片源／恢复 | 起身与脚点片段；不能拿地面坐姿或跪起替代 |
| FL23–24 老周靠坐、抬上担架 | 未找到专用片源／恢复 | 同一 Litter11 患者、托肩扶腿、上架连续装配 |
| FL25 握杆、抬起、持架静止、放下 | 待制 | 已有走路片段不等于双脚支撑待机；不能停在单脚悬空帧 |
| FL26 前后负重行走 | **V9 已重定向并挂载四套原模型；需修正，未启用** | 拇指／指握／袖口近景、02/03 鞋底、步速依据、停走转弯、坡道门槛 |
| FL27 患者喘息与运输反应 | 待制 | 当前原片患者未独立恢复；不借用担架员骨架假装患者 |
| FL33、35–40 松手、扑沟、救回、递布、衰弱、补位 | 未找到专用片源／恢复 | 协作分角色轨道与同一布、接触／脱手窗口；第一人称另验 |
| FL43–46 最后抬放、检查死亡、同伴反应与转救他人 | 未找到专用片源／恢复 | 死亡末态保持、医护离场、真实录音事件点 |

其余 B/C 项在本批状态表中保持“未开始”，没有冒充已检查或已接受。

## 验证与限制

- 原库核验：40 份原关节数组逐值匹配 NPZ 且哈希一致，17 个原骨骼工程，434 条链接有效。
- V7 前后位两军共 484 帧保真核验：原恢复骨段方向最大误差约 0.000152°；导出关节点位置误差小于 0.002 mm。
- V9 三个审阅 GLB 共 363 帧：真实蒙皮播放、循环首尾、原片选段同步、骨长、四掌握点和完整入镜通过。掌点误差小于 0.001 mm；**该值不证明手指包握、自然度或脚接触合格**。
- 四套游戏原网格、八个前后位片段共 968 帧重新加载并播放；bind、骨名与层级不变，NRA03 额外骨骼保留。按 SMPL 解剖骨段核对长度；BIP 的大腿父级是 Spine、锁骨父级是 Neck，不把跨躯干层级距离误当肢体骨长。最大解剖骨段误差约 0.036 mm。
- 无网格候选保留源姿态。NRA02/03 鞋底约 4–5 mm 低于支撑面，接触高度还需适配；V9 拇指、握指、袖口与负重自然度未通过最终验收。因此不开启关卡消费，不用试制曲线覆盖正式动作。
- 全库三栏验证：94 个最新阵营条目，播放暂停、半速、逐帧、拖动、选段、历史、缺源提示和多人输入链接通过；无浏览器脚本错误。
- 原任务纯规则及音频校验通过：24 阶段事实门、41 NPC 的 8/24/8 下车、20 架队列与转运、原老周身份、41 段录音文件／提示词哈希均保持。
- 本轮 `Script_FirstLevelMissionBrowserTest.mjs --audio --campaign` 以真实玩家输入完成全关，41 段语音实际解码播放；乘车相对漂移约 0.128 mm，TrainMeal 38.833 秒，南行 75.017 秒、转运 224.767 秒、死亡 12 秒，末句完成后到达 Complete。此项验证**原任务未回退**，不代表 V9 已在关卡启用。按改动运行的 33 项 quick 检查全部通过。

本批验证基线的 Script_FirstLevelMissionVoice 当时仍按整段时长与字数权重分配字幕，没有实际录音拆段表。本批没有据此猜手势时间，也未改变录音、台词、口令、任务时长、人数或镜头。取得最新 cue ID＋播放段 ID＋原 MP3 起止后再绑定动作事件；暂停／重试必须拒绝旧事件。

检查报告在资产库 `Models/FirstLevelCarryV9`、`Preview/FirstLevelCarryV9` 与 worktree 的 `Taierzhuang1938/_shots/FirstLevelCarry`。报告、源工程、候选动画、预览和截图均留本地。

## 复现入口

以下命令从本任务 worktree 根执行；`<库>` 替换为上述资产根，Python 使用 `C:\Users\Bentl\Downloads\GVHMR\.venv\Scripts\python.exe`。

```text
blender --background --python-exit-code 1 --python Taierzhuang1938/_import/Script_FirstLevelCarryBake.py -- --root <库>
python Taierzhuang1938/_import/Script_MotionIndexLibrary.py --root <库>
node Taierzhuang1938/_import/Script_MotionFidelityVerify.mjs --root <库> --ids CarryStretcherFront,CarryStretcherRear
node Taierzhuang1938/_import/Script_FirstLevelCarryVerify.mjs --root <库>
node Taierzhuang1938/_import/Script_FirstLevelCarryRuntimeBake.mjs --root <库>
node Taierzhuang1938/_import/Script_FirstLevelCarryIntegrationVerify.mjs --root <库>
python Taierzhuang1938/_import/Script_MotionLibraryDataVerify.py --root <库>
node Taierzhuang1938/_import/Script_MotionLibraryVerify.mjs --root <库>
python Taierzhuang1938/_import/Script_FirstLevelAnimationStatus.py --root <库>
node Taierzhuang1938/Script_FirstLevelMissionTest.mjs --audio
node Taierzhuang1938/Script_FirstLevelMissionBrowserTest.mjs --audio --campaign
```

新首批缺源动作需要补齐可用原片或确认其另存目录；查找范围已包括标准库和 Downloads/GVHMR。预览从资产库 `Preview/Open_Preview.cmd` 启动。索引器按版本数字合并持久清单，避免 `FirstLevelCarryV9` 这样的目录被字母排序靠后的旧 ReviewV7 覆盖取景元数据。

后续流程版本已提供 [源录音对齐表](../Data_FirstLevelMissionVoiceAlignment.mjs) 与 [播放段／事件表](../Data_FirstLevelMissionVoiceTiming.mjs)。下一批动作接入使用这两个最新接口；上面的 V9 未启用状态与原批验证结果保持不变。

首战运行时接力注意：第一关已将 8 名撤退守军提前布置，等待时还击、受压伏低、通过后分散停留；具名同伴走向各自射击踏步。机枪射手随枪托调整位置。替换动画须保留这些实际运动、目标、开火与接触事件，不把它们烘成固定播放时间轴。
