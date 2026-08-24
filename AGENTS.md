# Repository Guidelines

## Generated Audio / Volcengine

- All future project-generated music/BGM, ambience, SFX, dialogue, and voice must use Volcengine, never Lovart. A request to generate, replace, revise, or audition any audio must not invoke Lovart, including when the request explicitly says “music”, “BGM”, “song”, “sound effect”, or “audio”.
- Use Volcengine directly with model `seed-audio-1.0`. For music, start from `Taierzhuang1938/Script_SeedAudioMusicBake.mjs`; for dialogue, voice, and SFX, use the applicable checked-in SeedAudio baker (such as `Script_VoiceBake.mjs`) or add an equivalent Volcengine baker.
- Read the credential only from the `VOLCENGINE_API_KEY` environment variable. Never place an API key in source, prompts checked into Git, command output, documentation, commits, or GitHub Actions logs.
- The canonical direct endpoint is `https://openspeech.bytedance.com/api/v3/tts/create`; every baker must send the key through the `X-Api-Key` header at runtime.
- When a storyboard marks a dialogue range as continuous, send the complete range in one `text_prompt` request and keep the returned audio as one cue. Do not synthesize lines separately and splice them together.

## Git Worktree Workflow（强制 · 优先级最高）

**本仓库的主检出 `C:\Users\Bentl\Documents\Program\bentleyblanks.github.io` 由多个 agent 并发共用**（Claude / Cursor / Codex 各自可能正在其中切分支、留未提交改动）。因此：

- **任何 agent 的任何改动，一律在自己的独立 git worktree 里完成**：读代码可以在主检出，但**编辑、提交、推送、切分支一律不许在主检出进行**。
- **每次任务必须新建 worktree 并新建分支**：用 `git worktree add -b <新分支>` 一步同时创建独立 worktree 与专属新分支，本会话所有提交都落在该新分支上。**绝不复用已有分支或已有 worktree 目录**（见「目录与分支命名」）。
- **绝不碰主检出的分支与工作区**：不 `checkout`、不 `switch`、不 `reset`、不 `stash`、不提交别人的脏文件。主检出停在哪个分支就让它停在哪。
- 若发现自己已误在主检出提交，用 `git reset --soft HEAD~1` 摘除该提交并还原暂存区，再改用 worktree 重做，不得将错就错。

### 目录与分支命名

- Worktree 目录与主仓同级，放在 `C:\Users\Bentl\Documents\Program\` 下，格式：
  `bentleyblanks_<AgentName>_<Purpose>_<YYYYMMDD>`
  - `<AgentName>`：Agent 短名，PascalCase（`DeepseekHarness`、`Claude`、`Codex`、`Cursor`、`Grok`）。
  - `<Purpose>`：本次目的的简短英文 PascalCase，仅字母数字，禁止空格与连字符（如 `TaihangDemoNightOps`、`GravityTankRoulette`）。
  - `<YYYYMMDD>`：创建当日日期。
  - 路径已存在时不得复用；换新目的或新会话就换新目录名。
- 分支名与目的对齐：`<agent-lowercase>/<purpose-kebab>-<YYYYMMDD>`，例如 `claude/taihang-demo-night-ops-20260725`。分支仅服务本会话，不与其他会话共用。

### 创建与交付步骤（PowerShell）

```powershell
git fetch origin master
$wt = 'C:\Users\Bentl\Documents\Program\bentleyblanks_Claude_TaihangDemoNightOps_20260725'
if (Test-Path -LiteralPath $wt) { throw "Worktree path already exists: $wt" }
git worktree add -b claude/taihang-demo-night-ops-20260725 $wt origin/master
# 之后所有编辑与提交都在 $wt 内进行
```

交付（站点只从 `master` 部署）：

1. 在 worktree 内提交（提交信息用「Agent 名 + 项目名」前缀，见 Commit Message Format）。
2. `git fetch origin master`；若 `origin/master` 已前进，先 rebase 到最新再继续。
3. `git push origin HEAD:master` 快进推送。**禁止 force push**，禁止覆盖其他会话已推送的提交。
4. 推送后验证线上生效（`curl -sI https://bentleyblanks.github.io/<Page>/`），再向用户报告完成。
5. 确认本任务没有未提交内容后，`git worktree remove <path>` 清理本会话 worktree 与任务分支。

### 主检出被占用时的应急路径

主检出停在别的 agent 的分支上、或你的提交需要落到 `master` 而主检出无法快进时：**从 `origin/master` 新建临时 worktree → cherry-pick 你的提交 → 推送 → 删除临时 worktree**。永远不要为了推送而去改动主检出的分支状态。

## Project-wide Naming Conventions

These rules apply to all project-owned files, scripts, functions, and assets in this repository.

- Use English-only names for scripts, source files, and assets. Player-facing text may remain localized.
- Use PascalCase for file stems, project-owned function names, and descriptive asset-name segments.
- Use lowerCamelCase for variables, parameters, and local bindings.
- Do not use hyphens (`-`) in project-owned names. When a separator is necessary, use an underscore (`_`).
- Asset filenames must expose their category with the form `<Category>_<DescriptivePascalCase>.<ext>`.
- Use these category prefixes unless a more specific category is agreed first: `Model_`, `Texture_`, `Icon_`, `AudioBgm_`, `AudioSfx_`, `Scene_`, `Script_`, `Shader_`, `Material_`, `Animation_`, `Font_`, and `Data_`.
- Keep the extension lowercase unless a tool requires otherwise.
- Before introducing a new asset category, agree on its English prefix and document it here.
- Engine-mandated callbacks, virtual methods, signal handlers, generated metadata, and third-party/vendor files may retain the exact spelling required by their owner. Do not rename those in a way that breaks engine discovery, imports, or licenses.
- Apply these conventions to every new name and to any project-owned name being deliberately renamed. Do not perform unrelated bulk renames without validating every reference and import.

## Commit Message Format

Every commit subject must start with `<AgentName> <Project>: ` — the committing agent's own name, one space, the project name, a colon, and one following space — then the summary. This keeps every commit attributable to the agent that authored it.

For a DeepseekHarness agent changing `Taierzhuang1938`, commit subjects must use:

```text
DeepseekHarness Taierzhuang1938: short change summary
```

Examples:

```text
DeepseekHarness Sophia: core-loop refactor - deterministic outcomes, 3 levers, option gates
DeepseekHarness Sophia: stage-scoped milestone list + center the version tag
Claude GravityTank: fix roulette symbol weights
```

Rules:

- Start with `<AgentName> <Project>:` exactly — agent name, one space, project name, colon, one following space.
  - `<AgentName>`: the committing agent's own name, PascalCase (`DeepseekHarness`, `Claude`, `Codex`, `Cursor`, `Grok`).
  - `<Project>`: the project prefix being changed (`Sophia`, `GravityTank`, `Taierzhuang1938`, `TaihangDemo`, `TunnelBell1942`, …).
- Keep the subject concise and action-oriented.
- Do not use Conventional Commit prefixes such as `feat:` or `fix:`.
- Do not end the subject with a period.
- If a commit touches multiple areas, summarize the player-facing or highest-impact change first.

## GravityTank / GitHub Pages

- Site deploys from **`master` only** (`https://bentleyblanks.github.io/GravityTank/`). Draft PR stacks do not ship.
- GravityTank commit subjects use `<AgentName> GravityTank: short change summary` (same style: agent name + space + `GravityTank:` + space, no Conventional Commit prefixes, no trailing period).
- Bump `GravityTank/index.html` cache-bust (`Script_Game.mjs?v=…`) whenever game scripts/assets change for Pages.

### Small requests: merge to master yourself

- For small player-facing / copy / balance / bugfix asks (blurbs, RULE text, cache-bust, minor tweaks): **do not leave work sitting in an open draft PR**.
- Agent workflow: **worktree**（见 Git Worktree Workflow，强制）→ branch → commit → push → open PR → **merge into `master` yourself** → confirm Pages is live (or at least that the merge landed) before treating the task as done.
- Do not wait for the user to merge “小需求”. Unmerged draft stacks that block Pages have already burned trust—avoid repeating that.
- Larger multi-feature stacks may still use PRs for review, but unique shippable work must still reach `master` (port/merge) rather than rotting on stacked draft branches.

### Agent guide

- Full GravityTank agent map (ship workflow, file owners, HP/lives contract, roulette names, symbol index): **`GravityTank/AGENTS.md`**
- Prefer that guide over dumping `Script_Game.mjs`. Keep it updated when contracts change (lives, HP look, prize names, deploy rules).

## TaihangDemo（玩法白盒）

- `TaihangDemo/index.html` 是 BehindTheLines（私有 Godot 仓库）的**玩法白盒测试环境**：单文件、纯 2D 程序化 Canvas、零外部依赖（无 three.js / 无音频 / 无图片资源）。线上地址 `https://bentleyblanks.github.io/TaihangDemo/`。
- 用途是**先在白盒验证核心玩法循环，再移植回 Godot 生产版**。因此优先保证规则可读、参数可调（Debug 面板已暴露全部 `CFG`），不追求美术表现。
- 文件内有「白盒同步区」注释块，集中存放与 Godot 版对齐的玩法常量与函数（暴露度账本、终局评级、上级任务、夜袭/夜行、时代规则化）。改这些规则时保持与 Godot 版 `Script_GameModel.gd` 的函数级对应关系，方便双向移植。
- 不要给这个页面加外部依赖或美术资产；不要与旧页面 `taihang/`（含历史 3D 实验）混用存档键，白盒固定用 `taihangdemo_*`。
- 提交前至少做一次语法校验（抽出 `<script>` 后 `node --check`），并保持移动端可用（viewport / 触摸拖拽 / 双指缩放 / `@media 640px`）。

### 子页面 `TaihangDemo/EnemyRear1941/`（敌后火种，六角建设型文明白盒）

- 场景是华北敌后综合化县域，不对应单一真实县份；战役固定为 1941 年 9 月至 1942 年 12 月，共 16 回合。
- 核心是建设型文明循环：读取六角地块产出 → 安排村庄建设队列 → 推进科技与民生双树 → 配置政策 → 组织群众和扩展基层网络 → 应对封锁与反“扫荡”。战斗服务于保存群众、争取时间和建设根据地，不以涂色或歼敌数替代发展。
- 使用独立存档键 `enemyrear1941_campaign_v1`。平民受难、流离与不可逆损失只进入代价账本，不计分、不转化为资源或奖励。
- 页面保持零外部运行时依赖；新增脚本、数据与资产继续遵守英文 PascalCase 文件名及项目类别前缀。改动后必须跑 `node TaihangDemo/EnemyRear1941/Script_SmokeTest.mjs`。

### 子页面 `TaihangDemo/Dihou1939/`（敌后 · 1939—1945，类4X 白盒）

- 文明式回合制敌后战场 4X：80 回合（1939.1—1945.8，一回合一个月），一局 40-60 分钟，`localStorage` 每月自动存档（键 `dihou1939_v1`）。前作 NightRaid 因"敌人不可见、无策略纵深"被毙，本作的底线红线是**第 1 回合就看得见敌军部队、够得着攻击目标**（冒烟测试锁死此项）。
- 系统骨架按史实十条任务映射：组织村庄三级=根据地；缴获=军械主来源；警备度满→大扫荡（提前两月预警+红箭头，扫荡兵力从据点抽走且守备数字可见下降=敌进我进窗口）；困难期蚕食修炮楼（可捣毁）；政策三选一（减租减息/地雷战/地道战/精兵简政/武工队…）；1944 末战略反攻夺县城。
- 与母页面完全隔离：自己的 `<script>`、自己的存档键；零外部依赖（音效 WebAudio 现场合成，缺失自动降级）。
- **改动后必须跑 `node TaihangDemo/Dihou1939/Script_SmokeTest.mjs`**（退出码即成败）。套件用桩 DOM 派发合成 pointer/click 断言「点部队→选中 / 点亮格→坐标真变 / 点红圈敌人→攻击真的执行且敌方掉血 / 5px 手抖算点击 / 30px 拖动不误选」，并跑 乱打/会玩/莽撞 三种 bot 各 80 回合，断言分数排序 会玩>莽撞>乱打（防缩头最优解与拼消耗最优解回潮）。
- 抢修规则是策略核心：断轨旁有我军驻守→修不通；没人守→2-4 个月修通。评级封顶闸门在 `EndGame()`（根据地村<8 封 C，<12 封 A），破交计分有收益递减上限（`ScorePts()`）。

### 子页面 `TaihangDemo/ResistanceCommand1937/`（山河不屈，全国敌后大战略白盒）

- 原创“地图研判 → 方针/生产 → 四令规划 → 同步结算 → 代价账本”大战略循环；8 个固定历史阶段覆盖 1937—1945，约 15 分钟一局。1945 年日本投降是不可改写的史实终点，玩家只改变人民与组织付出的代价、敌后力量保存和战略贡献。
- 基层网络必须贯穿情报、粮药、疏散和组织恢复；高评价同时要求人民安全、网络连通、抗战韧性与交通牵制。平民受难、流离、粮食被夺和骨干损失只进入代价账本，不得转化为奖励或主要计分。
- 页面使用独立存档键 `resistancecommand1937_campaign_v1` 与检查点键 `resistancecommand1937_checkpoint_v1`，零外部运行时依赖；地图 Canvas 只绘制态势线，全部地区与命令必须保留可键盘/触控操作的 DOM 按钮。
- 改动后必须跑 `node TaihangDemo/ResistanceCommand1937/Script_SmokeTest.mjs`。测试锁定固定种子、计划纯函数、敌情/疏散/坚壁的真实因果、方针与生产、存档 round-trip、100 局批量模拟、终局锁定，以及“均衡组织路线 > 消极不作为、莽攻会摧毁人民安全”。

## 子页面 `TunnelBell1942/`（地道战 · 钟声，Three.js 横版叙事冒险白盒）

- 题材是电影《地道战》，形式参考《勇敢的心：世界大战》：正交相机的 2.5D 横版，三幕结构，象形气泡叙事，**没有攻击键**。线上地址 `https://bentleyblanks.github.io/TunnelBell1942/`。
- 三幕：第一幕「钟声」高老忠地表潜行敲钟报信；第二幕「翻口」高传宝在地道里带乡亲转移；第三幕「转移」地表与地道来回切换，封卡口、引水反制灌烟，带六位乡亲撤出黑风口。第一幕主角不会活着离开，这是叙事支点，不许改成打赢。
- **模块契约在 `TunnelBell1942/AGENTS.md`，改任何模块前先读它。** 文件所有权、坐标系、关卡/剧情数据格式、Rules/Render/Actor 的 API 都在那份文档里定死。
- 分层纪律：`Data_Levels.mjs` / `Data_Story.mjs` / `Script_Rules.mjs` **不许 import three.js**（纯 Node 可跑，冒烟测试靠这一点）；`Script_Render.mjs` / `Script_Actor.mjs` **不许写 state**（只读只画）。
- 三方依赖只有仓库内的 `TunnelBell1942/vendor/three`。美术全部程序化生成（`CanvasTexture` 现场画），音效 WebAudio 现场合成，不加载任何外部图片/音频。
- 存档键固定 `tunnelbell1942_v1`，与 `TunnelHeart1942/`、`TunnelFront1942/` 完全隔离，不共用任何键。
- 改动后必须跑 `node TunnelBell1942/Script_SmokeTest.mjs`（纯逻辑，含机器人三幕通关与确定性断言）。动到渲染还要跑 `node TunnelBell1942/Script_RenderHealthTest.mjs`（读 `gl.getError()`、`renderer.info` 与画面像素分布，防"看着在跑其实黑屏"）。截图用 `node TunnelBell1942/Script_Screenshot.mjs`。
- 页面脚本或资源变更时抬 `index.html` 里的 cache-bust（`?v=…`）。

## Taierzhuang1938 / 序章高度图

- `L0_Jiehe` 的地面唯一入口是 `Taierzhuang1938/Script_JieheHeight.mjs`：真实 SRTM DEM
  叠加战术土岗、排水沟和界河河槽。渲染、角色、AI、弹道与布设必须共用
  `SampleJieheHeight(x,z)` / 注入的 `groundAt`，禁止另写高度公式或硬编码绝对 `y`。
- 高度图与采样数据用 `node Taierzhuang1938/Script_HeightmapCli.mjs download` 同步生成；
  `Heightmap/_raw/` 不进 Git。来源、坐标、署名和 CLI 用法见
  `Taierzhuang1938/docs/Data_TaierzhuangHeightmap.md`。
- 新增离线布设时用 `Script_HeightmapCli.mjs match --input=... --output=...` 批量贴地；
  改高度图或序章地形后必须跑 `Script_HeightmapCli.mjs verify`、
  `Script_JieheTerrainTest.mjs` 与 `Script_BootTest.mjs`。
- 测试按爆炸半径分档，入口 `node Taierzhuang1938/Script_TestRunner.mjs`
  （默认 = Tier 0 每次必跑；优先用 `--changed=origin/master` 自动追加受影响的
  Tier 1；`--domain=…` 显式领域也会叠加 Tier 0；`--list` 查全表）。
  PlayTest 历史红会显示为 `BASELINE`，只有新增红默认阻断；需要历史红也阻断时加
  `--strict-baseline`。分级依据、自动映射与当前基线见
  `Taierzhuang1938/docs/Data_TestTiers.md`；新增测试必须在 runner 的
  `testDefs` 登记，并通过 `Script_TestRunnerTest.mjs` 的完整性扫描。

## BehindTheLines Documentation

- `BehindTheLines/` is the public documentation namespace for the private BehindTheLines Godot repository. Its canonical URL is `https://bentleyblanks.github.io/BehindTheLines/`.
- Keep `BehindTheLines/index.html` as the documentation home. Add future topic pages at `BehindTheLines/<EnglishPascalCase>/index.html` and link every new topic from the home page.
- Publish human-facing manuals as responsive HTML pages, not copied Markdown files from the private repository.
- Documentation pages must be self-contained or use public-safe assets already tracked in this website repository. Never copy or publish BehindTheLines `assets/audio/` content or any other restricted reference assets.
- Validate internal links and both desktop and mobile layout before publishing documentation updates.
