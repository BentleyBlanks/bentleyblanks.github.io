# RifleHoldRun：双手持枪跑动（原地循环）

2026-10-21 按用户给的三视图（正 / 侧 / 背，国军步兵双手持栓动步枪快跑）在共用骨架 `TengxianHumanoidV1`（参考外观 `Model_TengxianNra02.glb`）上用 Blender 做的一条循环动作。
**2026-10-21 已接进运行时**：国军步枪兵不戒备的快跑（> 2.6 m/s）播这条（见文末「运行时接入」）。不改模型、贴图、蒙皮权重，也不动其他步态。

## 文件

| 文件 | 内容 |
| --- | --- |
| `Animation_TengxianRifleHoldRun.json` | 一条 three.js `AnimationClip` JSON：`RifleHoldRun`（时长 0.72 s，30 键/周期，从 0 s 起，末键 = 首键）+ 武器轨 `HoldRifle.position/quaternion` + `profiles.RifleHoldRun`（运行时读的 `referenceMps`（模型单位）/ `contacts`，以及设计值 `designReferenceMps`（运行时米）/ `designContacts`）。骨名按 GLTFLoader 净化后的写法；不动的轨道只存一键 |
| `Data_RifleHoldRun.json` | 独立测量（`Script_RifleHoldRunTest.mjs --write` 写出）：逐项实测数、各门禁的通过结论、clip 文件哈希（过期会被门禁发现） |
| `../../_import/Script_RifleHoldRunPrepare.mjs` | 只导出两份姿态给 Blender：绑定（T）姿态；IjaGuardPort 第 0 帧（仅取「双手握枪」的手型） |
| `../../_import/Script_RifleHoldRunProfile.mjs` | 烘完之后跑：用生产步态剖面的同一条规则（`Script_LocomotionProfileBake`：趾关节离地 < 3.5 cm 且后退 > 0.12 m/s 持续 > 75 ms，120 Hz）量出运行时要读的参考速度和接触区间，写回 clip 文件的 `profiles.RifleHoldRun` |
| `../../_import/Script_RifleHoldRunBake.py` | Blender 烘焙脚本：生成动作、逐帧解算、写 JSON、存 .blend；`RIFLE_HOLD_RUN_RENDER=1` 另出联系图 |
| `../../Script_RifleHoldRunTest.mjs` | 纯 Node 门禁（quick 层、animation 域） |

可编辑工程（不进仓库）：`C:\Users\Bentl\OneDrive\AI\Models\Blender\Taierzhuang1938\RifleHoldRun_20261021\Scene_RifleHoldRun.blend`
（骨架上的 `RifleHoldRun` 动作、`Prop_HoldRifle` 随武器轨走的真中正式枪网格、灯与相机）。验收网页和联系图只留本地 `tmp/RifleHoldRun/`。

## 动作怎么来的（没有拷旧曲线）

每一帧都由下面这条因果链现算，不借用 `BackRifleRun` / `RelaxedGait` / `AllyGait` 的任何曲线：

1. **质心先定**：整身质心走预设轨迹——腾空是自由落体抛物线（加速度 −9.81），支撑是半正弦地反力（峰值取到刚好把整段腾空的冲量补回来，上下对称），水平是「先制动后推进」（−A·sin 2πt/t_s，腾空无力，平均速度为 0），再加 1.4 cm 的左右摆。
2. **骨盆反解**：每帧摆好整身，算 de Leva 节段质心，把骨盆平移到使质心贴上这条轨迹（8 次迭代内 0.3 mm 以内，与脚的真实蒙皮贴地一起收敛）。
3. **脚**：支撑脚绕脚跟 → 全脚 → 趾关节（Toe0）滚动，支点钉在地面（字符系以跑速后退）；摆动脚用五次多项式接趾离地和下一次着地的状态（位置、速度连续），着地时竖向速度 −1.2 m/s；摆动期脚俯仰 = 小腿俯仰 + 放松踝，两端与着地/离地的俯仰交接。
4. **躯干**：整体前倾 19°（脊柱逐段分担），头保持稳定，骨盆转 ±6°、胸反向转 ±5°，骨盆侧倾 ±3°。
5. **手臂与枪**：两手按枪的两个握点（右握点 = 枪原点，左握点沿枪轴 0.34 m）做两骨 IK；手型取 IjaGuardPort 相对枪体的握法（逐手单独映射）；枪随胸，再叠一层「肩肘软挂载」弹簧（份额 0.4）。
6. **武器轨**：枪的世界变换按 AllyGait 的 `AllyRifle` 约定写在 `HoldRifle.*`（局部 −Z 为枪口，+Y 为上；位置为右握点，单位同骨骼平移）。枪的朝向规则与运行时 `_UpdateRiggedWeaponMount` 一致：轴 = 右握点 → 左握点，上 = 躯干上向投影。

单位：烘焙在「米 = 运行时 1.66 m 国军」的尺度里做（把 `AUTHORING_SCALE` 设为 1），所以 g = 9.81 就是字面值；导出时除以 `authoringFactor` 写回 GLB 的节点单位。

## 为什么是 3.2 m/s、167 步/分

腿骨长是硬约束：本骨架大腿 0.386 + 小腿 0.386 = 0.772 m（髋到踝），踝高 0.099 m。支撑期质心要有 5–10 cm 的起伏，膝要压到约 70°；趾离地时脚在髋后 ≈0.4 m，再长腿够不着。
在 0.72 s 周期（167 步/分）、每脚触地 0.24 s 的前提下，腿能撑住的速度约 3.2 m/s（步长 1.15 m = 0.69 身高）。要更快就得更长的腿或更大的跨步，超出这条骨架。
这在用户给的 3–4.5 m/s 范围的下沿；见「残留与取值说明」。

## 实测数（Data_RifleHoldRun.json，clip 哈希见该文件）

| 闸 | 实测 | 判据 |
| --- | --- | --- |
| 1 无缝 | 首键 0 s、末键 0.72 s；接缝位置差 0、旋转差 0.001°；接缝处二阶差分 33 mm（其余最大 57 mm）；骨盆最大键间位移 / 中位数 = 24.6 / 15.7 mm | 从 0 起、时长 = 周期、接缝 < 1 mm / 0.05°、接缝不是速度离群点 |
| 2 支撑脚不滑 | 脚跟、趾尖两个锚点在「鞋底最低点 < 3.5 cm」窗口内地面系位移 0.34 cm（< 1.2 cm 的承重窗口内 0.09 cm） | ≤ 1.5 cm |
| 3 贴地与腾空 | 支撑期鞋底最低点 0.6–3 mm（要求 −2…12）；摆动期最低 3 mm（不入地）；腾空占比 20%（3.5 cm 阈值；设计腾空 33%）；腾空最高离地 11.2 cm；脚骨局部转角均值 10°、最大 22°（翻 180° 才是翻） | 腾空占比 15–35% |
| 4 关节与骨长 | 膝：触地 31°，支撑峰 73°，摆动峰 123°，最小 29°（不反弯）；肘 68–113°；全部骨长相对绑定最大误差 0.0055 mm；关节角无单键尖刺（膝角键间二阶差分最大 14.7°） | 骨长 < 1 mm、膝肘不超伸 |
| 5 质心 | 腾空抛物线加速度 −9.67 / −9.65 m/s²（−9.81 ±15%）；带枪（4 kg）读法 −9.25；质心起伏 8.1 cm；支撑期地反力峰 2.33 BW；制动 −1.4 → 推进 +2.1 m/s²；步频 166.7、速度 3.2 m/s、步长 1.152 m（0.69 身高）、设计占空比 0.667 | 起伏 4.5–11 cm，符号与着地时序一致 |
| 6 上身与枪 | 前倾 19.1–19.5°（p-p 0.4°）；髋/肩偏转 ±6° / ±5°，相关系数 −1；头 p-p 俯仰 0°、偏航 1.5°、侧倾 0.2°；两握点在枪体系里漂移 0.1 mm；枪口侧视投影 47.6°（46.3–49.0），真仰角 27.4°，向左偏 60–63°，枪口离地 1.40–1.50 m；枪离躯干/头/颈/肩/髋最近 32 mm、无穿插；手相对胸 p-p 3.4 / 2.0 / 3.0 cm | 前倾 14–21°，枪口侧视 45–55°，握点漂移 < 4 mm |
| 7 次级运动 | 模型没有背包骨，不加；枪（右握点）竖向颠动 5.0 cm 幅度（胸 5.3 cm），比胸晚 9° | 枪不比胸颠得更大、不早于胸 |
| 8 目视对照 | 见下 | — |

**第 8 项（目视）**：对 Blender 渲染（`tmp/RifleHoldRun/Sheets/R16`、`R17`）和真 three.js（GLTFLoader + `AnimationClip.parse` + 真枪网格，`tmp/RifleHoldRun/Review/index.html`）的侧/前/后全周期联系图，与 `Ref_RifleHoldRun_FrontSideBack.webp` 逐条对：
前倾、枪斜挎胸前（侧视约 48°，正视从右胯斜向左肩）、右手握枪颈、左手托护木、后蹬脚底朝后、前腿高抬小腿垂直、头向前稳定，造型对得上；
真 three.js 里每键鞋底最低点与 Blender 一致（支撑期 3.0 mm），说明导出的 JSON 在真运行时库里和 Blender 里是同一个动作。
与参考图的差别：参考图背上有棉被卷背包，模型没有，不加；参考图骨盆略高，这里髋更低（腿短 + 质心起伏要求的支撑中段膝屈 73°，偏深）。

## 出处与取值依据（哪些是查到的，哪些是创作取值）

- **节段质量与质心位置**：de Leva, P. (1996) *Adjustments to Zatsiorsky-Seluyanov's segment inertia parameters*, J Biomech 29(9):1223–1230（男性）。头 6.94%、躯干 43.46%（质心距颈端 51.38%）、上臂 2.71%（57.72%）、前臂 1.62%（45.74%）、手 0.61%（79%）、大腿 14.16%（40.95%）、小腿 4.33%（44.59%）、足 1.37%。
  大腿 14.16% / 40.95% 在二手表（Visual3D wiki）上核对过；其余数值我没能打开论文 PDF 的文字层，按论文表录入，未逐项二次核对。节段端点取骨骼关节点（躯干 = 颈根到骨盆关节；头 = 颈根向上 0.11 m；手 = 腕到四指根中心的 79%；足 = 踝到趾关节的 55%），与论文的标志点定义有出入。测量脚本与烘焙脚本共用这套定义，所以「质心贴抛物线」这一项的独立性有限；另外用带枪读法（枪 4 kg，人 65 kg，枪取距右握点 0.2 m 的枪身点）得到 −9.25，仍在 ±15% 内。
- **腾空抛物线、半正弦地反力**：人跑步的质心力学标准模型（Cavagna, Heglund & Taylor 1977 机械功；Alexander 的弹簧-质量模型）。我只核对到摘要层面；起伏 5–10 cm、支撑期地反力峰 2–2.5 BW 这两个范围按这类文献的量级定，**属创作取值**，没有核对具体速度下的数。
- **触地 / 腾空时间**：检索摘要里读到轻松配速竞技跑者触地约 0.22 s、腾空约 0.13 s（每步），3.5 m/s 的肯尼亚跑者触地约 0.21–0.22 s（jssm.org 论文表，只看了检索摘要，没读全文表格）。本动作每脚触地 0.24 s、设计腾空 0.12 s/步，在这个量级上，负重取更长触地。
- **负重**：负重背包行走系统综述（2016）与军用负重研究读到的方向——躯干前倾增大、步频升高、步长缩短、竖向地反力约每公斤负重 +10 N（均为摘要层面）。据此取前倾 19°（无负重跑步通常 5–10°）、步频 167。
- **速度 3.2 m/s 的实际依据**：本骨架腿长（见上），不是文献。弗劳德数 V²/(g·L)（L = 0.87 m）= 1.2，在慢跑到中速跑的范围。
- **创作取值（没有文献依据）**：枪的位置与朝向（照参考图量：侧视 45–55°、枪在右胯到左肩、枪口约肩高）、肩肘软挂载份额与频率、骨盆/胸偏转幅度、脚俯仰、摆动抬脚高度等。

## 重建与验收

```powershell
node Taierzhuang1938/_import/Script_RifleHoldRunPrepare.mjs
$env:RIFLE_HOLD_RUN_PROJECT = (Resolve-Path Taierzhuang1938).Path
node scripts/Script_BlenderMcp.mjs start --batch Taierzhuang1938/_import/Script_RifleHoldRunBake.py --task RifleHoldRun
node Taierzhuang1938/Script_RifleHoldRunTest.mjs --write     # 重写 Data_RifleHoldRun.json
node Taierzhuang1938/Script_RifleHoldRunTest.mjs             # 门禁；clip 改了没 --write 会报「过期」
node scripts/Script_BlenderMcp.mjs status --scan             # 确认无残留 Blender
```

烘焙无随机量，重烘两次 clip 字节一致。可调参数在脚本顶部 `GAIT`；`RIFLE_HOLD_RUN_GAIT='{"…":…}'` 临时覆盖，`RIFLE_HOLD_RUN_NOWRITE=1` 只算不写，`RIFLE_HOLD_RUN_RENDER=1` 出联系图。
门禁（`Script_RifleHoldRunTest.mjs`）在导出的 clip 上独立采样（每键 4 个子样、约 6 ms），用真实蒙皮网格（鞋底顶点、枪体与躯干体的距离）和真实中正式枪网格；`--report` 只打印不断言。
Data 里记的「支撑脚不滑」口径：鞋底有两个材质锚点（静止时最靠后/最靠前的鞋底顶点），锚点离地 < 3.5 cm 的窗口内在地面系（字符系 + 跑速）里走过的最大距离。

## 残留与取值说明

- 速度 3.2 m/s 在 3–4.5 m/s 的下沿，想要更快需要换骨架比例或更长周期的步长（会超出腿够得着的范围）。
- 支撑中段膝屈 73°、骨盆偏低：来自「腿 0.772 m + 质心起伏 8 cm + 触地 0.24 s」，不是漏做。
- 腾空占比在 3.5 cm 阈值下量出 20%，设计值 33%（两脚都离地的真实时间）；两者差在落地前 / 离地后鞋底仍在 3.5 cm 内的那几十毫秒。
- 次级运动只有枪的软挂载（晚 9°）；背包 / 弹药盒 / 水壶随脊柱骨刚性运动，没有单独骨，按任务要求没有硬加。
- 武器轨 `HoldRifle` 运行时不用（见下），留在文件里是烘焙与测量的参照。

## 运行时接入（2026-10-21）

改动都在 AllyGait 这一层（国军步枪兵共用，第一关班里的人和白盒工具的国军木偶都装它）：

- `Script_AllyGaitPolicy.mjs` `SelectAllyGait(…, holdRun)`：站立、不戒备（无威胁、不在 `readyHoldS` 内、无 `missionCombatAlert`）、基础选片为 `RifleRun`、速度 > `holdRunAboveMps`（2.6 m/s）时换成 `RifleHoldRun`；低于 `holdRunBelowMps`（2.3）才换回，换档要连续 `holdRunSwitchFrames`（6）次更新（滞回 + 保持，和 RelaxedGait 的走/跑切换同形）。优先姿态（死亡、搬运、白刃、卧、跪、蹲、受伤跛行、投弹、伸手、望远镜、离地、开场/任务接管、P012 等武器、`relaxedGait`）一律照旧，威胁、开火时仍是生产的 `RifleRun`，P012 背枪行军（`BackRifleRun`）也不动。`Data_Tuning_AllyGait` 里这些数可调。
- `Script_AllyGait.mjs`：`LoadRifleHoldRun()` 取 JSON（`?v=holdRunVersion`，缓存版本 = clip 的 `revision`，门禁对账），解析 clip、剥掉 `HoldRifle.*` 轨，装进每个国军 rig 的 `clipById`，并把 `profiles.RifleHoldRun`（模型单位）放进该 rig 的 `locomotion.profiles`——速度分摊（播放倍率 × 步幅缩放）、支撑脚锁定都吃这张表。装不上（取不到文件）就静默退回生产 `RifleRun`。
- 枪不走武器轨：运行时本来就按「右握点定位、朝左握点定向、上取躯干上向」摆双手枪，正是烘焙时对照的那条规则，所以 `HoldRifle` 轨没用上，中正式、汉阳造都按自己的枪模挂在同一对握点上（浏览器门禁量过：左握点离枪轴 0.01 mm，握距 0.34 m）。
- `_ApplyRiggedAim`：保持姿势时（`RifleHoldRun` 且没在开火）不把「残留的 aim 值」交给瞄准层——否则双臂被拽成平端，枪口回到水平；真开火才交（和扛枪走的做法一样）。
- `index.html` 里这三个模块的缓存戳已 +1。

**门禁**：`Script_AllyGaitTest`（策略：滞回/保持/威胁/蹲/各优先姿态/BackRifleRun；装 clip、剖面、剥轨；瞄准钩子）、`Script_RifleHoldRunTest`（clip 的剖面没过期、`holdRunVersion` 对账、测出的趾速换成运行时米与设计值差 < 3%）、`Script_AllyGaitBrowserTest`（真引擎里的真国军 rig：中正式 / 汉阳造都播 `RifleHoldRun`，前倾 19°，支撑脚锁定误差 0，落脚与腾空，左握点在枪轴上，枪口侧视俯仰，威胁同速度仍是 `RifleRun`）。

**没做的**：IJA 不用（它们有自己的警戒小跑，且这条是国军参考）；玩家第一人称不用；`BackRifleRun`（P012 背枪行军）不动；扛枪行军属于另一条动作，不在这里。
