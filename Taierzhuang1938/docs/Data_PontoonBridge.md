# 北沙河浮桥：模型、河与岸、18「奉令毁桥」（2026-09-30 R3，2026-10-01 第二轮）

用户 2026-09-30 拍板：**浮桥取代铁路桥** —— 回援尾队走浮桥过北沙河，奉令炸掉的也是浮桥；钢桁架铁路桥从 18 场景里撤掉
（`Model/Model_RailBridge.glb`、`_blender/Script_BuildRailBridge.py`、`Script_RailBridgeSet.mjs`、[Data_RailBridge.md](Data_RailBridge.md) 都留在仓库里，只是 18 不再用）。
新概念图（Notion 18 更新版）：18_1「浮桥头」、18_2「炸浮桥」，夜入北门与夜行军不变（改名 18_3 / 18_4）。Notion 正文还写着「见证铁路桥奉令爆破」，以用户的拍板为准。

本文件是**浮桥模型、河岸重做、起爆时间线、锚点与验收**的唯一口径。18 的编排（等人走净、尾队、夜行军）仍以 [15–18 口径](Data_FirstLevelEnd20260919.md) 为准，
对岸兵力见 [Data_FirstLevelBridgeFarBank.md](Data_FirstLevelBridgeFarBank.md)，共用爆炸感知规则见 [通用近爆反馈](Data_BlastFeedback.md)。

> **2026-10-01 第二轮（集成者验收）改了三处**，本文以下各节的数字都已按第二轮更新，旧值见 §11 的变更表：
> ① 船要读得出来（长 6.6 × 宽 2.2、船间 0.8 m 水缝、干舷 0.52 m、桥面在舷缘上 0.32 m、船头朝上游带绞盘 / 锚 / 缆桩）；
> ② 射位搬到南岸水边桥头旁（离桥轴 7.6 m、离水线 4.8 m），被炸段北移 12 m 到河心（中心 z 122），射位到中心 40.7 m；
> ③ 白盒画质下的芦苇 / 草卡片不再是满地白刺（保留原贴图色，见 [Data_WhiteboxQuality.md](Data_WhiteboxQuality.md)）。

## 1. 河与岸（`MISSION_NORTH_RIVER.reaches[0]` = `RailBridgeReach`，只改 x −95…−60 这一段用得上的断面）

| 项 | R1c（钢桥） | R3（浮桥） |
| --- | --- | --- |
| `waterRel`（水面相对南岸自然地面） | −3（桥面高高架在河上） | **−1.1**（水面顶 ≈ −1.07，在南岸地面下 1.1 m；第一轮 −1） |
| 河底深 `depth` | 6 | 6（河心水深 ≈ 5 m，≥ 2.5） |
| `dropZ / waterZ / waterCut / shoreZ` | 153.7 / 156.3 / 3 / 166 | **151 / 157 / 1.4 / 160.4**（第一轮 151 / 156.3 / 1.35 / 168） |
| 水线（南 z1 / 北 z0，桥轴 x −77） | 156.3 / 92.25 | **157.9 / 91.3**（宽 66.6 m） |
| 南岸 | 25° 的白沙滩 | **陡泥岸 + 烂泥滩**：水线 z≈157.9 → 岸沿 z 160.4 只有 3.4 m 宽的陡泥岸（坡 ≤ 0.62，31°，人下不了水、空气墙挡着），岸沿以南 14 m 的平地整片算泥滩：翻土层 + 暗色顶点色（`RiverMudAt`）、芦苇（第一轮是 11.7 m 宽的缓滩） |

* 南岸没有堤了：`BridgeLeveeWest/East`、堤顶小路 `BankPathTread`、两岸铁路路堤 `RailEmbankmentSouth/North`、北桥台桥座槽 `NorthAbutmentSeat`、`BridgeSouthMound`、`BridgeSouthSandbags*` 全撤。
* **铁路路基（x −77 的 0.62 m 土垄，`SampleMissionTerrain` 里连续铺满全图）在河口前收掉**：`RailBermWeight(z)` 在 `MISSION_PONTOON_BRIDGE.railGapZ = [66, 184]` 之间为 0（两头各 4 m 淡出），
  顶点色 / 地表层的铁轨灰也乘同一个权重。不然浮桥头前面还杵着一条没有铁轨的土垄。
* **铁路收尾**：`MISSION_RAILWAY.points` 变成 z −186 → 200；道砟 / 枕木 / 钢轨在 z 66…184 断开（`sleeperGaps / railGaps / bed.gaps`）。北段止于 z 66（离北水线 25 m）、南段从 z 184 起（离南水线 24 m，只剩 z 184…200 一小段）。
  两个收尾处各有一处挡车桩 `RailBufferNorth* / RailBufferSouth*`（横梁 + 两根桩 + 土堆 + 一小堆枕木，全是 `Detail`，不带碰撞：坦克与尾队的路线要从这一带过）。
  铁路样条在别的阶段照旧可见（01–17 沿途的铁路一处没动）。
* **南岸水边的烂泥垄**（射位 `bridgeCover` (−84.6,162.7) 与水之间，概念 18_2 的前景）：地形 raise 形状 `BridgeMudRidgeA`（8 个点、halfW 0.5、feather 1.2、点高 0.65–1.3 m，走向弯曲，x −97…−83，垄心线 z≈161）
  + 三个泥团 `BridgeMudLump*`（垄外侧与射位西南，离射位 ≥ 5 m）。垄北脚被河槽 cut（修饰之后取 `min(natural − cut)`）在岸沿 z 160.4 一带削出一道 ≈ 0.6 m 的陡泥岸：这在水边是对的，人下不去也上不来
  （第一轮垄在岸沿之南 10 m，垄被削平的直崖是 bug；第二轮垄就坐在岸沿上，垄北脚与岸沿合成一道水边的泥坎）。射位离垄芯南缘 1.0 m、垄顶比射位地面高 ≈ 1.23 m：蹲姿（眼高 1.05）断线、站姿（1.62）越过它看被炸段（`Script_FirstLevelSpaceTest` §9 量）。
* **北岸浮桥头低地** `NorthLanding`（level，核心 x ±2.6、z 82…88.2、dy −0.23，羽化 1.6）：桥面顶 −0.23 比岸上低 0.23 m，尾队与冲桥的日军平缓走下 / 走上桥面。
  羽化止于 z 89.8，**不许伸进河槽**（`Script_FirstLevelWhiteboxTerrainTest` 断言河槽里逐位不被修饰改动）。
* 北岸台地（R2c 的四级缓坡）保留，与 18_1 的「对岸缓坡 + 枯树」一致；坡顶村与枯树不动。
* 「除浮桥外处处过不去」照旧：岸线空气墙 `BridgeShoreAirWall*` 的位置跟着水位走（`cut ≥ −waterRel − 0.12`，水线南约 0.3 m，z≈158.1；射位在它南面 4.6 m），南北两岸桥两侧 3.4 m 内不摆墙，
  桥面两侧另有绳栏空气墙（§4）；北岸爬不上来。

## 2. 桥（`MISSION_PONTOON_BRIDGE`，x = −77，原点 = 被炸段中心 (−77, 122)）

* 21 条平底木船（**长 6.6、宽 2.2**，长轴沿 x、垂直桥轴，间距 3 m 沿 z 并排拴住 → **船间 0.8 m 水缝**），第 i 条中心 z = 155 − 3·i（0 号最南）。船身**两头各伸出桥面 1.9 m**；
  **干舷 0.52 m**（舷缘顶 ≈ −0.55，水面顶 ≈ −1.07，`boats.freeboard`）；船头（西头，朝上游 −x）带绞盘 / 铁锚 / 缆桩。
* 桥面：纵梁（骑在舷缘上）+ 横铺木板，宽 2.8、**顶 −0.23**（比舷缘高 0.32 m、比水面高 0.84 m），随船的轻微起伏只做外观，碰撞面平稳。
* 两岸各一段短木栈：南栈起点 z 159.4（搭在陡泥岸上，岸面与桥面齐平处），北栈终点 z 88.2；`PONTOON_HEADS = { south: 159.4, north: 88.2 }`。
* 分段（`spans`，z0 南端 / z1 北端）：南截 159.4 → 135.5（船 0…6 + 南栈，永久）、**被炸段 135.5 → 108.5**（船 7…15，长 27 m，**中心 z 122**）、北截 108.5 → 88.2（船 16…20 + 北栈，永久）。
* 炸的是**河心偏北**：船 9…13（z 128…116）被药包掀成碎块；两侧各两条（7、8 与 14、15）被冲击波掀得倾斜下沉。被炸段中心在河心（水线 z 91.3…157.9 的中点 z≈124.6 一带），离南岸射位 40.7 m。从南岸射位看要一眼读出「浮桥中间没了」。
* 锚点（`MISSION_STAGE_ANCHORS`；键名 `railBridge` 沿用，免得牵动一大片测试与文档）：`railBridge` = (−77,122) 被炸段中心；`bridgeNorthEnd` (−77,90)（在北栈上）、`bridgeSouthEnd` (−77,162)（南栈起点以南 2.6 m 的泥地上，站得住）；
  `bridgeCover` (−84.6,162.7)（水边泥垄后）；`blastSafe` (−66,201) 不动；`bridgeEnemy` (−84.5,80.5) 不动。
  `MISSION_NORTH_RIVER.crossings` 的 `RailBridge` 改成 `PontoonBridge`。
* 射位与安全区：射位离桥轴 7.6 m（要求 4–8 m）、离水线 4.8 m（2–5 m，仍在陆上）、离被炸段中心 40.7 m（≥ 40 m，> `blastClearRadiusM` 30，射位不在爆破清场圈里）；
  `blastSafe` 离被炸段中心 80 m。**射位 ≠ 安全区**：起爆前玩家照旧要退到 `blastSafe`（`blastZoneCleared` = 玩家在 `blastSafe` 10 m 内），从那里回头看 80 m 外的 27 m 长的爆点；
  射位这一张（18_2 机位）看的是炸开的时间序列（`Script_PontoonBridgeShots`）。
* 路线：`toBridge`（… → `blastSafe` → (−74,199) → (−78,190) → (−84,178) → (−84.6,169) → 射位）、`bridgeWithdraw`（反向）、`bridgeCrossing`（(−77,70) → 北桥头 → 南桥头 → (−76,178) → …，真 Rapier 胶囊双向走得通）。
  `rearColumnHoldM` 13 → 17（北引道 20 m，压制下停在桥头前 3 m）。

## 3. 模型（`_blender/Script_BuildPontoonBridge.py` → `Model/Model_PontoonBridge.glb` + `Model/Data_PontoonBridge.json`）

结构照抄铁路桥的做法：按游戏 Y 上轴建（`export_yup=False`，Blender 视口里模型躺着是刻意的），坍塌关键帧在 Python 里算（30 fps × 6 s，抛体 + 自旋 + 入水减速 + 浮起 / 沉底 + 停稳扳正），
事件表（入水 / 落地）写进件表。`?v=` 都是 `20261001a`。

* 21 条船：肋板、船底板、两舷搭接木条、舷缘压条、艏艉柱；**船头朝上游（西头）**：每 3 条一个船头绞盘（铸铁立筒 + 横杆 + 缆桩）、5 条有铁锚，船里散芦苇束与绳圈；每条 ≤ 700 三角。船体深色（`Hull` 色调 0.5/0.44/0.37）、桥面板浅色（`Timber` 0.98/0.9/0.78）。
* 桥面：两根纵梁、横铺木板（缝、高低差、缺角）、两侧绳栏（细木桩 + 两道粗绳 + 竹竿）；两岸木栈搭在入泥的木桩上，岸上大木桩缠粗绳，缆绳斜拉到岸桩 / 入水的锚。
* 南岸浮桥头**东侧**（桥轴东 3–6 m）：木药箱摞、一卷铁丝网、绳圈、木桩（`Crates`，kind `static`，起爆后也在）；起爆器 `Exploder` / `ExploderHandle`（(−73.6,170.3)）与地面导线 `CableGround`（从栈头沿泥地拉到起爆器，路上绕过药箱与线卷）；
  药包 `Charges` + 桥面导爆索 `CableBridge`（kind `charges`，只在 18 前三步露面）：被炸的 5 条船各一包，船 10、11、12 是主药包（半径 12），9、13 次要（半径 8），t = 0 / 0.04 / 0.08（中心船 11 = 局部原点）。
* 件（kind）：`static` 4（`BankSouth`、`BankNorth`、`SouthSection`、`Crates`）、`span` 1（`NorthSection`：北截整体绕北岸桩缓缓向下游摆 3.5°，叠 ≤ 0.05 m 起伏，外观；碰撞面不动）、
  `debris` 42（`Boat9…13{Bow,Stern,Keel}` 15 块（`Bow` = 西半、船头，`Stern` = 东半）、`Deck{b}_{k}` 桥面板簇 13 簇、`SinkBoat7/8/14/15` 四条整船连桥面段、`Winch11`、`Anchor10`、`Splinter0…7`）、
  `charges` 2、`cable` 1、`exploder` 1、`handle` 1。
* 约 2.1 万三角、GLB 1.26 MB（后台懒载）；事件 34 条（全是 `water` 入水；没有 `land`、`slam`）。
* 材质：GLB 材质名 `PontoonBridge<Key>`，运行时按 `Data_PontoonBridgeDemolition.PONTOON_BRIDGE_MODEL.materials` 换成材质库配方 + 线性色调：`Timber` / `Hull` → `HandcartWood`（船体深、桥面板浅）、
  `Rope` → `Sandbag`、`Reed` → `WattleFence`、`Iron` / `Cable` → `CarriageFloorSteel`（**不用 `Steel`**：发蓝钢在这条管线里一片黑）、`Crate` / `Charge` → `WoodCrate`。

## 4. 碰撞与三态（`Data_FirstLevelMissionLayout`）

* 被炸段：`PontoonBridgeDeck`（桥面碰撞盒 + walkableSurfaces）与两侧绳栏 `PontoonBridgeRailWest/East` 是 gate，`signal: "RailBridgeDestroyed"`（**信号名保留**：Gates / 测试 / 存档一大片都认它，
  被炸段的 3 个 gate 就是这个信号翻的）。
* 断口两端各一道空气墙 `PontoonBridgeCutWallSouth/North`（`appearSignal`，炸后才出现，落在两截桥面之内 0.35 m），谁也走不进断口。
* 南北两截与两岸栈：永久体块 `PontoonBridgeSpanSouthDeck / SpanNorthDeck`（可走面）+ 两侧绳栏空气墙（`visual:false`，`tag:"airWall"`：只挡角色，不挡子弹与视线）。
* 外观一律由模型接管：`PontoonBridgeSet` 摘掉 5 个 gate 的白盒网格；模型加载失败时白盒桥面照旧留着、`Fire` 退回一发普通爆炸。
* 状态只看事实 `bridgeDestroyed`：完好 → 在场起爆 → 坍塌（逐件节点）→ 6 s 后换残骸合批；读档 / 阶段跳转直接落在炸后 = 残骸、一条特效都不重放；回跳清掉事实 = 桥自己回来。

## 5. 起爆演出（`Script_PontoonBridgeSet.mjs`，数值 `Data_PontoonBridgeDemolition.PONTOON_BRIDGE_BLAST`）

判定不变（`Script_FirstLevelBridge`：药装好、玩家退到安全区、爆破区无己方 → 等玩家转脸向桥 ≤ 3.5 s → 蹲在起爆器后面的爆破手压杆 → 0.45 s 后 `Fire`；
`Combat.BlastFeedback` 仍**只调一次**，`EndTest` 守着）。

| t | 发生什么 |
| --- | --- |
| 0 / 0.04 / 0.08 | 五个药包各一团火（主药包炮弹档 8.5 m，次要 0.7 倍） |
| 0.03 | 每个药包下面河面掀起一根水柱（浑水灰白，9–20 m/s，5 根 × 13 片） |
| 0.06 | 桥面上 4.2 m 处半空火球（战车档，黑烟往上翻） |
| 0–0.1 | 木船断裂的火星与碎木屑雨（46 条 streak）、水雾环、两个烟源（黑烟柱 + 贴河面的土黄扬尘） |
| 0.15 / 0.5 / 1.1 | 木板崩裂的撞击声（`impactWood`，被炸段南 / 中 / 北） |
| 0.4–6 | 按件表 `events`：碎块入水的水花（大件一堵水墙）、够大的（size ≥ 1.8 m，≤ 7 次）再一声落水闷响（`debrisFall`） |
| 1.2 起 | 两处断口一直烧着冒黑烟（`ends`）、河面扬尘 24 s、漂在水上的船板各一小堆火（≤ 3） |
| 0–5 | 玩家看着桥时任务 FOV 收到 0.76 倍（沿用），转开或演完慢慢放回 |

炸药包与桥上导爆索只在 18 前三步露面；起爆器与地面导线从接令到夜行军都在；夜景落位后这边的烟火全部收掉。另外的爆炸声一声不放（爆炸声只走共用感知入口）。
渲染预算：一次起爆往烟池里生的片数 ≤ 高画质烟池（880）的六成（`Script_PontoonBridgeTest` 算）。

## 6. 爆破手与桥头（南岸浮桥头，概念 18_1 的右前景）

* 两名爆破手蹲在南栈起点**东侧**的泥地上（`MISSION_PLACEMENT.bridge.demolition`：(−71.4,165.2)、(−71.4,167.2)，朝西面向药箱与桥头；第二轮从西侧搬过来，给水边射位腾地方），离被炸段中心 43.7 / 45.6 m（都在 `blastClearRadiusM` 30 之外）。
* 木药箱摞、铁丝网卷、绳圈是模型的 `Crates`；起爆器 `E.exploderAt` = (−73.6,170.3)（离被炸段中心 48 m）；地面导线从栈头沿泥地拉到它，导爆索沿桥面西缘拉到栈头。
* 撤出折线 `demolitionPullback`：北边那位 (−71.2,168.8) → (−70.4,172) → (−73.4,176.5) → (−79,180)；南边那位 (−71.6,168.9) → (−73.1,171.1)（起爆器后面蹲下、按压杆）；离实心体 ≥ 0.35 m（`Script_FirstLevelSpaceTest` 守着，南岸这一片没有实心体块）。
* 军官 `officer` (−70.4,176.4)；罗 / 何的掩护位 (−87,163.6) / (−89.4,163.9) 在射位西侧的垄后（面朝北，18_2 画面左侧近处的那几个人）。

## 7. 对岸兵力（R2 / R2b / R2c 的最小适配，[Data_FirstLevelBridgeFarBank.md](Data_FirstLevelBridgeFarBank.md) §12）

* 浮桥载不了战车：原来开上桥面的那辆（`FarBankTankBridge`）改成停在**北岸浮桥头东侧、东土坎以北的平地上**（(−66,73.5)，BridgeWithdraw 起下压到 z 76.5），起爆后仍停在那儿对南岸；`kind` 分成 `"bank"` 与 `"terrace"`。
* 冲桥组 6 人两列车道 ±1.75 → **±0.65**（桥面 2.8 m），终点 z 112.4 / 114.4 / 116.4（被炸段北半 108.5…122，离起爆中心 5.6–9.6 m，起爆时被炸死抛起落水、8 s 后移除）；
  桥头人堆（8 个真 AI）在浮桥北截 z 99.8–106.4（起爆杀伤圈之外，趴下后退回岸边）；前锋 (−77.65,97) / (−76.35,98.2)；
  视觉人群的桥头纵队两列 ±0.65、z 89…95.8（北截只剩 20 m，16 人）。「没有一个日军能过河」照旧。撤离路线与黑屏条件不动。

## 8. 文字

HUD 目标 / 提示 / 引导 / 菜单条件里的「铁路桥」全改「浮桥」（`Data_FirstLevelMission.mjs` 的阶段目标、`Data_Text_FirstLevel`、`Data_Text_Menu`、`Data_FirstLevelMissionArea` 的说明、
`Data_FirstLevelMissionDialogue` 的 18 环境床描述）。**已录音的台词里没有一句念「铁路桥」**：18 的配音 cue（`BridgeOrders`「接住桥上后队！」「桥要炸！」、`BridgeCover`「别堵桥口！」、
`BridgeWithdraw`「桥头撤！」等）都只说「桥」，对浮桥同样成立，不需要重录。改的只有字幕文字与环境床（`bridge`）的描述文本（后者是生成提示词，已有音频未重生成）。

## 9. 重建

```powershell
node Taierzhuang1938/_blender/Script_ExportPontoonBridgeTerrain.mjs      # 地形、水线、桥位、爆破手与起爆器落位（地形 / 桥常量 / crew 改了先重导）
node scripts/Script_BlenderMcp.mjs start --task PontoonBridge
node scripts/Script_BlenderMcp.mjs exec --file <含 runpy.run_path 的小脚本.py>   # 或 exec --code "import os, runpy; os.environ['PONTOON_BRIDGE_RENDER']='final'; runpy.run_path(r'<worktree>/Taierzhuang1938/_blender/Script_BuildPontoonBridge.py', run_name='__main__')"
node scripts/Script_BlenderMcp.mjs stop
node scripts/Script_BlenderMcp.mjs status --scan
```

产物：`Model/Model_PontoonBridge.glb`、`Model/Data_PontoonBridge.json`；源工程与审查渲染在 `C:/Users/Bentl/OneDrive/AI/Models/Blender/Taierzhuang1938/PontoonBridge/`
（`PONTOON_BRIDGE_SOURCE_DIR` 可改，`PONTOON_BRIDGE_RENDER=0 / final / 1` 控制渲染）。重烘之后把 `PONTOON_BRIDGE_MODEL.url / dataUrl` 的 `?v=` 一起 +1。
件表的 `terrainSha256` 必须等于 `_blender/Data_PontoonBridgeTerrain.json`（换行归一后）：**改了桥附近的地形（含羽化）就先重导快照、再重烘**，否则 `Script_PontoonBridgeTest` 红。
Blender 进程里 `os.environ` 会留着：改渲染开关要显式设。

## 10. 验收

```powershell
node Taierzhuang1938/Script_PontoonBridgeTest.mjs            # 纯 Node：烘焙产物 + 真 GLB 真时间线 + 粒子预算（321 项）
node Taierzhuang1938/Script_FirstLevelEndTest.mjs            # 18 判定（等人走净、只炸一次、只调一次感知；已知基线红 ZhouDeath 15.62 s）
node Taierzhuang1938/Script_FirstLevelSpaceTest.mjs          # 18 各节：浮桥几何、射位视线、撤出折线、河与水面（07+ 指纹预期红，集成时重生）
node Taierzhuang1938/Script_FirstLevelMissionTopologyTest.mjs
node Taierzhuang1938/Script_FirstLevelFarBankTest.mjs
node Taierzhuang1938/Script_FirstLevelWhiteboxTerrainTest.mjs
node Taierzhuang1938/Script_FirstLevelVegetationTest.mjs
node Taierzhuang1938/Script_PontoonBridgeShots.mjs --views=cover,head,side   # 实拍取证，出图到 _shots/PontoonBridge
node Taierzhuang1938/Script_FirstLevelMissionBrowserTest.mjs --campaign --stage-jumps --stage-from=18   # 真实输入走到 Complete
node Taierzhuang1938/Script_FirstLevelMissionTopologyBrowserTest.mjs   # 真 Rapier 胶囊双向、四态、河岸
```

`Script_RailBridgeTest`（退役的钢桥模型自检）仍能跑，不再挂在 firstLevel / firstLevelTail 域里，也不再对着游戏现在的布局 / 地形；`_blender/Script_ExportRailBridgeTerrain.mjs` 没有 `RAIL_BRIDGE_ALLOW_EXPORT=1` 不让跑（会覆盖冻结的旧快照）。

## 11. 第二轮变更表（2026-10-01，集成者验收：船读不出来 / 射位太远 / 白盒芦苇是白刺）

| 项 | 第一轮 | 第二轮 | 原因 |
| --- | --- | --- | --- |
| 船 | 长 6.6 × 宽 1.9、船间 1.1 m、干舷 0.39、桥面在舷缘上 0.11、船头朝东 | **宽 2.2、船间 0.8 m、干舷 0.52、桥面在舷缘上 0.32、船头朝西（上游）带绞盘 / 锚 / 缆桩** | 从桥头看要数得出 ≥ 8 条船的轮廓（概念 18_1） |
| 水位 `waterRel` / 水面顶 / 桥面顶 | −1 / −0.97 / −0.47 | **−1.1 / −1.07 / −0.23** | 干舷 ≥ 0.5 且桥面在舷缘上 0.3–0.5；水面仍在南岸地面下 0.8–1.2 m |
| 南岸断面 `waterZ / waterCut / shoreZ` | 156.3 / 1.35 / 168 | **157 / 1.4 / 160.4** | 泥垄与射位要贴着水边（水线 z 160.2 → 157.9，岸沿 168 → 160.4） |
| 南桥头 `PONTOON_HEADS.south` | 162.6 | **159.4** | 跟着岸沿走（岸面与桥面齐平处） |
| 被炸段中心 `z` / 区间 | 134 / 120.5…147.5 | **122 / 108.5…135.5**（船 9…13 被炸、7 8 14 15 沉） | 爆点挪到河心，射位到中心 40.7 m |
| `bridgeCover` | (−89.6,173.8) | **(−84.6,162.7)** | 射位在桥头旁的水边泥垄后：离桥轴 7.6 m、离水线 4.8 m |
| 泥垄 | x −105…−86、z 170.4…172 | **x −97…−83、z≈161**（halfW 0.5 / feather 1.2） | 同上 |
| 爆破手 / 起爆器 / 药箱摞 | 桥轴西侧 (−82.6,165–167) / (−80.4,170.3) | **桥轴东侧 (−71.4,165–167) / (−73.6,170.3)** | 给射位腾地方 |
| 对岸冲桥终点 / 人堆 / 前锋 / 桥头纵队 | z 124–128 / 112–119 / 99,103.5 / 93…110.4 | **z 112–116 / 100–106 / 97,98.2 / 89…95.8** | 跟着被炸段北移 12 m，北截只剩 20 m |
| `blastSafe` 距中心 | 76 m | 80 m | 中心挪到 122 |
| 白盒画质的植被卡片 | 亮灰剪影（像一地白刺） | **保留原贴图色（略去饱和 0.4、亮度 ×0.5）**，无色贴图的卡片统一暗橄榄 `#7a7547`；开关 `cardTextures` | 默认画质就是白盒，第一眼不能是白刺 |

机位：`18_1` (−78.4,163.4) → (−76.9,128)；`18_2` (−84.6,162.7) → (−71,126)（朝东北，浮桥从右近处斜伸向左远处）。
