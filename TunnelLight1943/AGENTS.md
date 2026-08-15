# TunnelLight1943 · Agent 指南

**本目录的全部项目规范在 [`CLAUDE.md`](./CLAUDE.md)，改任何东西之前先读它。**
（历史原因规范写在 CLAUDE.md 里；本文件只是入口，两份不重复维护。）

最低限度的三件事（详情全在 CLAUDE.md）：

1. **先用命令行工作台定位，别一上来就读源码**：
   ```
   node TunnelLight1943/Script_Cli.mjs           # 列出全部子命令
   node TunnelLight1943/Script_Cli.mjs where <片段>   # 这东西在哪 → 文件:行
   node TunnelLight1943/Script_Cli.mjs beat <id>      # 某一拍的步骤/台词/源码位置
   ```
2. **改完必跑**：`npm run test:tunnelLight1943`（2 秒，全 8 章自动通关+机制断言）。
   改了渲染路径再加 `npm run test:tunnelLight1943:browser`（分钟级）。
3. **`ChapterOneImagegen/` 是冻结快照**——2026-08-14 交付的一次性副本，
   不维护、不引用、搜索命中一律跳过。

血泪规矩最多的几节（Z 轴深度带 / 地平线 / 镜头景别 / 骨架姿势 / 拟物交互 /
接触戏 / 潜行）都在 CLAUDE.md，动那些系统之前把对应小节过一遍。
