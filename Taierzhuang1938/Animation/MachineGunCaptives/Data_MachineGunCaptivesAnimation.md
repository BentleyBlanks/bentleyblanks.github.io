# 机枪点位「川军被俘」过场动作

范围：第一关 04 机枪点位刚进入时那场关中过场 —— 退路被截断的几名川军举手投降被俘、
跪在开阔地上、被日军踢倒／枪托砸／指着喝令，最后被刺刀捅死。这一套只服务这一场戏，
十条动作、五具骨架、共 25 条可播绑定。NRA02 / NRA05 / IJA01 / IJA02 / IJA03 的
可见网格、蒙皮权重、inverse bind 与骨层级**一个字节没动**（门禁逐个核对源 GLB 的 sha256）。

## 制作方式

本机 Blender 5.1 背景模式（`blender.exe --background --python-exit-code 1 --python …`，
与 BlenderMCP 执行的是同一条 bpy 路径）。`_import/Script_MachineGunCaptivesBake.py`
逐具骨架导入源 GLB、用 python 摆关键帧（两骨 IK 链解四肢、手掌朝向与手指整体握张、
缓入缓出的关键帧表），再把 Blender 骨架帧换算回源 GLB 的骨局部帧导出 JSON。
从仓库根执行，或先设 `CAPTIVES_PROJECT` 指向 `Taierzhuang1938` 绝对路径：

```powershell
$env:CAPTIVES_PROJECT="<repo>/Taierzhuang1938"
& "C:/Program Files/Blender Foundation/Blender 5.1/blender.exe" --background --python-exit-code 1 `
  --python "<repo>/Taierzhuang1938/_import/Script_MachineGunCaptivesBake.py"
```

其它开关（都只影响迭代速度，不影响产物）：`CAPTIVES_MODEL=LugouIja01[,…]` 只烘一具、
`CAPTIVES_SKIP_BLEND=1` 不存 `.blend`、`CAPTIVES_RENDER=<目录>` 出 Workbench 预览图、
`CAPTIVES_REGIONS=1` 逐帧打印脚/小腿/大腿/胯/躯干/头/臂各自的最低点（调贴地用）。

可编辑工程在
`C:/Users/Bentl/OneDrive/AI/Models/Blender/Taierzhuang1938/MachineGunCaptives_20260915/`：
每具骨架一个 `Scene_<ModelId>MachineGunCaptives.blend`（演员、每条动作一个可编辑 action
＋一条静音 NLA 副本、地面、正交审阅相机与两盏灯），外加一份逐帧数值报告
`Data_<ModelId>MachineGunCaptivesValidation.json`。`.blend`、渲染图与审阅报告都不进仓库。

## 坐标与朝向换算

烘焙在 **Blender 源尺度**（人高约 1.76–1.82 m）里做：`+Z` 向上、角色正面 `−Y`、
角色自己的左手边 `+X`、地面 `z = 0`。源 GLB 的资产正面是 `+Z`（实测脚尖方向，
与 `Script_FirstLevelCarriageAnimationBake.py` 同一条断言看着），`convert` 矩阵
`(x, y, z)_gltf → (x, −z, y)_blender` 把它映到 Blender 的 `−Y`；运行时
`CharacterModel` 的 `MODEL_FORWARD_YAW = π` 再把它转成引擎契约的 **Actor 正面 −Z**。
换算成演员局部坐标就是 `X_actor = −X_blender`、`Y_actor = Z_blender`、`Z_actor = Y_blender`。
导出的是**源 GLB 骨架的逐骨局部 position/quaternion**（24 Hz 采样、stride 7），
运行时不导入新骨架。

**贴地在烘焙时做**：每一帧先按当前姿势算真实变形网格的最低顶点，再把这一帧的
所有世界目标整体上下平移，使最低顶点正好离地 `floorClearanceM = 3 mm`。
所以运行时没有脚底探针、没有「探针→抬根→再探针」的回路，跪姿与趴姿也不会被按
「鞋底」抬起来。跪姿的脚背落点另有一次逐骨架标定：同一个姿势下分别量小腿组与脚组的
最低顶点，把踝高补到两者共面（各骨架的靴子厚度不同，常数写死会让一只脚悬空 4 cm）。

## 十条动作

秒数与循环性同时写在 `Data_MachineGunCaptivesAnimation.json` 的 `clips`，
运行时只读那张表。下面的数值是门禁在 `targetHeight = 1.66 m` 的实机蒙皮上量的
（单位米，骨头离演员脚下平面；前伸取演员局部 −Z）。

| id | 骨架 | 秒 | 播放 | 内容 | 实测 |
| --- | --- | ---: | --- | --- | --- |
| `CaptiveHandsUpStand` | NRA02/05 | 4.0 | loop | 站立、双手高举过头、缩肩低头、重心左右微晃（被押着走时也用它，位移由过场 track 给） | 头 1.369–1.383；腕高于头骨 0.364–0.366 |
| `CaptiveKneelHandsHead` | NRA02/05 | 4.0 | loop | 双膝跪地、小腿与脚背贴地、双手抱后脑、上身细颤 | 头 0.979–0.997；胯 0.448–0.463；膝 0.079–0.095 |
| `CaptiveKneelPlead` | NRA02/05 | 4.0 | loop | 同一跪姿、抬头、双手在胸前前伸掌心向上哀求，上身随说话起伏 | 头 0.990–1.012；胯 0.449–0.465 |
| `CaptiveStruckDown` | NRA02/05 | 1.6 | once（末帧保持） | 跪姿被从后侧击打，前扑撑手、腿蹬直，末帧脸朝下趴稳、双臂前伸 | 头 0.980→0.208；胯 0.456→0.182 |
| `CaptiveStabbedCollapse` | NRA02/05 | 2.0 | once（末帧保持） | 跪姿被刺：猛一顿、上身后弓、捂腹僵住、向前瘫软趴倒，末帧稳定 | 头 1.019→0.258；胯 0.498→0.183 |
| `IjaBayonetGuard` | IJA01/02/03 | 4.0 | loop | 站立、三八式上刺刀平端指向前下方（押俘虏），重心微动 | 头 1.363–1.385；刺刀尖 (前 1.15–1.17, 高 0.64–0.67) |
| `IjaTauntGesture` | IJA01/02/03 | 4.0 | loop | 右手单手提枪于腰侧、左手指点挥手、头随喊话前探 | 头 1.360–1.377；刺刀尖 (前 1.52–1.54, 高 0.33–0.40) |
| `IjaKickPrisoner` | IJA01/02/03 | 1.2 | once（回到站姿） | 重心移到左腿、右腿前踢（踢跪着的人的胸口高度）、收腿站稳 | 头 1.310–1.382；右趾最高 0.625–0.630；胯起伏 0.042 |
| `IjaRifleButtStrike` | IJA01/02/03 | 1.4 | once（回到站姿） | 反握翻转枪身：0.50 s 枪托甩到头顶后上方、枪口朝前下、两手一后一前分开握着枪身；0.85 s 枪托翻过头顶砸到身前跪着的人的头肩高度；1.40 s 收回持枪式 | 头 1.208–1.391；蓄力枪托高出头骨 0.316–0.317、右腕高于头骨 0.143–0.144 而左腕低 0.095–0.096；砸击枪托落点 **前 0.793–0.798 / 高 0.640–0.647**、躯干前倾 **25.2°**、右肩到腕 0.456–0.461、骨盆前移 0.281–0.284 |
| `IjaBayonetDownThrust` | IJA01/02/03 | 1.6 | once（末帧是收回的持枪式） | 双手持枪蓄力后撤 → 前弓步向前下全力刺出 → 保持约 0.3 s → 抽回半步回到平端 | 头 1.243–1.380；刺出时刺刀尖 (前 1.41, 高 0.79)；行程 0.37 |

`IjaBayonetDownThrust` 的末帧按契约允许的那个变体做：**刺入姿态保持 0.76–1.06 s（约 0.3 s）
之后抽回**，1.6 s 的最后一帧是收回的持枪式，不是刺入姿态。要「刺进去不动」的镜头
就让过场在 1.0 s 左右换成别的 clip 或切镜。

刺刀尖 / 枪托的坐标是按三八式上刺刀的真实尺寸从右手握点推出来的
（`Data_Weapons.Type38`：`bayonetTotalM 1.663`，`_blender/BuildWeapons.py` 的 `BUTT_Z 0.255`，
所以尖端在握点前 1.408 m、托底在握点后 0.255 m）。武器本体是实尺寸、不随演员缩放，
门禁量的也是这条线。

## 运行时用法

唯一的消费者是关中过场 `CS_MachineGunCaptives`（`Data_CutsceneMachineGunCaptives.mjs`）：哪一秒换哪一条、受击者换 clip 的时刻怎么与接触帧对齐、三种打击的触及距离反推出的站位与俰视误差，全在 [docs/Data_MachineGunCaptivesCutscene.md](../../docs/Data_MachineGunCaptivesCutscene.md) §2。改这十条 clip 的秒数或触及距离，那边的站位表要一起重算。

过场数据侧只写一条 `state.perform`，语义与边界见
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

门禁做三件事：清单与资产自洽（含源 GLB sha256 未被改动）、25 条绑定在**原皮上实播**
（-Z 朝向 / 整皮离地 0–35 mm / Actor 世界根零漂移 / 还原逐比特精确 / 逐条关键姿势数值）、
以及 `perform` 契约本身（t0 起播、loop 整周回环、once 保持末帧、拖时间轴确定性、
未知 id 只警告一次并回退、退出精确还原）。联系图落在忽略目录
`Taierzhuang1938/_shots/MachineGunCaptives/Texture_MachineGunCaptivesReview.png`
（IJA 的镜头里画一根从枪托到刺刀尖的代枪，便于目视判断枪指哪儿）。

2026-09-15 实测：5 具骨架 × 25 条绑定全绿，`rootDrift = 0`、`restoreError = 0`、
`loopWrap = 0`、`scrub = 0`、`hold ≤ 4.4e-15`。

同日第二轮只重烘了 `IjaRifleButtStrike`（第一版砸击两手都挤在脸前、枪托只推到身前
0.44 m）。改动限于 `_import/Script_MachineGunCaptivesBake.py` 的 `strike` 表：枪口方向
改成按**矢状面仰角**插值（`AimFrom(pitch, yaw)`，pitch 单调减到 −216.9°），关键帧改成
锚在**枪托**上。两条只能踩一次的坑记在那张表的注释里：直接插值两个近乎反向的方向向量
会在中途缩到近零、归一化后整支枪甩到侧面；枪托抡过头顶和收回时握把低于 1.5 m，
1.66 m 的枪连刺刀会把尖端扎进地里（实测 −0.22 m，现在全程 ≥ 0.017 m）。
其余九条 clip 与两个 NRA 文件**逐字节未变**，只有三个 IJA 文件和清单里它们的 sha 变了。
