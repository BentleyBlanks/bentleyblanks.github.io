# Notes/ —— 关卡编排工作台的批注草稿

这里放的是**关卡编排工作台**（编辑器里的「关卡编排」面板）存下来的批注草稿：
用户在真实俯视图上选中某个阶段 / 敌人 / 路线 / 区域 / 时间点，写下意见和建议，
工作台把「目标当时的真实数据」一起拍进快照，交给 agent 去改正式关卡。

**批注不是关卡数据。** 它不参与游戏运行，改批注不会改任何玩法；正式的编排仍然只在
`Data_FirstLevelMission*.mjs` 那一批表里。批注只是「用户想改什么」的待办。

## 布局

```
Taierzhuang1938/Notes/
  README.md                  ← 本文件
  FirstLevel/
    notes.json               ← 批注数组（2 空格缩进，末尾一个换行）
    n_20260918_101500_ab12.png   ← 该批注的俯视图标注截图（可选）
```

`notes.json` **进仓库**：换一棵 worktree 的 agent 也要拿得到，所以它不能躺在
浏览器的 localStorage 里。图片同目录，名字必须正好是 `<批注 id>.png`（≤ 1.5 MB）。
批注 id 的格式是 `n_YYYYMMDD_HHMMSS_xxxx`。

schema、校验与交接文本的口径都在 `Taierzhuang1938/Script_MissionNotes.mjs`
（纯模块，Node 与浏览器共用），闸门是 `node Taierzhuang1938/Script_MissionNotesTest.mjs`。

## 怎么存进来

工作台按「保存草稿」时先问本地预览服 `GET /__notes/status`：
- 可写（回环）→ `POST /__notes/save`，由 `scripts/Script_LocalPreview.mjs` 原子写回这里；
- 不可写（线上 Pages、或者没开预览服）→ 退化成 localStorage 草稿 + 「下载 JSON」，
  下载下来的文件手动放到对应关卡目录即可。

## agent 怎么用（命令行，不必开浏览器）

从 worktree 根跑（**不要 `npm run`**，npm 会把 cwd 换到主检出）：

```bash
node Taierzhuang1938/Script_MissionNotesCli.mjs list            # 待处理的批注（--all 连已结案的一起列）
node Taierzhuang1938/Script_MissionNotesCli.mjs handoff         # 完整交接文本（按阶段分组 + 机器可读 JSON 块）
node Taierzhuang1938/Script_MissionNotesCli.mjs drift           # 哪些批注的「原设置」已经和当前关卡对不上了
node Taierzhuang1938/Script_MissionNotesCli.mjs resolve n_20260918_101500_ab12 --summary "已把这组敌人推后到第 13 阶段" --commit a1b2c3d
node Taierzhuang1938/Script_MissionNotesCli.mjs dismiss n_20260918_101500_ab12
```

`--level=FirstLevel` 可换关卡（默认 FirstLevel）。`resolve` / `dismiss` 直接原子改写
`notes.json`，改完请把它一起提交 —— 工作台下次打开就能看到 `resolution.summary`。

一条批注的处理顺序：`handoff` 读意见 → 改正式关卡表 → 自测 → `resolve` 写清楚改了什么
（带 commit sha 最好）。**不要**手改 `notes.json` 里的 `original`：那是写批注当时的快照，
改了就再也对不回来了；关卡变了由 `drift` 报出来，不是靠改快照抹平。
