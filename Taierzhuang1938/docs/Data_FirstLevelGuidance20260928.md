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

## 5. 逐阶段引导账

每个阶段一行「先注意到 → 理解 → 行动」，然后是这一轮做了什么。**由各区交付时填写**（集成者合并）。

### A 01–07

（待填）

### B 07_2–10

（待填）

### C 11–14

（待填）

### D 15–18

（待填）

## 6. 验收

- 出图：`node Taierzhuang1938/Script_FirstLevelWhitebox0518Shots.mjs --only=<G_ 机位>`，引导机位登记在
  `Data_FirstLevelWhitebox0518Cameras.mjs` 各区自己的段里，id 形如 `G07_1`（阶段 + 序号），机位 = 玩家在该阶段**起步位置**、
  看向**下一步要去的方向**，另拍一两张看向**错误方向**的。每张图做眯眼测试（缩到 1/8）。
- 门禁：`Script_FirstLevelWhiteboxTerrainTest`（含小路）、`Script_FirstLevelWhiteboxVillageTest`、`Script_FirstLevelWhiteboxTransferTest`、
  `Script_FirstLevelSpaceTest --rear-only`、`Script_FirstLevelMissionTopologyTest --rear-only`、`Script_FirstLevelFrontTopologyTest`（动了 05–07）、
  `Script_MissionAreaGuardTest`（S）、`Script_ModuleGraphTest`、`Script_TextTest`；最后 `Script_FirstLevelMissionTopologyBrowserTest`
  与 `Script_MissionAreaGuardBrowserTest`（S，出界警告与检查点重来）。
- 实机：`Script_FirstLevelMissionBrowserTest.mjs --campaign --stage-from=6`（06 起连续）、`--campaign --stage-to=3`（01–03）。

## 7. 实装结果

（集成时填写）
