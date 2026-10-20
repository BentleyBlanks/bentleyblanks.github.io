# 炮击扬尘测试场（?impacts=1）

2026-10-20 新增。用途：验收「炮弹落地扬尘」——炸点附近的尘土起始形态要贴合壕沟形状（沟里炸了，尘沿着沟走、从沟里冒出来），
然后升起、顺风飘散。**扬尘本身**（`Script_DustFlow` / `Script_DustFieldRenderer` / `Data_Tuning_GroundImpact`、`Script_Vfx`、`Script_Combat`）
不在本页（口径见 [落地扬尘](Data_ShellImpactDust.md)）：本页只管**测试场景、测试面板和各弹种的投送**。场地不画任何爆炸，所有弹种走生产链，扬尘怎么改都不用动这里。

## 入口

| 入口 | 说明 |
| --- | --- |
| `Taierzhuang1938/index.html?impacts=1` | 直达（和 `?explosions=1` 同一类沙盒：整表替换关卡表，正片不知道它存在） |
| 主菜单「选章 → 测试场景 → 炮击扬尘测试场」 | `Script_MenuStartup` 与 `Script_Main` 的 `sandboxes` 表第七项（徽标「尘」） |
| 暂停菜单「退出炮击扬尘测试场」 | `Script_Menu.SANDBOX_MODES` 的 `impacts`，文案在 `Data_Text_Menu` 的 `menu.sandbox.impacts.*` |

接线点（`Script_Main.mjs` 里 `IMPACT_TEST` 出现的每一处，对照 `EXPLOSION_TEST` / `GORE_TEST`）：参数旗、`SANDBOX`、`PHASE_TABLE`、
`WORLD_CLASSES[SHELL_IMPACT_RANGE_ID]`、`GoToSandbox`、`sandboxMode`、玩家无敌（`ApplyDebugOptions`）、开机按钮文字、同伴 / 摆点层 /
撒兵排除、`AdvanceLevel` 不换关、帧循环里的时间缩放 / 更新 / 相机接管 / 输入接管，以及 `Data_StartupRouting` 的两张表。
外部道具走 `Script_ExternalProps.AddExternalProps` 的 `placementsOnly`（phase 上的 `externalPlacements`），**不带城里的摆件与 PCG**；
tzm 饰件层跳过。

玩家**无敌**、**不刷敌人**、不接同伴，`state.pinned = true`（站遍场地不触发换关）。

## 场地与坐标

局部坐标原点 = 场心 `SHELL_IMPACT_ORIGIN` = 世界 **(3800, 3800)**，X 向东、Z 向南（同世界）。边界 300 × 300 m
（x 3650–3950 / z 3650–3950），与其它测试场（爆炸 2545–2655、枪械 2350–2460、靶场 1290–1510、断肢 3300–3380、操作 3150–3248、工具首页 4900–4940）
和第一关都不重叠。默认镜头朝北（-Z）；北侧是「敌方」，射击壕的弃土垄堆在两侧。

**地形**照第一关的管线：`Data_ShellImpactRangeTerrain` 给 `FirstLevelWhiteboxField` 一份自己的布局——`SampleMissionTerrain(x, z, spec)` 吃我们的
terrain spec（无道路 / 场坪 / 河，壕沟网络 + `earthProfile`，沟外是不规则连续的弃土垄，沟壁 `RefineCells` 细分），地面是 `MissionPlain`
分层土壤 PBR（底土 / 草茬 / 沟边翻土）+ 壕沟表面土块 / 根毯 / 石头。地面顶点色再按 `SHELL_IMPACT_GROUND_TINT` 往黄褐上推一点
（第一关那套土偏冷灰棕，参考图是黄土地）；沟沿抛土裙面在 `ShellImpactRangeField.BuildWhiteBoxes` 里补同一个偏色。
地面 `deformableTerrain`，弹坑、Rapier 贴地、角色贴地共用同一份高度场（契约 5）。

自然地面不是第一关那份（它带东 / 西 / 北三道土坎）：`Data_FirstLevelMissionTerrain` 给 terrain spec 加了一个**可选**钩子
`spec.naturalHeight(x, z)`，`SampleMissionTerrain` 与 `TrenchPlanFor` 读它；**不传时与原来逐位相同**——全第一关 235 469 个采样
（高度 + 地表图层权重）的 sha256 改前改后一致，`Script_FirstLevelWhiteboxTerrainTest.mjs --digest` 也不变（`83003b32…`）。

### 壕沟网络（局部坐标）

| 段 | 预设 | 控制点 | 说明 |
| --- | --- | --- | --- |
| `FireLine` 射击壕 | fire，`bermSide: both`，`bermH: 0.85` | (-48,-8) (-31,-8) (-25,-19) (-9,-19) (-3,-8) (14,-8) (20,-20) (36,-20) (42,-10) (49,-10) | 锯齿形横贯约 97 m，8 个折角（拐角护墙段） |
| `CommTrench` 交通壕 | communication | (6,-8) (6,3) (9,10) | 从射击壕往南接到后方横沟 |
| `RearTrench` 后方横沟 | communication | (-26,15) (-10,11) (9,10) (24,12) (38,19) | 与交通壕在 (9,10) 成 T 形**三岔口** |
| `ListeningSap` 短支沟 | sap，`depth: 1.5` | (30,-20) (30,-31) (35,-37) | 从射击壕往北探约 17 m |

junction 由管线按端点自动认：交通壕×射击壕 (6,-8)、交通壕×后方横沟 (9,10)、短支沟×射击壕 (30,-20)。沟底约 −2.0 m（短支沟 −1.5 m），
射击壕沟沿弃土垄顶约 +0.85 m。

### 落点

局部坐标；`y` 由共享高度场现取（弹坑之后会变）。`Targets()` 返回世界坐标。

| id | 面板名 | 局部 (x, z) | 世界 (x, z) | 地面高度 |
| --- | --- | --- | --- | --- |
| `TrenchStraight` | 沟内直段 | (-17, -19) | (3783, 3781) | −2.04 |
| `TrenchCorner` | 沟内拐角 | (20, -20) | (3820, 3780) | −1.94 |
| `CommTrench` | 交通壕内 | (6, 0) | (3806, 3800) | −1.91 |
| `Junction` | 三岔口 | (9, 10) | (3809, 3810) | −1.84 |
| `BermCrest` | 沟沿弃土垄上 | (-17, -22.5) | (3783, 3777.5) | +0.84 |
| `OpenFront20` | 沟前开阔地 20 m | (-2, -42) | (3798, 3758) | +0.04 |
| `OpenRear8` | 沟后空地 8 m | (-34, 0) | (3766, 3800) | ≈0 |
| `BunkerSide` | 堡垒旁（碉堡旁） | (47.5, -24) | (3847.5, 3776) | +0.09 |

另有「点地面选点」：选点模式下**按住 Alt**（放开鼠标）点地面，从相机穿过鼠标位置打一条射线到地形取交点，落点标记跟过去
（见「选点」）。界面里写「堡垒旁」而不是「碉堡旁」：界面字体子集里没有「碉」字（`Font/Script_FontSubset.py` 要 Python 重烘，本机没有）。

### 布景（仓库现有资产，不新生成）

坐标都在 `Data_ShellImpactRange.mjs`，局部坐标见该文件；`Script_ShellImpactRangeField` 与 `Script_ExternalProps` 负责摆。

- **碉堡**两座（`battlefieldPillbox`）：(2,-62) 后方中间、(56,-22) 右侧挨着射击壕东端。
- **弹药 / 补给**：`battlefieldCompartmentCrate` / `battlefieldSupplyBox` / `battlefieldShellStack` / `militaryCrateClosed|Open`，沟后与碉堡旁。
- **沙袋**：`battlefieldSandbag01..03`（标准沙袋资产），在机枪位前。
- **汽油桶** 14 只：**仓库里没有现成的桶模型**（简报提到的 `Data_Meshes` 的 Barrel / AmmoBox 并不存在），沿用第一关焦桶堆
  （`Script_FirstLevelSmokeOrigins`）的程序化做法——圆柱 + 两道箍，三种漆色，其中几只倒在地上；走 `BuildSink` 合批并登记碰撞盒。
- **九二式三脚架重机枪**（`Model_Type92Hmg.tzm.json`）一挺，架在射击壕南沿左段 (-44,-2.7)，枪口朝北；网格烘进 `BuildSink`。
- **枯树** 9 棵：`Script_BreakableTrees.Load(field, placements)` 的新可选参数（不传 = 第一关那份），**炮击能打断**。
- **战车炮阵地**：场地东侧两辆现有战车（`Type95HaGo`、`Type89Tank`，动态模型），局部 (140,-12)、(140,10)，炮口朝西。

静态几何都进 `BuildSink`；布景不压壕沟也不踩弃土垄（沙袋与机枪故意摆在沟沿，只要求不在开挖范围里）——`Script_ShellImpactRangeTest` 逐件核对。

## 弹种与投送

装药读 `Data_Explosives.EXPLOSIVES[id].fillingKg`；半径 / 伤害取 `Data_Weapons`（手榴弹、集束、掷弹筒、战车炮、迫击炮），105 / 150 / 航弹是测试场名义值。
`Combat.Blast` 的 `kind`：手榴弹 `grenade`、集束 `tank`、航弹 `bomb`，炮弹命中后 `FireShell` 自己调 `Blast(..., "shell", ..., shell.kind)`。
**explosiveId 一律传弹种自己的 id**（扬尘靠它定装药量）。

| 弹种 id | 面板名 | 装药 kg | 投送 | 落角 | 飞行 | 半径 / 伤害 |
| --- | --- | --- | --- | --- | --- | --- |
| `Grenade` | 手榴弹 | 0.165 | 直接起爆（hand） | 55°（取证值） | — | 6.5 / 130 |
| `GrenadeBundle` | 集束手榴弹 | 1.155 | 直接起爆（hand） | 55° | — | 4.2 / 620 |
| `Shell50` | 掷弹筒 50 mm | 0.153 | 高抛，北侧 55 m | 70° | 3.9 s | 5 / 110 |
| `Shell37` | 战车炮 37 mm | 0.058 | 九五式，东侧阵地平射 | ≈2° | 0.55 s | 3.4 / 120 |
| `Shell57` | 战车炮 57 mm | 0.25 | 八九式，东侧阵地平射 | ≈3° | 0.6 s | 4 / 160 |
| `Shell82` | 迫击炮 82 mm | 0.553 | 高抛，北侧 70 m | 70° | 4.4 s | 7 / 150 |
| `Shell75` | 野炮 75 mm | 0.81 | 北侧 100 m | 45° | 3.15 s | 7 / 150 |
| `Shell105` | 榴弹炮 105 mm | 1.97 | 北侧 110 m | 60° | 4.4 s | 9 / 220 |
| `Shell150` | 榴弹炮 150 mm | 4.38 | 北侧 120 m | 60° | 4.6 s | 12 / 320 |
| `Bomb50kg` | 航空炸弹 50 kg | 22 | 自由下落，110 m 高 | 80° | 4.7 s | 14 / 420 |
| `Bomb250kg` | 航空炸弹 250 kg | 100 | 自由下落，130 m 高 | 80° | 5.2 s | 22 / 800 |

- **落角算法**（`Data_ShellImpactRange` 的 `LobFlightS` / `ArrivalAngleDeg` / `DropPlan`，纯函数，测试共用）：弹从落点水平 D 米外、高出落点 h 米的 `from`
  起飞，飞行 T 秒，抛物线（重力取 `Script_Combat.GRAVITY` = 19.6）；命中点弹道与水平面夹角 θ 满足 `tanθ = (h + g·T²/2) / D`，已知 D、θ 反推
  `T = √(2·(D·tanθ − h) / g)`，`FireShell(from, 落点, { flight: T })`。浏览器测试在命中前最后两个采样点量实际落角，与名义值差 < 3°。
- **平射**从战车炮口（`field.TankMuzzle(id)`）打；落点在沟里时低伸弹道会先撞上沟沿 / 抛土垄，在那儿起爆——这正是「浅落角打沟」要看的，不算失效。
  要打开阔地或碉堡请选 `OpenFront20` / `BunkerSide`。
- **航空炸弹**不借 `Script_BombBallistics`（那套带空气阻力，面向轮番轰炸）：自己积分的无阻力下落，真实重力 9.81，水平速度使落角为名义值；
  下落途中沿路射线检测（撞树 / 碉堡 / 沟沿都会提前起爆），落地调 `Blast(..., "bomb", ..., "Bomb250kg")`。没做飞机掠过（非必须）。
- **非 FireShell 的起爆**（手榴弹 / 炸弹）没有弹道对象，命中速度写在 `Blast` 的第 10 个参数 `options.incoming`（Vector3，米 / 秒）——
  与 `Combat.StepShells` 对炮弹传的是同一个字段，`Vfx.Explosion` / `GroundImpact` 按它算来向与落角；另有同值的数组 `options.impactVelocity = [vx, vy, vz]`
  和 `impactSource: "shellImpactRange"`（取证用）。手榴弹的名义来向是由南往北 55°，炸弹按 `DropPlan` 的 80°。
- **齐射**：同一弹种 4 发，间隔 0.9 s（仿真秒），落点在目标周围 5 m 内（`Mulberry32` 确定性散布，第一发正中），第一发立刻出，其余排队。

## 面板（左侧，风格取设置页口径）

`Script_ShellImpactLab.mjs`，样式在 `Style_Game.css` 的 `.shellImpactLab`（深色渐变底、象牙字、橄榄细线、金色左边选中条、衬线标题、直角控件）。
可见文字全走 `T("shellImpact.…")`（`Data_Text_ShellImpact.mjs`，契约 10）。

| 分组 | 内容 |
| --- | --- |
| 弹种 | 11 行：名称 · 装药 kg · 落角（或「近距投掷 / 平射」）；金边选中 |
| 落点 | 8 个预设 + 「点地面选点」；下方读出落点局部坐标与地面高度 |
| 发射 | 发射 · 齐射 ×4 · 清空（恢复地形、清在途弹、`vfx.ClearParticles?.()`、`vfx.ClearGroundImpacts?.()`） |
| 时间 | 暂停 / 继续 · 单步（1/60 s）· 0.1× 0.25× 0.5× 1× · 「飞行中用 1×，落地后用所选倍速」开关（默认开） |
| 机位 | 参考机位 · 沟沿低机位 · 俯视 · 回到玩家；下方一行操作提示 |
| 扬尘 | 新扬尘 / 旧扬尘（A/B）、「显示落点标记」开关 |
| 读数 | 上一发（弹种 → 落点 · 落角 · 飞行时间）· 在途 / 排队数 · 已挖弹坑数 · 时间 · 机位 |

按住 Alt 放开鼠标点面板（同断肢测试场）；面板可「收起」。自由相机时隐去准星 / 弹药 / 简报，只剩场景（`body.shellImpactFree`）。

### 时间

`Script_Main.Frame` 一开头 `dt = impactRange.ScaleDt(dt)`：暂停给 1e-5 s（别的系统会除以 dt，不能是 0），单步固定 1/60 s，否则按所选倍速；
「飞行中用 1×」打开时只要有炮弹 / 炸弹在空中或齐射还在排队就用 1×，落地后立刻回到所选倍速（慢放 0.1× 看尘时不必干等 5 秒弹道）。
暂停中相机照样能飞。

### 机位

- 默认进场就是「参考机位」（观察相机，脱离玩家）：局部 (22, 38)、离地 11 m，看向 (14, -24) 附近（默认落点 `TrenchCorner` 在画面中央偏右，避开左侧面板），隔着交通壕与射击壕往前看约 60 m。
- 「沟沿低机位」：(-12,-4.5)、离地 1.7 m。「俯视」：(6,-14)、离地 70 m、几乎垂直向下。
- **观察相机**（自由飞行）：WASD 平移、Q/E 上下、Shift ×4 加速、鼠标转向（读玩家 yaw 的增量，pitch 自己累积并放宽到几乎垂直）；
  玩家留在出生点、输入被接管（`Script_Main` 与白盒编辑器同一个口，`CapturesInput()`），第一人称枪藏起来，阴影框跟着相机走。
- 「回到玩家」：相机回到玩家头上，枪放回来。

### 选点

选点模式（面板按钮或 `Debug.ShellImpact.Pick(true)`）下，**按住 Alt 点画布**：`PickGround(clientX, clientY)` 从相机穿过鼠标位置打一条射线，
`battlefield.Raycast(..., { terrain: true })` 取交点，`SetTarget({x, z})`，落点标记（金色圆环 + 竖线 + 十字，外圈半径 = 所选弹种杀伤半径，只是参照）移过去。
标记每秒按此刻地面（弹坑之后会变）重摆；可在面板或 `ShowMarker(false)` 关掉，出图时用。

### 清空

`Clear()`：`combat.ClearProjectiles()`（在途炮弹）、移除在途炸弹、清齐射队列、`deformation.Reset()`（弹坑）、`vfx.ClearParticles?.()`
（没有就清各粒子池）、`vfx.ClearGroundImpacts?.()`，坑里的人抬回恢复的地面。**枯树被炸断后不恢复**（`BreakableTrees` 没有复位口），要恢复请刷新页面。

## 通用开关 `phase.groundImpactDust`

`Script_Main` 进关时（`EnterLevel`，沙盒分支之前）`vfx?.SetGroundImpactDust?.(!!phase.groundImpactDust)`、
`vfx?.SetGroundSampler?.(phase.groundImpactDust ? (x, z) => battlefield.GroundHeight(x, z) : null)`；离开本关 / 重建关卡时（`BuildField` 一开头）
先 `SetGroundImpactDust?.(false)`、`SetGroundSampler?.(null)`。全是可选调用，Vfx 还没实现时不报错；别的关以后在自己的 phase 上写
`groundImpactDust: true` 就能开。面板的「新 / 旧扬尘」A/B 调 `vfx.SetGroundImpactDust?.(bool)`。

## Agent 接口 `window.Tengxian.Debug.ShellImpact`

`window.Taierzhuang` 与 `window.Tengxian` 是同一个对象。目标参数可以是落点 id（`"TrenchStraight"`）、`{ x, z }`（世界坐标）或省略（用当前落点）。

| 方法 | 说明 |
| --- | --- |
| `Fire(munitionId, target?, { quiet? })` | 发一发；返回记录 `{ id, munition, explosiveId, delivery, target, from, flightS, angleDeg, impact, impactedAt, fillingKg, shellId }`（命中后 `impact` 补上） |
| `Barrage(munitionId, target?, { count?, intervalS?, spreadM? })` | 齐射；返回 `{ count, first, queued }` |
| `Clear()` | 同面板「清空」 |
| `SetTimeScale(s)` / `Pause(on?)` / `Step(n?)` / `SetFlightFast(on?)` | 时间控制（`Step` 会同时暂停） |
| `Camera(presetId)` | `"reference"` / `"trenchLow"` / `"overhead"` / `"player"` |
| `SetCameraPose({ position, lookAt })` 或 `{ position, yaw, pitch }` | 自由相机直接摆位（世界坐标，弧度） |
| `Targets()` / `Munitions()` | 落点（世界坐标 + 当前地面高度）/ 弹种表 |
| `SetTarget(idOrXZ)` / `SetMunition(id)` | 选落点 / 选弹种 |
| `Pick(on?)` / `PickGround(clientX, clientY)` | 选点模式 / 屏幕点 → 世界地面交点 |
| `SetDust(on?)` | 新 / 旧扬尘 A/B |
| `ShowMarker(on?)` / `ShowPanel(on?)` | 落点标记 / 整个面板（出图用） |
| `State()` | 当前状态：弹种、落点、时间、相机、在途炮弹 / 炸弹、`last` / `records`、`terrain`（`deformation.State()`，含 `impacts` / `lastImpact`） |

无头出图示例（`?impacts=1&shot=1&manual=1`）：

```js
const api = window.Tengxian.Debug.ShellImpact;
api.ShowPanel(false); api.Camera("reference");
api.Fire("Shell105", "TrenchCorner");
while (api.State().shells.length) Tengxian.StepFrames(1, 0.05, false);   // 快进到命中
Tengxian.StepFrames(6, 1 / 30);                                           // 命中后再走几帧出图
```

## 验收

- `node Taierzhuang1938/Script_ShellImpactRangeTest.mjs`（纯 Node）：弹种装药 / explosiveId、落角公式、壕沟网络与三岔口、落点、布景净空、布局、
  第一关地形钩子不生效、文本表闸门。
- `node Taierzhuang1938/Script_ShellImpactRangeBrowserTest.mjs`（浏览器，不碰真指针锁）：土色分层 PBR 地形 + 壕沟 + 布景 + 面板；
  11 个弹种每个真发一发、`Combat.Blast` 的 explosiveId / kind 对、挖出对应弹种的坑、量出的落角；装药越大坑越深；齐射；暂停 / 单步 / 0.25× / 飞行中 1×；
  参考 / 低 / 俯视机位与自由飞行（玩家不动）；Alt 点地面选点；清空恢复地面；A/B 与可选 vfx 钩子；控制台无报错。截图在 `tmp/ShellImpactRange/`。
- 已有回归一并跑：`Script_ModuleGraphTest.mjs`、`Script_TextTest.mjs`、`Script_ExplosionRulesTest.mjs`、`Script_FirstLevelWhiteboxTerrainTest.mjs`、`Script_MenuTest.mjs`（七项沙盒）。

## 已知限制

- 平射落在沟里会被沟沿截住（见上）；树被炸断后不恢复；没有飞机掠过。
- 弹种面板显示的「落角」是名义值：命中沟沿 / 树 / 碉堡提前起爆时实际落点会变。
- 105 / 150 毫米与航弹的半径 / 伤害是测试场名义值，不是史料定值；装药的估计依据见 `Data_Explosives.mjs` 头注。
