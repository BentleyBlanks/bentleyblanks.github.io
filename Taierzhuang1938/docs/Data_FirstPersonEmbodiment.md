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
同时检查指腹朝向、手指骨长不变、腕部弯曲及双臂可达性。九二式属于架设武器，
接管时隐藏随身枪视图模型；其规则与显示由 `Script_Emplacement` 和主循环负责。

军用手枪 `ServicePistol` 的导入显式朝向优先于木件重心启发式；金属度分桶后的源坐标
不能再次反转枪口。掌心和换匣路径按修正后的闭锁 A 状态测量，左手依次到握把底部、
取匣位和套筒后部，右手保持握持。`AssetStandardsTest` 直接解码成品木握把三角面，
检查前后关系、右掌表面距离和弹匣入口，防止只有挂点正确、实际枪模拿反的回归。

## 参考方法

采用公开 UE 方法作为工程参照，不把实现描述为 COD 或战地的内部源码复刻：

- [Epic：First Person Rendering](https://dev.epicgames.com/documentation/unreal-engine/first-person-rendering?lang=en-US)：第一人称物体独立 FOV 与近景缩放。
- [Epic：Two Bone IK](https://dev.epicgames.com/documentation/unreal-engine/animation-blueprint-two-bone-ik-in-unreal-engine)：接触目标和肘部目标分离。
- [Epic：Virtual Bones](https://dev.epicgames.com/documentation/en-us/unreal-engine/virtual-bones-in-unreal-engine)：通过目标空间和 IK 保持附加动作中的接触关系。
