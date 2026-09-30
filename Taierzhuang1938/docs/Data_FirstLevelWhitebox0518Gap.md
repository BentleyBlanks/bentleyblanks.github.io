# 第一关 05–18 场景白盒 · 概念图差距与分区（2026-09-27 侦察）

范围：正式第一关 `?whitebox=p012` 的 05–18。对照 Notion「第一关｜游戏概念参考图」05_1…18_2 共 31 张（本地 `tmp/ConceptRefs0518/small/<id>.jpg`，忽略目录，不入库），
把「概念图有、游戏里没有或不像」的空间要素列成可执行清单，并冻结之后并行改造的分区、地形接口与不能动的约束。
上一轮白盒迭代见 [06–18 场景白盒 2026-09-24](Data_FirstLevelWhitebox20260924.md)；锚点/路线/桥梁口径见 [空间拓扑](Data_FirstLevelTopology20260919.md)。

坐标：X 东、Z 南、Y 上，米；朝向约定见 `Data_FirstLevelWhitebox0518Cameras.mjs` 文件头（yaw 0 = 朝北）。

## 0. 取证与工具

| 产物 | 位置 | 说明 |
| --- | --- | --- |
| 机位表 | `Data_FirstLevelWhitebox0518Cameras.mjs` | 31 个机位，id 与概念图同名；`stage` / `camera{x,z,h\|y}` / `look` / `yawDeg` / `pitchDeg` / `note` |
| 出图脚本 | `Script_FirstLevelWhitebox0518Shots.mjs` | `node Taierzhuang1938/Script_FirstLevelWhitebox0518Shots.mjs [--only=08_1,08_2\|maps\|top\|Map_Village0810] [--out=<dir>] [--no-shots] [--no-maps] [--no-top]` |
| 现状图 | `Taierzhuang1938/_shots/Whitebox0518/<id>.png` | 1280×720、55° FOV、`missionStage=N&quality=medium&scale=small`，经采样点编辑器 `ApplyPose`，不碰指针锁 |
| 数据俯视图 | `_shots/Whitebox0518/Map_<区>[_<框>].png` | 共享地面高度着色 + 相对 natural 的 0.5 m 挖/填等值线 + 实心体块（按顶高深浅，蓝边 = cover）+ 路线 + 锚点 + 机位视线 |
| 高空俯拍 | `_shots/Whitebox0518/Top_<区>[_<框>].png` | 实机 110 m 俯拍，fov 自适应分区框 |
| 地形钩子门禁 | `Script_FirstLevelWhiteboxTerrainTest.mjs` | 见 §3；`--digest` 打印 05–18 地面采样 sha256 |

`_shots/` 已被忽略。出图脚本不进 TestRunner（不是门禁）；单跑直接 node，浏览器全局锁只在 TestRunner 里。
worktree 里缺 `three` / `playwright-core` 时（整批 ERR_MODULE_NOT_FOUND）在 worktree 根 `npm install --no-package-lock`。

**总判断**：05–18 的共享地面几乎是平的。`SampleMissionNaturalHeight` 在这一带只有 ±0.19 m 的起伏（东西两道地形墙在 x>116 / x<−190），
各区实测地面：村落 −0.16…0.84 m、接运场 0…1.3 m（河槽与西沟除外）、接收院 −0.1…0.3 m、铁路桥南岸 0…0.7 m（路基）。
唯一的「地形」是壕沟网络（西沟、集结处旁的交通沟、05 攻击支路）与北沙河河槽。
概念图里每一张都有高差（沟、坎、路肩、河岸、台地）；游戏里的遮挡全靠竖直体块，房屋是 12×15 m 的空盒子。差距主要在三件事：
**地形没有起伏**、**房屋尺度与密度不对（大空厅 + 大空场）**、**没有路边碎石/杂物/低矮掩体的颗粒度**。

## 1. 逐阶段差距

每条写「概念图 → 现状 → 建议（坐标范围、尺寸/高差）」。机位编号即 `_shots/Whitebox0518/<id>.png` 与 `tmp/ConceptRefs0518/small/<id>.jpg`。

### 05 战车（区 A · Tank05 框 x15…65, z−175…−100）

机位 05_1（投掷位 throw 43.6,−159.6 → 战车 Block 38,−167.5）、05_2（攻击支路 41.8,−154.8 → 39.4,−144.2）。

- **地形**：概念图玩家站在**与路面齐平**的墙角，路是一条比两侧低 0.3–0.5 m 的车辙土路，右侧是 ~1 m 高的土坎/抛土堆，守军趴在坎后。现状投掷位在攻击支路沟底（地面 −1.16），站姿眼高 +0.44 m 恰好齐 RoadsideRuin 顶，画面下 2/3 是这块 3.4 m 的蓝板，战车只露出车身上半（05_1）；左侧没有墙角。建议：投掷位的「站在路边墙角」感靠墙角体块给，不靠抬地面（投掷位高度被 01–06 的 K8/K9 与 FrontTopologyTest 锁着）；战车路（`FRONT_SORTIE.road`，宽 7）两侧 x 30…50, z −172…−162 做 0.4–0.6 m 的路肩坎（line/raise，feather ≥ 1.2）。
- **掩体**：概念图左侧是 ~2.5 m 砖墙转角 + 墙根碎砖；现状 RoadsideRuin 只有 3.4×0.7 m、顶高约 0.7 m 的蓝块。建议在 (44.8,−160.4) 补一段 2.4 m 高、1.2 m 长的墙角（L 形两块 0.5 m 厚），墙根散 3–5 块 0.3–0.6 m 碎砖堆。不能挡 K8/K9 机位（`Script_FirstLevelSpaceProbe` 关键帧）与 `attackRoute` 最后一段。
- **远景**：概念图战车后面是一排残破一层砖房、门楼、电线杆与枯树。现状 x 20…60, z −175…−165 只有路杆。建议 z −178…−172 沿路北侧摆 2–3 栋 4×6 m、顶高 2.6–3.2 m 的残屋体块（屋顶缺角），不进 01–05 的任何火力线（FrontTopologyTest 的 engagement/sight 段会报）。
- **05_2 支沟**：概念图是约 3 m 宽、两侧 1.5–2 m 草坡的下沉土路，前景一道齐胸石坎，左手能看到道路与残车。现状攻击支路是 1.5 m 深的壕沟样条（沟底 −1.49，宽度来自 `TRENCH_PRESETS`），两壁是抛土色的陡壁、右侧贴着旧院砖墙，看不到路（05_2）。建议只加体块：支路出口 (39.4,−144.2) 前横一道 1.1 m 高、3 m 长的石坎（cover，留 1.3 m 通行口）；**不改沟宽**（壕沟样条归 `Data_FirstLevelMissionTrenches`，底宽 ≥ 3.24）。

### 06 背坡集结处（区 A · Collection06 框 x−62…−15, z−118…−84）

机位 06_1（借火位，蹲姿 1.15 m）、06_2（集结处东南看南行路）。

- **地形**：概念图左侧是 **3 m 高的背坡土壁**（下半段石砌挡土墙），场坪在坡脚、平；右侧场地缓缓抬升到远处高地。现状场坪 pad (−36,−100, 26×18) 平在 0 m，**一条 1.8 m 深的交通沟正好从场坪中间穿过**（x −38…−33, z −114…−86，见 `Map_Front0507_Collection06`），老周靠墙位 zhouWall (−36.4,−95.9) 与借火位 borrowStand (−36.5,−98.5) 都落在沟底，担架却摆在场坪高度（06_1 里担架悬在视线上方）。建议：场坪北缘 z −112…−108、x −50…−24 做一道 2.5–3 m 的背坡（line/raise，北侧 feather 6 m 缓、南侧 feather 1.0 m 陡），替代现在的 `CollectionWestReturn/WestFoot` 两块土色箱；**交通沟与场坪的关系需要先定**（见 §4 待决项 1）。
- **掩体/杂物**：概念图坡脚一排担架、弹药箱、背包；右侧有石块。现状只有人物。建议沿坡脚 z −108 摆 4–6 件 0.4–0.8 m 的箱/石块（solid:false 的 Detail 或小 cover），不进担架 0.625 m 净空（`placement.collection.litters` / `bearers`）。
- **06_2**：概念图左侧背坡石砌挡土墙 ~3 m、右侧院墙 1.8 m + 棚屋，中间 6 m 土路向南。现状 06_2 是一片开阔平地，右侧沟沿。建议南行路起点 (−26,−92)…(−16,−76) 西侧补挡土墙体块（高 2.8、长 12），东侧一段 1.8 m 院墙 + 棚（2 柱 + 顶）。**06 的「背坡挡住前沿四个方向」目前由地形判定**（SpaceTest collectionCover: gun/bunkerKilling/north/bunkerDoor 的 blocker = terrain），改地形后必须复跑。

### 07 南行（区 A · South07 框 x−40…60, z−84…−30；到村北口 z>−30 归区 B）

机位 07_1（south 中段 −16,−64 → −6,−32）、07_2（村北口 36,−22.5 → 64,−12）。

- **地形（最大差距）**：概念图 07_1 是**两侧 1.8 m 土壁、底宽约 2.5–3 m 的交通沟**，担架在沟里走，左上沟沿一栋砖房。现状 `southWalk` 全程走在平地上（地面 0…0.12 m），紧挨着西边另有一条 1.8 m 深的交通沟（x −28…−22, z −76…−22）但路线不在沟里（07_1 里看到右侧沟沿）。两种做法：(a) 沿 `southWalk` 第 2–5 点 (−16,−76)→(−16,−52)→(−6,−32) 下挖一条 **line/cut，halfW 1.7（底宽 3.4 ≥ 3.24），dy 1.6–1.8，两端逐点 dy 0 做进出坡（feather 1.0 墙陡、坡道段逐点插值 ≥ 6 m）**；(b) 把路线并进现有交通沟——改路线，不许（§2）。推荐 (a)。担架队 1.25 m 宽、`southWalk` 长度 110–140 不变；沟两侧抛土 0.3–0.4 m（line/raise，沿沟外侧 halfW 3.2、feather 1.5）。
- **07_2 村北口**：概念图土路比两侧**低 0.3–0.5 m**、两侧路肩、左侧碎石矮墙与草堆、右侧一层砖房山墙 + 门前 2–3 级石阶、远处一排房 + 枯树。现状是开阔平地上的几块直立板（SouthVillageBankWest/East、VillageApproachCover、VillageRoadBlock），房屋是白/蓝箱子。建议 x 20…48, z −26…−18 路面下沉 0.4 m（区 B 的 box/cut，feather 1.5）；北口两侧各一段 0.8–1.2 m 碎石矮墙（每段 6–10 m，拆成 2–3 块错位）；路边 3–5 个碎砖/石堆（0.3–0.6 m）。

### 08 主街阻断（区 B · Village 框 x20…120, z−30…75）

机位 08_1（主街北段 75,1 → 障碍 77.5,20）、08_2（担架停靠 65,−21.5 → 灶屋入口 57,−16）。

- **房屋尺度**：概念图主街 4–5 m 宽，两侧是 1.5 层砖房（檐口 3.5–4 m、山墙、瓦顶），远处二层楼窗口敌火与庙顶。现状主街是 `CourtyardEast/StreetWestWall*`（x=72）与 `StreetEastWall*`（x=82）之间 **9.3 m 宽**的空巷，两侧是 2.6 m 蓝色平墙，街面无檐口。建议：沿街两侧加 0.6–0.8 m 深的檐口/屋面体块（顶高 3.3–3.8），东侧东窗房 (87,3) 做成两层（顶高 5.5–6，带窗洞），**净街宽不变**（障碍人缝 0.9 m 是由障碍两端决定的，不是街宽；但东窗射界「看得见障碍以北的街」要复跑 VillageTest）。
- **障碍**：概念图是倒塌院墙 + 碎砖斜坡（高 1–1.5 m，铺满 3–4 m 纵深）+ 翻倒木车 + 筐。现状是 `StreetBlockFallenWall`（3.85×1.35×2）+ `StreetBlockCart`（4.55×1.6×2.6 的木箱）+ 三块碎块。建议：障碍南北各加 2–3 m 纵深的碎砖斜坡（多块递减高度 0.2–0.9 m 的 plaster 块，或区 B 地形 raise 0.4–0.6 的矮丘，不跨过人缝 x 76.225…77.125）；木车换成「车厢 + 两只轮」三块并倾斜（ry）。
- **地面**：概念图街面有积水车辙、比门前台阶低 0.2 m。建议街面 x 73…81, z −10…45 下沉 0.15–0.2 m（box/cut，feather 0.75）；灶屋入口前一级 0.18 m 石阶用体块（地形分辨不出 0.2 m 台阶）。
- **路边杂物**：概念图墙根一路是碎砖与瓦片、门口有水缸/竹筐/柴捆。现状主街上除障碍外没有任何小件。建议每 4–6 m 一处 0.2–0.5 m 的碎砖堆（多为 solid:false 的 Detail，靠墙根，离路线 ≥ 0.9 m）。
- **08_2 灶屋入口**：概念图是一栋有窗栅的砖房墙面 + 敞开的 1 m 宽木门（门槛、门框、门内黑）。现状 `KitchenEntryJamb/Lintel` 是 4.8 m 宽的门罩（门洞 3.8 m）。**门宽受约束**（§2：`courtyardBypass` 过灶屋，担架 1.25 m + 余量；VillageTest 以 0.625 半径扫），建议门洞收到 2.0–2.4 m、加门槛 0.12 m 与两扇开着的门板（solid:false）。

### 09 灶屋—连屋近战（区 B）

机位 09_1、09_2（灶屋内，`Kitchen` 58,−9，12×15 m）、09_3（连屋东侧 → 侧间机枪 68,13.2）。

- **房间尺度（最大差距）**：概念图灶屋约 4 m 宽、层高 2.6 m、露梁，一侧灶台（0.8 m 高、2 m 长、带锅）、另一侧柴堆，门洞 1 m。现状 `Room("Kitchen")` 是 **12×15 m、净高 ~3 m 的空厅**，南北门 3.8 m，屋里只有两个箱子（09_2），另外地上躺着一排尸体（`MISSION_CIVILIAN_AFTERMATH_HOUSES` 含 Kitchen/ConnectedHouse，平民遗体按屋子摆）。建议：**不改外墙**（`Room()` 生成的 `KitchenWest/East…` 被 CivilianAftermath 按 id 取、被 VillageTest 断言屋顶连续），在屋内加隔墙把 12 m 宽分成 4–5 m 的灶间 + 杂物间（纵向隔墙 x≈55 与 x≈61，各留 ≥ 1.6 m 的门，`village` 路线 x=58 通道保持 ≥ 1.25 m）；灶台 2×0.8×0.8 m 放 (61.5,−12)，柴堆 (54.5,−13)，桌 1.2×0.8×0.8。
- **门口近战**：09_1 概念图门外就是巷子与对面房屋墙（3–4 m 外）。现状门外是 20 m 开阔地。建议灶屋北门外 z −24…−20 补一道对面房屋/院墙（顶高 2.8），与 litterHold 担架等待遮挡（LitterHoldCover 66,−16.5）不冲突。
- **09_3**：概念图从暗屋的破门看对面房子窗口枪手，距离约 8–10 m、中间是小院碎砖。现状连屋与侧间之间视线开阔、墙是整片蓝板。建议侧间 (68,11.8) 的西墙开 1.2×1.0 m 窗洞（sill 0.9）让枪手「在窗里」；**VillageTest 断言「connected-house east doorway leads to a clear shot at the actual courtyard gunner」「side room's real gun controls the inner yard gate」**，改窗后复跑。

### 10 内院（区 B）

机位 10_1（courtCover 67,22.5 → 院门 53,32）、10_2（院门外绕回巷 53.5,38 → 74,39）。

- **院子尺度**：概念图内院约 10–12 m 见方，四面一层房（顶高 3.2–3.8，瓦顶挑檐 0.6 m），院门是带瓦顶的门楼，门前石阶一级。现状内院是 CourtyardWest(x33)…CourtyardEast(x72)、z 16…34 围起来的 **39×18 m 空场**，只有两面房（MachineGunHouse、CourtyardStreetWing）（10_1）。建议：内院北侧 z 16…22、x 36…50 与南侧 z 28…33、x 58…70 补两栋一层厢房体块（深 5–6 m），把可走院子收到约 20×12 m；**担架队横向分流带 z 16.72…18（「litter teams along z=18」）与 x>69 的东侧作业带不能占**（Village 模块注释）。
- **10_2 绕回巷**：概念图是 2.5 m 宽、两侧 2.5–3 m 带压顶院墙的窄巷。现状绕回巷在内院南墙 z=34 与 `RejoinAlleySouth` z=44 之间，**10 m 宽**。建议在 z 36.5…41.5 之间加一道北侧院墙（让巷宽收到 3.4–4 m：担架 1.25 m + 两侧搬运员胶囊 ≈ 2.0 m，再留余量），压顶 0.3 m 挑出；`RejoinAlleySouth` 东端 x 68 以东是内院追兵（CourtyardPursuerB/C）来路，不能封。
- **地形**：概念图院子地面比巷子高一级（门槛石 0.15–0.2 m）。院子整体 level +0.15（box/level，feather 0.75）可以做，但门洞的门槛用体块。

### 11 桥头接运（区 C · Transfer 框 x25…125, z75…150）

机位 11_1（接运场北口 75,88 → 桥头 76,150）、11_2（分流 70,100 → cartBoard 85.6,113）。

- **地形（最大差距）**：概念图接运场是**向河缓降**的土场（远处河面与木桥在下方 3–5 m），左侧一道高 2–3 m 的土坎，坎顶是行军纵队的路。现状 pad (76,113, 57×54) 把整片压平在 0 m，河口在 z 138.8 突然切下去。建议：z 110…138 做一段 1.2–1.8 m 的整体下降（polygon 或 box/level，dy 由 0 线性到 −1.5：用两三块 level 叠出台阶状缓坡，坡度 < 0.15），**cartHalt (76,135) 必须仍在河北岸且 z < 138.8**，牛车盒 2.5×2.9 净空 2.2 沿 cartRide 通过；西侧 x 40…55, z 90…112 做一道 2–2.5 m 土坎（line/raise，东侧 feather 1.0 陡、西侧 feather 4 缓），坎顶 3 m 平台给背景纵队。
- **房屋**：概念图左草房、右砖房挂帆布遮棚，道路两侧 1.5–2.5 m 残砖墙（11_2）。现状西侧只有 `TransferStore*`（一栋）、中间大平场、东侧零星 1.1 m cover。建议车路 x76 两侧 z 88…110 各补 2–3 段 1.5–2.5 m 残砖墙（带缺口，每段 4–6 m），不进 `MISSION_CROWD_AREAS.transfer` 的 entryZ 88 / exitZ 111 横向分流带与 9 个 pocket（TransferTest 逐 pocket 扫）。遮棚 `TransferShelter*` 保留、加一片斜挂帆布（solid:false）。
- **杂物**：概念图满地木箱、担架、车辙水坑。现状零。建议 8–12 件 Detail（箱、筐、车轮），全部 solid:false 或 cover 且离 carry corridor 1.6×3 m ≥ 0.3 m。

### 12 低墙射位与上车（区 C）

机位 12_1（低墙 68,85.4 蹲 1.3 → 村路 72,60）、12_2（车上 80,117 → 76,135）。

- **低墙**：概念图是 1 m 高**乱石砌**矮墙，墙顶不齐、有一处 0.6 m 宽缺口，墙后地面比墙外高 0.2 m。现状 `TransferVillageWallWest` 是 13×1.2×0.8 m 的整块蓝板（12_1 下半屏）。建议拆成 5–6 块 1.8–2.4 m 长、顶高 0.95–1.2 m 错落的石块（semantic cover，每块带 `cover` 朝北），中间留 0.6 m 射击缺口；TransferTest「north wall shields crouched player from A」「standing player can engage A over low wall」要继续过——**顶高 1.05–1.2 的包络不变**。
- **墙外**：概念图墙外是村路小场地 + 车马 + 远处门楼、电线杆一排。现状墙外 z 60…84 是 x76 车路与一片空地。建议 x 60…90, z 62…78 补 2 栋一层房（顶高 3.2）+ 一座门楼（区 B/C 边界 z=75，门楼放 z<75 属区 B），电线杆沿车路东侧每 25 m 一根。
- **12_2 车行**：概念图车路两侧 3 m 高**无顶残砖墙**（带窗洞）。现状车路两侧开阔（12_2）。建议 x 70…72 与 x 81…84、z 115…132 各 1–2 段残墙（顶高 2.4–3.2，带 1.2 m 窗洞 = 两块墙夹一块窗下槛），**牛车盒净空 2.5×2.9、2.2 m 不能碰**，`TransferRoadEast/WestShoulder` 与卸车点 (72.6,135) 周边 1.3 m 担架走廊保留。

### 13 空袭（区 C）

机位 13_1（车上 76.5,126 → 76,146）、13_2（cartHalt 74,134 → 西沟 52,144）。

- **路边高墙**：概念图 13_1 路右侧是 4 m 高、连续 30 m 以上的砖墙（院墙/城墙感），路左是灌木缓坡与碎石路肩。现状车路两侧只有 0.85–1.05 m 的肩块。建议 x 82…84, z 118…136 一段 3.5–4 m 高连续墙（区 C 东侧，别进 `sideAlley` 巷口视线 SpaceTest 四条西向视线），路西 x 64…72 做 0.3–0.5 m 路肩坡（line/raise feather 1.5）+ 碎石 Detail。
- **13_2 沟边石栏**：概念图路沿一道 0.9–1 m 石栏（带立柱），栏外陡降 5–8 m 到有水的沟谷，右侧砖房 + 牛车。现状 cartHalt 西侧是平地，河岸在 z 138.8、西沟在 x 30…55，沟谷感只有河槽一处。建议 (a) cartHalt 西侧 x 60…70, z 128…138 做一段河北岸的「岸坎」：地面 level −1.0…−1.5 逐步降到河口（让「路在坎上、下面是河谷」读出来），路沿 x 70…72 放 0.9 m 石栏（4–6 块 + 立柱）；(b) 西沟北段 x 32…55 的沟壁加陡（沟属于壕沟样条，**改 `Data_FirstLevelMissionTrenches` 需要整张 TrenchPlan 回归，不建议**），改为沿沟东沿 raise 0.5 m 抛土。卸车→进沟的斜向通道（「unloaded stretcher reaches west ditch」「ditch mouth joins real ditch」）不能被石栏截断：石栏在 z 134…138 留 ≥ 2 m 缺口。

### 14 退入西沟（区 C 北段 / 区 D 南段）

机位 14_1（56,146 → 49,150）、14_2（西沟底 37.4,119.5 → 32,134）。

- **沟**：概念图西沟深 1.5–2 m、两壁是松土、沟沿直接是路面，沟上方是房屋和电线杆（14_2）。现状西沟（`WestEvacuation` 壕沟样条）深 ~2 m、形状对，但**沟沿外是空场**（14_1、14_2 地平线上只有远处蓝箱）。建议沿沟北段 x 30…45, z 116…135 的东沿补 2 栋一层房（背墙距沟沿 ≥ 1.5 m，别被 `PlanTrenchDressing` 的护壁 keepOut 清掉）、2 根电线杆。
- **14_1 入沟**：概念图从路面一步下沟（沟沿是路）。现状入沟点离车路 20 m、中间是 pad 平地。建议保留现有沟口 (54,114)→(39,116) 走向，只在沟口两侧加 0.3–0.5 m 的抛土（raise），让入口读成「路沿断口」；`MISSION_TERRAIN` 在 (54,114) 有一个 9 m 的回归自然缓坡（沟口可走坡），区 C 的修饰在这 9 m 内会被压回，**不要**在那里做高差。

### 15 夹道与院门（区 D · Reception15 框 x−50…70, z150…260）

机位 15_1（夹道拐角 16,213 → 院门方向 9,236）、15_2（院门 9,238.5 → −6,240）。

- **夹道**：概念图左侧 1.5 m 带瓦压顶**石院墙**，墙外是低处河谷与远处铁路桥，右侧 3 m 土坯房墙，前方 15 m 门楼。现状 15B 夹道 `wallPath` 在 (16,211)→(16,220) 拐直角后接院门，15_1 里左侧空、右侧一块墙、前方是开阔地（院门被西侧体块挡住看不见）。建议：拐角后 x 12…20, z 214…236 的西侧补一段 1.3–1.5 m 压顶石墙（**夹道净宽 2.5–3.0、北侧院墙 ≥ 2.7、南侧矮墙 1.0–1.3、一处直角左拐、一道 0.22 m 坎是 SpaceTest 15B 口径**，这段是拐角之后的，新墙不要改那几个被测量的构件）；东侧 x 20…24 一栋 3 m 房墙；院门 (2,240) 改成带瓦顶的门楼（顶高 3.6–4，门洞净宽 ≥ 3.2，现 4.0）。
- **地形**：概念图夹道西侧墙外是明显低下去的河谷/坡。现状这里平。建议 x −10…10, z 190…212（夹道北侧、河南岸）做一段向北下降 1–2 m 的岸坡（polygon/level，北端贴河口 z 167.2 的 RiverCut 自己接上），**离沟口缓坡 (52,209.5) 9 m 之外**。
- **15_2 院门**：概念图门前一侧沙袋（1 m 高、3 m 长）、一侧碎石，门前土场。现状院门两侧是整片蓝墙、门前空。建议门外 x 3…8 两侧各一组：沙袋 3×0.8×1.0（cover）、碎砖堆 Detail；**院门 ≥ 3.2 m 净宽与 `reception` 路线 (−13,240) 保持畅通**。

### 16–17 接收院与厢房（区 D）

机位 16_1（厢房南门外 −26,247.5 → 屋内）、16_2（屋内看床）、17_1（屋内 → 门外院子）、17_2（厢房门口 → 院子）。

- **房间尺度**：概念图厢房是 5–6 m 进深、层高 2.8 m 的普通房间，檐廊木柱、屋内 3–4 张床、药架、窗。现状 `ReceptionWard` 是 **12×18 m 大厅**（ward x −32…−20, z 225…243），门洞约 6 m，床是 4 个深色箱子（16_1/16_2）。建议：在不动 `MISSION_RECEPTION_SPACE`（ward/wardEntry/wardExit/wardThreshold/deathView/litterOrigin）的前提下，用内隔墙把大厅分成 2–3 间（南间 x −32…−20, z 236…243 保留作 16–17 的表演间，床边目标距老周 1.96 m / 0.2 m 容差 / 2.4 m 护理范围不变）；南门洞收到 2.4–3.0 m（**门槛 0.12–0.18 m 是 SpaceTest 口径**；担架 1.3 m 走廊 + 两端搬运员）；檐廊柱距 2.5–3 m。
- **院子**：概念图院子四周一层房、院墙 2.5 m、院里成排伤员。现状院子 x −41…1、z 218…252 的院墙齐全但只有两栋房。建议院东北角 (−8…0, 218…226) 补一栋一层房、院子地面 level +0.15。
- **17_1/17_2 门外**：概念图门外 5–8 m 是院墙与对面房，远处残屋；现状门外空到院墙。建议院子南侧 z 250…252 的院墙外补 1–2 栋远景残屋体块（x −40…−10）。

### 18 铁路桥与夜门（区 D · Bridge18 框 x−100…−50, z110…260；Night18 框 x−185…−135, z280…360）

机位 18_1（bridgeCover 南岸射位 −82.5,181 → 铁路桥 −76,152）、18_2（夜门 nightMarch，NightGate 态）。

- **南岸地形**：概念图南岸是高出河面 4 m 的土坎，坎沿一道土垄/草丛（前景胸墙就是土），沿岸有一条向南的小路，路基在右侧抬高。现状南岸平在 0…0.1 m（路基 0.6–0.7 m），河岸在 z 167.2 一步切下 3–4 m；射位掩护是 `BridgeSouthCover*` 与侧翼 1.6 m 土色箱。建议：z 168…176、x −95…−60 沿河口做 0.6–1.0 m 的**岸垄**（line/raise，halfW 1.2，北侧 feather 0.75 陡、南侧 feather 2.5），射位处就是岸垄后的站位；**18 的五条视线全通、胸墙 1.1–1.7 m（蹲姿断线）是 SpaceTest 口径**，岸垄顶高 + 现有胸墙要一起量；爆破安全距离 blastSafe ≥ 40 m 不变。
- **桥**：概念图铁路桥是多跨钢桁架 + 石墩 + 石砌桥台，远端还有一跨。现状单跨 36 m 桥面 + 两片桁架 + 4 块桥台（翼墙）。建议只加非碰撞细节（桁架斜杆 Detail、桥墩 2 根放河中 z 150/156，**不能挡 x −77 中线与桥下视线**），桥梁四态（完好/损毁 × 两桥）不动。
- **18_2 夜门**：概念图 8 m 宽泥街两侧民房、右侧弹药箱堆、城门洞拱顶 + 门楼灯笼。现状夜景体块 15 + Rear 模块 58 件已有门楼/城垛/棚/房；差距在街两侧房屋贴街（现 x −179/−140.5 离街中心 19–20 m）。建议把两侧民房挪到街边 x −168…−152 之外 1 m（**门洞净宽 3.6–4.2（现 3.8）、城墙 8–10 m、只属于 NightGate 态**），沿街摆箱堆 Detail。夜景光照不是白盒范围。

## 2. 不能动的约束

改完一律跑：`Script_FirstLevelWhiteboxTerrainTest`、`Script_FirstLevelWhiteboxVillageTest`、`Script_FirstLevelWhiteboxTransferTest`、
`Script_FirstLevelSpaceTest --rear-only`、`Script_FirstLevelMissionTopologyTest --rear-only`；动了 05 或 06 的地形/体块再加
`Script_FirstLevelFrontTopologyTest`（01–06 空间与 K1–K11 关键帧）；空间有变的包最后跑 `Script_FirstLevelMissionTopologyBrowserTest`（真实 Rapier 双向路线、桥梁四态、夜景）。

| 约束 | 数值 / 口径 | 出处（门禁） |
| --- | --- | --- |
| 锚点、路线键与坐标 | `MISSION_ANCHORS`（51 个）、`MISSION_ROUTES`（24 条）、`MISSION_PLACEMENT` 全部冻结；地形只能让它们「站得住」，不能挪它们 | 分包契约 §3；SpaceTest 锚点不埋（0.34）、11 条契约路线过 0.35 m 胶囊 |
| 担架走廊 | `southWalk`/`village`/`courtyardBypass` 以 0.625 m 半径（1.25 m 宽）扫体块；13–15 卸车点与撤离线按 0.1 m 抽样查 1.3 m 担架走廊 + 两端搬运员胶囊 | VillageTest；TransferTest（1.6×3 m carry corridor）；[06–18 白盒](Data_FirstLevelWhitebox20260924.md) |
| 07 行军 | `southWalk` 110–140 m（现 135.4）；走 45–75 s | SpaceTest 07 |
| 08 街道窄口 | 人缝 0.72–1.0 m（现 0.90）；障碍横跨整街；东窗看得见障碍以北的街；x 76.225…77.125 不许放任何东西 | SpaceTest 08；VillageTest「street man-gap remains 0.9 m」 |
| 09–10 门与屋顶 | 灶屋/连屋门洞现 3.8 m（`village` 路线 x=58 贯穿）；房间单层整顶（`<id>Soffit`）；院门 5 m 开口与 `MissionCourtyardGate` 由 Layout 持有；院门头净空 ≥ 2.4 m | VillageTest |
| 09–10 火力 | 东窗 `RearWindow`、侧间 `VillageGunner`（sideRoomGunner 68,13.2）的射界与侧击线 | VillageTest 7 条 sight |
| 平民遗体 | `MISSION_CIVILIAN_AFTERMATH_HOUSES` 列的屋子（Kitchen、ConnectedHouse、MachineGunHouse、RearCourtyardHouse、ReceptionStreetRoom…）必须保有 `<id>West` 与 `<id>East(Front)` 两块；遗体要求 ±0.09 m 平地 | `Data_FirstLevelMissionCivilianAftermath` 构建时抛错 |
| 11–12 接运 | 4 个 cart bay、9 个人群 pocket、`transfer` entryZ 88 / exitZ 111 分流带、低墙蹲姿挡 A/站姿打 A、B 盯车、侧巷口射界；车路上方开天（open sky above cart lane） | TransferTest |
| 牛车 | 车盒 2.5×2.9、净高 2.2 沿 `cartRide`；`cartHalt.z < 138.8` | SpaceTest 12 |
| 侧巷 | 净宽 5–9 m（现 7.3）、两侧墙 ≥ 2.4、巷口西向四条视线；`SideAlleyNorthWall` 西端让开追兵线 | SpaceTest 侧巷 |
| 北沙河 | 河宽 24–34（现 28.4），除浅滩与两桥外处处过不去；撤离线过河坡度 < tan52（现 0.53）；地形修饰在 RiverCut 之前，河岸以内改不了 | SpaceTest 北沙河；§3 |
| 西沟浅滩 | `WestDitchFord` x=47 半宽 8、深 1.05、坡 0.225 | Topology `MISSION_NORTH_RIVER.fords` |
| 壕沟 | 交通壕底宽下限 3.24（`SquadMarchAi.CanPause`），交通壕取 3.4；全高沟深 ≥ 1.83；壕沟走 `Data_FirstLevelMissionTrenches` 样条，改它要跑 `Script_TrenchPlanTest` | [壕沟样条](Data_TrenchSpline.md) |
| 回归自然缓坡 | (−62,64)、(54,114)、(52,209.5)、接收院入口 (−13,240) 四处 9 m 内压回自然地面（沟口/院口可走坡） | `SampleMissionTerrain` 末段 |
| 15B 夹道 | 净宽 2.5–3.0（现 2.80）、北侧院墙 ≥ 2.7、南侧矮墙 1.0–1.3、一处直角左拐、一道坎 0.22 m | SpaceTest 15B |
| 15C–17 | 院门净宽 ≥ 3.2（现 4.0）；厢房门槛 0.12–0.18 且 < stepMax；`MISSION_RECEPTION_SPACE` 全部点位；床边 1.96 m / 0.2 m 容差；16–17 屋顶盖住工作面（wardCoveredSamples） | SpaceTest 15C/16；EndTest |
| 18 桥 | 桥梁四态（`TemporaryBridge`/`MissionBridgeWreck`、`RailBridge*` 完好 5 件/残骸 3 件）；桥台 4 件是翼墙、让开 x=−77；五条视线全通；胸墙 1.1–1.7；blastSafe ≥ 40（现 49.2） | SpaceTest 18；TopologyBrowserTest |
| 夜门 | 只属于 `NightGate` 态，不进 `blocks`/`gates`；城墙 8–10、门洞 3.6–4.2（现 3.8） | SpaceTest 夜景 |
| 边界 | `MISSION_BOUNDS` minX −205 / maxX 137 / minZ −232 / maxZ 370；新件与锚点都在里面 | SpaceTest bounds |
| 版本戳 | `MISSION_WHITEBOX_VERSION`（现 `first-level-20260924-whitebox-06-18-r1`）被 `MissionTopologyTest --rear-only` 硬断言；升版要同步那一行 | MissionTopologyTest |
| **07+ 指纹** | `Data_FirstLevelSpaceSouthFingerprint.json` 冻结 z > −95 的 blocks / 壕沟布设 / 遗体 / **地面采样**（基线 b3ba06096）。05–18 的任何改动都会让 SpaceTest「07+ structure retained」变红——这是预期的；**只在集成时由集成者按文件 note 的办法重生一次**，各分区包不要各自改它 | SpaceTest（`Script_FirstLevelSpaceProbe.SouthFingerprint`） |
| 浏览器模块 | 改任何 `Data_`/`Script_` 浏览器模块抬 `index.html` 的 `?v=`；新模块登记 import map | ModuleGraphTest |
| AI 掩体 | 地形土坎不会自动成为 AI 掩体；要让 AI 用，加带 `cover:{faceX,faceZ}` 的体块 | Layout `cover` 约定 |

## 3. 地形接口（已实装，表为空，行为逐位不变）

**文件**：`Data_FirstLevelWhiteboxTerrain.mjs`（合成 + 采样钩子）+ 四张分区表
`Data_FirstLevelWhiteboxTerrainFront.mjs` / `…Village.mjs` / `…Transfer.mjs` / `…Rear.mjs`（纯数据、无 import、无 three）。

**接入点**：`MISSION_TERRAIN.whiteboxTerrain = WHITEBOX_TERRAIN`；`SampleMissionTerrain` 在路面/场坪/壕沟/steps 之后、北沙河 `RiverCutAt` 与四处回归缓坡之前调
`spec.whiteboxTerrain.Apply(x, z, height, natural)`。渲染地块（`Data_FirstLevelP012Terrain` 逐格烘）、Rapier 高度场、贴地、弹道、Layout 与各白盒包的
`groundAt` 接地全部读这一个函数，所以土坎一抬，坎上的墙、坎下的人一起走。

**数据形状**（每区 `shapes` 数组的一项）：

```js
{ id: "SouthWalkCut", kind: "line", op: "cut", halfW: 1.7, feather: 1.0, dy: 1.7,
  points: [{ x: -16, z: -76, dy: 0 }, { x: -16, z: -70 }, { x: -16, z: -52 }, { x: -6, z: -32, dy: 0 }],
  note: "07 交通沟：底宽 3.4，两端 0 → 1.7 的进出坡" }
```

| 字段 | 含义 |
| --- | --- |
| `kind` | `disc {x,z,radius}` · `box {x,z,w,d,ry?}` · `polygon {points}` · `line {points,halfW}`（折线胶囊，点可带自己的 `dy` 沿段线性插值） |
| `op` | `level`：拉向 natural + dy（dy 可负）；`raise`：抬 dy；`cut`：挖 dy |
| `dy` | 米；raise/cut 用正数 |
| `feather` | 羽化带宽（米，≥ 0.75 = 一格），核心区权重 1，向外 smoothstep 落到 0；最大坡度 = 1.5·dy/feather，人要走的坡取 feather > 1.17·dy |

**叠加**：先按表序做 level，再 `height += max(raise) − max(cut)`——同一 op 重叠取最大、不相加，一条沟分几段写接头不会挖双倍。
每个形状按本区 `boxes` 硬裁剪，出框不生效；表空时 `Apply` 原样返回传入的 number。

**验证**：
- `node Taierzhuang1938/Script_FirstLevelWhiteboxTerrainTest.mjs`：分区框互不重叠；形状字段合法且连羽化完全落在本区框内；任何形状影响框之外的地面与「去掉钩子」逐位相同；表空时 05–18 整片逐位相同；河槽不受影响；自造表验证 level/raise/cut 叠加、逐点 dy、框裁剪；05–07 体块包不挡任何冻结路线。
- `--digest` 打印 05–18 分区框内 1 m 网格的地面 sha256。本次实装前后：0.5 m 网格 240526 个采样逐位相同（钩子接入前后 sha256 均为 `13189e2c…`），`MISSION_LAYOUT.blocks`/gates/scenario/壕沟布设 JSON 摘要在拆出 Front 包前后相同。
- 改完地形必看 `Map_<区>.png` 的挖/填等值线，再跑 §2 的门禁；07+ 指纹变红按 §2 最后一行处理。

**已知限制**：纹理层（路面/抛土/麦茬，`SampleMissionGroundSurface`）不读 shapes，下沉路的路面仍按 `MISSION_TERRAIN.roads` 着色
（2026-09-28 起各区表另有 `paths`：只染路面纹理、不改高度，见 [场景引导](Data_FirstLevelGuidance20260928.md) §3.1）；
高度场格距 0.75 m，窄于 ~1.5 m 的台阶/门槛/路沿用体块；壕沟抛土 `bermMask` 只认 roads/pads，不认修饰。

## 4. 分区与并行方案

四个区各改自己的**体块包 + 地形表 + 机位**，不碰别区文件。框是地形修饰的硬边界（测试断言、采样器裁剪）；体块不受框裁剪，但请只摆在本区框内。

| 区 | 阶段 | 地形框（世界坐标） | 体块包 | 地形表 | 相关门禁 |
| --- | --- | --- | --- | --- | --- |
| A Front0507 | 05–07 | Tank05 x15…65 z−175…−100；Collection06 x−62…−15 z−118…−84；South07 x−40…60 z−84…−30 | `Data_FirstLevelWhiteboxFront.mjs`（本次从 Village 拆出 06/07 四块，合并顺序不变） | `Data_FirstLevelWhiteboxTerrainFront.mjs` | FrontTopologyTest、SpaceTest --rear-only（06 背坡、07 长度）、TerrainTest |
| B Village0810 | 08–10（含 07 末段村北口） | Village x20…120 z−30…75 | `Data_FirstLevelWhiteboxVillage.mjs` | `…TerrainVillage.mjs` | VillageTest、SpaceTest 08 |
| C Transfer1114 | 11–14（含西沟北段） | Transfer x25…125 z75…150 | `Data_FirstLevelWhiteboxTransfer.mjs` | `…TerrainTransfer.mjs` | TransferTest、SpaceTest 12/侧巷/北沙河 |
| D Rear1518 | 15–18 | Reception15 x−41…70 z150…260；Bridge18 x−100…−41 z110…260（2026-09-28 引导轮把分界从 x=−50 挪到院西墙外皮 −41：去桥的小路不能跨框）；Night18 x−185…−135 z280…360 | `Data_FirstLevelWhiteboxRear.mjs` | `…TerrainRear.mjs` | SpaceTest 15B/15C/18/夜景、MissionTopologyTest --rear-only、EndTest |

**衔接点**（两区都要对得上的地方，边界两侧各留 2 m 不做高差，或双方约定同一高度）：

1. A↔B `z = −30`，x 20…60：`southWalk` 末段 (30,−23)→(48,−20) 从 A 的 07 交通沟出沟进村北口。A 的沟在 z ≥ −34 前回到 0 m；B 的村北口路面下沉从 z ≥ −28 开始。
2. B↔C `z = 75`，x 70…82：x76 车路（`village` 路线 (78,60)→(76,85)）。两边在 z 72…78 都保持路面 0 m；12_1 墙外的门楼若要放，放 B 侧 z < 73。
3. C↔D `z = 150`：北沙河河槽（z 138.8…167.2）横跨边界，由 Topology 独占，谁都不改；西沟 `evacuation` 在 (50,150)→(56,165) 过浅滩。C 管 z < 150 的沟沿（含 15A 收拢点 `retreatA` (32,134)），D 管 z > 150 的沟沿、`retreatB` (56,184) 与沟口缓坡 (52,209.5)。
4. C↔D（桥）：Bridge18 框的 z 110…150 段在 x −100…−50，与 C 框（x ≥ 25）不相邻；18 回援尾队从 (−77,120) 进来，北岸敌位 `bridge.enemyRidge` 在 z≈131 属 D。
5. 共享文件（**只由集成者改**）：`Data_FirstLevelMissionLayout.mjs`（已有体块的删改用各包的 `replaceBlockIds`，不直接改 Layout）、`Data_FirstLevelMissionTerrain.mjs`、`index.html` 的 `?v=`（各包只抬自己模块那一行，合并冲突取较大值）、`Data_FirstLevelSpaceSouthFingerprint.json`、`MISSION_WHITEBOX_VERSION` 与 MissionTopologyTest 那一行、`Data_FirstLevelWhitebox0518Cameras.mjs`（各区只改自己阶段的条目）。

**待决项**（开工前请拍板，或由对应区代理在不违反 §2 的前提下自定并写进交付说明）：

1. 06 集结处：交通沟穿过场坪，老周/借火位在沟底、担架在场坪。按概念图应是「场坪 + 背坡土壁」，要么把借火一组挪到沟沿（改 `MISSION_PLACEMENT.collection`，属契约键，需要确认），要么用 level 把场坪一侧填到沟底高度（会改变 06 背坡遮挡与交通沟的连续性）。
2. 07 交通沟：推荐沿 `southWalk` 下挖（§1 07），但它会让「07+ 指纹」与遗体摆放一起变；也可以只做两侧 1.2 m 土垄（raise）得到「沟感」而不下挖。
3. 09/16 大空厅：用内隔墙收小（推荐）还是改 `Room()` 尺寸（牵动 CivilianAftermath、VillageTest 的屋顶断言与 `kitchenInterior`/`roomInterior`/`wardInterior` 摆点）。

**拍板结果**（集成者 2026-09-27，按概念图取向）：1 → 场坪整体压到交通沟沟底高度，做成「背坡洼地」，契约点位不动；2 → 沿 `southWalk` 真实下挖（方案 a）；3 → 内隔墙收小，`Room()` 外墙不动。

## 5. 实装结果（2026-09-27 集成，`MISSION_WHITEBOX_VERSION = first-level-20260927-whitebox-05-18-r2`）

四区并行在各自 worktree 完成、按 A → D → B → C 合入，再 rebase 到 master。每区做过至少两轮「出图 → 对比概念图 → 再改」。

| 区 | 地形（`Data_FirstLevelWhiteboxTerrain<Region>`） | 房屋 / 掩体 / 杂物（`Data_FirstLevelWhitebox<Region>`） |
| --- | --- | --- |
| A 05–07 | 06 `CollectionHollow` 洼地底 ≈ −1.7（与沟底齐平），北/西/东三面垫高 1.2 m 成约 3 m 背坡，东南 9.4 m 出坡（坡度 ≤ 0.21）；07 `SouthWalkCut` 沿 `southWalk` 挖 1.7 m、底宽 3.4 的交通沟，两端 6.5 / 7.7 m 进出坡，z ≥ −34 回到 0 | 06 三面石砌挡土墙、坡脚弹药箱与背包、06B 右手 1.8 m 院墙 + 棚；07 沟东沿砖房、沟底碎石；05 战车后两栋残屋、南路边残屋与翻倒大车、投掷坑东侧 3 m 墙角（05 路面/路肩未动：K8/K9 与弹坑约束） |
| B 07_2–10 | 村北口下沉 0.4 m 土路 + 路北土埂；08 主街车辙下沉 0.18–0.2 m（障碍 z 17…23 不动） | 主街两侧贴街 1.5 层房（北段街宽约 6.2 m、障碍以南约 5.25 m），东窗房两层；倒墙碎砖坡、带轮木车、筐缸；灶屋南北门收到约 2 m + 门槛，内隔墙分三间（灶台带锅、柴堆、炕、露梁），北门外对面房形成窄巷；侧间窗洞；内院西厢/南棚/门楼、绕回巷 3.8 m；全框约 20 栋坡顶房、院墙、柴垛、电线杆、枯树；村南门楼 (76,70.5)。Layout 蓝色 cover 房墙按原尺寸换成灰泥色（`RESKIN`） |
| C 11–14 | 西侧土台 +2.2 m 陡坎、车路两侧浅洼（路读成路堤）、东侧河堤高坎 +3.6 m、西沟沟口抛土 0.45 m | 车路 x 71 / x 80 两侧带缺口残砖墙（1.6–2.5 m）；砖房 + 三幅帆布棚、草房、沟沿窄房与河口小房、电线杆；低墙拆成 8 块错落乱石（0.6 m 射击缺口，包络 ≤ 1.2）；桥头砖墩、河口石栏、带窗残墙 |
| D 15–18 | 15 夹道东侧下沉菜园 −1.0、接收院北面向河谷坡 −1.4（z 167.5 前收住）；16–17 院地 +0.15；18 南岸两段 0.75–0.85 m 岸垄（x −80…−69 断开留铁路与尾队） | 15 左拐后 1.35 m 瓦压顶石墙、右侧土房、带瓦顶门楼（门洞 4.0）、沙袋与碎砖；16 厢房 z 238 内隔墙（洞口 5.3 m）分南间/北间，南门 2.8 m，床、药架、窗棂、檐廊；院子西北厢、东南耳房、柴棚；18 河中石墩（不碰撞）、夜门两侧贴街民房与弹药箱堆 |

**跨区与共享改动**

- **13 空袭疏散 / 15A 撤退走固定通道**（为了能在车路两侧立墙）：`Data_Tuning_FirstLevelMid.MID_TUNING.transferEvac`（墙段、缺口、12 个遮挡点、三条撤退通道，终点都是下沟口 (54,114)）+ 纯函数 `MidTransferScatterPlan` / `MidTransferRetreatJoin`；`Script_FirstLevelMissionColumn`（`ScatterFromRoad` / `StartRetreat` / `UpdateHold` 的 `holdRoute`）与 `Script_FirstLevelTransferCart` 只做薄调用。事实名与通过条件不变。`Script_FirstLevelMidTest` 新增通道 / 遮挡点担架走廊扫测与「场上任意可站位都能接上通道」；原「疏散离路中线 ≥ 8.3 m」改为「停到自己的遮挡点、≥ 6.5 m（墙外侧）」——两道墙夹 9 m 路后 8.3 m 无法满足。
- **地上的担架一律用担架模型**：各区原先用方块拼的备用担架（06）、落地担架（11）、院里躺着的伤员（15–17）改为 `MISSION_PLACEMENT.groundStretchers`，由 `Script_FirstLevelMissionView.BuildGroundStretchers` 实例化绘制，`patient: true` 的上面躺烘焙伤员（`MissionPeople.Patient`）。接收院空担架摞随西北厢房挪到 (−38.5, 233)。
- 地形表的 `note` 说明只留在分区源表，`CompileWhiteboxTerrain` 编译时剥掉（编译结果挂在任务数据里，字体子集取字会扫到）。
- 07+ 结构指纹按本轮重生（`Data_FirstLevelSpaceSouthFingerprint.json`，壕沟布设 2 件、遗体 191 具与旧基线相同，体块 817 → 2512、地面采样变化为本轮授权改动）。

**仍有的差距**（受玩法约束，未做）

- 05_1：投掷位在攻击支路坑底，画面下半仍是 `RoadsideRuin`；投掷位与 K8/K9 关键帧被 01–06 门禁锁定。05_2 看不到路和残车（机位在沟底，路在东边约 20 m）。
- 08 障碍处街宽仍 9.3 m（倒墙与木车须顶到两道临街墙）；08_2 与概念图左右镜像；10 内院只能收到约 34.7×18 m（7 个担架停位横跨 x 39…68.5）。
- 11 路两侧 8–15 m 内做不了房屋（西侧是人群 pocket 通道，东侧 z < 104 以南是车辆作业区），只能是带缺口的残墙；接运场整体「向河缓降」做不到（河槽内地面冻结），只做两侧浅洼。
- 18 铁路桥仍是实心桁架板（桁架随炸桥消失，斜杆加在白盒包里会在炸桥后悬空）。
- 07 新沟沟底用的是田地贴图（地表层不读地形修饰，§3 已知限制）；体块只能绕竖轴转，翻倒木车、枯树、屋顶偏方正。

## 6. 2026-09-28 材质（3A 画面迭代 B1 建筑材质）

白盒体块原来是按语义的平色 `MeshStandardMaterial`（没贴图、不走材质库、没有 AO/GI/细节补丁，cover 画成调试蓝灰）。本轮只改「看起来」：坐标、尺寸、碰撞、cover 语义、体块数一个不动。

- **语义 → 外观**：`Data_FirstLevelWhiteboxMaterials.mjs`（纯数据）。先按体块 id 规则（`WHITEBOX_LOOK_RULES`：门洞门板、桥墩条石、墙裙青砖碱脚、灶台泥抹、土工事、病房白灰、北门城砖……），再按语义缺省（`WHITEBOX_SEMANTIC_LOOKS`；plaster / cover 墙身按「建筑组」哈希在泥抹面 / 青砖 / 白灰三种里挑，同一栋房子各面同一种），外观参数（套名、每张铺几米、tint、UV 方向、风化强度、明度抖动）在 `WHITEBOX_LOOKS`。布局写 `materialLooks: true` 才启用；归档夹具与 Node 测试仍是平色。
- **运行时**：`Script_FirstLevelWhiteboxLooks.mjs`。`PrepareAssets` 开头 `LoadLevelSets("FirstLevel")`（阶段 A 的按需集；失败的套借 fallback 并换 `fallbackTint`），外观材质走 `MaterialLibrary.Get` 再克隆、挂风化补丁；体块按外观合批（一外观一只网格，名字仍是 `FirstLevelWhitebox_StaticWhiteBoxes`，前沿可破坏块照旧能塌顶点）；瓦垄转成顺坡、木纹顺长边；gate（桥面、桁架、院门）、北门夜景 scenario 与前沿可破坏块（`WhiteboxPiece`）用同一套外观；掩蔽部两态归开场布景（B5 的 `OpeningTimber` / 土坯，`ScenarioMaterial`），不接外观表。铁路样条的道砟 / 枕木 / 钢轨按语义键换成道砟、风化木、旧钢外观。
- **风化补丁**：`Script_MaterialPatches.MakeWhiteboxWeatherPatch`（挂在表面补丁那格，零新增采样器）：墙根返潮与溅泥（按顶点处地面高）、块顶往下的雨痕、棱角磨损提亮 + 倒角法线、大尺度色斑、朝下面压暗。数值在 `Data_Tuning_Materials.WHITEBOX_WEATHERING`，每个外观再乘自己的 `weather`。
- **铁路桥桁架**：`steelTruss` 外观，运行时画一节华伦桁架（alphaTest 镂空、双面），不下载贴图；炸桥逻辑与碰撞不变（上面「18 铁路桥仍是实心桁架板」这条差距就此收掉）。
- **北沙河**：52 块示意水盒收成一条连续水带（相邻段接缝取两段的平均高），走 `Script_Water` 新预设 `muddyRiver`（浑、吸收快、泡沫少）。水盒本来就 `solid:false`，碰撞与净空不变。
- **语义修正**：门窗 `Void` 盒改 `void`、墙头压顶改 `coping`（原来都借 `roof`）。只改助手里的语义参数；07+ 指纹因语义字段变了按口径重生，把 void/coping 映回 roof 逐位得到旧基线 `8e5277e874f90e43`（见指纹 JSON 的 note）。
- **新贴图**（Lovart 源图 → `_import/Script_BakePbrTexture.py` → `Data_TextureManifest` + `Data_LevelTextureSets.FirstLevel`）：`VillageMudPlaster`、`VillageLimePlaster`、`VillageRoofTile`、`VillageTimber`、`RailBallast`；其余外观复用开机就有的 BrickWall / BrickWallSooty / CityWallBrickPbr / Stone / Ground / ShopDoorPbr / Sandbag / WattleFence / WaterVatCeramic / CarriageCeilingSteel / GatePaintedWood。
- **门禁**：`Script_TextureStandardsTest`、`Script_ModuleGraphTest`、`Script_FirstLevelSpaceTest`（07+ 指纹）、`Script_SamplerBudgetTest`（浏览器，含 `?whitebox=p012`）；对照出图 `Script_FirstLevelWhitebox0518Shots.mjs --quality=high --out=_shots/Gap3A_After/B1`。
- **第二轮（同日）**：
  - 抹面剥落：风化补丁升到 `wbWeather2`，外观可带 `peel`（`flatten` 把墙中部贴图自带的剥落斑往均色收、`amount` 程序剥落强度、`substrate` 露出土坯或青砖）。剥落只长在墙根（带宽随墙高收窄）/ 竖棱（门洞边就是墙段的竖棱）/ 块顶一带，边缘噪声不规则、带一圈抹面厚度的暗边；白灰墙中部不再是迷彩圆斑。均色取同一采样器的末级 mip，零新增采样器。
  - 坡顶外壳：`PlanRoofShells` 认出每个台阶屋顶（RidgeCap + Eave/Slope/Ridge 或 Roof0..3），在上面盖两片沿坡的薄瓦面 + 一道脊（坡度取盖住所有台阶外角的最陡值），只是外观几何，碰撞 / 遮挡仍是原来的盒子，台阶留作山墙那头的填充。陡过 40° 的窄顶（门楼、窄厢房）保留台阶。
  - 06 补给点（`Script_FirstLevelMissionView.BuildSupplies`）从米白平色盒换成旧弹药箱材质（开场布景的 `OpeningCrate`，退回 `WoodCrate`），可交互的呼吸发光不变。
  - 青砖整体提亮（`brightness`），门窗楣 / 窗台 / 外皮与所在墙同组同外观；桥头墩改条石，13 河岸残段改夯土。
- **仍差**：屋顶外壳是平直坡面（没有瓦当、屋脊起翘）；墙面没有真的破口 / 缺角几何；灶屋等室内偏暗偏平（室内光归 B4）；地面与路面（归 B2）仍是亮米色，和墙根返潮接不上色。

## 7. 2026-09-30 D 包：15–17 桥南接收院与 18 夜入北门再对照概念图

12–18 场景白盒第二轮（概念图在 Notion「第一关｜游戏概念参考图」12–18，主镜头 A / 补充 B / 备选 C / 备选 D 四张，机位表 `Data_FirstLevelWhitebox0518Cameras` 已补齐）。D 包只管桥南接收院（15–17）与夜门（18_2 / 18_4）；河、铁路桥、南岸射位、爆破安全区、对岸不动。体块全在 `Data_FirstLevelWhiteboxRear` 自己的分节里，地面只加了一条夜路的染色（`NightRoadTread`，不改高度）。对照出图 `Script_FirstLevelWhitebox0518Shots --quality=whitebox|high`，每轮 `[概念 | whitebox | high]` 三联图，两轮定稿。

### 7.1 逐机位

| 机位 | 改了什么 |
| --- | --- |
| 15_1 / 15_4 | 夹道右手的花园墙 `RearLaneWestGardenWall` 从 1.15 m 石矮墙改成 2.5 m 土墙（瓦压顶、两个窗洞），拐角土房墙 `WallPathTurnWest` 的巷面也开两个窗洞，右手一路是带窗的土墙直到院门；左手石墙与拐弯段 1.35 / 1.3 → 1.5 m（瓦压顶）；院门门楼柱 3.25 → 3.65 m、横梁加到 0.85 m、瓦顶加长（顶高约 4.3 m），从夹道尽头读成带瓦顶的门楼。15_1 机位从 (15.9,219) 挪到 (14.9,222.4)：原位离右手 3 m 土房墙只有 2.6 m，整面灰墙贴脸 |
| 15_2 | 门前一侧沙袋、一侧碎砖沿用；北侧墙根加碎砖堆（5 件、≤ 0.5 m、非碰撞） |
| 15_3 | 机位改到河南 z > 150 的西沟段（C 包管 z < 150）：沟底 (56.3,199) 朝北。沟沿两侧补残屋：东沿一层残屋（门洞朝沟）、西沿 4.2 m 高的砖房墙带两道折墙与两个窗洞，沟沿散土；沟底靠边放三副带伤员的地上担架（`RearDitchWounded0–2`，离 x = 56 撤离线 ≥ 1.4 m）。壕沟样条与沟形没动 |
| 16_1 / 16_3 | 厢房南门：门框加粗（两根 0.24 m 木柱 + 门头木梁，都在墙自己的 x 范围内，2.8 m 洞口不变）、两扇门板外开贴着檐廊、门槛上加一块木门槛板（视觉，碰撞仍是 Layout 的 `WardThreshold` 0.15 m）、门前两级低石阶与石条檐廊地面 |
| 16_2 / 16_4 | 屋顶露梁：吊梁 4 → 8 根（0.36 m 厚，底 2.54 m）、五条檩沿 z 挂在梁下（底 2.38 m）、七盏油灯挂在梁檩交点；西墙北段加两扇纸窗、南墙门两侧各一扇纸窗、南间西窗补窗棂横档与纸板；床铺草（小束散铺，非碰撞）；南间西角药桌加药瓶与凳、西南角弹药箱摞；北间地上再加三副带伤员的担架（`ReceptionWardFloorWounded0–2`，避开六个运行时担架位） |
| 17_1–17_3 | 同上（梁、灯、纸窗、门框门槛、药桌、箱摞）；17_3 从门口往下看到石阶与木门槛板 |
| 17_4 | 门外回看：檐廊石阶、外开门板、门框，南墙两扇窗 |
| 18_2 | 城门洞与瓮城门改**阶梯拱顶**（半圆逐层收口，6 层，拱冠接 Layout 门楣底：瓮城 3.0 + 2.0 = 5.0、城门 3.7 + 1.9 = 5.6，3 m 以下洞口不变）；城楼改两层重檐（顶 18.75 m）；瓮城门两侧、城门面、门洞里各挂灯笼，街边每扇门旁一盏；东侧手推车与盖布箱堆 |
| 18_4 | 街边民房去掉最南两间（W0 / E0），只留城门近处，出生点以南是开阔泥地（新增夜路染色 `NightRoadTread`）；城墙向两侧延长（x −205…−195、−128…−104，各 9 m，仍在 `MISSION_BOUNDS` 内）；机位从 (−166,284) 退到 (−163.5,268)，城墙与城楼露全 |

### 7.2 约束变更

| 条 | 原值 → 新值 | 为什么 |
| --- | --- | --- |
| 15 左手石墙（拐角之后，D 包自己的 `RearLaneStoneWall` / `Bend`） | 1.35 / 1.3 m → 1.5 m | 概念 15_1「约 1.5 m 带瓦压顶石墙」；被量的 15B 南侧矮墙 `WallPathLowWall` 1.1 m 没动 |
| 15 右手花园墙 `RearLaneWestGardenWall` | 1.15 m 石 → 2.5 m 土墙（位置、厚度、端点不变） | 概念 15_1 / 15_4 右手一路土墙；位置不动，所以 x = 6 的走线、院前排队线、跑者线的净空不变 |
| 院门门楼 | 柱 3.25 → 3.65 m、瓦顶 eave 3.23 → 3.63 m、横梁 0.42 → 0.85 m | 概念 15_1 里 15 m 外能读出带瓦门楼；门洞净宽 4.0、Layout 门楣 2.35–2.8 没动 |
| 16–17 厢房吊梁 | 4 根 0.22 m → 8 根 0.36 m（底 2.54 m）；新增五条檩、七盏灯（底 ≥ 1.9 m） | 概念 16_4 露梁；`RECEPTION_WALK_BLOCKS` 只收 h > 0.55、且忽略底高 > 脚下 + 1.8 的件，走线不受影响；SpaceTest 16–17「屋顶盖住工作面」与两人抬走线（顶 1.9 m）照过 |
| 16–17 南墙 / 西墙 | 各加窗洞（窗台 0.95、窗顶 2.3 m）：南墙 x −30.7、−21.6 各 1.6 m；西墙北段 z 228.8、233.8 各 1.6 m | 概念 16_4 / 17_3 纸窗；南门 2.8 m、`wardThreshold`、床边 1.96 m / 0.2 m 容差不动 |
| 夜门拱 | 原 4 块小 haunch（3.8 m 以上）→ 两个拱各 6 层阶梯块 | 概念 18_2 拱顶；只在 3 m 以上，门洞 4.0 / 3.8、城墙 9 m 不变 |
| 夜街民房 | 街边前排 6 栋 → 4 栋（去 W0 / E0） | 概念 18_4 是开阔泥地；18_2 机位 z 300 到城门的街景仍是两侧贴街民房 |
| 夜景城墙 | 长度 x −195…−128 → −205…−104 | 概念 18_4 长墙；高度 9 m、门洞 3.8 不变 |
| 15_1 / 15_3 / 18_4 机位 | 见 7.1 | 各自原因见表 |

### 7.3 门禁

`Script_FirstLevelSpaceTest --rear-only`（07+ 指纹是预期红：本包再一次改了 07+ 的体块与地面采样）、`Script_FirstLevelMissionTopologyTest --rear-only`、`Script_FirstLevelEndTest`、`Script_FirstLevelWhiteboxTerrainTest`、`Script_FirstLevelMissionTest`。`Script_FirstLevelEndTest` 的 ZhouDeath 15.62 s > `deathSeconds` 14（配音重录后的时长断言）在基线上就红，与几何无关。

### 7.4 仍差

- 概念图里的人物（医护、军医、坐门槛的幺娃、岗哨）是运行时；白盒只给站位与空间。
- 伤员只有「躺在担架上」一种，概念 15_3 靠沟壁坐靠的伤员没有对应的静态资产。
- 屋里没有油烟 / 逆光（光照与体积雾不归白盒）；纸窗是灰板 + 窗棂，没有透光。
- 15_1 概念图左手墙外的河谷与远处铁路桥：地形上没有做（左手墙外是 D 包既有的下沉菜园与房屋，远处是平地），受 RearCourtyardHouse 平地约束（遗体要求 ±0.09 m）与 15B 走线限制。
- 夜门光照（火把、月光）不是白盒范围；18_4 概念里的火把只有门洞灯笼与既有火盆。
