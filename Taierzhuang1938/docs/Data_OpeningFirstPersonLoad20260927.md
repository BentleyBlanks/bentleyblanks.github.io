# 01 开场：坐着压弹 + 听聊天自由视角（2026-09-27）

用户反馈：开场过场里顺子应该在给自己的弹夹（桥夹）装弹，手上的动作要自然延续，不能僵住；听队友聊天时给自由视角即可，不要替玩家把镜头转向说话的人。动作用 BlenderMCP 自己做。

## 改了什么

- **动作**：新烘焙一条 NRA02 动作 `ShunziSitFillCharger`（`_import/Script_OpeningStoryboardClips.py`，9.5 s 循环）。顺子坐在掩蔽部后墙边的弹药箱上，双脚着地，步枪横放在大腿上，左手托一个空桥夹；右手五次从腰前右侧弹袋捏出一发子弹、对准桥夹压下去、拇指推到位；压满后抬起来看一眼，塞进左胸口袋，再掏出一个空夹。手的位置写在躯干坐标系里，呼吸和前倾会带着手走；左右手掌朝向用四元数插值（分开插值两个方向时，塞口袋那一下的手腕翻转会挤在两三帧里）。
- **第一人称播放**：Banter 和下令前的 Orders 两段，`firstPerson.hands.beats` 改成 `fill:"ShunziSitFillCharger"`，玩家身体整个播这条烘焙动作（`Script_OpeningFirstPerson.PoseFill / UpdateFill`），不再是两个静止的托夹手势来回切。身体根固定在 `shunzi.seat` 的朝向上，第一帧平移一次让动作里的眼睛落在座位点上；从 Banter 进入 Orders 用同一个时钟，手不停。镜头眼位取动作的头骨加 `firstPerson.fill.eyeFromHeadM`（约 1.0 m，满足 SB01 契约的 0.85–1.05 m）。
- **道具**：`fillCharger`（左手里的桥夹，子弹按动作事件 `roundIn` 一颗颗出现，`chargerStowed` 到 `chargerDrawn` 之间在口袋里不画）、`fillRound`（右手捏着的那一发，`roundPicked` 到 `roundIn`）、`fillRifle`（09-29 起顺着右大腿放，见下节）、`fillSeat`（弹药箱，尺寸读动作清单的 `seat.crateM`）。
- **掏衣领**：Banter 开头「几块土掉进衣领」仍保留，右臂先解到掏衣领的姿势，再按权重从动作的骨骼姿态平滑过去（直接按目标点插值会在第一帧转 15°）。镜头不再为这个动作自动低头，只保留缩脖子的高度变化。
- **自由视角**：坐着的这两段（`FirstLevelBunkerShow.Seated`）视角左右各 1.75 rad、向下 0.95 rad、向上 1.15 rad（`firstPerson.headLook.seated`），任务运行时的受困视角钳制按同一范围放宽（`LookLimits`）；去掉了朝说话人转头（`seatShot.speakerTurnRad`）；自由视角期间不再走导演镜头的转速限制，鼠标 1:1。下令后视角在 1.1 s 内回到跟随镜头。
- **下令后的衔接**：跟随镜头的起身高度从实际坐着的眼高起步；两只手从压弹动作的位置和朝向缓入下令后的收拾装备（2026-09-29 起是转身背包、拿枪、跑向洞口，见 [Data_OpeningFirstPersonGear20260929](Data_OpeningFirstPersonGear20260929.md)；腿上的枪在下令那一帧被双手拿起）。

## 重建

```bash
node scripts/Script_BlenderMcp.mjs start --task OpeningFirstPersonLoad
```

在 Blender 里用 `_import/Script_OpeningStoryboardBake.py` 烘焙，环境变量：`OPENING_MODEL=TengxianNra02`、`OPENING_CLIPS=ShunziSitFillCharger`、`OPENING_VERSION=20260927OpeningStoryboardsV13FirstPersonLoad`、`OPENING_BLEND_DIR=C:/Users/Bentl/OneDrive/AI/Models/Blender/Taierzhuang1938/OpeningFirstPersonLoad_20260927`（先放入 `OpeningPinnedRescue_20260927` 的三份 partner track）。烘焙会整份重写清单，数字和中文的写法会变：交付时只把这条动作、版本号和 NRA02 行合并进已提交的清单，其他行不动。可编辑工程在上述 OneDrive 目录。

## 验收

- `Script_OpeningFirstPersonTest`：从磁盘加载真实动作库，两套皮肤各跑 Banter 12 s + Orders 6 s：每帧都在播动作；手掌每帧位移 < 6 cm、转角 < 12°（实测 3.7 cm、8.8°）；右手 9.5 s 内走 11 m、左手 1.5 m，没有静止；桥夹 0→5 发逐颗装满；桥夹只在口袋里那 26 帧看不见；眼睛离座位点 < 8 cm（实测 7 mm），眼高 0.85–1.05 m；下令后手的转角 ≤ 10°/帧。
- `Script_OpeningStoryboardShots --shots=SB01`：真实流程实拍，SB01 全部构图检查通过（眼高 0.997 m）。另用计划文件实拍了压弹各时刻、低头看腿、左右转头 70–80°、下令拿枪，截图只留本地 `_shots/`。

## 2026-09-29 补：腿上的枪看不见

用户反馈（实机截图，Orders 低头看腿）：「这个画面里怎么没有枪」。枪其实画了，但横在两条大腿上、枪口朝左，正好压在两条前臂底下，又贴着画面下沿；平视（SB01）时整把枪都在画面外。

- **枪的摆法**（`FP_PROPS.fillRifle`）：照分镜 SB01「腿上横放的枪在右下，枪栓朝镜头」改成顺着右大腿：护木搭在右膝上，枪口朝左前方微微抬起、对着洞口，枪托低在右胯外侧。平视 SB01 时枪从右下角斜进画面（枪口约在视线下 19°），低头时整把枪在右腿上。
- **动作**（BlenderMCP 重烘 NRA02 `ShunziSitFillCharger`，`_import/Script_OpeningStoryboardClips.py`）：两发子弹之间和压满之后，右手不再垂在膝盖边（原来手在枪底下），改成搭在膝盖后面的枪上（`FILL_RIFLE_REST`，掌心朝下压着枪、手指斜着搭过枪身）；第一发起手提前 0.15 s 离开枪，手掌从枪上转到弹袋不至于一帧转太多。`FILL_RIFLE_REST` 是用运行时的枪在动作躯干坐标里量出来的：探针逐帧取两只手掌和枪上的点（坐姿坐标，原点在两肩中点），用已知关键帧拟合躯干坐标到坐姿坐标的仿射（残差 < 1.5 cm），再把枪顶上方 7 cm 的点反算回去。**挪 `fillRifle` 就要重新量、重烘。**
- **左前臂接缝**：用 09-28 的烘焙脚本重烘这条循环动作时，塞口袋那一下左前臂的扭转一直展开下去回不来，循环最后一帧被拉回首帧，左前臂一帧转 180°（`Script_OpeningStoryboardsTest` 的 IK 换分支检查报错）。动作 spec 加 `twistMax: 180`，接缝误差 1.4 → 1e-6，塞口袋时左前臂每帧最多转 31°（24 fps）。

重建：BlenderMCP 起实例后，`exec` 一段设好环境变量再 `runpy` 跑 `_import/Script_OpeningStoryboardBake.py` 的脚本：`OPENING_MODEL=TengxianNra02`、`OPENING_CLIPS=ShunziSitFillCharger`、`OPENING_VERSION=20260929OpeningStoryboardsV16FirstPersonRifle`、`OPENING_BLEND_DIR=C:/Users/Bentl/OneDrive/AI/Models/Blender/Taierzhuang1938/OpeningFirstPersonRifle_20260929`（先放入 `OpeningIkBranch_20260928` 的三份 partner track）。清单只合并版本号、这条动作的 notes 和 NRA02 行的 sha256/blend，其他行不动。

验收：`Script_OpeningStoryboardsTest`（最大单帧自转仍是 61°，这条不在前面）、`Script_OpeningFirstPersonTest`（手掌每帧 3.7 cm、8.8°，下令衔接 10°）、`Script_OpeningStoryboardShots --shots=SB01` 全部判据通过；探针量到压弹时手指骨离枪轴 ≥ 7.5 cm（不穿枪），停手时掌心在枪轴上方 6 cm（搭在枪上）。实拍图只留本地 `_shots/`。

## 2026-09-29 补：手腕捏成一条线

用户反馈（实机截图，Banter 里低头看左手）：「开局动画里主人公的手的模型扭曲成这样了」。左手掌心朝上托着桥夹，手腕蒙皮缩成一条细线，前臂像被拧过的糖纸。

- **原因**：共用骨架（TengxianHumanoidV1）把手骨的绑定朝向绕前臂轴转了 81°（左 −81°、右 +81°），身体又没有扭转骨，前臂到手腕只有两块蒙皮。`Script_OpeningStoryboardBake.ArmRoll` 把手相对前臂的扭转对半分给前臂和手腕，没有扣掉这 81°：左手掌心朝上时蒙皮实际是肘 81°、腕 162°（相对绑定姿势合计 244°，塞口袋那一下走到 425°）。两块蒙皮之间转 160° 时，交界处半径只剩 cos 80° ≈ 0.17，手腕就是一条线。第一人称正好把手腕放在画面下沿。
- **修法**：新的动作 spec 键 `twistSplit`（肩、前臂、腕三个份额，和为 1；`ArmRoll`）。带这个键的 clip 里扭转改按「相对绑定姿势」量，取离绑定姿势最近的那一支再往下展开（左手托夹 −116°、塞口袋 +65°，全程连续），按份额分给三个关节；肩那一份是上臂绕自身轴转，前臂和手在世界里不动（肘留下差额）。肘、腕的位置和手的世界朝向一点没动，手掌轨迹、接触点、道具挂点都不变。`ShunziSitFillCharger` 用 `(.35, .35, .30)`：腕是画面里看得见的关节，份额最小。别的 clip 不带这个键，走原来的对半分，输出逐位不变。
- **实测**（Blender 里逐帧量蒙皮矩阵的扭转，峰值）：左腕 176° → 35°，左肘 85° → 44°，右腕 78° → 22°，左肩 59° → 83°（塞口袋那几帧，肩在画面外）；相邻帧扭转变化最大 17°（肩）/10°（肘）/7°（腕），没有回卷。游戏内实拍（`FillWrist_a/b`，机位对准左前臂）手腕和前臂粗细正常。
- **重烘**：BlenderMCP 起实例，`exec` 一段设好环境变量再 `runpy` 跑 `_import/Script_OpeningStoryboardBake.py`：`OPENING_MODEL=TengxianNra02`、`OPENING_CLIPS=ShunziSitFillCharger`、`OPENING_VERSION=20260929OpeningStoryboardsV17WristTwist`、`OPENING_BLEND_DIR=C:/Users/Bentl/OneDrive/AI/Models/Blender/Taierzhuang1938/OpeningHandWristTwist_20260929`（先放入 `OpeningFirstPersonRifle_20260929` 的三份 partner track）。清单只合并版本号和 NRA02 行的 sha256/blend，其他行不动；动画 JSON 里只有这一条 clip 变了。
- **验收**：`Script_OpeningStoryboardsTest`（最大单帧自转仍是 61°）、`Script_OpeningFirstPersonTest`（手掌每帧 3.7 cm、8.8°，下令衔接 10°，与改前一致）、`Script_OpeningStoryboardShots --shots=SB01`。另选 6 条不带该键的 NRA02 clip（`BanterPatRifle`、`BlastSlamBuried`、`CaptiveWallBrace`、`InterpreterGrabCollar`、`YaowaSitLoad`、`HeLiftTimber`）用新旧烘焙脚本各 verify 一遍，逐位相同。`Script_OpeningStoryboardsTest --rebake` 对这 6 条局部重烘与提交文件有 3 处差（`InterpreterGrabCollar`、`YaowaSitLoad`、`HeLiftTimber`），改前的脚本同样产出，与本次无关，没有追查。
- **限制**：带 `twistSplit` 的 clip 不能给后面的 clip 当 `prev` 来接扭转分支（接续的扭转值是原始扭转，域不同）；目前没有 clip 接在它后面。
