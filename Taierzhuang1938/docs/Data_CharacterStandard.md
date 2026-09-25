# 滕县角色资产与共用身体骨架

2026-09-26：采用五款士兵外观，共用 `TengxianHumanoidV1`。机器可读契约为
`Model/Character/Data_TengxianHumanoid.json`，运行时清单为
`Model/Character/Data_TengxianCharacterManifest.json`。

| 阵营 | 游戏资产 | 用途 |
| --- | --- | --- |
| 国军 | `Model_TengxianNra02.glb` | 主角、年轻队员 |
| 国军 | `Model_TengxianNra05.glb` | 罗班长、军官、其他获准队员 |
| 日军 | `Model_TengxianIja01.glb` | 普通兵、军官 |
| 日军 | `Model_TengxianIja02.glb` | 普通兵外观变体 |
| 日军 | `Model_TengxianIja03.glb` | 普通兵外观变体 |

面部派生件（2026-09-26 分镜轮起，见下文「分镜轮追加」）：`Model_Tengxian{Nra02,Nra05,Nra06,Ija01,Ija02,Ija06}Facial.glb`，
身体沿用同一骨架，另有 13 根 `Face_` 控制骨（口型 9 个姿势 + 4 个表情）。它们不计作人物外观。
Codex 第一次规范化时的 11 骨 `Model_TengxianNra05Facial.glb` 已由 13 骨版替换。
派生外观 `Model_TengxianIja06.glb`（日兵甲）与 `Model_TengxianNra06.glb`（翻译官）同一骨架，只给钉死的说话人用，
也不计入五款采用外观。
弃用的 NRA01、NRA03、NRA04、IJA04、IJA05 实体模型已删除；旧模型仅能从 Git 历史取回。
现存第一人称双臂、第一人称身体及百姓使用各自的既有资产契约，不计入这五款士兵外观。

## 导出与绑定契约

- 五款身体及面部派生件的 53 根身体骨骼具有完全一致的名字、父子关系、绑定位置与绑定旋转。
  名字统一采用 `Bip001` 前缀与现有解剖部位后缀，地面控制骨为 `GroundRoot`。
- 比例与参考 T 姿取自用户已采用的 NRA02。两条大腿接在 Pelvis 下，锁骨接在 Spine2 下；
  不再依靠移动关节位置来抵消旧 Biped 的大腿挂脊柱、锁骨挂颈部关系。
- glTF 单位为米，Y 向上，资产正面 +Z。角色与骨架容器位置为零、旋转为单位四元数、缩放为一。
  Actor 继续使用项目约定的 -Z 朝向，由现有桥接层转 180°；Blender 源工程用米制、Z 向上。
- 身体骨骼缩放为一；除根骨和骨盆运动外，动作保持绑定肢体长度。允许 Actor 为人物身高做整体等比缩放。
  服装、脸型、贴图、拓扑、原蒙皮权重保留；身体比例通过共同参考骨架重绑定。
- 武器、背刀、头部挂点随米制骨架换算；动画库、剧情逐骨采样和面部控制位置必须使用对应版本。
  重定向后重新检查贴地、支撑脚、握枪、关节长度和动作交接。

这里采用的是成熟角色管线的共同参考骨架与导出约定。“3A”没有一套强制适用所有引擎的骨骼命名。
相同名字和层级是共享动作的基础；参考姿态、轴向、比例与接触点也必须校准。
参见 [Epic 的 Skeleton 文档](https://dev.epicgames.com/documentation/unreal-engine/skeletons-in-unreal-engine)。

## 重建入口

当前权威重建脚本是 `_import/Script_StandardizeCharacters.py`。它从固定 Git 提交
`b3ba06096ae9929a44220b07cdedf86dbba8b197` 读取原始 GLB 与动作数据，避免对产物重复应用归一化。
第二源 `STORYBOARD_REVISION = b39cd831066e1e2527389edd504048b4b5120ac6`（分镜轮合并 Codex 前的集成头）
只提供 `DERIVED`（IJA06、NRA06）与 `FACIAL`（六个 13 骨面部件）以及清单里的派生行与 `facialCast`；
五款采用身体在两个提交里逐字节相同。
旧 MAX/FBX 导入脚本仅保留来源流程，不能直接用旧导出物替换当前游戏资产。

在本任务的独占 worktree 中执行：

```powershell
node scripts/Script_BlenderMcp.mjs start --task CharacterStandardization
$bakerPath = (Resolve-Path Taierzhuang1938/_import/Script_StandardizeCharacters.py).Path.Replace('\', '/')
node scripts/Script_BlenderMcp.mjs exec --code "p=r'$bakerPath'; exec(compile(open(p,encoding='utf-8').read(),p,'exec'),{'__file__':p,'__name__':'__main__'})"
node scripts/Script_BlenderMcp.mjs stop
node scripts/Script_BlenderMcp.mjs status --scan
```

脚本生成身体、派生外观、面部派生件、已采用步兵库、死亡库、背枪跑和机枪俘虏剧情采样；同时重算姿态审计与
步态速度。开场动作库不在这里重定向，见下文「开场动作库的作者流程」。动作内容与播放时长沿用既有版本。本轮只做骨架适配、定长求解、接触校正和既有卧姿校正离线化。
压缩后删除未使用的二进制区块，不复制原始贴图到动画库。

可编辑源工程：
`C:\Users\Bentl\OneDrive\AI\Models\Blender\Tengxian\SharedCharacters\Model_TengxianSharedCharacters.blend`
（第一次规范化，五款 + 11 骨 NRA05 面部）；分镜轮重跑另存为同目录
`Model_TengxianSharedCharactersStoryboard.blend`（13 个骨架：五款、两款派生、六个面部件），不覆盖前者。
每款模型在独立 Collection 中、同一原点；默认只显示 NRA02。源工程与备份不进仓库。

静态门禁由 `Script_CharacterModelTest.mjs` 检查五款清单、弃用文件不存在、共同绑定、动作、朝向和贴地；
`Script_CharacterSpeechTest.mjs` 比较面部派生件的身体曲线、表面与贴图实际数据。
实机接触与切换仍由 ActorPose、InfantryAnimation、DeathCollapse、OpeningStoryboards、近战及 GPU 门禁验收。
截图和验收页只保存在本地忽略目录，不能把重建成功等同于通过这些验收。

## 分镜轮追加（2026-09-26，01–06 重构与 01–03 分镜的人物迁到本骨架）

- 重跑结果：五款身体、步兵库、死亡库、背枪跑 GLB、机枪俘虏库、`Data_TengxianHumanoid.json`、
  `_blender/Data_TengxianShoulderReference.json` 与第一次规范化的产物逐字节相同；`Data_BackRifleRun.json`
  只差 JSON 数字写法（`0` / `0.0`），数值相同，保留已提交版本。新增或改变的只有：两款派生外观、六个面部件、
  清单（派生行、`facialCast`、`facialVersion` = 面部件 sha256 前 16 位）和 `Data_ActorLocomotion.mjs` 里
  两款派生外观的步态条目（`Script_LocomotionProfileBake.mjs` 按清单全量生成）。
- 面部件：13 根 `Face_` 骨挂在 Head（下唇挂 Jaw），相对父骨的变换原样继承；`facialRig.poses` 的平移从
  头部局部厘米换成米（× 0.01），旋转、眼球轴向不变。面部件不带贴图与动作（`materialsFrom` / `animationsFrom`
  = `base`），`Script_CharacterSpeechTest` 以米读姿势后换回原先复核过的厘米门槛比较。
- 派生外观的清单行去掉了 `scaleHeight` 与 `version`：所有身体共用 NRA02 参考高度（`bounds`）。

### 开场动作库的作者流程

`Animation/OpeningStoryboards/` 不再由本脚本重定向。V5 开场库靠 IK 解手、搭档、墙面接触，重定向只保留旋转，
接触会漂（IJA 的肩比原 IJA02 靠后约 5 cm、高 3.6 cm，上臂短 3.8 cm、前臂长 1.4 cm）。所以改为：
`_import/Script_OpeningStoryboardBake.py` 直接在本骨架的五具身体上重新作者化（partner → bake → manifest 三步，
私有目录 `OneDrive/AI/Models/Blender/Taierzhuang1938/OpeningStoryboards_20260926HumanoidV1`）。

- 片段库里的数都写在「旧 Lugou 骨架的源米」里。导入器（`Script_MachineGunCaptivesBake.AuthoringRig`）把新身体按
  `f = 现在的运行时缩放 / 旧运行时缩放` 整体缩放成一份作者用副本（`tmp/AuthoringRigs`，不提交），`AUTHORING_SCALE`
  记旧缩放（0925 验证报告的 scale）。于是所有作者数在运行时的意义不变；写出的骨骼值、道具轨、接触点偏移、
  挂载点与 `endLift` 除以 f 回到发货 GLB 的节点单位（读已提交文件时乘回）。
- 新比例下 11 条 clip 超出烘焙门槛，另有 6 个成对舞台互相穿插、1 处单帧突跳（`Script_OpeningClipsBrowserTest`，
  基线 `b39cd831` 为 0 FAIL）。逐条修在作者端（`Script_OpeningStoryboardClips.py`，其余 clip 的烘焙参数与 V5 相同，
  烘焙默认值仍是 Lugou 的 0.92 / 0.10 / 0.25）：
  - `REACH_BY_CLIP`（烘焙 `Solve` 的够取辅助，`sides` 只放宽抓握那只手）：抓头发链 HairGrab / Draw / ThroatSlash
    左手 0.86；拖领 DragCollarFromDirt 右手 0.86；CollarDragSnag 左手 0.86 + 骨盆 0.13 m + 前倾 +0.40；
    KickBeam 左手 0.86 + 0.17 m + 0.40；WipeSheathBayonet 按时间：起止同上下游、只在 3.75 s 擦刀时放宽；
    ParriedChoppedFall 左手 0.80（直臂时前臂单帧转 77°）。
  - 锁骨前伸 `protract.<side>`（新增的姿势参数，绕竖轴，约 6 cm）：抓头发的左肩、拖领的右肩 0.65 rad。只加大前倾会让
    日兵甲的脸撞进战友的脸（slashDraw 头对头 10 cm）。
  - `IjaPullArm` 起始离手臂 0.72 → 0.80 m（新骨架大腿更长，两名日兵大腿互插 8.7 cm）；`THROAT_R/L` 捂喉的手向他左移
    2 / 1.5 cm；`CHOP_END` 靠墙倒地离墙多 2 cm；`STARTLE_DUCK` 0.07 → 0.09；`AimHead` 先减去接地抬升再瞄（罗班长跪姿
    看顺子）；第一人称 `EXTRA_HAND_POSES.gripArm.atLeft` 0.65 → 0.75。
  - 写出的骨骼顺序对齐机枪俘虏库（运行时把俘虏库 clip 拷进开场库，要求顺序一致）。
  - `Script_OpeningClipsBrowserTest` 的骨长检查跳过骨盆：新骨架里骨盆直接挂 GroundRoot，二者的距离就是根运动
    （Lugou 骨架上骨盆绑在 GroundRoot 原点，被 1 cm 过滤掉了），不是骨段长度。
- 机枪俘虏库仍是第一次规范化的重定向产物；它的烘焙脚本已改到新模型名与作者副本，重烘会得到作者化版本。

## 2026-09-26 验证与边界

- BlenderMCP 源工程实查：五具身体各 53 根骨，身体绑定矩阵最大差为 0；面部派生件 64 根，
  共同身体部分仅有导入浮点误差（约 1.3e-6）。容器变换均为零位置、零旋转、单位缩放。
- 身体、面部派生、步态、死亡、背枪跑、开场表演、口型、36 条俘虏剧情动作与接触、
  运动矢量、角色深度/合批/人群、部署版启动、车上道具速度门禁已通过。
  步兵五款模型的 25 个动作绑定、过渡与道具检查通过，最大支撑脚滑动约 1.1 mm。
- 新增面部对白编辑器回归通过；人物编辑器定向复查了五款外观、军官复用、默认/替换枪械与真实蒙皮。
  换人预热在独占图形复测中通过：三次落地帧约 21 / 17 / 17 ms，所有模型和武器组合不新增人物着色器。
- 原 NRA05 字节实测：`AdvanceFire` 最低蒙皮点约 -0.068 m，`LeanWallSitPeek` 约 -0.070 m；
  规范后分别约 -0.0006 m / +0.003 m。共同骨架与真实贴地使骨盆高度上移，因此站/坐高度带重校并收窄，
  同时增加真实蒙皮接地、51 根非根/骨盆身体骨段定长和单位缩放的逐帧断言；`CutscenePoseTest` 已通过，
  站/坐实皮离地约 2.6 mm，最大骨段误差约 6e-9 m。
  俘虏踢击沿原方向退约 4.2 cm，接触深度约 1 cm；推搡右前臂后倾 1.4° 保持刺刀避让。
- 全项目检查并非全绿：修改前提交 `b3ba0609` 的独立检出也复现了 `MeleeAnimationTest`
  第一人称握点误差 0.02236 m、`TrenchPlanTest` 缺失布设项、`FirstLevelSpaceTest` 路线碰撞、
  `FirstLevelP012FlowTest` 与 `FirstLevelMissionPresentationTest` 的 `BlastFeedback` 测试桩缺失，
  以及 `BootTest` 日军远景材质标记缺失。本轮 Boot 门禁另达到 240 s 超时；不将这些报告为通过。
  全套 EditorTest 在音效配方说明缺失后继续到旧 Timeline 段时未完成，已停止；本轮只以人物与面部编辑器
  的定向回归作为已通过证据，不宣称整套编辑器全绿。截图、完整日志与比较检出不提交仓库。
