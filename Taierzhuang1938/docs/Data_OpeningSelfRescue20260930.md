# 02 先枪伤、再刀砍、自己挣出来、班长塞枪（2026-09-30 改稿）

用户原话：「把主角救下来的这一段，应该是队友们先开枪击伤日军，日军手已经抬不起来拿枪了，再是班长和队友冲上来一刀砍死了这几个审问的日军和翻译，才接下面班长和主角的对话。而且也不要班长把玩家拖出来了，直接玩家自己往前用力一声腾挪就出来就行；图里的班长太磨叽了，眼珠子也不知道在动什么，就直接询问，得到肯定的点头以后，班长就地捡起一把枪，就塞给玩家；按照我说的改，需要BlenderMCP就自己用」。

本文覆盖 [压木原地审问改稿](Data_OpeningPinnedRescue20260927.md) 第 5 节（冲锋、白刃）与 [拖出与递枪](Data_OpeningRescueHandover20260929.md) 全文（拖出、递枪）。Hold / Ask（揪发、耳光）、还权以后的撤退不变。数据在 `Data_OpeningStoryboards.rescue`（`wound` / `cuts` / `heave` / `hand` / `view` / `rifleMouth`），导演在 `Script_OpeningStoryboards` 的 Charge…Check 那几段。

## 1. phase 与事实

- phase 表不变：BunkerRescue Hold → Ask → **Charge**（齐射打伤、冲锋）→ **Melee**（刀砍）→ **Lift**（何有田掀木、顺子自己挣出来跪起）→ **Check**（问、点头、塞枪、站起）→ Released。
- 事实名不变：`vanguardMeleeResolved`（日兵甲乙都死）、`luoRescueComplete`（记在挣出来跪起那一刻，名字沿用）、`playerDraggedFromWreck`（还权）、`rifleRecovered`（还权那一帧枪到手）。
- 导演 flag：`hit:<role>`（齐射打中；不叫 `shot:`，那是远射射手的标记，还权异常分支测试靠它判「没人开远射」）、`cut:<role>`（刀砍开始）、`heaveAt`（开始挣）、`handAt`（罗班长那条动作起播）、`handedAt`（枪到手）。旧的 `heChopAt` / `luoChopAt` / `dragAt` / `pickAt` / `fleeAt` 删了。

## 2. 齐射先打伤（Charge 开头）

- 冲锋号、喊杀、弹坑台阶上的汉阳造齐射照旧（`rescue.noise`）。翻译「有敌人！」随号声（`RescueFlee` 场，录音不动）。
- `rescue.wound.shots`：0.18 s 日兵甲左上臂、0.42 s 翻译左上臂、0.61 s 日兵乙右上臂（都从北边弹坑台阶上打下来：枪口闪光、曳光打进胳膊、血、弹孔贴花，`TakeHit` 伤害 30，不致死——叙事保护压着，留给刀砍）；0.9 s 纵深那个日兵（`DepthIjaB`，站在 `depthPost` 望东）当场打死。
- 打中以后各放自己的受伤动作（Blender 烘，见第 6 节），站在它的 holdLoop 上：中弹那条胳膊软垂、另一只手攥着伤处、弓着身子，**再没举过枪**：
  - 日兵甲 `IjaShotStaggerAway`：松开头发、爬起来背对枪手往东踉跄 1.5 m（离开顺子挣出来的那条路）；
  - 翻译 `InterpreterShotStagger`：一屁股坐倒、爬起来往东退 1.35 m 沿北侧，回头惊恐地看；
  - 日兵乙 `IjaShotDropRifle`：枪从手里掉在脚边（`weaponLost`），攥着右臂往前踉跄一步。
- 受伤的人根留在原位、身体由根运动带走；导演按 clip 的 `root.end`（未烘时 `standIn` [右, 后, 转角]）算出「身体在哪」（`WoundBody`），刀砍按这个站位摆。
- 伤者从中弹到咽气**每一帧都由导演摆**（朝向钉在起始根上）。坑：第一版在刀开始砍（`cut:`）时就不再摆他，砍中前那 0.45 s AI 把他转向北边的枪手 70°，根运动于是往南/往西走，砍死后日兵甲、翻译都倒在顺子要挣出来的地方（实测尸体在 x 2.8；修后日兵甲 4.1、翻译 4.5、日兵乙 5.7，离跪起处 ≥1.6 m）。

## 3. 班长和弟兄冲上来一刀砍死（Charge → Melee）

- `rescue.cuts`：罗班长砍日兵甲（扇他耳光的那个），ChargeA 砍翻译，ChargeD 砍日兵乙；三人都用 `LuoDadaoChopRear`（NRA05 身体，从被砍者右后方一刀），`chopRear` 站位绕着伤者的身体摆。出发时间 `delayS` / 各 extra 的 `delayS` 都在齐射三枪之后。
- 刀落在伤者的 holdLoop 起点之后（`WoundHoldS`：跑到了而人还在踉跄就先站着等）。砍中那一帧伤者按骨盆重设挂点、撤掉导演姿态，走受击物理的方向死亡（`BladeKill({natural:true})`：刀的冲量方向选倒地动作、近处可能出喉咙哽咽声，[受击反应](Data_HitReaction.md)）；没死透 `contactKillS` 后补一刀。
- 何有田不砍人，跟着冲下来直接去塌顶木边（`lift.heLift`），手搭在木头下等（`HeLiftTimber` 第 0 帧）；木头落回后沿北侧（`heCoverVia`）去沟沿换枪，不从跪着的顺子身边 0.8 m 擦过。刘文才照旧上台阶打岔口。ChargeA / ChargeD 砍完站原地，其余弟兄去各自岗位。
- 镜头：一直看着日兵甲（被打中、松手、踉跄走开），每一刀在砍人者与被砍者之间看 `chargeView.cutHoldS`；三刀都落、再过 `meleeHoldS` 进 Lift。

## 4. 自己往前挣出来（Lift）

- 何有田掀木（`HeTimber` 不变）；木头抬起（`lift.gripS + raiseS`）后顺子自己挣：`rescue.heave.body` 是他的眼位 / 视线 / 头顶方向 / 骨盆 / 膝 / 脚跟在导演时钟上的关键帧（`HeaveRoot`：压着时的眼位、面朝东），2.5 s：两手撑地憋劲（视线落到手上）→ 往前一挣（眼位前冲 0.4 m、抬起）→ 扒着泥再拽一把、膝盖收到身下 → 跪直（眼高 1.12 m，比压着时往东 0.6 m）。第一人称双手按这个时钟摆（`hands.beats.Lift`：push → flatFwd → clawIn → push → rest）。跪起来时视线抬到走过来的罗班长脸上。
- 「用力一声」：`RescueHeave` 场（顺子本人参考音，SeedAudio 一次生成，1.69 s：起劲的一口气，0.9 s 后是约 0.7 s 的「呃啊——」），提前 `heave.gruntS`（−0.5 s）起播，让主发力落在往前一挣上；没有配音时退回合成闷哼。
- 两只脚跟都出了木头东沿 `timberEastX + dropPastM` 何有田松手，木头落回。膝盖在泥里犁出两道痕。

## 5. 班长直接问、点头、就地捡枪塞过去（Check）

- 罗班长砍完先在顺子挣出来那条线的北侧让开等（`hand.waitSide`，0.6 m；第一版站在正前方，挣的那一下画面全是他的腿），挣到膝盖收到身下（`hand.stepInS` 1.7 s）才跨到正前方 `hand.frontM`（0.95 m）面朝他站好（`HandRoot`，`LuoGrabRifleShove` 第 0 帧），顺子一跪直就开始：
  - 「还能打不？」在他跨过来那一刻起播（`AskCheck`）：这条录音前 1.44 s 是冲杀后的喘气，字落在 1.44–2.48 s，正好是他凑近问话的时候；
  - 0–0.5 s 大刀插回腰带；0.5 s 起短 holdLoop（前倾凑过去、盯着他的脸，1.0 s）；
  - 说完 `nodS`（0.15 s）点头（镜头点一下），循环放开（导演给动画层原始时钟 + `holdUntil`，由它折算循环；第一版把折算过的秒数再传进去，被折回循环里，罗班长一直站着不动）：弯腰两手抓起他右前脚边地上那支汉阳造（`rescue.rifleMouth` = 这条 clip 第 0 帧道具的位置，枪躺在那里从 01 的黑场起就在），横着端起、一把塞到顺子手里（`offered` / `handed`），松手、转身朝弹坑台阶、大刀拔回右手。
  - 第一人称：`handed` 前 `reachS` 两手去够罗班长手里那支枪，`handed` 起枪归他、`carryS` 内收到整装末帧的端枪姿势（`HeldRifle` / `HeldRifleGear` 沿用）。
  - 视线：问话时在罗班长脸上（`view.atLuo`）；他弯腰抓枪、端起来时跟着他的两只手（`view.atHands`，俯角不低于 25°：看得见抓枪，不是看泥）；塞过来那一下看枪（`view.atRifle`，不低于 30°）；枪到手后平视前方。视线滞后 `view.lookS`（0.25 s），不跟着手猛甩。
  - 实测节奏（`--stage=2` 冷启动）：跪直后 0.6 s 开口，2.9 s 抓起枪，3.4 s 枪到手，约 4.4 s 还权。
- **眼珠子**：原来说话人面部层把罗班长的眼睛对准「最近的另一个正在说话的人」（冲锋时满沟喊杀，他的眼睛跟着乱瞟）。现在导演在 Check 给他挂 `voiceGaze`（第一人称的眼睛），`Script_FirstLevelSpeakerBinder` 优先用它，头和眼都钉在顺子脸上；还权时撤掉。
- 站起：`handed` 起按 `hand.rise`（0.9 s）从跪姿眼高 1.12 m 升到站姿 1.62 m；罗班长那条播完、人站直就还权（站姿，面朝东，枪在手里，`RestoreRifle({instant:true})`）。

## 6. 动作（Blender）

四条新动作在 `_import/Script_OpeningStoryboardClips.py`，manifest `20260930OpeningStoryboardsV23WoundedRescue`：`IjaShotStaggerAway`（只烘 IJA02）、`IjaShotDropRifle`（IJA01）、`InterpreterShotStagger`（NRA02，翻译穿 NRA06 用它的库）、`LuoGrabRifleShove`（NRA05）。工作单与烘焙实测见 [开场动作库](Data_OpeningClipLibrary20260923.md) §6。旧的 `LuoPickUpRifleSling` / `LuoRescueDrag` / `LuoHandRifle`、`HeDadaoParryChop` / `IjaParriedChoppedFall`、`InterpreterFlee` 仍在库里，不再播放。

## 7. 验收

- 纯 node：`Script_OpeningStoryboardsTest`（phase 表、齐射先于冲锋、谁砍谁、挣出来的脚跟过木头、跪起不压在尸体上、问话在塞枪之前、四条 clip 的 holdLoop）、`Script_OpeningSetTest`（新标记不撞布景）、`Script_FirstLevelVoiceTest`（新场 `RescueHeave`）。
- 浏览器：`Script_OpeningStoryboardShots.mjs --stage=2 --shots=SB05A,SB05B,SB06`（SB05A_Shot / SB05A_Charge / SB05A_LuoCut / SB05B_Heave / SB05B_Kneel / SB06 / SB06_Hand / SB06_Released）、`Script_FirstLevelMissionBrowserTest.mjs --campaign --stage-to=3`、`Script_OpeningClipsBrowserTest.mjs --clip=IjaShotStaggerAway,IjaShotDropRifle,InterpreterShotStagger,LuoGrabRifleShove`。
