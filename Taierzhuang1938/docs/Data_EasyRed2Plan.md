# 对标 Easy Red 2 的改造方案

> 本方案基于对仓库现状的实读，不是从零设计。读过：`Script_Post.mjs` / `Script_Sky.mjs` / `Script_Light.mjs` / `Script_Materials.mjs` / `Script_TexBake.mjs` / `Script_Geo.mjs` / `Script_World.mjs` / `Script_Battlefield.mjs` / `Script_Ai.mjs` / `Script_Player.mjs` / `Script_Hud.mjs` / `Script_Actor.mjs`（含 `ActorFactory`）/ `Script_Vfx.mjs` / `Script_Audio.mjs` / `Script_Viewmodel.mjs` / `Script_Probe.mjs` / `Script_ShotTest.mjs` / `Script_DevServer.mjs`，以及 `Data_Battle.mjs` / `Data_Levels.mjs` / `Data_Weapons.mjs` / `Data_Script.mjs` / `Data_History.mjs` 与 `docs/Data_HistoryMaterial.md` 第四、五节。

---

# 〇、先说一句最重要的现状判断

**ER2 化的改造已经开了头，但停在了"有零件、没整机"。**

`Data_Battle.mjs` 已经把 ER2 的结构骨架写进去了（WORLD / TOWN / OBJECTIVES ×8 / PHASES ×6 / REINFORCE / NAME_POOL / SCALE_PRESETS / ORDERS / SUPPORT / COMBAT），`Script_Battlefield.mjs` 已经能分帧生成整座城（`BuildSteps()` 生成器 + `objectives` 数组 + `spawnPoints` 空壳），`Script_Ai.mjs` 已经有 `AiDirector` 的分帧决策、`holdZone` 守点纪律、`laneOffset` 反 Conga Line，`Script_Hud.mjs` 已经有 `ShowDeathCard` / `UpdateMarkers` / `UpdateMinimap`。

但是：

1. **没有入口**。全项目只有 `Probe.html`，没有 `index.html`，没有 `Script_Main.mjs`。而 `Script_ShotTest.mjs` 的 `GAME_SHOTS` 已经写死了"由 index.html 的 debug 接口驱动（Script_Main 暴露 window.Taierzhuang）"——工具在等一个还不存在的文件。
2. **没有规则层**。占领点在 `Battlefield.objectives` 里躺着，`progress` 字段初始化了但**没有任何代码去推它**；`spawnPoints` 是两个空数组；`PHASES` 没有任何东西去消费；`REINFORCE` / `SUPPORT` / `ORDERS` 三张表都没有 importer。
3. **`Data_Levels.mjs` 已经是孤儿**（全仓库无 importer），它是线性关卡时代的遗物。
4. **`Data_Script.mjs` 的触发式还是线性的**（`wave:N` / `waveClear:N` / `event:MengDown`），在开放战场上这三种触发大部分永远不会发生。
5. **兵员池的数值口径是错的**（见第二节）——`nraPool: 900` 这种量级在同屏 70 人的战场上永远耗不完，"死亡有代价"这条设计目标会直接落空。

所以这份方案的重点不是"推倒重来"，而是：**补上规则层与入口，把已经写好的数据表接上电，同时修掉三处会让 ER2 化失败的具体错误**（兵员池口径、远景人群渲染、剧本触发式）。渲染管线、程序化贴图、天空 IBL、世界几何生成器一行都不动。

---

# 一、战场地图

## 1.1 世界尺寸：认下现有的 1:2.2 缩尺，但补一层"细节壳"

台儿庄实测东西 1.1 km、南北 1.0 km。`Data_Battle.mjs` 已经定了 **500 × 460 m**（`minX -250..250`，`minZ -230..230`，`groundSize 620`，`detailRadius 170`），缩尺 1:2.2，**街巷宽度与房屋尺寸 1:1 不缩**。

这个决定是对的，我不改，理由要写清楚以免下一轮有人手痒去改：

- 巷战的体感全部来自「门有多宽、墙有多高、隔一堵墙有多近」。院墙 2.2 m 缩成 1 m，这仗立刻变成玩具兵。
- 缩的是**街区数量**：史实八条街 → 现在 `STREETS_NS` 五条 + `STREETS_EW` 四条，437 个巷口 → 按 `PlanCompounds()` 现在的切法约 140 个路口。玩家感觉不出少了三条街，但一定感觉得出墙矮了半米。
- 500 × 460 m 在 55 fps 预算下是可行的**上限**，不是舒适值。真正保住帧率的不是尺寸，是可视距离——雾 + 三层细节壳把有效渲染范围压到 200 m 以内。

**要补的是三层细节壳**（现在只有两层：`detailRadius 170` 内出全院落，外面 `AddSilhouetteBlock` 出体块）：

| 层 | 距玩家 | 内容 | 每院落三角形量级 |
|---|---|---|---|
| L0 全细节 | 0 – 90 m | `AddCompound` 全套：房、院墙、门楼、窗、廊、屋脊、道具 | 1800 – 3200 |
| L1 体块 | 90 – 200 m | 主房体块 + 两坡屋顶 + 院墙一圈（现有 `AddSilhouetteBlock` 加一圈墙） | 180 – 260 |
| L2 剪影环 | 200 – 600 m | 城外的村落／树线／远处火场，单色 `MeshBasicMaterial` + fog，`castShadow=false` | 20 – 60 |

L2 是**新增**的，目的不是好看，是**堵地平线的洞**。现在 `groundSize 620` 之外什么都没有，玩家一站上寨墙往北看就是一条硬边。ER2 的地平线永远有一条比天空稍深的剪影带，这条带子成本极低（一次 InstancedMesh）但它是"这仗打在一个真实的地方"的唯一证据。

**壳的切换必须按玩家位置增量重建**，不是每帧算。做法：把 `PlanCompounds()` 产出的 cell 表按 40 m 网格分桶，玩家跨桶时才重建受影响的 8 个邻桶，每次重建走 `BuildSteps()` 同款的分帧 yield。

## 1.2 分区（7 个）

坐标系沿用 `Data_Battle.mjs`：X 向东，Z 向南，寨墙在北（−Z），运河在南（+Z）。

| 区 | 范围 | 性格 | 战术意义 |
|---|---|---|---|
| **A 北墙带** | z −190 … −150 | 4 m 寨墙 + 护城河（离墙 9 m、宽 10 m、深 2 m）+ 中正门、承恩门 | 唯一的开阔射界。墙上视野好但被掷弹筒曲射克制 |
| **B 北市街（废墟带）** | z −150 … −80 | 破坏度 0.7–0.94，半数院落烧塌 | 掩体多、视线短、坦克进不来。日军的突入方向 |
| **C 中心街区** | z −80 … −20 | 清真寺（186 团指挥所）为核心，破坏度 0.4–0.6 | 全图的枢纽，四条路通向它 |
| **D 西城** | x < −120 | 文昌阁 + 西门 | 西门是全城对外唯一通路（除浮桥）。丢了这里就成扎死的口袋 |
| **E 东城** | x > 100 | 新关帝庙（山西会馆，31 师师部）+ 戏楼 | 全图最高的木构，制高点 |
| **F 南市街** | z 60 … 160 | 火车站（台枣支线终点）+ 粮栈 | 铁道路基是唯一的长直射界，也是唯一的东西向快速通道 |
| **G 南墙与运河** | z 160 … 232 | 惠迪吉门 + 唯一一道浮桥 | 不是占领点，是**败北线**（见 1.4） |

破坏梯度已经在 `Script_Battlefield.mjs` 的 `DamageAt()` 里按 northness 做了，这条保留——**均匀撒破损等于看不出战线在哪**，这是现有代码里最值得表扬的一处。

## 1.3 占领点：8 个，每阶段只激活 2–4 个

沿用 `Data_Battle.OBJECTIVES` 的 8 个，改两处：

1. **`NorthEast 东北角` 改名并移位到 `ChengEn 承恩门（小北门）`**，坐标从 (150, −160) 改到 (128, −172)，对齐 `TOWN.gates` 里已有的 `ChengEn` 门位。现在这两个东西各占一个位置，玩家会疑惑"东北角"和"小北门"是不是两个地方。
2. **每个占领点补 `captureSeconds` 字段**，按 `value` 定：`captureSeconds = 12 + value * 4.4`（value 2 → 21 s，value 5 → 34 s）。ER2 的编辑器就是半径和占领时间分开手调，大点慢、小点快。

| id | 名字 | 坐标 | 半径 | value | 挂的史实 |
|---|---|---|---|---|---|
| NorthGate | 中正门 | (−14, −178) | 26 | 3 | 三月二十四日起飞机重炮战车集中砸这一处 |
| ChengEn | 承恩门 | (128, −172) | 24 | 2 | 三月二十七日日军先占此段城墙，一部突入 |
| NorthWest | 西北角 | (−178, −132) | 24 | 4 | 二十八日转攻西北角，要夺西门 |
| Mosque | 清真寺 | (46, −54) | 28 | 5 | 186 团指挥所，拉锯七天七夜，弹孔墙 |
| WenchangPavilion | 文昌阁 | (−110, 20) | 22 | 3 | 王冠五派特务连七十二人来复，殉国十四人 |
| Station | 火车站 | (−160, 140) | 26 | 3 | 台枣支线终点，光绪二十五年建，此役烧毁 |
| GuandiTemple | 新关帝庙 | (148, 96) | 26 | 4 | 山西会馆，池峰城师部。退到这儿身后就是运河 |
| SouthGate | 惠迪吉门 | (−30, 184) | 24 | 5 | 出门就是浮桥，全城唯一退路与补给线 |

**占领判定**（ER2 式，不发明新东西）：
- 每 0.25 s 对每个**激活的**占领点做一次半径内单位统计，走 `Battlefield` 已有的 10 m 空间散列 grid，不做 O(n²)。
- 攻方 > 0 且守方 = 0 → `progress` 向攻方走 `dt / captureSeconds`；双方都在 → **冻结**并置 `contested = true`（HUD 上进度条变成斜纹）。
- 只有攻方在区内、且 `progress` 打穿到 0 或 1 才易主。**允许反夺**——ER2 的原话是「多点可选时防守方总能反夺已失点」，台儿庄的「白天丢、夜里夺回来」跟这条是同一件事。
- 易主瞬间：区内劣势方 40% 概率被打散（不是投降，见第四节），播 `OBJECTIVES[i].line`，弹 `HISTORY_NOTES[note]` 卡片。

## 1.4 双方出生点与前线推进

**日军出生点**（`Battlefield.spawnPoints.ija`，现在是空数组，必须填）：

- 基础三处，在寨墙外 30–60 m：`north` (−14, −224)、`northeast` (128, −218)、`northwest` (−200, −168)。哪几处激活由 `PHASES[i].ijaSpawn` 决定（数据已有）。
- **一旦某个北线占领点被日军拿下，该方向的出生点前移到该点以北 34 m**。这是 ER2「你死了回来发现那个点已经丢了」的物理基础——不前移，日军就永远在跑路，玩家永远在打赶路的人（ER2 被骂最狠的毛病之一）。

**中国军队出生点**（`spawnPoints.nra`）：

- 不是固定点，是**动态选取**：所有己方仍控制的占领点中，取离当前"前线"最近的一个，在其半径 0.6 倍处、背对前线的一侧出生。
- 玩家换人时用同一套逻辑，但优先"你原来那个班还有活人的位置"（见第二节）。

**前线是一个数**，不是一条曲线。维护 `frontZ = Σ(已失守目标的 z × value) / Σ(value)`，每 2 s 更新一次。它驱动四件事，全部零渲染成本：

1. 日军出生点前移的判定；
2. `DamageAt()` 的重刷（前线过去的地方，破坏度往上抬，配合 `Vfx.Explosion` 留下的坑）；
3. `Vfx.SmokeSource` 的持久烟柱位置——**烟柱是玩家唯一的远距离战场读数**，前线在哪，天上的烟就在哪；
4. `Audio` 的环境交火方位（远处枪声的 Panner 方位跟着 frontZ 走）。

这就是 ER2 的 Push the Frontline 用一个整数做出整套战略层的那个技巧，成本一个 float。

**运河浮桥不是占领点，是败北线**：日军任一单位进入浮桥 24 m 半径且持续 20 s → 战役失败（"补给线断了"）。同时它是兵员池的补充口——`SouthGate` 在己方手里时，阶段间补给按满额给；丢了则补给砍半。这比再放一个占领点在那里有力得多，也是史实：浮桥的分量不在于隔开指挥层，在于它是全城唯一的退路与补给线。

---

# 二、"死了换一个人接着打"

## 2.1 这条机制在台儿庄的思想重量

ER2 这一招的本质是**把玩家从主角降级成一个零件**。孙连仲的命令原话把这件事说得比任何游戏设计文档都清楚：

> 「士兵打完了，你自己填上去。你填过了，我来填。」

这句话本身就是一条状态机描述。它不是一句台词，它是**换人机制的规格说明**。所以这条机制在本作里不是"抄 ER2"，是**把史料直接实装**。它咬合的主题是：台儿庄不是靠一个人守住的——玩家最后会发现，自己在这场仗里操作过十几个不同的人，每一个都有名字有籍贯，每一个都死了，而城还在。这个体验只有换人机制能给，剧本给不了。

`Data_Battle.REINFORCE` 的注释里已经把这句话写上了，做得对。现在要做的是让它真的成为机制。

## 2.2 兵员池的数值必须重标定（现有数值是错的）

`PHASES` 里现在写的是 `nraPool: 900 / 760 / 600 / 520 / 380 / 520`。这组数字是**史实的师级兵力量级**，直接当票用会出事：同屏 70 人（NRA 侧 32 人）、一阶段 5 分钟，NRA 侧阵亡率峰值大约每 4 秒 1 人，一阶段死 60–90 人。池子 900 永远耗不完，"死亡有代价"这条设计目标当场落空。

**改成两层账，这是本方案的关键修正：**

| 层 | 字段 | 量级 | 作用 |
|---|---|---|---|
| **战术池**（票） | `PHASES[i].unitPool` | 130 / 115 / 100 / 78 / 62 / 90 | 真正的票。每有一名己方单位阵亡扣 1。归零即败 |
| **叙事账**（名册） | `Roster.fallen[]` 累积 | 全程 400–600 条 | 只累积不消耗，用于阵亡名单、结算、籍贯统计 |

阶段间补给照抄 ER2 的橡皮筋，但按史实压紧。现有的 `phaseRefill` 公式量级也得跟着改：

```js
phaseRefill: (current, max) => Math.min(max, current + Math.round(max * 0.10 + (max - current) * 0.22))
```

打得惨补得多、打得顺补得少，玩家察觉不到但不会被劝退。**`SouthGate` 丢了则补给 × 0.5**（浮桥断了）。

**信息不对称照抄 ER2**：`REINFORCE.intelRequiresZone = true` 已经写了。玩家只有站在占领区内时才看得见对面还剩多少人，平时 HUD 上那一栏是"——"。这把侦察变成真实收益，不是白送的 UI。

## 2.3 换人流程（具体到秒）

死亡 → 相机脱离，锁定在尸体上方 2.4 m 缓慢上升 → **阵亡卡片 2.6 s**（`REINFORCE.deathCardSeconds` 已有，`Hud.ShowDeathCard` 已有）：

```
张德山
河北景县 · 一九一五 — 一九三八
第三十一师 一八六团 三营九连 三班
汉阳造
```

然后按下面的顺位接管：

1. **优先：你原来那个班还活着的人**（同 `squadId`，取离前线最近的一个）。切换耗时 0，因为"这个人一直在打"。这是 ER2 的 `setPlayer()`。
2. **班里没人了**：从战术池抽一个**新编入的四人小组**，在最近的己方占领点出生，**额外扣 4 票**（补一个班的代价），出生延迟 `respawnDelayS 4.5` + 4 s = **8.5 s**。
3. **重生后 3 s 无敌**（ER2 有这条，防出生点秒杀），HUD 上不显示，靠一层极淡的边缘暖光提示。

这个设计的用意：**死在班全灭的位置，代价明显高于死在班还在打的位置**。玩家会自发地学会不要一个人往前冲——这是用经济系统教战术，不是用提示框教。

## 2.4 随时换人（不只是死后）

ER2 按住 X 开径向菜单切换班组成员。这里简化：**按住 X 显示本班活人列表（DOM，一列名字 + 距离 + 武器），松开时切到高亮那个**。用途有两个，都很重要：

- **换枪**：你手上是汉阳造，班里有人拿着 ZB-26，需要压制的时候切过去。杂牌部队一个班里至少三种枪，这是史实（`Data_Weapons` 的 `LOADOUTS` 已经按这个做了），也是玩法。
- **换位置**：你被压在街这头，班里有人已经摸到街那头，切过去等于瞬移——但你留下的那个人会立刻变成 AI，可能就死了。这个取舍很好。

## 2.5 见底：最后一手

`REINFORCE.lastDitchAt = 0.12` 已经写了。池子跌破 12% 时：

- 新出生的人 `kind` 换成担架兵／炊事兵／伙夫（`ActorFactory` 的 `KIND_SPEC` 要补两个变体，或者复用 `nra` 改配色 + 去掉弹药袋），武器降级为大刀 + 手榴弹或汉阳造；
- HUD 打出 `lastDitchLine`：「担架兵、炊事兵、伙夫，能拿枪的都上来了。团部现在没有后方了。」
- 池子跌破 30% 时（**第一次，只播一次**）自动播孙连仲那通电话的原话。机制和台词在同一个时刻咬死——这是全作叙事与玩法结合最紧的一个点，不要挪到别处。

---

# 三、指挥系统

## 3.1 交互：不做轮盘

ER2 的 TAB 轮盘在浏览器上是坏主意——鼠标已经被指针锁定占用，轮盘要么打断锁定要么做成相对位移的二段判定，两条都难受。**改成双路并行**：

- **主路：数字键 1–6 直接下令**（`ORDERS` 已经带 `key` 字段）。落点 = 准星射线命中点，走 `Battlefield.Raycast(origin, dir, 200)`（已实装）。零延迟，老玩家不需要看菜单。
- **辅路：按住 Q** → 屏幕下缘出一条 6 格横条（纯 DOM，零 3D 开销），显示 label + hint，松开 Q 关闭。新玩家看一眼就知道有哪几条。

六条命令沿用 `Data_Battle.ORDERS`，一条不加：跟我来 / 向前 / 固守 / 散开 / 绕过去 / 上刺刀。`AiDirector.IssueOrder()` 已经实现了前四条，需要补 `flank`（绕过去）和 `charge`（上刺刀）。

## 3.2 下令是要**喊**的

这是我建议加的一条，成本极低、张力极高：**下令会发出喊声**（`Audio` 已有 HRTF Panner 与距离低通）。喊声给附近敌方 AI 一个权重 0.6 的听觉线索——不暴露精确位置，但会让那个方向的日军提高警觉、把搜索扇面转过来。

于是"要不要下令"变成一个真实的决策：你想让弟兄们绕过去，就得先喊出来，喊出来对面就知道这边有人。这比任何冷却条都有戏剧性，而且它是**免费的**——`AiDirector.Think()` 里已经有搜敌逻辑，只需要加一个 `hearing` 事件源。

「上刺刀」额外附带全班的喊杀声与 `Actor` 的上刺刀动作。白刃冲锋对台儿庄是文化上的必做项，不是可选项。

## 3.3 指挥权顺位

**玩家接管的士兵不一定有权下令**。只有当你是班里资历最老的活人时，才能下 5（绕过去）、6（上刺刀）两条——这两条要求全班协同，一个新兵喊不动。1–4 谁都能下（那四条本质是"跟我走""趴下""散开"，喊一嗓子就行）。

顺位：班长 → 机枪手（持 ZB-26 的那个）→ 老兵（`identity.age > 26`）→ 新兵。班长阵亡时自动移交，HUD 左上角打一行「你现在是三班班长」。ER2 有这条，而在台儿庄它有额外分量：指挥权一层一层往下掉，正是"你填过了，我来填"的另一面。

## 3.4 支援：不对称就是史实，也是玩法张力

### 中方——链路可断，而且比 ER2 的无线电更硬

第 2 集团军**没有班组无线电**。团营之间靠**有线电话与传令兵**。这个史实比 ER2 的无线员设定更狠，直接用：

| 支援 | 数量 | 链路 | 延迟 | 效果 |
|---|---|---|---|---|
| **二十年式 82 mm 迫击炮** | **全战役 2 发**（不是每阶段 2 发） | 必须在**电话点**旁按 F，或派传令兵 | 电话 9 s；传令兵单程 12–18 s | radius 14，damage 95 |
| **传令兵要人** | 3 次，冷却 70 s | 派出一名本班士兵 | 14 s | 回补一个 4 人小组 |
| **手榴弹补给** | 无限 | 街垒／粮包处捡，不呼叫 | 0 | 手榴弹是台儿庄真正的主战兵器 |

**电话点有两处**：清真寺（186 团团部）、新关帝庙（31 师师部）。这两处同时是占领点、是剧情点、是支援点——**一个地方承担三种功能**，这是开放战场设计里最省的做法，也让"守住清真寺"这件事有了三重理由。

**传令兵链路可断**：你派出去的是一个具体的人（有名字），他跑的路上会被打死。他死了，这次呼叫就没了，冷却照走。ER2 无线员中弹那一刻全班永远失去炮火支援——我们这里更具体：那个人叫什么名字，死在哪条巷子里，会进阵亡名单。

**全战役 2 发迫击炮**这个数字是刻意的。ER2 用"链路可断"代替"冷却读秒"，我们在链路之上再加一层绝对稀缺。玩家会为"这一发打哪里"纠结整整一局——这正是第 2 集团军"严重缺乏"迫击炮的体感。

### 日方——充足，且**没有 UI**

日方支援由 `SupportSystem` 按 `PHASES[i].ijaSupport` 定时发动，玩家无法阻止，只能躲：

| 支援 | 间隔 | 预警 | 半径 / 伤害 | 表现 |
|---|---|---|---|---|
| 八九式重掷弹筒 | 14 s | 1.6 s | 5 / 110 | 发射端一声闷"咚"（有方位），落点先出 `Vfx.IncomingMarker` 尘环 |
| 九二式重机 | 常驻 | — | 压制流 | "野鸡脖子"的慢节奏点射，一下一下的 |
| 八九式中战车 | 阶段性 | 履带声 | — | **只走宽度 ≥ 2.5 m 的街**（见 3.5） |
| 野战重炮 | 42 s | 2.6 s | 11 / 160 | 远处炮口声 → 呼啸 → 落点 |

**日方支援不给任何 HUD**。玩家只能靠听。这个不对称本身就是叙事：你这边是"还剩 2 发"的实数，对面是无穷无尽且看不见的。ER2 的极简 HUD 哲学在这里正好服务于主题。

## 3.5 两条会自己长出来的规则

这两条都是史料直接转成的机制，不用额外美术：

1. **窄巷克制战车**：八九式中战车进不了宽度 < 2.5 m 的巷子。`Data_Levels.mjs` 的注释里已经写了这条（"这条是玩法规则，不是装饰"），要真的实装——坦克寻路只在主街（5.2 m）与次巷（2.4 m 中的宽段）网络上跑，夹道（1.5 m）永远进不去。于是"往巷子里退"变成一个真实且正确的战术。

2. **贴身战术抑制敌方炮火**：交战距离越近，日方掷弹筒／重炮越被抑制。具体：以玩家为中心 30 m 内存在活着的日军时，日方 `artillery` 完全停止、`launcher` 间隔 × 2.2。史料原话是"揪住敌人裤腰带打，大大抵销了日军飞机大炮的杀伤威力"。这条规则做出来之后，玩家会自己发现"贴上去反而更安全"——用规则教战术，一句提示都不用写。

---

# 四、压制、伤口、士气

## 4.1 压制：做；士气条：不做

这是 ER2 拆解里最反直觉也最值钱的一条发现——450 KB 官方日志里 morale 出现 0 次。ER2 用「一个连续标量（压制）+ 一组离散事件」替代了整套士气系统。照抄。

`Data_Battle.COMBAT` 已经有一组数值，我核过量级，基本可用，补三个字段：

```js
suppressPerNearMiss: 0.16,      // 已有：2.6 m 内飞过一发
suppressRadius: 2.6,            // 已有
suppressPerExplosion: 0.55,     // 新增：8 m 内爆炸，按距离线性衰减
suppressOnHit: 0.45,            // 新增：中弹（Soldier.TakeHit 里已经硬编码了 0.45，提到数据层）
suppressDecayPerS: 0.55,        // 已有
suppressAccuracyPenalty: 1.3,   // 已有：散布乘数上限
```

**玩家侧表现**（四档，全部零成本或接近零成本）：

| 压制值 | 画面 | 听觉 | 操作 |
|---|---|---|---|
| > 0.25 | `Script_Post` 的 `uVignette` 从 0.42 抬到 0.72，边缘去饱和 | — | — |
| > 0.45 | 暗角继续收，中心视野轻微缩窄 | 呼吸声加重 | 瞄准晃动振幅 × (1 + 1.3 s) |
| > 0.70 | 暗角到底 | 接 `Audio` 已有的**耳鸣低通总线**，高频被削掉 | 不能屏息、不能冲刺 |
| > 0.90 | 画面轻微抖 | 只剩低频 | 换弹速度 × 0.8 |

暗角用现成的 `uVignette` uniform 改一个数，耳鸣用现成的低通总线，晃动接 `Player.SwayAmount()`——**三样全是已有设施，一行新 shader 都不用写**。这是"压制系统必做"性价比最高的原因。

**AI 侧**（`AiDirector.Think()` 里加阈值分支）：

- \> 0.50 → 卧倒 + 找掩体（`FindCover()` 已实装，`allowFindCoverWhenSuppressed` 的等价物）
- \> 0.75 → 停火，只保持姿态
- \> 0.90 且 20 m 内无友军，持续 5 s → **往后缩**（撤到下一个己方控制点），不是投降

## 4.2 投降：中方不做，日方极低

这是必须踩住的一条红线。ER2 有完整的投降系统，但**台儿庄的中国守军不投降**——这不是美化，是史实（第 31 师最后余 1400 名，第 27 师余 2000 名，仗还在打）。把中方做成会投降的，整个作品的立场就塌了。

所以：

- **中方**：`surrenderRate = 0`。压制到极限的表现是**往后缩、被打散、拖着伤员退**，不是举手。
- **日方**：`surrenderRate = 0.03`，只在"所在占领点刚易主 + 压制 > 0.9 + 周围无日军"三条同时满足时触发。
- **不给杀降任何奖励**。杀降会让 30 m 内其余日军的 `morale` 反而上升（打死不降）。这条既是道德立场，也是玩法平衡。
- `COMBAT.moraleBreakAt = 0.25` 已有——班里活人低于 25% 就往后缩。这是**班级标量，不出 UI**，玩家永远看不到一个叫"士气"的数字。

## 4.3 伤口：三层

| 状态 | 触发 | 表现 | 出路 |
|---|---|---|---|
| **擦伤** | health 60–100 | 无 | 自愈到 60 封顶 |
| **负伤 Wounded** | health < 60，或 arm/leg 中弹 | 画面去饱和（`Post` 已有 `uDamage` 的边缘泛红 + 去色通路）、不能冲刺、按 `COMBAT.bleedPerWound` 持续掉血 | **B 键包扎 3.2 s**，绷带 2 个（`COMBAT.bandages` 已有）。包扎期间不能开火，喘息声会被 AI 听见 |
| **失能 Downed** | health ≤ 0 且命中部位是躯干／腿 → **40% 概率** | 倒地，视角贴地，**35 s 倒计时**，可以喊（按 F 呼救，暴露位置） | 弟兄会来**拖**（AI 会执行，拖到 8 m 外掩体后包扎）。救活后 health 45 且永久 Wounded 标记 |

头部命中、近距离命中、爆炸直接死，不进 Downed。

**拖伤员这条对台儿庄的叙事价值极高**——"把伤员拖回墙根后面"是一个很强的画面，而且它天然制造队友依赖：你救不了自己，只能等人来。`Script_Actor.mjs` 已经有 `Ragdoll()`，Downed 只需要一个介于站立和 ragdoll 之间的姿态，成本很低。

ER2 那套"诊断—匹配器械"的医疗小游戏**不做**——第 2 集团军没有编制医护兵，简化成"拖到掩体后按住 F 包扎 4 s"，符合实际也少一套 UI。

---

# 五、AI 规模与性能

## 5.1 同屏预算

`Data_Battle.SCALE_PRESETS` 已经定了三档（40 / 70 / 110），`AiDirector` 的默认 `maxAlive = 56`。我的判断：

- **中档 70 人是"有战场感"的门槛**（NRA 32 + IJA 38）。低于 55 会明显觉得空。
- **不要追 ER2 的 140**。ER2 是 Unity + C# 多线程 + 原生代码，浏览器单线程 JS 大概吃 1/2。
- 三档保留，默认中档，**首帧后跑 3 s 性能探针自动推荐**（ER2 把这件事交给滑条，我们既给滑条也给自动降级）。

## 5.2 三档 LOD + 一层 InstancedMesh（这是必须补的一块）

`Script_Actor.mjs` 的 `ActorFactory` 已经支持 `quality: high/medium/low`，注释里写了"high≈20、medium≈16、low≈12 draw call 每人"。**问题：110 人 × 12 = 1320 draw call，直接爆。**

必须补第四档：**远处走共享 InstancedMesh**。

| 档 | 距离 | 实现 | 人数上限 | draw call |
|---|---|---|---|---|
| A 近 | 0 – 35 m | `ActorFactory` high | **6** | 6 × 20 = 120 |
| B 中 | 35 – 90 m | `ActorFactory` medium | **14** | 14 × 16 = 224 |
| C 远 | 90 – 200 m | **`CrowdRenderer` InstancedMesh** | 90 | **2**（一个躯干簇 + 一个腿簇） |
| D 剔除 | > 200 m | 只跑逻辑，不渲染 | — | 0 |

C 档的实现要点（这是新模块 `Script_Crowd.mjs` 的核心）：

- 每人 1 个实例，几何是**预合并的 4 盒子人形**（躯干+头 / 两腿 / 步枪），共三个 InstancedMesh，或压成两个。
- 姿态只有 **站 / 蹲 / 卧 / 倒** 四态，用 `instanceMatrix` 的 y 缩放 + 平移表达，不做行走动画——90 m 外没人看得出腿在不在动。
- 阵营用 `instanceColor` 区分（中方土黄 vs 日军黄绿褐）。
- **每 3 帧更新一次矩阵**，不是每帧。90 个矩阵 × 1/3 帧率的上传量可以忽略。
- 档位切换有 6 m 迟滞带，防止玩家在 35 m 线上来回走时反复重建 Actor。

**总 draw call 预算**（1600 × 900，55 fps 目标）：

```
场景（BuildSink 按材质合批）    ~40
人物 A+B+C                     ~346
VFX（InstancedMesh 粒子）       ~12
Viewmodel（双手+枪）            ~20
天空 + 剪影环                    ~4
────────────────────────────────
合计                           ~422
```

这个数在桌面 Chrome 上是能跑的。留 20% 余量。

## 5.3 分帧与缓存（现有的保留，补两条）

已实装、保留：
- **AI 决策分帧 1/6**（`AiDirector.Update()` 里 `i % 6 === slice`）——80 人每帧只做 13 次决策。
- **视线检测走 `Battlefield.Raycast`（AABB 空间散列）+ 0.25 s 结果缓存**（`Soldier.losCache`）。
- **`laneOffset` 反 Conga Line**、**`holdZone` 守点纪律**、**尸体上限 26**。

要补：
- **占领点统计降到 4 Hz**，不是每帧。
- **90 m 外的尸体立刻删除**，不占 26 个名额。
- **`PerfGovernor` 自动降级**：连续 30 帧 frameTime > 20 ms → `maxAlive − 12`、B 档上限 − 4、阴影 4096 → 2048、SSAO 半分辨率；连续 120 帧 < 14 ms → 反向升一档。降级要有 8 s 冷却，防止在阈值上抖动。

## 5.4 明确要避开 ER2 的四个坑

ER2 用了五年没完全修好的结构性问题，我们第一天就绕开：

1. **AI 不会守点**（最致命）：`holdZone` 已经写了硬规矩——一旦被派去守某区，除非死亡不许离开半径，交战只允许在区内换位。**这条绝对不能为了"AI 看起来更聪明"而放宽。**
2. **AI 扎堆**：`laneOffset` 已有，再补路径跟随时的 8–12 m 随机侧向抖动。
3. **AI 开透视**：AI 的命中判定必须走同一套 `Battlefield.Raycast`，不给特权。距离 > 120 m 的精度按平方衰减，并加"先打近的"硬规则。
4. **单线推点的重复感**：**每个阶段至少给两条可选进攻路线**。例：清真寺可以从北面主街正面顶，也可以从东侧的次巷网络绕（`PlanCompounds` 生成的 2.4 m 巷已经具备这个拓扑）。这一条要在 `PHASES` 里显式标注 `routes: ["主街", "东巷"]`，让关卡验收时能逐条走查。

---

# 六、史实剧情怎么保留

## 6.1 立场：一个过场动画都不做，但剧本一句都不丢

`Data_Script.mjs` 顶部那 11 条编剧红线（长官叫兵「弟兄们」、不写「全军覆没」、不打精确歼敌数、日军还是立领昭五式没有屁帘、「命都不要了还要钱干什么」只能以旁白「据载」出现……）**一条不动，全部保留**。`CAST`、`MENU`、`CREDITS` 全部保留。要改的只有一件事：**触发方式**。

现在的触发式是线性的：`wave:N`、`waveClear:N`、`event:MengDown`。在开放战场上，"第 3 波"这个概念不存在了。改造成四层叙事，全部挂在空间与战况上：

## 6.2 第一层：阶段幕布（唯一允许打断玩法的东西）

6 个 `PHASES` 各一张。黑底白字 4 s，可按任意键跳过。内容 = `PHASES[i].brief`（已有）+ `Data_History.BATTLE_TIMELINE` 里对应日期那一条 + tier 标签。

```
一九三八年三月二十七日 晨五时三十分
日军突入城内。第 31 师转入城内攻防 —— 时人叫它「室战墙战」。
                                              〔信史〕
```

**tier 标签一定要出**。它是这个作品跟一般抗战题材的区别所在：告诉玩家哪句是信史、哪句是主流记载、哪句是流传待考。

## 6.3 第二层：占领点事件（叙事的主体）

每个占领点绑三个触发时机，`OBJECTIVES` 里已经有 `line` 和 `note` 两个字段，够用：

| 时机 | 内容 | 例（清真寺） |
|---|---|---|
| **首次进入半径** | 地点旁白（`line`） | 「一八六团指挥所。中日双方在这座乾隆七年的院子里拉锯了七天七夜。」 |
| **占领成功** | `HISTORY_NOTES[note]` 卡片 | 弹卡片：弹孔墙、西小讲堂南外墙每平方米上百个弹孔、1988 年被中国革命博物馆收藏定为一级文物 |
| **失守** | 班里人的一句台词 | 「团部……团部还在里头。」 |

**建模警告要执行**：1938 年的清真寺**没有那座 28 m 望月楼**（1942 年重修才增建）。`Script_World.AddMosque()` 目前是中式硬山院落群，是对的，别有人后来"补个尖塔"。

## 6.4 第三层：听筒里的命令（把原剧本的电话落地）

**两部野战电话**：清真寺（186 团团部）、新关帝庙（31 师师部）。走到旁边按 F 接听，播一段真实电话内容。**不接也能打完全场**——这是可选的深度，不是必经的关卡。

关键排布：

- **四月四日那通电话挂在 P5 的新关帝庙**：孙连仲报伤亡逾十分之七、请求退过运河；李宗仁不准，令其死守待援。这是全作情绪的顶点，而且它是「主流记载」tier，语气要按史料给的分寸来。
- **孙连仲那句「士兵打完了，你自己填上去。你填过了，我来填」不挂在电话上**，挂在**兵员池第一次跌破 30% 的那一瞬间自动播**。机制和台词咬死在同一秒——这是全作叙事与玩法结合最紧的一处，别挪。
- 王冠五（186 团团长，玩家的直接长官）的命令挂在清真寺电话。**玩家在城内的直接长官是王冠五，不是池峰城**——这条红线在 `Data_Script.mjs` 里写了，实装时不能串。

## 6.5 第四层：涌现叙事（不写一句台词）

- **阵亡名单**。每阶段结束打一次："这一段，三十七个人。河北十一，河南九，陕西六，山东五，其他六。" 结算时打全场名单，玩家亲自操作过的人标一颗星。
- **持久烟柱**就是战况读数，不需要文字。
- **P6 全线反攻的结算必须按史实写**：不是"歼灭"，是**日军两个支队接到转进命令、濑谷支队长甚至系独断离脱，主力撤到峄县枣庄**；中方总攻与日方撤退命令在时间上高度重叠——这是双方叙事分歧的根源，回避它反而不真实。结算屏**不出精确歼敌数**，不打"缴获坦克四十辆"（该方向装甲车辆总量级是战车 7 + 豆战车 39）。

## 6.6 角色的处理：从"固定人物"改成"角色槽位"

开放战场上，一个叫刘振海的班长可能在第一分钟就死了，后面五十分钟他的台词全没了——这是把线性剧本硬搬到开放战场最容易翻车的地方。

**解法**：虚构人物改成**槽位**。

- `liu`（班长）是一个**槽位**，不是一个人。你第一个班长叫刘振海；他死了，下一个班长换名字（从 `NAME_POOL` 抽），但**槽位还在，台词照说**。"他倒了我上，我倒了你上"这句话由谁说都成立——**恰恰是换了人还在说，这句话才真的落地**。
- `meng`（连长）、`qin`（27 师增援兵）同理。
- **真实人物（王冠五、王范堂、陆诒、万有福）只在固定地点、固定阶段出现**，只做史料里有的事。这条不放宽。

## 6.7 `event:MengDown` 的处理

原剧本里"连长倒下"是一个脚本事件。改成 `squadLeaderDown`——**玩家的班长在任何时候战死都会触发**。那三句台词（「连长！——连长！」/「……长根，你听着。他倒了我上，我倒了你上。」/「这话不是我说的，是上头传下来的。一层一层传到咱们这儿，就这么一句。」）**就是换人机制的说明书**，放在玩家第一次真正体会到"人是会没的"那一刻，比放在脚本第 12 分钟有力得多。

---

# 七、施工顺序建议

不要一次全上。按能不能跑起来排：

**第一批（让它能玩）**：`index.html` + `Script_Main.mjs` + `Script_Objectives.mjs` + `Script_Roster.mjs` + `Script_Phases.mjs`，填 `Battlefield.spawnPoints`，`Data_Battle` 数值重标定。这一批做完，一局完整的"打点—死—换人—打完六个阶段"就能跑通了，虽然很糙。

**第二批（让它有战场感）**：`Script_Crowd.mjs` + `Script_Perf.mjs` + LOD 三档 + 剪影环。这一批是性能与规模，做完才能把 `maxAlive` 从 56 推到 70+。

**第三批（让它有分量）**：`Script_Orders.mjs` + `Script_Support.mjs` + `Script_Narrative.mjs` + `Data_Script` 触发式重映射 + 压制／伤口的表现层。

**第四批（打磨）**：窄巷克制战车、贴身抑制炮火、拖伤员、喊话听觉线索、阵亡名单结算屏。

每批之后跑一次 `Script_ShotTest.mjs`（`GAME_SHOTS` 要先改成 `phase=` 驱动），出图交视觉审查。


---

## 战场设计

世界取 500 × 460 m（WORLD.minX -250..250、minZ -230..230、groundSize 620），即台儿庄实测 1.1 × 1.0 km 的 1:2.2 缩尺；街巷宽度与房屋尺寸 1:1 不缩（主街 5.2 m、次巷 2.4 m、夹道 1.5 m、院墙 2.2 m、檐口 2.6 m、寨墙 4 m、门楼 7 m），缩的只是街区数量——史实八条街减到五条南北街 + 四条东西街，437 个巷口减到约 140 个路口。理由：巷战的体感全在「门有多宽、墙有多高、隔一堵墙有多近」，那一层缩了这仗就不像了。

55 fps 的保障不来自尺寸而来自可视距离，靠三层细节壳把有效渲染范围压到 200 m 以内：0—90 m 出全院落（AddCompound 全套，1800—3200 三角形/院）；90—200 m 只出体块 + 两坡屋顶 + 一圈院墙（180—260 三角形/院）；200—600 m 是新增的剪影环，单色 MeshBasicMaterial 吃雾、castShadow=false（20—60 三角形/院），作用是堵住地平线的洞。壳按 40 m 网格分桶，玩家跨桶才重建 8 个邻桶，走 BuildSteps 同款分帧 yield。

七个分区：A 北墙带（z −190…−150，寨墙 + 护城河宽 10 m 深 2 m 离墙 9 m + 中正门 + 承恩门，唯一的开阔射界）；B 北市街废墟带（z −150…−80，破坏度 0.7—0.94，掩体多视线短、坦克进不来，日军突入方向）；C 中心街区（z −80…−20，清真寺为核心的枢纽，四条路通向它）；D 西城（x < −120，文昌阁 + 西门，全城对外唯一通路）；E 东城（x > 100，新关帝庙山西会馆 + 戏楼，全图最高木构）；F 南市街（z 60…160，火车站 + 粮栈，铁道路基是唯一的长直射界）；G 南墙与运河（z 160…232，惠迪吉门 + 唯一一道浮桥）。破坏梯度按 northness 递减（DamageAt 已实装）——均匀撒破损等于看不出战线在哪。

八个占领点，每阶段只激活 2—4 个，captureSeconds = 12 + value×4.4：中正门 (−14,−178) r26 v3 / 承恩门（原「东北角」改名移位）(128,−172) r24 v2 / 西北角 (−178,−132) r24 v4 / 清真寺（186 团指挥所）(46,−54) r28 v5 / 文昌阁 (−110,20) r22 v3 / 火车站 (−160,140) r26 v3 / 新关帝庙（31 师师部）(148,96) r26 v4 / 惠迪吉门 (−30,184) r24 v5。占领判定 4 Hz，攻方在守方不在则进度按 dt/captureSeconds 走，双方都在则冻结并标 contested（进度条变斜纹），允许反夺——「白天丢、夜里夺回来」和 ER2 的反夺是同一件事。

运河浮桥不设占领点，它是败北线：日军单位进入 24 m 半径持续 20 s 即战役失败；同时它是补给口，惠迪吉门在己方手里则阶段间兵员补给按满额给，丢了砍半。这比再放一个占领点有力，也是史实——浮桥是全城唯一的退路与补给线。

日军出生点三处固定在寨墙外 30—60 m（north (−14,−224) / northeast (128,−218) / northwest (−200,−168)），按 PHASES[i].ijaSpawn 激活；北线占领点一旦失守，该方向出生点前移到该点以北 34 m——不前移玩家就永远在打赶路中的敌人，这正是 ER2 最被诟病的结构缺陷。中国军队出生点动态选取：仍控制的占领点中取离前线最近的一个，在半径 0.6 倍处、背对前线一侧出生。

前线是一个数不是一条曲线：frontZ = Σ(已失守目标 z × value) / Σ(value)，每 2 s 更新。它同时驱动四件事且全部零渲染成本——日军出生点前移判定、破坏梯度重刷、持久烟柱位置（烟柱是玩家唯一的远距离战场读数）、环境交火声的 Panner 方位。这就是 ER2 的 Push the Frontline 用一个整数做出整套战略层的技巧。

---

## 保留

- Script_Post.mjs —— HDR + ACES + 泛光 + SSAO + 体积光 + FXAA 全链路已跑通，且 MarkNoPrepass / uVignette / uDamage 三个口子正好是压制与伤口表现层要用的，一行不动
- Script_Sky.mjs —— 五个时段预设 + PMREM 程序化天空 IBL，PHASES 已经按 sky 字段引用（smokyDay/dawn/night/burningStreet），直接对接
- Script_Light.mjs —— LightRig 的 UpdateShadowFrustum(focus, forward) 正好是开放战场需要的跟随式阴影视锥；FlashMuzzle / AddFire 火光池给夜战与烟柱直接用
- Script_Materials.mjs + Script_TexBake.mjs —— 程序化 PBR 三图（albedo / normal+height / ORM）与十种配方，零外部资源这条底线保住了，不碰
- Script_Geo.mjs —— TILE_METERS / ScaleBoxUv / MakeBrokenWall / MergeGeometries / MakeInstanced / CarveCraters，是整个世界生成器的地基
- Script_World.mjs —— 鲁南四合院 AddCompound、寨墙 AddRampart、清真寺 AddMosque（正确地做成了 1938 年的中式硬山院落，没有 1942 年才有的望月楼）、门楼、街垒、水井、石磨，考据已经落到几何里了
- Script_Battlefield.mjs 的 BuildSteps() 分帧生成器 —— 一次性建完整座城会白屏十几秒，这个生成器结构是对的，增量重建细节壳要沿用同一套 yield 节奏
- Script_Battlefield.mjs 的 DamageAt() 破坏梯度 —— 越靠北越烂、靠近占领点更烂。均匀撒破损等于看不出战线在哪，这是现有代码里最值得表扬的一处设计
- Script_Battlefield.mjs 的 10 m 空间散列碰撞网格 + Raycast(origin, dir, maxDist) —— 占领点统计、AI 视线、命令落点拾取三处全靠它，不要换物理引擎
- Script_Ai.mjs 的 AiDirector 分帧决策（i % 6 === slice）—— 80 人每帧只做 13 次决策，这个结构是同屏规模的前提
- Script_Ai.mjs 的 Soldier.holdZone 守点纪律 —— ER2 被骂最狠的「AI 不进点、半路就地对射」，这里已经写了硬规矩，绝对不要为了让 AI 看起来更聪明而放宽
- Script_Ai.mjs 的 Soldier.laneOffset —— 反 Conga Line 的固定横向偏移，ER2 修了五年没根治的问题这里第一天就绕开了
- Script_Ai.mjs 的 Soldier.losCache（0.25 s 视线缓存）与 maxCorpses 尸体上限
- Script_Actor.mjs —— 全手搭骨架、零 SkinnedMesh（因为深度法线预通道用 overrideMaterial 覆盖全场，蒙皮会塌到原点让 SSAO 变乱码）。这个约束是硬的，Crowd 层的 InstancedMesh 方案也必须遵守
- Script_Actor.mjs 的 ActorFactory 三档 quality（high≈20 / medium≈16 / low≈12 draw call）与按 kind 缓存骨骼几何
- Script_Vfx.mjs —— 粒子位置在 vertex shader 里解析式求解、粒子在深度法线预通道隐身；MuzzleFlash / Tracer / Impact / Explosion / SmokeSource / IncomingMarker / Blood 这套 API 正好覆盖压制与支援的全部表现需求
- Script_Audio.mjs —— 全程序化合成、零音频文件；HRTF Panner + 距离低通 + 耳鸣低通总线，压制的听觉表现和喊话的听觉线索直接用现成设施
- Script_Viewmodel.mjs —— 第一人称双手与枪的全部手感，按 Data_Weapons 的考据尺寸做的，不动
- Script_Noise.mjs —— Mulberry32 / HashString / TileableFbm2，全项目零 Math.random 的基础（视觉审查靠逐轮截图比对，人物自己在抖就没法判断哪一版更好）
- Script_DevServer.mjs —— 显式 MIME 表绕开 Windows 注册表把 .js 映射成 text/plain 的坑
- Data_Weapons.mjs —— AMMO / WEAPONS / LOADOUTS / IJA_SQUAD，中方装备参差（汉阳造最多、中正式最少、轻机枪每班 0—1 挺）这条史实已经落进数据了
- Data_History.mjs —— TIER 三档可信度 / BATTLE_TIMELINE / HISTORY_NOTES / EPILOGUE_LINES，是叙事层的唯一史料背书源
- Data_Script.mjs 的 CAST / MENU / CREDITS 与顶部 11 条编剧红线 —— 台词内容与立场一句不改，只改触发方式
- Data_Battle.mjs 的整体结构 —— WORLD / TOWN / OBJECTIVES / PHASES / REINFORCE / NAME_POOL / SCALE_PRESETS / ORDERS / SUPPORT / COMBAT 这十张表的划分是对的，只改其中若干数值与补字段
- docs/ 下六份考据与技术文档 —— 尤其 Data_HistoryMaterial.md 第四、五节（城的几何、鲁南民居构造参数、巷战战术细节），是全部几何与机制的出处

## 要改

- **Data_Battle.mjs** — PHASES 里的 nraPool / ijaPool（900/760/600/520/380/520）改名并重标定为 unitPool：130 / 115 / 100 / 78 / 62 / 90；同时新增 ijaPool 对应值 120/118/112/96/104/86。phaseRefill 公式改成 Math.min(max, current + Math.round(max*0.10 + (max-current)*0.22))，并加一条：SouthGate 失守时补给 × 0.5。
  - 原因：现在这组数字是史实的师级兵力量级，直接当票用会让票池永远耗不完。同屏 70 人、一阶段 5 分钟，NRA 侧一阶段实际阵亡 60—90 人；池子 900 意味着「死亡无代价」——正好打掉这条机制的全部设计目标。史实数字改由 Roster 的累积阵亡名单承担（只累积不消耗），两层账分开记。
- **Data_Battle.mjs** — OBJECTIVES 里的 NorthEast「东北角」改成 ChengEn「承恩门（小北门）」，坐标 (150,-160) → (128,-172)，对齐 TOWN.gates 里已有的 ChengEn 门位。
  - 原因：现在「东北角」这个占领点和 TOWN.gates 里的「小北门 承恩湛露」各占一个位置、相距 40 m，玩家会以为是两个地方。合并之后占领点和城门重合，史实与导航同时受益。
- **Data_Battle.mjs** — OBJECTIVES 每条补 captureSeconds 字段，按 captureSeconds = 12 + value * 4.4 生成（value 2 → 21 s，value 5 → 34 s）；补 phases 字段标注该点在哪几个阶段激活。PHASES 每条补 routes 数组（至少两条可选进攻路线）与 timeoutSeconds（硬超时）。
  - 原因：captureSeconds 是 ER2 编辑器里与半径分开手调的核心参数，大点慢小点快；不写死在数据层就只能硬编码。routes 是为了在验收时能逐条走查「有没有第二条路」——ER2 被批评最狠的重复感就来自 Phase 结构用得太保守、只有单线。timeoutSeconds 防止双方在占领区里僵持导致阶段永远推不动。
- **Data_Battle.mjs** — COMBAT 补三个字段：suppressPerExplosion 0.55、suppressOnHit 0.45（现在硬编码在 Script_Ai.mjs 的 Soldier.TakeHit 里）、nraSurrenderRate 0（中方不投降）与 ijaSurrenderRate 0.03。SUPPORT.nra.mortar 的 uses 从「每阶段 2」明确改注为「全战役 2」，并把呼叫链从抽象的 cooldown 改成 chain: ["phone", "runner"]。
  - 原因：压制阈值散落在代码里就没法统一调参（ER2 把压制强度做成难度滑条是有道理的）。中方零投降是必须踩住的立场红线——台儿庄守军死守是史实，做成会投降的整个作品立场就塌了。迫击炮全战役 2 发 + 链路可断（电话或传令兵，都会断）是本作对 ER2「无线员中弹全班失去支援」那一招的台儿庄化，比冷却读秒有力一个数量级。
- **Script_Battlefield.mjs** — 填充 spawnPoints：ija 三处固定点（north (-14,-224) / northeast (128,-218) / northwest (-200,-168)），并暴露 AdvanceSpawn(direction, objective) 让占领点易主后出生点前移 34 m；nra 改成动态查询 NearestFriendlySpawn(frontZ)，从仍控制的占领点里取离前线最近的一个、在半径 0.6 倍处背对前线一侧出生。
  - 原因：spawnPoints 现在是两个空数组，规则层没有任何东西可以用。日军出生点不前移，玩家就永远在打赶路中的敌人——这正是 ER2 被批评「只要防守方在攻方赶路时看得见攻方，这张图就极其好打」的根因。
- **Script_Battlefield.mjs** — 把 objectives 数组的所有权交给新的 ObjectiveSystem：Battlefield 只保留几何与半径的静态定义，progress / owner / contested 三个运行时字段移出去。同时把 detailRadius 的两层壳扩成三层（0—90 m 全细节 / 90—200 m 体块 / 200—600 m 剪影环），新增 RebuildShell(playerX, playerZ) 走同款分帧 yield，按 40 m 网格分桶、玩家跨桶才重建 8 个邻桶。
  - 原因：占领点的推进逻辑现在完全不存在（progress 初始化了但没有任何代码推它）。三层壳里最要紧的是新增的剪影环：groundSize 620 之外什么都没有，玩家一站上寨墙往北看就是一条硬边——ER2 的地平线永远有一条比天空稍深的剪影带，那是「这仗打在一个真实的地方」的唯一证据，成本一次 InstancedMesh。
- **Script_Ai.mjs** — AiDirector 补：(1) 渲染 LOD 调度——0—35 m 用 ActorFactory high（上限 6 人）、35—90 m medium（上限 14 人）、90—200 m 交给 CrowdRenderer、>200 m 只跑逻辑，切换带 6 m 迟滞；(2) IssueOrder 补 flank 与 charge 两条实现；(3) 听觉线索接口 Hear(position, weight)，喊话与包扎喘息通过它给附近敌方 AI 一个 0.6 权重的搜索方向；(4) Downed 状态与拖伤员行为（拖到 8 m 外掩体后包扎）；(5) 压制阈值 0.50 卧倒 / 0.75 停火 / 0.90 往后缩（不是投降）；(6) 90 m 外的尸体立即删除，不占 maxCorpses 名额。
  - 原因：ActorFactory 三档 quality 的注释写着 high≈20 draw call/人——110 人全走 low 也是 1320 draw call，直接爆。必须有第四档 InstancedMesh 才谈得上同屏规模。flank/charge 是六条命令里最有战术形状和最有文化分量的两条（白刃冲锋对台儿庄是必做项），现在缺实现。听觉线索让「下令要喊」这条设计成立，成本只是给已有的搜敌逻辑加一个事件源。
- **Script_Ai.mjs** — AI 的命中判定必须走同一套 Battlefield.Raycast，不给特权；距离 > 120 m 的精度按平方衰减，并加一条硬规则「先打近的」。COMBAT.aiAccuracyBase 0.55 在 120 m 外按 (120/d)^2 缩放。
  - 原因：ER2 被玩家骂得最具体的一条就是「AI 隔着植被精准命中、超远距离发现你」。这是可以在第一天就避开的坑，而 Raycast 与空间散列已经现成。
- **Script_Player.mjs** — 补三层伤口状态机：Healthy → Wounded（去饱和、不能冲刺、按 COMBAT.bleedPerWound 掉血）→ Downed（躯干/腿致死伤 40% 概率进入，35 s 倒计时，可按 F 呼救，可被弟兄拖走）→ Dead。B 键包扎 3.2 s（期间不能开火，喘息通过 AiDirector.Hear 暴露位置）。压制表现四档接 Post 的 uVignette、Audio 的耳鸣低通、SwayAmount 的振幅乘子。补 3 s 重生无敌与喊话入口。
  - 原因：现在只有 TakeHit / Bandage / Kill 三个方法，没有 Downed 层。Downed + 拖伤员是队友依赖的唯一来源（你救不了自己，只能等人来），而「把伤员拖回墙根后面」对台儿庄是很强的画面。压制的四档表现全部复用已有设施——uVignette 改一个数、耳鸣接现成低通总线、晃动接现成 SwayAmount，一行新 shader 都不用写。
- **Script_Hud.mjs** — 补五组元素：(1) 占领条（进度 0..1，争夺中显示斜纹，交叉刀剑=待打 / 旗帜=已占领，屏幕空间投影不用 3D Sprite）；(2) 兵员池一栏（己方实数；敌方只在站进占领区时才显示，否则「——」）；(3) 支援栏（中方迫击炮剩余发数 + 传令兵状态；日方一律不显示）；(4) 当前班长指示（左上角一行）；(5) 阶段结束的阵亡小结与结算名单屏。保持极简：不显示弹药数（改成按 R 时角色喊出剩余弹匣数）、不显示击杀提示、默认无准星。
  - 原因：Hud 已经有 ShowDeathCard / UpdateMarkers / UpdateMinimap 三样最难的，缺的是接规则层的读数。信息不对称（敌方兵力只在占领区内可见）把侦察变成真实收益而不是白送的 UI——这是 ER2 里很聪明的一条。极简是主题需要：日方支援没有 HUD、只能靠听，这个不对称本身就是叙事。
- **Data_Script.mjs** — LEVELS[] 六关的 beats 触发式重映射（台词内容与 CAST/MENU/CREDITS/11 条红线一字不动）：wave:N / waveClear:N → 换成战况触发（pressure:high、objective:X.captured / X.lost / X.enter）；event:MengDown → squadLeaderDown（玩家班长任何时候战死）；start/end → phase:PN.start / PN.end；zone:X 保留但语义扩到占领点半径。虚构人物 liu/meng/qin 从「固定人物」改成「角色槽位」：槽位持有者阵亡后从 NAME_POOL 换名字，台词照说。真实人物（王冠五、王范堂、陆诒、万有福）保持固定地点固定阶段。
  - 原因：开放战场上「第 3 波」这个概念不存在，wave:N 触发大部分永远不会发生。角色槽位化是把线性剧本搬到开放战场最容易翻车的地方的解法——一个叫刘振海的班长可能第一分钟就死，后面五十分钟他的台词全没了。而「他倒了我上，我倒了你上」这句话恰恰是换了人还在说才真的落地，它本来就是换人机制的说明书。
- **Data_Levels.mjs** — 改名归档为 Data_LevelsLegacy.mjs 并在文件头注明「线性关卡时代的遗物，正式方案见 Data_Battle.mjs」；其中 L0_Wall 那份街区与街垒布局保留给 Script_Probe.mjs 当渲染探针的场景来源。全仓库已无 importer，不影响任何东西。
  - 原因：这份文件是线性六关设计的产物，与 ER2 式开放战场直接冲突。但它里面的街区尺寸、街垒位置、弹坑分布是照考据摆的，扔掉可惜，转给探针页当固定测试场景正好——探针需要一个不随机、可复现的小场景。
- **Script_ShotTest.mjs** — GAME_SHOTS 从 level=1..4 改成 phase=P1..P6 驱动，并补三张新镜头：Game_Objective_Mosque（清真寺占领条争夺中）、Game_DeathCard（阵亡卡片）、Game_Crowd_Far（90 m 外 InstancedMesh 人群，验证远景不穿帮）。
  - 原因：这个文件已经写死了「由 index.html 的 debug 接口驱动（Script_Main 暴露 window.Taierzhuang）」，工具在等一个还不存在的入口。level= 的查询参数对应的是已经废掉的线性关卡。三张新镜头对应本次改造里最容易出问题的三处，视觉审查要能直接看到。

## 新增模块

- **index.html** — 正片入口。importmap 指向 vendor/three（照抄 Probe.html 的写法），一个 canvas + 一个 #hud 的 DOM 层 + 一个加载条。HUD 全部走 DOM/CSS，不进 three 渲染，也不占 draw call。
  ```
  （静态页面，无导出）挂载点：<canvas id="view">、<div id="hud">、<div id="loading">；<script type="module" src="./Script_Main.mjs">
  ```
- **Script_Main.mjs** — 整机装配与主循环。按顺序建 renderer / MaterialLibrary / SkyDome / LightRig / PostPipeline / Battlefield（走 BuildSteps 分帧 + 加载条）/ ActorFactory / CrowdRenderer / AiDirector / PlayerController / Viewmodel / VfxSystem / AudioEngine / Hud / ObjectiveSystem / RosterSystem / PhaseDirector / OrderSystem / SupportSystem / NarrativeDirector / PerfGovernor，然后跑 Frame(dt)。暴露 window.Taierzhuang 供 Script_ShotTest 驱动。
  ```
  export class Game { constructor(canvas, hudRoot, options?: {quality?, scale?: "small"|"medium"|"large", seed?}); async Boot(onProgress?: (step:{label,progress})=>void): Promise<void>; Frame(dt: number): void; Start(): void; Pause(): void; Dispose(): void; }
export function CreateGame(canvas, hudRoot, options?): Game;
// debug 接口（window.Taierzhuang）：
//   JumpToPhase(phaseId: string): void
//   TeleportTo(x: number, z: number): void
//   SetShot(name: string): void
//   StepFrames(n: number): void
//   ReadyForShot(): boolean
  ```
- **Script_Objectives.mjs** — 占领点规则层：4 Hz 统计半径内双方人数（走 Battlefield 的 10 m 空间散列，不做 O(n²)）、推进 progress、判定 contested / 易主 / 反夺、维护一维前线 frontZ、派发易主事件给叙事层与出生点系统。
  ```
  export class ObjectiveSystem {
  constructor(battlefield, aiDirector, { tickHz = 4 } = {});
  Activate(ids: string[]): void;              // 由 PhaseDirector 按阶段激活
  Update(dt: number, player): void;
  get frontZ(): number;                        // 一维战线，驱动出生点/破坏/烟柱/环境音
  Get(id: string): { id, name, x, z, radius, progress, owner, contested, captureSeconds };
  ActiveList(): object[];
  CountInside(id: string, side: "nra"|"ija"): number;
  OwnedBy(side: "nra"|"ija"): object[];
  IsPontoonThreatened(): { threatened: boolean, seconds: number };  // 浮桥败北线
  On(event: "captured"|"lost"|"contested"|"enter", fn: (objective, side) => void): void;
  Dispose(): void;
}
  ```
- **Script_Roster.mjs** — 兵员池与阵亡名单：战术票的扣减与阶段间橡皮筋补给、姓名/籍贯/生年/武器的程序化生成、玩家换人的顺位选择（先找本班活人，再抽新编四人组并额外扣 4 票）、阵亡名单累积与籍贯统计、见底时切换到担架兵/炊事兵/伙夫。
  ```
  export class RosterSystem {
  constructor(aiDirector, { seed = 1938 } = {});
  SetPhasePool(unitPool: number, max: number): void;
  Refill(): number;                            // 阶段间橡皮筋补给，返回补了多少
  get tickets(): number;
  get exhausted(): boolean;
  get lastDitch(): boolean;                    // 池 < 12%
  ReportDeath(soldier): void;                  // 扣票 + 进名单
  NextBody(deadSoldier): { soldier, cost: number, delaySeconds: number } | null;
  MakeIdentity(seed: number): { name, origin, birthYear, unit, weapon, age };
  FallenList(): Array<{ name, origin, birthYear, deathTime, place, weapon, playerControlled: boolean }>;
  OriginSummary(sincePhase?: string): Array<{ place: string, count: number }>;
  Dispose(): void;
}
  ```
- **Script_Phases.mjs** — 战役阶段推进：按 PHASES 切换天光（SkyDome.Apply）、激活占领点、设定双方出生方向与压力系数 ijaPressure、调 RosterSystem.SetPhasePool、发阶段幕布、处理阶段通过/失败判定与硬超时。
  ```
  export class PhaseDirector {
  constructor(ctx: { sky, lightRig, objectives, roster, aiDirector, support, hud, narrative });
  Enter(phaseId: string): void;
  Update(dt: number): void;
  get current(): object;                        // PHASES[i]
  get elapsed(): number;
  Next(): boolean;                              // 返回 false 表示战役结束
  Outcome(): { won: boolean, reason: "tickets"|"pontoon"|"allPhases"|"timeout" } | null;
  On(event: "phaseStart"|"phaseEnd"|"battleEnd", fn: (phase, info) => void): void;
}
  ```
- **Script_Orders.mjs** — 指挥系统：数字键 1-6 直发 + 按住 Q 显示提示条（纯 DOM）、命令落点用 Battlefield.Raycast 拾取、指挥权顺位（班长→机枪手→老兵→新兵）、下令时发喊声并通过 AiDirector.Hear 给敌方听觉线索、按住 X 的换人列表。
  ```
  export class OrderSystem {
  constructor(ctx: { aiDirector, battlefield, player, hud, audio, roster });
  Update(dt: number, input): void;
  Issue(orderId: "follow"|"advance"|"hold"|"spread"|"flank"|"charge"): number;  // 返回听令人数
  CanIssue(orderId: string): boolean;           // 5/6 需要指挥权
  get isSquadLeader(): boolean;
  get squadLeaderName(): string;
  PromoteLeader(): void;                        // 班长阵亡时的顺位移交
  SquadMembers(): Array<{ soldier, name, distance, weaponName }>;
  SwitchTo(soldier): void;                      // 按住 X 松开时切人
  Dispose(): void;
}
  ```
- **Script_Support.mjs** — 支援系统：中方的可断链路（电话点按 F / 派传令兵，传令兵是一个具体的有名字的士兵，路上会被打死则呼叫作废）与全战役 2 发迫击炮；日方按 PHASES[i].ijaSupport 定时发动掷弹筒/重机/重炮，带预警（声音 + Vfx.IncomingMarker），无 HUD；贴身抑制规则（玩家 30 m 内有日军则日方重炮停、掷弹筒间隔 ×2.2）。
  ```
  export class SupportSystem {
  constructor(ctx: { aiDirector, battlefield, vfx, audio, hud, player, objectives });
  SetPhase(phase): void;                        // 读 ijaSupport / ijaPressure
  Update(dt: number): void;
  NearPhone(position): { id: string, name: string } | null;
  RequestMortar(target: THREE.Vector3, via: "phone"|"runner"): { ok: boolean, reason?: string, etaSeconds?: number, runner?: object };
  RequestReinforce(via: "phone"|"runner"): { ok: boolean, etaSeconds?: number };
  get mortarRemaining(): number;                // 全战役剩余发数
  get runnerState(): "idle"|"running"|"cooldown"|"lost";
  Dispose(): void;
}
  ```
- **Script_Narrative.mjs** — 叙事导演：四层叙事的触发与排队。阶段幕布、占领点事件（首次进入/占领/失守）、电话点（按 F 接听，四月四日那通挂 P5 新关帝庙）、机制咬合事件（兵员池首次跌破 30% 播孙连仲原话、squadLeaderDown 播换人机制那三句）。带 once 标记、优先级与冷却队列，防止开放战场上台词乱序或叠播。
  ```
  export class NarrativeDirector {
  constructor(ctx: { hud, audio, roster, objectives, phases, player, battlefield });
  Update(dt: number): void;
  Fire(trigger: string, payload?: object): boolean;   // "phase:P2.start" / "objective:Mosque.captured" / "squadLeaderDown" / "tickets:below30"
  NearPhone(position): { id, name, available: boolean } | null;
  AnswerPhone(id: string): void;
  ShowPhaseBrief(phase): Promise<void>;
  ShowEpilogue(outcome, fallenList): void;
  Reset(): void;
}
  ```
- **Script_Crowd.mjs** — 远景人群渲染：90—200 m 的士兵用共享 InstancedMesh 表示（躯干+头 / 两腿 / 步枪，压成 2—3 个 InstancedMesh，共 90 个实例只吃 2 个 draw call）。姿态只有站/蹲/卧/倒四态，用 instanceMatrix 的缩放与平移表达；阵营用 instanceColor 区分；每 3 帧更新一次矩阵。必须遵守全项目的硬约束：不用 SkinnedMesh，并给 mesh.userData.skipNormalDepth 让它不污染深度法线预通道。
  ```
  export class CrowdRenderer {
  constructor(scene, library, { capacity = 120 } = {});
  Sync(soldiers: Array<object>, camera, dt: number): void;   // 只处理 lod === "far" 的那些
  SetRange(near: number, far: number): void;                  // 默认 90 / 200
  get instanceCount(): number;
  get drawCalls(): number;
  Dispose(): void;
}
  ```
- **Script_Perf.mjs** — 性能治理：首帧后 3 s 探针自动推荐规模档位；运行时监测帧时间，连续 30 帧 > 20 ms 则降级（maxAlive −12、近档人数上限 −4、阴影 4096→2048、SSAO 半分辨率），连续 120 帧 < 14 ms 则升一档；降级带 8 s 冷却防抖动。ER2 把同屏人数交给玩家滑条，我们既给滑条也给自动降级。
  ```
  export class PerfGovernor {
  constructor(ctx: { renderer, post, lightRig, aiDirector, crowd }, { preset = "medium", auto = true } = {});
  async Probe(seconds = 3): Promise<"small"|"medium"|"large">;
  Update(dt: number): void;
  SetPreset(name: "small"|"medium"|"large"): void;
  get preset(): string;
  Stats(): { fps: number, frameMs: number, drawCalls: number, triangles: number, aliveUnits: number, tier: string };
  Dispose(): void;
}
  ```

## 风险

- 兵员池的两层账口径会被后来的人搞混：史实的「师余 1400 名」和战术票的「130」不是一个东西。必须在 Data_Battle.mjs 的字段注释里把这件事写死，否则下一轮一定有人「按史实修正」把 unitPool 改回 900，机制当场作废。
- draw call 预算爆掉：ActorFactory 的 high 档每人约 20 个 draw call，近档只要放宽到 10 人就多出 80。Script_Crowd 的 InstancedMesh 是唯一的兜底，它一旦做不出来（比如姿态四态用 instanceMatrix 表达得太丑，被迫回退到 low 档 Actor），同屏规模就只能压到 45 人以下，「战场感」这条核心目标直接失守。
- 占领点僵持导致阶段推不动：双方都在区内则进度冻结这条规则很对，但配上 holdZone 的硬守点纪律，很可能出现两边各趴在半径两侧对射十分钟谁也不进的死局。PHASES 的 timeoutSeconds 硬超时是必须的保险，但超时后判给谁需要实测——判给守方太宽松，判给攻方又会让玩家觉得「我明明守住了」。
- 开放战场的迷路问题：437 个巷口的迷宫感是史实也是双刃剑。ER2 的地图开阔，走错方向能看见远处的占领点；台儿庄是连续实墙、对外不开窗，站在巷子里什么都看不见。小地图 + 持久烟柱 + 屏幕空间的占领点图标三样必须同时到位，缺一样都会让路人玩家在两分钟内退出。
- 剧本触发在开放战场上乱序或永不触发：改成空间 + 战况触发之后，玩家完全可能先打下清真寺再回头打中正门，于是「北头是他们的了，往南退，团部在清真寺」这句话在他已经站在清真寺里的时候播出来。NarrativeDirector 的 once + 优先级 + 冷却队列只能缓解，真正的解法是每条 beat 都要标一个前置条件，这份走查工作量不小且容易漏。
- 涌现玩法会破坏史实立场：玩家如果在 P6 把日军打到一个不剩，屏幕上呈现的就是「全军覆没」——而这正是 Data_Script.mjs 顶部红线明令禁止的写法。P6 的结算必须写成「日军两个支队接到转进命令、濑谷支队长独断离脱、主力撤到峄县枣庄」，并且日军单位在 P6 后段要有主动脱离行为，不能等着被杀光。这是玩法与史观最容易打架的一处。
- 拖伤员的 AI 会制造新的 Conga Line：三个人同时去拖同一个伤员，或者拖着伤员走进敌方火力。需要一个「同一伤员只允许一个救护者认领」的锁，以及拖拽路径的掩体偏好——否则这条很有画面感的机制会变成笑话。
- 1:2.2 缩尺与 1:1 街宽的比例矛盾在望远视角下会露馅：站在寨墙上往南看，会发现房子的尺寸对整座城来说偏大、街区偏少。窄 FOV（50—60 度）和浓雾能盖掉大部分，但如果后续有人把 FOV 调回现代 FPS 的 80—100，这个矛盾会立刻暴露。FOV 的取值要写进注释说明理由。
- 「下令要喊、喊了会暴露」这条设计可能过头：如果代价太明显，玩家会索性一次令都不下，指挥系统白做。听觉线索的权重 0.6 是拍脑袋给的起始值，必须实测——理想状态是玩家会下令但会挑时机下，而不是完全不下。
- 单局 30 分钟无存档：六个阶段各 4—6 分钟，加上阶段幕布和结算，一局接近 35 分钟。浏览器页面刷新就全没了，路人玩家很可能打不完。至少要做阶段级的断点续玩（localStorage 存 phaseId + 兵员池 + 占领点归属 + 阵亡名单），否则大部分访客永远看不到 P5 那通电话。
- PerfGovernor 的自动降级可能与视觉审查打架：Script_ShotTest 要求可复现的固定画面，但自动降级会让同一个镜头在不同机器上出不同的 LOD 档位。出图时必须能强制锁档（debug 接口里加一个 SetPreset + 关闭 auto），否则视觉审查 agent 会比较到两张本质不同的图。
