# 方向死亡动作库（Bullet 布娃娃烘焙，2026-09-30）

[受击物理反应](Data_HitReaction.md) §5–§6 要的「正面中弹往后倒、背后中弹往前扑、侧面往侧倒」的动作资产。
Kimodo 的 `DeathCollapseA–D` 四条实测**全部往人物右侧倒**（见 Data_HitReaction §0），Kimodo 已卸载，
所以这一套用 **BlenderMCP + Blender 刚体（Bullet）布娃娃仿真**离线烘出来，另加 A–D 的左右镜像补「左」。

产物：`Animation/HitReaction/Animation_TengxianDeathImpact.json`（1.1 MB，12 条 clip + 12 份 profile），
格式同 `Animation/LitterBearer`：`{schema, revision, skeleton:"TengxianHumanoidV1", clips:[AnimationClip.toJSON], profiles}`，
轨道 `GroundRoot / Bip001_*` 的 position + quaternion，写的是**出厂 GLB 节点的局部系**（运行时 `AnimationClip.parse` 直接装进 mixer，
NRA/IJA 共用，不需要 `RetargetAnimationLibrary`）。不动的骨头（手指、锁骨、脚趾等）轨道只写首尾两个键。

| 文件 | 作用 |
| --- | --- |
| `_import/Script_DeathImpactPrepare.mjs` | Node：从 `Model_TengxianNra02.glb` 的 `AdvanceFire`（`POSE_CLIPS.standFire`）取源姿势世界矩阵，写 `tmp/DeathImpact/Data_DeathImpactSource.json` |
| `_import/Script_DeathImpactRagdollBake.py` | Blender：摆起始姿势、拟合胶囊、建布娃娃、仿真、烘成骨骼曲线、导出 JSON、（可选）渲染取证图 |
| `_import/Script_DeathImpactMirror.mjs` | Node：Kimodo A–D 重定向到出厂骨架后左右镜像，写入同一份 JSON |
| `_import/Script_DeathImpactProfileFloors.mjs` | Node：把浏览器探针量到的蒙皮最低点写进 profile（`floorProbeM`，镜像的 `floorM`） |
| `_import/Script_DeathImpactMontage.py` | 系统 Python + Pillow：把每条 clip 的侧视 / 正视渲染拼成联系表（只留本机） |

可编辑工程与取证图在 `C:/Users/Bentl/OneDrive/AI/Models/Blender/Taierzhuang1938/DeathImpact_20260930/`
（`Scene_<clip>.blend`、`renders/<clip>/`、`sheets/<clip>.png`），不进仓库。

## 1. 起始姿势

游戏里士兵最常在 `POSE_CLIPS.standFire/standIdle`（`AdvanceFire`，2.93 s 的「站姿据枪 / 上前射击」）里被打死，起点从这条取：

- `aim` = `AdvanceFire` 2.2 s（枪抵肩，双手在枪上）；`ready` = 0.8 s（枪低位，双手举在胸前）。枪不进仿真（运行时枪另有脱手逻辑），手指是原姿势的自然微屈。
- **`AdvanceFire` 是一条走步前进的 clip，直接拿来站不住**，烘焙端做两处**最小**修正（都只改起点，不改 clip 的其余部分）：
  1. `PlantFeet`：这条 clip 任何一帧都有一只脚在空中（另一只脚踩地，抬起那只离地 5–30 cm）。把抬起的腿解 IK 落到地面（踝高取踩地脚的踝高，鞋底摆平），髋、躯干、手臂不动。
  2. `StandUpright(10°)`：枪抵肩帧躯干前倾 21–45°（脊柱 → 颈量），双脚支撑面里也站不住，仿真里不论怎么打都会往前栽。把上身（脊柱以上整支子树）绕腰椎向后转到躯干前倾 10°。运行时死亡动作是从活人当前姿势交叉淡入（0.12 s），起点姿势和活动画面差这么点看不出来。
- 起点整体抬到蒙皮最低点 4 mm（同 LitterBearer 的做法）。

## 2. 布娃娃

**14 个刚体**（每段一个，Blender 世界米，作者骨架 1.82 m，游戏里缩 0.9135 到 1.66 m；重力乘 1.0946 让作者身体和游戏身体的落地时间一致）：

| 段 | 形状 | 质量 (70 kg) | 蒙皮拟合（aim 姿势，作者米） |
| --- | --- | --- | --- |
| 骨盆 pelvis | 胶囊 | 14.2 % = 9.94 kg | r 0.156、总长 0.323 |
| 腰 abdomen | 胶囊 | 13.9 % = 9.73 kg | r 0.163、L 0.336 |
| 胸 chest | 胶囊 | 21.6 % = 15.12 kg | r 0.122、L 0.254 |
| 头 head | 胶囊 | 8.1 % = 5.67 kg | r 0.092、L 0.254 |
| 上臂 ×2 | 胶囊 | 2.8 % = 1.96 kg | r 0.078、L 0.22–0.23 |
| 前臂+手 ×2 | 胶囊 | 2.2 % = 1.54 kg | r 0.039、L 0.45–0.47 |
| 大腿 ×2 | 胶囊 | 10 % = 7 kg | r 0.14、L 0.42–0.46 |
| 小腿 ×2 | 胶囊 | 4.65 % = 3.26 kg | r 0.082–0.087、L 0.39–0.41 |
| 脚 ×2 | **盒子**（平脚底，尺寸 0.119 × 0.166 × 0.282） | 1.45 % = 1.02 kg | — |

- **和任务书的一处偏离：脚用盒子不用胶囊。** 胶囊脚落地是线接触，站姿里脚踝弹簧稍软就会滚，盒子脚底是平的，接地和站立稳定得多；其余 12 段全是胶囊。盒子的俯仰跟着实际脚底线（取沿脚每片最低蒙皮点拟合直线），不是水平面。
- 胶囊由该段蒙皮顶点拟合：轴向由关节位置定（头取「颈→上竖直方向」，前臂取「肘→手+指质心」），半径取顶点到轴线（去掉平均偏移）的 60–80 分位数，总长取轴向 1–99 分位数。**骨盆、腰、胸不能按权重组切**：这套绑定的 `Pelvis` 骨只有约 6 个顶点，髋部皮肤归 `Spine` 和 `Thigh`，所以躯干三段按脊柱上的**切片**取「躯干类骨权重 ≥ 0.5」的顶点。
- 碰撞：**只与地面碰撞**（每个刚体一个独立碰撞层，地面占全部层），段间不自碰（起始姿势里手臂/大腿等本来就贴着躯干，开自碰会在第一帧炸开）。地面：被动盒，摩擦 0.9、恢复系数 0.05；段：摩擦 0.9、恢复 0.05、线/角阻尼 0.03/0.12（落地后见 §4）。
- 骨骼回写：每根骨头取所属刚体相对起始姿势的刚体位移作用到该骨；`Spine1` 是腰 / 胸两段位移的 50/50 混合，`Neck` 是胸 / 头的 50/50 混合，锁骨随胸，手与手指随前臂，脚趾随脚。

**13 个关节**（Bullet Generic Spring 约束，SPRING2；线向全锁；欧拉序 XYZ，扭转轴放中间避开万向节；弹簧平衡点 = 起始姿势）：

| 关节 | 类型 | 限位（解剖角，度；换算成相对起始姿势后写进约束） |
| --- | --- | --- |
| 腰 spine0 / 胸腰 spine1 | 球 | 前屈 −20…+30，侧屈 ±25，扭转 ±25 |
| 颈 neck | 球 | 前屈 −40…+40，侧屈 ±35，扭转 ±40 |
| 肩 ×2 | 球（锥形，上举 170°） | 前屈 −50…170，外展 −30…170，扭转 ±60 |
| 肘 ×2 | 铰链（弯曲轴取自起始姿势的弯曲平面） | 屈 0…145（不许反关节），侧偏 ±4，扭转 ±8 |
| 髋 ×2 | 球 | 前屈 −20…120，外展 −30…45，扭转 ±35 |
| 膝 ×2 | 铰链 | 屈 0…140（不许反关节），侧偏 ±3，扭转 ±6 |
| 踝 ×2 | 球（相对起始姿势） | 背/跖屈 ±30，内外翻 ±15，扭转 ±12 |

起始姿势本身就在限位内（脚本对每根轴断言；起点落在限位外会被拓宽并打印 `WARNING`——`ready` 姿势的腰椎前屈超出一点，已被拓宽）。

## 3. 肌张力丢失

每个关节弹簧的刚度 `k` 和阻尼 `c` **按时间打关键帧**（`RigidBodyConstraint` 的属性可动画，已验证：同一冲量下，刚度关键帧降到 1 的一支摆幅是恒定刚度那支的 2.4 倍）。

- 满张力：`k = I_carry·(2π·5 Hz)²`，`c = 2·0.9·I_carry·2π·5 Hz`。`I_carry` = 关节远端各段 `m·(d²+r²/4)` 之和；**腿关节还要能扛体重**，取「关节以上所有段对该关节的 `m·d²`」与远端惯量的较大者。
- 被动组织（肌肉放开以后剩的）：`k = I_own·(2π·0.55 Hz)²`，`c = 2·0.55·I_own·2π·0.55 Hz`，`I_own` 只按远端算（不带体重，否则被动膝盖还是撑得住整个人，会像木板一样直挺挺倒）。
- 时间表（受击后秒；保持到 t₀，平滑步降到 t₁）：

| 组 | normal | quick（未用于正式 clip） | instant（爆头） |
| --- | --- | --- | --- |
| 膝 | 0.03 → 0.18 | 0.03 → 0.14 | 0 → 0.08 |
| 髋、踝 | 0.10 → 0.45 | 0.06 → 0.30 | 0 → 0.10 |
| 脊柱 | 0.14 → 0.66 | 0.09 → 0.42 | 0 → 0.12 |
| 颈 | 0.11 → 0.54 | 0.07 → 0.34 | 0 → 0.08 |
| 肩、肘 | 0.11 → 0.60 | 0.07 → 0.38 | 0 → 0.12 |

- **膝盖先软**：膝比髋、踝早 ~0.1 s 松，人在体重下先蹲，而不是整个人当一根杆绕脚踝倒。这是试过「全腿同时松」（倒成一块板）以后改的。
- 没做夸张的保护性动作；爆腹那条靠冲量表达折叠（见 §5）。

## 4. 冲量与仿真

- **冲量**：击中段上的一帧 Wind 力场（`distance_max` ≤ 0.09 m，只作用在目标段中心附近）。实测 Blender 的力场力 = `strength / fps`（N），所以一帧的冲量 **J = strength / fps²**，`strength = J·fps²`；用一颗 1 kg 无重力球标定过 fps = 30 / 60、子步 10 / 20、六个方向，公式全部吻合。冲量方向 = 水平方向 + 少量上抬。
- **整体推力（`shove`）**：只打胸一下，胸得到 3 m/s，脚被地面摩擦按住，身体绕脚「撬」起来翻筋斗或者往前栽（正面中弹往前倒，是这套姿势的固有偏向）。所以除了击中段的局部踢（`dv`），还给**除脚以外的每一段**同样的 Δv（`shove`，游戏 m/s，同向）——组织把动量传遍全身。这样倒向由冲量决定，稳定得多。
- **子步**：60 fps，每帧 10 子步（1/600 s），求解迭代 40，split impulse；出片 30 fps（取仿真偶数帧）。调试站姿保持时试过迭代 100/300、子步 40，姿势没有变化（不是求解不收敛的问题）。
- **落地后阻尼**：0.7 s 起刚体线/角阻尼在 0.8 s 内升到 0.30/0.60，躺平的身体不再蠕动（否则 4 s 后还在爬）。
- **落定与尾部**：任何体段速度（含角速度换算的尖端速度）降到 0.08·单位 m/s 以下的最后时刻 + 0.15 s 为 clip 长度，之后运行时保持终帧（若一直有极慢蠕动，则取 0.3·单位 m/s 阈值）。
- **不穿地、终帧接地**：胶囊/盒和蒙皮不完全重合，每帧量蒙皮最低点，低于 2 mm 就整体抬起（只抬不降，前后平滑）；最后 0.6 s 用平滑步把整体带到「蒙皮最低点 4 mm」。抬升最大 0.04–0.10 m（出现在躺在手臂上那几帧），`floorRangeM` 记录每条的最低点范围。

## 5. 八条物理 clip 的参数（网格搜索得来）

每个族先手拍一个方向，再对（局部踢 dv × 整体推 shove × 方向偏转）做网格，目标 = 实测倒向与族目标的夹角最小，罚：倒立飞行（头低于骨盆 0.1 m 且骨盆高于 0.4 m 的时长）、骨盆抬升 > 6 cm、骨盆掉到一半高度用时 < 0.55 s（像板一样倒）。同一参数附近倒向稳定（`Left1` 在 dv 0.5–1.0 × shove 0.6–1.2 里有 5 组落在 ±5° 内），不是偶然凑出来的。

| clip | 起点 | 击中段 / 局部 dv (m/s) | 水平方向（actor 局部 x 右, z 后） | shove (m/s) | 骨盆掉一半 s |
| --- | --- | --- | --- | --- | --- |
| `DeathImpactBack1` | aim | 胸 3.0 | (0.26, 0.97)：正面打胸 | 1.2 | 0.78 |
| `DeathImpactBack2` | ready | 胸 3.0 | (0.6, 0.8)：正面稍偏 | 1.2 | 0.77 |
| `DeathImpactForward1` | aim | 胸 1.2 | (−0.34, −0.94)：背后打 | 0.6 | 0.65 |
| `DeathImpactForward2` | ready | 腰 1.2 | (−0.10, −1.0)：背后打腰 | 0.6 | 0.93 |
| `DeathImpactLeft1` | aim | 胸 2.4 | (−1, 0)：右侧打，往左倒 | 0.8 | 0.87 |
| `DeathImpactRight1` | ready | 胸 2.4 | (0.94, 0.34)：左侧稍偏后打，往右倒 | 1.2 | 0.70 |
| `DeathImpactCrumple1` | aim | 头 1.6 | 后，全身张力 0.08–0.12 s 内丢光（爆头原地瘫） | 0 | 0.82 |
| `DeathImpactCrumple2` | ready | 腰 1.2（向前下，上抬 −0.25）+ 骨盆 1.0（向后） | 前 | 0 | 1.33 |

爆腹折叠不靠「主动弯腰」（Blender 约束的弹簧平衡点不能动画），靠一对力偶：腰往前下踢、骨盆往后踢，再加膝先软 → 跪下去、折下去、前扑。

## 6. Kimodo 镜像

`Script_DeathImpactMirror.mjs`：

1. 先按 `RetargetAnimationLibrary`（`Script_CharacterModel.mjs`）同一套规则把 `Animation_TengxianNraDeathCollapse.glb` 的 A–D 换算到 `Model_TengxianNra02` 的出厂静止姿态（逐骨静止差；顶层 `GroundRoot` 走两个容器的世界矩阵），30 fps 采样。
2. 在 GroundRoot 所在的坐标系里做前向运动学，世界矩阵镜像：`W'(骨) = S · W(对侧骨) · S · C(骨)`，`S = diag(−1, 1, 1)`（glTF 里角色左 = +X、前 = +Z，对称面 x = 0），`C(骨) = (S·Wrest(对侧骨)·S)⁻¹ · Wrest(骨)`，用来吸收左右骨局部坐标系的手性差；中线骨（骨盆、脊柱、颈、头）对侧就是自己。**静止姿态镜像回自己**（脚本对每根骨断言误差 < 1e-6）。
3. 用镜像后的世界矩阵重建局部变换（骨长与层级不变），写 `DeathCollapse{A–D}Mirror`，profile `source:"kimodo-mirror"`，`playbackRate 1.6`（运行时对 Kimodo 库的倍速），`durationS = 时长/1.6`。

## 7. 实测 profile（浏览器里真实人物量的）

方向约定**用真实 NRA/IJA GLB 验过，没有靠猜**：探针把库里的 clip 用 `AnimationClip.parse` 装进 `rig.mixer` 播放（`tmp/HitReaction/Script_DeathImpactProbe.mjs`，照 `Script_DeathCollapseTest` 的写法：`ServeRoot` + `setContent` + `CreateLugouCharacterRig`），起点骨盆的地面投影为原点：

- 人物「前」= 脚趾向量的水平方向 = (0.16, 0, −0.99)，**是 −Z**；人物「左」(左腿 − 右腿) = (−1, 0, 0)，**右手是 +X**。与 Data_HitReaction 的约定一致（+X 右手、−Z 正面；资产正面 +Z，运行时 root 转了 180°）。
- 背向倒的 clip 头终点 z 为正（`Back1` 1.73），前扑为负（`Forward1` −1.13），往右倒 x 为正（`Right1` +1.62），往左倒 x 为负（`Left1` −1.75，镜像四条全部为负）。
- 浏览器实测与 Blender 侧 profile 的头/骨盆终点相差 ≤ 3 cm（浏览器多播了几帧），倒向单位向量一致到 ±0.02。

下表为 profile（`fallLocal` = 起点骨盆地面投影 → 终帧头地面投影的单位向量，演员局部系 (x, z)；位置单位是**游戏米**，x 右、y 上、z 后，相对起点骨盆的地面投影；`floorM`：Blender 里烘焙用作者骨架量的终帧蒙皮最低点；`floorProbeM`：浏览器里真实 NRA/IJA 蒙皮的最低点，未经运行时接地拟合）：

| clip | 族 | fallLocal (x,z) | 落距 m | 头终点 (x, y, z) | 骨盆终点 (x, y, z) | 骨盆下降 m | 时长 s | 倍速 | 落定 s | floorM | 浏览器蒙皮最低 NRA / IJA |
|---|---|---|---|---|---|---|---|---|---|---|---|
| DeathCollapseAMirror | left | −0.97, 0.26 | 1.33 | −1.29, 0.23, 0.35 | −0.78, 0.22, 0.47 | 0.57 | 1.83 | 1.6 | 1.83 | −0.0090 | −0.009 / 0.028 |
| DeathCollapseBMirror | left | −0.87, 0.49 | 1.29 | −1.12, 0.21, 0.63 | −0.60, 0.22, 0.65 | 0.63 | 1.83 | 1.6 | 1.83 | −0.0199 | −0.020 / 0.019 |
| DeathCollapseCMirror | left | −0.61, 0.80 | 1.37 | −0.83, 0.23, 1.09 | −0.38, 0.22, 0.82 | 0.57 | 1.92 | 1.6 | 1.92 | −0.0105 | −0.011 / 0.030 |
| DeathCollapseDMirror | left | −0.88, 0.48 | 1.77 | −1.55, 0.23, 0.86 | −1.03, 0.22, 0.75 | 0.57 | 1.69 | 1.6 | 1.69 | −0.0106 | −0.011 / 0.029 |
| DeathImpactBack1 | back | −0.05, 1.00 | 1.71 | −0.09, 0.16, 1.71 | 0.05, 0.25, 1.20 | 0.61 | 2.77 | 1 | 2.62 | 0.0040 | 0.004 / 0.010 |
| DeathImpactBack2 | back | 0.40, 0.92 | 1.48 | 0.59, 0.15, 1.36 | 0.19, 0.20, 1.03 | 0.64 | 3.00 | 1 | 2.83 | 0.0040 | 0.004 / 0.013 |
| DeathImpactForward1 | forward | 0.03, −1.00 | 1.12 | 0.04, 0.21, −1.12 | 0.13, 0.18, −0.60 | 0.69 | 1.57 | 1 | 1.40 | 0.0040 | 0.004 / 0.019 |
| DeathImpactForward2 | forward | 0.03, −1.00 | 1.19 | 0.04, 0.12, −1.18 | 0.25, 0.28, −0.73 | 0.56 | 2.57 | 1 | 2.40 | 0.0040 | 0.004 / 0.013 |
| DeathImpactLeft1 | left | −1.00, 0.01 | 1.73 | −1.73, 0.20, 0.02 | −1.30, 0.23, 0.32 | 0.63 | 2.97 | 1 | 2.82 | 0.0040 | 0.004 / 0.019 |
| DeathImpactRight1 | right | 1.00, 0.05 | 1.61 | 1.60, 0.15, 0.08 | 1.10, 0.28, −0.05 | 0.56 | 1.67 | 1 | 1.52 | 0.0040 | 0.004 / 0.007 |
| DeathImpactCrumple1 | crumple | 0.11, −0.99 | 1.05 | 0.12, 0.14, −1.04 | 0.42, 0.18, −0.67 | 0.69 | 2.30 | 1 | 2.13 | 0.0040 | 0.004 / 0.015 |
| DeathImpactCrumple2 | crumple | −0.96, 0.27 | 1.32 | −1.27, 0.18, 0.35 | −0.80, 0.24, 0.50 | 0.60 | 3.17 | 1 | 3.00 | 0.0040 | 0.004 / 0.006 |

- 每条 profile 另有 `impact{part, dirLocal[x,y,z], bodies, deltaVMps}`（仿真给的局部踢）、`startPose`、`trunkTiltDeg`、`pelvisRiseM`、`halfDropS`、`invertedS`、`floorRangeM`（QA 用）。`dirLocal` 的 y 是上抬分量。
- 骨盆终点高 0.18–0.28 m：躺平的骨盆中心离地面的高度（含骨盆厚度），和 Kimodo 的 0.22 m 同档。
- **`crumple` 的 `fallLocal` 仅作参考**：`Crumple1` 实测头往前落 1.0 m（人在原地折下去后往前趴），`Crumple2` 往左。契约里 crumple 只在期望是 crumple 时参与，剩余偏角转向由运行时处理。
- 蒙皮最低点：NRA 四条镜像是 Kimodo 原 clip 的镜像，本来就有 −0.9…−2.0 cm 的离地偏差（运行时 `DEATH_CONTACT.poseEnd` 之后按可见蒙皮做接地拟合，抬到 8 mm），未改动；八条物理 clip 在 NRA 上是 3.7 mm，IJA 上 6–19 mm（IJA 靴子/下摆比 NRA 厚，同一条动作的最低点不同），运行时同样有接地拟合。
- 帧间抖动：浏览器里整条曲线的骨盆高度逐帧（1/60 s）最大跳变 ≤ 0.041 m（下落段），头速度峰值 2.3–4.2 m/s；无爆开、无抽搐。

## 8. 看渲染图的判断（`sheets/<clip>.png`：侧视 + 正视，t = 0 / 0.15 / 0.3 / 0.5 / 0.75 / 1.0 / 终点）

- **`Back1`**：先身形保持、膝盖同时弯，躯干后仰，双脚留在原地往后滑，仰面落地；手臂被甩开。像人被打中往后倒。0.5–0.75 s 上身偏直挺，是整段里最像「板」的一处，见遗留。
- **`Back2`**：举枪在脸前那种姿势，被打得后仰、膝盖打弯、往后偏一点倒，仰卧落地，手臂举着。
- **`Forward1/2`**：从背后打，先前倾、膝盖打弯，扑倒，手臂垫在头下。`Forward2` 是打腰，倾得更快、更接近折叠。
- **`Left1`**：侧面打，身子往左歪、腿往左错开，最后左侧着地趴倒；**`Right1`**：往右歪，仰卧偏右落地。
- **`Crumple1`（爆头）**：膝盖和腰同时软，人往下坍，折成一团再趴下；**`Crumple2`（爆腹）**：膝盖先软跪下，双手捂腹折下去，最后前扑蜷缩。
- 调过的东西（试错记录，供以后别重走）：全腿一起松 → 板一样倒；下半身脚被摩擦按住、只打胸 → 绕脚翻筋斗（加整体推 `shove`）；正面打胸在 `AdvanceFire` 原姿势（前倾 21–45°）里怎么打都往前栽（`StandUpright`）；起点单脚离地（`PlantFeet`）；被动膝盖刚度按体重算 → 撑到 0.75 s 才倒（被动只按远端惯量算）；Blender 里刚体以**物体原点**为质心，地面盒子网格没居中，顶面在 z = +0.5（把地面物体原点放到 −0.5）；`transform_apply` 默认连位置一起烘。

## 9. 复现

```powershell
node Taierzhuang1938/_import/Script_DeathImpactPrepare.mjs
node scripts/Script_BlenderMcp.mjs start --task DeathImpact
# 每条 clip 一次 exec（同一次 exec 里连拆连建世界，Blender 5.1 在第 5 次前后崩过一次）
node scripts/Script_BlenderMcp.mjs exec --code "import os; os.environ['DEATH_IMPACT_PROJECT']=r'<worktree>/Taierzhuang1938'; os.environ['DEATH_IMPACT_CLIPS']='DeathImpactBack1'; os.environ['DEATH_IMPACT_RENDER']='1'"
node scripts/Script_BlenderMcp.mjs exec --file Taierzhuang1938/_import/Script_DeathImpactRagdollBake.py --timeout 900
# …其余七条同理；默认写 JSON（DEATH_IMPACT_WRITE=0 只调参不写）、每条另存 Scene_<clip>.blend
node scripts/Script_BlenderMcp.mjs stop
node Taierzhuang1938/_import/Script_DeathImpactMirror.mjs          # 四条镜像（与 Blender 端谁先谁后无关，都是合并写入）
node tmp/HitReaction/Script_DeathImpactProbe.mjs                    # 临时探针，见 §7（不入库）
node Taierzhuang1938/_import/Script_DeathImpactProfileFloors.mjs tmp/HitReaction/DeathImpactProbe.json
python Taierzhuang1938/_import/Script_DeathImpactMontage.py         # 联系表
```

调参开关（环境变量，只调参用）：`DEATH_IMPACT_DVSCALE / SHOVE / DIRROT / TONESET / LEG / TILT / HOLD_HZ / SUBSTEPS / ITERATIONS / DIAG(hold,nohit,nospring,nolimit,nojoints,lockankles,scan)`；`DEBUG=1` 打印逐 0.1 s 的胸/骨盆/头位置与关节漂移。

**Blender 刚体不完全确定**：同一份参数两次烘焙，倒向在 ±5° 内、时长差零点几秒（Bullet 的接触顺序与求解不严格重复）。所以库里的 clip 以**当次烘焙的 JSON 为准**，不要指望重跑得到逐字节相同的文件；profile 是当次实测写进去的。

## 10. 遗留

- **`Back1` 后仰段偏直挺**：0.5–0.75 s 躯干和腿几乎成一条线往后倒（膝盖在体重下弯得不够多）。想更「软」需要让脊柱/髋更早松、膝盖更晚松，代价是更容易前折——现在这套参数是在「往后倒」这个方向上稳定的那一个。
- **`Forward1` / `Forward2` 倒向几乎相同**（都正前方，差 0.02 单位向量）：起点姿势带的前倾偏置把两条都拉回正前；要不同的前扑方向需要换起点姿势或加大侧向冲量。
- **`Crumple2` 前 0.5 s 几乎站着不动**（`ready` 姿势、膝盖 0.18 s 才降完）：验收时（2026-09-30）给它加了 `startS = 0.4`
  （CLIPS 表与库 profile 同一个数），运行时从 0.4 s 起播，倒地时长相应变短；原地瘫也改成按 `impact.part` 配对，爆头只会选 `Crumple1`
  （契约 `Data_HitReaction.md` §5、§6）。
- IJA 上终帧蒙皮最低点有 1–2 cm 偏差（浏览器实测，未经运行时接地拟合），因为作者骨架是 NRA02；运行时接地拟合按可见蒙皮补。
- `crumple` 只做了 2 条；`left` 只有 1 条物理 clip（外加四条镜像）。数量按契约 §6 最小集合，没有批量扩。
- 手指/手掌在仿真里是与前臂焊死的一段（用户指定的「前臂+手」一个胶囊），落地手不会自己张开或攥紧。
