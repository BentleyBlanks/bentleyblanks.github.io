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

`Model_TengxianNra05Facial.glb` 是 NRA05 的面部派生件，身体沿用同一骨架，另有 11 根
`Face_` 控制骨。它不计作第六款人物外观。本轮没有给其他角色新增面部骨骼。
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
旧 MAX/FBX 导入脚本仅保留来源流程，不能直接用旧导出物替换当前游戏资产。

在本任务的独占 worktree 中执行：

```powershell
node scripts/Script_BlenderMcp.mjs start --task CharacterStandardization
$bakerPath = (Resolve-Path Taierzhuang1938/_import/Script_StandardizeCharacters.py).Path.Replace('\', '/')
node scripts/Script_BlenderMcp.mjs exec --code "p=r'$bakerPath'; exec(compile(open(p,encoding='utf-8').read(),p,'exec'),{'__file__':p,'__name__':'__main__'})"
node scripts/Script_BlenderMcp.mjs stop
node scripts/Script_BlenderMcp.mjs status --scan
```

脚本生成身体、面部派生件、已采用步兵库、死亡库、背枪跑和两套现用剧情采样；同时重算姿态审计与
步态速度。动作内容与播放时长沿用既有版本。本轮只做骨架适配、定长求解、接触校正和既有卧姿校正离线化。
压缩后删除未使用的二进制区块，不复制原始贴图到动画库。

可编辑源工程：
`C:\Users\Bentl\OneDrive\AI\Models\Blender\Tengxian\SharedCharacters\Model_TengxianSharedCharacters.blend`。
每款模型在独立 Collection 中、同一原点；默认只显示 NRA02。源工程与备份不进仓库。

静态门禁由 `Script_CharacterModelTest.mjs` 检查五款清单、弃用文件不存在、共同绑定、动作、朝向和贴地；
`Script_CharacterSpeechTest.mjs` 比较面部派生件的身体曲线、表面与贴图实际数据。
实机接触与切换仍由 ActorPose、InfantryAnimation、DeathCollapse、OpeningStoryboards、近战及 GPU 门禁验收。
截图和验收页只保存在本地忽略目录，不能把重建成功等同于通过这些验收。

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
