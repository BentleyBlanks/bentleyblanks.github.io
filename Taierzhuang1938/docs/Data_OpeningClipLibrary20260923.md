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

## 6. 回归口

- 2026-09-27 新增 `IjaVaultTimberIn` / `IjaVaultTimberOut` / `IjaHaulForearmUnder`（只烘 IJA02）与 spec 键 `groundWeight(t)`（翻越离地、跪地那几帧不贴地），口径见 [翻越与倒拖](Data_OpeningVaultHaul20260927.md)。
- `Script_OpeningStoryboardsTest.mjs`（纯 node）：每套骨架每个 clip 脚滑 ≤ 2 cm、接触误差 ≤ 3 cm、穿墙 ≤ 3 cm、骨盆每帧 ≤ 0.2 m、膝盖 ≤ 2 cm；
  声明了墙面接触的时段离墙、进墙都 ≤ 3 cm；同根交接逐骨 < 2°、道具跳动 ≤ 2 cm；holdLoop 接缝按世界空间 ≤ 2°、≤ 1 cm。
- `Script_OpeningClipsBrowserTest.mjs`（浏览器，tier2，`openingStoryboards` 领域；`--shots` 出四视角审片图到 `tmp/OpeningClipsReview/`，`--clip=名,…` 只跑几条）：
  用正式 GLB 与运行时加载链逐条播，量脚滑、成对接触、骨长变化 ≤ 1%、NaN、人与人穿插（躯干 / 头 ≤ 3 cm，带四肢 ≤ 8 cm）和运行时道具行为。
- `Script_OpeningFirstPersonTest.mjs`、`Script_OpeningActorPerformanceBrowserTest.mjs`；改了共享骨架或近景道具再跑 `Script_MotionVectorContractTest.mjs` 与
  `Script_CarriagePropVelocityTest.mjs`。

## 7. 已知没做完的（2026-09-24，Anim 包报告）

- 世界旋转的单帧突跳还剩 34 处（从 399 处降下来，多数改动前就有，例如 `BlastSlamBuried` 左上臂、`HeSwapDadaoRifle` 右前臂），没有逐个处理。
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

**还没做的**：动作库里仍有 IK 解中途换分支的帧（前臂/手/小腿绕自身轴约 180°，烘焙端已有扭转展开与 30°/帧滚转限速，但求解器仍会换分支）。本轮探针在 01–02 里看到的：`BlastSlamBuried` 左手、`BlastDazedStir` 右前臂、`CaptiveDraggedFromDirt` 左脚、`CaptiveWallBrace` 头、`IjaSlingRifle` 右前臂、`IjaCollarDragSnag` 左上臂、`IjaVaultTimberIn/Out` 小腿与脚、`IjaParriedChoppedFall` 左上臂、`HeSwapDadaoRifle` 右手、`HeDadaoParryChop`、`LuoDadaoChopRear` 左前臂、`WoundedRiseWall` 左手；未用到的 `ButtThreat` 五套骨架都有。要逐条回 Blender 重烘并重跑 §6 的接触门禁。
