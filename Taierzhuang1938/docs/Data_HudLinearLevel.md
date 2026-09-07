# 线性关卡 HUD：对标 COD《战争世界》单人战役

2026-09-07 定的口径。线性关卡（第一关《往南的路》起）的 HUD 以 COD: World at War（2008，IW 3.0 引擎，与 COD4 同一套 HUD 约定）**单人战役**为对标，不是它的多人模式。原则一句话：**屏幕上默认只有准心、路标和真正紧急的反馈；其余信息只在你跟它打交道的那几秒里出现，然后淡掉。**

代码入口：`Script_Hud.mjs`（DOM）、`Style_Game.css`（画法）、`Data_Tuning_Hud.mjs`（时长）。回归口：`Script_HudPromptBrowserTest.mjs`（右下弹药块的亮 / 隐 / 钉住、左上目标通知的出现与淡出）、`Script_StanceTest.mjs`（HUD 上没有姿态）。

## 1. COD WaW 的 HUD 是怎么运作的

WaW 的 HUD 元素与 COD4 同源，引擎里管「闲置淡出」的是 `hud_fade_*` 这一族 dvar（单位秒，0 = 永不淡；`hud_fadeout_speed` 管淡出快慢）。WaW 出厂的 archive 值是 `hud_fade_ammodisplay 0`、`hud_fade_offhand 0`、`hud_fade_compass 0`、`hud_fade_stance 1.7`、`hud_fade_sprint 1.7`、`hud_fade_healthbar 2`、`hud_fadeout_speed 0.1`（多人模式要求常驻，所以弹药 / 投掷物那几档归零）；单人战役由关卡脚本另设，实机表现是：

| 元素 | 位置 | 何时出现 | 何时消失 |
| --- | --- | --- | --- |
| 目标文字（"New Objective" + 一句动作） | 左上 | 目标推进 / 更新时，配一声提示音 | 停留数秒后淡出；平时不常驻 |
| 目标路标（星形 + 距离） | 世界空间投影 | 当前目标激活期间 | 目标完成即撤 |
| 弹药（大号弹匣 / 小号备弹） | 右下 | 开枪、装填、换枪、拾枪 | 几秒不碰就淡出；空膛 / 低弹时变红并提示 |
| 投掷物（手雷图标 × N、特殊投掷物图标 × N） | 右下，弹药左侧同一行 | 与弹药同一生命周期 | 同上 |
| 姿态人形（站 / 蹲 / 趴） | 右下最左 | 切换姿态时 | 1.7 s 后淡出 |
| 罗盘 | 左下 | 常驻（单人也常驻） | — |
| 血量 | 无数字 | 受伤：红色血迹 + 心跳 | 回血后消退 |
| 来弹方向 | 准心外圈红弧 | 中弹瞬间 | 约 2 s 淡出 |
| 近弹指示 | 手雷图标 + 方向箭头 | 活手雷进入危险半径 | 爆炸或离开 |
| 交互提示（"Hold F to …"） | 屏幕中下 | 看向可交互物 | 移开视线即撤 |

一手资料：WaW dvar 全表（`hud_fade_*` 一族）见 [Pastebin: Full Call Of Duty World At War Dvar List](https://pastebin.com/D9FASgB4)；元素与位置的综述见 [Call of Duty Wiki: Heads-up display](https://callofduty.fandom.com/wiki/Heads-up_display) 与 [StrategyWiki: Call of Duty 4 HUD](https://strategywiki.org/wiki/Call_of_Duty_4:_Modern_Warfare/HUD)。

## 2. 我们照做了什么、没照做什么

| 元素 | 台儿庄的做法 | 与 WaW 的差别 |
| --- | --- | --- |
| 目标文字 | `.hudObjective`：左上，「一句动作」+「目标已更新」两行同级、硬黑描边无底板；只在目标文本变化时播 `hudObjectiveChanged`（6.4 s）再整块淡出；玩家取得控制权时重播一次 | 照做。**任务提示只在阶段推进或局部进展改了目标句时出现**，平时不常驻 |
| 目标路标 | `.hudMarker`：只画「下一处去向」一个 ▲ + 名字 + 距离；`phase.hud.objectiveMarkers=false` 的关（第一关跟随段）整段不画 | 照做（WaW 是星形，我们是 ▲） |
| 弹药 + 投掷物 | `.hudCombat`：右下同一行 —— 投掷物图标 + 数在左、当前弹大数在右、备弹小数跟在斜线后，上面一行小字武器名；无底板、硬黑描边。**只在交互后亮 `IDLE_FADE.combatS`（3 s）**，之后 0.6 s 淡出；空膛 / 低弹钉住不淡 | 照做。时长比 WaW 出厂的 1.7 s 放宽到 3 s：中文玩家还要读一行武器名 |
| 姿态 | **不显示**。没有人形、没有按钮；镜头高度、视图模型与移速自己说话 | WaW 有一个会淡出的人形；用户要求去掉 |
| 伤情 / 屏息 / 命令行 | `.hudState`：右下弹药块上方；只在内容变化后亮 `IDLE_FADE.stateS`（3 s） | WaW 没有这一行；保留是因为「流血要包扎」是本作机制，但按同一条闲置规则隐掉 |
| 罗盘 / 地图 | 无罗盘；小地图默认收起，M 键开合 | **没照做** —— 罗盘不在本次范围 |
| 血量 | 受伤暗角三层 + 濒死搏动（`VIGNETTE`） | 照做 |
| 来弹方向 | `.hudHitDir` 准心外圈红弧 | 照做 |
| 近弹指示 | `.hudGrenadeWarning`：钉在弹上 / 贴边指向 | 照做 |
| 交互提示 | `.hudActions`：准心左下的按键框 + 图标（第一关带文字） | 照做，位置照 Easy Red 2 |
| 命中记号 | `.hudHitmark` 四道短撇 | WaW 单人没有；保留（见 docs/Data_DesignFirstPass.md §385 的账） |
| 帧率读数 | `.hudFps` 右上小字 | 调试读数，不算 HUD |

## 3. 闲置自隐的规则（Script_Hud）

- 两只倒数：`idle.combat`（弹药块）与 `idle.state`（伤情行）。**只有变化才拨满**：每帧 `SetState` 喂进来的是同一组数时什么也不做，于是「几秒不交互就隐掉」自然成立。
- 什么算交互：弹药 / 备弹 / 投掷物数 / 攥弹 / 武器名任一变化（`SetState` / `SetWeaponName` 自己拨）；扣着扳机或开镜但数字没变（装配层在 `Script_Main` 的 HUD 段按 `input.fire || input.ads` 调 `hud.Touch("combat")`，架着机枪时不调）。
- 开局第一次喂数不算交互：进关那一刻不该先亮一块弹药。开场简报 / 章节卡期间（`#hud.staging`）弹药块与伤情行一并硬关。
- 钉住：`AmmoReadout` 判为空膛或低弹时 `combatPinned=true`，倒数归零也不收 —— 那个红数字就是警告本身。赤手不钉。
- 画法：`.awake` 淡入 0.12 s、淡出 0.6 s（CSS transition）；`.hudState` 要 `.on.awake` 同时在才亮。
- 取证口：`hud.IdleState()` 返回 `{ combatAwake, combatPinned, combatLeftS, stateAwake, stateLeftS }`，测试读它，不解析 class。

## 4. 没做、以后再说

- 罗盘（WaW 左下常驻）：本作用「只画下一处去向」的路标承担导航，罗盘要不要上另议。
- 目标更新的提示音：WaW 每次 "New Objective" 配一声；我们目前只有画面。
- 拾枪时 WaW 在屏幕中下打一次武器名 + 弹药；我们换枪只在右下亮一次弹药块。
