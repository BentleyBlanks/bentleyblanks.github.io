# 01 洞口过场修订（2026-09-26）

本次按用户现场四条反馈调整：爆炸后渐显恢复、翻译不可穿过日军、洞旁改国军旗并由背景日兵踹倒、翻译出现时直接切入川军受害戏的独立拍摄镜头。此文覆盖旧分镜中 CaptiveDragged→Wipe 固定倒地第一人称、翻译与日兵乙旧站位，以及洞边日章旗的口径；其余救援、配音与还权条件沿用现有契约。

## 当前行为

- 爆炸闭眼后保持黑场，再按 `Data_OpeningStoryboards.blackoutRecovery` 连续淡入。全屏退黑走既有 composite 的 `fade` 通道，与眼皮开合分开；Wake 足够长，不在恢复中途切下一拍。耳鸣仍沿用共享剧情反馈。
- 翻译沿连接支沟北侧绕过折角与岔口的守兵，再走东沟南侧进入审问位置。翻译与日兵乙相隔超过 1.2 米。导演对翻译的移动使用扫掠圆形身体净空，计算整步与其他存活人物的交点，遇到占道者停步；成对拖拽和抓领动作保持原接触轨。入场路线同时通过地形坡度和场景实心体检查。回到救援围圈时改绕抓领日兵的西侧与身后，精确走完转角再接近原蹲姿站位；近身接触净空 0.44 米，普通入场 0.72 米。回返根节点不穿实心体，已有围圈站位贴近护壁的接触口径保留。
- CaptiveDragged（翻译开始入场）硬切独立机位，依次拍拖出、审问、行刑、背景踹旗；Wipe 结束后在 Reach 硬切回顺子伸手取枪。机位和视场角由 `interrogation.cinematic` 配置，镜内运动保持原连续性门槛，只有表内机位切换允许硬切。切镜时清理 TAA、SSR、AO 与曝光历史并刷新阴影。独立镜头中隐藏第一人称身体和手持道具，去掉顺子的泥污、血边及失衡效果；返回第一人称后恢复。
- 两面守军旗使用程序化青天白日满地红旗面。`flagTrench` 在原位置以独立可动合批根节点建造，`DepthIjaA` 从沟沿走到旗杆，用已有 `IjaKickPrisoner` 动作踹旗；到踢击时刻才开始连续倒落，随后日兵沿平坦沟沿离开。另一名背景兵仍走沟内原路线。旗杆与旗面一起运动，倒地状态跨后续步骤保留；重试、检查点与布景重建同步状态。

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
