# CLAUDE.md

仓库协作、任务边界、技能适用范围与交付要求以 [AGENTS.md](AGENTS.md) 为统一入口；修改项目时再读其 AGENTS.md。

## 工作区与交付

- 用 Git 查询实际主检出路径和工作区状态，所有编辑、提交和推送在本任务独占 worktree 中进行；只读审查、续做和宿主已分配工作区的处理见根入口。
- 发布前按根流程 fetch、必要时 rebase，再快进交付；推送后只有实际主检出位于 master 且干净时才同步。不要复制历史绝对路径或另建一套发布步骤。

## 本地预览

从本任务 worktree 根执行：

```powershell
node scripts/Script_LocalPreview.mjs --no-open
```

- 默认端口 8080，被占用时按输出使用实际端口；`/__preview/` 顶部核对服务根目录，确保看到本任务的代码。
- 无需 npm 安装；支持 Range、游戏资源 MIME、缓存与 Pages 兼容的隔离头。完整参数见 `node scripts/Script_LocalPreview.mjs --help`。
- 另有两个**只在回环上可用**的调参口（滕县的敌军 AI 编辑器用，见 `Taierzhuang1938/docs/Data_EnemyAi.md` §14.3）：
  `GET /__tuning/status` 报可不可写；`POST /__tuning/save` 就地改 `Taierzhuang1938/Data_Tuning_*.mjs` 里的**那一个数字字面量**
  （注释与格式一个字不动）。线上（Pages）没有这个口，编辑器自动退化成「复制 mjs 片段」。
- 关卡编排工作台（`Taierzhuang1938/docs/Data_MissionOrchestration.md`）的批注草稿保存口同样只在回环上可写：`GET /__notes/status`、`POST /__notes/save` 写 `Taierzhuang1938/Notes/<Level>/notes.json` 与同目录 PNG；线上退化成 localStorage + 下载 JSON。agent 接批注用 `node Taierzhuang1938/Script_MissionNotesCli.mjs handoff`。
- Claude Code 的 `preview_start({ name: "preview" })` 使用 `.claude/launch.json`，同样核对端口与服务根目录。
- 页面变化先本地验收，再推送；纯说明修改按根入口做静态检查。

## Blender

不常驻。要动模型时从本任务 worktree 根起，干完就关：

```powershell
node scripts/Script_BlenderMcp.mjs start "<工程>.blend" --task <TaskName>
node scripts/Script_BlenderMcp.mjs exec --file <脚本.py>
node scripts/Script_BlenderMcp.mjs stop
```

- 不把 blender 之类的本地 stdio MCP 服务器写进 `.mcp.json` 或 user scope —— 本机几十个会话会各拉一条空转进程链。需要 MCP 工具接口时当次 `claude mcp add blender -s local -- blender-mcp`，用完 `claude mcp remove`。
- `.claude/settings.json` 的 Stop / SessionEnd 钩子会兜底 `stop`，但那是保险不是替代：Esc 打断不触发 Stop。报告里附 `status --scan` 的无残留证据。
- 命令细节、pid 文件、钩子与排查见 [生成工具操作参考](docs/Data_AssetGeneration.md)。
