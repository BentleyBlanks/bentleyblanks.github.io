# Easy Red 2 对齐方案（玩法与操作，画面不在范围内）

> 施工底本。两份拆解已合并去重，冲突处已裁决并给理由。所有「现状」判断都在本轮复核过源码行号（见文末复核清单），不是抄来的。
> 代码基址：`C:/Users/Bentl/Documents/Program/bentleyblanks.github.io/.claude/worktrees/binary-assets-blendermcp-link-15f272/Taierzhuang1938/`

---

# 〇、一句话结论：先修「仗根本没在打」，再谈对标

两份拆解里，A 卷（操作方案卷）盯的是**玩家手上的动词**，B 卷（系统卷）盯的是**战场的运行**。两卷都对，但优先级必须由 B 卷的第一条实跑结果决定：

**`?phase=2&scale=medium` 跑 120 秒，70 名 AI 的状态分布每一次采样都是 `{advance: 70}`，开火计数恒为 0，全场平均压制恒为 0.00，八个占领点进度恒为 1.00、owner 恒为 nra。玩家 120 秒内死 6 次，全部来自 `Script_Combat.mjs:252` 的 `StepIjaSupport()` —— 一台以 `player.position` 为落点的定时打点机。**

这意味着：现在给玩家加十六个动词，他也只是在一座七十人静止站着的布景里对着空气练习。**「先做改变体验最大的」这条要求，字面答案就是「让仗真的打起来」**，不是切枪，也不是翻越。A 卷把「接死数据 + 键位迁移」放第一轮，是在战斗层空转的前提下排的序，本方案把它降到第二批。

第二条同等级的坏账是票池方向反了。我本轮复核确认：

- `Script_Combat.mjs:325`：`if (died && this.host.onKill) this.host.onKill(s);` —— 遍历 `ai.soldiers` 时**无差别**回调，不传 side；
- `Script_Main.mjs:201`：`onKill: (soldier) => { state.ijaPool = Math.max(0, state.ijaPool - 1); }` —— 写死扣日方池。

于是日军炮弹炸死中国兵，扣的是**日军**的票。B 卷实测 `ijaPool 700→696 / nraPool 600→600` 与代码完全吻合。这条不是对标项，是 bug，跟第一条一起进第 1 批。

还有一处双扣隐患：`Script_Main.mjs:695` 的 `TryFire()` 里 `if (died) state.ijaPool -= 1`，与 `onKill` 回调是两条独立路径。改成事件驱动时必须一并删掉行内那次手动扣减，否则玩家亲手打死的人会扣两票。

---

# 一、完整键位表（最该被直接抄走的一张表）

## 1.1 浏览器场景的四条硬约束

这四条决定了下面每一个键的位置，不是风格偏好：

1. **任何 `Ctrl+` 组合都不能用**（Ctrl+W 关标签、Ctrl+T 开标签、Ctrl+N 开窗，全被浏览器抢走且无法 `preventDefault`）。
2. **`Tab` / `Space` / `PageUp` / `PageDown` / 滚轮 / 中键必须显式 `preventDefault`**。Tab 会切焦点（现有代码已经 `e.preventDefault()`，保持）；Space 滚页；中键触发 Chrome 自动滚动，要在 `auxclick` 与 `mousedown` 两处都拦；滚轮监听必须 `{ passive: false }`，否则 `preventDefault` 无效。
3. **`Esc` 必然解除指针锁，无法阻止**。所以 Esc 只能是「暂停」，并且暂停面板必须能在无指针锁状态下用鼠标操作；退出面板时重新 `requestPointerLock()`。
4. **`F1`–`F12` 一律不用**（F1 开帮助、F5 刷新、F11 全屏、F12 开 DevTools）。B 卷提议把 HUD 全关放 F1，**否决**，改用反斜杠 `\`。

补一条 A/B 卷都没提但会咬人的：**`Alt` 单按在 Windows 版 Chrome/Edge 会点亮菜单栏并吞掉后续按键**。自由观察绑 `AltLeft` 时必须在 `keydown` 里 `preventDefault()`，且松开时若焦点丢失要主动 `canvas.focus()`。这条列为已知风险，实装后要在真浏览器里按住 Alt 转头三秒验一次。

## 1.2 关于径向轮盘的裁决（A 卷 vs B 卷正面冲突）

A 卷主张新建 `Script_Wheel.mjs`，Tab/X/G/F 四个轮盘共用；B 卷主张**不做轮盘**，理由是「浏览器指针锁与轮盘冲突」，改成横条 + 数字键。

**裁决：做轮盘，B 卷的技术判断不成立。** 指针锁下拿不到 `clientX/clientY`，但 `movementX/movementY` 照常送达（现有 `Script_Main.mjs:536` 的 mousemove 处理就是靠它）。轮盘只需要一个**方向向量**，不需要绝对坐标：轮盘打开时把累积的 `movementX/Y` 存进一个虚拟游标，取 `atan2` 定扇区，超过 40 px 半径即判定选中。这是所有指针锁 FPS 的标准做法，成本比横条高不了多少，而且换来的是「单手可达、不用看键」——这恰恰是 ER2 那套指挥手感的来源。

同时**保留数字键为同义键**：轮盘打开期间按 `Digit1-8` 直选，作为兜底与可访问性通道。这样即使轮盘在某个浏览器上出问题，指挥系统也不会瘫。

## 1.3 最终键位表

见结构化输出的 `keymap` 字段。这里补几条表里放不下的说明：

- **Shift 一键三义**：未开镜且站立前进 = 冲刺；`ads > 0.6` = 屏息；`stance === prone` = 快速匍匐。ER2 本身就是同键复用（冲刺/屏息），我们只多加一档。分流逻辑写在 `Script_Input.mjs` 的 `Resolve()` 里，不散到 `Script_Player`。
- **Space 腾键顺序有依赖**：必须先把屏息从 Space 挪到 Shift（`Script_Main.mjs:557` 一行），Space 才能给翻越。这两件事必须在同一个提交里，否则中间态是「屏息没了、翻越也没有」。
- **数字键腾键顺序同理**：`Digit1-6` 现在直接下令（`Script_Main.mjs:525-533`）。要先把下令收进 Tab 轮盘，`1/2/3/4` 才能给武器槽。同一提交。
- **`F` 是最拥挤的一个键**，语义按上下文分流，优先级从高到低：指向 Downed 弟兄 → 医疗/拖拽；指向可接管重武器 → 接管；指向尸体/枪 → 拾取；指向门窗 → 开关；指向被俘弟兄 → 解放；都不满足 → 无事发生（**不再是「叫炮」**，叫炮进 Tab 轮盘）。
- **`I` 背包轮盘不做**。ER2 的 I 盘是给「弹药箱/地雷/TNT」那套补给品的，中方一样都没有。等价物是 F 交互的一个分支：对着弹药见底的弟兄按 F，分一个桥夹过去。
- **`V` 保留为大刀快捷键**，等同于「切到 3 号槽并挥一刀」。现有 `DoMelee()` 里 `WEAPONS[currentWeapon]?.bayonet ? currentWeapon : "Dadao"` 这个硬编码 fallback 在切枪系统落地后要改成读真实槽位。

---

# 二、逐系统对齐矩阵

## 2.1 战斗层（第 1 批，最高优先级）

| 项 | ER2 | 现状（复核过） | 做法 |
|---|---|---|---|
| AI 交战 | 几十上百人同时打 | 全场恒不通视：`losCache.clear` 为 true 的 0 人，`s.target` 非空的 0 人，日军离最近中方兵 49 m | `HasLineOfSight`（`Script_Ai.mjs:307`）的 from/to 高度按姿态取（站 1.5 / 蹲 1.0 / 卧 0.5）；`Think` 里对最近目标失败后再试 2 个备选；日方 `goal` 每次 Think 重取当前 Phase 最近的敌方点，不再用生成快照 |
| 出生点 | — | `FindOpenSpot`（`Script_Main.mjs:426`）只查「1 m 内无齐胸碰撞盒」，玩家出生在封闭院落，72 个方位 26 m 无一条通 | 加硬条件：候选点至少 3 个方位在 20 m 内无遮挡，否则重抽（现已抽 48 次，够用） |
| 守点纪律 | ER2 做坏了（被骂最狠） | `Script_Ai.mjs:376-382` 用坐标硬夹回，人贴着看不见的圆边滑动；且因点从不易主，中方 AI 被永久钉死 | 改软约束：越界只重设 goal 到区内随机点 + 转向内侧，不动 `position`。丢点时整班后撤到下一个己方点 |
| 压制找掩体 | `allowFindCoverWhenSuppressed` 独立行为 | `Script_Ai.mjs:328` 的 SUPPRESSED 分支只有 `speed = 0`，不调 `FindCover()` | >0.50 卧倒并向掩体移动；>0.75 停火保持姿态；>0.90 且 20 m 内无友军持续 5 s 往后缩。`battlefield.covers` 已烘焙 3722 点，现成可用 |
| 票池 | 统计阵亡单位 | 只算玩家的命与玩家的战绩 | `Soldier.Kill()` 发 `onSoldierDeath(side)`；`Blast` 的 `onKill(s)` 改 `onKill(s, s.side)`；删掉 `TryFire`/`DoMelee` 里的行内扣减 |
| 票随规模缩放 | 是 | `PHASES` 里写死 900/700… 与 `SCALE_PRESETS`（40/70/110）脱钩 | `EnterPhase` 里 `pool = Math.round(phase.nraPool * SCALE.maxAlive / 70)` |
| 占点加速对方票流失 | 2.0.9 加的 | 无 | 每 10 s 结算：对方每持有一点，己方票 `-= Math.ceil(value / 2)`，`value` 字段已有（2–5） |

**关于 `morale` 字段的处理（B 卷提案，采纳）**：`Script_Ai.mjs:77/260` 的 `s.morale = Clamp01(0.35 + mates / 8)` 算的是「34 m 内还有几个同侧活人」，是客观的班组密度，不是士气。`COMBAT.moraleBreakAt = 0.25` 定义了但全仓库一行没读（本轮复核确认）。**改名为 `cohesion`，删掉 `moraleBreakAt`，永远不出 UI**。理由 B 卷说得对：ER2 的全部价值就在于它没有第二套士气数值；而且屏幕上出现一条「中国守军士气条」在立场上是灾难。

## 2.2 玩家手感（第 2 批）

**弹道（必做）**。`TryFire()` 现在是纯 hitscan：加散布 → 直线射线 → 圆柱判定（`perp < 0.45`）→ 取更近者。改成 4–6 段步进积分（每段 `dt = 0.02 s`，`v.y -= 9.8 * difficulty.bulletGravity * dt`），段内复用现有 `battlefield.Raycast`。初速直接读 `AMMO.*.muzzle`（七九 810 / 六五 762 / 七七 800，考据值，不要另编）。300 m 上 7.92×57 下坠约 0.6 m —— 刚好是「瞄头打胸」的量级，可感知但不挫败。**这条是表尺归零的前提，没有弹道就没有可归零的对象。**

**视差（必做，一行）**。`TryFire()` 的 `from` 从 `player.EyePosition` 改成 `viewmodel.MuzzleWorld(_muzzle)` —— 这个函数已经存在，`Script_Main.mjs:662` 现在只喂给枪口焰和音效位置用。改完视差自然出现，近距离必须心里修正，「没有准星」这件事才有物理支撑。

**后坐（必做）**。每支枪都有 `recoil: {pitch, yaw, kick, recoverS}`，`TryFire()` 一次都没读过。末尾给 `player.pitch` 加 `degToRad(recoil.pitch)`、`yaw` 加 `±recoil.yaw`；`Script_Player.Update()` 按 `recoverS` 指数回落，**只回 70%**，剩 30% 要玩家自己压 —— 这是「栓动打完一发要重新找目标」的手感来源。

**铁瞄偏心（A/B 卷冲突，裁决见 §四）**：做，但幅度取小（4–8 px 屏幕当量，汉阳造比中正式明显），并挂难度滑条可关。

**自由瞄准（A/B 卷冲突，裁决见 §四）**：`freeAimLimitDeg` 从 5.0 改为可配，默认 2.0°，滑条 0 / 1.2 / 2.0 / 3.5。

**切枪与 LOADOUTS（必做，性价比最高）**。本轮复核确认 `LOADOUTS`、`AMMO`、`IJA_SQUAD` 三张表在全仓库（`Data_Weapons.mjs` 自身之外）**零引用**。`RespawnPlayer()` 改读 `LOADOUTS[phase.loadout]`，`state` 加 `slots: {primary, secondary, melee, throwable}` 与 `activeSlot`，`viewmodel.Equip()` 已支持换枪（有掏枪动画与 rig 重建），直接调用。`PHASES` 每项补 `loadout` 字段指向 `L0`–`L5`。`L3_WhiteTowel`（一支长枪、一支短枪、肩背大刀、腰间挂满手榴弹）是台儿庄最有辨识度的一套装备，现在完全是死的。

**flank / charge 修活（必做）**。`ORDERS` 有 6 条，`IssueOrder`（`Script_Ai.mjs:184-200`）只有 follow/advance/hold/spread 四个分支 —— 本轮复核逐行确认，`flank` 与 `charge` 只写了 `s.order` 字符串就 `n += 1` 了。`Act()` 里也只判 `s.order === "hold"`。补：`flank` 取 aimPoint 两侧各 25 m 绕行点、分半数走左半数走右，到位后转 advance；`charge` 设 `state = CHARGE` + 上刺刀 + 喊杀声 + 速度 ×1.4，并让它**例外地覆盖守点纪律**（`Script_Ai.mjs:344` 现在写死 `if (s.target && !s.holdZone)`，守点的人永远不冲锋 —— 防守时这条纪律是对的，但白刃冲锋是主动出击）。**上刺刀冲锋对台儿庄是文化上的必做项，不能是一个按下去没反应的键。**

**两脚架与过热**：`Zb26.bipod` 只被 `Script_Actor.mjs:595` 用来画几何；`Type11.overheatShots` 零引用。T 键架/收，须 prone 或贴近可架物，未架时右键不进 ADS；架起后 `SpreadDeg × 0.35`、`SwayAmount × 0.25`、转向速度砍到 30%。十一年式 200 发强制冷却 8 s 并出白烟（`Script_Vfx` 已有烟粒子）—— 这是日军机枪火力有节奏间隙的史实来源，也是玩家冲过街口的战术窗口。

## 2.3 新动词（第 3 批）

**翻越是本块第一优先级**，理由不是「ER2 有」（benchmark 里其实没查到明文），是地形逼出来的：`Script_World.mjs` 造的是一进一进的四合院，院墙 2 m、窗台 0.9 m，而 `MoveWithCollision()`（`Script_Player.mjs:236`）只对 `topRel < 0.56` 的物体自动抬腿。所有院墙、所有窗台都是死墙。`Script_Ai.Blocked()` 用同一个阈值，所以 AI 也只会走门洞。**这一条不修，「室战墙战」这四个字就是假的。**

做法：`TryVault()` 朝前 0.6 m 射线，命中 box 的 `max[1]` 在 0.6–1.9 m 之间且顶面往前 0.7 m 无遮挡，播 0.45 s 位移曲线（期间禁开火、禁转身，视角轻微下压）。**必须同时给 AI 开**：`Blocked()` 加 `vaultable` 返回值，`Act()` 加 VAULT 状态。

**攀爬走另一条路，不做梯子系统**：`TOWN.ramparts` 已带 `ramps: [-120, 0, 120]`，城墙马道位置早就有了，`Script_World.mjs` 只是没把它建成可走斜坡。建成真斜面（坡度 <30°、宽 2.4 m）并进 collider 表即可。城墙是台儿庄的主战场，「守的不再是墙」这句话的前半句得先能上得去墙。

**游泳判「不做系统、做软墙」**：运河 `canal:{z:232, width:46}`，浮桥宽 5.5 m，是「全城唯一的退路与补给线」。玩家能游过去，浮桥的史实分量就没了。入水即速度 ×0.25、禁开火、每秒掉 2 体力 —— 一条「你不该走这里」的软墙。

**F 通用交互**：拾枪拾弹、开门开窗、救人、拖人、解放战俘、接管固定武器。`Soldier` 死亡时在尸体上挂 `{weaponId, clips}`，2 m 内最近尸体可捡。

**姿态传染（Covert Movements）**：ER2 这条我最想抄，实现只要两行 —— `s.order === "covert"` 时 `s.stance = leaderStance` 且不开火；`HasLineOfSight` 的距离门槛按目标姿态缩放（站 120 / 蹲 80 / 卧 45 m）。**P4 夜袭阶段（`nightRaid: true`，白毛巾缠上、大刀背身后）几乎是为这条机制生的，而现在 P4 除了换天光、改携行之外，玩法上跟白天没有任何区别** —— 这是全案最可惜的一处。

## 2.4 班组与支援链路（第 4 批）

**这是结构性缺口，不是功能缺口。** 本轮复核：全仓库 grep `squad`，`.mjs` 里零命中（只在注释与 `Data_Script.mjs` 的人物介绍里出现）。运行时根本没有班组对象，`IssueOrder` 的作用域是「玩家周围 26 m 内所有 nra 士兵」，谁在半径内谁听令，任何人都能下令。

新建 `Script_Squad.mjs`：`Squad` 类持有 `members[]` / `leader` / `runner`（传令兵＝ER2 无线员的等价物）/ `gunner`（捷克式机枪手）。移交顺位改成史实版：**班长 → 传令兵 → 机枪手 → 老兵（`identity.age` 最大）→ 新兵**。`Data_Script.mjs` 里刘振海那句「……班长这个位置，你顶上」现在只是一句台词，接上 Squad 之后它会变成一个真的状态变更。

**支援从「冷却读秒」改回「会断的链路」**。现状 `F → CallMortar() → 检查 support.mortar > 0 && mortarCooldown <= 0 → 9 秒后落弹`，正是 ER2 明确没采用的那种模型。中方没有无线电（`Data_Battle.mjs` 注释原话：「没有无线电。要人只能派人跑回去要」），这**反而更好做也更硬**：

1. 班长在 Tab 盘选「要炮」，射线拾取落点；
2. 班里的**传令兵**（一个真的 `Soldier`，有名字）转身往新关帝庙（`OBJECTIVES.GuandiTemple`，池峰城师指挥所）跑 —— **他在地图上真的跑，会被打死**；
3. 跑到 or 跑不到决定这次呼叫成不成。跑死了这次作废，**且班里从此没有传令兵，直到有人被指派顶上**（对应 ER2「无线员死了全班失去支援能力」）；
4. 落弹前 8–12 s 窗口，Tab 盘同一格可取消；
5. 弹种只有两种：82 mm 榴弹、发烟弹（一局 1 发）。

`SUPPORT.nra[1]` 那个 `effect: "reinforceSquad"` 的传令兵是同一个对象的另一种用途（要人而不是要炮），共用同一条断链规则，一并接上。

**「亲自操炮」值得做**：地图上放一门二十年式 82 mm 迫击炮（`SUPPORT.nra[0]` 参数完整），F 接管，滚轮调表尺，HUD 给落点图标 + 目标仰角数字，落弹复用现有 `mortarInFlight` 通道。成本是一个固定机位 + 两个 UI 数字，换来的是「间接射击是手工活」这个 ER2 最有说服力的设计。

**AI 会呼炮打你（ER2 最值得抄的一条 AI 关卡设计）**：现状 `launcherTimer = 8` / `artilleryTimer = 26` 是纯定时轮询，落点直接取 `player.position` —— 方向正好反了，它不是惩罚蹲点，它是唯一的伤害源。改成条件触发：玩家在同一 8 m 半径内开火累计 > 45 s 且累计击杀 > 3，才触发一次覆盖；同时保留低频背景炮击，落点在占领点附近而不是玩家头上。八九式重掷弹筒能越过院墙打进院子，这条史实特性正好让「蹲坑」在物理上不成立。

**贴身抑制炮火（史料直接转成的机制）**：玩家 30 m 内有活着的日军时，日方 `artillery` 完全停火、`launcher` 间隔 ×2.2。史料原话「揪住敌人裤腰带打，大大抵销了日军飞机大炮的杀伤威力」。**用规则教战术，一句提示都不写。**

## 2.5 伤势与投降（第 5 批）

三层：`Healthy → Wounded → Downed → Dead`。轻伤层现在做了一半 —— `wounds[]`、`bleeding`、`Bandage()` 都对，但**中弹后照样能冲刺、照样能屏息**（`Script_Player.mjs:148/155` 的 `canSprint` 与 `breathHold` 不看 wounds）。补硬规则：`wounds.length > 0` 时 `canSprint = false`、`breathHold = false`；去饱和改由 `(1 - health/100)` 驱动而不只是 suppression；`Bandage()` 改 3.2 s 计时，期间 `viewmodel.IsBusy()` 为真所以自动禁开火。

Downed 层完全没有（`player.Downed` 与 `Incapacitate()` 都不存在，`health <= 0` 直接 `Kill()`）。这一层在 ER2 里的作用是**制造队友依赖**，对台儿庄价值更高：「把伤员拖回城墙后」是这场仗里最强的一个画面。躯干/腿致死伤 40% 概率转 Downed（头部命中、近距离、爆炸直接死），40 s 倒计时，能爬不能开枪，按 F 呼救会暴露位置。

**器械诊断做，但只做两种**（A/B 卷冲突裁决见 §四）：止血带（枪伤/流血）、剪刀（弹片/绞缠）。伤员头顶浮图标，按住 F 出器械轮盘，选错只浪费 3 秒。**任何人捡到药包都能救人** —— 中方没有正规医护兵编制，这恰好落在 ER2「职业不锁能力」那一条上，不用改设计就对齐了。

拖拽（按住 F 指向 Downed 者并移动，0.9 m/s，期间不能开火）**优先级排在诊断之前** —— 「先拖到掩体后再救」这个战术决策单独就成立。

投降见 §四第 2 条。

## 2.6 战线、阶段与胜负（第 6 批）

现状：阶段纯按 `PHASES[i].minutes` 走（实测 `phaseTime = 9999` 推两帧即 `phaseIndex 2→3`），八个占领点全阶段常驻激活，胜负是「最后阶段 85% 时长 && 手上 ≥3 个点」—— 而占领点从头到尾没人碰，所以胜利条件恒真。

改：`PHASES[i]` 加 `objectives: [id...]` 与 `spawn: {nra, ija}`；`OBJECTIVES[i]` 加 `captureTime`（清真寺/中正门 40 s，文昌阁/东北角 22 s），替掉硬编码的 `dt/26`；`UpdateObjectives` 与 `UpdateMarkers` 只遍历激活点。阶段推进改为「时间到 **或** 本 Phase 激活点全部易主」取先到者 —— 时间仍是条件之一，因为史实进程（3/24 攻城 → 3/27 突入 → 3/28 西北角 → 夜袭 → 4/4 三分之二 → 4/6 反攻）必须按日期走。

一维战线见 §三。

## 2.7 信息层与难度（第 7 批）

小地图做得对（`Script_Hud.mjs:204` 每 200 ms 重绘，只画班组级质心圆不画个体敌人），两处小改：按班组分别取质心（等 `Script_Squad.mjs` 落地后自然解决）；占领点图标从 `▲`/`✕` 换成 **交叉刀剑（待打）/ 旗帜（已占）** —— 这套语义比三角/叉清楚得多，而且交叉刀剑对大刀队这个题材有额外呼应。

M 键全屏地图标：激活占领点及归属、我方兵员池、**传令兵当前位置**（这是我们独有的一个好东西 —— 你能看着他在图上跑）、浮桥、师指挥所。**不标日方炮兵位置** —— 日方支援不给任何 HUD，玩家只能靠听。

**胜负条件必须时刻可读**。这是 ER2 被骂「新手不知道自己为什么输了」的那条，我们同样犯了：`hud.SetObjective` 现在打的是阶段 label 或「争夺中：XX」。改成一行硬信息：「**守住清真寺 · 能拿枪的人 587 · 前线：文昌阁**」。

难度改成一个 `difficulty` 对象在各系统里被读取，绝不硬编码：`{ aiAccuracy, blastRadius, suppressionScale, playerDamage, staminaSeconds, overheat, bulletGravity, freeAimDeg, ironSightOffset, autoSurrender: false, showCrosshair, enemyMarkers }`。开机面板三个预设（体验/标准/写实）+ 高级展开滑条，存 localStorage，同屏放战场规模三档（复用 `SCALE_PRESETS`）。**web 路人的默认档应偏「体验」**：准星开、免疫压制、AI 精度 0.7。

## 2.8 重武器（第 8 批）

`Type89Tank` / `Type94Tankette` / `Type92Hmg` 参数齐全但运行时零实例（本轮复核确认全仓库无引用）；`Data_Levels.mjs`（326 行）**整个文件没有任何模块 import**，是线性关卡时代的遗物，**直接删掉** —— 留着会误导后人。

玩家侧：**不做驾驶，只做接管固定武器**（缴获的九二式重机、我方二十年式迫击炮）。战车作为敌方单位出现，寻路只在主街（5.2 m）与次巷宽段（2.4 m）网络上跑，夹道（1.5 m）永远进不去（`minAlleyWidthM` 接上）；炮塔俯仰限制 −10°~+15°，打不到二层屋顶。于是「往巷子里退」「上房顶砸集束手榴弹」变成真实且正确的战术 —— 这条注释在 `Data_Weapons.mjs` 里写了「这是玩法规则不是装饰」，但一行代码都没有。

---

# 三、施工批次（详见结构化输出 `batches`）

排序原则一句话：**按「玩家在这一批之后能感觉到什么」排，不按模块依赖排。**

- 第 1 批之后：战场活了，七十个人真的在互相射击，占领点会易主，票池是兵力池。
- 第 2 批之后：枪有后坐、有下坠、有视差，手上有四个槽而不是一支枪，命令按下去有反应。
- 第 3 批之后：能翻墙进院、能上城墙、能拾枪拾弹、有轮盘。动词从 9 个涨到 17 个。
- 第 4 批之后：你有一个班，班长可能是你也可能不是；叫炮要派一个有名字的人跑出去，他会死。
- 第 5 批之后：中弹不再是直接死，弟兄会来拖你；日军会在特定条件下投降。
- 第 6 批之后：战线会推拉，昼夜决定推拉方向，输赢跟你打得怎么样有关。
- 第 7 批之后：有地图、有难度面板、屏幕上一眼能看出赢输条件。
- 第 8 批之后：战车开进街，你上房顶砸它；缴获的九二式能掉转枪口。

**每批必须过两道冒烟**：`node Taierzhuang1938/Script_BootTest.mjs`（开机）+ `node Taierzhuang1938/Script_PlayTest.mjs`（通关，现 28 条断言）。注意 memory 里那条坑：**worktree 里不要用 `npm run`**（npm 会把 cwd 换到主仓库，测的是另一棵树），直接 `node` 调脚本。

**每新增一个模块，必须在 `index.html` 的 importmap 里登记一行**。这不是可选项 —— 注释里写得很清楚，只给入口盖版本戳会导致「新壳配旧芯」，同一模块两个 URL 会被加载两份。本方案新增 6 个模块（`Script_Input` / `Script_Wheel` / `Script_Squad` / `Script_Interact` / `Script_Frontline` / `Script_Difficulty` / `Script_Emplacement`），每一个都要登记。

---

# 四、ER2 做法与史实/工程的冲突逐条取舍

## 4.1 支援链路完整性 vs 中方支援稀缺

ER2 双方支援对等（HE/Smoke/APHE、空中支援、多种火炮）。**我们不对齐这一条弹种数量，只对齐「链路可断」这个结构。**

中方：迫击炮全战役 2 发、传令兵 3 次、发烟弹 1 发、无空中支援、无重炮、反坦克只有集束手榴弹。日方：掷弹筒、九二式重机、八九式中战车、野战重炮。**这个不对称是史实，不是难度设计。** 判断依据在 `Data_HistoryQuotes.md`：第 2 集团军是杂牌（前第 26 路军，冯玉祥系统旧部），迫击炮「严重缺乏」，装备参差到「一个班里至少三种枪、轻机枪每班 0–1 挺、子弹带大半是瘪的」。

取舍的净效果是：**我们比 ER2 更能体现「链路可断」**，因为我们连电台都没有，链路的物理载体是一个会被打死的人。

## 4.2 ER2 的自动投降 vs 中国守军投降率

ER2 有七种投降触发，写实难度下**玩家自己也会被强制投降**。三条裁决：

1. **玩家永不自动投降。** ER2 自己提供 `disable player auto-surrender` 开关，所以这不算破坏对标。`difficulty.autoSurrender` 字段保留但恒 `false`，写死在预设里，不给用户开。孙连仲那句「士兵打完了，你自己填上去。你填过了，我来填。有敢退过运河的，杀无赦」是这个游戏的命门，玩家被系统判定投降会直接摧毁它。
2. **中国守军 AI `surrenderRate = 0`。** 台儿庄是死守，第 2 集团军伤亡逾十分之七、第 31 师最后余 1400 人仗还在打。压制到极限的表现是**往后缩、拖着伤员退、被打散** —— 溃退不是投降。
3. **日军 AI 投降率偏低但非零。** 我本轮核了 `Data_HistoryQuotes.md` 的数字章（A 卷的存疑清单里说没核）：中方战报「毙伤日军 11984 人，**俘 719 人**」。俘虏是有的，所以非零成立。但那是战报口径、学界无定论，所以只能做得很稀。**触发条件三条同时满足**：占领点刚被我方夺回 + 该点内日军 < 3 人 + `suppression > 0.9` + 20 m 内无其他日军 —— 满足时按 0.25 概率判定。三条件同时满足本身就罕见，实际投降率会落在 3% 量级，两卷的数字（A 的 0.25 是判定概率、B 的 0.03 是实际率）其实不冲突，这里统一口径。
4. **杀降不给任何奖励**，且让 30 m 内其余日军的 `cohesion` 反而上升。既是道德立场也是平衡。
5. **结算界面绝不打精确歼敌数。** `Data_HistoryQuotes.md` 明写「这个数字学界至今没有定论，用『日军残部向峄县、枣庄退却』这种事实性表述收尾」。现有 `EndBattle` 已经守住了，加了票池统计之后**别顺手把「击杀 N 人」打上去**。

## 4.3 铁瞄偏心（A 卷做 vs B 卷不做）

A 卷主张给 `_MakeAdsPose()` 的 `px/py` 留 8–14 px 偏置；B 卷主张不对齐，理由是「ER2 那条是全网争议最大的设计，开发者自己都要出来解释这不是 bug」。

**裁决：做，但幅度减半（4–8 px），并挂 `difficulty.ironSightOffset` 滑条（0 / 0.5 / 1.0）。** 理由：用户口径是「无脑对标」，豁免清单里只有阵营一条，B 卷的理由是「这个设计不受欢迎」，那是品味判断不是范围判断，不足以构成豁免。但幅度可以取保守值，并给关掉的通道 —— 这样既执行了对标，又不把 web 路人挡在门外。

顺带一提：`Script_Viewmodel.mjs` 为了「照门与准星必须共轴」专门调过上护盖高度（顶面必须低于 bore + 0.026 的瞄准基线），改偏心时要一起复核那段几何，别把上护盖挡住准星。

## 4.4 自由瞄准（A 卷 2.0° vs B 卷 3.5°）

ER2 没有 free aim（benchmark 标为「查不到证据」级别的否定，不是「查到明确否认」）。我们有 5.0°，实跑确认在工作（推鼠标 `aimYaw` 变 0.084 rad 而 `yaw` 只变 0.0007 rad）。

**裁决：做成 `difficulty.freeAimDeg` 滑条，档位 0 / 1.2 / 2.0 / 3.5，默认标准档 2.0°。** 取 A 卷的默认值，保留 B 卷的上限档。理由：free aim 的实际游戏功能是「抵消鼠标微动噪声」，5° 太大会让玩家觉得枪不听话；完全去掉又缺 ER2 那套「偏心 + 视差 + 写实 sway」的三重补偿，「难瞄」会退化成纯粹的手感黏滞。滑条对「ER2 到底有没有 free aim」这个不确定性最鲁棒。

**但有依赖顺序**：滑条的 0 档只有在弹道、视差、后坐三条都落地（第 2 批）之后才可用，否则会得到「枪很稳但打不中」这个最糟的组合。

## 4.5 弹匣逐个追踪（A 卷做 vs B 卷不做）

ER2 逐个追踪弹匣、留半满弹匣、可手动压子弹。B 卷说「那套是给可拆弹匣枪的，中正式/汉阳造是桥夹压入固定弹仓，不需要对齐」。

**裁决：做，但降到低优先级（第 8 批）。** A 卷的桥夹版规则其实**比 ER2 更狠也更真实**：弹仓里还剩 2 发时压桥夹只能压进 3 发，剩下 2 发白扔。现在 `Reload()`（`Script_Main.mjs:576`）是 `state.ammo = w.magazine` 直接填满，浪费掉的部分不存在。改成记 `state.clipPartial` 即可。成本很低但体感增益也低，所以排在尾部。

配套补 ER2 的「角色喊话报剩余弹匣数」（按 R 时触发，「还剩两个桥夹！」）—— 我们已经对齐了「不显示弹药数」的前半句，缺的是后半句的信息补偿。`Script_Audio.mjs` 有 84 KB 合成音库，成本极低而且比 UI 数字更沉浸。

## 4.6 缴获日械的弹药

**捡三八式只有枪里那五发**，六五口径我们自己没有补给。这既是史实（缴获枪没有配套弹药补给线），也是「捡枪」这个动词不至于破坏经济平衡的天然闸门。

存疑标记保留：A 卷说没查过第 31 师是否有缴获日械弹药的记载。我本轮也没查到相反证据。**如果后续查到有，这条闸门要重设计**，别默默留着一条站不住的规则。

## 4.7 载具层

ER2 有完整可驾驶载具（座位制、装甲穿透、弹道模拟、HE/AP/APHE）。**我们只做「接管固定武器」，不做驾驶。** 理由是史实而非工程量：中方在台儿庄没有战车；中国军队缴获并驾驶日军战车的记录不可靠；而「缴获重机枪掉转枪口」是有记载的。如果要「无脑对标」到可驾驶载具那一层，那要另开一轮，工作量约等于第 3、4 批之和，且做出来就是失真 —— **建议不做，这是我明确要拍板的一条。**

## 4.8 队形切换与 spot 等长尾

横队/纵队队形切换（ER2 的 Line-Column Formation）判可选，排进第 8 批。真要做就在 `SetSideGoal()` 里按 formation 重算 `laneOffset` 分布（纵队 offset≈0、横队按序号展开）。Spot 做，中键，120 m 内命中敌兵给 8 秒标记，且**只给班组级圆圈不给个体点** —— 保持 ER2 的信息模糊度。

---

# 五、四条必须守住的史实红线（对标时不许越过）

1. **支援不对称不许抹平。** ER2 里双方支援对等，我们不对齐这一条。见 §4.1。
2. **玩家永不自动投降；中国守军 AI 投降率恒为 0；日军投降率偏低但非零。** 见 §4.2。
3. **玩家的直接长官是 186 团团长王冠五，师指挥所在城东南新关帝庙（池峰城）。** 传令兵支援链的终点、M 图上「要人要炮往哪跑」，都必须指向 `OBJECTIVES.GuandiTemple`，不许随便挑一个点。一个地方同时承担占领点 / 剧情点 / 支援终点三种功能，是开放战场设计里最省的做法。
4. **屏幕上永远不许出现「士气」这个词或任何士气条。** `morale` 字段改名 `cohesion` 并永不出 UI。见 §2.1。

附两条现有代码已经守住、**别改坏**的：`EndBattle` 用「日军残部向峄县、枣庄退却」收场（别加歼敌数）；孙连仲那句话是总司令**在电话里对师长说的**，要从听筒里出，不许让他站在街垒上喊。

---

# 六、需要你拍板的三件事

1. **可驾驶载具做不做**（§4.7）。我的建议是**不做**，只做接管固定武器。这是唯一一处我主动建议偏离「无脑对标」的地方，理由是史实而不是工作量 —— 但既然口径是无脑对标，这条要你点头。
2. **难度滑条面板的默认档**。我建议 web 路人默认「体验」档（准星开、免疫压制、AI 精度 0.7、free aim 0）。这跟「对标 ER2 的写实感」是有张力的：ER2 的默认档更硬。如果你要默认「标准」，我照改，但要接受第一次进城的路人会更懵。
3. **第 1 批是否可以单独先提交**。第 1 批（修交战 + 修票池 + 修出生点）不含任何新动词，提交后玩家的操作方案跟现在一模一样，只是战场活了。如果你希望每一次提交都有可见的新玩法，我把「后坐 + 视差 + 弹道」三条从第 2 批提到第 1 批一起交 —— 代价是第 1 批的 diff 会大一倍，回滚粒度变粗。

---

# 附：本轮复核清单（不是抄的，是逐行看过的）

| 结论 | 取证位置 |
|---|---|
| `onKill` 无 side 检查，扣错池 | `Script_Main.mjs:201` + `Script_Combat.mjs:325` |
| `TryFire` 双扣隐患 | `Script_Main.mjs:695`（`if (died) state.ijaPool -= 1`）与 onKill 是两条路径 |
| 弹道是 hitscan，起点是眼位 | `Script_Main.mjs:644-706`，`const from = player.EyePosition.clone()` |
| `MuzzleWorld` 已存在但只喂特效 | `Script_Main.mjs:662-664` |
| 后坐数据零引用 | `Data_Weapons.mjs` 每支枪有 `recoil`，`TryFire` 全文无 `recoil` |
| 翻越阈值 | `Script_Player.mjs:236`，`topRel > 0 && topRel < 0.56` |
| 屏息键错 | `Script_Main.mjs:557`，`input.breathHold = keys.has("Space")` |
| `freeAimLimitDeg = 5.0` | `Script_Player.mjs:36`，ADS 时 ×(1−ads×0.72) |
| flank/charge 是空操作 | `Script_Ai.mjs:184-200` 只有 4 个分支；`:344` CHARGE 写死 `!s.holdZone` |
| 守点用坐标硬夹回 | `Script_Ai.mjs:376-382` |
| SUPPRESSED 不找掩体 | `Script_Ai.mjs:328-330`，只有 `speed = 0` |
| LOS 缓存不区分目标 | `Script_Ai.mjs:307-317`，`s.losCache` 每人一份 |
| `moraleBreakAt` 定义未读 | `Data_Battle.mjs:244`，全仓库无第二处 |
| 死数据全表 | `LOADOUTS` / `AMMO` / `IJA_SQUAD` / `overheatShots` / `emplaced` / `minAlleyWidthM` / `armorPiercing` / `Type89Tank` / `Type92Hmg` / `Data_Levels.mjs` / `squad` —— 逐个 grep，`Data_Weapons.mjs` 与 `Data_Levels.mjs` 自身之外**零命中**（唯一例外：`bipod` 被 `Script_Actor.mjs:595/604` 用来画几何；`Type92Hmg` 被 `Script_Ai.mjs:456` 用来选音效） |
| `FindOpenSpot` 不查通视 | `Script_Main.mjs:426` |
| importmap 必须登记新模块 | `index.html` 第 17–50 行及其注释 |
| PlayTest 现有 10 组 28 条断言 | `Script_PlayTest.mjs:48-294` |
| 日军俘虏 719 人（战报口径） | `docs/Data_HistoryQuotes.md` §10 |
| 结算不许打歼敌数 | `docs/Data_HistoryQuotes.md` §10 末句 |

---

## 键位总表

| 键 | 动作 | ER2 原键 | 状态 |
|---|---|---|---|
| W / A / S / D | 移动 | 同 | 已实现 |
| Shift（按住） | 冲刺；ads>0.6 时＝屏息；prone 时＝快速匍匐（更快更响） | 同（ER2 冲刺/屏息就是同键复用） | 要改 |
| C | 蹲（默认点按切换，设置可切「按住」） | 同 | 要改 |
| Z | 卧 | 同 | 已实现 |
| Space | 翻越优先 / 空地受限跳跃；须 preventDefault | 同（vault/jump） | 已实现 |
| Q / E | 左右探头（含 0.42 m 身体横移＋相机滚转） | 同 | 已实现 |
| AltLeft（按住） | 自由观察（头转身不转）；须 preventDefault，否则 Windows 版浏览器点亮菜单栏吞键 | 同 | 要新增 |
| 鼠标左键 | 开火 | 同 | 已实现 |
| 鼠标右键 | 开镜（按住；设置可切 toggle）；ADS 播完 0.9 前不给开枪 | 同 | 要改 |
| 滚轮（开镜时） | 表尺归零 100 / 200 / 300 / 400 / 500 m；须 passive:false + preventDefault | PageUp / PageDown | 要新增 |
| PageUp / PageDown | 表尺归零（滚轮的同义键）；须 preventDefault | 同 | 要新增 |
| 滚轮（未开镜） | 循环切换武器槽 | — | 要新增 |
| 1 / 2 / 3 / 4 | 长枪 / 驳壳枪 / 大刀 / 投掷物 | 同（1/2/3 切槽） | 要新增 |
| 0 | 单发／连发切换（仅捷克式 ZB-26） | 同 | 要新增 |
| T | 架／收两脚架（须 prone 或贴近可架物；未架不能开镜） | ER2 无独立键（自动） | 要新增 |
| G（按住） | 投掷物攥弹蓄力，松手投出；按住期间滚轮切投掷物种类 | 同（按住 G 出轮盘） | 要改 |
| H（按住 2 s） | 点燃就近柴草／湿棉被造烟（须贴近可燃物） | H 直接丢烟罐 | 要改 |
| R（点按） | 装填（桥夹压入固定弹仓） | 同 | 已实现 |
| R（按住） | 桥夹轮盘（满／半用） | 同（换弹轮盘） | 要新增 |
| F（点按） | 通用交互：拾枪拾弹 / 开门开窗 / 接管固定武器 / 解放战俘 / 分弹药给弟兄 | 同 | 要改 |
| F（按住，指向伤员） | 器械轮盘（止血带／剪刀），选错浪费 3 秒 | 同 | 要新增 |
| F（按住并移动） | 拖拽 Downed 伤员（0.9 m/s，期间不能开火） | 同（carryBody） | 要新增 |
| Tab（按住） | 命令径向盘（累积 movementX/Y 取方向，松手下令）；仅班长可用；Digit1-8 为盘内同义键；须 preventDefault | 同 | 要改 |
| X（按住） | 换人径向盘（本班活着的弟兄，带姓名籍贯） | 同（setPlayer） | 要新增 |
| 鼠标中键 | 标记敌人（spot），120 m 内 8 秒，只给班组级圆圈；须在 mousedown 与 auxclick 两处 preventDefault 挡自动滚动 | ER2 在 Tab 盘里 | 要新增 |
| V | 白刃（等同切到 3 号槽挥一刀） | 同 | 已实现 |
| B | 包扎（3.2 s，期间禁开火） | 同 | 要改 |
| M | 全屏地图（占领点/兵员池/传令兵位置/浮桥/师指挥所） | 同 | 要新增 |
| \（反斜杠） | HUD 一键全关 | ER2 有专用键（我们不用 F1，F1 开浏览器帮助） | 要新增 |
| Esc | 暂停面板（设置／阵亡名册／继续）；Esc 必然解除指针锁，无法阻止，所以只能当暂停 | 同 | 要新增 |
| I | 不做。ER2 的背包盘是给弹药箱/地雷/TNT 的，中方一样都没有；等价物是 F 分弹药 | I（背包轮盘） | 要改 |

---

## 实施批次

### 第 1 批：让仗真的打起来 —— 修交战、修票池、修出生点

**做什么**
- 修通视：HasLineOfSight 的 from/to 高度按姿态取（站 1.5 / 蹲 1.0 / 卧 0.5）；Think 里最近目标失败后再试 2 个备选目标；losCache 从「每人一份」改成按目标 id 缓存
- 日方 AI goal 改为每次 Think 重取当前 Phase 最近的敌方占领点，不再用生成时的快照
- holdZone 由坐标硬夹回改软约束：越界只重设 goal 到区内随机点＋转向内侧，不动 position；丢点时整班后撤到下一个己方点
- SUPPRESSED 分支接 FindCover()：>0.50 卧倒并向掩体移动，>0.75 停火保持姿态，>0.90 且 20 m 内无友军持续 5 s 往后缩（covers 已烘焙 3722 点）
- FindOpenSpot 加硬条件：候选点至少 3 个方位在 20 m 内无遮挡，否则重抽
- 票池改为统计阵亡单位：Soldier.Kill() 回调 onSoldierDeath(side)，两侧各扣各的
- 修 onKill 扣错方的 bug：Script_Combat.Blast 改 onKill(s, s.side)；Script_Main:201 按 side 分流
- 删掉 TryFire:695 与 DoMelee 里的行内 ijaPool 扣减，避免与事件双扣
- 票池随规模缩放：EnterPhase 里 pool = round(phase.pool * SCALE.maxAlive / 70)
- 占点加速对方票流失：每 10 s 结算，对方每持一点己方票 -= ceil(value/2)
- morale 字段改名 cohesion，删掉 COMBAT.moraleBreakAt，永不出 UI

**动的文件**：Script_Ai.mjs、Script_Main.mjs、Script_Combat.mjs、Data_Battle.mjs、Script_PlayTest.mjs

**要加的通关断言**
- medium 档 60 秒内全场开火计数 > 200（新增 Debug.FireCount()）
- 60 秒内 AI 状态分布不再恒为 {advance:N}，至少出现 fire 与 suppressed 两种
- 60 秒内至少一个占领点 owner 发生过变化（AI 自己夺的，玩家不动）
- 日军炮弹炸死中方兵：nraPool 减少且 ijaPool 不变（直接复现旧 bug 的反向断言）
- 玩家亲手击杀一名日军：ijaPool 恰好 -1（不是 -2，防双扣）
- 玩家出生点向 72 个方位射 20 m，至少 3 条通
- scale=small 与 scale=large 两档的初始 nraPool 不相等（证明缩放接上了）

### 第 2 批：键位重构 + 把死数据接活 + 枪的手感三件套

**做什么**
- 新建 Script_Input.mjs：导出 KEYMAP 数据表（{code, action, mode:'press'|'hold'|'toggle'|'wheel', context}）+ InputRouter 类；Script_Main 只保留 router.Bind(document) 与 router.Read(input)
- 屏息从 Space 挪到 Shift（按 ads>0.6 分流），Space 腾空；屏息补「视野轻微放大」camera.fov ×0.94
- 下令从 Digit1-6 收进 Tab（暂时仍是横条，轮盘在第 3 批），Digit1-4 腾给武器槽
- 切枪：RespawnPlayer 改读 LOADOUTS[phase.loadout]；state 加 slots{primary,secondary,melee,throwable} 与 activeSlot；1/2/3/4 与滚轮切换；调用已有的 viewmodel.Equip()
- PHASES 每项补 loadout 字段指向 L0–L5
- 弹道：TryFire 改 4–6 段步进积分（dt=0.02，g=9.8×difficulty.bulletGravity），初速读 AMMO[weapon.ammo].muzzle，段内复用 battlefield.Raycast
- 视差：TryFire 的 from 从 player.EyePosition 改成 viewmodel.MuzzleWorld(_muzzle)（一行）
- 后坐：TryFire 末尾给 player.pitch 加 degToRad(recoil.pitch)、yaw 加 ±recoil.yaw；Player.Update 按 recoverS 指数回落，只回 70%
- 铁瞄偏心：_MakeAdsPose 的 px/py 各留 4–8 px 屏幕当量偏置，汉阳造比中正式明显；复核上护盖高度别挡准星
- 自由瞄准 freeAimLimitDeg 改为可配，默认 2.0°
- 修活 flank：取 aimPoint 两侧各 25 m 绕行点，半数走左半数走右，到位转 advance
- 修活 charge：state=CHARGE + 上刺刀 + 喊杀声 + 速度 ×1.4，并让它覆盖守点纪律（Script_Ai:344 的 !s.holdZone 加 charge 例外）
- 两脚架：state 加 bipodDeployed，T 键架/收，未架时右键不进 ADS，架起后 spread×0.35 / sway×0.25 / 转向 30%
- 过热：Type11 的 overheatShots 200 / coolDownS 8.0 接进 Script_Ai.TryFire，触发时出白烟
- 0 键发射模式（仅 Zb26）；ADS 播完 0.9 前不给开枪；prone+Shift 快速匍匐（速度 1.25、脚步音量 ×1.8）

**动的文件**：Script_Main.mjs、Script_Player.mjs、Script_Ai.mjs、Script_Viewmodel.mjs、Data_Weapons.mjs、Data_Battle.mjs、index.html、Script_PlayTest.mjs
**新模块**：Script_Input.mjs

**要加的通关断言**
- 按 1/2/3/4 能切到四个不同槽位，且 viewmodel 当前武器 id 跟着变
- P3 阶段的携行含 secondary=Mauser96 与 melee=Dadao（LOADOUTS 真的接上了）
- 平射 300 m 的落点比瞄点低 0.4–0.9 m（弹道重力生效）
- 连开三枪后 player.pitch 单调上升，1.5 秒后回落到起始值的 30%±10%（后坐＋只回 70%）
- 射线起点与 EyePosition 的水平距离 > 0.05 m（视差生效）
- IssueOrder('flank') 后受令者 goal 与下令前不同（affected>0 且 goalChanged=true）
- IssueOrder('charge') 后守点单位（holdZone 非空）也进入 CHARGE 状态并离开了 holdZone
- 按住 Shift 且 ads>0.6 时 breathHold 为真、stamina 下降；未开镜时是冲刺
- 按 Space 不再触发屏息；墙前翻越、空地跳跃
- 未架两脚架时 Zb26 右键不进 ADS，架起后 ads 能到 1.0
- Type11 连发 200 发后强制停火，8 秒内不再开火

### 第 3 批：场景移动、通用交互 F、径向轮盘

**做什么**
- Script_Player.TryVault()：朝前探测可翻物并播位移曲线；失败后由同一个 Space 调 TryJump（0.55 m 净抬高、体力成本、落地恢复、空中散布惩罚）；Space 绑定并 preventDefault
- AI 同步开翻越：Script_Ai.Blocked() 加 vaultable 返回值，Act() 加 VAULT 状态
- 城墙马道：Script_World 按 TOWN.ramparts.ramps 的 [-120,0,120] 建真斜面（坡度<30°、宽 2.4 m）并进 collider 表
- 运河软墙：入水速度 ×0.25、禁开火、每秒掉 2 体力；不做游泳系统
- 新建 Script_Interact.mjs：F 键上下文分流（拾取/开门窗/接管/解放/分弹药），2 m 内最近目标，HUD 出提示词
- 拾枪拾弹：Soldier 死亡时在尸体上挂 {weaponId, clips}；捡日军三八式只有枪里那五发（六五口径无补给）
- 门窗做成可交互 box，F 开关；开着的门按开合角度参与视线判定
- 新建 Script_Wheel.mjs：纯 DOM/Canvas 2D，指针锁下累积 movementX/Y 取方向（atan2 定扇区，>40 px 半径判定选中），Digit1-8 为盘内同义键；Tab/X/G/F 四盘共用一份实现
- Tab 盘从静态列表改径向盘；G 按住期间滚轮切投掷物种类；H 改为「点燃柴草造烟」（须贴近可燃物，按住 2 s，25 s 烟柱，复用 Vfx.SmokeSource），集束移入 4 号槽轮盘
- ORDERS 扩到 8 条（补 covert 潜行扣火、callFire 要炮）
- 姿态传染：s.order==='covert' 时 s.stance = 班长姿态且不开火；HasLineOfSight 距离门槛按目标姿态缩放（站 120 / 蹲 80 / 卧 45 m）
- 体力反馈：Script_Audio 加 breathHeavy 循环，音量随 (1-stamina) 线性；不加体力条

**动的文件**：Script_Player.mjs、Script_Ai.mjs、Script_World.mjs、Script_Main.mjs、Script_Audio.mjs、Script_Vfx.mjs、Data_Battle.mjs、index.html、Style_Game.css、Script_PlayTest.mjs
**新模块**：Script_Wheel.mjs、Script_Interact.mjs

**要加的通关断言**
- 把玩家贴到一段 1.2 m 高院墙前按 Space，0.6 秒后位置越到了墙的另一侧
- 空地按 Space 完成一次约 0.55 m 的受限跳跃并落回地面；不会增加 vaultCount
- AI 至少有一名在 60 秒内触发过 VAULT 状态
- 玩家能沿马道走到城墙顶（y > 4.0）
- 走进运河（z > 209）后速度 < 1.0 m/s 且 TryFire 不消耗弹药
- 在尸体旁按 F 后 state.clips 增加，或 currentWeapon 变成尸体上的 weaponId
- 捡到 Type38 后 state.clips === 0 且 ammo <= 5
- 按住 Tab 并推鼠标到某个方向后松手，state.order 变成该扇区的命令
- 下 covert 后班组成员 stance 跟随玩家 stance 变化
- 按住 H 满 2 秒后场上烟柱数 +1，25 秒后归零

### 第 4 批：班组对象 + 指挥权顺位 + 会断的支援链路

**做什么**
- 新建 Script_Squad.mjs：Squad 类持 members[]/leader/runner/gunner；SeedSoldiers 里把近身班组（NEAR_SQUAD.nra=5）绑成一个 Squad，玩家是其中一员
- IssueOrder 前置 squad.leader === player 检查；非班长时 Tab 盘只显示「你不是班长」
- 指挥权移交顺位（史实版）：班长 → 传令兵 → 机枪手（持 Zb26）→ 老兵（identity.age 最大）→ 新兵；Hud.SetIdentity 旁补一行「班长：XXX」，移交时闪一下
- X 按住出换人径向盘（本班活着的弟兄，带姓名籍贯）；松手切换：相机平滑飞到目标位置，接管其 identity/weapon/背包，原身体交回 AI 托管
- 支援改链路：Tab 盘选「要炮」→ 射线拾取落点 → 传令兵（真 Soldier，有名字）转身往 GuandiTemple 跑 → 跑到才成、跑死这次作废且班里从此没传令兵；8–12 s 窗口内 Tab 盘同一格可取消
- 接上 SUPPORT.nra[1] 的 reinforceSquad：Tab 盘「要人」→ 同一个传令兵 → 14 s 后在最近己方点刷 4–5 人补进班组
- 弹种二选一：82 mm 榴弹 / 发烟弹（一局 1 发）。不加 APHE、不加空中支援、不加重炮
- 亲自操炮：地图上放一门二十年式 82 mm 迫击炮，F 接管，滚轮调表尺，HUD 出落点图标＋目标仰角数字，落弹复用 mortarInFlight
- AI 呼炮打蹲点玩家：StepIjaSupport 改条件触发（玩家在 8 m 半径内开火累计 > 45 s 且累计击杀 > 3），保留 warnLeadS 1.5 s 啸声窗口；背景炮击落点改到占领点附近而不是玩家头上
- 贴身抑制炮火：玩家 30 m 内有活着的日军时 artillery 停火、launcher 间隔 ×2.2
- 小地图敌方质心按班组分别取（Squad 落地后自然解决）
- 下令发声：通过 Audio 的 HRTF Panner 发一声喊，给 AI 加 hearing 线索源（权重 0.6，只给方向不给精确位置）

**动的文件**：Script_Main.mjs、Script_Ai.mjs、Script_Combat.mjs、Script_Hud.mjs、Script_Audio.mjs、Data_Battle.mjs、index.html、Script_PlayTest.mjs
**新模块**：Script_Squad.mjs

**要加的通关断言**
- squad 对象存在且 members.length >= 4，leader 非空
- 玩家不是班长时 IssueOrder 返回 0（affected===0）
- 把 squad.leader 打死后，leader 变成 runner（或顺位下一位），且 Hud 上「班长：」这一行文本变了
- 按住 X 选一个弟兄松手后，player.identity.name 变成该弟兄的名字，且原来那具身体仍在场上（交回 AI）
- 呼炮后场上出现一名 order==='runner' 的 Soldier，且他的 goal 指向 GuandiTemple（±3 m）
- 把传令兵在半路打死 → 呼叫失败（mortarInFlight 恒为 0），且 squad.runner 变为 null
- 传令兵跑到终点后 8–12 s 内 mortarInFlight >= 1
- 呼叫后 3 秒内用 Tab 盘取消，mortarInFlight 恒为 0 且 mortar 次数被退回
- 玩家 30 m 内放一名活日军时，artillery 计时器不再递减
- 玩家在同一位置开火 50 秒且击杀 4 人后，掷弹筒落点距玩家 < 8 m；反之不触发

### 第 5 批：伤势三层 + 投降与战俘

**做什么**
- Script_Player 加状态机 Healthy → Wounded → Downed → Dead；Script_Ai.Soldier 同步加
- Wounded 层补硬规则：wounds.length>0 时强制 canSprint=false、breathHold=false；去饱和改由 (1-health/100) 驱动而不只是 suppression（Script_Post 加 uDesaturate uniform）；Bandage 改 3.2 s 计时，期间 viewmodel.IsBusy() 为真自动禁开火
- Downed 层：躯干/腿致死伤 40% 概率转 Downed（头部命中、近距离、爆炸直接死），40 s 倒计时，能爬不能开枪，按 F 呼救会暴露位置；只有超时或被补刀才走 OnPlayerDown()
- 拖拽：按住 F 指向 Downed 者并移动（0.9 m/s，期间不能开火）；优先级排在诊断之前
- 器械诊断（简化两种）：止血带对枪伤/流血、剪刀对弹片/绞缠；伤员头顶浮图标，按住 F 出器械轮盘，选错浪费 3 秒；任何人捡到药包都能救（职业不锁能力，恰好对齐 ER2）
- 弟兄 AI 会来施救：Script_Ai 加 RESCUE 状态，去拖同侧 Downed 者到 8 m 外掩体后包扎
- 日军投降：仅当「占领点刚被我方夺回 + 点内日军 < 3 人 + suppression > 0.9 + 20 m 内无其他日军」四条同时满足，按 0.25 概率判定；举手 pose + 丢枪
- 中国守军 surrenderRate 恒为 0；玩家永不自动投降（difficulty.autoSurrender 写死 false，不给用户开）
- 杀降不给任何奖励，且让 30 m 内其余日军 cohesion 上升
- 解放己方战俘：日方占领点内低概率生成被俘弟兄，F 解放后他捡起地上的枪归队且 nraPool += 1
- 重生后无敌：RespawnPlayer 里 spawnGuard = 3.0，TakeHit 在 spawnGuard>0 时 return
- bleedPerWound 等 COMBAT 死字段接进 TakeHit，替掉硬编码的 6/2.6/1.4

**动的文件**：Script_Player.mjs、Script_Ai.mjs、Script_Main.mjs、Script_Hud.mjs、Script_Post.mjs、Data_Battle.mjs、Script_PlayTest.mjs

**要加的通关断言**
- 玩家躯干中致死伤后 player.Downed 为真且 health 未走 Kill()，40 秒后才进阵亡卡片
- Downed 期间 TryFire 不消耗弹药、移动速度 < 0.6 m/s
- 有 wounds 时 canSprint 恒为 false、breathHold 恒为 false
- 按 B 后 3.2 秒内 viewmodel.IsBusy() 为真且开火被拒
- 按住 F 拖拽一名 Downed 弟兄移动 3 秒，他的 position 变化 > 1.5 m
- 器械选错时计时器 +3 秒且伤员未被救活
- 四条件同时满足时日军会投降（surrendered 计数 > 0）；只满足三条时恒为 0
- 任何条件下中方 AI 的 surrendered 恒为 0
- difficulty.autoSurrender 恒为 false 且无法被外部赋值为 true
- 解放一名战俘后 nraPool +1
- 重生后 3 秒内 TakeHit 不掉血

### 第 6 批：一维战线推拉 + 阶段与胜负接战况

**做什么**
- 新建 Script_Frontline.mjs：frontlineIndex（0..4）对应点链 中正门 → 东北/西北角 → 清真寺 → 文昌阁 → 火车站/新关帝庙 → 惠迪吉门；玩家恒在南端
- 切档只移动双方出生带与激活占领区，不重载场景（web 上这条是硬要求，任何加载中断都会掐断沉浸）
- 昼夜决定推拉方向：白天段（sky != night）日军推进速率 ×1.6、我方 ×0.5；夜战段（nightRaid / counterattack）反过来
- PHASES[i] 加 objectives:[id...] 与 spawn:{nra,ija}；OBJECTIVES[i] 加 captureTime（清真寺/中正门 40 s，文昌阁/东北角 22 s），替掉硬编码的 dt/26
- UpdateObjectives 与 Hud.UpdateMarkers 只遍历当前 Phase 激活的点
- 阶段推进改为「时间到 或 本 Phase 激活点全部易主」取先到者（时间仍是条件之一，史实进程必须按日期走）
- 胜负改为：frontlineIndex 触底 + 票耗尽 = 败；撑到 P6 且推回城北 = 胜
- P6 全线反攻的实际翻转：SetSideGoal 方向反过来（我方往北推）、占领点激活顺序反转、AssignDefenders 改为对 ija 侧调用
- 占领连锁：Flip 到 ija 时触发点内我方溃退判定；Flip 到 nra 时触发点内日军投降判定

**动的文件**：Data_Battle.mjs、Script_Main.mjs、Script_Hud.mjs、Script_Ai.mjs、index.html、Script_PlayTest.mjs
**新模块**：Script_Frontline.mjs

**要加的通关断言**
- state.frontlineIndex 存在且初值为 0
- 日军夺下当前战线格的全部激活点后 frontlineIndex +1，且双方出生带位置发生变化
- 切战线格时不触发任何资源重载（场景 uuid 集合前后一致）
- 任一时刻激活占领点数量在 2–4 之间，不是恒 8
- P4（night）时我方推进速率高于日军；P1（smokyDay）时反过来
- 把当前 Phase 激活点全部翻旗后 phaseIndex 递增（不必等时间到）
- frontlineIndex 触底且 nraPool 归零 → outcome==='defeat'
- P6 里 SetSideGoal('nra') 的目标 z 小于玩家 z（真的在往北推）

### 第 7 批：信息层 + 难度滑条面板

**做什么**
- 新建 Script_Difficulty.mjs：{aiAccuracy, blastRadius, suppressionScale, playerDamage, staminaSeconds, overheat, bulletGravity, freeAimDeg, ironSightOffset, autoSurrender:false, showCrosshair, enemyMarkers}，在 Ai.TryFire / Combat.Blast / Player.TakeHit / Suppress 等处读取，绝不硬编码
- index.html 开机面板：三个预设按钮（体验/标准/写实）+ 高级展开滑条 + 战场规模三档（复用 SCALE_PRESETS，大档标注「需要较好的设备」），存 localStorage；首帧后跑 3 秒性能探针自动推荐
- web 默认档偏「体验」：准星开、免疫压制、AI 精度 0.7、freeAim 0
- M 键全屏地图（Canvas 2D）：激活占领点及归属、我方兵员池、传令兵当前位置、浮桥、师指挥所；不标日方炮兵
- 占领点图标从 ▲/✕ 换成 交叉刀剑（待打）/ 旗帜（已占），争夺中沿用现有 fight 类
- 顶栏改成一行硬信息：「守住清真寺 · 能拿枪的人 587 · 前线：文昌阁」，胜负条件时刻可读
- 中键 spot：120 m 内命中敌兵给 8 秒标记，只给班组级圆圈不给个体点
- 反斜杠 HUD 全关：hudRoot.classList.toggle('off')，Style_Game.css 加 .off{opacity:0}
- Esc 暂停面板 + 阵亡名册页（state.fallen 已有数据，一行一个「姓名 · 籍贯 · 生年—1938」，按阵亡顺序；名册上不打歼敌数）
- 压制分四档表现：>0.25 暗角抬到 0.72 / >0.45 晃动 ×(1+1.3s) / >0.70 接耳鸣低通总线且不能屏息不能冲刺 / >0.90 换弹速度 ×0.8；补 get isSuppressed(){return suppression>0.45}
- 按 R 时角色喊剩余桥夹数；「按 R 压弹」提示改成只在前两次出现

**动的文件**：Script_Hud.mjs、Script_Main.mjs、Script_Player.mjs、Script_Ai.mjs、Script_Combat.mjs、Script_Post.mjs、Script_Audio.mjs、index.html、Style_Game.css、Script_PlayTest.mjs
**新模块**：Script_Difficulty.mjs

**要加的通关断言**
- window.Taierzhuang.difficulty 存在且十二个字段齐全
- 切到「写实」预设后 aiAccuracy 与 bulletGravity 都变大，且 showCrosshair 变 false
- difficulty.autoSurrender 在三个预设下恒为 false
- 按 M 后地图 DOM 节点可见且标记数 === 当前激活占领点数 + 1（传令兵）
- 地图上不存在任何 ija 侧支援标记
- 按反斜杠后 hudRoot 带 off 类且 opacity 为 0
- 中键命中敌兵后小地图上多一个班组级圆圈，8 秒后消失，且从不出现个体点
- Esc 打开面板后阵亡名册行数 === state.fallen.length，且面板文本不含「击杀」「歼敌」字样
- 顶栏文本同时含有目标名、兵员池数字、前线名三段

### 第 8 批：重武器与长尾清理

**做什么**
- 新建 Script_Emplacement.mjs：可接管固定武器（缴获的九二式重机、我方二十年式迫击炮）；日方占领点上摆 1–2 挺九二式作为 AI 火力点，点被夺回后玩家 F 接手
- 战车作为敌方单位出现（不可驾驶）：沿主街路径推进、车载机枪压制；寻路只在主街 5.2 m 与次巷宽段 2.4 m 网络上跑，夹道 1.5 m 永远进不去（接上 minAlleyWidthM）
- 炮塔俯仰限制 −10°~+15°，打不到二层屋顶 —— 于是「往巷子里退」「上房顶砸集束手榴弹」成为真实且正确的战术
- 集束手榴弹接 armorPiercing：对 Type89Tank 走 weakSpotMultiplier 3.2 通道
- AI 放烟掩护推进：日军突击班 ADVANCE 状态下被压制 > 0.5 且距目标 30–60 m 时 15–20% 概率投烟；烟必须真的进遮蔽判定
- 桥夹半装规则：弹仓剩 n 发时压桥夹只能压进 (5-n) 发，剩下白扔；state 加 clipPartial；按住 R 出桥夹轮盘
- 栓动 boltTimeS 拆成独立 viewmodel 动作阶段：期间允许移动与转向但禁开火，被 TakeHit 打断则重来
- 横队/纵队队形切换：SetSideGoal 按 formation 重算 laneOffset 分布（纵队≈0、横队按序号展开）
- AI 精度补硬规则：距离 >150 m 时按平方衰减，且先打近的
- 删除 Data_Levels.mjs（326 行，无任何模块 import，线性关卡时代遗物，留着误导后人）并从 importmap 摘掉

**动的文件**：Script_Ai.mjs、Script_Main.mjs、Script_Combat.mjs、Script_Vfx.mjs、Data_Weapons.mjs、Data_Levels.mjs、index.html、Script_PlayTest.mjs
**新模块**：Script_Emplacement.mjs

**要加的通关断言**
- 夺回一个带九二式的点后按 F 能接管，接管期间开火消耗该武器弹药而不是步枪弹
- 战车实例在 P3/P5 阶段存在且 position 沿主街移动
- 把战车引到夹道口，它的 goal 不会进入宽度 < 2.5 m 的路段
- 从二层屋顶投集束手榴弹能对战车造成 > 300 伤害；平地正面投伤害显著更低
- 弹仓剩 2 发时按 R，ammo 变 5 且 clipPartial 记录了浪费的 2 发
- 拉栓期间移动不被禁止但 TryFire 被拒；拉栓中被打中后需要重新拉
- 日军班组在被压制且距目标 30–60 m 时 60 秒内至少投过 1 次烟，且烟柱进入了 LOS 判定（穿烟的 HasLineOfSight 返回 false）
- Data_Levels.mjs 不存在，且 importmap 里没有它的条目
- 开机与通关两道冒烟全绿（此时 PlayTest 断言总数应 ≥ 90 条）


---

## 单阵营等价实现

「不能选阵营」是唯一豁免，但它牵动 ER2 的四个系统。逐个给等价实现，一律不照抄也不砍掉。

**1) 双方出生菜单 / 逐个成员手动重生 → 阵亡卡片 + X 键换人径向盘**
ER2 的出生菜单是多人局的产物：你死了回菜单，在班组名单里挑一个人接管。我们已有的阵亡卡片（姓名·籍贯·生年—1938·番号，2.6 s）＋自动接管，在单人局里节奏更好，保留。缺的是「不必等死也能换」这一半，用 X 按住出径向盘补上：列本班活着的弟兄，松手后相机平滑飞到目标位置、接管其 identity/weapon/背包，原来那具身体交回 AI 托管。**不抄「逐个成员手动操作」那部分** —— 那是多人局用来分配人手的，单人局里只会打断节奏。台儿庄的额外分量在于：你可以换一个人，但换过去的那个人也会死，而兵员池是共用的。

**2) 攻守互换 → 昼夜互换 + P6 全线反攻**
ER2 的攻守互换要靠选边或换模式。我们天然就有一条更有说服力的：P1–P5 玩家守、P6（counterattack:true）转攻，这是史实进程（四月六日日没后全线反攻）。要补的是 P6 的实际翻转 —— 现在只有 story.Signal('counterattack') 这一句，SetSideGoal 方向没反、占领点激活顺序没反、AssignDefenders 从没对 ija 侧调用过。补齐之后「攻守互换」在单阵营下不是模式开关，是剧情推进。
第二层等价在昼夜：白天段日军推进速率 ×1.6 / 我方 ×0.5，夜战段（P4 nightRaid、P6 counterattack）反过来。「阵地白天丢、夜里夺回来」这句史实直接变成机制，一句提示都不用写。

**3) Push the Frontline 双向推拉 → 一维「城内战线」frontlineIndex**
ER2 的 PtF 是双方互为攻方、战线来回推。单阵营等价：一条从北到南的点链（中正门 → 东北/西北角 → 清真寺 → 文昌阁 → 火车站/新关帝庙 → 惠迪吉门），玩家恒在南端。日军推一格 = 我方丢一个点，我方反攻推回去一格 = 夺回来。**双向推拉这件事本身完整保留了，被单阵营改掉的只是「你能站在哪一端」。**
两条硬要求：① 切格时只移动双方出生带与激活的占领区，**绝不重载场景** —— web 上任何加载中断都会掐断沉浸；② 失败线是 frontlineIndex 被推到运河（最后一格）+ 票耗尽，胜利线是撑到 P6 且推回城北。

**4) 支援链路的双向对等 → 单向不对等（这条是「不能选阵营」＋史实红线的叠加）**
ER2 的支援链路两边同构（各有无线员、各有炮）。我们只实现中方那一侧的链路（传令兵跑腿），日方支援不给玩家任何 HUD —— 玩家只能靠听。这不是因为不能选阵营，是因为选不了阵营就没必要为日方做一套玩家用不到的链路 UI；正好也守住了「支援不对称是史实」这条红线。

**5) 投降的双向触发 → 单向触发**
ER2 的投降对两边同构（票尽时进攻方附近敌军扔枪、给伤敌医疗使其投降）。单阵营下我们只需要日军会投降这一半（条件极严、概率 0.25），中方恒为 0。「解放己方战俘」这条保留（F 键，解放后归队且 nraPool +1）—— ER2 设计这条的原意就是「票的另一种来源」，单阵营下原意完整成立。

**6) 出生区配置 → 单侧可配 + 单侧程序化**
ER2 的 PHASES 里双方出生区都是编辑器配的。我们给 PHASES[i] 加 spawn:{nra, ija} 两侧都配上，但中方那侧仍保留现有的「离前线最近的己方点往后 18 m」作为 fallback，因为战线推拉时中方出生点必须跟着动。

**7) 难度里的按阵营分设 AI 数量 → 保留双侧滑条**
ER2 允许按阵营分别设 AI 上限。我们照做（面板上给 nra/ija 两条），这条跟选不选阵营无关，纯粹是规模控制，直接对齐。

---

## ER2 做法与史实冲突处的取舍

- 【支援链路完整性 vs 中方支援稀缺】ER2 双方支援对等（HE/Smoke/APHE、空中支援、多种火炮），我们只对齐「链路可断」这个结构，不对齐弹种数量。中方：迫击炮全战役 2 发、传令兵 3 次、发烟弹 1 发、无空中支援、无重炮、反坦克只有集束手榴弹；日方：掷弹筒、九二式重机、八九式中战车、野战重炮。取舍的净效果反而是我们比 ER2 更能体现「链路可断」——我们连电台都没有，链路的物理载体是一个会被打死的人（Data_Battle 注释原话：「没有无线电。要人只能派人跑回去要」）。
- 【ER2 的玩家自动投降 vs 台儿庄死守】ER2 写实难度下玩家会被强制投降。我们恒不做，difficulty.autoSurrender 写死 false 且不给用户开。ER2 自己提供 disable player auto-surrender 开关，所以这不算破坏对标。孙连仲那句「士兵打完了，你自己填上去。你填过了，我来填。有敢退过运河的，杀无赦」是这个游戏的命门，玩家被系统判定投降会直接摧毁它。
- 【ER2 的七种投降触发 vs 中方投降率】中国守军 AI surrenderRate 恒为 0。压制到极限的表现是往后缩、拖着伤员退、被打散——溃退不是投降。依据：台儿庄是死守，第 2 集团军伤亡逾十分之七、第 31 师最后余 1400 人仗还在打。ER2 的「占点连锁投降」正反馈只保留在日军一侧。
- 【日军投降率 0 还是非零】本轮复核 Data_HistoryQuotes.md §10：中方战报「毙伤日军 11984 人，俘 719 人」——俘虏是有的，所以非零成立。但那是 1938 年战报口径、学界无定论，所以只能做得很稀：四条件同时满足（占领点刚被我方夺回 + 点内日军 < 3 人 + suppression > 0.9 + 20 m 内无其他日军）时按 0.25 概率判定，实际投降率落在 3% 量级。这也统一了两份拆解里 0.25（判定概率）与 0.03（实际率）的口径分歧——它们不冲突。
- 【ER2 的铁瞄偏心 vs 我们的共轴设计】A 卷主张做 8–14 px 偏置，B 卷主张不做（理由是那是 ER2 全网争议最大的设计，开发者自己都要出来解释「这不是 bug」）。裁决：做，但幅度减半（4–8 px，汉阳造比中正式明显，借「老套筒枪龄大」这条史实做差异），并挂 difficulty.ironSightOffset 滑条可关。理由：用户口径是无脑对标，豁免清单里只有阵营一条；B 卷的理由是品味判断不是范围判断，不足以构成豁免。注意 Script_Viewmodel 为「照门与准星必须共轴」专门调过上护盖高度，改偏心时要一起复核。
- 【ER2 没有 free aim vs 我们有 5°】benchmark 把「ER2 没有 free aim」标为「查不到证据」级别的否定结论，不是「查到明确否认」。A 卷推 2.0°、B 卷推 3.5°。裁决：做成 difficulty.freeAimDeg 滑条（0 / 1.2 / 2.0 / 3.5），默认标准档 2.0°。滑条对这条不确定性最鲁棒。但有依赖顺序：0 档只有在弹道、视差、后坐三条都落地（第 2 批）之后才可用，否则会得到「枪很稳但打不中」这个最糟的组合。
- 【ER2 的弹匣逐个追踪 vs 中方桥夹固定弹仓】A 卷主张做桥夹版规则，B 卷主张「ER2 那套是给可拆弹匣枪的，不需要对齐」。裁决：做，但降到第 8 批。中正式/汉阳造是桥夹压入固定弹仓，弹仓剩 2 发时压桥夹只能压进 3 发、剩下白扔——这比 ER2 的弹匣规则更狠也更真实，成本很低但体感增益也低。配套补 ER2 的「角色喊剩余弹匣数」，补上我们已对齐的「不显示弹药数」的后半句。
- 【ER2 的医护兵三器械诊断小游戏 vs 中方无医护兵编制】A 卷主张做两器械轮盘，B 卷主张不做诊断、只做拖拽+按住 F 包扎 4 s。裁决：做两器械（止血带对枪伤/流血、剪刀对弹片/绞缠），选错浪费 3 秒。两卷其实不冲突——ER2 本身就是「职业不锁能力，谁捡到器械谁能救」，而中方没有正规医护兵编制、靠同班弟兄和担架兵，恰好落在同一条规则上，不用改设计就对齐了。器械种类从三种减到两种，因为中方药品极度稀缺，第三种器械没有史实载体。
- 【ER2 的完整可驾驶载具层 vs 中方没有战车】ER2 有座位制、装甲穿透、弹道模拟、HE/AP/APHE、车长标记、双指针罗盘。我们只做「接管固定武器」（缴获的九二式重机、我方二十年式迫击炮），战车只作为敌方单位出现。理由是史实而非工作量：中方在台儿庄没有战车；缴获并驾驶日军战车的记录不可靠；而「缴获重机枪掉转枪口」是有记载的。这是全案唯一一处我主动建议偏离无脑对标的地方，需要拍板。
- 【ER2 的支援弹种数量 vs 发烟手段】ER2 步兵按 H 直接丢烟罐，迫击炮与火炮都有烟幕弹。中方没有制式发烟罐，改为「点燃就近柴草／湿棉被造烟」：须贴近可燃物、按住 2 s、出一根 25 s 烟柱。这个替代比照抄烟幕弹更对味，且天然带「要花时间、要有可燃物」的代价。日方那侧不打折——日军有制式发烟筒，AI 突击班放烟掩护推进照做。
- 【ER2 的士气/压制取舍 vs 立场红线】ER2 的 450 KB 官方日志里 morale 出现 0 次，用「压制连续量 + 投降离散事件 + 撤退指令」替代整套士气系统——这一条我们本来就对齐了，但代码里残留了一个 Soldier.morale 字段（算的是 34 m 内同侧活人数）与一个从未被读的 COMBAT.moraleBreakAt。改名为 cohesion、删掉 moraleBreakAt、永不出 UI。这既是对齐 ER2，也是硬红线：屏幕上出现一条「中国守军士气条」在立场上是灾难。
- 【ER2 的结算数据 vs 歼敌数】票池改成统计阵亡单位之后，会很自然地手上就有了一个精确击杀数。Data_HistoryQuotes.md §10 明写：中日双方伤亡数字学界至今没有定论，结算界面不要出现精确歼敌数，用「日军残部向峄县、枣庄退却」这种事实性表述收尾。现有 EndBattle 已经守住了，加票池统计后别顺手把「击杀 N 人」打上去；Esc 面板的阵亡名册页同理，只列自己人的姓名籍贯生卒。
- 【ER2 的缴获武器可用 vs 缴获日械无配套弹药】ER2 里缴获的坦克、火炮、机枪都能直接用。我们做「捡三八式只有枪里那五发」——六五口径我们自己没有补给线。这既是史实（缴获枪没有配套弹药补给），也是「捡枪」这个动词不至于破坏经济平衡的天然闸门。存疑标记保留：我没查到第 31 师是否有缴获日械弹药的记载，如果后续查到有，这条闸门要重设计，别默默留着一条站不住的规则。
- 【ER2 的编制术语 vs 中方编制】ER2 的指挥权移交顺位是 班长→无线员→机枪手→狙击手→步枪兵，这是确证的。中方无线员不存在（等价物是传令兵），狙击手编制也不存在（换成「老兵」，第 2 集团军是老西北军底子，老兵这个身份是有的）。最终顺位：班长 → 传令兵 → 机枪手（持 Zb26）→ 老兵（identity.age 最大）→ 新兵。存疑标记：「老兵」在第 2 集团军实际编制中是否成立我没有考据依据，属设计取值，落地前值得再核一次 Data_HistoryMaterial.md。
- 【ER2 的 hitmarker vs 我们的三重减法】**2026-08-20 补的一条漏项，也是这份对齐表自己漏掉的一条。** ER2 设置里有 Show hitmarker（可选），我们在 `Data_GunFeelReview.md` 的裁决表里把它记成「默认关的难度选项」就搁下了，一直没做。实跑之后这个判断是错的：本作同时做了三件减法（没有准星 / 不显示弹药数 / 结算不打歼敌数），每件单看都对，叠起来就把「我这一枪打没打中」的所有出口一起堵死了——血雾粒子 0.17 m 在一百米上折合 2.8 个像素，`impactFlesh` 走 inverse 衰减到八十米只剩 4.8%（实测 sfx 母线峰值 0.026，比玩家自己那一枪低 30 dB）。于是四十米以外，开枪打中人和打空在玩家的感官里是同一件事。现在补的是两条通道：听觉回执（`hitConfirm` / `killConfirm`，非空间化、三档难度都给、靠"一下 vs 两下"而不是靠音量区分）与屏幕记号（`Hud.Hitmark`，挂 `DIFFICULTY.hitMarker`，写实档关）。**回执里没有任何数字**——不做连杀播报、不做「+1」飘字、不做击杀计数，那条红线不动。细节与实测数字见 `Data_GunFeelReview.md` 末节。
