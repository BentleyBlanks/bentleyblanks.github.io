# Encounter Play

2026-11-15 用户确认：在 Encounter Designer 工具栏增加 Unity 式 Play；新增独立场景，保留旧场景；从当前关键帧或从头开始，暂不要求任意秒恢复。使用正式人物与通用动作、文字对白和已有正式 BGM；Play 默认单视口，只允许单／双视口。

## 场景与保存

- 新场景为 `Scenes/FirstLevelEncounter/Scene_FirstLevelEncounter.json`，自有高度图、壕沟基准、环境区域和环境预设。旧 `FirstLevelWhitebox`、`FirstLevel` 文件与原试玩入口保持独立。
- 初始布局来自现有白盒，遭遇设计额外掩体已成为场景物件，并有真实碰撞；坡道和凹口存于新场景的 `surface`。编辑预览与游戏共用 `SceneSurfaceSampler`，生成后的内容直接编辑，不在每次 Play 时转场景。
- 时间线、人物调度、对白与默认遭遇源在新场景目录的 `Data_LevelFlow*`；纯规则 `Script_LevelFlow*` 同目录共用。AdvancedTools 中的同名模块保留转发，旧入口与检查脚本继续有效。Play 参数、选曲、交互拍和清敌条件在 `Data_Play.mjs`。
- 浏览器草稿键为 `tengxian1938_encounter_FirstLevelEncounter_v1`。首次从旧 `tengxian1938_encounter_v2` 复制草稿，之后独立保存，不写旧键。
- `AdvancedTools/Script_EncounterSceneFork.mjs` 只记录初始化方式，目标存在就拒绝覆盖。

## 操作

工具栏 ▶ 旁选择「当前关键帧」或「从头开始」。当前时间落在一拍中间时，取这一拍的起点。■ 停止后恢复开玩前的时间、选择和编辑视口；运行中的位置、损伤、阵亡不写回草稿。

Play 默认单视口。双视口左侧操作顺子，右侧观察同一局游戏，可跟随顺子／班长／冬瓜／头车，或自由观察。O 切换玩家与观察输入；观察视口右键转向、WASD 移动、Q/E 升降、中键平移、滚轮前后移动。编辑模式仍保留原有三、四视口。

原时间线预演照常保留。Play 使用真实玩家、枪械、弹药、伤害和 AI。开局按关键帧的既有编排初始化人物存亡；开局后的战斗存亡以真实士兵为准，不使用预演 lifetime 让敌人自动死亡。区域触发读取实际玩家位置，增援名额等待真实存活人数释放。普通行进拍等玩家到达，交互拍用 F，明确清敌拍等待目标清除。镜头动画暂用通用人物表现与文字对白，不加载剧情录音。

## 关帝庙潜行

08F 至09J就位前禁止开火和投弹。09B 文财拉低身体的1.8秒内捕获操作，随后保留蹲姿并交还移动、转头和瞄准。侦测使用实际敌人位置、朝向与场景遮挡。作者摆定的位置仍经过物理净空检查，保留可通行支院中的人，不把他们吸附到室外导航主区。短暂露头可退回掩体消除怀疑，持续暴露1.25秒进入报警。开枪或投弹直接进入报警，2.5秒后显示后送通道被封锁。

失败按 R 原地恢复检查点，复用已加载的模型与渲染资源。进庙后回09A，西巷前段回08F，重新建立角色，清空在途投掷物、弹坑和报警，并恢复检查点记录的武器、弹药、生命与伤势。编辑器中的原时间、视口与草稿在停止时恢复。守卫的集结延迟和门前停步采用各自的路线等待数据。

`Script_VillageStealthPlay` 连接真实输入、物理位移与视线，纯规则仍在场景目录的 `Script_LevelFlowVillage`。专项门禁为 `Script_VillageStealthPlayTest` 与 `Script_VillageStealthPlayBrowserTest`。后者使用真实枪械、投弹与键盘重试，并从编辑器入口验证自动重开与停止恢复。

## 运行边界

- `Script_EncounterPlayPlan`：关键帧开局、触发、数量预算、阶段通过与运行状态；复制输入文档。
- `Script_EncounterPlay`：在游戏宿主已有时钟中下达命令、同步表现与文字、选择 BGM。通过 `Script_SandboxRanges` 登记，主循环不认识具体场景。
- `Script_EncounterPlayView`：同一 WebGLRenderer、两份 PostPipeline 历史与两个显示画布。每帧世界只模拟一次，声音只以玩家相机为听者。观察镜头不另建游戏。两视口人物剔除取并集。
- `AdvancedTools/Script_LevelFlowPlay`：冻结编辑快照、挂载本地游戏宿主、停止与恢复。停止销毁当前会话的音频和渲染资源。
- `Script_EncounterPlaySplit`：本地工具运行边界，发布构建替换为 Stub，避免把本地高级工具接回线上游戏包。

## 验收

- `node Taierzhuang1938/Script_EncounterPlayTest.mjs`：全部关键帧边界、实际到达、真实存亡与增援、交互、草稿不变、曲目与场景数据。
- `node Taierzhuang1938/Script_EncounterPlayBrowserTest.mjs`：两种开局、正式人物、真实开枪扣弹与阵亡记录、单／双视口、文字对白、停止恢复；截图 1280×720，音频静音。
- 复用 LevelFlow、场景、帧调度、士兵字段、模块图、开发工具隔离与 MotionVector 门禁。截图留 `tmp/EncounterPlay`，不提交。
