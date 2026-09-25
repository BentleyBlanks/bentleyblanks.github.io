# 第一关 01–03 过场分镜还原契约（2026-09-25）

本册冻结「按 Notion《过场动画分镜图》还原 01–03 关键镜头」这一轮的**决定、分包归属、冻结名字、目标镜头与验收口径**。各包只按本册改名字；要改先由集成负责人改本册。上一轮契约 [Data_FirstLevel0105Refactor20260923Contract.md](Data_FirstLevel0105Refactor20260923Contract.md) 的 §5（角色、对白 cue、phase、口型接口、战车接口）与 §6 预算继续有效，本册只写增量。

- 用户原话（2026-09-24）：「请你尽量严格按照分镜图里设定的人的位置、场景的基本布设、镜头特效、爆炸特效的位置等来还原制作，所需的人物口型、动作都 blendermcp 来更精细化的完成；如果需要贴图素材就自己 loveart 来做；以上的工作尽可能拆分到 subagent（opus+high）里去」。
- 分镜：Notion 页 3e260335331c814681bbcbf89ddcfecb，11 张（SB01、SB02、SB03、SB03A、SB04、SB04A、SB05、SB05A、SB06、SB07、SB08）。**图只留本地**：`C:/Users/Bentl/OneDrive/Sync/饮河/FPS/关卡白盒/会话接力/滕县第一关01-03分镜还原_20260924/附件/storyboard/`（下称 REL/附件/…）。逐张读图：`REL/附件/briefs/Storyboard_Shots.md`。
- 调研（逐镜实拍对比、试摆验证过的目标数）：`REL/附件/survey/Survey_A.md`（SB01–SB04A）、`Survey_B.md`（SB05–SB08）、`Survey_Assets.md`（动作、脸、第一人称、道具、特效、Lovart）。抓帧工具：`REL/附件/survey/tools/A_StoryboardCapture.mjs`、`B_StoryboardGrab.mjs`、`*_SideBySide.py`。
- 基线：`0b1320121`（01–06 重构集成线 35e5393a5 + origin/master b3ba06096）。集成分支 `claude/level-1-cutscene-storyboard-89ce45`（worktree `.claude/worktrees/squad-movement-editor-animations-b66fb6`）。整轮完成、用户看过之前**不往 master 推**。

## 1. 还原口径

1. **照抄**：人的位置（画面左中右、前中后、远近、姿势、朝向、表情）、场景基本布设、镜头特效、爆炸与烟火的位置和方向。**不照抄**：服装与装备字样（Notion 页自述「不作为最终实机画面标准」：翻译的「通訳」袖标、日式军装）、HUD 文字与罗盘、画风。
2. **顺序与台词以 Notion 正文为准，构图以分镜为准**；两者冲突时在正文的那一刻套分镜的构图（SB04 枪托、SB04A 被拖）。
3. **不为一张图翻转世界拓扑**。左右与世界冲突时做**镜像等价**（整张画面左右对调后与世界一致）或旋转机位，在报告里逐张写明。人物与道具可以按镜头需要移动，但要在世界里说得通：不嵌墙、不悬空、走沟内折线。
4. **验收看画面，不看坐标**：§5 的数是调研在页面里试摆成立的起点，允许按实际画面调整（人 ±0.6 m、镜头 ±8°），但 §5 每镜的「画面判据」必须成立。每镜交付「分镜 | 实机」并排图。

## 2. 本轮决定（集成负责人拍板，不再问）

1. **01 受困位前移到洞口**：`shunzi.trap` 从 (−1.3,−126.2) 前移到约 (0.1,−125.45)；Wake→Found 眼位 (0.25–0.35,−125.2)、离地 0.18–0.26 m。近爆把起身跟出的顺子掀倒在洞口，塌落的木料压住背包。牵动 SnagRoot、压梁、`foundRoute`/`dragOutRoute`、PlayerPoint、`rifleMouth`、Space K1、`BunkerBeamPin*`/`BunkerRoofSag`（留作洞内塌方，不再压人）。
2. **SB02 做镜像**：爆点、塌方仍在洞口**南侧**（世界不动），近失弹从画面**右侧**喷进洞，洞内陈设（沙袋墙、标语、马灯、木箱）挂**北壁**、在画面左侧；镜头 yaw ≈ −66°、roll ≈ +17°（头向左倒）。
3. **SB01 纵深**：撤向后沟的人（何有田、刘文财、洞外兵）出洞口右转、在洞口右侧一闪而过；洞口正前方东沟纵深放 2–3 名**往前沿去的背景兵**背对镜头走远（分镜「纵深有人远去」的构图）。不改 Notion。
4. **前沟北壁加木框洞口立面**（x 2.6–5.9，门洞 x 2.7–3.9，另一口约 x 5.2；纯装饰、挖在北壁里、不挡路线）：SB03/03A/04/04A 的背景门框。
5. **SB04 枪托位**在洞口外沟边（优先试 (2.3,−124.4)，那里有塌落过梁；不成立退回调研验证过的 (3.8,−123.2)、日兵甲从北北西来）。画面判据见 §5。
6. **02 救援圈挪到南南西直沟北口**：`shunzi.dragged` → (0.60,−123.90)，镜头朝南（yaw ≈ 184°）看那条 11 m 直沟，罗班长、何有田贴西壁（画面右）从后交通壕折角 RC 摸来。日兵乙站在这条沟里、背对罗班长看守顺子。
7. **SB04A 与 02 衔接**：枪托后日兵甲抓顺子前臂把他拖进南南西沟口（即 02 的救援圈）；翻译与日兵乙此前（Taunt/Wipe 期间）已沿南南西沟往后摸了几步，听到甲喊「还藏着一个」后从沟里赶回来——所以 SB04A 的「翻译与警戒兵在通道后方赶来」是在南南西沟纵深。洞口木框与断木在画面一侧、沟纵深在另一侧，允许镜像等价。
8. **SB05A 翻译逃向**按正文往东（前沟、去 J），从画面**左侧**出画；劈砍构图至少定住 `duelHoldS`（0.45 s）后镜头跟过去拍他背对镜头沿东沟逃跑（补回分镜「沿前沟退开」的背影）。
9. **还权位改到洞口塌土东面**：顺子坐 (2.40,−125.20) 朝东（yaw ≈ −94°、俯 ≈ −8°），罗班长跪在左、刘文财右中跪射、何有田右边缘跪姿持**步枪**（正文：他已换回步枪）。~~Space K2b 改为「还权位只遮 F、不遮 J」~~ **v1.1 改为：还权位对 F 可见，由「还权迟疑」保护**——40 m 内每名日军在还权后至少还有 3 s 不开火（战役驾驶器断言），K2b 把 F 记为 need 行。依据：Dir 在坐位附近 837 个点网格探针找不到「遮 F 又看得见 J」的点；Set 证明坐位看 F 与 01 受困眼位看 F（K1 要求看得见 F）两条线几乎重合，挡住前者必先挡住后者。**还权安全是硬约束**：还权后 3 s 内玩家不掉血、追兵开火前玩家已能行动（`Script_OpeningHandbackBrowserTest` 四个负例 + 战役驾驶器都要过）。Released 时镜头保持约平视前方，不再 −52° 看地（`releaseCameraTurn` 断言相应改为「不看地 + 转向小」）。
10. **何有田的兵器**按正文：SB05A 用大刀格开再劈；SB06 持步枪。**03 机枪型号**维持现状（捷克式 Zb26Nest），不加防盾（装备细节不作标准）。
11. **SB07 挪到右侧低沟「贴这道墙！前头有人！」那一刻**（玩家约 (5.0,−143.0)，罗班长在前 4–5 m 墙根、伸臂指路）；K3「辨认三处」功能不变。分镜左侧的机枪组用**土坎背坡上 2 名守军 + 轻机枪 + 1 名伤员**代替（老周枪位在世界里方向相反）。右侧阵位机枪不抬到墙头（射界验证不动），把阵位的蓝色白盒改成**破砖墙**造型、机枪从墙的破口开火。
12. **SB08 接受从夺下阵位看的侧面远景**（世界里阵位在缺口正东 34 m，做不出背影纵队）；**第一批守军 2 → 5 人，第二批相应减少，总数不变**，同时存活预算不变（§6）。
13. **口型与表情用 BlenderMCP 精细化**：在 Blender 里逐角色调口型姿势（让嘴角、上下唇也动，不只下颌），新增表情姿势 Shock / Pain / Shout / Grit（加上已有、从没接线的 Snarl），重烘面部模型；运行时加表情接口，由导演按 phase 驱动。不按台词逐字手 K。
14. **贴图用 Lovart**（用户点名，本轮优先于仓库默认的 imagegen 顺序）；只生分镜确实需要的：标语海报底图（字用程序叠）、镜头泥点叠层（黑底灰度）、可选日章旗布面。**不改 Lovart 账号模式**（fast 扣积分，总量 ≤ 6 张成图）。
15. **天光**：分镜与概念图都是阴天灰褐，现为晴天。Set 包做一个 01–03「阴天」开关（默认关）并给 A/B 截图，由用户定；本轮验收以开关关着为准，不因阴天改雾（用户 09 月已定「先别动雾」）。
16. 翻译、日兵甲沿用上一轮模型（NRA06、IJA06）；日兵乙 IJA01。台词原则上不重录。

## 3. 分包与归属

第一波六包并行（都从契约提交拉分支；worktree 在 `.claude/worktrees/` 下，命名 `bentleyblanks_Claude_L1Sb<Key>_20260925`，分支 `claude/l1sb-<key>-20260925`）。第二波在第一波合进集成分支后接线收尾（见 §7）。

| 包 | 独占文件（只有本包改） | 可加薄钩子的共享文件 |
| --- | --- | --- |
| **Anim** 身体动作（BlenderMCP + 仓库烘焙脚本） | `_import/Script_OpeningStoryboardClips.py`、`_import/Script_OpeningStoryboardBake.py`、`Animation/OpeningStoryboards/**`、`Script_OpeningStoryboardAnimation.mjs`、`Script_OpeningProps.mjs`（若有）、`Script_OpeningClipsBrowserTest.mjs` | `Data_OpeningStoryboards.mjs` 只动 `version` 与 `clips` 表；`Script_OpeningActorPerformance.mjs` 只动 ContactClips 名单；`Script_OpeningStoryboardsTest.mjs` 只加新 clip 的断言 |
| **Face** 口型与表情（BlenderMCP） | `_import/Script_AuthorCharacterFacial.py`、`_import/Script_BakeCharacterFacial.py`、`Model/Character/Model_Lugou*Facial.glb`、`Script_CharacterFacialAnimation.mjs`、`Data_Tuning_CharacterSpeech.mjs`、`Script_CharacterSpeech*Test.mjs`、脸部血污贴图/材质 | `Data_LugouCharacterManifest.json` 的 facial 字段 |
| **Eye** 第一人称与镜头后处理 | `Script_OpeningFirstPerson.mjs`、新 `Data_OpeningFirstPersonExtra.mjs`、新 `Script_OpeningLens.mjs`、新 `Data_OpeningLens.mjs`、`Script_OpeningFirstPersonTest.mjs`、新 `Script_OpeningLensTest.mjs`、镜头泥点贴图 | `Script_Main.mjs`（post 参数从 `missionRuntime.Perception().lens` 取）、`Script_FirstLevelMissionRuntime.mjs`（Perception 返回值加 `lens` 字段）、`Script_PostComposite.mjs`（径向模糊只在已有采样段里做，不加 pass 和 sampler）、`Script_Hud.mjs`（白闪与泥点叠层）、`Script_OpeningStoryboards.mjs` 里**玩家身体裁剪那几行**（保留腿） |
| **Set** 布景、世界特效、贴图（Lovart） | 新 `Data_OpeningSet0103.mjs`、新 `Script_OpeningSet.mjs`、新 `Script_OpeningBlastFx.mjs`、新 `Script_OpeningSetTest.mjs`、`Texture/Texture_BunkerPoster*`、`Texture/Texture_FlagHinomaru*`、新程序化模型（马灯、旗杆） | `Data_FirstLevelMissionLayout.mjs` 的 MISSION_SCENARIO 洞口体块（塌土改形）与 03 阵位白盒的外观、`Script_FirstLevelMissionRuntime.mjs`（Set 的 Enter/Update/Exit 挂点）、`Script_Vfx.mjs`（只加导出不改旧函数） |
| **Dir** 01–02 导演 | `Script_OpeningStoryboards.mjs`（除 Eye 那几行）、`Data_OpeningStoryboards.mjs`（除 Anim 那两处）、`Script_FirstLevelOpening.mjs`、`Script_FirstLevelCampaignOpening.mjs`、`Data_FirstLevelBackdropSquads.mjs`（01–02 段）、`Data_FirstLevelSpaceKeyframes.mjs`（K1/K2/K2b）、新 `Script_OpeningStoryboardShots.mjs`（01–02 抓帧与画面判据） | `Script_FirstLevelSpaceTest.mjs`/`Script_FirstLevelSpaceShots.mjs` 的 K1/K2 段、`Script_OpeningHandbackBrowserTest.mjs`、`Script_FirstLevelMissionBrowserTest.mjs` 的开场段 |
| **Front** 03（SB07/SB08） | `Script_FirstLevelFrontBattle.mjs`、`Script_FirstLevelFrontShow.mjs`、`Data_FirstLevelFrontRoute.mjs`、`Data_Tuning_FirstLevelFront.mjs`、`Data_FirstLevelMissionFront.mjs`、`Script_FirstLevelCampaignFront*.mjs`、新 `Script_FrontStoryboardShots.mjs`（03 抓帧与画面判据） | `Data_FirstLevelMission.mjs`（只动 03 守军批次名册）、`Script_FirstLevelMissionRuntime.mjs`（03 段） |

- **第一波里各包不接别包的新东西**（彼此的分支里没有对方的文件）：Dir 用现有 clip/手势/特效把站位、镜头、时序、路线做对，在新 clip 该出现的地方先用最接近的现有 clip，并在 `Data_OpeningStoryboards.pendingWiring` 里逐条登记「第二波换成 X」；Anim/Face/Eye/Set 各自用独立的测试页或测试脚本证明自己的产物能用。**第二波统一接线**，接完 `pendingWiring` 必须为空（有断言）。不许用「缺了就静默退回」的兜底掩盖死引用。
- 共享登记点：`index.html` 的 `?v=`、`Script_TestRunner.mjs` 登记各包只改自己那几行；合并冲突集成负责人按「每个键取较大的戳，两边都改过的再抬一次」解决，合完必跑 `Script_ModuleGraphTest.mjs`。
- 新浏览器模块登记 import map；新测试登记 TestRunner（domain：openingStoryboards / firstLevel）。

## 4. 冻结名字与接口

### 4.1 新 clip（Anim；manifest 版本 `20260925OpeningStoryboardsV5`；IJA06/NRA06 仍经 `clipModelId` 借 Ija02/Nra02）

| clip | 骨架 | 用在 | 要点 |
|---|---|---|---|
| `IjaButtStrikeCollar` | Ija02 | SB04 日兵甲 | 弯腰压向顺子；左手攥顺子衣领（player 轨 `collar`）；右手握枪身把步枪**举过头、枪托在上**（分镜 SB04：枪托高举在画面左上）、砸下时枪托落向顺子；顶点 holdLoop ≥ 0.4 s（导演 `holdUntil` 放开）；单手砸下，事件 `buttHit`；player 轨带 `head`、`collar` |
| `IjaDragByForearm` | Ija02 | SB04A 日兵甲 | 弓身倒退拖人：左手抓顺子右前臂（player 轨新部位 `forearmR`），右手低持步枪；根运动约 1.5–2.5 m；可循环 |
| `InterpreterHurryReach` | Nra02 | SB04A 翻译 | 快步赶来、一臂前伸；可只做上半身（upperBody）叠在原生快走上 |
| `IjaLookBackLow` | Ija02 | SB03A 日兵甲 | 站着停步、头与上身回转向后下方看（0.6–0.8 s 后保持），枪低持 |
| `IjaStartleTurn` | Ija02 | SB05A 日兵甲 | 0.5–0.7 s 头肩猛转向右后、松开衣领；末帧与 `IjaParriedChoppedFall` 第 0 帧同根衔接 |
| `IjaGuardPort` | Ija01 | SB05 日兵乙 | 站立、枪平端在腰际指向俘虏；可循环 |
| `LuoKneelReach` | Nra05 | SB06 罗班长 | 右膝跪、探身、左手伸向顺子（「还能打不？」），再收回；末帧与 `LuoKneelCheck` 第 0 帧衔接 |
| `RunnerLeanPostCall` | Nra02 | SB01 传令兵 | 一手扶竖木撑（接触点给 manifest `contacts`）、探身朝里喊；holdLoop |
| 改：`IjaHoldCollarUp` | Ija02 | SB05 日兵甲 | 名字不变，头改为抬起、前探、脸朝被揪的人（不再帽檐盖脸） |
| 可选：`YaowaSitLoad`（Nra02，坐靠壁压子弹）、`IjaChoppedFallBack`（Ija01，被劈后仰） | | | Anim 看构图需要决定，做了就登记 |

罗班长 SB01 单膝跪看洞外用原生跪姿（KneelHold / RifleIdle），不新做。新 clip 属接触或暴力拍的加进 ContactClips。

### 4.2 表情与口型（Face）

- `rig.facial.expression = { snarl, shock, pain, shout, grit }`，各 0–1，运行时按 `Data_Tuning_CharacterSpeech.expressionBlendS` 平滑；说话口型叠在表情之上（嘴不能被表情锁死）。
- `CharacterFacial.SetExpression(rig, partial, blendS?)`（部分字段更新）；`CharacterFacial.SetFaceBlood(rig, amount 0–1)`（川军脸上血污）。
- 覆盖角色：IJA06（日兵甲）、IJA01（乙、丙）、IJA02（丁）、NRA05（罗）、NRA02（幺娃、何、刘、川军、传令兵等）、NRA06（翻译）。口型姿势 Open/Wide/Round/Close 要带嘴角与上下唇；`facialVersion` 抬版本。

### 4.3 第一人称（Eye）

- `Data_OpeningFirstPersonExtra.mjs` 导出：`EXTRA_HAND_POSES`（至少 `palmClip`、`flingOpen`、`gripForearm`、`gripSleeve`、`gripArm`、`pressBody`、`reachLeft`；抓对方的手势用 `{partner:"<castId|who>", bone:"<forearmL|forearmR|upperArmR|chest>", offset}` 求解到对方骨骼上，做法同 `grasp`）、`LEG_POSES`（`sitForward` SB01、`sprawl` SB02、`lieSide` SB03–SB04A、`sitCover` SB06；看得见大腿、膝盖、靴子）、`FP_PROPS`（`palmClipProp` 掌中桥夹、`loadingRifleOnLegs` 腿上横放的装填用汉阳造及其 `rifleSlide` 滑落轨、`packStrap` 背包带）。`Script_OpeningFirstPerson` 合并基础手势与扩展手势。
- 导演在 `beats` 里按 phase 给出 `[t, 左手, 右手]` 与 `legs: "<LEG_POSE>"`（第二波接线）。

### 4.4 镜头后处理（Eye）

- `Script_OpeningLens.Evaluate(phase, age, events) → lens`，数据在 `Data_OpeningLens.LOOKS`（按 phase 与事件的曲线）。`lens = { aberration, vignette, bloodEdge:{strength, tint, corners}, radialBlur, dofNear:{strength, focusM, rangeM}, dofFar:{strength, focusM, rangeM}, flash, mud }`。
- 运行时：导演每帧把 `Evaluate` 的结果放进 `Perception().lens`，`Script_Main` 的 post 参数从那里取；01–02 之外 `lens` 为 null、所有参数回默认。
- 起点值（调研）：SB02 色差峰值约 0.02、1.5 s 衰减，径向模糊，暗角加重；SB03 起血红暗角约 0.3（右上与左侧偏重）、近景景深 0.5 对焦约 3.8 m、泥点 Wake→Found；SB04 砸中闪白 0.08 s；SB04A 血层淡到约 0.3、去色。

### 4.5 布景与世界特效（Set）

- `OpeningSet.Enter(stage)` / `Update(dt, stage, phase, flags)` / `Exit()`；01–03 之外全部收走（BuildSink 或显式 dispose），离开后场景里不得残留（有断言）。
- 道具 id（数据在 `Data_OpeningSet0103.PROPS`）：`bunkerSandbagWallN`、`bunkerPoster`、`bunkerLantern`（带暖色点光、闪烁，只在 01 亮）、`bunkerCrateStackN`、`bunkerCrateFront`、`fallenLintel`（Blast 时从门楣落下并常驻至 02 结束）、`roofTimberDown`（SB03A 画面上沿的塌下洞顶木料）、`trenchFacadeN`（北壁木框洞口立面）、`duckboardsFront`、`duckboardsSSW`、`revetmentFront`、`revetmentSSW`、`sandbagStakesSouth`、`flagTrench`、`flagRC`、`flagSkyline*`、`deadTreeRim*`、`plankDebrisButt`（SB04 前景断木板）；03：`nestBrickWall*`（阵位破砖墙外观）、`gapWallCollapsed`、`gapRevetment`、`nestAmmoBoxes`。
- 烟火与飞机：`Data_OpeningSet0103.SMOKE`（`{id, stage, x, z, kind, scale, fire}`）、`FLYOVER`（03 开头两架日机的航线与时刻，用 `aircraft.SetManualPose`）。
- `OpeningBlastFx.DirectionalBlast(position, direction, {clods, splinters, dust, seconds})`：锥形定向喷土、土块、碎木与扬尘（SB02 从洞口南沿约 (1.2,−124.5) 向西北喷入洞内）；`OpeningSet.FallLintel(progress)` 或 `fallenLintel` 的落下轨（0.3–0.5 s）。
- 洞口塌土（Space 体块 `BunkerMouthRubbleS` 等）改形：SB03 视线上不高于约 0.35 m，同时在 SB06 坐位西侧给出靠背与对 F 的遮挡；带碰撞与掩体标签照旧。
- `Data_OpeningSet0103.sky.overcast`（默认 false）：01–03 阴天开关。

### 4.6 导演（Dir）数据名

- `Data_OpeningStoryboards.shunzi.trap / dragged / cover` 按 §2 改值；`rescue.*`、`interrogation.*`、`banter.*` 按 §5 改；新增 `pendingWiring: [{shot, what, now, wave2}]`；新增 `storyboardShots`（每镜的 phase、取样时刻、画面判据），由 `Script_OpeningStoryboardShots.mjs` 读取。

## 5. 目标镜头表（起点数与画面判据）

坐标：X 东、Z 南、米；yaw 用 three.js 约定（0 朝北、−90° 朝东、+90° 朝西、180° 朝南）；眼高 = 离当点地面；竖直视场导演期间 65°（16:9 水平约 97°）。「画面判据」用 1280×720 截图的归一化坐标（x 左→右、y 上→下）。详细推导与试摆图见 Survey_A/B 对应小节。

| 镜 | 时刻 | 镜头起点 | 人与物的起点 | 画面判据（必须成立） |
|---|---|---|---|---|
| SB01 | Orders 0–4 s（Banter 同构图，可 ±0.14 rad 转头） | 眼 (−1.95,−126.25) 高 0.95，yaw −93°，pitch −15° | 幺娃 (−0.55,−127.35) 靠北壁低坐压子弹；传令兵 (0.72,−127.0) 北门柱内侧扶柱探身喊；罗班长 (1.75,−125.7) 洞口单膝跪朝东；负伤川军 (0.35,−124.35) 靠南壁坐、手拿子弹；北壁弹药箱两层、左下前景木箱；东沟铺板与护壁；纵深 2–3 名背景兵远去 | 洞口在 x 0.30–0.74；幺娃在左 1/3、传令兵在左中扶着竖木撑、罗班长背影在中、川军在右；地平线约 y 0.25；左手掌心托桥夹在中下偏左，腿上横放的枪在右下；看得见自己的腿 |
| SB02 | Blast 0.22–0.95 s（闭眼推后到约 0.95 s） | 起：Incoming 站姿眼高 1.32；0.22–0.65 s 下落到 0.75、移向受困位，yaw → −66°，pitch −14°，roll +17° | 爆点世界不动；`DirectionalBlast` 从洞口南沿向西北喷入；`fallenLintel` 0.25–0.6 s 塌下；北壁沙袋、标语、马灯（亮）、木箱在画面左 | 画面右侧有成片泥土、土块、碎木朝镜头喷来；左侧看得见沙袋、标语、马灯光；竖木撑与洞口仍可辨；画面倾斜 ≥ 12°；强色差与边缘径向模糊可见；右手张开甩出；装填用的枪从前景滑开；看得见腿 |
| SB03 | CaptiveDragged +2 s 至 Interrogation | 眼 (0.35,−125.15) 高 0.26，yaw −80°，pitch +5°，roll +4° | 甲 (4.10,−125.63)、川军 (4.06,−125.90)（脸上血污）、乙 (5.0,−124.86)、翻译 (4.75,−124.85) 侧身对川军；汉阳造 (1.25,−125.75) yaw −125°；北壁立面门洞在组后；旗 (10.5,−122.3)；黑烟 3 股；南壁沙袋木桩；`fallenLintel` 左上前景 | 审问组在左中（x 0.25–0.55），组后是黑洞门框；右侧是沟的纵深、沟沿的旗与远处的人；天空有烟柱；门柱过梁不再框住画面；右手摊在泥里在右下；枪在左中下、够不到；四角血红暗角、前景虚、泥点 |
| SB03A | Reach 末 → Found 前 1.2 s（加「回头」一拍 0.6 s） | 眼 (0.25,−125.25) 高 0.18，yaw −82°，pitch +4°，roll +3° | 死川军 (4.06,−125.88) 靠门框；甲 (4.9,−124.45) `IjaLookBackLow`；乙、翻译已离开画面（进南南西沟）；丙丁与背景日兵在东沟纵深背身；`roofTimberDown` 横过上沿；枯树；汉阳造 (1.1,−125.55) yaw −110° | 上沿一整条黑木料；左中是靠门框的死川军；右中日兵甲回头看镜头（脸可见、Snarl 起）；纵深有背身远去的日兵；左手从左下伸出、停在枪托前约 0.15 m；左边缘可见背包带 |
| SB04 | Butt：举到顶停 ≥ 0.4 s → 砸 | 眼在枪托位高 0.35，仰约 +30°，roll −4° | 甲 `IjaButtStrikeCollar`，Snarl 1；翻译在画外；枪托位附近前景断木板 | 甲俯身占中偏左、龇牙可见；枪托高举过头在画面左上；右手抓着甲攥领的前臂；背景有木框黑门，门右侧可见瘫坐的死川军；天空占比 ≤ 40%；砸中闪白 |
| SB04A | 砸后 0.6 s 起约 2.5 s，并入 Boots | 眼高 0.3，roll ≈ −8°，眩晕柔化 | 甲 `IjaDragByForearm` 拖向南南西沟口 (0.6,−123.9)；翻译 `InterpreterHurryReach` 与日兵乙从南南西沟纵深赶来 | 甲的脸约 0.7 m、龇牙；画面一侧是洞口木框与断木，另一侧是沟纵深里伸手赶来的翻译和端枪的日兵乙；顺子的手抓着甲的袖子；血层约 0.3 |
| SB05 | Hold 1.0 → Collar 0.5 | 眼 (0.60,−123.90) 高 0.75，yaw ≈ 184°，pitch ≈ +3° | 甲根 (0.77,−123.30) 抬脸揪领、Snarl；翻译 (1.19,−123.29) 蹲、侧脸；乙 (0.04,−119.94) `IjaGuardPort`；罗 Glimpse 起 (−3.10,−116.90) `CreepDadao` 贴西壁；何 (−4.30,−114.60)；南南西沟铺板、东壁圆木护壁、RC 外旗 (−7,−109)；RC 口背景兵与幺娃移出视线 | 甲的头在 x 0.30–0.45、脸朝镜头（不被帽檐遮住）；翻译在左边缘；乙在 x 0.55–0.65 约 4 m；罗在 x 0.70–0.85 约 8 m 弓身贴右壁、全身可见；沟底直线延伸到远处；俯仰在 −5°～+10°（不再仰 40° 看天）；双手在下沿抓着甲的前臂；震荡 ≤ 0.45（Glimpse 保留轻重影） |
| SB05A | Chop 0.25–0.45 s，Parry +0.15 s | 同 SB05，眼高 0.62 | 乙退回 (0.31,−121.12)；罗 (0.04,−120.42) `LuoDadaoChopRear`；何在罗右后 (−0.70,−119.90) 随后绕到甲背后；甲 `IjaStartleTurn` + Shock；乙的枪落 (0.55,−122.55) | 左前景甲侧身回头、惊愕可见；右中 2.5–3.5 m 罗劈乙、乙后仰；何在罗后侧；乙的枪落在画面中偏右下 ~1.4 m；随后镜头跟拍翻译背影沿东沟逃 |
| SB06 | Check 1.5 → KickRifle → Released | 坐 (2.40,−125.20) 眼高 0.72，yaw ≈ −94°，pitch ≈ −8° | 罗跪 (3.12,−125.73) `LuoKneelReach`；踢枪起点 (3.9,−125.6)、落点 (3.20,−124.85)；刘 (5.47,−123.52) 跪射朝东；何 (3.23,−124.07) 跪姿持步枪；死川军左中；J 处被击倒的日兵在正中远；远处烟柱与火点 | 罗在左 0.1–0.25 探身伸手；枪在中下约 0.85 m；右中刘跪射、右边缘何；正前是开阔的沟与远处；右下看得见自己的腿和靴子；Released 那一帧俯仰在 −15°～+5° |
| SB07 | 03 右侧低沟「贴这道墙！前头有人！」 | 玩家约 (5.0,−143.0) 站姿，默认视线 yaw ≈ −50°～−66° | 罗前方 4–5 m 墙根、`PointBlockade` 上半身伸臂指路（玩家追近 1.5 m 内罗加速，不被超过）；土坎背坡 2 名守军 + 轻机枪 + 1 名伤员；阵位破砖墙、机枪从破口开火；大黑烟柱；两架日机横飞 | 罗在右中、伸臂；右侧是残破砖墙与冒火的机枪；左侧坡上有守军机枪组；中远有拒马与烟柱；天上两架飞机 |
| SB08 | 03 末，第一批（5 人）过缺口 | 玩家在阵位机枪北侧 (25.6,−155.2)，yaw ≈ 99°，pitch ≈ −3° | 机枪在左前景、旁边弹药箱；缺口东沿倒塌砖墙、缺口段沙袋木板护壁；远处火点与烟柱 | 左前景机枪；中景 5 人一列穿过缺口进后沟（全在画面内同时可见 ≥ 3 人）；倒墙在画面一侧延伸向远处；远处有火和烟 |

## 6. 预算（任何包不得突破）

- 同时存活：03/04/05 最坏 ≤ 30、01–05 累计 ≤ 55（上一轮实测 29/29/30，零余量）——第一批改 5 人只能从第二批挪，不加人；背坡机枪组用现有守军。
- 01–03 过场帧耗时：同页交替 A/B（新布景与后处理开 vs 关），p95 ≤ 关 ×1.15；新增 draw call ≤ 60；新贴图显存 ≤ 12 MB；不加后处理 pass、不加采样器（`Script_SamplerBudgetTest.mjs`）。
- 开场动作 JSON 体积增量 ≤ 4 MB；面部 GLB 增量 ≤ 1.5 MB。
- 离开 01–03 后：新布景、烟、飞机、镜头参数全部复位（测试断言）。

## 7. 验收

1. 各包：自己的测试 + 相关旧测试全绿（基线红对照 `0b1320121`）；每镜「分镜 | 实机」并排图（本包负责的画面元素）；Blender 无残留证据。
2. 第二波接线（集成分支上）：`pendingWiring` 为空；`Script_OpeningStoryboardShots.mjs` 与 `Script_FrontStoryboardShots.mjs` 按 §5 画面判据逐镜判（能自动判的自动判：人物屏幕坐标、距离、俯仰横滚、口型开合、表情权重、镜头参数；不能自动判的出图人工看）。
3. 整关：`Script_FirstLevelMissionBrowserTest.mjs --campaign --stage-to=3`（01→03 连续）与 `--campaign --stage-from=3 --stage-to=6 --probe-front-gun` 各通过；`Script_OpeningHandbackBrowserTest.mjs` 四个负例；`Script_CharacterSpeechBrowserTest.mjs`；`Script_TestRunner.mjs --profile=quick` 全绿。
4. 最终交付：11 张「分镜 | 实机」总表图 + 阴天开关 A/B 图，交用户看。

## 8. 变更记录

- v1.0（2026-09-25）：初版。基线 `0b1320121`。
- v1.1（2026-09-25，第一波合入集成分支 `fe7fbd8d` 后，集成负责人拍板）：
  1. §2 第 9 条：F 可见、由还权迟疑保护（见正文）。Set 的 `OpeningSetTest` 里「坐位对 F 不通视」的硬断言随之改为断言还权迟疑（第二波）。
  2. **塌方态打开洞口南护壁 `BunkerSouthRevetment` 的东端**（Dir 的救援圈 S' 站在它里面）：第二波由 Set 改 Space 体块（近爆塌开，x > 0 的一段塌低或移除），同步 `Script_FirstLevelSpaceTest` 的单口断言；之后 `Data_OpeningStoryboards.wave1Allowances.revetment = null`。
  3. **03 前沿破砖墙外观活到 06**（01 起预建藏起、03–06 显示）：04–05 仍在用这个阵位，认可为 §4.5/§6「01–03 之外收走」的例外；其余 01–02 布景、烟、飞机、阴天仍在离开 03 后收走。
  4. 数据口径：`SMOKE` 用 `stages` 数组；`flagSkyline*` 不单做，由 `flagTrench` 承担；标语用繁体「保衛山東」「抗擊日寇」（1938 年用字；改简体只需 `Texture/Script_MakeBunkerPoster.mjs --simplified`，不重新生图）。
  5. 取样时刻与机位（实测后修正 §5 起点）：SB05A 取 Chop 后 0.70–0.80 s（刀在 0.45 s 才落，0.25–0.45 s 时乙不可能已后仰）；SB05 俯仰 +8°～+10°（+3° 帽顶出画）；SB06 Check 段俯仰 −3°～0°（−8° 切掉罗的眼睛）；SB04 仰约 22°（Face：仰 30° 龇牙读成暗缝，≤ 15° 最清楚）。Dir 实际落地的数：`kickFrom` (0.88,−126.15)、`heCover` (3.6,−124.3)、`blastShot` 俯 −6°、`ijaBWatch` (0.2,−121.12)、`ijaBRifleDrop` (0.2,−122.55)、`ijaAStandoffM` 0.3（Anim 重烘抬头后归零）、SB05 日兵乙 2.7 m。
  6. 追认的越界/新增归属：Dir 共享 `Script_OpeningStoryboardsTest.mjs`、`Script_FirstLevelMissionTest.mjs`；Eye 加 `Style_Game.css`，§4.4 `lens` 增字段 `desaturate`、`darken`、`storyBloodCap`、`maxPx`、可选 `impactAt`；Face 抬 `Script_CharacterModel.mjs` 的 MANIFEST_URL 戳、`Script_CharacterWounds.mjs` 补丁按 key 去重；Set 改 `Script_Aircraft.mjs`（`manualAlias`，只释放用同一 id 摆过的那架）；Front 改 `Data_FirstLevelOpening`、`Data_FirstLevelSpeakingCast`、`Script_FirstLevelMissionStageJump`、`Data_FirstLevelSpaceKeyframes`（只 K3）、`Script_FirstLevelFrontTopologyTest`、`Script_MissionOrchestration`。
  7. Front：罗指路时停火 1.2 s（`leaderLead.pointS`）认可；第一批守军 0–4、第二批 5–7（背坡机枪组 6、7 号 04 起归第二批）。
  8. Space 旧锚点（`MISSION_PLACEMENT.bunker.player/rifle/rifleMouth`、`FRONT_SPACE.shunziDragged`）第二波**同步到新值**，不标废弃。
  9. 第二波起点：`pendingWiring` 42 条 + 本条 2、8 + Set/Dir 道具与站位的 16 处重叠（`OpeningSetTest` 合并后红在这里，预期内）。
