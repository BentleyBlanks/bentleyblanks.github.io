# TaihangDemo 项目入口

仓库协作与交付规则见 [根 AGENTS.md](../AGENTS.md)。以下母页约束仅适用于 TaihangDemo/index.html；子页面使用自己的脚本、状态和下列入口。

- `TaihangDemo/index.html` 是 BehindTheLines（私有 Godot 仓库）的**玩法白盒测试环境**：单文件、纯 2D 程序化 Canvas、零外部依赖（无 three.js / 无音频 / 无图片资源）。线上地址 `https://bentleyblanks.github.io/TaihangDemo/`。
- 用途是**先在白盒验证核心玩法循环，再移植回 Godot 生产版**。因此优先保证规则可读、参数可调（Debug 面板已暴露全部 `CFG`），不追求美术表现。
- 文件内有「白盒同步区」注释块，集中存放与 Godot 版对齐的玩法常量与函数（暴露度账本、终局评级、上级任务、夜袭/夜行、时代规则化）。改这些规则时保持与 Godot 版 `Script_GameModel.gd` 的函数级对应关系，方便双向移植。
- 不要给这个页面加外部依赖或美术资产；不要与旧页面 `taihang/`（含历史 3D 实验）混用存档键，白盒固定用 `taihangdemo_*`。
- 提交前至少做一次语法校验（抽出 `<script>` 后 `node --check`），并保持移动端可用（viewport / 触摸拖拽 / 双指缩放 / `@media 640px`）。

## 子页面

- [EnemyRear1941/AGENTS.md](EnemyRear1941/AGENTS.md)：敌后火种，六角建设型文明白盒。
- [Dihou1939/AGENTS.md](Dihou1939/AGENTS.md)：敌后 · 1939—1945，类4X 白盒。
- [ResistanceCommand1937/AGENTS.md](ResistanceCommand1937/AGENTS.md)：山河不屈，全国敌后大战略白盒。
