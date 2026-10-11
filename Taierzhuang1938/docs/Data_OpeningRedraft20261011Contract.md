# 第一关 01–02 开场重构契约（2026-10-11 Notion 改稿）

本册冻结「按 Notion 2026-10-11 稿重做 01–02 开场」这一轮的**决定、分包归属、冻结名字、分镜清单与验收口径**。需求原文（台词一字不改）：[Data_FirstLevelOpeningSource20261011.md](Data_FirstLevelOpeningSource20261011.md)。各包只按本册改名字；要改先由集成负责人改本册。上一轮契约 [Data_FirstLevel0105Refactor20260923Contract.md](Data_FirstLevel0105Refactor20260923Contract.md) §5–§6、分镜契约 [Data_FirstLevelStoryboard0103Contract.md](Data_FirstLevelStoryboard0103Contract.md) §3（文件归属）与 §6（预算）继续有效，本册只写增量；[Data_OpeningPinnedRescue20260927.md](Data_OpeningPinnedRescue20260927.md)、[Data_OpeningSelfRescue20260930.md](Data_OpeningSelfRescue20260930.md) 里与本册冲突的拍子作废（文档本轮结束后由集成负责人归档）。

- 用户原话（2026-10-11）：「我改了 notion 第一关里开局的镜头动画部分章节，01 02 部分，请你对游戏这部分内容进行重构，可能会涉及到白盒的调整，人物动作的更新，语音的更新等等，我希望你在调整画面之前，先用 loveart 生成必要的分镜图片做画面指导，然后才正式开工（更新的图片写回到第一关的子文档“过场动画分镜图”里）需要执行的工作都开 opus5.5+high 来完成，你做规划和验收」；补充：「需要的人物动画先自己 blender 搞定（mcp 或者直接操控都可以）能复用之前的还是都尽量复用」。
- 本轮目录（下称 REL）：`C:/Users/Bentl/OneDrive/Sync/饮河/FPS/关卡白盒/会话接力/滕县第一关01-02开场重构_20261011/`。分镜图 `REL/附件/storyboard/Storyboard_N*.png`（**只留本地与 Notion，不进仓库**）；各包报告 `REL/附件/reports/Report_<包>.md`；通用规则 `REL/附件/briefs/Common_Agent.md`。
- 分镜 Notion 页：`3e260335331c814681bbcbf89ddcfecb`（第一关子页「过场动画分镜图」），本轮 01–02 的 25 张写回那里，03 的 4 张不动。
- 基线：本册所在提交（`git log -1 --format=%H -- Taierzhuang1938/docs/Data_OpeningRedraft20261011Contract.md`），在 origin/master `3d840736` 之上。集成分支 `claude/level-one-opening-camera-refactor-e051a3`。整轮集成验收通过后由集成负责人推 master。

## 0. 流程（用户定）

1. **先出分镜**（Storyboard 包，Lovart），写回 Notion → 2. 七个实施包并行（Voice / AnimA / AnimB / Set / Sfx / Dir01 / Dir02）→ 3. 集成（合并、全量重烘、接线、整关跑通、缓存戳）→ 4. 集成负责人验收、推 master、归档文档。
2. 实施包**以分镜图为画面指导**：站位、构图、人物朝向、第一人称里看得见什么，以 Notion 正文为序、以分镜为构图（冲突时按 [分镜契约 §1](Data_FirstLevelStoryboard0103Contract.md) 的四条原则）。

## 1. 本轮决定（集成负责人拍板，不再问）

1. **全程第一人称、不切镜**，眼位沿用现行 `shunzi.seat`（洞内）/ `shunzi.witnessEye` (1.85,−125.25)（压木，朝东）。玩家可小幅转头的 phase 见 §2。
2. **洞内六人**：顺子靠洞壁坐（现行 `seat`，坐弹药箱、`ShunziSitFillCharger`）；幺娃抱枪蹲在他旁边；冬瓜（=现行 `comrade`，NRA02，左肩绷带）靠对面土壁捏半块大饼；何有田蜷在最里头钢盔扣脸；罗班长**站**在洞口背对洞里看前沟（不再跪 `LuoKneelCheck`）；刘文财蹲在罗脚边的弹药箱旁。确切站位由 Dir01 在洞的净空里摆（Set 负责道具与净空检查），起点见 §5.1。
3. **黑场数数**：渐亮前 `BunkerCount` 三句（幺娃数到九、罗「还在打后头」），期间只有远炮与近落土声；渐亮在第三句结束后起。
4. **日军进沟**从前沟**北沟沿**跳下（敌来向），落点在 J (14,−124.6) 与弯 M 之间、眼位能看见的 8–12 m 处；丙去折角 F (18.2,−125.6) 磕手榴弹甩过折角（爆点在折角以东、画外，只看闪光与烟）；丁守岔口 J；甲站沟底指方向。短哨 `whistleShort` 在炮声越过头顶之后 0.5 s。
5. **乙沿沟扎尸报数**：前沟底从 J 往西躺 3 具川军（`sweep.bodies`，§5.3；第 3 具是能动的演员 `SweepVictim`，被扎后叫一声、抓泥，再被踩住补一刀）；乙走到离眼位 5 m（x≈6.9）时甲拦住。丙的两句在折角背对着喊。
6. **冬瓜跪位**沿用现行受审川军位（R3，离眼 2.3 m，背抵北壁、面朝顺子）；拔出用现行 `IjaDragCollarFromDirt`/`IjaPullArm`/`CaptiveDraggedFromDirt`，跪 `CaptiveKneelMud`。**对上一眼**：冬瓜抬头看眼位 0.6 s 再挪开（面部层 gaze，不另烘）。
7. **机枪组**（新演员 `BunkerGunner`、`BunkerLoader`，IJA01/IJA03，Type11）从甲身后下来，拖两具尸体（道具 `mg.corpseLower/Upper`）推上**南沟沿**（朝后沟那面），歪把子架在上面那具背上朝后沟（RC 方向）点射；点射节奏 3–6 s 一次（`type11` 两发点射），审问的人不回头。02 齐射**先打这两人**。
8. **练刺刀 → 割喉**顺序按原文：「没时间了。处理掉。」→ 乙去岔口换丁 → 丁小跑来、犹豫 → 甲反手耳光 → 「扎。」→ 丁退三步喊着冲上去两刀（肩、腹）→ 冬瓜蜷在泥里嚎（`CaptiveHowl` 循环）→ 甲拨开丁、抽刺刀、揪发提起、膝顶后腰往后扳 → 「看着。」「支那猪，叫得倒响。」→ 一刀（嚎声断，`throatCut`）→ 膝盖往前送、血喷北壁 → 在冬瓜肩头绷带上擦刀两面、「咔」卡回枪口（`bayonetFixClick`）→ 「一刀，没声音。下一个你来。」→ 乙在岔口「裤子尿湿没有？」→ 「检查。往前。」割中那一帧记 `captivesKilled`。割喉的视野收窄 `interrogation.fixate` 沿用。
9. **发现**：甲端枪刺刀朝下沿沟底往洞口走，经过 `finish.bodies` 两具尸体各补一刀，到顺子身边刺刀尖停在背上一拃高（画面里看不见刀，看见他的腿与枪托），军靴踩住顺子**右手**（第一人称右手摆在画面右下 `flatFwd`），鞋跟碾 0.6 s（`bootGrind`）；装死眼缝沿用 `rescue.playDead`（从甲起身走来时就闭）；「……这个是活的。留着，问。」→ 蹲到头边抓头发（`IjaCrouchHairHold`，进 02 Hold）。记 `doorSearchStarted`。
10. **02 原地审问**沿用现行 Hold/Ask（揪发两记正手耳光、单边晕、`HeldBySlap`），台词换新；**新增 Blade**：丁从岔口走来（刀尖带血），蹲/俯身把刀尖抵在顺子**左脸颊**往下压划开（镜头 `cheekCut`：刀尖从画面左侧贴脸进入、一道刺痛白闪、左颊血从镜头下沿渗一道，2.4 s 退，残留一条血痕到还权后 16 s 内淡掉；无血雾）；翻译「说话！」；丁退三步端平枪（枪口对眼位，holdLoop）。
11. **齐射无号**：Charge 开头去掉冲锋号；`rescue.wound.shots` 改为：0.00 s 机枪手（致死）、0.12 s 副射手（致死，翻下沟沿）、0.30 s 丁胸口（致死，仰面倒在顺子腿边）、0.48 s 甲左臂（`IjaShotStaggerAway`）、0.66 s 翻译左臂（`InterpreterShotStagger`）；纵深日兵照旧 0.9 s 打死。翻译「有敌人！」随第一枪。丙在折角原地转身跪射台阶（`IjaCornerFire` 朝台阶）→ 冲在最前的弟兄 `ChargeB` 中弹滚下台阶、倒在顺子南侧 1 m（`NraShotTumbleSteps`，缺时用受击物理方向死亡）眼睛睁着。
12. **白刃**：甲（左臂伤）右手摸手榴弹、牙咬销、举到钢盔前（`IjaGrenadeBitePin` holdLoop）→ 罗班长从右后方 `LuoDadaoChopRear` 劈后颈（砍中帧 `BladeKill`）→ 手榴弹道具从他手里掉下、滚到顺子脸前 0.35 m 停住（`finish.grenadeStop`，九一式，不炸）→ `ChargeA` 砍倒想跑的翻译（`LuoDadaoChopRear`）→ 刘文财台阶 `liuShot` 击倒岔口回身举枪的**乙**（`junctionShot` 现在打的是乙）→ 丙被台阶上的枪打倒（`ChargeC`/`ChargeE` 在台阶开枪，超时强制）。还权前甲、乙、丙、丁、翻译、机枪手、副射手**全部死亡**（`vanguardIds` 七人；缺席按现行 `absent` 规则放行）。喊杀只用短促单字 `yell_sha/yell_kan/yell_chong`，罗/何/刘各一声本人的「杀！」；旧的整句 rally（「杀！大刀砍拢去！」等）不再在这段用。
13. **Lift / Check / Released / 撤离 / 集结处**：沿用 2026-09-30 自救口径（`HeLiftTimber`、`RescueHeave`、`LuoGrabRifleShove`、站姿还权、3.5 s 迟疑、`bunkerPursuit`、`CollectionMeet`、`SupportOrder`），不改。
14. **人物动作一律先复用**（用户原话）：§4 表列出每拍用什么；只有「无」的才新烘，新烘在 Blender（BlenderMCP 或无头脚本都可），仍走 `_import/Script_OpeningStoryboardClips.py` + `Script_OpeningStoryboardBake.py` 流水线。分 P0/P1 两档：P1 没做完时导演用 §4 的替身并登记 `pendingWiring`，下一轮补。
15. **配音**：改了字的场景整场重录（SeedAudio，一场一次请求、切句定位播放，[Data_FirstLevelVoiceSync20260919.md](Data_FirstLevelVoiceSync20260919.md) §0）；没改字的场景（`BunkerRunnerCall` `BunkerOrders` `BunkerIncoming` `InterpreterCall` `RescueFlee` `RescueHeave` `RescueCheck` `CollectionMeet` `SupportOrder`）**不重录**。日兵甲按 2026-10-11 用户定的口径写导演表（冷静老兵、话短、不吼不嘲弄，用「这个」「处理掉」「检查。往前。」；别再套 09-26 的「情绪给满、狂笑嘶吼」）；疯劲只给乙和翻译；翻译连珠炮照旧。`comrade` 的界面名改为「冬瓜」（键不变）。
16. **布景**：前沟 `sweep.bodies` 3 具 + `finish.bodies` 2 具川军尸体（静态尸体用战场尸体资产，`SweepVictim` 是演员）、机枪垫尸 2 具（静态）、九一式手榴弹道具、半块大饼、胸章、枪栓、冬瓜的汉阳造落在塌土边；背包里露一截蓝布便服（可选，P1）。北沟沿三处跳下点可落地（沟深 2.0，落点无杂物）。
17. **不加新事实名**；`playerSlapped`、`captivesKilled`、`doorSearchStarted`、`vanguardMeleeResolved`、`junctionShot`、`luoRescueComplete`、`playerDraggedFromWreck`、`rifleRecovered` 名字与门槛沿用，只换记在哪一拍。`MissionGatesTest` 事实门数量不变。
18. 03 以后一个字不动。分镜图不进仓库；`Script_OpeningStoryboardShots --side-by-side=REL/附件/storyboard`。
19. **分镜第一批（N01–N16，2026-10-11 下午）看图后的补充决定**：①幺娃改到顺子**南侧**（画面右前，照 N01/N02），§5.1 幺娃起点改为 (−1.0,−125.35) 朝东北；②N11/N12/N14/N16 把冬瓜的绷带画在右上臂，**以左肩为准**，不照图；③N12 的机枪画成跪射、架在沟沿上、顺沟打——**按 §1.7 做**（趴射、脚架在尸背上、越过南沟沿朝后沟），不照图；④N08 手榴弹画成菠萝形、折角画得太近——九一式是圆柱分节，折角在 F，不照图；⑤N14 甲是正手——按原文**反手**；⑥N15 停在刺入前、N16 看不出膝顶——动作按 §4.2 表做。其余构图（镜头高度、人物左右远近）照图。N17–N25 待 Lovart 积分恢复后补，补齐前 Dir01/Dir02/AnimB 按原文与 §8 文字做，图到了再对一遍。

## 2. phase 表（`Data_OpeningStoryboards.phases`，唯一来源）

| 段 | phase（按序） |
|---|---|
| Trapped（01） | Count → Banter → Orders → Incoming → Blast → Black → Wake → DropIn → Sweep → CaptiveDragged → CaptiveWall → Interrogation → Practice → Slash → Finish → Found |
| BunkerRescue（02） | Hold → Ask → Blade → Charge → Melee → Lift → Check → Released |
| RearTrench（02 撤离） | Withdraw → Corner → Collection → SupportOrder（不变） |

- 新 phase：`Count`（黑场数数，渐亮在它结束时起）、`DropIn`（短哨、跳沟、指方向、折角手榴弹、「折角，清了！」）、`Sweep`（乙扎尸报数到「……九个」、离眼位 5 m）、`Practice`（「没时间了」→ 换岗 → 丁被扇 → 两刀 → 嚎）、`Finish`（甲擦刀卡枪后端枪补刀走向洞口，到踩手前一刻）、`Blade`（丁划脸、退三步端平）。
- 下线：`FrontPass`、`Taunt`。`CaptiveWall` 现在装的是「乙验枪甩栓、甲撕胸章、机枪组架枪第一个点射」；`Slash` 从「甲拨开丁」起到「检查。往前。」止。
- 可小幅转头（`firstPerson.headLook.free`）：Wake → Ask 全部（含新 phase）与 Blade；Count/Banter/Orders 走 `seated` 自由视角。
- `perception.base` 给每个新 phase 一个值（Count 0、DropIn .8、Sweep .7、Practice .48、Finish .5、Blade .46），其余沿用。
- 驾驶器 `Script_FirstLevelCampaignOpening` 按这张表核对顺序；storyboardShots 的 `when` 只用这些 phase 名。

## 3. 对白（Voice 包；`<Scene>.<NN>` 逐句 id，台词一字不改）

| 场景 | 状态 | 句（who：text；JA = 日语播放、字幕中文） |
|---|---|---|
| `BunkerCount` | 新 | 01 yaowa「……七、八、九——」02 yaowa「九下。比刚才慢。」03 luo「还在打后头。」 |
| `BunkerBanter` | 重写 | 01 liuwencai「一人三夹，多的没得。」02 shunzi「三夹？妈卖批，打麻雀都不够。」03 liuwencai「嫌少？嫌少你龟儿自己找鬼子领去。」04 comrade「眼珠子莫掉到饼上了。」05 yaowa「……还有没得？」06 comrade「有个锤子。剩下这点，老子留到夜饭。」07 shunzi「妈卖批。老子还没埋，坟头土先给我盖起了。」08 yaowa「省事噻，等哈都不用挖坑。」09 shunzi「滚你妈的。」10 heyoutian「……哪个遭了？」11 liuwencai「没得人遭。」12 heyoutian「没得人遭，就莫吵老子睡瞌睡。」 |
| `BunkerLedger` | 新 | 01 comrade「顺子，帮我也压两夹，这只膀子抬不起来。」02 shunzi「一夹一个铜板。」03 comrade「日你先人，你娃钻钱眼眼头去了。」04 shunzi「不要现钱，记账。连前头的，六个了。」05 comrade「发饷就还。」06 shunzi「发饷？出川到现在，饷长啥样子你见过？见过个锤子。」07 comrade「嘶——狗日的……」 |
| `BunkerRunnerCall` `BunkerOrders` `BunkerIncoming` | 不变 | 沿用录音 |
| `BunkerExit` | 新 | 01 comrade「我那两夹！」02 shunzi「八个铜板了啊！」03 comrade「记到，龟儿子！」 |
| `BunkerSweep` | 新（取代 `BunkerSearch`） | 01 ijaC「折角，清了！」JA 02 ijaC「几个了？」JA 03 ijaB「七个。」JA 04 ijaB「八个。」JA 05 ijaC「我十一个。」JA 06 ijaB「你那是扎死人凑的。」JA 07 ijaB「……九个。」JA |
| `CaptiveDragged` | 重写 | 01 ijaA「这个是活的。拖出来。」JA 02 comrade「狗日的……你妈的……」03 ijaA「跪好。」JA 04 comrade「日你……先人……」05 ijaB「老古董。」JA（`InterpreterCall` 两句在 01 与 02 之间，场景不变） |
| `CaptiveInterrogation` | 重写 | 01 ijaA「……四川兵。机枪在哪儿。后沟几个人。问。」JA 02 interpreter「是！」JA 03 interpreter「太君问你，机枪在哪儿？后沟还有几个人？说了，太君饶你一条狗命！」04 interpreter「机枪！不说，今天就叫你死在这沟里！」05 comrade「滚……狗汉奸。」06 interpreter「你说了，我替你跟太君求情——」07 comrade「给日本人舔沟子的东西……也配跟老子说话？」08 ijaA「他说什么。」JA 09 interpreter「……光骂人，什么也不说。」JA |
| `CaptiveWoundTwist` | 新（无字幕） | 01 comrade 乙拧伤口时卡在喉咙里的叫声（`comradeWounded` 定妆，`subtitle:""`） |
| `BayonetPractice` | 新 | 01 ijaA「没时间了。处理掉。」JA 02 ijaA「丁。过来。上刺刀。」JA 03 ijaA「扎。」JA 04 ijaA「……叫成这样，后沟都听见了。」JA 05 ijaA「看着。」JA 06 ijaA「支那猪，叫得倒响。」JA 07 ijaA「一刀，没声音。下一个你来。」JA 08 ijaB「裤子尿湿没有？」JA 09 ijaA「检查。往前。」JA |
| `RecruitCharge` | 新（无字幕） | 01 ijaD 冲上去时的喊声（非词） |
| `CaptiveHowl` | 新（无字幕） | 01 comrade 蜷在泥里一声接一声的嚎（≥4 s，可循环，割喉时掐断） |
| `CaptiveTaunt` | 下线 | 删台词与录音（`--prune`） |
| `BunkerSearch` | 下线 | 同上 |
| `ShunziFound` | 重写 | 01 ijaA「……这个是活的。留着，问。」JA |
| `RescueInterrogation` | 重写（整场重录） | 01 ijaA「这个也问！」JA 02 interpreter「是！」JA 03 interpreter「醒醒！机枪在哪儿？你们长官在哪儿？说了，太君饶你不死，还赏你口饭吃！」04 interpreter「听见没有？不说？刚才那个就是你的下场！太君说了，你不说，就拿你给新兵练刀！」05 ijaB「快点！」JA 06 interpreter「说话！」 |
| `RescueFlee` `RescueHeave` `RescueCheck` `CollectionMeet` `SupportOrder` | 不变 | 沿用录音 |
| 喊杀（班组短句库） | 新 | `yell_sha`（杀）`yell_kan`（砍）`yell_chong`（冲）公用各 ≥3 条；`yell_sha@luo` `yell_sha@heyoutian` `yell_sha@liuwencai` 本人各 1 条 |

- 「丁。过来。」的假名不要把「丁」念成名字，用「おい、しんぺい」一类称呼；假名与汉字稿由 Voice 包定，记进 `Data_FirstLevelJapaneseSpeech.mjs`。
- `ijaD` 人设改成「十八九岁新兵，嗓子发紧、怕」；`ijaC` 「老兵，低而稳，在折角背对着喊」；`comrade` 界面名「冬瓜」。
- 场景分区表（`Data_FirstLevelMissionDialogue` 末尾的 zone 映射）与导演表（`Data_FirstLevelDialogueDirection`）每个新场景都要有；MissionGatesTest / FirstLevelMissionTest 引用的旧场景名随之改。
- 字幕出现的新字重跑 `Font/Script_FontSubset.py`（源字体按脚本头注下载到 `Font/src/`，走代理用 python urllib，curl 会握手失败），`Style_Interface.css` 6 处 + `index.html` 4 处字体戳抬成同一个新戳；`Script_TextTest` 过。

## 4. 动作（AnimA / AnimB；先复用，后新烘）

现有库：`Animation/OpeningStoryboards`（manifest `Data_OpeningStoryboardsAnimation.json`）、`Animation/MachineGunCaptives`（`CaptiveStabbedCollapse`、`IjaBayonetDownThrust`、`IjaRifleButtStrike`、`IjaBayonetGuard`…）、`Animation/HitReaction`（方向死亡）、`Animation/IjaAlertGait` / `AllyGait` / `RelaxedGait`（走跑）、`SpeakerGestures`。新 clip 名**冻结如下**；manifest 版本 `20261011OpeningStoryboardsV24Redraft`（两包各自烘只带自己的 clip，集成时全量重烘一次）。

### 4.1 复用（不烘）

| 拍 | 用 |
|---|---|
| 顺子坐压弹 / 收拾装备 | `ShunziSitFillCharger`、`Data_OpeningFirstPersonGear` |
| 传令兵 | `MessengerReport`、`RunnerLeanPostCall`、`IjaAlertGait`/原生跑 |
| 罗班长站洞口看前沟 | 原生站姿 + `GuardTurn`；下令回身 `PointBlockade` |
| 冬瓜扶墙起身 | `WoundedRiseWall` |
| 近爆 | `BlastSlamBuried`、`BlastDazedStir` |
| 丙守折角、探看、跪射 | `IjaReadyRifle`、`IjaJunctionPeek`、`IjaCornerFire` |
| 丁守岔口 / 犹豫端枪 | `IjaBayonetGuard`（MachineGunCaptives）、`IjaReadyRifle` |
| 乙扎尸（往下扎的刀） | `IjaBayonetDownThrust`（MachineGunCaptives）叠在 `IjaAlertGait` 走路上（Dir 用 upperBody）—— **AnimA 若能烘出带根运动的整条 `IjaWalkStabProne` 更好（P1）** |
| 甲拦乙 | `PointBlockade` / `IjaTauntGesture` 的抬手段 |
| 拔出冬瓜、按跪 | `IjaDragCollarFromDirt`、`IjaPullArm`、`CaptiveDraggedFromDirt`、`CaptiveKneelMud`、`CaptiveWallBrace`、「跪好」`IjaShoveToWall` |
| 翻译跑来蹲问 | `InterpreterHurryReach`、`InterpreterCrouchAsk`、`InterpreterPoint` |
| 甲站着问 | `IjaCollarQuestion`（不揪领的话用 `GuardTurn` 站姿） |
| 乙去岔口、丁跑来 | `IjaAlertGait` |
| 甲拨开丁 | `IjaShoveForward` |
| 甲抽刺刀 | `IjaDrawBayonet` |
| 甲蹲下揪发、两记耳光 | `IjaCrouchHairHold`、`IjaSlapForehand`、`IjaSlapRaise` |
| 甲乙翻译中弹 | `IjaShotStaggerAway`、`IjaShotDropRifle`、`InterpreterShotStagger` |
| 丁胸口中弹仰倒、机枪手趴尸不动、副射手翻下沟沿、乙丙被击倒 | 受击物理方向死亡（`Kill({hit})`，[Data_HitReaction.md](Data_HitReaction.md)） |
| 罗劈甲、弟兄砍翻译 | `LuoDadaoChopRear` |
| 掀木、挣出、问话塞枪 | `HeLiftTimber`、`rescue.heave`、`LuoGrabRifleShove` |
| 幺娃集结处、守军 | 现行 |

### 4.2 新烘（AnimA = 洞内、进沟、扎尸、机枪组、拔出验枪；AnimB = 练刺刀、割喉、补刀发现、02）

| 包 | clip | 骨架 | 档 | 要点 |
|---|---|---|---|---|
| A | `YaowaCrouchCatchEat` | Nra02 | P0 | 抱枪蹲（holdLoop 起点，眼跟饼）→ 事件 `catch` 单手接饼塞嘴两口 → 回蹲 |
| A | `ComradeEatBreadToss` | Nra02 | P0 | 靠壁坐（`WoundedSitRifleIdle` 姿势，左臂垂、绷带），右手捏饼小口啃（loop）→ 事件 `toss` 掰一角丢出（道具 `bread`，player/partner 轨 `breadPiece`）→ 回到啃 |
| A | `ComradePourRoundsLaugh` | Nra02 | P0 | 右手往顺子脚边倒一把散子弹（事件 `pour`）→ 笑出声扯到肩膀缩一下 → 靠回土壁闭眼（holdLoop） |
| A | `ComradeCatchDropPick` | Nra02 | P0 | 扶墙站着伸右手 → 事件 `catch` 接住一夹、另一夹落地（道具 `clipA/clipB`）→ 弯腰捡起 → 转身挤向洞口（根运动 ≤1 m） |
| A | `HeHelmetSleepSitUp` | Nra05 | P0 | 侧蜷睡、钢盔扣脸（holdLoop 起点）→ 事件 `roll` 翻个身 → 事件 `sitUp` 掀钢盔坐起、钢盔在手 |
| A | `LiuDivideAmmoToss` | Nra05 | P0 | 蹲在弹药箱旁数子弹（loop）→ 事件 `toss` 隔着人把一夹丢出 |
| A | `LiuBoxUpGo` | Nra05 | P1 | 啪地扣上箱盖 → 扛上肩起身（道具 `ammoBox`） |
| A | `IjaDropInKneel` / `IjaDropInStand` / `IjaDropInPoint` | Ija02（借给 01/03） | P1 | 从 2 m 沟沿跳下落地：单膝跪端枪 / 站着端枪 / 站定收枪两指先指一侧再指另一侧（事件 `point1` `point2`）。三条可共用前半段 |
| A | `IjaGrenadeKnockThrow` | Ija02 | P1 | 腰上摸九一式、拔销、往钢盔上一磕（事件 `knock`）、停一拍、甩过折角（事件 `throw`，道具 `grenade`）、缩回 |
| A | `IjaWalkStabProne` | Ija02 | P1 | 端枪走两步、刀往下扎进地面高度 0.25 m 的尸背、拔出、脚不停（一循环 1 具，根运动 ~1.6 m；事件 `stab`） |
| A | `IjaStompStabTwist` | Ija02 | P0 | 停步、左脚踩住尸背（事件 `stomp`）、往下扎、拧一下（事件 `twist`）、拔出 |
| A | `CorpseStabbedClaw` | Nra02 | P0 | 趴尸被扎叫一声弓背、两手在泥里乱抓 1.2 s → 被踩住补一刀后瘫（配 `IjaStompStabTwist`） |
| A | `IjaInspectRifleBoltToss` | Ija01 | P0 | 弯腰捡起汉阳造（道具 `comradeRifle`）、拉开枪机看一眼笑、抽出枪栓（道具 `rifleBolt`）甩向沟沿外（事件 `toss`）、枪扔回泥里（事件 `drop`） |
| A | `IjaTearBadge` | Ija02 | P0 | 站在跪着的人左前，一把撕下胸章（配 `CaptiveKneelMud`，道具 `chestBadge`，事件 `tear`），扫一眼，塞进自己口袋 |
| A | `IjaHeaveCorpseLip` | Ija01/Ija03 | P1 | 把拖到沟壁下的尸体推上 1.9 m 沟沿（道具尸体由导演摆）；拖用 `IjaDragByForearm` 复用 |
| A | `IjaProneLmgOnCorpse` | Ija01 | P1 | 趴在南壁坡上、歪把子两脚架在上方尸背（道具 `type11`，高 0.55 m）、瞄向后沟；事件 `burst` 两发点射的后坐；holdLoop |
| A | `IjaKneelLoadLmg` | Ija03 | P1 | 跪在射手右侧压弹、递弹夹（loop） |
| A | `IjaThumbWoundTwist` + `CaptiveArchCaught` | Ija01 + Nra02 | P0 | 乙弯腰拇指摁进跪者左肩伤口往里拧（事件 `press`）；冬瓜整个人弓起、头后仰、叫声卡住（配 `CaptiveWoundTwist`），回到跪 |
| B | `IjaSlapRecruit` + `IjaRecruitSlapped` | Ija02 + Ija03 | P0 | 站姿反手一记耳光（事件 `hit`）；丁头甩开、钢盔歪、手扶钢盔 |
| B | `IjaRecruitChargeThrust` + `CaptiveStabbedCurl` | Ija03 + Nra02 | P0 | 丁退三步、喊着冲上去（根运动 ~2 m）、第一刀扎偏进左肩（事件 `stab1`）、拔出、第二刀扎进肚子（事件 `stab2`）、端枪站着喘（holdLoop）；冬瓜肩中刀歪倒、腹中刀蜷成一团侧躺嚎（holdLoop，配 `CaptiveHowl`）。可取 `IjaBayonetDownThrust`/`CaptiveStabbedCollapse` 改 |
| B | `IjaHairLiftKneeBack` + `CaptiveCurledPulledUp` | Ija02 + Nra02 | P0 | 从蜷着的人身后揪头发把上身提起（事件 `lift`）、左膝顶后腰、往后一扳到喉咙朝北壁/镜头；冬瓜被提起、喉咙露出 |
| B | `IjaThroatCutKneeShove` + `CaptiveThroatCutForward` | Ija02 + Nra02 | P0 | 右手正握刺刀压喉右侧、拉割（事件 `cut`，参照 `IjaThroatSlash` 的刀走法）、膝盖往前一送（事件 `shove`）；冬瓜嚎声断、血喷北壁（方向朝北壁、不朝甲）、往前扑倒侧躺、抽两下不动 |
| B | `IjaWipeBandageFixBayonet` | Ija02 | P0 | 半蹲在尸体肩头，把刀身两面在绷带上各擦一下（事件 `wipe1` `wipe2`），站起，把背着的步枪拿到手里，刺刀「咔」卡上枪口（事件 `fix`），端枪 |
| B | `IjaFinishWalkStab` | Ija02 | P0 | 端枪刺刀朝下走，经过尸体往下扎一刀拔出不停（事件 `stab`，根运动 ~1.4 m），可循环；最后一步停在趴着的人身边 |
| B | `IjaBootOnHand` | Ija02 | P0 | 站定、刺刀尖停在趴者背上一拃高（事件 `hover`）、右脚落下踩住他伸在泥里的右手（player 轨 `handR`，事件 `step`）、鞋跟碾（事件 `grind` 0.6 s）、抬脚；接 `IjaCrouchHairHold` |
| B | `IjaRecruitCheekCut` | Ija03 | P0 | 从站姿俯身/单膝，左手扶枪身，刀尖抵在趴者左脸颊（player 轨 `cheekL`，事件 `touch`）往下一压划开（事件 `cut`），手微抖，收刀起身 |
| B | `IjaRecruitLevelRifle` | Ija03 | P0 | 退三步（根运动 −1.8 m）端平枪对准前下方（holdLoop） |
| B | `IjaGrenadeBitePin` | Ija02 | P0 | 从 `IjaShotStaggerAway` 的保持（左臂垂）接：右手摸腰上手榴弹（道具 `grenade`）、举到嘴边牙咬掉保险销（事件 `bite`）、举到钢盔前（holdLoop，等罗的刀） |
| B | `NraShotTumbleSteps` | Nra02 | P1 | 冲锋中胸口中弹身子一歪、沿台阶滚下 1.5 m、仰面摊在地上眼睛睁着（缺时用受击方向死亡） |

- 工作单与烘焙实测写进 [Data_OpeningClipLibrary20260923.md](Data_OpeningClipLibrary20260923.md) 新一节；可编辑工程放 OneDrive `AI/Models/Blender/Taierzhuang1938/OpeningRedraft_20261011_<A|B>/`。
- 两包各自在 `_import/Script_OpeningStoryboardClips.py` **文件末尾**加自己的块（`# ==== 2026-10-11 redraft A ====` / `B`），不改中间；烘时 `OPENING_CLIPS=<自己的名单>`，提交产物 JSON 的浮点噪音不用还原（集成全量重烘）。
- 验收：`Script_OpeningStoryboardsTest`（四肢绕自身轴 ≤70°、接触点、holdLoop）、`Script_OpeningClipsBrowserTest --clip=…`（人与人不穿插：大腿 ≤8 cm、躯干/头 0）、每条 clip 的审片图 `tmp/OpeningStoryboards/BlenderReview/`。

## 5. 布景、道具与标记（Set 包；数据名冻结）

### 5.1 洞内六人起点（Dir01 定稿，Set 保证净空）

| 人 | 起点 | 备注 |
|---|---|---|
| 顺子 | `shunzi.seat` (−1.95,−126.25) | 不变 |
| 幺娃 | (−1.0,−125.35) 面朝东北 | 顺子南侧（分镜 N01/N02 画面右前），蹲抱枪；原北壁位 `banter.yaowa` 废 |
| 冬瓜 | 现行 `banter.comradeSeat` (0.35,−124.35) 面朝西北 | 「对面土壁」=南壁 |
| 何有田 | (−2.4,−127.1) 侧蜷朝东 | 最里头西北角 |
| 罗班长 | 现行 `banter.luo` (1.75,−125.7) 站、朝东 | 洞口 |
| 刘文财 | (1.1,−124.9) 蹲、面朝西 | 罗脚边、弹药箱 `ammoBox` 在他右手 |

### 5.2 道具（`Script_OpeningProps` / `Data_OpeningSet0103`）

`bread`（半块大饼，手持）、`breadPiece`（掰下的一角）、`ammoBox`（现成 `Model_MilitaryCrateSet`）、`clipA/clipB`（桥夹，现成 `fillCharger`）、`comradeRifle`（冬瓜的汉阳造，近爆后落在塌土边 (3.9,−125.0)）、`rifleBolt`（汉阳造枪栓，小件）、`chestBadge`（布胸章 3×8 cm，撕下后在甲手里）、`grenade`（九一式手榴弹：若库里无，`Script_OpeningProps` 程序化：直径 5 cm、高 9.5 cm 的分节圆柱、顶部引信帽）、`type11`（现成 `Model_Type11`）、`civilianShirt`（背包口露出的蓝布，P1）。

### 5.3 标记（`Data_OpeningSet0103`，Dir 读）

| 名 | 值 | 用途 |
|---|---|---|
| `sweep.bodies[0..2]` | (11.8,−124.9) (9.9,−124.3) (7.4,−124.8)，趴、头朝西 | 乙的第 7、8、9 具；[2] 是演员 `SweepVictim` 的起点 |
| `finish.bodies[0..1]` | (3.3,−124.3) (2.6,−125.95)，趴 | 甲补刀走向洞口时经过的两具；[1] 在顺子眼位东南 0.75 m |
| `mg.corpseLower` / `mg.corpseUpper` | (6.9,−123.05) 沟沿上 / 叠其上（高 +0.3） | 机枪垫尸（静态尸体资产） |
| `mg.gunner` / `mg.loader` | (6.7,−123.65) 趴、朝南 / (7.5,−123.55) 跪、朝南 | 机枪组 |
| `dropIn.lip[0..2]` | 北沟沿 (10.0,−126.6) (11.5,−126.6) (9.0,−126.7)，落点各自沟底 | 丙 / 丁 / 甲 跳下 |
| `dropIn.foldBlast` | (20.5,−126.0) | 折角以东的手榴弹爆点（画外，只给闪光与烟） |
| `finish.grenadeStop` | (2.2,−125.1) | 手榴弹滚停点（眼位东 0.35 m） |
| `practice.recruitBack` | 冬瓜跪位东 2.2 m | 丁退三步的落脚 |

Set 用 `Script_OpeningSetTest` 证明：每个标记与现行路线（`rescueRoute`、`chargeRoute`、`exitRoute`、`runnerRoute`、`interpreterEnter`、`walkIn`）净空 ≥0.5 m 或列为「刻意」；尸体不嵌沟壁、不悬空；跳下点落地高差 1.8–2.1 m。

## 6. 音效（Sfx 包；`Data_SfxSources` cue 名冻结）

新：`whistleShort`（短哨）、`grenadeKnock`（九一式磕钢盔「当」）、`bayonetStabBody`（扎进躯体）、`bayonetTwist`（拧刀）、`stompMud`（踩背）、`boltRattle`（拉开枪机）、`boltToss`（枪栓甩出落在沟外土里）、`rifleTossMud`（枪扔回泥里）、`clothRip`（撕胸章）、`bayonetFixClick`（刺刀卡回枪口）、`cheekCut`（刀划脸）、`bootGrind`（鞋跟碾手）。
复用：`type11`（点射）、`grenadeThrow`、爆炸、`grenadePin`（咬销）、`grenadeBounce`（滚到脸前）、`slap`、`throatCut`、`bayonetHit`。
每条按 [Data_SfxSources](../Data_SfxSources.mjs) 现行格式登记来源与许可（Sonniss/免费库优先，没有的用 SeedAudio 文生音效 `Script_SeedAudio*Bake` 一类脚本），真峰值量法见记忆口径；`Script_AudioTest` 过。Dir 只按 cue 名调用。

## 7. 分包与归属

| 包 | 独占 | 可加薄钩子 |
|---|---|---|
| **Storyboard**（先行） | `REL/附件/storyboard/**`、Notion 分镜页 | 无仓库改动 |
| **Voice** | `Data_FirstLevelMissionDialogue.mjs`（01–02 段 + zone 映射）、`Data_FirstLevelJapaneseSpeech.mjs`、`Data_FirstLevelDialogueDirection.mjs`、`Data_FirstLevelVoiceCast.mjs`、`Audio/FirstLevel/**`、`Data_FirstLevelMissionVoiceAlignment.mjs`、`Data_FirstLevelMissionVoiceTiming.mjs`、`Data_FirstLevelFaceTracks.json`、`Data_FaceTrackPhonemes.mjs`、班组短句库（`Script_SeedAudioSquadBarkBake` 等产物与 `Data_SquadBark*`）、`Font/**`、`Style_Interface.css`/`index.html` 字体戳 | `Data_FirstLevelMissionGates.mjs`/`Script_MissionGatesTest.mjs` 里引用场景名的几行、`Script_FirstLevelVoiceTest.mjs` 夹具 |
| **AnimA / AnimB** | `_import/Script_OpeningStoryboardClips.py` 各自末尾块、`Animation/OpeningStoryboards/**`（各烘自己的）、`Script_OpeningClipsBrowserTest.mjs` 自己的 clip 行 | `Data_OpeningStoryboards.mjs` 只动 `clips.added` 与 `version`；`Script_OpeningActorPerformance.mjs` ContactClips 名单 |
| **Set** | `Data_OpeningSet0103.mjs`、`Script_OpeningSet.mjs`、`Script_OpeningProps.mjs`、`Script_OpeningSetTest.mjs`、新模型文件 | `Data_FirstLevelMissionLayout.mjs`（沟沿跳下点）、`Data_FirstLevelPropDressing.mjs`（尸体） |
| **Sfx** | `Data_SfxSources.mjs`、`Audio/Sfx/**`、新 `Script_SeedAudio*Bake.mjs` | `Script_Audio.mjs` 只登记 cue、`Script_AudioTest.mjs` |
| **Dir01** | `Script_OpeningStoryboards.mjs` 的 Setup/Update/Tableau 与 Trapped 各 Phase（`PhaseCount`…`PhaseFound`）、`Data_OpeningStoryboards.mjs` 的 `phases`、`banter`、`ija`、`interrogation`、新 `sweep`/`practice`/`finish`、`perception.base` 01 项、`headLook.free`、`hands.beats` 01 项、`storyboardShots` N01–N19、`pendingWiring`；`Script_OpeningFirstPerson*.mjs` 01 手部拍（丢弹夹、被踩的手）；`Data_FirstLevelMission.mjs` 的 `bunkerAssault`（加 `BunkerGunner`/`BunkerLoader`、`SweepVictim`）、`Data_FirstLevelBackdropSquads.mjs` 01 段；`Script_OpeningStoryboardsTest.mjs`、`Script_FirstLevelCampaignOpening.mjs` 01 段 | `Script_FirstLevelMissionBrowserTest.mjs` 开场段、`Data_FirstLevelSpaceKeyframes.mjs` K1 |
| **Dir02** | `Script_OpeningStoryboards.mjs` 的 BunkerRescue 各 Phase（`PhaseHold`…`PhaseCheck`，新 `PhaseBlade`）、`Data_OpeningStoryboards.mjs` 的 `rescue`、BunkerRescue phase 行、`perception.base` 02 项、`hands.beats` 02 项、`vanguardIds`、`storyboardShots` N20–N25；`Data_OpeningLens.mjs`/`Script_OpeningLens.mjs`（`cheekCut`）、`Script_OpeningLensTest.mjs`、`Script_OpeningHandbackBrowserTest.mjs`、`Script_FirstLevelCampaignOpening.mjs` 02 段 | `Script_PostComposite.mjs`（只在已有采样段里做）、`Script_OpeningStoryboardsTest.mjs` 02 断言 |

- 各包**不接别包的新东西**：Dir 在新 clip / cue / 道具 / 音效该出现的地方先用最接近的现有替身（§4.1、现有 cue、现有 cue 名），逐条登记 `pendingWiring {shot, what, now, wave2}`；集成时统一接线、清空。不许用「缺了就静默退回」掩盖死引用。
- `Script_OpeningStoryboards.mjs` 两包共改：Dir02 不碰 Dir01 的区域，Dir01 不碰 `PhaseHold`…`PhaseCheck`；`Update` 的 phase 分发表由 Dir01 改，Dir02 只加自己的一行。合并冲突集成负责人解。
- 共享登记点（`index.html` 戳、`Script_TestRunner.mjs`）只改自己那几行，合并按「每个键取较大的戳，两边都改过的再抬一次」。

## 8. 分镜清单（Storyboard 包生成；Dir 的抓帧 id 同名）

25 张，2048×1152，Lovart，以现有 Notion 分镜（SB01 / SB03 / SB03C / SB05）为画风参考。全部顺子第一人称；灰褐阴天；1938 滕县前沿交通壕（沟深 2 m、土壁、木撑）；人物装备细节不作标准；不画 HUD、不画文字。暴行镜头停在动手前一拍或只拍结果（血在沟壁上），不拍伤口特写。

| id | 拍 | 画面 |
|---|---|---|
| N01 `CaveTableau` | Banter 开头 | 坐在洞底看出去：腿上汉阳造与手里桥夹在下沿；右前幺娃抱枪蹲着；对面南壁冬瓜靠壁啃半块饼、左肩绷带发黑；最里何有田侧蜷钢盔扣脸；洞口罗班长背对站着看前沟；他脚边刘文财蹲在弹药箱旁分子弹 |
| N02 `BreadToss` | Banter 04–06 | 冬瓜掰下一角饼丢过来，幺娃半起身伸手接；饼在空中 |
| N03 `RunnerReport` | Orders | 洞口外沟底传令兵扶膝喘气报告，罗班长回身抬手下令；刘文财啪地扣上箱盖，何有田抓钢盔往头上扣 |
| N04 `ClipsThrown` | Exit | 冬瓜扶着南壁站起伸右手要弹夹，第一人称两只手正把两夹丢出；一夹在他手里、另一夹落向地面 |
| N05 `NearMiss` | Blast | 洞口近失弹：闪光从画面右侧压进来，横木砸下，泥块碎木灌进洞，机位掀向地面 |
| N06 `WakeRifle` | Wake | 脸贴泥地、视野倾斜重影；断木压在身上、背包带绷紧；右前方一臂开外半埋在泥里的汉阳造 |
| N07 `DropIn` | DropIn | 低机位看前沟：北沟沿衬灰白天冒出四五把刺刀尖，两人正跳下来，先落地的丙单膝跪端枪对东边折角，丁落地对岔口，甲站在沟底两指指方向 |
| N08 `GrenadeCorner` | DropIn | 丙贴在折角，手榴弹往钢盔上一磕，手停在半空；折角那边是灰白的天 |
| N09 `SweepStab` | Sweep | 乙端着上刺刀的步枪沿沟底走来，刀往趴着的川军背上扎；再远一具已经扎过；丙在折角背对着 |
| N10 `PulledOut` | CaptiveDragged | 甲揪领、乙架胳膊把冬瓜从塌土里拔出来按跪在北壁下，正对镜头 2 m；冬瓜抬头与镜头对上一眼 |
| N11 `RifleBadge` | CaptiveWall | 乙拉开冬瓜那支汉阳造的枪机笑着看、另一只手正把枪栓甩向沟沿外；甲一把撕下冬瓜胸前的胸章 |
| N12 `CorpseGun` | CaptiveWall | 审问组身后南沟沿：两具川军尸体一具横在沟沿、一具压在上面，机枪手趴在坡上歪把子两脚架架在尸背上朝后沟打，副射手跪着压弹；前景审问的人谁也不回头 |
| N13 `ThumbWound` | Interrogation | 翻译空手蹲在冬瓜面前连珠炮逼问，乙拇指摁进冬瓜左肩的枪伤往里拧，冬瓜整个人弓起、牙咬着 |
| N14 `RecruitSlapped` | Practice | 很年轻的丁端着枪站在冬瓜前面没动，甲反手一记耳光，丁钢盔都歪了 |
| N15 `RecruitThrust` | Practice | 丁喊着冲上来，第一刀扎偏在冬瓜肩膀上；冬瓜歪倒在泥里蜷成一团；甲在旁边看着 |
| N16 `KneeAndBlade` | Slash | 甲把丁拨开，揪住蜷着的冬瓜头发把人提起来，膝盖顶住后腰往后扳，右手正握刺刀压在喉咙上——定在下刀前一拍；喉咙朝着镜头 |
| N17 `WipeFix` | Slash | 北壁上一片新喷的血；甲半蹲在倒下的冬瓜肩头把刺刀在绷带上擦，步枪已拿在手里准备卡刺刀；丁脸白端枪站着；远处岔口乙在笑 |
| N18 `FinishWalk` | Finish | 眼缝视角（上下眼皮合拢只留中间一条）：甲端枪刺刀朝下沿沟底走过来，刚往画面右下那具尸体背上补了一刀，军靴越来越近 |
| N19 `BootOnHand` | Found | 第一人称：自己的右手伸在泥里占画面右下，一只军靴踩在手背上、鞋跟碾下去；上方枪托与刺刀尖悬着 |
| N20 `HairSlap` | Hold/Ask | 甲蹲在头边左手揪着头发把头提起来、右手高举过肩要扇；翻译蹲在右前逼问；画面一侧发晕重影 |
| N21 `CheekCut` | Blade | 丁俯身，刀尖带血抵在左脸颊上往下压（刀尖从画面左侧贴脸进来，占画面一角）；甲在后面看着没催 |
| N22 `Volley` | Charge | 台阶那边一排枪口闪光：沟沿上的机枪手趴在尸体上不动了，副射手翻下沟沿；丁胸口中弹枪脱手仰面倒向镜头腿边；甲左臂中弹踉跄转开 |
| N23 `ChargeChop` | Melee | 罗班长带弟兄提大刀冲下弹坑台阶；甲右手举着手榴弹正要往钢盔上磕，罗从他右后方一刀劈向后颈；一名冲在最前的川军弟兄中弹滚在台阶下；远处弟兄砍向逃跑的翻译 |
| N24 `HeaveOut` | Lift | 何有田抓住塌顶木抬起，第一人称双手撑在泥里往前挣，膝盖在泥地拖出两道痕 |
| N25 `RifleShoved` | Check | 跪在沟底：罗班长俯身看着镜头问，一手已抓起右前方泥里的汉阳造横端起来塞过来，背景何有田、刘文财各守一侧 |

Storyboard 包交付：每张图 + `REL/附件/briefs/Storyboard_Shots_20261011.md`（每张：实际画出了什么、与清单的出入、Dir 要还原的判据），Notion 分镜页 01/02 段整体换成这 25 张（删掉 2026.09.27 / 2026.10.02 两段版本说明与旧的 01–02 图，03 段原样保留）。

## 9. 验收（集成负责人）

- 纯 node：`Script_OpeningStoryboardsTest`、`Script_OpeningSetTest`、`Script_OpeningFirstPersonTest`、`Script_OpeningLensTest`、`Script_FirstLevelVoiceTest`（含 `--audio`）、`Script_MissionGatesTest`、`Script_FirstLevelMissionTest`、`Script_AudioTest`、`Script_TextTest`、`Script_ModuleGraphTest`、`Script_TestRunnerTest`。
- 浏览器：`Script_OpeningStoryboardShots.mjs --shots=N01…N25 --side-by-side=REL/附件/storyboard`（25 张并排图）、`Script_FirstLevelMissionBrowserTest.mjs --campaign --stage-to=3`、`Script_OpeningHandbackBrowserTest.mjs`、`Script_OpeningClipsBrowserTest.mjs`、`Script_OpeningActorPerformanceBrowserTest.mjs`、`Script_PostTest.mjs`（`cheekCut` 为 0 时逐像素不变）。
- 节奏：渐亮到近爆、近爆到还权各报一个实测秒数；没有一处「罚站」（任何人在镜头里不动且无台词超过 2.5 s 要有理由）。
- 已知基线红（改前就红，别当回归）：`Script_FirstLevelMissionTest`「07+ keeps the legacy fixed-source front」、`Script_OpeningActorPerformanceBrowserTest`「luo: silent combat retains its original head pose」、`Script_TextTest` 字体子集缺字（Voice 包本轮顺手修）。
- 推 master 前：`index.html` 所有改过的模块抬 `?v=`、prepush 按根流程。

### 集成结果（2026-10-11，集成包）

- **合并**：Set → Sfx → Voice → AnimA → AnimB → Dir01 → Dir02，均 `--no-ff`。冲突：`index.html` 戳取大；`_import/Script_OpeningStoryboardClips.py` 末尾 A 块在前、B 块在后（`CaptiveStabbedCurl` 的 prev 补回 `CaptiveArchCaught`）；`Data_OpeningStoryboards.mjs` 的 `clips.added` 两边都留，phase 表取 Dir01 的 01 加 Dir02 的 Blade，`vanguardIds` 取 Dir02 的六人，`cast` 取 Dir01 的（含 gunner / loader / victim），storyboardShots / pendingWiring 取 Dir01 的 N01–N19 加 Dir02 的 N20–N25；`Data_OpeningLens.PHASE_LOOKS` 的 Finish 取 Dir02 的 `found`。
- **动作库**：没有全量重烘。实测从零重烘全部 clip 复现不了已提交的旧 clip（百余条前臂扭转分支差到 180°，`--rebake=tmp/merge/fullbake` 列表），所以旧 clip 保持已提交版本，只按骨架用 `OPENING_CLIPS` 重烘 A、B 两包的 34 条（伙伴轨用合并目录 OneDrive `OpeningRedraft_20261011_AB`）；`verify` 48 条与提交一致。`HeHelmetSleepSitUp` / `LiuDivideAmmoToss` / `LiuBoxUpGo` 加烘 NRA02（何有田、刘文财穿的是 NRA02）。manifest 220 条 rig clip。
- **接线**：§4.2 的 A、B 行全部接上（A 的 `IjaHeaveCorpseLip`、B 的 `NraShotTumbleSteps` 没烘）；Voice 的 13 场全部走录音（`RecordedTake` 全真），喊杀用 `voice.yell_*`；Sfx 十二条按 cue 名调；Set 的尸体层、comradeRifle、grenade（`Toss` 到 `finish.grenadeStop`）、type11、FoldBlast、标记（导演改读 `SET_MARKS`）。丁穿 IJA03（`WORDLESS_SPEAKERS`：只有一句非词喊声，无面部蒙皮）。
- **集成改动的标记**：北沟沿三处跳下点往眼位拉近 1 m 并移到跳下 clip 的根上（落点 z -126.2～-126.25）；丁的等待位 `practice.recruitWait` = `rescue.vanguardPosts.ijaD` 移到 (5.6,-124.05)（让开甲的补刀路线）；幺娃 (−1.2,−125.45)；翻译进场路线从第 8 具尸体与 SweepVictim 之间斜插（两边各约 0.38 m，SetTest 记为刻意）；`rescue.playDead.squint` 0.72；`fallenComrade` (1.28,−123.62)、`recruitFall` (4.11,−126.21) 为实测落点。
- **实测节奏**（`Script_FirstLevelMissionBrowserTest.mjs --campaign --stage-to=3`，游戏秒）：渐亮→近爆 106.2 s；近爆→Found 结束（进 Hold）149.3 s；Found 开始→还权 51.4 s（Hold→还权 42.7 s）；短哨→「折角，清了」11.8 s。
- **替身**：`pendingWiring` 剩 8 条（何有田的钢盔道具、传令兵喘气喊话、机枪组拖尸推上沟沿、N21 丁被甲挡住、N22 甲头出画、机枪组两人中弹滑下沟沿、ChargeB 滚台阶、N25 刘何跪姿），`wave` 仍为 1。
- **基线红**（改前就红）：`Script_FirstLevelVoiceTest --audio` 的 `BridgeCover` / `BridgeWithdraw` 提示词哈希；`Script_OpeningActorPerformanceBrowserTest`「luo: silent combat retains its original head pose」；`Script_EditorTest` 三条与音频无关；`Script_AudioNormalize` 八条旧文件。契约原写的 `Script_FirstLevelMissionTest`「07+…」与 `Script_TextTest` 在本基线上是绿的。
