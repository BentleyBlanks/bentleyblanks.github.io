# 《血战台儿庄》对标 Easy Red 2 玩法系统 —— 逐条对齐方案（实跑核对版）

> 现状一律实跑取证（起真浏览器走 window.Taierzhuang 调试口），不读代码猜结论。

> 底本：`C:/Users/Bentl/Documents/Program/bentleyblanks.github.io/.claude/worktrees/binary-assets-blendermcp-link-15f272/Taierzhuang1938/docs/Data_EasyRed2Benchmark.md`
> 现状全部**实跑核对**（真浏览器 + `window.Taierzhuang` 调试口，临时探针 `_probe_er2*.mjs` 已删）。
> 代码基址：`C:/Users/Bentl/Documents/Program/bentleyblanks.github.io/.claude/worktrees/binary-assets-blendermcp-link-15f272/Taierzhuang1938/`
> 范围：只谈玩法/操作，不谈画面。唯一豁免：本作不能选阵营，玩家固定为第 31 师 186 团。

---

## 〇、先说三条最要命的实跑结果

**这三条不修，下面所有对标条目都是空中楼阁。**

### 1. 全场 AI 两分钟一枪没开

`?phase=2&scale=medium` 实跑 120 秒（12 次 10 秒采样），70 名 AI 的状态分布**每一次采样都是 `{advance: 70}`**，姿态分布**每一次都是 `{0: 70}`（全员站立）**，`this.time - s.lastFire < 2` 的开火计数**恒为 0**，全场平均压制值**恒为 0.00**，8 个占领点进度**恒为 `1.00,1.00,1.00,1.00,1.00,1.00,1.00,1.00`**、owner 恒为 `nnnnnnnn`。日方票池 120 秒只掉了 1（还是玩家扔的手榴弹）。

期间玩家阵亡 6 次——**全部来自 `Script_Combat.mjs` 的 `StepIjaSupport()`**，那段代码直接以 `player.position` 为落点定时下掷弹筒和重炮，完全不经过 AI。也就是说：现在这场仗的唯一伤害来源是一台看不见的打点机器，战场上七十号人是背景板。

根因不是状态机写错了。单独把一名日军与一名中方兵摆到全图开阔处（扫遍 (-220..220, ±20) 网格才找到 (-220,-220) 这一处 26 m 无遮挡），`HasLineOfSight` 返回 true，日军立刻进 `fire`、开火、把对方打死。**逻辑是好的，是双方在城里永远拿不到通视**：探针里全场 70 人 `losCache.clear` 为 true 的**是 0 个**，`s.target` 非空的**是 0 个**，日军离最近中方兵的最短距离是 **49 m**——中间隔着鲁南民居那种四面封闭的院墙。

再叠加两条结构性原因：
- 中方 AI 被 `AssignDefenders` 钉死在 `holdZone` 半径里，且 `Act()` 末尾有硬夹回（`s.position = zone.center + dir * radius`），永远不出院子；
- 日方 AI 的 `goal` 是**生成那一刻**的快照（`battlefield.objectives.find(o => o.owner === "nra")`，恒等于数组第 0 个 NorthGate），走到就停，不重规划、不换目标、不进点。

这正是 ER2 被骂最狠的那条「AI 不会守点、走到半路就地对射」的**加重版**——我们连对射都没有。

### 2. 票池根本不统计阵亡单位

ER2 改了两次才定下来的规则是「统计阵亡单位」。我们现在：
- 杀死一名中方 AI：`nraPool` 760→760，`ijaPool` 720→720，**两边都不动**；
- `nraPool` 只在 `OnPlayerDown()` 里 −1，`ijaPool` 只在玩家亲手击杀时 −1（`TryFire` / `DoMelee` / `onKill` 回调）。

换句话说，票池现在是「玩家的命 + 玩家的战绩」，不是兵力池。ER2 那句「你死了但仗还在打」的经济基础不存在。

**并且有一个方向反了的 bug**：`Script_Combat.mjs` 的 `Blast()` 在遍历 `ai.soldiers` 时无差别调用 `host.onKill(s)`，而 `Script_Main.mjs:201` 的 `onKill` 写死是 `state.ijaPool -= 1`。实测：把日军全部挪到 600 m 外，用 `Blast(target, 9, 500, "shell")`（hurtSide = null，模拟日军炮弹）炸死 4 名中方兵 → **`ijaPool` 700 → 696，`nraPool` 600 → 600**。日军炮弹炸死中国兵，扣的是日军的票。

### 3. 阶段推进与胜负跟战况无关

`state.phaseTime = 9999` 推两帧，`phaseIndex` 2 → 3。阶段纯按 `PHASES[i].minutes` 走。胜负是「跑到最后一阶段 85% 时长 && 手上还有 ≥3 个点」= 胜；由于占领点从头到尾没人碰，这个条件恒真。ER2 的「Mission = Phase 列表 / 全部 Phase 拿下 = 进攻方胜 / 票耗尽 = 防守方胜」这一套结构，我们只借了名字。

---

## 一、战役结构（Phase / 占领区 / 出生区）

**ER2**：Mission = Phase 列表；Phase = 若干 objective(position, radius, conquerTime, progress 0..1, owner, attractor) + 双方出生区；多点时防守方可反夺；全部 Phase 拿下 = 进攻方胜。

**我们**：`Data_Battle.OBJECTIVES` 8 个点（中正门/东北角/西北角/清真寺/文昌阁/火车站/新关帝庙/惠迪吉门），带 radius 与 value，`Script_Battlefield` 建成 `{...o, progress, contested}`。`Script_Main.UpdateObjectives()` 已实现「双方都在区内 → 冻结；单方在区内 → 按人数推进度；到 0/1 翻旗」，`Script_PlayTest` 第 6 组断言验过玩家能把点夺回来。

**差在哪**：
- 8 个点**全阶段常驻激活**，没有 `PHASES[i].activeObjectives`。ER2 的节奏感来自「这一段只打这两个点」，我们是一张全开的地图；
- 没有 `conquerTime` 字段，占领速率是硬编码的 `dt/26`；
- 没有 attractor 概念，AI 不会被点吸引；
- 出生区只有日方一条（`WORLD.minZ - 8`），中方出生 = 「离前线最近的己方点往后 18 m」，不是可配置的 spawn 区。

**要做成什么样**：给 `PHASES[i]` 加 `objectives: [id...]` 与 `spawn: {nra:[...], ija:[...]}`；`OBJECTIVES[i]` 加 `captureTime`（大点 40 s、小点 22 s）；`UpdateObjectives` 只遍历当前 Phase 激活的点；HUD 只画激活点。

---

## 二、票池

对齐后的规则（照 ER2 2.0.9 的最终形态）：

| 规则 | ER2 | 我们现状 | 处理 |
|---|---|---|---|
| 消耗 = 统计阵亡单位 | 是 | 否（只算玩家） | 在 `Soldier.Kill()` 里发一个 `onDeath(side)`，两侧各扣各的 |
| 随 AI 数量缩放 | 是 | 否（每 Phase 常数 900/700…） | `pool = base * SCALE.maxAlive / 70` |
| 阶段间橡皮筋补给 | 是 | **已对齐** `REINFORCE.phaseRefill(cur,max) = cur + max*0.12 + (max-cur)*0.18` | 保留 |
| 占领目标加速对方票流失 | 是（2.0.9） | 否 | 每个己方点每 10 s 让对方 −1，`value` 大的点权重高 |
| 信息不对称 | 进攻方在出生菜单看；防守方要站在区内看敌方票 | **已对齐**（`hud.SetObjective(..., ourZone ? ijaPool : null)`，`REINFORCE.intelRequiresZone`） | 保留 |

**数值起点**（单阵营下，玩家是防守方）：中方 `nraPool` 就是「能拿枪的人」，日方 `ijaPool` 是进攻耐心。史实红线要求中方是被消耗的一方，所以橡皮筋补给要压得比 ER2 紧——现有的 0.12/0.18 已经压过了，保留。

---

## 三、模式：单阵营下的等价实现

ER2 三个模式里，Operation 和 Defense 我们天然就是（固定防守方）。**Push the Frontline 才是这次真正要解的题**，而且台儿庄史实本身就是它：「阵地白天丢，夜里夺回来」。

**单阵营等价实现「台儿庄拉锯」**：

- 一维 `frontlineIndex`（0..N），对应一条从北到南的占领点链：中正门 → 东北角/西北角 → 清真寺 → 文昌阁 → 火车站/新关帝庙 → 惠迪吉门；
- 玩家永远是南边这一端。日军把 `frontlineIndex` 往南推一格 = 我方丢一个点；我方反攻推回去一格 = 夺回来；
- **不换出生菜单、不换阵营**：切格时只移动双方出生带和激活的占领区，不重载场景（这条对 web 是硬要求）；
- 白天段（`sky != night`）日军推进速率 ×1.6、我方 ×0.5；夜战段（P4/P6，`nightRaid`/`counterattack`）反过来。这一条直接把史实节奏变成机制，不用一句提示；
- 失败线：`frontlineIndex` 被推到运河（最后一格）+ 票耗尽 = 败。胜利线：撑到 P6 且 `frontlineIndex` 推回城北 = 全线反攻成功。

这样「攻守互换」在单阵营下变成「昼夜互换」，不是砍掉，是换了个轴。

---

## 四、死亡与换人

**已对齐**（`Script_PlayTest` 第 7 组验过）：阵亡卡片 2.6 s 打「姓名 · 籍贯 · 生年—1938 · 番号」；接管另一个程序化生成的人（`MakeSoldierIdentity`，姓氏×名字×籍贯权重表，籍贯按第 2 集团军实际构成：河北/河南/陕西为主 + 鲁南补充）；兵员池 −1；`state.fallen` 累积阵亡名册。

**缺**：
- **按 X 随时换人**（ER2 的 `setPlayer()`）——完全没有。这条在台儿庄有额外分量：你可以在班里换一个人，但换过去的那个人也会死；
- **重生后数秒无敌**——没有，玩家可能一睁眼就吃一发掷弹筒（实测 120 秒死 6 次，其中几次就是刚重生就中）；
- **狗牌可查身份**——`state.fallen` 有数据，没有任何 UI。做一个「阵亡名册」页（Esc 里翻）成本极低；
- **指挥权顺位移交**——没有班组结构，谈不上移交。

---

## 五、压制（并且不做士气）

**ER2 的关键发现**：450 KB 日志里 morale 出现 0 次，用「压制连续量 + 投降离散事件 + 撤退指令」三件事替代整套士气系统。

**我们现状**：
- 玩家侧**基本对齐**：`player.suppression` 0..1，`Post.Render` 的 `vignette = 0.42 + supp*0.22`、`saturation *= (1 - supp*0.35)`、`SwayAmount() *= 1 + supp*0.9`、`SpreadDeg() *= 1 + supp*1.3`、`SyncCamera` 里 `cam.rotation.z` 叠一个 `supp*0.012` 的抖动、`supp > 0.85` 强制从站姿掉到蹲姿。这一层做得挺完整；
- **但压制来源几乎不存在**：唯一喂压制的是 `TryFire` 打偏时的近失弹和爆炸，而 AI 从不开火，所以实跑里玩家压制 120 秒内只有两次非零（0.53 / 0.83），都来自炮击；
- AI 侧**不对齐**：`suppression > 0.72` 进 `SUPPRESSED` 状态（实测确认：手动压满后 `Think` 把 state 改成 suppressed、stance 改成 2、speed 归 0），但**不调 `FindCover()`**——ER2 的 `allowFindCoverWhenSuppressed` 是独立行为，我们只是原地趴着；
- 没有 `isSuppressed()` 布尔，没有分档表现。

**关于 Soldier 上那个 morale 的处理建议**：现在 `s.morale = Clamp01(0.35 + mates/8)`（34 m 内活着的同侧人数），只被用在一个地方——`bestDist < 16 && morale > 0.5` 决定是 CHARGE 还是 FIRE。`COMBAT.moraleBreakAt = 0.25` 定义了但**一行没读**。

建议：**把字段改名为 `cohesion`（班组密度），不要叫 morale，也永远不要出 UI**。理由有三：(1) 它算的确实是「身边还有几个人」这个客观量，不是士气；(2) 叫 morale 会诱导后面的人往上加第二套数值，而 ER2 的全部价值就在于没有这套；(3) 台儿庄的立场上，屏幕上出现一条「中国守军士气条」是灾难。删掉 `COMBAT.moraleBreakAt`，把「班里活人太少就往后缩」改成由 `cohesion < 0.35 && suppression > 0.9` 触发的**撤退行为**，而不是一个可读数值。

---

## 六、投降与俘虏（史实取舍最重的一条）

ER2 的触发是**一组离散事件**而非阈值：重度压制 / 所在占领点刚易主 / 票池耗尽 → 附近直接扔枪；写实难度下玩家自己也会被强制投降；可解放己方战俘（掏手枪继续打）；给受伤敌人做医疗 = 俘虏。

**我们现状**：`surrender` / `投降` / `俘虏` 在全部 .mjs 里**搜索结果为空**。`Soldier` 没有 `Surrender()`。

**本作的取舍（红线）**：
- **中方守军 `surrenderRate = 0`**。台儿庄是死守，第 31 师最后余 1400 人仗还在打。压制到极限的表现是**往后缩、拖着伤员退、被打散**，绝不举手。这条不是难度设计，是立场；
- **日方 `surrenderRate ≈ 0.03**，且必须三条同时满足：所在占领点刚易主 + suppression > 0.9 + 20 m 内无日军。日方在台儿庄也很少投降，但非零（有俘虏记载）；
- **玩家自动投降：不做**。ER2 那条在这里会直接踩雷；
- **「解放战俘」的单阵营等价**：改成**救回己方失能弟兄回补 1 票**——同样的「兵力的另一种来源」，但换成了符合史实的动作；
- **杀降不给任何奖励**，且让 30 m 内其余日军的 `cohesion` 反而上升。既是道德立场也是平衡。

---

## 七、伤势与医疗

ER2 两层：轻伤自救（屏幕去色、不能跑、不能屏息、B 键绷带、不处理会流血死、消耗品分级）；重伤失能（倒地、医护兵诊断匹配器械、可先拖到掩体后再救、职业不锁能力）。

**我们现状**（`Script_Player.mjs`）：
- 轻伤层**有一半**：`wounds[]` 按部位记（head/torso/arm/leg），`bleeding` 持续掉血且不包扎会死，`B` 键 `Bandage()` 止血 + 回 14 血、消耗绷带（`COMBAT.bandages = 2`）；`LegPenalty()` 腿伤减速 0.72/处、`ArmPenalty()` 臂伤把 sway 放大 1.7 倍、把散布抬高。**缺**：中弹后没有「不能冲刺」「不能屏息」的硬规则（只是 `speed *= Clamp(health/60, 0.45, 1)` 连续衰减），包扎期间可以照常开火，没有去饱和的伤势画面（`hud.SetDamage` 只是一个红边 opacity）；
- **失能层完全没有**：`player.Downed` 不存在，`Incapacitate()` 不存在。血 ≤ 0 直接 `Kill()`；
- **拖拽伤员没有**，`Script_Actor.Ragdoll()` 有但只用于死亡；
- **消耗品分级没有**，只有绷带。

**建议的三层**（照 `Data_EasyRed2Plan.md` §4.3，我核过，可用）：擦伤（60–100，自愈到 60 封顶）/ 负伤（<60 或四肢中弹，去饱和 + 禁冲刺 + 持续掉血，B 键 3.2 s 包扎且期间不能开火）/ 失能（躯干腿致死伤 40% 概率转 Downed，35 s 倒计时，按 F 呼救会暴露位置，弟兄会来拖到 8 m 外掩体后救，救活 health 45 且永久带伤）。**ER2 那套「诊断—匹配器械」的小游戏不做**——第 2 集团军没有编制医护兵，简化成「拖到掩体后按住 F 包扎 4 s」既符合史实也少一套 UI。

---

## 八、AI

**已对齐的**：同屏上限走 `SCALE_PRESETS`（小 40 / 中 70 / 大 110）并注入 `AiDirector.maxAlive`；决策分帧轮转（`i % 6 === tickIndex % 6`，移动与动画每帧全跑）；LOS 结果 0.25 s 缓存；防排队的 `laneOffset`（每人生成时领一个 ±5.5 m 固定横向偏移）；守点纪律的 `holdZone` 硬约束；掩体点关卡烘焙（实测 **3722 个** `battlefield.covers`，运行时只抽样最近 24 个打分，不做运行时遮挡计算）。这几条思路是对的，ER2 的四个坑里我们**在设计上避开了排队和不守点**。

**没对齐 / 坏掉的**：
1. **通视恒不通导致整个战斗层空转**（见 §〇.1）——这是第一优先级；
2. `SUPPRESSED` 不找掩体；
3. **AI 行为清单缺一大半**：不会自行下令、不会开门窗进屋、不会施救、不会用电台、不会放烟掩护推进、不会撤退、不会投降。ER2 的 `AiParams` 那十一项我们只有「搜敌 / 切姿态 / 移动 / 听令（半个）」；
4. **「AI 对长时间蹲点的玩家呼叫炮击」这条没做**——ER2 里最值得抄的一条 AI 关卡设计。现在的 `StepIjaSupport` 是无条件定时打玩家，方向正好反了：应该改成「玩家在同一位置开火 > 45 s 且累计击杀 > 3」才触发一次覆盖；
5. **守点纪律用的是位置硬夹回**（越界就把坐标拉回半径上），会看到人贴着一个看不见的圆边滑动。要改成目标点重设 + 转向内侧，不要动坐标；
6. **`holdZone` 的点丢了才释放**，但因为点从不易主，中方 AI 实际是永久钉死的。

**ER2 被骂的几条，我们的账**：不进点——我们比它更严重（根本不交战）；扎堆排队——已避开（laneOffset）；目标选择反常识——暂时无从谈起（没有载具、没有多兵种）；单线推点——**没避开**，8 个点全常驻，反而更没形状；隔着植被精准命中——已避开（AI 命中判定走同一套 `Battlefield.Raycast`，不开透视）。

---

## 九、载具与重武器

**全部为零**。`Data_Weapons.mjs` 里 `Type89Tank`（八九式中战车，装甲 6–17 mm，`minAlleyWidthM: 2.5`）、`Type94Tankette`（九四式轻装甲车）、`Type92Hmg`（九二式重机，`emplaced: true`）、`Type11`（十一年式，`overheatShots: 200`）参数全写好了，实跑核对：`Type89Tank` / `Type94Tankette` / `Type92Hmg` 在运行时**一次都没被实例化**；`Data_Levels.mjs` 里那些 `vehicles: [...]` / `support: [{kind:"Type92Hmg"}]` 配置**整个文件没有任何模块 import**，是死数据。`emplaced` / `bipod` / `overheat` / `armorPiercing` / `minAlleyWidthM` / `cookable` / `LOADOUTS` / `IJA_SQUAD` / `AMMO` 这一批字段全部只在 `Data_Weapons.mjs` 里出现过一次。

**本作的史实版本**（不许为了对标抹平不对称）：

| 类别 | 日方 | 中方 |
|---|---|---|
| 战车 | 八九式中战车、九四式轻装甲车 | 无 |
| 重机 | 九二式重机（固定位，可缴获） | 无（捷克式 ZB-26 是轻机，每班 0–1 挺） |
| 曲射 | 掷弹筒（能越院墙）、野战重炮 | 二十年式 82 mm 迫击炮，**全战役 2 发** |
| 空中 | 有（只做声音与阴影，不做可驾驶） | 无 |
| 反坦克 | — | **集束手榴弹**（5–7 枚去柄捆一枚带柄弹，`damage 620 / radius 4.2`，已实装可投） |

**玩家能操作的**：只有缴获的九二式重机（固定位）。坦克/飞机**不做可驾驶**——既不符合史实也不值那个工程量。

**两条从史料直接长出来的机制，必须实装**：
1. **窄巷克制战车**：八九式进不了宽 < 2.5 m 的巷子，且抬不起炮打屋顶 → 从高处砸集束手榴弹是正确解。这条已经在 `Data_Weapons` 的注释里写了「这是玩法规则不是装饰」，但一行代码都没有；
2. **贴身战术抑制敌炮**：玩家 30 m 内有活着的日军时，日方 `artillery` 停火、`launcher` 间隔 ×2.2。史料原话是「揪住敌人裤腰带打」。用规则教战术，一句提示不写。

---

## 十、难度：一组滑条

**完全没有**。实跑确认 `state` 里没有 `difficulty` 字段，`window.Taierzhuang` 上没有难度对象，启动页只有一个「进城」按钮，连 `SCALE_PRESETS` 都只能靠 URL 参数 `?scale=` 选。

**要做**：一个 `difficulty` 对象在所有系统里被读取，绝不把难度硬编码进各处逻辑：

```
{ aiAccuracy: 1.0,        // 乘到 AiDirector.TryFire 的 acc
  blastRadius: 1.0,       // 乘到 CombatSystem.Blast 的 radius
  suppressionScale: 1.0,  // 乘到 player.Suppress / Soldier.suppression
  playerDamage: 1.0,      // 乘到 player.TakeHit
  staminaSeconds: 5,      // 现在硬编码 0.20/s 消耗 = 5 秒冲刺，太短
  overheat: true,         // 十一年式 200 发过热（数据已有，没接）
  bulletGravity: 1.0,     // 现在是 0（纯 hitscan）
  autoSurrender: false,   // 本作恒 false，见 §六
  showCrosshair: false,
  enemyMarkers: false }
```

三个预设按钮（体验 / 标准 / 写实）+ 高级展开滑条，可存 localStorage。**面向 web 路人的默认档应该偏「体验」**：准星开、免疫压制、AI 精度 0.7。同一屏放战场规模三档，并跑一次 3 秒性能探针自动推荐。

---

## 十一、操作方案（每一个键）

现有键位（`Script_Main.mjs` 的 keydown/ReadKeys 实测）：`WASD` 移动、`Shift` 冲刺、`Q/E` 侧身、`C` 蹲、`Z` 卧、`Space` **屏息**（不是跳）、左键开火、右键 ADS、`R` 装填、`V` 白刃、`G` 手榴弹（按住蓄力/松开投）、`H` 集束手榴弹、`B` 包扎、`F` 呼迫击炮、`Tab` 显示命令表、`1–6` 直接下令。

对 ER2 的差：
- 屏息 ER2 是**ADS 时按住 Shift**，我们是 `Space`——`Space` 空着不如给屏息，但要跟 ER2 对齐就得挪到 `Shift`（我们的 `Shift` 是冲刺，ADS 时冲刺本来就被禁用，可以复用同一个键，按 `ads > 0.6` 分流）；
- 缺 `X`（换人轮盘）、`M`（大地图）、`I`（背包轮盘）、`0`（发射模式）、`PageUp/PageDown`（归零）、HUD 一键全关；
- ER2 的五个径向菜单我们一个都没有。**建议不做轮盘**：浏览器指针锁与轮盘冲突，改成「数字键直下 + 按住 Tab 出横条」的双路并行（现在的 Tab 面板是纵向 DOM 列表，改横条即可）。这是对 web 的合理妥协，不是砍功能。

---

## 十二、瞄准与弹道

- **无准星**：已对齐（HUD 元素清单实测无 crosshair 节点，散布 `SpreadDeg()` 决定落点）；
- **自由瞄准**：我们**有**（`freeAimLimitDeg = 5°`，ADS 时收到 1.4°，枪先动、顶到边界才推视线，松手 `exp(-dt*(2.2+ads*5))` 归位）。而 ER2 **没有** free aim。这是我们比 ER2 多做的一层。建议**保留但降到 3.5°、并挂到难度滑条**——它在巷战里手感很好，砍掉可惜，但要承认这是偏离对标基准的一处；
- **铁瞄居中**：ER2 故意让瞄具偏离屏幕中心，我们的 `Script_Viewmodel` 明确写了「照门与准星开镜要真的对准画面中心，所以这两个必须共轴」。这条**建议不对齐 ER2**——ER2 那条是全网争议最大的设计，开发者自己都要出来解释「这不是 bug」；
- **弹道重力 / 飞行时间：完全没有**。`TryFire` 是「加散布 → 直线射线 → 圆柱判定人 / `Battlefield.Raycast` 判墙 → 取更近者」，纯 hitscan。AI 侧更简化，是概率命中。ER2 有真实下坠且难度里能调 `bulletGravity`。台儿庄交战距离多在 50–200 m，加重力后下坠可感知但不夸张，值得做；
- **归零（PageUp/Down 调表尺）**：没有。跟弹道重力是一套，一起做；
- **屏息**：有，且 `stamina` 联动（`breathHold` 时 sway ×0.28、散布 ×0.55，每秒耗 0.28 体力）。**体力太短**：冲刺每秒耗 0.20，满体力只能冲 5 秒；
- **两脚架**：`Zb26.bipod` / `Type92Hmg.emplaced` 定义了没接。ER2 是「不架不能开镜」，我们连 ZB-26 都不是玩家可用武器；
- **栓动节奏**：已对齐（`boltTimeS` 1.05/1.18、`viewmodel.IsBusy()` 期间禁开火禁装填禁白刃，`Script_PlayTest` 验过）；
- **弹匣逐个追踪 / 手动压子弹**：没有，我们是「桥夹 −1、弹仓填满」。中正式和汉阳造都是固定弹仓桥夹装填，**这条不需要对齐**（ER2 那套是给可拆弹匣枪的）。

---

## 十三、HUD 与地图

**已对齐**：不显示弹药数（空仓只有「咔」一声 + 「按 R 压弹」提示）；纯 DOM/CSS 不进 three 渲染；小地图 200 ms 重绘一次；**敌方标记落在班组几何中心**（90 m 内日军求平均位置画一个虚线圆，半径随人数涨），这条抄得很准；压制暗角；阵亡卡片。

**没对齐**：
- 占领点图标是 `▲`（己方）/ `✕`（敌方），不是 ER2 的**交叉刀剑 = 待打 / 旗帜 = 已占领**，而且 8 个点全部常显（应只显激活 Phase 的点）；
- 没有 `M` 大地图；
- 没有 HUD 一键全关；
- **胜负条件不是时刻可读**——这正是 ER2 被骂「新手不知道自己为什么输了」的那条，我们同样犯了。`hud.SetObjective` 现在打的是阶段 label 或「争夺中：XX」，应该改成一行硬信息：「守住清真寺 · 能拿枪的人 587 · 前线：文昌阁」。

---

## 十四、施工顺序（我的建议）

**第 0 轮（不修就别谈对标）**
1. 修通视 / 交战：出生点必须在街上（现在玩家出生在院墙里——从出生点向 72 个方位射 26 m **没有一条通**）；日方 AI `goal` 改为每次 `Think` 重取当前 Phase 最近的敌方点；`holdZone` 改成软约束；`FindCover` 在 `SUPPRESSED` 时也调用。验收标准：medium 档 60 秒内开火计数 > 200、至少一个点被 AI 自己夺走。
2. 修票池：`Soldier.Kill()` 发死亡事件、两侧各扣各的；修 `onKill` 扣错方的 bug。
3. 阶段推进接战况：`frontlineIndex` + 激活点。

**第 1 轮**：压制补齐（AI 找掩体、玩家分档）、投降（只做日方 3%）、失能与拖拽伤员、支援链路（传令兵是一个有名字会被打死的人）。

**第 2 轮**：难度滑条 + 战场规模 UI + 性能探针；弹道重力 + 归零；命令的 flank/charge 真正落地 + 下令喊声作为听觉线索。

**第 3 轮**：载具与重武器（战车、九二式重机、窄巷克制、贴身抑制炮火）；X 换人 + 指挥权顺位 + 阵亡名册。

---

## 十五、史实红线的守法

对标 ER2 时有四处会直接顶到红线，处理办法写在这里，别到实装时才想：

1. **支援稀缺不许抹平**。ER2 的支援链路要抄的是「链路可断」这个结构，不是「双方都有炮」。中方全战役 2 发迫击炮 + 传令兵，日方掷弹筒/重机/战车/野炮且**不给任何 HUD**（玩家只能听）。这个不对称本身是叙事。
2. **中方不投降**。见 §六。
3. **不做玩家自动投降**。
4. **结算不打歼敌数**。现有的 `EndBattle` 已经守住了（用「日军残部向峄县、枣庄退却」收场），别在加了票池统计之后顺手把「击杀 N 人」打上去。

另外两条现有代码已经守住、别改坏的：玩家的直接长官是 186 团团长王冠五（`hud.Say("团长", ...)`）；池峰城师指挥所在城东南新关帝庙（`OBJECTIVES.GuandiTemple`，同时是占领点、剧情点，将来也该是电话支援点——一个地方承担三种功能是开放战场设计里最省的做法）。


---

## 逐条对齐项

### [必做/大] AI｜已有但不对齐

- **ER2**：AI 会搜敌、通视后进入交战，全场几十上百人同时在打（确证：官方 AiParams 有 allowCheckForEnemies，1.3.6 重做过 aims before firing / takes cover / follows orders）
- **现状**：实跑 ?phase=2&scale=medium 120 秒：70 名 AI 状态分布恒为 {advance:70}、姿态恒为 {0:70}、开火计数恒 0、平均压制恒 0。全场 losCache.clear 为 true 的 0 人、s.target 非空的 0 人。单独把一名日军与一名中方兵摆到 (-220,-220) 开阔处，LOS 立刻 true、进 fire、开火并击杀 —— 逻辑没坏，是城里恒不通视。日军离最近中方兵最短 49 m。
- **要做**：Script_Ai.mjs：HasLineOfSight 的 from/to 高度改成按姿态取（站 1.5 / 蹲 1.0 / 卧 0.5），并在 Think 里对 best 目标失败后再试 2 个备选目标；Script_Main.RespawnPlayer/FindOpenSpot 把「1 米内无齐胸碰撞盒」改成「26 m 内至少有一个方位通视」；日方 goal 每次 Think 重取当前 Phase 最近的敌方占领点，不再用生成时的快照。验收：medium 档 60 秒内全场开火计数 > 200。
- **史实**：无
### [必做/中] AI｜已有但不对齐

- **ER2**：防守 AI 会进点驻守（ER2 恰恰做坏了，这是它被骂最狠的一条）
- **现状**：Script_Ai.AssignDefenders 给 holdZone，Act 末尾用坐标硬夹回（s.position = zone.center + dir*radius），人会贴着看不见的圆边滑动；而且因为点从不易主，中方 AI 实际被永久钉死在院子里，是「不出点」的反向病。
- **要做**：holdZone 改软约束：越界时只重设 goal 到区内随机点并转向内侧，不动 position。丢点时（Flip 里已有释放逻辑）改为整班后撤到下一个己方点而不是置 null。
- **史实**：无
### [必做/中] 占领｜已有但不对齐

- **ER2**：每个 Phase 只激活 1~N 个 objective，图标：交叉刀剑=待打、旗帜=已占领；编辑器可单独设 radius 与 conquer time
- **现状**：Data_Battle.OBJECTIVES 8 个点全阶段常驻激活，PHASES[i] 没有 objectives 字段；占领速率硬编码 dt/26，没有 captureTime；HUD 图标是 ▲/✕。
- **要做**：PHASES[i] 加 objectives:[id...] 与 spawn:{nra,ija}；OBJECTIVES[i] 加 captureTime（清真寺/中正门 40 s，文昌阁/东北角 22 s）；Script_Main.UpdateObjectives 与 hud.UpdateMarkers 只遍历激活点；Script_Hud 图标换成交叉刀剑（待打）与旗帜（已占）。
- **史实**：无
### [应做/小] 占领｜已有且对齐

- **ER2**：双方都在区内则争夺/停滞；单方在区内推进度；多点时防守方可反夺
- **现状**：Script_Main.UpdateObjectives 已实现 contested 冻结 + 按人数（Math.min(3,n)*0.6）推进度 + Flip 翻旗；Script_PlayTest 第 6 组断言「进度会涨」「能把点夺回来」实跑通过。
- **要做**：保留。只把速率常数 26 换成 objective.captureTime。
- **史实**：无
### [必做/中] 票池｜已有但不对齐

- **ER2**：票 = 统计阵亡单位（官方明确改过：counting dead units instead of respawns）
- **现状**：实测杀死一名中方 AI：nraPool 760→760、ijaPool 720→720，两边都不动。nraPool 只在 OnPlayerDown 减 1，ijaPool 只在玩家亲手击杀时减 1（Script_Main.mjs:620 / :695 / :201 的 onKill）。
- **要做**：Script_Ai.Soldier.Kill() 里回调 ctx.onSoldierDeath(side)，Script_Main 接成「side==='nra' ? nraPool-- : ijaPool--」；删掉 TryFire/DoMelee 里那两处手动扣减，避免双扣。
- **史实**：中方票池就是「能拿枪的人」，是被消耗的一方；补给必须压得比 ER2 紧（现有 phaseRefill 的 0.12/0.18 已压过，保留）
### [必做/小] 票池｜已有但不对齐

- **ER2**：—（这是我们自己的 bug，不是对标项）
- **现状**：Script_Combat.Blast() 遍历 ai.soldiers 时无差别调用 host.onKill(s)，而 Script_Main.mjs:201 的 onKill 写死扣 ijaPool。实测：日军全部挪到 600 m 外，Blast(target,9,500,'shell') 炸死 4 名中方兵 → ijaPool 700→696、nraPool 600→600。日军炮弹炸死中国兵，扣的是日军的票。
- **要做**：Script_Combat.Blast 的 onKill 改为 onKill(s, s.side)；Script_Main 按 side 扣对应池。
- **史实**：无
### [应做/小] 票池｜完全没有

- **ER2**：Battle Tickets now depends on selected AI amount（票总量随所选 AI 数量缩放）
- **现状**：PHASES 里 nraPool/ijaPool 是写死的常数（900/700 … 520/520），与 SCALE_PRESETS.maxAlive（40/70/110）完全脱钩。小规模档打不完票，大规模档票不够用。
- **要做**：Script_Main.EnterPhase 里 pool = Math.round(phase.nraPool * SCALE.maxAlive / 70)，日方同理。
- **史实**：无
### [必做/小] 票池｜已有且对齐

- **ER2**：阶段之间的票补给按剩余票数微调（橡皮筋，2.0.9）
- **现状**：Data_Battle.REINFORCE.phaseRefill = cur + max*0.12 + (max-cur)*0.18，Script_Main.EnterPhase 已接。
- **要做**：保留，不动数值。
- **史实**：补给量按史实压紧 —— 第 2 集团军最后伤亡逾十分之七收场
### [应做/小] 票池｜完全没有

- **ER2**：占领的目标对票流失速度影响更大（2.0.9 防守模式重做）
- **现状**：占领点易主只触发 hud.Say 与 HISTORY_NOTES，不影响任何票池。
- **要做**：Script_Main.Frame 里每 10 s 结算一次：对方每持有一个点，己方票 -= Math.ceil(objective.value / 2)。value 字段 Data_Battle 已有（2~5）。
- **史实**：无
### [必做/小] 票池｜已有且对齐

- **ER2**：信息不对称：进攻方只在出生菜单看票，防守方要站在占领区内才看得到敌方票
- **现状**：hud.SetObjective(text, nraPool, ourZone ? ijaPool : null)，Data_Battle.REINFORCE.intelRequiresZone = true。
- **要做**：保留。
- **史实**：无
### [必做/中] 阶段｜已有但不对齐

- **ER2**：Mission = Phase 列表；全部 Phase 拿下 = 进攻方胜；票耗尽 = 防守方胜
- **现状**：实测 state.phaseTime = 9999 推 2 帧 → phaseIndex 2→3，阶段纯按 PHASES[i].minutes 走，与战况无关。胜负是「最后阶段 85% 时长 && 手上 ≥3 个点」，而占领点从头到尾没人碰，所以胜利条件恒真。
- **要做**：Script_Main.Frame 的阶段推进改为：时间到 或 本 Phase 激活点全部易主（取先到者）；胜负改为 frontlineIndex 触底 + 票耗尽 = 败，撑到 P6 且推回城北 = 胜。
- **史实**：史实进程（3/24 攻城→3/27 突入→3/28 西北角→夜袭→4/4 三分之二→4/6 反攻）必须仍按日期推进，所以时间仍是推进条件之一，只是不再是唯一条件
### [应做/大] 阶段｜完全没有

- **ER2**：Push the Frontline：从中间 Phase 开局，双方互为攻方，一维战线来回推拉，无票
- **现状**：只有一种模式，phaseIndex 单向递增，没有 frontlineIndex。
- **要做**：单阵营等价实现「台儿庄拉锯」：加一个 frontlineIndex（0..N）对应从北到南的点链（中正门→东北/西北角→清真寺→文昌阁→火车站/新关帝庙→惠迪吉门）。玩家恒在南端。切格时只移动双方出生带与激活占领区，不重载场景。白天段（sky != night）日军推进速率 ×1.6、我方 ×0.5；夜战段（nightRaid / counterattack）反过来。
- **史实**：「阵地白天丢、夜里夺回来」本身就是史实，一维推拉与它同构；攻守互换在单阵营下换成昼夜互换，不是砍掉
### [必做/小] 死亡｜已有且对齐

- **ER2**：阵亡显示姓名与生卒年月，然后接管另一名士兵
- **现状**：Script_Main.OnPlayerDown → hud.ShowDeathCard（姓名 · 籍贯 · 生年—1938 · 第三十一师一八六团），2.6 s 后 RespawnPlayer 换一个 MakeSoldierIdentity 生成的人。Script_PlayTest 第 7 组三条断言实跑通过。
- **要做**：保留。
- **史实**：孙连仲原话「士兵打完了，你自己填上去」是这条机制的史实依据；注意那句是总司令对师长说的，要从听筒里出，不许让他站在街垒上喊
### [应做/大] 死亡｜完全没有

- **ER2**：按住 X 打开径向菜单，随时切换到本班组任意成员（API setPlayer）
- **现状**：全仓库搜 KeyX / SetPlayer 无结果；没有班组数据结构，player 只是一个 PlayerController。
- **要做**：建一个 squad = { members: Soldier[], leader }，玩家绑在其中一个 member 上；按住 X 出横条（不做轮盘，指针锁冲突），松开切换：把 player.position/yaw 迁到目标兵、原来那个兵交回 AI。
- **史实**：无
### [应做/小] 死亡｜完全没有

- **ER2**：重生后有几秒无敌（Player is now invincible for a few seconds after respawning）
- **现状**：RespawnPlayer 直接 player.Spawn + health=100，没有无敌窗口。实跑 120 秒玩家死 6 次，其中数次是重生后立刻吃掷弹筒。
- **要做**：Script_Player 加 spawnGuard = 3.0，Update 里递减；TakeHit 在 spawnGuard > 0 时 return。
- **史实**：无
### [应做/小] 死亡｜已有但不对齐

- **ER2**：死者背包里有狗牌可查身份，甚至有收集狗牌的成就
- **现状**：state.fallen 已累积每一个阵亡身份（PlayTest 里读到过 fallen.length），但没有任何 UI 能看。
- **要做**：Esc 面板加一页「阵亡名册」：一行一个「姓名 · 籍贯 · 生年—1938」，按阵亡顺序排。纯 DOM，成本极低。
- **史实**：名册本身就是台儿庄叙事的一部分；不要在名册上打歼敌数
### [可选/中] 指挥｜完全没有

- **ER2**：班长阵亡按 班长→无线员→机枪手→狙击手→步枪兵 顺位自动移交，当前班长显示在左上角
- **现状**：没有班组结构、没有班长概念；hud 左上角 hudIdentity 打的是「你是谁」，不是「谁是班长」。
- **要做**：随 X 换人一起做：squad.leader 死亡时按 班长→持 ZB-26 的机枪手→identity.age>26 的老兵→新兵 顺位移交，HUD 打一行「你现在是三班班长」。只有班长能下 5（绕过去）/ 6（上刺刀）两条要求全班协同的命令。
- **史实**：无
### [必做/中] 指挥｜已有但不对齐

- **ER2**：按住 TAB 出命令轮盘（仅班长可用），11 条指令：Follow / Move and Hold / Attack from Direction / Line-Column / Charge（自动上刺刀）/ Covert Movements / Cover Area / Retreat / Tank Support / Artillery / Spot
- **现状**：Data_Battle.ORDERS 6 条（跟我来/向前/固守/散开/绕过去/上刺刀），Digit1-6 直接下令，Tab 显示一个纵向 DOM 列表（不是轮盘）。实测 IssueOrder 只实现了 follow/advance/hold/spread —— 下 flank 后三名 AI 的 order 字段确实变成 'flank'，但 goal 完全没变（-16.43,-137.03 前后一模一样）；charge 同理。Act() 里只读 order === 'hold'，flank/charge 是空操作。
- **要做**：Script_Ai.IssueOrder 补两条：flank → goal 设为「目标点绕开 45°、半径 25 m 的集结点」，到位后再转 advance；charge → 全员 state=CHARGE、Actor 上刺刀、播喊杀声、移动速度 ×1.4。Tab 面板由纵列表改成屏幕下缘 6 格横条。轮盘不做（指针锁冲突，这是对 web 的合理妥协）。
- **史实**：白刃冲锋对台儿庄是文化上的必做项；但大刀是白刃阶段的补充兵器，不是万能主武器
### [应做/中] 指挥｜完全没有

- **ER2**：Covert Movements：全员扣火潜行，AI 模仿班长姿态，敌方未察觉时更难被发现
- **现状**：没有 awareness 布尔，没有 visibility 系数，AI 姿态与玩家姿态无关。
- **要做**：每个班一个 awareness 布尔 + 每个单位 visibility（站 1.0 / 蹲 0.6 / 卧 0.3）；敌方发现判定 = 距离衰减 × visibility × (awareness ? 2.0 : 1.0)；姿态传染一行：AI 每帧把目标 stance 设为班长的 stance。
- **史实**：P4 夜袭段（白毛巾缠头、大刀背身后）是这条机制的天然舞台；夜间还能大幅削减绘制距离
### [可选/小] 指挥｜完全没有

- **ER2**：Spot 指令给敌方单位打标记，持续一段时间
- **现状**：小地图上只有 90 m 内敌方的班组几何中心虚线圆，没有玩家主动标记。
- **要做**：下令时（任意一条）在准星命中点 40 m 内的敌人上打 12 s 标记，小地图与屏幕空间各画一个小三角。
- **史实**：无
### [应做/小] 指挥｜完全没有

- **ER2**：—（这是我们自己加的一条，成本极低）
- **现状**：下令只走 hud.Say("你", label)，不发声、不影响敌方 AI。
- **要做**：下令时通过 Script_Audio 的 HRTF Panner 发一声喊；给 AiDirector.Think 加一个 hearing 线索源（权重 0.6，只给方向不给精确位置，让那个方向的日军把搜索扇面转过来）。于是「要不要下令」变成真实决策。
- **史实**：官对兵用「弟兄们」，不许出现「同志们」「国军弟兄们」；士兵自称用番号（「我们三十一师」「七连的」）
### [必做/中] 支援｜已有但不对齐

- **ER2**：呼叫炮击需三条同时成立：班里有活着的无线员 + 地图上有可用己方火炮 + 坐标输对；限制来自资源链而不是冷却条；有呼叫→落弹延迟窗口且可取消
- **现状**：Script_Combat.CallMortar：uses=2、cooldownS=150、delayS=9、radius=14、damage=95，F 键直呼，失败只提示「没有炮弹了」或「炮位还在装填」。实测 combat.support = {mortar:2, runner:3}。有延迟（9 s）但没有链路、没有可断的人、不能取消。
- **要做**：改成链路：清真寺（186 团团部）与新关帝庙（31 师师部）设为电话点，只有站在电话点旁按 F 才能直呼；否则派传令兵。全战役 2 发不变。加 cancel（呼叫后 3 s 内再按 F 取消）。
- **史实**：第 2 集团军没有班组无线电，团营之间靠有线电话与传令兵 —— 这个史实比 ER2 的无线员更硬，直接用；迫击炮「严重缺乏」，全战役 2 发是刻意的稀缺
### [必做/中] 支援｜已有但不对齐

- **ER2**：无线员中弹 = 全班永远失去支援能力（链路可断）
- **现状**：Data_Battle.SUPPORT.nra[1] 定义了 runner（传令兵，uses 3、cooldown 70、delay 14、effect 'reinforceSquad'），Script_Combat 里 support.runner 计数存在、runnerCooldown 每帧递减，但实测 typeof combat.CallRunner === 'undefined' —— 没有任何函数会用到它，是死数据。
- **要做**：Script_Combat 加 CallRunner()：从玩家 20 m 内挑一名有名字的中方 AI，给他一条通往城南的路径；他跑的路上会被打死（死了这次呼叫作废、冷却照走、进阵亡名册），跑到了 14 s 后回补一个 4 人小组。
- **史实**：「那个人叫什么名字、死在哪条巷子里」比 ER2 的无线员更具体，也更符合第 2 集团军的实际
### [应做/中] 支援｜完全没有

- **ER2**：步兵按 H 直接丢烟；迫击炮与火炮都有烟幕弹；AI 突击班组会自己放烟掩护推进
- **现状**：H 键绑的是集束手榴弹（GrenadeBundle），不是烟。全仓库没有烟幕投掷物；Script_Vfx.SmokeSource 只被 SeedSmokeColumns 用来挂三根远景烟柱。
- **要做**：Data_Weapons 加 Smoke（发烟罐/点燃的湿被褥皆可）；投掷物系统复用 Projectile，落地后调 vfx.SmokeSource 15 s；AI 侧：日军突击班在距目标 40~60 m 且被压制时 20% 概率放一发。烟必须真的进遮蔽判定（见可破坏遮蔽项）。
- **史实**：中方没有制式发烟弹，用「点燃的棉被／湿柴堆」这种土办法更贴；日方掷弹筒有烟幕弹
### [必做/中] 支援｜已有但不对齐

- **ER2**：你在远处蹲狙太久，AI 会呼叫炮击轰你（TV Tropes 列为 AI 少数真聪明的行为）
- **现状**：Script_Combat.StepIjaSupport 是无条件定时打玩家：launcher 每 14 s（乘 ijaPressure）、artillery 每 42 s，落点直接取 player.position，只加了一条「玩家速度 < 1.4 m/s 才打掷弹筒」。实跑 120 秒玩家 6 次阵亡全来自这台机器 —— 方向正好反了：它不是惩罚蹲点，它是唯一的伤害源。
- **要做**：改成条件触发：玩家在同一位置（漂移 < 8 m）开火累计 > 45 s 且累计击杀 > 3 → 触发一次覆盖。同时保留低频的战场背景炮击（落点在占领点附近而不是玩家头上）。
- **史实**：日方火力充足是史实，但它应该表现为「战场一直在响」而不是「一台锁定玩家的打点机」
### [应做/小] 支援｜完全没有

- **ER2**：—（史料直接转成的机制）
- **现状**：Data_EasyRed2Plan §3.5 写了「贴身战术抑制敌方炮火」，代码里一行没有。
- **要做**：Script_Combat.StepIjaSupport：以玩家为中心 30 m 内有活着的日军时，artillery 完全停止、launcher 间隔 ×2.2。
- **史实**：史料原话「揪住敌人裤腰带打，大大抵销了日军飞机大炮的杀伤威力」；用规则教战术，一句提示都不用写
### [必做/小] 压制｜已有且对齐

- **ER2**：getSuppressionValue() 连续量 + isSuppressed() 布尔；表现：屏幕暗角、瞄准晃动加剧、AI 长时间趴下、专门的掩体反应动画
- **现状**：玩家侧完整：player.suppression 0..1，Post.Render 的 vignette = 0.42 + supp*0.22、saturation *= 1 - supp*0.35、SwayAmount *= 1 + supp*0.9、SpreadDeg *= 1 + supp*1.3、cam.rotation.z 叠 supp*0.012 抖动、supp > 0.85 强制从站掉到蹲。
- **要做**：保留。补一个 get isSuppressed() { return this.suppression > 0.45 }，并把表现分四档（>0.25 暗角抬到 0.72 / >0.45 晃动 ×(1+1.3s) / >0.70 接现成的耳鸣低通总线且不能屏息不能冲刺 / >0.90 换弹速度 ×0.8）。全部用现成 uniform 与音频总线，不写新 shader。
- **史实**：无
### [必做/中] 压制｜已有但不对齐

- **ER2**：AiParams 的 allowFindCoverWhenSuppressed 是独立可开关行为：被压制 → 找掩体
- **现状**：实测手动把日军 suppression 设为 1 后跑 Think：state → 'suppressed'、stance → 2（卧）、cover 仍为 false、moveSpeed = 0。也就是只原地趴着，不调 FindCover()。Act 的 SUPPRESSED 分支是 speed = 0，什么都不做。
- **要做**：Script_Ai.Think：suppression > 0.50 → 卧倒 + 调 FindCover(s, threat) 并向掩体移动；> 0.75 → 停火只保持姿态；> 0.90 且 20 m 内无友军持续 5 s → 往后缩到下一个己方控制点（不是投降）。battlefield.covers 实测已烘焙 3722 个点，现成可用。
- **史实**：中方压制到极限的表现是往后缩、拖着伤员退，不是举手
### [必做/小] 压制｜已有但不对齐

- **ER2**：整套 API 与 450 KB 官方日志里 morale 出现 0 次 —— ER2 根本没有士气系统
- **现状**：Soldier 上有 this.morale，Think 里 s.morale = Clamp01(0.35 + mates/8)（34 m 内同侧活人数），只被用在一处：bestDist < 16 && morale > 0.5 决定 CHARGE 还是 FIRE。Data_Battle.COMBAT.moraleBreakAt = 0.25 定义了但全仓库一行没读。
- **要做**：把字段改名为 cohesion（班组密度），永远不出 UI；删掉 COMBAT.moraleBreakAt；把「班里活人太少就往后缩」改成由 cohesion < 0.35 && suppression > 0.9 触发的撤退行为，而不是一个可读数值。理由：它算的确实是「身边还有几个人」这个客观量；叫 morale 会诱导后人往上加第二套数值。
- **史实**：屏幕上出现一条「中国守军士气条」在立场上是灾难，这条是硬红线
### [应做/中] 投降｜完全没有

- **ER2**：投降是一组离散事件：重度压制 / 所在占领点刚易主 / 票池耗尽附近敌军直接扔枪；可解放己方战俘（掏手枪继续打）；给受伤敌人做医疗＝俘虏
- **现状**：全仓库 .mjs 搜 surrender / 投降 / 俘虏 / prisoner 结果为空；Soldier 没有 Surrender()，也没有举手姿态。
- **要做**：只做日方：surrenderRate = 0.03，且必须三条同时满足 —— 所在占领点刚易主 + suppression > 0.9 + 20 m 内无日军。投降动画一个举手 pose + 丢枪即可。中方 surrenderRate 恒为 0。
- **史实**：台儿庄是死守（第 31 师最后余 1400 人仗还在打），中方守军投降率必须为 0；日军投降率偏低但非零。这个不对称本身就是叙事，不许为了对标 ER2 抹平
### [必做/小] 投降｜完全没有

- **ER2**：玩家在写实难度下也会被强制自动投降（难度里有 disable player auto-surrender 开关）
- **现状**：玩家没有投降路径。
- **要做**：本作恒不做。difficulty.autoSurrender 字段保留但恒 false，写死在预设里。
- **史实**：让玩家扮演的中国守军自动投降会直接踩雷，这是必须主动放弃的一条对标项
### [应做/小] 投降｜完全没有

- **ER2**：靠近己方投降士兵按 F liberate，他们会掏出手枪继续作战（＝票的另一种来源）
- **现状**：没有战俘，也没有失能状态，谈不上解放。
- **要做**：单阵营等价：把「解放战俘」换成「救回失能弟兄回补 1 票」—— 同样是兵力的另一种来源，但换成符合史实的动作。与失能层一起实装。
- **史实**：无
### [应做/中] 伤势｜已有但不对齐

- **ER2**：轻伤层：屏幕变黑白/灰、不能跑、不能屏息、按 B 直接用绷带、不处理会流血致死、消耗品分级（罐头 ~40%、药片 ~90%）
- **现状**：Script_Player 有 wounds[]（按 head/torso/arm/leg 记）、bleeding 持续掉血且不包扎会 Kill、B 键 Bandage() 止血回 14 血消耗绷带（COMBAT.bandages = 2）、LegPenalty 每处腿伤 ×0.72、ArmPenalty 把 sway ×1.7。缺：没有「不能冲刺/不能屏息」的硬规则（只是 speed *= Clamp(health/60,0.45,1) 连续衰减）；包扎期间可以照常开火；没有去饱和的伤势画面（hud.SetDamage 只是红边 opacity）；没有消耗品分级。
- **要做**：Script_Player：health < 60 或四肢中弹 → wounded 标记，canSprint 与 breathHold 直接 return false；Bandage 改成 3.2 s 计时，期间 viewmodel.IsBusy() 为真所以自动禁开火；Post 加一个 uDesaturate uniform 由 wounded 驱动。消耗品分级不做（第 2 集团军没有那套补给）。
- **史实**：不要给第 2 集团军做出补给充足的观感；绷带 2 个已经是紧的，别加
### [应做/大] 伤势｜完全没有

- **ER2**：重伤失能层：倒地失能才能被救、医护兵三种器械必须匹配头顶图标、可先拖到掩体后再救、职业不锁能力
- **现状**：实测 player.Downed 不存在、typeof player.Incapacitate === 'undefined'；health <= 0 直接 Kill()。Script_Actor.Ragdoll() 有，但只用于死亡。
- **要做**：Script_Player 加 Downed 状态：躯干/腿致死伤 40% 概率转 Downed（头部命中、近距离命中、爆炸直接死），视角贴地，35 s 倒计时，按 F 呼救（会暴露位置）；弟兄 AI 会来拖到 8 m 外掩体后包扎，救活 health 45 且永久 wounded。ER2 那套「诊断—匹配器械」小游戏不做。
- **史实**：第 2 集团军没有编制医护兵，简化成「拖到掩体后按住 F 包扎 4 s」既符合史实也少一套 UI；「把伤员拖回墙根后面」是很强的画面
### [可选/小] 姿态｜已有且对齐

- **ER2**：站/蹲/趴/爬四档，姿态影响速度、散布、被发现概率
- **现状**：Script_Player.STANCE 三档：stand(eye 1.62/speed 3.05/sway 1.0/spread 1.0)、crouch(1.05/1.62/0.62/0.66)、prone(0.42/0.72/0.30/0.34)，C 蹲 Z 卧，姿态影响 AI 命中（prone ×0.45、crouch ×0.72）。
- **要做**：保留。缺的「爬（prone 下移动）」已经隐含在 prone speed 0.72 里，不必单独做一档。
- **史实**：无
### [应做/小] 操作｜已有但不对齐

- **ER2**：体力时长是难度滑条之一；屏息 = ADS 时按住 Shift，减晃 + 轻微放大，时长随难度变
- **现状**：屏息绑在 Space（ADS > 0.6 且 stamina > 0.1 时生效，sway ×0.28、spread ×0.55、每秒耗 0.28）。冲刺绑 Shift，每秒耗 0.20 —— 满体力只能冲 5 秒，太短。体力时长不可配置。
- **要做**：屏息挪到 Shift（按 ads > 0.6 与 Shift 分流：开镜时是屏息，否则是冲刺），与 ER2 一致；Space 空出来。体力消耗接 difficulty.staminaSeconds（体验 12 s / 标准 8 s / 写实 5 s）。
- **史实**：无
### [应做/小] 瞄准｜已有但不对齐

- **ER2**：准星/命中提示/穿透提示全是可选开关且默认关；简单难度自带准星并免疫压制
- **现状**：HUD 元素实测清单里没有 crosshair 节点 —— 恒无准星，连开关都没有。散布 SpreadDeg() 决定落点（ADS 0.18°、腰射 2.6°，乘姿态/压制/臂伤/移动系数）。
- **要做**：加 difficulty.showCrosshair（默认对 web 路人开），一个 DOM 十字即可；配套 difficulty.suppressionScale = 0 时玩家免疫压制。
- **史实**：无
### [可选/小] 瞄准｜已有但不对齐

- **ER2**：没有自由瞄准（free aim / 武器 deadzone）—— 全部日志、wiki、攻略里都没有；ER2 的难瞄来自铁瞄偏心 + 视差 + sway + 压制（这一条 benchmark 标为「查不到证据」而非「查到否认」）
- **现状**：Script_Player 有完整的自由瞄准：freeAimLimitDeg = 5°，ADS 时收到 1.4°（×(1-ads*0.72)），鼠标先推枪、顶到边界才带动视线，松手按 exp(-dt*(2.2+ads*5)) 归位；命中判定走 AimDirection() 而不是视线。这是我们比 ER2 多做的一层。
- **要做**：保留，但降到 3.5° 并挂到 difficulty（体验档 0 = 关掉，写实档 5°）。理由：巷战手感很好，砍掉可惜，但要在文档里承认这是偏离对标基准的一处，别让后人以为 ER2 有这个。
- **史实**：无
### [可选/小] 瞄准｜已有但不对齐

- **ER2**：铁瞄故意不在屏幕正中（开发者 Marco 亲自回帖确认是设计不是 bug）+ 瞄具与枪管不共轴的视差
- **现状**：Script_Viewmodel 明确写「照门与准星开镜要真的对准画面中心，所以这两个必须共轴」，并为此专门调过上护盖高度（顶面必须低于 bore + 0.026 的瞄准基线）。
- **要做**：建议不对齐这一条。ER2 的偏心铁瞄是全网争议最大的设计，开发者自己都要出来解释「这不是 bug」。视差可以做（近距离 25 m 内落点比瞄点高 2.6 cm），偏心不做。
- **史实**：无
### [应做/中] 瞄准｜完全没有

- **ER2**：弹道下坠真实存在（Page Up/Down 调表尺归零，难度里可调 bullet gravity）
- **现状**：Script_Main.TryFire 是纯 hitscan：加散布 → 直线射线 → 对 ai.soldiers 做圆柱判定（perp < 0.45）+ battlefield.Raycast 判墙，取更近者。没有重力、没有飞行时间。AI 侧更简化，是概率命中（acc 按距离线性衰减）。实测 150 m 平射 5 发全空（是腰射散布 2.6° 造成的，不是下坠）。
- **要做**：TryFire 改为射线步进：每步 0.02 s、g = 9.8 * difficulty.bulletGravity、初速取 AMMO[weapon.ammo].muzzle（数据已有：七九 810、六五 762、七七 800），最多步进到 effectiveRangeM。台儿庄交战距离 50~200 m，下坠可感知但不夸张。
- **史实**：AMMO 表的初速是考据值，直接用，不要另编
### [可选/小] 瞄准｜完全没有

- **ER2**：Page Up / Page Down 调表尺距离（归零）
- **现状**：没有 zeroing 概念，viewmodel 的表尺照门是纯装饰几何。
- **要做**：与弹道重力一起做：PageUp/PageDown 在 100/200/300/400 m 之间切，HUD 不显示数字（只让 viewmodel 的表尺片真的立起来），符合极简 HUD 的取向。
- **史实**：中正式瞄准基线 503.5 mm、初速 810 m/s，表尺档位按实物走
### [可选/中] 瞄准｜完全没有

- **ER2**：机枪必须架两脚架才能 ADS（MG42/Browning/反坦克枪等），架起来后坐力大降
- **现状**：Zb26.bipod = true、Type92Hmg.emplaced = true 都定义了，实测全仓库只有 Script_Actor 读 bipod（画一个两脚架几何）。玩家也拿不到 ZB-26（LOADOUTS 是死数据）。
- **要做**：与缴获重机一起做：架枪 = 靠近沙袋/窗台按 F，架起后 sway ×0.25、不能移动、视野受限。
- **史实**：捷克式每班 0—1 挺，玩家能捡到但不该常有；九二式重机是缴获来的
### [应做/大] 载具｜完全没有

- **ER2**：坦克玩家可开，有装甲穿透与弹道模拟、部位装甲、座位制、HE/AP/APHE 弹种、车长可标记、双指针罗盘
- **现状**：Data_Weapons 里 Type89Tank（装甲 6—17 mm、hp 900、weakSpotMultiplier 3.2、minAlleyWidthM 2.5）与 Type94Tankette 参数齐全，实测运行时一次都没被实例化。Data_Levels.mjs 里的 vehicles 配置整个文件没有任何模块 import，是死数据。
- **要做**：做日方战车作为敌方单位（不可驾驶）：沿主街路径推进，车载机枪压制，玩家用集束手榴弹从高处砸。玩家不做可驾驶载具 —— 中方没有战车，做了就是失真。
- **史实**：中方在台儿庄没有战车；反坦克只有集束手榴弹（战防炮全战区几门且在别处）。这个不对称是史实
### [应做/中] 载具｜完全没有

- **ER2**：—（史料直接转成的机制）
- **现状**：Data_Weapons.Type89Tank.minAlleyWidthM = 2.5 定义了、注释里写了「巷子窄它转不了身，也抬不起炮打屋顶 —— 这就是从高处砸集束手榴弹的成立条件」，代码里一行没有。
- **要做**：战车寻路只在主街（5.2 m）与次巷宽段（2.4 m）网络上跑，夹道（1.5 m）永远进不去；炮塔俯仰角限制在 -10°~+15°，打不到二层屋顶。于是「往巷子里退」「上房顶砸」变成真实且正确的战术。
- **史实**：八九式装甲最厚 17 mm，集束手榴弹 damage 620 / armorPiercing 打得穿 —— 数值已在 Data_Weapons
### [应做/中] 载具｜完全没有

- **ER2**：51 个条目的 Emplaced Weapons 分类，固定机枪/反坦克炮等可被缴获使用
- **现状**：Type92Hmg（emplaced: true、rpm 200「啄木鸟」节奏、damage 92、有效射程 1200）参数齐全，运行时零实例。
- **要做**：在日方占领的点上摆 1~2 挺九二式重机作为固定火力点（AI 操作），点被夺回后玩家可按 F 接手使用。这是玩家唯一能操作的重武器。
- **史实**：九二式是日方装备，中方用它只能是缴获 —— 这条正好把「缴获」做成机制
### [必做/小] HUD｜已有且对齐

- **ER2**：步兵武器不显示弹药计数（只有载具有），要靠自己数、听、看动作
- **现状**：Script_Hud.SetState 明确不打弹药数，只打 姿态/流血/绷带/手榴弹/集束/迫击炮/屏息/当前命令；空仓只有一声「咔」+「按 R 压弹」提示。
- **要做**：保留。可再加一条 ER2 式的沉浸做法：按 R 时角色喊出剩余弹匣数（Script_Audio 已有语音总线）。
- **史实**：无
### [必做/小] HUD｜已有且对齐

- **ER2**：被侦察的敌方班组标记落在班组几何中心，不指向个体
- **现状**：Script_Hud.UpdateMinimap：90 m 内日军求平均位置，画一个半径 7 + n*0.5 的虚线圆；己方画个体小方块。抄得很准。
- **要做**：保留。
- **史实**：无
### [应做/中] HUD｜已有但不对齐

- **ER2**：目标图标：交叉刀剑 = 待打/可打，旗帜 = 已占领；按 M 打开自动生成的地图（标占领区、友军炮兵蓝方块带圆、飞机补给白图标）；HUD 可一键全关
- **现状**：屏幕空间占领点图标用 ▲（己方）/ ✕（敌方）+ 名字 + 距离 + 进度条，且 8 个点全部常显。没有 M 大地图。没有 HUD 全关键。
- **要做**：图标换成交叉刀剑/旗帜两个字形；只画当前 Phase 激活的点；加 M 键全屏地图（Canvas 2D，标占领区、电话点、我方迫击炮位）；加一个 HUD 全关键（默认 H 已被集束占用，换 F1）。
- **史实**：地图上不要标日方炮兵位置 —— 日方支援不给任何 HUD，玩家只能靠听
### [必做/小] HUD｜已有但不对齐

- **ER2**：（反面教材）UI 粗糙、胜负条件不清楚，新手常常不知道自己为什么输了
- **现状**：hud.SetObjective 打的是「争夺中：XX」或阶段 label 或 story.ObjectiveText，加一个「能拿枪的人 N」，站在区内才加「对面 N」。没有一行说清「现在赢/输的条件是什么」。
- **要做**：顶栏固定一行硬信息：「守住清真寺 · 能拿枪的人 587 · 前线：文昌阁」。绝不让玩家输了还不知道为什么。
- **史实**：无
### [应做/中] 难度｜完全没有

- **ER2**：难度 = 一组滑条（AI 精度、爆炸半径、压制强度、玩家受伤倍率、体力时长、枪管过热、弹道重力、自动投降开关、准星开关、敌人标记开关），可存预设
- **现状**：实测 window.Taierzhuang.state 里没有 difficulty，全局也没有难度对象；难度常数散落在 COMBAT（aiAccuracyBase 0.55、aiAccuracySuppressed 0.18、suppressPerNearMiss 0.16）与各处硬编码里。启动页只有一个「进城」按钮。
- **要做**：建一个 difficulty 对象 { aiAccuracy, blastRadius, suppressionScale, playerDamage, staminaSeconds, overheat, bulletGravity, autoSurrender:false, showCrosshair, enemyMarkers }，在 Script_Ai.TryFire / Script_Combat.Blast / Script_Player.TakeHit / Suppress 等处读取，绝不硬编码。启动页三个预设按钮（体验/标准/写实）+ 高级展开滑条，存 localStorage。web 默认档偏「体验」：准星开、免疫压制、AI 精度 0.7。
- **史实**：autoSurrender 恒 false，不给用户开
### [应做/小] AI｜已有但不对齐

- **ER2**：开局前有滑条让玩家自选 AI 上限（可按阵营分别设），官方上限 140 concurrent units
- **现状**：SCALE_PRESETS 三档（小 40 / 中 70 / 大 110，带 vfxBudget 与 shadow 尺寸）已定义并注入 AiDirector.maxAlive 与 VfxSystem.maxParticles，但只能通过 URL 参数 ?scale= 选，启动页没有任何 UI，也没有性能探针。
- **要做**：启动页加三档按钮（大档标注「需要较好的设备」）；首帧后跑 3 秒性能探针自动推荐；票池随档位线性缩放保持局长不变。
- **史实**：无
### [必做/小] AI｜已有且对齐

- **ER2**：AI 决策分帧、行为分层
- **现状**：AiDirector.Update 里 i % 6 === tickIndex % 6，每帧只有六分之一的人跑 Think（感知+决策），移动与动画每帧全跑；HasLineOfSight 带 0.25 s 结果缓存；掩体点关卡烘焙 3722 个，运行时抽样最近 24 个打分，不做运行时遮挡计算。
- **要做**：保留。注意 losCache 是「每人一份、不区分目标」，改多目标搜索时要一起改成按目标 id 缓存。
- **史实**：无
### [必做/小] AI｜已有且对齐

- **ER2**：（反面教材）Conga Lines：一个班沿同一条线走成一串，1.3.6 修过没根治
- **现状**：Soldier.laneOffset = (rnd()-0.5)*11，每人生成时领一个固定横向偏移；SetSideGoal 与 SeedSoldiers 给 goal 时都加上它（goal.set(x + laneOffset, 0, z + laneOffset*0.4)）。
- **要做**：保留。
- **史实**：无
### [应做/大] AI｜已有但不对齐

- **ER2**：AiParams 十一项：搜敌、自动切姿态、被压制找掩体、听令、自行下令、移动、开门窗进屋、下车、施救、用电台、优先打飞机
- **现状**：我们只有「搜敌 / 切姿态（0 站 1 蹲 2 卧）/ 移动 / 听令（半个，flank 与 charge 是空操作）」。不会自行下令、不会开门窗进屋、不会施救、不会用电台、不会放烟、不会撤退、不会投降。
- **要做**：按优先级补三条最值钱的：施救（去拖 Downed 的同侧兵）、放烟掩护推进（日军突击班）、撤退（cohesion < 0.35 && suppression > 0.9）。开门窗进屋成本高、收益低，先不做 —— 但要保证 AI 至少能沿门洞进院子（现在连这个都没验证过）。
- **史实**：无
### [必做/小] 其他｜已有但不对齐

- **ER2**：—
- **现状**：实测玩家出生点（-36.2, -132.6）在一个封闭院落里：从眼位向 72 个方位各射 26 m，没有一条通。FindOpenSpot 只检查「1 米内无齐胸碰撞盒」，不检查通视。这直接导致玩家一睁眼四面是墙，也是 §AI 通视条目的一部分成因。
- **要做**：Script_Main.FindOpenSpot 加一条硬条件：候选点必须至少有 3 个方位在 20 m 内无遮挡，否则重抽（现在已经抽 48 次，够用）。
- **史实**：鲁南民居对外不开窗、四面围墙，是史实；解法是选点，不是拆墙
### [应做/中] 其他｜已有但不对齐

- **ER2**：—
- **现状**：死数据清单（全部只在 Data_*.mjs 里出现一次、无任何模块 import 或读取）：Data_Weapons.LOADOUTS、IJA_SQUAD、AMMO、overheatShots/coolDownS、armorPiercing、minAlleyWidthM、cookable、bipod（只被 Actor 用来画几何）、emplaced；Data_Battle.COMBAT.moraleBreakAt、aiReactionS、suppressAccuracyPenalty、bleedPerWound、REINFORCE.respawnDelayS；整个 Data_Levels.mjs（326 行，无人 import）。
- **要做**：分两类处理：本轮要接的（LOADOUTS 接到 RespawnPlayer 的携行、AMMO 接到弹道初速、minAlleyWidthM 接到战车寻路、overheat 接到难度开关、bleedPerWound 接到 Player.TakeHit 替换硬编码的 6/2.6/1.4）；确定不做的（Data_Levels.mjs 整个删掉，它是线性关卡时代的遗物，留着会误导后人）。
- **史实**：无

---

## 存疑

- ER2 的占领区「驻守人数加速」规则官方没有明文，benchmark 已列入 uncertainties。我们现在用的是 Math.min(3, n) * 0.6 的人数加成，属于自创；要不要保留取决于实测手感，不能说是「对标」。
- ER2 支援的冷却时间与每局次数上限官方从未公布，只能确认限制机制是资源链而非冷却条。我们现在的 uses=2 / cooldownS=150 / delayS=9 是自定值，其中「全战役 2 发」是按史实（第 2 集团军严重缺乏迫击炮）定的，不是抄 ER2。
- 「ER2 没有 free aim」这一条 benchmark 标注为「查不到证据」而非「查到明确否认」。所以我们保留 5° 自由瞄准算不算「不对齐」，取决于这条推断是否成立。我按 benchmark 的判断处理，但标为存疑。
- 压制值的累积/衰减速率与触发卧倒、投降的阈值 ER2 完全没公开。我们现在的 suppressPerNearMiss 0.16 / suppressDecayPerS 0.55 / AI 0.72 阈值全部是自定值，方案里给的 0.50/0.75/0.90 三档同样是建议起点，必须实测调参。
- 医疗诊断三种器械与伤型的对应关系、失能倒计时秒数 ER2 没给。我建议的「不做诊断小游戏、35 s 倒计时、拖到掩体后按住 F 包扎 4 s」是移植取舍，不是 ER2 的实际做法。
- ER2 是否有 Q/E 侧身、C/Z 的具体姿态键位，benchmark 里没有记录（只确认了 X 换人、TAB 命令、G 投掷物、R 换弹、I 背包、B 绷带、V 近战、H 烟、0 发射模式、PageUp/Down 归零）。我们现有的 Q/E 侧身与 C/Z 姿态无法判断是否与 ER2 一致。
- 本轮实跑只覆盖了 phase=1 与 phase=2、scale=medium/small。夜战（P4）与反攻（P6）阶段的 AI 行为、以及 large 档（110 人）下的表现没有单独核对，结论外推到那两段时需要再验一次。
- 「AI 全场不开火」这条结论是在 shot=1 出图模式下测的（不进指针锁、玩家不移动）。真人操作时玩家会主动往前顶、把交火拉起来，所以玩家主观体感可能没有实测数据这么极端 —— 但 AI 与 AI 之间不交战、占领点不易主这两条是确定的，与玩家是否移动无关。
