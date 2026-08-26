# CLAUDE.md

**仓库规矩全在 [`AGENTS.md`](AGENTS.md)，动手前先读。** 这里只放两条最容易踩、且踩了代价最大的。

## 1. 一律在自己的 git worktree 里改

主检出 `C:\Users\Bentl\Documents\Program\bentleyblanks.github.io` 由多个 agent 并发共用。**编辑、提交、推送、切分支一律不许在主检出进行**，每次任务用 `git worktree add -b <新分支>` 新建一棵树。完整规则见 AGENTS.md「Git Worktree Workflow」。

## 2. 验收走本地预览，别拿线上当预览环境

站点 416MB / 2000+ 文件，每次推送都要整站打包上传 Pages，一轮几分钟且会互相抢占。

```bash
node scripts/Script_LocalPreview.mjs --no-open      # 起服；去掉 --no-open 会自动开浏览器
```

- 零 npm 依赖，只要有 node。索引页在 `http://127.0.0.1:8080/__preview/`，列出所有页面，并能把任意 worktree 挂到相邻端口。
- 路径与线上一致、一律 no-store、支持 Range、MIME 覆盖 `.mjs/.wasm/.glb/.pck`。
- 端口被别的 agent 占着时会自动往上让，**页面顶部会写明当前服的是哪棵树** —— 看之前先扫一眼，别对着别人的代码验收。
- Claude Code 里也可以 `preview_start({ name: "preview" })`（配置在 `.claude/launch.json`），但它固定连 8080，多 agent 并行时同样要看页面顶部那行。
- `node scripts/Script_LocalPreview.mjs --help` 有全部参数；`--shortcut` 在桌面放一个双击就起服的入口。

**先本地看满意，再推一次 master。** 不要每改一版推一次去线上看。
