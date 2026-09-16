# 机枪点位「川军被俘」过场动作

范围：第一关 04 机枪点位刚进入时那场关中过场 —— 退路被截断的几名川军举着手被押进来、
跪在开阔地上、被日军踢倒／枪托砸／指着喝令，最后被刺刀捅死。这一套只服务这一场戏，
**十五条动作、五具骨架、共 36 条可播绑定**。NRA02 / NRA05 / IJA01 / IJA02 / IJA03 的
可见网格、蒙皮权重、inverse bind 与骨层级**一个字节没动**（门禁逐个核对源 GLB 的 sha256）。

## 制作方式

本机 Blender 5.1。**2026-09-16 这一轮由 BlenderMCP 驱动**：Blender 带窗口起，
`blender_mcp` 插件的 socket 服务（`localhost:9876`）收 `execute_code`，脚本在它的
`bpy.app.timers` 回调里跑 —— 与 `--background` 同一条 bpy 路径，产物逐比特一致。
两处为此加了东西，**不影响产物**：

- `GuiContext()` / `Op()` / `Add()`：`read_factory_settings` 之后，timer 回调的
  `bpy.context` 掉了 `object` / `collection`，glTF 导入器一头撞死在
  `'Context' object has no attribute 'object'`。从 `bpy.data` 重新取窗口做
  `temp_override` 就好；`--background` 下没窗口可覆盖，这层是空操作。
- `ResetScene()`：`--background` 照旧 `read_factory_settings(use_empty=True)`；
  GUI（BlenderMCP）下改用 `read_homefile(use_empty=True, use_factory_startup=True,
  load_ui=False)`。同一张空场景，产物逐比特相同 —— 区别只在于前者在 timer 回调里
  会把窗口管理器整个换掉，那个回调的上下文里于是一个窗口都没有，主循环当场退出
  （日志上「Preferences saved」下一行就是「Blender quit」）。
- `Bake(modelId, probe=…)`：给 BlenderMCP 交互调姿势用的钩子。传一个 callable，
  骨架照常建好、量好、标定好，然后把所有局部（`Author` / `ApplyPose` / `Point` /
  `RegionLows` / 静止尺寸…）交给它，**不写任何文件**。这一轮的体表距离、靴面前伸、
  腿的可达半径都是这么当场量出来的，没有第二份会漂走的骨架代码。

`_import/Script_MachineGunCaptivesBake.py` 逐具骨架导入源 GLB、用 python 摆关键帧
（两骨 IK 链解四肢、手掌朝向与手指整体握张、缓入缓出的关键帧表），再把 Blender 骨架帧
换算回源 GLB 的骨局部帧导出 JSON。两条路都能跑：

```powershell
# A. 无头（发布与复现用）
$env:CAPTIVES_PROJECT="<repo>/Taierzhuang1938"
& "C:/Program Files/Blender Foundation/Blender 5.1/blender.exe" --background --python-exit-code 1 `
  --python "<repo>/Taierzhuang1938/_import/Script_MachineGunCaptivesBake.py"

# B. BlenderMCP（调姿势用）：带窗口起 Blender，把同一个文件当模块 exec 进去
node scripts/Script_BlenderMcp.mjs start
node scripts/Script_BlenderMcp.mjs exec <一段 python>
node scripts/Script_BlenderMcp.mjs stop
```

**起 Blender 走 `scripts/Script_BlenderMcp.mjs`，别手工敲 `blender.exe --python`**
（根 AGENTS.md「Blender 与 MCP 服务器不常驻」那一条）。9-16 前两轮那个脚本还不存在，
当时是自己写 bootstrap + socket 客户端起的；下面这几条坑对两条路都成立。

**坑一**：`read_factory_settings` / `read_homefile` 会重载偏好设置，于是 `blender_mcp`
被禁用、`unregister()` 把服务连同所有在连客户端一起关掉 —— 每建一具骨架断一次线。
所以要么挂一个 `persistent=True` 的看门狗定时器（掉了一秒内自己起回来），要么每次
重连；客户端得把「连接被关掉」当成「命令已收下」，日志写文件，重连后再读。

**坑二**：GUI 下别用 `read_factory_settings`，见上面 `ResetScene()` 那一条 ——
它会让 Blender 在那一刻整个退出，症状是命令发出去之后再也连不上，而 Blender 的
stdout 最后两行是「Preferences saved」和「Blender quit」。

其它开关（都只影响迭代速度，不影响产物）：`CAPTIVES_MODEL=LugouIja01[,…]` 只烘一具、
`CAPTIVES_SKIP_BLEND=1` 不存 `.blend`、`CAPTIVES_RENDER=<目录>` 出 Workbench 预览图、
`CAPTIVES_REGIONS=1` 逐帧打印脚/小腿/大腿/胯/躯干/头/手/臂各自的最低点（调贴地用）。

可编辑工程在
`C:/Users/Bentl/OneDrive/AI/Models/Blender/Taierzhuang1938/MachineGunCaptives_20260916b/`
（9-16 第二轮留在 `…_20260916/`、9-15 那一轮在 `…_20260915/`，都没有覆盖）：每具骨架一个
`Scene_<ModelId>MachineGunCaptives.blend`（演员、每条动作一个可编辑 action ＋一条静音
NLA 副本、地面、正交审阅相机与两盏灯），外加一份逐帧数值报告
`Data_<ModelId>MachineGunCaptivesValidation.json` 与 `Preview/` 里的 Workbench 联系图。
`.blend`、渲染图与审阅报告都不进仓库。

## 坐标与朝向换算

烘焙在 **Blender 源尺度**（人高约 1.76–1.82 m）里做：`+Z` 向上、角色正面 `−Y`、
角色自己的左手边 `+X`、地面 `z = 0`。源 GLB 的资产正面是 `+Z`（实测脚尖方向），
`convert` 矩阵 `(x, y, z)_gltf → (x, −z, y)_blender` 把它映到 Blender 的 `−Y`；运行时
`CharacterModel` 的 `MODEL_FORWARD_YAW = π` 再把它转成引擎契约的 **Actor 正面 −Z**。
换算成演员局部坐标就是 `X_actor = −X_blender`、`Y_actor = Z_blender`、`Z_actor = Y_blender`。
导出的是**源 GLB 骨架的逐骨局部 position/quaternion**（24 Hz 采样、stride 7），
运行时不导入新骨架。

**贴地在烘焙时做**：每一帧先按当前姿势算真实变形网格的最低顶点，再把这一帧的
所有世界目标整体上下平移，使最低顶点正好离地 `floorClearanceM = 3 mm`。
所以运行时没有脚底探针、没有「探针→抬根→再探针」的回路，跪姿与趴姿也不会被按
「鞋底」抬起来。跪姿的脚背落点另有一次逐骨架标定：同一个姿势下分别量小腿组与脚组的
最低顶点，把踝高补到两者共面（各骨架的靴子厚度不同，常数写死会让一只脚悬空 4 cm）。

**持枪点取的是四个指根的中心，不是手骨**。`Script_CharacterModel.BuildHandGrip` 就是
这么定义运行时挂点的（Max Biped 的手骨 tail 落在掌外 8–10 cm）。9-15 那一轮烘焙侧量的是
手骨，报出来的刺刀尖与枪托位置比门禁读到的差约 3.5 cm —— 而站位就是拿那个数反推的。

## 十五条动作

秒数与循环性同时写在 `Data_MachineGunCaptivesAnimation.json` 的 `clips`，
运行时只读那张表。下面的数值是门禁在实机蒙皮上量的（单位米，骨头离演员脚下平面；
前伸取演员局部 −Z）。

**身高按 `Script_Actor` 的 `KIND_SPEC` 建：国军 1.66 m、日军 1.62 m。**
2026-09-16 第一轮把日军也按 1.66 量，于是枪托与刺刀的每一个触及都长了 2.4%
（约 2 cm），而站位就是拿那些数反推的。门禁现在按 kind 取身高，并顺手 grep
`Script_Actor` 核对那两个数没被改过。缩放那一项也钉死了：本场七个人的
`cast[].sizeScale = 1.0`（战场上的人是 ±4% 随机），所以下面每一个数就是玩家看到的数。

| id | 骨架 | 秒 | 播放 | 内容 | 实测 |
| --- | --- | ---: | --- | --- | --- |
| `CaptiveHandsUpWalk` | NRA02/05 | 1.8 | loop | **举着手被押着走**：双手高举过头、含胸缩肩、小步快走、每两步一个踉跄。两个步态周期（每周期 0.9 s） | 头 1.288–1.319；支撑脚后移 1.004–1.012 m/s（源尺度 1.10 × 演员缩放，滑步 0.14%） |
| `CaptiveShovedStumble` | NRA02/05 | 0.7 | once（首帧＝举手走第 0 帧、末帧＝举手站第 0 帧） | **被推得往前趔趄一步**：躯干被顶出去、头往前甩、右脚迈过去撑住，再收回举手站姿。双手全程举着（它们不归他管） | 头 1.290 → 1.141 → 1.376；头前甩 0.20；支撑脚相对根后移 **0.271**（＝轨道在这 0.7 s 里送他走的距离，误差 <2 mm）；首尾两帧逐比特等于相邻两条 clip 的第 0 帧 |
| `CaptiveHandsUpStand` | NRA02/05 | 4.0 | loop | 站立、双手高举过头、缩肩低头、呼吸 0.25 Hz、手臂轻颤 3.25 Hz | 头 1.368–1.383；腕高于头骨 ≥0.36 |
| `CaptiveStandToKneel` | NRA02/05 | 1.0 | once（末帧＝跪姿首帧） | **跪下的过程**：举手站姿 → 沉胯下蹲（脚不挪）→ 双膝落地、脚踝翻过脚尖躺平 → 双手抱后脑 | 头 1.376 → 0.970–0.980；末帧与 `CaptiveKneelHandsHead` 第 0 帧**逐比特相同** |
| `CaptiveKneelHandsHead` | NRA02/05 | 4.0 | loop | 双膝跪地、小腿与脚背贴地、双手抱后脑、胸腔呼吸 0.25 Hz、上身细颤、每周期一次慢转头 | 头 0.980–0.997；胯 0.44–0.46；膝 0.08–0.10 |
| `CaptiveKneelPlead` | NRA02/05 | 4.0 | loop | 同一跪姿、抬头、双手在胸前前伸掌心向上哀求，上身随说话起伏 | 头 0.990–1.012；胯 0.44–0.46 |
| `CaptiveKneelFlinch` | NRA02/05 | 0.8 | once（首尾＝跪姿首帧） | **跪着挨枪托砸在头上**：颈与头猛向侧前偏并翻滚过去，躯干晚 50 ms 才跟过去且幅度小得多（挨砸的是头，不是他自己蹲下去），带一次 15 Hz 的短颤，再拉回抱头 | 头骨横向被砸偏 **0.129–0.130**、前移 0.062、只低了 0.046–0.060；头 0.994 → 0.934 → 0.994；首尾两帧与 `CaptiveKneelHandsHead` 第 0 帧**逐比特相同** |
| `CaptiveStruckDown` | NRA02/05 | 1.6 | once（末帧保持） | 跪姿被从后侧击打，前扑撑手、腿蹬直，末帧脸朝下趴稳、双臂前伸 | 头 0.99→0.21；末帧手掌离地 6–7 mm、脚背 3–8 mm |
| `CaptiveStabbedCollapse` | NRA02/05 | 2.0 | once（末帧保持） | 跪姿被刺：猛一顿、上身后弓、捂腹僵住、向前瘫软趴倒，末帧稳定 | 头 1.02→0.26；末帧手掌离地 7 mm、脚背 3–7 mm |
| `IjaBayonetGuard` | IJA01/02/03 | 4.0 | loop | 站立、三八式上刺刀平端指向前下方（押俘虏），重心每周期在两脚间倒换一次、头跟着行列左右扫 | 头 1.322–1.347；刺刀尖 (前 1.15–1.17, 高 0.61–0.64) |
| `IjaTauntGesture` | IJA01/02/03 | 4.0 | loop | 右手单手提枪于腰侧、左手指点挥手、头随喊话前探，重心倒换同上 | 头 1.321–1.342；刺刀尖 (前 1.51–1.55, 高 0.30–0.43) |
| `IjaShoveForward` | IJA01/02/03 | 0.9 | once（回到站姿） | **单手推搡**：右前臂立起来把枪竖在身侧（枪口朝上偏后），左手收回蓄力再张掌推在俘虏后背上，重心前送一步再收回 | 接触帧 0.40 s：**掌面前伸 0.591–0.597 / 腕高 0.940–0.948**；最远 0.647–0.653（0.52 s）；刺刀尖全程在头顶 2.66–2.81、身后 0.33–0.73 |
| `IjaKickPrisoner` | IJA01/02/03 | 1.2 | once（回到站姿） | 重心移到左腿、右腿前踢（踢跪着的人的胸口高度）、收腿站稳 | 接触帧 0.46 s：**靴面前伸 0.785–0.792、高 0.62**；最远 0.815–0.823（0.50 s） |
| `IjaRifleButtStrike` | IJA01/02/03 | 1.4 | once（回到站姿） | 反握翻转枪身：0.50 s 枪托甩到头顶后上方、枪口朝前下；0.85 s 枪托翻过头顶砸到身前跪着的人的**头与后颈**；1.40 s 收回持枪式 | 砸击枪托落点 **前 0.791–0.796 / 高 0.975–0.985**、躯干前倾 **18.0°**、右肩到腕 0.381–0.385、骨盆前移 0.17 |
| `IjaBayonetDownThrust` | IJA01/02/03 | 1.6 | once（末帧是收回的持枪式） | 双手持枪蓄力后撤 → 前弓步向前下全力刺出 → 保持约 0.3 s → 抽回半步回到平端 | 刺出 0.76 s：刺刀尖 **前 1.389–1.391 / 高 0.75**；到底（1.03 s）1.407–1.409；行程 0.37 |

`IjaBayonetDownThrust` 的末帧按契约允许的那个变体做：**刺入姿态保持 0.76–1.06 s（约 0.3 s）
之后抽回**，1.6 s 的最后一帧是收回的持枪式，不是刺入姿态。要「刺进去不动」的镜头
就让过场在 1.0 s 左右换成别的 clip 或切镜。

刺刀尖 / 枪托的坐标是按三八式上刺刀的真实尺寸从**右手四个指根的中心**推出来的
（`Data_Weapons.Type38`：`bayonetTotalM 1.663`，`_blender/BuildWeapons.py` 的 `BUTT_Z 0.255`，
所以尖端在握点前 1.408 m、托底在握点后 0.255 m）。武器本体是实尺寸、不随演员缩放，
门禁量的也是这条线。

### 走路 clip 的速度契约

适配器**没有根位移**，位移全由过场轨道给。所以走路 clip 必须自报它被烘在什么地面速度上：

- 清单里 `clips.CaptiveHandsUpWalk.referenceSpeedMps = 1.10`，**源尺度**的米每秒
  （烘焙那具 1.8 m 的骨架）。步态是推出来的不是拍脑袋的：一只脚在
  `WALK_STANCE = 0.58` 个周期（`WALK_CYCLE = 0.9 s`）里以 1.10 m/s 后移，
  于是它相对根走 `1.10 × 0.58 × 0.9 = 0.574 m` —— 那就是步幅，它的一半必须留在
  腿的水平可达半径里（在 `WALK_CROUCH = 0.105 m` 的含胸姿势下实测 0.347 m）。
- 运行时按 `state.moveSpeed × 4.2 ÷ (referenceSpeedMps × 演员缩放)` 缩放播放速率
  （`Script_CutscenePerformance.RateOf`）。**演员缩放那一项不能省**：1.66 m 的兵
  身上这条 clip 的步子只有源尺度的 0.91 倍，忘了乘就每步滑 9 cm。
- 门禁按 1/24 s 密取样量支撑脚相对根的后移速度，要求与 `referenceSpeedMps × 缩放`
  差 ≤2%（实测 0.14%）。本场进场速率 1.084–1.090。

### 循环接缝

loop clip 的**烘出来的**首尾两帧必须逐比特相同。运行时取样按 `at % duration` 回绕，
所以一条 `sin(phase × 0.9)` 这样的非整数倍谐波**永远不会**让回绕测试翻红 —— 它只是
每个周期在画面上顿一下。9-15 那一版四条循环里有三条带这种项。现在规矩是：
所有抖动项都是 `sin(整数 × phase)`，**而且在 t=0 取零**（用正弦、不用余弦、不带相位偏移）。
后一条让循环的第 0 帧就是中立姿势，过渡 clip 才好精确地首尾相接。
烘焙脚本逐条打印 `LOOPSEAM`，门禁逐条断言 = 0。

## 运行时用法

唯一的消费者是关中过场 `CS_MachineGunCaptives`（`Data_CutsceneMachineGunCaptives.mjs`）：
哪一秒换哪一条、受击者换 clip 的时刻怎么与接触帧对齐、三种打击的触及距离与受击者的
体表距离反推出来的站位，全在
[docs/Data_MachineGunCaptivesCutscene.md](../../docs/Data_MachineGunCaptivesCutscene.md) §2。
改这十五条 clip 的秒数或触及距离，那边的站位表要一起重算。

过场数据侧只写一条 `state.perform`（外加可选的 `state.performPhase`），语义与边界见
[`docs/Data_CutsceneRedo.md` §1.3](../../docs/Data_CutsceneRedo.md)。实现在
`Script_CutscenePerformance.mjs`，唯一挂点在 `Script_Cutscene._ApplyActors` 末尾。
库文件走 `fetch` + `?v=<sha256>`，`Script_Main` 在进第一关完整任务时**不 await** 地预取；
其它入口在第一次遇到 `perform` 时补一次，库没到位的那几帧照常走 POSE_CLIPS。

`clips[].weaponHold` 告诉表演层改完骨头后怎么把枪重新对准：`twoHand` 沿两手连线、
`oneHandRight` 沿右前臂过腕的延长线（与 `Actor._UpdateRiggedWeaponMount` 同一条规则）、
`free` 不碰。不补这一趟，枪会停在 `rig.Update` 那一刻的旧姿势上。

## 验证

```powershell
node Taierzhuang1938/Script_MachineGunCaptivesAnimationTest.mjs
node Taierzhuang1938/Script_TestRunner.mjs --only=MachineGunCaptivesAnimationTest
```

门禁做四件事：

1. **清单与资产自洽**：含源 GLB sha256 未被改动、`referenceSpeedMps` 两处一致、
   每条 loop clip 的首尾帧逐比特相同、两条过渡 clip 的交接帧就是它交给的那条循环的第 0 帧。
2. **36 条绑定在原皮上实播**：-Z 朝向 / 整皮离地 0–35 mm / Actor 世界根零漂移 /
   还原逐比特精确 / 逐条关键姿势数值；趴姿末帧逐顶点量手掌与脚背离地；
   举手走逐 1/24 s 量支撑脚的后移速度。
3. **四次打击加一次推搡的接触几何**：受击者的皮在 NRA 那两具上按**来袭方位**量（只算打击端扫过的
   ±9 cm 走廊里的顶点 —— 抱着头的人在 0.79 m 高处最外面那一点是他的胳膊肘，
   离刀走的那条线有四分之一米），打击的最远伸展在 IJA 那三具上量，站位从
   `Data_CutsceneMachineGunCaptives` 的轨道取。`刺入 = 触及 + 体表 − 站位`。
4. **`perform` 契约本身**：t0 起播、loop 整周回环、once 保持末帧、拖时间轴确定性、
   未知 id 只警告一次并回退、退出精确还原。

联系图落在忽略目录
`Taierzhuang1938/_shots/MachineGunCaptives/Texture_MachineGunCaptivesReview.png`
（IJA 的镜头里画一根从枪托到刺刀尖的代枪，便于目视判断枪指哪儿）。

### 2026-09-16 实测（第三轮）

5 具骨架 × 36 条绑定全绿，`rootDrift = 0`、`restoreError = 0`、`loopWrap = 0`、
`scrub = 0`、`hold ≤ 4.9e-15`、15 条 clip 的 `loopSeam = 0`。

**每一次接触都只有一个数，不再是一段范围。** 触及在**施动者自己那具**骨架上量、
体表在**受击者自己那具**上量（第二轮取「所有 NRA 里最大的那个」，而 NRA02 与 NRA05
在同一条带上差 2.7 cm），身高按 kind 给（日军 1.62、国军 1.66），`sizeScale` 钉死 1.0。

| 接触 | 站位 | 触及 | 体表 | 刺入 |
|---|---:|---:|---:|---:|
| 推搡（`IjaShoveForward` → 举手走） | 0.740 | 0.5910（IJA02） | 0.1580（NRA05） | **+0.0094** |
| 踢（`IjaKickPrisoner` → 抱头跪姿） | 0.939 | 0.7855（IJA02） | 0.1637（NRA05） | **+0.0105** |
| 枪托砸（`IjaRifleButtStrike` → 求饶跪姿的**头颈**） | 0.966 | 0.7954（IJA03） | 0.1847（NRA02） | **+0.0137** |
| 下刺可见（`IjaBayonetDownThrust` → 抱头跪姿） | 1.429 | 1.3911（IJA03） | 0.1585（NRA02） | **+0.1203** |
| 下刺黑场（同上 → 抱头跪姿） | 1.415 | 1.3895（IJA01） | 0.1461（NRA02） | **+0.1207** |

前三项按「停在体表」做（允许 −0.03…+0.05），下刺按「刺进去 0.10–0.15」做。
9-15 那一版把踢的触及写成了趾**骨高度** 0.63、又没有算受击者那 0.165 m 的皮，
日兵站到 0.78 m —— 靴子整整踢进胸口 0.16 m。

**散布**：门禁把这五个数在三组外观下各算一遍（`seed=Captives/variant=1`、
换 seed、换 `variantIndex`），五项全部 **0.00 mm**（上限 5 mm）。这是 `sizeScale`
钉死之后应有的结果 —— 接触几何现在只由骨架与 clip 决定，与抽到哪个随机数无关。

趴姿末帧：手掌离地 6–7 mm、脚背 3–8 mm（改前是 27–42 mm）。
举手走的支撑脚滑步 0.14%（1.4 mm/s）。被推那一步的支撑脚与轨道差 <2 mm。

## 变更史

- **2026-09-16（第三轮，BlenderMCP）**：新增 `IjaShoveForward` 与
  `CaptiveShovedStumble`（押解路上的一记推搡，用在镜 1「站住！」那一拍）；
  `IjaRifleButtStrike` 的落点从后背肩胛（高 0.62）抬到**头与后颈**（高 0.98），
  `CaptiveKneelFlinch` 跟着改成头被砸偏的反应（头骨横向 0.13 m），两处站位重算；
  报表的日军身高从 1.66 改成 `KIND_SPEC` 的 **1.62**（第二轮每个日军触及都长 2.4%）；
  过场侧给七个演员钉死 `sizeScale`，刺入深度不再随机浮动。版本戳
  `20260916MachineGunCaptivesV3`。
  BlenderMCP 侧多一处只影响 GUI 的改动：`ResetScene()` —— 在 timer 回调里调
  `read_factory_settings` 会换掉窗口管理器，那个回调的上下文里于是一个窗口也没有，
  主循环直接退出（日志上是「Preferences saved」后面紧跟一行「Blender quit」）。
  GUI 下改用 `read_homefile(load_ui=False)`，同一张空场景、同一份产物；
  `--background` 那条路一个字没动。两条路实测**逐比特相同**（IJA01 的 sha256 一致）。
- **2026-09-16（第二轮，BlenderMCP）**：新增 `CaptiveHandsUpWalk` /
  `CaptiveStandToKneel` / `CaptiveKneelFlinch` 三条；四条循环加呼吸、颤抖、转头与重心
  倒换并改成整数倍谐波（修掉每周期一次的接缝顿挫）；两条趴姿的手掌与脚背贴到地面；
  三次打击按实测的体表距离重新反推站位；烘焙侧的持枪点改成四指根中心（与运行时一致）。
  五个模型文件与清单全部重烘，版本戳 `20260916MachineGunCaptivesV2`。
- **2026-09-15（第一轮）**：十条 clip 建库。同日第二轮只重烘了 `IjaRifleButtStrike`
  （第一版砸击两手都挤在脸前、枪托只推到身前 0.44 m）：枪口方向改成按**矢状面仰角**
  插值（`AimFrom(pitch, yaw)`，pitch 单调减到 −216.9°），关键帧改成锚在**枪托**上。
  两条只能踩一次的坑记在那张表的注释里：直接插值两个近乎反向的方向向量会在中途缩到
  近零、归一化后整支枪甩到侧面；枪托抡过头顶和收回时握把低于 1.5 m，1.66 m 的枪连
  刺刀会把尖端扎进地里（实测 −0.22 m）。同一条坑在 `CaptiveStandToKneel` 的脚上又遇到
  一次：脚尖方向从「朝前」转到「朝后下」要转 118°，直接插两个端点向量会在中途穿过原点
  把脚翻过来 —— 所以那条也走单角度弧（`ToeArc`）。
