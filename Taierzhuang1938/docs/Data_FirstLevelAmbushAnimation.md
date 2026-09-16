# 第一关屋内伏击动画库

2026-09-15 新增，2026-09-16 扩到八条。第一关公开阶段 9（内部 `Melee` 段）的屋内伏击
用到的人物动作：日军三人从藏身处起身、两种刺刀捅人、**一记枪托把玩家砸倒**、**被地上的
玩家反杀**；国军担架员被捅倒地、老周在担架上被捅与之后的负伤喘息。编排、触发与数值属于
[屋内伏击](Data_FirstLevelRoomAmbush.md)，台词与字幕时序属于
[屋内伏击配音同步](Data_FirstLevelVoiceSyncRoomAmbush.md)，本页只讲动作
资产本身：怎么做的、放在哪、验收数字是多少、缺什么。

资产与车厢开场那一套[同构](../Animation/FirstLevelCarriage/Data_FirstLevelCarriageAnimation.md)：
在**原始 53 骨骼**上写骨骼局部曲线，运行时不导入新骨架，也不碰 Soldier / Actor 的世界根。

## 1. 需求

| 需求 | 本轮做法 |
| --- | --- |
| 伏兵从蹲藏到白刃预备 | `AmbushRise`，末帧落在白刃库 `BayonetGuard` 的邻域（骨盆高度、前后步、两手高度） |
| 捅站着的人（玩家/担架员） | `BayonetStabStanding`，刺刀尖顶点 0.97–0.98 m |
| 捅躺在担架上的人（老周） | `BayonetStabDown`，刺刀尖顶点 0.95–0.96 m，枪线朝下 |
| 一枪托把进门的玩家砸倒 | `RifleButtStrike`，顶点枪托到骨盆前 0.94–0.95 m、离地 1.52 m（一个人的下巴），刺刀在他自己身后 |
| 被地上的玩家把刺刀顶回来 | `PressureStabbed`，首帧＝白刃库 IJA `BayonetPressure` 第 0 帧（误差 0.07°），末帧是可以直接停住的尸姿 |
| 担架员被捅、松手、倒地成尸 | `BearerStabbed`，末帧是可以直接当尸体停住的姿势 |
| 担架上的伤员挨这一刀 | `PatientStabbed` |
| 之后一直躺着喘 | `PatientWoundedIdle`（循环） |

外观受[选模清单](Data_CharacterSelection.md)约束：日军只有 `LugouIja01/02/03`，国军只有
`LugouNra02/05`，本库正好覆盖这五个，**没有新增任何外观**。

## 2. Clip 表

fps 24，stride 7（局部位移 xyz + 四元数 xyzw），`frameCount = round(duration*24)+1`。

| clip | 骨架 | 时长 | 帧数 | 循环 | 关键时间与表演 |
| --- | --- | ---: | ---: | --- | --- |
| `AmbushRise` | IJA | 0.7 s | 18 | 否 | 0.00 深蹲藏身、枪斜抱在身前枪口朝上；0.34 起身过半；0.70 站直，中段预备，枪尖 1.17 m |
| `BayonetStabStanding` | IJA | 1.2 s | 30 | 否 | 0.00 预备；0.22 收枪蓄势（躯干右转 −0.17 rad）；0.36 前脚踏出；**0.52 刺到底**（骨盆前移 0.24 m、后脚跟离地 5.5 cm）；0.66 拧刀（枪身绕轴 0.38 rad）；0.94 抽刀；1.20 回预备 |
| `BayonetStabDown` | IJA | 1.4 s | 35 | 否 | 0.00 预备；0.26 抬枪口；0.44 俯身进；**0.62 下扎到底**（躯干前俯 0.42 rad，枪线下倾约 7°）；0.80 拧刀；1.08 拔出；1.40 回预备 |
| `RifleButtStrike` | IJA | 1.0 s | 25 | 否 | 0.00 预备；0.16 抬枪上肩（枪托到右耳后、枪口朝前下）；0.30 左脚落地，枪竖起来（枪口朝下、整支枪挪到身体左侧）；**0.42 砸到**（骨盆前移 0.28 m、前俯 0.58 rad + 脊柱 0.34、躯干左转 0.40 rad，枪托到身前 0.95 m / 1.52 m 高，抬头看目标 `headPitch=-.75`）；0.56 随挥；0.70 枪口再过一次竖直；0.85 回到 0.16 那个抱枪姿势；1.00 白刃预备，比起手前进了一步 |
| `PressureStabbed` | IJA | 1.3 s | 32 | 否 | 0.00 **白刃库 `BayonetPressure` 第 0 帧**（站在倒地的人身上、枪压下来）；0.12 枪被往上顶、他还攥着；0.24 两手被撑开举高、手张开（枪已经不在他手里）；**0.36 中刀**（弓背、头后甩、两臂甩开）；0.50 双手捂腹折腰；0.68 腿软、开始往右倒；0.78 脚跟翻过脚尖；0.88 双膝跪地、小腿折平；1.08 往右扑倒；1.30 右侧卧的尸姿（骨盆 0.27 m、头 0.35 m） |
| `BearerStabbed` | NRA | 2.2 s | 54 | 否 | 0.00 抬担架握姿；0.16 中刀（胸背仰、头后甩、手松杠）；0.42 双手捂腹；0.78 折腰；1.21/1.32 腿软、踮脚；1.52 双膝跪地、小腿折在身下；1.86 前扑；2.20 面朝下伏在自己腿上的尸姿 |
| `PatientStabbed` | NRA | 2.6 s | 63 | 否 | 0.00 仰卧；0.22 中刀弓背、下巴上扬、双臂甩开；0.60 双手压住肚子；1.10/1.65 左右扭动；2.15–2.60 平复到与 `PatientWoundedIdle` 同一姿势 |
| `PatientWoundedIdle` | NRA | 3.0 s | 73 | 是 | 仰卧，双手压腹，呼吸驱动脊柱起伏 + 头部小幅侧转 + 膝盖轻微伸屈；首尾帧由周期函数保证逐字相同 |

攻击方的步枪不在 clip 里：三八式由 `Script_CharacterModel` 的手部握点挂上去，clip 只动骨头。

## 3. 骨架与坐标

- 五个模型各 53 根骨头（`GroundRoot` + 52 根 Bip），日军前缀 `Bip001`、国军 `Bip002`。
  名字里没有点号；运行时按规范化名（小写去非字母数字）绑定，所以 GLTFLoader 把
  `Bip001 L Forearm` 读成 `Bip001_L_Forearm` 也对得上。
- 创作坐标（与车厢烘焙一致）：Blender +X 是人物左手边、−Y 是正面、+Z 向上。
  源 glTF +Z 对应 Blender −Y，`CharacterModel` 的 π 偏航再把它转成 Actor 局部 −Z。
  **Blender 的 z 与 Actor 的 y 是同一根轴**，所以本文的高度就是游戏里量到的高度。
- 只有盆骨承载位移，其余骨头的局部位移与源 GLB 逐字一致（测试守着这一条）。

### 运行时缩放（很容易踩的一条）

`Script_Actor.KIND_SPEC` 把日军缩到 1.62 m、国军缩到 1.66 m，而源骨架是 1.76/1.82 m，
于是 `LugouCharacterRig.modelScale` ≈ 0.921（日军）/ 0.914（国军）。**烘焙里的高度会被
整体压掉约 8%**，但 `Actor._MountRiggedWeapon` 会把武器的缩放抵消掉 —— 枪永远是真尺寸。
两个后果：

1. 想让刺刀尖落在 1.0 m，Blender 里要摆到 1.06–1.08 m。本库的顶点值就是这么定的。
2. 两手握距必须按 `0.4432 / modelScale` ≈ 0.481 m 来摆，游戏里才正好等于三八式护木挂点
   到握把的真实距离 0.4432 m。烘焙脚本自己算这个数，不要写死。

刺刀尖的位置口径（测试与烘焙共用）：右手握点为原点，沿「右手握点 → 左手握点」方向
`1.4201 m`，再沿躯干上方向偏 `0.0511 m`。两个常数量自 `Model/Model_Type38.tzm.json`
（gripL `(0,-0.012,-0.443)`、muzzle `(0,0.035,-1.029)`）与 `Model/Model_BayonetType38.tzm.json`
（socket `(0,0.02,0.004)`、刃尖 z = −0.4，装配时再后坐 12 mm）。**枪托端是同一条线的另一头**：
右手握点往后 `0.255 m`（`Model_Type38` 的木件到 z = +0.255）。上刺刀的全长因此是
0.255 + 1.4201 = 1.675 m，与三八式加三十年式刺刀的 1.66 m 对得上。

### 枪不跟着人缩（`RifleButtStrike` 踩过的坑）

上面那两个距离是**真米**：`Actor._MountRiggedWeapon` 把模型缩放抵消掉了。而创作骨架要
被压到 0.921，所以「在 Blender 里从握点量 1.42 m」得到的刀尖，比游戏里实际的刀尖近
**11 cm**。翻枪那两帧的刀尖差一点就戳进地板，就是拿创作尺量出来的「还高 9 cm」骗的。
本页所有刀尖/枪托的验收数字都取自浏览器段（真骨架 + 真尺寸），不要用 Blender 侧的
`tipActual` 乘 0.921 去核对。

## 4. 担架坐标系（Package A 摆位要用）

两条仰卧 clip 是按**担架床面 = 支撑面**做的，采样时传 `deckY = 床面高度`（验收用 0.86 m）：

- 鞋底最低点解到 `deckY + 0.003`，背面（连背包）恰好也在 `deckY + 0.003` 附近，
  腿沿着帆布向脚端微微下斜 —— 背包会把上身垫起来，直腿平放反而会让脚跟悬空。
- 盆骨骨节在 `deckY + 0.18`，腹部表面约 `deckY + 0.29`（所以 `BayonetStabDown` 的刀尖
  0.95–0.96 m 是**扎进肚子里**，不是停在表面）。
- 身体沿 Actor 局部 Z 轴躺，长 1.64 m：**头在局部 −Z**（即担架的行进方向、前担架员那一侧），
  脚在 +Z。横向 ±0.30 m，比 `CreateP012StretcherGeometry` 的床宽略宽一点点（手肘搭在边沿外）。
- `Script_FirstLevelMissionView` 现在给老周画的是 `MissionPeople.Patient()` 的**实例化静态
  网格**，不是蒙皮 Actor。要播这两条 clip，Package A 得把老周换成 `Person()` 那条蒙皮路径。

`BearerStabbed` 不在担架上：传 `deckY = 地面高度`（或不传、让 `groundAt` 解）。

## 5. 与白刃库的交接（`PressureStabbed`）

这条 clip 接在白刃 QTE 后面，所以它的首帧不是重新摆的，是**把白刃库那一帧搬过来**：

- 取哪一帧：`Animation/Melee/Data_MeleeIjaAnimations.json` 的 `BayonetPressure`
  **第 0 帧**。`Script_MeleeAnimation.Samples` 对 Pressure/Bind 这类 QTE 用
  `time = 1 - progress`，玩家把枪顶开（progress → 1）落在时间 0，也就是第 0 帧。
- 怎么搬：白刃库存的是**glTF 世界坐标系里的旋转增量**（左乘绑定姿态）与每根骨头的
  世界位移残差。位移不能要 —— 本库除骨盆外必须逐字保留源 GLB 的骨骼局部位移，
  否则就是把骨架抻长了（测试守着这一条）。只搬旋转，其余靠正向运动学：实测两者
  差最大 1.2 cm，且只出现在右手那一串手指上，是同一个姿势。
  Blender 是 glTF 坐标系绕 X 转 −90°，所以增量四元数按 `(w, x, -z, y)` 换轴。
- 对得有多准：真骨架上逐骨比世界旋转，20 根主要骨头最差 **0.071°**（L Foot），
  中位数 0°。三个外观都一样（旋转与模型高度无关）。
- 那副握距不是护木距离：`BayonetPressure` 两手相距 **0.717 m**（LugouIja02 0.711、
  LugouIja03 0.716），比三八式护木挂点的 0.4432 m 宽得多。所以「两手必须合护木」
  这条判据在本 clip 上不成立，测试按 clip 分开判（见 §8）。
- **0.30 s 之后他手里没有枪了**。玩家把枪夺走，两只手空着捂肚子 —— 到 0.50 s 两手
  只剩 0.19 m，运行时的 `Actor._UpdateRiggedWeaponMount` 却只认两个握点，照样会把
  一支 1.68 m 的三八式架在两只手之间，从尸体身上穿出来。**接管这条 clip 的一方必须
  在 0.30 s 把枪从他身上摘掉**（隐藏或交给第一人称）。接触表就是按这个时刻画的。

## 6. 文件

仓库侧：

| 文件 | 说明 |
| --- | --- |
| `Animation/FirstLevelAmbush/Data_FirstLevelAmbushAnimation.json` | schema 1 清单，version `20260916AmbushV2`，`actorForward [0,0,-1]`、`floorClearanceM 0.003` |
| `Animation/FirstLevelAmbush/Animation_LugouIja0{1,2,3}Ambush.json` | 各约 490 KB，五条日军 clip |
| `Animation/FirstLevelAmbush/Animation_LugouNra0{2,5}Ambush.json` | 各约 664 KB，三条国军 clip |
| `Script_FirstLevelAmbushAnimation.mjs` | 运行时采样器，继承 `FirstLevelCarriageAnimation`（地板求解、过渡插值、`Restore` 全部复用）；`FIRST_LEVEL_AMBUSH_VERSION` / `FIRST_LEVEL_AMBUSH_CLIPS` 必须与清单一致 |
| `_import/Script_FirstLevelAmbushAnimationBake.py` | 创作 + 烘焙脚本 |
| `Script_FirstLevelAmbushAnimationTest.mjs` | 保真闸门（纯 Node 段 + 真浏览器段） |

源工程（不进仓库）：`C:\Users\Bentl\OneDrive\AI\Models\Blender\Taierzhuang1938\RoomAmbush_20260915\`
— 五个 `Scene_<ModelId>RoomAmbush.blend`（原模型 + 可编辑 action + 静音 NLA 副本 + 地板/隔断
或担架参考体 + 复审相机）、五份 `Data_<ModelId>RoomAmbushValidation.json`（逐帧测量报告）、
`Review/` 下的 Cycles 复审图。

## 7. 无头重建

不需要 BlenderMCP，也不需要开 Blender 界面（本机没有跑 MCP server）：

```powershell
& "C:/Program Files/Blender Foundation/Blender 5.1/blender.exe" --background `
  --python Taierzhuang1938/_import/Script_FirstLevelAmbushAnimationBake.py -- `
  "<本 worktree>/Taierzhuang1938"
```

环境开关：`AMBUSH_MODEL=LugouIja01` 只烘一个模型；`AMBUSH_CLIP=BearerStabbed` 只做一条
（**这种情况下不写资产**，只更新 .blend 与测量报告，供调姿势用）；`AMBUSH_RENDER=1` 额外
出 Cycles 复审图；`AMBUSH_TRACE=<clip>` 打印逐阶段的头/盆骨高度。Blender 的日志很吵，
重定向到 `_shots/RoomAmbush/C/`。

脚本做两件事需要知道：

- **脚底自动落地**：每一帧先摆一遍，量鞋底最低点，再把世界脚踝目标整体抬上
  `0.003 − 实测` 重摆，最多三轮。手调不可能让一只在滚动的鞋逐帧落在毫米上，而鞋底一漂
  运行时就会按这个测量值上下抬整个人 —— 那是肉眼可见的抖。仰卧两条不走这一步（它们
  贴的是担架不是地面）。
- **手肘极向量挂在肩上，不挂在握点上**：左臂横过身体之后，挂在握点上的极向量会滑到
  「肩 → 手」那条线上，退化的极向量会让 `Chain` 把胳膊拉直、握点冲过目标 —— 症状是握距
  比护木还宽（曾经量到 0.50 m）。
- **手掌朝向与手臂要一起收敛，而且只认最好的那一趟**（2026-09-16 加）：`ReachGrip` 每
  一趟按上一趟量到的「腕 → 指根重心」偏移去摆胳膊，而摆胳膊又会转腕，于是这个偏移
  又变了。多数姿势几趟就收敛，有些姿势它绕圈 —— 停在第几趟决定结果，枪托横扫曾因此
  出现一只手离枪 14 cm。现在 `ReachGrip` 记住误差最小的那一趟并回填；`TurnPalm` 与
  `ReachGrip` 也改成交替跑两轮，否则最后跑的那一个会把另一个的结果推翻。
  改完之后八条 clip 的握点误差都 < 1 cm（多数 < 0.1 mm）。
- **一只胳膊够不着就没有第二个办法**：肩到指根重心最长 0.592 m，但真正能解的目标要
  留到 0.50 m 以内 —— 再远，腕部偏移一转就够不着了。枪托横扫的每一个关键帧都是照这个
  预算摆的（见 §9 的第一条）。

## 8. 验收

```powershell
node Taierzhuang1938/Script_FirstLevelAmbushAnimationTest.mjs
```

纯 Node 段：清单字段、五个模型的资产 sha256 与所依据 GLB 的 sha256、`frameCount`、
值个数、四元数模长（最差 < 1e-5）、骨骼名必须真是该 GLB 的骨头（规范化后）且覆盖全部
蒙皮关节、除盆骨外骨骼位移零漂移、循环 clip 首尾帧一致（< 1e-4）。

真浏览器段（真 GLB + `LugouCharacterRig` + 本模块）：

| 项 | 结果 |
| --- | --- |
| `Restore()` 还原误差 / Actor 世界根漂移 | 0 / 0（五个模型） |
| 鞋底解算 | 每一帧 = 支撑面 + 0.003 m（地面 0.003；担架 0.863） |
| 整皮最低点 | 站立三条 0.003；`BearerStabbed` 0.003；仰卧最低 0.8325（中刀那一瞬压进床面 2.7 cm） |
| 朝向 | 脚还踩地的帧里脚尖 z < −0.45（局部 −Z） |
| 两手握距（游戏尺度） | 握枪的四条 clip 每一烘焙帧 0.4427–0.4433 m，对三八式护木 0.4432 m |
| `BayonetStabStanding` 顶点刀尖 | 0.973–0.982 m（要求 0.95–1.05） |
| `BayonetStabDown` 顶点刀尖 | 0.953–0.963 m（要求 0.90–1.02） |
| `AmbushRise` 末帧 | 头比首帧高 0.38 m 以上，刀尖 1.166–1.175 m |
| `RifleButtStrike` 顶点（t = 0.4167） | 枪托离地 **1.515–1.526 m**（要求 1.45–1.75）、在骨盆前 **0.940–0.947 m**（要求 0.9–1.3）；同一帧刀尖在骨盆**后面** 0.28 m |
| `RifleButtStrike` 谁在前 | 驱动段（枪托过骨盆前 0.5 m，t = 0.375–0.625）枪托一直领先刀尖 ≥ 0.69 m（阈值 0.6）；刀尖从不越过枪托 |
| `RifleButtStrike` 不扫到人 | t = 0.2–0.7 的每一帧，刀尖与枪口离「站在骨盆前 1.05 m、0.9–1.7 m 高、半径 0.22 m」那根胶囊都在外面（挥到一半时刀尖在 0.05–0.17 m 高，从他自己的膝前扫过去，离对方小腿还有 0.3 m） |
| `RifleButtStrike` 刀尖离地 | 最低 0.038 m（LugouIja02，翻枪过竖直那一帧）；阈值 0.02 |
| `PressureStabbed` 首帧对齐 | 与白刃库 `BayonetPressure` 第 0 帧逐骨比世界旋转，20 根主要骨头最差 **0.071°**（阈值 12°），中位数 0°；三个外观同值 |
| `PressureStabbed` 握距 | 首帧 0.7105–0.7171 m（＝白刃那副，不是护木）；0.5 s 之后 ≤ 0.22 m（两手已经空了，判据是「必须塌下来」） |
| `PressureStabbed` 末帧尸姿 | 骨盆 0.265–0.267 m（阈值 < 0.35）、头 0.342–0.345 m（要求 > 0.02 且 < 0.45）、整皮最低点 0.003 |
| 被捅者手到腹 | `BearerStabbed` ≤ 0.25 m、两条仰卧 ≤ 0.32 m（阈值 0.40） |
| 头部蒙皮跟随头骨 | 重心离头骨恒为 0.146 m（每条 clip 每一帧都一样 = 头没掉） |
| 循环接缝（真骨架） | `PatientWoundedIdle` 0 |

截图：每个模型每条 clip 一张 1280×720 六格接触表
`_shots/RoomAmbush/C/Texture_Ambush_<Model>_<Clip>.png`，创作模型（LugouIja01 / LugouNra02）
另有一张同尺寸放大定格 `Texture_AmbushDetail_*.png`。数据留在
`_shots/RoomAmbush/C/Data_AmbushAnimationValidation.json`（目录已忽略）。
`PressureStabbed` 的代理枪在 0.30 s 之后不画（见 §5），定格机位也压到地面高度，
否则只看得见一双靴子和一根穿过尸体的木棍。

两条新 clip 的看图结论（2026-09-16）：

- `Texture_Ambush_LugouIja01_RifleButtStrike.png`：0.00 预备 → 0.16 枪上肩、刀尖朝前下 →
  0.30 枪竖起来在身体左侧、刀尖离地一拳 → **0.42 枪托越过自己的头砸出去、刀尖甩到身后** →
  0.56 随挥 → 0.85 收回抱枪。六格连起来读得出是「抡枪托」而不是「捅」。
- `Texture_AmbushDetail_LugouIja01_RifleButtStrike.png`（顶点定格）：两只手都在木件上、
  枪托是最前面的那一头、抬着头看目标、刀身从右膝外侧划过去（最近 0.18 m）。
- `Texture_Ambush_LugouIja01_PressureStabbed.png`：0.00 站在人身上把枪压下来 →
  0.24 两手被顶到头顶、枪已经脱手 → 0.36 中刀（头后仰、两臂甩开）→ 0.55 捂着肚子折腰 →
  0.90 跪倒 → 1.30 右侧卧不动。
- `Texture_AmbushDetail_LugouIja01_PressureStabbed.png`（末帧定格）：脸朝下偏向右侧、
  小腿折在身后、两手压在肚子底下、钢盔与地面贴住；没有浮空、没有陷进地板。
- `Texture_Ambush_LugouIja02_PressureStabbed.png`：换外观（有背包与钢盔）同样成立。

### 看图看出来、数值没抓到的五处（已修）

1. **枪托穿过躯干**：刺击顶点原来把枪线摆得太靠中线，枪托落在三角肌里。把整条枪线
   往人物右侧推（`ax` 0.15 → 0.20），枪托移到离中线 0.24 m 处才出得来。
2. **下扎时双手举过肩**：1.42 m 的刀身按 11° 下倾，刀尖要到 1.06 m，后手就得抬到 1.29 m。
   改成前俯 0.42 rad、枪线只下倾 7°，手回到胸口高度。
3. **仰卧伤员的小臂埋在肚子里、手指朝天张开**：手肘极向量没有把肘推到体外，手掌朝向
   也是按「手指朝上」给的。现在肘部极向量落在体侧下方，手掌法线用身体的后方向
   （`palmBelly` 参数在「抬担架握杠」与「按住伤口」两种握法之间插值）。
4. **枪托横扫的顶点是「一头扎下去」**（2026-09-16）：躯干前俯 0.58 rad 是够到目标必须的，
   但头跟着躯干一起低下去，读起来是往地上扑，而且自己的脸正好挡在枪线上。把
   `headPitch` 从 +0.16 改成 **−0.75**（抬头看目标）之后，姿势才是「打人」。
5. **竖起来的枪穿过自己的头 / 刀尖戳进地板**（2026-09-16）：翻枪那一段枪是竖着的，
   摆在身体中线上就从钢盔里穿过去，摆到右侧左手又够不着（左手固定在枪口方向 0.48 m 处）。
   最后把整支枪挪到**身体左侧**（右手横过去够，路程短），并把翻枪那两帧的右手抬到
   1.63 m 以上 —— 刀尖离地才有 0.04 m 的余量（枪不跟着人缩，见 §3）。

## 9. 已知缺口

- **手指只做了整体蜷曲**，没有逐指贴合。抬担架起手那一帧读起来是「手里握着东西」而不是
  「攥着杠」；近景特写不要用这一帧。
- **没有口型、没有表情**。`LugouNra05Facial` 这条路没有接，伤员喊疼只有身体。
- **`BearerStabbed` 的起手姿势按后担架员的握点摆**（两手在身前 ±0.29 m、前方 0.27 m）。
  前担架员的杠在身后，靠采样器 0.16 s 的过渡插值糊过去；两个角色共用一条 clip 是本轮的
  取舍，要分开就得再烘一条。
- **末帧不是死亡姿势系统的姿势**。`BearerStabbed` 停在「面朝下伏在自己腿上」、
  `PressureStabbed` 停在「右侧卧」，都可以直接当尸体；要改用死亡姿势系统接管，
  交接点在最后一帧。
- **`PressureStabbed` 的枪要由接管方摘掉**（见 §5）。这是这一轮唯一一条「资产之外还得
  做一件事」的 clip：不摘，尸体身上就插着一支 1.68 m 的三八式。
- **`RifleButtStrike` 要地方**：枪托最高到 1.75 m（比这个 1.62 m 的人还高 0.13 m），
  翻枪时整支枪在他左侧 0.2 m 以内、刀尖扫过身前 0.04–0.30 m 的地面。屋里摆位至少要
  给出「头顶 1.8 m 净空 + 身前一步」的空间，靠墙贴门框起手会穿墙。
- **枪托横扫的顶点是这具骨架的极限**。要够到「身前 0.94 m、离地 1.52 m」，骨盆-脊柱-
  胳膊-枪托必须几乎排成一条线（预算：0.54 + 0.50 + 0.26 = 1.30 m，实际要 1.26 m）。
  想让枪托再远/再高一点，只能改成两只手换握（本库做不到，握距是硬的）或者换个更高的
  外观。同理，帧与帧之间插出来的握距在翻枪那两帧会差 0.056 m —— 那是 24 fps 的账，
  测试对「烘焙帧」与「插值帧」分开判。
- **`PressureStabbed` 的复审 .blend 回放有 5 mm 误差**（其余七条 5e-05）。出的资产是
  从骨骼世界矩阵直接换算的，与这个误差无关；只有 .blend 里选中 action 拖时间轴看的那
  一版会差这么点。要逐帧对姿势请看 `Data_LugouIja0*RoomAmbushValidation.json`。
- **首帧的姿势是「站着压下来」，不是跪着**。白刃库 `BayonetPressure` 就是站姿（骨盆
  0.73 m、两脚一前一后踩地、枪压到刀尖离地 0.28 m）；文案里写「跪压」的话要改的是文案。
- **仰卧两条的翻身幅度按 0.86 m 床面调过**，床面高度改了要重看：身体厚 0.375 m，腹面在
  `deckY + 0.29`，刀尖 0.95 的「刺入深度」会跟着变。
- 中刀那一瞬（`PatientStabbed` t≈0.25）弓背会让身体压进床面 2.7 cm。当作受力形变留着了，
  不想要就把 `bend=-.17` 那一键改小。
- 复审用的步枪是按真实尺寸摆的**方块代理**，不是 `Model_Type38.tzm.json` 本体；握点、
  枪线与刀尖位置是真的，木件与刀身的外形不是。
