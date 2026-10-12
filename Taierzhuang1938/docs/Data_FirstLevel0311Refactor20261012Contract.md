# 第一关 03–11 重构分包契约（2026-10-12）

用户 2026-10-11/12 实玩反馈：02 接枪后没方向、战车像 boss、06–11 没有生动感、战斗太少、日军太容易被打退。改稿在聊天里拍板（三个大方向、小目标三条规矩、日军不被打退、战斗是主线），本契约把它冻结成可并行实现的接口。参考材料（**只读**，不进仓库）：

- 改稿全文（含每站小目标 / 怎么打 / 配菜 / 过关）：`<本契约所在 worktree>/tmp/Concept0311/FirstLevel_0311_Flow.html`
- 12 张概念图：同目录 `Concept_<站>.png`；总览 `ConceptSheet_03to11.jpg`
- 俯视图（按关卡实际坐标画）：`Map_Front0205.svg`、`Map_Rear0611.svg`、`Map_Village0810.svg`、`Map_StreetFight0810.svg`

> 集成负责人的 worktree：`C:/Users/Bentl/Documents/Program/bentleyblanks.github.io/.claude/worktrees/shunzi-gun-battle-design-631d1b`（上面的 `tmp/Concept0311/` 就在这里）。

沿用 [01–05 契约](Data_FirstLevel0105Refactor20260923Contract.md) 与 [09.19 契约](Data_FirstLevelRebuild20260919Contract.md) 的名字；本文只写**改动与新增**。没写到的步骤、事实、cue、锚点、遭遇组一律不动。

## 1. 本轮定下的决定（不再问）

1. **三个大方向**：03–05 往北打回去；05 末原路撤回；06–11 一路往南。前沿只掉头一次。
2. **小目标三条规矩**：小目标一定是看得见的东西，任务字只写这个东西（不写玩家看不见的「口子」）；站在当前位置就能看见下一站；班长永远走在前面朝那个方向，到了就停下指给你看。
3. **日军不会被打退**，只会被压住、换路、等增援。玩家赢的是「顶住够久把人带走」，不是清场。所有「口子开了」类判定都改成**双条件**：冲到口子边的人被打倒或缩回 **且** 对口子开火的机枪被压住（压住 = 玩家或友军对它连续命中/近失，它趴下停火一段时间，之后会再抬头）。
4. **05 集束弹改落在支沟里**：先前一个弟兄抱着集束弹从支沟摸过去、在沟口探身时被打死，两捆弹就在他身边。旧弹药屋退出流程（几何保留，不拆），`bundleApproach` 的两人改成从路边连接口钻进来绕后的渗透组。
5. **战车不做 boss**：取消 HullDown 露面停车 15 s、取消 `TankHeard` 一问一答、取消战车三处配乐标点（`tankPreviewed/tankImmobilized/tankFireDisabled`）、取消「炮塔转过来了」提示；车与四名跟车步兵、两处增援**同时**出来；04 它当着玩家的面打死一名守军；炸哑后车组弃车逃、跟车步兵退，口子是「人退了」才开。保留：玩家亲手炸、先履带后后甲板两捆、`MobilityKill → Disabled`。远处坡上一辆烧着的车（静态，用八九式 `Disabled` 外观）。
6. **老耿与妮儿从 06 出场**（Notion 原稿 11 才出场），08–10 的村子就是耿家庄：指灶屋的无名房主并进老耿；10 的无名房主/邻居/老母亲并进老耿与何有田；灶屋里的百姓尸体撤掉。妮儿听不见、不说话（只有叫声和笑声），这件事**12 车上才说破**，06–11 只能让玩家觉得她「犟 / 喊不应」。
7. **08–10 按 COD 巷战套路**：主街是杀伤区；两条侧路（灶屋 / 西侧夹道）汇到后院；自己人在街口压火力、玩家包抄；敌人在前进方向、高低错开；推进点一过街口就不再补人；担架永远停在玩家清过的地方后面；10 的防守只看东边、一分半以内。
8. **对白先写字幕、后补录音**：新 cue 本轮只写文本与导演表；缺录音时按字数估时长走字幕（`Script_FirstLevelMissionVoice` 既有行为）。配音烘焙是第三波（Voice 包）。老耿是鲁南北方官话（占位，用户之后按耿家庄口音改）；妮儿不进对白表，叫声/笑声走音效 cue。
9. **缺的场景用白盒占位**：新几何只加 `Data_FirstLevelWhitebox<区>` 的体块（土埂、坟包、夹道门洞、后院杂物、烧着的车），不建新模型。新人物用现有模型占位：妮儿 = `CivilianFemale` 缩放 0.62（标 `child:true`，关掉成人步态幅度）；老耿 = `CivilianMale`；黑子 = `WorkingHorse` 缩放 0.75、深色；驴车 = `WoodenEvacCart` + 白盒被褥/铁锅/粮袋。
10. 既有闸门不削弱断言：改契约就同步改测试与文档；基线本来就红的项（见 §8）不算回归，但要在报告里点名。

## 2. 分包与归属

| 包 | 波次 | 独占文件（只有本包改） | 共享文件（只加自己的块，见 §2.1） |
| --- | --- | --- | --- |
| **A Front 03–05** | 第一波 | `Script_FirstLevelFrontBattle`、`Script_FirstLevelFrontScenes`、`Script_FirstLevelCampaignFront`、`Script_FirstLevelCampaignFrontBattle`、`Script_FirstLevelTankBrain`、`Script_FirstLevelTankRuntime`、`Script_TankAudio`（只动 hatch/bail-out）、`Data_Tuning_Tank`、`Data_Tuning_FirstLevelFront`、`Data_FirstLevelFrontRoute`、`Data_FirstLevelFrontPressure`、`Script_FirstLevelFrontPressure`、`Data_FirstLevelMissionFront`、`Data_FirstLevelMissionMusic`、`Data_FirstLevelWhiteboxFront`、`Data_FirstLevelSpeakerGestures`、`Script_FirstLevelFrontTest`、`Script_FirstLevelFrontPacingTest`、`Script_FirstLevelFrontPressureTest`、`Script_FirstLevelTankBrainTest`、`Script_FirstLevelFrontTopologyTest`、`Script_FirstLevelFrontRouteBrowserTest`、`Script_FirstLevelLeaderGuide*`（03–05 表）、新 `Script_FirstLevelFrontCounterattack.mjs`（侧翼反扑 / 掷弹筒 / 守军中弹拖人 / 车组弃车的纯规则） | `Data_FirstLevelMission`（Support/MachineGun/Tank 三行 + 前沿遭遇组）、`Data_FirstLevelMissionGates`、`Data_FirstLevelMissionDialogue`、`Data_FirstLevelDialogueDirection`、`Data_FirstLevelVoiceCast`（只动 `LEADER_TANK_BARK_KEYS`/撤句表）、`Data_Text_FirstLevel`、`Script_FirstLevelMissionRuntime`（只动 Support/MachineGun/Tank 的 Enter 分支与薄钩子）、`docs/Data_FirstLevelFront20260919.md`（追加本轮一节） |
| **B Rear 06–07 + 耿家** | 第一波 | 新 `Script_FirstLevelGengFamily.mjs`（老耿/妮儿/黑子/驴车：生成、跟队、捡弹壳、指物、推车，§5.6 接口）、新 `Script_FirstLevelSouthMouth.mjs`（07 沟口遭遇）、`Script_FirstLevelCollection`、`Data_FirstLevelWhiteboxRear`、`Script_FirstLevelCollectionCareTest`、新 `Script_FirstLevelGengFamilyTest.mjs`、新 `Script_FirstLevelSouthMouthTest.mjs`、`Data_Tuning_FirstLevel`（新段 `south*` / `geng*`） | `Data_FirstLevelMission`（Orders/South 两行 + `southMouth` 组）、Gates、Dialogue、Direction、`Data_FirstLevelVoiceCast`（加 `geng` 定妆条目）、`Data_Text_FirstLevel`、`Data_Meshes`（只加 child/donkey 占位变体）、`Script_FirstLevelMissionRuntime`（Orders/South 钩子 + 装配 GengFamily 一行）、`Script_FirstLevelMissionColumn`（只加「妮儿跟队」需要的只读口）、`docs/Data_FirstLevelFront20260919.md`（06–07 一节） |
| **C Village 08–11** | 第二波（B 合并后起） | `Script_FirstLevelVillageBlock`、`Script_FirstLevelKitchenAmbush`、`Script_FirstLevelCampaignMid`、`Data_Tuning_FirstLevelMid`、`Data_FirstLevelWhiteboxVillage`、`Data_FirstLevelMissionCivilianAftermath`、`Script_FirstLevelTransferCart`（11 驴车到场）、`Script_FirstLevelMidTest`、`Script_FirstLevelWhiteboxVillageTest`、新 `Script_FirstLevelStreetFight.mjs`（推进点 / 侧路 / 屋顶投弹 / 巷口两波的纯规则） | `Data_FirstLevelMission`（Village/Melee/Courtyard/TransferApproach 四行 + 村落遭遇组）、Gates、Dialogue、Direction、`Data_Text_FirstLevel`、`Script_FirstLevelMissionRuntime`（四步钩子）、`Script_FirstLevelGengFamily`（**只可加方法，不改 B 的签名**）、`docs/Data_FirstLevelMid20260919.md`（追加本轮一节） |
| **D Voice** | 第三波（A/B/C 合并、台词定稿后） | `Script_SeedAudioFirstLevelBake`、`Script_SeedAudioCastBake`、`Audio/FirstLevel/**`、`Data_FirstLevelMissionVoiceTiming/Alignment`、`Data_FirstLevelFaceTracks.json`、`Script_FirstLevelVoiceTest` | Direction（录完按实际间隔微调） |

集成（合并、`index.html` 的 `?v=` 戳、指纹重生、整关驾驶、Notion 口径）由集成负责人做；各包**不改戳、不 push、不合别人的分支**。

### 2.1 共享文件的写法（减少合并冲突）

- `Data_FirstLevelMission.mjs`：只改自己步骤那几行 `Stage(...)` 的 requirements；新遭遇组各自追加在 `MISSION_ENCOUNTERS` 末尾、用 `// ---- 0311 <包名> ----` 分隔；战术表同理。
- `Data_FirstLevelMissionGates.mjs`：新事实追加在 `MISSION_FACT_GATES` 对应步骤段末尾，`MISSION_STEP_SPAWNS` / `MISSION_ENCOUNTER_ACTIVATION` 各自加键；改既有事实只改自己步骤的。
- `Data_FirstLevelMissionDialogue.mjs`：新 cue 放在**自己步骤的注释块里**；退出流程的 cue 不删录音、不删条目，改成 `retired: true` 并在头注记原因（录音清单哈希才对得上）。01–06 的 cue 用 `PerLine`；07–18 用整段 `Cue`。
- `Data_FirstLevelDialogueDirection.mjs`：每条新 PerLine cue 都要有导演表条目（`Script_FirstLevelVoiceTest` 会查）。
- `Script_FirstLevelMissionRuntime.mjs`：只加薄钩子（`Enter` 一个 case 里一两行、`Update` 里一行），新逻辑进新模块（AGENTS.md 既定）。
- `Script_TestRunner.mjs`：新测试各自加一行，放在同区块末尾。
- 提交粒度：每包至少三次提交（数据/规则/测试+文档），提交说明用 `Claude Taierzhuang1938: ...`；只在自己的分支上提交，**不 push**，报告分支名与最终 sha。

## 3. 逐站冻结内容（实现以改稿 HTML 为准，这里只写接口与硬条件）

### 3.1 03 Support（A）

- 进入 03 就在集结处东北角下 `FrontObservation`：班长先跑到 `A.frontObservation` 停住，等玩家到 ≤ 4 m 才说（`frontObserved` 记在第一句开口时）。三指：守军（`FRONT_GUARD_POSTS`）、缺口（`Sortie.gap`）、右侧阵位（`Sortie.nest`）。玩家不停也行，班长边走边说完。
- 去程支沟里掷弹筒环境落弹（`FRONT_FIRE_POINTS.Support` 加 2–3 个沟内授权点，`baseAccuracy 0`、不进 TTK 账）。
- 夺点后反扑（新模块 `Script_FirstLevelFrontCounterattack`）：侧翼组 4 人 + 军官沿 `FRONT_FLANK_GROUP.lane` 跳到最后一线（`FRONT_SPACE.flankCraters`），在 ≤ 15 m 扔手榴弹，军官拔刀带 2–3 人冲阵位（军官冲锋喊日语 `ija_rally_charge`）；正面 6 人照旧往缺口压；夺点后 40 s 起掷弹筒每 10–16 s 落阵位一发（落点离玩家 ≥ 3.5 m，落前 1.6 s 啸声）。
- **撤退窗口（`frontRifleDefense` 语义改）**：`gapRushRepelled`（缺口 `B.gapRadiusM` 内无活着的进攻兵，或进攻兵缩回自己的掩体行）**且** `gapFireSuppressed`（`FrontGunner`/`FrontSupportGunner` 至少一挺处于压制状态 ≥ 2 s）。窗口会关（机枪再抬头），第一批 5 人可分两趟；窗口期内守军仍可能中弹：`firstBatchWounded` 指定 `guard 2` 在缺口里中一枪倒下、后一人拖他过去（受伤不死，仍受 `scriptEssential` 保护，倒下 + 拖是表现）。
- `tankPreviewed` 改名 **`tankHeard`**：战车离开 `Start` 路点、引擎起播即记（不再要求露面停车；`HullDown.holdS` 置 0、`preview` 去掉但路点保留）。新 cue `TankSpotted`（守军 + 班长）在 `tankHeard` 后、守军经过玩家身后时说；`TankHeard` cue 退出。
- 03 过关 requirements：`frontReached, rightNestCaptured, frontContact, frontRifleDefense, rifleWithdrawalResolved, leftGunHandover, zhouLeftGun, tankHeard`（`frontObserved` 不是过关条件）。

### 3.2 04 MachineGun（A）

- 车从 `BendExit` 出来时 **同时**：四名跟车（`FRONT_TANK_ESCORT_SLOTS`，`joinRangeM` 放宽到车一出路弯就跟）、`FRONT_RESERVE_ENTRIES` 的 MachineGun 槽全部放出、侧翼组存活者再冲阵位。
- `gapGuardKilled`：车到 `Pressure` 能看见缺口时，第二批守军里指定一人（`guard 5`）脱离保护冲缺口，被车体机枪击毙在 `Sortie.gap` 中间（尸体留着，05 撤最后两人时要绕过他）。其余守军照旧受保护。
- 车炮压阵位（`tankPositionPressured` 不变）→ 班长喊 `TankTerror` → 玩家退后墙 → **`nestFrontContested`**：3–4 名日军（侧翼存活者优先，不够从 `NorthWestPlateau` 槽补）翻进阵位前半边，与后墙隔院对打，可白刃；打退后阵位前半边不再有人久留。
- `TankArmor` 并成一句「莫打铁壳子！打跟车的！」；`tank_turret`（炮塔转过来了）从 `SquadBarkLive('leader')` 撤下（进 `SQUAD_BARK_RETIRED.leader`，录音稿不动）。
- `BundleOrder` 改写（守军报「先前有个弟兄抱着集束弹从支沟摸过去了，到现在没回来」→ 班长看车、看沟、**停一拍** → 分工 → 「顺子，跟我走支沟！」）。04 过关 requirements：`tankPositionPressured, gapGuardKilled, remainingGuardsGathered, rightRearReached, bundleOrderHeard`。
- 远处烧着的车：`Data_FirstLevelWhiteboxFront` 加静态八九式 `Disabled` 外观（或白盒车体 + 黑烟柱）在 `CrestEast` 以东坡上（约 x 90–100、z −215），从阵位射位可见、不挡路。

### 3.3 05 Tank（A）

- 路线：阵位后墙岔口 → `Sortie.attackRoute`（RoadAttack 沟）→ **`A.bundleDrop`**（沟中段，先前那个弟兄倒在这里，身边两捆集束弹，按 F 捡：`bundleTaken`）→ 沟口攻击位 `Sortie.throw`。退出：`bundleHouseReached`、`bundleReturned`、`bundleDirectionsHeard`、`BundleWhy`、`BundleSupply`。
- 去程：`sapInfiltrators`（遭遇组，3–4 人分两拨，从 `FRONT_SPACE.roadLink` 钻进旧取弹沟 `BundleApproach`，绕到后墙岔口/何有田背后；其中一人投弹）。车把炮口转向支沟（`Data_Tuning_Tank` 新 `sapWatch` 行为：隔 6–10 s 轰沟沿一发，落点离玩家 ≥ 3.5 m；蹲着不被看见）。
- `BundleFound`（班长两句）在捡弹点说；`BundleBrief` 改成跑动中两句（履带边 / 屁股后头那块铁板），不再一问一答。
- 攻击位：车两侧各 2 名跟车；先打掉近侧 2 名（或压住）才好扔；最后 4 m 浅沟蹲着也露头（`FRONT_BREACHES` 攻击尾段既有）。
- 炸哑后 **`tankCrewBailed`**：`tankCrew` 组 2 人从舱盖/车侧出来往 `Bend` 跑（可打，班长会打）；跟车步兵转为后撤（沿车路回 `BendExit`，边打边退）。缺口解封条件：`tankFireDisabled` **且** 跟车步兵离开缺口 `B.gapRadiusM`（`escortsWithdrawn`）。
- 最后两人过缺口时经过 `guard 5` 的尸体，一人伸手拽一把（表现）。
- 撤回集结处那 100 m 不排任何 cue、不起胜利音乐。
- 05 过关 requirements：`bundleRouteTraversed, bundleTaken, attackPositionReached, tankImmobilized, tankFireDisabled, escortsWithdrawn, attackRetreated, lastGuardsWithdrawn, frontDisengaged, reliefInPosition, collectionReturned, zhouGunWounded`。

### 3.4 06 Orders（B）

- 妮儿：洼地东北沟沿（02 撤下来那段 `MISSION_BUNKER_TRENCH` 末段沟顶）蹲着捡弹壳（`Script_FirstLevelGengFamily`：捡 = 弯腰/蹲、手伸地面、口袋响一声音效）；一名担架员喊 `NierShells`（两句，第二句是庄稼人北方口音占位）。玩家靠近 ≤ 6 m 她不看脸只看枪（头朝枪口方向）；玩家在她 8 m 内开枪，她走过去把落点的弹壳捡走（弹壳位置用玩家枪口附近随机点）。
- 借火改两次 F：`A.collection` 老周前 F → `BorrowLight` 1–6 句；老周掏烟递出（既有 `offer` 姿势）→ 第二次 F → 7–9 句 + 划火动作。`lightShared` 在第 9 句播完记；新内部事实 `matchAsked`。
- 起行后妮儿远远跟在队尾（§5.6 `Follow`），走沟沿不下沟。
- 06 requirements 不变。

### 3.5 07 South（B）

- 沟里：新 cue `NierFollow`（幺娃 2 句 + 顺子 1 句，幺娃丢弹壳）→ `SouthWhisper` 整段重写（原六句不改字，末尾加幺娃「一个女娃儿，她懂个啥子。」；第 5 句到第 6 句之间顺子抬头看沟沿上的妮儿 = `voiceGaze`）。
- **沟口遭遇（新模块 `Script_FirstLevelSouthMouth`）**：队伍到沟口（新锚点 `A.southMouth` ≈ 沟南口 (−16,−52) 附近）担架停住；`southMouth` 遭遇组 6 人从东北方（4 号，沿前沿通往村子的 `southTraffic`/村路方向，出生点 ≥ 60 m 外或被遮挡）赶来，`MouthGunner`（Type11）架在东侧新白盒田埂 `A.mouthEmbankment`（≈ (12,−42)）上打空地；`MouthFlankA/B` 往南绕想抢先进村。事实：`mouthContact`（机枪开火）、`mouthMgSuppressed`（压住 ≥ 2 s）、`mouthCrossed`（活着的担架全部过了开阔地进村北巷 `MISSION_ROUTES.southWalk` 末点）。担架只在 `mouthMgSuppressed` 期间跑（机枪抬头就停在田埂/电线杆后），玩家要转身打绕村的两人。
- 妮儿在 `mouthContact` 时撒腿跑进村北巷（不受伤，`scriptEssential`），先于队伍。
- 新 cue：`MouthContact`（何有田 + 班长）、`MouthGo`（班长）、`MouthFlank`（刘文财）。`VillagePointer` 保留。
- 07 requirements：`southWhisperHeard, mouthCrossed, villageMouthReached, mainStreetPointed`。
- 白盒：沟口东侧 2–3 道田埂/坟包（高 0.9–1.3 m，给日军当掩体）、机枪位土埂；不动 `southWalk` 路线与电线杆。

### 3.6 08 Village（C）

- 主街杀伤区：`RearWindow`（东窗）改成 Type11 `hold`，顺街扫；新遭遇组 `streetPush` 3–4 人从东巷（`A.eastAlley`）贴东墙根往北压向担架，**推进点**：玩家跨进灶屋北门或西侧夹道北口（新事实 `sideRouteEntered`）后 `streetPush` 不再补人（已出来的照打）。
- 自己人：何有田 + 刘文财蹲在街口（`P.streetBlock.frontParty`）压东窗（`outsideWatched` 既有）；担架停 `litterWait`（既有 `littersInCover`）。
- 老耿：`GengHouse` 三句（揪妮儿一巴掌 → 指灶屋 → 「连屋那边刚才进了人」），妮儿被拽到担架墙后；老耿蹲门边不进屋。`KitchenDetour` 保留。
- 西侧夹道：`KitchenWest`/`ConnectedHouseWest` 外侧那条 x≈49.5–51.7 的夹道（Map_StreetFight0810 的 7 号）走通到后院；`MachineGunHouseEastBack` 门洞 (49,11.3–15.5) 作为 09 窜出人的门。
- 灶屋/连屋的百姓尸体从 `MISSION_CIVILIAN_AFTERMATH_HOUSES` 撤掉（连屋可留一具邻居，摆在东侧门边）。
- 08 requirements：`streetBlockSeen, littersInCover, sideRouteEntered`（`kitchenEntered` 保留给伏击上膛）。

### 3.7 09 Melee（C）

- 灶屋：炕上半打的包袱、捆口的粮缸、灶上没锅（白盒道具）。过道伏击 QTE 原样。
- 连屋两间：东门三人照旧；加 **窗外扔进来的手榴弹**（`MeleeAlley` 那人先从东窗扔一颗再进门）。
- 西侧夹道：`alleyPop`（1 人，`MachineGunHouseEastBack` 门洞窜出，玩家进夹道 ≥ 8 m 触发）。
- 后院：`VillageGunner`（侧屋窗口）照旧扫院门；`roofThrower`（1 人，后院东排房顶 `A.roofPost`，玩家进后院 6 s 后投弹，可被先打死）；妮儿在车上拍车板指他（§5.6 `PointAt`），玩家已先打死则不发生。
- `meleeResolved` 语义：灶屋+连屋近处威胁解除（含窗外投弹者）；`villageGunSilent` 照旧归 10。

### 3.8 10 Courtyard（C）

- `GengGate`：班长喊老耿开后门 → 老耿先抱缸挪墙根（`vat`）、再和何有田拖桌（`table`）、拔闩（`courtyardGateOpen` 仍是「门真开了」）→ 车堵门 → 老耿把驴往墙根拽让出半边门。
- 玩家守院门东侧墙角 `A.laneEast`，看绕行巷东头（`A.sideAlley` 方向）：`courtyard` 组第一拨 3–4 人（既有三人 + 1），`laneWave2` 第二拨 3–4 人（带 Type11 `LaneGunner` 架在巷尾草垛）。担架只在 `laneMgSuppressed` 期间过门；整段 ≤ 90 s（超时第二拨不再补人）。
- `CartPush`（可选 F，`A.gengCartYard` 车尾）：10 s 内不推何有田去推、班长那句不说。`cartPushed` 不是过关条件。
- 10 requirements 不变：`villageGunSilent, courtyardGateOpen, courtyardPassed`（`courtyardPassed` 含驴车出门）。

### 3.9 11 TransferApproach（C）

- 驴车夹在担架队中间到接运点（`Script_FirstLevelTransferCart` 加一辆 `gengCart`，停 `P.cartBays` 新槽或空场东侧），`GengCart` 三句在车旁自说；`AskGeng`（顺子/老耿 4 句）：玩家走到老耿 2 m 内按 F，或 20 s 内没按、帮推伤兵时自动播。
- requirements 不变。

## 4. 空间硬约束

- 世界系、锚点/路线键沿用 [空间拓扑](Data_FirstLevelTopology20260919.md)；新锚点只加不改。地面一律 `SampleMissionTerrain`。
- 新白盒块：A 在 `Data_FirstLevelWhiteboxFront`（烧着的车、沟沿缺口塌低段若缺）；B 在 `Data_FirstLevelWhiteboxRear`（07 沟口田埂/坟包/机枪土埂）；C 在 `Data_FirstLevelWhiteboxVillage`（夹道门洞、后院杂物、巷尾草垛、灶屋道具）。都要过 `Script_FirstLevelSpaceTest`（路线净空 ≥ 0.35 m、不盖锚点）、各区 Whitebox*Test。
- 不改 `southWalk`/`village`/`courtyardBypass`/`cartRide` 路线点；07 担架停点用新锚点 `A.southMouthHold`（沟内，`southWalk` 投影 ≥ 沟南口前 6 m）。
- 预算：`actorPool.ija 48`、`nra 40`、`actorCapacity 144` 不动；前沿同时存活日军 ≤ 44（A 自己记账：front 10 + 侧翼 5 + 阵位 4 + 跟车 4 + 增援 5 + 渗透 4 + 车组 2 = 34 加 02 残余）；村落同时 ≤ 14。

## 5. 冻结名字

### 5.1 事实（Gates）

| 步骤 | 新增 | 改名/退出 |
| --- | --- | --- |
| Support | `frontObserved`、`gapRushRepelled`、`gapFireSuppressed`、`firstBatchWounded` | `tankPreviewed` → `tankHeard` |
| MachineGun | `gapGuardKilled`、`nestFrontContested` | — |
| Tank | `sapInfiltrationStarted`、`tankCrewBailed`、`escortsWithdrawn` | 退出 `bundleHouseReached`、`bundleReturned`、`bundleDirectionsHeard` |
| Orders | `matchAsked`、`nierSeen` | — |
| South | `nierFollowHeard`、`mouthContact`、`mouthMgSuppressed`、`mouthFlankResolved`、`mouthCrossed` | — |
| Village | `gengHouseOffered`、`sideRouteEntered`、`westAlleyEntered`、`streetPushStopped` | — |
| Melee | `alleyPopped`、`roofThrowerSpotted`、`roofThrowerDown` | — |
| Courtyard | `gengGateHeard`、`laneMgSuppressed`、`laneWave2Spent`、`cartPushed` | — |
| TransferApproach | `gengCartArrived`、`gengAsked` | — |

### 5.2 对白 cue（新 / 改 / 退）

| 站 | cue | 格式 | 说话人与内容（川军四川话；老耿北方官话占位；日语纯假名） |
| --- | --- | --- | --- |
| 03 | `FrontObservation` 新 | PerLine | luo「看到没得？那几个，下不来。」luo「就那个口子，过一个打一个。」→ 接既有 `FrontBlockade` 三句 |
| 03 | `FirstBatchCount` 新 | PerLine | liuwencai「一个……三个……五个！」 |
| 03 | `TankSpotted` 新 | PerLine | guard「战车……路那头是战车！」luo「先把人接下来！」 |
| 03 | `TankHeard` 退 | — | `retired: true` |
| 04 | `TankRoadContact` 改 | PerLine | heyoutian「右边路上！战车！战车！」luo「打跟车的！前头还有人没下来！」 |
| 04 | `TankArmor` 改 | PerLine | luo「莫打铁壳子！打跟车的！」 |
| 04 | `GapGuardDown` 新 | PerLine | liuwencai「……还剩两个。」 |
| 04 | `BundleOrder` 改 | PerLine | guard「外头……先前有个弟兄抱着集束弹从支沟摸过去了，到现在没回来！」luo「文财，看住沟口！何有田，前头交给你！」luo「顺子，跟我走支沟！」shunzi「前头还咋个过？」luo「莫走路上！跟到老子！」 |
| 05 | `BundleGo` 改 | PerLine | heyoutian「班长，快点！这边老子顶到！」luo「顺子，下沟！贴到走！」 |
| 05 | `BundleFound` 新 | PerLine | luo「……就是他。」luo「弹还在！捡起！」 |
| 05 | `BundleBrief` 改 | PerLine | luo「莫往它脸上甩！甩履带边上！」luo「还在打，就再丢一捆，丢它屁股后头那块铁板！」 |
| 05 | `BundleWhy`、`BundleSupply` 退 | — | `retired: true` |
| 06 | `NierShells` 新 | PerLine | bearer「哪家的娃儿！下来！那上头吃枪子的！」peasant「老耿家的妮儿。喊不应的，你别费那个劲。」 |
| 06 | `BorrowLight` 不改文本 | PerLine | 播放拆成 1–6 / 7–9 两段（两次 F） |
| 07 | `NierFollow` 新 | Cue | yaowa「顺哥，那个女娃儿还跟到起。」shunzi「路又不是你屋头的。」yaowa「嘿，还赖上了。」 |
| 07 | `SouthWhisper` 改 | Cue | 原六句 + yaowa「一个女娃儿，她懂个啥子。」 |
| 07 | `MouthContact` 新 | Cue | heyoutian「东边！机枪！」luo「担架莫动！顺子，压住它！」 |
| 07 | `MouthGo` 新 | Cue | luo「压住了！担架，跑！」 |
| 07 | `MouthFlank` 新 | Cue | liuwencai「有人往村里绕！」 |
| 08 | `GengHouse` 新 | Cue | geng「死哪去了！满庄子找你！」geng「当兵的！别走大街！那是俺家——灶屋连着后院，后门能绕到街后头。」geng「连屋那边……刚才进了人，俺没敢过去。」 |
| 10 | `GengGate` 新 | Cue | luo「通了！老人家，后门！」geng「缸！缸别碰！」geng「车得带走！驴也得带走！」luo「往边上靠！担架先过！」geng「……俺这车。」 |
| 10 | `CartPush` 新 | Cue | geng「当兵的！搭把手！」luo「你娃今天倒勤快。」shunzi「……搭把手嘛。」 |
| 11 | `GengCart` 新 | Cue | geng「黑子！站好！再尥蹶子，进了城就把你卖了！」geng「就这么大地方。」geng「轻点！人是肉长的，不是麻袋！」 |
| 11 | `AskGeng` 新 | Cue | shunzi「老人家，往哪走？」geng「进滕县城。城里有城墙，比庄上牢靠。」shunzi「再往南喃？」geng「再往南是临城。俺在那儿没亲没故，去干啥？」 |

`MISSION_VOICE_CAST` 新增 `geng`（老耿）、`peasant`（庄稼人）；妮儿不进对白表。班组喊话：`tank_turret` 撤下；其余不动。台词规矩：不用「咯」，口令靠重复与语序；不写地域梗；日军只说日语。

### 5.3 遭遇组 id

`southMouth`（B，6：`MouthGunner` Type11 hold、`MouthRifleA–C`、`MouthFlankA/B`）、`streetPush`（C，4）、`alleyPop`（C，1）、`roofThrower`（C，1）、`laneWave2`（C，4 含 `LaneGunner` Type11）、`sapInfiltrators`（A，4：`SapInfilA–D`，取代 `bundleApproach` 的语义，id 可沿用 `BundleBendA/B` + 新两人）、`tankCrew`（A，2，`Disabled` 时生成）。既有组不改 id。

### 5.4 锚点 / 路线

新锚点（`Data_FirstLevelMissionLayout.MISSION_ANCHORS`，各包只加自己的）：A `bundleDrop`；B `southMouth`、`southMouthHold`、`mouthEmbankment`；C `westAlleyNorth`、`westAlleySouth`、`roofPost`、`laneEast`、`gengCartYard`。`MISSION_GUIDANCE` 对应改：`Tank` 的 route 改 `attack`（不再 `bundle`）；`South` 加 `mouth` 标签。

### 5.5 任务字（`Data_Text_FirstLevel`，只写看得见的东西）

Support「跟随班长，回前沿接人。」→ 观察口后「打掉右边破墙那挺机枪。」→ 夺下后「守住阵位，掩护守军撤下来。」｜MachineGun「掩护守军，盯住右前方道路。」→「跟随班长，退到阵位后墙。」｜Tank「沿支沟摸到战车侧面。」→ 捡弹后「炸停战车。」→「退回支沟，掩护剩下的人撤回。」→「随班长撤回集结处。」｜Orders「回集结处接令。」→「护送伤员向南，跟住班长。」｜South 沟口「压住东边机枪，掩护担架冲过空地。」｜Village「主街堵死了。担架进墙后，从灶屋或西边夹道绕。」｜Melee 不变｜Courtyard「守住东边巷口，掩护担架出院门。」｜TransferApproach 不变。投掷提示 `firstLevel.hint.bundle` 改成「按住 H 蓄力：先扔履带边；还在打就补一捆上车尾。」

### 5.6 耿家接口（B 实现、C 消费）

```js
// Script_FirstLevelGengFamily.mjs（B）
export class FirstLevelGengFamily {
  constructor(runtime)            // 装配：生成 geng / nier / heizi / cart（占位模型见 §1.9）
  Enter(stepId)                   // 各步起点摆位（Orders/South/Village/Melee/Courtyard/TransferApproach）
  Update(dt)                      // 跟队、捡弹壳、指物、推车、驴受惊
  get geng(); get nier(); get heizi(); get cart()   // {position, actor, state}
  Follow(route, gapM)             // 妮儿远远跟在队尾（沟沿）
  RunTo(point, cb)                // 妮儿撒腿跑（07 进村、08 回家）
  PointAt(target, seconds)        // 妮儿拍车板 + 指向（10 屋顶），发 nier_shout 音效
  PickShellNear(point)            // 06 捡弹壳
  GengGoTo(point, cb) / GengPose(kind) // 'slap' 'vat' 'table' 'unbar' 'lead-donkey' 'load'
  CartTo(point, cb)               // 驴车移动（10 出门、11 到接运点）；cart.blocking 读得到
  Protect(bool)                   // scriptEssential/untargetable 开关（整段默认 true）
}
```

C 只能**加方法**（如 `CartBlockGate()`），不改已有签名；B 把这些状态都放进 `runtime.Debug.FirstLevelMission().gengFamily` 供驾驶脚本与测试读。

B 包实现时的增补（2026-10-12，只加不改上面的签名）：

```js
  get peasant()                   // 06 洼地沟沿上搭话的庄稼人（NierShells 第二句），07 起收走
  get cartState()                 // 驴车裸数据 { x, z, yaw, travel, moving, blocking, target, animal }
  SetCartBlocking(bool)           // cart.blocking 的写口（CartTo 不改它）
  OnLine(cueId, index)            // 逐句事件：NierFollow.03 幺娃丢弹壳、SouthWhisper.06 顺子抬头看她（运行时 VoiceEvent 转来）
  OnMouthContact()                // 07 机枪一响：撒腿沿 southWalk 跑进村北巷 R.geng.villageRefuge（Script_FirstLevelSouthMouth 调）
  VoicePosition(cue, line)        // NierShells 两句的发声位置（担架员 / 庄稼人）
  Leave() / State() / Dispose()
  // 模块级：GENG_IDS（missionId）、NIER_SHOUT_CUE（妮儿叫声 / 笑声的占位 cue，素材侧登记 nier_shout 后只改这一处）、
  // RimSide / ShellLandingPoint / MuzzlePoint / FaceYaw / PlayerYawTo（纯函数，测试用）
```

`Enter(stepId)` 在运行时 `Enter(stage)` 里对每一步各调一次（Orders 起妮儿与庄稼人；South 跟队；Village/Melee/Courtyard/TransferApproach 起老耿与驴车的占位），
C 包不必再在自己的 case 里补钩子。老耿与驴车的起点占位在 `Data_Tuning_FirstLevel.geng.gengHouse / cartYard`，C 包按村子的锚点改。

## 6. 概念图对应（验收截图要对得上）

| 站 | 概念图 | 截图里必须成立 |
| --- | --- | --- |
| 03 观察口 | `Concept_03A_observation.png` | 班长伸臂指右前；土坎背坡的守军；右侧阵位机枪冒火；左远处老周机枪 |
| 03 守阵位 | `Concept_03B_hold_nest.png` | 玩家在缴获机枪后；军官拔刀带人冲；左边守军沿土坎南侧跑过缺口 |
| 04 | `Concept_04_tank_assault.png` | 车带 4 名跟车出路弯；远处坡上烧着的车；缺口里倒下的守军 |
| 05 支沟 | `Concept_05A_bundle_trench.png` | 沟里的弟兄尸体 + 两捆弹；沟口外车的侧面 |
| 05 炸车 | `Concept_05B_tank_kill.png` | 低墙后 8 m 处甩弹；车侧面对玩家；班长在旁开枪 |
| 06 | `Concept_06_collection.png` | 老周坐着讨火；坡上妮儿捡弹壳；队伍往右上坡的电线杆方向走 |
| 07 | `Concept_07_open_ground.png` | 沟口看村子；电线杆引向村；左边田埂机枪；担架冲；妮儿跑在前 |
| 08 | `Concept_08_street_mouth.png` | 主街被翻车堵；自己人蹲街口朝东窗；右手灶屋门亮着灯笼；老耿揪着妮儿指门 |
| 09 夹道 | `Concept_09A_west_alley.png` | 夹道中段侧门窜出日军；尽头看见后院驴车 |
| 09 后院 | `Concept_09B_courtyard.png` | 院门正中；右边窗口机枪；妮儿在车上指屋顶；屋顶投弹者 |
| 10 | `Concept_10_gate_lane.png` | 院门边看巷子；巷尾日军 + 草垛机枪；门楼在屋顶上方 |
| 11 | `Concept_11_transfer_point.png` | 出门楼看接运点；驴车在队里；桥墩在远处 |

## 7. 验收

- 各包自测（改哪一段跑哪一段，不跑全套）：`Script_FirstLevelMissionTest`、`Script_MissionGatesTest`、`Script_FirstLevelVoiceTest`（不带 `--audio`）、`Script_TextTest`、`Script_FirstLevelSpaceTest`（动了布局的包）；A 加 `FrontTest`/`FrontPacingTest`/`FrontPressureTest`/`TankBrainTest`/`FrontTopologyTest`；B 加 `FrontTest`、`CollectionCareTest`、新 `GengFamilyTest`/`SouthMouthTest`、`RearSpaceTest`；C 加 `MidTest`、`WhiteboxVillageTest`、`MissionAftermathTest`。
- 实机：A `Script_FirstLevelMissionBrowserTest.mjs --campaign --stage-from=3 --stage-to=7`（连续 03→06，不许靠跳转过关）+ `--stage-from=4|5 --stage-to=6` 冷启动各一趟；B `--campaign --stage-to=7`（6→7 真走完）；C `--campaign --stage-jumps --stage-from=8`（8→11 真走完）。每趟附 `_shots/` 截图（§6 的机位）与 `Debug.FirstLevelMission().log` 时间线；各站时长要在改稿节奏表 ±40% 内。
- 报告写：分支名 + 最终 sha、改了哪些文件、每条测试的 PASS/FAIL 原文、与契约的偏差与原因、留给集成的事项（戳、指纹、配音、Notion）。

## 8. 已知基线红（不算回归，报告里点名即可）

Regroup 夹具 17 幺娃够不到老周卡死；MenuTest 副标题；SmokeOrigins 63≠65；TextTest 君/饶；PhysicsTest 帧耗时；BootTest 远景辨识材质；EndTest ZhouDeath 15.62 s；campaign 驱动在 14 Rescue / `--quality=whitebox` 下 18 起点的 `ERR_STRING_TOO_LONG`。动工前先在 `origin/master` 跑一遍自己要用的闸门记下基线。

## 9. 变更记录

- 2026-10-12 契约 v1：集成负责人按改稿冻结；第一波 A（Front）∥ B（Rear + 耿家）并行，第二波 C（Village），第三波 D（Voice）。
- 2026-10-12 A 包（Front 03–05）实现落在分支 `worktree-agent-a7b388014b4cf078c`：§3.1–3.3 全部接线。偏差三条——缺口牺牲的是第二批 7 号（5 号是面对玩家说 `TankSpotted` 的人）；去程「掷弹筒落弹声」是剧本 `FireShell` 真弹（支沟无视线，环境火点打不进来）；侧翼「再冲阵位」用 `nestFrontContested` 隔院对打实现而非第二次成组冲锋。实拍后两处收口：掷弹筒落弹（支沟 + 阵位）都是 `feedbackOnly` 不扣血（110 / 40 两档都把守阵位的玩家打死或流血至死）；`gapRushRepelled` 只看缺口 8 m 内与 16 m 内的冲锋（远处跃进不算）。留给集成的两条基线问题：`RightNestShortRetreat` 整帧三角 10.1 M > 9 M 上限（分支起点同样超）；左机枪坑的 54–55° 坡超胶囊 52° 爬坡上限，何有田交枪被钉在坡脚（本包用 `FrontBattle.RampLift` 兜底，地形改 ≤ 45° 后可撤）。实现口径见 `Data_FirstLevelFront20260919.md` §6。第二轮（合入 master 404fdcd6 后）：04 加门 `nestFrontContested` / `nestFrontCleared`（隔院近战打完、停一拍才 `BundleOrder`），04 requirements 七条；掷弹筒落弹改轻伤（12–18 hp、不开伤口、最低留 1 hp）。
- 2026-10-12 B 包（Rear 06–07 + 耿家）结果：新 `Script_FirstLevelGengFamily` / `Script_FirstLevelSouthMouth`（+ 两个纯 Node 门），06 借火两次 F、妮儿沟沿捡弹壳 / 看枪 / 跟队 / 撒腿进村，07 沟口遭遇（`southMouth` 组由 `southMouthReached` 放出、压住 ≥ 2 s 担架才跑、会再抬头），沟口东侧 5 块白盒掩体（07+ 指纹已重生）。与契约的偏差：① `A.southMouth` 取在真正的出坡起点 (−8,−36)（契约写的 ≈(−16,−52) 是沟身拐点，不是沟口），停点 (−13.4,−46.7) 在南口前 12 m；`A.mouthEmbankment` 取 (15.2,−44.9)（契约 ≈(12,−42)，离南口 24 m）；② 06/07 的驾驶与 07 时长断言在 `Script_FirstLevelCampaignFront`（A 包独占文件）的 06/07 两块里改，A 包的 03–05 块没碰；`Script_FirstLevelFrontTest` 的 South requirements 一行同步；③ 妮儿按契约 0.62 缩放约 0.99 m 高（十一岁偏矮，`R.geng.nierScale` 一处可调）；④ 新增 `Script_Actor.KIND_SPEC.civilian` 的 `girl` 分身与 `pickable` 随机池（缩放只能在那张表里给）；⑤ `nier_shout` 暂用 `hitGrunt` 抬音高占位。留给集成：`index.html` import map 登记两个新模块并抬戳（ModuleGraphTest 现红）、重跑 `Font/Script_FontSubset.py`（新文案 8 个字：嘿 她 妮 懂 稼 耿 赖 阔，TextTest 的字体两项现红）、Voice 包录 NierShells / NierFollow / MouthContact / MouthGo / MouthFlank / SouthWhisper 第 7 句与 geng / peasant 定妆。
- 2026-10-12 C 包（Village 08–11）结果：新 `Script_FirstLevelStreetFight`（纯规则 + 纯 Node 门 `Script_FirstLevelStreetFightTest`），08 东巷 `streetPush` 逐个放 / 推进点 `sideRouteEntered`（灶屋或西侧夹道）/ 老耿 `GengHouse` 一巴掌指灶屋，09 西侧夹道走通（机枪屋东墙后段开侧门、`alleyPop` ≥ 8 m 窜出）/ 连屋东窗先扔进一颗 / 后院屋顶 `RoofThrower`（进院 6 s 投弹、妮儿先指、可先打死），10 `GengGate` 缸-桌-闩-车堵门-拽驴（老耿拔闩与玩家 F 同一个 `OpenCourtyardGate`）/ `courtyard` 4 + `laneWave2` 4（草垛机枪、开门 90 s 不再补）/ 担架只在 `laneMgSuppressed` 期间过门 / `CartPush` 可选 F / `courtyardPassed` 含驴车出门，11 驴车到接运点东侧停车位 `gengCartArrived` + `GengCart` / `AskGeng`。实装口径 `docs/Data_FirstLevelMid20260919.md` §7。与契约的偏差：① 妮儿「在车上」占位是跟在车尾后一步（百姓是物理胶囊、驴车没碰撞盒）；② `LaneGunner` 的草垛放在巷东头主街口贴街东墙（x 78.4–80.4），不是巷尾正中（12 第一拨的折线与担架线都在街西半边）；③ 何有田 + 刘文财用的是既有 `frontParty` 两点（在街北半段、离东窗 10 m），喊话的前队退到 `frontPartyWait`；④ `Script_FirstLevelLeaderGuide` 的 Courtyard 分支改了一行（cover 目标 `A.courtCover → A.laneEast`）；⑤ Kit 的 `CAMPAIGN_SEGMENT_ENDS` 加 11；⑥ 10 第一拨 `courtyard` 改成 fact 门控（院门真开了才从东边来，1/12/24/36 s），不再进 10 就在巷子里等；⑦ 从连屋南门进（走夹道）的伏击按拍表「追不上作罢」转白刃，一次性按键只在灶屋那条路上；⑧ `MeleeAlley` 装睡期间挂 `scriptEssential`（08 流弹）。实跑两趟（灶屋 / 夹道）8→11 全部真走完，站时长都在节奏表 ±40% 内（Melee 一步本身 30 s，按站折算 57 s）；两趟都在 11 回看村路那一帧的整帧预算（9.04–9.19 M > 9.0 M，两级阴影同帧）翻红，详见 `docs/Data_FirstLevelMid20260919.md` §7.6。留给集成：`index.html` import map 登记 `Script_FirstLevelStreetFight.mjs` 并抬戳（ModuleGraphTest 现红）、重跑 `Font/Script_FontSubset.py`（新文案 5 个字：俺 尥 故 蹶 驴）、Voice 包录 GengHouse / GengGate / CartPush / GengCart / AskGeng。
