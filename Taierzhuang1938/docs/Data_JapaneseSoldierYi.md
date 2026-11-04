# 日兵乙 V2

本件承接五个 Tripo 部件的 V1 拼装，来源为用户的 `角色/Tripo/15_日兵乙`。
原始输入、参考正侧背图、`JapaneseSoldierYi_Merged_V1.glb/.fbx` 和 V1 Blender 工程均保留。
本轮只修改乙，普通日军继续保留日兵甲、日军士兵 A；有名字角色的映射沿用原表。

## 来源与版本

- V1 工程：`C:/Users/Bentl/OneDrive/AI/Models/Blender/Taierzhuang1938/YiPartsMerge_20261104/Yi_PartsMerge_V1.blend`。
  SHA-256 为 `d45c585658912648b5e805b379d056c711c4afc3c7297846ae274404c19aaff4`，重建脚本先核对。
- 新工程目录：同级 `YiPartsMerge_20261104V2`；静态工程 `Scene_JapaneseSoldierYi_V2.blend`，
  绑定工程 `Scene_JapaneseSoldierYi_V2_Bound.blend`。工程及自动备份不进仓库。
- 参考图：`15_日兵乙/Parts_V1_20261104/Character_JapaneseSoldierYi_TPose_{Front,Side,Back}_2K_3x4_V1.png`。
  正面地面行 1784、831 px/m；侧面地面行 1761、817 px/m；来源图自身尺度差异分别校准。
- 本地导出：模型原目录中的 `JapaneseSoldierYi_Merged_V2.glb/.fbx` 与
  `JapaneseSoldierYi_Merged_V2_Bones.glb/.fbx`。运行时仅登记 `Model/Character/Model_JapaneseSoldierYi.glb`。

## 修整

V1 护颈布的侧片与后片有实际透缝，补条没有接到帽圈，且被旧烘焙脚本重复镜像。
V2 移除 38 个重叠补条面，按帽壳每层截面建立一张连续内衬，向外壳内侧收 2 mm，
上沿藏入帽圈。内侧 376 个面从本帽后片实有布面重新投 UV，避免显眼的生成内衬花斑。
32 条定向射线覆盖两侧接缝的四个高度；它们只是静态封缝检查，不能替代动作实拍。

四指末端的截面排除大拇指后测得 V1 残余转角约 -2.606°；两手作对称校正，
最大顶点位移约 3.56 mm。头部顶点位移为零，帽子适配不压缩头部。
新增正侧面逐层截线复核后，仅局部收窄衣摆、略加衣摆厚度、两侧踝部各内收 1.5 cm，
并将偏长的帽檐前端回收最多 2.7 cm；骨架的膝踝位置同步拟合。
静态模型 44,468 三角面，头顶约 1.809 m、帽顶 1.8268 m。
仍沿用用户下载部件的脸型与贴图，不把 Tripo 外观等同于参考照片的逐细节复刻。

## 绑定与动作

本轮查询 Tripo API 余额为 0，未提交在线生成或绑骨任务。
`Script_BindJapaneseSoldierYi.py` 使用已上线日兵甲的 65 骨架作本地拟合与表面权重传递：
骨层级和初始轴向保留，关节按乙的肩、腕、胯、膝、踝及手指位置调整；
最多四项权重、逐点归一化，无未绑定顶点。源头和布帽的权重单独处理，
袖口/手腕及绑腿/靴口共用连续权重场。

随后沿用 `Script_BuildXBotRigCharacter.mjs`，统一到 X Bot 的节点顺序、骨名、层级和初始朝向。
骨头位置保留乙的身材；`hipsScale = 0.9418`，由现有 `ClipForCharacter` 去掉非 Hips 位移轨，
并按胯高换算 Hips 曲线。本轮没有修改共享动作原件或武器挂法。
旧 `Crawling` 在 X Bot 和甲上已存在入地，乙以自身蒙皮离线适配一份专用曲线：
保持骨长和原动作时长，按膝部衣料支撑高度调整骨盆，再修正小腿、靴底和手掌接触。
`Script_BakeJapaneseSoldierYiContacts.mjs` 生成 `Animation/JapaneseSoldierYi/`，
`clipOverrides` 使动作预览与白盒共用；其他人物仍播原件。
贴图保持 4K，按既有转换器转 WebP；游戏 GLB 约 8.5 MB，一网格、一材质、一套骨架。
两个消费方沿用项目的 `ManagedGLTFLoader`，兼容发布阶段的 GPU 贴图映射。

普通日军表追加 `ijaYi`，与 `ijaJia`、`ijaA` 共用既有按单位 id 固定抽样的机制。
动作预览入口：`Tool_MixamoAnimationPreview.html?who=ijaYi`。

## 重建与验收

从独占 worktree 根执行；Blender 及浏览器的重型审查应排队使用项目共享测试槽。

```powershell
node scripts/Script_BlenderMcp.mjs start --task JapaneseSoldierYiV2
node scripts/Script_BlenderMcp.mjs exec --file Taierzhuang1938/_import/Script_BuildJapaneseSoldierYi.py
node scripts/Script_BlenderMcp.mjs exec --file Taierzhuang1938/_import/Script_BindJapaneseSoldierYi.py
node scripts/Script_BlenderMcp.mjs stop
node scripts/Script_BlenderMcp.mjs status --scan
node Taierzhuang1938/_import/Script_BuildXBotRigCharacter.mjs "C:/Users/Bentl/OneDrive/Sync/饮河/FPS/角色/Tripo/15_日兵乙/JapaneseSoldierYi_Merged_V2_Bones.glb" --crown 1.8268 --out Model/Character/Model_JapaneseSoldierYi.glb
node Taierzhuang1938/_import/Script_BakeJapaneseSoldierYiContacts.mjs
node Taierzhuang1938/Script_TestRunner.mjs --only=XBotCharactersTest,JapaneseSoldierYiBrowserTest --fail-fast
```

本地验收图及逐帧报告位于忽略目录 `_shots/JapaneseSoldierYi`，不发布到仓库。
浏览器测试通过共用 runner 获取锁，使用静音浏览器、1280×720 视口，
覆盖端枪站、走、跑、冲刺、蹲、跪、趴、爬、射击、拉栓、投弹、倒地、坐、拿取、爬梯、挥手及观察。
还须查看实际护颈布、颈部和掌面特写，并在白盒中确认三款普通日军实际混用。

本轮本地实测：17 条代表性动作共 1,450 帧通过；复看了正侧背、两侧护颈布、
持枪掌面、颈肩、趴姿与爬行。清除了衣料上的 Head 权重，并平滑领口与肩部权重过渡，
避免转头时衣领被拉成尖片。白盒 05-1 实际生成甲 1、A 3、乙 3；等待动作与武器换挂稳定后，
乙的右手握点偏差 8 mm，左手与实际护木接触点偏差 3 mm（名义护木点允许沿枪身调整）。

运动矢量、采样器预算、骨架、模型、几何、发布打包、资料馆页面和完整白盒编辑器门禁通过。
标准 prepush 的既有失败仍保留：`OpeningSetTest` 引用远端也不存在的旧
`Model_HanYang.tzm.json`；`BootTest` 在七个旧关报告日军远景材质标记缺失，
该问题已记于 `Data_CharacterStandard` 的历史验证边界。本轮没有修改这些断言、旧关或远景材质，
不将全项目回归报告为全绿。

## 史料边界

日兵乙的脸型、军装布色与纹样、军帽帽檐和护颈布、绑腿及军靴细节按参考图设计，
标注为创作，不指认为 1938 年滕县某名士兵的原貌或统一制式。
绑定和动作适配属于游戏表现。已按项目规则同步 Notion 对照表、说明页及资料馆的创作条目；
本轮没有新增或升级史料认定。
