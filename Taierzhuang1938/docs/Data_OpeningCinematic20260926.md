# 01 洞口过场修订（2026-09-26）

本次按用户现场四条反馈调整：爆炸后渐显恢复、翻译不可穿过日军、洞旁改国军旗并由背景日兵踹倒、翻译出现时直接切入川军受害戏的独立拍摄镜头。此文覆盖旧分镜中 CaptiveDragged→Wipe 固定倒地第一人称、翻译与日兵乙旧站位，以及洞边日章旗的口径；其余救援、配音与还权条件沿用现有契约。

## 当前行为

- 爆炸闭眼后保持黑场，再按 `Data_OpeningStoryboards.blackoutRecovery` 连续淡入。全屏退黑走既有 composite 的 `fade` 通道，与眼皮开合分开；Wake 足够长，不在恢复中途切下一拍。耳鸣仍沿用共享剧情反馈。
- 翻译沿连接支沟北侧绕过折角与岔口的守兵，再走东沟南侧进入审问位置。翻译与日兵乙相隔超过 1.2 米。导演对翻译的移动使用扫掠圆形身体净空，计算整步与其他存活人物的交点，遇到占道者停步；成对拖拽和抓领动作保持原接触轨。入场路线同时通过地形坡度和场景实心体检查。回到救援围圈的路线与围圈站位已由下文「2026-09-27 02 审问穿模修正」取代；近身接触净空 0.44 米，普通入场 0.72 米，回返根节点不穿实心体。
- CaptiveDragged（翻译开始入场）硬切独立机位，依次拍拖出、审问、行刑、背景踹旗；Wipe 结束后在 Reach 硬切回顺子伸手取枪。机位和视场角由 `interrogation.cinematic` 配置，镜内运动保持原连续性门槛，只有表内机位切换允许硬切。切镜时清理 TAA、SSR、AO 与曝光历史并刷新阴影。独立镜头中隐藏第一人称身体和手持道具，去掉顺子的泥污、血边及失衡效果；返回第一人称后恢复。
- 两面守军旗使用程序化青天白日满地红旗面。`flagTrench` 在原位置以独立可动合批根节点建造，`DepthIjaA` 从沟沿走到旗杆，用已有 `IjaKickPrisoner` 动作踹旗；到踢击时刻才开始连续倒落，随后日兵沿平坦沟沿离开。另一名背景兵仍走沟内原路线。旗杆与旗面一起运动，倒地状态跨后续步骤保留；重试、检查点与布景重建同步状态。

## 2026-09-27 02 审问穿模修正

用户实拍两张：被拖进沟时日兵甲的拳头攥着空气（SB04A），「这个也问！」时翻译的脸贴在镜头上、日兵甲揪领的胳膊从他身上穿过去（SB05）。实机取证（`Script_OpeningStoryboardShots` 逐时刻截图 + 页面内量骨骼）的原因与改法：

| 问题 | 原因（实测） | 改法 |
| --- | --- | --- |
| 翻译从镜头前横穿 | 回围圈路线 `rescue.interpreterReturn` 从沟里上来后，走日兵甲与顺子之间往东，离眼 0.36–0.4 米，正好穿过揪领那条胳膊；沟口地面只有 x 0.4–0.8 一条，已经被日兵甲和顺子占满 | 改走传令兵那条路：沿南南西沟上来（SB04A 画面里仍是「沟里赶来」），在弃土堆南边拐过弯道弹坑台阶，从东边沿弃土北侧的窄道进来；从拐进弃土背后那一点（`interpreterRunFrom`）起改跑步（`speed.run`），约 Boots 4.9 秒到位（原 4.3 秒）。围圈各阶段若他还没走完，继续走完这条路（`InterpreterSquat`），不再直线穿过去 |
| 翻译的脸贴镜头、和日兵甲重叠 | 蹲位 (0.97,−123.42) 离顺子只有 0.53 米，`InterpreterCrouchAsk` 本来按面对面 0.69 米做的，前倾后头离镜头 0.34 米（面部骨骼 0.2 米，占半个画面），左手压在日兵甲揪领的拳头上（骨骼相距 2 厘米） | 蹲位挪到弃土西北角 `rescue.interpreter` (1.15,−123.35)、朝向 45°：头离镜头 0.54 米，胳膊离日兵甲 0.16 米、脚 0.08 米，头仍在画面左缘（SB05 x≈0.03） |
| 「说话！」扑上来揪领时后脑勺糊满镜头 | 同一蹲位扑向衣领，头到镜头 0.14 米 | 揪领起用单独根节点 `rescue.interpreterGrab` (1.26,−123.33)、朝向 50°，抓点仍够到衣领（0.69 米，动作按 0.66 米做），头停在 0.41 米；切换时 0.11 米的挪根靠 `Put` 保留当前骨架淡过去；Flee 也从这里起 |
| 被拖时日兵甲攥空气 | `IjaDragByForearm` 左手握的是顺子右前臂，拳头在眼前 0.45 米、与眼同高（被拖的人胳膊举过头顶）；第一人称右手一直是 `rest`，而且默认肩根在眼下 0.22 米，袖口点离肩 0.64 米，超出手臂长度 | `beats.Boots` 在 0.45 秒接上 `gripSleeve`（原来挂在 pendingWiring 里）。只抬肩根去够会让上臂贴着镜头，变成右下角一块浅色平片（pressBody 记过同一现象），所以改成：拖行时日兵甲的根沿朝向往顺子收 `ija.dragAway.gripInM` 0.14 米（在闭眼的 `swingS` 内淡入），`gripSleeve` 抓腕端 0.9、肩根保持低位（眼下 0.24 米、眼后 0.1 米，上臂在画面下沿外）、`minEyeM` 0.25：整段拖行都抓得住，伸展比 0.93，前臂从右边伸进他手里；拖完日兵甲换揪领、胳膊离开 1 米时自然松手 |

回归口：`Script_OpeningStoryboardsTest`（回返路线离眼 ≥ 0.6 米、不穿过顺子与日兵甲之间；蹲位与揪领根离顺子 ≥ 0.75 米、离日兵甲根 ≥ 0.6 米、在弃土一侧）、`Script_OpeningSetTest`（路线离弃土土皮 ≥ 胶囊半径）、`Script_OpeningStoryboardShots`（SB04A 加 `hands.r {pose:"gripSleeve", held:"ijaA"}`，SB05 加翻译 distM 0.68–1.1）、`Script_FirstLevelMissionBrowserTest --campaign --stage-to=3`（02 全程量翻译头离镜头 ≥ 0.38 米、离日兵甲根 ≥ 0.6 米）。

## 背枪走、空手走与喊翻译（2026-09-26 第二轮）

用户反馈：日军、翻译从远处走来走去都是端枪的步态；日军发现川军后要有喊翻译过来的喊话。

- **步态**（资产与运行时见 [RelaxedGait](../Animation/RelaxedGait/Data_RelaxedGait.md)）：
  - 日兵甲、乙：睁眼（Wake）后按 `walkInDelayS` 起步，背枪走下连接支沟（`speed.amble` 1.65 m/s，原来是 brisk 2.3 的端枪跑）；到位后放松站姿、枪仍在背上。之后的拖人、抓领、行刑动作片段本来就是 `slungBack` 武器轨，直接接上。日兵乙在 CaptiveWall 的 `IjaReadyRifle`（`slungBack → twoHand`）、日兵甲在 Wipe 的 `IjaReadyRifle` 起改回持枪，此后的搜索、催促、看押仍端枪；释放给 AI（`ReleaseCombat`）一律改回持枪。
  - 纵深两名日兵（`OPENING_DEPTH_IJA`）：生成即背枪走；踹旗那一脚只用 `IjaKickPrisoner` 的下身（`pose.nativeArms`），两手垂着，枪留在背上。
  - 翻译（`unarmed`，本来就没有枪）：空手走（退下南南西沟）、空手小跑（应声入场 `speed.trot` 2.4 m/s，原来 walk 1.5；Boots 催促 2.0 仍带 `InterpreterPoint` 上身；逃跑 3.4）、站着时放松站姿，不再空手做端枪动作。
  - 前沿交火的丙、丁（VanguardFront）与背景交火组（BackdropSquads）是边跑边打，保持端枪。
- **喊翻译**：FrontPass 里甲、乙任一人离自己拖人站位不足 `ija.interpreterCallM`（5 m，看见被埋的伤兵）时，日兵乙朝连接支沟那头喊 `InterpreterCall.01`（「翻译！翻译呢！快给我滚过来！」），翻译在二十米外应 `InterpreterCall.02` 并从这一句开口起小跑过来（没有语音时按估算的开口时刻）。拖人（CaptiveDragged）要等两人到位且喊话结束，最多等 `timeouts.interpreterCallS`；整段 FrontPass 的兜底相应顺延。喊话场景的录音与导演表见 [配音同步](Data_FirstLevelVoiceSync20260919.md)。
- 实测（2026-09-26 定向探针，真实流程逐帧推进）：FrontPass 9.6 s（含喊话），甲乙入场全程 `RelaxedWalk`、手枪隐藏背枪显示，站定 `RelaxedStand`；翻译应声后 `BackRifleRun`（空手）2.4 m/s、退下 `RelaxedWalk` 1.5 m/s；拐角测速尖峰引起的一两帧走/跑闪换已由 `switchFrames` 防抖消除。

## 验证入口

- `Script_OpeningStoryboardsTest.mjs`：原动作库、接触和空间契约，加翻译扫掠防穿透、绕行路线净空、站位间距与渐显时长。
- `Script_OpeningSetTest.mjs`：国军旗归属、真实网格连续旋转和地面落点、布景生命周期。
- `Script_OpeningLensTest.mjs` / `Script_OpeningLensBrowserTest.mjs`：切入干净摄影机镜头，返回第一人称时恢复镜头层。
- `Script_OpeningStoryboardShots.mjs`：SB03_Drag、SB03、SB03_Slash、SB03_FlagKick、SB03_FlagDown，以及原有后续分镜。新增镜头要求脸部入画且不被场景或其他人遮挡、无第一人称身体；踹旗前后检查真实旗杆旋转进度。
- `Script_FirstLevelMissionBrowserTest.mjs --campaign --stage-to=3`：真实连续输入，保留击杀、还权、人物与手部连续性断言；加入翻译到位及净空、五次明确切镜、五秒以上单调退黑、踹旗完成。

## 本轮实测

- 最终连续 01–03：真实输入到 MachineGun，中途不跳阶段，`FirstLevelOpeningCampaignTest` 通过（328.7 秒）；开场实测翻译最近人物距离 0.866 米，成功到达审问与救援围圈位置，五次摄影机切换和踹旗完成均通过。
- 还权异常分支：`miss`、`hide`、`early`、`absent` 四种场景全部通过；动作库实机、角色表演、第一人称契约和对白透视均通过。
- 镜头真实 HUD/composite 检查通过：独立摄影机无血边、泥污和恍惚，Reach 恢复玩家镜头层，Released 与拾枪后无残留。MotionVectorContract、high 档 CarriagePropVelocity、DraftCartEditor、Post 和 BrowserBundle 均通过。
- Exposure 的三条既有失败在主检出 `c0e1d947` 复现：phase 0 亮度差约 5.78%、增益 1.0947；phase 3 增益 1.0332。本轮对应值相同，未放宽门槛。
- Boot 的 phase 0 通过，旧 phase 1–6 报“日军远景辨识材质未接全 count=0”。主检出对照同样复现 phase 1–5；到 phase 6 前达 240 秒超时，所以该对照不算完整通过，也未删除或放宽断言。
- 已合入并保留 `c0e1d947` 战壕材质更新，TrenchSurface 与 472 模块缓存图检查通过；最终 Pages 包成功构建（473 输入模块）。
- quick 共 106 项，初跑 104 通过。音频严格门因本机 PATH 缺解码器失败，指定已有 FFmpeg 后独立复跑通过；`FirstLevelP012VisibilityTest` 的夹具缺 `manualPoses`，在未修改的主检出 `25123ec1` 复现相同错误，不记为全绿。
- 已查看渐显 1、3、5.3 秒实际截图及审问、行刑角度、踹旗与倒旗截图。原命名 `Storyboard_03_ProneWitness` 只作为历史参考，不把旧机位图片当作本轮验收。
- 合入新材质、修正救援回返路线后，全部 17 个分镜通过（164.3 秒）；再次查看 SB03、踹旗与 SB05 实际截图。SB05 翻译已回到 `(0.97, -123.42)`，头部屏幕 x=0.097，未被近处人物遮挡。
- 连续驾驶器在 `rightNestCaptured` 后等待班长真实走到 `leaderCover`，上限四秒；该事实启动走向掩护，不能当作已经到位。新增到位断言，保留原 1.5 米人物/座位间距与机枪支撑门槛，未修改第三阶段运行时。
- 发布前再合入 `78684c47` 的拖拽动作/击晕闭眼与 `7c1fd516` 的坐姿身体/低头修复；保留这些改动。集成后动作数据、第一人称、实机镜头层通过，17 个分镜再次通过（148.7 秒），并查看新拖拽与行刑截图。
- 最终集成专项六项全过：OpeningStoryboards、OpeningFirstPerson、OpeningLensBrowser、OpeningStoryboardShots、FirstLevelOpeningCampaign、MotionVectorContract（共 586.5 秒）。

截图和运行日志只留在本任务忽略目录，不提交。
