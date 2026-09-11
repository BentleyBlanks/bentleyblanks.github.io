# 左右键视频动作修订 · 2026-09-06

当前修订为 **MeleeVideoV2**，专门纠正用户指出的重定向偏离原始恢复、尤其手部的问题。V1 上线不代表用户接受其表现；下方 V1 记录保留为历史。

2026-09-11 第三人称突刺朝向修正：源动作保留侧身站姿，但头部在短／长刺时偏离出刺轴约 50°。`Script_CharacterModel` 在采样后把 Head 的水平朝向校正到角色攻击轴（含已锁定攻击的 `weaponYawOffset`），按动作切换权重进入／退出；只修改 Head，避免 Biped 的 Neck 子树连带转动锁骨与双臂。双手、道具、躯干和脚步继续使用原恢复轨道，源工程与采样文件保持原始数据。`Script_ActorPoseTest` 覆盖两军各五套模型、三个朝向和短／长／紧凑刺，验证面部朝向及手脚、道具不受影响。

用户要求“右键的抵抗动作还是不太行，左键还是没什么动感，改”，并指定“不要自己做了，直接视频转骨骼”。本轮替换斩击、突刺与瞬时拨挡；原 Notion 规则、1/2/3 人的靠近／交互遭遇、F 与两种 QTE 保留，见 [机制说明](Data_MeleeQte.md)。

## V1 来源与动作

原片是 Seedance 生成的单人表演视频，并非真人实拍。已有视频被实际送入本机 GVHMR，使用 RTX 4070 SUPER、Torch 2.7.1+cu128；推理结果、哈希与环境报告保存在资产库。没有把旧恢复结果改名当成新推理。

| 原片 | 使用的源帧（30 fps 推理时间线） | 对应动作 |
| --- | --- | --- |
| DadaoCutsV1 | 18–76、78–134、144–267 | 斜斩、反斩、重劈 |
| DadaoParriesV1 | 23–79、45–82 | 两种拨挡 |
| StaffThrustsV1 | 18–97、102–170 | 短刺、长刺 |
| BayonetParriesV1 | 88–117、12–73 | 左右拨枪 |

两版持枪突刺原片因动作更像举枪瞄准／构图不完整而未采用；突刺最终使用双手长杆前送的动作参考，重定向到正式刺刀步枪。原片、拒绝记录和生成收据全部留存。共 9 个源选段，含紧凑和通用拨挡别名共 16 个运行时 clip；两军共 18 个独立可编辑模型工程及 GLB。

## V1 重定向（历史）

- 保留原人物 BIP 骨架、骨名、绑定比例。原始 22 关节数据未经平滑、IK 或重定向即单独存档；修改只发生在消费它的重定向阶段。
- 按源视频压缩停顿，将接触帧映射到既有起手／有效／收招窗口；不增加伤害窗口、不另造攻击相位曲线。轻重输入、单次缓存和 QTE 共用原规则。
- 原人物肩部与 SMPL 绑定轴不同。逐段转移观测方向并保留原段长，避免直接套旋转把肩抬到颈部以上。
- 枪械的可见线段通过图像检测约束方向，结合 GVHMR 深度与躯干平面恢复朝向；不把两腕连线直接当枪口。长杆 180/180 帧、拨枪 166/180 帧有可用线段，遮挡帧插值并保留观察表。
- 突刺的目标方向按实际道具接触朝向标定，而非按髋部朝向标定。第一人称以游戏镜头为方向基准，定比例缩放源位移／旋转；长杆原片从腰部起手，现成步枪已在胸前，另校准高度和初始武器朝向。固定增益在 `Script_Viewmodel.mjs` 中明示。
- 双手共同约束刚性刀柄／枪身，使用原握持 IK 与手腕限制。大刀食指不再使用枪械扳机预备姿势，并补拇指对握。袖口裁边、延伸和细分消除抬臂时的破面，7,050 个手部顶点逐值保持不变。
- 成功拨挡提前交还输入时，视频时间不再突然跳到收招后段；剩余拨开动作继续播放，任何新攻击可立即中断。

## V1 本地资产与复现（历史）

统一资产库：`C:/Users/Bentl/OneDrive/Sync/饮河/FPS/视频转骨骼`。

- 原片与推理输入：`Video/Sources/<Source>/`；完整新推理：`Models/_Cache/MeleeVideoV1/<Source>/`。
- 配方与版本：`Models/MeleeVideoV1/Data_Recipes.json`、`Data_Versions.json`。
- 两军源工程：`Blender/MeleeVideoV1/Scene_<Faction>_<Action>_V1.blend`；第一人称工程：`Scene_MeleeVideoFirstPerson.blend`。
- 原始可编辑恢复骨骼：`Blender/RawRecovery/`；原数组与 GLB：`Models/RecoveryPreview/`。
- 三栏实时预览：[动作研究室](http://127.0.0.1:8136/Preview/index.html?action=DadaoLight)。原片、未重定向恢复骨骼、最新 GLB 同步播放与逐帧，模型由 AnimationMixer 实时播放。

复现顺序：`Script_MeleeVideoPropTrack.py` → `Script_MeleeVideoPrepare.py` → `Script_MotionBatchPrepare.py --group MeleeVideoV1 --ids <动作>` → Blender 后台 `Script_MeleeVideoBatchBake.py` → `Script_MotionBatchRegister.py --group MeleeVideoV1`。Python 工具传 `--root <资产库>`。第一人称先 `Script_MeleeAnimationTest.mjs --bakefp`，再通过 BlenderMCP 后台运行 `Script_MeleeVideoSourcePackage.py`。修袖口入口 `Script_MeleeSleeveRepair.py --input <资产库>/Models/SourceCharacters/Model_FpsArmsBeforeMeleeSleeve.glb`。

## V1 验收证据（历史）

- 白刃规则增加“成功拨挡视频时间单调且可立即接攻击”的回归；共 41 项。
- 全部 108 段全身与 54 段第一人称动作逐帧验收，握点限值 6 mm、腕关节限值 65° 保持不变；新突刺还检查接触时枪口确实朝向对手。
- 本轮 prepush：69 通过、0 历史基线、0 失败。其后的袖口与握姿修正另跑 8 项第一人称、握持、输入集成、QTE 与模块门禁，全部通过。袖口初版因长三角未通过，补细分后按原 0.18 m 阈值复测通过；没有放宽检查。
- 最新 18 个两军模型检查 90 个姿态，全部入镜、浏览器无异常。全库 93 个版本的实时模型变化、原片时间、恢复帧、逐帧／播放控件与来源分组通过。
- 原始数组验证：30 份逐值等于对应 NPZ，哈希匹配；16 份可编辑原骨架和 229 个文件链接有效。数字是当前全库快照，包含本轮以外资产。
- 实际鼠标左右键与 A/D 输入录像在本任务 `_shots/MeleeActionRevision/Video_VideoAccepted.mp4`，分别核对左右拨挡 clip。截图采样 FPS 不代表正常实时性能。

源视频、Blender 工程、检查站与录像留在本地资产库／忽略目录；公开仓库只交付运行时动作数据、手臂模型、重建脚本与说明。当前为用户已授权的非商业研究验证用途。


## V2：恢复动作保真修正

继续使用已存在的四份 V1 原片及原始 GVHMR NPZ；本轮没有重新生成视频或重新推理。V2 指重定向和运行时修正版本，不能解释为新恢复结果。

旧版按武器握点做双臂 IK，虽握点误差为零，手腕仍可被移开 19.36 cm；抽样手臂方向最大相差 39.26°。另外，BIP 大腿和锁骨的父级不同于 SMPL，旧消费方式把这类层级差异变成了动作偏移。

V2 按原始恢复的解剖关系转移全身段方向，保留原角色的骨名、绑定矩阵、骨骼层级和段长。手腕位置不再让位于武器 IK；手掌仅作一次固定解剖轴校准，之后完整保留原始手腕旋转变化。道具适配恢复后的双掌，允许支撑握点沿柄／护木移动。大刀手指使用原模型的解剖弯曲轴和合拢握姿。GVHMR 的 22 身体关节没有可靠手指轨迹，这部分是明确的握持补充，不能宣称为视频恢复的手指。

游戏导出增加 60 fps 完整骨姿：52 根骨骼和武器的父级相对位置／四元数，按原视频选段和既有战斗时窗重采样。运行时先插值局部轨道再组合层级，避免世界坐标线性插值削掉快速挥动的弧线；播放完整姿态，避免再次叠加错误的绑定偏移。Actor 持枪层使用相同武器轨道，原有动作转场和游戏输入窗口保持有效。

此轮保真目标覆盖两军 18 个全身 GLB 与其游戏全身播放。第一人称仍使用上一轮已经接入的镜头空间视频适配，不把第一人称宣称为原始全身坐标的逐帧复刻。

### V2 本地复现

配方、模型、工程分别在 `Models/MeleeVideoV2`、`Blender/MeleeVideoV2`；原始恢复 JSON 保留在 `Models/RecoveryPreview`，新增 `Data_V2_<Action>RawWristRotations.json` 直接记录原 NPZ 手腕矩阵和哈希。旧 V1 原片、缓存、模型和工程全部保留；三栏动作研究室默认选 V2，V1 收进效果历史。

从本任务 worktree 执行，Python 使用现有 GVHMR 环境，`<资产库>` 为上文统一位置：

1. `_import/Script_MeleeFidelityPrepare.py --root <资产库>` 复用原始恢复、生成 V2 消费数据及原始手腕快照。
2. BlenderMCP 启动后台 Blender，运行 `_import/Script_MeleeFidelityBatchBake.py`，生成两军 18 套工程和 GLB，并导出游戏动作。只改导出格式时运行 `_import/Script_MeleeFidelityRuntimeExport.py`。
3. `_import/Script_MotionBatchRegister.py --root <资产库> --group MeleeVideoV2 --revision 2`，再运行资产库 `Preview/Script_IndexLibrary.py`。
4. `_import/Script_MotionLibraryDataVerify.py --root <资产库>` 逐值验证原始数组、手腕矩阵和缓存哈希。
5. `node _import/Script_MeleeFidelityVerify.mjs --root <资产库>` 对照原始骨骼与实际 GLB；需要本地三栏预览服务 `127.0.0.1:8136`。
6. `node _import/Script_MeleeRuntimeFidelityVerify.mjs --root <资产库>` 加载实际 GLB，以 121 个游戏相位逐一对照生产采样器的手臂、手腕和道具；该离线检查需要外部资产库，不登记为普通 CI 测试。

原模型和运行时夹具存在明确的统一身高比例差，运行时对照按绑定髋高统一归一化；不允许逐关节拟合偏移消除误差。阈值保持：段方向 ≤0.5°、手腕位置 ≤2 mm、段长漂移 ≤0.1 mm、手腕旋转变化 ≤0.5°。握点误差仅作诊断；验收同时查看贴图模型侧面／斜侧手部近景及同一原片时间的全身对照。


### V2 验证结果

- 原始恢复对照：18 个 GLB、2,286 个 60 fps 姿态；原绑定矩阵差为零，段方向最大误差 0.00021°，手腕位置最大误差约 0.00078 mm；固定轴向校准后的手腕旋转变化最大误差 0.087°。
- 生产采样器对照实际 GLB：每模型 121 个游戏相位，覆盖全部 52 根身体／手指骨骼和武器。统一身高归一化后，全骨位置最大误差约 0.002 mm，全骨旋转最大误差约 0.00022°，武器位置最大误差约 0.00067 mm。
- 原始关节／手腕矩阵逐值及哈希验证通过。实际游戏两种武器的轻击、重击、左拨挡、右拨挡八组输入通过，默认六组 1/2/3 人遭遇共十二名敌人保留。
- 同原片时间的两军全身三栏对照，以及斜侧、侧面、背侧手部近景已查看。交叉斩需从背侧查看被双袖遮住的握持，不能把单侧遮挡当成缺失手部。

详细逐帧报告和截图仅留资产库 `Preview/MeleeFidelityV2`；报告为 `Data_FidelityValidation.json`、`Data_RuntimeFidelity.json`。本轮只证明对原恢复表演的保真及运行时一致性，不把单目恢复本身、手指补姿或玩家主观动作评价宣称为绝对准确。

发布前选中 68 项 prepush，68 通过、0 历史基线、0 失败；最终数据冻结后的模块、全动作、人物姿态、白刃规则、QTE 与部署打包六项专项全部通过。测试未放宽既有握持、腕关节、场景或开机预算。
