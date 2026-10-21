# RifleShoulderMarch：扛枪行军走

2026-10-21 按用户的三视图参考做的一条原地循环：老式栓动步枪扛在右肩，枪托在右肩前方，枪身斜着越过颈后，
枪口从左肩后方探出；左臂随步伐摆动，躯干微前倾，头稳。Blender 烘焙，共用 `TengxianHumanoidV1` 骨架（以
`Model_TengxianNra02.glb` 为参考身体，七套 Tengxian 模型骨名都能绑）。**已接进 `Script_AllyGait`（2026-10-21 第二轮）**：只在「共享行军层正在带一个人走路、身后没人、没在说话、没有威胁」时才换上，其余一律保持端枪（`AllyCarryWalk`）；规则与实测见末节「运行时接入」。

## 资产与口径

| 文件 | 内容 |
| --- | --- |
| `Animation_TengxianRifleShoulderMarch.json` | three.js `AnimationClip.toJSON` 格式（轨道名是 GLTFLoader 净化后的骨名），一条 clip `RifleShoulderMarch`：60 帧 @ 60 fps，**时长 1.000 s = 一个周期**，轨道从 0 s 起、末帧 = 首帧；另有 `AllyRifle.position/quaternion` 两条枪的道具轨 |
| `Data_RifleShoulderMarch.json` | 门禁在发货 clip 上逐项实测的数、限值与是否通过（`--write` 重写；记着 clip 的 sha256） |
| `../../_import/Script_RifleShoulderMarchBake.py` | 在 Blender 里生成这条 clip（不拷贝任何旧曲线） |
| `../../_import/Script_RifleShoulderMarchPrepare.mjs` | 把游戏里的中正式步枪网格（tzm）解成明文，给 Blender 渲染联系图和门禁用 |
| `../../_import/Script_RifleShoulderMarchProfile.mjs` | **烘完 Blender 之后必跑的一步**：按生产口径（`Script_LocomotionProfileBake` 那条规则：趾关节离地面 <3.5 cm 且向后 >0.12 m/s 持续 >75 ms，120 Hz，模型米）在发货 GLB 上量出 `profiles.RifleShoulderMarch` 的 `duration / referenceMps / contacts` 写回 clip JSON；Blender 里的设计值留在 `designReferenceMps / designContacts`。`--verify` 只检查不写 |
| `../../Script_RifleShoulderMarchTest.mjs` | 纯 node 门禁：用发货 GLB 的真实蒙皮、半帧（120 Hz）采样，独立于烘焙脚本；另核 profile 是否是现行规则量出来的、`Data_Tuning_AllyGait.marchVersion` 是否等于 clip 的 `revision` |

- 单位：glTF 米（模型米）。NRA02 在运行时被缩放到 1.66 m（×0.9135），所以文中「世界」数 = 模型数 × 0.9135；**步枪保持真实尺寸**，在模型坐标里是网格的 1.0946 倍。
- `AllyRifle` 道具轨沿用 `Animation/AllyGait` 的约定：rig 根局部、原点 = 枪的握点（`gripR`，运行时放在右手四指根的质心）、枪口 = −Z、+Y = 枪背（准星朝上）。运行时位置会被真实右掌覆盖，朝向取自这条轨。
- 模型里没有背包、水壶（参考图里有），按任务要求**不为动作加装备**；步枪用项目已有的中正式（`Model_ZhongZheng.tzm.json`，4.0 kg，`Data_Weapons.mjs`）。

规格：步频 120 步/分（周期 1.000 s）；步长 0.665 模型米（世界 0.608 m）；参考速度 `referenceMps` = 1.33 模型米/秒（世界 1.215 m/s；运行时按 `实际速度 / (referenceMps × 缩放)` 驱动播放速率）；足部接触区间 L `[0,0.15] [0.55,1]`、R `[0.05,0.65]`（脚尖关节贴近地面且向后走，与 `Script_RelaxedGaitBake` 同口径）。

## 重建

```powershell
node Taierzhuang1938/_import/Script_RifleShoulderMarchPrepare.mjs
node scripts/Script_BlenderMcp.mjs start --task RifleShoulderMarch
node scripts/Script_BlenderMcp.mjs exec --code "import os; os.environ['RIFLE_MARCH_PROJECT']=r'<worktree>/Taierzhuang1938'; os.environ['RIFLE_MARCH_SAVE']='1'"
node scripts/Script_BlenderMcp.mjs exec --file Taierzhuang1938/_import/Script_RifleShoulderMarchBake.py --timeout 900
node scripts/Script_BlenderMcp.mjs stop
node Taierzhuang1938/_import/Script_RifleShoulderMarchProfile.mjs  # 量运行时用的 profile 写回 clip（重烘后必须重跑）
node Taierzhuang1938/Script_RifleShoulderMarchTest.mjs --write     # 重写 Data_RifleShoulderMarch.json
```

连烘两次 sha256 逐字节相同（Blender 直出 `7ff4c8dd…`；写入量出来的 profile 后发货文件是 `cbcdb060…`）。可编辑工程 `C:\Users\Bentl\OneDrive\AI\Models\Blender\Taierzhuang1938\RifleShoulderMarch_20261021\Scene_RifleShoulderMarch.blend`
（不进仓库）。生成器里所有数值都在 `GAIT` 一张表里，`RIFLE_MARCH_PARAMS_FILE` 可临时覆盖做对比。

## 生成方法

只转骨、不改骨长（骨盆是唯一平移的骨，骨长误差 7e-6 m）：

- **足滚动**：触地脚跟的一个蒙皮顶点是「在地面上不动」的支点（脚跟冲击 → 平足），脚跟离地后改以趾骨上的一个顶点为支点，直到蹬离；支点相对骨盆以步速后退。摆动段在**地面坐标系**里走三次埃尔米特（起于静止、落地时仍以 0.15 倍步速前冲），再加抬脚弧线与脚尖转角，所以与支撑期的速度在触地、蹬离两处连续。触地头 10% 周期里脚跟还在刹住，漂移约 5 mm。
- **腿**：两骨 IK（余弦定理，膝向前、略外展），脚的朝向在世界轴上给；每帧用真实蒙皮的鞋底最低点把脚压回 4 mm。
- **骨盆高度**不是正弦：给支撑腿一条膝角目标曲线（触地约 11°、承重响应峰约 25°、站立中约 13°、蹬离前升到约 33°），骨盆取两条腿都够得着的最高值（软最小 + 轻度平滑，不超过膝不过伸的硬限），起伏由几何自然得出。
- **质心前后速度**：骨盆再加一条很小的前后位移（约 48 mm 峰峰），迭代到按 Winter/Dempster 节段质量算的全身质心（含枪）前后速度 = 均速 ± 0.10 m/s，触地处最快、单支撑中点最慢——这样制动 → 推进的符号才与着地时序一致。
- **上身**：骨盆横转 ±4.3°、肩带反向横转 ±5°、骨盆侧倾 ±2.9°（摆动侧下沉）、躯干前倾 6.9°、整体向左 1.7° 抵消右肩的枪；头与脖子把横转吃掉，世界朝向基本不动。
- **左臂**：反向摆（与右腿同相），摆幅 ±21°，肘 20–32°，手半握；右臂握枪，几乎不动。
- **枪与右手**：枪在胸骨（Spine2）坐标系里，握点在胸前 15 cm、肩高处，枪轴越过颈后 16 cm、高 27 cm（衣领顶 1.59 m）；枪相对胸只有随步频的轻微颠簸（俯仰 ±0.6°、横滚 ±0.4°、起伏 ±3 mm）。右手姿势在握点固定下搜一个肘最开（143°）、腕弯 32°、前臂扭转在人体范围内的朝向；拇指轴取拇指尖最靠近食指中节的那个，保证拇指扣住而不是翘着。

## 物理验收（全部在发货 clip 上，真实蒙皮，半帧以上采样；`Script_RifleShoulderMarchTest.mjs` 48 项全绿）

限值栏里，**文献** = 取自下面「出处」；**创作** = 查不到合适的统计范围，按观感和上述生成目标自己定的取值，门禁只防回退，不当作生物力学结论。

| 闸 | 指标 | 限值（出处） | 实测 |
| --- | --- | --- | --- |
| 1 循环 | 时长 = 周期、轨道从 0 起 | 60/60 s | 1.000 s，通过 |
| | 首尾关键帧逐值 | ≤1e-6（创作） | 0 |
| | 接缝处二阶差分 / 周期内最大 | ≤1.5 倍（创作） | 0.37 倍；骨盆接缝跳变 0 |
| 2 滑步 | 支撑支点在地面系里的位移 | ≤1 cm（任务） | 5.1 mm（来自触地后 10% 周期的刹停，4 个支撑段） |
| 3 贴地 | 支撑期鞋底最低点 | −2…12 mm（任务） | 3.6…4.3 mm |
| | 摆动期不入地 | ≥ −2 mm | 最低 4.0 mm |
| | 腾空相 | 0 | 0（任一时刻至少一只脚着地） |
| | 双脚同时着地占周期 | 20–30%（任务；负重使其增大见出处 5） | 25%（口径：脚跟或趾骨支点高 <12 mm 且地面系速度 <0.3 m/s） |
| | 脚/趾骨局部转角（不翻判据） | ≤75°（正常 ≤60°、翻反 160–180°，见 memory mocap-foot-roll-flip） | 54° |
| 4 关节 | 膝、肘不超伸（按各自铰链方向的有符号屈曲） | ≥ −0.5° | 膝最小 13.0°，左肘 19.5° |
| | 膝屈曲最大 / 肘最大 | ≤140° / ≤150°（创作） | 65.1° / 右肘 143.7°（握枪） |
| | 四肢骨长相对绑定 | <1 mm（任务） | 7e-6 m（全部 51 根非骨盆骨） |
| | 髋/膝/踝单帧尖刺（与前后各 2 个关键帧二次拟合的偏差） | ≤1.5°（创作） | 最大 0.35° |
| | 髋/膝/踝曲率（关键帧间二阶差分） | ≤4.5°（创作） | 最大 3.4°（出在触地与蹬离两个物理拐点） |
| 5 步频与质心 | 步频 | 100–120 步/分（任务；出处 4） | 120.0 |
| | 世界步速 | 1.2–1.5 m/s（任务） | 1.215（负重行军取低端） |
| | Froude 数 v²/(g·腿长)，腿长 = 髋高 0.869 m | 0.12–0.30（创作；出处 6：走/跑转换约 0.5、动能势能交换最优约 0.25） | 0.173 |
| | 支点后退速度与参考速度的差 | ≤3% | 0.04% |
| | 质心竖向峰峰（身体 + 枪） | 2–6 cm（出处 2：约 5 cm） | 3.2 cm（身体单独 3.1 cm） |
| | 质心最高点 | 落在单支撑中段 50% 内 | 周期 0.77（左脚单支撑） |
| | 质心最低点 | 在双支撑 ±6% 周期内 | 周期 0.47 |
| | 制动 → 推进 | 每个单支撑前半段质心前后加速度 <0、后半段 >0，幅度 ≥0.05 m/s²（创作；取质心前 4 阶谐波） | 前半 −0.36、后半 +0.88 m/s²（两脚相同）；加速度 ±1.2 m/s² |
| | 质心前后速度 | 单支撑中点最慢、双支撑最快 | 最慢 0.25 周期、最快 0 周期；±0.098 m/s |
| 6 上身与手臂 | 骨盆横转峰峰 | 5–12°（出处 2：±4°） | 8.6° |
| | 肩带横转峰峰 / 与骨盆的相关系数 | 5–14°（创作）/ ≤ −0.85（出处 7：随步速增大趋向反相） | 10.3° / −0.98 |
| | 头三轴峰峰 / 高频抖动 | ≤4° / ≤0.2° rms（创作） | 1.0° / 0.0007° |
| | 左手前后摆动与右脚 / 左脚的相关系数 | ≥0.8 / ≤ −0.8 | +0.94 / −0.93 |
| | 右手在胸坐标系里的范围 | ≤1.5 cm（右臂握枪基本固定） | 0.6 cm |
| | 躯干向左抵消负重的平均倾角 / 峰峰 | 0.5–4° / ≤6°（创作） | 1.7° / 2.4° |
| | 躯干前倾平均 | 2–10°（出处 5：负重前倾增大） | 6.9° |
| 7 枪与手 | 枪相对右手：原点滑动 / 朝向转动 | ≤1 mm / ≤1° | 0.014 mm / 0.0004° |
| | 枪原点到四指根质心 | ≤2 mm | 0.03 mm |
| | 枪相对胸的颠簸：俯仰与横滚峰峰 / 升降峰峰 | ≤2° / ≤1 cm（创作） | 1.29°与0.80° / 5.9 mm |
| | 枪不穿头、帽、颈、躯干、左臂、右前臂（有向距离，最深） | ≤12 mm | 躯干 7.4 mm，头 +4 mm（离开），其余 ≥10 cm |
| | 枪压在右肩（布面下陷）/ 枪到右肩最近距离全周期 | ≤2 cm / ±2 cm | 15.7 mm / −15.7…−10.2 mm（枪确实搁在肩上） |
| P 运行时 | `AnimationClip.parse` 时长、轨数、`validate()`；七套共用骨架的身体都有全部骨 | — | 通过（108 轨；七套无缺骨） |

**这套数有几条要说明白的偏差与局限：**

- 文献里不负重走路的膝在触地约 5°、站立中约 5–10°；本条触地 15°、站立中 13°、承重响应峰约 31°，蹬离约 33–36°，摆动峰 65°（文献约 60°，Gage 1990 见出处 1）。膝更弯是有意的折中：腿几乎伸直时 IK 对髋踝距离极敏感（0.1 mm → 近 1°），触地处会出尖刺；负重行军综述也报告膝髋屈曲增大（出处 5）。
- 「枪不穿身体」用的是最近三角形的有向距离。衣服是多层非封闭面，向量方向不总是可靠，所以只对枪（一片规整的刚体）做这项闸，没有对左手 / 前臂与躯干、腿的互穿做数值闸（试过，有向距离在袖口与上衣的双层面上给出 −12 cm 的假阳性），这两处由联系图目视把关，未见穿插。
- 右手是「握在枪颈上」的姿势，指根质心落在枪轴上（运行时挂枪的约定），手指绕枪颈弯，没有真的把枪颈包在指圈里；近景可接受，不是特写级。

## 目视对照

`tmp/RifleShoulderMarch/Sheets/`（本机，不入库）里的联系图：正面 / 侧面（朝左）/ 背面，各取触地、承重、站立中、脚跟离地、蹬离、摆动峰等 8 个相位，并与参考图三视图并排逐条看过：

- 枪的位置与朝向：右手在胸前肩高握枪，枪托在右肩前外侧、枪身斜上越过颈后、枪口在左肩后上方探出，侧面看枪略上扬（约 9°），与参考图一致；枪不压颈、不穿帽。
- 手臂：左臂随步反向摆、手半握；右臂握枪几乎不动、肘在下外侧。
- 躯干：直立略前倾（6.9°），肩胯小幅反扭，头平稳目视前方。
- 步态：前脚脚跟先着地、脚尖翘起，后脚脚跟抬起、脚尖蹬离、后膝弯曲；步幅与参考图量级相当。不是正步，也不是慢走。
- 与参考图不同的地方：模型没有棉被卷背包、腰间弹药盒与水壶的参考造型（按任务不加装备）；参考图里人物身体更前倾、右手更低（在锁骨高度），这里为让枪越过颈后又不穿衣领把握点抬到了下颌高度（衣领顶 1.59 m，模型的领子比参考图高）。

## 出处

以下是查到的资料；其中除 Winter 的节段参数表外，我读到的是检索摘要而不是原文，写在「限值」里的范围已按这一点标成文献或创作。

1. Perry 的步态分期与膝角：初始触地 0%、承重响应 0–10%、站立中 10–30%、终末站立（脚跟离地）30–50%、摆动前期到趾离地约 60%；摆动初期膝屈曲最大约 60°（Gage 1990）。[OUHSC 步态术语](https://ouhsc.edu/bserdac/dthompso/web/gait/terms.htm)、[Bipedal gait cycle](https://en.wikipedia.org/wiki/Bipedal_gait_cycle)。
2. 质心竖向位移约 5 cm、骨盆横转约 ±4°、双支撑约 22% 周期：[OUHSC Kinematic analyses of gait](https://ouhsc.edu/bserdac/dthompso/web/gait/knmatics/gait.htm)。
3. 节段质量与质心位置（Winter 2009 / Dempster）：头颈 0.081、躯干 0.497、大腿 0.100、小腿 0.0465、足 0.0145、上臂 0.028、前臂 0.016、手 0.006；质心距近端 0.433–0.5：[Duarte BMC 笔记本](https://nbviewer.jupyter.org/github/demotu/BMC/blob/master/notebooks/BodySegmentParameters.ipynb)。
4. 队列行进：美军 30 英寸步、快步 120 步/分（[JROTC 队列页](https://www.nchs.cc/jrotc-drill-ceremony)）；英军 116 步/分、约 76 cm，中国仪仗队 2015 红场 116 步/分、75 cm（[Military step](https://en.wikipedia.org/wiki/Military_step)，国内条令原文没有查到，只作旁证）。野外行军比队列慢，这里取上限 120 步/分、世界步长 0.61 m（偏短，符合下条的「负重步长缩短」）。
5. 负重行军：步长缩短、双支撑增多、躯干前倾增大（Seay 2015，转引自 [Exeter 负重 12 km 研究](https://ore.exeter.ac.uk/repository/bitstream/10871/23971/1/12kmLoadCarriage.pdf)）；2021 年军事负重步态系统综述报告躯干、髋、膝屈曲增大、时空参数影响有限且结论不一（[Walsh & Low 2021](https://radar.brookes.ac.uk/radar/file/48e81c11-9b2d-4b2c-ac64-f32100d482c8/1/Military%20load%20carriage%20-%202021%20-%20Walsh%20Low.pdf)）；Knapik, Reynolds & Harman 2004, Military Medicine 169(1)（DOI 10.7205/milmed.169.1.45，未读原文）。
6. Froude 数 Fr = v²/(g·L)：走→跑转换约 0.5（[Transition from walking to running](https://en.wikipedia.org/wiki/Transition_from_walking_to_running)、[Usherwood, Biology Letters](https://pmc.ncbi.nlm.nih.gov/articles/PMC1617162)）；动能势能交换最优约 0.25（[Tecnalia 综述](https://dsp.tecnalia.com/bitstreams/37fe722d-9756-4a02-8cff-1fa547b5d188/download)）。
7. 骨盆–胸廓横转：步速增大时由同相趋向反相（Lamoth, Beek & Meijer 2002；[Lamoth 等腰背痛研究](https://research.rug.nl/en/publications/pelvis-thorax-coordination-in-the-transverse-plane-during-walking/)）。具体幅度（肩带 5–14°）是创作取值。

## 运行时接入（2026-10-21，已接 `Script_AllyGait`）

接法照 `RifleHoldRun`（d1fbbd51）：`Script_AllyGait.LoadRifleShoulderMarch` 读 clip，`InstallAllyGait` 把它并进 `rig.clipById`、`rig.locomotion.profiles.RifleShoulderMarch`（`duration / referenceMps / contacts`，已按生产口径量过，见上），枪轨 `AllyRifle.*` 与 `AllyGait` 那份一样摘出来驱动 `AllyRifle` 辅助物，位置由真实右掌覆盖、朝向取自轨道；`_ApplyRiggedAim` 对它同 `AllyCarryWalk`（记着的瞄准不把枪从肩上抬下来，真开火才还给原瞄准层）。缓存版本 `Data_Tuning_AllyGait.marchVersion` 必须等于 clip 的 `revision`（门禁核对）。

**什么时候才换上（`Script_AllyGaitPolicy.SelectAllyGait`，全部成立才换）**

1. 国军步枪兵、基础动作是 `RifleRun`（`AdvanceFire` 站着、蹲、卧、背枪行军 `BackRifleRun`、日军都不碰），无威胁、不在戒备保持、没开火、没有任何优先姿态（担架、白刃、投掷、倒地、导演/任务接管…）。
2. **共享行军层正在带他走路**：`soldier.squadMarchCommand` 是本帧新写的（`marchCommandFreshS` = 0.35 s 内更新过），而且 `status === 'running'`（等待、起步、刹车、停顿、让路、追赶、到达都不算）。这是区分「赶路 / 行军」与「护送、说话、等待」的依据：护送、说话、等人时他要么不在行军层里，要么在 `waiting` 之类的状态，一律不换。
3. 没在说话：`speakerGesture.active / pending` 为空。
4. **身后 4 m 车道内没人**：`missionRearGapM ≥ marchRearClearM`（4 m），车道宽 `marchRearLaneM` = 1.6 m。扛在肩上的枪口朝后，指着身后的人；09-27 的口径（`Animation/AllyGait/Data_AllyGait.md`）要求这类场合保持枪口朝上的端枪。`missionRearGapM` 由 `Script_FirstLevelMissionRuntime.UpdateSquad` 每帧写（玩家、其他班员、任务纵队里的人，取正后方最近一个；没写这个量就当作有人，宁可少用）。
5. 速度在 `marchAboveMps` 1.05 ～ `walkMaximumMps` 1.9 m/s，带回差：已经在行军时低于 `marchBelowMps` 0.85 才退出；每次切换要连续 `marchSwitchFrames` 24 次更新（0.4 s 级）；超过 `marchHardMaxMps` 2.4 m/s（真在跑）立即退出，不等 24 帧。

不满足就是原来的动作（`AllyCarryWalk` / `AllyCarryStand` / `RifleRun`…），门禁里把 11 种行军层状态（含没有）、说话、车道 3.9 m / 4 m、无车道信息、威胁、戒备保持、开火、蹲、背枪、站定、十五种优先姿态逐条断言过。

**实机（`Script_AllyGaitBrowserTest`，真引擎 + 真蒙皮：NRA02 拿中正式、NRA05 拿汉阳造各一人）**

| 项 | 实测 |
| --- | --- |
| 播放 | 动作 id `RifleShoulderMarch`，枪由 clip 放（`carryWeight` 1），`aimApplied` false |
| 落脚锁 | 站立脚的世界位置误差 ≤ 2×10⁻⁷ m（0.0002 mm；56–71 个站立帧）；鞋底离地 NRA02 3.3–3.6 mm、NRA05 10.9–11.5 mm |
| 枪在右手里 | 枪相对右手握点的转动 0.0°（整个周期不变，刚性）；握点到枪原点 ≈ 1×10⁻¹⁵ m |
| 枪口 | 在人身后（后向分量 ≥ 0.76），世界俯仰 17.0–18.9° |
| 头与颈 | 枪顶点进入头模型内部的个数 0；枪离颈段最近 ≥ 6.8 cm |
| 躯干前倾 | 2.0–2.3° |
| 同速有威胁 | 保持 `RifleRun`；身后 2 m 有人 / 没有行军指令：保持 `AllyCarryWalk`；行军中开火：回 `RifleRun` |

枪口世界俯仰比设计值 9.5° 高（17–19°）：运行时枪口节点比枪轴向前再抬一点，加上躯干前倾 6.9° 把它也带上去；仍在「向后向上」的范围内，不指人。

**影响面（要说清）**：当前第一关里班员平时以 `squadSpeedMps` 3.05 m/s 跑、纵队里除队尾外身后都有人，过场走、护送、接待、前沿走路多不经过行军层，所以这条在现在的节奏下**很少触发**（队尾、队形拉开、前面的人减速而身后无人时才会出现）。这是有意的保守：宁可少用，也不顶掉提枪。要多用，应先在任务侧给「赶路」一个明确的状态标记，再放宽第 2、4 条。

**重烘后**：Blender 烘完要跑 `node Taierzhuang1938/_import/Script_RifleShoulderMarchProfile.mjs` 再 `Script_RifleShoulderMarchTest.mjs --write`；新 clip 的 `revision` 与 `marchVersion` 一起改，`index.html` 里 `Script_AllyGait` 等四个模块的缓存戳也要 bump（门禁 `Script_ModuleGraphTest`）。

日军同骨架可借用腿与躯干，但枪（三八式）握点与枪长不同，需另烘一份枪轨；本轮不接。
