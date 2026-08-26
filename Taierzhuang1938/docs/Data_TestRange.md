# 玩法测试靶场（?range=1）—— 现状口径

人机共同测试用的独立沙盒。真人在里面试枪感，agent 从 `Debug.Range` 取证断言，
两边用的是**同一片场景、同一批木桩兵** —— 「人觉得不对」与「测试红了」指向同一处。

## 入口

真人的正门是**选章列表最下面那一条**（七关之后，隔一条分隔线，标「沙盒」）：
简报照读 `RANGE_PHASE`（三个工位、本关机制、携行），但**不画那张滕县全图** ——
靶场在 (1400, 1400)，落在全图那个写死的框外面。点「进入」是**整页重载**到
`?range=1`：靶场是整表替换（见下一节），当场换不过去。

进去之后 Esc 是暂停，那一层换成沙盒专用的四项：继续 / 设置 / 调试选项 /
**退出靶场**（重载摘掉 `range`，回到主菜单）。不给「选章」与「主菜单」——
在靶场里那两颗按钮当场换不了关，摆着只会骗人。

记地址的两条老路照旧：

```
http://127.0.0.1:8171/Taierzhuang1938/?range=1            # 真人：进页面点「进 城」拿指针锁
http://127.0.0.1:8171/Taierzhuang1938/?shot=1&range=1     # agent：不进指针锁，StepFrames 驱动
```

（先 `node Taierzhuang1938/Script_DevServer.mjs`，或让测试脚本自带 ServeRoot。）
其余 query（`quality` / `scale` / `audio=0`）照常叠加。回归入口：

```powershell
node Taierzhuang1938/Script_RangeTest.mjs                  # 或 Script_TestRunner --only=RangeTest
node Taierzhuang1938/Script_RangeTest.mjs --shot           # 附带按工位各拍一张到 _shots/range/（人工审场地）
```

## 架构：整表替换，不进正片

- 靶场**不在 `Data_Battle.PHASES` 里**（选章列表上那一条也不进 —— 菜单把它单摆在
  `MainMenu.sandbox` 里，进度、「继续」、「下一关」与默认选中关一概只按七关数）。
  `Script_Main` 在 `?range=1` 时把关卡表整表换成
  `[Data_Range.RANGE_PHASE]`（`PHASE_TABLE`），所有 `PHASE_TABLE[state.phaseIndex]`
  的消费者一个都不用学「这一关不算数」；七关口径（BootTest / 菜单 / 进度 / 通关冒烟）
  一概不知道靶场存在。
- 场景是独立世界类 `Script_RangeField.mjs`（与滕县城 / 界河**同一套查询接口**的第三个实现，
  契约清单见 `Script_JieheField.mjs` 文件头）。平地 y=0，工事走 BuildSink 合批。
- 场地放在 (1400, 1400) 一带：远离滕县城与界河的世界坐标，否则
  `AddExternalProps.TownDressingFor(bounds)` 会按坐标把城内家什捞进靶场。
- 进场即 `state.pinned = true`（不换关、不结算）；`RANGE_PHASE.sandbox: true` 另管两件事：
  不挂烟柱（SeedSmokeColumns）、阵亡永远回出生工位（RespawnPlayer）。
- 携行是 `RANGE_PHASE.loadoutOverride`：汉阳造（可上刺刀）+ 盒子炮 + 大刀 + 木柄手榴弹。
  数字以 `Data_Range.mjs` 为准，本文不抄数。

## 场地与木桩兵

三个工位（也是 HUD 路标，id 见 `Data_Range.RANGE_STATIONS`）：

| 工位 | id | 验什么 |
| --- | --- | --- |
| 步枪位 | `RangeRifle` | 开枪、开镜放大、弹药账；四个距离靶（R10/R25/R50/R100，沙袋胸墙后朝北打） |
| 投弹位 | `RangeGrenade` | 手榴弹（G16/G22/G28 铺成纵深带，弹落带内必罩住至少一个） |
| 白刃位 | `RangeMelee` | 大刀（3 号槽）与刺刀（X 装卸、V 蓄力）；M1/M2/M3 三个近身靶 |

木桩兵是**整具带骨骼的 ija Actor**：命中箱、掉血、倒地、准心识别（TargetInfo）全走
正式链路，唯一的区别是 `soldier.dummy = true` 让 `AiDirector.Update` 跳过 Think ——
不索敌、不开火、不自行走位（`TryFire` 要 target，Think 不跑就永远没有）。
倒下后过 `RANGE_RESPAWN_S` 秒由补兵节拍原位复立。

## Agent 取证口：`window.Taierzhuang.Debug.Range`

只在 `?range=1` 下存在。**输入不在这里另开门** —— 开枪/开镜/上刺刀/投弹照旧走
`Debug.Fire / Key / Mouse / Throw` 的真事件链（测键位与玩法，不是测函数）。

| 口 | 干什么 |
| --- | --- |
| `State()` | 一眼总览：工位表、每个靶的 alive/health/距离、killed/respawned 计数、玩家武器弹药与 ads/fov。验收的唯一入口。 |
| `Targets()` | 只要靶况那一段。 |
| `GoTo(stationId)` | 瞬移到工位并面朝靶道（用 `player.Spawn`，顺带清 pitch/俯仰）。 |
| `AimAt(targetId, offsetY?)` | 把视线摆到靶上。默认瞄 **躯干判定中心**（+0.95，与 MarchBullet 同一个数）。 |
| `Reset()` | 靶全部立即重立、玩家满血满弹、计数清零。用它做用例隔离。 |

### 两条弹道账（写测试前必读）

1. **首发继承本发的枪口上跳**：`TryFire` 先 `ApplyRecoil` 再采样弹道方向
   （「顶上去 100%」是枪感设计，不是 bug）。ADS 下约 0.9°，25 m 处 ≈ 0.4 m ——
   远靶验命中要么瞄低、要么用近靶（RangeTest 用 R10）。
2. **命中几何只有躯干圆柱**（半径 0.45，中心 +0.95）；爆头是 TryFire 里按概率抽的，
   不是几何。别瞄头，那条线从圆柱上方擦过去就是脱靶。

### 典型验收片段

```js
const T = window.Taierzhuang, R = T.Debug.Range;
R.GoTo("RangeRifle");
T.Debug.Mouse(2, true); T.StepFrames(55);      // 开镜到位才过 TryFire 的闸
R.AimAt("R10"); T.StepFrames(2);
T.Debug.Fire(); T.StepFrames(5);
T.Debug.LastShot().hitKind === "soldier";      // 命中取证
R.State().targets.find(t => t.id === "R10");   // 掉血取证
```

时序坑（RangeTest 里全踩过）：开镜要 ≥ 55 帧（`player.ads ≥ 0.9` 才能开枪）；
栓动循环 ≈ 110 帧内 `viewmodel.IsBusy`，期间 X 上刺刀会被吃掉；
白刃的靶要在**松手前一刻**才挪到脸前（早了会被它自己的刚体拽回去，同 BayonetTest）。

## 维护

- 加靶/加工位：改 `Data_Range.mjs`（纯数据），场景摆设在 `Script_RangeField.BuildStructures`。
- 加取证：往 `Debug.Range` 里加口（Script_Main 靶场那一节），并在 `Script_RangeTest.mjs` 里立断言。
- RangeTest 挂在 TestRunner 的 combat 域（Tier 1）；`changedDomainRules` 里 `Range` 归 combat。
