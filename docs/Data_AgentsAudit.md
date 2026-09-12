# AGENTS.md 脚手架审查 · 2026-09-05

审查基线：`f4a8c62a1ef6aeb1274cf33ddbf0c83018be9258`。范围为仓库根入口及原有 10 份子项目 AGENTS.md；深入整理根入口、Taierzhuang1938、TunnelBell1942、TunnelFront1942，并对 GravityTank、PrairieFire1937、EnemyRearCommand 的冲突流程做定点修正。

## 结论

确有不适合 Astra 这类能力较强模型的脚手架。主要问题是把历史排障方案、一次性角色分工和整份设计书变成永久执行指令，导致冲突、过早停下、反复验证和上下文占用。独占工作区、共享状态契约、密钥边界、部署验收则有明确的工程价值，应保留。

OpenAI 的 [Astra 指南](https://developers.openai.com/api/docs/guides/latest-model#prompting-best-practices) 明确提醒：模型对 AGENTS.md/skills 的指令更敏感，冲突可能导致提前停下，小任务也可能验证过度。这支持清理指令并明确任务范围；不意味着模型能力足以替代隔离、测试或权限边界。

## 发现与处理

| 影响 | 原规则及位置（基线版本） | 问题 | 本次处理 |
| --- | --- | --- | --- |
| 高 | 根 Git 流程：禁止主检出 reset，同时要求误提交后 `reset --soft HEAD~1` | 并发环境的 HEAD 可能已被他人推进，机械恢复可能摘除错误提交 | 保留不改共享分支；先保全自己的提交与状态，不自动回退共享 HEAD |
| 高 | 根文件固定主检出绝对路径 | 本机当前检出已不在该历史 Program 路径 | 用 Git 查询实际路径与归属，同步前检查分支与工作区 |
| 高 | 三份超长子入口加根入口 | 自动装载指令可能截断，关键验收规则落在末尾 | 短 AGENTS 入口保留核心约束，完整设计/API/路由移入按需参考 |
| 高 | TunnelBell 开头“只许读它”、第 1 节永久文件归属、第 8 节集成文件“别改” | 妨碍跨模块追因和必要修复，把历史并行分工当成永久权限 | 按当前任务分工协作，允许同步改动契约、集成与消费方；依赖与状态写入约束保留 |
| 中 | 生图必须启动固定 Sol + low CLI，并认定 Terra 长期满载 | 容量现象没有永久有效性；当前宿主已有内置工具时仍多绕一层 | 内置工具优先，必要时才用 CLI；不固定通用执行模型，供应商顺序与成本边界保留 |
| 中 | 根 GravityTank 段要求开 PR 再合并，根 Git 段要求直接快进推送 | 同一交付被规定两条流程 | 统一根流程，PR 按评审/分支保护需要使用；cache-bust 明确在提交前完成 |
| 中 | 每次任务一律新 worktree，已有独占环境与续做也不例外 | 隔离目标已满足时重复建树，无助于正确性 | 新独立任务仍新建；同任务续做及宿主分配的独占 worktree 可继续使用 |
| 中 | Taierzhuang 禁止任何新浏览器探针、截图只能来自固定入口 | 已有测试不覆盖问题时限制取证 | 优先复用并允许扩展；Windows 假指针锁、浏览器释放和并发槽要求保留 |
| 中 | TunnelFront 每轮盲测且不读源码，固定旧 Claude 会话分支 | 将专项体验评审扩大为所有开发任务，且与新分支要求冲突 | 盲测限定体验阶段，诊断可读源码；使用当前任务分支 |
| 中 | PrairieFire 所有变化均要求完整验证电池 | 纯说明文字变更也可能触发昂贵浏览器回归 | 按运行时、交互/渲染、基础设施与纯文档影响选测；地基改动仍全量回归 |
| 中 | 根文件复制多个子项目规则 | 范围不清且容易漂移：根称 TunnelBell 为正交相机，子指南已为长焦透视 | 项目规则归子入口，保留单一口径；Taihang 母页与各子页分别标明作用范围 |
| 低 | 新类别前缀先“议定”，提交格式多次复述 | 常规命名可能无谓询问，重复规则挤占上下文 | 沿用类别，必要时记录清楚的新前缀；提交格式集中一处 |
| 低 | “npm 在 worktree 总会转主检出”、HTTP 200 即上线、stderr 恒是噪音 | 将局部现象写成普遍事实，误判验收结果 | 检查实际 package.json/服务根；核对部署与线上版本；综合错误与有效产物判断 |

## 结构变化

字节数按 UTF-8、LF 统一计算，仅统计自动入口；完整参考资料仍在仓库。

| 入口 | 原字节数 | 新字节数 |
| --- | ---: | ---: |
| 根 AGENTS.md | 24,614 | 9,024 |
| Taierzhuang1938/AGENTS.md | 41,378 | 5,085 |
| TunnelBell1942/AGENTS.md | 42,068 | 2,514 |
| TunnelFront1942/AGENTS.md | 67,401 | 2,948 |

Codex 官方默认 `project_doc_max_bytes` 为合计 32 KiB。以上三份原子入口各自已超过该默认值；从子目录启动还可能叠加根规则。该结论指默认装载风险，未断言当前宿主必然使用此上限。[指令发现说明](https://learn.chatgpt.com/docs/agent-configuration/agents-md)

迁移位置：

- [Taierzhuang1938 系统参考](../Taierzhuang1938/docs/Data_AgentReference.md)：路由、分册导读、出图/性能入口、界河高度图契约。
- [TunnelBell1942 模块参考](../TunnelBell1942/Data_ModuleReference.md)：完整设计、数据格式、API 与验收，保留原章节编号。
- [TunnelFront1942 设计参考](../TunnelFront1942/Data_DesignReference.md)：完整规则、状态/动作/HUD 协议及审查判据，保留原章节编号。
- [TaihangDemo 入口](../TaihangDemo/AGENTS.md)：母页规则与三个独立子页入口；原子页规则逐段迁移。
- [BehindTheLines 入口](../BehindTheLines/AGENTS.md)：公开文档结构与受限资产边界。
- [生成工具操作参考](Data_AssetGeneration.md)：CLI 用法与按需排障，不自动附加到所有任务。

## 保留的约束

独占 worktree、共享主检出保护、禁止强推、已授权小任务交付 master；本地页面验收、缓存更新与上线证据；Volcengine、连续对白、密钥保密和图片供应商回退顺序；命名和提交归属；核心玩法、代价账本、存档隔离、确定性、坐标/状态/模块契约、性能预算与有针对性的验收。

没有因本次整理改动游戏运行时代码、玩法数值或测试断言。已有简短入口及其他项目特有的产品限制保留。此次是静态指令与结构审查，未做模型效果 A/B 实验，不能据此量化完成率或速度提升。

## 验证记录

- 检查变更只包含 Markdown，`git diff --check` 无空白错误。
- 校验修改/新增入口与参考文档的本地 Markdown 链接、明确列出的脚本路径。
- 对照基线逐段确认 TaihangDemo 三个子页与 BehindTheLines 规则完整迁移；对照两份地道战参考及滕县路由，检查设计/API/验收内容保留。
- 统计全仓入口路径的累计字节数，检查本仓库根到子目录的指令链低于官方默认 32 KiB（不含机器级个人指令与宿主额外注入）。
- 纯文档整理使用结构、内容与差异验证，不启动游戏或浏览器回归。

## 2026-09-07 增量审查：台儿庄与技能边界

本轮基线 `675343992e6b246c254318a328b3100ffbfb644a`。用户先要求只读建议，随后确认其他项目按建议修改并重点审查台儿庄。仅修改指令与参考文档。依据仍为 [Astra 提示指南](https://developers.openai.com/api/docs/guides/latest-model?model=gpt-6-astra#prompting-best-practices)；结论来自当前文件、入口接线与测试登记的静态核对，未做模型效果 A/B 实验。

- 根入口补明确的审查/授权边界、技能造成阻塞时的来源说明、中途追加要求与简洁结果表达；GitHub Pages 与 Sites 的适用范围分开，Codex CLI 内置生图与 Python 图片 API 回退分开。根 CLAUDE.md 改为薄入口，移除旧主检出路径及重复流程。
- 台儿庄统一新版 `FirstLevelMission` / `?whitebox=p012` 与旧 `p012-archive` 的文档和验收路由。旧七章 Notion 摘录、P012 动画任务分工及代码考古不再自称当前任务的唯一依据。地标分工限定本次协作；源码诊断与定向探针允许使用。
- 台儿庄测试分级移除过期总数和旧通关口径，补第一关领域与按任务追加的严格音频门禁。生成脚本/源工程被自动选测忽略，不代表无需验证产物。修正 npm 路径与依赖解析的过度概括，移除安装后无差别还原 package.json 的操作建议。
- PrairieFire 发布统一到根流程；历史评分、事故、机制和地形详情移入 `Data_AgentReference.md`，玩法与性能防线仍保留入口或对应参考。可选素材说明统一供应商与授权口径，不改变默认加载行为。TunnelLight 的 CLI 分册同步清理探针禁令与依赖还原命令；TunnelLight、MountainEmber、ReedSignal、EnemyRearCommand 按实际影响选测，GravityTank 快速清单补齐本地验收。
- 保留台儿庄坐标、共享高度场、战斗、存档、数据驱动、缓存、Windows 假指针锁、浏览器释放及测试并发保护；保留视频转骨骼的专用源工程路径。未修改游戏代码、测试断言、资产或模型配置。仓库未有自有 SKILL.md；本轮不新增技能，也不修改插件缓存。MountainEmber 的 Blender 输出路径需联动导出脚本，留待单独处理。

验证：核对修改文档的本地链接、可执行命令和参数；检查迁移章节完整性与关键契约保留；运行全仓与台儿庄选测 dry-run，核对纯 Markdown 差异；`git diff --check`。本轮没有页面行为变化，不运行游戏或浏览器回归。


## 2026-09-12 按官方文章继续整理

依据 [Rethinking skills and prompts for GPT-6 Astra](https://developers.openai.com/blog/rethinking-skills-and-prompts-for-gpt-6-astra)，从 `0e863e2c2` 检查 22 份 AGENTS.md／CLAUDE.md；用户确认后实施六项调整。仓库内没有 SKILL.md，此次未修改个人技能或插件缓存。

- 根批量生成边界改为明确范围／数量授权，已授权批次可继续、扩量再确认；同步第一人称资产说明里的同一条规则。独占 worktree、禁止强推、资产供应商、密钥与视觉验收要求保留。
- EarSpa3D 移除不存在的本地探针作为必经入口，38 个原有检查完整迁入按影响选用的 Data_Verification.md。当前装配地图替换旧模块地图；Data_Contract.md 保留共同契约并路由到 Data_SystemContracts.md；原 42 KB 契约完整保存为 Data_ContractHistory.md，明确原指令和人员归属的历史性质。新旧拖动、自动加载及羽毛容量说明按现行版本归一。打包工作流移至 Data_Packaging.md。未移动采耳原始工程；用户另行规整其源目录，确认结构后再更新具体源路径。
- SOPHIA 统一为构建、验证实际构建页面、再按根流程发布；移除依赖私有会话 memory 的流程依据。按影响选测，必要的跨层实现可在同一任务完成。
- MountainEmber 源工程保全备份并迁入 OneDrive；配置、builder 与验证说明同步更新，停止跟踪仓库中的 blend。原 >1 MB 源工程完整性断言迁到独立 Blender 验证器，增加实际重开、三环境、集合、内嵌图片和外部库检查；原 GLB 地形和锚点断言保留。源码、GLB 和贴图未重新生成。迁移记录见 [源工程说明](../MountainEmber1941/Data_BlenderSource.md)。
- TunnelLight 的专项规则逐条迁入对应分册，入口保留共同契约和路由；验证命令迁入 docs/Data_Verification.md。Notion 同步按本次已有授权范围执行，有实际目标、内容核对和回读验证；不再依赖不存在的 scratchpad 工具。修正 Script 分册的两处父目录引用。

按 UTF-8 内容计算（不计 Windows 换行转换）：EarSpa3D/AGENTS.md 12,050 → 2,435 字节；TunnelLight1943/CLAUDE.md 19,695 → 3,061 字节。现行契约与历史保全分开，减少普通任务的必读内容；未做模型任务 A/B 实验，不能据此声称速度或成功率提升。

验证包括修改文档的本地链接／锚点、命令文件存在性、全部原采耳测试名与 TunnelLight 专项条目的迁移保全、Python／JSON 语法、git diff 空白检查；Blender 5.1.2 实际读取迁移前后工程，对比 63 个对象的名称／类型／网格顶点数量，4 张贴图内嵌，原备份 SHA-256 一致；Script_VerifyBlenderSource.py 与 Script_ArtTerrainContractTest.mjs 通过。选测 dry-run 命中的台儿庄与 TunnelLight 仅为说明变化，未启动游戏回归。没有玩家页面或运行时资产变化，无需更新页面缓存戳。
