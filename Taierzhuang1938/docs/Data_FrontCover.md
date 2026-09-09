# 第一关前沿掩体（现状）

《往南的路》前沿跃进场（`?whitebox=p012` 的 Support / MachineGun / Tank 三段）的内容层。敌军 AI 本身见
[敌军 AI](Data_EnemyAi.md)；这一页只讲**那片地上放了什么**。

## 为什么要放

2026-09-09 实拍取证（`_shots/EnemyAi/Script_FarEnemyProbe.mjs`，玩家钉在 `MISSION_ANCHORS.gun`、开战 20 s）：
46–74 m 一档 31 个活着的日军里，**只有 2 个**身边有掩体点落在 `assaultCoverSearchM`（9 m）里，其余原地跪射；
四秒窗口里 23/31 一步没挪。不是大脑不会躲——`Script_AiCover` 查得到就会用——是**那片地上没有东西可躲**。

跃进线（`FRONT_ASSAULT.lines` z=-187 / -175.5 / -166 / -159.5，`xRange` [-63,49]）当初是**故意**从掩体列之间穿过的：
AI 在冲锋路径上没有翻越，横在跃进线上的矮墙就是死墙。于是「有掩体」和「跑得过去」是同一道题的两面。

## 放了什么

`Data_FirstLevelMissionFront.FRONT_COVER` 是唯一口径，`Data_FirstLevelMissionLayout` 照它生成体块。

- **四排**，每条跃进线南侧 1.5–2.5 m 各一排（南＝人与国军战线之间，也是 `AiCover.Query` 的 `betweenSlackM`
  硬条件唯一接受的一侧）：`Bank` z=-185.3、`Mound` z=-173、`Ridge` z=-164、`Stub` z=-158。
- **98 只盒子**（Bank 21 / Mound 28 / Ridge 23 / Stub 26），登记掩体高 **1.00–1.17 m**：高于
  `TRAVERSAL.stepMax`（0.55，走过去就上去了）、低于 `COVER.tallM`（1.55，藏得住站着的人）——正是
  「蹲着藏、跪起来打」那一档。厚 0.6 m，与既有掩体墙同厚：`COVER.standoffM`（0.65）是从登记点（盒子中心）
  量的，再厚隐蔽位就落进墙里了。
- 段长 1.5–1.7 m、**间距 2.1 m**（> `COVER.minAllySpacingM` 2.0），所以一个班横排能各占一个点，
  不会被友军间距惩罚挤回空地。断续的段落读作被炮火犁断的田埂 / 坟包 / 断墙残段，没有新资产。
- 原来孤零零摆在 z=-173 的三块 `EnemyForwardCover` 已删：0.62 m 低于蹲藏档，且一块 4.2 m 长的板子
  从头到尾只登记**一个**掩体点。

**列（column）与走廊**：段落只长在 `FRONT_COVER.columns` 里，列之间留出的空当就是跃进走廊。
`FRONT_ASSAULT.blockedX` 直接由 `columns` 推出——掩体和跳线规则不可能各写一份、各改一半。

| 列 | x | 说明 |
|---|---|---|
| WestFarm | -60.5 … -42.5 | 北面农舍占了 Bank 那一排，只建南三排 |
| WestGrave | -40.5 … -33.5 | 新 |
| Ruin | -31.5 … -16.9 | `FieldRuin0` 占了 Ridge 排西半 |
| CenterWest | -12.5 … -7 | 新 |
| Center | -2.6 … 2.6 | 原 `EnemyForwardCover0` 那一列 |
| CenterEast | 7.3 … 12.8 | 新 |
| East | 17.4 … 28.9 | `FieldRuin1` 占了 Stub 排东半 |
| FarEast | 39.8 … 47（建到 42…47） | 建设跨度比通行跨度窄，让开战车推进 |
| NorthRuin | 50 … 68 | 建筑，在跃进跨度以东，不自建掩体 |

走廊（自西向东，米）：2.5 / 2.0 / 2.0 / 4.4 / 4.4 / 4.7 / 4.6 / **10.9** / 3.0。
第八条是田间土路与战车推进线（`tankStart` 36,-173 → `tankFirstFireZ`），四排都不许占。

## 跳线为什么还是通的

选的是「加宽掩体列 + 把跳线推出列外」，不是「沿线分段留缺口」。理由是这条能**证明**：

- 一次跃进在 x 上最多挪 `2 × lateralM` = 4.8 m，而每一列至少 `minColumnM` = 4.9 m 宽。
  `ClearLaneX` 只会把人推到**他自己 x 所在的那一侧** 0.6 m 外，于是他每一跳都落在同一侧，
  跨不过去、也不会「这一跳在西、下一跳在东」地从中间穿过。
- 段落还从列边再内缩 `insetM` = 0.55 m，被推到列外 0.6 m 的人离最近的盒面因此有 1.15 m，
  远超路线检查用的 0.35 m 胶囊余量。实测所有跃进段最坏余量 0.75 m。
- 列跑出 `xRange` 时是唯一例外：把推出去的点再钳回来会把人塞回刚出来的那一列，所以那种列从另一侧出。
  翻边只取决于列本身、不取决于抖动，同一个人的每一跳仍然一致。
- 一个人被摆在跃进线一米松量之内时会**跳过**那条线，径直冲过它背后那排——列帮不上忙（他就走在列里）。
  两处处理：`FRONT_SECTIONS` 的 Center 第五人 12,-188 → 12,-190（回到线北，和其余人一起在 -187 起跳）；
  生成器再用 `FrontAssaultLaneCuts` 兜底，凡是被任何一条实算跃进线切过的段落一律不建。
- 站位同理：任何一个 `FRONT_FIELD_MEN` 的射击位、以及既有建筑 / 废墟（`NorthFarm`、`FieldRuin0/1`）
  的占地上不建段落——那些地方本来就有掩体。

波次落点（`FRONT_ASSAULT.waveCentersX` 六个中心 × 6 人）与前沿全部步枪手走同一条 `FRONT_ASSAULT_STARTS`
名单，`Script_FirstLevelMissionTest` 逐点走一遍：38 + 11 个起点、每条线的落点都验在列外、在 `xRange` 内。

## 数

**只算本页这批内容**（在 master 上只叠这几个数据文件，不含同期的大脑改动）：

| | 改前 | 改后 |
|---|---|---|
| 跃进线 9 m 内有掩体点（每米采样，四条线 452 点） | 30.1 / 68.1 / 47.8 / 56.6 %，合计 **50.7%** | **100%**（四条线均 100%） |
| `AiCombatBrowserTest` A 段：前沿「身边根本没有掩体点」 | 23/42 = 55% | **12/41 = 29%** |
| 同上：选上掩体 / 验证过 / 在跑周期 | 4 / 4 / 4 | **12 / 12 / 10** |
| 同上：守位上够得着掩体 | 15/32 | **24/31** |
| 同上：没选上掩体的人一次 Query 的候选数 | 1 个，最近隐蔽位 3.7–7.9 m | **4–9 个，最近隐蔽位 2.4–4.3 m** |
| 全关登记掩体点 | 165 | **260** |
| 白盒静态几何 draw call（合批后网格数） | 144 | **144**（`cover` 桶已存在，不新增分桶） |
| 白盒静态几何三角形 | 915,192 | 916,116（**+924**，+0.0009 M） |
| 静态碰撞体 | 754 | 849 |

**内容 + 同期大脑改动一起**（`Script_FarEnemyProbe`，开战 20 s）：

| | master | 内容 only | 内容 + 大脑 |
|---|---|---|---|
| 46–74 m 档「身上有掩体」 | 2/31 = 6.5% | 2/28 | **13/24 = 54.2%** |
| <46 m 档「身上有掩体」 | 5/10 | 5/11 | **15/18** |
| 46–74 m 档「四秒没挪窝」 | 23/31 | 21/28 | **7/24** |

单放掩体不动这条曲线：那一档 21 个人停在跃进线上、`scriptDefensive`，Query 已经**找得到**
（候选 1 → 4–9 个，见上表），差的是大脑肯不肯去用。两件事必须一起落，缺一半都白做。

三角形预算按 `SCENE_RENDER_LIMITS`（8.10 M / 5000 draw call）；院落回望前沿那一帧的贴线情况见
[敌军 AI](Data_EnemyAi.md) §13.4 第 4 条，本轮几何增量相对那 8 M 是千分之一量级。

`Script_FirstLevelFrameProbe --strict` 前沿两机位（3394×1348、high，实拍那棵树同时带着同期的大脑改动）：
三角形 3.43 M → 3.40 M（front）、1.97 M → 1.98 M（frontEast）；draw call 591 → 614、501 → 536。
**这 20–35 个 draw call 不是新几何**——静态世界前后都是 144 只合批网格（上表，纯 Node 直接建场量的）；
同一帧里 skinned 111 → 120、instanced 174 → 258，是打法变了之后活人 / 尸体分布不同
（两次实拍活着的日军总数 49 → 51）。

## 不挡玩家的仗

从 `MISSION_ANCHORS.gun`（站姿眼高 1.63）与 15 个 `FRONT_DEFENDERS`（蹲 1.0 / 卧 0.5）向北，
对四条跃进线每 4 m 采一个目标点、共 1856 条射线：

- 目标取**站姿胸口 1.4 m**（冲锋、探头、换位时的日军，也就是玩家真正要打的那个）：92.9% → **91.3%**，
  是改前的 **98.3%**，远高于 80% 的底线。
- 目标取**跪姿胸口 0.95 m**（贴在土埂后不动的那个）：84.7% → 46.0%。这一半正是本轮要的效果——
  跪在 1 m 土埂后面本来就该看不见；他一起身开火就回到上面那一行。

八条南北走廊同时是国军的射界；交通壕、机枪位、担架路线（`MISSION_ROUTES`）与战车推进线上一块新体块都没有，
`Script_FirstLevelMissionTest` 逐条走过。

## 规则与验收

- 数据：`Data_FirstLevelMissionFront.FRONT_COVER`（排 / 列 / 间距 / 内缩）、`FRONT_FIELD_MEN`（前沿全部人）、
  `FRONT_ASSAULT_STARTS` + `FrontAssaultLaneCuts`（跃进线名单与切割查询）。
- 生成：`Data_FirstLevelMissionLayout` 末段的 `FieldCover()`——地基按九点取最低角下挖 0.06 m，
  不会有土埂浮在田垄上；法线 `faceZ:+1` 朝南，`Script_AiCover` 把掩体法线当**无符号墙面轴**读（见其头注），
  所以正负是写给人看的，打分只吃 `|dot|`。
- 验收：`Script_FirstLevelMissionTest.mjs`（列宽 / 列不重叠 / 落点不在列内 / 高度带 / 点间距 / 地基贴坡 /
  四条线覆盖率 ≥ 70% / 战车推进线净空），另跑 `Script_FirstLevelWhiteboxTest`、
  `Script_FirstLevelP012TerrainTest`、`Script_FirstLevelWhiteboxSurfaceTest`、`Script_WallPlanTest`、
  `Script_AiCoverTest`、`Script_TextTest`、`Script_ModuleGraphTest`、`Script_AiBehaviorTest` 全绿。
- 取证：`node Taierzhuang1938/_shots/EnemyAi/Script_FarEnemyProbe.mjs`（按距离分档）、
  `node Taierzhuang1938/Script_FirstLevelFrameProbe.mjs --strict --views=front,frontEast`。
- 浏览器门禁：`Script_AiCombatBrowserTest.mjs`。只叠本页内容时 **11/11 全过**（⑤ 会绕：派活 270、
  绕出正面锥 138、最大偏角 108°）；它挑站点用的那堵墙是 `BundleParapet`(13,-118.9)，本轮没动。

## 已知与遗留

- `FieldRuin1`（28,-158，长 9 m）横在战车默认推进线上，早于本轮，未动；战车是纯插值前进、不做碰撞回退，
  所以那是既有的穿模。新的四排一块都不在战车三条推进线（destination x = 28 / 36 / 43）上。
- 掩体点仍是「一块盒子一个点」。长条既有掩体（`FieldRuin0` 10 m、`FieldRuin1` 9 m）因此各只有一个点，
  一次只能服务一个人；把长条按长度撒多点要改 `Script_FirstLevelWhiteboxField` 的 block → cover 生产，
  本轮改用短段落规避，没有动那条通用路径。
- 走廊最窄两条只有 2.0 m（WestFarm/WestGrave 之间、WestGrave/Ruin 之间）。实际盒面之间是 4.8 m，
  但如果以后要在那两处加东西，先看 `minColumnM` 那条断言。
- 通视那一节量的是「国军眼位 → 日军躯干」的射线，是几何账不是玩法账；真正要看的是玩家实机
  是否还打得动前沿，那属于视觉/手感验收，本轮没有实机试玩证据。
