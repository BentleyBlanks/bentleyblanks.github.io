# 第一关 场景引导 · 空气墙 / 灯光 / 阻挡 / 路（2026-09-28）

范围：正式第一关 `?whitebox=p012` 的 01–18。用户原话：「空气墙、灯光、阻挡物的引导不够，优化整个第一关的引导，
包括但不限于场景白盒布设的优化，也可能是一个阻挡的机枪手、一队敌军逼迫阻挡、一条被阻挡了的路被迫要进入室内等等；
有明确路线的地方应该有一条像路一样的存在作为路线方向引导。」参考图仍是 Notion「第一关｜游戏概念参考图」
（本地 `tmp/ConceptRefs0518/<id>.png`，忽略目录）。

上一轮（按概念图重做体块与地形）见 [05–18 差距与分区](Data_FirstLevelWhitebox0518Gap.md)；那一轮解决的是「像不像」，
这一轮解决的是「看不看得懂往哪走」。锚点 / 路线 / 桥梁口径在 [空间拓扑](Data_FirstLevelTopology20260919.md)，
班长带路与 HUD 标记在 [罗班长任务引导](Data_FirstLevelLeaderGuide.md)——那两套不动，这里补的是**空间自己会说话**的那一层。

坐标：X 东、Z 南、Y 上，米。

## 1. 原则（照 GDC 2018「Invisible Intuition」与 Notion「白盒设计参考」整理）

每个节点先写一句：**玩家到这里，先注意到【重点】，理解【局势】，然后选择【行动】。** 空间要让这句话不靠 HUD 也成立。

| 手段 | 要传达的 | 本关的载体 |
| --- | --- | --- |
| 路（affordance） | 「这条能走、往那边走」 | 踩出来的小路 / 车辙（§3.1）、沟、巷、夹道、门洞、电线杆一排、担架队 / 班长走在前面 |
| 挡（denying affordance） | 「那边不能走，而且看得出为什么」 | 倒墙 + 碎砖坡、翻倒的车、铁丝网、沙袋堆、燃着的东西、塌方；再往外才是空气墙（§3.2） |
| 光 / 地标 | 「目标在那个方向」 | 烟柱（`Data_FirstLevelDistantSmoke`）、火（`Data_FirstLevelSmokeOrigins`）、门楼 / 桥 / 教堂这种高出天际线的东西、室内朝出口的那扇门最亮、夜景火盆一排 |
| 人 | 「威胁在哪 / 该去哪」 | 阻挡的机枪手（射界本身就是一道墙）、追压的一队敌军（把人往前推）、跑向沟口的担架兵、班长停在路口 |
| 界（soft boundary） | 「离开战场了，回来」 | 任务走廊 + 倒计时（§3.3）——最后一道兜底，前四样做到位时玩家碰不到它 |

三条纪律：
1. **先测布局，再补线索**：先出图看空间本身读不读得出来，再加小路 / 烟 / 火；每加一样都写明它解决哪一次犹豫。
2. **做眯眼测试**：把截图缩小到 1/8 看，最突出的东西必须是「下一步要去的地方」或「当前威胁」，不能是无关的蓝墙。
3. **错误邀请要处理掉**：看起来能走 / 能翻 / 能进的地方，要么真能走，要么给一个看得见的理由不能走。空气墙只许兜底，不许当墙用。

## 2. 阶段与分区

沿用 05–18 那一轮的四区 + 前沿：

| 区 | 阶段 | 体块包 / 地形表 | 引导重点（一句话） |
| --- | --- | --- | --- |
| A Front | 01–07 | `Data_FirstLevelWhiteboxFront` / `…TerrainFront` | 沟网里哪条支沟是路、哪条是敌人来的；06 洼地怎么出去；07 沟怎么接村口 |
| B Village | 07_2–10 | `…Village` / `…TerrainVillage` | 主街被堵 → 右手灶屋是唯一的门；灶屋—连屋—侧间—内院—绕回巷—村南门楼一条线 |
| C Transfer | 11–14 | `…Transfer` / `…TerrainTransfer` | 到桥头一眼分清三个方向；空袭后西沟口是唯一的路 |
| D Rear | 15–18 | `…Rear` / `…TerrainRear` | 沟尾 → 夹道 → 院门；院子 → 桥南射位；撤出 → 行军；夜门 |
| S Systems | 全关 | `Data_FirstLevelMissionArea` / `Script_MissionAreaGuard` | 任务走廊与「返回战场」倒计时；空气墙调试显示 |

## 3. 工具箱与契约

### 3.1 小路（踩出来的路，只画不挖）

各区地形表 `Data_FirstLevelWhiteboxTerrain<Region>.mjs` 新增 `paths` 数组：

```js
paths: Object.freeze([
  { id: "WallPathTread", points: [{ x: 56, z: 207 }, { x: 16, z: 220 }, { x: 2, z: 240 }], width: 1.6, wear: .9,
    note: "15B 沿院墙的夹道小路" },
]),
```

- `width` 路面全宽（脚径 1.2–2.5 m、车辙 3–5 m），`wear` 0–1 踩实程度（缺省 0.85）。
- **只进地表纹理层**：`SampleMissionGroundSurface` 的 track 层（路心 = wear，向外 1.8 m 落到 0）与麦茬 3.5 m 退让；
  `SampleMissionTerrain` 不读它，高度逐位不变，07+ 地面指纹不动。要改高度仍用 `shapes`。
- 连 1.8 m 染色边落在本区 box 内（`Script_FirstLevelWhiteboxTerrainTest` 第 6 节断言）。
- 有明确路线的地方都应该有一条：路线键（`MISSION_ROUTES`）是路的中线，但小路可以比路线短（只画看得见的那一段）或偏（贴墙根、走坡脚），路线本身不动。

### 3.2 空气墙

`Block(id, x, z, w, h, d, "airWall", { visual: false, tag: "airWall" })`（各包的 Block 写法同）。

- `visual:false` 不画；`tag:"airWall"` 让 `Script_Physics` 给它 `IG_AIR_WALL`（成员 WORLD、过滤只留 CHARACTER）：
  **只挡角色控制器**（玩家、NPC）；子弹 / 视线射线、手榴弹、碎块、布娃娃一律穿过；`RaycastAabb` 兜底路同样跳过；
  `DeriveCoversFromColliders` 不把它派生成掩体；`Data_Destruction` 给它不可摧毁的空档案。
- 三条禁令：不许横跨任何 `MISSION_ROUTES` / 敌军来路 / `FRONT_PRESSURE` 射击点到目标的线；不许放在玩家 15 m 内能走到的地方
  代替真墙（先用倒墙、翻车、铁丝网、沟、坎）；不许和任务锚点 / 交互点重叠。`Script_FirstLevelSpaceTest` 的路线净空扫描把它当实心体块。
- 数据俯视图 `Map_<区>.png` 会把它当实心块画出来（按顶高深浅），用它核对位置；实机 `?airWalls=1` 画成半透明红板（S 包）。

### 3.3 任务走廊与「返回战场」（S 包）

`Data_FirstLevelMissionArea.mjs`（纯数据）：每个内部步骤一条走廊 = 若干路线键的胶囊（各自 halfWidth）∪ 若干圆 / 多边形；
`Script_MissionAreaGuard.mjs`（纯规则）：点到走廊的距离、出界计时、警告 / 判负；运行时薄钩子 + HUD 一行
「离开战场区域 · 返回 · N 秒」（文本走 `Data_Text_FirstLevel`，数值走 `Data_Tuning_MissionArea`）。
过场 / 受控段（01–02、坐车、抬担架、死亡场、夜行军）不判。判负走既有检查点重试，不另起一套。

#### 3.3.1 实装（S 包，2026-09-28）

| 件 | 文件 | 说明 |
| --- | --- | --- |
| 走廊表 | `Data_FirstLevelMissionArea.mjs` | `MISSION_AREA_STEPS`：27 个可玩步骤各一行 `{routes:[{key,halfWidthM,from?,to?}], discs:[{anchor,r}], polygons:[{id,points}], exempt?, exemptUntil?}`；路线键取 `MISSION_ROUTES`，锚点取 `MISSION_ANCHORS`。零 import |
| 规则 | `Script_MissionAreaGuard.mjs` | `ResolveMissionArea(s)`（键写错开机就抛）、`DistanceToArea(point, area)`（有符号：正数在外）、`MissionAreaGuard.Update(dt,{step,point,area,controlled})` → `{outside, warning, urgent, distanceM, secondsLeft, failed}`；零 three |
| 数值 | `Data_Tuning_MissionArea.mjs` | `MISSION_AREA_GUARD`，见下表 |
| 钩子 | `Script_FirstLevelMissionRuntime.mjs` | `UpdateMissionArea`（`Update` 末尾一行）、`InsideMissionArea`、`SaveCheckpoint` 一行、`ClearReturnWarning` 两行、`State().missionArea` |
| HUD | `Script_Hud.SetMissionArea` + `Style_Game.css .hudMissionArea` | 顶部正中一行，字样同目标通知（粗体、硬黑描边、无底板），最后 3 秒转红；文本键 `firstLevel.area.warning`「离开战场区域 · 返回 · {seconds} 秒」 |
| 空气墙调试 | `Script_Main`（`?airWalls=1` → `debugAirWalls`）+ `Script_FirstLevelWhiteboxField` | `tag:"airWall"` 的体块另画一层半透明红板（不写深度、不投影、`MarkNoPrepass`）；默认不画，碰撞两种情况都一样 |

计时（`MISSION_AREA_GUARD`）：出了走廊连续 `graceS` **1.5 s** 才亮；亮起后倒数 `countdownS` **10 s**，走完判负；
亮着时回到边内 `reenterM` **2 m** 才算回来（回滞），回来立刻灭；回来连续 `resetS` **3 s** 倒计时才补满，
没满又出去立刻重亮、接着剩下的秒数走（蹭边补不满）；换步（含检查点重来、阶段跳转）前 `stepGraceS` **3 s** 不判；
最后 `urgentS` **3 s** 转红。出处写在表里（工作单 S 包 + 同关回头警告 `MISSION_RETURN` 的 1.25 s / 3 s / 3 m）。

走廊半宽怎么定的：
- **步行段胶囊 40 m**。同一关已有的「返回任务区域 / 返回行动路线」方向面板（`Script_MissionReturn`）在离本步路线
  `MISSION_RETURN.corridorM` **36 m** 时亮，这一层必须比它宽：玩家先看到方向，走得更远才出倒计时；再加 4 m 给躲雷、绕掩体的横移。
  工作单给的区间 25–40 m，取上限。**停点圆 30 m**（集结处、掩蔽部、院门、射位这些停下来的地方）。
- **战斗段框整个战场**：前沿 03–06 `FrontField` x −62…80、z −208…−88（日军最北一道跃进线 −193 以北 15 m；战车路 60–64 以东 16 m；
  集结处以南）；村落 08–10 `Village` x 30…100、z −40…48；桥头 12–14 `TransferYard` x 28…114、z 36…146（把 12 追兵出生的绕回短巷框进来）；
  接收院 15C–18 `ReceptionYard` x −56…24、z 206…264。
- 验收标准是「宁松勿紧」：`Script_MissionAreaGuardTest` 把每一步的回头警告线、契约路线、目标、上一步目标（交接处）、接近门锚点、
  检查点出生点、`MISSION_PLACEMENT` 摆位、05 取弹路 / 攻击支路 / 投掷位、现有连续驾驭脚本在这一步走过的每个点（共 1858 个）
  逐点核对，都要在走廊里且离边 ≥ 4 m；同时核对关卡四角与每一步往错方向走的点在走廊外。

不判：`controls` 在（受困、救援、坐车、扑沟、死亡、夜行军、上担架黑场、进门遭伏击）、抬着担架（`carry.Active`）、倒地、豁免步
（`Trapped` `CartRide` `Carry` `Dive` `Death` `NightMarch`）、`BunkerRescue` 在 `luoRescueComplete` 之前。

判负：`player.Kill()`，之后装配层照常 `OnPlayerDown` → 死亡菜单「你已阵亡」→「从检查点开始」→ `Retry`，没有另一套失败流程。
为了不重生在走廊外面，`SaveCheckpoint` 在已有存档点、人又在走廊外时不覆盖它。

和回头警告的分工：回头警告是方向（36 m 起亮、58 m 转急，不判负，画面中上的面板）；走廊是界（出了走廊才出倒计时，顶部一行）。
两层同时亮时上下错开，不叠字。

验收：

```powershell
node Taierzhuang1938/Script_MissionAreaGuardTest.mjs          # 纯 node：表、1858 点覆盖、错方向在外、计时器、空气墙红板
node Taierzhuang1938/Script_MissionAreaGuardBrowserTest.mjs   # 实机：07 真按 W 往西跑出走廊 → 1.5 s 后亮 → 回来灭 → 转红 → 阵亡菜单 → 检查点重来
node Taierzhuang1938/Script_FirstLevelMissionBrowserTest.mjs --campaign --stage-from=6   # 06 起连续驾驭不被走廊误判
```

截图在 `_shots/MissionAreaGuard/`（`Scene_AreaWarning` / `Scene_AreaUrgent` / `Scene_AreaFailed` / `Scene_AreaRetry`）。
走廊太窄的症状是连续驾驭里多一次阵亡（`CAMPAIGN_DEATH` 那一行 `activity` 正常、`lastHits` 为空）或 `State().missionArea.log` 里有出界记录：
放宽那一步的走廊，别调计时。

2026-09-28 实测（读 `State().missionArea.log`）：`--campaign --stage-from=4 --stage-to=6` 到 07、`--stage-jumps --stage-from=8` 走到 17、
`--stage-jumps --stage-from=18` 到 Complete，全程 0 次出界。`--stage-from=6` 在 07→08 被 VillageCorner 刺死、`--stage-jumps --stage-from=15`
卡在 17（幺娃不拉覆盖物，`coverS` 恒 0），这两条在未改的 60166b9f 上同样红，与走廊无关。

### 3.4 阻挡与光的词汇（体块包里的写法）

- **倒墙 + 碎砖坡**（08 已有）、**翻倒的车 / 大车横在路上**、**铁丝网**（`MISSION_DEFENSE_POSTS` 有带模型的 fence）、
  **沙袋堆**（只用战场包 `battlefieldSandbag01/02/03`，见 [沙袋标准](Data_SandbagStandard.md)）、**塌方 / 土堆**（`GroundedBlock` 土色）、
  **燃着的车 / 屋**（`Data_FirstLevelSmokeOrigins` 一条 = 一处火 + 一根烟柱，落在地上的真实位置）。
- **光**：白天没有点光，靠**对比**——室内朝出口的门开着、门外是亮的（屋顶只在出口那边留缝）；错误出口那边屋顶闭合、堆杂物；
  远处目标方向留一根烟柱 / 一座门楼 / 桥的桁架高出天际线；夜景（18_2）火盆一排指向门洞（已有）。

## 4. 不能动的约束

[05–18 差距 §2](Data_FirstLevelWhitebox0518Gap.md) 整表照旧（锚点 / 路线 / 担架走廊 / 门宽 / 人缝 / 牛车盒 / 河 / 壕沟 / 指纹 / 版本戳），加：

| 约束 | 口径 |
| --- | --- |
| 小路只画不挖 | `paths` 不进高度；改高度用 `shapes` |
| 空气墙 | §3.2 三条禁令；`tag:"airWall"` + `visual:false` 缺一不可 |
| 敌军名册 | 加人 / 挪人只走 `Data_FirstLevelMissionGates` / `Data_FirstLevelMission` 的表，事实名与通过条件不变；改了要跑 `Script_MissionGatesTest`、`Script_FirstLevelMissionTest` |
| 01–06 | K1–K11 关键帧、`Script_FirstLevelFrontTopologyTest`、`Script_FirstLevelSpaceProbe` 全部照守；地形表 Front 区只覆盖 05–07 的框 |
| HUD | 不加罗盘、不加常驻路径线；走廊警告只在出界时出现 |

### 3.5 地标烟柱与「先看见再走」的标记（集成者，2026-09-28）

- **地标烟柱** `Data_FirstLevelDistantSmoke.LANDMARK_COLUMNS`：固定位置、不抖动、不吃随机数（路边散点逐位不变）的近处烟柱，
  自带 `kind`（`Data_FirstLevelSmokeOrigins` 照它摆着火残骸，不参与按帧分配、不动战车奇偶）。现有两处：
  `StreetBlockFire` (80.4,21.4) —— 08 横车上的木料火，从村北口 42 m 外看，主街尽头一根 9 m 黑烟柱；
  `VillageMouthFire` (40,−30.5) —— 07 出沟那一眼，村北口路北土埂后的柴垛火，把「往东拐进村」抬到天际线上。
  两处离所有任务路线 ≥ 9 m（`DistantSmokeTest` 低烟净空）、残骸实心盒 3 m 内没有别的实心体块；`SmokeOriginsTest` 的计数随之 63 → 65。
- **08 先看见街堵了再进灶屋**：`streetBlockSeen` 只在主街北口那个 box 里落（Gates 表），标记与班长若一开始就指灶屋，玩家跟着进屋
  就永远过不了 08。`MISSION_LEADER_STAGES.Village` 用 `holdTarget (76,−22.5) / holdUntil streetBlockSeen`，并新增三个可选字段：
  `holdMode`（守着时的动作词，缺省 `cover`，08 用 `move`「前往」）、`holdCue`（守着时喊的句子，缺省本步 cue，08 为 `null` 不喊）、
  `afterHoldCue`（落下之后喊的句子，缺省 `null`，08 为 `GuideKitchen`）；BridgeCover 的行为逐位不变。班长的带路线改成
  村北口 → 主街口 (75.5,−22.5) → 顺巷子折回 → 灶屋北门 → 灶屋（`Script_FirstLevelMissionRuntime` 的 `case "Village"`）。
  回归：`Script_FirstLevelLeaderGuideTest`（守着时 mode move / cue null / 目标在 box 里；落下后指灶屋、喊 GuideKitchen）。

## 5. 逐阶段引导账

每个阶段一行「先注意到 → 理解 → 行动」，然后是这一轮做了什么（四区代理交付，集成者合并；坐标世界米）。

### A 01–07

- **02 撤离**（G02_1–G02_4）：先注意到后交通壕折角的木框和 25 m 外沟沿上方的救护旗 → 伤员和自己人在西南 → 沿后交通壕到交汇处、左转下 CollectionLink 进洼地。
  光/地标：救护旗（3.6 m 杆、白布红十字）立在 CollectionLink 口东侧沟沿 (−28.5,−106.3)，不带碰撞，01–06 视线与火力线不变。往东（弯 M → 岔口 J）本来就有日军站位、被处决的川军和沟壁塌低段，没再加。
- **03 支援**（G03_1–G03_3）：先注意到集结处东北角往北走的班长 → 支沟是路 → 进沟北上。没改（正面空地只能靠阵位机枪的射界「说不能走」；01–04 没有地形框，加实心体块会撞 K3 与交战距离断言）。
- **05 取弹**（G05_1–G05_6）：先注意到后墙岔口东北方向旧院那棵 7 m 枯树 → 顺取弹沟到沟口、上土台阶进北门，地上一条小路绕过车挡到弹药屋后门 → 取完往东看，东门关死了，只能原路回北门。
  路：`OldYardTread` (41.6,−120.8)→(42.4,−111)，宽 1.4。挡：旧院东门 (54, z −111…−107) 两扇 2.2 m 门板 + 横闩 + 门后箱子（原来正对弹药屋东门，一出去就是南路和路东空地）。低顶匍匐段（`FRONT_SORTIE.crawl`）09-23 起已不存在。
- **06 接令出发**（G06_1–G06_3）：先注意到洼地东南角坡上的担架队（坡面是浅色路面）→ 往上坡走 → 坡顶一条小路，右手院墙和棚、左手挡土墙，一直通到 07 沟口。
  挡：FrontCommunication 交通沟原来从洼地南缘平着出去、比上坡更像出口，现在在洼地以南 9 m 做成塌方（主土堆 6.2×2.4 m、高出沟底 2.1 m，前面两块歪土块都高于 1.2 m 翻越线，顶上横着护壁板；沟西沿一个地形弹坑 `CollectionTrenchCrater` (−38.2,−90.2) 交代来由）。路：`CollectionRampTread` 坡脚到坡顶，宽 2.4。`CollectionLitterWall` 按原尺寸、原掩体朝向换成土色（原来是洼地里最显眼的蓝板）。
- **07 南行**（07_1、G07_1–G07_4）：先注意到沟底踩实的土路（原来是麦茬贴图）→ 顺沟走到南口 → 爬出来后左前方一排电线杆从坡顶往东伸向村子、脚下一条小路斜穿大车路往东、村北口一根黑烟柱（§3.5）→ 往东拐，不跟大车路往南。
  路：`SouthWalkTread` 一条连着画，06B 小道 (−19.15,−81.05) → 沟北口 → 沟底 → 南口 → 斜穿 southTraffic 大车路 → (17,−23.7)，宽 2.2。地标：三根 6.6 m 电线杆 `SouthExitPole0–2` (2.0,−31.5)/(9.6,−27.7)/(18.5,−26.0)，带横担电线，对着村落区那排电线杆。
- **界**：没加空气墙；唯一新增实体边界是 05 旧院东门。地形框 South07 改成 x −40…20、z −84…−18（出沟那一段原来不在任何框里），东半 x 20…60、z −84…−30 留作 South07East（空）。
- **还读不出来的**：03 观察射台前的正面空地仍是平地（补法要走共享表 MISSION_AFTERMATH / MISSION_TERRAIN.steps 并量 K3）；05 道路连接支沟 RoadLinkSap 东口直通南路（切入组来路，不能堵，交给走廊兜底）；06 北面 `CollectionBackslopeWest` 22×3 m 土色平板在 03 起步画面里仍是最大最暗的块（参与 06 背坡遮挡，没动）；塌方土堆是方块叠的，读得出「堵了」，不太读得出「塌了」。

### B 07_2–10

- **07_2 村北口**：先注意到巷子深处灶屋门上的红对联 → 巷子通进村 → 顺巷子往东。路：车辙 `VillageLaneRuts`（宽 3.2）从 (47.5,−20) 顺巷子进主街、一直压到障碍跟前 (76.7,16.5)。挡：所有 `House()` 的假门从黑洞改成关着的板门。
- **08 起步 (48,−20)**：巷子尽头只剩丁字口往南拐的主街，右手灶屋门的红对联 → 大路往主街去 → 走向主街口。界：主街北口东侧 z −27…−24 那道 3 m 口子用院墙 `StreetMouthEastWall` (80.45,−25.5) + 关着的院门 + 柴垛封死（flank 路线在 x≈90，离它 9 m）。挡：灶屋正对门那栋的门口堆了门板、缸、筐。
- **08 主街北口 (76,−22)**：街尽头 42 m 处一道黑的废墟、街面碎瓦越往前越密、废墟上一根黑烟柱 → 大路断了 → 回头。挡：倒墙上压塌屋顶（顶高 2.75 m）插三根焦梁（最高 3.6 m）；横车后面竖一辆烧黑翻起的大车（车板 3 m、车辕 4.4 m）；东侧拐角那栋改成烧剩的空壳；人缝后 z≈25 一摞门板挡住远街（东侧留 2.2 m 绕过）；障碍前 z 10…17.6 撒低碎瓦（≤ 0.28 m）。人缝 x 76.225…77.125 一件不放，东窗 / 侧间射线与担架遮挡断言照旧。
- **08 回头朝西 (74,−24)**：画面里唯一的红色是灶屋北门，门口一片暖黄稻草，门扇敞开 → 唯一开着的门 → 顺脚径拐进去。光：门两侧红对联、横批、一只灯笼、门里门外各一片稻草。路：脚径 `KitchenDoorTread`（宽 1.6，wear 0.95）从主街口折回、拐进北门、穿灶屋—过道—连屋到南门 (58,15.6)。班长与标记先到主街口再进灶屋（§3.5）。
- **09**：南门外的过道和连屋本来就亮于其他口；脚径一路穿过屋内。「屋顶只在通向连屋那侧留缝」没做（VillageTest 要求灶屋吊顶连续），「门里有光」改用门口装饰与稻草表达。
- **10 → 11**：连屋南门外是亮的内院和绿色院门，出了院门是巷子、主街，尽头是门楼 → 沿路走。路：`CourtyardTread`（院里那一折，宽 2.0）接院门；`BypassLaneRuts`（宽 3.2）走绕回巷、在主街口直接拐南、穿村南门楼。光/地标：门楼加一层檐（顶高约 5.8 m，高过两侧屋脊），门梁挂红匾、两侧灯笼。Layout 里两栋蓝色 cover 房 (106,40)/(39,65) 换成灰泥色。
- **人 / 界**：没加敌人、没加空气墙——剩下的口子（东巷口、x=82 在 z 35–45 的缺口、西巷、侧巷）都是 08/10/12 的敌人来路，不能封。
- **还读不出来的**：小路染色在村里浅色碎石地面上很淡，第一人称只看得出一点，俯视才明显（地表纹理对比问题）。

### C 11–14

- **11 抵达桥头**（出门楼 (76,70.5)）：先注意到低墙路口两根砖垛夹着车路、路两边残墙一路排到桥头两根深色砖墩 → 车路往南通桥，装载区在左手（东）残墙后 → 穿过路口、左拐进装载区。
  光/地标：桥头砖墩 (71.3/80.7,137.4) 从 2.3 m 灰泥墩改成 3.1 m 砖墩加墩帽（顶高约 4.1 m、深色），65 m 外衬在天上。挡→开：东墙第一段北半截（x 80，z 90–92.5）从 2.5 m 降到 1.05 m，站在路口就能看见墙后的沙袋、车和人流。
- **12 低墙射位**：没改——人（罗班长、刘文财在射口两侧）、低墙和 HUD 已经在指向。从装载区回看射口被路西残墙挡住，只在 z 84–90 那个口看得见，不算突出。
- **13 → 14 空袭后转入西沟**：先注意到卸人处西北 28 m 一面红十字旗 → 担架往那儿走 → 顺踩出来的泥路把老周抬到沟口，从石柱和旗杆之间下坡进沟。
  光/地标：旗杆 (55.8,110.4) 高 6.6 m、旗面 2.1×1.45 m 南北向，从停车处和场院两个方向都斜着看到旗面。路：沿 South 撤退通道 (73.4,134.2)→(72.8,133.4)→(64.6,125)→(55.2,115.2) 铺约 25 块贴地泥块、洼地最湿一段横铺 4 块跳板、路边掉着担架杆和绷带，全部不碰撞（整片场院落在 `MISSION_TERRAIN.pads` 里、纹理层已是铺路，`paths` 叠上去看不见）。挡：沟口北沿土埂 `TransferDitchNorthLip` 从蓝色 cover 块改成抛土色（保留 AI 掩体）；入口南侧一根齐胸石栏柱 (53.1,117.9) + 半截倒下的栏板。南边（桥）：路桥炸断、水面、砖墩已读得出过不去；东边：运行时本来就有着火的翻车和受惊的牲口。
- **界**：东侧沿 x 121.5、z 76.5–137.5 一道连续夯土墙，墙外靠两间棚（追兵 air 组出生点与路线都在墙西侧）；河北岸河槽本来过不去。西沟以西 x<28 的开阔田地没做（只挡一小段会被绕过去，交给走廊兜底）。
- **还读不出来的**：泥块近看像踏脚石，缩到 1/8 能读出一条线通向沟口；旗在 11 的画面右边缘、不突出；路南没有燃着的车 / 弹坑（白盒件是静态的，11/12 的过路车要走这段桥头路）。

### D 15–18

- **15A 沟尾**（G15_1 / G15_1w）：沟到头，坡顶左边一根路牌指向右手两道墙夹出的口子 → 沟到这儿完了、往右进夹道 → 跟担架队爬坡右拐。路：`WallPathTread` 从沟尾 (56,201.5) 沿 `wallPath` 全程到院门 (2,240)，宽 1.6（沟底那 5 m 被壕沟材质盖住，出了沟才看得见）。标：路牌 `LaneMouthSignPost` (57.35,209.4)。
- **15B 夹道左拐**（G15_2）：夹道尽头是土房山墙（像死路），左手矮墙上方一根 6 m 灯笼杆（灯笼加红三角旗）→ 到头往左拐。标：`LaneTurnLanternPole` (18.45,213.85)（从沟底看不到它，被 (36,200) 外屋挡住，所以沟口另加路牌）。
- **15C 夹道出口 → 院门**（15_1 / G15_3）：瓦顶门楼、门洞里是亮的院子、脚下一条浅色小路弯向门洞 → 门楼是唯一去处。挡：出口左手（东南）原来直通地平线的空田，用 1.15 m 带瓦压顶石砌园墙收住（东段 `RearForecourtEastWall` x 14.55、z 230…247；南段 `RearForecourtSouthWall` z 247.2、x 1.6…14.8，接东南耳房）。夹道路线、院门外排队线、x=6 小巷、传令兵出生点都没碰。
- **16 院门 → 厢房南门**（G16_1）：厢房东南角旗杆上的红十字旗，从院门就看得见、比院里所有屋檐都高，担架队往那边抬 → 跟担架队绕到厢房南门。标：`ReceptionWardFlag*` 杆在 (−18.35,242.8)，高 5.7 m。挡：院南墙正对厢房门那个 5 m 宽的南门 (−22,252)（门洞里露出白房，是院里最显眼的错误出口、没有任何路线用它）两扇实体门板关上、加横闩竖撑。院子是场坪，不画小路。
- **17 厢房门口往外**（17_2）：门外正对关上的院南门 → 院子是封闭的。
- **18 接令 → 出后门**（G18_1）：顺檐廊往西，尽头是西墙上开着的后门，门外是枯树和亮的田地；南门关着 → 从后门出去。后门两扇门板向外敞开贴在墙上（`ReceptionRearDoorLeaf*`，不挡人）。
- **18 后门 → 爆破安全区 → 南岸射位**（G18_2 / G18_3）：远处铁路桥钢桁架是天际线上唯一的钢结构、脚下一条浅色小路往西北伸 → 沿小路到土墙加沙袋的安全区，再过路基到岸垄后的胸墙。路：`ToBridgeTread` (−43.8,244)→…→(−81,180.6)，宽 1.6（原来那条 10 m 车路只通到东翼墙 (−61,190)，没动）。
- **18 撤回 / 炸桥后行军**（G18_4 / G18_5）：同一条小路回到土墙加沙袋；炸桥后一条更宽的浅色路往南。路：`MarchOutTread` (−66,204)→(−61.4,240)，宽 2.2，过淡出点再延 8 m。
- **全段**：15–18 里 Layout 画成蓝色的墙全部按原公式、原 id、原 cover 朝向重新输出，只换颜色（灰泥 / 石墙 / 土色），尺寸不变；SpaceTest 量的 15B、15C、18 数值和原来一样。没加空气墙。18_2 夜门没动（夜景实拍里门洞是最亮的口，两侧民房把街收住）。地形框 Reception15 / Bridge18 的分界从 x=−50 挪到 −41（去桥的小路不能跨框）。
- **还读不出来的**：沟尾坡顶往东南还是空田（加东西会牵动壕沟布设，建议从夹道南墙东端往东接一小段墙）；坡顶往西北矮墙北侧与外屋之间有 3–5 m 漏口可绕到院北；18 西面 x<−85 空田只有路基那道横线；小路在夹道 / 壕沟 / 场坪上看不出来（地面本来就是路面或壕沟材质），真正起作用的是 18 的田地和 15C 出口段；18 射位往西北远处还有一块蓝色 `WestFieldHouse` (−113,99) 不在任何分区框里。

## 6. 验收

- 出图：`node Taierzhuang1938/Script_FirstLevelWhitebox0518Shots.mjs --only=<G_ 机位>`，引导机位登记在
  `Data_FirstLevelWhitebox0518Cameras.mjs` 各区自己的段里，id 形如 `G07_1`（阶段 + 序号），机位 = 玩家在该阶段**起步位置**、
  看向**下一步要去的方向**，另拍一两张看向**错误方向**的。每张图做眯眼测试（缩到 1/8）。
- 门禁：`Script_FirstLevelWhiteboxTerrainTest`（含小路）、`Script_FirstLevelWhiteboxVillageTest`、`Script_FirstLevelWhiteboxTransferTest`、
  `Script_FirstLevelSpaceTest --rear-only`、`Script_FirstLevelMissionTopologyTest --rear-only`、`Script_FirstLevelFrontTopologyTest`（动了 05–07）、
  `Script_MissionAreaGuardTest`（S）、`Script_ModuleGraphTest`、`Script_TextTest`；最后 `Script_FirstLevelMissionTopologyBrowserTest`
  与 `Script_MissionAreaGuardBrowserTest`（S，出界警告与检查点重来）。
- 实机：`Script_FirstLevelMissionBrowserTest.mjs --campaign --stage-from=6`（06 起连续）、`--campaign --stage-to=3`（01–03）。

## 7. 实装结果（2026-09-28 集成，`MISSION_WHITEBOX_VERSION = first-level-20260928-guidance-r1`）

五路并行（S 系统 + A/B/C/D 四区）各在自己的 worktree 从基线 60166b9f（小路层 + 空气墙契约）分出，按 S → C → B → D → A 合入，
再合 origin/master 两次（开场压木改稿 b366d39e、开场动画重烘 56ebe386）。共享文件只有 `index.html` 的 `?v=` 与机位表各区自己的段冲突，全部取较大戳。

**集成时另做的三件事**（§3.5）：08 标记与班长先到主街口再进灶屋；两根地标烟柱；两条本来就红的门禁登记（`Script_MissionGatesTest` 白名单正则、
`Script_TestRunner` 的 LayeredGait 领域）。

**08 折回线踩过的坑**（写在 `Script_FirstLevelMissionRuntime` 的 `case "Village"` 上）：第一版折回线贴 z −22.5 走，两名队员顶在主街西墙北端
(72,−22) 的墙角上一动不动，队尾刘文财到不了院门以南、10 的 `rearCoverDisengaged` 永远落不下（实机取证 `_shots/GuidanceIntegration/CourtyardStallProbe.mjs`
每 30 s 打印全队与担架的位置）；改成「只给班长折回」后伏击那一拍的起身反而收不掉（两次确定性复现）——队员在那一刻穿过道的站位变了。
最终是整队走同一道折线、停点 (76,−24)、来回走巷子北侧 z≈−24（离墙角 2 m），08–14 一次跑通。

**门禁**（全部在合完 master 之后的树上跑）：

| 门禁 | 结果 |
| --- | --- |
| `Script_FirstLevelWhiteboxTerrainTest` | 366 项通过；28 个形状、10 条小路（B 4 / D 3 / A 3；C 的场院在 pads 上，改用贴地泥块） |
| `Script_FirstLevelSpaceTest`（全量） | 通过；07+ 指纹按本轮重生（体块 2287 → 2530，遗体 191 / 壕沟布设 2 不变，地面采样变化 = A 区 06 沟西沿的弹坑） |
| `Script_FirstLevelMissionTopologyTest`（全量 / `--rear-only`） | 通过 |
| `Script_FirstLevelFrontTopologyTest`、`WhiteboxVillageTest`、`WhiteboxTransferTest`、`MidTest`、`EndTest`、`FrontTest`、`CollectionCareTest` | 通过 |
| `Script_MissionAreaGuardTest`、`Script_FirstLevelLeaderGuideTest`、`Script_MissionGatesTest`、`Script_TestRunnerTest`、`Script_TextTest`、`Script_ModuleGraphTest`、`Script_FirstLevelVoiceTest` | 通过 |
| `Script_FirstLevelDistantSmokeTest`、`Script_FirstLevelSmokeOriginsTest` | 通过（65 处烟源；「近处烟 ≥ 20」那条原来在基线上是 19，本轮加地标后转绿） |
| `Script_FirstLevelMissionTest` | **基线红**：1199 行「07+ keeps the legacy fixed-source front, quieter than 03」（战场声音模块），干净的 origin/master 上同样红，本轮没碰 |
| `Script_FirstLevelMissionTopologyBrowserTest` | 通过（26 段双向路线、两桥四态、夜景 125 件） |
| `Script_MissionAreaGuardBrowserTest` | 通过（S 包分支上：07 往西跑出走廊 → 1.5 s 亮 → 回来灭 → 转红 → 阵亡菜单 → 检查点重来） |
| `--campaign --stage-jumps --stage-from=8 --stage-to=14` | **通过**（合并后的树，探针版：08 主街口 → 灶屋 → 伏击反刺起身 → 10 担架过院、队尾脱离 → 11–14 → 15A 收拢） |
| `--campaign --stage-to=3`、`--campaign --stage-from=3 --stage-to=6` | 通过（A 区分支上，1173 s / 1336 s，0 次检查点重试） |
| `--campaign --stage-jumps --stage-from=18` | 通过到 Complete（D 区分支上） |
| `--campaign --stage-jumps --stage-from=15` | **基线红**：17 `deathSceneComplete` 不落（幺娃不拉覆盖物，`coverS` 恒 0），D 与 S 都在未改的基线上复现同一卡法 |
| `--campaign --stage-from=6`（06 起连续、不跳阶段） | **基线红**：07→08 到村北口时被村口那组打死（本轮 122.7 s 于 (64.2,−23.4) 失血至零：进 07 时 34 血、0 绷带、0 弹药；S 包在未改的 60166b9f 上同一命令 108.8 s 于 (47.2,−20.3) 同样死在 VillageCorner 手里）。08 起分段驾驭全通（上一行），所以是 06→07 驾驶器的补给 / 血量问题，不是引导几何 |

出图：`_shots/GuidanceFinal/`（46 个 G 机位 + 31 个原机位 + 8 张数据俯视图，忽略目录）；改前基线在 `_shots/GuidanceBaseline/`。

**仍然读不出来的**：各区 §5 末尾各自列了；跨区的两条——(1) 小路在浅色碎石地面、场坪和壕沟里几乎看不出来（地表纹理对比问题，纹理层归渲染侧），
(2) 03 观察射台前的正面空地与西沟以西 / 桥南以西的空田仍是平地，只有任务走廊兜底。
