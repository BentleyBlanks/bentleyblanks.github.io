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
