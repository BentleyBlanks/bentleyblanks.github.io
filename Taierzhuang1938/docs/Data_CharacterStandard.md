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

洞口行刑的后续修订将这组冻结名称的“抓头发”动作改为抓前领，另设侧前方站位并重新烘焙；当前接触对象和镜头验收见 [开场动作库 §8](Data_OpeningClipLibrary20260923.md)。
    （Lugou 骨架上骨盆绑在 GroundRoot 原点，被 1 cm 过滤掉了），不是骨段长度。
- 机枪俘虏库仍是第一次规范化的重定向产物；它的烘焙脚本已改到新模型名与作者副本，重烘会得到作者化版本。

## 就地改写身体 GLB 之后

`_import/Script_FixMocapFootRoll.mjs` 这类脚本就地改 `Model_Tengxian*.glb` 里的动作数据：骨架、蒙皮、网格一个字节
不动，但文件的 sha256 变了。下面这些文件记着身体的 sha256（门禁用它确认「烘焙用的身体就是发货的身体」），要跟着重记，
否则对应门禁报「原模型被改」（2026-09-27 脚掌翻正后就红了 SpeakerGesture、MachineGunCaptives、BackRifleRun、
ActorLocomotion 四个门禁）：

| 文件 | 记的身体 | 重记方法 |
| --- | --- | --- |
| `Animation/OpeningStoryboards/*.json` | 五款 | `_import/Script_OpeningStoryboardBake.py`（bake → manifest） |
| `Animation/SpeakerGestures/*.json` | NRA02、NRA05 | `_import/Script_SpeakerGestureBake.py`：两具身体各 bake 一次，再跑 `GESTURE_PASS=manifest` |
| `Animation/MachineGunCaptives/*.json`、`Animation/BackRifleRun/Data_BackRifleRun.json` | 五款 / NRA02 | `Script_StandardizeCharacters.py` 的 `STANDARDIZE_PASS=libraries`（`RebakeBodyHashRecords`：重跑 `Main` 里背枪跑与俘虏库那两步，以发货身体为目标，不用场景） |
| `Data_ActorLocomotion.mjs` | 七款 | `node Taierzhuang1938/_import/Script_LocomotionProfileBake.mjs`（上一行那一遍末尾也会跑）；改完抬 `index.html` 里它的 `?v=` |

```powershell
$env:GESTURE_PROJECT = (Resolve-Path Taierzhuang1938).Path
foreach ($m in 'TengxianNra02', 'TengxianNra05') { $env:GESTURE_MODEL = $m; blender --background --factory-startup --python-exit-code 1 --python Taierzhuang1938/_import/Script_SpeakerGestureBake.py }
$env:GESTURE_PASS = 'manifest'; blender --background --factory-startup --python-exit-code 1 --python Taierzhuang1938/_import/Script_SpeakerGestureBake.py
$env:STANDARDIZE_PASS = 'libraries'; blender --background --factory-startup --python-exit-code 1 --python Taierzhuang1938/_import/Script_StandardizeCharacters.py
```

- 这些烘焙只读身体的绑定、蒙皮和网格，不读身体里的 clip，所以重记后动作数据应与原来逐字节相同，只有哈希变。
  2026-09-27 实测：说话手势、五个机枪俘虏文件、背枪跑 GLB、步态档案都逐字节复现（哈希除外）；
  `Data_BackRifleRun.json` 照旧只差 `0` / `0.0` 写法，保留已提交版本、只改哈希那一行。复现不出来说明烘焙脚本
  自己变了，查清再提交。
- 清单里的「文件字节 sha256」直接对检出的字节算。本机 Git 全局 `core.autocrlf=true`：带换行的文件检出后是 CRLF，
  Python 在 Windows 上 `write_text` 也写 CRLF，同一个哈希在 LF 检出和 CRLF 检出里只能对上一边。所以被哈希的
  动作文件一律单行、不带末尾换行（机枪俘虏库 2026-09-27 起去掉末尾换行；开场 IJA02 文件被补上的末尾换行也去掉了）。
  多行的清单本身不被哈希。

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

## 人物表面（2026-09-28，3A 迭代 B3）

目标照分镜 01/02/04A/05/05A/06：日军旧橄榄褐呢子、钢盔漆面磨损湿亮、下半身湿泥；国军布军装绑腿沾泥；
皮肤偏黄褐不粉、有毛孔与污渍；第一人称手脏、有褶皱积泥。只改「看起来」，不动几何、骨骼、动画与选模。

**入口**：`Script_CharacterSurface.mjs`（补丁与变体）→ `Script_UniformColors.ApplyNraUniform`（唯一的挂接点，
国军布军装换色补丁后面接泥污段，其它部件出各自变体；palette 为 null 的日军也走这里）。
数值全在 `Data_Tuning_Materials`：`CHARACTER_SURFACE_PARTS`（部件表）、`CHARACTER_GRIME`（泥污 / 磨损 / 落灰）、
`CHARACTER_SKIN`、`IJA_UNIFORM_COLORS`、`IJA_WOOL_DETAIL`。

- **部件按「模型 id × 材质名」查表**，不按材质名猜：日军材质全叫 `Material #NN`（同名在不同模型里是不同的东西），
  NRA05 的眼球叫「头部」、脸叫 `Material #26`，NRA02/06 的脸叫 `Material #9`——旧的名字分类把它们都漏了（没有皮肤散射）。
  `TagCharacterSurface(root, modelId)` 必须在 `ConfigureExternalPbr` **之前**调（人物、第一人称双臂、第一人称身体三处），
  `_UpgradeExternal` 优先读标签的 `cls`。第一人称双臂按有没有 `Material_HanYangSkin` 分 `FpsHanYang` / `FpsArms`。
- **泥污 / 磨损 / 落灰**是程序化的（零采样器）：读**蒙皮前**的 `position` / `normal`（Tengxian 共用骨架的绑定姿势是米制、
  脚底 0、膝 (±0.10, 0.53)、肘 (±0.42, 1.45)、正面 +Z），不改顶点，蒙皮运动矢量不变。泥线以下湿泥 / 干壳按噪声成片，
  线以上溅点；膝正面磨白 + 一块软边泥，肘磨白，袖口往里蹭脏，朝上的面落灰。挂在骨头上的非蒙皮小件（IJA03 的
  `Material #55.001`）高度那一路整个抬走。远景人群 / 尸体层烘的是摆好姿势的几何：卧倒、跪姿的人在那两层里整身沾泥，接受。
- **日军呢子**：按色相 / 饱和 / 明度在 atlas 上分出呢子、皮革（子弹盒、皮带、军靴）与九〇式钢盔（atlas 上一块俯视投影的圆盘，
  圆盘外缘 = 帽檐；IJA06 那块是九八式略帽的布面，不算钢盔）。呢子换成去饱和橄榄褐（亮度起伏留 atlas 的）+ Lovart 呢子细节包；
  钢盔换橄榄漆、帽檐一圈与崩口露钢（金属度）、雨水湿斑低粗糙度，五角星（饱和黄）留原色。绒光弱于棉布、颜色贴布色。
  目标色比分镜看到的暖一档、饱和一档：阴天偏蓝的天光与绒光会把它往灰绿推（第一版 `0x6c6649` 渲出来像国军灰绿）。
- **皮肤**：色相拉向黄褐、去一点饱和、压暗；Lovart 皮肤微距烘的细节包（毛孔法线 / 凹处明暗 / 皮脂粗糙度，6 cm 一格，
  0.4–2.8 m 淡出）；atlas 比它自己的模糊 mip 暗的地方积泥（指缝、指甲缝、关节纹）；大块污渍；脸上汗湿低粗糙度。
  日军 GLB 的 `specularFactor` 是 0（完全没有高光，塑料面具感的来源之一），变体统一给 0.7。汉阳造腕环（160 个三角，
  UV 横跨手背、脚掌与底色）贴不了图，改成与前臂同色的无贴图皮肤。
- **采样器**：皮肤变体摘掉 GLB 的 `specularIntensityMap`——three 只读它的 **alpha**，人物的 spec 图全是 RGB WebP（alpha 恒 1），
  逐像素无差（`Script_CharacterSurfaceTest` 逐张查），腾出的槽给皮肤细节包，皮肤仍 ≤ 16；顺带省下显存（每份 GLB 一张 2048² 的
  `John_Sp` 不再上传）。呢子 14。远景合批（BatchedMesh）比蒙皮多一个采样器，皮肤与国军军装的合批变体不采细节包
  （片元里用 `CHAR_BATCHED` / `NRA_CLOTH_BATCHED`，three 的 `USE_BATCHING` 只进顶点着色器）——这顺手修掉了 2026-09-28
  人群合批上线后 `SamplerBudgetTest` 的两条 17。
- **Program**：日军按部件拆开、腕环与 NRA05/NRA02 的脸改成皮肤，第一关 ultra|gi=1 程序 219 → 234（+15，全在进关人物预热
  `WarmActorShaders` 里编掉，换人不现编）；国军军装只是在键尾多一段常数 `charGrime1`，不多程序。

**贴图**（烘焙 `_import/Script_BakeCharacterDetail.py`，源图不入库、落 `_shots/Gap3A_Source/B3/`；清单 `Data_TextureManifest`）：

| 文件 | 尺寸 | 通道 | 来源 |
|---|---|---|---|
| `Texture/Texture_CharacterSkinDetail.webp` | 256²（6 cm 一格 = 0.23 mm/纹素，比第一人称手上一个屏幕像素还细；毛孔噪声不好压，512² 要四倍字节） | RG 毛孔法线、B 凹处明暗、A 皮脂 | Lovart thread `1e919f94-dd3c-4960-ac27-65fb9b9cea34`，提示词 `_import/Prompts/Texture_CharacterSkin.txt` |
| `Texture/Texture_IjaUniformWoolDetail.webp` | 512² | RG 斜纹法线、B 斜纹明暗、A 污渍 | Lovart thread `6d31d311-6887-426c-b194-ea67ec861b42`（布纹）+ 国军布细节的污渍源图，提示词 `_import/Prompts/Texture_IjaUniformWool.txt` |

两张都是 `lazy`：第一个人物造出来时才下（先挂中性 1×1，到了原地换，不重编译），URL 带 `?v=`。

**门禁**：`Script_CharacterSurfaceTest`（纯 Node：部件表对得上 GLB 材质名、spec 图无 alpha、细节包规格、打标先于 PBR 接入）、
`Script_SamplerBudgetTest`、`Script_CharacterModelTest`、`Script_MaterialUpgradeTest`、`Script_MotionVectorContractTest`、
`Script_RespawnShaderWarmTest`。对照出图 `Script_CharacterSurfaceShots.mjs`（六款外观全身、头肩、膝下、第一人称手；
`--root=` 指向改前的检出拍基线）。
