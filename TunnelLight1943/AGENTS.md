# TunnelLight1943 · Agent 指南

**硬规矩与路由表在 [`CLAUDE.md`](./CLAUDE.md)，改任何东西之前先读它；系统级细则按
CLAUDE.md 的路由表读 [`docs/`](./docs/) 对应分册**（Script / Depth / Art / Rig / Camera /
Interaction / Ui / Cli）。事故沿革在 `Data_DesignHistory.md`，剧情梗概在 `Data_StoryC1.md`。
本文件只是入口，不重复维护。

最低限度的三件事：

1. **优先复用命令行工作台定位**；已有源码位置或需跨模块追因时可直接读源码，缺少取证能力时可补充定向诊断：
   ```
   node TunnelLight1943/Script_Cli.mjs           # 列出全部子命令
   node TunnelLight1943/Script_Cli.mjs where <片段>   # 这东西在哪 → 文件:行（规范分册的章节也认）
   node TunnelLight1943/Script_Cli.mjs beat <id>      # 某一拍的步骤/台词/源码位置
   ```
2. **按影响选测**：运行时变化从本任务 worktree 根执行 `node TunnelLight1943/Script_SmokeTest.mjs`，并按 CLAUDE.md「验证」补充对应检查；纯说明整理只查内容、引用与 diff。
3. **`ChapterOneImagegen/` 是冻结快照**——2026-08-14 交付的一次性副本，
   不维护、不引用、搜索命中一律跳过。
