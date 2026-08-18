# 《血战台儿庄》对标 Easy Red 2 的完整操作方案对齐案（单阵营版）

> 现状一律实跑取证（起真浏览器走 window.Taierzhuang 调试口），不读代码猜结论。

> 底本：`docs/Data_EasyRed2Benchmark.md`（ER2 系统拆解，附出处）＋ `docs/Data_EasyRed2Plan.md`（前一轮改造方案）。
> 现状一律**实跑取证**：`?shot=1&phase=1&quality=low&scale=small` 起真浏览器，走 `window.Taierzhuang` 调试口读运行时状态；不读代码猜结论。临时探针已删。
> 唯一豁免：本作不能选阵营，玩家固定为第 31 师 186 团。所有依赖"选边"的 ER2 设计，本文给**单阵营等价实现**，不照抄也不砍掉。

---

## 〇、一句话现状判断

**我们已经对齐的，是 ER2 的"减法"那一半；完全没对齐的，是它的"动词"那一半。**

对齐得相当好的部分：不显示步兵弹药数、默认无准星、压制有连续量且驱动暗角与散布、阵亡换人＋姓名籍贯卡片、兵员池、占领点进度条与冻结规则、小地图敌方只画班组级质心圆、AI 守点纪律（`holdZone` 硬半径）、laneOffset 反排队、分帧决策。这几条是 ER2 气质的来源，也恰好是 ER2 玩家称赞最多的几条，我们没走偏。

**但玩家手上现在只有九个动词**：走、跑、蹲、趴、探头、开镜、开枪、投弹、白刃，再加 R 装填、B 包扎、F 叫炮、Tab+数字下令。ER2 有的**切枪、拾取、翻越、攀爬、开门、标记、换人、救人、拖人、投降、解放战俘、接管重武器、表尺归零、两脚架、发射模式、烟幕**——一个都没有。

更要命的是三处"数据定义好了但一行没接"：

| 死数据 | 位置 | 现状 |
|---|---|---|
| `LOADOUTS`（六套携行，含 secondary/melee/scavenge） | `Data_Weapons.mjs:221` | **全仓库零引用**。玩家武器只在 `RespawnPlayer()` 里由 `identity.weapon` 决定，永远只有一支长枪 |
| `SUPPORT.nra[1]`（传令兵，`effect:"reinforceSquad"`） | `Data_Battle.mjs:224` | `Script_Combat.mjs:51` 只把 `uses:3` 存进 `this.support.runner`，**没有任何函数会消费它** |
| `ORDERS` 的 `flank` / `charge` | `Data_Battle.mjs` | 实跑确认：`ai.IssueOrder("charge",…)` 返回 affected=2，但 `goalChanged=false`——只写了 `s.order` 字符串，`Script_Ai.mjs:161-198` 的 `IssueOrder` 里没有分支，`Act()` 里也只判 `s.order === "hold"`。**这两条命令按下去什么也不会发生** |

还有一处是"实现了但方向反了"：**自由瞄准**。`Script_Player.mjs` 里 `freeAimLimitDeg = 5.0`，实跑验证推鼠标时 `aimYaw` 变化 0.084 rad 而 `yaw` 只变 0.0007 rad——free aim 是真的在工作。但 ER2 **没有 free aim**（benchmark 已把这条列为"查不到证据"级别的否定结论，理由是开发者讨论瞄准问题时只谈铁瞄偏心与视差）。这一条要做取舍，见 §2.3。

---

## 一、键位总表（这是本文最该被直接抄走的一张表）

浏览器约束优先级：① 不用任何 `Ctrl+` 组合（浏览器全占了）；② `Tab` / `Space` / `PageUp/Down` 必须 `preventDefault`；③ `Esc` 必然解除指针锁，因此只能当暂停；④ 左手不离 WASD 可达范围内塞高频键，低频键才放右手区。

| 键 | 动作 | ER2 原键 | 现状 |
|---|---|---|---|
| W/A/S/D | 移动 | 同 | ✅ 已有 |
| Shift（按住） | 冲刺；**开镜时＝屏息** | 同（ER2 就是同键复用） | ⚠️ 冲刺有，屏息错在 Space |
| C | 蹲（点按切换，设置里可切"按住"） | 同 | ✅ 已有（toggle 已实跑验证） |
| Z | 卧 | 同 | ✅ 已有 |
| Z 后按住 Shift | 快速匍匐（更快、更响） | ER2 有匍匐速度档 | ❌ 无（prone 固定 0.72 m/s） |
| **Space** | **翻越 / 攀爬**（贴到可翻物才响应，空地不跳） | 同（vault/jump） | ❌ 无。现在 Space 被屏息占着，要腾出来 |
| Q / E | 左右探头 | 同 | ✅ 已有，且带 0.42 m 身体横移＋相机滚转 |
| Alt（按住） | 自由观察（头转身不转） | 同 | ❌ 无 |
| 左键 | 开火 | 同 | ✅ |
| 右键 | 开镜（按住；设置可切 toggle） | 同 | ⚠️ 只有按住 |
| **滚轮（开镜时）** | **表尺归零** 100/200/300/400/500 m | PageUp/PageDown | ❌ 无（且没有弹道下坠可补偿）。PageUp/Down 保留为同义键 |
| 滚轮（未开镜） | 循环切武器 | — | ❌ 无 |
| **1 / 2 / 3 / 4** | **长枪 / 驳壳枪 / 大刀 / 投掷物** | 同 | ❌ 无。现在 1–6 被命令占着，要腾出来 |
| 0 | 单发／连发（仅捷克式） | 同 | ❌ 无 |
| T | 架／收两脚架 | ER2 无独立键（自动） | ❌ 无（`Zb26.bipod:true` 是死字段） |
| **G（按住）** | 攥弹蓄力，松手投出；**按住期间滚轮切投掷物种类** | ER2 是按住 G 出轮盘 | ⚠️ 蓄力已有且做得好（`state.cook` 同时决定投距与引信烧掉多少，是一对真取舍），缺种类选择 |
| **H** | 放烟——**中方等价：点燃就近柴草／湿棉被**（须贴近可燃物，2 s） | H 直接丢烟罐 | ⚠️ 现在 H 是集束手榴弹，要挪到 4 号槽的轮盘里 |
| R（点按 / 按住） | 装填 / 选弹匣（满、半） | 同（R 是换弹轮盘） | ⚠️ 点按有，弹匣逐个追踪无 |
| **F** | **通用交互**：拾枪拾弹、开门开窗、救人、解放战俘、接管固定武器 | 同 | ❌ 无。现在 F 是"叫迫击炮"，要挪到 Tab 轮盘 |
| 按住 F 指向伤员 | 器械轮盘（止血带／剪刀） | 同 | ❌ 无 |
| 按住 F 指向伤员并移动 | 拖拽伤员 | 同（`carryBody()`） | ❌ 无 |
| **Tab（按住）** | **命令径向盘**（鼠标指方向，松手下令）——**仅班长可用** | 同 | ⚠️ 现在是一张静态列表＋Digit1-6，任何人都能下令 |
| **X（按住）** | **换人径向盘**（本班活着的弟兄） | 同（`setPlayer()`） | ❌ 无（只有死后自动换） |
| 中键 | 标记敌人（spot） | ER2 在 Tab 盘里 | ❌ 无 |
| B | 包扎 | 同 | ✅ 已有 |
| M | 地图 | 同 | ❌ 无 |
| \ | HUD 全关 | ER2 有专用键 | ❌ 无 |
| Esc | 暂停 | 同 | ❌ 无 |

**实施位置**：这张表不该继续散在 `Script_Main.mjs:510-550` 的 `keydown/keyup` 里。建议新建 `Script_Input.mjs`，导出一张 `KEYMAP` 数据表（`{code, action, mode:"press"|"hold"|"wheel", context}`）＋一个 `InputRouter` 类，`Script_Main.mjs` 只保留 `router.Bind(document)` 与 `router.Read(input)` 两行。理由：键位要做重绑定与"按住/切换"设置，散在装配层里改一次要动七处。

---

## 二、逐块拆解

### 2.1 移动

ER2 的移动层其实很朴素，真正撑起战术密度的是三件事：**探头**、**姿态影响被发现概率**、**翻越让掩体成为可穿越的地形而不是一堵墙**。我们做到了第一件，第二第三都没有。

**翻越是本轮移动块的第一优先级**，理由不是"ER2 有"，是台儿庄的地形逼出来的：`Script_World.mjs` 造的是一进一进的四合院，院墙 2 m 上下，窗台 0.9 m。现在 `Script_Player.mjs` 的 `MoveWithCollision()` 只对 **0.56 m 以下**的矮物做自动抬腿（`topRel < 0.56`），也就是说所有院墙、所有窗台都是死墙。巷战里"翻窗进院、翻墙抄后路"这条最基本的战术动线现在完全不存在，玩家只能走门洞——而 AI 的 `Blocked()` 用的是同一个 0.56 阈值，所以 AI 也只会走门洞。**这一条不修，"室战墙战"这四个字就是假的。**

具体做法：`Script_Player.mjs` 加 `TryVault()`，射线朝前 0.6 m 探一次，取命中 box 的 `max[1]`，若在 0.6–1.9 m 之间且顶面往前 0.7 m 无遮挡，则播一段 0.45 s 的位移曲线（期间禁开火、禁转身，视角轻微下压）。**必须同时给 AI 开**：`Script_Ai.mjs:405` 的 `Blocked()` 加一个 `vaultable` 返回值，`Act()` 里遇到可翻物时切一个 `VAULT` 状态。

攀爬走另一条路：`Data_Battle.mjs` 的 `TOWN.ramparts` 已经带 `ramps: [-120, 0, 120]` 字段——城墙马道的位置早就有了，只是 `Script_World.mjs` 没把它建成可走的斜坡。把马道建成真斜面即可，不必做 ER2 那套梯子系统。城墙是台儿庄的主战场，"守的不再是墙，是一间一间的房子"这句话的前半句得先能上得去墙。

游泳判"可选"：运河在 `canal:{z:232}`，浮桥 `pontoon` 宽 5.5 m，是"全城唯一的退路与补给线"。叙事上运河极重要，但**玩家不该能游过去**——能游就等于浮桥不再是唯一退路，反而削弱了史实张力。建议做成：入水即极慢＋无法开火＋持续掉体力，作为一条"你不该走这里"的软墙，而不是一套游泳系统。

体力这条要注意 ER2 与我们的差别：ER2 的冲刺时长是难度滑条。我们实跑算出来冲刺 4.8 s（`stamina` 从 1.0 按 0.20/s 掉到 0.05），恢复 0.13/s 要 7.3 s 回满。这个数值本身合理，问题是 **HUD 上完全看不出来**，玩家不知道自己为什么突然跑不动了。ER2 的做法是不给条、给喘息声。我们已经有 `Script_Audio.mjs`，接一层随 `1-stamina` 加重的喘息就够，别加体力条。

### 2.2 姿态与班组姿态传染

`Covert Movements` 是 ER2 我最想抄的一条，benchmark 里也标了：**班组会模仿班长的姿态**——你趴他们也趴，而且"敌人不知道你存在时"才享受可见度加成。这是一条极低成本、极高战术密度的机制，实现只要在 `Script_Ai.mjs` 的 `Think()` 里加两行：若 `s.order === "covert"` 则 `s.stance = playerStance`，且 `HasLineOfSight()` 的距离门槛按姿态缩放（站 120 m / 蹲 80 m / 卧 45 m）。

台儿庄的夜袭阶段（P4，`nightRaid: true`，"白毛巾缠上，大刀背身后"）几乎是为这条机制量身定做的。现在 P4 除了换天光、改携行（`clips:3, grenades:8`）之外，玩法上跟白天没有任何区别——这是最可惜的一处。

### 2.3 瞄准与射击：三条硬伤

**硬伤一：没有弹道。** `Script_Main.mjs:663-700` 的 `TryFire()` 是一条直线射线，从 `player.EyePosition` 出发，命中判定用"垂距 < 0.45 m"，**瞬时命中、无重力、无飞行时间**。这意味着：表尺归零（ER2 的 PageUp/Down）没有任何东西可以补偿，提前量不存在，600 m 外和 6 m 外的落点规律完全一样。ER2 的难度设置里能直接调 `bullet gravity`，说明下坠是它写实感的骨架之一。

改法：`TryFire()` 里把射线换成一个 4–6 段的步进积分（每段 `dt = 0.02 s`，`v.y -= 9.8*dt`），每段用现有的 `battlefield.Raycast` 做段内检测。初速直接用 `Data_Weapons.mjs` 里已经有的 `AMMO.*.muzzle`（中正式 810 m/s、三八式 762 m/s）。300 m 上 7.92×57 的下坠约 0.6 m——刚好是"瞄头打胸"的量级，玩家能感知但不至于挫败。

**硬伤二：没有视差，铁瞄死钉屏幕正中。** `Script_Viewmodel.mjs` 的 `_MakeAdsPose()` 写的是 `px: -s.x, py: -s.y`——把照门精确平移到屏幕几何中心。ER2 开发者 Marco 亲自回帖确认铁瞄偏心**是故意的**，而视差（瞄具与枪管不共轴）是它"近距离必须心里修正"的来源。我们连视差的物理基础都没有：子弹从 `EyePosition` 出发，等于枪管和眼睛完全共轴。

改法两步：① `_MakeAdsPose()` 里给 `px/py` 各留 8–14 px 屏幕当量的偏置（不同枪不同——汉阳造是老套筒，枪龄大，偏得该比中正式明显）；② `TryFire()` 的射线起点从 `player.EyePosition` 改成 `viewmodel.MuzzleWorld()`（这个函数已经存在，现在只喂给枪口焰特效用了）。这两步加起来几乎零成本，但它直接决定"没有准星"这件事是有说服力的还是纯粹恶心人的。

**硬伤三：后坐力数据完全没接。** `Data_Weapons.mjs` 里每支枪都有 `recoil: {pitch, yaw, kick, recoverS}`，`Script_Main.mjs` 的 `TryFire()` 里**一次都没读过**——开完枪视角纹丝不动，只有散布在变。ER2 反复重做过后坐系统（"Reworked camera, recoil and ADS systems"）。改法：`TryFire()` 末尾往 `player.pitch` 上加 `degToRad(recoil.pitch)`、往 `yaw` 上加 `±recoil.yaw`，再在 `Script_Player.mjs:Update()` 里按 `recoverS` 指数回落，回落只回 70%（剩下 30% 要玩家自己压——这是"栓动枪打完一发要重新找目标"的手感来源）。

**关于自由瞄准的取舍建议。** ER2 没有 free aim；我们有，5°，实跑确认在工作。三个选项：

- **A（推荐）**：保留但降到 **2.0°**，并做成难度滑条（写实档 1.2°、普通档 2.0°、简单档 0）。理由：free aim 的实际游戏功能是"抵消鼠标微动噪声"，5° 太大会让玩家感觉枪不听话；而完全去掉之后，我们缺 ER2 那套"铁瞄偏心＋视差＋写实 sway"的三重补偿，"难瞄"就会退化成纯粹的手感黏滞。留 2° 是在我们自己的条件下逼近 ER2 手感的最优解。
- B：完全去掉，改为把 `SwayAmount()` 的基础值上调 60%，靠 sway 制造不确定性。这是最"照抄"的做法，但要求 §2.3 前两条硬伤先修完，否则手感会变成"枪很稳但打不中"，这是最糟的组合。
- C：保持 5° 不动。**不建议**——这已经是 RO2/HLL 路线，不是 ER2 路线，跟"无脑对标"的口径不符。

**两脚架**：`Zb26.bipod: true` 是死字段。ER2 的规矩是**不架不能开镜**（MG42/Browning/反坦克枪都是）。捷克式全班就一挺，架起来才有 800 m 有效射程——这条规矩正好把"机枪手必须找个能架枪的位置"变成战术决策，而不是"多一支伤害高的枪"。T 键架枪，架起来后 `SpreadDeg()` × 0.35、`SwayAmount()` × 0.25、但转向速度砍到 30%。

**枪口过热**：`Type11.overheatShots: 200 / coolDownS: 8.0` 同样是死字段。十一年式不能换枪管，约 200 发必须冷却——这是日军机枪火力有节奏间隙的史实来源，也是玩家"卡着它冷却的空档冲过街口"的战术窗口。接在 `Script_Ai.mjs:TryFire()` 里。

### 2.4 武器与背包：最大的一块空白

**切枪必须做，这是本轮性价比最高的一条。** `LOADOUTS` 六套携行躺在 `Data_Weapons.mjs` 里一行没接，而 `L3_WhiteTowel`（"敢死队标准携行：一支长枪、一支短枪、肩背大刀、腰间挂满手榴弹"）恰恰是台儿庄最有辨识度的一套装备。现在玩家永远只有 `identity.weapon` 给的那一支枪，大刀只有按 V 时才凭空出现一下（`DoMelee()` 里 `WEAPONS[currentWeapon]?.bayonet ? currentWeapon : "Dadao"`，是硬编码 fallback，不是背包里真有一把刀）。

改法：`RespawnPlayer()` 改读 `LOADOUTS[phase.loadout]`，`state` 里加 `slots: {primary, secondary, melee, throwable}` 与 `activeSlot`，1/2/3/4 与滚轮切换，`viewmodel.Equip()` 已经支持换枪（有掏枪动画和 rig 重建），接上去就行。`Data_Battle.mjs` 的 `PHASES` 里每个阶段补一个 `loadout` 字段指向对应的 `L0`–`L5`。

**捡枪捡弹必须做。** `L4_LastFiveMinutes` 有 `scavenge: true` 这个字段，注释写着"打到这儿，子弹得从倒下的人身上取"——这是四月四日"守军只剩西南一隅"那一段的核心体验，现在是死的。做法：`Script_Ai.mjs` 的 `Soldier` 死亡时在 `corpses` 上挂 `{weaponId, clips}`，`Script_Main.mjs` 加 `TryPickup()`（F 键），2 m 内最近的尸体，捡弹药或换枪。**捡日军三八式要给一个真代价**：六五口径的子弹我们自己没有，捡了枪就只有枪里那五发，打完只能扔。这是史实（缴获枪没有配套弹药补给），也是一条好规则。

**装填的弹匣追踪**：ER2 逐个追踪弹匣，提前换弹会在背包里留一个半满弹匣，还能手动往空弹匣压子弹。中正式/汉阳造是**桥夹压入固定弹仓**，规则更硬：弹仓里还剩 2 发时压桥夹，只能压进 3 发，剩下 2 发白扔——这比 ER2 的弹匣规则更狠也更真实。现在 `Reload()`（`Script_Main.mjs:576`）是 `state.ammo = w.magazine`，直接填满，浪费掉的那部分不存在。改成记录 `state.clipPartial`。

**"不显示弹药数"这条我们对齐了，但缺后半句。** ER2 靠角色喊话报剩余弹匣数来补偿信息缺失，我们现在只有空仓时一声 `bolt` 音效＋"按 R 压弹"提示。`Script_Audio.mjs` 有 84 KB 的合成音库，加一句"还剩两个桥夹！"的报数（按 R 时触发）成本极低，而且比 UI 数字更沉浸。

### 2.5 班组指挥：需要一个真的班组对象

**这是结构性缺口，不是功能缺口。** 全仓库 grep `squad`，只在注释和 `Data_Script.mjs` 的人物介绍里出现（"刘振海，9 连 3 班班长"）。运行时**根本没有班组对象**：`ai.IssueOrder()` 的作用域是"玩家周围 26 m 内所有 nra 士兵"，谁在半径内谁听令。

ER2 的三条规矩都建立在班组之上：① 只有班长能下令（`isSquadLeader()`）；② 按住 X 在班组成员间切换（`setPlayer()`）；③ 班长死了按 **班长→无线员→机枪手→狙击手→步枪兵** 顺位自动移交，当前班长显示在屏幕左上角。

单阵营等价：新建 `Script_Squad.mjs`，一个 `Squad` 类持有 `members[]`、`leader`、`runner`（传令兵＝ER2 无线员的等价物）、`gunner`（捷克式机枪手）。`Script_Main.mjs` 的 `SeedSoldiers()` 里把近身班组（`NEAR_SQUAD.nra = 5`）绑成一个 Squad，玩家是其中一员。移交顺位改成史实版：**班长 → 传令兵 → 机枪手 → 老兵（年龄最大者）→ 新兵**。`Data_Script.mjs` 里刘振海那句"……班长这个位置，你顶上"就是这套机制的叙事出口——现在它是一句台词，接上 Squad 之后它会变成一个真的状态变更。

**Tab 轮盘要从静态列表改成径向盘。** 现状实跑：`hud.el.orders` 里是六行 `1跟我来 2向前 3固守 4散开 5绕过去 6上刺刀`，Tab 只是切 CSS 类，选择靠数字键。ER2 是按住 Tab、鼠标指方向、松手下令——**单手可达且不用看键**，这在指针锁里比数字键顺手得多。新建 `Script_Wheel.mjs`（纯 DOM/Canvas 2D，零 3D 开销），Tab 与 X 与 G 与 F 四个轮盘共用一份实现。

**flank / charge 必须修活。** `IssueOrder()` 加两个分支：`flank` 取 `aimPoint` 两侧各 25 m 的绕行点、分半数走左半数走右；`charge` 设 `s.order="charge"` 并在 `Act()` 里让守点单位**例外地允许出区**（现在 `STATE.CHARGE` 分支写死 `if (s.target && !s.holdZone)`，守点的人永远不冲锋——这条纪律在防守时是对的，但白刃冲锋是主动出击，要能覆盖）。上刺刀冲锋对台儿庄是文化上的必做项，不能是一个按下去没反应的键。

命令表建议扩到 8 条（径向盘正好 8 分区）：跟我来 / 向前 / 固守 / 散开 / 绕过去 / 上刺刀 / **潜行（扣火）** / **要炮**。后两条是新增。

### 2.6 支援：把"按 F 出炮"改回一条会断的链路

现状：`F` → `CallMortar()` → `combat.CallMortar()` 检查 `support.mortar > 0 && mortarCooldown <= 0` → 9 秒后落弹。这是**冷却读秒**模型，正是 ER2 明确没有采用的那种。ER2 的限制是**资源链**：无线员活没活、地图上有没有炮、坐标输没输对。benchmark 里写得很重："用『链路可断』代替『冷却读秒』，戏剧性高一个数量级"。

**单阵营 + 史实的等价实现（中方没有无线电，这反而更好做）**：

1. 玩家（须为班长）在 Tab 盘上选「要炮」，射线拾取落点；
2. 班里的**传令兵**接到指令，转身往城东南新关帝庙（池峰城师指挥所，`OBJECTIVES` 里 id 为 `GuandiTemple`）方向跑——**他是一个真的 Soldier，在地图上跑，会被打死**；
3. 传令兵跑到 or 跑不到，决定这次呼叫成不成。跑死了＝这次没了，而且**班里从此没有传令兵，直到有人被指派顶上**（对应 ER2「无线员死了全班失去支援能力」）；
4. 落弹前有 8–12 s 窗口，可以按 Tab 盘的同一格取消（ER2 有 `cancel artillery`）；
5. 弹种只有两种：**82 mm 榴弹**、**发烟弹（极少，一局 1 发）**。没有 APHE，没有空中支援，没有重炮——这是史实红线，不许为了凑 ER2 的弹种数量补齐。

`SUPPORT.nra[1]` 那个 `effect: "reinforceSquad"` 的传令兵正好是同一个对象的另一种用途（要人而不是要炮），一并接上。

**"亲自操炮"这条值得做**：ER2 里你自己操一门炮时，屏幕上出现"炮弹图标 + 图标下方一个数字"，你把炮口转向图标、把仰角刻度调到那个数字。这是把间接射击做成了手工操作。台儿庄版本：地图上放一门二十年式 82 mm 迫击炮（`SUPPORT.nra[0]` 已经有完整参数），玩家按 F 接管，用滚轮调表尺、看着落点标记打——比按一个键出炮有说服力得多，而且成本很低（一个固定机位＋两个 UI 数字）。

**AI 会呼炮打你**：ER2 有一条"你蹲远处狙太久，AI 会呼叫炮击轰你"，benchmark 标了"这条太狠了，值得抄"。现状 `Script_Combat.mjs` 的 `launcherTimer = 8` 是**纯定时**的，跟玩家行为无关。改成：`StepIjaSupport()` 里统计"玩家在同一个 6 m 半径内停留且开火超过 25 s"，满足则把下一发掷弹筒的落点直接设成玩家位置。八九式重掷弹筒能越过院墙打进院子，这条史实特性正好让"蹲坑"在物理上不成立。

### 2.7 医疗：现在是"直接死"，缺整整一层

现状 `Script_Player.mjs` 只有一层：`health <= 0` → `Kill()` → 阵亡卡片 → 换人。`Bandage()` 有，B 键有，止血逻辑正确（不回满血、伤口留着、跑不快）。但 ER2 的**两层结构**里，我们只做了轻伤层，而且轻伤层还漏了一条：ER2 中弹后**不能跑也不能屏息**，我们只降速（`LegPenalty()` 最低 0.42），照样能冲刺、照样能屏息。

重伤层（Downed）完全没有。这一层在 ER2 里的作用是**制造队友依赖**——你救不了自己，只能等人来。对台儿庄来说这层价值更高："把伤员拖回城墙后"是这场仗里最强的一个画面。

建议实现（`Script_Player.mjs` 加状态机，`Script_Ai.mjs` 的 `Soldier` 同步加）：

```
Healthy → Wounded（去饱和、不能跑、不能屏息、每秒掉血）
        → Downed（倒地，40 秒倒计时，能爬不能开枪，能喊）
        → Dead
```

**诊断小游戏简化为两种器械**：止血带（对枪伤/流血）、剪刀（对弹片/绞缠）。伤员头顶浮一个图标，按住 F 出器械轮盘，**选错只浪费 3 秒**（ER2 原样）。中方没有正规医护兵编制，所以照 ER2 的"职业不锁能力"办：**任何人捡到药包都能救人**，这既对齐 ER2 也符合史实（台儿庄的伤员大量靠同班弟兄和担架兵）。

拖拽（按住 F 移动）优先级排在诊断之前——"先拖到掩体后再救"是 ER2 那套机制里最好玩的战术决策，而且它单独就成立。

### 2.8 信息层

小地图我们做得对：只画班组级质心圆、不画个体敌人（`Script_Hud.mjs:227`）。两处要改：① 现在是**全场 90 m 内所有敌人取一个质心**，应该按班组分别取（等 `Script_Squad.mjs` 落地后自然解决）；② **M 键地图完全没有**——ER2 的 M 图标出占领区、友军炮兵、补给点。台儿庄版本标：占领点、我方兵员池、传令兵当前位置（这是我们独有的一个好东西：你能看着他在图上跑）、浮桥。

**占领点图标语义要改。** 现在 `UpdateMarkers()` 用 `▲`（我方）/ `✕`（敌方）。ER2 的语义是**交叉刀剑＝待打、旗帜＝已占**，这套语义比"三角/叉"清楚得多，而且交叉刀剑对大刀队这个题材有额外的呼应。

**HUD 一键全关**（`\`）值得做，成本是一行 `hudRoot.classList.toggle("off")`。ER2 玩家用它拍照，我们用它出图——`Script_ShotTest.mjs` 现在为了出干净画面得靠 `?shot=1`，有了这个键就多一条路。

**标记敌人（spot）**：中键，射线 120 m 内命中敌兵则在小地图与 HUD 上给一个 8 秒的标记，且**只给班组级圆圈不给个体点**（保持 ER2 的信息模糊度）。

### 2.9 其它交互

**开门开窗**：ER2 的 `AiParams` 里 `allowOpenWindows` 是一条独立的 AI 能力。我们的门窗（`Script_World.mjs:326-363`）是静态几何，既不能开也不挡人（门洞是空的）。做法：门/窗做成可交互 box，F 开关，开着的门挡视线判定按开合角度走。这条跟翻越是一对——两条都到位，四合院才真的是"一间一间的房子"。

**投降**：这是**史实红线最吃紧**的一条。ER2 有七种投降触发（被压制、丢点、票尽、给伤敌医疗等），还有"玩家自己会自动投降"。我们的取舍：

- **玩家永不自动投降**。ER2 写实难度下玩家会被强制投降，我们**不做**。台儿庄是死守，孙连仲那句"士兵打完了，你自己填上去"是这个游戏的命门，玩家被系统判定投降会直接摧毁它。（ER2 自己也提供了 `disable player auto-surrender` 开关，所以这不算破坏对标。）
- **中国守军 AI 投降率设为 0**，但保留"往后缩"（`Script_Ai.mjs` 已有 `morale` 与后撤逻辑）。溃退不是投降。
- **日军 AI 投降率偏低但非零**：只在"占领点刚被夺回 + 该点内日军 < 3 人 + 压制 > 0.8"三条同时满足时触发，概率 0.25。这既保留了 ER2"占点连锁投降"的即时正反馈，又不会让日军变成一碰就跪。
- **解放己方战俘**：F 键，ER2 原样（他们会掏出手枪继续作战）。台儿庄版本更朴素：解放的弟兄捡起地上的枪归队，并且**给兵员池 +1**——这是票池的另一个来源，也是 ER2 设计的原意。

---

## 三、单阵营下的三条等价实现（汇总）

| ER2 依赖"选边"的设计 | 我们的等价实现 |
|---|---|
| 双方出生菜单 / 逐个成员手动重生 | 阵亡卡片（已有）+ **X 键换人径向盘**（新增），只在中方班组内。ER2 的"手动逐个操作"我们不抄——那是多人局的产物，单人局里只会打断节奏 |
| 攻守互换 | 已经天然对齐：P1–P5 玩家守，**P6 全线反攻**转攻。这是史实进程，比 ER2 的模式切换更有说服力。要补的是 P6 的 `SetSideGoal` 方向翻转与占领点激活顺序 |
| Push the Frontline 双向推拉 | 一维「城内战线」：`frontlineIndex` 走 北门 → 清真寺 → 文昌阁 → 关帝庙 → 南门/浮桥 五档。白天日军往南推，夜袭往北夺回。**切档不重载场景**，只移双方出生点与激活的占领区（web 上这条尤其关键，任何加载中断都会掐断沉浸） |

---

## 四、施工顺序建议（四轮）

**第一轮 · 把死数据接活 + 键位迁移**（收益最高、风险最低）
切枪与 `LOADOUTS`、修活 flank/charge、传令兵 `reinforceSquad`、后坐力接线、两脚架、过热。键位按 §1 的表整体迁移到 `Script_Input.mjs`。这一轮不新增系统，只把已经写好的数据接上，`Script_PlayTest.mjs` 现有 28 条断言应全绿。

**第二轮 · 三个新动词**
翻越（Space）、通用交互 F（拾枪拾弹/开门/接管迫击炮）、Tab/X/G/F 四个径向盘（`Script_Wheel.mjs`）。这一轮之后玩家手上的动词数从 9 个涨到 16 个左右，是体感变化最大的一轮。

**第三轮 · 班组与链路**
`Script_Squad.mjs`、指挥权顺位、传令兵支援链、Downed 层 + 拖拽 + 器械诊断、投降与解放战俘。这一轮动的是规则层，要给 `Script_PlayTest.mjs` 补断言（传令兵被打死后呼叫失败、班长死后指挥权转移、伤员被拖动后位置变化）。

**第四轮 · 信息与设置**
弹道积分 + 表尺归零、铁瞄偏心 + 视差、M 地图、spot、HUD 全关、开局难度滑条面板（AI 数量／压制强度／弹道重力／自由瞄准角度／准星开关）。

---

## 五、必须守住的四条史实红线（对标时不许越过）

1. **支援不对称不许抹平。** 中方：迫击炮一局 2 发、无空中支援、无重炮、反坦克只有集束手榴弹。日方：掷弹筒、九二式重机、八九式中战车、野战重炮。ER2 里双方支援对等，我们**不对齐这一条**。这是史实，不是难度设计。
2. **玩家永不自动投降，中国守军 AI 投降率为 0。** 日军投降率偏低但非零（0.25，且需三条件同时满足）。
3. **玩家的直接长官是 186 团团长王冠五，师指挥所在城东南新关帝庙（池峰城）。** 传令兵支援链的终点、M 图上的"要人要炮往哪跑"，都必须指向 `OBJECTIVES` 里的 `GuandiTemple`，不许随便挑一个点。
4. **缴获的日械没有配套弹药。** 捡三八式只有枪里那五发。这条既是史实，也是"捡枪"这个动词不至于破坏经济平衡的天然闸门。

---

## 六、需要你拍板的三件事

1. **自由瞄准降到 2° 还是完全去掉**（§2.3 的 A / B）。我推 A，但这是手感取向问题，不是对错问题。
2. **玩家能不能开日军战车**。ER2 有完整载具层，我们一辆都没有。我的建议是**不做驾驶，只做接管固定武器**（缴获的九二式重机、我方迫击炮）——史实上台儿庄中国军队缴获战车并驾驶的记录不可靠，而"缴获重机枪掉转枪口"是有的。但如果你要"无脑对标"到载具这一层，那要另开一轮，工作量约等于第二、三轮之和。
3. **难度滑条要不要做成开局面板**。ER2 的做法是一组滑条而不是三个档位，benchmark 把它列为"可选"。做的话要新增一个开机 UI（现在 `index.html` 里只有一个"进城"按钮，`scale`/`quality` 全靠 URL 参数）。

---

## 逐条对齐项

### [应做/小] 操作｜已有且对齐

- **ER2**：W/A/S/D 移动，Shift 按住冲刺并消耗体力（确证：benchmark §4 与移植清单反复引用 Shift）
- **现状**：Script_Main.mjs:552-558 ReadKeys() 读 WASD + ShiftLeft/Right；Script_Player.mjs:Update() 里 canSprint 需 stance==stand && ads<0.25 && forward>0.3。实跑算得冲刺 4.8 s（stamina 1.0→0.05，0.20/s），恢复 0.13/s 需 7.3 s
- **要做**：保持。仅把键位读取从 Script_Main.mjs 内联搬进新建 Script_Input.mjs 的 KEYMAP 表，行为不变
- **史实**：无
### [应做/小] 操作｜已有但不对齐

- **ER2**：体力是难度滑条控制的冲刺时长；无体力条 UI，靠喘息声反馈（推断：ER2 HUD 极简，未见体力条描述）
- **现状**：Script_Player.mjs 有 this.stamina，影响 sprint 与 SwayAmount，但 Script_Hud.mjs:SetState() 里完全没有体现，玩家不知道自己为什么跑不动
- **要做**：Script_Audio.mjs 加 breathHeavy 循环音，音量随 (1-player.stamina) 线性；Script_Main.mjs:Frame() 里每帧喂一次。不加体力条
- **史实**：无
### [可选/小] 姿态｜已有但不对齐

- **ER2**：C 蹲、Z/Ctrl 卧，默认点按切换，设置里可改按住
- **现状**：实跑确认 C 是 toggle（stand→crouch→stand），Z 同。Script_Player.mjs:Update() 里 input.pronePressed/crouchPressed 分支。缺「按住」模式选项
- **要做**：Script_Input.mjs 的 KEYMAP 给 crouch/prone 加 mode:'toggle'|'hold' 字段，开局设置里可切；Script_Player.mjs:Update() 读 input.crouchHeld 分支
- **史实**：无
### [应做/小] 姿态｜已有但不对齐

- **ER2**：匍匐有速度档（确证：AiParams 的 allowChangePose 含爬，玩家侧攻略提到匍匐前进）
- **现状**：Script_Player.mjs 的 STANCE.prone.speed 固定 0.72 m/s，没有快慢档
- **要做**：STANCE.prone 加 fastSpeed:1.25；Script_Player.mjs:Update() 里 prone 且 input.sprint 时用 fastSpeed，同时把脚步音量×1.8（快爬更响，是取舍不是白拿）
- **史实**：无
### [必做/中] 操作｜完全没有

- **ER2**：翻越矮墙/窗台（vault），Space；ER2 的掩体因此是可穿越地形而非死墙
- **现状**：Script_Player.mjs:MoveWithCollision() 只对 topRel<0.56 的物体自动抬腿，院墙(2m)与窗台(0.9m)全是死墙；Script_Ai.mjs:Blocked() 用同一个 0.56 阈值，AI 也只会走门洞
- **要做**：Script_Player.mjs 新增 TryVault()：朝前 0.6 m 射线，命中 box.max[1] 在 0.6~1.9 m 且顶面前方 0.7 m 无遮挡则播 0.45 s 位移曲线（期间禁开火/禁转身）。Script_Main.mjs keydown 绑 Space（须 preventDefault）。同步给 Script_Ai.mjs:Blocked() 返回 vaultable，Act() 加 VAULT 状态
- **史实**：无。四合院院墙与窗台是 Script_World.mjs 真造出来的，翻不过去等于「室战墙战」这四个字是假的
### [必做/中] 操作｜完全没有

- **ER2**：攀爬梯子
- **现状**：无任何攀爬代码。但 Data_Battle.mjs 的 TOWN.ramparts 已带 ramps:[-120,0,120] 字段，Script_World.mjs 没把马道建成可走斜坡
- **要做**：Script_World.mjs 建马道时按 ramps 位置生成真斜面（坡度 <30°，宽 2.4 m）并进 collider 表。不做梯子系统
- **史实**：城墙马道是台儿庄的真实结构；玩家上不了墙，P1「日军攻城」阶段就没有守墙可言
### [可选/小] 操作｜已有且对齐

- **ER2**：探头 lean，Q/E
- **现状**：Script_Player.mjs:SyncCamera() 里 leanOffset 0.42 m 身体横移 + cam.rotation.z 滚转，做得比很多游戏扎实
- **要做**：保持不动
- **史实**：无
### [可选/小] 操作｜完全没有

- **ER2**：跳跃（Space，与 vault 同键）
- **现状**：Script_Player.mjs 没有跳跃分支；velocity.y 只受重力与地面吸附
- **要做**：不单做跳跃。Space 只在贴到可翻物时响应（TryVault），空地按 Space 无事发生
- **史实**：无。写实军事 FPS 弱化跳跃是常规做法，也避免「兔子跳」破坏氛围
### [应做/小] 操作｜完全没有

- **ER2**：游泳
- **现状**：Data_Battle.mjs 有 canal{z:232,width:46} 与 pontoon{width:5.5}，但 Script_Player.mjs 没有水体判定
- **要做**：Script_Player.mjs:MoveWithCollision() 后加水体判定：z>canal.z-width/2 且不在浮桥宽度内时，速度×0.25、禁开火、每秒掉 2 体力。做成软墙不做游泳系统
- **史实**：浮桥是「全城唯一的退路与补给线」。玩家能游过运河，浮桥的史实分量就没了
### [应做/大] 载具｜完全没有

- **ER2**：F 进出载具；坐席制（驾驶/车长/炮手），玩家控坦克组可同时操作多成员
- **现状**：Data_Weapons.mjs 定义了 Type89Tank/Type94Tankette 完整参数（装甲、hp、弱点倍率、minAlleyWidthM），但全仓库 grep 无任何 Script_* 引用；战场上一辆车都不存在
- **要做**：不做驾驶。改做「接管固定武器」：Script_Main.mjs 加 TryMount()（F 键），可接管缴获的九二式重机、十一年式、我方二十年式迫击炮。坦克只作为敌方目标出现（由集束手榴弹从高处解决）
- **史实**：缴获重机枪掉转枪口有记录；中国军队缴获并驾驶日军战车的记录不可靠。此处按「不做」处理
### [应做/中] 姿态｜完全没有

- **ER2**：Covert Movements：班组扣火潜行，AI 模仿班长姿态；未被发现时享受可见度加成
- **现状**：Script_Ai.mjs 的 stance 只由 suppression 与距离决定（Think() 里 s.stance = bestDist<20?0:1），跟玩家姿态无关；HasLineOfSight() 也不看目标姿态
- **要做**：ORDERS 加 {id:'covert'}；Script_Ai.mjs:Think() 里若 s.order==='covert' 则 s.stance=玩家姿态且不开火；HasLineOfSight() 的距离门槛按目标姿态缩放（站120/蹲80/卧45 m）
- **史实**：P4 夜袭阶段（nightRaid:true，白毛巾缠上、大刀背身后）正是为这条机制生的，现在 P4 玩法上跟白天毫无区别
### [应做/小] 瞄准｜已有但不对齐

- **ER2**：右键开镜，按住；设置里可切换。必须等 ADS 动画播完再开枪
- **现状**：Script_Main.mjs:540-549 mousedown/up button===2 设 input.ads，只有按住模式。Script_Player.mjs 按 weapon.adsTimeS 插值，但 TryFire() 不检查 ads 是否播完
- **要做**：Script_Input.mjs 加 ads 的 toggle 选项；Script_Main.mjs:TryFire() 加 if (input.ads && player.ads < 0.9) return（开镜途中不给开枪）
- **史实**：无
### [必做/小] 瞄准｜已有但不对齐

- **ER2**：屏息＝ADS 时按住 Sprint（Shift），减晃 + 视野轻微放大；时长随难度变
- **现状**：Script_Main.mjs:557 input.breathHold = keys.has('Space')，键错了。Script_Player.mjs 要求 ads>0.6 && stamina>0.1，耗 0.28/s，SwayAmount ×0.28、SpreadDeg ×0.55——逻辑对，键不对
- **要做**：把屏息挪到 Shift（与冲刺同键，开镜时语义切换），Space 腾给翻越。改 Script_Main.mjs:ReadKeys()。再补 ER2 的「视野轻微放大」：屏息时 camera.fov 再 ×0.94
- **史实**：无
### [应做/中] 瞄准｜完全没有

- **ER2**：Page Up/Down 调表尺归零；难度设置里可调 bullet gravity（确证：更新日志与难度页）
- **现状**：没有归零，也没有可归零的对象——弹道是直线
- **要做**：先做弹道（见下一条），再加 state.zeroM（100/200/300/400/500）；开镜时滚轮调，PageUp/PageDown 为同义键（须 preventDefault）。归零改的是 TryFire() 起始俯角补偿量，HUD 只在开镜时角落显示一个小数字
- **史实**：无
### [必做/中] 瞄准｜完全没有

- **ER2**：弹道有重力与飞行时间（推断：由 Page Up/Down 归零与 bullet gravity 滑条反推，具体参数官方未公开）
- **现状**：Script_Main.mjs:TryFire() 是一条直线射线，从 player.EyePosition 出发，命中判定用垂距<0.45 m，瞬时命中、无重力、无飞行时间
- **要做**：TryFire() 改成 4~6 段步进积分（每段 dt=0.02 s，v.y -= 9.8*dt），段内用现有 battlefield.Raycast。初速直接读 Data_Weapons.mjs 的 AMMO.*.muzzle（Mauser792=810、Arisaka65=762）。300 m 下坠约 0.6 m
- **史实**：无
### [必做/小] 瞄准｜已有但不对齐

- **ER2**：没有自由瞄准（free aim / 武器 deadzone）。「难瞄」来自铁瞄偏心 + 视差 + sway + 压制（这是 benchmark 明确标注的「查不到证据」级否定结论，非查到明确否认）
- **现状**：Script_Player.mjs:freeAimLimitDeg = 5.0，开镜时收窄到 1.4°。实跑验证：推鼠标 40 px，aimYaw 变 0.084 rad 而 yaw 只变 0.0007 rad——free aim 确实在工作
- **要做**：推荐方案 A：降到 2.0° 并做成难度滑条（写实 1.2 / 普通 2.0 / 简单 0）。改 Script_Player.mjs 的 freeAimLimitDeg 为可配。方案 B（完全去掉 + sway 上调 60%）必须等铁瞄偏心与视差两条先落地，否则手感退化成「枪很稳但打不中」。方案 C（维持 5°）不建议——那是 RO2/HLL 路线不是 ER2 路线
- **史实**：无
### [应做/小] 瞄准｜已有但不对齐

- **ER2**：铁瞄故意不在屏幕正中，开发者 Marco 亲自回帖确认是设计而非 bug（确证）
- **现状**：Script_Viewmodel.mjs:_MakeAdsPose() 写的是 px:-s.x, py:-s.y——把照门精确平移到屏幕几何中心，正好是 ER2 明确不做的那种
- **要做**：_MakeAdsPose() 给 px/py 各留 8~14 px 屏幕当量的偏置，逐枪不同（汉阳造是老套筒、枪龄大、膛线磨得厉害，偏得该比中正式明显）
- **史实**：汉阳造与中正式的成色差是史实，可以直接借这条做偏置差异
### [必做/小] 瞄准｜完全没有

- **ER2**：瞄具与枪管不共轴的视差，近距离须心里修正；准星的真正作用是补偿视差而非辅助瞄准
- **现状**：Script_Main.mjs:TryFire() 的射线起点是 player.EyePosition（眼位），等于枪管与眼睛完全共轴，物理上不存在视差。viewmodel.MuzzleWorld() 已经存在但只喂给枪口焰特效
- **要做**：TryFire() 的 from 从 player.EyePosition 改成 viewmodel.MuzzleWorld(_muzzle)。一行改动，视差自然出现
- **史实**：无
### [必做/小] 瞄准｜完全没有

- **ER2**：后坐反复重做过（Reworked camera, recoil and ADS systems）
- **现状**：Data_Weapons.mjs 每支枪都有 recoil:{pitch,yaw,kick,recoverS}，Script_Main.mjs:TryFire() 一次都没读过。开完枪视角纹丝不动，只有散布在变
- **要做**：TryFire() 末尾给 player.pitch 加 degToRad(recoil.pitch)、yaw 加 ±recoil.yaw；Script_Player.mjs:Update() 按 recoverS 指数回落，且只回 70%（剩 30% 要玩家自己压）
- **史实**：无
### [应做/中] 瞄准｜已有但不对齐

- **ER2**：栓动拉栓有动画与时间成本，官方专门优化过与身体动作的同步
- **现状**：Script_Main.mjs:TryFire() 用 weapon.fireIntervalS（中正式 1.25 s）把拉栓时间包进射击间隔；Data_Weapons.mjs 另有独立的 boltTimeS(1.05) 没被读过。拉栓不可被打断也不能边跑边拉
- **要做**：把 boltTimeS 拆出来做成独立的 viewmodel 动作阶段；期间允许移动与转向但禁开火；被 TakeHit 打断则重来（中弹时拉栓拉不完是很有说服力的一笔）
- **史实**：无
### [应做/小] 操作｜完全没有

- **ER2**：按 0 切换发射模式
- **现状**：Script_Main.mjs 无发射模式概念；捷克式 Zb26 只有全自动（fireIntervalS = 60/500）
- **要做**：state 加 fireMode；Script_Main.mjs keydown 绑 Digit0；仅 Zb26 有效，单发时 fireIntervalS 用 0.55、散布 ×0.7
- **史实**：ZB vz.26 确有快慢机。全班就一挺，弹匣只有 20 发——单发点射是当时的实际用法
### [必做/中] 操作｜完全没有

- **ER2**：机枪不架两脚架不能开镜（MG42/Browning/反坦克枪等），架起来后坐大降
- **现状**：Data_Weapons.mjs 的 Zb26 有 bipod:true，全仓库无任何消费方（grep 只命中 Script_Actor.mjs 里的两脚架几何名）
- **要做**：state 加 bipodDeployed；T 键架/收，且须 stance==='prone' 或贴近可架物；未架时右键不进 ADS。架起后 SpreadDeg×0.35、SwayAmount×0.25，转向速度砍到 30%
- **史实**：捷克式每班 0—1 挺，是第 2 集团军最宝贵的自动火力。逼玩家找架枪位置，正好把它从「伤害高的枪」变成战术决策
### [应做/小] 操作｜完全没有

- **ER2**：枪口过热（更新日志确证有过热机制）
- **现状**：Data_Weapons.mjs 的 Type11 有 overheatShots:200 / coolDownS:8.0，无消费方
- **要做**：Script_Ai.mjs:TryFire() 里给 Soldier 加 heat 计数，达 overheatShots 则强制停火 coolDownS 秒并出白烟（Script_Vfx.mjs 已有烟粒子）
- **史实**：十一年式不能换枪管，约 200 发须冷却——这是日军机枪火力有节奏间隙的史实来源，也是玩家冲过街口的战术窗口
### [必做/中] 操作｜完全没有

- **ER2**：1/2/3 切武器槽
- **现状**：Script_Main.mjs:130 let currentWeapon 只在 RespawnPlayer() 里由 identity.weapon 赋值一次。Data_Weapons.mjs:221 的 LOADOUTS（六套，含 secondary/melee/throwables/scavenge）全仓库零引用。大刀只是 DoMelee() 里的硬编码 fallback，不是背包里真有一把
- **要做**：RespawnPlayer() 改读 LOADOUTS[phase.loadout]；state 加 slots:{primary,secondary,melee,throwable} 与 activeSlot；Digit1~4 与滚轮切换；viewmodel.Equip() 已支持换枪（有掏枪动画与 rig 重建），直接调用。Data_Battle.mjs 的 PHASES 每项补 loadout 字段指向 L0~L5
- **史实**：L3_WhiteTowel「一支长枪、一支短枪、肩背大刀、腰间挂满手榴弹」是台儿庄最有辨识度的一套装备，现在完全是死数据
### [应做/中] 操作｜已有但不对齐

- **ER2**：按住 G 开投掷物轮盘（烟幕/炸药/反坦克手雷/TNT/弹药箱/地雷）
- **现状**：Script_Main.mjs:518-519 G=手榴弹、H=集束，各自独立按住蓄力。蓄力机制做得好（state.cook 同时决定投距与引信烧掉多少，是真取舍），但没有种类选择
- **要做**：保留 G 的蓄力（松手投出），改为「按住 G 期间滚轮切换投掷物种类」；H 腾出来给放烟。轮盘用新建的 Script_Wheel.mjs，与 Tab/X/F 共用
- **史实**：中方投掷物只有：手榴弹、集束手榴弹。没有反坦克手雷、没有 TNT、没有地雷。轮盘上只该有两格加一格烟
### [应做/中] 操作｜已有但不对齐

- **ER2**：按 H 直接丢烟（背包里有就行）
- **现状**：Script_Main.mjs:519 H 现在是集束手榴弹（BeginCook('GrenadeBundle')）
- **要做**：H 改为「点燃就近柴草/湿棉被造烟」：须站在可燃物 2 m 内，按住 2 s，产生一根持续 25 s 的烟柱（Script_Vfx.mjs 已有 SeedSmokeColumns 用的烟柱实现，直接复用）。集束移入 4 号槽轮盘
- **史实**：中方没有制式发烟罐。点燃柴草、湿棉被造烟是当时的实际做法，比照抄烟幕弹更对味，且天然带「要花时间、要有可燃物」的代价
### [应做/中] 操作｜已有但不对齐

- **ER2**：弹匣逐个追踪；提前换弹会留半满弹匣；可手动往空弹匣压子弹；空枪只有散弹时可单发上膛
- **现状**：Script_Main.mjs:576 Reload() 是 state.clips-=1; state.ammo = w.magazine——直接填满，浪费掉的那部分不存在
- **要做**：改成桥夹规则：弹仓剩 n 发时压桥夹只能压进 (5-n) 发，剩下的白扔；state 加 clipPartial 记录半用桥夹。按住 R 出弹匣轮盘（满/半）
- **史实**：中正式与汉阳造是桥夹压入固定弹仓，规则比 ER2 的可拆弹匣更硬也更真实。「弹带大半是瘪的」这句注释现在只体现在 clips 数量上，没体现在装填动作里
### [应做/小] HUD｜已有但不对齐

- **ER2**：步兵武器不显示弹药数（只有载具有）；角色会喊话报剩余弹匣
- **现状**：实跑确认 hud.el.state 里没有弹药数（对齐）。但缺后半句：空仓时只有一声 bolt 音效 + 「按 R 压弹」文字提示，没有报数喊话
- **要做**：Script_Audio.mjs 加报数语音（「还剩两个桥夹！」），Script_Main.mjs:Reload() 时按 state.clips 触发。同时把「按 R 压弹」这条文字提示改成只在前两次出现（教学之后就撤）
- **史实**：无
### [必做/中] 操作｜完全没有

- **ER2**：捡枪捡弹；可缴获敌方武器（tanks, cannons and machine guns）
- **现状**：没有任何拾取代码。Data_Weapons.mjs 的 L4_LastFiveMinutes 有 scavenge:true 与注释「打到这儿，子弹得从倒下的人身上取」，是死字段
- **要做**：Script_Ai.mjs 的 Soldier 死亡时在尸体上挂 {weaponId, clips}；Script_Main.mjs 加 TryPickup()（F 键），2 m 内最近尸体，捡弹药或换枪
- **史实**：缴获三八式只有枪里那五发——六五口径我们自己没有补给。这既是史实（缴获枪无配套弹药），也是拾取不破坏经济平衡的天然闸门
### [可选/中] 操作｜完全没有

- **ER2**：I 键快捷背包轮盘；给队友补给（背包里有弹药箱）
- **现状**：无背包 UI，无补给动作
- **要做**：背包轮盘判可选，不做。补给做成 F 交互的一个分支：对着弹药见底的弟兄按 F，分一个桥夹过去
- **史实**：分弹药给弟兄在杂牌部队里是常事，比弹药箱更对味
### [必做/中] 指挥｜已有但不对齐

- **ER2**：按住 TAB 开命令径向菜单，鼠标指方向，松手下令；只有班长可用（isSquadLeader()）
- **现状**：实跑确认：Tab 只切 hudOrders 的 CSS 类，面板是一张静态列表「1跟我来 2向前 3固守 4散开 5绕过去 6上刺刀」，选择靠 Digit1-6，而且任何时候任何人都能下令
- **要做**：新建 Script_Wheel.mjs（纯 DOM/Canvas 2D，Tab/X/G/F 四个轮盘共用）；Script_Main.mjs 的 Tab 分支改为开轮盘 + 鼠标方向选格 + keyup 下令；加 squad.leader === player 的前置检查。Digit1-6 腾给武器槽
- **史实**：无
### [必做/中] 指挥｜完全没有

- **ER2**：只有班长能下令
- **现状**：Script_Ai.mjs:161 IssueOrder() 的作用域是「玩家周围 26 m 内所有 nra 士兵」，没有任何身份检查
- **要做**：新建 Script_Squad.mjs 的 Squad 类（members/leader/runner/gunner）；IssueOrder 前置 squad.leader===player 检查，非班长时 Tab 只显示「你不是班长」
- **史实**：Data_Script.mjs 里刘振海是 9 连 3 班班长，且有一句「……班长这个位置，你顶上」——接上 Squad 之后这句台词会变成一个真的状态变更
### [必做/中] 指挥｜完全没有

- **ER2**：指挥权移交顺位：班长→无线员→机枪手→狙击手→步枪兵，当前班长显示在屏幕左上
- **现状**：运行时根本没有班组对象（全仓库 grep squad 只命中注释与人物介绍）
- **要做**：Script_Squad.mjs 实现顺位：班长 → 传令兵 → 机枪手（持 Zb26 者）→ 老兵（identity.age 最大）→ 新兵。Script_Hud.mjs:SetIdentity() 旁边补一行「班长：XXX」
- **史实**：中方无线员不存在，等价物是传令兵。狙击手编制也不存在，换成「老兵」——第 2 集团军是老西北军底子，老兵这个身份是有的
### [必做/大] 指挥｜完全没有

- **ER2**：按住 X 在班组成员间随时切换（不必等死），API 对应 setPlayer()
- **现状**：只有死后自动换人（Script_Main.mjs:RespawnPlayer()）。X 键未绑定
- **要做**：X 按住出换人径向盘（列本班活着的弟兄，带姓名籍贯）；松手切换：相机平滑飞到目标位置，接管其 identity/weapon/背包。原来那个身体交回 AI 托管
- **史实**：无
### [必做/中] 指挥｜已有但不对齐

- **ER2**：完整指令表 12 条：Follow / Move and Hold / Attack Objective from Direction / Line-Column Formation / Charge（自动上刺刀）/ Covert Movements / Tank Support / Artillery / Spot / Retreat / Cover Area
- **现状**：ORDERS 有 6 条，其中 flank 与 charge 是死的：实跑 ai.IssueOrder('charge',...) 返回 affected=2 但 goalChanged=false。Script_Ai.mjs:161-198 的 IssueOrder 只有 follow/advance/hold/spread 四个分支，Act() 里也只判 s.order==='hold'
- **要做**：IssueOrder 补 flank 分支（取 aimPoint 两侧各 25 m 绕行点，半数走左半数走右）与 charge 分支（设目标 + 上刺刀 + 喊杀声）。Act() 里 STATE.CHARGE 现在写死 if(s.target && !s.holdZone)，要让 charge 命令能覆盖守点纪律。ORDERS 扩到 8 条（补 covert / callFire）
- **史实**：白刃冲锋对台儿庄是文化上的必做项，不能是一个按下去没反应的键
### [可选/中] 指挥｜完全没有

- **ER2**：横队/纵队队形切换
- **现状**：Script_Ai.mjs 只有 laneOffset（生成时领的固定横向偏移，±5.5 m），没有队形概念
- **要做**：判可选。真要做就在 SetSideGoal() 里按 formation 重算每人的 laneOffset 分布（纵队 offset≈0、横队按序号展开）
- **史实**：无
### [必做/大] 支援｜已有但不对齐

- **ER2**：呼叫链路：班长轮盘选点瞄落点 → 无线员按 TAB 开电台做坐标小游戏（点错就偏靶）→ 呼叫→落弹有延迟窗口 → 可 cancel。无线员死 = 全班失去支援能力
- **现状**：Script_Main.mjs:520 F → CallMortar() → Script_Combat.mjs:CallMortar() 检查 support.mortar>0 && mortarCooldown<=0，9 秒后落弹。这是冷却读秒模型，正是 ER2 明确没采用的那种
- **要做**：改成会断的链路：① Tab 盘选「要炮」并射线拾取落点；② 班里的传令兵（一个真的 Soldier）转身往 GuandiTemple 跑，跑死了这次就没了、且班里从此没传令兵；③ 8~12 s 窗口内可用 Tab 盘同一格取消。F 键腾给通用交互
- **史实**：中方没有无线电（Data_Battle.mjs 注释原话「没有无线电。要人只能派人跑回去要」）。传令兵在地图上真跑、会被打死，比 ER2 的电台小游戏更硬也更好看
### [应做/小] 支援｜已有但不对齐

- **ER2**：弹种可选（HE / Smoke / APHE）
- **现状**：Script_Combat.mjs:CallMortar() 只有一种弹
- **要做**：Tab 盘「要炮」二级选：82 mm 榴弹 / 发烟弹。发烟弹一局 1 发
- **史实**：史实红线：中方无 APHE、无空中支援、无重炮。弹种只给两种，不许为了凑 ER2 的数量补齐
### [应做/中] 支援｜完全没有

- **ER2**：亲自操炮时：无线员确认弹着点后，屏幕出现炮弹图标 + 图标下方一个数字，把炮口转向图标、仰角刻度调到那个数字就打中——把间接射击做成手工操作
- **现状**：无可操作火炮。SUPPORT.nra[0] 有完整的二十年式 82 mm 参数但只作为「远处落弹」使用
- **要做**：地图上放一门二十年式迫击炮，F 键接管；滚轮调表尺，HUD 给落点图标 + 目标仰角数字。落弹用现有的 mortarInFlight 通道
- **史实**：二十年式迫击炮的表尺是真要手调的。这条几乎是白捡的史实质感
### [必做/中] 支援｜完全没有

- **ER2**：（无对应）
- **现状**：Data_Battle.mjs:224 的 SUPPORT.nra[1] 传令兵（effect:'reinforceSquad', uses:3, delayS:14）只在 Script_Combat.mjs:51 被存进 this.support.runner，没有任何函数消费它
- **要做**：接上：Tab 盘「要人」→ 传令兵跑回 GuandiTemple → 14 s 后在最近的我方占领点刷 4~5 人补进班组。与「要炮」共用同一个传令兵与同一条断链规则
- **史实**：「要人只能派人跑回去要」是数据文件自己写下的设定，接上即可
### [必做/小] AI｜已有但不对齐

- **ER2**：你蹲远处狙太久，AI 会呼叫炮击轰你（TV Tropes 列为 AI 少数几个真聪明的行为之一）
- **现状**：Script_Combat.mjs:52 launcherTimer=8 / artilleryTimer=26 是纯定时轮询，落点与玩家行为无关
- **要做**：StepIjaSupport() 里统计「玩家在同一个 6 m 半径内停留且开火 > 25 s」，满足则把下一发掷弹筒落点直接设为玩家位置（保留 warnLeadS 1.5 s 的啸声窗口）
- **史实**：八九式重掷弹筒能越过院墙打进院子，这条史实特性正好让「蹲坑」在物理上不成立
### [应做/中] AI｜完全没有

- **ER2**：AI 突击班组会自己放烟掩护推进
- **现状**：Script_Ai.mjs 无投烟行为
- **要做**：Think() 里给日军班组加：ADVANCE 状态下若被压制 > 0.5 且距目标 30~60 m，则 15% 概率投烟（复用 Script_Vfx.mjs 的烟柱）
- **史实**：日军有制式发烟筒，这条不需要打折
### [必做/小] 伤势｜已有但不对齐

- **ER2**：轻伤层：中弹后屏幕变黑白/灰，不能跑、不能屏息；按 B 直接用绷带；不处理会流血致死
- **现状**：Script_Player.mjs 有 wounds/bleeding/Bandage()，B 键已绑（Script_Main.mjs:515）。Script_Post.mjs 的 saturation 按 suppression 去饱和。但受伤后照样能冲刺、照样能屏息，LegPenalty() 最低只到 0.42
- **要做**：Script_Player.mjs:Update() 里 wounds.length>0 时强制 canSprint=false、breathHold=false；去饱和改由 (1-health/100) 驱动而不只是 suppression
- **史实**：无
### [必做/大] 伤势｜完全没有

- **ER2**：重伤层：被打到倒地失能（isIncapacitated()）才能被救；伤员持续倒计时死亡
- **现状**：Script_Player.mjs:Kill() 是 health<=0 直接死；Script_Main.mjs:OnPlayerDown() 立刻弹阵亡卡片扣兵员池。没有 Downed 中间态
- **要做**：Script_Player.mjs 加状态机 Healthy → Wounded → Downed（40 s 倒计时，能爬不能开枪，能喊）→ Dead。Script_Ai.mjs 的 Soldier 同步加。只有 Downed 超时或补刀才走 OnPlayerDown()
- **史实**：无
### [应做/中] 伤势｜完全没有

- **ER2**：医护兵三种器械（注射器/剪刀/医用镊子），伤员头顶浮出器械图标，按住 F 选对应工具才有效，选错只是浪费时间；职业不锁能力（谁捡到器械谁能救）
- **现状**：无医疗系统
- **要做**：简化为两种：止血带（枪伤/流血）、剪刀（弹片/绞缠）。伤员头顶浮图标；按住 F 出器械轮盘，选错浪费 3 秒。任何人捡到药包都能救
- **史实**：中方无正规医护兵编制，靠同班弟兄与担架兵——这正好落在 ER2「职业不锁能力」那一条上，不用改设计就对齐了
### [应做/中] 伤势｜完全没有

- **ER2**：可先把伤员拖到掩体后再救（按住 F → carry/drag，carryBody()）
- **现状**：无
- **要做**：按住 F 指向 Downed 者并移动 = 拖拽（速度 0.9 m/s，期间不能开火）。优先级排在诊断之前——先拖再救这个战术决策单独就成立
- **史实**：「把伤员拖回城墙后」是这场仗里最强的一个画面
### [必做/中] HUD｜完全没有

- **ER2**：按 M 打开自动生成地图（标占领区、友军炮兵蓝方块带圆、飞机补给点白图标）
- **现状**：Script_Hud.mjs 只有 190×190 的小地图 canvas，无全屏地图，M 键未绑定
- **要做**：Script_Hud.mjs 加 BuildMap()/ToggleMap()，M 键。标：占领点及归属、我方兵员池、传令兵当前位置（我们独有的好东西——你能看着他在图上跑）、浮桥、师指挥所
- **史实**：没有友军炮兵图标可标（中方只有那两发迫击炮）；没有飞机补给点（无空中支援）
### [应做/小] HUD｜已有且对齐

- **ER2**：小地图显示班组成员位置、被侦察到的敌人；敌方班组标记落在班组几何中心而非班长
- **现状**：Script_Hud.mjs:204-256 UpdateMinimap() 每 200 ms 重绘，只画班组级质心圆不画个体敌人。实跑确认在工作
- **要做**：一处小改：现在是「全场 90 m 内所有敌人取一个质心」，应按班组分别取（等 Script_Squad.mjs 落地后自然解决）
- **史实**：无
### [应做/中] HUD｜完全没有

- **ER2**：标记敌人（Spot），持续一段时间
- **现状**：无标记系统
- **要做**：中键：射线 120 m 内命中敌兵则在小地图与 HUD 上给一个 8 秒标记，且只给班组级圆圈不给个体点（保持 ER2 的信息模糊度）
- **史实**：无
### [应做/小] HUD｜完全没有

- **ER2**：HUD 可一键全关（有专门的自定义按键）
- **现状**：无 HUD 开关；出干净画面只能靠 ?shot=1
- **要做**：反斜杠键 → hudRoot.classList.toggle('off')，Style_Game.css 加 .off{opacity:0}。一行改动
- **史实**：无
### [应做/小] HUD｜已有但不对齐

- **ER2**：占领点图标语义：交叉刀剑 = 待打/可打，旗帜 = 已占领
- **现状**：Script_Hud.mjs:197 UpdateMarkers() 用 ▲（我方）/ ✕（敌方）
- **要做**：改成 ⚔（待打）/ 🚩或旗形 SVG（已占）。争夺中沿用现有的 fight 类
- **史实**：交叉刀剑对大刀队这个题材有额外呼应，不是硬照抄
### [应做/小] HUD｜已有但不对齐

- **ER2**：左上角显示当前班长是谁
- **现状**：Script_Hud.mjs:SetIdentity() 显示的是「你是谁」（姓名/籍贯/枪），不是班长是谁
- **要做**：SetIdentity 旁边补一行「班长：XXX」，班长阵亡移交时闪一下
- **史实**：无
### [应做/中] 其他｜完全没有

- **ER2**：AI 会开门开窗进屋（AiParams 的 allowOpenWindows 是独立可开关行为）
- **现状**：Script_World.mjs:326-363 的门窗是静态几何，门洞是空的既不能开也不挡人
- **要做**：门/窗做成可交互 box，F 开关；开着的门按开合角度参与视线判定。与翻越是一对——两条都到位四合院才真的是「一间一间的房子」
- **史实**：无
### [应做/中] 其他｜完全没有

- **ER2**：投降有七种触发：被压制到一定程度、所在占领点刚被夺、进攻方票尽时附近敌军扔枪、给受伤敌人医疗使其投降等；玩家自己也会被强制投降（写实难度）
- **现状**：无投降系统。Script_Ai.mjs 只有 morale（同侧活人比例）驱动的后缩
- **要做**：日军 AI：仅当「占领点刚被我方夺回 + 该点内日军 < 3 人 + suppression > 0.8」三条同时满足时，0.25 概率投降。中国守军 AI 投降率设为 0（保留现有的后缩 = 溃退，溃退不是投降）
- **史实**：史实红线：台儿庄是死守，中方投降率应当极低（设 0）；日方投降率偏低但非零。**玩家永不自动投降**——ER2 写实难度下玩家会被强制投降，我们不做，ER2 自己也提供 disable player auto-surrender 开关，所以这不算破坏对标
### [应做/中] 其他｜完全没有

- **ER2**：靠近己方投降士兵按 F liberate，他们会掏出手枪继续作战（票的另一种来源）
- **现状**：无战俘概念
- **要做**：日军占领点内低概率生成被俘的我方士兵；F 解放后他捡起地上的枪归队，且 state.nraPool += 1
- **史实**：给兵员池 +1 正是 ER2 这条设计的原意——票的另一种来源。中国军队被俘是有的，做低频即可
### [可选/中] 其他｜完全没有

- **ER2**：给受伤的敌人做医疗会让他投降（等于俘虏）
- **现状**：无
- **要做**：低优先。做的话复用医疗那套：对 Downed 的日军按住 F 用对器械 → 他投降并被押走，兵员池不加但给一条叙事提示
- **史实**：中方药品极度稀缺，救敌人要真消耗掉自己的止血带。做成一个有代价的道德选项，别做成刷分手段
### [应做/小] 占领｜已有且对齐

- **ER2**：占领条 0..1 连续量、可反夺、多点时防守方可反夺；双方都在区内是否冻结官方未明说（benchmark 已标为推断）
- **现状**：Script_Main.mjs:706-735 UpdateObjectives()：双方都在区内则 contested=true 且冻结，单方按人数（上限 3）推进度，26 s 基准。实跑八个点 owner 全 nra、progress 全 1
- **要做**：保持。只补一条 ER2 的连锁效果：Flip() 到 ija 时触发点内我方的溃退、Flip() 到 nra 时触发点内日军的投降判定
- **史实**：无
### [应做/中] 阶段｜已有但不对齐

- **ER2**：Push the Frontline：一维战线来回推拉；切 Phase 不重载场景，只移出生点与激活的占领区
- **现状**：Data_Battle.mjs 的 PHASES 六阶段按时间推进（Script_Main.mjs:Frame() 里 phaseTime > minutes*60 就 EnterPhase+1），八个占领点始终全部激活，没有战线概念
- **要做**：加 state.frontlineIndex（北门→清真寺→文昌阁→关帝庙→南门/浮桥 五档），每阶段只激活相邻的 2~4 个点；白天日军往南推、夜袭往北夺回。切档不重载场景，只移双方出生点与激活区
- **史实**：这就是史实：日军突入城内、中国军队巷战反击、反复易手。一维推拉与史实高度吻合
### [必做/中] 阶段｜已有且对齐

- **ER2**：攻守互换（依赖选边）
- **现状**：P1~P5 玩家守、P6（counterattack:true）转攻。Data_Battle.mjs 已有 counterattack 字段，Script_Main.mjs:EnterPhase() 会 story.Signal('counterattack')
- **要做**：补齐 P6 的实际翻转：SetSideGoal 方向反过来（我方往北推）、占领点激活顺序反转、日军转为守点（AssignDefenders 对 ija 侧调用）
- **史实**：单阵营下的等价实现天然存在，且比 ER2 的模式切换更有说服力——四月六日日没后全线反攻是史实
### [应做/小] 死亡｜已有但不对齐

- **ER2**：每次阵亡显示姓名与生卒年月，然后接管另一名士兵；重生消耗票；重生后有数秒无敌
- **现状**：Script_Main.mjs:OnPlayerDown()/RespawnPlayer() 全套已有，阵亡卡片 2.6 s、扣 nraPool、换新 identity。实跑 PlayTest 已验证。缺的是「重生后无敌」
- **要做**：RespawnPlayer() 里给 player 加 invulnUntil = elapsed + 3；Script_Player.mjs:TakeHit() 开头判一下
- **史实**：孙连仲「士兵打完了，你自己填上去」是这个机制的史实出处，已在数据注释里
### [可选/中] 难度｜已有但不对齐

- **ER2**：难度是一组滑条而非三档：准星开关、命中提示、穿透提示、压制强度、bullet gravity、AI 数量（可按阵营分设）、disable player auto-surrender
- **现状**：只有 URL 参数 quality/scale/phase；index.html 里只有一个「进城」按钮，无任何设置 UI。SCALE_PRESETS 三档存在但玩家改不了
- **要做**：index.html 加开机设置面板：AI 数量（复用 SCALE_PRESETS）、压制强度、弹道重力、自由瞄准角度（0~5°）、准星开关、ADS 按住/切换、蹲趴按住/切换
- **史实**：不做 player auto-surrender 开关——我们根本不做玩家自动投降
### [可选/小] AI｜已有且对齐

- **ER2**：官方明确 up to 140 concurrent units，开局前有滑条让玩家自选 AI 上限，可按阵营分设
- **现状**：SCALE_PRESETS 三档（40/70/110），Script_Ai.mjs 分帧决策（每帧 1/6 的人 Think）、LOS 结果 0.25 s 缓存、尸体上限 26。实跑 small 档 nra=18 / ija=21 / maxAlive=40，两分钟长跑 AI 数量稳定已被 PlayTest 验证
- **要做**：只补一条：把三档暴露到开机设置面板，别再只走 URL 参数
- **史实**：无
### [应做/小] AI｜已有且对齐

- **ER2**：被批评最狠的四条：AI 不守点、扎堆排队（Conga Line）、单线推点、隔植被精准命中
- **现状**：Script_Ai.mjs 已经逐条避开：holdZone 硬半径（守点单位除非死亡不得离区）、laneOffset ±5.5 m（反排队）、HasLineOfSight 走同一套 Raycast（不给 AI 开透视）、acc 按距离衰减
- **要做**：保持。唯一要补的是「距离 >150 m 精度按平方衰减 + 先打近的硬规则」——现在 Think() 里选目标只按最近，但 TryFire 的 acc 衰减是线性的
- **史实**：无

---

## 存疑

- ER2 的具体默认键位表：benchmark 是从 Steam 更新日志、官方 wiki、社区攻略里逐条挖出来的（Tab 命令盘、X 换人盘、G 投掷物盘、R 换弹盘、I 背包盘、H 丢烟、B 绷带、F 交互/医疗/拖拽、V 近战、0 发射模式、M 地图、Page Up/Down 归零、Shift 冲刺兼屏息），这些是确证。但 ER2 完整的官方键位表（含 lean/vault/freelook/spot/HUD 开关的默认键）我没有一手来源，这几条的键是我按 ER2 已知风格 + 浏览器可达性推的，属推断。
- ER2 的蹲/趴默认是 toggle 还是 hold、有没有设置项，没有一手证据。本文按「默认 toggle + 设置可切 hold」处理，这是推断。
- ER2 有没有 vault/翻越，我在 benchmark 里没有找到明文（benchmark 只提到 allowOpenWindows）。「Space 翻越」是我按同类写实 FPS 惯例推的。但翻越这条对我们的必要性不依赖 ER2——它由 Script_World.mjs 造出来的四合院院墙与窗台直接逼出来，即使 ER2 没有也该做。
- free aim 那条否定结论是 benchmark 自己标注的「查不到证据」级别，不是「查到明确否认」。所以「ER2 没有 free aim」有一定不确定性，我给的三个方案里 A（降到 2° 做成滑条）对这个不确定性最鲁棒。
- 弹道参数（初速、重力常数、归零档位的距离刻度）ER2 官方从未公开。我给的 100/200/300/400/500 m 五档与「300 m 下坠约 0.6 m」是按 7.92×57 的实际弹道算的，不是 ER2 的数值。
- 支援呼叫的冷却、每局次数上限、呼叫→落弹的延迟秒数，ER2 全部没有公开。我给的「8~12 s 可取消窗口」沿用 benchmark 的建议值，需实测调参。
- 医疗诊断三种器械与伤型的对应关系、Downed 倒计时秒数，官方 wiki 只写了「必须匹配头顶图标、选错浪费时间」。我给的「两种器械、40 s 倒计时、选错浪费 3 秒」是移植设计值。
- 压制值的累积/衰减速率与触发卧倒、投降的阈值 ER2 完全没公开。我们现有的 suppressPerNearMiss 0.16 / decay 0.55 / 卧倒阈值 0.72 是我们自己定的，日军投降的「0.8 + 点内<3人 + 0.25 概率」也是我新提的起始值，都要实测。
- 「日军投降率偏低但非零」这个史实判断我没有去核 Data_HistoryQuotes.md 的 cautions 原文（本轮只读了要点索引）。落地前建议再核一遍那份 cautions，确认 0.25 这个概率不会跟史料口径冲突。
- 「捡缴获三八式只有枪里那五发」这条我按「六五口径无补给」推的，是否有第 31 师缴获日械弹药的记载我没查。如果有，这条闸门要重设计。
- ER2 的班长/无线员/机枪手/狙击手/步枪兵移交顺位是确证的；我提的中方等价顺位（班长→传令兵→机枪手→老兵→新兵）里「老兵」这个身份在第 2 集团军的实际编制中是否成立，我没有考据依据，属设计取值。
- 本文所有「我们现状」的判断都做过实跑或精确定位到行号，但有两块只读了源码没实跑：Script_Viewmodel.mjs 的 _MakeAdsPose 偏心（读到 px:-s.x/py:-s.y，逻辑上是居中，但没截图确认屏幕上真的居中）、以及 Type11 的 overheatShots 未被消费（grep 无引用，可信度高但没跑）。
