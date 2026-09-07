# 第一关动画接力状态（2026-09-07）

当前用户要求为**先覆盖全部 48 项的素材生成**，随后继续恢复、重定向、协作装配和游戏接入。尚未完成全部动作，也没有替换正式关卡动画。逐项字段、来源哈希和运行时文件快照见 [状态 JSON](Data_FirstLevelMissionAnimationStatus.json)。需求仍以 [完整需求](Data_FirstLevelMissionAnimationRequirements.md) 和 [视频转骨骼标准](Data_VideoToSkeletonStandard.md) 为准。

## 最新：四型号起身 V4 支撑验证通过，新增两条车厢恢复

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
