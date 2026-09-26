# 第一人称身体与持枪

生产入口是 `Script_Viewmodel`。`Script_RiggedModel` 保留正式国军源骨架与十指蒙皮，
`Script_FpsAnatomy` 从 bind pose 建立掌面、指节屈曲轴和骨段基准。

枪械掌面目标只由 `Data_FpsArmPoses.FPS_ARM_POSES` 的武器局部接触坐标决定。
腰射、ADS、冲刺改变武器姿态，不能再通过反标定手掌角度掩盖不合理的肘部。
IK 在 FOV 压缩之前的 `armAnchor` 空间求解。固定的第一人称骨段比例让肩截面保持
在画面下方，肘部在腕关节允许的圆弧内求解，保留上一帧弯肘方向并限制变化速度；
肩锚位于眼位后方，防止近距离收枪时可用弯肘空间消失。装刺刀等极限取物允许有限肩部前探，
不允许随距离伸长骨段。换弹、拉栓的工作手使用实际部件的掌面目标与手型；
目标位置、掌面旋转、手指形状在同一动作时钟内插值，骨骼桥接层不再二次插值或覆盖掌面旋转。

六把随身枪分别标定左右掌位、五指的三节屈曲、张指及拇指对掌方向。
射击时食指在扳机接触点附近弯曲；托枪、抓机柄、捏桥夹、压弹、拔匣、拉套筒各有手型。
每帧只旋转指节，保留烘焙后的骨骼静止位移。枪械动作件从第一人称私有几何分离，
弹匣、机柄与手掌接触使用同一变换，世界枪模不受影响。开镜保留完整枪托，
通过照门眼距留出相机净空，避免隐藏近端木件后暴露枪身内部。

空手是正式的 `Equip(null)` 状态：保留同一副双臂，跑动时左右反相摆动，指节向
松握拳过渡，静止时自然放低。武器切换、装填及伤害时序仍走原来的游戏链路。

`Script_FirstPersonBody` 在世界空间绘制国军上衣、裤子与鞋。它跟随玩家脚下坐标、
身体偏航与姿态混合，不继承相机俯仰旋转和视图模型深度缩放。眼位相对领口的前置量
随低头角度平滑增加，蹲姿另留相机下降所需的净空；卧姿保留独立偏移。
偏移只作用于自己的身体外观，不移动相机、碰撞体或脚底高度，避免低头看入躯干内部。
搬运或使用架设武器收枪时仍保留身体；
死亡、菜单、过场及独立编辑器镜头由主渲染入口统一隐藏。

## Blender 工程

- 身体源工程：`C:\Users\Bentl\OneDrive\AI\Models\Blender\Taierzhuang1938\FirstPersonBody\Animation_FirstPersonBody.blend`。
- 烘焙脚本：`_import/Script_FirstPersonBake.py`，必须在本任务专用 Blender 实例中运行。
- 源资产：`Model/Character/Model_LugouNra01.glb`；原始角色与第三人称动作保持独立。
- 运行时身体：`Model/Model_FirstPersonBody.glb`，含 FirstPersonIdle/Walk/Run/Crouch/Prone。
- 骨架测量：`Animation/FirstPerson/Data_FirstPersonSource.json`。
- 手部工程：`C:\Users\Bentl\OneDrive\AI\Models\Blender\Taierzhuang1938\FirstPersonGrip_20260906\Animation_FirstPersonHands.blend`，由
  `_import/Script_FirstPersonHandsBake.py` 从正式角色重新派生并导出 FPS 双臂。
  掌长和四指长度为源角色的 108%，掌宽为 135%，拇指在此基础上缩至 82%；模型与指节绑定位置同步调整，
  保留单位骨骼缩放、蒙皮与原动作。腕部和袖口重新分配权重，避免前臂适配拉长掌根。
  空手使用松握拳与独立拇指对掌姿势。

`.blend` 与 Blender 自动备份只保存在上述源工程目录，不提交到 github.io 仓库。
烘焙脚本使用当前用户主目录下的 `OneDrive/AI/Models/Blender` 作为源工程根目录。
MCP 使用独立实例与端口，不能在其他任务正在制作的场景中清场、覆盖文件或改骨架。
此次手部重建使用独立 Blender 后台 CLI 实例运行烘焙脚本，源工程可以直接重新打开。

## 验证

### 汉阳造手部与动作定位

汉阳造、三八式、中正式与大刀共用 `Model/Model_FpsHanYangHands.glb`，按武器实例化独立骨架；其余武器继续使用原双臂。
大刀的固定刃向与双手握柄工程见 [大刀劈砍修订](Data_DadaoPowerSwing.md)。
该资产保持 bind pose 的前臂与手部骨段长度，不再将关节静止位移乘以 1.60。
手部工程位于 `C:\Users\Bentl\OneDrive\AI\Models\Blender\Taierzhuang1938\HanYangHands_20260910\Animation_HanYangHands.blend`。
本次接触微调的独立工程位于 `C:\Users\Bentl\OneDrive\AI\Models\Blender\Taierzhuang1938\HanYangHandContact_20260911\Animation_HanYangHands.blend`，
同目录 `Data_HanYangHoldingPose.json` 保留校准握姿。左掌向外 1.5 mm、向下 0.5 mm，右拇指改为沿枪托前伸，
近、远指节屈曲分别为 18°、12°；运行时握姿与原有 Idle 循环同步，未增加动作。
`_import/Script_HanYangHandsShape.py` 修改这一件手部网格；
裸手沿用原始皮肤颜色与法线，修复腕部 UV 接缝；袖子为土灰色，无手套和白衬衫袖口。
左掌加宽、加厚，手指与前臂增加横截面体积；手指局部旋转来自参考包的单个持枪姿势，
再按本项目护木尺寸校正。`fingerRotations` 同时用于持枪骨骼片段和实时持枪状态，避免切换后回到旧手型。
`_import/Script_ExportHanYangHands.py` 在设置 `FPS_PROJECT_ROOT` 后只导出该模型，不生成动作。

动作表仅含 `Idle` 一个 4 秒持枪循环，60 fps，共 241 个采样点（不是 241 段动画）。
独立 Blender 工程只有一个 Action，以 9 个关键姿势驱动骨骼和枪械挂点；旧工程已独立备份。
`runtimeEnabled` 为 `true`，站立腰射持枪时播放；开镜、移动、开火、拉栓和换弹沿用原有逻辑。
`_import/Script_HanYangHoldingAnimation.py` 只重建这一段持枪动作，输入为已校准的单个握姿。
播放定位测试通过不代表手型、接触或动作已经验收。
三八式复用这套裸手、土灰袖口与固定骨段模型，保留三八式自身的左右握点、扳机、护木、拉栓与换弹手型。
`Type38Body` 的右肩相对汉阳造上移 20 mm、前移 20 mm，为桥夹取出后的回手留出可达空间；
固定骨段模型直接消费各武器的肩肘数据，不再走旧双臂的通用肩位覆盖。
挂点由 BlenderMCP 在独立工程
`C:\Users\Bentl\OneDrive\AI\Models\Blender\Taierzhuang1938\Type38NraArms_20260913\Animation_Type38Hands.blend`
中校正，同目录 `Data_Type38ArmMount.json` 保留导出值；未修改共用网格或添加动画片段。

大量动画及同类批量生成须明确授权范围与数量；已授权批次按约定执行，扩大范围前再确认；
不得通过逐个调用导出入口绕过这项约束。

第一人称编辑器提供片段选择、播放/暂停、循环、速度、进度拖动和逐帧定位。
直接入口为 `?weapons=1&editor=firstPerson&fpWeapon=HanYang&fpClip=Idle`，
打开后选中汉阳造、玩家相机和唯一的持枪片段；省略 `fpWeapon` / `fpClip` 时使用相同默认值。
Agent 与界面共用以下入口；浏览器帧号从 0 开始：

```javascript
const debug = window.Taierzhuang.Debug;
debug.FirstPersonAnimation({weapon:'HanYang',clip:'Idle',normalized:.55,playing:false,clean:true});
debug.FirstPersonAnimation({frame:126});
debug.FirstPersonAnimation({step:1});
debug.FirstPersonAnimation({playing:true,loop:true,speed:.5});
debug.FirstPersonAnimation({playing:false});
debug.FirstPersonAnimation({realtime:true,clean:false});
```

`seconds`、`normalized`、`frame` 三种定位参数择一使用；定位自动暂停。
返回快照包含当前片段、秒数、帧数、播放状态和诊断信息，便于随后截图。
BlenderMCP 在上述独立工程执行 `_import/Script_FpsAnimationStudio.py` 后，可调用
`SelectFpsAnimation('HanYang','Idle',normalized=.55)`；Blender 帧号从 1 开始。
`ExportFpsAnimation(projectRoot,'Idle')` 只更新一个已存在的片段，拒绝其他武器或新增条目；
它本身不授予动画制作或批量导出的许可。

`node Taierzhuang1938/Script_FpsAnimationTest.mjs --browser` 检查限定条目、骨骼数据、
暂停稳定性、重复定位与逐帧行为。截图位于忽略目录 `_shots/FirstPersonSkeleton/Playback/`，
需人工与参考图对照掌形、指节、腕部、肘部和枪械接触。

`Script_FirstPersonEmbodimentTest` 从实际游戏输入检查空手双手运动与蒙皮像素，
从最终骨骼矩阵检查所有枪械的掌心位置、腕部弯曲与肘部奇异姿态，并输出低头截图。
低头验收测量实际蒙皮顶点到眼位的净空与裁切领口的可见性，覆盖站、蹲、卧及四个朝向的
连续姿态切换；截图使用手动时钟，避免实时循环在测量和出图之间改变姿态。
开镜、冲刺和回位逐帧检查，防止两个合格静态姿势之间出现腕部反折或肘部跳变。
腕部和接触阈值统一见 `FPS_ARM_LIMITS`。

`Script_FpsArmTest` 覆盖全部装备与开火、拉栓、装填、刺刀、投掷、近战动作；
`Script_WeaponShot --fp` 负责人工检查手与枪的实际轮廓。接触残差合格不等于画面合格。

`Script_FpsHandContactTest` 进一步测量六把随身枪的蒙皮指腹到真实扳机、机柄、桥夹、
弹匣和套筒表面的距离，以及五把长枪左手五个指腹到护木的距离，
覆盖腰射、开镜、射击及完整换弹/拉栓逐帧动作。
同时检查指腹朝向、手指骨长不变、腕部弯曲及双臂可达性。架设武器（接管机枪）的双手
见下文「架设机枪」；其规则仍由 `Script_Emplacement` 负责。

军用手枪 `ServicePistol` 的导入显式朝向优先于木件重心启发式；金属度分桶后的源坐标
不能再次反转枪口。掌心和换匣路径按修正后的闭锁 A 状态测量，左手依次到握把底部、
取匣位和套筒后部，右手保持握持。`AssetStandardsTest` 直接解码成品木握把三角面，
检查前后关系、右掌表面距离和弹匣入口，防止只有挂点正确、实际枪模拿反的回归。

## 参考方法

采用公开 UE 方法作为工程参照，不把实现描述为 COD 或战地的内部源码复刻：

- [Epic：First Person Rendering](https://dev.epicgames.com/documentation/unreal-engine/first-person-rendering?lang=en-US)：第一人称物体独立 FOV 与近景缩放。
- [Epic：Two Bone IK](https://dev.epicgames.com/documentation/unreal-engine/animation-blueprint-two-bone-ik-in-unreal-engine)：接触目标和肘部目标分离。
- [Epic：Virtual Bones](https://dev.epicgames.com/documentation/en-us/unreal-engine/virtual-bones-in-unreal-engine)：通过目标空间和 IK 保持附加动作中的接触关系。

### 三八式握姿修复（2026-09-16）

参照汉阳造已校准握姿，三八式改用相同掌面方向、右拇指沿枪托前伸及左手托握轮廓。
右掌按三八式扳机相对汉阳造右移 1 mm、下移 2 mm、前移 45 mm；左掌前移 45.58 mm，
左中指、无名指、小指的掌指关节独立微调以贴合较窄护木。保留原肩肘挂点和拉栓、换弹时序。
运行时只修改 `Data_FpsArmPoses` 的三八式条目，共用网格与汉阳造条目保持原样。
独立 BlenderMCP 工程：`C:\Users\Bentl\OneDrive\AI\Models\Blender\Taierzhuang1938\Type38Grip_20260916\Animation_Type38Hands.blend`。
同目录保留手指校准数据及实际运行时骨骼快照；无新增动画片段。

验收：三八式 `FpsArmTest --only=Type38` 86/86；`FpsHandContactTest --only=Type38`
覆盖腰射、开镜、开火及 281 帧拉栓/换弹；右食指到扳机约 1.1 mm，左手五指均通过 4 mm 门限。
已查看游戏腰射/开镜/开火/拉栓图与 Blender 握姿图。`MotionVectorContractTest` 通过。
`FirstPersonEmbodimentTest` 在“Stand look-down shows the actual body mesh”失败；
在同一工作区换回修改前的 `Data_FpsArmPoses.mjs` 后复现相同失败，属本次修改前已有问题。


### 普通手榴弹修复（2026-09-16）

普通 `Grenade` 使用同一份 `Model_FpsHanYangHands.glb` 修复裸手与灰白袖口，独立实例化骨架。
`Data_FpsGrenadeThrow.mjs` 是 BlenderMCP 制作的一段投掷轨迹：肩侧蓄力、向前脱手、下收回位；
左手退出后留在画面下方，右手随脱手逐渐松指。肩肘使用 `Data_FpsArmPoses` 中的普通手雷标定，
固定骨段，不再绕相机大幅旋转整个动作支架。脱手回调在当前帧握点和骨骼更新后执行，
保留原 0.82 秒动作和 0.48 归一化释放时刻、库存与弹道链路。

源工程：`C:/Users/Bentl/OneDrive/AI/Models/Blender/Taierzhuang1938/GrenadeThrow_20260916/Animation_GrenadeThrow.blend`。
`_blender/Script_GrenadeThrowStudio.py` 生成这一段可编辑控制曲线，
`_blender/Script_GrenadeThrowRigBake.py` 将实测的修复手臂骨架与手雷装入同一工程。
两者在独立后台 Blender 实例执行，通过 `GRENADE_PROJECT_ROOT` 指定本任务项目目录；不改当前交互场景。
工程及截图只留本地。此修改只针对普通手持手雷，不扩展到集束弹或其他武器动作。

验收：`node Taierzhuang1938/Script_GrenadeThrowTest.mjs` 采样完整 121 帧，检查握点、腕角、
肘部连续性、骨段长度、单次释放，以及连续推进后的动作结束和回位；
`node Taierzhuang1938/Script_FpsArmTest.mjs --only=Grenade` 检查普通手雷的现有状态契约。
截图和骨骼回放数据位于忽略目录 `_shots/GrenadeThrow/`，必须查看真实渲染后交付。

本次实测：完整投掷握点误差为零，腕角最大约 64°，相邻采样肘部位移最大约 12 mm；
两档力度连续播放均只释放一次且完成回位。普通手雷状态检查 41/41 通过；
MotionVectorContract、ExplosionRules、ExplosionRange 通过。通用 BootTest 在 240 秒超时前
报告第一关 `readableIjaMaterials=0`；在未修改主检出上复测同一条件仍为 0，
这是本次之外的材质接入问题。七切片完整开机回归未完成，不能称为全量通过。

### 架设机枪（2026-09-27）

接管机枪不再收枪只看世界模型。对标 COD WWII / BFV 的固定机枪与两脚架：**枪钉在工事上、人贴上去**。

- 视图模型换成这挺枪本身，双臂取 `Data_FpsArmPoses.FPS_MOUNTED_ARM_POSES`（运行时键 `<weaponId>@mounted`，
  `FpsMountedPoseKey`）。枪模、照门、接触坐标、扳机指和换匣动作与随身那一把同一套；只换持枪姿态（腰射在视线右下、
  不带旋转，开镜照 `Sight` 解到屏幕正中）、肩位（汉阳造那套）和手臂资产（`armRig: "HanYang"`：人还是那个人，
  上枪位不换袖子）。没有架设姿势的枪维持旧行为。
- 眼位由枪反推：`Viewmodel.MountedEyeOffsets` 给出枪局部原点在相机空间的腰射/开镜位置，
  `Script_Main.MountedCameraEye` 挂在 `Player.SyncCamera` 尾部（`player.cameraMount`），按枪的位置与朝向把眼睛放到
  枪后头，从按 F 那一刻的眼位用 `EMPLACEMENT_VIEW.blendInS` 滑过去，下枪位用 `blendOutS` 滑回。
  视图模型那挺枪每帧按世界模型的位姿换算到相机空间（`Viewmodel.SetMount`），所以滑移途中枪也不动；
  接管期间 FOV 补偿压回 1、走路晃/鼠标甩/落地/换匣整枪位移清零，只留后坐层。世界模型此刻隐藏，节点照常转，
  弹道仍从它的 muzzle 出去。
- 每一发 `viewmodel.TriggerFire({cameraKick:false, recoilScale})`：枪和肩一起跳、抛壳、食指扣到底、视图模型枪口出火；
  世界那边的 `vfx.MuzzleFlash` 改走 `player:true`（只出光和烟），与步枪同口径。准心上跳仍由 `player.ApplyRecoil` 管。
  换弹板时视图模型播这把枪的换匣，枪不离座，只有右手离开握把；卡壳时每拉一下枪机（`stats.pulls` 涨一次），
  右手去拉一下机柄（`Viewmodel.TriggerCharge`，机柄跟着走满 `boltTravel` 再送回）。
- 接管期间换枪、拔刀、上刺刀、掏手榴弹一律封掉（R、F 另有语义）；人倒在枪上时枪留在工事上，只让空着的双手倒下。

手指：捷克式那份握姿是按另一双手拟合的，换成汉阳造那双更厚的手后右无名指、拇指与左食指陷进枪体 5–8 mm。
BlenderMCP 独立工程
`C:\Users\Bentl\OneDrive\AI\Models\Blender\Taierzhuang1938\Zb26MountedGrip_20260927\Animation_Zb26MountedGrip.blend`
里逐指重拟合三节屈曲角（与运行时同一套正向运动学，误差 3e-8 m），只写进 `Zb26@mounted` 的 `fingers`，随身捷克式不动。
取证包由 `Script_MountedGripExport.mjs` 从实机导出，`_blender/Script_MountedGripFit.py` 负责量穿插（`measure`）与拟合（`fit`），
结果与前后近景图在工程目录（`Data_Zb26MountedFingerFit.json`、`Preview/`）。穿插判据要同时满足「最近面法线在内侧」与
「三条斜射线奇偶多数在内」：枪模不是封闭网格（弹匣、枪机是拆开的件），单看一条会误报十几毫米。

本次实测：拟合前最深陷入 7.8 mm；拟合后九指 ≤1.6 mm，右拇指 4.2 mm（根节随 `thumbDirection`，未拟合），右前臂袖口压在
枪托上 4.7 mm；十个指腹离枪面 0.2–2.2 mm。验收：`node Taierzhuang1938/Script_EmplacementViewBrowserTest.mjs`
（接管后双臂 IK 残差 0、指腹 ≤4 mm、双臂涂色像素占屏 3.1%（左半 2.1%）、视图模型枪口与世界模型重合、眼位误差 <5 mm、
滑移单帧 ≤8.3 cm、开镜照门居中、五发连射枪身偏移 4 mm 且不记 cameraKick、换弹板枪不动而右手移动 31 cm、
小卡拉枪机时机柄走满行程且右手离开握把、离位还原步枪与眼位），
截图在 `_shots/EmplacementView/`。
