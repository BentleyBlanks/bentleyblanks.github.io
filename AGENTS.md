# Repository Guidelines

本文件约束全仓协作与交付；具体玩法、接口和验收入口在各项目的 AGENTS.md。目标是让 agent 自主完成任务，同时保护共享工作区、用户资产和已验证的产品契约。

## 判断与任务边界

- 当前用户要求优先于仓库中的历史工作约定；运行环境的工具与权限限制仍须遵守。发现冲突时按适用范围处理，并说明会影响结果的差异。
- 对已授权任务，常规实现、排障和可逆修复自行推进。只有缺失信息会改变目标、授权范围或导致不可恢复的损失时才询问；先完成不依赖答案的工作。
- 模块地图描述职责与依赖，不是永久的人员分工。只有本次实际约定的并行分工才限制编辑归属；需要跨模块修改时同步接口、消费方和验证。
- 先读相关项目入口，再按任务查源码、测试与分册。可扩大调查范围以查清因果；不要求通读无关设计书，也不禁止读取其他模块。
- 保留核心玩法、存档、坐标、性能及资产契约。需要改变契约时，在用户目标范围内同步实现、文档和相应验证，不为让测试变绿而削弱断言。
- 仓库不固定通用模型、推理强度、代理数量或每步操作顺序；按当前任务和可用工具选择。供应商、成本和运行时兼容性要求见下文。

## Git 与共享工作区

**所有编辑、提交和推送在本任务独占的 worktree 中进行。** 只读审查不必创建 worktree。

1. 用 `git rev-parse --show-toplevel`、`git worktree list --porcelain` 和 `git status --short` 确认实际路径及归属；不要假定主检出位于某个历史绝对路径。
2. 新的独立任务从最新 `origin/master` 创建新的分支与 worktree：`git fetch origin master` 后执行 `git worktree add -b <branch> <newPath> origin/master`。当前任务的续做可继续使用自己的 worktree；运行环境已为本任务创建且确认独占的 worktree 无需再套一层。
3. 手动创建的目录沿用 `bentleyblanks_<AgentName>_<Purpose>_<YYYYMMDD>`；分支为 `<agent-lowercase>/<purpose-kebab>-<YYYYMMDD>`。AgentName、Purpose 用 PascalCase；同日重名加目的后缀。不要占用其他任务的目录或分支。
4. 主检出由多个 agent 共用，不在其中 checkout、switch、reset、stash、提交或清理他人文件。误在主检出提交时先记录提交号和工作区状态，将自己的提交保全到独占 worktree；不要自动 `reset HEAD~1` 改写可能已被他人推进的共享分支。
5. 发布前 fetch；若 master 前进，在自己的 worktree rebase 并检查受影响部分。用 `git push origin HEAD:master` 快进交付，禁止 force push。推送被并发更新拒绝时重新 fetch/rebase，不覆盖他人提交。
6. 推送后仅在实际主检出仍处于 `master` 且工作区干净时执行 `git -C <mainPath> pull --ff-only origin master`。否则跳过同步，报告当前占用及本次交付位置。
7. 交付确认且没有未提交文件、未交付提交或本任务预览进程使用目录后，移除自己的 worktree，并删除已交付的本地任务分支。仍需本地审阅的结果保留路径，不强制提前清理。

## 验证与发布

- 模型验收网页、验收截图和演示视频只留本地，不提交到 github.io 仓库。游戏实际使用的资产与验收脚本按各项目规则交付；临时预览产物放入已忽略目录。

- 站点由 [.github/workflows/pages.yml](.github/workflows/pages.yml) 从 **master** 部署。通常直接快进推送；需要评审或分支保护要求时走 PR，无需同时做两套发布流程。
- 小型文案、平衡、功能修复在验证后自行交付 master；不要把已要求上线的结果留在未合并草稿。用户明确要求仅审查、保留本地或先评审时按该范围交付。
- **页面变化先本地验收，再推送。** 在本任务 worktree 运行 `node scripts/Script_LocalPreview.mjs`，默认 8080，实际端口以输出为准；`/__preview/` 顶部可核对服务根目录。无需 npm 安装即可启动预览。
- 直接调用脚本能明确选中检出；若使用 npm，先确认解析到本任务的 package.json。服务支持 `--help`、指定端口、worktree 挂载与 `--shortcut`；保持路径、缓存和 COOP/COEP 行为与 Pages 兼容。
- 运行与改动相关的现有检查；跨模块、共享基础设施和高风险变化扩大验证。纯指令或文档整理检查链接、命令和 diff，不因此启动所有游戏或浏览器回归；嵌入代码或运行时配置的变化按实际影响选测。
- 全仓选测入口：`node scripts/Script_TestChangedProjects.mjs --changed=origin/master --dry-run` 查看计划，再按影响范围执行。该脚本按路径选项目，文档路径也可能命中；没有命中不代表无需验证。
- 脚本、样式或资产变化按项目要求更新 cache-bust，**在提交与推送前完成**。测试通过后，只有新变化、失败或未解疑点才扩大或重复测试。
- 页面上线要核对对应部署提交及线上内容或版本戳；HTTP 200 只证明可访问。部署仍在排队时区分“已推送”和“已上线”。纯仓库说明变化核对远端提交即可。
- 最终说明改了什么、验证结果及尚未完成的事项；有可见页面变化时给出地址。

## 命名与提交

- 自有脚本、源码和资产使用英文名；文件词干、函数名和资产描述段用 PascalCase，变量和参数用 lowerCamelCase。文件名需要分隔时用下划线；扩展名小写。
- 资产形如 `<Category>_<DescriptivePascalCase>.<ext>`。沿用 `Model_`、`Texture_`、`Icon_`、`AudioBgm_`、`AudioSfx_`、`Scene_`、`Script_`、`Shader_`、`Material_`、`Animation_`、`Font_`、`Data_` 及项目已有类别。确需新类别时选择清楚的英文前缀并记录理由，无需为常规命名反复询问。
- 引擎回调、公共接口、第三方文件、工具约定名称（如 index.html、AGENTS.md、package.json）保留要求的拼写；Git 分支按上文命名。不做无关批量重命名。
- 提交标题：`<AgentName> <Project>: short change summary`，例如 `Codex GravityTank: correct roulette weights`。不用 Conventional Commit 前缀或句末句号；跨项目基础设施用 `Repository`，游戏变化优先写主要项目。

## 音频资产

- 项目离线生成的音乐、BGM、环境音、音效、对白与人声统一使用 Volcengine，禁止使用 Lovart。模型为 `seed-audio-1.0`；音乐参考 `Taierzhuang1938/Script_SeedAudioMusicBake.mjs`，对白和音效使用对应 SeedAudio baker。
- 密钥只从 `VOLCENGINE_API_KEY` 环境变量读取，在运行时经 `X-Api-Key` 头发送到 `https://openspeech.bytedance.com/api/v3/tts/create`。密钥不得进入源码、提示词文件、输出、日志或 Git。
- 连续对白范围整段放进同一 `text_prompt`，返回音频保留为一个 cue，不逐句生成后拼接。
- 子项目明确保留的 WebAudio 现场合成契约继续适用；不要把资产生成规则误读为必须替换现有运行时声音系统。

## 生成图片

供应商顺序保留为 **内置 imagegen → Lovart → 即梦 Seedream**，仅适用于生成或生成式编辑位图。已有 SVG、CSS、Canvas 等代码资产按任务正常编辑。

1. 首选当前环境直接可用的内置 `image_gen__imagegen`。仅在宿主没有直接入口时用 Codex CLI 调同一内置工具；模型与推理配置按当次可用性选择，不把某次容量故障写成永久型号限制。
2. 前一级实际不可用、失败、超时或完成却没有有效图片，才使用下一级；说明原因和所用级别。付费入口的确认必须遵守，不能用回退绕过被拒绝的授权。
3. 核验图片实际生成、能打开并落到目标资产路径；CLI 退出码 0 或工具文本成功不足以证明交付。遵守现有成本约束，不为无关试验批量生图。
4. 需要 CLI 或付费回退时再读 [生成工具操作参考](docs/Data_AssetGeneration.md)。临时鉴权、容量、编码与项目失效问题按当次错误诊断。

## 项目入口

修改某项目时读取其 AGENTS.md；其中的参考文档按涉及的系统查阅，无需加载全仓。现有入口可用 `rg --files -g AGENTS.md` 查找。

| 范围 | 入口 |
| --- | --- |
| 滕县 FPS、界河地形 | [Taierzhuang1938/AGENTS.md](Taierzhuang1938/AGENTS.md) |
| GravityTank | [GravityTank/AGENTS.md](GravityTank/AGENTS.md) |
| TaihangDemo 母页与三个策略子页 | [TaihangDemo/AGENTS.md](TaihangDemo/AGENTS.md)（列出子页入口） |
| 地道战横版 | [TunnelBell1942/AGENTS.md](TunnelBell1942/AGENTS.md) |
| 双层六角地道战 | [TunnelFront1942/AGENTS.md](TunnelFront1942/AGENTS.md) |
| BehindTheLines 公开文档 | [BehindTheLines/AGENTS.md](BehindTheLines/AGENTS.md) |

## 维护方式

规则写清适用范围、要保护的结果和验收依据；操作示例、设计细节与历史事故放在按需参考文档。修改契约时更新对应入口，避免多处复制。此次整理的依据与保留项见 [审查记录](docs/Data_AgentsAudit.md)。
