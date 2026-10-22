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
栓动步枪的开镜眼距对标 COD WWII 三八式开镜（`Data_FpsArmPoses.RIFLE_ADS_EYE`）：三八式、汉阳造 0.22 m，
中正式 0.24 m，机柄尾端约占画面高三分之一，托枪左手只在机匣左下露一点。
改眼距要同时量开枪 + 拉栓全程离相机最近的可见顶点，必须留在近裁面 0.06 m 之外（现为 73–78 mm）。
开镜时三支步枪改用开镜专用托枪手（`adsSupport`）与后移的开镜左肩、朝下朝后收并往外撇的开镜左肘（三支同一组极向量）：手握在机匣左侧、拇指顺护木侧面，
前臂和袖子从左下角斜着进画（对标 COD）。拇指顺着木托左侧上半部朝枪口，四指在它下面托住木托底；开镜手指按单轴铰链拟合，指间关节不反折、指根不上翘成爪形，`Script_FpsHandPoseTest` 同样检查开镜那一份。
腰射握姿不变；握法随「是否按住瞄准」平滑切换，拉栓时不换。`Script_FpsHandContactTest` 用整臂探针检查三支步枪开镜左臂（手、腕、前臂、袖子）对枪体零交叉。开镜左腕放直到 11–18°（腕处皮肤按这个弯折量折，弯多了侧面会折出硬棱），整只手顺着前臂往里转，俯视时手腕、拇指根、拇指尖成一线。细节见 [Data_FpsRifleView20261016.md](Data_FpsRifleView20261016.md) v12、v14–v17。
三八式／中正式的腰射托枪手原先也有反折的指关节，v13 在掌框不动的前提下按同一铰链规则修正；
`Script_FpsHandPoseTest` 现在检查每件装备的腰射托枪手和开镜握法的整个 0–1 过渡。

空手是正式的 `Equip(null)` 状态：保留同一副双臂，跑动时左右反相摆动，指节向
松握拳过渡，静止时自然放低。武器切换、装填及伤害时序仍走原来的游戏链路。

`Script_FirstPersonBody` 在世界空间绘制国军上衣、裤子与鞋。它跟随玩家脚下坐标、
身体偏航与姿态混合，不继承相机俯仰旋转和视图模型深度缩放。眼位相对领口的前置量
随低头角度平滑增加，蹲姿另留相机下降所需的净空；卧姿保留独立偏移。
偏移只作用于自己的身体外观，不移动相机、碰撞体或脚底高度，避免低头看入躯干内部。
搬运或使用架设武器收枪时仍保留身体；
死亡、菜单、过场及独立编辑器镜头由主渲染入口统一隐藏。

### 下半身：原地转身、踩步与脚锁地（2026-10-22）

用户在白盒编辑器里反馈两件事：转视角时身体跟着一起转；走路脚有点飘。原因：

- 身体根节点每帧直接用视线偏航，腿和脚像炮塔一样跟着镜头转。
- 烘出来的 `FirstPersonWalk` / `Run` 腿是**倒着迈**的（着地的脚往前推），一步只有约 0.3 m，原速只够 0.6 m/s（跑 0.8 m/s）；
  玩家站姿走 3.05 m/s、冲刺 5.25 m/s，脚一直在地上滑。`Crouch` 是静止姿势，蹲着走腿完全不动。

改法对标 3A 第一人称全身（UE5 Lyra 的 Turn In Place / Orientation Warping / Distance Matching / Foot Locking + 两节骨骼 IK）：

- **上身对视线、胯有自己的朝向**（`Script_FirstPersonGait.lowerYaw`）。站着转视角胯不动，`Spine1` / `Spine2` 各拧一部分把上衣拧回视线
  （腿挂在 `Spine` 下，不拧它）；偏差超过 50° 才转胯，脚一步一步挪过去，上身最多拧 85°。根节点的位置照旧按视线偏航往眼睛后面放，所以领口与眼睛的净空和原来一样。
- **走路按距离踩步**：速度查表得每秒步数（1.3 m/s 约 1.9、3.05 m/s 约 2.75、5.25 m/s 约 3.25）与着地占比，步态相位随这个推进，
  一步跨的距离 = 速度 ÷ 步频。斜走、横移时胯往移动方向偏（最多 40°），后退偏向镜像一侧。
- **脚锁地**：着地的脚在世界里一动不动；摆动的脚弧线落到「落地那一刻胯在哪儿 + 往前半个着地距离」。腿用两节骨骼 IK 接上：
  膝盖铰链轴取蹲姿里量出的那根，膝盖朝脚尖方向；够不着先降胯（最多 0.16 m），再踮后脚跟（最多 0.09 m）。
  落点高度只取地形相对玩家脚下的高差（±0.35 m），站在箱子 / 屋顶上不跟。急起步时锁住的脚离胯下超过 0.5 m 就提前迈。
- 卧姿、腾空：卧倒交回卧姿片段；腾空 0.08 s 后脚收在脚位上方，落地就地站住；一帧挪动超过 1.5 m 当成瞬移，脚直接落位。
- 片段只管上身与姿态高度：`Walk` / `Run` 的播放时间改由步态相位驱动，骨盆起伏对上落脚。

数值在 `Data_Tuning_FirstPersonBody.mjs`。闸门 `Script_FirstPersonGaitTest`（纯 Node，tier0Fast）：死区内转视角零挪步、超过死区挪步转回；
慢走 / 3.05 / 冲刺 / 蹲走 / 横移 / 后退 / 斜走着地零滑动、两脚轮流、步频与步长误差 < 8%；急起步锁住的脚不超出腿长；瞬移、腾空。
实机（武器靶场，真蒙皮骨骼）：走、冲刺、蹲走、横移、后退着地脚骨每帧滑动 0，膝盖朝前（与脚尖方向夹角余弦 ≥ 0.87）；
`FirstPersonEmbodimentTest` 的净空与领口项照旧通过（站姿低头「看得见身体」一项是 09-16 起的旧红，见下文）。

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

汉阳造、三八式、中正式、大刀、普通／集束手榴弹与捷克式共用 `Model/Model_FpsHanYangHands.glb`，按武器实例化独立骨架；其余武器继续使用原双臂。
2026-10-15 四件装备的逐指接触、集束弹尺寸和大刀连续肘轨以 [最新握持修复](Data_FpsWeaponGripRepair20261015.md) 为准。
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

2026-10-15 起，步枪与机枪的动作曲线在 `Data_Tuning_FpsReload` 中独立配置。
汉阳造使用整包进入弹仓并留置的曼利夏漏夹；中正式、三八式使用压弹后取走的桥夹。
左掌支撑下的枪身、弹夹与枪机用共享切线的单调三次曲线求值；取夹、压弹和闭锁各自带动枪身，
回稳有小幅余势。弹夹沿弧线抬至机匣上方、落进导槽，在压弹期间保持落座；
工作手只有离开实物时添加弧线偏移，持夹与拇指压弹继续跟随实际部件的掌面和手型。
开栓按「抬柄 → 后拉」分拍，闭栓按「推回 → 压柄」分拍；空仓已经开着的枪机保持后位，
汉阳造有余弹时先抽出旧漏夹，再换入新夹；最后一发入膛时，空漏夹从弹仓底部落下。
三个步枪的完整枪机主体由 Blender 源模型导出，与机柄共同运动。
换弹总时长按用户的提速反馈由 `WEAPONS.reloadTimeS` 配置；弹量、输入与动作完成回调沿用原契约。
取夹和回手增加连续转腕、自然屈指与小幅肘部引导。普通拉栓把原空等时间分给握柄与回手，
不改变总循环或射速。未添加或重烘骨骼片段。机械流程与源工程见 [换弹真实度](Data_RifleReloadRealism.md)。
`Script_FpsArmTest` 追加腰射与开镜起手的完整时序检查，限制单帧手位、转腕和枪身转角，
并检查装填中段的受力位移与静止时长。高画质检查用：

```powershell
node Taierzhuang1938/Script_WeaponShot.mjs --reload --only=HanYang,ZhongZheng,Type38
node Taierzhuang1938/Script_WeaponShot.mjs --reload-motion --only=HanYang --reload-rounds=3
```

可加 `--base-url=http://127.0.0.1:<LocalPreview 实际端口>` 复用本任务预览服务，输出仍仅留 `_shots/`。

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

### 普通手雷过肩投掷（2026-10-14，覆盖上一节动作）

普通手雷现在使用 Blender 制作的「肩侧后引 → 加速甩出 → 松指 → 顺势下收 → 回位」单条动作。
`Data_FpsGrenadeThrow` 同时提供握点、四元数、左手退让、肩位与肘极点；轻投缩小摆幅，
时长仍为 0.82 秒，脱手仍为归一化 0.48（0.3936 秒）。恢复段手指随前臂朝下，避免腕角约束换分支造成肘部翻转。
动作期间掌向由此片段统一控制，不混入冲刺或开镜的持握旋转。原普通手雷模型与双臂模型不变。

G 快捷投普通手雷也调用同一动作，临时收起手中武器，结束后恢复原型号、变体和拉栓状态；
空手亦可使用已有库存。重复投掷输入不能重启正在播放的动作。返掷保留自己的路径；集束弹 2026-10-21 起也走这一条（见下文「集束弹过肩投掷」）。

`ReleaseCook` 将普通手雷交给当前动作的 `onRelease`，在本帧双臂解算之后从实际握点发射，
不再于起手时从眼位提前生成。`Combat.Throw` 的 `handRelease` 选项只跳过旧眼位发射偏移，
初速、抛物线、伤害与碰撞不变；库存到释放时扣一次，蓄力引信继续计入起手时间。
投掷前被换装/剧情取消不扣库存，死亡后不补发。完成后主线持枪同步恢复正常。

可编辑源工程：`C:/Users/Bentl/OneDrive/AI/Models/Blender/Taierzhuang1938/GrenadeThrow_20261014/Animation_GrenadeThrow.blend`。
`_blender/Script_GrenadeThrowStudio.py` 生成带事件标记的控制曲线与运行时数据；
`_blender/Script_GrenadeThrowRigBake.py` 把测试导出的 121 帧、53 根骨骼及手雷装入同一工程。
通过仓库 `scripts/Script_BlenderMcp.mjs start/exec/stop` 在本任务独立实例重建，
执行时传 `GRENADE_PROJECT_ROOT`；先运行 Studio，再运行 GrenadeThrowTest，最后 RigBake。
工程、回放页和截图均只留本地；回放入口为 `_shots/GrenadeThrow/index.html`，支持实时播放、暂停、拖动及力度切换。

验收入口：`Script_GrenadeThrowTest`（完整轨迹人体约束、三档力度、站立/冲刺/开镜/蹲姿、
普通持弹/持枪快捷/空手三路实际释放与引信、库存与原武器恢复），
`Script_FpsArmTest --only=Grenade`、`Script_ExplosionRangeTest`（G/H 输入与真实爆炸），以及 ModuleGraph / MotionVectorContract。
实测报告保留于 `_shots/GrenadeThrow/`；不把独立动作验收称作完整战役回归。

本轮实测：握点误差 0、腕角最大约 64°、完整力度相邻采样肘位最大 25.5 mm；
三路游戏释放/库存/引信与四种姿态通过，FpsArmTest 585/585、ExplosionRules/ExplosionRange、
ModuleGraph、Text、TestRunner 与 MotionVectorContract 通过。全仓 `prepush --fail-fast`
在 `SpeakerGestureTest` 的 `FrontObservation.02: luo gestured on his previous line too` 停止；
未修改主检出 `2ec581c5` 上复测得到同一错误，该全仓门禁未通过。

### 集束弹过肩投掷（2026-10-21）

集束弹 `GrenadeBundle` 原来没有作者轨迹，走 `_AnimThrow` 的程序化抡臂：转的是 `actionPivot`，肩膀跟着一起转，
t≈0.1–0.4 整副手臂被转出镜头、画面里什么都没有，t≈0.5 两截上臂带着袖口断面横在画面上方，t≈0.6–0.9 一条胳膊占满半屏。
现在和普通手雷一样走 Blender 作者轨迹 `Data_FpsGrenadeBundleThrow.mjs`：只动武器挂点、肩位与肘极点，肩膀留在眼睛下后方。
`Script_Viewmodel` 的 `THROW_TRACKS` 按手里的武器选轨迹（普通弹 / 集束弹），`_ApplyGrenadeThrow(track)` 两者共用；
只有不带 `kind` 的投掷（返掷 `OnPickup`）还在步枪在手时左手掏弹（offhand）、走程序化动作。

- 节奏（归一化，整段仍 0.82 s）：0–0.12 双手把弹束往上托（左肩随之前送，左手托得住），0.10–0.26 左手从弹头下松开、落出画面左下；
  0.30 右手把弹束举在右上、弹头朝上（举起拍，弹束在画内）；0.40 后引，弹头往右后甩出画面右上角；0.45 越过头顶向前；
  0.47–0.55 右手张开，0.50 出手；0.58–0.68 手顺势往下、从画面下沿出去；0.88 新的一束在画外出现，0.82–0.97 左手回到弹头下。
- 腕角：中段各拍的掌向按肘极点算出的前臂方向反推（举起 / 后引 / 越顶 / 出手 / 跟随腕弯约 10 / 25 / 5 / -10 / -20°），
  不靠 65° 腕弯上限硬夹；起止两帧就是腰射持握（`Data_FpsWeaponGrips.GrenadeBundle.hip` 与 `bodyHip` 肩位），起手不跳。
- 出手：`Data_FpsArmPoses.GrenadeBundle.actions.throw.release = 0.50`（0.41 s），0.50 那一帧藏起手里那一束，同一帧从掌心飞出。
  原来 `ReleaseCook` 在起手那一帧就从眼位（`muzzleAheadM` / `muzzleRiseM` 偏移）抛出、扣库存，出手前 0.41 s 世界里已经有一束在飞；
  现在和普通弹同一条路：`TriggerThrow(power, { kind:"GrenadeBundle", onRelease })`，`_ReleaseThrow` 取右手 `gripNodes.r` 的掌心，
  `Combat.Throw` 传 `handRelease:true`（不再加眼位偏移），库存到出手才扣，引信照算起手时间（`cooked + t × duration`）；
  出手前被换装 / 剧情 `CompleteAction` 收尾不扣库存，人死了不补发。初速、抛物线、伤害与碰撞不变。
- 端着步枪（或拿着普通弹、空手）按 H：和 G 一样右手临时换成集束弹，播这条轨迹，收招换回原武器、变体和拉栓状态。
  原来是左手掏一颗普通木柄弹做样子。换上来的头 0.16 从下方 0.20 m 抬进画面（`quickDrawDropM` / `quickDrawEnd`，与普通弹同值）。
  实测掌心出手点在眼位右侧约 0.08 m、前方约 0.57–0.70 m（蓄力越足越靠前），高出 0.05–0.13 m。
- 第一关 05 投送驱动 `Script_FirstLevelBundleThrowDriver` 仍按眼位前 `muzzleAheadM` 的出手点解出蓄力；松键后等出手那一帧，
  在这一枪的 `onRelease` 前头按真掌心、按已定的初速再解一次朝向与仰角（同样取余量 ≥ 0.6 的最平一条），才蹲回掩体。返回里 `release` 记下重解结果、掌心离眼位多远和等了几帧。
- 与投掷物构图候选（分支 `worktree-agent-aa31e23963ac7c1e4`，`174b91c3`）兼容：那边投掷时构图在 0–0.14 退出、0.84 起回来并整体后退 `[-.05,0,-.10]`；
  候选的持握本来就是弹头朝上，这条轨迹前 0.12 先把弹束托到弹头朝上，两边叠起来起手不翻面。两边都改了 `index.html` 里 `Script_Viewmodel.mjs` 的戳，合并时取较大的一个。
  那边 `docs/Data_FpsRifleView20261016.md` 里「集束弹没有作者轨迹」那一句合并后要改掉。

可编辑源工程：`C:/Users/Bentl/OneDrive/AI/Models/Blender/Taierzhuang1938/GrenadeBundleThrow_20261021/Animation_GrenadeBundleThrow.blend`。
`_blender/Script_GrenadeBundleThrowStudio.py` 建控制空物体（`Animation_BundleGrip` 是木柄上右手握点、带弹束朝向，导出时换成武器挂点）、
关键帧与事件标记，并写运行时数据；在 Blender 里改完控制曲线后带 `GRENADE_BUNDLE_EXPORT_ONLY=True` 再跑一次，只从打开的源工程重新采样导出。
`_blender/Script_GrenadeBundleThrowRigBake.py` 把 `Script_GrenadeThrowTest` 留下的 `_shots/GrenadeThrow/Data_BundleTrace.json`（121 帧、53 根骨骼）
与按 `BuildGrenadeBundle` 尺寸搭的弹束代理件装进同一工程。顺序：`node scripts/Script_BlenderMcp.mjs start --task GrenadeBundleThrow_20261021`
→ `exec` Studio（传 `GRENADE_PROJECT_ROOT`）→ 跑 `GrenadeThrowTest` → `exec` RigBake → `stop`。

验收：`Script_GrenadeThrowTest` 新增集束弹整段 121 帧（腕弯 ≤65°、两手握持时握点残差 ≤6 mm、两肘相邻采样位移 <8.5 cm、骨段不拉伸、只释放一次、0.6 手指张开）、
可读性（两肩关节投影始终在画外 ≥1.5 倍半屏，袖口断面进不了画面；右手只在右半屏；t=0.30 与 0.475 弹束中心在画内）、三档力度连续播放、
游戏侧（两种弹 × 拿着本弹 / 步枪 / 空手 / 拿着另一种弹：出手前 0 发、出手帧从掌心出 1 发、库存这时才扣、引信、换回原武器；
出手前换装 / `CompleteAction` / 死亡都不出弹不扣库存；真实按 H 从步枪起手，约 25 帧后出手；步枪按 H 四种姿态的肘、腕、握点）。
`Script_FpsArmTest` 集束弹修形生命周期改为左右手各在自己的松手窗口里取样（原先要求两手同时处于中间权重，新动作左手先放）。
本轮实测：握点残差 0、腕弯最大 64.0°、肘部每 1/120 最大位移右 2.7 cm / 左 6.7 cm、两肩投影最近 8.6 倍半屏、右手最左在 NDC x=0.24；
GrenadeThrowTest、FpsArmTest 1013/1013、FpsGripEditorTest 42/42、MotionVectorContractTest、ModuleGraphTest、TextTest 通过；
`TestRunnerTest` 报 `Data_ToolsHome.mjs` / `Icon_TabSeal*.png` / `Script_ToolsHomeField.mjs` 未登记领域，为主线已有问题，与本改动无关。

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
