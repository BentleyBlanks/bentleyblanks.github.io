# 第一关动画接力状态（2026-09-07）

当前用户要求为**先覆盖全部 48 项的素材生成**，随后继续恢复、重定向、协作装配和游戏接入。尚未完成全部动作，也没有替换正式关卡动画。逐项字段、来源哈希和运行时文件快照见 [状态 JSON](Data_FirstLevelMissionAnimationStatus.json)。需求仍以 [完整需求](Data_FirstLevelMissionAnimationRequirements.md) 和 [视频转骨骼标准](Data_VideoToSkeletonStandard.md) 为准。

## 最新进展：48 项补片批次、长凳 V1 与担架 V10

- [48 项实时制作看板](http://127.0.0.1:8136/Preview/FirstLevelSourceBatchV1/index.html)读取私有库的真实回执，按 FL ID 展示已生成、生成中、待提交、复用来源及积分。该页不提交任务或扣费，视频与页面只留本地。
- 逐片解码、哈希和带源秒数的九帧初筛分开记录。初筛已发现部分片源裁头、遮挡双腿、把前抬手拍成后位、踩上转运台等问题；看板明确列“需补拍”及具体证据。已生成数包含这些原件，不等于合格片源数；先跑完首轮，再集中补拍。解码采用两遍流式读取，避免批量持有全分辨率帧而挤占生成 CLI 内存。
- `TrainAmmoCount` 曾在提交时遇到 Windows VirtualAlloc 内存错误。已按完全相同提示词从本地任务库找回原 `submit_id` 并继续查询；服务完成和扣费尚未确认，保守预留 200，不重复提交。原错误日志和对账证据保留在对应来源目录。
- [补片计划](../_import/Data_FirstLevelSourcePlan.json)覆盖 FL01–FL48，拆为 62 条新单人参考片；每项可含多个角色轨道，并复用现有步态、卧起、近战、受击和 BIP/FBX。**覆盖计划不等于效果验收通过**。协作源片使用各自单人角色练习，道具和相对站位在后期装配，不声称单目恢复取得可靠多人世界坐标。
- 全批首轮预计 11,360 积分；首条已花 160 后实查余额 10,800，剩余首轮预计 11,200，缺 400，尚未计重做。批处理以本批累计 10,960 为上限，保守计入已提交费用，不假定失败任务退款；到上限保留缺项。来源已有收据就查询原 submit_id，不重复付费提交。
- [长凳坐姿与起身三栏](http://127.0.0.1:8136/Preview/index.html?action=TrainBenchRise)：新生成 8 秒单人片，真实恢复为 240 帧／30 fps，重定向到 NRA 原人物为 479 帧／60 fps，含完整坐→起→站过程；raw 数组、PT／NPZ 哈希和可编辑原骨骼工程已保存。逐帧原恢复骨段方向误差小于 0.000127°，GLB 关节与 Blender 报告误差小于 0.002 mm。生成视角偏正前方，座凳、掌部与膝盖深度仍需修正／审阅；没有用它冒充全部下车动作。
- [担架最新 V10 三栏](http://127.0.0.1:8136/Preview/index.html?action=StretcherPair)：修正 V9 将杆中心放进掌部的问题，按真实 65 mm 方杆外表面设置掌距并调整相对包握的拇指和四指。保留 V7 躯干与下肢；V9 留在历史。36 张四手近景在 `Preview/FirstLevelCarryV10/Contacts`，仍需最终自然度验收。
- V10 四套原游戏网格／八个片段重新加载，968 帧逐顶点验鞋底、骨架 bind／层级和循环。用前后位、全部原模型及共同道具一致的 **5.5034 mm 常量升降**适配鞋底厚度，不改逐帧脚步。NRA02/03 最低点约 1–1.4 mm，NRA01/04 约 9.5 mm，足底支撑与滑动尚未验收。共享道具接入时必须使用同一偏移。
- V10 三个审阅 GLB 共 363 帧通过真实蒙皮、原骨长、选段同步、循环及完整入镜验证。掌点误差约 0.0011 mm，不能替代手指、袖口或负重自然度。V10 腕点最大修正约 0.384 m、肘点约 0.126 m，身体矩阵误差为零，仍是有明显接触修正的实验版。
- 原库新增长凳原恢复后：41 份原数组逐值匹配、18 个可编辑原骨骼工程、442 条登记链接通过。其他新片先验源片，再恢复；视频生成成功不会自动标成已接受或已接入。

最新 master 已有 `Data_FirstLevelMissionVoiceAlignment.mjs`、`Data_FirstLevelMissionVoiceTiming.mjs` 与 Runtime VoiceEvent。后续动作读实际 cue／segment／源秒数和真实事件；本轮没有改对白录音、人数、任务状态或原演员身份。

新增入口（仍从本任务 worktree 根执行）：

```text
python Taierzhuang1938/_import/Script_FirstLevelSourcePlan.py --root <库>
python Taierzhuang1938/_import/Script_FirstLevelSourceBatch.py --root <库> --max-credits 10960 --concurrency 3
python Taierzhuang1938/_import/Script_FirstLevelSourceDashboard.py --root <库>
python Taierzhuang1938/_import/Script_FirstLevelSourceInspect.py --root <库>
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
