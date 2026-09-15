# 第一关 · 屋内伏击（内部步骤 `Melee` / 公开阶段 9）

入口 `?whitebox=p012`。这一步夹在公开阶段 8「村口截击」和阶段 10「夺下院子」之间，
是第一关唯一一次被人贴身按在地上的戏。本文件是这一拍的唯一口径：需求原文、拍表、事实、
数值出处、动作与配音依赖、验收命令与结果。

## 1. 需求原文

### 1.1 2026-09-15（这一拍的人物与结果）

罗班长刚喊完：

> 「顺子！穿右手那间屋！把窗口的机枪干掉，再把院门打开！担架从里头过！幺娃跟他！」

顺子（玩家）进那间屋（`ConnectedHouse`，中心 (58,8)，墙心 x 52/64、z 0.5/15.5，
北门开在 z=0.5、x 56.1–59.9），**老周的担架队就跟在他身后**（老周躺担架、两个抬担架的、幺娃）。
屋里藏着几个日军，一起动手：玩家被放倒并与领头那个较劲；背景里老周和两个抬担架的被另外
几个捅穿肚子；玩家挣脱；罗班长／何有田／刘文财几秒后从灶屋冲进来一起清屋。

已定、不再讨论的设计：

- **老周活下来**，带着肚子上的伤继续往南（他要撑到公开阶段 17「老周牺牲」才死）；
  **两个抬担架的都死**，由担架队既有的替补机制补上；**幺娃被撞倒但活着**（`scriptEssential`）。
- **复用既有内部步骤 `Melee`**。不新增步骤：`MISSION_STAGES` 仍是 27 条、公开阶段仍是 18 个、
  `Melee` 的通过条件仍然只有 `["meleeResolved"]`（＝四个人全死）。旧的 `MeleeTutor` 删除。
- 惨叫不走 TTS，用既有的白刃／创伤音效；只有台词是 Seed Audio。

### 1.2 2026-09-16（演出重做：对标《使命召唤：二战》「D-Day」地堡那一段）

用户给了五张参考图，要的是那一段的**读法**，不是那一段的资产。逐张对应到我们这一拍：

| 参考图 | 那边是什么 | 我们这一拍 |
| --- | --- | --- |
| ① 被砸倒 | 德军从侧面一枪托抡在脸上，第一人称一记硬闪 + 震屏，镜头往地板上掉 | `AmbushLead` 从壁龛里出来抡 `RifleButtStrike`，共用 `ScriptedKnockDown` 把玩家真的放进 `down`，第一人称镜头落到地板上 |
| ② 晕厥 | 眼前一黑，再睁开是糊的、闷的，躺着看天花板 | 眼皮在 0.45 s 里合死、按住 0.7 s 再睁开，恍惚（模糊 + 去色 + 暗角）与耳鸣（低通 520 Hz）铺开，镜头躺在地上仰头看**屋梁**（所以给这间屋补了檩条与望板，见 §3.2） |
| ③ 糊着看见 | 模糊里看见同伴被刺刀捅穿 | 视线被拉到北门口的担架上：前抬者 → 老周（配音那一声）→ 后抬者挨刀，模糊这时候已经退到认得出轮廓 |
| ④ 扑上来 | 那个人骑上来，刺刀压向胸口，屏幕上**只有一个提示环** | `AmbushLead` 转共用白刃层的 `Pressure` 姿势，`Hud.SetCinematicPrompt` 在他握枪的位置画一个 140 px 的环，中间是绑定表里的键面字 |
| ⑤ 推刀 | 两只手抓住枪身，来回较劲 | 共用**地面 QTE**（`BeginScriptedGround`，连按），同一个环变成连按表；赢了再按一次左键反手捅回去 |

三条硬约束（用户定的，别回滚）：

- **整段 HUD 让位，只剩字幕**：准心、弹药、目标条、提示、队友标记、共用僵持进度卡全部隐藏。
- **一次只有一个提示**：一个半透明环 + 一个键面字。没有标题、没有进度条、没有时间轴。
- **共用规则不动**：`MELEE_QTE_RULES.windowS` 4.8 s 的上限、地面 QTE 的连按与结算、
  「QTE 赢了本身不杀人」这一条全部照旧。这一拍的杀招是**赢了之后玩家自己按下去的那一下**
  （编排层的选择，不是共用规则的例外）。

## 2. 拍表（实装）

时间以**伏击触发**为零点。括号里是 `Data_Tuning_FirstLevel.mjs` 的键。

| 时刻 | 发生什么 | 事实 |
| --- | --- | --- |
| −∞ | 南行转场的黑屏里，老周这一副担架被提到队首前一个车距（`ambushLitterLeadM` 3.4） | — |
| 村口→屋门口 | 只推老周这一副：目标＝玩家在同一条路线上的投影减 `ambushLitterFollowGapM`(4)，速度 `ambushLitterLeadMps`(3.2)，上限是屋子北门口 `ambushLitterDoorZ`(1.4)。其余九副原地等 | — |
| 进入 `Melee` | 担架没到门口就再等，最多 `ambushLitterWaitS`(3) 秒，期间提速到 `ambushLitterRushMps`(4.2)，到点照样触发 | — |
| 0.00 | 触发。锁控制（kind `"ambush"`，**不给 spawnGrace**）、视线在 `ambushLookSeconds`(0.35) 内甩到领头那个胸口（`ambushLookHeightM` 1.4）；`Say("RoomAmbush",{urgent:true})`；领头的和后面两个起身（`AmbushRise`），侧翼那个不动 | `ambushTriggered` |
| ≈0.7 | 领头那个扑到接触距离（`ambushBindReachM` 1.15，速度 `ambushLungeMps` 3.4，超过 `ambushLungeMaxS`(1.2) 也照样抡）→ 抡起 `RifleButtStrike`；视线改瞄他的**脸**（`LookAt("face")`，高度兜底 `ambushButtLookHeightM` 1.52），这一段转头按 `ambushButtImpactS` 铺，正好在砸中那一瞬走完 | — |
| ≈1.15 | `ambushButtImpactS`(0.45) 之后**砸中**：伤害 `ambushButtDamage`(20)，kind `"qte"`；共用 `ScriptedKnockDown` 把玩家放进 `down`（按住 `ambushLockMaxS`），第一人称镜头落到地板上；同一瞬 `LookAt("roof")` 把视线往后仰到屋梁上（`ambushDazeLookAheadM` 2.2 / `ambushDazeLookRiseM` 2.3 / `ambushDazeLookS` 1.1）；恍惚曲线从这一瞬起算 | `ambushStabbed` |
| ≈1.2–4.5 | 眼皮 0.45 s 合死、按住 0.7 s、3.3 s 前全睁开（`ambushDazeEyelids`）；模糊／去色／耳鸣按 `ambushDazeIntensity` / `ambushDazeFocus` / `ambushDazeHearing` 铺开 | — |
| 4.60 | 视线从压着自己的那个人拉到北门口的担架（`ambushLookLitterAtS`，高度 `ambushLitterLookHeightM` 0.7） | — |
| 5.40 | `AmbushRearA` `BayonetStabStanding` → **前抬者**倒（`ambushBearerStabAtS`） | — |
| 7.50 | **老周挨刀**。由 Package B 在 `RoomAmbush` 第三句「啊！肚子……狗日的……」上打的事件 `AmbushZhouLine` 触发；`AmbushRearB` 站在担架西侧 `ambushZhouStabStandM`(1.25)、沿长边错开 `ambushZhouStabLateralM`(0.7) 的地方，`BayonetStabDown` 在此前 `ambushClipLeadS`(0.55) 起播。老周血量降到 `ambushZhouHealthAfter`(45)。**担架这时候还举着**（落地见 8.30）。兜底期限 `ambushZhouStabAtS`(7.6) | `zhouStabbed` |
| 8.30 | `AmbushRearA` 第二刀 → **后抬者**倒（`ambushRearBearerStabAtS`）；两头都没人攥着了，担架这时候才落地 | — |
| 8.70 | 幺娃被撞倒，趴 `ambushYaowaDownS`(6) 秒（`ambushYaowaDownAtS`） | — |
| 8.80 | `ambushPounceAtS`：领头那个扑上来压刺刀（共用白刃层 `HoldScriptedGround`，摆 `Pressure`）；视线拉回他身上；第一人称那把枪连同两只手按 `ambushGrappleHandM` 整体挪开（让出他的脸与刺刀，见 §4.3）；**提示环出现**：`press` 模式，键面字读 `ActionKeyGlyph("interact")`＝F，钉在他握枪的那一点上，弧在 `ambushGrabWindowS`(1.2) 里漏完 | — |
| 按下 F | 抓住枪：共用地面 QTE（`BeginScriptedGround`，窗口 `min(MELEE_QTE_RULES.windowS 4.8, ambushQteWindowS 3.6)`、力度 `ambushQteStrength` 0.75）。同一个环换成 `mash`：环随「我方控制」涨，每次有效按键脉冲一下 | `ambushGrabbed` |
| 推赢 | 环换成 `finisher`（键面字读 `ActionKeyGlyph("fire")`＝左键），窗口 `ambushFinisherWindowS`(2.4)。没按也会在窗口末尾自动补上 —— 共用 QTE 已经判赢，这一下只是把胜负演出来 | — |
| 按下左键 | 反捅：`PressureStabbed` 落在 `AmbushLead` 上，伤害 `ambushFinisherDamage`(140) 走共用伤害链（出血、断肢、尸体、白刃音效照常），他**真的死** | `ambushFinisher` |
| +`ambushFinisherHoldS`(1.1) | 反捅演完 → `ScriptedRise` 起身、还控制权、清恍惚（`ambushDazeFadeS` 1.2 s 收干净）；四个人按 §3.3 的延迟排队转成普通敌兵；`Say("RoomAmbushBreak")`。实拍整段锁住约 14 秒，兜底上限 `ambushLockMaxS`(20.5) | `ambushBroken` |
| ≈+1.5 | `ambushBroken + ambushSquadDelayS`(1.5)：罗班长、何有田、刘文财沿 `ambushSquadRoute` 穿灶屋进屋（`ambushSquadSpeedMps` 3.6 档） | — |
| 第一个人进屋 | 判定用 `MISSION_PLACEMENT.roomInterior` | `ambushSquadArrived` |
| 剩下三个全死 | `Say("RoomAmbushCleared")`；担架队请两个替补来抬；幺娃起身 | `meleeResolved`（保留既有 `sharedCombat:true`） |
| 之后 | `RoomAmbushCleared` 第四句「后头喊两个人上来抬！」处的 `AmbushLuoOrders` 再调一次替补请求（幂等） | — |

### 2.1 失败那条路：刀捅进去，走正常阵亡与检查点重试

两处会输：**抓枪那一下没按上**（`ambushGrabWindowS` 漏完），或者**推刀输了**
（共用地面 QTE 结算 false）。两条都记 `ambushBladeLanded` 并施加共用地面失败伤害：

| 来源 | 数值 | 谁扣的 |
| --- | --- | --- |
| 枪托 | `ambushButtDamage` 20 | `AmbushButtStrike` |
| 共用地面失败 | `MELEE_QTE_RULES.groundFailureDamage` 72 | 抓枪没按上＝`AmbushGroundFailure(true)` 补；推刀输了＝共用 `ResolveQte` 已经扣过 |
| 这一拍的额外 | `ambushFailureExtraDamage` 18 | `AmbushGroundFailure` 两条路都扣 |

20 + 72 + 18 = **110**：满血进这一拍也会死。所以失败＝正常阵亡＝检查点重试，
**没有「输了也挣脱得开」的中间态**（这一条与 2026-09-15 那一版正好相反，是这次重做的结果）。

死掉的那一帧**不记 `ambushBroken`**（`FirstLevelAmbush.Fail` 里那一条 `PlayerAlive()` 判断）：
记了的话 `ResetAmbush` 会当成「已经挣脱过」接着往下跑，重试就没有这一拍了。
`ResetAmbush` 回滚的事实是 `ambushTriggered / ambushStabbed / ambushGrabbed /
ambushBladeLanded / ambushFinisher / zhouStabbed`，并且还原担架队快照、重新藏好四个人、
清掉恍惚与提示环、把借来的刺刀还回去（见 §4.1 第 2 条）。
`Melee` 这一步的检查点正好存在玩家跨进触发圈的位置（`Enter` 里那一句 `SaveCheckpoint`），
所以重试落回来就是从头再演一遍。

### 2.2 顺序是怎么保住的：老周那一刀在前，玩家自己这条线在后

需求要的是「背景里老周和两个抬担架的**在玩家动不了的时候**被捅」。四条事实的顺序因此是
`ambushTriggered` → `ambushStabbed`（枪托砸倒）→ `zhouStabbed` → `ambushBroken`，
**`ambushBroken` 永远排在 `zhouStabbed` 之后**（纯 Node 与浏览器两处都断言了这一条）。

2026-09-15 那一版是靠「顶住 → 连按 → 看着那一刀 → 挣脱」四段硬凑出这个顺序的，
代价是连按窗口必须挤在 7.4 秒之前收尾。这一版不需要那套编排：玩家从 1.15 秒起就躺在地上，
**手上根本没有该按的键**，一直到 `ambushPounceAtS`(8.8) 才轮到他自己这条线 ——
老周那一刀（7.5）自然落在前面。`ambushRearBearerStabAtS <= ambushPounceAtS` 这条不等式
由 `Script_FirstLevelMissionTest` 守着。

整段锁住的最坏情况（测试里逐项加出来）：
扑 1.2 + 砸 0.45 + 躺着到 8.8 + 抓枪 1.2 + 连按 3.6 + 共用结算 0.6 + 反捅窗口 2.4
+ 反捅演完 1.1 = 19.35 秒 ≤ `ambushLockMaxS` 20.5。正常一路按下来是 14 秒上下。

### 2.3 恍惚曲线

与开场出轨那一段**同一套通道**：眼皮走 `Script_PostComposite` 的 `uEyeClosure`，
恍惚四元组走 `uConcussion`（强度 / 失焦 / 模糊像素 / 二次像），耳鸣走
`AudioEngine.SetConcussion` 的低通。取样函数就是开场那一条（`Script_FirstLevelOpening`
导出的 `SamplePerceptionCurve`，段内 smoothstep）—— 所以「挨一下 → 眼前发黑 → 慢慢回来」
在全关是同一种手感，不是两套。

装配层只问 `FirstLevelMissionRuntime.Perception()` 一个口：开场与伏击不会同时发生，
真撞上了取更重的那一份，不做叠加。

四条曲线的终点都是 0（`Script_FirstLevelMissionTest` 逐条断言），
`ambushDazeEyelids` 在 3.3 s 走完（早于 `ambushLookLitterAtS` 4.6），
`ambushDazeFocus` 在老周那一刀（7.5）时已经降到 ≤0.5 —— 糊，但认得出是谁在捅谁。

## 3. 名单与坐标

### 3.1 敌军（`Data_FirstLevelMission.MISSION_ENCOUNTERS.melee`，全部 `Type38` + 上刺刀）

| id | 藏身点 | 靠什么挡住视线 | 职责 |
| --- | --- | --- | --- |
| `AmbushLead` | (61, 4) | 既有 `MeleeAlcoveScreen` | 扑上来抡枪托、压刺刀、被反捅 |
| `AmbushRearA` | (53.6, 2.4) | `AmbushWestScreen` | 先捅前抬者，再捅后抬者 |
| `AmbushRearB` | (53.6, 4.6) | `AmbushWestScreen` | 捅担架上的老周 |
| `AmbushFlank` | (62.4, 14.3) | `AmbushCornerCrates` | 压到起身之后才动 |

### 3.2 布景（`Data_FirstLevelMissionLayout.mjs`）

- `Wall("AmbushWestScreen", 54.6, 3.5, 0.35, 1.9, 4.2)` —— 贴西墙的南北向隔断。
- `Block("AmbushCornerCrates", 61.9, 12.6, 3, 1.7, 1.6, "cover")` —— 东南角货箱堆。
  南面到墙内侧留 1.8 m：留窄了 `ai.Spawn` 会把侧翼那个挤出屋外（实拍顶到过 (60.5,16.5)）。
- **`Rafters("ConnectedHouse", 58, 8, 12, 15)`（2026-09-16 新增）** —— 一根脊檩（x=58，
  南北向）＋ 八根横梁（每 1.85 m 一根，东西向跨满 12 m）＋ 东侧一段望板。
  白盒剖面屋顶 `ConnectedHouseRoof` 只盖西侧四成，而这一拍玩家是**躺在地板上仰头**看的 ——
  不补的话参考图②那一帧看见的是白天的天（2026-09-16 出图实拍）。全部在墙顶（2.9 m）之上，不影响走位与碰撞；
  中间故意留一道窄缝（剖面屋顶的俯视可读性要保住，顺便给一束天光）。
  东窗与南北两扇门一个字没动。

三块遮挡都不挨 x=58 的担架通道，也不挨南北两扇门 x 56.1–59.9 的开口；
「从北门 (58,0.5) 看不见」「从触发点 (58,6) 看不见」这两条由 `Script_FirstLevelMissionTest` 逐段求交断言。

### 3.3 屋里这一场的战斗规则（实拍调出来的，别回滚）

1. **屋内不开枪，全程刺刀。** 四个伏击兵整段 `Melee` 都挂着 `ambushSilentSector`
   （`InFireSector` 对任何候选返回 false），走位与出手交给共用白刃规则。
   依据：三八式一枪 72 点伤害，挨过枪托之后顺子只剩 80 血 —— 实拍里两米外被点名就是一枪死，
   而且贴脸端枪瞄准本来就不合理。罗班长自己的命令就是「进！上刺刀！看准了打，里头有自己人！」。
2. **剩下三个排队上，不是一起压。** `ambushReleaseDelayS` / `ambushFlankReleaseS`：
   刚拔出刺刀那个 4.5 秒、绕货箱堆那个 7 秒、捅老周的那个等自己那一刀落完。
   领头那个已经死在反捅上，所以起身之后眼前是空的 —— 这几秒正好用来站起来、找刀。
   班里人在起身后 `ambushSquadDelayS`(1.5) 起跑、约 3 秒进屋。
3. 与契约建议值的两处下调，都是实拍改的，理由写在 `Data_Tuning_FirstLevel` 对应行的注释里：
   枪托伤害 30 → 20（砸完是 80 血不是 70 血），`ambushSquadDelayS` 2.5 → 1.5。

### 3.4 友军站位（`MISSION_PLACEMENT`）

- `ambushSquadPosts` = (55,−14.2) / (61,−14.2) / (58,−15.4) —— 罗班长、何有田、刘文财贴着灶屋北门内侧掩护。
  冲进屋那一段跳过共用的「看见敌人就停下来对射」（`RespondToContact`）：隔着灶屋门口对射帮不上忙。
- `ambushYaowaPost` = (56.4, 0.6) —— 幺娃跟着担架到屋门口。
- `ambushSquadRoute` = (58,−8) → (58,−3) → (58,−0.4)，每人再按 `ambushSquadLanesM` 左右错开。
- `ambushSquadEntry` = (56.4,4.6) / (60.2,4.2) / (57.4,8.6) —— 三个人在屋里的落点。
- `roomInterior` = x 52.6–63.4、z 1–15 —— 判定「进屋了没有」。

## 4. 实装位置

| 做什么 | 在哪 |
| --- | --- |
| 编排状态机（纯 Node，注入钩子） | `Script_FirstLevelMissionAmbush.mjs`（相位 `waiting/lunge/butt/daze/grab/mash/finish/broken/resolved`） |
| 副作用（锁、走位、伤害、恍惚、提示、担架、班组、动作、重试） | `Script_FirstLevelMissionRuntime.mjs` 的 `AmbushHooks()` 与其下一整段 |
| 剧本倒地 / 压住 / 地面僵持 / 起身 | `Script_MeleeCombat` 的 `ScriptedKnockDown` / `HoldScriptedGround` / `BeginScriptedGround` / `EndScriptedGround` / `ScriptedRise` |
| 地面镜头的两个常数（眼位、抬头量） | `Data_MeleeCombat.MELEE_RULES.groundEyeM` / `groundCameraPitchRad`，`Script_Player` 与控制锁读同一条 |
| 锁着的时候改看的地方 | `FirstLevelMissionRuntime.AimControl` + `ControlEye()` / `ControlPitchBias()`（倒地时眼位在地板上方 0.28 m，且要减掉镜头自带的那份抬头） |
| 恍惚曲线取样 | `Script_FirstLevelOpening.SamplePerceptionCurve`（与开场出轨同一条） |
| 提示环（HUD） | `Script_Hud.SetCinematicPrompt` / `SetCinematicBeat` + `Style_Game.css` 的 `.hudCinematicPrompt` / `#hud.cinematicBeat` |
| 提示环的键面字 | `Script_Input.ActionKeyGlyph`（读 `KEYMAP` / `MOUSEMAP`，不写死字母） |
| 提示环的输入捕获 | `Script_Main` 的 `Capture` 钩子先问 `missionRuntime.AmbushInput`（连按那一段的 F 让给共用 QTE） |
| 担架队：提到队首、跟进、伤亡、替补 | `Script_FirstLevelMissionColumn`：`PromoteZhouLead` / `UpdateLead` / `AmbushCasualty` / `AmbushRecover` |
| 演出层（骨骼 clip 盖在 mixer 之上） | `Script_FirstLevelMissionPeople`：`InstallAmbushPerformance`（士兵）、`SetAmbushClip` / `PlayAmbushClip`（担架员） |
| 数值 | `Data_Tuning_FirstLevel.MISSION_TUNING` 的 `ambush*`（每条带出处注释） |
| 文本 | `hud.cinematicPrompt.*`、`input.mouse.*`、`firstLevel.hint.melee`、`menu.condition.meleeResolved` |
| 调试跳转 / 检查点重建 | `Script_FirstLevelMissionStageJump`、`Script_FirstLevelMissionCheckpoint`（阶段 8/9/10 分别是「队首在村口」「担架在门口、四个人藏着」「伏击已打完」） |

### 4.1 六条会咬人的实现细节

1. **控制锁不许给 spawnGrace。** `BeginControl` 里 death/dive/southTransition 三种会置
   `player.spawnGrace`（等于无敌，见 `Script_Player`）。`"ambush"` 不在那张表里 ——
   这一下必须真的落上。浏览器验收专门断言 `player.Protected === false`。
2. **砸下来之前要先把刺刀挂到玩家身上。** 共用白刃层的倒地／地面僵持／地面镜头全都要求
   「手里有一把白刃武器」（`MeleeCombat.Weapon` 先问宿主，再回落到 `entity.meleeWeapon`），
   而这一刻顺子手里是拉栓步枪。`AmbushButtStrike` 借一把 `"Bayonet"` 挂上去，起身之后
   （`MELEE_RULES.riseS + 0.15`）再还回去 —— **当场还会把起身动作砍掉一半**，
   因为共用 `Step` 见到「换了武器」就 `SetState(idle)`。
   同一条坑在砸下去那一瞬也咬过一次：`ScriptedKnockDown` 里必须先 `f.weapon = this.Weapon(entity)`
   把缓存对齐，否则下一次 `Step` 会把刚倒下的人拽回站姿（症状：掉血了、恍惚起来了，人却还站着）。
3. **`"qte"` 这个 fighter 状态不会自己超时。** `StepFighter` 见到它直接 return。
   压住那一段（`HoldScriptedGround`）不是 QTE，所以每一条旁路 —— 领头那个被打死、
   控制锁兜底超时、检查点重试 —— 都要经过 `EndGround` 钩子。
   玩家那一侧是 `down` 状态，`ScriptedKnockDown` 给的 `groundHoldS` 会覆盖共用的 1.7 s 自动起身。
4. **扑过来那一段，领头那个必须是 `meleeDormant`。** 挂着 `meleeTraining` 又不 dormant 的人会被
   `MeleeCombat.Step` 认领（`managed`），于是 `Script_Ai.Act` 第一句就把整帧交给 `StepMeleeCombat` ——
   那条路不走导航。症状：他站在藏身点一步不动，`ambushLungeMaxS` 超时照样记砸中，
   玩家在三米外凭空掉血（2026-09-15 实拍量到 3.67 m）。正确的接法是：`WakeAmbusher` 四个人全 dormant，
   扑上来压刺刀那一瞬（`AmbushPounce`）再把领头那个交回白刃层（`meleeDormant=false`）。
5. **演出中的人要能走、又一枪不开。** `scriptedNoncombatant` 的人在 `Script_Ai.Think` 里直接 return，
   根本不走位；所以起身之后必须清掉这个旗，改挂 `ambushSilentSector`。
   四个人整段保持 `meleeTraining.passive`，`ImmediateThreat` 才不会把玩家从僵持里拽出来。
6. **换过 `squadRoutes` 就必须重建 `SquadMarchAi`。** 它在构造时把每个人当时的路线数组抓进 `members`，
   之后换掉 Map 里的数组，共用层还在按旧数组算前后与间距。运行时统一走 `RebuildSquadMarch(route)`。

### 4.2 四条为了「看得见」才加的（2026-09-16 出图时逐帧改出来的）

1. **领头那个整段挂 `scriptEssential`。** 玩家躺在地上的八九秒里幺娃就站在门口、班里人在灶屋：
   实拍里他在 story 7.9 s 被一枪打掉过，戏就只剩玩家自己爬起来。`AmbushFinisher` 在捅之前
   摘掉这条，所以他**真的**死在玩家手里（挂着它伤害会被夹到 1 血、断肢与血整条不走）。
   另外三个不挂 —— 他们死了这一拍照样走得通。
2. **躺着那几秒他站到玩家东侧（`ambushDazeStandM` 1.1）。** 他扑过来的落点正好压在
   「玩家 → 北门口担架」那条视线上，站着不动就把担架队被捅穿的整场背景挡死了。
   扑上来压刺刀那一下他再回到玩家身上。
3. **躺着那几秒第一人称的枪收起来（`SetAmbushViewmodel`）。** 挨了一记枪托，枪本来就脱手了；
   更要紧的是它正好糊在屏幕中间，参考图③那一帧什么也看不见。抓住**对方**那把枪时再回来 ——
   抓枪／推刀／反捅这三下画的就是那把枪（第一人称 `BayonetGround` 姿势）。
4. **反捅之后把他手里的三八式摘掉。** `PressureStabbed` 里 0.30 s 玩家把枪夺走，之后他两只手
   空着摁在肚子上；共用 `Actor._UpdateRiggedWeaponMount` 只认两个握点，手一空照样把 1.68 m 的
   步枪架在两手之间插穿尸体。`InstallAmbushPerformance` 到点置 `state.hideWeapon`
   （`Script_Actor` 那一条与「抬担架时藏枪」共用同一个闸），重放这一拍时 `HideAmbushers` 还原。

### 4.3 2026-09-16 打磨轮：五张定帧逐张改出来的

D 那一轮的五张图（`_shots/RoomAmbush/D/`）拿去跟参考图对，四处读不出来。
每一条都是**分层出图**（把第一人称那棵树、把压住玩家那个人分别藏掉各拍一张）
或者**把刀尖投到屏幕上量**定位的，不是照着感觉调的：

1. **近景那把枪不许是方块。** 玩家默认画质是 high，压上来那个人手里本来就是
   `Model_Type38` + `Model_BayonetType38`；但**低画质（浏览器验收就是 quality=low）
   的刺刀退回一根 16×24 mm 的方块**，半米外怼着脸就是一块黑砖。
   `Actor.SetWeaponDetail(true)` 给**这一个人**单挂近景档（`ActorFactory.WeaponGeometry`
   的 `detail` 选项，缓存键多一截 `|detail`），整场画质一个字不动；材质桶与 high 档共用，
   不新增采样器。`WakeAmbusher` 给领头那个挂上，收尾（`FinishAmbush` / `HideAmbushers`）还回去。
2. **第一人称那把枪与那条胳膊别挡着他。** 镜头就架在胸口上方，共用地面姿势
   （`BayonetGround`）把枪与右小臂摆在视线正中 —— 分层出图确认：那块「黑盒子」是
   **玩家自己的汉阳造枪托**，那条「灰管子」是**玩家自己的小臂**（导入的骨骼双臂
   `Rig_FpsArmsNraSkeletal01`，手指是有的，只是被怼到镜头上放大了）。
   `Viewmodel.SetScriptedHandOffset` 在共用姿势之上叠一份偏移（`ambushGrappleHandM`
   x 0.03 / y −0.28 / z −0.38），**挪的是枪**，双手是 IK 追着枪的握点走的，姿势数据一个字不改。
   只在 `grab`/`mash`/`finish` 三拍挂着，起身/重试/收尾都收回去（浏览器验收断言它变回 null）。
3. **枪托砸下来那一下要看见他的脸。** 原来在 `Swing()` 一次性瞄他的胸口，而他还在扑、
   烘焙 clip 又带位移 —— 砸中那一帧他偏在画面右边缘（量到 ndc 0.23，实际更远）。
   改成 `LookAt("face")`：瞄**头骨的世界位置**（`AmbushFacePoint`，取不到骨头才回落
   `ambushButtLookHeightM`），转头按 `ambushButtImpactS` 铺，并且 `lunge`/`butt` 两拍
   每帧用 `TrackControl` 把落点更新一次（`AimControl` 每帧调会把转头段重置成「现在」，
   相机等于钉死，所以专门分了这一条只改终点、不重开转头段的口子）。
4. **躺下之后要看见屋梁。** 砸中那一瞬补 `LookAt("roof")`：落点在自己正前方
   `ambushDazeLookAheadM` 处、`ambushDazeLookRiseM` 高，只抬头不转头；
   眼位正从 1.6 m 掉到 `groundEyeM`，所以这一段也要每帧重算落点
   （`FirstLevelAmbush.RoofView` 那几秒），算一次会少掉四十来度的抬头量。
   不写这一条时镜头停在「瞄着他 ± `limitedLookRadians`」那条带子上，人躺下之后读到的是地板。
5. **老周那一刀要真的扎在他身上。** 三处都错，逐帧量刀尖量出来的：
   - 站位：原来沿用 `ambushBindReachM`(1.15)，而共用走位的到达半径还要再加 0.45 m。
     现在 `ambushZhouStabStandM`(1.25) + `ambushZhouStabLateralM`(0.7)，走位走
     `DriveAmbusherOnto`（把到达半径那一截先扣掉）。`BayonetStabDown` 的刀尖在他身前
     约 1.25 m、又偏左手边 0.79 m，两个数就是照这个配的。
   - 朝向：`ZhouPending` 在刀落那一瞬就翻掉，而下扎（0.62 s）、拧刀（0.80）、拔出（1.08）
     还没演完 —— 一松手共用 AI 就按「站住了就面向目标」把他转走，刀在半空划一道弧扫到门口。
     现在朝向锁到**这一段 clip 演完**为止。
   - 床面：`BayonetStabDown` 是按 0.86 m 的床面烘的，而原来**前抬者一死（5.4 s）担架就落地**
     （0.22 m），刀尖停在老周上方 0.6 m 的空气里（投到屏幕上差 128 px）。
     现在担架落地＝**两头都没人攥着了**（8.3 s 后抬者挨刀那一下），中间这三秒由剩下那个人举着。
     落地那一下的前倾也从 0.45 rad 压到 0.1 rad：26° 的斜坡会把担架读成一道白板，
     而躺在上面的人（实例化的也好、带骨架的老周也好）是平的，人浮在坡面上方。
   - 帆布：`0xd1d0be` 在门口那片天光下顶成一块发光的白板，压到 `0xb6ae99`（全场担架同一份材质）。
   - 替补：担架一旦少人，共用的 `BearerShort` 就会派民夫过来接手 —— 实拍里他在挣脱之后
     三秒就走进这间还在白刃的屋子。`AmbushCasualty` 给这副担架挂 `ambushHold`，
     `RequestBearer` 见到它直接返回；清完屋子由 `AmbushRecover` 放开（拍表末两行本来就是这么写的）。
6. **提示环钉在他握枪的那一点上**（`Actor.WeaponWorldPoint`，模型规范系的原点就是右手握点）。
   拿不到（枪被藏起来、还没挂上挂点）才回落胸口高度，再拿不到才回落屏幕中心偏下 ——
   §6.2 里那条「等演出层把骨骼位置暴露出来」就是这一条。

## 5. 与另外两个包的接口

- **配音（Package B，已交付；口径见 [屋内伏击配音同步](Data_FirstLevelVoiceSyncRoomAmbush.md)）**：
  `RoomAmbush`(14.03 s，urgent) / `RoomAmbushBreak`(9.14 s) / `RoomAmbushCleared`(19.54 s)，
  以及两个段内事件 `AmbushZhouLine`、`AmbushLuoOrders`，由 `FirstLevelMissionRuntime.VoiceEvent` 消费。
  整段配音 14.03 s 与这一拍现在约 14 秒的锁住时长正好对上。
- **动作（Package C / C2，已交付；口径见 [屋内伏击动画库](Data_FirstLevelAmbushAnimation.md)）**：
  `Script_FirstLevelAmbushAnimation.mjs` 加载器 + `Animation/FirstLevelAmbush/`。
  版本 `20260916AmbushV2` 的八段：LugouIja01/02/03 各 `AmbushRise` / `BayonetStabStanding` /
  `BayonetStabDown` / **`RifleButtStrike`(1.0 s)** / **`PressureStabbed`(1.3 s)**，
  LugouNra02/05 各 `BearerStabbed` / `PatientStabbed` / `PatientWoundedIdle`。
  `PressureStabbed` 从白刃库的 IJA `BayonetPressure` 姿势起手，被自己的刺刀捅穿之后往右侧软下去，
  结束在尸体姿态 —— 所以压住那一段**不放烘焙 clip**，让共用白刃层的 `Pressure` 摆着，
  反捅那一下才接上 `PressureStabbed`。
  库拉不下来时整条演出层静默让路（`Prepare…` 返回 null）：日军退回既有站姿／受击姿态，任务与事实一条不差。
  清单里没有的 clip id 由 `PlayAmbushClip` 挡掉（只记 `animationError`，不让 `rig.Update` 抛异常）。
- **老周换成带骨架的伤员**：平时他由 `MissionPeople.Patient()` 画，是实例化的烘焙静态姿势，
  播不了动作；挨刀那一瞬 `view.people.SetAmbushClip(zhou.id, "PatientStabbed", "PatientWoundedIdle")`
  一置上，`MissionPeople.RiggedPatient()` 就改用真的 Person（LugouNra02）并按担架床面 `deckY` 采样，
  放完 2.6 s 的挨刀段自动接上 3.0 s 的循环喘息段，一直演到第 17 阶段他断气为止。
- **老周身上的血**（2026-09-16）：两条画法共用 `Data_Tuning_FirstLevel.ZHOU_WOUNDS`（腿伤、擦伤、别人的血，
  `stabbed:true` 的肚子和双手只在 `litter.stabbed` 之后出现）。骨架版挂 `actor.woundBlood`（`CharacterWounds.Add`
  带 `radiusM` / `ageS`，从挨刀那一刻起渗开变干）；实例化版单独一张 `"zhou"` 表（外观同 modelVariant 1，
  材质不与别的伤员共用），`PaintBakedWounds` 在烘焙空间摆球。脸上不放血——低模上读成胡子。

## 6. 验收

命令从 worktree 根执行。

下表是 2026-09-16 **打磨轮**（§4.3）重新跑过的一遍；重做轮那一列的结论一致，不再重复列。

| 命令 | 结果（2026-09-16 打磨轮） |
| --- | --- |
| `node Taierzhuang1938/Script_ModuleGraphTest.mjs` | 过（400 个模块全部登记；这一轮改的七个浏览器模块戳抬到 `v=20260916210000`） |
| `node Taierzhuang1938/Script_SamplerBudgetTest.mjs` | 过（近景档只多一把刺刀的三角形，材质桶与 high 档共用，采样器数不变） |
| `node Taierzhuang1938/Script_FpsArmTest.mjs` | 过（585 条；手位偏移只叠在共用白刃姿势之上，不碰逐枪姿势数据） |
| `node Taierzhuang1938/Script_TestRunnerTest.mjs` | 过（405 条 / 202 个测试文件） |
| `node Taierzhuang1938/Script_TextTest.mjs` | 0 失败 1 警告（警告是既有的四个未引用键） |
| `node Taierzhuang1938/Script_TextGather.mjs --check` | 过 |
| `node Taierzhuang1938/Script_FirstLevelMissionTest.mjs --audio` | 过（含本拍的 12 段规则测试） |
| `node Taierzhuang1938/Script_FirstLevelMissionTopologyTest.mjs` | 过 |
| `node Taierzhuang1938/Script_MeleeCombatTest.mjs` | 过（48 条，含新加的剧本倒地／压住／地面僵持四条） |
| `node Taierzhuang1938/Script_MeleeQteTest.mjs` | 过 |
| `node Taierzhuang1938/Script_FirstLevelAmbushAnimationTest.mjs` | 过（五个模型、八段） |
| `node Taierzhuang1938/Script_FirstLevelMissionStageJumpTest.mjs` | 过 |
| `node Taierzhuang1938/Script_FirstLevelMissionTopologyBrowserTest.mjs` | 过 |
| `node Taierzhuang1938/Script_BrowserBundleTest.mjs` | 过 |
| `node Taierzhuang1938/Script_FirstLevelMissionBrowserTest.mjs --campaign --stage-jumps --stage-from=8` | 过（真实输入从阶段 8 跑到 `Complete`） |
| `node Taierzhuang1938/Script_FirstLevelRoomAmbushShots.mjs` | 出五张参考帧（默认画质、1280×720）→ `_shots/RoomAmbush/E/` |

定向浏览器入口（只跑公开阶段 8 → 12，约六分钟）逐拍驱动并断言：

- 担架跟到屋门口、四个人都真的站在屋里（出生点没被物理挤出墙外）；
- 控制锁起来且**没有出生保护**（这一下必须真的掉血）、领头那个**真的扑到接触距离**；
- 枪托砸中之后玩家真的进共用 `down`（`meleeCameraDrop > 0.2`），整段没有共用 QTE；
- HUD 挂上 `cinematicBeat`，准心／弹药／目标条／提示／标记的 `opacity` 全是 0，共用僵持卡没上；
- 眼皮真的闭上过（`eyeClosure > 0.9`），老周挨刀时模糊已经退到 `focus <= 0.5`；
- `zhouStabbed` 落在控制锁里、排在 `ambushBroken` 前面，老周血量落到 `ambushZhouHealthAfter`；
- 提示环真的在屏幕上、键面字是 `F`、位置夹在安全区内；领头那个摆的是 `Pressure`；
- **（打磨轮加的）** 压住玩家那个挂着近景档（`weaponDetail`），而且 `Type38|…|bayonet|detail`
  这一份走的是**模型**不是方块刀片（本测试跑在 quality=low 上，这一条才有意义）；
- **（打磨轮加的）** 第一人称是导入的骨骼双臂（`rigSource` 带 `riggedArms`）、那把枪显示着，
  并且挂着 `ambushGrappleHandM` 那份手位偏移；起身之后偏移必须变回 `null`；
- **（打磨轮加的）** 老周挨刀那一瞬担架**还举着**（`state !== "fallen"`、床面 > 0.5 m），
  捅他那个真的站到了担架边上（与担架的水平距离 ≈ `hypot(1.25, 0.7)`）；
- 一下 F 进共用**地面** QTE（`kind==="ground"`，窗口 ≤ 4.8 且 ≤ `ambushQteWindowS`）；
- 连按推赢之后领头那个**还活着**（共用 QTE 赢了不杀人），左键那一下才把他打死；
- 起身之后控制锁解开、HUD 回来、没有留下的提示环；
- **失败那条路**：抓枪不按 → `ambushBladeLanded` → 阵亡 → `continueCheckpoint` 之后
  阶段仍是 `Melee`、相位回 `waiting`、这一拍的事实全部回滚、没有残留的锁／QTE／恍惚／提示环、
  担架队完好回到门口、四个伏击兵重新藏好；
- 之后班里人进屋、剩下三个全死、阶段自己推进到 Courtyard，玩家存活。

截图：定向入口的场景帧留在忽略目录 `_shots/FirstLevelStageVillage/`
（`Scene_AmbushTrigger` / `AmbushButtStrike` / `AmbushZhouStab` / `AmbushPounce` /
`AmbushGrapple` / `AmbushBreak` / `AmbushSquadEntry` / `AmbushCleared`）；
对标参考图的五张定帧在 `_shots/RoomAmbush/E/`（`Ref1_ButtStrike` … `Ref5_Grapple`，
由 `Script_FirstLevelRoomAmbushShots.mjs` 按**玩家默认画质**出；上一轮打磨前的那五张留在 `D/`）。

### 6.1 已知的基线红（不是这一拍改出来的，别去「修」）

`Script_PhysicsTest.mjs` 的帧耗时、`Script_BootTest.mjs` 的「远景辨识材质 count=0」、
`Script_DamageTest.mjs` 的手榴弹警告文字、`Script_RangeTest.mjs` 的刺刀大刀复位
（2026-09-15 基线）。

`Script_FirstLevelWhiteboxSurfaceTest.mjs` 在 Node 下直接起不来：它经
`Script_ExternalProps.mjs` import `vendor/three/examples/jsm/loaders/GLTFLoader.js`，
而仓库根 `package.json` 是 `"type": "commonjs"` —— Node 把这个 `.js` 当 CJS 读，
于是「does not provide an export named GLTFLoader」。与本拍无关（vendor 与 ExternalProps
一个字没动），主检出上同样起不来；选测入口因为改了 `Data_FirstLevelMissionLayout` 才把它选进来。

另外 `--campaign` 从第一阶段整跑在**干净 `origin/master` 上也不稳**（卡点全在公开阶段 5 的
集束弹那一段），2026-09-15 那一轮已经用两次干净基线对照过。定向入口
（`--stage-from=8`）本轮跑了三次：屋内伏击那一段三次全绿，其中两次一路跑到 `Complete`，
一次在公开阶段 14→15 的 `Rescue → RetreatFirst` 等待上超时（离这一拍五个阶段）。

### 6.2 留给后续的

- `?whitebox=p012&missionStage=9` 这条 URL 起点不建屋子的几何（只建当前切片），
  所以直接开这个地址取证只能看到空地上的四个人；视觉验收要走
  `Debug.FirstLevelJump(9)`（定向浏览器入口与出图脚本都是这么做的）。
- 提示环已经钉在他的**握枪点**上（`Actor.WeaponWorldPoint`，2026-09-16）。刀尖本身还没单独
  暴露出来；要把环挪到刀尖上，得由演出层再报一个「刀尖」挂点。
- 少一个抬架员的那三秒（5.4 → 8.3）担架是**一个人举着**的：没人的那一头就那么平着悬在空中。
  下一轮要么给单人抬的担架补一个「一头拖在地上」的姿态，要么让替补在这三秒里就顶上来。
