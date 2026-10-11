# 01–02 开场动作库（2026-09-23 Anim 包）

这份写开场过场用的人物动作：clip 从哪儿烘、manifest 里有什么、导演调用时要守哪几条、回归口是哪几个测试。
导演怎么排拍子不在这里，见 [开场导演口径](Data_OpeningStoryboards20260923.md)；冻结的 clip 名与成对关系见
[01–05 重构契约](Data_FirstLevel0105Refactor20260923Contract.md) §5.4，契约外补的 `IjaShoveToWall + CaptiveWallBrace`
与各 clip 时长的改动记在同一契约 §8 v1.5。

## 1. 文件

| 文件 | 作用 |
| --- | --- |
| `_import/Script_OpeningStoryboardClips.py` | 动作本身（每个 clip 的关键姿态与接触时刻） |
| `_import/Script_OpeningStoryboardBake.py` | 帧循环、贴地、握持钉手、道具轨、验收数字、导出；复用 `_import/Script_MachineGunCaptivesBake.py` 的骨架导入、两骨 IK 与导出，不替换网格、蒙皮和逆绑定。文件头写了全部环境变量 |
| `Animation/OpeningStoryboards/Animation_Lugou<骨架>OpeningStoryboards.json` | 五套骨架（Nra02 / Nra05 / Ija01 / Ija02 / Ija03）各一份动作 |
| `Animation/OpeningStoryboards/Data_OpeningStoryboardsAnimation.json` | manifest；`version` 必须与 `Data_OpeningStoryboards.version` 一致（改了要抬 `index.html` 的戳） |
| `Script_OpeningStoryboardAnimation.mjs` | 运行时加载与播放：`OpeningClipMeta` / `OpeningStage` / `OpeningClipRoot` / `OpeningPlayerPoint` / `OpeningHoldSeconds` / `IsOpeningTerminalClip` / `OwnOpeningProp` / `DropOpeningWeapon` |
| `Script_OpeningProps.mjs` | 道具跟轨：`OpeningPropSet`（`Own` / `Detach` / `DropWeapon` / `Dispose`）、`OpeningHoldTime`（纯函数）、`BlendWeaponFrom` |
| `Script_OpeningActorPerformance.mjs` | 开场表演层；`ContactClips` 名单里的 clip 播放时不叠表演 |

## 2. manifest 里有什么

- `clips[名]`：`role`、`rig`（主用骨架）/ `rigs`（烘到了哪几套）、`duration`、`loop`、`rootMotion`、`contacts`（抓、推、砍的时刻、部位、
  `standoffM`）、`events`、`env`（`wallBehindM` / `wallLeftM` / `wallRightM`，根位置到墙面的运行时米）、`holdLoop [a, b]` 与 `holdExit`、
  `additive`（加性层的骨骼与参考帧）、`props`、`weapon` / `weaponState` / `weaponDropFrom`、`terminal`（末帧就是尸体）、`player`（顺子的身体点，
  第一人称被拖、被砸时镜头跟它走）、`prev` / `next`。09-22 的旧 clip 带 `legacy`。
- `stages[名]`：成对动作的相对站位 `actors[role]{ rig, clip, x, z, yawDeg, offsetS? }`，坐标是锚点演员的 three.js 系（+x 右、−z 前，运行时米），
  成对的两段同一时刻起播，`offsetS` 是晚起几秒。
- `props`：`bayonet`（复用 `Model_BayonetType38`）、`beam`（程序化断木，`pinned / nudged / kicked` 三个状态）、`comradeRifle`。
- `models[]`：每套骨架每个 clip 的验收数字（脚滑、接触误差、握持误差、骨盆每帧位移、`root.start / end`、`plants` / `kneePlants`、`wallContacts`），
  导演接下一段时摆位置用 `root`。

烘焙端在 Blender 米（源尺寸，+Z 上、角色朝 −Y）里写动作；导演和测试读到的一律是运行时米、actor 系（换算写在烘焙脚本文件头）。

## 3. 骨架分配

- 每个 clip 只烘到会用它的角色的骨架上（`clips[].rigs`）：comrade / interpreter / 何有田 / 幺娃 用 Nra02，罗班长用 Nra05，日兵甲用 Ija02，
  日兵乙用 Ija01，日兵丙、丁用的 `IjaCornerFire` / `IjaJunctionPeek` / `IjaReadyRifle` 在 Ija01、Ija02 上都有。09-22 的旧 clip 五套骨架都还在。
- 派生模型不另烘：日兵甲穿 IJA06、翻译穿 NRA06，它们按 `Data_CharacterSelection.CHARACTER_CLIP_SOURCE_BY_MODEL` 查 IJA02 / NRA02 的动作库。
  **按模型取动作的地方一律写 `rig.clipModelId || rig.modelId`**，只写 `modelId` 的话派生模型找不到动作、退回原生动画
  （见 [选模清单](Data_CharacterSelection.md)）。

## 4. 导演调用时要守的几条

1. 摆成对动作的演员身高钉成 1（`Script_OpeningStoryboards` 的 `PinOpeningScale`）。±4% 的随机身高会让接触点偏 5–7 cm。浏览器审片也是这样摆的。
2. 带 `holdLoop` 的 clip 播过结尾会在循环窗里一直采样；要放开时给 `pose.holdUntil`（导演时钟上的 clip 秒数），从当前位置播到结尾。
   `LuoKneelCheck` 起身那一刻必须给，否则一直跪着。
3. 加性层：`pose.additive = { clip, seconds, weight }`，打趣时把 `BanterLaugh` / `BanterLookShoulder` / `BanterPatRifle` 叠在 `WoundedSitRifleIdle` 上。
4. 道具轨自动生效：`weapon` 轨接管演员手里的枪；刺刀、断木、川军的枪由 `OpeningPropSet` 建模跟轨；换 clip 时枪和道具随同一次姿态混合过渡。
   `rig.openingProps.Detach(name)` 把道具按世界变换挂到场景根留在原地（被踢开的断木、插在地上的大刀），之后所有权归调用方，`Dispose` 不管它。
5. 炸飞的枪：播到 `weaponState` 为 `"dropped"` 的 clip 时，手里的武器按 `weaponDropFrom` 那段武器轨末帧留在世界里、手里那把隐藏，直到 `SetWeapon` 换新的。
   手动调用是 `DropOpeningWeapon(soldier, fromClip)`：何有田换枪就是先 `DropOpeningWeapon(he, "HeSwapDadaoRifle")` 再换汉阳造。
6. 日兵甲的步枪生成时 `bayonet: false`（`Data_FirstLevelMission` 名册 `BunkerExecutionerA`）；拔刀之前要让腰间刀鞘里有刺刀，先 `OwnOpeningProp(soldier, "bayonet")`
   （导演建人时已调）。
7. `Face_*` 骨不参与开场姿态混合，归口型层（[说话人面部](Data_CharacterSpeech.md)）。

## 5. 重烘

在 worktree 根，设 `OPENING_PROJECT=<worktree>/Taierzhuang1938`，依次跑三遍：`OPENING_PASS=partner`（导出成对动作瞄准的搭档轨）→ `OPENING_PASS=bake`（默认，
可用 `OPENING_MODEL` / `OPENING_CLIPS` 只烘一部分）→ `OPENING_PASS=manifest`（只从磁盘上的骨架文件重写 manifest，不开 Blender）。
无头 Blender 每条命令加外层超时、看退出码；也可以用 `node scripts/Script_BlenderMcp.mjs exec --file` 送同一个脚本（前后 start / stop）。
可编辑 .blend 默认存在 OneDrive `AI/Models/Blender/Taierzhuang1938/OpeningStoryboards_20260923`（`OPENING_BLEND_DIR`，不进仓库；09-22 的源工程不动）。
重烘后抬 `OPENING_VERSION` 与 `Data_OpeningStoryboards.version`、抬 `index.html` 戳，跑下面的测试。
每条 clip 按 manifest 里的烘焙记录烘（`clips[名].bake[骨架]`，2026-10-12 起），全量 `verify` 能逐条复现提交版；新 clip 怎么记、旧 clip 怎么换到新烘焙器见 §15。

## 6. 回归口

- 2026-09-30 02 救援改稿的四条新动作（manifest `20260930OpeningStoryboardsV23WoundedRescue`，代码在烘焙脚本 `WOUNDED RESCUE` 段，可编辑工程 OneDrive `AI/Models/Blender/Taierzhuang1938/OpeningWoundedRescue_20260930`）：队友齐射先打伤审问的三个人的胳膊（不死），罗班长再用 `LuoDadaoChopRear` 砍，最后罗班长就地捡枪塞给顺子。
  - `IjaShotStaggerAway`（IJA02，3.33 s，`holdLoop` 2.08–3.33）：第 0 帧 = `IjaCrouchHairHold` 0.75 s；0.04 s 左肩中弹，左拳松开头发、左臂甩开后软垂、右手按膝起身再攥住左上臂，向右转 180°、六步踉跄往东 1.5 m；根终点 x +0.10 / z +1.50（运行时米）；南墙在右手边 0.40 m（env `wallRightM`，起手的蹲姿本身就进 0.38 m 的墙 3 cm）。
  - `IjaShotDropRifle`（IJA01，2.5 s，`holdLoop` 1.25–2.5）：第 0 帧 = `IjaReadyRifle` 末帧；0.04 s 右上臂中弹，0.10 s 起枪自由落体、0.46 s 落在右前方地上不动（`weapon` 轨；`weaponState` `twoHand->dropped`，`weaponDropFrom` 指自己），左手攥住右上臂、弓身左前一步；根终点 x −0.10 / z −0.35，转 19°。
  - `InterpreterShotStagger`（NRA02，3.0 s，`holdLoop` 1.75–3.0）：第 0 帧 = `InterpreterCrouchAsk` 第 0 帧；0.04 s 左上臂中弹，坐倒、右手撑地、连滚带爬起身往右转 146°，沿北墙（0.40 m，斜线，只在烘焙里量）往东 1.35 m；根终点 x +0.75 / z +1.12。
  - `LuoGrabRifleShove`（NRA05，3.17 s，`holdLoop` 0.5–1.5，`holdExit` 已写）：第 0 帧 = `LuoDadaoChopRear` 末帧；0–0.24 s 把大刀插进左腰带（`weapon` 轨跟手→腰带，`weaponState` `dadaoInBelt`），0.5–1.5 s 前倾 12° 盯顺子眼睛喘气；1.5–1.8 s 右脚出半步深蹲抓起地上的汉阳造（`rifle` 轨，第 0 帧躺在 (+0.40, 0.04, −0.28)，抓握接触 1.80 s），1.82–2.12 s 端到胸前、2.12–2.25 s 塞到 (0, 0.90, −0.58)（事件 `offered` 2.25）、2.42 s 松手（`handed`，`rifle` 轨从这一帧起隐藏），之后向左转 90° 并把刀从腰带拔回右手（`turned` 3.04 s）。
  - 三条受伤动作的 holdLoop 里脖子比站姿低 ≤ 15 cm（实测低 0.07–0.11 m）；每条 holdLoop 1.0–1.25 s 整帧，接缝实测 ≤ 0.3°、0 cm。受伤三条和罗班长一条的起步帧与前一条终帧的交接：0.28°、0°、0.26°、2.86°。
  - 烘焙脚本新增环境变量 `OPENING_PLANTDBG=1`（打印超过 1.2 cm 的落脚窗口）；新 clip 用 `FlatOf(T, 构造器, 名字, t)` 取前一条的平面姿态作起点。

- 2026-09-30 重烘罗班长的 `LuoRescueDrag`（翻身时视线水平扫、不再跟着身体滚）与 `LuoHandRifle`（坐起、罗班长绕到左边跪下递枪，5.42 s），manifest `20260930OpeningStoryboardsV22CollarLuoNoRollBack`（与同日的 V21CollarQuestion 合并），口径见 [拖出与递枪](Data_OpeningRescueHandover20260929.md) 第 0 节；烘焙器新增 spec/pose 标记 `framedGrips`（转过的坐标系里握世界坐标的道具）。
- 2026-09-29 新增罗班长三条（只烘 NRA05）：`LuoPickUpRifleSling`、`LuoRescueDrag`、`LuoHandRifle`，`player` 轨 part 有 `eye`/`gaze`/`crown`（第一人称镜头的位置、朝向、横滚）、`chest`/`chestUp`/`pelvis`/`kneeL/R`/`heelL/R`（第一人称的腿和上衣）、`rifle`/`rifleMuzzle`/`rifleUp`（递过来的枪），口径见 [拖出与递枪](Data_OpeningRescueHandover20260929.md)；manifest `20260929OpeningStoryboardsV19LuoRescue`。

- 2026-09-27 开场改稿新增 `IjaTauntWalk`、`IjaFoundLook`、`IjaCrouchHairHold`、`IjaSlapForehand`、`IjaSlapBackhand`、`IjaSlapRaise`、`HeLiftTimber`，割喉链改到川军左肩后（新接触部位 `hairNape` / `crown` / `cheekL` / `cheekR`），口径见 [压木原地审问改稿](Data_OpeningPinnedRescue20260927.md) 第 6 节。

- 2026-09-30 审问一拍的 `IjaCollarQuestion`（stage `collarQuestion`，只烘 IJA02，`holdLoop` 0.5–3.5 s，站位 `interrogation.ijaAHold`）取代旧 `CollarControl`，口径见 [压木原地审问改稿](Data_OpeningPinnedRescue20260927.md) §6.2；manifest `20260930OpeningStoryboardsV21CollarQuestion`。

- 2026-09-29 割喉改拉割、新增 `IjaReleaseSheathe`（松手后原地收刀，站位 `slashRelease`），`IjaTauntWalk` / `IjaFoundLook` 不再带刺刀，刀鞘握柄上移 5 cm，口径见 [压木原地审问改稿](Data_OpeningPinnedRescue20260927.md) §6.1。

- 2026-09-27 新增 `IjaVaultTimberIn` / `IjaVaultTimberOut` / `IjaHaulForearmUnder`（只烘 IJA02）与 spec 键 `groundWeight(t)`（翻越离地、跪地那几帧不贴地），口径见 [翻越与倒拖](Data_OpeningVaultHaul20260927.md)。
- `Script_OpeningStoryboardsTest.mjs`（纯 node）：每套骨架每个 clip 脚滑 ≤ 2 cm、接触误差 ≤ 3 cm、穿墙 ≤ 3 cm、骨盆每帧 ≤ 0.2 m、膝盖 ≤ 2 cm；
  任何一条 clip 里四肢的骨头（大腿、小腿、脚、上臂、前臂、手）相邻两帧绕自身轴转动 ≤ 70°（世界旋转拆成骨头方向的摆动和绕骨头的扭转，只量扭转；IK 换分支就是这个量 140–180°，见 §10）；
  声明了墙面接触的时段离墙、进墙都 ≤ 3 cm；同根交接逐骨 < 2°、道具跳动 ≤ 2 cm；holdLoop 接缝按世界空间 ≤ 2°、≤ 1 cm。
- `Script_OpeningClipsBrowserTest.mjs`（浏览器，tier2，`openingStoryboards` 领域；`--shots` 出四视角审片图到 `tmp/OpeningClipsReview/`，`--clip=名,…` 只跑几条）：
  用正式 GLB 与运行时加载链逐条播，量脚滑、成对接触、骨长变化 ≤ 1%、NaN、人与人穿插（躯干 / 头 ≤ 3 cm，带四肢 ≤ 8 cm）和运行时道具行为。
- `Script_OpeningFirstPersonTest.mjs`、`Script_OpeningActorPerformanceBrowserTest.mjs`；改了共享骨架或近景道具再跑 `Script_MotionVectorContractTest.mjs` 与
  `Script_CarriagePropVelocityTest.mjs`。

## 7. 已知没做完的（2026-09-24，Anim 包报告）

- 世界旋转的单帧突跳还剩 34 处（从 399 处降下来，多数改动前就有，例如 `BlastSlamBuried` 左上臂、`HeSwapDadaoRifle` 右前臂），没有逐个处理。（2026-09-28 按 §10 处理了其中 IK 换分支的那一类。）
- 几处抓握是手臂伸直够到的（臂长 1.1–1.4 倍，接触误差仍 ≤ 3 cm），画面上是锁直的胳膊；第一人称下日兵甲、乙与川军贴身穿插 5–8 cm，都在门槛内，待用户看。
- 对顺子（第一人称，没有身体）的接触浏览器量不了，只由烘焙端对 `player` 轨检查。

## 8. 洞口行刑修订（2026-09-26）

`IjaHairGrabPull` 保留冻结的 clip 名，实际接触改为前领。日兵甲在川军右前方约半米处跨步抓领，随后拔刺刀、割喉、擦刀并退回持枪站姿；五段沿用同一演员根。旧正面 0.28 m 的根距离让两人胸腹重叠，旧抓发动作在拉开距离后又够不到头顶。川军的防御手势降到胸前，空出刀刃和喉部；`CaptiveHeadPulledBack`、`CaptiveThroatCut`、`CaptiveClutchThroat` 与日兵甲动作均由独立 Blender 源工程重烘。

检查以正式模型和实际导演镜头为准：`Script_OpeningStoryboardsTest` 核对五段逐骨交接，`Script_OpeningClipsBrowserTest --clip=IjaHairGrabPull,IjaDrawBayonet,IjaThroatSlash,IjaWipeSheathBayonet,IjaReadyRifle,CaptiveHeadPulledBack,CaptiveThroatCut,CaptiveClutchThroat` 核对接触、脚滑和人体净空；`Script_OpeningStoryboardShots --shots=SB03_Blade,SB03_Slash` 与连续 01–03 验收实际镜头。源工程位于 OneDrive `AI/Models/Blender/Taierzhuang1938/OpeningExecution_20260926`，不入库。

## 9. 运行时播放层：过场动作自然化（2026-09-28）

用户反馈「过场里人物动作全都不太自然」。先用逐帧探针真实播放 01–02（每帧记录每个人的骨骼帧间转角、骨盆高度、朝向、着地脚位移，每 0.25 s 截图），按来源分类后改运行时，动作库数据本身不动。改前 → 改后（01–02 全程，活人、30 m 内）：单帧 ≥25° 的骨骼跳变 446 → 211 帧（腿部 187 → 48），≥60° 122 → 28，骨盆单帧高度跳 172 → 84；剩下的 ≥60° 大多在下面「还没做的」烘焙数据里。

- **混合在所有叠加层之后做**（`Script_OpeningStoryboardAnimation`）：姿态混合从「clip 采样之后、说话表演与握枪修正之前」挪到这两层之后，起点是上一帧**最终显示**的姿态。之前这两层在换 clip 那一帧整层开/关，手和前臂单帧拧 90–150°（罗班长指点进出、传令兵、战友起身）。握枪修正开关、受保护/只动头切换、加性动作（`BanterLaugh` 等）换条，即使 clip 没换也重启混合。
- **换根只混骨盆以下**：`RerootUnderPelvis`（`noBlend`）的根与骨盆直接用新 clip，四肢、脊柱、头照样混（原来整段不混，战友起身接走路手腕 123°、罗班长放下拖人前臂 69°）。骨盆旋转不能在局部空间混：换根前后根的朝向可差 180°（翻译逃跑）。
- **选弧不换边**：混合开始时按最短弧定下每根骨头走哪边，之后不再换（`SlerpArc`）。three 的 slerp 每帧都取短弧，两端接近相反时目标一动就换边（日兵乙端枪转背枪走，手腕 99°）。
- **交还 AI 也混**：导演放手（无 pose、无位移、无表演）后，原生姿态从最后显示的姿态用 `poseBlendS` 过渡；交还后立刻端枪的（`nativeCombat`）用 `combatBlendS` 0.12 s，不再一帧切过去（罗班长交还时前臂 146°）。
- **每帧开头还原原生姿态**：three 的 `PropertyMixer` 只在自己算出的值变化时才写骨头，常量轨道（背枪走/空手走的手、手指）写过一次就不再写；这一层在 mixer 之后改过骨头又不还原，旧值就一直留着——翻译站着时手腕停在某次混合留下的姿态，一起步 mixer 的值「变了」才写回，手腕一帧拧 148°。现在每帧开头把骨头还原成上一帧 `original.call` 之后的原生姿态（`baseBuffer`），与代码库其余层「mixer 采样前撤掉叠加」的约定一致。
- **定格保活**（`Script_OpeningActorPerformance.OpeningHeldLife`，数在 `Data_OpeningStoryboards.heldLife`）：导演用固定帧长时间摆着、又没有说话表演的人（Banter 全段 53 s 跪在洞口的罗班长、02 Hold 端枪站 10 s 的日兵乙、揪领的 holdLoop）自动加呼吸、胸口侧摆和慢速视线漂移；看守骨骼角速度低于 `stillRadS` 才淡入，clip 一动 0.12 s 内退出；脸在 clip 里对准第一人称的动作头部幅度只给 `faceAimedShare`。说话表演层的手势按「站定」权重淡入淡出（约 0.3 s），不再在起步那一帧消失。
- **走位缓动**（`Script_OpeningStoryboards.Move`，数在 `Data_OpeningStoryboards.pace` / `turnAccelRps2`）：不带 clip 的自由走动按加速度起步、按 `sqrt(2ad)` 减速停在路线**末点**（`Follow` 传剩余路程，拐角不减速）；转身有角加速度、到角度前收住，最高仍是 `turnRps`。带 clip 的位移（拖人、成对站位）与 `Settle` 不缓动，保证接触对位。
- 全游戏共用的两处也在这一轮修：脚底锁定松锁（[位移与步态同步](Data_ActorLocomotion.md)「松锁」）；P012 站定钉帧不再被 `aim 0.18` 打断（原来洞外背景兵、喊话兵每 2.9 s 原地「上前两步」再弹回，`Script_FirstLevelP012CastAppearance`）。
- **2026-09-29 审问前两个日兵脚步抽搐**（用户：「川军被审问之前两个日军的脚步动画在抽搐」；同一探针，60 fps 真实播放 Wake→Found，记日兵甲乙腿部骨骼帧间转角、着地脚位移、原生 clip）：
  - 日兵甲背好枪站到拖人位后 0.5 s 里 `RelaxedWalk` / `RelaxedStand` 来回切了 5 次，腿在走路片的半步姿势和站姿之间跳（单帧 24°、脚 16 cm）。导演报的位移是 0，是 P012 动作层（`Script_FirstLevelP012CastAppearance` 的 `UpdateP012ActorMotion`）自己拿根节点位移重算速度：AI 的身体步进每帧把他挪零点几毫米、导演再放回去，量出来 0.03–0.05 m/s，正好压在走/站的线（`movingMps` 0.035）上。现在背枪/空手/警戒步态由导演带着时传 `locomotionTracked:false` + 导演的位移速度，P012 动作层照这个速度走，不再自己量。
  - `CollarControl` 等「边走边做的站立片」（`TRAVEL_LEGS_CLIPS`）的腿原来按位移 > 0.05 m/s 一帧切到原生步态、一帧切回来：日兵甲走两步揪住川军衣领停下那一帧大腿 37°、脚 34 cm。现在腿在两者之间按 `poseBlendS` 渐变。`IjaReadyRifle` 加进这张表：日兵乙在 CaptiveWall 边走 1.6 m 边端枪，原来整段是站姿的腿贴地滑过去。
  - 锁脚层循环接缝上的一步（[位移与步态同步](Data_ActorLocomotion.md)「跨接缝的一步」）。
  - 改前 → 改后（审问前，日兵甲乙）：原生 clip 来回切换 日兵甲 FrontPass 8 → 3 次、CaptiveWall 6 → 2 次；腿部单帧最大转角 FrontPass 24° → 12°、揪领停步 37° → 7°、日兵乙端枪 17° → 12°。其余人物（翻译、战友、纵深日兵）各段逐项对照没有变差。

**还没做的**（已在 §10 处理，2026-09-28）：动作库里仍有 IK 解中途换分支的帧（前臂/手/小腿绕自身轴约 180°，烘焙端已有扭转展开与 30°/帧滚转限速，但求解器仍会换分支）。本轮探针在 01–02 里看到的：`BlastSlamBuried` 左手、`BlastDazedStir` 右前臂、`CaptiveDraggedFromDirt` 左脚、`CaptiveWallBrace` 头、`IjaSlingRifle` 右前臂、`IjaCollarDragSnag` 左上臂、`IjaVaultTimberIn/Out` 小腿与脚、`IjaParriedChoppedFall` 左上臂、`HeSwapDadaoRifle` 右手、`HeDadaoParryChop`、`LuoDadaoChopRear` 左前臂、`WoundedRiseWall` 左手；未用到的 `ButtThreat` 五套骨架都有。

## 10. IK 换分支重烘（2026-09-28）

§9 末列出的那些 clip 里，前臂、手、大腿、小腿、脚在相邻两帧之间绕自身轴转 140–180°，之后停在另一边，01–02 过场里表现为肢体突然一拧。逐帧看（世界旋转拆成「骨头方向的摆动」和「绕骨头自身的扭转」）原因有四类，改法如下。烘焙脚本的改动都只在出问题的帧上起作用，连续的帧逐位不变，所以没重烘的相邻 clip 照样能接上（§6 的交接检查全过）。

1. **腿：膝盖朝向跟着 IK 的最短旋转走，不跟着膝盖弯曲的平面走**（`CaptiveDraggedFromDirt` 左大腿 0.79 s 一帧转 167°、`IjaVaultTimberIn/Out` 小腿 107–167°）。新加 `LegRoll`：大腿绕自身轴转到膝盖真正弯曲的那个平面上，小腿从静止姿态重新对准脚踝（膝盖成纯铰链），脚保持世界朝向。站、坐、跪的原有偏差 ≤ 45° 的不动；超过 45° 的按 1:1 斜率逐步去掉，超过 90° 的全部去掉；大腿被拉到接近反方向（离静止方向 150–170° 以上，被拖着走时膝盖顶到胸口）时全部去掉；离地（spec `groundWeight` 为 0，翻越的腾空段）时全部去掉。
2. **肘、膝在「肩—腕」「髋—踝」连线周围一帧甩到另一边**（极向量掠过这条线；`BlastSlamBuried` 左臂 0.33 s 一帧 176°）。新加 `LimitSwivel`：肘（膝）绕这条线的转角在胸（骨盆）坐标里每帧最多 30°，手腕（脚踝）和手（脚）不动，握点、着地点不受影响。几乎伸直的那几帧记住上一次的弯向，重新弯曲时从那一边继续。接续上一条 clip 的，从上一条最后一帧的弯向起步（和扭转分支一样用种子）。
3. **前臂扭转一直展开下去**：旧烘焙里有几处一帧转回来的「甩」（`BlastSlamBuried` 左前臂 166°、`CaptiveWallBrace` 右前臂 1.29 s），甩掉之后后面整串 clip 都在另一支上。去掉甩之后前臂和手腕会一直停在各转 160–170° 的姿态。新加 `TWIST_MAX`（默认 320°，clip 可用 spec `twistMax` 另设）：展开超过这个值就取回 ±180° 以内的那一支，前臂按 30°/帧的滚转限速在几帧里转过去。`BlastSlamBuried` 设 200°，让左前臂在爆炸那几帧里转回去（原来是一帧）。`IjaButtStrikeCollar` 设 400°（顶点循环的接缝要是同一个姿势，不能在循环里换支）。
4. **关键帧本身一帧跳过去**（抓握瞬间开/关、手的目标一帧换到另一处、轨迹穿过肩关节），逐条改关键帧：
   - `WoundedRiseWall`：左手离开墙后先到肩前，再用 0.2 s（1.9–2.1 s）握上护木；`StoopRifle`（端枪姿势）的枪轴前倾，护木不再贴在左肩前 13 cm（原来左臂折到 170°）。
   - `BlastSlamBuried`：两手从握枪处在 0.05–0.20 s 松开甩出（原来 0.08 s 一帧跳到胯边再甩上去）。
   - `BlastDazedStir`：右手摸头的位置离肩远一点（手肘 140°，原来 163°），上去（2.1–2.6 s）、下来（3.45–3.85 s）经过胸前，不再从肩关节穿过。
   - `CaptiveWallBrace`：左手 0.32–0.54 s 从垂着伸到墙上（原来两帧），右手 0.9–1.45 s 放回伤口（原来 0.15 s）；这两个权重在 Pose 里单独设，不加关键帧行（关键帧会把前一个值带到下一行，加一行就把所有通道都钉住了）。
   - `HeSwapDadaoRifle`：右手 0.18 s 松开插在地上的大刀，伸到肩上方 17 cm（原来贴在肩上，手肘 155°），0.16 s 握上背上的枪；枪 0.72–1.04 s 从背上拿下（原来 0.28 s），左手 0.30 s 握上。
   - `HeDadaoParryChop`：左手 0.30–0.55 s 握上长柄、0.62–0.82 s 松开（原来各 0.08 s）。`LuoDadaoChopRear`：左手 0.28–0.44 s 松开（原来 0.06 s），砍完收刀的低位从 0.60 s 挪到 0.66 s。
   - `IjaSlingRifle`：举枪时枪在肩前 22 cm、握在离托底 0.45 m 处（原来握点贴在肩上，手肘 179°），0.30–0.48 s 松手。
   - `IjaParriedChoppedFall`：两手抓枪 0.16 s，左手等枪离开肩膀后 0.18–0.34 s 才握护木（原来伸过胸口去够右肩，左臂折平），被磕开时左手 0.18 s 甩出。
   - `IjaVaultTimberIn/Out`：腾空最高那几帧两脚低 1–8 cm（仍高过木头顶 5 cm 以上），翻进时左手 0.06–0.34 s 把枪举起（原来 0.12–0.30 s，同时拳头离肩远一点），翻出时左手 0.72 s 起伸向木头（原来 0.80 s）。
   - `ButtThreat`、`ShotCollapse`（09-22 的旧 clip，用俘虏库的 Author 摆姿势，不走求解）：摆好之后补上和其他 clip 一样的连续性处理（肘弯向限速、上臂滚转、前臂扭转展开）；`ButtThreat` 两手握枪，枪竖直时 `GripPalms` 换参考方向，两手一帧绕枪杆转 180°，`KeepGripBranch` 选同一个握法的另一支（手绕枪杆转半圈、握点不动）。

另外：
- **手的目标在够不着的地方时**（`BlastDazedStir` 右手在 1.7 倍臂长外的土里），`RelArm` 在世界目标与身体目标之间过渡时，先把够不着的那一端收到臂长处（权重 0 或 1 时姿势不变）。原来胳膊伸直不动、到过渡后 40% 才一下子跨过去。
- **接续的扭转分支**：`IjaSlingRifle` 现在从 `IjaReadyRifle` 的最后一帧起步（原来两者右前臂差 178°，过场切换时甩半圈），后面 `IjaCollarDragSnag`、`IjaKickBeam`、`IjaVaultTimberOut`、`IjaHaulForearmUnder` 跟着重烘（右手垂着那 7 秒里原来手腕一直拧着 164°）。`IjaButtStrikeCollar` 的右前臂从 `IjaHaulForearmUnder` 结尾的那一支起步（spec `seedAnyHand: 'R'`：手不是同一个姿势也取最近的那一支，导演在两者之间做混合）。一条 clip 只从烘焙顺序在它前面的 `prev` 取种子，所以 `Script_OpeningStoryboardClips` 末尾把 09-27 的翻越/拖拽三条挪到 `IjaButtStrikeCollar` 前面烘（`_BakeBefore`，只影响烘焙顺序和骨架文件里 clip 的顺序）。
- `CaptiveDraggedFromDirt` 手腕接触点跟着前臂转了 0.7 cm，`IjaPullArm`（IJA01）用新的伙伴轨重烘（右手接触 3.2 cm → 1.6 cm）。

- **手腕/前臂蒙皮扭转，spec `twistSplit`（2026-09-29）**：骨架把手骨绑定朝向绕前臂轴转了 81°，`ArmRoll` 原来的对半分没扣掉它，palm-up 的手在肘 81°、腕 162°，两块蒙皮的手腕会捏成一条线。带 `twistSplit: (肩, 前臂, 腕)` 的 clip 按相对绑定姿势、就近分支量扭转并按份额分给三个关节，别的 clip 逐位不变。口径与实测见 [压弹动作与自由视角](Data_OpeningFirstPersonLoad20260927.md)「手腕捏成一条线」。

**重烘清单**：NRA02 `WoundedRiseWall`、`BlastSlamBuried`、`BlastDazedStir`、`CaptiveDraggedFromDirt`、`CaptiveWallBrace`、`HeDadaoParryChop`、`HeSwapDadaoRifle`；NRA05 `LuoDadaoChopRear`；IJA02 `IjaSlingRifle`、`IjaCollarDragSnag`、`IjaKickBeam`、`IjaVaultTimberIn`、`IjaVaultTimberOut`、`IjaHaulForearmUnder`、`IjaButtStrikeCollar`、`IjaParriedChoppedFall`；IJA01 `IjaPullArm`；五套骨架的 `ButtThreat`、`ShotCollapse`。先 `OPENING_PASS=partner`（NRA02 `CaptiveDraggedFromDirt,CaptiveWallBrace`，IJA02 `IjaParriedChoppedFall`），再 bake。可编辑工程与伙伴轨在 OneDrive `AI/Models/Blender/Taierzhuang1938/OpeningIkBranch_20260928`（伙伴轨起点拷自 `OpeningPinnedRescue_20260927`）。manifest 版本 `20260928OpeningStoryboardsV15IkBranch`（接在压木救人改稿的 V14 之后）；bake 会整份重写 manifest（数字和中文的写法会变），交付时只把版本号和五个 `models` 行并进已提交的 manifest。

**改前 → 改后**（压木救人改稿之后的 master，五套骨架全部 163 条 clip，相邻帧）：绕自身轴的最大扭转 178° → 61°（最大的是 `IjaVaultTimberOut` 腾空时的左大腿）；存储值（局部旋转）> 45° 的帧 285 → 255；世界旋转 > 45° 的帧 191 → 130。表中各 clip 的最大摆动（骨头方向一帧转多少）：`BlastSlamBuried` 165° → 59°、`WoundedRiseWall` 125° → 29°、`IjaSlingRifle` 141° → 55°、`HeDadaoParryChop` 109° → 56°、`HeSwapDadaoRifle` 108° → 53°、`LuoDadaoChopRear` 107° → 56°、`IjaParriedChoppedFall` 107° → 68°、`CaptiveWallBrace` 96° → 56°、`ButtThreat` 179° → 84–87°。

实际流程里（§9 的逐帧探针，60 fps 真实播放 01–02，30 m 内每个人，关键骨骼相对 root）：一帧转 > 45° 的 38 → 21 次、> 90° 12 → 5、> 140° 9 → 2；剩下两次 > 140° 不是动作库（翻译 `gait:unarmed` 的大腿、`BunkerFollowB` 的原生动画）。`CaptiveDraggedFromDirt` 接 `CaptiveWallBrace` 那一帧探针报头部 90°，是换根（前者终帧朝 −90°、后者首帧朝 0°，`ChainRoot` 转 root），世界姿态连续：头 < 0.2°，躯干、腿 < 0.3°，只有右手 17°（改前就有）和左上臂 7°。

**剩下的**：以上剩下的 45–87° 都是摆动（骨头方向转），不是换分支：砍刀的挥砍和收势、爆炸把手臂甩开、`ButtThreat` 枪托砸下、翻越的收腿蹬腿；`CaptiveDraggedFromDirt` 0.83 s 左膝从胸前落到地上两帧各 60–67°（脚踝从髋关节 7 cm 处经过，那一刻膝盖只能绕着很短的髋—踝连线转，要改拖拽时左脚的路线才能再慢下来）。`IjaLookBackLow`（不在现在的流程里）接 `IjaButtStrikeCollar` 右前臂差 163°。`HeDadaoParryChop` 结尾接 `HeLiftTimber`（压木救人改稿的新 clip，没重烘）时左前臂局部差 66° → 114°：砍完那段左手的扭转回到了 ±180° 以内的那一支，`HeLiftTimber` 从自己的姿势起步，两者之间是导演的混合（整条胳膊从握刀换到抬木头）。压木救人改稿（2026-09-28）之后 `IjaSlingRifle`、`IjaCollarDragSnag`、`IjaKickBeam`、两条翻越、`IjaHaulForearmUnder`、`IjaButtStrikeCollar` 已不在导演流程里，仍在库里，按上面的清单一起重烘。

## 11. 2026-10-11 开场改稿 A 包（洞内六人、扎尸、机枪组、验枪撕章拧伤口）

契约 [Data_OpeningRedraft20261011Contract.md](Data_OpeningRedraft20261011Contract.md) §4.2 A 行。代码在 `_import/Script_OpeningStoryboardClips.py` 末尾 `# ==== 2026-10-11 redraft A ====` 块（全局名一律 `Ra` / `RA_` 开头，B 包的块接在后面）；manifest `20261011OpeningStoryboardsV24Redraft`；可编辑工程与伙伴轨 OneDrive `AI/Models/Blender/Taierzhuang1938/OpeningRedraft_20261011_A`（`OPENING_BLEND_DIR`，伙伴轨起点拷自 `OpeningWoundedRescue_20260930`）。全部无头 Blender 5.1 烘（`blender -b --python`，没开 BlenderMCP）。

- **P0（12 条）**：`YaowaCrouchCatchEat`、`ComradeEatBreadToss`、`ComradePourRoundsLaugh`、`ComradeCatchDropPick`（NRA02）；`HeHelmetSleepSitUp`、`LiuDivideAmmoToss`（NRA05）；`IjaStompStabTwist`（IJA01，契约表写 IJA02，两套都烘）+ `CorpseStabbedClaw`（NRA02）；`IjaInspectRifleBoltToss`、`IjaThumbWoundTwist`（IJA01）+ `CaptiveArchCaught`（NRA02）；`IjaTearBadge`（IJA02，配不重烘的 `CaptiveKneelMud`）。
- **P1（8 条）**：`LiuBoxUpGo`（NRA05）、`IjaWalkStabProne`（IJA01/02）、`IjaGrenadeKnockThrow`（IJA01/02）、`IjaDropInKneel` / `IjaDropInStand` / `IjaDropInPoint`（IJA01/02/03）、`IjaProneLmgOnCorpse`（IJA01）、`IjaKneelLoadLmg`（IJA03）。`IjaHeaveCorpseLip` 没做。
- **成对站位**（manifest `stages`）：`breadToss`（冬瓜丢饼角 → 幺娃接，幺娃 `offsetS` 2.5）、`liuToss`（刘丢一夹到顺子腿上，`shunzi` 只给位置）、`sweepStomp`（第三具尸体 + 乙踩背补刀，乙 `offsetS` 0.667）、`tearBadge`（甲站 `collarQuestion` 同一个点撕胸章）、`thumbWound`（乙在冬瓜左侧拧伤口）。
- **新接触点**：`badgeChestL`（左胸胸章）、`woundShoulderL`（左肩前的枪伤）、`backStab`（趴着的人两肩胛之间）、`backLow`（后腰）。五套骨架文件的 `contactPoints` 都多了这四个。
- **新道具轨名**：`bread` `breadPiece` `clipA` `clipB` `comradeRifle` `rifleBolt` `chestBadge` `grenade` `type11` `ammoBox`（契约 §5.2 的名字）+ `helmet`（何有田手里的钢盔，契约没列，新加）。轴的约定写在 manifest `props[名].redraftA`。运行时 `OpeningPropSet` 只认识 `bayonet` / `beam` / `rifle`，其余名字的网格由 Set 包接。
- **工具**：`RaRotatePose`（按站姿写好的平面姿态整体翻转成趴/侧躺：位置、骨盆、脊柱/颈/头的世界轴倾斜按共轭换算，脚角换成 `toeDir`）；`RaYaw`（整身绕骨盆转向，抓握点一起转到世界，`framedGrips`）；`RaR3Spec`（R3 坡上任意角色的地面/板墙/审片，`SlashGroundSpec` 只认 ijaA）。
- **测试**：`Script_OpeningClipsBrowserTest` 里带 `blade` + `stab` 接触的 clip 用上了刺刀的步枪播（导演生成乙时同样要 `bayonetFixed`）。`Script_OpeningActorPerformance` 的 `ContactClips` 加了这 20 条（手里拿东西、成对动作，不叠说话手势）。
- **实测**（烘焙报告，运行时米）：脚滑 ≤ 1.0 cm、接触误差 ≤ 2.3 cm、穿墙 ≤ 1.6 cm、膝盖 ≤ 0.9 cm、骨盆单帧 ≤ 0.2 m；四肢绕自身轴单帧最大仍是旧的 61°（`IjaVaultTimberOut`），新 clip 没有更大的。浏览器审片（正式 GLB）：脚滑 ≤ 1.0 cm；`sweepStomp` 刺刀到 `backStab` 2.5 cm、两人四肢最深 7.7 cm、躯干/头 0；`tearBadge` 握点 0.4 cm、4.9 cm / 0；`thumbWound` 0.6 cm、0 / 0；`breadToss` 0 / 0。
## 12. 2026-10-11 开场改稿 AnimB（练刺刀、背后割喉、擦刀卡枪、补刀、踩手、划脸、端枪、咬销）

契约 [Data_OpeningRedraft20261011Contract.md](Data_OpeningRedraft20261011Contract.md) §4.2 的 B 行。代码在 `_import/Script_OpeningStoryboardClips.py` 文件末尾 `# ==== 2026-10-11 redraft B ====` 块；manifest `20261011OpeningStoryboardsV24Redraft`；可编辑工程与伙伴轨在 OneDrive `AI/Models/Blender/Taierzhuang1938/OpeningRedraft_20261011_B`（伙伴轨起点拷自 `OpeningWoundedRescue_20260930`）。

- **复用了什么**：割喉的拳握刀（`FistKnife`/`CloseFist`）、刀身与脖子相切（`NeckBlade`）和 `SLASH_DRAW` 拉割节奏原样用，只把左右镜像（甲站在身后，刀从喉咙左侧拉到右侧，朝自己拉）；拔刀用 `IjaDrawBayonet` 的十字拔刀、拳中翻刀（`ScabbardKnife`/`GripTurn`/`CarryPalm`），并进了 `IjaHairLiftKneeBack` 开头（原 `IjaDrawBayonet` 的左拳揪在旧跪位川军头发上，不能接在蜷着的人身后播）；两刀的蓄力—刺出—停—拔的节奏取自 `IjaBayonetDownThrust`；`IjaBootOnHand` 末帧就是 `IjaCrouchHairHold` 第 0 帧（蹲下不挪脚）；`IjaGrenadeBitePin` 第 0 帧就是 `IjaShotStaggerAway` 的保持帧；丁的起手是 `IjaReadyRifle` 末帧（为此 `IjaReadyRifle` 也烘到了 IJA03）。
- **新接触部位**（`CONTACT_POINTS`）：`cheekR`/`cheekL`（脸颊）、`shoulderFrontL`（左肩前，第一刀）、`bellyFront`（第二刀）、`lowerBack`（膝顶处）、`upperArmL`（擦刀的绷带）。
- **站位**（stage，锚点川军 = R3 = `CaptiveKneelMud` 的根，朝南）：`recruitSlap`（锚点丁）、`recruitThrust`（丁在 R3 东南 1.2 m 朝他左肩前）、`hairLift`/`kneeCut`/`bandageWipe`（甲在川军身后、板墙前 (0.02, 0.16)，朝西南）。川军被扎后转向西南、右侧着地蜷在 R3 西南 0.35/0.30 m；提起后跪着面朝西南（喉咙朝眼位），割后往前扑倒，腿往他右边拖（甲往左边让开）。
- **链**：川军 `CaptiveKneelMud`→`CaptiveStabbedCurl`（保持循环起点）→`CaptiveCurledPulledUp`（保持循环起点）→`CaptiveThroatCutForward`；甲 `IjaHairLiftKneeBack`（保持循环起点）→`IjaThroatCutKneeShove`→`IjaWipeBandageFixBayonet`→`IjaFinishWalkStab`（可接自己）→`IjaBootOnHand`→`IjaCrouchHairHold`；丁 `IjaReadyRifle`→`IjaRecruitSlapped`→`IjaRecruitChargeThrust`，`IjaRecruitCheekCut`→`IjaRecruitLevelRifle`。逐骨交接实测：川军三处、丁四处、甲 割前→割、割→擦刀、踩手→蹲 ≤1.2°/0 cm；擦刀→补刀、补刀自接、补刀→踩手 3.6°（种子不同，导演 0.12 s 混合盖住）。
- **烘焙要点**：蜷倒时腿要随胯一起转（留在坡上让胯翻过去，两条大腿一帧 178° 换支）；保持循环开始前所有动作要收完（丁最后一步、端枪的下蹲曾进循环窗，接缝 9°/8 cm）；甲在割后、擦刀时都要从尸体腿边让开（浏览器穿插 10–20 cm 的来源）。
- **验收实测**（本轮）：`Script_OpeningStoryboardsTest` 全过（四肢绕自身轴最大仍是旧的 61°，B 段最大 30°）；`Script_OpeningClipsBrowserTest --clip=<B 十四条>` 全过：成对穿插最大 8.0 cm（四肢，揪发时的前臂），躯干/头 0 cm；揪发 2.5 cm、割 0.2 cm、擦刀 0.7–0.8 cm、反手耳光 0.8 cm；烘焙探针刺入肩/腹 0.0 cm、刀抵左颊 0.02 cm、刀尖悬背 0.0 cm、端枪对眼 0.4 cm。
- **没做**：`NraShotTumbleSteps`（P1）未烘，导演用受击物理方向死亡替身（契约 §4.2 允许）。钢盔是头部蒙皮，丁挨耳光后「钢盔歪」做不出来，只做了左手扶钢盔。

## 13. 2026-10-11 打磨轮 PolishAnim（割喉倒向、ChargeB 滚台阶、机枪组中弹、推尸上沟沿）

任务书 `REL/附件/briefs/Brief_PolishAnim.md`。代码在 `_import/Script_OpeningStoryboardClips.py` 末尾 `# ==== 2026-10-11 polish ====` 块（全局名 `Rp` / `RP_` 开头，前面各块一字未动；改旧 clip 的方式是同名重新登记 `Builder`、改 `CLIPS[名]['notes']`）；manifest `20261011OpeningStoryboardsV25Polish`；伙伴轨与可编辑工程用 OneDrive `AI/Models/Blender/Taierzhuang1938/OpeningRedraft_20261011_AB`（`OPENING_BLEND_DIR`）。只按骨架烘了下面这些 clip（`OPENING_CLIPS`），没有全量重烘；`IjaFinishWalkStab`、`IjaBootOnHand` 用 `OPENING_PASS=verify` 核对过与提交版逐位一致。全部无头 Blender 5.1。

- **割喉倒向（N17）**：`CaptiveThroatCutForward` 膝顶之后改为往他自己左侧倒（`RP_FALL` 110°，对着眼位看是往北壁脚下倒），脸朝下、身子略侧向右，贴着北壁脚躺，头朝东（终点头 (4.44,−125.26)、骨盆 (3.92,−125.43)，世界坐标按 R3 (4.06,−125.79) 朝南算），腿拖向西；胸口贴地（B 包原姿势是右前臂撑着、胸和头离地 0.1–0.2 m）。0–0.708 s（割、血喷北壁）与 B 包逐帧相同。没照任务书写的「左前方 40°」：先做了 40°，01 实跑（`Script_OpeningStoryboardShots` N17/N18）头落在沟底南半 (3.74,−124.72)，正踩在甲补刀走位 `IjaFinishWalkStab`（z −124.67 往西走到 x 3.6）的最后一步上，也压在眼位到岔口乙的视线上；北壁脚是那一带唯一没人走的地。
  - `IjaThroatCutKneeShove`：膝顶那一帧胯往前、往左 7 cm（跟着倒向）；之后不再往左跨 0.46 m（尸体现在倒在那儿），改为把弓步的左脚收回到右脚旁、站着往下看。复用 B 包的构造函数，只换掉它建的那一张胯/脚关键帧表。
  - `IjaWipeBandageFixBayonet`：B 包函数的副本，只改深蹲位置——从绷带接触点往他自己身后 0.36 m、左 0.05 m（尸体与北壁护板之间，`RP_WIPE_SQUAT`），蹲得更深（`RP_WIPE_DROP` 0.46 m，绷带离他脚下只有 0.1 m），两脚各踩各的地面（这里是 R3 的土坡，两脚高差 0.27 m），起身后的末帧也按坡面放脚；加了护板墙面检查。
  - 实测：浏览器审片 `kneeCut` 四肢最深 7.9 cm / 躯干头 0，`bandageWipe` 3.7 cm / 0，擦刀刀身到绷带 1.0 / 1.2 cm；烘焙端擦刀脚滑 0.5 cm。01 实跑 N17 判据全过（改前「乙被冬瓜挡住」「乙 x 0.373」两条红）。
- **`NraShotTumbleSteps`（NRA02，ChargeB）**：冲下弹坑台阶时右胸中弹，右肩被打得往后一拧、身子往左转、交叉绊一步，大刀 0.167 s 脱手飞到右前方地上（`weapon` 轨，`weaponDropFrom` 指自己），0.625 s 扑在坡上（左肩着地），顺坡往下滑着侧滚过左边翻成仰面，1.417 s 停住：仰面摊开、头朝坡下他的左前方、腿在坡上。**根在他停下的地方**（末帧骨盆在根上），第 0 帧在根右 0.66 m、后 1.40 m、高 0.80 m 处奔跑——台阶的坡在 clip 里（manifest `ground`：前进方向 0.15–1.30 m 内落差 0.80 m，按 chargeRoute x 3.3 那段坡的实测 0.9 m/1.2 m）。导演要把根放在他该躺的地方、朝他冲下来的方向，在他跑到根后 1.4 m、高 0.8 m 的坡上那一刻开枪；`rescue.fallenComrade` (1.28,−123.62) 往东南上坡正是 `BunkerMouthSpoil` 体块，起点放不进去，台阶脚 (2.3,−123.5) 一带可以（起点约 (2.9,−122.3)）。
- **`IjaLmgGunnerShotOnGun`（IJA01）**：第 0 帧 = `IjaProneLmgOnCorpse` 第 0 帧（同根）。0.042 s 中弹，肩和头往上往后一抽，随即瘫下、脸落到机匣旁（0.417），两手 0.30–0.75 s 离枪顺坡滑下，0.95 s 抽一下，1.25 s 后不动。无根运动；`type11` 轨一直停在第 0 帧的位置。
- **`IjaLoaderShotTumbleOffLip`（IJA03）**：第 0 帧 = `IjaKneelLoadLmg` 第 0 帧（同根）。0.083 s 中弹后仰、两手离开弹斗、被打得往左转，仰面倒向沟（沟沿边在他右后方 126.5°、0.10 m：按 `MgMarks` 的朝向 yaw 126.5° 算），0.583 s 仰躺在沿上头伸出去，头朝下顺沟壁滑到底，1.292 s 落到沟底仰面、腿搭在沟壁上，1.667 s 后不动。根运动：骨盆终点沿那条线外 1.12 m、低 1.81 m（沟壁剖面在 clip 里，manifest `ground`，按任务地形 x 7–8 实测）。
- **`IjaHeaveCorpseLip`（IJA01 / IJA03）**：根站在南壁脚前、面朝沟壁（壁脚在前方 0.30 m）；拖来的尸体脸朝下顺壁脚躺、中心在前方 0.42 m、头朝他左边。蹲下一手掏腋下一手抓腰带（`grab` 0.542），抱到胸前站起（`lifted` 1.05），左脚上前一步、举过头顶推上沟沿下的坡面（`heaved` 1.542：Set 在这一帧把尸体换成 `PlaceCorpse(…,{pose:"onLip"})`），松手、手放下、退回。道具轨 `corpse`（尸体中心、头的方向、背的法线，到 `heaved` 为止可见）：导演可以每帧 `PlaceCorpse(settle:false)` 把 Set 的尸体挂在轨上，不必从地上一下换到沟沿。无根运动。
- `Script_OpeningActorPerformance` 的 `ContactClips` 加了这四条；`Script_OpeningClipsBrowserTest` 让 ChargeB 拿大刀播。
- **实测**（烘焙报告，运行时米）：脚滑最大 1.73 cm（滚台阶交叉步）、接触 0、骨盆单帧最大 0.17 m（副射手落沟）；四肢绕自身轴单帧最大 66°（`NraShotTumbleSteps` 右小腿 0.33 s，交叉步）。三条摔落的接地抬升最大 0.21–0.23 m（翻滚中途手臂/头先碰到坡下的平地，那几帧身体整体被抬起一点）。
## 14. 2026-10-12 R2-Anim（跳沟脚贴沟沿、何有田的帽子、全量重烘为什么复现不了）

任务书 `REL/附件/briefs/Brief_R2_Anim.md`。代码在 `_import/Script_OpeningStoryboardClips.py` 末尾 `# ==== 2026-10-12 R2 anim ====` 块（全局名 `R2` / `R2_` 开头，前面各块一字未动，改旧 clip 的方式同 §13：同名重新登记 `Builder`、补 `CLIPS[名]` 的 `ground` 与 `notes`）；manifest `20261012OpeningStoryboardsV26R2`；伙伴轨与可编辑工程 OneDrive `OpeningRedraft_20261011_AB`。只按骨架烘了 `IjaDropInKneel` / `IjaDropInStand` / `IjaDropInPoint`（IJA01/02/03），无头 Blender 5.1。

- **跳沟三条贴着真沟沿**：A 包按「根后 0.55 m 起是 2.0 m 高的平台」写，北壁其实是坡：三个跳下点（`Data_OpeningSet0103` `dropIn.lip[i]` → 它的落点，共享地面采样 `CreateP012Terrain(L).SampleHeight`）在根后 0–0.05 m 是平沟底、0.05–0.85 m 是 1.9 m 高的陡坡、0.85–1.05 m 是 1.92–1.98 m 的沟沿肩、再往后是胸墙土堆。三条用同一条剖面 `R2_DI_PROFILE`（三处中线的平均，每 0.05 m 一点；三处在沟沿肩上相差 ≤ 2.5 cm），写进 manifest `clips[名].ground.profile`（`[根后方米, 离根处地面的高米]`）。
  - 第 0 帧两脚踝在根后 0.90 / 1.00 m 的沟沿肩上，各按自己鞋底下最高的地面放（`R2DiUnder`）；落地点比 A 包离墙远 0.10 m（A 包右脚跟落在坡脚上），落地后的站姿再离墙（跪 0.30、站 0.22、指 0.12 m）——A 包转身后左脚在根后 0.13–0.30 m，实际地形里踩进坡 23–25 cm（烘焙用平地，谁也没看见）。起跳、落地、`ready` / `point1` / `point2` 时刻和 holdLoop 都不变。
  - 起跳到落地多了 0.3 m 水平距离；飞到一半已走完 65%（`R2_DI_ARC`），落地前几帧和 A 包一样陡，骨盆每帧最大 0.19 m（平均分配是 0.199）。
  - 实测：浏览器审片新加的第 11 项（脚和脚趾蒙皮顶点到剖面）第 0 帧左 0.3 / 右 1.2 cm，着地窗口内 ≤ 1.9 cm，全程最深 −0.3 cm（不进地）；改前同一量法第 0 帧悬空 8–15 cm、落地后左脚进坡 23–25 cm。换成三处各自实测的剖面：丙（跪）第 0 帧 2.0 / 1.7 cm、着地 ≤ 2.2、最深 +0.4；丁（站）−0.5 / −1.0、≤ 1.1、最深 −1.1；甲（指）−0.4 / 2.3、≤ 2.3、最深 −0.6 cm。烘焙报告脚滑 ≤ 0.4 cm、骨盆单帧 0.19 m。
- **何有田的「钢盔」是帽子**：NRA02（何有田的身体，`Data_FirstLevelP012Cast` modelVariant 1）戴的是军便帽，不是钢盔，也不是单独的网格或材质——它在整身军装那个布料图元 `Material #1721585337` 里，帽徽是自己的图元 `Material #1721585500`（48 三角）。帽子能分出来靠蒙皮：帽子的布料三角三个顶点都只挂头骨（484 个），军装其余部分没有一个顶点挂头骨超过 5%。`_import/Script_NraHelmetProp.py` 从绑定姿势把这 484 + 48 个三角切出来，做成 `Model/Model_NraHelmet.glb`（道具名 `helmet`；原点在帽顶中心、帽檐那一圈的高度，局部 −Z 朝帽顶外、+Y 朝帽檐，运行时米 = GLB × 0.9135，浏览器里对着蒙皮后的帽子量出来的比例；布料贴图缩到 256 px，帽徽带自己的 6 KB 图）。
  - 头上那顶藏起来：给这一个人的布料网格换一份克隆的几何，把「三个顶点头骨权重 ≥ 0.9」的三角挪到索引最后，`setDrawRange` 截掉；帽徽网格（材质名 `Material #1721585500`）`visible = false`。不加着色器、不加程序。帽子下面本来就有头发，摘帽后不露洞（`_shots/R2Anim/Cap_*.png`）。
  - 道具的颜色要走他自己的军装换色：`TagCharacterSurface(prop, "TengxianNra02")`、每个网格 `userData.characterPbrSurface = true`、`ApplyNraUniform(prop, 他布料材质的 userData.nraUniformPalette)`，再把布料变体 `uCharGrimeSeed.w` 设成 10（刚体小件的做法：泥按高度画，道具自己的坐标里帽子在脚踝高度，不抬会一身泥）。直接用 GLB 里的贴图是图集原色（偏蓝），和他身上的灰军装不一样。
- **全量重烘为什么复现不了**（只查因，没有重烘旧 clip）：`OPENING_PASS=verify` 不带 `OPENING_CLIPS` 从零烘五套骨架 228 条，121 条与提交版不同。逐条找出它最后一次被烘的提交，再只烘可疑的几条（种子取提交版）对照：
  1. **烘焙器改了、clip 没重烘（104 条）**：最后一次烘在 2026-09-28 那次烘焙器改动（56ebe386：`LegRoll`、`LimitSwivel`、`TWIST_MAX`，以及给俘虏库摆姿势的旧 clip 补的手臂连续性）之前。09-22 的 18 条旧 clip × 五套骨架 90 条（`BayonetClearWood`、`CaptiveHeld`、`DadaoAmbush`、`KickRifle`、`PointBlockade`、`GuardTurn`、`MessengerReport`…：前臂绕自身轴 43–180°，骨头方向不差，位置 0 mm）；解算 clip 14 条（`YaowaSitLoad` 左大腿 88° 纯扭转、`InterpreterFlee` 右小腿 180°、`RunnerLeanPostCall`、`LuoDragToCover`、`IjaReadyRifle`（IJA01/02）、`IjaSlapRaise`、`IjaStartleTurn`、`HeLiftTimber`、`IjaButtStrike`、`IjaHoldCollarUp`、`InterpreterGrabCollar`、`IjaChoppedFallWall` / `IjaChoppedFallBack`（IJA01））。用 b366d39e（56ebe386 前一版）的烘焙脚本和动作库重烘其中 11 条，逐位等于提交版。
  2. **前一条重烘了、这一条从它末帧取扭转分支（15 条）**：全量烘时 IJA02 的 `IjaWipeSheathBayonet`（09-27 退出流程，按旧链留着提交版，属于上一类）用现行代码重烘，`IjaReadyRifle` 从它的新末帧起步，后面整串（10-11 的 `IjaStompStabTwist`、`IjaWalkStabProne`、`IjaRecruit*` 四条，09-28 的 `IjaSlingRifle`→`IjaHaulForearmUnder` 五条）前臂都换到另一支（180°）；只烘这一串、`IjaWipeSheathBayonet` 取提交版末帧当种子时，这 11 条逐位一致。`LuoKneelCheck` / `LuoKneelReach` 跟着 `LuoDragToCover`，`IjaShoveToWall` 跟着 `IjaDragCollarFromDirt`，`IjaLookBackLow` 跟着 `IjaReadyRifle`。
  3. **伙伴轨变了（1 条）**：`IjaDragCollarFromDirt`（09-27 烘）差 1.5°、1 cm，用 AB、09-30 目录的伙伴轨都一样差，用它当时的 `ComradeKneelBank_20260927` 目录逐位一致（09-28 `CaptiveDraggedFromDirt` 重烘后 `wristR` 挪了 0.7 cm）。AB 目录与之前目录不同的另两条（`CaptiveKneelMud` 多了 `badgeChestL`、`IjaChoppedFallWall` 只差法线）不影响任何 clip（`IjaPullArm` 等复现一致）。
  - 要做全量重烘的话：先决定第 1 类那 104 条要不要按新烘焙器重烘（重烘后逐条看审片，旧 clip 前臂会换支）；第 2 类给烘焙加「种子取提交版末帧」的开关（或把退出流程的 clip 标成不烘）；第 3 类让每条 clip 在骨架文件里记下烘它时用的伙伴轨目录与哈希。三类都可以在骨架文件里按 clip 记下烘焙器版本（提交号）和 `twistMax` / `seedAnyHand` / 种子来源，`verify` 时按记录复现。（§15 已按这个做了，记录放在 manifest 里，骨架文件一个字节没动。）

## 15. 2026-10-12 R3-Anim：按烘焙记录复现（全量 verify 228 条一致）

任务书 `REL/附件/briefs/Brief_R3_Anim.md`。只改烘焙器、manifest 和测试，**五个骨架文件（帧数据）一个字节没变**；manifest `20261012OpeningStoryboardsV27Repro`。

### 15.1 记录放在哪、有哪些字段

manifest `clips[名].bake[骨架]`，每条 clip 在每套骨架上一条（现在 228 条）：

| 字段 | 意思 |
| --- | --- |
| `solverVersion` | `20260927PreLimbContinuity` = 56ebe386 之前的烘焙器（没有 `LegRoll`、`LimitSwivel`、`TWIST_MAX`，摆姿势的旧 clip 也不补手臂连续性处理）；`20260928LimbContinuity` = 56ebe386 起的现行烘焙器 |
| `twistMax` | 前臂扭转展开的上限（度）；`null` = 不设上限（旧烘焙器就是这样） |
| `seedAnyHand` | 同 spec 键（`''` / `'L'` / `'R'`） |
| `twistSplit` | 同 spec 键，只有用到的 clip 才有 |
| `seed` | 扭转分支、手臂滚转、肘膝弯向和贴地抬高从哪一帧接：`baked:<prev>` = 这次烘出来的 `<prev>` 末帧（这次没烘它就用提交版）；`committed:<prev>` = 总是用提交版 `<prev>` 的末帧；`committed:<prev>@<提交号>` = 那个提交里的 `<prev>` 末帧（`git show` 读）；`null` = 不接 |
| `partner` | `{dir, tracks}`：伙伴轨目录（OneDrive `AI/Models/Blender/Taierzhuang1938/` 下的文件夹名）和这条 clip 读到的每条伙伴轨的 sha256（`<骨架>/<clip>`，含 builder 建 spec 时读的） |
| `frozen` | `true` = 退出流程的 clip，不重新解算，直接用提交版的帧（先核对哈希） |
| `commit` | 最先带着这组帧的提交（从 git 历史逐条比出来的）；还没提交的新烘是 `after:<当时的 HEAD>` |
| `valuesSha256` | 这条 clip `values` 按 little-endian float64 算的 sha256（-0 当 0 算：重烘出来同一组数有时零的符号会翻） |

现在的分布：旧烘焙器 125 条（§14 第 1 类 104 条，第 2 类里 09-28 前烘的 4 条，第 3 类 1 条，退出的 1 条，再加 R2 全量重烘时就一致的 15 条旧 clip：它们本来就是旧烘焙器烘的，按旧烘焙器烘也一致——判据是这组帧最先出现的提交在不在 56ebe386 之前）；`frozen` 1 条（IJA02 `IjaWipeSheathBayonet`）；`committed:` 种子 15 条（R2 第 2 类）；伙伴轨在旧目录的 2 条：IJA02 `IjaDragCollarFromDirt` → `ComradeKneelBank_20260927`、IJA01 `IjaPullArm` → `OpeningIkBranch_20260928`（后者在 AB 目录下也在 0.5°/1 mm 内，但只有 09-28 的轨能逐位一致）。

### 15.2 烘焙器怎么按记录走（`_import/Script_OpeningStoryboardBake.py`）

- 每个 pass（`bake` / `verify` / `partner`）开始读提交版 manifest 的记录；有记录的 clip 按记录烘，没记录的（新 clip）按现行烘焙器、spec 的键和 `baked:` 种子烘。
- 旧烘焙器：`Solve` 里摆姿势的 clip 摆完直接返回，解算的 clip 不做腿的 `LimitSwivel` + `LegRoll`、不做手臂的 `LimitSwivel`，`ArmRoll` 扭转不设上限。现行烘焙器的代码一行没改。
- 记录里的值优先于 spec：spec 后来加了 `twistMax` 之类、和记录不一致时打一行 `RECORD`，按记录烘。
- 伙伴轨：记录指了别的目录，就用那个目录的轨重新建这条 clip 的 spec 再烘；先逐条核对记录的哈希，对不上直接报错（让人把那份目录拷到 `OPENING_BLEND_DIR/legacy/<目录名>`，或用 `OPENING_RERECORD` 按现行重烘）。`legacy/` 是目录不在了时的后备位置。
- 清单之外：库的 `MakeClips` 每建一条 spec 前调 `K['Building'](名字)`（可选钩子，06 收尸库没有也没事），这样 builder 建 spec 时读的伙伴轨也算在那条 clip 名下。
- 每次跑完在骨架文件旁边写 `Data_<骨架>OpeningStoryboardsBakeRecord.json`（`verify` 写在 verify 目录，`bake` 写在 `OPENING_BLEND_DIR`，按 clip 合并）；`WriteManifest`（`bake` / `manifest` pass）只在这份记录的 `valuesSha256` 等于骨架文件里那条 clip 的帧时才把它并进 manifest，其余 clip 保留 manifest 里原来的记录。所以**烘新 clip 不会改旧 clip 的记录**。
- `OPENING_RERECORD=<clip,…>`（或 `all`）：这几条当新 clip 烘（现行烘焙器、新记录）。旧 clip 要换到现行烘焙器就这样烘，烘完逐条看审片（会换支的就是 R2 列的那些前臂）。

### 15.3 怎么复现

```powershell
# 每套骨架一个进程，可以并行；OPENING_BLEND_DIR 指 OneDrive OpeningRedraft_20261011_AB
$env:OPENING_PROJECT="<worktree>\Taierzhuang1938"; $env:OPENING_PASS="verify"; $env:OPENING_MODEL="TengxianIja02"
blender --background --python-exit-code 1 --python Taierzhuang1938/_import/Script_OpeningStoryboardBake.py
node Taierzhuang1938/Script_OpeningStoryboardsTest.mjs --rebake=tmp/OpeningStoryboards/Verify
```

实测（无头 Blender 5.1，五个进程并行，每套 2–6 分钟）：

- 改前（master `0c98e6c7` 的烘焙器）：228 条里 121 条超出 0.5°/1 mm（同 R2）。
- 改后全量：228 条全部在 0.5°/1 mm 内（`ok rebake: 228 rig clips`）。其中 104 条逐位相同，114 条数值相同、只有若干个零的符号不同，10 条最大差 2–6e-6（0.001° 以内、0.00 mm，第六位小数的舍入）：IJA02 `IjaKickBeam`、`IjaLookBackLow`、`IjaReadyRifle`、`IjaRecruitChargeThrust`、`IjaRecruitLevelRifle`、`IjaShotStaggerAway`、`IjaSlapBackhand`、`IjaSlapForehand`、`IjaVaultTimberOut`，NRA02 `YaowaSitLoad`。
- 只烘几条（`OPENING_CLIPS=LuoKneelCheck,CaptiveHeld,IjaDragCollarFromDirt`，NRA05 / IJA03 / IJA02）：5 条也一致。
- 查出来的一条 R2 没分出来的：IJA02 `IjaLookBackLow`（09-26 b6fe4f57 烘）接的是当时的 `IjaReadyRifle`，后者 09-27 又重烘过，所以种子要用 `committed:IjaReadyRifle@b6fe4f57`；用现在的提交版仍差 180°。

### 15.4 以后新 clip / 改旧 clip

- 新 clip：照常 `OPENING_CLIPS` 烘，记录自动生成（现行烘焙器、`baked:` 种子、AB 目录与轨哈希、`commit: after:<HEAD>`），`bake` 或 `manifest` pass 写进 manifest；提交后 `commit` 留着 `after:` 也行（它只是说明，测试只认 `valuesSha256`）。
- 改了旧 clip 的 builder 再烘：它仍按自己的记录烘（比如旧烘焙器）；要换现行烘焙器加 `OPENING_RERECORD`。
- 伙伴轨重新导出后，读它的 clip 下次 `verify` 会报哈希对不上：要么一起重烘（`OPENING_RERECORD`），要么把旧目录拷进 `legacy/`。
- 回归口：`Script_OpeningStoryboardsTest.mjs` 新加一段——每条 clip × 骨架都要有记录、`solverVersion` 认得、`valuesSha256` 必须等于提交的帧（忘了更新记录就红）、`frozen` 只给 `retired` 的 clip、`seed` 只能指自己的 `prev`。
