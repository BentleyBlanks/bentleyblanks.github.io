# 04 机枪点位关中过场《空地上的三个人》（2026-09-15 建，2026-09-16 第二、三轮动作打磨）

第一关（`?whitebox=p012`）04 机枪阶段的关中过场。玩家第一次走进机枪点位时播一次：
北面四十米的开阔地上，三名退路被截断的川军举手投降，被日军喝令跪下、打倒、辱骂，
最后用刺刀杀害。玩家坐在机枪后面，看得见，够不着。

- 分镜与台词原稿：[`Data_CutsceneMachineGunCaptives.mjs`](../Data_CutsceneMachineGunCaptives.mjs)（导出 `CS_MachineGunCaptives` 与本场 `VOICE_LINES`）
- 注册：`Data_TengxianScript.MISSION_CUTSCENES` → `CUTSCENES` / `CUTSCENE_ORDER`
- 触发：`Script_FirstLevelMissionRuntime.UpdateCaptivesCutscene()`
- 数值：`Data_Tuning_FirstLevel.MISSION_TUNING.captivesCutsceneRadiusM`
- 字段口径：[`Data_CutsceneRedo.md`](Data_CutsceneRedo.md) §1

## 1 来源与目的

**这一场不承载任何事实断言。** 七个人全是虚构无名者；它不说「滕县战役中日军屠杀过
战俘」，它说的是「这三个人今天死在这里」。这条边界写在三处：`presumed`
（`machineGunCaptivesScene`）、`skipCard` 的第三行、以及所有台词的 `tier: "虚构"`。

目的是把 04 阶段的战斗换一个视角。在此之前，玩家打死的日军是靶子，日军打死的守军
是数字。这一段把镜头交给望远镜那一端，而过场期间玩家没有扳机 —— 机枪的射程到得了
那里，他只能看着。

尺度参照《血战台儿庄》：克制、不给脸、刺刀那一下用剪影 + 黑场，不做血腥特写、
不用慢镜头、不给音乐。**杀人的过程听得见，看不见。**

史实纪律的落点：

- 日方口语称中国军队「支那兵」是 1938 年日方文书与部队用语（`Data_Voice` 日方那一批
  的头注），全场**只出现一次**，只在羞辱句里，不进任何旁白；
- `forbiddenLines` 守住「八格牙路」这条神剧红线；
- 中方台词是四川话口语（莫／屋头／龟儿子／记到起），说话的是被抓壮丁的兵，不喊口号；
- 日方录音文本必须是**纯假名**（seed-audio 从文本判断语言），汉字写法只留在 `kanji`
  字段，屏幕字幕是中文。`Data_Voice` 的拼表体检按 `IsIjaCast(who)` 硬查这一条。

## 2 分镜表

总时长 **44 s**，六镜。机位全部钉在机枪座这一侧，靠焦距而不是走位改变距离感 ——
这一场的前提就是「他只能看」。机位固定在 `(0.4, 1.9, -132.5)`。

| 镜 | 全局秒 | 秒 | 焦距 | 机位 / 被摄 | 内容 | 台词 |
|---|---|---:|---:|---|---|---|
| 1 | 0–10 | 10 | 200 | 固定机位，锚 `captive_third` | **举着手被押进来**（`CaptiveHandsUpWalk`）；7.4 s 站住；老兵落在队列后面 0.27 m，7.02 s 日兵甲起推（`IjaShoveForward`）、**7.42 s 接触**→老兵往前趔趄一步顶进队列（`CaptiveShovedStumble`）0.7 s，8.12 s 才站定举手 | 罗班长（画外）「莫开枪！…」 / 军曹「站住！手举起来！」 |
| 2 | 10–20 | 10 | 200 | 锚 `captive_young` | 10.5 s 喝令跪下；12.4 s 两个开始往下跪、13.4 s 跪稳，老兵拖到 13.3 s 才动、14.3 s 才跪稳；14.2 s 起脚、**14.66 s 接触**→老兵前扑趴倒；15.4 s 小兵改成跪着求饶 | 军曹「跪下！手抱到脑壳上！」 / 小兵「莫杀我……」 |
| 3 | 20–30 | 10 | 200 | 锚 `captive_old`（已趴地） | 日兵站在他旁边指着骂；老兵从地上顶回去；27.6 s 抡枪托、**28.45 s 砸在跪着的小兵头与后颈上**→头颈猛向侧前偏 0.13 m、上身晚半拍跟过去（`CaptiveKneelFlinch`）0.8 s，29.25 s 收手抱头不再出声 | 日兵「站起来啊，支那兵。」 / 老兵「龟儿子……」 / 日兵「闭嘴！」 |
| 4 | 30–35 | 5 | 200 | 锚 `ija_gunso` 背影前景，`blackOutAt 4.2` | 军曹下令；日兵乙退半步，33.4 s 起刺、**34.16 s 刺进跪着的小兵**（全片唯一看得见的一刀）；黑场从 34.2 s 起收，35.0 s 全黑 | 军曹「处理掉。一个不留。」 |
| 5 | 35–38 | 3 | 200 | `black: true` | 全黑。第三人那一刀（35.36 s）与趴着的老兵那一刀（36.36 s）只有声音；末 1 s 全静 | （无） |
| 6 | 38–44 | 6 | 135 | 固定机位，`fadeIn 1.0` | 空地上三个伏着的影子，四名日军往北走出画 | 罗班长（画外）「顺子，记到起。…」 |

`blackOutAt` 是「**从这一秒起线性收到本镜结束**」，不是「这一秒黑」。第一版把它写在一
个 8 秒的镜子里，实拍到 34.6 s 画面还是全亮的 —— 镜 4 因此缩到 5 s（只剩 0.8 s 可收），
剩下的黑由镜 5 的 `black: true` 硬接；4.2 这个值刚好卡在 34.16 s 那一刀**之后**，
接触那一帧仍是全亮的。

### 2.1 站位：按作者动作的实测触及距离反推

演出区在机枪座 `(0, -127.4)` 正北偏东约 38 m：x 4.0–9.5 / z −165…−171。
`groundSnap: true` —— 演员 `pos[1]` 是**离地高度**，真实地面由 `Script_Cutscene` 的
`groundAt` 钩子问共享地形采样器要（跨系统契约 5），不硬编码绝对 y。

押解的出发点（`FROM`）在北面 **8 m** 外（原来 10 m）。七个人同一段位移、同一个速度
1.095 m/s：三名俘虏现在**举着手走进来**，那条 clip 没有根位移，步频得跟着轨道速度走 ——
1.36 m/s 下 0.49 m 的小步子要 165 步/分，看着是小跑；1.095 m/s 落在 133 步/分。
四十五米外的取景一米都看不出来。

三名俘虏跪成一排面朝机枪位（间距 1.4 m），动手的日军站在各自目标的**侧后方**。
站位不是摆好看的，是按作者动作实测的触及距离反推的（资产实测列见
[`Animation/MachineGunCaptives/Data_MachineGunCaptivesAnimation.md`](../Animation/MachineGunCaptives/Data_MachineGunCaptivesAnimation.md)）。

**距离量到皮，不量到原点（2026-09-16 改）。** 受击者不是一个点：跪着的人在打击那个
方位上的皮离他自己的原点 0.146–0.185 m。站位 = 触及 + 那一段皮（下刺再减去刺入深度）。
「皮」的量法是**只算打击端扫过的 ±9 cm 走廊里的顶点** —— 抱着头的人在 0.79 m 高处
最外面那一点是他的胳膊肘，离刀走的那条线有四分之一米，把它当体表会让日兵退后 0.1 m。

| 接触 | 施动者站位 | 受击者 | 站位距离 | 动作触及 | 受击者体表 | **刺入** | 打击高度 | 受击者姿态 |
|---|---|---|---:|---:|---:|---:|---:|---|
| 推搡 `IjaShoveForward` | hei (5.72, −170.19) | 老兵 | 0.740 | 0.5910 | 0.1580 | **+0.0094** | 1.01 | **站姿**后背 |
| 踢 `IjaKickPrisoner` | hei (5.599, −170.121) | 老兵 | 0.939 | 0.7855 | 0.1637 | **+0.0105** | 0.62 | 跪姿胸口 |
| 枪托砸 `IjaRifleButtStrike` | bing (8.379, −169.972) | 小兵 | 0.966 | 0.7954 | 0.1847 | **+0.0137** | 0.98 | 跪姿**头与后颈** |
| 下刺（可见）`IjaBayonetDownThrust` | bing (8.488, −170.52) | 小兵 | 1.429 | 1.3911 | 0.1585 | **+0.1203** | 0.75 | 跪姿上半身 |
| 下刺（黑场） | ding (9.477, −170.732) | 第三人 | 1.415 | 1.3895 | 0.1461 | **+0.1207** | 0.75 | 跪姿上半身 |
| 下刺（黑场） | hei (5.7, −170.75) | 老兵 | 1.44 | 1.39 | — | — | 0.75 | 趴姿 0.2–0.35 —— 高度对不上，**所以只能在黑场里** |

推搡、踢与枪托砸按「**停在体表**」做（刺入 −0.03…+0.05 m），下刺按「**刺进去 0.10–0.15 m**」做。
第一版把踢的「触及」写成了趾**骨高度** 0.63、又没有算那 0.165 m
的皮，日兵站到 0.78 m —— 靴子整整踢进胸口 0.16 m。

**这五个数现在是钉死的，不再浮动（2026-09-16 第三轮）。** 原来它们各自还会飘约
±0.04 m，来源有三处，三处都堵上了：

1. `sizeScale`：战场上每个人的身高抽 ±4%，而触及随施动者缩放、体表随受击者缩放。
   `cast[].sizeScale` 现在把本场七个人钉死在 1.0（`Script_Cutscene` 建演员时透传，
   `ValidateCutscene` 硬查 0.8–1.25，`Actor` 里没写这一项的照旧随机）。
2. 日军的 `targetHeight` 是 **1.62** 不是 1.66（`Script_Actor` 的 `KIND_SPEC`）。
   第二轮的门禁把日军也按 1.66 建，每个触及都长了 2.4% —— 枪托与刺刀各约 2 cm，
   比这里的容差还大。门禁现在按 kind 取身高，并 grep `Script_Actor` 核对那两个数。
3. 体表按**受击者自己那具骨架**量，不再取「所有 NRA 里最大的那个」：NRA02 与 NRA05
   在同一条带、同一个方位上差 2.7 cm（装具不同）。

门禁把这五个数在三组外观下各算一遍（基准 / 换 seed / 换 `modelVariant`），
五项散布全部 **0.00 mm**（上限 5 mm）。

三条硬规矩，改站位前先读：

1. **每一次看得见的打击，受击者都必须是跪着的。** 三种打击的高度（0.62 / 0.98 /
   0.75）全落在跪姿的躯干带上（跪姿胯 0.45、头 0.98）。趴着的人躯干只有
   0.2–0.35 m，1.39/0.75 的下刺对他在几何上就够不着 —— 老兵那一刀因此只放在镜 5 的
   全黑里，第一版把它放在可见镜头里是错的。
   **推搡是唯一的例外**：那一下（高 1.01）推的是**站着**的人的后背，
   所以它只能发生在跪下之前，也就是镜 1 的「站住」那一拍。
2. **施动者不许站在受击者的正后方。** 正后方的话整个动作被受击者挡住（第一轮实拍
   抡枪托只看得见举过头顶的半截枪）。现在四次可见接触与自己目标的屏幕角差
   0.0157（推搡）/ 0.0186（踢）/ 0.0171（枪托）/ 0.0169（下刺）rad ——
   200 mm 画面上一个人宽 0.0132 rad。日兵丁例外：他那一刀在黑场里，露不露侧影无所谓。
   推搡那一下离得最近（0.74 m），所以它的余量最小；再近就只能改成侧面推肩。
3. **军曹要让开踢的那条视线。** 他离机位只有 33 m，一旦压在日兵的屏幕位上，
   整条腿都被他的背挡掉（第一轮实拍如此）。现在两人差 0.029 rad。

`CaptiveStruckDown` 是**向前扑倒**，所以踢他的人站在他正后方，他就朝着机位倒下去；
三名俘虏的 `ry` 因此一律面朝 +Z（`FACE_GUN`）。

机位为什么是 1.9 m 而不是枪口那个高度：机枪座在 z=-128 的浅坑里（地面 −0.81），
架起来的枪口只有 0.64，而这一段战场上守军自己的土袋墙顶在 0.90–1.08 之间。第一版
把机位放在 1.55 m，实拍出来趴在地上的老兵被自家胸墙齐腰切掉。抬到 1.9 之后两道
胸墙的顶落在视线下方：它们仍然横在画面下缘当前景，但不再挡住任何一个人。

逐面核对过的通视（机位 → 掩体排 → 人）：`z=-146.25`（GuardWaitingCover，顶 1.08）与
`z=-150`（WithdrawCover，顶 0.90）两道在 1.9 m 机位下对**全部十一个站位**都完全让开；
`z=-158`（Stub）与 `z=-164`（Ridge）按 x 分列（Stub 挡 −1.85…1.85 / 8.15…9.85，
Ridge 挡 −1.8…1.8 / 8.25…9.75），人都摆在列与列之间的走廊里。
**Ridge 那一列是东边的硬边界**：日兵丁一度摆到 x=9.8，实测小腿被它挡掉（遮到 Y=0.76），
退回 9.5 才干净。掩体表在 `Data_FirstLevelMissionFront.FRONT_COVER`，实际方块由
`Data_FirstLevelMissionLayout.MISSION_LAYOUT.blocks` 生成。

从**真正的枪位**（座位 `(0,-127.4)`、站姿眼高约 0.89）看过去，这三个人正好落在
z=-146.25 的 x∈(−1.05,4.05) 与 z=-150 的 x∈(3.9,5.1) 两个豁口里 —— 玩家坐在枪后面
看得见他们的上半身，下半身被自家胸墙切掉。机位与演出区坐标登记在
`presumed.machineGunCaptivesStage`，是本实现推定，不是史料。

### 2.2 作者动作对照表

演员的 `state.perform: "<ClipId>"` 指向作者动作库 `Animation/MachineGunCaptives/`
（实现 `Script_CutscenePerformance.mjs`，契约见 `docs/Data_CutsceneRedo.md` §1.3）。
**受击者换 clip 的时刻与打击动作的接触帧逐个对齐过**（接触帧取自资产实测：
推 +0.40 s、踢 +0.46 s、砸 +0.85 s、刺 +0.76 s）：

| 全局秒 | 谁 | clip | 秒 / 播放 | 说明 |
|---:|---|---|---|---|
| 0 | 三名俘虏 | `CaptiveHandsUpWalk` | 1.8 loop | 举着手被押进来；播放速率按起播帧的 `moveSpeed × 4.2` 折算，支撑脚与轨道同速 |
| 7.0 | hei | — | POSE_CLIPS | 他 7.0 就走到推搡位（7.665 m / 7.0 s，仍是全队的 1.095 m/s），比别人早 0.4 s |
| 7.02 | hei | `IjaShoveForward` | 0.9 once→站姿 | 接触 **7.42**，压在军曹「站住！」那一句里 |
| 7.4 | 小兵 / 第三人 | `CaptiveHandsUpStand` | 4.0 loop | 站住那一顿上切进去（0.12 s 交叉淡入） |
| **7.42** | 老兵 | `CaptiveShovedStumble` | 0.7 once | 与接触帧对齐；轨道在这 0.7 s 里送他走 0.271 m，正好是 clip 里支撑脚相对根走的距离 |
| 7.92 | hei | `perform: null` | — | 推完退到押解位（1.084 m / 0.78 s） |
| 8.12 | 老兵 | `CaptiveHandsUpStand` | 4.0 loop | 趔趄的末帧＝这条的第 0 帧，接缝为零 |
| 12.4 | 小兵 / 第三人 | `CaptiveStandToKneel` | 1.0 once | 喝令跪下，1.0 s 的过程 |
| 13.3 | 老兵 | `CaptiveStandToKneel` | 1.0 once | 拖了 0.9 s 才动 —— 挨那一脚的理由 |
| 13.4 | 小兵 / 第三人 | `CaptiveKneelHandsHead` | 4.0 loop | 过渡末帧＝这条的第 0 帧，接缝为零 |
| 14.2 | hei | `IjaKickPrisoner` | 1.2 once→站姿 | 接触 **14.66**；老兵这时还在往下坐 |
| 14.3 | 老兵 | `CaptiveKneelHandsHead` | 4.0 loop | 跪稳，离挨脚还有 0.36 s |
| **14.66** | 老兵 | `CaptiveStruckDown` | 1.6 once，末帧趴伏保持 | 与接触帧对齐；头 0.98→0.21 |
| 15.4 | 小兵 | `CaptiveKneelPlead` | 4.0 loop | 看见老兵被踢翻，改成求饶 |
| 20.0 | hei | `IjaTauntGesture` | 4.0 loop | 站在趴着的人旁边指着骂 |
| 27.6 | bing | `IjaRifleButtStrike` | 1.4 once→站姿 | 0.50 s 抡过头顶、接触 **28.45**（落点高 0.98 ＝ 头与后颈） |
| **28.45** | 小兵 | `CaptiveKneelFlinch` | 0.8 once | 挨枪托砸在头上的反应：头颈猛向侧前偏 0.13 m，躯干晚 50 ms 才跟过去 |
| 29.25 | 小兵 | `CaptiveKneelHandsHead` | 4.0 loop | 收手抱头、不再出声；**仍然跪着**（后面那一刀要用） |
| 30.4 | 军曹 | `IjaTauntGesture` | 4.0 loop | 抬手下令（落在「处理掉」那一顿上） |
| 33.4 | bing | `IjaBayonetDownThrust` | 1.6 once | 刺入 0.76 s、保持到 1.06 s 再抽回；接触 **34.16** |
| **34.16** | 小兵 | `CaptiveStabbedCollapse` | 2.0 once，末帧瘫倒保持 | 全片唯一看得见的一刀 |
| 34.62 | ding | `IjaBayonetDownThrust` | 1.6 once | 接触 **35.36**（黑场） |
| **35.36** | 第三人 | `CaptiveStabbedCollapse` | 2.0 once | 黑场 |
| 35.6 | hei | `IjaBayonetDownThrust` | 1.6 once | 接触 **36.36**（黑场，对趴着的老兵） |
| 其余 | 四名日军 | `IjaBayonetGuard` | 4.0 loop | 上着刺刀的押解姿；四个人用 `performPhase` 错开 0 / 1.1 / 2.3 / 3.2 s |
| 38.0 | 四名日军 | `perform: null` | — | 镜 6 的切镜帧上退回 POSE_CLIPS 走路 |

**三条过渡 clip 的交接是零接缝的**：`CaptiveStandToKneel` 的末帧、`CaptiveKneelFlinch`
的首尾两帧都**逐比特等于** `CaptiveKneelHandsHead` 的第 0 帧；`CaptiveShovedStumble`
的首帧**逐比特等于** `CaptiveHandsUpWalk` 的第 0 帧、末帧等于 `CaptiveHandsUpStand`
的第 0 帧（门禁按烘出来的关键帧数组断言）。所以这几处换 clip 时那 0.12 s 的交叉淡入
是一次空操作，看不出接缝。

**四个日军不许齐步换重心**：站姿与指点两条循环现在都带重心倒换和头部扫视，四个人共用
同一条 4 s clip，一齐做就像列队体操。数据侧给每个人一个 `state.performPhase`
（0 / 1.1 / 2.3 / 3.2 s），表演层把它加在播放头上 —— 比复制四条近似的 clip 便宜。
**每换一次 clip 就是新的一段**，所以每一段的起播帧都要带上自己那一份。

**老兵没有 `CaptiveStabbedCollapse`**：那条 clip 从跪姿起手，给已经趴着的人用会把他
先弹回跪姿再倒一次。他从 14.66 s 起一直保持 `CaptiveStruckDown` 的末帧（趴伏），
末帧与「死了」在画面上是同一件事；36.36 s 那一刀只出声。

每一帧 `perform` 旁边仍然写着等效的普通姿态（`kneel` / `prone` / `melee`），
**那不是给回退用的**：`CutsceneDirector.ActorHeadY` 表演期间照样按 crouch/kneel/prone
估头高，自动转头与听者俯仰都靠它 —— 写掉了，跪着的人会被按站姿算，头点飘到一米四。

外观按骨架钉死（`cast[].modelVariant`）：俘虏 NRA05(4) / NRA02(1)，日军 IJA01(0) /
IJA02(1) / IJA03(2)，全部取自 `Data_CharacterSelection` 的选模清单，`ValidateCutscene`
会核对 —— 作者动作是按骨架分号烘的，换一号皮就没有这套动作。
**身高缩放也钉死**（`cast[].sizeScale = 1.0`，七个人都写）：战场上的人抽 ±4%，
而这一场的打击站位是算到毫米的，见 §2.1 末尾那三条。
日军的刺刀走 `state.bayonetFixed`（`Script_Actor` 每帧读这一位）。

### 2.3 音效

全部取现成 cue（`Data_SfxSources` / `Script_Audio` 的配方），本轮**不新生成**任何音效：
`explosionFar`（远处炮声垫底）、`footstepDirt`（押解的脚步）、`impactFlesh`（踢与枪托）、
`bodyFall`（倒地）、`impactDirt`、`bayonetHit`（刺入）。惨叫与闷哼一律不走 TTS，
这一场干脆一声都不给 —— 黑场里三记 `bayonetHit` + 三记 `bodyFall` 已经够了。

## 3 触发规则

写在 `Script_FirstLevelMissionRuntime.UpdateCaptivesCutscene()`，由 04 阶段的逐帧块调用。

- **条件**：阶段是 `MachineGun`，且玩家第一次进入机枪座 `GUN_SEAT = (0, -127.4)` 的
  半径 `MISSION_TUNING.captivesCutsceneRadiusM`（当前 **12 m**）以内。这一条逐帧查、
  不挂在 `Enter` 上，所以阶段切进来时玩家已经站在圈里也立刻算数。
  原来是 4 m（站到枪位上才算），但 04 的机枪是可选的：拿步枪守前沿的人根本不往枪上走，
  过场整段没了（2026-09-17 修）。12 m 盖住整条前沿 —— 03 要求走到前沿点 `(0, -124)`
  9 m 以内，离枪座最远约 12.4 m。
- **事实名**：`captivesWitnessed`。记在 `flow.facts` 里，随 `FirstLevelMissionFlow`
  的 `Snapshot` / `Restore` 一起存取，`Retry` / `ContinueCheckpoint` 都不清 ——
  死亡回退到本阶段检查点不会重播。
- **事实先记再播**：宿主 `PlayMidCutscene` 回 `null` 的情形（过场系统还没建起来、
  已经在播一场）都是正常状态，记了事实就不会每帧重试，也不报错。**正在换关除外**：
  宿主的 `LevelLoading()` 为真时先不记 —— 跳到 04 人一落地就在圈里，`EnterLevel`
  收尾前那几帧照样跑 Update，先记了事实、过场又被宿主拒掉，整段就静默没了。
- **阶段跳转**：菜单「调试 → 第一关阶段跳转」走 `JumpFirstLevelStage(value, {midCutscenes:true})`：
  跳到 04 照播（人跳过去就是冲着这一段），跳到 04 之后才算看过。
  测试夹具的 `Debug.FirstLevelJump(n)` 与 `?stage=` 默认跳到 04 及之后都直接记上
  `captivesWitnessed`，否则十八段跳转回归会在第 4 段之后一直卡在导演手里；
  专项回归要播就传 `Debug.FirstLevelJump(4, { midCutscenes: true })`。
  `Script_FirstLevelMissionBrowserTest --campaign` 的 `JumpStage` 在没有 `--stage-jumps`
  时是空操作，所以那条整关回归走的仍然是正常触发。
- **走宿主口**：`host.PlayMidCutscene(id)`（`Script_Main` 的 `PlayMidCutscene` →
  `RunCutscene`），与关首 / 关末过场同一条路：夺控制权、掐战斗输入、放指针锁、
  收枪、Esc 跳过并以卡片补出字幕、播完还回来。任务层只报「该播了」，不自己当导演。

### 3.1 播放期间为什么不用另外冻谁

`Script_Main.Frame()` 在 `cutscene.Playing` 时只推过场与画面，玩法（玩家、AI、战车、
`missionRuntime.Update`）**一律不跑**。所以：

- 玩家不会在看戏的时候被打死（血量一点不掉）；
- `SpawnEncounter("machineGun")` 已经在 `Enter("MachineGun")` 里撒下的那一队是活的，
  但过场期间一步不前、一枪不开；战车同理。

这两条由专项逐帧取证（见 §5），不是推断。

### 3.2 与班长提醒的顺序

`Enter("MachineGun")` 先 `Say(stage.cue)`，也就是 `FrontWeaponChoice`
（「机枪就在旁边，顺手就接！先把前头那队鬼子打退！」）。玩家走到枪位时那条多半
正在播，所以触发时**先 `voice.Pause()`**，过场的 Promise 结束（正常播完或 Esc）
再 `voice.Resume()` —— 与 `OnPlayerDown` / `Retry` 用的是同一对。结果是：整段班长
提醒一个字不丢，也不会和过场里的台词压在一起。

`TakeMachineGun` 那一条老 cue 当前没有任何调用方（04 的 cue 是 `FrontWeaponChoice`），
本轮没有动它。

## 4 配音清单

九条，全部经 `Script_VoiceBake.mjs` 直连火山引擎 `seed-audio-1.0` 整句生成（一条一
cue，不拼接），走 `ch1_*` 章节语音通道并入 `Data_Voice` 总表；`dur` 由 baker 写回
`Data_CutsceneMachineGunCaptives.mjs`。文件名只经 `VoiceFileName(key)` 推导。

| key | who | 交付档 | 字幕（中文） | 录音文本 | 实测时长 | 底噪 | 文件 |
|---|---|---|---|---|---:|---:|---|
| `ch1_luo_28` | luo | shout | 莫开枪！北边那几个是我们的人。 | 同左 | 2.79 s | −58.5 dB | `AudioVoice_Ch1Luo_28.mp3` |
| `ch1_ija_gunso_01` | ija_gunso | shout | 站住！手举起来！ | とまれ！てをあげろ！ | 1.59 s | −74.9 dB | `AudioVoice_Ch1IjaGunso_01.mp3` |
| `ch1_ija_gunso_02` | ija_gunso | shout | 跪下！手抱到脑壳上！ | ひざまずけ！てをあたまのうしろへ！ | 2.91 s | −72.1 dB | `AudioVoice_Ch1IjaGunso_02.mp3` |
| `ch1_captive_young_01` | captive_young | weak | 莫杀我……我屋头还有老娘。 | 同左 | 3.00 s | −73.9 dB | `AudioVoice_Ch1CaptiveYoung_01.mp3` |
| `ch1_ija_hei_01` | ija_hei | shout | 站起来啊，支那兵。 | たてよ、シナへい。 | 1.56 s | −70.7 dB | `AudioVoice_Ch1IjaHei_01.mp3` |
| `ch1_captive_old_01` | captive_old | weak | 龟儿子……你们也有屋头人。 | 同左 | 3.74 s | −61.4 dB | `AudioVoice_Ch1CaptiveOld_01.mp3` |
| `ch1_ija_hei_02` | ija_hei | shout | 闭嘴！ | だまれ！ | 0.69 s | −87.7 dB（原始 take） | `AudioVoice_Ch1IjaHei_02.mp3` |
| `ch1_ija_gunso_03` | ija_gunso | normal | 处理掉。一个不留。 | しまつしろ。ひとりものこすな。 | 2.61 s | −61.8 dB | `AudioVoice_Ch1IjaGunso_03.mp3` |
| `ch1_luo_29` | luo | normal | 顺子，记到起。今天这个，记到起。 | 同左 | 4.29 s | −53.9 dB | `AudioVoice_Ch1Luo_29.mp3` |

日方三条的汉字写法在 `VOICE_LINES[].kanji`（止まれ！手を上げろ！／跪け！手を頭の
後ろへ！／始末しろ。一人も残すな。／立てよ、支那兵。／黙れ！）。

字幕时长全部按字数规则（每字 ≥0.22 s + 1.2 s）给，**每一条都长于对应录音**，
所以没有一句被下一镜截断，也不需要按录音时长反过来改 `at`。

### 4.1 新增的三个音色

`captive_old` / `captive_young` / `ija_hei` 三个 CAST id 是本场新增的：登记在
`Data_Voice.STORY_CAST_IDS` 与 `Script_VoiceBake.CAST_VOICE_PROMPTS`（缺一条 baker
直接退出 2，不会悄悄换成通用川军男兵）。`ija_hei` 走日语分支，判据从
`who === "ija_gunso"` 推广成 `Data_Voice.IsIjaCast(who)`（`^ija(_|$)`）。

**踩过一次的坑写在这里**：`captive_old` 第一版按 `normal` 档烘，提示词里写了
「音量不大」，模型交回来一条 max −30.4 dB / mean −55.6 dB 的气声 take ——
`Encode` 的 `silenceremove` 阈值是 −45 dB，整条 4.6 s 被削得只剩 0.08 s，而日志只报
「烘好 1 条」。两处一起改才修好：交付档换 `weak`（trim 阈值 −55 dB、目标 RMS −19 dB），
提示词里明写「每个字都要实实在在地发出声来，绝对不许做成气声」。
另外 `--clean` 对**改过词或音量异常**的行不安全：它按底噪挑最干净的一条，而一条几乎
全是静音的截断 take 底噪当然最低 —— 实测它把一条 4.04 s 的好 take 换成了 0.53 s。

## 5 验证入口与本轮结果

```powershell
node Taierzhuang1938/Script_CutsceneCheck.mjs CS_MachineGunCaptives      # 纯数据自检
node Taierzhuang1938/Script_CutsceneShot.mjs --cut=CS_MachineGunCaptives # 出图（自带 whitebox=p012&menu=0）
node Taierzhuang1938/Script_FirstLevelMachineGunCutsceneTest.mjs         # 本场专项（浏览器）
node Taierzhuang1938/Script_MachineGunCutsceneAudioTest.mjs             # 本场听得见没有（输出端逐条量 RMS，见 §5.2）
node Taierzhuang1938/Script_FirstLevelMachineGunTest.mjs                 # 04 既有专项，必须仍绿
node Taierzhuang1938/Script_CutscenePoseTest.mjs                         # 逐人量骨头高度 + performClip
node Taierzhuang1938/Script_MachineGunCaptivesAnimationTest.mjs           # 动作库与 perform 契约
node Taierzhuang1938/Script_VoiceTest.mjs                                # 声库与交付档
```

两条「动作真的生效了」的门禁（`visible ≠ 看得见` 那条老教训的同一手法：量涂色，不看旗标）：

- `Script_CutscenePoseTest` 的 `CUTSCENE_CASES` 里本场有四个时刻逐人量，判据是
  **`rig.cutscenePerformance.state.clipId`**（表演层当前在播的 clip id）+ 骨头世界高度。
  clipId 是 null 就说明这一帧根本没在播作者动作 —— 而那种情形画面上只是「动作没做」，
  不报错、不红脸。
- `Script_FirstLevelMachineGunCutsceneTest` 在 **p012 正片入口**推到 17 s 读同样两样东西，
  证明 `Script_Main` 那条**不 await** 的预取（`LoadMachineGunCaptivesAnimation`）
  真的在到达这个拍子之前把库放进了缓存。

出图脚本本轮补了两件事（白盒关的过场以前没法出图）：

- `--whitebox=<id>` 与数据侧的 `cut.shotWhitebox`：白盒关的场不由 `?phase=N` 建。
  URL 里**必须**带 `menu=0` —— 白盒关无条件建主菜单，而菜单开着时 `StepFrames` 推的是
  菜单帧，过场时间轴一帧都不走（症状：每张图都停在第 0 秒）。
- 白盒关不再把 `state.running` 置 false：`Frame()` 开头有一条「`missionRuntime` 在场且
  `!running` 就只渲染不推进」的终局守卫，排在过场分支之前，置了 false 之后同样是
  「每张图都停在第 0 秒」。`manual=1` 本来就已经接管了时钟。

本场专项守的五件事：正常输入走进枪位才触发、只播一次（走出去再走回来 / 检查点存取 /
flow 快照往返都不重播）、播放期间玩家不掉血且机枪进攻队一步不前一枪不开（那一队是
**活的**，不是被夹具杀光的空场）、播完控制权还回来且仍在 04、还权之后按 F 上枪开火
`gunUsed` 照旧记得上。截图落 `_shots/MachineGunCutscene/`（已 gitignore）。

`Script_FirstLevelMachineGunTest` 的跳转夹具直接把玩家放到座位上 —— 那正是本场的触发
圈。夹具里补了一行 `r.Record("captivesWitnessed")`，它**不削弱那条测试原有的任何断言**。

### 5.0 第三轮动作打磨的结果（2026-09-16 晚，BlenderMCP）

把 §6 里那三条未完成划掉的一轮。镜头、台词、录音时刻、总时长（44 s / 六镜
10/10/10/5/3/6）一个字没动；镜 1 多了两条音效（推那一掌 + 趔趄那一步，都是现成 cue）。

| 项 | 改前 | 改后 |
|---|---|---|
| 押送时的推搡 | 没做（§6 第 3 条） | `IjaShoveForward` 0.9 s ＋ `CaptiveShovedStumble` 0.7 s；7.42 s 接触，刺入 **+0.0094**。押解队形重摆：日兵甲 7.0 s 先到位（走 7.665 m / 7.0 s，仍是 1.095 m/s），老兵站在队列后 0.271 m，被推进队列，8.12 s 才站定 |
| 枪托砸的落点 | 高 0.62 ＝ 跪着的人的**后背肩胛**（§6 第 7 条） | 高 **0.98** ＝ **头与后颈**（跪姿头骨 0.99 / 颈 0.97）；过肩蓄力与收回原样保留，站位从 0.980 重算到 0.966 |
| 挨枪托的反应 | 头低 0.11、上身缩成一团 | 头骨**横向被砸偏 0.13 m**、前移 0.06、只低 0.05；躯干晚 50 ms 才跟过去（挨砸的是头，不是他自己蹲下去） |
| 刺入深度随缩放浮动 | 约 ±0.04 m（§6 第 2 条） | **0.00 mm**。`cast[].sizeScale` 钉死 1.0 ＋ 日军身高按 `KIND_SPEC` 的 1.62 量 ＋ 体表按受击者自己那具骨架量；门禁换 seed / 换 `modelVariant` 各跑一遍对散布 |
| 趔趄那一步的滑步 | — | 支撑脚相对根走 0.271 m，轨道送他走 0.271 m，差 <2 mm |

门禁：`MachineGunCaptivesAnimationTest`（5 骨架 × **36** 绑定，`rootDrift=0`/
`restoreError=0`/`loopWrap=0`/`scrub=0`/`hold≤4.9e-15`，15 条 clip 的 `loopSeam=0`，
五次接触的刺入深度逐条断言 + 三组外观的散布）、`CutscenePoseTest`（本场**七个**时刻，
新增「站住」那一拍的推与趔趄）、`CutsceneCheck`、`MissionHooksTest`、`TextTest`、
`ModuleGraphTest`、`TestRunnerTest`、`FirstLevelMachineGunCutsceneTest`、
`MachineGunCutsceneAudioTest`、`FirstLevelMachineGunTest`。

烘焙两遍逐比特相同；BlenderMCP（带窗口）与 `--background` 两条路烘 IJA01 的 sha256
也一致。可编辑工程与 Workbench 预览图在
`OneDrive/AI/Models/Blender/Taierzhuang1938/MachineGunCaptives_20260916b/`。

### 5.0a 第二轮动作打磨的结果（2026-09-16，BlenderMCP）

这一轮只改作者动作与由它反推的站位，镜头、台词、录音、触发、音效一个字没动，总时长
仍是 44 s（六镜 10/10/10/5/3/6）。改了什么、怎么量的见
[`Animation/MachineGunCaptives/Data_MachineGunCaptivesAnimation.md`](../Animation/MachineGunCaptives/Data_MachineGunCaptivesAnimation.md)
的「变更史」。逐项结果：

| 项 | 改前 | 改后 |
|---|---|---|
| 押解进场 | 普通走路姿态，站定才举手 | `CaptiveHandsUpWalk`，滑步 **0.14%**（1.4 mm/s） |
| 跪下 | 站姿硬切跪姿 | `CaptiveStandToKneel` 1.0 s，末帧与跪姿循环首帧**逐比特相同** |
| 挨枪托 | 只换成抱头 | `CaptiveKneelFlinch` 0.8 s，头 0.994→0.886→0.994，首尾帧同上 |
| 踢的接触 | 陷体 **0.16 m** | **+0.010…0.018 m**（停在体表） |
| 枪托的接触 | 陷体 0.05 m | **+0.004…0.010 m** |
| 下刺的接触 | 只擦到皮 0.02 m | **+0.121…0.122 m**（要求 0.10–0.15） |
| 趴姿末帧手脚 | 离地 27–42 mm | 手掌 6–7 mm、脚背 3–8 mm |
| 循环姿 | 三条循环每周期顿一下（非整数倍谐波） | 13 条 clip 的 `loopSeam` 全 = 0；加呼吸 0.25 Hz、颤抖 3.25 Hz、慢转头 |
| 四个日军 | 同一条站姿 clip 齐步换重心 | `performPhase` 错开 0 / 1.1 / 2.3 / 3.2 s |

门禁：`MachineGunCaptivesAnimationTest`（5 骨架 × 31 绑定，`rootDrift=0`/`restoreError=0`/
`loopWrap=0`/`scrub=0`，四次打击的刺入深度逐条断言）、`CutscenePoseTest`（本场六个时刻
逐人 `performClip` + 头高全中，新增举手走与跪下过程两个时刻）、`CutsceneCheck`（硬错 0 /
软错 0）、`MissionHooksTest`、`TextTest`（0 失败 / 1 既有动态键警告）、`ModuleGraphTest`、
`TestRunnerTest`、`FirstLevelMachineGunCutsceneTest`、`FirstLevelMachineGunTest`。

出图 16 个时刻落在 `_shots/MachineGunCutsceneV2/`（已 gitignore）。目视结论：举手走的
手在头顶之上、腿有步幅、脚不打滑；12.9 s 两个人正在往下蹲、老兵还站着（他慢半拍这件事
现在看得出来了）；14.7 s 靴子贴着胸口、人往前扑；28.8 s 小兵缩成一团，29.6 s 回到抱头；
34.2 s 刺刀尖没入他后背；39.5/43.0 s 三个影子伏在地上、日军往北走出画。

### 5.1 第一轮的结果（2026-09-15，合入作者动作库之后）

全绿：`CutsceneCheck`（硬错 0 / 软错 0）、`MachineGunCaptivesAnimationTest`
（5 骨架 × 25 绑定、`rootDrift=0`/`restoreError=0`/`scrub=0`）、`CutscenePoseTest`
（本场四个时刻逐人 `performClip` + 高度全中）、`MissionHooksTest`、`TextTest`
（0 失败 / 1 既有动态键警告）、`ModuleGraphTest`、`TestRunnerTest`、`VoiceTest`（31/31）、
`FirstLevelMachineGunCutsceneTest`、`FirstLevelMachineGunTest`、
`FirstLevelMissionStageJumpTest`。

`FirstLevelMissionBrowserTest --campaign --through-south --allow-checkpoint-retry`
跑了两趟：第二趟通过（1 次检查点重试），第一趟停在
`living withdrawn guards finish their physical rear route`。那一条与本场无关，是
**跑得太快**的时序敏感：撤回守军的七段后撤路只在 Support/MachineGun/Tank/Orders
四个阶段里走（`UpdateGuards` 的阶段白名单），第一趟玩家零重试、血剩 80 一路推到
South，守军才走到第 4 个折点就被冻住。过场不消耗任务时钟（`Frame()` 在
`cutscene.Playing` 时整个玩法停摆），两趟日志里都能看到
`"cutscene":"CS_MachineGunCaptives"` 正常播完。

`TestRunner --changed=origin/master --profile=quick --fail-fast` 通过 59、失败 1：
`FirstLevelWhiteboxSurfaceTest` 是**既有红**（`FirstLevelP012FlowTest` 同根因）——
仓库 `package.json` 是 `"type":"commonjs"`，`Script_ExternalProps` / `Script_GrenadeAsset`
以 ESM 方式 import `vendor/three/examples/jsm/loaders/GLTFLoader.js`（`.js` 扩展名）必然
链接失败。在干净的 `origin/master` worktree 上复现出同一条报错，且失败链上六个文件与
`origin/master` 逐字节相同。

### 5.2 音频取证与修复（2026-09-16）

用户实机反馈：**这一场「声音完全听不见」**，并问是不是距离太远。不是距离 ——
这一场的九条台词与十七条音效**全部是非空间化的**（`lines[].voiceCue` 不带位置，
`sfx[].position` 一律 `null`），一米和四十米听起来一样响。真正的原因是
**这九条 cue 在这个入口下根本没被装进声库**。

### 根因：两路装载共用了一个「载过没有」的旗标

第一关的声库是两路往同一个 `AudioEngine.voiceBank` 里装的：

| 路 | 装什么 | 入口 |
|---|---|---|
| A | 第一关的整段录音（键名 `Mission*`，87 条） | `Script_FirstLevelMissionVoice.Load()` → `audio.LoadVoices(Audio/FirstLevel/, …)` |
| B | `Data_Voice.VOICE_LINES` 166 条：战场口令（中方 31 + 日方 28）与 ch0/ch1 章节台词，**本场那 9 条在里面** | `AudioEngine.Unlock()` → `LoadPacks()` → `LoadVoices(Audio/, VOICE_LINES)` |

两路都走同一个 `LoadVoices`，而它结尾写的是 `this.voicesReady = ok > 0`；
`LoadPacks` 的闸判的又正好是 `if (!this.voicesReady …)`。建关时装配层
`await missionRuntime.voiceReady`（`Script_Main` 那一行）**保证了 A 一定先落地**，
所以玩家按下「开始」触发 `Unlock()` 时这道闸已经关死了 —— B 一次都没试过。

失败是彻底静默的：没有 404、没有异常、`voiceErrors` 是空的、控制台干净，
`audio.Play("voice.ch1_luo_28")` 只是在 `RECIPES[name]` 那一行返回 `null`，
过场照播、字幕照出。「visible ≠ 看得见」的同一条老教训换了个媒介：
**`Play` 被调用了 ≠ 听得见**。

### 证据（`Script_MachineGunCutsceneAudioTest.mjs`，真入口 `?whitebox=p012`）

探针挂在 `audio.softClip`（`ctx.destination` 前最后一环）上，逐帧量输出端 RMS；
时钟按**真实经过的时间**推（`manual=1` 下一口气 StepFrames 会把 44 s 压进半秒，
九条台词全叠在一起，量出来没有意义）。

| | 修前 | 修后 |
|---|---|---|
| `packAttempts.voice` | **0**（一次都没试过） | 1 |
| `voiceBank` 条数 | 87（全是 `Mission*`；ch0 0 / ch1 0 / 战场口令 0） | 253（`Mission*` 87 + ch0 31 + ch1 76 + 战场口令 59）|
| 九条 cue 在库里 | **一条都不在** | 九条全在 |
| 每条 `Play` 的返回值 | `null`，0 个采样源 | 非 null，各 1 个 buffer 源 |
| 台词窗内输出端峰值 RMS | 0.0164 – 0.0336（= 静场地板 0.012，**台词本身 0**） | 0.226 – 0.404（比修前高 **23–28 dB**）|
| 对照组（03 阶段 `voice.MissionSupportOrder`，同一只探针、同一条 `Play`） | 0.382 | 0.382 |
| 音效 17 条 | 全部正常起播（音效包走的是另一个旗标 `sfxReady`） | 同 |

表里的条数是修复当天（`f1ec7d0bb`）量的。`Mission*` 那一路会随内容批增长 ——
合入 master 的房间伏击三条之后是 `Mission*` 90 / 总数 256，门禁按「> 0」断言，
不钉死条数。

增益链在每条台词起播那一刻逐项读过，全部是 1.0：
`master / sfxBus / sfxUser / duck / storyDuck / hitGain / outGain`，
三只滤波器都在 20 kHz。`AudioContext.state = "running"`，听者与过场相机的距离恒为 0 m。

逐条排掉的候选因：

1. **声库没装** —— 成立，见上。
2. 进场 `voice.Pause()` 把总线静音了 —— **不成立**。`Pause()` 只做 `StopParallel()`
   + `audio.StopStoryVoice()`，后者动的是 `storyDuck`（只串着音乐与环境床），
   过场对白走 `sfxBus → sfxUser → masterGain`，两条路不相交；实测起播时 `storyDuck = 1`。
3. 距离衰减 —— **不成立**。九条台词与十七条音效全都不带 `position`，`voice.distance` 恒 0。
4. 过场期间 AudioEngine 的每帧 Update 没被推进 —— **不存在这个 Update**。
   音量全是静态节点值，实测逐项为 1.0。
5. `AudioContext` suspended / `voiceReady` 没到位就开播 —— **不成立**，
   `ctx.state = "running"`，且对照组在同一时刻同一只探针下量到 0.382。
6. 台词文件电平过低 —— **不成立**。离线 `astats` 实测这九条 RMS −18.2…−25.5 dBFS、
   峰值 −1.1…−8.1 dBFS，与同章其它对白（`Ch1Luo_20` −19.5 / `Ch1Luo_25` −21.1 /
   `Ch1Shunzi_03` −18.7）同一档。`VOICE_DELIVERY_MIX` **一个数都没动**，
   耳语与虚弱句仍然比常态轻。

### 修法（`Script_Audio.mjs`）

把「声库里有没有东西」与「`VOICE_LINES` 这一包载过没有」拆成两位：

- `voicesReady`（`Bark` 读的那位）改成 `this.voiceBank.size > 0`；
- 新增 `voicePackReady`，只由新的 `LoadVoicePack()` 置位，`LoadPacks` 的闸改判它，
  `ReloadPacks` 一并清掉；
- `LoadVoices` 的 `voiceErrors` 改成**只追加不清空** —— 两路共用一张错误表，
  后跑的那一路清表等于把前一路的失败擦掉。

顺带修掉的两处：

- **这一路远不止这一场**。修前第一关整关的 `voiceBank` 里战场口令是 0 条，
  也就是说**整关一句喊话都没有**（`Bark` 按 `kind` 挑池子，池子是空的），
  ch0/ch1 那 107 条章节台词同样只剩字幕。修好之后这些一起回来了。
- `Script_TestRunner` 的 `changedDomainRules` 里，`audio` 与 `voice` 两个域各自只有
  一条按**文件名关键词**兜底的规则（`/(Audio|Sfx|Music|Amb|Sound)/i` 与
  `/(Voice|Dialogue|Speech)/i`），而这两类文件的名字各自只含对方那半边：
  实测 `Script_Audio.mjs` 选得中 `audio`、**选不中 `voice`**（也就不跑 `VoiceTest`），
  `Data_Voice.mjs` 选得中 `voice`、**选不中 `audio`**。补了两条规则把交叉的一半接上。

### 为什么现有的门禁一条都没红

`Script_FirstLevelP012BrowserTest` 的 `VerifyAudioPlayback` 确实断言过
「story 的 voice 键都在 `voiceBank` 里」，但它走的是 `?whitebox=p012-archive` ——
那个入口不建 `fullMission`，没有 A 路，闸自然是开的。
`Script_FirstLevelMachineGunCutsceneTest` 守的是触发 / 只播一次 / 世界冻结 / 还权，
**从头到尾没有问过输出端有没有电平**。新门禁补的就是这一问：

```powershell
node Taierzhuang1938/Script_MachineGunCutsceneAudioTest.mjs
```

判据（`VOICE_RMS_FLOOR = 0.002`）取的是对照组实测值的约十分之一：既远高于静场
地板（0.012 那个数是**过场里的**地板，含环境床与音效尾巴；纯底噪实测 3.6e-4），
又给 `weak` 档留足余量。取窗到**整条录音**为止而不是头 0.6 s ——
`ch1_captive_old_01`（「龟儿子……」起手）前 0.6 s 实测只有 −53…−31 dB，
重音落在 1.2–1.8 s，只量头 0.6 s 会把「起手轻」误判成「听不见」。

## 6 未完成 / 妥协

**2026-09-16 第三轮划掉了原来的第 2、3、7 条**（刺入深度随缩放浮动、没有推搡、
枪托砸的是后背）。做法与实测在 §5.0。剩下的：

1. **第一关战场仍是白盒**：画面里那些蓝色方块是掩体的白盒色，不是过场的布景问题。
2. `Script_CutscenePoseTest` 的高度带留着 ±7% 的余量（`sizeScale` 钉死之后其实用不上
   那么宽，但别的过场没钉）；「动作库有没有真的生效」由 `performClip`（表演层在播的
   clip id）钉死，不靠高度带。POSE_CLIPS 那张 `CLIP_BANDS` 一个数没动。
3. 本场没有 `props`：就地演，用的是战场上已有的东西。要补散落装具得先确认不与
   `FRONT_COVER` 的掩体列和 `MISSION_AFTERMATH` 的尸体层打架。
4. Esc 跳过那条路由 `skipCard` 承担，至今没有专门实跑（专项与整关回归走的都是自然播完）。
5. **推搡那一下是全场唯一「施动者与受击者贴到 0.74 m」的接触**，屏幕角差只剩
   0.0157 rad（一个人宽是 0.0132）。日兵甲从 7.92 s 起退回押解位，所以贴得近的只有
   0.9 s；真要再近，就得把「推后背」改成「侧面推肩」，那是另一条动作。
6. `IjaShoveForward` 起播是从 POSE_CLIPS **硬切**进来的（7.02 s 不是切镜帧），
   那一帧枪会从常规持枪姿跳到竖起来的位置。本场别的 perform 起播（踢 14.2、
   砸 27.6、刺 33.4）都是同一条口径，四十米外的长焦上看不出来 —— 但它确实是硬切。
7. 日军站着的两条循环（`IjaBayonetGuard` / `IjaTauntGesture`）把上了刺刀的枪平端在
   身前 1.15–1.55 m 处，而押解位与砸击位离受击者只有 0.97–1.24 m。刺刀那条细线会
   从跪着的人身上穿过去几帧。这一轮只在推搡那一条里解决了（枪竖起来），
   另外两条是从第一轮就带着的，没动。
