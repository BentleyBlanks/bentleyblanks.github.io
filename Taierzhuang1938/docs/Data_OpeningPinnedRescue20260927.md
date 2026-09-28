# 01–02 压在塌木下原地审问、反冲锋白刃战（2026-09-27 改稿）

用户原话：「开局的过场动画，那个川兵应该离主角再近一点，保持第一人称，不在切换视角；其次是那个割喉的日军动作还需要优化现在看不出来是割喉，然后是说话的台词应该是一割马上就嚣张的说了那些台词；然后边说边走，看到了被木头压住的主角（主角变成压在房梁下，半个身子在外面），日军也不再拖出主角，直接在原地审问，把从枪托改成扇巴掌（被扇的单边的屏幕有眩晕效果）其他暂时不变；在主角被审问了几句之后，附近忽然枪炮声四起，杀喊声四起（全都是四川话）然后班长等一大帮人提着大刀冲上去和现存日军部队白刃战；这里镜头、日军友军、变化所需的动作请你自己 blendermcp 完成并完善，之前做的过场里的动作可以暂时废弃」；补充：「主角从废墟中出来也就自然的改成是班长拖出来的了」。

本文覆盖 [开场导演口径](Data_OpeningStoryboards20260923.md) 里 Slash 以后的 01 与整个 02（BunkerRescue），以及 [过场修订](Data_OpeningCinematic20260926.md) 的独立机位、[翻越与倒拖](Data_OpeningVaultHaul20260927.md)、[02 审问穿模修正](Data_OpeningCinematic20260926.md) 的救援圈。Banter → Interrogation 的流程、配音、03 以后不变。

## 1. phase 表

| 段 | phase |
|---|---|
| Trapped（01） | Banter → Orders → Incoming → Blast → Black → Wake → FrontPass → CaptiveDragged → CaptiveWall → Interrogation → Slash → Taunt → Found |
| BunkerRescue（02） | Hold → Ask → Charge → Melee → Lift → Check → KickRifle → Released |

旧的 Wipe、Reach、Drag、Snag、KickBeam、DragOut、Butt、Boots、KickShunzi、Glimpse、Collar、Chop、Parry、Flee、DragCover、LongShot 下线。事实（`captivesKilled`、`doorSearchStarted`、`rescueCallHeard`、`vanguardMeleeResolved`、`junctionShot`、`luoRescueComplete`、`playerDraggedFromWreck`）名字与门槛不变，只是记在新的拍上；`playerButtStruck` 换成 `playerSlapped`。

## 2. 顺子的位置（全程第一人称）

- 近爆后的黑场里塌顶木（Set `roofTimberDown`）就落定，横在洞口正中、压着他的胯 `shunzi.pinnedHips` (0.95,−125.3)；腿在洞里，胸口和头在洞外的沟底上，眼位 `shunzi.witnessEye` (1.85,−125.25)、离地 0.28 m，朝东看前沟。以前眼在洞里 (0.35,−125.15)，离受审川军 3.8 m；现在 2.3 m。
- 不再有独立机位：`interrogation.cinematic` 删除，CaptiveDragged → Interrogation 都是趴着的第一人称（`interrogation.witnessShot`：yaw −88°、仰 12°）。玩家在 Wake…Ask 可小幅转头。
- 塌顶木两头垫着齐胯高的土堆；门楣断头、断板随木料改了位置（Set 数据里注释）。还权坐位的靠背（`rubbleMoundBack`）要等他被拖出来坐上去（Check 起）才出现，否则会从他胸口底下冒出来（`Script_OpeningSet.RescueShown`）。

## 3. 割喉、嘲弄、发现

- Slash：审问时日兵甲已揪着衣领站在川军左前（`interrogation.ijaAHold`），开割前一步挪到川军**左肩**后面（manifest 站位 slashGrab，离眼远的一侧），揪住后脑头发往后扯、把脸往顺子这边拧 45–55°，喉咙朝着镜头；拔刺刀，刀从喉咙前面整条横拉过去（割中 0.24 s，刀身 0.08–0.30 s 走 ≥0.25 m），血朝顺子这一侧喷（动脉喷射 + 割中一团血雾）。镜头跟着川军的头（`interrogation.slashShot`，最多偏离主视线 18°），并从揪发起把视野收窄到 0.7（`interrogation.fixate`：眼睛盯住那一刀，仍是第一人称、不切镜），他走开后 1.2 s 放回。动作见第 6 节。
- 割中那一帧就起 `CaptiveTaunt`，第一句（「怎么了，支那混蛋！」，录音开头带狂笑）在割中后 0.1 s 开口（导演表 `Data_FirstLevelDialogueDirection` 的 offsetS 0.7 → 0.1，录音不动）；血从脖子朝顺子这一侧喷。
- Taunt：日兵甲揪着头发嘲弄 `ija.tauntHoldS` 1.6 s，松手（川军顺板墙滑下死去），然后提着带血的刺刀沿沟底慢慢往洞口晃过去（`ija.tauntWalk`，0.75 m/s），边走边回头骂（上身 `IjaTauntWalk`）；日兵乙「蠢货。」、远处「往前！快！」照旧。他的「还藏着一个」要等这几句说完才开口（不叠在一起）。
- Found：走到 `ija.found` (2.98,−125.2) 看见脚下木头压着的顺子，停住、低头，「还藏着一个，支那混蛋。」（ShunziFound），收刀（`IjaFoundLook`），上前蹲到他头前 `ija.crouch` (2.45,−125.22)。记 `doorSearchStarted`（流程进 02）。

## 4. 原地审问与耳光（Hold / Ask）

- 日兵甲蹲在头前，左手揪住头发把头提起来（`IjaCrouchHairHold`；眼位抬 `rescue.holdShot.liftM` 0.16 m、仰看他的脸），顺子右手去抓他的前臂（`gripForearm`）。
- 「这个也问！」；翻译从 SB03 的位置小跑过来蹲在右前 `rescue.interpreter`（离眼 1.3 m），日兵乙站到 `rescue.ijaBGuard` 朝东望着前沟。
- 耳光（`rescue.slap`）：翻译「醒醒！……」一开口正手一记（打左脸，视线被甩向右），日兵乙「快点！」后反手一记（打右脸，甩向左）；「说话！」时抬手要打第三下。每一记：头甩开 24°、横滚 9°、下沉 5 cm，1.1 s 回正，眨一下眼；被打那半边屏幕发晕——模糊、重影朝那边拖、发暗泛血红，2.4 s 退掉（`Data_OpeningLens` 的 `held.slap` → `Script_OpeningLens` 的 `slap` → `Script_PostComposite` 的 `uSideDaze`/`SideDaze`，量为 0 时与原来逐像素相同）；另叠一层短促的震荡峰值（`perception.kick`）、听觉闷 0.35、嘴角血（HUD 血层 0.55）。音效是 Sonniss 的真实耳光录音（`Data_SfxSources` FaceSlap → `AudioSfx_Slap_01`，`Script_Audio` 有同名合成退路）。

## 5. 反冲锋、白刃战、拖出来（Charge / Melee / Lift）

- Charge 从第三下耳光抬手后 `chargeAfterRaiseS` 开始：冲锋号、`noise.rifles` 一串汉阳造枪声（从南南西沟与弹坑台阶朝东打，带曳光）、三发场外近弹（只有冲击与声音，不伤人）、九声四川话喊杀（`noise.yells`：公用的「杀！大刀砍拢去！」「弟兄伙，跟到我上！」「莫退！」与罗班长、何有田、刘文才本人的「冲！给老子冲！」，从各人所在的位置发声）。
- 日兵甲松手（头落回泥里）惊起回身（`IjaStartleTurn`）；翻译「有敌人！」转身逃（`InterpreterFlee` 以 1.4 倍速，免得挡住冲下台阶的罗班长），贴沟北侧往东跑、进纵深支沟后收走。
- 罗班长、何有田、刘文才和五名提大刀的弟兄（`rescue.extras`，NRA02 / NRA05 两种身体）原先藏在弃土后面的南南西沟里，按 `delayS` 错开冲下弹坑台阶（`rescue.chargeRoute`，4.2 m/s；罗班长打头，何有田隔 0.2 s 跟上、相距约 1.4 m——反过来两人会跑成叠在一起；起步按 `runPace` 猛冲，去劈人的三个按 `strikePace` 不减速冲到位，不用导演走路默认的 4 m/s² 起停）：
  - 日兵甲惊起（`IjaStartleTurn`）后爬起来朝台阶跑两步迎上去（`rescue.parryMeet` (3.15,−124.55)），何有田在那里格开枪口一刀砍倒他（`chopParry` 那一对，锚点朝台阶转 `parryTurnDeg` −50°）：两人离眼 1.5 m、何有田在他右边进画；尸体也倒在那里，不压在顺子脸前、拖出的路上或还权坐位上（蹲位原地砍的话三处都压着）；
  - 罗班长从日兵乙右后一刀劈倒（`chopRear`，`IjaChoppedFallWall`）；
  - 弟兄 ChargeA 把守在沟里的纵深日兵（`DepthIjaB`，停在 `rescue.depthPost`）劈倒；其余冲到沟里各自的位置朝东；还权后出了画面就收走（最迟 `extrasRetireS`）。
  - 刘文才下到台阶 `rescue.liuShot` 打岔口 J 的日兵丁（原 LongShotTick 规则与强制兜底不变），打完下沟到 `rescue.liuCover`。
- Melee：两刀都落下、再看 `meleeHoldS` 后进 Lift；超时 `meleeS` 强制致死。
- Lift：何有田到木头边 `rescue.lift.heLift` 把塌顶木抬起（`HeLiftTimber` + Set `LiftRoofTimber`），罗班长蹲到头前揪住衣领把他倒拖出来：罗的根由 `LuoDragToCover` 的 `player` 衣领轨迹第 0 帧对到顺子衣领上反解（`LuoGrabRoot`），眼位沿这条轨迹走到 `haulStopS` 1.4 s（拖出约 0.85 m），镜头朝下看泥地和罗往后退的两只脚（抬头看他会被他俯着的上身整个糊住镜头），然后撑起来坐回还权坐位 `shunzi.cover`；木头在他出来 0.4 s 后落回去。然后 Check「还能打不？」→ KickRifle → 还权，与以前相同（枪现在躺在他左前方泥里 `rescue.rifleMouth`，罗班长从西北把它踢到他右前方 `rifleKicked`）。

## 6. 动作（Blender）

新动作与重做的割喉链在 `_import/Script_OpeningStoryboardClips.py`，只烘 IJA02 / NRA02（manifest `20260928OpeningStoryboardsV14PinnedRescue`；烘焙 spec 新增 `sink`：贴近时骨盆下沉量，割喉链为 0，免得日兵甲被拽进川军身体里；站位新增 `yM`：两人脚下的高差）：`IjaTauntWalk`、`IjaFoundLook`、`IjaCrouchHairHold`、`IjaSlapForehand`、`IjaSlapBackhand`、`IjaSlapRaise`、`HeLiftTimber`，割喉链 `IjaHairGrabPull` / `IjaDrawBayonet` / `IjaThroatSlash` 与 `CaptiveHeadPulledBack` / `CaptiveThroatCut` / `CaptiveClutchThroat` / `CaptiveWallSlideTwitch` 按新站位重做。导演在某条动作还没烘进 manifest 时用最接近的旧动作顶替（`OpeningClipMeta(name)` 为空）。`IjaWipeSheathBayonet` 停用（`retired`）；翻越/倒拖三条仍在库里但不再播放。已知小账：何有田的抬木保持循环只有 1.0–1.5 s、松手最多比木头落下晚 0.5 s；耳光实际打中在 0.333 s（清单写 0.34）；`IjaTauntWalk` 是从右肩回头（川军在他右后方）。割喉后的揪发保持里日兵甲胯部只前探 0.5 cm（前探 3 cm 时胸口顶到川军的头，2.9–3.2 cm 穿插）。可编辑工程在 OneDrive `AI/Models/Blender/Taierzhuang1938/OpeningPinnedRescue_20260927`。

## 7. 验收

- 纯 node：`Script_OpeningStoryboardsTest`、`Script_OpeningLensTest`、`Script_OpeningSetTest`、`Script_OpeningFirstPersonTest`、`Script_FirstLevelMissionTest`。
- 浏览器：`Script_OpeningStoryboardShots.mjs`（新机位 SB03…SB06 的判据）、`Script_FirstLevelMissionBrowserTest.mjs --campaign --stage-to=3`、`Script_OpeningHandbackBrowserTest.mjs`、`Script_OpeningClipsBrowserTest.mjs --clip=…`、`Script_PostTest.mjs`（`uSideDaze` 为 0 时逐像素不变）。
