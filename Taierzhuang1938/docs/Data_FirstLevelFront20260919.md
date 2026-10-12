# 第一关 · 公开阶段 1–7（Front 玩法包）

> 2026-09-22 更新：03–05 的当前空间、事件门和对白以 [新采用稿](Data_FirstLevelFrontSource20260922.md) 与 [白盒契约](Data_FirstLevelFrontTopology20260922.md) 为准；本文其他阶段继续有效。


> 01–03 已由 [2026.09.21 正文](Data_FirstLevelOpeningSource20260921.md) 和 [分镜重构](Data_OpeningStoryboards20260922.md) 覆盖。以下旧受困/双俘虏/掀架段落仅作历史；04–18 保留原口径。

需求原文：[Notion 2026.09.19 采用稿转录](Data_FirstLevelRebuildSource20260919.md) 的 01–07（台词一字不改）。
接口冻结：[分包契约](Data_FirstLevelRebuild20260919Contract.md) §2 / §3 / §5 / §8。
对白与事件接口：[配音同步](Data_FirstLevelVoiceSync20260919.md)。

本页只讲阶段 1–7 怎么编排、事件怎么对位、数值从哪儿来、怎么验收。
步骤 id、事实名、锚点名、cue id **一律以契约为准**，这里不重新命名。

---

## 1. 文件与运行时钩子

| 文件 | 管什么 |
| --- | --- |
| ~~`Script_FirstLevelBunker.mjs`~~ | 2026-09-23 删除：从没被 import 过，01/02 的门外整拍在 `Script_OpeningStoryboards.FirstLevelBunkerShow` |
| `Script_FirstLevelCollection.mjs` | 背坡伤员集结处的摆位（02 就在）、传令兵、06 借火戏、老周上担架 |
| `Script_FirstLevelFrontShow.mjs` | 总线：按步骤分发，外加 02 的 `RescueOut`/`TrenchCurse`、05 的三条对白、07 的私语与路边指路（04 的指弹药屋与接枪换位是没有调用点的死代码，2026-09-23 删除） |
| `Data_Tuning_FirstLevelFront.mjs` | 本段的全部数值与两张节拍表（`BUNKER_KILL_BEATS` / `BORROW_LIGHT_BEATS`） |
| `Script_FirstLevelCampaignFront.mjs` | 阶段 1–7 的正常输入驾驶脚本（`--campaign` 的第一段） |
| `Script_FirstLevelFrontTest.mjs` | 纯 Node 门禁 |

`Script_FirstLevelMissionRuntime` 里只有四个钩子加两条事件转发：

```
constructor   this.frontShow = new FirstLevelFrontShow(this)     // 在 flow.Start() 之前
Enter         this.frontShow?.Enter(stage.id)                    // 紧跟 opening.Enter
Update        this.frontShow?.Update(dt)                         // UpdateSquad 之后（剧情走位压过接触反应）
Update        this.frontShow?.Draw(this.time)                    // view.Update 之后（people.End 会藏没提交的人）
VoiceEvent    Line → OnLine，具名事件 → OnEvent
VoiceDone     → OnVoiceDone
VoicePosition → frontShow.VoicePosition 优先
```

两个位置是**有讲究的**，改动前先看这两条：

- `Update` 在 `UpdateSquad` 之后。剧情要求某人走到某处时，接触反应 / 找掩体每帧都会把他推回掩体；
  放在后面下的走位命令才留得住。02 罗班长掀架的先例在 `UpdateSquad` 里，本包把幺娃也一并放行。
- `Draw` 在 `view.Update` 之后。集结处的伤员与搬运人员走 `FirstLevelMissionView.Person`
  那条实例化人群，不占 AI actor。当前开场敌军预算是 44：掩蔽部门外 4、接近屏 12、
  前沿 12、机枪位 12、战车护卫 4；这是 `openingEnemyBudget` 的有限名单口径，不是 `actorPool` 容量。
  它是立即模式，`view.Update` 末尾的 `people.End()` 会把这一帧没提交的人藏起来。

`Script_FirstLevelOpening` 只留近爆兜底与感知曲线，门外那一拍整段转交 `FirstLevelBunkerShow`
（`SpawnCaptives` / `UpdateBunker` / `ResetBunker` 三处转发，`captives` 变成只读 getter）。

---

## 2. 逐阶段编排

### 01 Trapped —— 黑屏、爆炸、受困

```
BunkerBanter（6 句，黑屏）
  └ 末句「来了！顺哥，你那个——」→ 具名事件 BunkerBlast
       → 近爆、控制接管 trapped（只能小幅转头）、scenario 换坍塌态、bunkerCollapsed
BunkerKilling（4 句）→ 逐句 Line 驱动四拍
  line 0 日兵甲「站起来！快点！」  butt    枪托猛砸扶人川军 → 打倒（stance 2）；腿伤者本能后缩
  line 1 伤兵「站你妈……」        recoil  腿伤者再往后缩 bunkerRecoilM
  line 2 扶人川军「日你先人——」   rise    挣扎着要起身（stance 1）
  line 3 日兵乙「杀了他！快点！」  stab    挺刺刀 → 伸手抓枪身 → 被踹开 → 刺杀
  +bunkerCaptiveStabGapS          flank   另一名日兵从侧面补刺腿伤者 → captivesKilled
  +bunkerRifleKickAtS             kick    靴子踢开尸体旁的步枪；另一人枪口转向门内；
                                          后侧同伴清理坍塌物的声音（debrisFall）开始
                                          → Say BunkerSearch
BunkerSearch 播完 → Say ShunziCurse
ShunziCurse 播完 +bunkerCreakAfterS  creak 木架轻响 → 日兵真的走向 ijaDoor → doorSearchStarted
```

**注意两条**：

- 行刑期间两名日兵保持 `scriptedNoncombatant`（编排表 `bunkerAssault` 就是「整段装睡，
  `doorSearchStarted` 才醒」）。放开的话通用 AI 会抢在补刺之前把腿伤者打死，
  「另一名日兵从侧面补刺」整拍消失 —— 这是本轮实拍踩到的第一个坑。
- 不做血腥特写：只有位置、姿态与一次 `TakeHit`，创口由门框、尘土与身体遮挡。

正常路径只认 `BunkerKilling` 的逐句 `Line`：请求该 cue 时只记 `killRequested`，收到它的
第一句才设置 `killAt` 并开始四拍。实录 `BunkerBanter` 长 16.744 秒；8 秒近爆兜底不能
抢断仍在推进的 `BunkerBanter`，后续整段兜底也不能抢 `BunkerKilling`、`BunkerSearch`
或 `ShunziCurse`。只有对应 cue/Line 实际缺失时，`bunkerKillFallbackS` 才补拍。

### 02 BunkerRescue / RearTrench —— 班长救人，撤入后交通壕

```
RescueCall（3 句）                                → rescueCallHeard
何有田在 heyoutianFire 开火逼日兵转身还击（真实弹道）
罗班长走到 luoLift、幺娃走到 yaowaLift（两个人在 UpdateSquad 里都被放行）
  两人到位或等满 rescueGatherMaxS → BeginControl("rescue") + Say RescueLift
RescueLift「一、二——起！」82% → 具名事件 RescueHeave
还权 → luoRescueComplete → +rescueOutAfterS → Say RescueOut「枪拿到！从后头走！」
玩家按 F 拾枪                                     → rifleRecovered
—— RearTrench ——
rearTrenchEntered（bunkerRear 5 m）
玩家在沟里站直 trenchPeekS 秒（或 trenchCurseFallbackS 兜底）→ Say TrenchCurse（探头挨骂）
cornerReached（rearCorner 5 m）→ Say CornerCheck（幺娃检查顺子）
collectionPointSeen（collection 14 m）—— 第一次看见担架、伤员与搬运人员
  → Say SupportOrder（撤回守军指路，声音从集结处那个人身上出来）→ supportOrdersHeard
```

集结处的摆位在 `Enter("RearTrench")` 就铺好，读 `MISSION_PLACEMENT.collection`：
4 副担架（常驻白盒体块）＋ 5 名伤员 ＋ 4 名搬运人员（实例化人群）。
传令兵 06 才到（02 路过时只有伤员与搬运人员）。

### 03 Support —— 接回第一批守军

沿用旧演出。入口变成后交通壕尽头：`MISSION_STAGE_ROUTES.rearTrench` 与
`MISSION_ROUTES.support` 都引用 `MISSION_FRONT_COLLECTION_ROUTE`；`MissionGuideRoute`
的 join 逻辑把「集结处 → 前沿」这一截接上，不需要第二套中心线。

`FrontBlockade`（老周指右边破墙）由 `UpdateFrontDialogue` 按「封锁是真的」判时机。
通过条件不变：`frontReached` `frontContact` `frontRifleDefense` `rifleWithdrawalResolved`。

2026-09-25 分镜还原（`docs/Data_FirstLevelStoryboard0103Contract.md` §2.11–12，SB07/SB08），数值全在
`Data_Tuning_FirstLevelFront.FRONT_BATTLE_TUNING`：

- **罗班长领路**（`leaderLead`）：03 入口到阵位西门前最后一个弯（`FRONT_SORTIE.approach[11]`）之间，罗沿自己的路线保持在玩家前
  3–5 m：差距小于 1.5 m 就跑（6 m/s，快过玩家冲刺 5.25；AI 蹲姿位移只有 0.6 倍，所以玩家站着时罗站起来跑，玩家蹲着时罗蹲着跑
  3.6 m/s 仍快过蹲行 1.62，`runStandsWithPlayer`），跑回 3 m 再走；超前 5 m 以上停下等（面向玩家）；刚过一个转角
  （转角 > 35°）且玩家还在 3 m 以外时停在拐角、面向下一段、上半身 `PointBlockade` 指路。过了那个弯恢复旧规则
  （超前 3 m 且离玩家 10 m 以上才等）。纯规则 `LeadPace` / `LeadCorner`（`Script_FirstLevelFrontBattle`）。
- **「贴这道墙！前头有人！」**（`FrontApproach`）改在 `approach[9]`=(7,−143.5) 周围 2.5 m 触发，玩家约在 (4.6,−143.3)；这一场
  真正开播的那一刻记 `frontApproachPointed`（罗和玩家的位置、差距），罗在接下来 2.8 s 里边走边伸臂指前方（腿照走）。
  指路只占台词前 1.2 s（`pointS`，「贴这道墙！」那半句）。这 1.2 s 里他**站着慢走**（`pointWalkMps` 0.7 m/s；超前 `maxM + pointExtraM` 6 m 才停；本来在跑的照跑），
  **放下枪、不扣扳机**（`pointHoldsFire`，`FrontBattle.PointQuiet` 每帧把 `aimBlend` 压回 0、`coolUntil` 往后推 0.1 s），
  目标、战术状态、掩体都不动，并以 `pointTurnRps` 5 rad/s 自己转向指的方向：大脑一据枪（aimBlend > 0.6）或开火，开场层就把
  上半身 clip 扔掉（`Script_OpeningStoryboardAnimation` 的 nativeCombat）；他的大脑照旧朝目标转身，等人时又面朝玩家。
  09-25 抓帧实拍到过：旗子写着 PointBlockade，画出来是跪着举枪 / 伸着胳膊指沟壁 / 蹲着不动（差距刚过 5 m 被领路规则停下）。
  第一版用临时挂 `scriptedNoncombatant` 按住他，那会每帧清掉他的目标、放掉掩体，03 的战斗因此走进另一支（整关驾驶 A/B：
  开 5/8、关 4/4、改前 3/3）；09-25 审查后改成现在只动枪和扳机。躲手榴弹那一帧不领路、不指路（`leaderDodging`）。
  只动枪和扳机但仍按 2.8 s 时，03→06 整关驾驶（直接进阵位）9 趟过 6 趟（两趟同一支死在 04 阵位北头两颗手榴弹下、一趟死在
  05 弹药屋支路）；缩到 1.2 s 后 3/3，与不按住（3/3）、本轮基线 b33e30951（3/3，逐位相同）一致，所以定 1.2 s。
- **背坡轻机枪组**（`Data_FirstLevelMissionFront.FRONT_GUARD_MG_GROUP`）：第二批守军里的 6 号（射手，捷克式）和 7 号（副射手）
  整个 03 趴在土坎东端背坡上（只有 z ≤ −158.8 能从右侧低沟的沟沿上看见），是剧本兵：只朝 `fire` 里的授权点打环境射击（不命中、
  不进 TTK 账），不交给 `Defend`（`scriptDefensive` 关掉，否则换弹永远换不完）。04 一开始沿 `exit` 绕过 `ScrapeEastTraverse`
  南侧下到浅壕，再走东侧守军那条腿到最后遮挡后集合（`gatherIndex`），05 与第二批一起撤。旁边那名带血伤员是战场尸体层
  （`MISSION_AFTERMATH` 的 `AftermathMgWounded`），不是活人。同时存活预算不变（8 名守军还是 8 名）。
- **第一批 5 人成列过缺口**：第一批改为 5 人（第二批 3 人），放行条件不变（夺点 + `frontRifleDefense`，缺口没有直接火力）。
  放行时按离最后遮挡的路程排成一列，前一人沿撤退路线领先 1.6 m 后一人才走，走动中近于 1.2 m 就原地停一下（1.6 m 让五个人差不多都在缺口那段只有 0.5 m 深的浅沟里——从阵位只有这一段看得见人的头肩；2 m 时 SB08 抓帧 5 趟只有 3 趟同时看得见 3 人），前一人 4 s 没往前挪
  就绕过他。第二批仍是一次一个人过口（`gapClearM`）。
- **SB08 视线锥里不摆尸体**（`FRONT_SB08_SIGHTLINE` / `InFrontSb08Sightline`）：从阵位机枪北侧 (25.6,−155.2) 看缺口 (−8,−150)，
  ±15°、3 m 起到缺口前 6 m 为止，战场尸体层不放尸体。原来背坡刮沟东头那一堆（聚类 (7,−155.8)）有 13 具正好铺在第一批过口的那条
  画面带上（x 0.46–0.60），34 m 外 60–170 px 的人和尸体分不开（09-25 审查）。按生成后过滤，其余尸体的位置、随机序列一个不变；
  缺口西北那 4 具和缺口以外的都留着。
- 04/05 检查点：`Script_FirstLevelMissionStageJump` 按 `firstBatch` 把第一批直接放进安全区；原来 `OPENING.rifleGuardCount`
  这份重复的人数已删。说话的那名守军（`FACED_FRONT_GUARD_INDEX`）跟着改成 5 号——仍是第二批第一人。
- **抓帧与画面判据**：`Script_FrontStoryboardShots.mjs`（TestRunner `FrontStoryboardShotsTest`，tier 2，浏览器）按整关驾驶的真实输入从
  missionStage=3 冷启动走到 FrontApproach 拍 SB07、夺点后站到阵位机枪北侧 (25.6,−155.2) 拍 SB08，按契约 §5 自动判；「看得见」用涂色图
  数像素（投影在画框里不算，被沟壁、矮墙、自己的枪挡住的不算）。布景类判据（破砖墙、烟柱、飞机、倒墙、护壁、弹药箱）标 `set`，
  默认只出图，`--strict` 才计入。`--side-by-side=<分镜目录>` 另拼「分镜 | 实机」并排图。
  SB08 蹲在机位上还击等第一批放行，放行后站起来不再还击、每 0.1 s 看一次。抓帧不是生存测试：驾驶里阵亡走游戏自带的检查点重来（次数记 json）。
  09-25 审查后加严：SB07 罗要站着、在走；背坡两人各 ≥ 300 px、合计 ≥ 1200 px，轻机枪本身（射手的 `weaponGroup`）单独涂色要看得见；
  伤员（实例化尸体）按包围盒画代理数像素；阵位机枪手按像素判在右半。SB08 一个人算「看得出」要露 ≥ 60 px **且**框高 ≥ 16 px，
  几个人之间横向隔开 ≥ 10 px 才分别算。`--side-by-side` 找不到分镜图算没过。
- **整关驾驶进阵位**：默认直接走进西门上座位（躲雷后被甩到西矮墙外就从西门绕回）——这正是「躲完雷直接回座位」的玩家路线，
  整关门禁要覆盖它。`--front-clear-from-door` 可选：先在西门外的弯（`approach[-3]`）把阵位守敌打光（最多 45 s）再进。
  Step 2 曾把后者设成默认，用来绕过罗第一版指路禁火带来的难度变化（见上）；09-25 审查认为这是拿驾驶器改动盖住游戏改动，已退回。

掩护行进分成两个有实际几何依据的门。接近段保留三个真实掩体和 cover-bound controller，
四名队员按 `[[0,2],[1],[0,2],[1]]` 交替使用；重建后的 Support 段没有实体掩体，因而明确
`hasBounds === false`，不再合成虚构的 cover-bound controller 或绕向退役站位。四人仍各自
保留平滑个人路线，并实际走完到 `OPENING.frontPosts` 的 authored 前沿阵位。

接近屏的两个局部攻击组在玩家进入各自 `near` 门之前保持待命，不能隔着数个沟弯提前向
等待撤回的守军开火。它们放行后的射界从撤退线第一个暴露点（z≈−137）开始；z=−145 的
等待线与 z=−140 的最后一个隐蔽点归前沿枪线，不属于接近屏。

### 04 MachineGun —— 接替火力，战车压口

```
TakeOverGun（进场自动）：老周腿伤恶化退出枪位 → zhouGunWounded
玩家接替（机枪可选，步枪也能顶）
战车推进 → 前沿观察所被打掉 → Say TankTerror
frontAttackRepelled → 挑一个离玩家最近、还活着的撤退守军当「指路的人」，
  让他朝 A.bundle（北头弹药屋）转头 bundleOrderPointS 秒 → Say BundleOrder
  （BundleOrder 的声音从这个守军身上出来）
bundleOrderHeard → 何有田走到机枪位、刘文财走到沟口 trenchMouthWatch（一路保持到 05 结束）
tankBlocksExit：战车压到 tankStopZ 附近（2026-09-28 起不再是 04→05 的门，见 Data_FirstLevelTank20260923.md 末节）
```

**04 不再由任务触发关中过场 `CS_MachineGunCaptives`**（契约 §2：主题已由 01 承担）。
过场资产与文件保留，回归改成两条：任务侧断言「不触发」，过场自身仍可直接播。

### 05 Tank —— 班长带路取弹，炸停战车

```
BundleGo（进场自动）：何有田压制、战车转火
去程：战车在 bundleProneRangeM 内、炮塔朝玩家 bundleProneArcRad 以内 → Say BundleProne
弹药屋：Say BundleSupply（留守兵）；F 取弹 → bundleTaken
返程：战车比取弹那一刻又往南压了 bundleReturnTankGainM（或 bundleReturnFallbackS 兜底）
  → Say BundleReturnCall「班长！它往沟口挤了！」
投集束弹 → tankImmobilized → +tankStoppedAfterS → Say TankStopped「停了！」
lastGuardsWithdrawn（最后一批守军真的走完撤退线）
reliefInPosition（接防班从集结处沿后交通壕进阵位）
```

返程不复活去程敌人（`bundleApproach` 只在 `Enter("Tank")` 生成一次）。

**战车机枪的弹道表现（2026-09-22）。** 用户要「看到清晰的一条子弹的光束」和「子弹在墙上飞溅的火花」。
`Script_Main.FireVehicleBullet` 每发画一条 `Vfx.TracerBeam`：从车首机枪口铺到弹着点，弹头按表现速度飞过去，
掠过的一段留余辉；线宽按顶点离相机的距离设像素下限（远处不细成一根头发）与上限（贴脸飞过不成光棍），
光束条带切 32 段，保证逐段按距离收宽。打到硬面（`brick` / `metal`）时 `Impact(..., {hardSparks:true})`
顺着反弹方向溅一簇火星、弹着点闪一下，并播砖面命中音与跳弹；土、沙包、木头不溅火星。
第一关白盒碰撞 tag 一律是 `whiteboxWall`，弹着表面按体块分（`Script_FirstLevelWhiteboxField.WhiteboxSurface`）：
换成沙袋模型的段落是 `sandbag`，`timber` 木料是 `wood`，土方是 `dirt`，其余墙体按 tag 落为砖墙，
所以沟边横墙（`BundleTankScreen*`）会溅火星，而沙袋胸墙只扬沙。只改表现，不改弹速、散布、伤害与命中；
数值在 `Data_Tuning_BulletVisual`，回归口 `Script_VehicleTracerTest.mjs`（数像素：光束对旧曳光、远端线宽、
贴脸上限、火星与表面判定）。

投弹驱动按实际 `JUMP.gravityMps2 = 19.6 m/s²` 解算，投掷前清零步枪残留的
`player.aimYaw/aimPitch`，并按完整 3D aim vector 计入 `THROW.muzzleAheadM` 与
`muzzleRiseM`。`bundleCoveredThrowRangeM = 9` 要求战车进入沟内可投范围后再出手。
旧结论“真实飞行只有解算距离约 0.56 倍、原因未解”是错误诊断：它混用了 9.81 m/s²、
平面枪口偏移、残留自由瞄准，并把碰撞后弹跳滚动的位置当成首次落点；当前实现已纠正。

### 06 Orders —— 回到伤员集结处，接下后送

```
ordersReached（collection 5 m）→ 依次排队 Volunteer → BorrowLight → ZhouLift
老周靠在土壁边（collection.zhouWall，state "fallen"，不参与队列前进）
BorrowLight（9 句）逐句 / 逐事件驱动七个姿态：
  line 0                             ask     靠土壁叼烟，看见顺子经过，开口要火
  line 4「……就剩这一根了」            pat     摸了两遍衣兜，没找到火
  事件 BorrowLightMatchesPocketed     pocket  顺子把火柴往兜里一收
  事件 BorrowLightCigaretteOffered    offer   老周摸出压扁的纸烟包，抽一根递过去
  line 7「不是最后一根？」             light   顺子先划火给自己点上
  line 8「这下是了。」                 share   再把火递近一点让老周借火
  +borrowLightS+borrowWinceS         wince   老周挪身牵到伤腿，皱眉吸气
ZhouLift 播完 → zhouOnLitter → 老周用 zhouLiftMoveS 秒从土壁挪回队列（state 转 "waiting"）
担架队起行 → columnDeparted
```

03 去程和 06 返程共用 `MISSION_FRONT_COLLECTION_ROUTE`，`OPENING.supportRoute` 也引用
这条中心线，实际沟槽直接按它开挖。共享段 52.13 m，`rearTrench` 全长 71.85 m，
`collectionReturn` 全长 86.60 m；共享沟底最大坡度 0.043（约 2.44°）。这避免路线点与
实际沟槽再次漂移成单向陡壁。

烟改用用户 FBX 减面后的卷烟模型（[资产说明](Data_Cigarette20260927.md)）；火柴仍是小白盒（`MissionShunziMatchbox`），
不做手部 IK —— 本轮口径是「流程与白盒到位，人物动作可以简化」。

### 07 South —— 沿沟南行

```
真走 MISSION_ROUTES.southWalk（= south，135.4 m）
幺娃靠到玩家侧后方 southWhisperSideM 米（或 southWhisperFallbackS 兜底）→ Say SouthWhisper
  班长不参加这一段随机喘息（带路跑停节奏仍走共享 SquadMarchAi）
villageMouthReached（village 4 m）→ Say VillagePointer
  声音从路边指路的人身上出来：村口以北 southPointerBackM 米、偏出路面 southPointerSideM 米
```

**时长闸**：2.2–2.6 m/s 走完 135.4 m 是 52–62 秒，再加抵达村口后 `VillagePointer`（7.94 秒）
播完，落在 60–70 秒，符合契约的 45–75 秒。`Script_FirstLevelFrontTest` 用
`SouthWalkSeconds()` 静态核这条算式，`--campaign` 的 Front 段实测阶段时长再核一次。

**到达闸的半径**：`villageMouthReached` 是 9 m，不是 4 m。`southWalk` 的终点 (48,−20)
离 `village` 锚点 (55,−20) 整整 7 m —— 4 m 的门意味着沿路走到头的人还差三米够不着，
07 会永远停在那儿（2026-09-20 实测：走完全程 150 秒仍停在 South）。契约 §8 把这条路
冻在 135 m，所以动的是门的半径，不是路。

---

## 3. 数值出处

全部在 `Data_Tuning_FirstLevelFront.mjs`，每一条前面都有一段说明它从哪儿来
（`Script_FirstLevelFrontTest` 有一条断言扫这个）。几条关键的：

| 数值 | 出处 |
| --- | --- |
| `bunkerKillFallbackS` `[0,2.1,4.2,6.3]` | `MissionVoiceTimeline` 对 `BunkerKilling` 的 7.84 秒 / 4 句 |
| `BunkerBanter` 16.744 秒实录 / `killAt` | 旧 8 秒近爆兜底不得抢断当前 cue；`killAt` 只在首个 `BunkerKilling` Line 设置 |
| `bunkerButtStrikeS` 0.45 | `Data_MeleeCombat` 的近战 windup 同量级 |
| `bundleProneRangeM` 40 / `bundleProneArcRad` 0.5 | `Data_Tuning_AiShooting` 的 `CLOSE_RANGE` 一档；0.5 rad≈29°，比 `tankHullMgArcRad` 宽一点 |
| `bundleCoveredThrowRangeM` 9 | 19.6 m/s² 世界重力、`GrenadeBundle` 13 m/s 满蓄力与完整 3D 枪口偏移 |
| `southMarchSpeedMps` 2.2–2.6 | Notion 采用稿 07 的配速要求 |
| `southTargetSecondsMin/Max` 45 / 75 | 契约 §2 |
| `zhouLiftMoveS` 2.6 | `MISSION_TUNING.litterSpeedMps` 1.4 m/s 量级 |

摆位坐标一律来自 `MISSION_PLACEMENT`（`bunker` / `collection`），本包不写坐标。

---

## 4. 验收命令

纯 Node（秒级）：

```powershell
node Taierzhuang1938/Script_FirstLevelFrontTest.mjs
node Taierzhuang1938/Script_FirstLevelMissionTest.mjs
node Taierzhuang1938/Script_MissionGatesTest.mjs
node Taierzhuang1938/Script_FirstLevelVoiceTest.mjs
node Taierzhuang1938/Script_FirstLevelVoiceTest.mjs --audio
node Taierzhuang1938/Script_FirstLevelSpaceTest.mjs
node Taierzhuang1938/Script_TextTest.mjs
node Taierzhuang1938/Script_ModuleGraphTest.mjs
node Taierzhuang1938/Script_TestRunnerTest.mjs
node Taierzhuang1938/Script_FirstLevelLeaderGuideTest.mjs
```

浏览器（有跨 worktree 全局锁，单跑直接 node 脚本）：

```powershell
node Taierzhuang1938/Script_FirstLevelMissionBrowserTest.mjs                 # 基线：01 坐着看完
node Taierzhuang1938/Script_FirstLevelMissionBrowserTest.mjs --campaign --stage-to=7   # 只跑 1–7（runner 的 FirstLevelSquadMarchTest 就是这条）
node Taierzhuang1938/Script_FirstLevelMissionBrowserTest.mjs --campaign      # 整关（Mid 还是 TODO，会在那儿停下）
node Taierzhuang1938/Script_FirstLevelMissionStageJumpTest.mjs
node Taierzhuang1938/Script_FirstLevelMachineGunTest.mjs
node Taierzhuang1938/Script_FirstLevelMachineGunCutsceneTest.mjs
node Taierzhuang1938/Script_FirstLevelFrontPresenceTest.mjs
node Taierzhuang1938/Script_FirstLevelFrontRouteBrowserTest.mjs
node Taierzhuang1938/Script_FirstLevelCasualtyBrowserTest.mjs
node Taierzhuang1938/Script_FirstLevelLeaderGuideBrowserTest.mjs
```

取证截图落在 `Taierzhuang1938/_shots/L1Front/`（忽略目录）：受困视角看行刑的四个关键帧、
获救、后交通壕途经集结处、前沿接应、机枪位、弹药屋、战车压口、借火、南行途中。

当前共享沟槽专项证据：Rapier 胶囊双向走完 `rearTrench` 9/9 点、
`collectionReturn` 8/8 点；受控真实 `g.player` 从前沿返程走完 8/8 点，存活、
`maxStalled: 0`，六个 10 秒位移块为 12.79、15.05、12.94、15.95、15.89、6.05 m，
终点 `(-36.21,-100.94)`。该夹具关闭敌军和战车、从 debug stage 6 Spawn 满血玩家，
只证明地形与动态友军可通行，不算正常 Orders 存活或 01→07 连续通关。

修复前旧样本 `RunFixed01` 在 03→04 保有 front 12、approach 3，检查点重试 0；05 首发
`blastMiss: 1.8` 并成功 `tankImmobilized`，随后在 06 CollectionReturn 约
`(-9.82,-103.91)` 卡死。它是修复前失败样本，不能计入当前稳定率。最终五样本门禁为三次
无复活 `--campaign --stage-to=7`、一次 prepush campaign/audio、一次 SquadMarch 1→7，
至少通过 4/5；这些最终样本尚未执行，正式命令不得带 `--allow-checkpoint-retry`。

---

## 5. 已知缺口

- **借火的手部动作**：烟与火柴是白盒，没有手部 IK，也没有点火的光。
- **老周靠土壁**：用 `state "fallen"` 表示「还没上担架」，视觉上是躺在土壁边而不是靠坐。
- **行刑的创口遮挡**：靠门框与身体位置，没有专门的遮挡体积；换摆位时要重新看一眼。

---

## 6. 2026-10-12 03–05 重构（03–11 重构 A 包）

口径 `docs/Data_FirstLevel0311Refactor20261012Contract.md` §3.1–3.3、§5、§6。上面 §2 的 03/04/05 三段里凡与本节冲突的
（弹药屋、`BundleSupply`、`bundleReturned`、`tankPreviewed`、`TankHeard`、`tank_turret`、三条战车音乐 stinger）以本节为准；
旧文字留着当历史。本节只记「现在是怎么跑的、数在哪、怎么验」。

### 6.1 03 Support —— 日军不会被打退

- **前沿观察停顿**（`FrontObservation`）：罗到 `MISSION_STAGE_ANCHORS.frontObservation`（=`FRONT_SPACE.observation`，支沟最后一个弯前）
  停下不走，等玩家到 `counter.observeWaitM` 4 m 内（或 `observeMaxS` 12 s 兜底）才说两句、三指比划，接着原来的 `FrontBlockade`
  指右边破墙；说完记 `frontObserved`，罗继续带路。腿在 `FirstLevelFrontBattle.Walk`（`OBSERVATION_STOP`，`observationReleased`
  放行），嘴在 `UpdateObservation`。`CaptureRouteWithObservation()` 把观察点插进 03 的领路线。
- **去程落弹**（`FirstLevelFrontCounterattack.SapShells`）：玩家在支沟里（投影到 `MISSION_ROUTES.support` ≤ 4 m、z < −112、x < 0）
  时，进 03 `sapShellFirstS` 8 s 后每 8–14 s 一发掷弹筒落在 `FRONT_SAP_SHELL_POINTS` 四个沟底弯点之一，离玩家与小队 ≥ 6 m，
  最多 4 发（`sapShellMax`）。走 `combat.FireShell` 的 `feedbackOnly`（`sapShellDamage` 0：炸、啸声、震屏、不进 TTK 账），
  不是环境火点：支沟里没有视线，环境射击打不进来，只能剧本落弹。
- **撤退窗口双条件**（`GapWindow`，`frontRifleDefense` 的 `requires`）：`gapRushRepelled`（六名跃进兵 + 侧翼组 + 军官里活着的都
  不在 `gap` 8 m 内、`gapRushCloseM` 16 m 内也没人在 rush/charge——20 m 外两个掩体之间的跃进不算冲缺口，第一趟实拍窗口
  为此每 1.5 s 开关一次）且 `gapFireSuppressed`（`FrontGunner` / `FrontSupportGunner` 至少一挺死了或压制值 ≥ `suppressLevel`
  0.3——AI 自己判「被压住」的阈值——连续 ≥ 2 s）。两个事实各自第一次为真就记下（门只开一次），但**活窗口会关**：机枪再抬头、
  或有人再冲，`frontCounter.window.open` 变 false，第一批下一个人就在最后遮挡后面等（`UpdateGuards` 每放一个人问一次
  `WindowOpenFor`）；关了 `windowStaleS` 45 s 还不开就当开，窗口从没开过而是 `assaultWindowFallbackS` 90 s 放的行也直接走
  （不许把人钉死）。所以第一批是**分两趟**过口的，不是一列五人一口气。驾驶器不上缴获机枪、只打眼前的人，四趟实拍
  `gapFireSuppressed` 都是靠 90 s 兜底过的；真人坐机枪上扫土坎才会按设计开窗。
- **第一批第 2 人中弹被拖**（`counter.woundedGuard` 2）：他过口时按 `woundedDownS` 倒 1.5 s，之后以 `woundedDragMps`
  1.1 m/s 被拖着走完撤退线（腿仍在 `UpdateGuards`，写 `g.woundedAt`）。到安全区后刘文财数人 `FirstBatchCount`
  （「一个……三个……五个！」），接 `TankSpotted`：守军喊「战车……路那头是战车！」罗接「先把人接下来！」—— 取代旧 `TankHeard`。
- **夺点后掷弹筒找准阵位**（`NestShells`）：夺点 `nestShellFirstS` 40 s 后每 10–16 s 一发落在 `FRONT_NEST_SHELL_AREA`（院内）
  随机点，离玩家 ≥ 3.5 m、离小队 ≥ 2.5 m（`PickNestShellPoint`，12 次抽不到就这轮不落）；只在 03 内、最多 `nestShellMax` 8 发
  （第二轮连续实拍 9 发 100 s 命中 4 发 57 hp，坐机枪不动的驾驶器随后被 04 的车火打死）。
  炸、啸声、震屏走 `FireShell feedbackOnly`（不走 `Blast`），伤害是模块自己的**轻伤**（`LightShellHurt` / `HurtPlayer`，第二轮
  协调人口径）：离爆点 ≤ `shellHurtFullM` 3.5 m 扣 `shellHurtMaxHp` 18，到 `shellHurtM` 5.5 m 线性降到 `shellHurtMinHp` 12，
  再远不扣；**不开流血伤口**（`Player.TakeHit` 任何伤害都开伤口，第一轮 40 伤害九发把人流血至死），最低留 `shellHurtFloorHp`
  1 hp 不当致命一击；配 0.5 压制、红闪、受击事件、来向标记。坐着不动的人只吃落在 5.5 m 内的那几发，得挪窝。
  支沟落弹 `sapShellHurtScale` 0 仍是纯环境（契约：不进 TTK 账，玩家本来 ≥ 6 m）。
- `tankPreviewed` → `tankHeard`：战车一动（`TankRuntime` progress > 1 或在动）就记；HullDown 不再停车预览。
- **交枪顺序**（`StartHandover` / `UpdateZhou`）：何有田离通道壕最后一个拐角 `handoverViaSkipM` 4 m 内就直奔座位（不绕回拐角）；
  幺娃等何有田到座位 `handoverReadyM` 3 m 内（或何死了）才下去，停在座位前 `yaowaHandoverShortM` 1.4 m（`YaowaHandoverPost`）。
  一起派的话幺娃先到座位，一人宽的壕里何就钉在他身后 3.9 m、老周等何：03 永远不结束（实拍 1、3 趟）。
- **坑沿兜底**（`RampLift`）：左机枪坑（`Data_FirstLevelMissionTerrain` steps 的 leftSeat 坑 0.65 m）与 2 m 深的通道壕之间是
  z −152.5..−153.3 的一道 54–55° 坡，超过胶囊 52° 爬坡上限（`Script_Physics`），只能靠 autostep 偶尔上去：老周往下走没事，
  幺娃三趟里两趟上去了一趟没有，何有田四趟实拍 + 12 次探针里 10 次钉在坡脚 100 s 以上（蹲着站着都一样）。交枪的两个人
  （何有田、幺娃）在离座位 `handoverRampFootM` 2.5–5.5 m 之间 `walkStallS` 6 s 没进展，就被放到坑底座位前
  `handoverRampLiftM` 1.6 m 处（`stalls` 记 `rampLift`）。**集成项**：地形把这道过渡改成 ≤ 45° 的坡（不是本包的文件，
  指纹要重生），兜底就不会触发。

### 6.2 04 MachineGun —— 战车压口，缺口丢人

- **一起到**：`FRONT_PRESSURE_PHASES.tankShown` 的 `when` 改成 `tankAtBendExit`（战车过路弯口，`TankRuntime` 记），
  战车 + 4 名跟车 + 两组预备队（`reserveWest` / `reserveRoad`，`reserve:true`）+ 侧翼幸存者一口气上。`mgAttack` 的 offstage
  也等到 `tankAtBendExit` 才放。`frontAttackRepelled` 之后侧翼组的「再冲阵位」用 `NestFront`（下）实现，不再第二次成组冲锋
  （`FrontPressureTest` 只许一次成组冲锋）。
- **缺口丢人**（`GapGuard`，`gapGuardKilled`）：战车到 Pressure（`brain.reached ≥ Pressure` 或 `tankPositionPressured`）时，
  第二批的 `counter.gapSacrificeGuard` **7 号**（轻机枪副射手）脱离保护（`missionUntargetable/scriptEssential` 都关）直奔
  `gap`，到 `gapKillM` 1.6 m 内（或跑了 `gapRunMaxS` 9 s）车体机枪走一串点射（`gapKillShots` 5 发，前 4 发 damageScale 0
  打在他身边、第 5 发 `TakeHit(400)`），尸体留在口子正中（`GapBody`），刘文财 `GapGuardDown`。**偏差**：契约写第 5 人，但
  5 号是 `FACED_FRONT_GUARD_INDEX`（第二批里面对玩家说 `TankSpotted` 的那个），牺牲他台词就没人说，所以改 7 号。
- **阵位前半边隔院对打**（`NestFront`，`nestFrontContested` → `nestFrontCleared`，第二轮起都是 04 的门）：玩家退到后墙
  （`rightRearReached`）后，`NestFrontPicks` 从侧翼组幸存者优先、再按离阵位远近挑 `FRONT_NEST_FRONT_POSTS.length` 4 人，
  `Defend` 到院内前半边四个岗（z ≤ −151，互距 ≥ 1.6 m，离缴获机枪块 ≥ 1.2 m），`tacticalRadiusM` 收到 3 m；第一个人进院
  前半边记 `nestFrontContested`；翻进来的人全部死亡或缩回 `nestFrontClearZ` −159（土坎以北）记 `nestFrontCleared`（没人可进时
  两条都记 `void`，04 不等）。`BundleOrder`（守军报信 + 班长分工）要等 `nestFrontCleared` 再停 `nestFrontOrderPauseS` 1.5 s
  才说（`UpdatePressure`）。04 requirements：`tankPositionPressured, gapGuardKilled, nestFrontContested, nestFrontCleared,
  remainingGuardsGathered, rightRearReached, bundleOrderHeard`。驾驶器在后墙岔口把射程放到 20 m 打前半边的人并截一张
  `Scene_NestFrontContested.png`。
- `TankArmor` 只剩一句「莫打铁壳子！打跟车的！」，`tank_turret` 退役（`TANK.barkCues.turretTraverse` null、`SQUAD_BARK_RETIRED.leader`）。
  `BundleOrder` 按 §5.2 重写（第二句前停 1.4 s）。`TankRoadContact` 两句改成「右边路上！战车！战车！」「打跟车的！前头还有人没下来！」。
- **远处烧着的车**：`Data_FirstLevelWhiteboxFront` 的 `BurningTank*` 一组块在 (96,−216)（路弯以北坡上），`Data_FirstLevelDistantSmoke`
  的地标柱 `BurningTankSlope`（kind `metal`，scale 1.8）；`SmokeOriginsTest` / `DistantSmokeTest` 的 63 → 64。

### 6.3 05 Tank —— 支沟里的集束弹

- **路线**：后侧岔口 → `FRONT_SORTIE.attackRoute[0..3]` → `A.bundleDrop`（=`FRONT_SORTIE.bundleDrop` (40.1,−147.4)，倒着的弟兄
  `bundleBody` + 两捆 `bundles`，白盒 `BundleDropBundle0/1` / `BundleDropHead0/1`，尸体层 `AftermathBundleBearer`）→ 攻击位
  `attackRoute[3..]` 投弹。弹药屋、`bundleReturned`、`bundleHouseReached`、`bundleDirectionsHeard` 全退；`BundleWhy` / `BundleSupply`
  `retired:true`（录音留着）。`MISSION_GUIDANCE.Tank.route` 指 `attack`；`LeaderGuide` Tank 变体去程按 `attackRoute[0..3]+bundleDrop`
  未到的点带路（`GuideFollow`），返程沿 `MISSION_ROUTES.attack`（`GuideThrow`）。`BundleFound`（罗两句）在 drop 点触发，
  `BundleBrief` 两句边走边说。F 捡起（`interaction.bundle` 文案 §5.5）。
- **渗透组**（`sapInfiltrators`，4 人：`BundleBendA/B` + `SapInfilC/D`，各 1 颗手雷的只有 C/D）：进 05 就生成在支沟外待命，
  玩家过 `attackRoute[1]` 1 m（`OnAttackBranch`，走廊 `branchCorridorM` 4 m）记 `sapInfiltrationStarted`，`FRONT_PRESSURE_TACTICS`
  按这个事实沿 `SAP_IN` 路线 3.2 m/s 摸进后侧岔口，分两拨。
- **战车盯支沟**（`Data_Tuning_Tank.sapWatch`，`lanes[0].sapWatch`）：05 里车体机枪每 6–10 s 挑一段沟沿扫，`playerClearM` 3.5 m
  （`LanePointAt` 取点）。`requireFact` 去掉、散布 1–2 m。
- **炸哑后**：`tankFireDisabled` → `TankCrew` 在车两侧 2.3 m 生成 `TankCrewA/B`（`FRONT_TANK_CREW`，三八式、无手雷），记
  `tankCrewBailed`，`MISSION_TACTICS` 沿 `TANK_CREW_FLIGHT`（Approach→Pressure→BendExit→Bend）3.6 m/s 跑，到 Bend 收走；
  跟车步兵都死了或都退到 `gap` 30 m 外（`FRONT_ESCORT_WITHDRAWN`，45 s 兜底）才记 `escortsWithdrawn`，第二批守军这才过口；
  最后两人经过 `GapBody` 1.4 m 内时停 1.2 s 拽一把（`tugS/tugM`）。返程不放 cue、不换音乐；`stingers` 只剩
  `breachReopened` / `lastGuardsWithdrawn`。
- **预算**：05 最坏同时存活 = 4 跟车 + 4 渗透 + 2 车组 + 预备队/侧翼残余 ≤ 34，加 02 残兵不超 44（`FrontTopologyTest` 的 alive
  上限由 30 抬到契约的 44，累计 ≤ 60；`actorPool` 不动）。

### 6.4 文件与验收

- 新：`Script_FirstLevelFrontCounterattack.mjs`（纯规则 `GapWindow` / `PickSapShellPoint` / `PickNestShellPoint` / `EscortsClear` /
  `NestFrontPicks` / `OnAttackBranch` + 运行时类，`MissionRuntime` 只留 `new` / `Enter` / `Update`（在 `frontBattle.Update` 之前）/
  `State` 四行）、`Script_FirstLevelFrontCounterattackTest.mjs`（TestRunner `FirstLevelFrontCounterattackTest`）。
- 数值：`Data_Tuning_FirstLevelFront.FRONT_BATTLE_TUNING.counter`、`Data_Tuning_Tank.sapWatch`；几张表在 `Data_FirstLevelMissionFront`
  （`FRONT_SAP_SHELL_POINTS` / `FRONT_NEST_SHELL_AREA` / `FRONT_NEST_FRONT_POSTS` / `FRONT_TANK_CREW` / `FRONT_ESCORT_WITHDRAWN`）。
- 纯 Node：`FrontCounterattackTest`、`FrontTest`（第 39 行 `CaptiveInterrogation` 9≠11 是 01–02 对白改稿的基线红）、`FrontPacingTest`、
  `FrontPressureTest`、`TankBrainTest`、`FrontTopologyTest`、`LeaderGuideTest`、`MissionTest`、`MissionGatesTest`（98 个事实）、
  `VoiceTest`、`TextTest`、`SpaceTest`、`SmokeOriginsTest`、`DistantSmokeTest`、`CharacterSpeechTest`（拼音表补 抱/支/捡）。
  `ModuleGraphTest` 在 A 分支上红：新模块还没进 `index.html` 的 import map（戳归集成负责人，契约 §2.1）。
- 实机：`Script_FirstLevelMissionBrowserTest.mjs --campaign --stage-from=3 --stage-to=7` / `--stage-from=4 --stage-to=6` /
  `--stage-from=5 --stage-to=6`；`Script_FirstLevelCampaignFrontBattle` 05 段改走 `attackRoute[0..3]` → `bundleDrop`（`CaptureFocus("BundleDrop")`）。
  **基线红**：`RightNestShortRetreat` 机位整帧三角 10.10 M（分支起点 52f353ce 的树，`--baseline-root` A/B）/ 10.14 M（本分支）
  对 `SCENE_RENDER_LIMITS.triangles` 9 M（09-28 定的上限），04 检查点与连续驾驶都在这一步断言失败；本包取证时临时把
  `Script_FirstLevelCampaignKit` 这条断言改成打印（未提交）。

---

## 7. 2026-10-12 06–07 与耿家（0311 重构 B 包）

口径：[0311 重构契约](Data_FirstLevel0311Refactor20261012Contract.md) §1.6 / §1.9 / §3.4–3.5 / §5.6；改稿「06 集结处」「07 南行沟、出沟口遭遇」。
新模块两个，运行时只加薄钩子：

| 文件 | 管什么 |
| --- | --- |
| `Script_FirstLevelGengFamily.mjs` | 老耿 / 妮儿 / 黑子 / 驴车（§5.6 接口；06 捡弹壳、07 走沟沿跟队与撒腿进村；08–11 的走位 / 姿态 / 推车给 C 包） |
| `Script_FirstLevelSouthMouth.mjs` | 07 沟口遭遇：纯规则 `SouthMouthRules`（到沟口 → 接火 → 压住 / 再抬头 → 绕村 → 过完）+ 运行时薄适配（放组、记事实、喊 cue、切任务字、担架限位） |
| `Data_Tuning_FirstLevel.mjs` | 新段 `southMouth` / `geng`（每一行带出处） |
| `Data_FirstLevelWhiteboxRear.mjs` | 沟口东侧的 `MouthEmbankment` / `MouthFieldBankA` / `MouthGraveMoundA(+Cap)` / `MouthFieldBankB` / `MouthGraveMoundB`（高 0.9–1.3 m，横在「射手 → 南口」的线上）；07+ 指纹已按本轮重生（`baseline` 0311-b-rear-mouth-banks-20261012） |

### 06 Orders

```
进 06：妮儿（CivilianFemale 分身 girl，整体缩 R.geng.nierScale 0.62）蹲在洼地东北沟沿 R.geng.nierRim (−29.2,−105.3)
      —— SJ→集结处那段交通沟的东南沿，比洼地场坪高 1.8 m；庄稼人（CivilianMale）站她身后 (−27.4,−106.6)。
      两人 scriptEssential + missionUntargetable（Protect(true)），不参战。
闲着：每 4–7 s 走到沟沿 1.5 m 内的随机点弯腰蹲下 pickS 1.2 s，口袋响一声（shellDrop）。
ordersReached 且玩家进到她 seenRangeM 16 m 内 → nierSeen；担架员喊 NierShells（两句逐句：bearer / peasant，
      说话位置：集结处东侧那个搬运人员 / 庄稼人头上）。
玩家 ≤ lookGunM 6 m：她的头朝枪口（MuzzlePoint = 眼位沿前向 0.8 m），不看脸。
玩家 shellRangeM 8 m 内开枪：落点 = 枪口右侧 shellEjectM 0.6–1.4 m 的随机点，她走过去捡（PickShellNear）。
借火改两次 F（交互点 MissionBorrowLight，单击）：
  站到老周跟前、脸朝着他（BorrowLightCued）只亮提示「跟老周借个火」；第一次 F → BorrowLight 1–6 句（FrontScenes 的逐句场景）
  第 6 句末 BorrowLightCigaretteOffered → offered，提示换成「划火，递过去」；第二次 F → Collection 发 BorrowLightMatchAsked
  （导演表 BorrowLight.07 after:"event:BorrowLightMatchAsked"）、记 matchAsked → 7–9 句 + 划火；lightShared 仍在第 9 句播完记。
起行（South）：庄稼人收走；妮儿 Follow(southWalk, followGapM 9)。
```

### 07 South

```
跟队：目标 = 队尾里程 − 9 m 的路线点，沟身里程 trenchProgressM [40,72] 里往沟沿偏 rimOffsetM 3.6（RimSide 取地面高的那一侧），
      沟外偏 1.8；走 walkMps 1.15。玩家走过 followCueProgressM 22 m、幺娃活着、她在 26 m 内 → NierFollow（整段）；
      第 3 句「嘿，还赖上了」她去捡幺娃丢上沟沿的弹壳、叫一声。SouthWhisper 在 nierFollowHeard 之后才说（FrontShow，仍有兜底时间）；
      第 5→6 句之间顺子抬头看她：gazeS 0.7 s 内视线往她那边轻带 ≤ gazeRad 0.35（不是接管，玩家随时转回），她也转过来笑一声。
沟口：领头担架到 A.southMouthHold（southWalk 里程 63 m，离南口 12 m）或玩家先到它 8 m 内 → southMouthReached，
      southMouth 组 6 人从南田房北面 60 m 外放出（出生点离机枪点 ≥ 60 m、4 个从南口看被房挡着）、沿 MISSION_TACTICS 跑步穿田：
      MouthGunner（歪把子）趴到 A.mouthEmbankment (15.2,−44.9) 的土埂后打空地；MouthRifleA/B/C 各占田埂 A / 坟包 A / 田埂 B；
      MouthFlankA/B 绕到村北口乱石墙 / 草垛后（SOUTH_MOUTH_FLANK_WATCH 22 m 内露头 → 刘文财喊 MouthFlank）。
      接火以前担架停在停点（MaxProgress）；机枪开火（lastFire；兜底：到位 8 s 没开火 / 组里先有人死）→ mouthContact →
      MouthContact、任务字切「压住东边机枪，掩护担架冲过空地。」、标签 firstLevel.guide.mouth、班长标记指机枪（holdFrom/holdUntil）、
      妮儿撒腿沿 southWalk 跑进村北巷 R.geng.villageRefuge（不受伤）。
      射手 suppressed 状态连续 ≥ mgSuppressS 2 s（或已死）→ mouthMgSuppressed（第一次记事实、喊 MouthGo）；担架只在它成立时过开阔地
      （SafeAt：里程在 [停点, 末点−4) 的担架 / 步行者只在压住期间动），抬头后 mgRegraceS 1.5 s 再停在田埂 / 电线杆后，之后再压再跑。
      绕村的两个都死或都被压住 ≥ 2 s → mouthFlankResolved（不是过关条件）。
      活着的担架全部到 southWalk 末点前 4 m → mouthCrossed，任务字回「护送伤员向南，跟住班长。」。
07 requirements：southWhisperHeard, mouthCrossed, villageMouthReached, mainStreetPointed。
```

### 08–11 给 C 包的占位

`Enter("Village")` 起老耿（`R.geng.gengHouse`）与驴车（`R.geng.cartYard`；黑子 = WorkingHorse 缩 0.75、毛色 ×0.38，车板上三件白盒行李）
就在；`GengGoTo / GengPose('slap'|'vat'|'table'|'unbar'|'lead-donkey'|'load') / CartTo / SetCartBlocking / PointAt` 都是占位实现
（走位 + 蹲站 + 一声音效），C 包按概念图换动作、只加方法不改签名。妮儿的叫声 / 笑声暂用 `hitGrunt` 抬音高占位（`NIER_SHOUT_CUE`，
素材侧登记 `nier_shout` 后只改这一处）。

### 验收

纯 Node：`Script_FirstLevelGengFamilyTest`、`Script_FirstLevelSouthMouthTest`，加既有 `MissionTest` / `MissionGatesTest` / `VoiceTest` /
`TextTest` / `SpaceTest --rear-only` / `FrontTest` / `CollectionCareTest`。实机：`--campaign --stage-to=7`（06 两次 F、07 沟口真打、
07 时长按 `R.southMouth.targetSeconds` 90–210 s、06 按 `ordersTargetSeconds` 36–100 s 断言；截图 `_shots/L1Front/Scene_BorrowLight.png`、
`Scene_SouthMouthContact.png`）。
