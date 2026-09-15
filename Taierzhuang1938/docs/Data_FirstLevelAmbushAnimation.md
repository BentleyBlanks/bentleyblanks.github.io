# 第一关屋内伏击动画库

2026-09-15 新增。第一关公开阶段 9（内部 `Melee` 段）的屋内伏击用到的六条人物动作：
日军三人从藏身处起身、两种刺刀捅人；国军担架员被捅倒地、老周在担架上被捅与之后的
负伤喘息。编排、触发与数值属于[屋内伏击](Data_FirstLevelRoomAmbush.md)，台词与字幕时序属于
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
（socket `(0,0.02,0.004)`、刃尖 z = −0.4，装配时再后坐 12 mm）。

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

## 5. 文件

仓库侧：

| 文件 | 说明 |
| --- | --- |
| `Animation/FirstLevelAmbush/Data_FirstLevelAmbushAnimation.json` | schema 1 清单，version `20260915AmbushV1`，`actorForward [0,0,-1]`、`floorClearanceM 0.003` |
| `Animation/FirstLevelAmbush/Animation_LugouIja0{1,2,3}Ambush.json` | 各约 285 KB，三条日军 clip |
| `Animation/FirstLevelAmbush/Animation_LugouNra0{2,5}Ambush.json` | 各约 648 KB，三条国军 clip |
| `Script_FirstLevelAmbushAnimation.mjs` | 运行时采样器，继承 `FirstLevelCarriageAnimation`（地板求解、过渡插值、`Restore` 全部复用） |
| `_import/Script_FirstLevelAmbushAnimationBake.py` | 创作 + 烘焙脚本 |
| `Script_FirstLevelAmbushAnimationTest.mjs` | 保真闸门（纯 Node 段 + 真浏览器段） |

源工程（不进仓库）：`C:\Users\Bentl\OneDrive\AI\Models\Blender\Taierzhuang1938\RoomAmbush_20260915\`
— 五个 `Scene_<ModelId>RoomAmbush.blend`（原模型 + 可编辑 action + 静音 NLA 副本 + 地板/隔断
或担架参考体 + 复审相机）、五份 `Data_<ModelId>RoomAmbushValidation.json`（逐帧测量报告）、
`Review/` 下的 Cycles 复审图。

## 6. 无头重建

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

## 7. 验收

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
| 两手握距（游戏尺度） | 0.4430–0.4435 m，对三八式护木 0.4432 m |
| `BayonetStabStanding` 顶点刀尖 | 0.973–0.982 m（要求 0.95–1.05） |
| `BayonetStabDown` 顶点刀尖 | 0.953–0.963 m（要求 0.90–1.02） |
| `AmbushRise` 末帧 | 头比首帧高 0.38 m 以上，刀尖 1.166–1.175 m |
| 被捅者手到腹 | `BearerStabbed` ≤ 0.25 m、两条仰卧 ≤ 0.32 m（阈值 0.40） |
| 头部蒙皮跟随头骨 | 重心离头骨恒为 0.146 m（每条 clip 每一帧都一样 = 头没掉） |
| 循环接缝（真骨架） | `PatientWoundedIdle` 0 |

截图：每个模型每条 clip 一张 1280×720 六格接触表
`_shots/RoomAmbush/C/Texture_Ambush_<Model>_<Clip>.png`，创作模型（LugouIja01 / LugouNra02）
另有一张同尺寸放大定格 `Texture_AmbushDetail_*.png`。数据留在
`_shots/RoomAmbush/C/Data_AmbushAnimationValidation.json`（目录已忽略）。

### 看图看出来、数值没抓到的三处（已修）

1. **枪托穿过躯干**：刺击顶点原来把枪线摆得太靠中线，枪托落在三角肌里。把整条枪线
   往人物右侧推（`ax` 0.15 → 0.20），枪托移到离中线 0.24 m 处才出得来。
2. **下扎时双手举过肩**：1.42 m 的刀身按 11° 下倾，刀尖要到 1.06 m，后手就得抬到 1.29 m。
   改成前俯 0.42 rad、枪线只下倾 7°，手回到胸口高度。
3. **仰卧伤员的小臂埋在肚子里、手指朝天张开**：手肘极向量没有把肘推到体外，手掌朝向
   也是按「手指朝上」给的。现在肘部极向量落在体侧下方，手掌法线用身体的后方向
   （`palmBelly` 参数在「抬担架握杠」与「按住伤口」两种握法之间插值）。

## 8. 已知缺口

- **手指只做了整体蜷曲**，没有逐指贴合。抬担架起手那一帧读起来是「手里握着东西」而不是
  「攥着杠」；近景特写不要用这一帧。
- **没有口型、没有表情**。`LugouNra05Facial` 这条路没有接，伤员喊疼只有身体。
- **`BearerStabbed` 的起手姿势按后担架员的握点摆**（两手在身前 ±0.29 m、前方 0.27 m）。
  前担架员的杠在身后，靠采样器 0.16 s 的过渡插值糊过去；两个角色共用一条 clip 是本轮的
  取舍，要分开就得再烘一条。
- **末帧不是死亡姿势系统的姿势**。`BearerStabbed` 停在「面朝下伏在自己腿上」，可以直接当
  尸体；Package A 如果改用死亡姿势系统接管，交接点在最后一帧。
- **仰卧两条的翻身幅度按 0.86 m 床面调过**，床面高度改了要重看：身体厚 0.375 m，腹面在
  `deckY + 0.29`，刀尖 0.95 的「刺入深度」会跟着变。
- 中刀那一瞬（`PatientStabbed` t≈0.25）弓背会让身体压进床面 2.7 cm。当作受力形变留着了，
  不想要就把 `bend=-.17` 那一键改小。
- 复审用的步枪是按真实尺寸摆的**方块代理**，不是 `Model_Type38.tzm.json` 本体；握点、
  枪线与刀尖位置是真的，木件与刀身的外形不是。
