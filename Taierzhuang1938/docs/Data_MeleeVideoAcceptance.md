# 左右键视频动作修订 · 2026-09-06

用户要求“右键的抵抗动作还是不太行，左键还是没什么动感，改”，并指定“不要自己做了，直接视频转骨骼”。本轮替换斩击、突刺与瞬时拨挡；原 Notion 规则、1/2/3 人的靠近／交互遭遇、F 与两种 QTE 保留，见 [机制说明](Data_MeleeQte.md)。

## 来源与动作

原片是 Seedance 生成的单人表演视频，并非真人实拍。已有视频被实际送入本机 GVHMR，使用 RTX 4070 SUPER、Torch 2.7.1+cu128；推理结果、哈希与环境报告保存在资产库。没有把旧恢复结果改名当成新推理。

| 原片 | 使用的源帧（30 fps 推理时间线） | 对应动作 |
| --- | --- | --- |
| DadaoCutsV1 | 18–76、78–134、144–267 | 斜斩、反斩、重劈 |
| DadaoParriesV1 | 23–79、45–82 | 两种拨挡 |
| StaffThrustsV1 | 18–97、102–170 | 短刺、长刺 |
| BayonetParriesV1 | 88–117、12–73 | 左右拨枪 |

两版持枪突刺原片因动作更像举枪瞄准／构图不完整而未采用；突刺最终使用双手长杆前送的动作参考，重定向到正式刺刀步枪。原片、拒绝记录和生成收据全部留存。共 9 个源选段，含紧凑和通用拨挡别名共 16 个运行时 clip；两军共 18 个独立可编辑模型工程及 GLB。

## 重定向

- 保留原人物 BIP 骨架、骨名、绑定比例。原始 22 关节数据未经平滑、IK 或重定向即单独存档；修改只发生在消费它的重定向阶段。
- 按源视频压缩停顿，将接触帧映射到既有起手／有效／收招窗口；不增加伤害窗口、不另造攻击相位曲线。轻重输入、单次缓存和 QTE 共用原规则。
- 原人物肩部与 SMPL 绑定轴不同。逐段转移观测方向并保留原段长，避免直接套旋转把肩抬到颈部以上。
- 枪械的可见线段通过图像检测约束方向，结合 GVHMR 深度与躯干平面恢复朝向；不把两腕连线直接当枪口。长杆 180/180 帧、拨枪 166/180 帧有可用线段，遮挡帧插值并保留观察表。
- 突刺的目标方向按实际道具接触朝向标定，而非按髋部朝向标定。第一人称以游戏镜头为方向基准，定比例缩放源位移／旋转；长杆原片从腰部起手，现成步枪已在胸前，另校准高度和初始武器朝向。固定增益在 `Script_Viewmodel.mjs` 中明示。
- 双手共同约束刚性刀柄／枪身，使用原握持 IK 与手腕限制。大刀食指不再使用枪械扳机预备姿势，并补拇指对握。袖口裁边、延伸和细分消除抬臂时的破面，7,050 个手部顶点逐值保持不变。
- 成功拨挡提前交还输入时，视频时间不再突然跳到收招后段；剩余拨开动作继续播放，任何新攻击可立即中断。

## 本地资产与复现

统一资产库：`C:/Users/Bentl/OneDrive/Sync/饮河/FPS/视频转骨骼`。

- 原片与推理输入：`Video/Sources/<Source>/`；完整新推理：`Models/_Cache/MeleeVideoV1/<Source>/`。
- 配方与版本：`Models/MeleeVideoV1/Data_Recipes.json`、`Data_Versions.json`。
- 两军源工程：`Blender/MeleeVideoV1/Scene_<Faction>_<Action>_V1.blend`；第一人称工程：`Scene_MeleeVideoFirstPerson.blend`。
- 原始可编辑恢复骨骼：`Blender/RawRecovery/`；原数组与 GLB：`Models/RecoveryPreview/`。
- 三栏实时预览：[动作研究室](http://127.0.0.1:8136/Preview/index.html?action=DadaoLight)。原片、未重定向恢复骨骼、最新 GLB 同步播放与逐帧，模型由 AnimationMixer 实时播放。

复现顺序：`Script_MeleeVideoPropTrack.py` → `Script_MeleeVideoPrepare.py` → `Script_MotionBatchPrepare.py --group MeleeVideoV1 --ids <动作>` → Blender 后台 `Script_MeleeVideoBatchBake.py` → `Script_MotionBatchRegister.py --group MeleeVideoV1`。Python 工具传 `--root <资产库>`。第一人称先 `Script_MeleeAnimationTest.mjs --bakefp`，再通过 BlenderMCP 后台运行 `Script_MeleeVideoSourcePackage.py`。修袖口入口 `Script_MeleeSleeveRepair.py --input <资产库>/Models/SourceCharacters/Model_FpsArmsBeforeMeleeSleeve.glb`。

## 验收证据

- 白刃规则增加“成功拨挡视频时间单调且可立即接攻击”的回归；共 41 项。
- 全部 108 段全身与 54 段第一人称动作逐帧验收，握点限值 6 mm、腕关节限值 65° 保持不变；新突刺还检查接触时枪口确实朝向对手。
- 本轮 prepush：69 通过、0 历史基线、0 失败。其后的袖口与握姿修正另跑 8 项第一人称、握持、输入集成、QTE 与模块门禁，全部通过。袖口初版因长三角未通过，补细分后按原 0.18 m 阈值复测通过；没有放宽检查。
- 最新 18 个两军模型检查 90 个姿态，全部入镜、浏览器无异常。全库 93 个版本的实时模型变化、原片时间、恢复帧、逐帧／播放控件与来源分组通过。
- 原始数组验证：30 份逐值等于对应 NPZ，哈希匹配；16 份可编辑原骨架和 229 个文件链接有效。数字是当前全库快照，包含本轮以外资产。
- 实际鼠标左右键与 A/D 输入录像在本任务 `_shots/MeleeActionRevision/Video_VideoAccepted.mp4`，分别核对左右拨挡 clip。截图采样 FPS 不代表正常实时性能。

源视频、Blender 工程、检查站与录像留在本地资产库／忽略目录；公开仓库只交付运行时动作数据、手臂模型、重建脚本与说明。当前为用户已授权的非商业研究验证用途。
