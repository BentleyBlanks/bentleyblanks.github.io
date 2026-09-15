# 机枪点位「川军被俘」过场动作

范围：第一关 04 机枪点位刚进入时那场关中过场 —— 退路被截断的几名川军举着手被押进来、
跪在开阔地上、被日军踢倒／枪托砸／指着喝令，最后被刺刀捅死。这一套只服务这一场戏，
**十三条动作、五具骨架、共 31 条可播绑定**。NRA02 / NRA05 / IJA01 / IJA02 / IJA03 的
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

# B. BlenderMCP（本轮用的）：带窗口起 Blender，把同一个文件当 __main__ exec 进去
& "C:/Program Files/Blender Foundation/Blender 5.1/blender.exe" --python <bootstrap.py>
# bootstrap 里 addon_enable("blender_mcp") + blendermcp.start_server()，再用任意
# socket 客户端发 {"type":"execute_code","params":{"code":"…"}}
```

**坑**：`read_factory_settings` 会重载偏好设置，于是 `blender_mcp` 被禁用、
`unregister()` 把服务连同所有在连客户端一起关掉 —— 每烘一具骨架断一次线。
bootstrap 里挂一个 `persistent=True` 的看门狗定时器，掉了一秒内自己起回来；
客户端把「连接被关掉」当成「命令已收下」，日志写文件，重连后再读。

其它开关（都只影响迭代速度，不影响产物）：`CAPTIVES_MODEL=LugouIja01[,…]` 只烘一具、
`CAPTIVES_SKIP_BLEND=1` 不存 `.blend`、`CAPTIVES_RENDER=<目录>` 出 Workbench 预览图、
`CAPTIVES_REGIONS=1` 逐帧打印脚/小腿/大腿/胯/躯干/头/手/臂各自的最低点（调贴地用）。

可编辑工程在
`C:/Users/Bentl/OneDrive/AI/Models/Blender/Taierzhuang1938/MachineGunCaptives_20260916/`
（9-15 那一轮留在 `…_20260915/`，没有覆盖）：每具骨架一个
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

## 十三条动作

秒数与循环性同时写在 `Data_MachineGunCaptivesAnimation.json` 的 `clips`，
运行时只读那张表。下面的数值是门禁在 `targetHeight = 1.66 m` 的实机蒙皮上量的
（单位米，骨头离演员脚下平面；前伸取演员局部 −Z）。

| id | 骨架 | 秒 | 播放 | 内容 | 实测 |
| --- | --- | ---: | --- | --- | --- |
| `CaptiveHandsUpWalk` | NRA02/05 | 1.8 | loop | **举着手被押着走**：双手高举过头、含胸缩肩、小步快走、每两步一个踉跄。两个步态周期（每周期 0.9 s） | 头 1.288–1.319；支撑脚后移 1.004–1.012 m/s（源尺度 1.10 × 演员缩放，滑步 0.14%） |
| `CaptiveHandsUpStand` | NRA02/05 | 4.0 | loop | 站立、双手高举过头、缩肩低头、呼吸 0.25 Hz、手臂轻颤 3.25 Hz | 头 1.368–1.383；腕高于头骨 ≥0.36 |
| `CaptiveStandToKneel` | NRA02/05 | 1.0 | once（末帧＝跪姿首帧） | **跪下的过程**：举手站姿 → 沉胯下蹲（脚不挪）→ 双膝落地、脚踝翻过脚尖躺平 → 双手抱后脑 | 头 1.376 → 0.970–0.980；末帧与 `CaptiveKneelHandsHead` 第 0 帧**逐比特相同** |
| `CaptiveKneelHandsHead` | NRA02/05 | 4.0 | loop | 双膝跪地、小腿与脚背贴地、双手抱后脑、胸腔呼吸 0.25 Hz、上身细颤、每周期一次慢转头 | 头 0.980–0.997；胯 0.44–0.46；膝 0.08–0.10 |
| `CaptiveKneelPlead` | NRA02/05 | 4.0 | loop | 同一跪姿、抬头、双手在胸前前伸掌心向上哀求，上身随说话起伏 | 头 0.990–1.012；胯 0.44–0.46 |
| `CaptiveKneelFlinch` | NRA02/05 | 0.8 | once（首尾＝跪姿首帧） | **跪着挨枪托**：头猛一低并偏向一侧、双肩夹紧、上身缩成一团、带一次 15 Hz 的短颤，再回到抱头 | 头 0.994 → 0.886 → 0.994；首尾两帧与 `CaptiveKneelHandsHead` 第 0 帧**逐比特相同** |
| `CaptiveStruckDown` | NRA02/05 | 1.6 | once（末帧保持） | 跪姿被从后侧击打，前扑撑手、腿蹬直，末帧脸朝下趴稳、双臂前伸 | 头 0.99→0.21；末帧手掌离地 6–7 mm、脚背 3–8 mm |
| `CaptiveStabbedCollapse` | NRA02/05 | 2.0 | once（末帧保持） | 跪姿被刺：猛一顿、上身后弓、捂腹僵住、向前瘫软趴倒，末帧稳定 | 头 1.02→0.26；末帧手掌离地 7 mm、脚背 3–7 mm |
| `IjaBayonetGuard` | IJA01/02/03 | 4.0 | loop | 站立、三八式上刺刀平端指向前下方（押俘虏），重心每周期在两脚间倒换一次、头跟着行列左右扫 | 头 1.355–1.380；刺刀尖 (前 1.15–1.17, 高 0.63–0.66) |
| `IjaTauntGesture` | IJA01/02/03 | 4.0 | loop | 右手单手提枪于腰侧、左手指点挥手、头随喊话前探，重心倒换同上 | 头 1.353–1.375；刺刀尖 (前 1.52–1.56, 高 0.33–0.45) |
| `IjaKickPrisoner` | IJA01/02/03 | 1.2 | once（回到站姿） | 重心移到左腿、右腿前踢（踢跪着的人的胸口高度）、收腿站稳 | 接触帧 0.46 s：**靴面前伸 0.805–0.812、高 0.63**；最远 0.835（0.50 s） |
| `IjaRifleButtStrike` | IJA01/02/03 | 1.4 | once（回到站姿） | 反握翻转枪身：0.50 s 枪托甩到头顶后上方、枪口朝前下；0.85 s 枪托翻过头顶砸到身前跪着的人的**后背与肩**；1.40 s 收回持枪式 | 砸击枪托落点 **前 0.793–0.798 / 高 0.640–0.647**、躯干前倾 **25.2°**、右肩到腕 0.456–0.461、骨盆前移 0.28 |
| `IjaBayonetDownThrust` | IJA01/02/03 | 1.6 | once（末帧是收回的持枪式） | 双手持枪蓄力后撤 → 前弓步向前下全力刺出 → 保持约 0.3 s → 抽回半步回到平端 | 刺出 0.76 s：刺刀尖 **前 1.393–1.395 / 高 0.78**；到底（1.03 s）1.411；行程 0.37 |

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
改这十三条 clip 的秒数或触及距离，那边的站位表要一起重算。

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
2. **31 条绑定在原皮上实播**：-Z 朝向 / 整皮离地 0–35 mm / Actor 世界根零漂移 /
   还原逐比特精确 / 逐条关键姿势数值；趴姿末帧逐顶点量手掌与脚背离地；
   举手走逐 1/24 s 量支撑脚的后移速度。
3. **三次打击的接触几何**：受击者的皮在 NRA 那两具上按**来袭方位**量（只算打击端扫过的
   ±9 cm 走廊里的顶点 —— 抱着头的人在 0.79 m 高处最外面那一点是他的胳膊肘，
   离刀走的那条线有四分之一米），打击的最远伸展在 IJA 那三具上量，站位从
   `Data_CutsceneMachineGunCaptives` 的轨道取。`刺入 = 触及 + 体表 − 站位`。
4. **`perform` 契约本身**：t0 起播、loop 整周回环、once 保持末帧、拖时间轴确定性、
   未知 id 只警告一次并回退、退出精确还原。

联系图落在忽略目录
`Taierzhuang1938/_shots/MachineGunCaptives/Texture_MachineGunCaptivesReview.png`
（IJA 的镜头里画一根从枪托到刺刀尖的代枪，便于目视判断枪指哪儿）。

### 2026-09-16 实测

5 具骨架 × 31 条绑定全绿，`rootDrift = 0`、`restoreError = 0`、`loopWrap = 0`、
`scrub = 0`、`hold ≤ 4.4e-15`、13 条 clip 的 `loopSeam = 0`。

| 打击 | 站位 | 触及 | 体表 | 刺入 |
|---|---:|---:|---:|---:|
| 踢（`IjaKickPrisoner` → 抱头跪姿） | 0.960 | 0.805–0.812 | 0.165 | **0.010–0.018** |
| 枪托砸（`IjaRifleButtStrike` → 求饶跪姿） | 0.980 | 0.793–0.798 | 0.191 | **0.004–0.010** |
| 下刺可见（`IjaBayonetDownThrust` → 抱头跪姿） | 1.432 | 1.393–1.395 | 0.159 | **0.121–0.122** |
| 下刺黑场（同上 → 抱头跪姿） | 1.416 | 1.392–1.393 | 0.146 | **0.121–0.123** |

前两项按「停在体表」做（允许 −0.03…+0.05），下刺按「刺进去 0.10–0.15」做。
9-15 那一版把踢的触及写成了趾**骨高度** 0.63、又没有算受击者那 0.165 m 的皮，
日兵站到 0.78 m —— 靴子整整踢进胸口 0.16 m。

趴姿末帧：手掌离地 6–7 mm、脚背 3–8 mm（改前是 27–42 mm）。
举手走的支撑脚滑步 0.14%（1.4 mm/s）。

## 变更史

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
