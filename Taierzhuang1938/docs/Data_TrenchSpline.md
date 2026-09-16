# 样条壕沟系统（第一关壕沟的唯一口径）

2026-09-17 上线。与样条道路（`Data_RoadSpline.md`）、样条围墙（`Data_WallSpline.md`）
同一套思路：中心线是数据，宽窄深浅是管线算出来的，布设件沿线生成。
本页管**开挖断面、抛土、布设与编辑器**；土壤贴图那一层仍在 `Data_TrenchTerrainPbr.md`。

## 为什么改

改之前，壕沟是 `Data_FirstLevelMissionTerrain.MISSION_TERRAIN.trenches` 里的 7 条折线，
每条带三个常量 `depth / bottom / bank`，高度场里一个 `for (trench)` 循环把它们逐条 min 下去：

```js
height = min(height, natural - depth * (1 - Smooth((d - bottom / 2) / bank)))
```

问题不在数学，在读感。整条沟从头到尾一个宽度、一个深度、沟沿一刀切平，七条沟还都一样 ——
实拍出来是七条挤出来的管槽，不是人挖的工事。护壁是同一笔账：Layout 里
「每 5 m 两侧各一根桩 + 3 条横板」的双重循环，间距、根数、倾斜全是常数。

现在收拢成：控制点 →（可选圆角）中心线 → 位置噪声决定逐点宽/深/抛土 → 分桶网格加速采样 →
每米一站交给布设。

## 三层

```
Data_FirstLevelMissionTrenches   纯数据：中心线 + 用哪个预设 + 少数段级覆盖（零 three）
Script_TrenchPlan                纯数学：编译 / 采样 / 布设规划（零 three，Node 可测）
Script_TrenchSpline              three：编辑器预览几何（只画，不算）
```

管线：

```
MISSION_TRENCH_NETWORK.segments
  → CompileTrenchNetwork            圆角 → MakeRoadPath 中心线 → 每米一站 → 分桶网格 → junction 识别
      plan.Apply(x,z,height,natural) 开挖并集 + 沟沿抛土（热路径）
      plan.Depth(x,z) / plan.Corridor(x,z,reach)
  → Data_FirstLevelMissionTerrain   SampleMissionTerrain 里一次 Apply，烘进共享高度场
                                    SampleMissionGroundColor 用同一个 Apply 调走廊颜色
  → Data_FirstLevelMissionLayout    PlanTrenchDressing → blocks 进 blocks、placements 进 layout.trenchPlacements
  → Script_FirstLevelMissionFortifications  把 placements 换成真模型
```

**运行时吃的是烘完的结果。** 游戏里没有「壕沟网格」这种东西：沟是高度场上的一个凹槽，
渲染、Rapier 碰撞、角色贴地共用同一张场。编辑器那张皮只在面板开着的时候存在。

编译不便宜（走一遍圆角 + 分桶网格 + 每米一站，几十毫秒量级），而高度场烘焙每格点都调
`SampleMissionTerrain`，所以 `Data_FirstLevelMissionTerrain.TrenchPlanFor(spec)` 按
`(trenchNetwork, TrenchRevision())` 缓存编译结果。编辑器改参数只抬 revision，
下一次「重建关卡」自然拿到新的那一份。

## 数据格式

`Data_FirstLevelMissionTrenches.MISSION_TRENCH_NETWORK`：

```js
{ version: 1, seed: "tengxian1938:trench", segments: [ ... ] }
```

每段的字段：

| 字段 | 说明 |
|---|---|
| `id` | 段名。布设件 id 以它开头（`FrontCommunicationRevetment12_-1Post`） |
| `preset` | `TRENCH_PRESETS` 里的哪一档 |
| `role` | `null` / `"localLoop"`（回环）/ `"enemyEntry"`（敌军坑道）；只影响标注与编辑器标签 |
| `points` | `[{x,z},...]` 控制点 |
| `source` | 这串点该誊回哪个文件哪个字段 |
| `routeBound` | true = 点子**不是壕沟自己的**，引用的是任务/AI 路线 |

段级可选覆盖（不写就取预设）：`depth / floorW / bankW / bermH / bermW / bermSide /
widthScale / seed / cornerRadiusM / jitterScale`（`jitterScale: 0` = 这一段关掉随机）。

### routeBound：四条路线是点子的来源

三条段的控制点直接引用四条任务/AI 路线，不在壕沟表里抄第二份：

| 段 | 来源 |
|---|---|
| FrontCommunication | `OPENING.approachRoute.slice(1)` + `OPENING.supportRoute.slice(1)` |
| BundleApproach | `FRONT_SORTIE.route`（宽/深/坡也取 `trenchBottomM / trenchDepthM / trenchBankM`） |
| WestEvacuation | `MISSION_REAR_ROUTES.evacuation` |

**沟是照着人要走的线挖出来的**，两边各写一份必然对不上：旧账是支援路线改了一个点、
沟没跟着改，老周的担架队就从沟沿上走过去。改点先改来源文件；在编辑器里把这种段拖弯了，
导出的 JSON 会带一句警告（见下文「编辑器」）。

其余四条（FrontTraverse、两个回环、FlankBreachSap）点子是壕沟表自己的。

### 连接关系不写在数据里

三岔口在 (6,-124)：FrontCommunication 末端 + FrontTraverse 中段 + BundleApproach 起点。
两个回环两端都接 FrontCommunication；FlankBreachSap 一端接 FrontCommunication、
另一端是缺口（尽端由 `FRONT_BREACHES` 抬到 1.05 m，敌人从那儿进来）。

这些**不写死**：`CompileTrenchNetwork` 按「端点落在别段中心线上」自动认，
拖点之后不用手工维护一张连接表。

## 并集与抛土

```
cut_i  = natural - depth_i(x,z) * (1 - Smooth((d_i - halfFloor_i(x,z)) / bank_i(x,z)))
height = min(height, min_i cut_i)
berm_i = bermH_i(x,z) * Bump((d_i - halfTop_i) / bermW_i)
```

- 开挖取**并集**：同一点被两段覆盖时取更深的那一个。
- 抛土堆**只在**「不落在任何一段的开挖坡内」时才加。否则两条沟交汇处会把土堆进邻沟的沟底，
  走进去是一道半米高的坎。这是硬规矩，不是抛光。
- `bermSide`（`both` / `plus` / `minus` / `none`）决定堆哪一侧。法向取 `n = (-tz, tx)`：
  对一条自西向东（切向 +X）的沟，n 指向 +Z＝南；于是 FrontTraverse 写 `minus` 时土堆落在
  z < -124 的**北侧＝敌方**，射界不被自己的土挡住。
- 抛土还要过一道掩码：`SampleMissionTerrain` 里道路与场坪的压平因子同时当 berm 掩码。
  挖出来的土堆在沟沿上是对的，堆到碾平的路面或场坪上就是一道谁也解释不了的坎
  （担架队和大车正从那儿过）。

### 随机为什么是位置噪声，不是弧长噪声

沿弧长抖宽度，在三岔口会出事：三条沟在同一个点上各按自己的弧长取噪声，
同一块土被要求同时挖成两种宽度，接口处必然出一道台阶。

位置噪声 `N(x,z)` 对**所有**段是同一张图，两段在同一点读到同一个值，拐角和三岔口天然连续。
代价是「沟的宽窄跟着地块走，而不是跟着沟走」—— 正是想要的效果。
所以噪声通道的种子只挂网络级（`spec.seed` + 通道名），**不挂段 id**。

七路通道（`Script_Noise.ValueNoise2`，全部确定性，不许 `Math.random`）：

| 通道 | 作用 | 档长 |
|---|---|---|
| floor | 沟底半宽 ±`floorJitter` | `noiseCellM` |
| bank | 坡宽 ±`bankJitter` | `noiseCellM` |
| depth | 深度 ±`depthJitter` | `noiseCellM` |
| rut | 沟底微起伏 ±`floorRutM`（米） | `noiseCellM / 4` |
| berm | 抛土堆高 `0.6 + 0.4·N` | `bermCellM` |
| edge | 沟沿毛边 ±`edgeJitterM`（米） | `edgeCellM` |
| rough | 坡面粗糙度 ±`bankRoughM`（米） | `bankRoughCellM` |

后两路是 2026-09-17 验收时补的：9 m 一档的宽度噪声在沟里平视读不出来，
沟沿仍是一条光滑曲线、坡面仍是一张挤出来的斜面。edge 给沟沿 3 m 一档的毛边，
rough 给坡面 1.8 m 一档的起伏，且**只揉坡面**（`Bump(t)` 在沟底和沟沿两端归零）——
不碰通行面，也不碰 Rapier 的落地高度。

`legacy: true`（或段 `jitterScale: 0` + `cornerRadiusM: 0` + `bermH: 0`）时，
采样结果与旧公式逐点相等，`TrenchPlanTest` 拿旧公式当 oracle 对拍。

### junction 识别

- 段端点到别段中心线的距离 ≤ `max(1.0, 别段 halfFloor)` → `"T"`（落在别段中段）
  或 `"end"`（端点对端点，容差 1.5 m）；两段中段真交叉 → `"cross"`。
- 全网再按位置聚成一张 `plan.junctions`（同一个三岔口只出现一次，`members` 列出各段与弧长）。
- 站点上的 `junctionClear = true` 表示离别段中心线 < 别段 `halfFloor + 1.2 m`，布设要让开。
  旧规则是 `other.bottom/2 + 2`；余量从 2 收到 1.2 是因为新沟底窄了 1 m 左右。

## 布设参数表 TRENCH_PRESETS

`Script_TrenchPlan.TRENCH_PRESETS` 是布设参数的唯一真相（与 `WALL_PRESETS` 同一条纪律）：
**改这里＝改全关卡**，调用点不许再自己写间隔/抖动。编辑器滑杆只走
`SetTrenchPresetOverride`（覆盖不落盘，基线永远在源码里）。

五个预设：

| 预设 | 用在哪 | 断面（floorW / bankW / depth） | 抛土（bermH / bermW / side） |
|---|---|---|---|
| `communication` 交通壕 | FrontCommunication、BundleApproach | 3.4 / 1.1 / 2.0 | 0.25 / 1.6 / both |
| `fire` 射击壕 | FrontTraverse | 2.6 / 1.2 / 2.0 | 0.42 / 1.8 / minus（北＝敌方） |
| `evacuation` 后送壕 | WestEvacuation | 3.6 / 1.6 / 2.0 | 0.2 / 1.6 / both |
| `loop` 回环 | EntryCoverLoop、NorthCoverLoop | 2.6 / 1.1 / 2.0 | 0.2 / 1.4 / both |
| `sap` 敌方掘壕 | FlankBreachSap | 2.2 / 1.2 / 2.0 | 0.15 / 1.2 / both |

BundleApproach 虽然用 `communication`，宽/深/坡三项被段级覆盖成 `FRONT_SORTIE` 的
3.6 / 1.3 / 2.0：匍匐顶盖 4.6 m 宽、侧墙 ±2.3 m 是按 3.6 摆的，这一轮不动。

逐项含义（**数值以代码为准**，下面是写这页时的当前值）：

| 字段 | 含义 | 当前值 |
|---|---|---|
| `depth` | 设计开挖深度，自然地面往下，米 | 全部 2.0 |
| `floorW` | 沟底宽（可走的平面），米 | 2.2–3.6 |
| `bankW` | 每侧坡的水平投影宽，米 | 1.1–1.6 |
| `bermH` / `bermW` | 沟沿抛土堆的高与宽，米 | 0.15–0.42 / 1.2–1.8 |
| `bermSide` | 堆哪一侧 | both，射击壕 minus |
| `floorJitter` / `bankJitter` / `depthJitter` | 三路宽深抖动，比例 | 0.16 / 0.22 / 0.04 |
| `floorRutM` | 沟底微起伏幅度，米 | 0.03 |
| `noiseCellM` / `bermCellM` | 宽深、抛土的噪声档长，米 | 9 / 6 |
| `edgeJitterM` / `edgeCellM` | 沟沿毛边幅度与档长，米 | 0.12 / 3.2 |
| `bankRoughM` / `bankRoughCellM` | 坡面粗糙度幅度与档长，米 | 0.07 / 1.8 |
| `cornerRadiusM` | 拐角圆角半径，米（0 = 严格折线） | 0.4–0.8 |
| `revetment.*` | 木护壁：间隔 / 间隔抖动 / 跳过率 / 横板根数 / 桩高 / 板长 / 倾斜 / 内缩 | 间隔 4.0–5.0 m，跳过 0.08–0.35 |
| `duckboard.*` | 踏板：概率 / 长 / 宽 / 厚 | 概率 0.1–0.45 |
| `bays.*` | 射击位：间隔 / 抖动 / 长短 / 高 / 厚 / 侧 / 本段上限 | 间隔 26–34 m，上限 0–6 |
| `props.*` | 杂物：每米件数 / 可用资产名 | 0.008–0.015 件/m |

圆角：半径夹到 0.5×较短邻边，圆角后中心线到原控制点的偏离恰为 `r·(1/cos(θ/2) − 1)`
（θ 为转角）。`TrenchPlanTest` 按这条公式验。

## 史料与本次取值

史料研究（2026-09-17）能追溯到原件的只有英军 1916 年那一本；中国军队 1930 年代的筑城教范
正文没有上网，滕县工事只有定性记载。逐条来源与标注：

| 来源 | 一手/二手 | 拿到的数字 | URL |
|---|---|---|---|
| 英国总参谋部《Notes for Infantry Officers on Trench Warfare》1916 英版 / 美陆军战争学院 1917 重印（WD Doc No.582） | **一手**（已下载 PDF 提取正文） | 射击壕胸墙顶→沟底 1.83–2.13 m；踏步宽 0.46 m、踏步面在胸墙顶下 1.37 m；踏步后深槽底宽 0.46–0.76 m；交通壕底宽最小 0.76 m、0.91 m 更好且**不宜超过 0.91 m**，深 2.13 m；壁面护壁后每米深退 0.25–0.33 m；直段 5.49–9.14 m、横墙厚 2.74–3.66 m；担架转弯半径最小 4.88 m；自由通行最低掩护 1.98 m；踏板每块 1.83 m × 0.46–0.61 m | https://www.314th.org/numbered-documents/0582-notes-for-infantry-officers-on-trench-warfare.pdf |
| 德语维基《Schützengraben》各国断面表（转引 Hein 1901，原书数字化页未取到） | 二手 | 立射壕底宽：德 1.00 / 奥 1.00 / 法 1.20 / 意 1.40 m；掩护高 1.10–1.75 m；胸墙 0.55–0.70 m；加强断面越深越窄（底宽 0.60–1.00 m） | https://de.wikipedia.org/wiki/Sch%C3%BCtzengraben |
| 日语维基《塹壕》构造节（条目未注出处） | 二手 | 日本陆军立射照准高 1.30 m（跪射 0.80、伏射 0.25）；背墙对步枪弹 1 m 厚 | https://ja.wikipedia.org/wiki/%E5%A1%B9%E5%A3%95 |
| Coflein / CPAT 2015 Kinmel Park 一战训练壕实测 | 官方实测（**未记录深度**） | 横墙宽 5–6 m；射击壕段各约 56 m | https://coflein.gov.uk/en/site/423648 |
| Shoreham Fort 训练壕页（转引 Smith 1917 / Vickers 1917） | 二手 | 射击段底宽最大 0.91 m（通行 0.46 + 射击 0.46）；射击段长 3.66–5.49 m | https://www.shorehamfort.co.uk/past/the-great-war-training-trench/ |
| DigVentures 训练壕条目（转述 Historic England） | 二手 | 通例宽 1–2 m、深 2–3 m、直壁 | https://digventures.com/monuments/practice-trench/ |
| 民国筑城教范书目（《筑城教范》1936、《筑城要则》1938、《野战筑城教范草案》1941 等 12 种） | 只有**书目**，正文未上网 | — | https://www.oraclechn.com/a/junshishiliaodangan/zhanzhengchangjing/10988.html |
| 张宣武《滕县保卫战中的英雄》、维基《滕县保卫战》、《浴血滕县》 | 二手，**无尺寸** | 只有「彻夜构筑工事」「东关寨墙被炸开一二十米缺口」；122 师无工兵专业部队，民众帮挖 | https://zh.wikipedia.org/zh-hans/滕县保卫战 |

**未找到**（不能编，也别再去重查）：国军教范规定的散兵壕/交通壕/掩蔽部尺寸；
日军《築城教範》原件的断面数字；滕县守军实挖壕沟的任何一个深度或宽度；
滕县工事有无木护壁或沙袋。百度百科系列页本次访问全部 403，其摘要里的那组数字无法核实，
一律不用。

### 史料值 / 玩法下限 / 本次工作值

| 段 | 史料值（沟底宽） | 玩法下限 | 本次工作值 floorW / bankW | 差距说明 |
|---|---|---|---|---|
| FrontCommunication | 交通壕 0.76–0.91 m | **3.24 m**（见下） | **3.4 / 1.1** | 被 AI 避让净空反推钉死，是全表离史料最远的一条 |
| FrontTraverse | 射击壕合计 0.92–1.22 m | 射击踏步在北侧不动 | **2.6 / 1.2** | 踏步面到胸墙顶 ≈ 0.88 + 0.42 = 1.30 m，与德式 1.40 / 日军 1.30 同档 |
| BundleApproach | 交通壕 0.76–0.91 m | 匍匐顶盖 4.6 m 宽、侧墙 ±2.3 m | 沿用 `FRONT_SORTIE` **3.6 / 1.3** | 爬行净空按 `trench*M` 采样，这一轮不动 |
| WestEvacuation | 担架纵列 0.91 m + 转弯半径 4.88 m | 两名担架员并排 ≥1.6 m | **3.6 / 1.6** | 需求是并排抬；改成前后纵列抬的话这条该收回去 |
| EntryCoverLoop / NorthCoverLoop | 让车位 2.0 m | 两个胶囊错身 ≥1.6 m | **2.6 / 1.1** | 史料原话就是「靠让车位和支岔，不靠整条加宽」 |
| FlankBreachSap | 0.85 m | 敌人从缺口进来能走 | **2.2 / 1.2** | 敌军仓促挖的，最窄最浅的一档；尽端仍由 `FRONT_BREACHES` 抬到 1.05 m |

深度全部保持 2.0 m。英军「自由通行最低掩护」是 1.98 m，现值恰好命中；
测试的硬下限是 1.83 m。

**communication 为什么是 3.4 而不是史料化的 3.0。** 契约表给的是 3.0，实跑不通过。
四人班在沟里错身时 `Script_SquadMarchAi.CanPause` 要求站点四向各 `separationM` 0.85 m 内
地面高差 ≤ `groundDeltaM` 0.35 m（`Data_Tuning_SquadMarch`）；人贴到离中线 0.78 m 时，
那 0.85 m 就落到沟壁上，避让整个被关掉，两个对向的人永远互相让行
（`SquadMarchCoverBrowserTest` 死锁；实测 4.2 通过、3.0 不过）。
1.1 m 的坡上 0.35 m 高差只能容 0.27 m，反推最窄半宽 ≥ 1.63 − 0.27 = 1.36，
即 `floorW ≥ 3.24`（jitter 最窄 −16%）。取 3.4。

**坡宽为什么没压到史料的 0.35–0.55 m。** 史料的壕壁接近直立（护壁后 4:1–3:1，
每米深只退 0.25–0.33 m）。本关的坡同时是通路：援军从南岸下到横壕、警戒哨从北岸退回，
靠的就是能滑下去的坡。这一轮只把坡收窄 20–30%（1.5–2.2 → 1.1–1.6 m），
与史料仍有 2–4 倍差距，如实记在这里。

**护壁材质是推断不是史料。** 英军用木桩 + 荆笆/兔网（沙袋被明确不推荐，经不起天气）；
滕县这一侧用秸秆荆笆是就地取材的合理推断，没有史料明载。

## 布设

`Script_TrenchPlan.PlanTrenchDressing(plan, { groundAt, avoidRoutes, keepOut, laneCuts, seed })`
沿编译好的中心线摆四路件，返回 `{ blocks, placements, stats }`。
随机全部确定性（`Mulberry32(HashString(seed + segId + ":" + 通道))`）——
布设进的是烘焙结果，每次重建换一套就没法做视觉比对。

| 路 | 摆在哪 | id 规则 | 形态 |
|---|---|---|---|
| 护壁 | 沟壁，横向 = 该站 `halfFloor + insetM`；每 `spacingM` 一组，两侧各自抽签跳过 | `${segId}Revetment${k}_${side}Post` / `...Slat${n}` | `semantic:"timber"`, `solid:false`，桩高不超过该站深度 |
| 踏板 | 沟底中线偏 ±0.3 m，长边沿切向 | `${segId}Duckboard${k}` | `semantic:"timber"`, `solid:false` |
| 射击位 | `bays.side` 一侧沟沿外 `halfTop + 0.5 m`，面朝沟外 | `${segId}TrenchBay${n}` | `semantic:"cover"`, `solid:true`, 带 `cover:{faceX,faceZ}` |
| 杂物 | 沟底随机撒 | `${segId}TrenchProp${i}` | `placements`，外部模型 |

- id 里**必须含 `Revetment`** —— Layout 末尾那张老清理网还认它，留着当第二道保险。
- `placements` 的 `asset` 只能是 `MISSION_DEFENSE_ASSETS` 已登记的那几种
  （`battlefieldSupplyBox` / `battlefieldCompartmentCrate` / `battlefieldCanvasCover01`）；
  发一个没登记的名字，Fortifications 那边只会静默少一件。
- 护壁只摆在 `!station.junctionClear` 且离段两端 ≥ 3 m 的站；射击位离三岔口和段端 ≥ 6 m，
  每段总数 ≤ `bays.maxCount`。

### 三道筛

| 参数 | 口径 |
|---|---|
| `avoidRoutes` | 任务/AI 路线折线，每 0.5 m 一个采样点；件的旋转矩形外扩 0.9 m 内碰到就跳过（旧清理网的口径） |
| `keepOut` | 手摆体块占地 `{x,z,w,d,ry}`，外扩 0.5 m + 件自身半径 |
| `laneCuts` | `(x,z,w,d,margin)=>bool`，只对 `BundleApproach` 生效（Layout 传 `FrontAssaultLaneCuts`） |

### 两遍规划（Layout 侧）

`Data_FirstLevelMissionLayout.MISSION_TRENCH_PLACEMENTS` 跑两遍同种子的 `PlanTrenchDressing`：

- 第一遍（`guarded`）吃全部路线，出护壁与射击位；
- 第二遍（`floor`）不吃路线，只出踏板与杂物。

理由：**沟里的路线就是沟的中心线**。护壁摆在沟壁上（离中线半个沟底宽再加
`insetM` 0.18 m，按预设是 1.3–2.0 m），只有横穿的路线才碰得到；踏板和杂物摆在沟底中线附近，吃同一套路线的结果是一件都不剩 ——
而踏板本来就是给人踩的，杂物是不带碰撞的箱子。两遍用同一个种子，件的位置逐位相同，
差的只是筛掉了哪些。

`keepOut` 里除了当时已摆好的实心体块，还要把手挖的凹地（机枪踏步、补给屋地板）算上：
护壁贴在沟壁上、离踏步还隔一堵墙，半径 ×1 就够；踏板躺在沟底、和踏步的斜面是同一片地，
要 ×2 才躲得开（照直径给护壁写，整条射击壕的护壁会被清光）。

### 射击位走沙箱模型

`Data_FirstLevelMissionFortifications.IsMissionSandbagBlock` 加了一条
`/TrenchBay\d+$/`，把 PCG 摆的射击位换成真沙袋模型。这条**不能锚在开头**：
id 是 `<段名>TrenchBay<n>`，段名在前。

## 接线

| 位置 | 做了什么 |
|---|---|
| `MISSION_TERRAIN.trenchNetwork` | 挂上 `MISSION_TRENCH_NETWORK` |
| `MISSION_TERRAIN.trenches` | 改成 getter → `TrenchPlanFor(this).trenches`（兼容视图：`id/role/points/depth/bottom/bank`，`bottom` = 标称 `floorW`） |
| `SampleMissionTerrain` | 旧 `for (trench)` 循环换成一次 `plan.Apply(x,z,height,natural)`，位置不变（rail 之后、breach 之前）；抬起来的那部分乘 berm 掩码 |
| `SampleMissionGroundColor` | 一次 `Apply(x,z,0,0)` 同时给两个答案：负数是开挖深度，正数是沟沿抛土高度，空地上是 0。比旧的逐条走 7 条折线还省 |
| `SampleMissionGroundSurface`（分层地形，`docs/Data_TerrainLayers.md`） | 翻土层权重按 `Corridor(x,z)` 的实际 halfFloor / bank 铺（沿沟沿再多 0.8 m），麦茬的 3.5 m 退让带仍按标称折线量；第一关开了 `terrainLayers` 时走的是这条，上一行只剩弹坑重建等回退路 |
| `Data_FirstLevelMissionLayout` | 删掉手写护壁循环；`MISSION_TRENCH_PLACEMENTS` 出件，`layout.trenchPlacements` 带出去 |
| `Script_FirstLevelMissionFortifications` | `MISSION_DEFENSE_OBJECTS` 之后再吃 `layout.trenchPlacements` |

**`bottom` 的数变了，拿它当走廊半宽的旧断言要跟着改。** 旧表 FrontCommunication 的
`bottom` 是 4.2 m，新表是 3.4 m：`bottom/2` 从 2.1 缩到 1.7。
真正对应「挖开的地面」的是走廊半宽 `bottom/2 + bank`，旧断言在 4.2 那会儿
拿 `bottom/2` 顶着也够用，收窄之后就不够了（见「回归」与下面的断言改动第 1 条）。

## 编辑器

设置面板（`` ` `` 键）→「编辑器」→「**场景样条PCG**」（`Script_EditorSplines.mjs`）。
面板原本只认路与墙，现在多一档壕沟（kind `trench`），摆在路线表**最后**——
那张表的第一条是「打开面板默认选中的那条」，加一路壕沟不该改掉所有人打开面板看到的东西。

- **列表**：七条段，标签 `壕沟 · <段名>`，回环和敌军坑道带后缀；每条带 `source`。
  只对第一关白盒列出来（`layout.terrainSpec.trenchNetwork`，读不到就退回源码常量）。
- **预览 = 真断面**：`Script_TrenchSpline.BuildTrenchPreview` 沿站点每站取 7 点横断面
  `[-(halfTop+bermW), -halfTop, -halfFloor, 0, +halfFloor, +halfTop, +(halfTop+bermW)]`，
  高度走的就是 `plan.Apply` —— 也就是烘高度场那一个函数。
  面板上看到的沟底与玩家踩到的沟底是同一个数。三岔口另给橙色标记，布设件画成半透明盒子。
- **两条段级滑杆**（只改选中的这一条沟）：「沟底宽比例」`widthScale` 0.6–1.6×、
  「设计深度」`depth` 1.5–2.6 m。推给规划层走 `SetTrenchSegmentOverride`。
- **「布设参数」一档**：选中壕沟预设后，滑杆表从 `WALL_PARAMS` 换成 `TRENCH_PARAMS`
  （断面 / 随机 / 布设三组 13 根）。改动经 `SetTrenchPresetOverride` 推给管线 ——
  **预览与建关读同一份**，退出面板重建关卡立刻看到。
  壕沟预设在存档表里带 `trench:` 前缀（预设名 `loop` / `fire` 与墙那张表会撞）；
  带点号的键是嵌套字段（`revetment.spacingM`），推给规划层前展开成嵌套 patch，
  嵌套那一层整只带过去（出厂值打底 + 改过的字段覆盖）。
- **导出**：`routes` + `presets` 两节。`routeBound` 的段会带一句警告
  「点来自路线数据（source），誊回那边而不是壕沟表」—— 在面板里把这种段拖弯了，
  誊回壕沟表是没用的，下次建关还是从路线那边读。
- **改动不落盘**：存 localStorage（`tz1938.sceneSplines.v1`，预设改动在 `__presets` 子键），
  基线永远在源码里。
- **退出不清覆盖**：与围墙同一条纪律 —— 面板和建关读的是同一份覆盖，退出后重建关卡
  要能看到改动。只有「全部还原出厂」才会调 `ClearTrenchSegmentOverrides()` /
  `SetTrenchPresetOverride(name, null)` 把规划层里那份也清掉；不清的话，面板上显示的是出厂值、
  建关时吃的还是上一轮拖出来的数（刷新才消失，那是最难查的一类残留）。

## 回归

| 测试 | 验什么 |
|---|---|
| `node Taierzhuang1938/Script_TrenchPlanTest.mjs`（纯 Node，tier0Fast / terrain 域） | legacy 逐点等价（旧公式当 oracle，5000 点）、热路径计时、junction 自动识别、并集与抛土、宽深有界且沟底沿弧长无台阶、布设确定性与 id 规则、圆角夹持与偏离公式、预设/段级覆盖与 revision、数据来源标注 |
| `node Taierzhuang1938/Script_TrenchEditorTest.mjs`（浏览器，editor 域） | 七条路线列得出来、编译断面预览有三角与三岔口标记、实测沟深、段/预设覆盖热改后 `TrenchRevision()` 递增且进编译结果、导出带 source 与 routeBound 警告、导出→清空→导入→再导出逐字一致、叠加层像素差、退出不泄漏几何且保留覆盖、「全部还原出厂」不留残渣 |
| `node Taierzhuang1938/Script_FirstLevelMissionTest.mjs` | 沟深下限、指定点高度、路线净空 0.35 m、掩体地基贴坡、走廊断言 |
| `node Taierzhuang1938/Script_FirstLevelMissionFortificationsTest.mjs`（浏览器） | 12 条胶囊双向实走每条沟、沙袋实体范围与包围盒、合批预算（`meshCount` / `triangles` 上限）、重点区域截图 |
| `node Taierzhuang1938/Script_FirstLevelMissionTopologyBrowserTest.mjs` | 四条后方路线双向走位 + 土体遮挡 |
| `node Taierzhuang1938/Script_FirstLevelFrontRouteBrowserTest.mjs` | 补给路线双向 + 匍匐顶盖净空 |
| `node Taierzhuang1938/Script_SquadMarchCoverBrowserTest.mjs` | 沟内真碰撞、错身避让不死锁（communication 宽度的看守就是它） |
| `node Taierzhuang1938/Script_FirstLevelP012TerrainTest.mjs` / `Script_FirstLevelP012LayoutTest.mjs` | 连续地形、道路基底、渲染三角共享高度 |
| `node Taierzhuang1938/Script_ModuleGraphTest.mjs` | 改浏览器模块必须抬 `index.html` 的 `?v=` 戳 |

## 本次验收（2026-09-17，实测）

**TrenchPlanTest**

- legacy 逐点等价：5000 点 ×2 编译，最差偏差 **1.55e-15 m**。
- 热路径：`Apply` 10 万次 **29–110 ms**（随机器负载）。
- junction：全网 **6 个**，(6,-124) 那个三岔口 **3 个成员**。
- 布设（含沟沿毛边与坡面粗糙度两路细尺度通道）：护壁 **261 组** / 踏板 **48** / 射击位 **14** / 杂物 **10**。

**断面**（floorW / bankW，米）

communication 3.4 / 1.1、fire 2.6 / 1.2、evacuation 3.6 / 1.6、loop 2.6 / 1.1、sap 2.2 / 1.2；
BundleApproach 沿用 `FRONT_SORTIE` 3.6 / 1.3。深度全部 2.0，抛土 0.15–0.42。

**性能**

- 烘焙 `CreateP012Terrain(MISSION_LAYOUT)`：**1579 → 827 ms**。
- `SampleMissionGroundColor` ×10 万：**26.1 → 20.9 ms**（爆炸帧每顶点调用的那条）。

两项都比旧的逐条折线循环快：分桶网格每次只碰落在同一格里的几条边。

**浏览器**

- `FirstLevelMissionFortificationsTest`：count 605、blocks 61、meshCount 34、
  triangles 368624；12 条胶囊双向实走全部到达；实测沟深 1.96 / 1.99 / 2.00 m。
- `FirstLevelMissionTopologyBrowserTest`：8 条走位全到。
- `FirstLevelFrontRouteBrowserTest`：16/16。
- `SquadMarchCoverBrowserTest`：通过。
- `TrenchEditorTest`：38 项通过。

**改过的测试断言**（三条，都是语义确实过时，没有削弱）

1. `Script_FirstLevelMissionTest` 1411 行：`<= bottom/2` → `<= bottom/2 + bank`。
   走廊＝沟底 + 一侧坡；`bottom` 从 4.2 缩到 3.4 之后，CornerPursuerD/E 从北回环汇入主沟、
   终点落在汇口上离主沟中线 2.0 m —— 在沟底之外、走廊之内，仍是挖开的地面。
   同一处上一行的 `SampleMissionTerrain < -1.2` 硬断言原样保留，没有放松。
2. `Script_FirstLevelMissionFortificationsTest`：沙袋包围盒改在**体块自己的坐标系**里量。
   沟沿上的射击位跟着壕沟走、带 `ry`，对斜块取世界 AABB 量到的是外接盒不是外壳；
   `ry = 0` 的块（原来 56 个全是）结果与旧写法逐位相同，容差仍是 0.025。
3. `Script_FirstLevelMissionTopologyBrowserTest`：夹具选 helper 从 `medic` 改成
   `medic` 或 `civilian`。这条**改前就红**：主分支 e4fe8b315 把 `medicCount` 调成 0，
   夹具还在只找 medic，`Object.assign` 拿到 `undefined`。跟上运行时那条口径。

## 遗留

- **FrontTraverse 的护壁几乎被路线净空吃光。** 增援班从交通壕口沿 z=-123 散开到各自射击位，
  这条腿整段躺在射击壕里、偏中线 1 m 左右，护壁摆在 `halfFloor + 0.18` ≈ 1.5 m 处，
  正好落在 0.9 m 的路线外扩带里。要么把那几条腿挪到沟底中线，要么给射击壕单独放宽护壁判据。
- **撤离壕尽头有一块踏板悬在 0.2 / 0.32 m。** 沟尽端的地面过渡带上，踏板两端地高差过大。
- **fire / loop / sap 三档没有实测过 `CanPause`。** communication 的 3.4 是反推 + 实跑验过的，
  另外三档的宽度只过了现有的胶囊实走，没有专门跑过「两个对向的人在沟里错身」。
  沟内 AI 避让出问题时先量这三档。
- **坡宽与史料仍差 2–4 倍**（1.1–1.6 m vs 0.35–0.55 m），理由见「史料与本次取值」。
  真要压下去，得先解决「援军下坡、警戒哨退回」这两处靠坡当通路的地方。
- **编辑器滑杆没覆盖新加的两路细尺度参数**（`edgeJitterM` / `edgeCellM` /
  `bankRoughM` / `bankRoughCellM`）。它们在 `TRENCH_PRESETS` 里有值、也进了编译，
  但面板上调不到，只能改源码。
