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
- Claude Code 的 `preview_start({ name: "preview" })` 使用 `.claude/launch.json`，同样核对端口与服务根目录。
- 页面变化先本地验收，再推送；纯说明修改按根入口做静态检查。
