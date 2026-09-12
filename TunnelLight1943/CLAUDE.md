# TunnelLight1943 项目入口

《地道里的光》2.5D 舞台叙事游戏。协作与交付遵循 [根 AGENTS.md](../AGENTS.md)；下表按本次目标选读，无需为单点修改通读全部分册。

## 共同契约与当前状态

- 当前游戏位于本目录第一层。`ChapterOneImagegen/` 是冻结快照，普通维护排除它；历史原因见 `Data_DesignHistory.md`。
- 玩法、镜头、动作和美术保持已确认的冀中平原舞台方向。具体输入、空间、叙事及历史边界在对应分册，不凭旧方案恢复已下线内容。
- 场景位置取 `Data_Scenes.json`，类型画法取 `Data_PropArt.json`，深度与尺度常量取 `Data_DepthSpec.mjs`；数据和消费方同步更新。
- 玩家可见章节由 `PLAYABLE_CHAPTERS` 决定，目前为前两章；c3 起仍是旧线，尚未接上新一二章。three.js 使用本地 `vendor/three/`。
- 新台词没有 `Voice_Manifest` 记录时静默出字幕；本次包含配音交付时按音频流程补齐。旧视频序章、旧卡和已下线机制的保留数据不顺手删除或启用。
- 页面变化完成实际渲染／交互验收再交付；纯说明整理只检查内容、引用、命令与 diff。缓存、Git 和部署使用根流程。

## 按任务查阅

| 涉及内容 | 分册 |
| --- | --- |
| 台词、节拍、旗标、旁白、字卡、声音编排、历史叙事 | [Script.md](docs/Script.md)；c1 梗概见 `Data_StoryC1.md` |
| 地形、摆位、深度带、路径遮挡 | [Depth.md](docs/Depth.md) |
| 画笔、人物、材质、建筑、昼夜 | [Art.md](docs/Art.md) |
| 骨架、姿势、步态、爬梯与接触戏 | [Rig.md](docs/Rig.md) |
| 机位、运镜、分级、黑屏与插卡 | [Camera.md](docs/Camera.md) |
| 交互动词、提示、掩体、潜行、翻越 | [Interaction.md](docs/Interaction.md) |
| 菜单、存档、HUD、拇指控件与阅读层 | [Ui.md](docs/Ui.md) |
| 状态取证、截图或 CLI 修改 | [Cli.md](docs/Cli.md) |
| 选测、测试环境与完成条件 | [验证索引](docs/Data_Verification.md) |

旧源码注释中的“CLAUDE.md 拟物交互第 N 条”“过场三件套”等，按上表查对应分册的同名章节；原编号保留。新增规则更新对应分册，入口只补必要路由。

## 剧本与 Notion 同步

修改台词以当前代码和本次已确认稿源为准。任务明确包含 Notion 同步，或已有授权明确覆盖本次目标页面时，再执行外部回写；普通代码修复不自动扩展为外部文档修改。同步时先核对目标页面与最新内容，整理本次台词差异、更新指定范围并回读核验。

仓库没有通用的 `scratchpad/extract-script` 工具，不将其他会话的 memory 当作前置依赖。需要纯文本台词可从相应 `Data_ScriptC*.mjs` 与 CLI `beat` 输出提取并核对；`Script_VoiceExtract.mjs` 用于配音清单，不能冒充完整剧本同步器。已授权的同步遇到账号或目标缺失时，先完成本地修改与验证，保留待同步差异并明确报告未完成项。
